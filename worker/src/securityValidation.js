const DANGEROUS_KEYS = new Set(['__proto__', 'prototype', 'constructor']);
const KNOWN_ENTITIES = new Set(['Conta', 'Gestor', 'Setor', 'Modulo', 'Indicador', 'Meta', 'Lancamento']);
const KNOWN_FUNCTIONS = new Set(['autenticar']);
const ENTITY_OPS = new Set(['list', 'filter', 'create', 'update', 'delete']);
const MAX_BODY_CHARS = 50_000;
const MAX_OBJECT_KEYS = 120;
const MAX_STRING_DEFAULT = 2000;

const MARKUP_PATTERN = /<\s*\/?\s*script|<\s*[a-z][^>]*>|on[a-z]+\s*=|javascript:/i;
const SAFE_ID_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;
const SAFE_KEY_PATTERN = /^[\p{L}\p{N}_ .:-]{1,64}$/u;

function isPlainObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function hasDangerousKeyDeep(value) {
  if (!isPlainObject(value) && !Array.isArray(value)) return false;
  if (Array.isArray(value)) {
    for (const item of value) {
      if (hasDangerousKeyDeep(item)) return true;
    }
    return false;
  }
  for (const key of Object.keys(value)) {
    if (DANGEROUS_KEYS.has(key)) return true;
    if (hasDangerousKeyDeep(value[key])) return true;
  }
  return false;
}

function sanitizeString(input, { max = MAX_STRING_DEFAULT, allowMarkup = false } = {}) {
  let out = String(input == null ? '' : input)
    .normalize('NFKC')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .trim();
  if (out.length > max) {
    throw new Error(`Campo excede limite de ${max} caracteres.`);
  }
  if (!allowMarkup && MARKUP_PATTERN.test(out)) {
    throw new Error('Campo contém conteúdo HTML/script não permitido.');
  }
  return out;
}

function sanitizeSpreadsheetSafeString(input, options = {}) {
  const out = sanitizeString(input, options);
  if (!out) return out;
  if (/^[=+\-@]/.test(out)) return `'${out}`;
  return out;
}

function sanitizeObjectValues(obj) {
  if (!isPlainObject(obj)) throw new Error('Objeto inválido.');
  const keys = Object.keys(obj);
  if (keys.length > MAX_OBJECT_KEYS) {
    throw new Error(`Objeto excede limite de ${MAX_OBJECT_KEYS} campos.`);
  }
  const out = {};
  for (const key of keys) {
    if (!SAFE_KEY_PATTERN.test(key) || DANGEROUS_KEYS.has(key)) {
      throw new Error(`Campo "${key}" não permitido.`);
    }
    const value = obj[key];
    if (value == null || typeof value === 'boolean' || typeof value === 'number') {
      out[key] = value;
      continue;
    }
    if (typeof value === 'string') {
      out[key] = sanitizeSpreadsheetSafeString(value);
      continue;
    }
    if (Array.isArray(value)) {
      if (value.length > 200) throw new Error(`Campo "${key}" excede limite de itens.`);
      out[key] = value.map((item) => {
        if (item == null || typeof item === 'boolean' || typeof item === 'number') return item;
        if (typeof item === 'string') return sanitizeSpreadsheetSafeString(item, { max: 500 });
        throw new Error(`Campo "${key}" contém item inválido.`);
      });
      continue;
    }
    throw new Error(`Campo "${key}" possui tipo não permitido.`);
  }
  return out;
}

function validateKnownKeys(obj, known, path, errors) {
  const keys = Object.keys(obj || {});
  for (const key of keys) {
    if (!known.has(key)) {
      errors.push({ field: `${path}.${key}`, message: 'Campo não permitido.' });
    }
  }
}

function requireStringField(obj, key, errors, options = {}) {
  const raw = obj[key];
  if (raw == null || String(raw).trim() === '') {
    errors.push({ field: key, message: 'Campo obrigatório.' });
    return '';
  }
  try {
    return sanitizeString(raw, options);
  } catch (err) {
    errors.push({ field: key, message: err.message || 'Campo inválido.' });
    return '';
  }
}

function validateEntityPayload(payload, errors) {
  validateKnownKeys(payload, new Set(['kind', 'entity', 'operation', 'id', 'record', 'filter', '_gasSecret', '_userSession']), 'payload', errors);
  const entity = requireStringField(payload, 'entity', errors, { max: 32 });
  if (entity && !KNOWN_ENTITIES.has(entity)) {
    errors.push({ field: 'entity', message: 'Entidade inválida.' });
  }
  const operation = requireStringField(payload, 'operation', errors, { max: 16 }).toLowerCase();
  if (operation && !ENTITY_OPS.has(operation)) {
    errors.push({ field: 'operation', message: 'Operação inválida.' });
  }

  const sanitized = { kind: 'entity', entity, operation };

  if (operation === 'update' || operation === 'delete') {
    const id = requireStringField(payload, 'id', errors, { max: 128 });
    if (id && !SAFE_ID_PATTERN.test(id)) errors.push({ field: 'id', message: 'ID inválido.' });
    sanitized.id = id;
  } else if (payload.id != null) {
    errors.push({ field: 'id', message: 'Campo não permitido para esta operação.' });
  }

  if (operation === 'create' || operation === 'update') {
    if (!isPlainObject(payload.record)) {
      errors.push({ field: 'record', message: 'record deve ser objeto JSON.' });
    } else {
      try {
        sanitized.record = sanitizeObjectValues(payload.record);
      } catch (err) {
        errors.push({ field: 'record', message: err.message || 'record inválido.' });
      }
    }
  } else if (payload.record != null) {
    errors.push({ field: 'record', message: 'Campo não permitido para esta operação.' });
  }

  if (operation === 'filter') {
    if (!isPlainObject(payload.filter || {})) {
      errors.push({ field: 'filter', message: 'filter deve ser objeto JSON.' });
    } else {
      try {
        sanitized.filter = sanitizeObjectValues(payload.filter || {});
      } catch (err) {
        errors.push({ field: 'filter', message: err.message || 'filter inválido.' });
      }
    }
  } else if (payload.filter != null) {
    errors.push({ field: 'filter', message: 'Campo não permitido para esta operação.' });
  }

  return sanitized;
}

