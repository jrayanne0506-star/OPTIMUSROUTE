/**
 * excel-parser.js — Lê o XLSX exportado da Shopee e retorna
 * o mesmo formato de objeto que parseRouteText() do parser.js.
 *
 * Formato do XLSX:
 *   Colunas: AT ID | Sequence | Stop | SPX TN | Destination Address | Bairro | City | ...
 *   Linha 0: cabeçalho
 *   Linhas 1+: uma entrega por linha
 *
 * Cada endereço em "Destination Address" segue padrões como:
 *   "Quadra 405 Conjunto 28, 6"
 *   "Q 405 Cj 30 casa, 04"
 *   "Quadra 203 conjunto 14 casa 13 loja, 02, ..."
 *   "Condomínio Residencial Salomão Elias Quadra 1, 0, Casa 27"
 *   "Avenida Buritís Quadra 403 Lote, 03, ..."
 *
 * Retorna o mesmo objeto que parser.js:
 * {
 *   "Quadra 405": { "Cj 28": ["6", "7"], ... },
 *   "_OUTROS":    { "Avenida Buritís Quadra 403": ["03"] },
 * }
 */

// ─── PADRÕES ──────────────────────────────────────────────────────────────────

// Captura "Quadra 405", "Q 12", "Q 203", etc.
const QUADRA_RE  = /\b(?:quadra|q\.?)\s+(\d+(?:\/\d+)?)/i;

// Captura "Conjunto 28", "Cj 30", "Conj 9"
const CONJUNTO_RE = /\b(?:conjunto|conj\.?|cj\.?)\s+(\d+[a-z]?)/i;

// Captura "Bloco B", "Bl C"
const BLOCO_RE    = /\b(?:bloco|bl\.?)\s+([a-z0-9]+)/i;

// Número principal: primeiro valor após vírgula
const NUMERO_RE   = /,\s*(\d+[a-z]?)/i;

// ─── FUNÇÃO PRINCIPAL ─────────────────────────────────────────────────────────

/**
 * Recebe o ArrayBuffer do arquivo .xlsx e retorna o objeto agrupado.
 * Depende de SheetJS (window.XLSX) já carregado na página.
 *
 * @param {ArrayBuffer} buffer
 * @returns {Object} agrupado
 */
export function parseExcel(buffer) {
  const XLSX = window.XLSX;
  if (!XLSX) throw new Error("SheetJS não carregado. Verifique o CDN no index.html.");

  const wb    = XLSX.read(buffer, { type: "array" });
  const ws    = wb.Sheets[wb.SheetNames[0]];
  const rows  = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });

  if (rows.length < 2) throw new Error("Planilha vazia ou sem dados.");

  // Descobre o índice da coluna "Destination Address"
  const header = rows[0].map((c) => String(c).trim().toLowerCase());
  const colAddr = header.findIndex((h) =>
    h.includes("destination") || h.includes("address")
  );

  if (colAddr === -1) {
    throw new Error(
      'Coluna "Destination Address" não encontrada. Verifique se é o arquivo correto da Shopee.'
    );
  }

  const agrupado = new Map();

  for (let i = 1; i < rows.length; i++) {
    const endereco = String(rows[i][colAddr] ?? "").trim();
    if (!endereco) continue;

    const resultado = extrairEndereco(endereco);

    if (resultado) {
      const { quadra, sublocal, numero } = resultado;
      if (!agrupado.has(quadra)) agrupado.set(quadra, new Map());
      const sublocs = agrupado.get(quadra);
      if (!sublocs.has(sublocal)) sublocs.set(sublocal, []);
      sublocs.get(sublocal).push(numero);
    } else {
      // Endereço atípico → _OUTROS
      const atipico = extrairAtipico(endereco);
      if (atipico) {
        if (!agrupado.has("_OUTROS")) agrupado.set("_OUTROS", new Map());
        const sublocs = agrupado.get("_OUTROS");
        if (!sublocs.has(atipico.chave)) sublocs.set(atipico.chave, []);
        sublocs.get(atipico.chave).push(atipico.numero);
      }
    }
  }

  return converterParaObjeto(agrupado);
}

// ─── EXTRAÇÃO DE ENDEREÇO ─────────────────────────────────────────────────────

function extrairEndereco(texto) {
  const quadraM = texto.match(QUADRA_RE);
  if (!quadraM) return null;

  const quadra = `Quadra ${quadraM[1]}`;

  // Sublocal: prefere Conjunto, depois Bloco
  let sublocal = "Sem sublocal";
  const conjM  = texto.match(CONJUNTO_RE);
  const blocoM = texto.match(BLOCO_RE);

  if (conjM) {
    sublocal = `Cj ${conjM[1].toUpperCase()}`;
  } else if (blocoM) {
    sublocal = `Bl ${blocoM[1].toUpperCase()}`;
  }

  // Número: primeiro valor após vírgula
  let numero = "?";
  const numM = texto.match(NUMERO_RE);
  if (numM) {
    numero = numM[1].toUpperCase();
  } else {
    // Fallback: último número no texto
    const todos = texto.match(/\d+/g);
    if (todos) numero = todos[todos.length - 1];
  }

  return { quadra, sublocal, numero };
}

// ─── ENDEREÇO ATÍPICO ─────────────────────────────────────────────────────────

function extrairAtipico(texto) {
  if (texto.length < 5) return null;
  const partes = texto.split(",");
  const chave  = partes[0].trim();
  const numero = partes[1]?.trim() || "?";
  if (chave.length < 4) return null;
  return { chave, numero };
}

// ─── CONVERSÃO MAP → OBJETO COM SUBLOCS ORDENADAS ────────────────────────────

function converterParaObjeto(agrupado) {
  const resultado = {};

  for (const [quadra, sublocsMap] of agrupado) {
    const chaves = [...sublocsMap.keys()];

    chaves.sort((a, b) => {
      const prio = (s) => {
        if (s.startsWith("Bl")) return 0;
        if (s.startsWith("Cj")) return 1;
        return 2;
      };
      const pa = prio(a), pb = prio(b);
      if (pa !== pb) return pa - pb;
      return a.localeCompare(b);
    });

    resultado[quadra] = {};
    for (const chave of chaves) {
      resultado[quadra][chave] = sublocsMap.get(chave);
    }
  }

  return resultado;
}