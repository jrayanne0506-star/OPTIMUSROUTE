/**
 * exporter.js — Geração de PDF e TXT a partir do objeto agrupado
 *
 * ESTRUTURA DO PDF GERADO
 * =======================
 * - Cabeçalho com título + data + total de pacotes
 * - Para cada quadra:
 *     [ QNL 12 — 18 pacotes ]
 *     Bl B  →  106  214  316  321  322
 *     Cj B  →  4  11
 *     ...
 * - Endereços com múltiplos pacotes recebem badge "×N"
 * - Seção "_OUTROS" ao final com endereços atípicos
 * - Quebra de página automática
 *
 * MÚLTIPLOS PACOTES
 * =================
 * Se "Bl B" tem ["316","316","321"] → 316 aparece como "316 ×2" e 321 normal.
 * Isso garante que o entregador saiba que precisa levar 2 volumes para o 316.
 */

// ─── EXPORTAÇÃO TXT ───────────────────────────────────────────────────────────

/**
 * Converte o objeto agrupado em texto limpo para clipboard ou arquivo .txt
 * @param {Object} agrupado
 * @param {string} nomeArquivo - usado no cabeçalho
 * @returns {string}
 */
export function exportarTXT(agrupado, nomeArquivo = "") {
  const linhas = [];
  const agora = new Date().toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  linhas.push("═══════════════════════════════════════");
  linhas.push("       ROTA ORGANIZADA POR QUADRA      ");
  if (nomeArquivo) linhas.push(`  ${nomeArquivo}`);
  linhas.push(`  Gerado em: ${agora}`);
  linhas.push("═══════════════════════════════════════");
  linhas.push("");

  for (const [quadra, sublocs] of Object.entries(agrupado)) {
    const totalQ = Object.values(sublocs).reduce((s, a) => s + a.length, 0);
    const titulo =
      quadra === "_OUTROS"
        ? `▸ OUTROS ENDEREÇOS (${totalQ} pacote${totalQ > 1 ? "s" : ""})`
        : `▸ ${quadra}  —  ${totalQ} pacote${totalQ > 1 ? "s" : ""}`;

    linhas.push(titulo);
    linhas.push("─".repeat(titulo.length));

    for (const [sublocal, numeros] of Object.entries(sublocs)) {
      // Conta duplicatas
      const contagem = contarDuplicatas(numeros);
      const chips = formatarChipsTXT(contagem);
      linhas.push(`  ${sublocal.padEnd(12)}→  ${chips}`);
    }

    linhas.push("");
  }

  return linhas.join("\n");
}

// ─── EXPORTAÇÃO PDF ───────────────────────────────────────────────────────────

/**
 * Gera e faz download do PDF usando jsPDF (carregado via CDN no HTML).
 * @param {Object} agrupado
 * @param {string} nomeArquivo
 */