function validateAuthPayload(payload, errors) {
  const action = requireStringField(payload, 'action', errors, { max: 64 }).toLowerCase();
  const sanitized = { action };
  if (action === 'login') {
    validateKnownKeys(payload, new Set(['action', 'login', 'password', 'tipo']), 'payload', errors);
    sanitized.login = requireStringField(payload, 'login', errors, { max: 80 });
    sanitized.password = requireStringField(payload, 'password', errors, { max: 128, allowMarkup: true });
    const tipo = requireStringField(payload, 'tipo', errors, { max: 24 }).toLowerCase();
    if (tipo !== 'escritorio' && tipo !== 'gestor') {
      errors.push({ field: 'tipo', message: 'Tipo de login inválido.' });
    }
    sanitized.tipo = tipo;
    return sanitized;
  }
  if (action === 'request_reset_token') {
    validateKnownKeys(payload, new Set(['action', 'pin']), 'payload', errors);
    sanitized.pin = requireStringField(payload, 'pin', errors, { max: 64, allowMarkup: true });
    return sanitized;
  }
  if (action === 'reset') {
    validateKnownKeys(payload, new Set(['action', 'newPassword', 'reset_token']), 'payload', errors);
    sanitized.newPassword = requireStringField(payload, 'newPassword', errors, { max: 128, allowMarkup: true });
    if (payload.reset_token != null) {
      sanitized.reset_token = sanitizeString(payload.reset_token, { max: 2048, allowMarkup: true });
    }
    return sanitized;
  }
  errors.push({ field: 'action', message: 'Ação inválida.' });
  return sanitized;
}

function validateFunctionPayload(payload, errors) {
  validateKnownKeys(payload, new Set(['kind', 'name', 'payload', '_gasSecret', '_userSession']), 'payload', errors);
  const name = requireStringField(payload, 'name', errors, { max: 64 });
  if (name && !KNOWN_FUNCTIONS.has(name)) {
    errors.push({ field: 'name', message: 'Função inválida.' });
  }
  const sanitized = { kind: 'function', name };
  const rawPayload = payload.payload || {};
  if (!isPlainObject(rawPayload)) {
    errors.push({ field: 'payload', message: 'payload deve ser objeto JSON.' });
    return sanitized;
  }
  if (name === 'autenticar') {
    sanitized.payload = validateAuthPayload(rawPayload, errors);
  } else {
    errors.push({ field: 'name', message: 'Função inválida.' });
  }
  return sanitized;
}

export function validateAndSanitizeApiPayload(raw) {
  const errors = [];
  if (!isPlainObject(raw)) {
    return { ok: false, errors: [{ field: 'payload', message: 'Payload deve ser objeto JSON.' }] };
  }
  if (hasDangerousKeyDeep(raw)) {
    return { ok: false, errors: [{ field: 'payload', message: 'Payload contém chave proibida.' }] };
  }
  validateKnownKeys(
    raw,
    new Set(['kind', 'entity', 'operation', 'id', 'record', 'filter', 'name', 'payload', '_gasSecret', '_userSession']),
    'payload',
    errors
  );
  const kind = requireStringField(raw, 'kind', errors, { max: 32 }).toLowerCase();
  let sanitized = {};
  if (kind === 'entity') {
    sanitized = validateEntityPayload(raw, errors);
  } else if (kind === 'function') {
    sanitized = validateFunctionPayload(raw, errors);
  } else {
    errors.push({ field: 'kind', message: 'Tipo de requisição inválido.' });
  }
  if (errors.length) return { ok: false, errors };
  return { ok: true, sanitized };
}

export function parseAndValidateRequestText(text) {
  const raw = String(text == null ? '' : text);
  if (!raw.trim()) {
    return { ok: false, errors: [{ field: 'payload', message: 'Body vazio.' }] };
  }
  if (raw.length > MAX_BODY_CHARS) {
    return { ok: false, errors: [{ field: 'payload', message: `Body excede limite de ${MAX_BODY_CHARS} caracteres.` }] };
  }
  try {
    const parsed = JSON.parse(raw);
    return validateAndSanitizeApiPayload(parsed);
  } catch {
    return { ok: false, errors: [{ field: 'payload', message: 'JSON inválido.' }] };
  }
}

export function redactSensitive(value) {
  const SENSITIVE_KEYS = ['password', 'senha', 'token', 'secret', 'authorization', 'pin', 'api_key'];
  if (value == null) return value;
  if (typeof value === 'string') return value.length > 120 ? `${value.slice(0, 117)}...` : value;
  if (Array.isArray(value)) return value.map((item) => redactSensitive(item));
  if (!isPlainObject(value)) return value;
  const out = {};
  for (const [key, raw] of Object.entries(value)) {
    const lowered = key.toLowerCase();
    if (SENSITIVE_KEYS.some((k) => lowered.includes(k))) {
      out[key] = '[REDACTED]';
    } else {
      out[key] = redactSensitive(raw);
    }
  }
  return out;
}
