/**
 * HTTP client for Cloudflare Worker → Google Apps Script backend.
 * Env: VITE_WORKER_URL (no trailing slash), e.g. http://localhost:8787 or https://api.example.workers.dev
 */
function workerBaseUrl() {
  const url = import.meta.env.VITE_WORKER_URL;
  if (!url || String(url).trim() === '') {
    console.warn('[apiClient] VITE_WORKER_URL is not set');
  }
  return String(url || '').replace(/\/$/, '');
}

async function callApi(body) {
  const base = workerBaseUrl();
  if (!base) {
    throw new Error('Configure VITE_WORKER_URL no .env');
  }
  const res = await fetch(`${base}/api`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body),
  });
  let json;
  try {
    json = await res.json();
  } catch {
    throw new Error(`Resposta inválida do servidor (${res.status})`);
  }
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
    list: () => callApi({ kind: 'entity', entity, operation: 'list' }).then((r) => r.data),
    filter: (filter) =>
      callApi({ kind: 'entity', entity, operation: 'filter', filter: filter || {} }).then((r) => r.data),
    create: (record) => callApi({ kind: 'entity', entity, operation: 'create', record }).then((r) => r.data),
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
