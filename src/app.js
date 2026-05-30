/**
 * app.js — Maestro do sistema Rotas DF
 * Com suporte a touch (mobile) para drag-and-drop de quadras.
 */

import { parseRouteText, contarPacotes, resumoPorQuadra, reordenarQuadras } from "./parser.js";
import { exportarPDF, exportarTXT, contarDuplicatas } from "./exporter.js";
import { parseExcel } from "./excel-parser.js";

// ─── ESTADO GLOBAL ────────────────────────────────────────────────────────────
let dadosAgrupados = null;
let nomeArquivoAtual = "";

// ─── INICIALIZAÇÃO ────────────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
  configurarDropZone();
  configurarBotoes();
});

// ─── DRAG & DROP UPLOAD ───────────────────────────────────────────────────────
function configurarDropZone() {
  const dropZone  = document.getElementById("drop-zone");
  const fileInput = document.getElementById("file-input");

  dropZone.addEventListener("click", () => fileInput.click());
  fileInput.addEventListener("change", (e) => {
    if (e.target.files[0]) processarArquivo(e.target.files[0]);
  });

  dropZone.addEventListener("dragover", (e) => {
    e.preventDefault();
    dropZone.classList.add("drag-over");
  });
  dropZone.addEventListener("dragleave", () => dropZone.classList.remove("drag-over"));
  dropZone.addEventListener("drop", (e) => {
    e.preventDefault();
    dropZone.classList.remove("drag-over");
    if (e.dataTransfer.files[0]) processarArquivo(e.dataTransfer.files[0]);
  });
}

// ─── PROCESSAMENTO DO ARQUIVO ─────────────────────────────────────────────────
async function processarArquivo(file) {
  nomeArquivoAtual = file.name;
  mostrarCarregando(true);
  esconderResultado();

  try {
    let dadosParseados = null;

    if (file.name.endsWith(".pdf")) {
      const textoRaw = await extrairTextoPDF(file);
      dadosParseados = parseRouteText(textoRaw);
    } else if (file.name.endsWith(".txt") || file.name.endsWith(".csv")) {
      const textoRaw = await lerTXT(file);
      dadosParseados = parseRouteText(textoRaw);
    } else if (file.name.endsWith(".xlsx")) {
      const buffer = await file.arrayBuffer();
      dadosParseados = parseExcel(buffer);
    } else {
      mostrarErro("Formato não suportado. Use PDF, TXT ou XLSX.");
      return;
    }

    dadosAgrupados = dadosParseados;
    const total = contarPacotes(dadosAgrupados);

    if (total === 0) {
      mostrarErro("Nenhum endereço encontrado. Verifique se o arquivo é uma rota da Shopee.");
      return;
    }

    renderizarResultado(dadosAgrupados, total);
  } catch (err) {
    console.error(err);
    mostrarErro("Erro ao processar o arquivo: " + err.message);
  } finally {
    mostrarCarregando(false);
  }
}

// ─── EXTRAÇÃO DE TEXTO DO PDF ─────────────────────────────────────────────────
async function extrairTextoPDF(file) {
  const pdfjsLib = window["pdfjs-dist/build/pdf"];
  pdfjsLib.GlobalWorkerOptions.workerSrc =
    "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const linhas = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    const page    = await pdf.getPage(i);
    const content = await page.getTextContent();

    const itens = content.items
      .filter((item) => item.str.trim())
      .sort((a, b) => {
        const yDiff = b.transform[5] - a.transform[5];
        if (Math.abs(yDiff) > 3) return yDiff;
        return a.transform[4] - b.transform[4];
      });

    let linhaAtual = "";
    let yAtual = null;

    for (const item of itens) {
      const y = Math.round(item.transform[5]);
      if (yAtual === null) yAtual = y;
      if (Math.abs(y - yAtual) > 5) {
        if (linhaAtual.trim()) linhas.push(linhaAtual.trim());
        linhaAtual = item.str;
        yAtual = y;
      } else {
        linhaAtual += " " + item.str;
      }
    }
    if (linhaAtual.trim()) linhas.push(linhaAtual.trim());
  }

  return linhas.join("\n");
}

// ─── LEITURA DE TXT ───────────────────────────────────────────────────────────
function lerTXT(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = (e) => resolve(e.target.result);
    reader.onerror = () => reject(new Error("Erro ao ler o arquivo TXT"));
    reader.readAsText(file, "UTF-8");
  });
}

