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

## Google Sheets — gráficos genéricos e `grupo_radar`

- **`modulo.tipo_grafico`** (aba `modulo`, coluna `tipo_grafico`): no **bloco genérico** do dashboard (módulos que não usam cards especiais como MISP, Produção, IRAS, etc.), o frontend usa `linha`, `barra`, `area`, `pizza` ou `radar`. O valor **`mapa_calor`** (se existir na planilha) cai para **linha** nesse bloco, pois não há mapa de calor no Recharts aqui.
- **Radar genérico**: cada eixo é um **indicador**; o valor é o **lançamento do mês** visível no dashboard (`mes` / filtro) para o **setor selecionado**. Sem setor, aparece a mensagem pedindo para selecionar o setor.
- **`grupo_radar`** (aba `indicador`, coluna opcional): texto livre. Quando `tipo_grafico` do módulo é **`radar`**:
  - Dois ou mais indicadores do **mesmo módulo** com o **mesmo** `grupo_radar` (após trim, não vazio) entram num **único** `RadarChart` (eixos = rótulos dos indicadores).
  - Indicador sem `grupo_radar` ou com valor **único** no módulo continua com **radar próprio** (dois eixos mínimos: indicador + meta ou referência, para o desenho fechar).

Adicione a coluna `grupo_radar` na linha 1 da aba `indicador` se ainda não existir; o Apps Script lê cabeçalhos dinamicamente (`gas/Code.gs`).

### `grupo_serie`, `layout_modulo` e `layout_dashboard`

- **`grupo_serie`** (aba `indicador`, coluna opcional): texto livre. No **mesmo módulo**, com `tipo_grafico` em **linha**, **barra** ou **área**, dois ou mais indicadores com o **mesmo** `grupo_serie` (trim, não vazio) aparecem no **mesmo** gráfico Recharts (uma série por indicador, legenda com o nome). Com **`pizza`**, o mesmo `grupo_serie` ainda agrupa o bloco na UI, mas cada indicador recebe **o seu próprio** gráfico pizza (fatias = meses). Sem valor ou grupo com um só indicador → **um gráfico por indicador** (comportamento anterior).
- **`divisoes`** (aba `indicador`, coluna opcional): string com nomes de **divisão** iguais ao campo **`setor.divisao`**, separados por **`|`** ou **`;`** (espaços extras são ignorados; duplicatas são unificadas ao salvar na configuração). **Vazio ou ausente** = o indicador vale para **todas** as divisões. Se preenchido, o indicador só entra nas telas quando o **filtro de divisão** do dashboard (ou a **divisão do setor** selecionado em lançamento/comparação) coincidir com um dos nomes.

### Lista de indicadores por setor (`indicador_ids`)

- **`setor.indicador_ids`** (aba `setor`, coluna opcional na linha 1): ids da aba **`indicador`**, separados por **`|`** ou **`;`**. **Vazio ou coluna ausente** = o setor usa **todos** os indicadores já permitidos pela divisão (`divisoes` no indicador), escopo de gestor, etc. Com valor preenchido, aplica-se uma **lista branca**: só esses indicadores entram no dashboard, lançamento, exportação PDF, metas na configuração (setor escolhido no seletor de meta) e demais ecrãs com **um setor concreto** selecionado.
- Com **«Todos os setores»** no dashboard (ou equivalente sem setor), **não** se aplica esta lista por setor.
- Na **comparação por divisão**, um indicador entra na tabela se for permitido em **pelo menos um** setor da divisão (união das listas por setor).
- Edição em **Configuração → Divisões e Setores** ao criar ou editar setor (checkboxes). **Marcar todos** equivale a deixar o campo vazio na planilha.

- **`layout_modulo`** (aba `modulo`, coluna opcional): `padrao` (omissão) ou **`card_grafico`**. No bloco **genérico** do dashboard, `card_grafico` mostra um **resumo em card** (valor do mês + status/meta quando existir) **acima** do gráfico, por indicador ou por grupo `grupo_serie`. Não altera cards especiais (MISP, Produção, etc.).
- **`layout_dashboard`** (aba `modulo`, coluna opcional): `padrao` (omissão) ou **`bundle_kpi_tabela`**. Com `bundle_kpi_tabela`, o dashboard usa o painel **KPI + tabela 12 meses + gráfico** em vez do bloco genérico de gráficos. O módulo **Lesão por Pressão (LP)** continua usando esse painel mesmo sem a coluna (legado). Com setor selecionado, compara lançamentos com **meta por setor** (`meta` + `setor_id` + `ano`) onde existir meta cadastrada. Cards especiais (MISP, IRAS, Produção, Eventos Adversos, etc.) **não** são trocados por este campo.
- **`tipo_ui`** (aba `modulo`, coluna opcional) e legado **`slug`**: escolhe qual **painel especial** o dashboard renderiza para aquele módulo. Valores aceitos: **`iras`**, **`misp`**, **`producao`**, **`eventos_adversos`**, **`nr32`**, **`generico`**. Vazio ou inválido = **inferir pelo nome** do módulo (comportamento anterior: `IRAS`, `MISP`, `Produção`, `Eventos Adversos`, `NR32`). Pode editar em **Configuração → Módulos** (“Tipo de card no dashboard”) ou na planilha.

### Labels de indicadores nos cards especiais (IRAS, Eventos adversos, LP)

O app faz **casamento por `nome` ou `label`** do indicador, **sem acento** e **case-insensitive**, com listas de aliases em `src/lib/dashboardIndicadorLabels.js`. Resumo do que costuma aparecer na planilha:

- **IRAS:** Densidade IRAS; Incidência PAV; Taxa VM (%); Incidência ICS; Taxa CVC (%); Incidência ITU; Taxa CVD (%); HM Medicina Aval./Ades.; HM Enfermagem Aval./Ades.; HM Fisioterapia Aval./Ades.; séries NR32 (Adornos, Cabelo Solto, Sem Jaleco, Unhas c/ Relevo, Unhas >2mm, Unhas Postiças).
- **Eventos adversos:** categorias da densidade (Identificação, Medicação, Higiene das mãos, LP, LPDM, Queda, IRCVA) e notificações (**Notif. Enviadas** / **Notificações Enviadas**).
- **Lesão por Pressão (bundle):** Expostos; Novos Casos; Paciente Dia; Densidade LP; incidência (**LP Estad. 2+** ou fallback `ordem === 1`).

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