export function exportarPDF(agrupado, nomeArquivo = "rota") {
  // jsPDF deve estar disponível globalmente via CDN
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: "mm", format: "a4" });

  // ── Configurações de layout ──
  const MARGEM = 12;
  const LARGURA = 210 - MARGEM * 2; // 186mm
  const ALTURA_PAGINA = 297;
  const RODAPE_H = 10;
  const LINHA_H = 7; // altura de cada linha de texto
  const CHIP_H = 6;
  const CHIP_W_BASE = 10; // largura mínima de chip
  const CHIP_PAD = 2.5;
  const CHIP_RADIUS = 1.5;

  // ── Cores ──
  const COR_BG = [17, 24, 39];          // cinza escuro para fundo do header
  const COR_QUADRA_BG = [30, 58, 138];  // azul para faixa de quadra
  const COR_BLOCO_BG = [37, 99, 235];   // azul médio para sublocal
  const COR_CHIP_BG = [239, 246, 255];  // azul muito claro para chip número
  const COR_MULTI_BG = [254, 243, 199]; // amarelo para chip com múltiplos
  const COR_MULTI_BORDA = [217, 119, 6];// borda do chip múltiplo
  const COR_OUTROS_BG = [71, 85, 105];  // cinza para seção outros
  const COR_TEXTO_CLARO = [255, 255, 255];
  const COR_TEXTO_ESCURO = [15, 23, 42];
  const COR_TEXTO_CHIP = [30, 58, 138];
  const COR_SEPARADOR = [203, 213, 225];
  const COR_SUBTEXTO = [100, 116, 139];

  let y = MARGEM;
  let pagina = 1;

  // ── Helpers ──

  const novaPagina = () => {
    // Rodapé
    doc.setFontSize(8);
    doc.setTextColor(...COR_SUBTEXTO);
    doc.text(
      `Página ${pagina}  •  Gerado por Rotas DF`,
      105,
      ALTURA_PAGINA - 5,
      { align: "center" }
    );
    doc.addPage();
    pagina++;
    y = MARGEM;
  };

  const garantirEspaco = (necessario) => {
    if (y + necessario > ALTURA_PAGINA - RODAPE_H - MARGEM) {
      novaPagina();
    }
  };

  // ── Cabeçalho ──
  doc.setFillColor(...COR_BG);
  doc.rect(0, 0, 210, 28, "F");

  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...COR_TEXTO_CLARO);
  doc.text("ROTA ORGANIZADA POR QUADRA", 105, 11, { align: "center" });

  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(148, 163, 184);

  const totalPacotes = Object.values(agrupado).reduce(
    (s, sub) => s + Object.values(sub).reduce((ss, a) => ss + a.length, 0),
    0
  );
  const totalQuadras = Object.keys(agrupado).filter((k) => k !== "_OUTROS").length;
  const agora = new Date().toLocaleDateString("pt-BR", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });

  const infoTexto = nomeArquivo
    ? `${nomeArquivo}  •  ${totalPacotes} pacotes  •  ${totalQuadras} quadras  •  ${agora}`
    : `${totalPacotes} pacotes  •  ${totalQuadras} quadras  •  ${agora}`;

  doc.text(infoTexto, 105, 19, { align: "center" });

  // Linha de destaque abaixo do header
  doc.setFillColor(59, 130, 246);
  doc.rect(0, 26, 210, 2, "F");

  y = 34;

  // ── Corpo ──
  for (const [quadra, sublocs] of Object.entries(agrupado)) {
    const isOutros = quadra === "_OUTROS";
    const totalQ = Object.values(sublocs).reduce((s, a) => s + a.length, 0);

    // Estima espaço necessário para a quadra inteira
    const linhasSublocais = Object.keys(sublocs).length;
    const estimativa = 10 + linhasSublocais * (CHIP_H + 3) + 4;
    garantirEspaco(Math.min(estimativa, 40));

    // Faixa título da quadra
    const corFaixa = isOutros ? COR_OUTROS_BG : COR_QUADRA_BG;
    doc.setFillColor(...corFaixa);
    doc.roundedRect(MARGEM, y, LARGURA, 9, 1.5, 1.5, "F");

    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...COR_TEXTO_CLARO);
    const tituloQ = isOutros
      ? `OUTROS ENDEREÇOS — ${totalQ} pacote${totalQ > 1 ? "s" : ""}`
      : `${quadra}   —   ${totalQ} pacote${totalQ > 1 ? "s" : ""}`;
    doc.text(tituloQ, MARGEM + 3, y + 6);

    y += 12;

    // Linhas de sublocal
    for (const [sublocal, numeros] of Object.entries(sublocs)) {
      const contagem = contarDuplicatas(numeros);
      const chips = Object.entries(contagem); // [["316", 2], ["321", 1], ...]

      // Calcula quantas linhas de chips serão necessárias
      const linhasChips = calcularLinhasChips(chips, LARGURA - 35, CHIP_W_BASE, CHIP_PAD);
      const alturaSublocal = linhasChips * (CHIP_H + 2) + 4;
      garantirEspaco(alturaSublocal + 2);

      // Fundo da linha do sublocal
      doc.setFillColor(248, 250, 252);
      doc.roundedRect(MARGEM, y, LARGURA, alturaSublocal, 1, 1, "F");
      doc.setDrawColor(...COR_SEPARADOR);
      doc.setLineWidth(0.3);
      doc.roundedRect(MARGEM, y, LARGURA, alturaSublocal, 1, 1, "S");

      // Badge do sublocal (azul)
      const badgeW = 28;
      doc.setFillColor(...COR_BLOCO_BG);
      doc.roundedRect(MARGEM + 2, y + 1.5, badgeW, 6, 1, 1, "F");
      doc.setFontSize(8);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...COR_TEXTO_CLARO);
      doc.text(sublocal.toUpperCase(), MARGEM + 2 + badgeW / 2, y + 5.8, {
        align: "center",
      });

      // Chips de números
      let cx = MARGEM + badgeW + 6;
      let cy = y + 2;

      for (const [num, qtd] of chips) {
        const isMulti = qtd > 1;
        const label = isMulti ? `${num} ×${qtd}` : num;
        const chipW = Math.max(CHIP_W_BASE, label.length * 2.2 + CHIP_PAD * 2);

        // Quebra de linha se não cabe
        if (cx + chipW > MARGEM + LARGURA - 3) {
          cx = MARGEM + badgeW + 6;
          cy += CHIP_H + 2;
        }

        // Desenha chip
        if (isMulti) {
          doc.setFillColor(...COR_MULTI_BG);
          doc.roundedRect(cx, cy, chipW, CHIP_H, CHIP_RADIUS, CHIP_RADIUS, "F");
          doc.setDrawColor(...COR_MULTI_BORDA);
          doc.setLineWidth(0.4);
          doc.roundedRect(cx, cy, chipW, CHIP_H, CHIP_RADIUS, CHIP_RADIUS, "S");
          doc.setFontSize(7.5);
          doc.setFont("helvetica", "bold");
          doc.setTextColor(146, 64, 14);
        } else {
          doc.setFillColor(...COR_CHIP_BG);
          doc.roundedRect(cx, cy, chipW, CHIP_H, CHIP_RADIUS, CHIP_RADIUS, "F");
          doc.setDrawColor(147, 197, 253);
          doc.setLineWidth(0.3);
          doc.roundedRect(cx, cy, chipW, CHIP_H, CHIP_RADIUS, CHIP_RADIUS, "S");
          doc.setFontSize(7.5);
          doc.setFont("helvetica", "bold");
          doc.setTextColor(...COR_TEXTO_CHIP);
        }

        doc.text(label, cx + chipW / 2, cy + 4.2, { align: "center" });
        cx += chipW + 2.5;
      }

      y += alturaSublocal + 2;
    }

    y += 5; // espaço entre quadras
  }

  // Rodapé última página
  doc.setFontSize(8);
  doc.setTextColor(...COR_SUBTEXTO);
  doc.text(
    `Página ${pagina}  •  Gerado por Rotas DF`,
    105,
    ALTURA_PAGINA - 5,
    { align: "center" }
  );

  // Download
  const nomeSaida = nomeArquivo.replace(/\.[^.]+$/, "") || "rota";
  doc.save(`${nomeSaida}_organizado.pdf`);
}

