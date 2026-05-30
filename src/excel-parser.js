/**
 * excel-parser.js — Lê o XLSX exportado da Shopee
 *
 * SAÍDA:
 * {
 *   "Quadra 203": {
 *     "Cj 14": ["05", "10", "13", "13", "13"],   ← duplicatas = múltiplos pacotes
 *     "Cj 15": ["20"],
 *     "Cj 16": ["05", "05", "05"],
 *   },
 *   "Quadra 204": { ... },
 *   "_OUTROS": { ... }
 * }
 *
 * ORDENAÇÃO:
 *   - Quadras: crescente numérico (203, 204, 205, 403...)
 *   - Conjuntos dentro da quadra: crescente numérico (1, 2, 3... 9, 10, 14...)
 *   - Casas dentro do conjunto: crescente numérico (01, 02, 03...)
 */

// ─── REGEX ────────────────────────────────────────────────────────────────────

// Captura número da quadra: "Quadra 405", "Q 203", "Q Quadra 203", "403 conjunto..."
const QUADRA_RE  = /(?:(?:q\.?\s*)?quadra\s+|^)(\d+)/i;

// Captura número do conjunto: "Conjunto 14", "Cj 30", "Conj 9", "conjunto 4-A"
const CONJUNTO_RE = /(?:conjunto|conj\.?|cj\.?)\s+([\d]+[a-z]?(?:-[a-z])?)/i;

// Captura número da casa — estratégia em camadas (ver extrairCasa)

// ─── FUNÇÃO PRINCIPAL ─────────────────────────────────────────────────────────

export function parseExcel(buffer) {
  const XLSX = window.XLSX;
  if (!XLSX) throw new Error("SheetJS não carregado.");

  const wb   = XLSX.read(buffer, { type: "array" });
  const ws   = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });

  if (rows.length < 2) throw new Error("Planilha vazia.");

  const header  = rows[0].map((c) => String(c).trim().toLowerCase());
  const colAddr = header.findIndex((h) => h.includes("destination") || h.includes("address"));

  if (colAddr === -1)
    throw new Error('Coluna "Destination Address" não encontrada.');

  // Acumula tudo em Map<quadraNum, Map<conjNum, casa[]>>
  const agrupado = new Map(); // "203" → Map<"14" → ["05","10",...]>
  const outros   = new Map();

  for (let i = 1; i < rows.length; i++) {
    const endereco = String(rows[i][colAddr] ?? "").trim();
    if (!endereco) continue;

    const res = extrairEndereco(endereco);

    if (res) {
      const { quadra, conjunto, casa } = res;

      if (!agrupado.has(quadra)) agrupado.set(quadra, new Map());
      const conjs = agrupado.get(quadra);

      if (!conjs.has(conjunto)) conjs.set(conjunto, []);
      conjs.get(conjunto).push(casa);
    } else {
      // _OUTROS
      const partes = endereco.split(",");
      const chave  = partes[0].trim();
      const num    = partes[1]?.trim() || "?";
      if (chave.length >= 4) {
        if (!outros.has(chave)) outros.set(chave, []);
        outros.get(chave).push(num);
      }
    }
  }

  return converterOrdenado(agrupado, outros);
}

// ─── EXTRAÇÃO ─────────────────────────────────────────────────────────────────

function extrairEndereco(texto) {
  // Quadra
  const qm = texto.match(QUADRA_RE);
  if (!qm) return null;
  const quadra = qm[1]; // ex: "203"

  // Conjunto
  const cm = texto.match(CONJUNTO_RE);
  const conjunto = cm ? cm[1].toUpperCase() : "SEM CONJUNTO";

  // Casa
  const casa = extrairCasa(texto);

  return { quadra, conjunto, casa };
}

function extrairCasa(texto) {
  // 1. "casa 13", "cs 02", "cs14" explícito
  const casaExp = texto.match(/\b(?:casa|cs\.?)\s*(\d+[a-z]?)/i);
  if (casaExp) return casaExp[1].replace(/^0+(\d)/, "$1"); // remove zero à esquerda opcional

  // 2. Primeiro número após vírgula (formato mais comum: "Conjunto 14, 08")
  const aposVirgula = texto.match(/,\s*(\d+[a-z]?)/i);
  if (aposVirgula) {
    const n = aposVirgula[1];
    // ignora "0" isolado (sem número real)
    if (n !== "0") return n;
  }

  // 3. Último número do texto como fallback
  const todos = texto.match(/\d+/g);
  if (todos && todos.length > 0) return todos[todos.length - 1];

  return "?";
}

// ─── CONVERSÃO + ORDENAÇÃO ────────────────────────────────────────────────────

function converterOrdenado(agrupado, outros) {
  const resultado = {};

  // Ordena quadras numericamente
  const quadrasOrdenadas = [...agrupado.keys()].sort((a, b) => parseInt(a) - parseInt(b));

  for (const quadra of quadrasOrdenadas) {
    const conjs = agrupado.get(quadra);
    const chaveQuadra = `Quadra ${quadra}`;
    resultado[chaveQuadra] = {};

    // Ordena conjuntos: numérico primeiro, depois alfanumérico
    const conjsOrdenados = [...conjs.keys()].sort((a, b) => {
      const na = parseInt(a), nb = parseInt(b);
      if (!isNaN(na) && !isNaN(nb)) return na - nb;
      return a.localeCompare(b);
    });

    for (const conj of conjsOrdenados) {
      const casas = conjs.get(conj);
      const chaveConj = conj === "SEM CONJUNTO" ? "Sem conjunto" : `Cj ${conj}`;

      // Ordena casas numericamente
      casas.sort((a, b) => {
        const na = parseInt(a), nb = parseInt(b);
        if (!isNaN(na) && !isNaN(nb)) return na - nb;
        return a.localeCompare(b);
      });

      resultado[chaveQuadra][chaveConj] = casas;
    }
  }

  // _OUTROS no final
  if (outros.size > 0) {
    resultado["_OUTROS"] = {};
    for (const [chave, nums] of outros) {
      resultado["_OUTROS"][chave] = nums;
    }
  }

  return resultado;
}