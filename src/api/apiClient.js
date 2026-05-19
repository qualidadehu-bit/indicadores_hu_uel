import { normalizeEntityResponse } from '@/lib/sheetsEntityNormalize';

/**
 * Cliente HTTP direto (fetch) → Cloudflare Worker POST /api → Google Apps Script.
 *
 * Variáveis Vite:
 *   VITE_WORKER_URL — base sem barra final (default: http://127.0.0.1:8787)
 *   VITE_GAS_SECRET — opcional; enviado como cabeçalho X-GAS-Secret (só para debug local;
 *                     no bundle do navegador fica visível — não use em produção com segredo real).
 */

const DEFAULT_WORKER_URL = 'http://127.0.0.1:8787';

function workerBaseUrl() {
  const raw = import.meta.env.VITE_WORKER_URL;
  let url = raw != null && String(raw).trim() !== '' ? String(raw).trim() : DEFAULT_WORKER_URL;
  url = url.replace(/\/$/, '');
  // Evita POST em .../api/api se alguém colar a URL já com /api
  if (url.endsWith('/api')) {
    url = url.slice(0, -4);
    console.warn('[apiClient] VITE_WORKER_URL não deve terminar em /api — corrigido automaticamente');
  }
  return url;
}

function optionalGasSecretHeader() {
  const s = import.meta.env.VITE_GAS_SECRET;
  if (s == null || String(s).trim() === '') return {};
  return { 'X-GAS-Secret': String(s).trim() };
}

async function callApi(body) {
  const base = workerBaseUrl();
  const url = `${base}/api`;
  const headers = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    ...optionalGasSecretHeader(),
  };

  console.log('[apiClient] POST', url, { body, hasXGasSecret: !!headers['X-GAS-Secret'] });

  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });

  let json;
  const text = await res.text();
  try {
    json = JSON.parse(text);
  } catch {
    console.error('[apiClient] resposta não-JSON', res.status, text.slice(0, 500));
    throw new Error(`Resposta inválida do servidor (${res.status})`);
  }

  console.log('[apiClient] response', { status: res.status, ok: res.ok, json });

  if (!res.ok || json.ok === false) {
    const err = new Error(json.error || json.message || `Erro ${res.status}`);
    err.status = res.status;
    err.body = json;
    throw err;
  }
  return json;
}

function entityApi(entity) {
  return {
    list: () =>
      callApi({ kind: 'entity', entity, operation: 'list' }).then((r) => normalizeEntityResponse(entity, r.data)),
    filter: (filter) =>
      callApi({ kind: 'entity', entity, operation: 'filter', filter: filter || {} }).then((r) =>
        normalizeEntityResponse(entity, r.data)
      ),
    create: (record) =>
      callApi({ kind: 'entity', entity, operation: 'create', record }).then((r) =>
        normalizeEntityResponse(entity, r.data)
      ),
    update: (id, record) =>
      callApi({ kind: 'entity', entity, operation: 'update', id, record }).then((r) => r.data),
    delete: (id) => callApi({ kind: 'entity', entity, operation: 'delete', id }).then((r) => r.data),
  };
}

export const api = {
  entities: {
    Conta: entityApi('Conta'),
    Gestor: entityApi('Gestor'),
    Setor: entityApi('Setor'),
    Modulo: entityApi('Modulo'),
    Indicador: entityApi('Indicador'),
    Meta: entityApi('Meta'),
    Lancamento: entityApi('Lancamento'),
  },
  functions: {
    /**
     * @param {string} name e.g. 'autenticar'
     * @param {Record<string, unknown>} payload
     * @returns {Promise<{ data: unknown }>}
     */
    async invoke(name, payload) {
      const json = await callApi({ kind: 'function', name, payload: payload || {} });
      return { data: json.data };
    },
  },
};
