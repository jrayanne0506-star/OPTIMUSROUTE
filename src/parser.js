/**
 * parser.js — Extração e agrupamento de endereços da rota Shopee
 */

// ─── PADRÕES DE QUADRA ────────────────────────────────────────────────────────

const QUADRA_PATTERNS = [
  /(?:quadra\s+)?(?<tipo>e?qn[lmj]|cnl)\s*(?<num>\d+(?:\/\d+)?)/i,
];

// ─── PADRÕES DE BLOCO / CONJUNTO ─────────────────────────────────────────────

const BLOCO_REGEX    = /(?:bloco|bl\.?)\s*([a-z])/i;
// "cs" como alias de conjunto — cobre "Cj i Cs 2", "Cs Lateral", etc.
const CONJUNTO_REGEX = /(?:conjunto|conj\.?|cj\.?|cs\.?)\s*([a-z])/i;

// ─── CABEÇALHOS E LINHAS A IGNORAR ───────────────────────────────────────────

const IGNORE_PATTERNS = [
  /^sequence/i,
  /^stop/i,
  /^destination/i,
  /^-\s*-\s*-/,
  /^\s*$/,
  /^mente\s+fechad/i,
];

// ─── PARSER PRINCIPAL ─────────────────────────────────────────────────────────

export function parseRouteText(rawText) {
  const lines = rawText.split(/\r?\n/);
  const agrupado = new Map();
  const erros = [];

  for (const linha of lines) {
    const trimmed = linha.trim();
    if (IGNORE_PATTERNS.some((p) => p.test(trimmed))) continue;

    const semPrefixo = trimmed.replace(/^[\d\-]+\s+[\d\-]+\s+/, "").trim();
    const resultado = extrairEndereco(semPrefixo);

    if (resultado) {
      const { quadra, sublocal, numero, tipo, enderecoCompleto } = resultado;
      if (!agrupado.has(quadra)) agrupado.set(quadra, new Map());
      const sublocs = agrupado.get(quadra);
      if (!sublocs.has(sublocal)) sublocs.set(sublocal, []);
      sublocs.get(sublocal).push({ numero, tipo, enderecoCompleto: enderecoCompleto || null });
    } else {
      const atipico = extrairAtipico(semPrefixo);
      if (atipico) {
        if (!agrupado.has("_OUTROS")) agrupado.set("_OUTROS", new Map());
        const sublocs = agrupado.get("_OUTROS");
        if (!sublocs.has(atipico.chave)) sublocs.set(atipico.chave, []);
        sublocs.get(atipico.chave).push({ numero: atipico.numero, tipo: "casa", enderecoCompleto: null });
      } else {
        erros.push(semPrefixo);
      }
    }
  }

  if (erros.length > 0) console.warn("[parser] Linhas não reconhecidas:", erros);
  return converterParaObjeto(agrupado);
}

// ─── EXTRAÇÃO DE ENDEREÇO PADRÃO DF ──────────────────────────────────────────

function extrairEndereco(texto) {
  let quadra = null;
  let tipoQuadra = null;

  for (const pat of QUADRA_PATTERNS) {
    const m = texto.match(pat);
    if (m) {
      tipoQuadra = (m.groups?.tipo || m[1]).toUpperCase();
      const num  = m.groups?.num  || m[2];
      quadra = `${tipoQuadra} ${num}`;
      break;
    }
  }
  if (!quadra) return null;

  const blocoM = texto.match(BLOCO_REGEX);
  const conjM  = texto.match(CONJUNTO_REGEX);

  let sublocal = "Sem sublocal";

  if (blocoM) {
    sublocal = `Bl ${blocoM[1].toUpperCase()}`;
  } else if (conjM) {
    sublocal = `Cj ${conjM[1].toUpperCase()}`;
  } else if (tipoQuadra === "QNJ") {
    // QNJ usa números como conjunto — extrair da vírgula
    return extrairEnderecoQNJ(texto, quadra);
  }

  const { numero, tipo } = extrairNumero(texto);
  const enderecoCompleto = numero === "S/N" ? texto : null;
  return { quadra, sublocal, numero, tipo, enderecoCompleto };
}

// ─── LÓGICA ESPECIAL PARA QNJ ────────────────────────────────────────────────

function extrairEnderecoQNJ(texto, quadra) {
  const partesVirgula = texto.split(",").map(s => s.trim());

  const segundo = partesVirgula[1];
  const terceiro = partesVirgula[2];

  if (!segundo) {
    return { quadra, sublocal: "Sem sublocal", numero: "?", tipo: "casa" };
  }

  const casaExplicita = terceiro
    ? terceiro.match(/\b(?:casa|ap\.?|apto\.?|apartamento)\s*(\d+[a-z]?)/i)
    : null;

  if (casaExplicita) {
    const conjunto = segundo.match(/\d+[a-z]?/i)?.[0] || segundo;
    const casa = casaExplicita[1];
    const tipoRaw = casaExplicita[0];
    const tipo = /\b(?:ap\.?|apto\.?|apartamento)\b/i.test(tipoRaw) ? "ap" : "casa";
    return { quadra, sublocal: `Cj ${conjunto}`, numero: casa.toUpperCase(), tipo };
  }

  const numSolto = segundo.match(/\d+[a-z]?/i)?.[0] || segundo;
  return { quadra, sublocal: "_ambiguo", numero: numSolto.toUpperCase(), tipo: "casa" };
}

