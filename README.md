# Gestão à Vista — Indicadores HU UEL

Frontend em **React + Vite** que fala com um **Cloudflare Worker**, que por sua vez chama o **Google Apps Script** (planilha no Google Sheets).

## Pré-requisitos

- Node.js LTS
- Conta Cloudflare (para publicar o Worker)
- Projeto Google Apps Script implantado como **aplicativo da Web**, ligado à planilha (ver `gas/Code.gs`)

## Configuração

1. Copie `.env.example` para `.env` ou `.env.local` (opcional em dev local).

   Em **desenvolvimento local**, `npm run dev` sobe tudo na porta **8787** — não é necessário definir `VITE_WORKER_URL` (o frontend usa `/api` na mesma origem; o Vite faz proxy para o Worker na **8788**).

   Em **produção** (`npm run cf:deploy`), plataforma e API ficam no mesmo Worker:

   **https://dashboardhu.qualidade-hu.workers.dev**

   Não é necessário definir `VITE_WORKER_URL` no build — o frontend usa `/api` na mesma origem.

   Se o frontend for hospedado em **outro domínio**, defina `VITE_WORKER_URL` com a URL do Worker na hora do `npm run build`.

   Opcional: `VITE_GAS_SECRET` (só debug local — envia `X-GAS-Secret`; exposto no browser; prefira `GAS_SECRET` no Worker).

2. Worker — copie **`.dev.vars.example`** para **`.dev.vars`** na **raiz** do projeto (ao lado de `wrangler.toml`) e preencha:

   - `GAS_WEBAPP_URL` — URL `/exec` do Web App do Apps Script  
   - `GAS_SECRET` — mesmo valor da propriedade `API_SECRET` configurada no script (`gas/Code.gs`)
   - `AUTH_SECRET` — segredo para assinar token de sessão e token temporário de reset
   - `RESET_PIN` — PIN de reset validado no backend (não fica hardcoded no frontend)
   - `CORS_ALLOWED_ORIGINS` — lista CSV de origens permitidas no CORS
   - `GEMINI_API_KEY` — chave do Gemini (somente backend; não expor no frontend)
   - `GEMINI_MODEL` — opcional (default: `gemini-2.5-flash-lite`)

## Publicacao do Apps Script com clasp

1. Instale o `clasp` globalmente:
   - `npm install -g @google/clasp`

2. Faça login na sua conta Google:
   - `clasp login`

3. Configure o arquivo `.clasp.json` na raiz:
   - `rootDir` deve ser `gas`
   - `scriptId` deve ser o ID do seu projeto em `https://script.google.com`

4. Publique o codigo da pasta `gas/`:
   - `npm run gas:push`
   - (equivalente a `clasp push`)

5. No Apps Script, faca o deploy do Web App e copie a URL `/exec` para:
   - `GAS_WEBAPP_URL` (Cloudflare Worker)

Se o terminal nao reconhecer `clasp` apos instalar, feche e abra o terminal novamente. Como alternativa, use `npx @google/clasp push`.

## Comandos

| Comando | Descrição |
|--------|-----------|
| `npm install` | Instala dependências |
| `npm run gas:push` | Publica `gas/Code.gs` no projeto Google Apps Script configurado no `.clasp.json` |
| `npm run dev` | **Stack completa local** — plataforma em **http://127.0.0.1:8787** + Worker API na 8788 |
| `npm run dev:vite` | Só o frontend Vite (8787); exige Worker já rodando (`cf:dev`) |
| `npm run build` | Build de produção (`dist/`) |
| `npm run preview` | Preview do build |
| `npm run cf:deploy` | Build + publica **plataforma + API** na Cloudflare |
| `npm run dev:cf` | Build + Wrangler local na **8787** (igual produção, uma porta) |
| `npm run worker:dev` | Só o Worker local (Wrangler, porta **8788**) |
| `npm run worker:deploy` | Alias do `cf:deploy` |
| `npm run cf:dev` | Alias do `worker:dev` |
| `npm run test:security-contract` | Valida contrato mínimo de segurança (token/CORS/reset) |
| `npm run test:security-validation` | Testes unitários de sanitização/validação anti-injection |

**Desenvolvimento local:** `npm run dev` → **http://127.0.0.1:8787** (Vite + proxy `/api` → Worker 8788).

**Produção:** `npm run cf:deploy` → **https://dashboardhu.qualidade-hu.workers.dev** (React + `/api` no mesmo Worker).

Fluxo alternativo: Worker remoto + só Vite local — `npm run dev:vite` com `VITE_WORKER_URL=https://dashboardhu.qualidade-hu.workers.dev`.

### Erro: `Worker misconfigured: GAS_WEBAPP_URL missing, or GAS_SECRET missing`

O Worker **`dashboardhu`** (nome em `wrangler.toml`) precisa das duas variáveis no **mesmo** deploy que você está chamando:

