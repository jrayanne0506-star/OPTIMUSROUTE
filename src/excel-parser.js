/**
 * excel-parser.js — Lê o XLSX exportado da Shopee
 *
 * SAÍDA:
 * {
 *   "Quadra 203": {
 *     "Cj 14": ["05", "10", "13", "13", ...],  ← array ordenado, duplicatas preservadas
 *     "Cj 15": ["20", "20"],
 *   },
 *   "_OUTROS": { ... }
 * }
 *
 * ORDENAÇÃO:
 *   Quadras   → crescente numérico (203, 204, 403...)
 *   Conjuntos → crescente numérico (1, 2, 9, 10, 14...)
 *   Casas     → crescente numérico (01, 02, 03...)
 */

// Captura "Quadra 405", "Q 203", "Q. 12" — e fallback "403 conjunto..."
const QUADRA_RE   = /\b(?:quadra|q)\.?\s+(\d+)|^(\d+)\s+(?:conjunto|conj\.?|cj\.?)/i;
const CONJUNTO_RE = /(?:conjunto|conj\.?|cj\.?)\s+([\d]+[a-z]?(?:-[a-z])?)/i;
const BLOCO_RE    = /(?:bloco|bl\.?)\s+([a-z0-9]+)/i;

export function parseExcel(buffer) {
  const XLSX = window.XLSX;
  if (!XLSX) throw new Error("SheetJS não carregado.");

  const wb   = XLSX.read(buffer, { type: "array" });
  const ws   = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });

  if (rows.length < 2) throw new Error("Planilha vazia.");

  const header  = rows[0].map((c) => String(c).trim().toLowerCase());
  const colAddr = header.findIndex((h) => h.includes("destination") || h.includes("address"));
  if (colAddr === -1) throw new Error('Coluna "Destination Address" não encontrada.');

  const agrupado = new Map();
  const outros   = new Map();

  for (let i = 1; i < rows.length; i++) {
    const endereco = String(rows[i][colAddr] ?? "").trim();
    if (!endereco) continue;

    const res = extrairEndereco(endereco);

    if (res) {
      const { quadra, sublocal, casa } = res;
      if (!agrupado.has(quadra))               agrupado.set(quadra, new Map());
      if (!agrupado.get(quadra).has(sublocal)) agrupado.get(quadra).set(sublocal, []);
      agrupado.get(quadra).get(sublocal).push(casa);
    } else {
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
  const qm = texto.match(QUADRA_RE);
  if (!qm) return null;
  const quadra = qm[1] || qm[2]; // grupo 1 (Q/Quadra) ou grupo 2 (número inicial)

  // Sublocal: Conjunto > Bloco > Sem sublocal
  const cm = texto.match(CONJUNTO_RE);
  const bm = texto.match(BLOCO_RE);
  let sublocal = "Sem sublocal";
  if (cm)      sublocal = `Cj ${cm[1].toUpperCase()}`;
  else if (bm) sublocal = `Bl ${bm[1].toUpperCase()}`;

  const casa = extrairCasa(texto);
  return { quadra, sublocal, casa };
}

function extrairCasa(texto) {
  // 1. Explícito: "casa 13", "cs 02"
  const casaExp = texto.match(/\b(?:casa|cs\.?)\s*(\d+[a-z]?)/i);
  if (casaExp) return casaExp[1];

  // 2. Primeiro número após vírgula — "Conjunto 14, 08"
  const aposVirgula = texto.match(/,\s*(\d+[a-z]?)/i);
  if (aposVirgula && aposVirgula[1] !== "0") return aposVirgula[1];

  // 3. Fallback: último número do texto
  const todos = texto.match(/\d+/g);
  return todos ? todos[todos.length - 1] : "?";
}

// ─── ORDENAÇÃO ────────────────────────────────────────────────────────────────

function numSort(a, b) {
  const na = parseInt(a), nb = parseInt(b);
  if (!isNaN(na) && !isNaN(nb)) return na - nb;
  return a.localeCompare(b);
}

function converterOrdenado(agrupado, outros) {
  const resultado = {};

  for (const quadra of [...agrupado.keys()].sort(numSort)) {
    const sublocs     = agrupado.get(quadra);
    const chaveQuadra = `Quadra ${quadra}`;
    resultado[chaveQuadra] = {};

    for (const sub of [...sublocs.keys()].sort((a, b) => {
      // Bl antes de Cj, depois Sem sublocal; dentro de cada grupo, numérico
      const prio = (s) => s.startsWith("Bl") ? 0 : s.startsWith("Cj") ? 1 : 2;
      const pa = prio(a), pb = prio(b);
      if (pa !== pb) return pa - pb;
      // extrai número para ordenar numericamente (Cj 9 < Cj 10)
      const na = parseInt(a.replace(/\D/g, "")), nb2 = parseInt(b.replace(/\D/g, ""));
      if (!isNaN(na) && !isNaN(nb2)) return na - nb2;
      return a.localeCompare(b);
    })) {
      resultado[chaveQuadra][sub] = [...sublocs.get(sub)].sort(numSort);
    }
  }

  if (outros.size > 0) {
    resultado["_OUTROS"] = {};
    for (const [chave, nums] of outros) {
      resultado["_OUTROS"][chave] = nums;
    }
  }

  return resultado;
}