/**
 * exporter.js — Geração de PDF e TXT a partir do objeto agrupado
 *
 * LAYOUT:
 *   Quadra 203 — 32 pacotes
 *     Cj 14  →  casa 05
 *     Cj 14  →  casa 10
 *     Cj 14  →  casa 13  ⚠️ 22 pacotes
 *     Cj 15  →  casa 20  ⚠️ 2 pacotes
 */

// ─── EXPORTAÇÃO TXT ───────────────────────────────────────────────────────────

export function exportarTXT(agrupado, nomeArquivo = "") {
  const linhas = [];
  const agora  = new Date().toLocaleDateString("pt-BR", {
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
    const titulo = quadra === "_OUTROS"
      ? `▸ OUTROS ENDEREÇOS (${totalQ} pacote${totalQ > 1 ? "s" : ""})`
      : `▸ ${quadra}  —  ${totalQ} pacote${totalQ > 1 ? "s" : ""}`;

    linhas.push(titulo);
    linhas.push("─".repeat(titulo.length));

    for (const [sublocal, numeros] of Object.entries(sublocs)) {
      const contagem = contarDuplicatas(numeros);
      for (const [casa, qtd] of Object.entries(contagem)) {
        const aviso = qtd > 1 ? `  ⚠️  ${qtd} pacotes` : "";
        linhas.push(`  ${sublocal.padEnd(10)}  →  casa ${casa}${aviso}`);
      }
    }

    linhas.push("");
  }

  return linhas.join("\n");
}

// ─── EXPORTAÇÃO PDF ───────────────────────────────────────────────────────────

export function exportarPDF(agrupado, nomeArquivo = "rota") {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: "mm", format: "a4" });

  const MARGEM     = 12;
  const LARGURA    = 210 - MARGEM * 2;
  const ALTURA_PAG = 297;
  const RODAPE_H   = 10;
  const LINHA_H    = 8; // altura de cada linha casa

  const COR_BG          = [17, 24, 39];
  const COR_QUADRA_BG   = [30, 58, 138];
  const COR_OUTROS_BG   = [71, 85, 105];
  const COR_CONJ_BG     = [37, 99, 235];
  const COR_BLOCO_BG    = [6, 95, 70];
  const COR_LINHA_PAR   = [248, 250, 252];
  const COR_LINHA_IMPAR = [255, 255, 255];
  const COR_ALERTA_BG   = [254, 243, 199];
  const COR_ALERTA_BD   = [217, 119, 6];
  const COR_ALERTA_TX   = [146, 64, 14];
  const COR_TEXTO_CLARO = [255, 255, 255];
  const COR_TEXTO_ESCURO= [15, 23, 42];
  const COR_SEPARADOR   = [203, 213, 225];
  const COR_SUBTEXTO    = [100, 116, 139];
  const COR_SETA        = [148, 163, 184];

  let y = MARGEM, pagina = 1, linhaIdx = 0;

  const novaPagina = () => {
    doc.setFontSize(8);
    doc.setTextColor(...COR_SUBTEXTO);
    doc.text(`Página ${pagina}  •  Gerado por Rotas DF`, 105, ALTURA_PAG - 5, { align: "center" });
    doc.addPage();
    pagina++;
    y = MARGEM;
    linhaIdx = 0;
  };

  const garantirEspaco = (h) => {
    if (y + h > ALTURA_PAG - RODAPE_H - MARGEM) novaPagina();
  };

  // ── Cabeçalho ──
  doc.setFillColor(...COR_BG);
  doc.rect(0, 0, 210, 28, "F");
  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...COR_TEXTO_CLARO);
  doc.text("ROTA ORGANIZADA POR QUADRA", 105, 11, { align: "center" });

  const totalPacotes = Object.values(agrupado).reduce(
    (s, sub) => s + Object.values(sub).reduce((ss, a) => ss + a.length, 0), 0
  );
  const totalQuadras = Object.keys(agrupado).filter((k) => k !== "_OUTROS").length;
  const agora = new Date().toLocaleDateString("pt-BR", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });

  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(148, 163, 184);
  doc.text(
    `${nomeArquivo ? nomeArquivo + "  •  " : ""}${totalPacotes} pacotes  •  ${totalQuadras} quadras  •  ${agora}`,
    105, 19, { align: "center" }
  );
  doc.setFillColor(59, 130, 246);
  doc.rect(0, 26, 210, 2, "F");
  y = 34;

  // ── Corpo ──
  for (const [quadra, sublocs] of Object.entries(agrupado)) {
    const isOutros = quadra === "_OUTROS";
    const totalQ   = Object.values(sublocs).reduce((s, a) => s + a.length, 0);

    garantirEspaco(12);

    // Faixa da quadra
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
    y += 11;
    linhaIdx = 0;

    // Uma linha por sublocal + casa
    for (const [sublocal, numeros] of Object.entries(sublocs)) {
      const contagem = contarDuplicatas(numeros);

      for (const [casa, qtd] of Object.entries(contagem)) {
        garantirEspaco(LINHA_H);

        // Fundo zebrado
        doc.setFillColor(...(linhaIdx % 2 === 0 ? COR_LINHA_PAR : COR_LINHA_IMPAR));
        doc.rect(MARGEM, y, LARGURA, LINHA_H, "F");

        // Separador leve
        doc.setDrawColor(...COR_SEPARADOR);
        doc.setLineWidth(0.2);
        doc.line(MARGEM, y + LINHA_H, MARGEM + LARGURA, y + LINHA_H);

        // Badge sublocal
        const badgeW = 22;
        const corBadge = sublocal.startsWith("Bl") ? COR_BLOCO_BG : COR_CONJ_BG;
        doc.setFillColor(...corBadge);
        doc.roundedRect(MARGEM + 2, y + 1.2, badgeW, 5.5, 1, 1, "F");
        doc.setFontSize(7.5);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(...COR_TEXTO_CLARO);
        doc.text(sublocal.toUpperCase(), MARGEM + 2 + badgeW / 2, y + 5, { align: "center" });

        // Seta
        doc.setFontSize(8);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(...COR_SETA);
        doc.text("→", MARGEM + badgeW + 5, y + 5.2);

        // Casa
        doc.setFontSize(9);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(...COR_TEXTO_ESCURO);
        doc.text(`casa ${casa}`, MARGEM + badgeW + 11, y + 5.2);

        // Alerta de múltiplos pacotes
        if (qtd > 1) {
          const alertaLabel = `⚠ ${qtd} pacotes`;
          const alertaW     = alertaLabel.length * 2.1 + 6;
          const alertaX     = MARGEM + LARGURA - alertaW - 2;
          doc.setFillColor(...COR_ALERTA_BG);
          doc.roundedRect(alertaX, y + 1.2, alertaW, 5.5, 1, 1, "F");
          doc.setDrawColor(...COR_ALERTA_BD);
          doc.setLineWidth(0.4);
          doc.roundedRect(alertaX, y + 1.2, alertaW, 5.5, 1, 1, "S");
          doc.setFontSize(7.5);
          doc.setFont("helvetica", "bold");
          doc.setTextColor(...COR_ALERTA_TX);
          doc.text(alertaLabel, alertaX + alertaW / 2, y + 5, { align: "center" });
        }

        y += LINHA_H;
        linhaIdx++;
      }
    }

    y += 5; // espaço entre quadras
  }

  // Rodapé última página
  doc.setFontSize(8);
  doc.setTextColor(...COR_SUBTEXTO);
  doc.text(`Página ${pagina}  •  Gerado por Rotas DF`, 105, ALTURA_PAG - 5, { align: "center" });

  doc.save(`${nomeArquivo.replace(/\.[^.]+$/, "") || "rota"}_organizado.pdf`);
}

// ─── HELPERS ──────────────────────────────────────────────────────────────────

/**
 * Conta duplicatas E ordena numericamente.
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