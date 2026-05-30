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
      const isAmbiguo = sublocal === "_ambiguo";

      for (const { casa, qtd } of contarDuplicatas(numeros)) {
        const aviso = qtd > 1 ? `  ⚠️  ${qtd} pacotes` : "";
        const { numero, tipo } = (casa && typeof casa === "object") ? casa : { numero: casa, tipo: "casa" };

        let label;
        if (isOutros) {
          label = `  ${sublocal.padEnd(10)}  →  ${numero}`;
        } else if (isAmbiguo) {
          label = `  [${"?".padEnd(9)}]  →  ${numero}  ⚠ AMBIGUO: pode ser conjunto ou casa`;
        } else {
          label = `  ${sublocal.padEnd(10)}  →  ${tipo === "ap" ? "ap" : "casa"} ${numero}`;
        }

        linhas.push(`[ ]  ${label}${aviso}`);
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

  const MARGEM     = 14;
  const LARGURA    = 210 - MARGEM * 2;
  const ALTURA_PAG = 297;
  const RODAPE_H   = 12;
  const LINHA_H    = 9;
  const HEADER_H   = 32;

  const C = {
    bg:          [13, 17, 27],
    bgHeader:    [20, 26, 46],
    azulEscuro:  [26, 54, 120],
    azulBadge:   [37, 99, 235],
    azulRota:    [59, 130, 246],
    verdeBloco:  [5, 90, 65],
    cinzaOther:  [60, 70, 85],
    ambarBg:     [120, 80, 0],     // fundo badge ambíguo
    ambarBadge:  [180, 120, 0],
    linhaPar:    [245, 247, 252],
    linhaImpar:  [255, 255, 255],
    linhaAmbBg:  [255, 251, 235],  // fundo linha ambígua
    alertaBg:    [255, 248, 225],
    alertaBd:    [210, 115, 5],
    alertaTx:    [130, 55, 5],
    branco:      [255, 255, 255],
    pretoDark:   [12, 20, 38],
    cinzaTx:     [95, 110, 130],
    separador:   [215, 220, 230],
    checkBd:     [160, 170, 185],
    checkBg:     [250, 251, 253],
  };

  let y = MARGEM, pagina = 1, linhaIdx = 0;

  const totalPacotes = Object.values(agrupado).reduce(
    (s, sub) => s + Object.values(sub).reduce((ss, a) => ss + a.length, 0), 0
  );
  const totalRotas = Object.keys(agrupado).filter((k) => k !== "_OUTROS").length;
  const agora = new Date().toLocaleDateString("pt-BR", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });

  const novaPagina = () => {
    _rodape();
    doc.addPage();
    pagina++;
    y = MARGEM;
    linhaIdx = 0;
    _cabecalhoMini();
  };

  const garantirEspaco = (h) => {
    if (y + h > ALTURA_PAG - RODAPE_H - 4) novaPagina();
  };

  const _rodape = () => {
    doc.setDrawColor(...C.separador);
    doc.setLineWidth(0.3);
    doc.line(MARGEM, ALTURA_PAG - RODAPE_H, MARGEM + LARGURA, ALTURA_PAG - RODAPE_H);
    doc.setFontSize(7.5);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...C.cinzaTx);
    doc.text(`Pagina ${pagina}`, MARGEM, ALTURA_PAG - 5);
    doc.text("Gerado por Rotas DF", MARGEM + LARGURA, ALTURA_PAG - 5, { align: "right" });
  };

  const _cabecalhoMini = () => {
    doc.setFillColor(...C.bg);
    doc.rect(0, 0, 210, 10, "F");
    doc.setFontSize(7);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...C.branco);
    doc.text("ROTA ORGANIZADA POR QUADRA", MARGEM, 6.5);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(120, 140, 170);
    doc.text(`${totalPacotes} pacotes  |  ${totalRotas} rotas  |  ${agora}`, MARGEM + LARGURA, 6.5, { align: "right" });
    doc.setFillColor(...C.azulRota);
    doc.rect(0, 10, 210, 1, "F");
    y = 15;
  };

  // Cabeçalho principal pág. 1
  doc.setFillColor(...C.bg);
  doc.rect(0, 0, 210, HEADER_H, "F");
  doc.setFillColor(...C.azulRota);
  doc.rect(0, 0, 4, HEADER_H, "F");
  doc.setFontSize(17);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...C.branco);
  doc.text("ROTA ORGANIZADA POR QUADRA", MARGEM + 2, 13);
  doc.setFontSize(8.5);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(140, 160, 195);
  const arquivoLabel = nomeArquivo ? nomeArquivo.replace(/\.[^.]+$/, "") : "Shopee Logistics";
  doc.text(arquivoLabel, MARGEM + 2, 20);

  const pills = [`${totalPacotes} pacotes`, `${totalRotas} rotas`, agora];
  let px = MARGEM + 2;
  const py = 27;
  doc.setFontSize(7.5);
  for (const p of pills) {
    const w = doc.getTextWidth(p) + 8;
    doc.setFillColor(35, 50, 80);
    doc.roundedRect(px, py - 4, w, 5.5, 1, 1, "F");
    doc.setTextColor(160, 185, 225);
    doc.text(p, px + 4, py);
    px += w + 4;
  }

  doc.setFillColor(...C.azulRota);
  doc.rect(0, HEADER_H, 210, 1.5, "F");
  y = HEADER_H + 6;

  let rotaIdx = 1;

  for (const [quadra, sublocs] of Object.entries(agrupado)) {
    const isOutros = quadra === "_OUTROS";
    const totalQ   = Object.values(sublocs).reduce((s, a) => s + a.length, 0);
    const numRota  = isOutros ? null : rotaIdx++;

    garantirEspaco(14);

    const corFaixa = isOutros ? C.cinzaOther : C.azulEscuro;
    doc.setFillColor(...corFaixa);
    doc.rect(MARGEM, y, LARGURA, 10, "F");
    doc.setFillColor(...(isOutros ? [100, 110, 125] : C.azulRota));
    doc.rect(MARGEM, y, 3, 10, "F");

    if (!isOutros) {
      const badgeW = 16;
      doc.setFillColor(...C.azulRota);
      doc.roundedRect(MARGEM + 5, y + 2, badgeW, 6, 1, 1, "F");
      doc.setFontSize(6.5);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...C.branco);
      doc.text(`ROTA ${numRota}`, MARGEM + 5 + badgeW / 2, y + 6.2, { align: "center" });
      doc.setFontSize(10);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...C.branco);
      doc.text(quadra, MARGEM + 5 + badgeW + 4, y + 6.8);
      const totalLabel = `${totalQ} pacote${totalQ > 1 ? "s" : ""}`;
      doc.setFontSize(8);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(160, 190, 230);
      doc.text(totalLabel, MARGEM + LARGURA - 3, y + 6.8, { align: "right" });
    } else {
      doc.setFontSize(9);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...C.branco);
      doc.text("! OUTROS ENDERECOS", MARGEM + 6, y + 6.8);
      doc.setFontSize(7.5);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(180, 185, 195);
      doc.text(`${totalQ} pacotes - fora do padrao reconhecido`, MARGEM + LARGURA - 3, y + 6.8, { align: "right" });
    }

    y += 11;
    linhaIdx = 0;

    for (const [sublocal, numeros] of Object.entries(sublocs)) {
      const isAmbiguo = sublocal === "_ambiguo";

      for (const { casa, qtd } of contarDuplicatas(numeros)) {
        const { numero: casaNum, tipo: casaTipo } = (casa && typeof casa === "object") ? casa : { numero: casa, tipo: "casa" };
        garantirEspaco(LINHA_H);

        // Fundo: amarelo claro para ambíguo, zebrado para o resto
        if (isAmbiguo) {
          doc.setFillColor(255, 251, 225);
        } else {
          doc.setFillColor(...(linhaIdx % 2 === 0 ? C.linhaPar : C.linhaImpar));
        }
        doc.rect(MARGEM, y, LARGURA, LINHA_H, "F");

        // Borda esquerda laranja para ambíguo
        if (isAmbiguo) {
          doc.setFillColor(217, 119, 6);
          doc.rect(MARGEM, y, 2, LINHA_H, "F");
        }

        doc.setDrawColor(...C.separador);
        doc.setLineWidth(0.15);
        doc.line(MARGEM, y + LINHA_H, MARGEM + LARGURA, y + LINHA_H);

        // Checkbox
        const cbX = MARGEM + 2;
        const cbY = y + 1.8;
        const cbS = 5.2;
        doc.setFillColor(...C.checkBg);
        doc.setDrawColor(...C.checkBd);
        doc.setLineWidth(0.5);
        doc.rect(cbX, cbY, cbS, cbS, "FD");

        // Badge sublocal
        const bX = cbX + cbS + 2.5;
        const badgeW = 20;
        let corBadge;
        if (sublocal.startsWith("Bl"))       corBadge = C.verdeBloco;
        else if (sublocal.startsWith("Cj"))  corBadge = C.azulBadge;
        else if (isAmbiguo)                  corBadge = [180, 100, 0];
        else                                 corBadge = [75, 85, 100];

        doc.setFillColor(...corBadge);
        doc.roundedRect(bX, y + 1.8, badgeW, 5.5, 1, 1, "F");
        doc.setFontSize(7);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(...C.branco);
        const badgeLabel = isAmbiguo ? "?" : sublocal === "Sem sublocal" ? "S/CJ" : sublocal.toUpperCase();
        doc.text(badgeLabel, bX + badgeW / 2, y + 5.8, { align: "center" });

        // Seta
        const setaX = bX + badgeW + 3;
        const setaMid = y + LINHA_H / 2;
        doc.setDrawColor(...C.cinzaTx);
        doc.setLineWidth(0.5);
        doc.line(setaX, setaMid, setaX + 4, setaMid);
        doc.line(setaX + 4, setaMid, setaX + 2, setaMid - 1.2);
        doc.line(setaX + 4, setaMid, setaX + 2, setaMid + 1.2);

        // Número
        const casaX = setaX + 7;
        doc.setFontSize(9.5);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(isAmbiguo ? 120 : C.pretoDark[0], isAmbiguo ? 60 : C.pretoDark[1], isAmbiguo ? 0 : C.pretoDark[2]);
        const casaLabel = isOutros ? casaNum : isAmbiguo ? casaNum : `${casaTipo === "ap" ? "ap" : "casa"} ${casaNum}`;
        doc.text(casaLabel, casaX, y + 6.2);

        // Aviso ambíguo (texto à direita)
        if (isAmbiguo) {
          const avisoTxt = "! conjunto ou casa?";
          doc.setFontSize(6.5);
          doc.setFont("helvetica", "italic");
          doc.setTextColor(160, 80, 0);
          doc.text(avisoTxt, MARGEM + LARGURA - 3, y + 6.2, { align: "right" });
        }

        // Badge múltiplos pacotes
        if (qtd > 1) {
          const alertaTxt = `${qtd} pacotes`;
          const alertaW   = doc.getTextWidth(alertaTxt) + 10;
          const alertaX   = MARGEM + LARGURA - alertaW - 2;
          doc.setFillColor(...C.alertaBg);
          doc.roundedRect(alertaX, y + 1.8, alertaW, 5.5, 1.5, 1.5, "F");
          doc.setDrawColor(...C.alertaBd);
          doc.setLineWidth(0.5);
          doc.roundedRect(alertaX, y + 1.8, alertaW, 5.5, 1.5, 1.5, "S");
          const triX = alertaX + 3;
          const triY = y + 4.5;
          doc.setFillColor(...C.alertaTx);
          doc.triangle(triX, triY + 1.5, triX + 1.5, triY - 1, triX + 3, triY + 1.5, "F");
          doc.setFontSize(7.5);
          doc.setFont("helvetica", "bold");
          doc.setTextColor(...C.alertaTx);
          doc.text(alertaTxt, alertaX + alertaW / 2 + 1.5, y + 5.8, { align: "center" });
        }

        y += LINHA_H;
        linhaIdx++;
      }
    }

    y += 4;
  }

  _rodape();
  doc.save(`${nomeArquivo.replace(/\.[^.]+$/, "") || "rota"}_organizado.pdf`);
}

// ─── HELPERS ──────────────────────────────────────────────────────────────────

export function contarDuplicatas(numeros) {
  const mapa = new Map();
  for (const n of numeros) {
    const item = (n && typeof n === "object") ? n : { numero: n, tipo: "casa", enderecoCompleto: null };
    const chave = `${item.tipo}|${item.numero}`;
    if (mapa.has(chave)) {
      mapa.get(chave).qtd++;
    } else {
      mapa.set(chave, { casa: item, qtd: 1 });
    }
  }
  return [...mapa.values()]
    .sort((a, b) => {
      const na = parseInt(a.casa.numero), nb = parseInt(b.casa.numero);
      if (!isNaN(na) && !isNaN(nb)) return na - nb;
      return String(a.casa.numero).localeCompare(String(b.casa.numero));
    });
}