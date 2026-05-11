export interface Env {
  GAS_WEBAPP_URL: string;
  GAS_SECRET: string;
}

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Accept',
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

    if (request.method !== 'POST' || url.pathname !== '/api') {
      return jsonResponse({ ok: false, error: 'Not found' }, 404);
    }

    if (!env.GAS_WEBAPP_URL || !env.GAS_SECRET) {
      return jsonResponse(
        { ok: false, error: 'Worker misconfigured: GAS_WEBAPP_URL or GAS_SECRET missing' },
        500
      );
    }

    let payload: Record<string, unknown>;
    try {
      payload = (await request.json()) as Record<string, unknown>;
    } catch {
      return jsonResponse({ ok: false, error: 'Invalid JSON body' }, 400);
    }

    const forwardBody = JSON.stringify({
      ...payload,
      _gasSecret: env.GAS_SECRET,
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
