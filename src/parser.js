/**
 * parser.js — Extração e agrupamento de endereços da rota Shopee
 *
 * LÓGICA DE PARSING
 * =================
 * O arquivo da Shopee tem o formato:
 *   Sequence | Stop | Destination Address
 *
 * Cada linha de endereço pode ter variações de escrita:
 *   "Quadra QNL 12 Bloco B, 321"
 *   "QNL 10 Cj D casa 04, 04"
 *   "Qnl 8 Cj i Cs 2 Cs Lateral..."
 *   "EQNM 34/36 Bloco C, 02"
 *   "QNJ 31, 12, Casa 2 no beco"    ← sem Bloco/Conjunto; casa após segunda vírgula
 *   "Av.Samdu Norte- Lt 02, Ap101"  ← endereço atípico
 *   "Quadra CNL , 1, (loja fgstart)" ← endereço atípico
 *
 * ESTRUTURA DE SAÍDA
 * ==================
 * {
 *   "QNL 12": {
 *     "Bl B": ["316", "106", "214", "321", "322"],
 *     "Cj B": ["4", "11"],
 *     ...
 *   },
 *   "_OUTROS": {
 *     "Av.Samdu Norte- Lt 02": ["Ap101"],
 *     ...
 *   }
 * }
 *
 * MÚLTIPLOS PACOTES
 * =================
 * O Set foi substituído por Array para preservar duplicatas.
 * Se o mesmo endereço aparece 3 vezes → 3 pacotes naquele local.
 * Isso é mostrado como badge "×3" na interface e no PDF.
 *
 * ORDEM DAS SUBLOCALIDADES
 * ========================
 * Dentro de cada quadra, blocos e conjuntos são ordenados alfabeticamente:
 * Bl A, Bl B, Bl C... Cj A, Cj B, Cj C...
 * Primeiro todos os Blocos (A→Z), depois todos os Conjuntos (A→Z).
 * Isso reflete a ordem física das ruas no DF.
 *
 * ORDEM DAS QUADRAS
 * =================
 * A ordem das quadras NÃO é numérica — é a ordem real da rota do entregador.
 * O entregador (ou quem organiza) arrasta as quadras na tela para definir
 * a sequência correta. Essa ordem é salva e usada no PDF.
 * Padrão inicial: ordem de aparecimento no arquivo da Shopee.
 *
 * OBSERVAÇÕES
 * ===========
 * - Textos longos de instrução (ex: "PORTAO CINZA TOTALMENTE FECHADO")
 *   são ignorados pois ficam APÓS a vírgula do número da casa.
 * - Linhas de cabeçalho ("Sequence", "Stop", "Destination") são ignoradas.
 * - Endereços que não batem com nenhum padrão do DF vão para "_OUTROS"
 *   para não sumirem da visualização.
 */

// ─── PADRÕES DE QUADRA ────────────────────────────────────────────────────────

const QUADRA_PATTERNS = [
  /(?:quadra\s+)?(?<tipo>e?qn[lmj]|cnl)\s*(?<num>\d+(?:\/\d+)?)/i,
];

// ─── PADRÕES DE BLOCO / CONJUNTO ─────────────────────────────────────────────

const BLOCO_REGEX    = /(?:bloco|bl\.?)\s*([a-z])/i;
// "cs" adicionado como alias de "conjunto" — cobre "Cj i Cs 2", "Cs Lateral", etc.
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

/**
 * Recebe o texto bruto extraído do PDF/TXT e retorna o objeto agrupado.
 * A ordem das quadras reflete a ordem de APARECIMENTO no arquivo Shopee.
 * Dentro de cada quadra, sublocalidades são ordenadas A→Z (Bl antes de Cj).
 *
 * @param {string} rawText - Texto completo do arquivo
 * @returns {Object} agrupado - { "QNL 12": { "Bl B": ["316","106",...] }, ... }
 */
export function parseRouteText(rawText) {
  const lines = rawText.split(/\r?\n/);

  // Usamos Map para preservar a ordem de inserção (= ordem de aparecimento)
  const agrupado = new Map();
  const erros = [];

  for (const linha of lines) {
    const trimmed = linha.trim();

    if (IGNORE_PATTERNS.some((p) => p.test(trimmed))) continue;

    const semPrefixo = trimmed
      .replace(/^[\d\-]+\s+[\d\-]+\s+/, "")
      .trim();

    const resultado = extrairEndereco(semPrefixo);

    if (resultado) {
      const { quadra, sublocal, numero } = resultado;

      if (!agrupado.has(quadra)) agrupado.set(quadra, new Map());
      const sublocs = agrupado.get(quadra);

      if (!sublocs.has(sublocal)) sublocs.set(sublocal, []);
      sublocs.get(sublocal).push(numero);

    } else {
      const atipico = extrairAtipico(semPrefixo);
      if (atipico) {
        if (!agrupado.has("_OUTROS")) agrupado.set("_OUTROS", new Map());
        const sublocs = agrupado.get("_OUTROS");
        if (!sublocs.has(atipico.chave)) sublocs.set(atipico.chave, []);
        sublocs.get(atipico.chave).push(atipico.numero);
      } else {
        erros.push(semPrefixo);
      }
    }
  }

  if (erros.length > 0) {
    console.warn("[parser] Linhas não reconhecidas:", erros);
  }

  // Ordena sublocalidades A→Z dentro de cada quadra
  // (mas mantém a ordem de quadras = ordem de aparecimento no arquivo)
  return converterParaObjeto(agrupado);
}

