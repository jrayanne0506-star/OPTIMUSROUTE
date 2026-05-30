/**
 * exporter.js — Geração de PDF e TXT a partir do objeto agrupado
 *
 * ESTRUTURA DO PDF GERADO
 * =======================
 * - Cabeçalho com título + data + total de pacotes
 * - Para cada quadra:
 *     [ Quadra 203 — 18 pacotes ]
 *     Cj 14  →  05  10  13 ×22
 *     Cj 15  →  20 ×2
 *     ...
 * - Endereços com múltiplos pacotes recebem badge "×N"
 * - Seção "_OUTROS" ao final com endereços atípicos
 * - Quebra de página automática
 *
 * MÚLTIPLOS PACOTES
 * =================
 * Se "Cj 14" tem ["05","13","13"] → 05 normal, 13 aparece como "13 ×2"
 */

// ─── EXPORTAÇÃO TXT ───────────────────────────────────────────────────────────

export function exportarTXT(agrupado, nomeArquivo = "") {
  const linhas = [];
  const agora = new Date().toLocaleDateString("pt-BR", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
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
      const contagem = contarDuplicatas(numeros);
      const chips    = formatarChipsTXT(contagem);
      linhas.push(`  ${sublocal.padEnd(12)}→  ${chips}`);
    }

    linhas.push("");
  }

  return linhas.join("\n");
}

// ─── EXPORTAÇÃO PDF ───────────────────────────────────────────────────────────