// ─── EXTRAÇÃO DO NÚMERO DA CASA ──────────────────────────────────────────────

function extrairNumero(texto) {
  // 0. S/N explícito
  if (/\bS\/N\b/i.test(texto)) return { numero: "S/N", tipo: "casa" };

  // 1. Explícito: "casa 13", "ap 101", "apto 301", "apartamento 2"
  const casaExp = texto.match(/\b(apartamento|ap\.?|apto\.?|casa)\s*(\d+[a-z]?)/i);
  if (casaExp) {
    const tipoRaw = casaExp[1].toLowerCase();
    const tipo = /^(ap|apto|apartamento)/.test(tipoRaw) ? "ap" : "casa";
    return { numero: casaExp[2].toUpperCase(), tipo };
  }

  // 2. Primeiro número após vírgula
  const aposVirgula = texto.match(/,\s*(\d+[a-z]?)/i);
  if (aposVirgula) return { numero: aposVirgula[1].toUpperCase(), tipo: "casa" };

  // 3. Fallback: último número do texto
  const todos = texto.match(/\d+/g);
  return { numero: todos ? todos[todos.length - 1] : "?", tipo: "casa" };
}

// ─── EXTRAÇÃO DE ENDEREÇO ATÍPICO ────────────────────────────────────────────

function extrairAtipico(texto) {
  if (texto.length < 5) return null;
  const partes = texto.split(",");
  if (partes.length < 1) return null;
  const chave  = partes[0].trim();
  const numero = partes[1]?.trim() || "?";
  if (chave.length < 4) return null;
  return { chave, numero };
}

// ─── CONVERSÃO MAP → OBJETO COM SUBLOCS ORDENADAS ────────────────────────────

function converterParaObjeto(agrupado) {
  const resultado = {};

  const quadrasOrdenadas = [...agrupado.keys()].sort((a, b) => {
    if (a === "_OUTROS") return 1;
    if (b === "_OUTROS") return -1;

    const parse = (s) => {
      const m = s.match(/^([A-Z\/]+)\s+(\d+(?:\/\d+)?)/i);
      return m ? { tipo: m[1].toUpperCase(), num: parseFloat(m[2]) } : null;
    };

    const pa = parse(a), pb = parse(b);
    if (!pa || !pb) return a.localeCompare(b);

    if (pa.tipo !== pb.tipo) return pa.tipo.localeCompare(pb.tipo);
    return pa.num - pb.num;
  });

  for (const quadra of quadrasOrdenadas) {
    const sublocsMap = agrupado.get(quadra);
    const chaves = [...sublocsMap.keys()];

    chaves.sort((a, b) => {
      const prioridade = (s) => {
        if (s.startsWith("Bl")) return 0;
        if (s.startsWith("Cj")) return 1;
        if (s === "_ambiguo")   return 2;
        return 3;
      };
      const pa = prioridade(a), pb = prioridade(b);
      if (pa !== pb) return pa - pb;
      const letraA = a.slice(-1).toUpperCase();
      const letraB = b.slice(-1).toUpperCase();
      return letraA.localeCompare(letraB);
    });

    resultado[quadra] = {};
    for (const chave of chaves) {
      resultado[quadra][chave] = sublocsMap.get(chave);
    }
  }

  return resultado;
}

// ─── REORDENAÇÃO DE QUADRAS (drag-and-drop) ───────────────────────────────────

export function reordenarQuadras(agrupado, novaOrdem) {
  const resultado = {};
  for (const quadra of novaOrdem) {
    if (agrupado[quadra]) resultado[quadra] = agrupado[quadra];
  }
  for (const quadra of Object.keys(agrupado)) {
    if (!resultado[quadra]) resultado[quadra] = agrupado[quadra];
  }
  return resultado;
}

// ─── CONTAGEM DE PACOTES ──────────────────────────────────────────────────────

export function contarPacotes(agrupado) {
  let total = 0;
  for (const quadra of Object.values(agrupado)) {
    for (const nums of Object.values(quadra)) {
      total += nums.length;
    }
  }
  return total;
}

export function resumoPorQuadra(agrupado) {
  const resumo = {};
  for (const [quadra, sublocs] of Object.entries(agrupado)) {
    let total = 0;
    for (const nums of Object.values(sublocs)) total += nums.length;
    resumo[quadra] = total;
  }
  return resumo;
}