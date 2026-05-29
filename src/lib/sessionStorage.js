const SESSION_KEY = 'userSession';
const STORAGE = typeof window === 'undefined' ? null : window.sessionStorage;

const SESSION_ALLOWLIST = [
  'id',
  'login',
  'tipo',
  'ativo',
  'session_token',
  'session_expires_at',
  'unidades',
  'divisoes',
  'nivel_acesso',
  'permissoes_escopo',
];

function sanitizeSessionObject(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const out = {};
  for (const key of SESSION_ALLOWLIST) {
    if (!(key in raw)) continue;
    const value = raw[key];
    if (value == null) continue;
    out[key] = typeof value === 'string' ? value.trim() : value;
  }
  if (!String(out.session_token || '').trim()) return null;
  return out;
}

function isSessionExpired(session) {
  const expiresRaw = String(session?.session_expires_at || '').trim();
  if (!expiresRaw) return true;
  const expiry = Date.parse(expiresRaw);
  if (!Number.isFinite(expiry)) return true;
  return Date.now() >= expiry;
}

/**
 * Lê a sessão atual de forma segura.
 * @returns {Record<string, unknown>|null}
 */
export function getStoredUserSession() {
  if (!STORAGE) return null;
  try {
    const raw = STORAGE.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const session = sanitizeSessionObject(parsed);
    if (!session || isSessionExpired(session)) {
      STORAGE.removeItem(SESSION_KEY);
      return null;
    }
    return /** @type {Record<string, unknown>} */ (session);
  } catch {
    STORAGE.removeItem(SESSION_KEY);
    return null;
  }
}

export function clearStoredUserSession() {
  if (!STORAGE) return;
  STORAGE.removeItem(SESSION_KEY);
}

/**
 * @param {Record<string, unknown>|null|undefined} session
 */
export function setStoredUserSession(session) {
  if (!STORAGE) return;
  const safe = sanitizeSessionObject(session);
  if (!safe || isSessionExpired(safe)) {
    STORAGE.removeItem(SESSION_KEY);
    return;
  }
  STORAGE.setItem(SESSION_KEY, JSON.stringify(safe));
}

/**
 * @returns {string}
 */
export function getStoredSessionToken() {
  const session = getStoredUserSession();
  const token = session?.session_token;
  return token == null ? '' : String(token).trim();
}

export { SESSION_KEY };
