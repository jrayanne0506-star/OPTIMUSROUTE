# 📦 Rotas DF — Organizador de Entregas

Transforma o PDF de rota exportado do app da Shopee em um PDF limpo e organizado por quadra, com contagem de múltiplos pacotes no mesmo endereço.

---

## 🚀 Como rodar localmente (VS Code)

```bash
# 1. Clone o repositório
git clone https://github.com/SEU_USUARIO/rotas-df.git
cd rotas-df

# 2. Instale o servidor local (só precisa fazer uma vez)
npm install

# 3. Inicie
npm run dev
# Acesse: http://localhost:3000
```

> **Importante:** o projeto usa ES Modules (`import/export`), então precisa rodar via servidor HTTP — não abre direto como arquivo `file://`.

---

## 📁 Estrutura do projeto

```
rotas-df/
├── index.html          ← Interface principal (HTML + CSS)
├── src/
│   ├── app.js          ← Maestro: conecta UI ↔ parser ↔ exporter
│   ├── parser.js       ← Extrai e agrupa endereços do texto bruto
│   └── exporter.js     ← Gera PDF e TXT de saída
├── package.json
├── vercel.json         ← Config de deploy na Vercel
└── .gitignore
```

---

## 🔄 Fluxo completo

```
PDF/TXT da Shopee
      ↓
  app.js recebe o arquivo
      ↓
  PDF.js extrai texto bruto linha por linha
      ↓
  parser.js normaliza cada linha:
    - Remove prefixos numéricos da Shopee ("14 8 Quadra...")
    - Detecta padrão de quadra (QNL, QNM, EQNM, QNJ, CNL...)
    - Detecta bloco ("Bl B") ou conjunto ("Cj J")
    - Pega o número após a primeira vírgula
    - Endereços fora do padrão → seção "Outros" (não somem)
    - Duplicatas = múltiplos pacotes (Array, não Set)
      ↓
  Objeto agrupado:
  {
    "QNL 12": {
      "Bl B": ["316", "106", "214", "321", "321", "322"],
      "Cj B": ["4", "11"]
    },
    "QNL 8": { ... },
    "_OUTROS": { ... }
  }
      ↓
  app.js renderiza na tela (chips coloridos)
      ↓
  exporter.js gera PDF ou TXT
```

---

## 📋 Lógica do parser (parser.js)

### Formato de entrada (Shopee)
O PDF da Shopee tem 3 colunas: `Sequence | Stop | Destination Address`

Exemplos de endereços reais:
```
- - Quadra EQNM 34/36 Bloco C, 02
14 8 Qnl 10 conjunto f lote 18, 18, A cima da sorveteria ap 101
7 4 Qnl 8 Cj i Cs 2 Cs Lateral Casa Dos Fundos, 2, PORTAO CINZA TOTALMENTE FECHADO
45 24 Av.Samdu Norte- Lt 02, Ap101, Residencial Juvelina Brito
```

### Padrões reconhecidos
| Quadra | Exemplo | Resultado |
|--------|---------|-----------|
| `QNL N` | `QNL 12`, `Quadra QNL 12`, `Qnl 12` | `QNL 12` |
| `QNM N` | `QNM 5` | `QNM 5` |
| `EQNM N/N` | `EQNM 34/36` | `EQNM 34/36` |
| `EQNL N/N` | `EQNL 10/12` | `EQNL 10/12` |
| `QNJ N` | `QNJ 31` | `QNJ 31` |
| `CNL` | `CNL` | `CNL` |

| Sublocal | Variações aceitas | Resultado |
|----------|------------------|-----------|
| Bloco | `Bloco B`, `Bl B`, `Bl. B` | `Bl B` |
| Conjunto | `Conjunto J`, `Conj J`, `Cj J` | `Cj J` |

### Múltiplos pacotes
O parser usa **Array** (não Set), então duplicatas são preservadas.

```
"Bl D": ["15", "15", "15", "15"]
→ exibe como: 15 ×4
```

Isso garante que o entregador saiba que precisa levar **4 volumes** para o mesmo endereço.

### Endereços que não batem com o padrão DF
Vão para a seção `_OUTROS` na tela e no PDF — **nenhum endereço é descartado**.

---

## 🚢 Deploy na Vercel

```bash
# 1. Suba o código no GitHub
git init
git add .
git commit -m "feat: rotas df v1"
git remote add origin https://github.com/SEU_USUARIO/rotas-df.git
git push -u origin main

# 2. Na Vercel
# → New Project → Import Git Repository → seleciona o repo
# → Framework: Other (Static)
# → Deploy
```

O `vercel.json` já está configurado para servir arquivos estáticos.

---

## 📄 PDF de saída

O PDF gerado tem:
- Cabeçalho com nome do arquivo, total de pacotes, total de quadras e data
- Cada quadra em bloco com cor azul
- Sublocalidades (Bl / Cj) com badge colorido
- Chips de número — **amarelo com ×N quando há múltiplos pacotes**
- Seção "Outros" ao final para endereços atípicos
- Quebra de página automática

---

## 🛠 Dependências (via CDN — sem build)

| Lib | Versão | Uso |
|-----|--------|-----|
| PDF.js | 3.11.174 | Extrair texto do PDF da Shopee |
| jsPDF | 2.5.1 | Gerar o PDF de saída |

Nenhuma outra dependência. Nenhum bundler necessário.
