import { normalizeEntityResponse } from '@/lib/sheetsEntityNormalize';
import { clearStoredUserSession, getStoredSessionToken } from '@/lib/sessionStorage';
import { redactForLog } from '@/lib/logRedaction';

/**
 * Cliente HTTP direto (fetch) → Cloudflare Worker POST /api → Google Apps Script.
 *
 * Variáveis Vite:
 *   VITE_WORKER_URL — base sem barra final (produção: URL do Worker na Cloudflare).
 *                     Em dev local, omita ou deixe vazio: usa same-origin (/api via proxy Vite → 8788).
 *   VITE_GAS_SECRET — opcional; enviado como cabeçalho X-GAS-Secret (só para debug local;
 *                     no bundle do navegador fica visível — não use em produção com segredo real).
 */

function workerBaseUrl() {
  const raw = import.meta.env.VITE_WORKER_URL;
  let url = raw != null && String(raw).trim() !== '' ? String(raw).trim() : '';
  url = url.replace(/\/$/, '');
  // Evita POST em .../api/api se alguém colar a URL já com /api
  if (url.endsWith('/api')) {
    url = url.slice(0, -4);
    console.warn('[apiClient] VITE_WORKER_URL não deve terminar em /api — corrigido automaticamente');
  }

  // Em dev local, evitar forçar cross-origin para workers.dev sem necessidade.
  // O esperado é same-origin (/api via proxy/dev server) para não depender de CORS remoto.
  const allowCrossOriginDev = String(import.meta.env.VITE_ALLOW_CROSS_ORIGIN_DEV || '').toLowerCase() === 'true';
  const isBrowser = typeof window !== 'undefined' && !!window.location;
  const isLocalHost =
    isBrowser &&
    ['localhost', '127.0.0.1', '0.0.0.0'].includes(String(window.location.hostname || '').toLowerCase());
  if (isLocalHost && url && !allowCrossOriginDev) {
    try {
      const target = new URL(url);
      if (target.origin !== window.location.origin) {
        console.warn(
          '[apiClient] Dev local detectado: ignorando VITE_WORKER_URL cross-origin e usando same-origin (/api). ' +
            'Defina VITE_ALLOW_CROSS_ORIGIN_DEV=true para manter cross-origin.'
        );
        return '';
      }
    } catch {
      // Se URL inválida, mantém fallback para same-origin.
      console.warn('[apiClient] VITE_WORKER_URL inválida; usando same-origin (/api).');
      return '';
    }
  }
  return url;
}

function optionalGasSecretHeader() {
  const s = import.meta.env.VITE_GAS_SECRET;
  if (s == null || String(s).trim() === '') return {};
  return { 'X-GAS-Secret': String(s).trim() };
}

const SCOPED_ENTITIES = new Set(['Modulo', 'Indicador', 'Meta', 'Lancamento']);
const SAFE_DEBUG = import.meta.env.DEV && String(import.meta.env.VITE_DEBUG_API || '').toLowerCase() === 'true';

function debugLog(label, payload = {}) {
  if (!SAFE_DEBUG) return;
  console.info(`[apiClient] ${label}`, redactForLog(payload));
}

function isScopedMutationRequest(body) {
  if (!body || typeof body !== 'object') return false;
  if (String(body.kind || '').trim().toLowerCase() !== 'entity') return false;
  const operation = String(body.operation || '').trim().toLowerCase();
  if (operation !== 'create' && operation !== 'update' && operation !== 'delete') return false;
  const entity = String(body.entity || '').trim();
  return SCOPED_ENTITIES.has(entity);
}

async function callApi(body) {
  if (isScopedMutationRequest(body) && !getStoredSessionToken()) {
    clearStoredUserSession();
    const err = /** @type {any} */ (
      new Error('Sua sessão expirou ou é inválida. Faça login novamente para salvar alterações.')
    );
    err.status = 401;
    err.code = 'SESSION_REQUIRED';
    throw err;
  }
  return callEndpoint('/api', body);
}

async function callEndpoint(path, body) {
  const base = workerBaseUrl();
  const url = `${base}${path}`;
  const sessionToken = getStoredSessionToken();
  const headers = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    ...optionalGasSecretHeader(),
    ...(sessionToken ? { Authorization: `Bearer ${sessionToken}` } : {}),
  };

  debugLog('POST', { path, hasSessionToken: !!sessionToken, hasXGasSecret: !!headers['X-GAS-Secret'] });

  const RETRY_DELAYS_MS = [0, 350, 900];
  let lastError = null;

  for (let attempt = 0; attempt < RETRY_DELAYS_MS.length; attempt++) {
    if (RETRY_DELAYS_MS[attempt] > 0) {
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAYS_MS[attempt]));
    }
    try {
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
        debugLog('non_json_response', { path, status: res.status });
        throw new Error(`Resposta inválida do servidor (${res.status})`);
      }

      debugLog('response', { path, status: res.status, ok: res.ok, attempt });

      if (!res.ok || json.ok === false) {
        const rawMessage = json.error || json.message || `Erro ${res.status}`;
        let message = rawMessage;
        const isSessionRequiredError =
          res.status === 403 &&
          /sess[aã]o obrigat[oó]ria/i.test(String(rawMessage)) &&
          String(body?.kind || '').toLowerCase() === 'entity' &&
          isScopedMutationRequest(body);
        if (isSessionRequiredError) {
          clearStoredUserSession();
          message = 'Sua sessão expirou ou é inválida. Faça login novamente para continuar.';
        }
        const err = /** @type {any} */ (new Error(message));
        err.status = res.status;
        err.body = json;
        if (isSessionRequiredError) err.code = 'SESSION_REQUIRED';
        const isRetryable = res.status >= 500;
        if (isRetryable && attempt < RETRY_DELAYS_MS.length - 1) {
          debugLog('retry_after_upstream_error', {
            path,
            status: res.status,
            attempt,
          });
          continue;
        }
        throw err;
      }
      return json;
    } catch (err) {
      lastError = err;
      const status = Number((/** @type {any} */ (err))?.status);
      const isRetryable = !Number.isFinite(status) || status >= 500;
      if (!isRetryable || attempt >= RETRY_DELAYS_MS.length - 1) {
        throw err;
      }
      debugLog('retry_after_fetch_error', {
        path,
        attempt,
        message: err?.message,
      });
    }
  }
  throw lastError || new Error('Falha inesperada ao chamar API');
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
  ai: {
    /**
     * @param {{ setor_id: string|number, modulo_id: string|number, mes: number, ano: number }} payload
     * @returns {Promise<{ data: {
     *  resumo_executivo: string,
     *  pontos_criticos: string[],
     *  acoes_recomendadas: string[],
     *  riscos: string[],
     *  confianca: 'baixa'|'media'|'alta',
     *  base_periodo: { mes: number, ano: number },
     *  generated_at?: string,
     *  model?: string,
     *  source?: 'gemini'|'fallback'
     * } }>}
     */
    async summary(payload) {
      const json = await callEndpoint('/api/ai/summary', payload || {});
      return { data: json.data };
    },
  },
};