| Onde | O quê |
|------|--------|
| **Cloudflare** → Workers → **dashboardhu** → Settings → Variables and Secrets | **`GAS_WEBAPP_URL`** (texto) = URL `/exec` do Web App (pode estar também em `[vars]` no `wrangler.toml`) |
| **Mesmo lugar** | **`GAS_SECRET`** (tipo *Secret*) = mesmo valor que **`API_SECRET`** no Apps Script |

Se você tirou **`VITE_GAS_SECRET`** do `.env` para evitar CORS, o navegador **não** manda mais `X-GAS-Secret` — aí o **`GAS_SECRET` obrigatoriamente** tem que existir na Cloudflare (não basta estar só em **`.dev.vars`** na raiz para deploy local).

Variáveis em outro Worker (nome diferente de **`dashboardhu`**) **não** entram neste deploy.

### Segurança de lançamento (go-live)

- Sessão autenticada usa token assinado no Worker (`session_token`) via header `Authorization: Bearer`.
- O Worker não usa mais `_userSession` do body para autorizar mutações.
- Reset de senha exige sessão `escritorio` **ou** token temporário emitido por `autenticar(action="request_reset_token")`.
- CORS opera por allowlist (`CORS_ALLOWED_ORIGINS`), sem `Access-Control-Allow-Origin: *`.
- Para produção, use `AUTH_SECRET` diferente de `GAS_SECRET` e rode rotação periódica de segredos.

### IA (endpoint `/api/ai/summary`)

- Endpoint: `POST /api/ai/summary`
- Body:

```json
{
  "setor_id": "uuid-do-setor",
  "modulo_id": "uuid-do-modulo",
  "mes": 5,
  "ano": 2026
}
```

- Retorno (resumo):
  - `resumo_executivo` (string)
  - `pontos_criticos`, `acoes_recomendadas`, `riscos` (arrays)
  - `confianca` (`baixa|media|alta`)
  - metadados: `generated_at`, `model`, `source`
- Segurança: a chave Gemini fica no Worker (`GEMINI_API_KEY`) e não é enviada ao navegador.

## Google Sheets — gráficos genéricos e `grupo_radar`

- **`modulo.tipo_grafico`** (aba `modulo`, coluna `tipo_grafico`): no **bloco genérico** do dashboard (módulos que não usam cards especiais como MISP, Produção, IRAS, etc.), o frontend usa `linha`, `barra`, `area`, `pizza` ou `radar`. O valor **`mapa_calor`** (se existir na planilha) cai para **linha** nesse bloco, pois não há mapa de calor no Recharts aqui.
- **Radar genérico**: cada eixo é um **indicador**; o valor é o **lançamento do mês** visível no dashboard (`mes` / filtro) para o **setor selecionado**. Sem setor, aparece a mensagem pedindo para selecionar o setor.
- **`grupo_radar`** (aba `indicador`, coluna opcional): texto livre. Quando `tipo_grafico` do módulo é **`radar`**:
  - Dois ou mais indicadores do **mesmo módulo** com o **mesmo** `grupo_radar` (após trim, não vazio) entram num **único** `RadarChart` (eixos = rótulos dos indicadores).
  - Indicador sem `grupo_radar` ou com valor **único** no módulo continua com **radar próprio** (dois eixos mínimos: indicador + meta ou referência, para o desenho fechar).

Adicione a coluna `grupo_radar` na linha 1 da aba `indicador` se ainda não existir; o Apps Script lê cabeçalhos dinamicamente (`gas/Code.gs`).

### `grupo_visual`, `nome_serie`, `layout_modulo` e `layout_dashboard`

- **`grupo_visual`** (aba `indicador`, coluna opcional): agrupador visual universal do dashboard genérico. No **mesmo módulo**, com `tipo_grafico` igual (ou override igual), dois ou mais indicadores com o mesmo `grupo_visual` entram no **mesmo bloco**.
- **`nome_serie`** (aba `indicador`, coluna opcional): nome exibido na legenda da série/fatia dentro do grupo visual. Vazio = fallback para `label`/`nome`.
- **`grupo_serie`** continua como **legado/fallback** para manter compatibilidade com dados antigos quando `grupo_visual` estiver vazio.
- **`divisoes`** (aba `indicador`, coluna opcional): string com nomes de **divisão** iguais ao campo **`setor.divisao`**, separados por **`|`** ou **`;`** (espaços extras são ignorados; duplicatas são unificadas ao salvar na configuração). **Vazio ou ausente** = o indicador vale para **todas** as divisões. Se preenchido, o indicador só entra nas telas quando o **filtro de divisão** do dashboard (ou a **divisão do setor** selecionado em lançamento/comparação) coincidir com um dos nomes.

### Lista de indicadores por setor (`indicador_ids`)