// ─── RENDERIZAÇÃO PRINCIPAL ───────────────────────────────────────────────────
function renderizarResultado(agrupado, totalPacotes) {
  const resumoEl         = document.getElementById("resumo");
  const quadrasContainer = document.getElementById("quadras");
  const ordemInfo        = document.getElementById("ordem-info");

  const resumo = resumoPorQuadra(agrupado);
  const quadrasReais = Object.keys(agrupado).filter((k) => k !== "_OUTROS");
  const totalQuadras = quadrasReais.length;

  resumoEl.innerHTML = `
    <div class="resumo-stats">
      <div class="stat">
        <span class="stat-num">${totalPacotes}</span>
        <span class="stat-label">pacotes</span>
      </div>
      <div class="stat-sep">·</div>
      <div class="stat">
        <span class="stat-num">${totalQuadras}</span>
        <span class="stat-label">quadras</span>
      </div>
      <div class="stat-sep">·</div>
      <div class="stat">
        <span class="stat-num" style="font-size:13px">${nomeArquivoAtual}</span>
      </div>
    </div>
    <div class="resumo-chips">
      ${Object.entries(resumo).map(([q, n]) => `
        <span class="resumo-chip ${q === "_OUTROS" ? "chip-outros" : ""}" title="${n} pacotes em ${q}">
          ${q === "_OUTROS" ? "⚠ Outros endereços" : q} <strong>${n}</strong>
        </span>`).join("")}
    </div>
  `;

  ordemInfo.style.display = "flex";
  quadrasContainer.innerHTML = "";

  let rotaIdx = 1;
  for (const [quadra, sublocs] of Object.entries(agrupado)) {
    const isOutros = quadra === "_OUTROS";
    const numRota  = isOutros ? null : rotaIdx++;
    quadrasContainer.appendChild(criarBlocoQuadra(quadra, sublocs, numRota));
  }

  ativarDragQuadras(quadrasContainer);

  document.getElementById("secao-upload").classList.add("compacto");
  document.getElementById("resultado").style.display = "block";
  document.getElementById("resultado").scrollIntoView({ behavior: "smooth", block: "start" });
}

// ─── HELPERS DE ITEM ─────────────────────────────────────────────────────────

// Normaliza item do array: agora sempre é objeto { numero, tipo, enderecoCompleto }
function resolverItem(item) {
  if (item && typeof item === "object") {
    return {
      numero: item.numero,
      tipo: item.tipo || "casa",
      enderecoCompleto: item.enderecoCompleto || null,
    };
  }
  // fallback para strings legadas
  return { numero: item, tipo: "casa", enderecoCompleto: null };
}

// ─── CRIAÇÃO DE BLOCO DE QUADRA ───────────────────────────────────────────────
function criarBlocoQuadra(quadra, sublocs, numRota) {
  const isOutros = quadra === "_OUTROS";
  const totalQ   = Object.values(sublocs).reduce((s, a) => s + a.length, 0);

  const bloco = document.createElement("div");
  bloco.className      = `quadra-bloco ${isOutros ? "quadra-outros" : ""}`;
  bloco.dataset.quadra = quadra;
  if (!isOutros) bloco.draggable = true;

  const header = document.createElement("div");
  header.className = "quadra-header";

  const rotaBadgeHTML = !isOutros
    ? `<span class="rota-badge">Rota ${numRota}</span>`
    : "";

  const tituloHTML = isOutros
    ? `<span class="quadra-nome quadra-nome-outros">⚠ Outros endereços <span class="outros-info">endereços fora do padrão reconhecido</span></span>`
    : `<span class="quadra-nome">${quadra}</span>`;

  header.innerHTML = `
    ${!isOutros ? '<span class="drag-handle" title="Arrastar para reordenar">⠿</span>' : ""}
    ${rotaBadgeHTML}
    ${tituloHTML}
    <span class="quadra-total">${totalQ} pacote${totalQ > 1 ? "s" : ""}</span>
  `;
  bloco.appendChild(header);

  for (const [sublocal, numeros] of Object.entries(sublocs)) {
    const isAmbiguo = sublocal === "_ambiguo";

    for (const { casa, qtd } of contarDuplicatas(numeros)) {
      const { numero, tipo, enderecoCompleto } = resolverItem(casa);

      const linha = document.createElement("div");
      linha.className = "sublocal-linha" + (isAmbiguo ? " linha-ambigua" : "");

      // Badge do sublocal
      const badge = document.createElement("span");
      const badgeClass = sublocal.startsWith("Bl")
        ? "badge-bloco"
        : sublocal.startsWith("Cj")
        ? "badge-conjunto"
        : isAmbiguo
        ? "badge-ambiguo"
        : "badge-sem";
      badge.className   = `sublocal-badge ${badgeClass}`;
      badge.textContent = isAmbiguo ? "?" : sublocal === "Sem sublocal" ? "—" : sublocal.toUpperCase();

      // Seta
      const seta = document.createElement("span");
      seta.className   = "seta-casa";
      seta.textContent = "→";

      // Número / label da unidade
      const casaSpan = document.createElement("span");
      casaSpan.className = "casa-numero";

      if (isOutros) {
        casaSpan.textContent = numero;
      } else if (isAmbiguo) {
        casaSpan.textContent = numero;
      } else if (numero === "S/N") {
        casaSpan.textContent = "S/N";
      } else {
        // Usa o tipo que vem diretamente do parser
        casaSpan.textContent = `${tipo === "ap" ? "ap" : "casa"} ${numero}`;
      }

      linha.appendChild(badge);
      linha.appendChild(seta);
      linha.appendChild(casaSpan);

      // Linha extra com endereço completo para S/N
      if (numero === "S/N" && enderecoCompleto) {
        const enderecoSpan = document.createElement("span");
        enderecoSpan.className   = "endereco-completo";
        enderecoSpan.textContent = enderecoCompleto;
        linha.appendChild(enderecoSpan);
      }

      // Tag de ambíguo
      if (isAmbiguo) {
        const tag = document.createElement("span");
        tag.className   = "tag-ambiguo";
        tag.textContent = "⚠ conjunto ou casa?";
        linha.appendChild(tag);
      }

      // Alerta de múltiplos pacotes
      if (qtd > 1) {
        const alerta = document.createElement("span");
        alerta.className   = "alerta-pacotes";
        alerta.textContent = `⚠️ ${qtd} pacotes`;
        linha.appendChild(alerta);
      }

      bloco.appendChild(linha);
    }
  }

  return bloco;
}

