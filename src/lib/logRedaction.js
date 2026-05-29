const SENSITIVE_KEYS = ['password', 'senha', 'token', 'secret', 'authorization', 'pin', 'api_key'];

function isPlainObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

export function redactForLog(value) {
  if (value == null) return value;
  if (typeof value === 'string') return value.length > 120 ? `${value.slice(0, 117)}...` : value;
  if (Array.isArray(value)) return value.map((item) => redactForLog(item));
  if (!isPlainObject(value)) return value;
  const out = {};
  for (const [key, raw] of Object.entries(value)) {
    const lowered = key.toLowerCase();
    if (SENSITIVE_KEYS.some((token) => lowered.includes(token))) {
      out[key] = '[REDACTED]';
    } else {
      out[key] = redactForLog(raw);
    }
  }
  return out;
}
