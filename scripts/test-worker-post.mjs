#!/usr/bin/env node
/**
 * Testa POST /api no Cloudflare Worker local (ou remoto).
 *
 * Uso:
 *   node scripts/test-worker-post.mjs
 *   WORKER_URL=http://127.0.0.1:8788 node scripts/test-worker-post.mjs
 *   node scripts/test-worker-post.mjs --login suaSenhaEscritorio
 *
 * Sobre o "segredo" (GAS_SECRET / API_SECRET):
 *   O Worker lê GAS_SECRET de .dev.vars na raiz (local) ou do painel Cloudflare (produção)
 *   e injeta no JSON ao chamar o Google Apps Script. Este script NÃO envia esse segredo no
 *   corpo da requisição para o Worker — é o comportamento correto do app.
 *
 * Opcional: variável de ambiente JSON_BODY com string JSON completa para POST /api.
 */

const DEFAULT_BASE = process.env.WORKER_URL || 'http://127.0.0.1:8787';

function parseArgs() {
  const args = process.argv.slice(2);
  const out = { base: DEFAULT_BASE, loginPassword: null, customJson: null };
  let i = 0;
  while (i < args.length) {
    if (args[i] === '--url' && args[i + 1]) {
      out.base = args[i + 1].replace(/\/$/, '');
      i += 2;
      continue;
    }
    if (args[i] === '--login' && args[i + 1]) {
      out.loginPassword = args[i + 1];
      i += 2;
      continue;
    }
    if (args[i] === '--json' && args[i + 1]) {
      out.customJson = args[i + 1];
      i += 2;
      continue;
    }
    if (!args[i].startsWith('-') && out.loginPassword === null && i === 0) {
      out.loginPassword = args[i];
      i += 1;
      continue;
    }
    i += 1;
  }
  if (process.env.SENHA_ESCRITORIO) out.loginPassword = process.env.SENHA_ESCRITORIO;
  return out;
}

async function main() {
  const { base, loginPassword, customJson } = parseArgs();
  const url = `${base}/api`;

  let body;
  if (process.env.JSON_BODY) {
    body = JSON.parse(process.env.JSON_BODY);
  } else if (customJson) {
    body = JSON.parse(customJson);
  } else if (loginPassword) {
    body = {
      kind: 'function',
      name: 'autenticar',
      payload: {
        action: 'login',
        login: 'admin',
        password: loginPassword,
        tipo: 'escritorio',
      },
    };
  } else {
    body = {
      kind: 'entity',
      entity: 'Setor',
      operation: 'list',
    };
  }

  console.log('POST', url);
  console.log('Body:', JSON.stringify(body, null, 2));

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(body),
  });

  const text = await res.text();
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = text;
  }

  console.log('Status:', res.status);
  console.log('Response:', typeof parsed === 'object' ? JSON.stringify(parsed, null, 2) : parsed);
  process.exit(res.ok ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