// ─── DRAG AND DROP DE QUADRAS (mouse + touch) ─────────────────────────────────
function ativarDragQuadras(container) {
  let arrastando = null;

  container.addEventListener("dragstart", (e) => {
    arrastando = e.target.closest(".quadra-bloco");
    if (!arrastando) return;
    arrastando.classList.add("dragging");
    e.dataTransfer.effectAllowed = "move";
  });

  container.addEventListener("dragend", () => {
    if (arrastando) {
      arrastando.classList.remove("dragging");
      arrastando = null;
    }
    document.querySelectorAll(".quadra-bloco").forEach((b) => b.classList.remove("drag-over-bloco"));
    sincronizarOrdem(container);
  });

  container.addEventListener("dragover", (e) => {
    e.preventDefault();
    const alvo = e.target.closest(".quadra-bloco");
    if (!alvo || alvo === arrastando || alvo.dataset.quadra === "_OUTROS") return;
    document.querySelectorAll(".quadra-bloco").forEach((b) => b.classList.remove("drag-over-bloco"));
    alvo.classList.add("drag-over-bloco");
    const rect = alvo.getBoundingClientRect();
    if (e.clientY > rect.top + rect.height / 2) alvo.after(arrastando);
    else alvo.before(arrastando);
  });

  // Touch
  let touchClone = null, touchOffsetX = 0, touchOffsetY = 0;

  container.addEventListener("touchstart", (e) => {
    const handle = e.target.closest(".drag-handle");
    if (!handle) return;
    arrastando = handle.closest(".quadra-bloco");
    if (!arrastando || arrastando.dataset.quadra === "_OUTROS") return;
    const touch = e.touches[0];
    const rect  = arrastando.getBoundingClientRect();
    touchOffsetX = touch.clientX - rect.left;
    touchOffsetY = touch.clientY - rect.top;
    touchClone = arrastando.cloneNode(true);
    touchClone.style.cssText = `position:fixed;left:${rect.left}px;top:${rect.top}px;width:${rect.width}px;opacity:0.85;pointer-events:none;z-index:9999;box-shadow:0 8px 24px rgba(0,0,0,0.4);border-radius:10px;transition:none;`;
    document.body.appendChild(touchClone);
    arrastando.classList.add("dragging");
    e.preventDefault();
  }, { passive: false });

  container.addEventListener("touchmove", (e) => {
    if (!arrastando || !touchClone) return;
    e.preventDefault();
    const touch = e.touches[0];
    touchClone.style.left = `${touch.clientX - touchOffsetX}px`;
    touchClone.style.top  = `${touch.clientY - touchOffsetY}px`;
    touchClone.style.display = "none";
    const elAbaixo = document.elementFromPoint(touch.clientX, touch.clientY);
    touchClone.style.display = "";
    const alvo = elAbaixo?.closest(".quadra-bloco");
    if (!alvo || alvo === arrastando || alvo.dataset.quadra === "_OUTROS") return;
    document.querySelectorAll(".quadra-bloco").forEach((b) => b.classList.remove("drag-over-bloco"));
    alvo.classList.add("drag-over-bloco");
    const rect = alvo.getBoundingClientRect();
    if (touch.clientY > rect.top + rect.height / 2) alvo.after(arrastando);
    else alvo.before(arrastando);
  }, { passive: false });

  const finalizarTouch = () => {
    if (!arrastando) return;
    arrastando.classList.remove("dragging");
    document.querySelectorAll(".quadra-bloco").forEach((b) => b.classList.remove("drag-over-bloco"));
    if (touchClone) { touchClone.remove(); touchClone = null; }
    sincronizarOrdem(container);
    arrastando = null;
  };

  container.addEventListener("touchend",    finalizarTouch);
  container.addEventListener("touchcancel", finalizarTouch);
}

