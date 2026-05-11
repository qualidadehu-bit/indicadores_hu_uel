# Gestão à Vista — Indicadores HU UEL

Frontend em **React + Vite** que fala com um **Cloudflare Worker**, que por sua vez chama o **Google Apps Script** (planilha no Google Sheets).

## Pré-requisitos

- Node.js LTS
- Conta Cloudflare (para publicar o Worker)
- Projeto Google Apps Script implantado como **aplicativo da Web**, ligado à planilha (ver `gas/Code.gs`)

## Configuração

1. Copie `.env.example` para `.env` ou `.env.local` e defina:

   ```bash
   VITE_WORKER_URL=http://127.0.0.1:8787
   ```

   Se `VITE_WORKER_URL` estiver vazio, o frontend usa **`http://127.0.0.1:8787`**. Opcional: `VITE_GAS_SECRET` (só debug local — envia `X-GAS-Secret`; exposto no browser; prefira `GAS_SECRET` no Worker).

   Em produção, use a URL pública do Worker (ex.: `https://dashboardhu.qualidade-hu.workers.dev`, conforme o `name` em `wrangler.toml`).

2. Worker — copie **`.dev.vars.example`** para **`.dev.vars`** na **raiz** do projeto (ao lado de `wrangler.toml`) e preencha:

   - `GAS_WEBAPP_URL` — URL `/exec` do Web App do Apps Script  
   - `GAS_SECRET` — mesmo valor da propriedade `API_SECRET` configurada no script (`gas/Code.gs`)

## Comandos

| Comando | Descrição |
|--------|-----------|
| `npm install` | Instala dependências |
| `npm run dev` | Frontend Vite (desenvolvimento) |
| `npm run build` | Build de produção |
| `npm run preview` | Preview do build |
| `npm run worker:dev` | Worker local (Wrangler) |
| `npm run worker:deploy` | Publica o Worker na Cloudflare |
| `npm run cf:dev` | Alias do `worker:dev` (mesmo Wrangler) |
| `npm run cf:deploy` | Alias do `worker:deploy` |

**Stack completa em desenvolvimento local:** use **dois terminais** — não há script `dev:full` para não adicionar dependências só para paralelismo; em um terminal rode `npm run cf:dev` (ou `worker:dev`), em outro `npm run dev`. No `.env`, `VITE_WORKER_URL` deve ser a URL/porta que o Wrangler mostrar (ex.: `http://127.0.0.1:8787` ou `:8788` se a 8787 estiver ocupada).

Fluxo alternativo: só `npm run dev` com `VITE_WORKER_URL` apontando para o Worker já publicado na Cloudflare (`*.workers.dev`).

### Erro: `Worker misconfigured: GAS_WEBAPP_URL missing, or GAS_SECRET missing`

O Worker **`dashboardhu`** (nome em `wrangler.toml`) precisa das duas variáveis no **mesmo** deploy que você está chamando:

| Onde | O quê |
|------|--------|
| **Cloudflare** → Workers → **dashboardhu** → Settings → Variables and Secrets | **`GAS_WEBAPP_URL`** (texto) = URL `/exec` do Web App (pode estar também em `[vars]` no `wrangler.toml`) |
| **Mesmo lugar** | **`GAS_SECRET`** (tipo *Secret*) = mesmo valor que **`API_SECRET`** no Apps Script |

Se você tirou **`VITE_GAS_SECRET`** do `.env` para evitar CORS, o navegador **não** manda mais `X-GAS-Secret` — aí o **`GAS_SECRET` obrigatoriamente** tem que existir na Cloudflare (não basta estar só em **`.dev.vars`** na raiz para deploy local).

Variáveis em outro Worker (nome diferente de **`dashboardhu`**) **não** entram neste deploy.

## Estrutura útil

- `src/` — aplicativo React  
- `src/api/apiClient.js` — chamadas `POST /api` ao Worker  
- `worker/` — código do Worker (`worker/src/index.ts`) · config **`wrangler.toml`** na raiz  
- `gas/Code.gs` — código de referência do Apps Script (CRUD nas abas + `autenticar`)

## Imagens da Landing (`public/images/`)

Os arquivos atuais são **SVGs de placeholder**:

- `public/images/hu-cover.svg` — área principal (“foto” do hospital)  
- `public/images/assinatura.svg` — logo no canto superior direito  

Para usar fotos reais, coloque por exemplo `hu.jpg` e `assinatura.png` nesta pasta e atualize em `src/pages/Landing.jsx` os caminhos (`/images/hu.jpg`, `/images/assinatura.png`).
