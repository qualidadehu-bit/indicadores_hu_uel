export interface Env {
  GAS_WEBAPP_URL: string;
  GAS_SECRET: string;
}

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  // Inclui casing que o fetch do browser costuma mandar no preflight (x-gas-secret)
  'Access-Control-Allow-Headers': 'Content-Type, Accept, X-GAS-Secret, x-gas-secret',
  'Access-Control-Max-Age': '86400',
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...CORS_HEADERS,
    },
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS_HEADERS });
    }

    const url = new URL(request.url);

    if (request.method === 'GET' && url.pathname === '/health') {
      return jsonResponse({ ok: true, service: 'indicadores-hu-api' });
    }

    // Raiz: evita 404 ao abrir http://127.0.0.1:8787/ no navegador (não é o app React)
    if (request.method === 'GET' && (url.pathname === '/' || url.pathname === '')) {
      return jsonResponse({
        ok: true,
        service: 'indicadores-hu-api',
        message:
          'API do Worker. O frontend React roda separado: npm run dev (ex. http://localhost:5173). Teste GET /health; dados via POST /api.',
        endpoints: { health: 'GET /health', api: 'POST /api' },
      });
    }

    if (request.method !== 'POST' || url.pathname !== '/api') {
      return jsonResponse({ ok: false, error: 'Not found' }, 404);
    }

    const headerGasSecret = request.headers.get('X-GAS-Secret')?.trim() || '';
    const gasSecret = (env.GAS_SECRET || headerGasSecret).trim();
    const hasWebappUrl = !!(env.GAS_WEBAPP_URL && String(env.GAS_WEBAPP_URL).trim());
    const hasWorkerSecret = !!(env.GAS_SECRET && String(env.GAS_SECRET).trim());
    const hasHeaderSecret = !!headerGasSecret;

    if (!hasWebappUrl || !gasSecret) {
      return jsonResponse(
        {
          ok: false,
          error:
            'Worker misconfigured: GAS_WEBAPP_URL missing, or GAS_SECRET missing (set in Worker env or send X-GAS-Secret for local debug only)',
          detail: {
            GAS_WEBAPP_URL_configured: hasWebappUrl,
            GAS_SECRET_on_worker: hasWorkerSecret,
            X_GAS_Secret_header_present: hasHeaderSecret,
            hint:
              'Cloudflare: Workers → indicadores-hu-api → Settings → Variables (GAS_WEBAPP_URL + secret GAS_SECRET). Local: worker/.dev.vars. Ou defina VITE_GAS_SECRET no .env do Vite (só debug).',
          },
        },
        500
      );
    }

    let payload: Record<string, unknown>;
    try {
      payload = (await request.json()) as Record<string, unknown>;
    } catch {
      return jsonResponse({ ok: false, error: 'Invalid JSON body' }, 400);
    }

    const { _gasSecret: _drop, ...rest } = payload;
    const forwardBody = JSON.stringify({
      ...rest,
      _gasSecret: gasSecret,
    });

    try {
      const gasRes = await fetch(env.GAS_WEBAPP_URL, {
        method: 'POST',
        redirect: 'follow',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: forwardBody,
      });

      const text = await gasRes.text();
      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        return jsonResponse(
          {
            ok: false,
            error: 'GAS returned non-JSON',
            status: gasRes.status,
            snippet: text.slice(0, 200),
          },
          502
        );
      }

      return new Response(JSON.stringify(parsed), {
        status: gasRes.ok ? 200 : gasRes.status,
        headers: {
          'Content-Type': 'application/json',
          ...CORS_HEADERS,
        },
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      return jsonResponse({ ok: false, error: `Upstream fetch failed: ${message}` }, 502);
    }
  },
};