- **`setor.indicador_ids`** (aba `setor`, coluna opcional na linha 1): ids da aba **`indicador`**, separados por **`|`** ou **`;`**. **Vazio ou coluna ausente** = o setor usa **todos** os indicadores já permitidos pela divisão (`divisoes` no indicador), escopo de gestor, etc. Com valor preenchido, aplica-se uma **lista branca**: só esses indicadores entram no dashboard, lançamento, exportação PDF, metas na configuração (setor escolhido no seletor de meta) e demais ecrãs com **um setor concreto** selecionado.
- Com **«Todos os setores»** no dashboard (ou equivalente sem setor), **não** se aplica esta lista por setor.
- Na **comparação por divisão**, um indicador entra na tabela se for permitido em **pelo menos um** setor da divisão (união das listas por setor).
- Edição em **Configuração → Divisões e Setores** ao criar ou editar setor (checkboxes). **Marcar todos** equivale a deixar o campo vazio na planilha.

- **`layout_modulo`** (aba `modulo`, coluna opcional): `padrao` (omissão) ou **`card_grafico`**. No bloco **genérico** do dashboard, `card_grafico` mostra um **resumo em card** (valor do mês + status/meta quando existir) **acima** do gráfico, por indicador ou por grupo `grupo_visual` (fallback legado `grupo_serie`). Não altera cards especiais (MISP, Produção, etc.).
- **`layout_dashboard`** (aba `modulo`, coluna opcional): `padrao` (omissão) ou **`bundle_kpi_tabela`**. Com `bundle_kpi_tabela`, o dashboard usa o painel **KPI + tabela 12 meses + gráfico** em vez do bloco genérico de gráficos. O módulo **Lesão por Pressão (LP)** continua usando esse painel mesmo sem a coluna (legado). Com setor selecionado, compara lançamentos com **meta por setor** (`meta` + `setor_id` + `ano`) onde existir meta cadastrada. Cards especiais (MISP, IRAS, Produção, Eventos Adversos, etc.) **não** são trocados por este campo.
- **`tipo_ui`** (aba `modulo`, coluna opcional) e legado **`slug`**: escolhe qual **painel especial** o dashboard renderiza para aquele módulo. Valores aceitos: **`iras`**, **`misp`**, **`producao`**, **`eventos_adversos`**, **`nr32`**, **`generico`**. Vazio ou inválido = **inferir pelo nome** do módulo (comportamento anterior: `IRAS`, `MISP`, `Produção`, `Eventos Adversos`, `NR32`). Pode editar em **Configuração → Módulos** (“Tipo de card no dashboard”) ou na planilha.

### Labels de indicadores nos cards especiais (IRAS, Eventos adversos, LP)

O app faz **casamento por `nome` ou `label`** do indicador, **sem acento** e **case-insensitive**, com listas de aliases em `src/lib/dashboardIndicadorLabels.js`. Resumo do que costuma aparecer na planilha:

- **IRAS:** Densidade IRAS; Incidência PAV; Taxa VM (%); Incidência ICS; Taxa CVC (%); Incidência ITU; Taxa CVD (%); séries NR32 (Adornos, Cabelo Solto, Sem Jaleco, Unhas c/ Relevo, Unhas >2mm, Unhas Postiças). Para Higiene das Mãos, priorize metadados (`grupo_visual`/`nome_serie`) em vez de aliases estáticos.
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

## Smoke test pós-deploy

1. `GET /health` deve retornar `{ ok: true }`.
2. Login de `escritorio` e `gestor` deve funcionar e persistir sessão.
3. Criar/editar lançamento com gestor autorizado deve funcionar.
4. Criar/editar lançamento com gestor sem escopo deve retornar 403.
5. Fluxo de reset:
   - `request_reset_token` com PIN inválido deve retornar 403;
   - com PIN válido deve retornar token curto;
   - `reset` sem token/sessão deve retornar 403.
6. Origem não listada em `CORS_ALLOWED_ORIGINS` deve receber bloqueio CORS.

## Rollback mínimo

1. Reaplicar último deploy estável do Worker na Cloudflare.
2. Restaurar variáveis/segredos estáveis (`GAS_WEBAPP_URL`, `GAS_SECRET`, `AUTH_SECRET`, `RESET_PIN`, `CORS_ALLOWED_ORIGINS`).
3. Invalidar sessões atuais rotacionando `AUTH_SECRET`.
4. Executar smoke test pós-rollback.

## Checklist de release

- [ ] `npm run lint`
- [ ] `npm run typecheck`
- [ ] `npm run build`
- [ ] `npm run test:scope-contract`
- [ ] `npm run test:scope-matrix`
- [ ] `npm run test:security-contract`
- [ ] Segredos de produção revisados e rotacionados
- [ ] Smoke test pós-deploy concluído