// ─── EXTRAÇÃO DE ENDEREÇO PADRÃO DF ──────────────────────────────────────────

function extrairEndereco(texto) {
  let quadra = null;
  for (const pat of QUADRA_PATTERNS) {
    const m = texto.match(pat);
    if (m) {
      const tipo = (m.groups?.tipo || m[1]).toUpperCase();
      const num  = m.groups?.num  || m[2];
      quadra = `${tipo} ${num}`;
      break;
    }
  }
  if (!quadra) return null;

  let sublocal = "Sem sublocal";
  const blocoM  = texto.match(BLOCO_REGEX);
  const conjM   = texto.match(CONJUNTO_REGEX);

  if (blocoM) {
    sublocal = `Bl ${blocoM[1].toUpperCase()}`;
  } else if (conjM) {
    sublocal = `Cj ${conjM[1].toUpperCase()}`;
  }

  const numero = extrairNumero(texto);

  return { quadra, sublocal, numero };
}

// ─── EXTRAÇÃO DO NÚMERO DA CASA ──────────────────────────────────────────────

/**
 * Extrai o número da casa/apartamento do endereço.
 * Mesma lógica do excel-parser para consistência.
 *
 * Prioridade:
 *   1. Explícito: "casa 13", "cs 02", "ap 101"
 *   2. Primeiro número após vírgula — "QNJ 31, 12" ou "QNJ 31, 12, Casa 2"
 *      Quando há segunda vírgula com casa explícita, a regra 1 já captura.
 *   3. Fallback: último número do texto
 */
function extrairNumero(texto) {
  // 1. Explícito: "casa 13", "cs 02", "ap 101", "apto 301"
  const casaExp = texto.match(/\b(?:casa|ap\.?|apto\.?)\s*(\d+[a-z]?)/i);
  if (casaExp) return casaExp[1].toUpperCase();

  // 2. Primeiro número após vírgula
  const aposVirgula = texto.match(/,\s*(\d+[a-z]?)/i);
  if (aposVirgula) return aposVirgula[1].toUpperCase();

  // 3. Fallback: último número do texto
  const todos = texto.match(/\d+/g);
  return todos ? todos[todos.length - 1] : "?";
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

/**
 * Converte o Map interno para um objeto JS simples.
 * Dentro de cada quadra, ordena:
 *   1. Blocos em ordem alfabética (Bl A, Bl B, Bl C...)
 *   2. Conjuntos em ordem alfabética (Cj A, Cj B, Cj C...)
 *   3. "Sem sublocal" por último
 *
 * A ordem das quadras é mantida como estava no Map (= aparecimento no arquivo).
 * O usuário pode depois reordenar as quadras via drag-and-drop na UI.
 */
function converterParaObjeto(agrupado) {
  const resultado = {};

  for (const [quadra, sublocsMap] of agrupado) {
    const chaves = [...sublocsMap.keys()];

    chaves.sort((a, b) => {
      const prioridade = (s) => {
        if (s.startsWith("Bl")) return 0;
        if (s.startsWith("Cj")) return 1;
        return 2; // "Sem sublocal" por último
      };

      const pa = prioridade(a);
      const pb = prioridade(b);

      if (pa !== pb) return pa - pb;

      // Mesma categoria → ordena pela letra (A < B < C...)
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

/**
 * Recebe o objeto agrupado e uma nova ordem de quadras (array de strings),
 * e retorna um novo objeto com as quadras nessa ordem.
 * Usado pelo app.js quando o usuário arrasta as quadras na tela.
 *
 * @param {Object} agrupado
 * @param {string[]} novaOrdem - ex: ["QNL 4", "QNJ 31", "QNL 12", ...]
 * @returns {Object}
 */
export function reordenarQuadras(agrupado, novaOrdem) {
  const resultado = {};
  for (const quadra of novaOrdem) {
    if (agrupado[quadra]) resultado[quadra] = agrupado[quadra];
  }
  // Adiciona quadras que não estavam na lista (segurança)
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