// ─── SINCRONIZAR ORDEM E RENUMERAR ROTAS ─────────────────────────────────────
function sincronizarOrdem(container) {
  const novaOrdem = [...container.querySelectorAll(".quadra-bloco")].map((b) => b.dataset.quadra);
  dadosAgrupados = reordenarQuadras(dadosAgrupados, novaOrdem);

  let rotaIdx = 1;
  container.querySelectorAll(".quadra-bloco").forEach((bloco) => {
    const badge = bloco.querySelector(".rota-badge");
    if (badge) badge.textContent = `Rota ${rotaIdx++}`;
  });

  const resumo  = resumoPorQuadra(dadosAgrupados);
  const chipsEl = document.querySelector(".resumo-chips");
  if (chipsEl) {
    chipsEl.innerHTML = Object.entries(resumo).map(([q, n]) => `
      <span class="resumo-chip ${q === "_OUTROS" ? "chip-outros" : ""}" title="${n} pacotes em ${q}">
        ${q === "_OUTROS" ? "⚠ Outros endereços" : q} <strong>${n}</strong>
      </span>`).join("");
  }
}

// ─── BOTÕES DE AÇÃO ───────────────────────────────────────────────────────────
function configurarBotoes() {
  document.getElementById("btn-pdf").addEventListener("click", () => {
    if (!dadosAgrupados) return;
    try { exportarPDF(dadosAgrupados, nomeArquivoAtual); }
    catch (e) { mostrarErro("Erro ao gerar PDF: " + e.message); }
  });

  document.getElementById("btn-txt").addEventListener("click", () => {
    if (!dadosAgrupados) return;
    const texto = exportarTXT(dadosAgrupados, nomeArquivoAtual);
    const blob  = new Blob([texto], { type: "text/plain;charset=utf-8" });
    const url   = URL.createObjectURL(blob);
    const a     = document.createElement("a");
    a.href = url;
    a.download = `${nomeArquivoAtual.replace(/\.[^.]+$/, "")}_organizado.txt`;
    a.click();
    URL.revokeObjectURL(url);
  });

  document.getElementById("btn-copiar").addEventListener("click", async () => {
    if (!dadosAgrupados) return;
    const texto = exportarTXT(dadosAgrupados, nomeArquivoAtual);
    await navigator.clipboard.writeText(texto);
    const btn  = document.getElementById("btn-copiar");
    const orig = btn.innerHTML;
    btn.innerHTML = "✓ Copiado!";
    btn.classList.add("btn-sucesso");
    setTimeout(() => { btn.innerHTML = orig; btn.classList.remove("btn-sucesso"); }, 2000);
  });

  document.getElementById("btn-novo").addEventListener("click", () => {
    dadosAgrupados = null;
    nomeArquivoAtual = "";
    esconderResultado();
    document.getElementById("secao-upload").classList.remove("compacto");
    document.getElementById("file-input").value = "";
  });
}

// ─── UTILITÁRIOS DE UI ────────────────────────────────────────────────────────
function mostrarCarregando(show) {
  document.getElementById("loading").style.display = show ? "flex" : "none";
}
function esconderResultado() {
  document.getElementById("resultado").style.display = "none";
  document.getElementById("ordem-info").style.display = "none";
}
function mostrarErro(msg) {
  const el = document.getElementById("erro");
  el.textContent = msg;
  el.style.display = "block";
  setTimeout(() => (el.style.display = "none"), 5000);
}