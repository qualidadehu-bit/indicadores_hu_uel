# Gestão à Vista — Indicadores HU UEL

Frontend em **React + Vite** que fala com um **Cloudflare Worker**, que por sua vez chama o **Google Apps Script** (planilha no Google Sheets).

## Pré-requisitos

- Node.js LTS
- Conta Cloudflare (para publicar o Worker)
- Projeto Google Apps Script implantado como **aplicativo da Web**, ligado à planilha (ver `gas/Code.gs`)

## Configuração

1. Copie `.env.example` para `.env` ou `.env.local` e defina:

   ```bash
   VITE_WORKER_URL=http://localhost:8787
   ```

   Em produção, use a URL pública do Worker (por exemplo `https://indicadores-hu-api.<subdomain>.workers.dev`).

2. Worker — copie `worker/.dev.vars.example` para `worker/.dev.vars` e preencha:

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

## Estrutura útil

- `src/` — aplicativo React  
- `src/api/apiClient.js` — chamadas `POST /api` ao Worker  
- `worker/` — proxy CORS + segredo para o GAS (`worker/wrangler.toml`)  
- `gas/Code.gs` — código de referência do Apps Script (CRUD nas abas + `autenticar`)

## Imagens da Landing (`public/images/`)

Os arquivos atuais são **SVGs de placeholder**:

- `public/images/hu-cover.svg` — área principal (“foto” do hospital)  
- `public/images/assinatura.svg` — logo no canto superior direito  

Para usar fotos reais, coloque por exemplo `hu.jpg` e `assinatura.png` nesta pasta e atualize em `src/pages/Landing.jsx` os caminhos (`/images/hu.jpg`, `/images/assinatura.png`).