export function exportarPDF(agrupado, nomeArquivo = "rota") {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: "mm", format: "a4" });

  const MARGEM      = 12;
  const LARGURA     = 210 - MARGEM * 2;
  const ALTURA_PAG  = 297;
  const RODAPE_H    = 10;
  const CHIP_H      = 6;
  const CHIP_W_BASE = 10;
  const CHIP_PAD    = 2.5;
  const CHIP_RADIUS = 1.5;

  const COR_BG         = [17, 24, 39];
  const COR_QUADRA_BG  = [30, 58, 138];
  const COR_BLOCO_BG   = [37, 99, 235];
  const COR_CHIP_BG    = [239, 246, 255];
  const COR_MULTI_BG   = [254, 243, 199];
  const COR_MULTI_BORDA= [217, 119, 6];
  const COR_OUTROS_BG  = [71, 85, 105];
  const COR_TEXTO_CLARO= [255, 255, 255];
  const COR_TEXTO_CHIP = [30, 58, 138];
  const COR_SEPARADOR  = [203, 213, 225];
  const COR_SUBTEXTO   = [100, 116, 139];

  let y = MARGEM;
  let pagina = 1;

  const novaPagina = () => {
    doc.setFontSize(8);
    doc.setTextColor(...COR_SUBTEXTO);
    doc.text(`Página ${pagina}  •  Gerado por Rotas DF`, 105, ALTURA_PAG - 5, { align: "center" });
    doc.addPage();
    pagina++;
    y = MARGEM;
  };

  const garantirEspaco = (necessario) => {
    if (y + necessario > ALTURA_PAG - RODAPE_H - MARGEM) novaPagina();
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
    (s, sub) => s + Object.values(sub).reduce((ss, a) => ss + a.length, 0), 0
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

  doc.setFillColor(59, 130, 246);
  doc.rect(0, 26, 210, 2, "F");

  y = 34;

  // ── Corpo ──
  for (const [quadra, sublocs] of Object.entries(agrupado)) {
    const isOutros = quadra === "_OUTROS";
    const totalQ   = Object.values(sublocs).reduce((s, a) => s + a.length, 0);

    const estimativa = 10 + Object.keys(sublocs).length * (CHIP_H + 3) + 4;
    garantirEspaco(Math.min(estimativa, 40));

    // Faixa título da quadra
    doc.setFillColor(...(isOutros ? COR_OUTROS_BG : COR_QUADRA_BG));
    doc.roundedRect(MARGEM, y, LARGURA, 9, 1.5, 1.5, "F");
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...COR_TEXTO_CLARO);
    doc.text(
      isOutros
        ? `OUTROS ENDEREÇOS — ${totalQ} pacote${totalQ > 1 ? "s" : ""}`
        : `${quadra}   —   ${totalQ} pacote${totalQ > 1 ? "s" : ""}`,
      MARGEM + 3, y + 6
    );
    y += 12;

    // Linhas de sublocal
    for (const [sublocal, numeros] of Object.entries(sublocs)) {
      const contagem   = contarDuplicatas(numeros);
      const chips      = Object.entries(contagem);
      const linhasChips = calcularLinhasChips(chips, LARGURA - 35, CHIP_W_BASE, CHIP_PAD);
      const altSublocal = linhasChips * (CHIP_H + 2) + 4;

      garantirEspaco(altSublocal + 2);

      // Fundo linha
      doc.setFillColor(248, 250, 252);
      doc.roundedRect(MARGEM, y, LARGURA, altSublocal, 1, 1, "F");
      doc.setDrawColor(...COR_SEPARADOR);
      doc.setLineWidth(0.3);
      doc.roundedRect(MARGEM, y, LARGURA, altSublocal, 1, 1, "S");

      // Badge sublocal
      const badgeW = 28;
      doc.setFillColor(...COR_BLOCO_BG);
      doc.roundedRect(MARGEM + 2, y + 1.5, badgeW, 6, 1, 1, "F");
      doc.setFontSize(8);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...COR_TEXTO_CLARO);
      doc.text(sublocal.toUpperCase(), MARGEM + 2 + badgeW / 2, y + 5.8, { align: "center" });

      // Chips de números
      let cx = MARGEM + badgeW + 6;
      let cy = y + 2;

      for (const [num, qtd] of chips) {
        const isMulti = qtd > 1;
        const label   = isMulti ? `${num} ×${qtd}` : num;
        const chipW   = Math.max(CHIP_W_BASE, label.length * 2.2 + CHIP_PAD * 2);

        if (cx + chipW > MARGEM + LARGURA - 3) {
          cx  = MARGEM + badgeW + 6;
          cy += CHIP_H + 2;
        }

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

      y += altSublocal + 2;
    }

    y += 5;
  }

  // Rodapé última página
  doc.setFontSize(8);
  doc.setTextColor(...COR_SUBTEXTO);
  doc.text(`Página ${pagina}  •  Gerado por Rotas DF`, 105, ALTURA_PAG - 5, { align: "center" });

  const nomeSaida = nomeArquivo.replace(/\.[^.]+$/, "") || "rota";
  doc.save(`${nomeSaida}_organizado.pdf`);
}

// ─── HELPERS ──────────────────────────────────────────────────────────────────

/**
 * Conta duplicatas E ordena as casas numericamente.
 * ["13","05","13","10"] → { "05":1, "10":1, "13":2 }
 */
export function contarDuplicatas(numeros) {
  const contagem = {};
  for (const n of numeros) {
    contagem[n] = (contagem[n] || 0) + 1;
  }
  return Object.fromEntries(
    Object.entries(contagem).sort(([a], [b]) => {
      const na = parseInt(a), nb = parseInt(b);
      if (!isNaN(na) && !isNaN(nb)) return na - nb;
      return a.localeCompare(b);
    })
  );
}

function formatarChipsTXT(contagem) {
  return Object.entries(contagem)
    .map(([n, qtd]) => (qtd > 1 ? `${n} ×${qtd}` : n))
    .join("   ");
}

function calcularLinhasChips(chips, larguraDisponivel, chipWBase, chipPad) {
  let cx = 0, linhas = 1;
  for (const [num, qtd] of chips) {
    const label = qtd > 1 ? `${num} ×${qtd}` : num;
    const chipW = Math.max(chipWBase, label.length * 2.2 + chipPad * 2);
    if (cx + chipW > larguraDisponivel && cx > 0) { linhas++; cx = 0; }
    cx += chipW + 2.5;
  }
  return linhas;
}