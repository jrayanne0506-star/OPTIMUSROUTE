/**
 * app.js — Maestro do sistema Rotas DF
 *
 * Responsabilidades:
 *  1. Receber o arquivo (PDF ou TXT) via drag-and-drop ou input
 *  2. Extrair o texto bruto (PDF.js para PDF, FileReader para TXT)
 *  3. Chamar parser.js para normalizar e agrupar os endereços
 *  4. Renderizar o resultado na tela com drag-and-drop para reordenar quadras
 *  5. Coordenar exportação PDF/TXT via exporter.js
 *
 * ORDEM DAS QUADRAS
 * =================
 * Ao carregar, a ordem das quadras é a de aparecimento no arquivo da Shopee.
 * O usuário pode arrastar os blocos de quadra para reordenar conforme a rota
 * real do entregador. A ordem atual é sempre usada na exportação.
 *
 * ORDEM INTERNA (sublocalidades)
 * ==============================
 * Dentro de cada quadra: Bl A, Bl B... Cj A, Cj B... (alfabética, Bl antes de Cj)
 * Isso é feito pelo parser e não muda.
 */

import { parseRouteText, contarPacotes, resumoPorQuadra, reordenarQuadras } from "./parser.js";
import { exportarPDF, exportarTXT, contarDuplicatas } from "./exporter.js";

// ─── ESTADO GLOBAL ────────────────────────────────────────────────────────────
let dadosAgrupados = null;  // objeto com a ordem atual das quadras
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
    let textoRaw = "";
    if (file.type === "application/pdf" || file.name.endsWith(".pdf")) {
      textoRaw = await extrairTextoPDF(file);
    } else if (file.name.endsWith(".txt") || file.name.endsWith(".csv")) {
      textoRaw = await lerTXT(file);
    } else {
      mostrarErro("Formato não suportado. Use PDF ou TXT.");
      return;
    }

    dadosAgrupados = parseRouteText(textoRaw);
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
  const resumoEl        = document.getElementById("resumo");
  const quadrasContainer = document.getElementById("quadras");
  const ordemInfo       = document.getElementById("ordem-info");

  const resumo = resumoPorQuadra(agrupado);
  const totalQuadras = Object.keys(agrupado).filter((k) => k !== "_OUTROS").length;

  // ── Resumo de topo ──
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
          ${q === "_OUTROS" ? "Outros" : q} <strong>${n}</strong>
        </span>`).join("")}
    </div>
  `;

  // ── Info drag ──
  ordemInfo.style.display = "flex";

  // ── Blocos de quadra ──
  quadrasContainer.innerHTML = "";

  for (const [quadra, sublocs] of Object.entries(agrupado)) {
    quadrasContainer.appendChild(criarBlocoQuadra(quadra, sublocs));
  }

  // Ativa drag-and-drop nas quadras
  ativarDragQuadras(quadrasContainer);

  // Mostra seção
  document.getElementById("secao-upload").classList.add("compacto");
  document.getElementById("resultado").style.display = "block";
  document.getElementById("resultado").scrollIntoView({ behavior: "smooth", block: "start" });
}

// ─── CRIAÇÃO DE BLOCO DE QUADRA ───────────────────────────────────────────────
function criarBlocoQuadra(quadra, sublocs) {
  const isOutros = quadra === "_OUTROS";
  const totalQ   = Object.values(sublocs).reduce((s, a) => s + a.length, 0);

  const bloco = document.createElement("div");
  bloco.className  = `quadra-bloco ${isOutros ? "quadra-outros" : ""}`;
  bloco.dataset.quadra = quadra;
  if (!isOutros) bloco.draggable = true;

  // Header
  const header = document.createElement("div");
  header.className = "quadra-header";
  header.innerHTML = `
    ${!isOutros ? '<span class="drag-handle" title="Arrastar para reordenar">⠿</span>' : ""}
    <span class="quadra-nome">${isOutros ? "📍 Outros endereços" : quadra}</span>
    <span class="quadra-total">${totalQ} pacote${totalQ > 1 ? "s" : ""}</span>
  `;
  bloco.appendChild(header);

  // Linhas de sublocal — já chegam ordenadas do parser (Bl A→Z, Cj A→Z)
  for (const [sublocal, numeros] of Object.entries(sublocs)) {
    const contagem  = contarDuplicatas(numeros);
    const temMulti  = Object.values(contagem).some((v) => v > 1);

    const linha = document.createElement("div");
    linha.className = "sublocal-linha";

    const badge = document.createElement("span");
    badge.className = `sublocal-badge ${sublocal.startsWith("Bl") ? "badge-bloco" : sublocal.startsWith("Cj") ? "badge-conjunto" : "badge-sem"}`;
    badge.textContent = sublocal.toUpperCase();
    linha.appendChild(badge);

    const chips = document.createElement("div");
    chips.className = "chips-container";

    for (const [num, qtd] of Object.entries(contagem)) {
      const chip = document.createElement("span");
      chip.className = `chip-numero ${qtd > 1 ? "chip-multi" : ""}`;
      if (qtd > 1) {
        chip.innerHTML = `${num} <strong class="chip-qtd">×${qtd}</strong>`;
        chip.title = `${qtd} pacotes no número ${num}`;
      } else {
        chip.textContent = num;
      }
      chips.appendChild(chip);
    }

    linha.appendChild(chips);
    bloco.appendChild(linha);
  }

  return bloco;
}

// ─── DRAG AND DROP DE QUADRAS ─────────────────────────────────────────────────
/**
 * Permite arrastar os blocos de quadra para definir a ordem real da rota.
 * Ao soltar, atualiza dadosAgrupados com a nova ordem.
 * Essa ordem é usada na exportação PDF/TXT.
 */
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

    // Atualiza dadosAgrupados com a nova ordem visual
    sincronizarOrdem(container);
  });

  container.addEventListener("dragover", (e) => {
    e.preventDefault();
    const alvo = e.target.closest(".quadra-bloco");
    if (!alvo || alvo === arrastando || alvo.dataset.quadra === "_OUTROS") return;

    document.querySelectorAll(".quadra-bloco").forEach((b) => b.classList.remove("drag-over-bloco"));
    alvo.classList.add("drag-over-bloco");

    const rect    = alvo.getBoundingClientRect();
    const meio    = rect.top + rect.height / 2;
    const depois  = e.clientY > meio;

    if (depois) {
      alvo.after(arrastando);
    } else {
      alvo.before(arrastando);
    }
  });
}

/**
 * Lê a ordem visual atual dos blocos e atualiza dadosAgrupados.
 */
function sincronizarOrdem(container) {
  const novaOrdem = [...container.querySelectorAll(".quadra-bloco")]
    .map((b) => b.dataset.quadra);

  dadosAgrupados = reordenarQuadras(dadosAgrupados, novaOrdem);

  // Atualiza os chips de resumo na ordem correta
  const resumo = resumoPorQuadra(dadosAgrupados);
  const chipsEl = document.querySelector(".resumo-chips");
  if (chipsEl) {
    chipsEl.innerHTML = Object.entries(resumo).map(([q, n]) => `
      <span class="resumo-chip ${q === "_OUTROS" ? "chip-outros" : ""}" title="${n} pacotes em ${q}">
        ${q === "_OUTROS" ? "Outros" : q} <strong>${n}</strong>
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
    const btn = document.getElementById("btn-copiar");
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
