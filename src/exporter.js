/**
 * exporter.js — Geração de PDF e TXT a partir do objeto agrupado
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

  let rotaIdx = 1;

  for (const [quadra, sublocs] of Object.entries(agrupado)) {
    const isOutros = quadra === "_OUTROS";
    const totalQ = Object.values(sublocs).reduce((s, a) => s + a.length, 0);

    const titulo = isOutros
      ? `▸ ⚠ OUTROS ENDEREÇOS (${totalQ} pacote${totalQ > 1 ? "s" : ""}) — endereços fora do padrão reconhecido`
      : `▸ ROTA ${rotaIdx++}  —  ${quadra}  —  ${totalQ} pacote${totalQ > 1 ? "s" : ""}`;

    linhas.push(titulo);
    linhas.push("─".repeat(Math.min(titulo.length, 60)));

    for (const [sublocal, numeros] of Object.entries(sublocs)) {
      for (const { casa, qtd } of contarDuplicatas(numeros)) {
        const aviso = qtd > 1 ? `  ⚠️  ${qtd} pacotes` : "";
        const label = isOutros
          ? `  ${sublocal.padEnd(10)}  →  ${casa}`
          : `  ${sublocal.padEnd(10)}  →  casa ${casa}`;
        linhas.push(`${label}${aviso}`);
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
  const LINHA_H    = 8;

  const COR_BG           = [17, 24, 39];
  const COR_QUADRA_BG    = [30, 58, 138];
  const COR_OUTROS_BG    = [71, 85, 105];
  const COR_CONJ_BG      = [37, 99, 235];
  const COR_BLOCO_BG     = [6, 95, 70];
  const COR_LINHA_PAR    = [248, 250, 252];
  const COR_LINHA_IMPAR  = [255, 255, 255];
  const COR_ALERTA_BG    = [254, 243, 199];
  const COR_ALERTA_BD    = [217, 119, 6];
  const COR_ALERTA_TX    = [146, 64, 14];
  const COR_TEXTO_CLARO  = [255, 255, 255];
  const COR_TEXTO_ESCURO = [15, 23, 42];
  const COR_SEPARADOR    = [203, 213, 225];
  const COR_SUBTEXTO     = [100, 116, 139];
  const COR_SETA         = [148, 163, 184];
  const COR_ROTA_BADGE   = [59, 130, 246];

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
    `${nomeArquivo ? nomeArquivo + "  •  " : ""}${totalPacotes} pacotes  •  ${totalQuadras} rotas  •  ${agora}`,
    105, 19, { align: "center" }
  );
  doc.setFillColor(59, 130, 246);
  doc.rect(0, 26, 210, 2, "F");
  y = 34;

  // ── Corpo ──
  let rotaIdx = 1;

  for (const [quadra, sublocs] of Object.entries(agrupado)) {
    const isOutros = quadra === "_OUTROS";
    const totalQ   = Object.values(sublocs).reduce((s, a) => s + a.length, 0);
    const numRota  = isOutros ? null : rotaIdx++;

    garantirEspaco(12);

    // Faixa da quadra
    doc.setFillColor(...(isOutros ? COR_OUTROS_BG : COR_QUADRA_BG));
    doc.roundedRect(MARGEM, y, LARGURA, 9, 1.5, 1.5, "F");

    if (!isOutros) {
      const badgeW = 18;
      doc.setFillColor(...COR_ROTA_BADGE);
      doc.roundedRect(MARGEM + 3, y + 1.5, badgeW, 6, 1, 1, "F");
      doc.setFontSize(7);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...COR_TEXTO_CLARO);
      doc.text(`ROTA ${numRota}`, MARGEM + 3 + badgeW / 2, y + 5.5, { align: "center" });

      doc.setFontSize(10);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...COR_TEXTO_CLARO);
      doc.text(
        `${quadra}   —   ${totalQ} pacote${totalQ > 1 ? "s" : ""}`,
        MARGEM + 3 + badgeW + 4, y + 6
      );
    } else {
      doc.setFontSize(9);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...COR_TEXTO_CLARO);
      doc.text(
        `⚠ OUTROS ENDEREÇOS — ${totalQ} pacote${totalQ > 1 ? "s" : ""}`,
        MARGEM + 3, y + 6
      );
      doc.setFontSize(7);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(200, 200, 200);
      doc.text("endereços fora do padrão reconhecido", MARGEM + LARGURA - 2, y + 6, { align: "right" });
    }

    y += 11;
    linhaIdx = 0;

    for (const [sublocal, numeros] of Object.entries(sublocs)) {
      for (const { casa, qtd } of contarDuplicatas(numeros)) {
        garantirEspaco(LINHA_H);

        doc.setFillColor(...(linhaIdx % 2 === 0 ? COR_LINHA_PAR : COR_LINHA_IMPAR));
        doc.rect(MARGEM, y, LARGURA, LINHA_H, "F");

        doc.setDrawColor(...COR_SEPARADOR);
        doc.setLineWidth(0.2);
        doc.line(MARGEM, y + LINHA_H, MARGEM + LARGURA, y + LINHA_H);

        const badgeW = 22;
        const isBl   = sublocal.startsWith("Bl");
        const isCj   = sublocal.startsWith("Cj");
        const corBadge = isBl ? COR_BLOCO_BG : isCj ? COR_CONJ_BG : [80, 80, 90];
        doc.setFillColor(...corBadge);
        doc.roundedRect(MARGEM + 2, y + 1.2, badgeW, 5.5, 1, 1, "F");
        doc.setFontSize(7.5);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(...COR_TEXTO_CLARO);
        const badgeLabel = sublocal === "Sem sublocal" ? "—" : sublocal.toUpperCase();
        doc.text(badgeLabel, MARGEM + 2 + badgeW / 2, y + 5, { align: "center" });

        doc.setFontSize(8);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(...COR_SETA);
        doc.text("→", MARGEM + badgeW + 5, y + 5.2);

        doc.setFontSize(9);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(...COR_TEXTO_ESCURO);
        const casaLabel = isOutros ? casa : `casa ${casa}`;
        doc.text(casaLabel, MARGEM + badgeW + 11, y + 5.2);

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

    y += 5;
  }

  doc.setFontSize(8);
  doc.setTextColor(...COR_SUBTEXTO);
  doc.text(`Página ${pagina}  •  Gerado por Rotas DF`, 105, ALTURA_PAG - 5, { align: "center" });

  doc.save(`${nomeArquivo.replace(/\.[^.]+$/, "") || "rota"}_organizado.pdf`);
}

// ─── HELPERS ──────────────────────────────────────────────────────────────────

/**
 * Conta duplicatas e retorna array ordenado numericamente crescente.
 * Retorna Array<{casa: string, qtd: number}> — não usa Object para evitar
 * que o JS reordene chaves numéricas e perca zeros à esquerda.
 *
 * ["13","05","13","10"] → [{casa:"05",qtd:1},{casa:"10",qtd:1},{casa:"13",qtd:2}]
 */
export function contarDuplicatas(numeros) {
  const mapa = new Map();
  for (const n of numeros) {
    mapa.set(n, (mapa.get(n) || 0) + 1);
  }
  return [...mapa.entries()]
    .sort(([a], [b]) => {
      const na = parseInt(a), nb = parseInt(b);
      if (!isNaN(na) && !isNaN(nb)) return na - nb;
      return a.localeCompare(b);
    })
    .map(([casa, qtd]) => ({ casa, qtd }));
}