// ─── HELPERS ──────────────────────────────────────────────────────────────────

/**
 * Conta quantas vezes cada número aparece no array.
 * ["316","316","321"] → { "316": 2, "321": 1 }
 */
export function contarDuplicatas(numeros) {
  const contagem = {};
  for (const n of numeros) {
    contagem[n] = (contagem[n] || 0) + 1;
  }
  return contagem;
}

/**
 * Formata chips para TXT.
 * { "316": 2, "321": 1 } → "316 ×2   321"
 */
function formatarChipsTXT(contagem) {
  return Object.entries(contagem)
    .map(([n, qtd]) => (qtd > 1 ? `${n} ×${qtd}` : n))
    .join("   ");
}

/**
 * Estima quantas linhas de chips são necessárias para caber na largura.
 */
function calcularLinhasChips(chips, larguraDisponivel, chipWBase, chipPad) {
  let cx = 0;
  let linhas = 1;
  for (const [num, qtd] of chips) {
    const label = qtd > 1 ? `${num} ×${qtd}` : num;
    const chipW = Math.max(chipWBase, label.length * 2.2 + chipPad * 2);
    if (cx + chipW > larguraDisponivel && cx > 0) {
      linhas++;
      cx = 0;
    }
    cx += chipW + 2.5;
  }
  return linhas;
}
