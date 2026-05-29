import { parseAndValidateRequestText, redactSensitive } from './securityValidation.js';

export interface Env {
  GAS_WEBAPP_URL: string;
  GAS_SECRET: string;
  AUTH_SECRET?: string;
  RESET_PIN?: string;
  CORS_ALLOWED_ORIGINS?: string;
  GEMINI_API_KEY?: string;
  GEMINI_MODEL?: string;
  ASSETS: { fetch: typeof fetch };
}

const BASE_CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  // Inclui casing comum em preflight + Authorization para token de sessão.
  'Access-Control-Allow-Headers': 'Content-Type, Accept, Authorization, X-GAS-Secret, x-gas-secret',
  'Access-Control-Max-Age': '86400',
  Vary: 'Origin',
};

function normalizePathname(pathname: string): string {
  if (!pathname) return '/';
  if (pathname.length > 1 && pathname.endsWith('/')) return pathname.slice(0, -1);
  return pathname;
}

const DEFAULT_GEMINI_MODEL = 'gemini-2.5-flash-lite';
const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
const MAX_INDICADORES_CONTEXTO = 40;
const DASHBOARD_SCOPE_LEGACY = 'assistencial';
const DASHBOARD_SCOPE_COMISSOES = 'comissoes';
const DASHBOARD_SCOPE_PRATICAS_MEDICAS = 'praticas_medicas';
const ENTITY_TYPE_SETOR = 'SETOR';
const ENTITY_TYPE_COMISSAO = 'COMISSAO';
const ENTITY_TYPE_CLINICA = 'CLINICA';
const ACTION_LANCAR_DADOS = 'lancar_dados';
const ACTION_VISUALIZAR = 'visualizar';
const ACTION_EDITAR = 'editar';
const ACTION_ADMIN = 'admin';
const WILDCARD = '*';
const SCOPED_ENTITIES = new Set(['Modulo', 'Indicador', 'Meta', 'Lancamento']);
const ENTITIES_WITH_ENTITY_TYPE = new Set(['Setor', 'Modulo', 'Indicador', 'Meta', 'Lancamento']);
const SENSITIVE_ENTITIES = new Set(['Conta', 'Gestor', 'Setor']);
const RESET_TOKEN_PURPOSE = 'password_reset';
const SESSION_TOKEN_TTL_SECONDS = 60 * 60 * 8; // 8h
const RESET_TOKEN_TTL_SECONDS = 60 * 10; // 10m

type JsonMap = Record<string, unknown>;
type ScopeInfo = { dashboard: string; grupo: string };

function jsonResponse(body: unknown, status = 200, corsHeaders: Record<string, string> = BASE_CORS_HEADERS): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders,
    },
  });
}

function validationErrorResponse(
  fieldErrors: Array<{ field: string; message: string }>,
  corsHeaders: Record<string, string>
): Response {
  return jsonResponse(
    {
      ok: false,
      error: 'Requisição inválida.',
      field_errors: fieldErrors,
    },
    400,
    corsHeaders
  );
}

function createTraceId(): string {
  return crypto.randomUUID();
}

function internalErrorResponse(
  traceId: string,
  corsHeaders: Record<string, string>,
  status = 500,
  message = 'Erro interno ao processar requisição.'
): Response {
  return jsonResponse(
    {
      ok: false,
      error: message,
      traceId,
    },
    status,
    corsHeaders
  );
}

function withCors(response: Response, corsHeaders: Record<string, string>): Response {
  const nextHeaders = new Headers(response.headers);
  for (const [k, v] of Object.entries(corsHeaders)) nextHeaders.set(k, v);
  return new Response(response.body, { status: response.status, headers: nextHeaders });
}

function toTrimmedString(v: unknown): string {
  return String(v == null ? '' : v).trim();
}

function normalizeSecret(value: unknown): string {
  const s = toTrimmedString(value);
  if (s.length >= 2) {
    const first = s[0];
    const last = s[s.length - 1];
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
      return s.slice(1, -1).trim();
    }
  }
  return s;
}

function buildCorsHeaders(request: Request, env: Env): Record<string, string> | null {
  const origin = toTrimmedString(request.headers.get('Origin'));
  if (!origin) return { ...BASE_CORS_HEADERS };
  const allowed = new Set(
    toTrimmedString(env.CORS_ALLOWED_ORIGINS)
      .split(',')
      .map((x) => x.trim())
      .filter(Boolean)
  );
  const isAllowed = allowed.has(origin);
  if (!isAllowed) return null;
  return {
    ...BASE_CORS_HEADERS,
    'Access-Control-Allow-Origin': origin,
  };
}

function encodeBase64Url(bytes: Uint8Array): string {
  const binary = String.fromCharCode(...bytes);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function decodeBase64UrlToString(value: string): string {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const pad = normalized.length % 4 === 0 ? '' : '='.repeat(4 - (normalized.length % 4));
  return atob(normalized + pad);
}

function decodeBase64UrlToBytes(value: string): Uint8Array {
  const binary = decodeBase64UrlToString(value);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
  return out;
}

function utf8Bytes(input: string): Uint8Array {
  return new TextEncoder().encode(input);
}

function getAuthSecret(env: Env): string {
  const authSecret = normalizeSecret(env.AUTH_SECRET);
  const fallback = normalizeSecret(env.GAS_SECRET);
  return authSecret || fallback;
}

async function importHmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', utf8Bytes(secret), { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
    'verify',
  ]);
}

async function signToken(payload: JsonMap, secret: string, ttlSeconds: number): Promise<string> {
  const nowSeconds = Math.floor(Date.now() / 1000);
  const body = {
    ...payload,
    iat: nowSeconds,
    exp: nowSeconds + ttlSeconds,
  };
  const header = { alg: 'HS256', typ: 'JWT' };
  const encodedHeader = encodeBase64Url(utf8Bytes(JSON.stringify(header)));
  const encodedBody = encodeBase64Url(utf8Bytes(JSON.stringify(body)));
  const data = `${encodedHeader}.${encodedBody}`;
  const key = await importHmacKey(secret);
  const signature = await crypto.subtle.sign('HMAC', key, utf8Bytes(data));
  return `${data}.${encodeBase64Url(new Uint8Array(signature))}`;
}

async function verifyToken(token: string, secret: string): Promise<JsonMap | null> {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [headerPart, bodyPart, signaturePart] = parts;
  let headerRaw = '';
  let bodyRaw = '';
  try {
    headerRaw = decodeBase64UrlToString(headerPart);
    bodyRaw = decodeBase64UrlToString(bodyPart);
  } catch {
    return null;
  }
  let header: JsonMap;
  let payload: JsonMap;
  try {
    header = parseBodyAsObject(JSON.parse(headerRaw));
    payload = parseBodyAsObject(JSON.parse(bodyRaw));
  } catch {
    return null;
  }
  if (toTrimmedString(header.alg) !== 'HS256' || toTrimmedString(header.typ) !== 'JWT') return null;
  const key = await importHmacKey(secret);
  const data = `${headerPart}.${bodyPart}`;
  let signatureBytes: Uint8Array;
  try {
    signatureBytes = decodeBase64UrlToBytes(signaturePart);
  } catch {
    return null;
  }
  const valid = await crypto.subtle.verify('HMAC', key, signatureBytes, utf8Bytes(data));
  if (!valid) return null;
  const exp = Number(payload.exp);
  if (!Number.isFinite(exp) || exp <= Math.floor(Date.now() / 1000)) return null;
  return payload;
}

async function readSessionFromAuthHeader(request: Request, env: Env): Promise<JsonMap | null> {
  const auth = toTrimmedString(request.headers.get('Authorization'));
  if (!auth.toLowerCase().startsWith('bearer ')) return null;
  const token = auth.slice(7).trim();
  if (!token) return null;
  const secret = getAuthSecret(env);
  if (!secret) return null;
  const payload = await verifyToken(token, secret);
  if (!payload) return null;
  if (toTrimmedString(payload.typ) !== 'session') return null;
  const session = payload.session;
  if (!session || typeof session !== 'object' || Array.isArray(session)) return null;
  return session as JsonMap;
}

function parseBodyAsObject(raw: unknown): JsonMap {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('Body must be a JSON object');
  }
  return raw as JsonMap;
}

function isGasUnauthorizedEnvelope(parsed: unknown): boolean {
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return false;
  const obj = parsed as JsonMap;
  const ok = obj.ok;
  const err = toTrimmedString(obj.error).toLowerCase();
  return ok === false && err === 'unauthorized';
}

function parseIntField(payload: JsonMap, key: string, min: number, max: number): number {
  const raw = payload[key];
  const n = Number(raw);
  if (!Number.isInteger(n) || n < min || n > max) {
    throw new Error(`Campo "${key}" inválido`);
  }
  return n;
}

function sameId(a: unknown, b: unknown): boolean {
  return String(a) === String(b);
}

function numberOrNull(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function normalizeDashboardScope(raw: unknown): string {
  const s = toTrimmedString(raw).toLowerCase();
  const flat = s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\s-]+/g, '_');
  if (flat === DASHBOARD_SCOPE_COMISSOES || flat === 'dashboard_comissoes') return DASHBOARD_SCOPE_COMISSOES;
  if (
    flat === DASHBOARD_SCOPE_PRATICAS_MEDICAS ||
    flat === 'dashboard_praticas_medicas' ||
    flat === 'clinicas' ||
    flat === 'praticas'
  ) {
    return DASHBOARD_SCOPE_PRATICAS_MEDICAS;
  }
  if (flat === DASHBOARD_SCOPE_LEGACY || flat === 'dashboard_assistencial' || flat === 'legado') {
    return DASHBOARD_SCOPE_LEGACY;
  }
  return DASHBOARD_SCOPE_LEGACY;
}

function normalizeGrupoScope(raw: unknown): string {
  return toTrimmedString(raw)
    .toLowerCase()
    .replace(/\s+/g, '_');
}

function normalizeEntityType(raw: unknown, fallback: string = ENTITY_TYPE_SETOR): string {
  const value = toTrimmedString(raw).toUpperCase();
  if (value === ENTITY_TYPE_COMISSAO) return ENTITY_TYPE_COMISSAO;
  if (value === ENTITY_TYPE_CLINICA) return ENTITY_TYPE_CLINICA;
  if (value === ENTITY_TYPE_SETOR) return ENTITY_TYPE_SETOR;
  return fallback;
}

function requestedEntityTypeFromPayload(payload: JsonMap): string {
  const rawFilter =
    payload.filter && typeof payload.filter === 'object' && !Array.isArray(payload.filter)
      ? (payload.filter as JsonMap)
      : null;
  return normalizeEntityType(rawFilter?.entity_type, ENTITY_TYPE_SETOR);
}

type ScopeRule = { acao: string; dashboard: string; grupo: string };

function normalizeScopeAction(raw: unknown): string {
  const value = toTrimmedString(raw).toLowerCase();
  const flat = value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\s-]+/g, '_');
  if (!flat) return '';
  if (flat === WILDCARD) return WILDCARD;
  if (flat === ACTION_ADMIN || flat === 'administrar' || flat === 'administracao') return ACTION_ADMIN;
  if (flat === ACTION_VISUALIZAR || flat === 'visualizacao' || flat === 'ver') return ACTION_VISUALIZAR;
  if (flat === ACTION_EDITAR || flat === 'edicao') return ACTION_EDITAR;
  if (flat === ACTION_LANCAR_DADOS || flat === 'lancar' || flat === 'lancamento') return ACTION_LANCAR_DADOS;
  return flat;
}

function parseScopeRules(raw: unknown): ScopeRule[] {
  const s = toTrimmedString(raw);
  if (!s) return [];
  try {
    const parsed = JSON.parse(s);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((x) => {
        if (!x || typeof x !== 'object') return null;
        const row = x as JsonMap;
        const acao = normalizeScopeAction(row.acao);
        if (!acao) return null;
        const dashboardRaw = toTrimmedString(row.dashboard);
        const dashboard = dashboardRaw === '*' ? '*' : normalizeDashboardScope(dashboardRaw);
        const grupoRaw = toTrimmedString(row.grupo);
        const grupo = grupoRaw === '*' ? '*' : normalizeGrupoScope(grupoRaw);
        return { acao, dashboard, grupo };
      })
      .filter(Boolean) as ScopeRule[];
  } catch {
    return [];
  }
}

function matchesScopeRule(rules: ScopeRule[], action: string, dashboard: string, grupo: string): boolean {
  const actionNorm = normalizeScopeAction(action);
  const dashNorm = normalizeDashboardScope(dashboard);
  const grupoNorm = normalizeGrupoScope(grupo);
  return rules.some((rule) => {
    const actionOk = rule.acao === actionNorm || rule.acao === ACTION_ADMIN || rule.acao === WILDCARD;
    const dashOk = rule.dashboard === WILDCARD || rule.dashboard === dashNorm;
    if (!actionOk || !dashOk) return false;
    if (!rule.grupo || rule.grupo === WILDCARD) return true;
    return rule.grupo === grupoNorm;
  });
}

function toEntityOperationScopeAction(entity: string, operation: string): string | null {
  const op = toTrimmedString(operation).toLowerCase();
  if (entity === 'Lancamento' && (op === 'create' || op === 'update')) return ACTION_LANCAR_DADOS;
  if (op === 'list' || op === 'filter') return ACTION_VISUALIZAR;
  if (op === 'create' || op === 'update' || op === 'delete') return ACTION_EDITAR;
  return null;
}

function readRecordScope(record: JsonMap): ScopeInfo {
  return {
    dashboard: normalizeDashboardScope(record.dashboard_scope),
    grupo: normalizeGrupoScope(record.grupo_scope),
  };
}

async function buildModuloScopeMap(env: Env, gasSecret: string): Promise<Map<string, ScopeInfo>> {
  const modulos = await callGasEntity(env, gasSecret, 'Modulo', 'list');
  return new Map(
    modulos.map((m) => [
      toTrimmedString(m.id),
      {
        dashboard: normalizeDashboardScope(m.dashboard_scope),
        grupo: '',
      },
    ])
  );
}

async function buildIndicadorScopeMap(
  env: Env,
  gasSecret: string,
  moduloMap: Map<string, ScopeInfo>
): Promise<Map<string, ScopeInfo>> {
  const indicadores = await callGasEntity(env, gasSecret, 'Indicador', 'list');
  return new Map(
    indicadores.map((ind) => {
      const moduloScope = moduloMap.get(toTrimmedString(ind.modulo_id));
      const dashboardRaw = toTrimmedString(ind.dashboard_scope);
      return [
        toTrimmedString(ind.id),
        {
          dashboard: dashboardRaw
            ? normalizeDashboardScope(dashboardRaw)
            : moduloScope?.dashboard || DASHBOARD_SCOPE_LEGACY,
          grupo: normalizeGrupoScope(ind.grupo_scope),
        },
      ];
    })
  );
}

async function getScopeFromEntityRecord(
  env: Env,
  gasSecret: string,
  entity: string,
  record: JsonMap,
  ctx?: { moduloMap?: Map<string, ScopeInfo>; indicadorMap?: Map<string, ScopeInfo> }
): Promise<ScopeInfo> {
  if (entity === 'Modulo') return readRecordScope(record);
  if (entity === 'Indicador') {
    const dashboardRaw = toTrimmedString(record.dashboard_scope);
    if (dashboardRaw) return readRecordScope(record);
    let moduloMap = ctx?.moduloMap;
    if (!moduloMap) moduloMap = await buildModuloScopeMap(env, gasSecret);
    const moduloScope = moduloMap.get(toTrimmedString(record.modulo_id));
    return {
      dashboard: moduloScope?.dashboard || DASHBOARD_SCOPE_LEGACY,
      grupo: normalizeGrupoScope(record.grupo_scope),
    };
  }
  if (entity === 'Meta' || entity === 'Lancamento') {
    const dashboardRaw = toTrimmedString(record.dashboard_scope);
    if (dashboardRaw) return readRecordScope(record);
    let indicadorMap = ctx?.indicadorMap;
    if (!indicadorMap) {
      let moduloMap = ctx?.moduloMap;
      if (!moduloMap) moduloMap = await buildModuloScopeMap(env, gasSecret);
      indicadorMap = await buildIndicadorScopeMap(env, gasSecret, moduloMap);
    }
    const indicadorScope = indicadorMap.get(toTrimmedString(record.indicador_id));
    return {
      dashboard: indicadorScope?.dashboard || DASHBOARD_SCOPE_LEGACY,
      grupo: normalizeGrupoScope(record.grupo_scope || indicadorScope?.grupo || ''),
    };
  }
  return { dashboard: DASHBOARD_SCOPE_LEGACY, grupo: '' };
}

async function filterEntityRowsByScope(
  env: Env,
  gasSecret: string,
  entity: string,
  rows: JsonMap[],
  rules: ScopeRule[],
  action: string
): Promise<JsonMap[]> {
  if (!SCOPED_ENTITIES.has(entity) || rows.length === 0) return rows;
  const moduloMap = await buildModuloScopeMap(env, gasSecret);
  const indicadorMap =
    entity === 'Meta' || entity === 'Lancamento'
      ? await buildIndicadorScopeMap(env, gasSecret, moduloMap)
      : undefined;
  return rows.filter((row) => {
    let scope: ScopeInfo;
    if (entity === 'Modulo') {
      scope = {
        dashboard: normalizeDashboardScope(row.dashboard_scope),
        grupo: '',
      };
    } else if (entity === 'Indicador') {
      const moduloScope = moduloMap.get(toTrimmedString(row.modulo_id));
      const dashboardRaw = toTrimmedString(row.dashboard_scope);
      scope = {
        dashboard: dashboardRaw
          ? normalizeDashboardScope(dashboardRaw)
          : moduloScope?.dashboard || DASHBOARD_SCOPE_LEGACY,
        grupo: normalizeGrupoScope(row.grupo_scope),
      };
    } else {
      const indicadorScope = indicadorMap?.get(toTrimmedString(row.indicador_id));
      const dashboardRaw = toTrimmedString(row.dashboard_scope);
      scope = {
        dashboard: dashboardRaw
          ? normalizeDashboardScope(dashboardRaw)
          : indicadorScope?.dashboard || DASHBOARD_SCOPE_LEGACY,
        grupo: normalizeGrupoScope(row.grupo_scope || indicadorScope?.grupo || ''),
      };
    }
    return matchesScopeRule(rules, action, scope.dashboard, scope.grupo);
  });
}

async function getGestorBySession(env: Env, gasSecret: string, session: JsonMap): Promise<JsonMap | null> {
  const id = toTrimmedString(session.id);
  if (!id) return null;
  const byId = await callGasEntity(env, gasSecret, 'Gestor', 'filter', { filter: { id } });
  if (byId.length > 0) return byId[0];
  return null;
}

function isEntityMutation(payload: JsonMap): boolean {
  if (toTrimmedString(payload.kind).toLowerCase() !== 'entity') return false;
  const operation = toTrimmedString(payload.operation).toLowerCase();
  return operation === 'create' || operation === 'update' || operation === 'delete';
}

function validateSensitiveEntityPermission(payload: JsonMap, userSession: JsonMap): Response | null {
  if (!isEntityMutation(payload)) return null;
  const entity = toTrimmedString(payload.entity);
  const userType = toTrimmedString(userSession.tipo).toLowerCase();
  if (SENSITIVE_ENTITIES.has(entity) && userType !== 'escritorio') {
    return jsonResponse(
      {
        ok: false,
        error: `Permissão negada: somente escritório pode alterar registros de ${entity}.`,
      },
      403
    );
  }
  return null;
}

async function validateScopedEntityPermission(
  env: Env,
  gasSecret: string,
  payload: JsonMap,
  userSession: JsonMap
): Promise<Response | null> {
  const entity = toTrimmedString(payload.entity);
  const operation = toTrimmedString(payload.operation).toLowerCase();
  if (toTrimmedString(payload.kind).toLowerCase() !== 'entity') return null;
  if (!SCOPED_ENTITIES.has(entity)) return null;
  const action = toEntityOperationScopeAction(entity, operation);
  if (!action) return null;
  if (operation === 'list' || operation === 'filter') return null;

  const userType = toTrimmedString(userSession.tipo).toLowerCase();
  if (!userType || userType === 'escritorio') return null;
  if (userType !== 'gestor') {
    return jsonResponse(
      { ok: false, error: 'Permissão negada: tipo de usuário não autorizado para operação em escopo.' },
      403
    );
  }

  const gestor = await getGestorBySession(env, gasSecret, userSession);
  if (!gestor) {
    return jsonResponse(
      { ok: false, error: 'Permissão negada: perfil do membro não encontrado para validar escopo.' },
      403
    );
  }

  const rules = parseScopeRules(gestor.permissoes_escopo);
  if (rules.length === 0) return null; // legado: sem regras explícitas mantém comportamento anterior

  const moduloMap = await buildModuloScopeMap(env, gasSecret);
  const indicadorMap =
    entity === 'Meta' || entity === 'Lancamento'
      ? await buildIndicadorScopeMap(env, gasSecret, moduloMap)
      : undefined;
  const ctx = { moduloMap, indicadorMap };

  let existingRecord: JsonMap | null = null;
  if (operation === 'update' || operation === 'delete') {
    const id = toTrimmedString(payload.id);
    if (!id) {
      return jsonResponse({ ok: false, error: 'Permissão negada: id obrigatório para validar escopo.' }, 403);
    }
    const existingRows = await callGasEntity(env, gasSecret, entity, 'filter', { filter: { id } });
    existingRecord = existingRows.length > 0 ? parseBodyAsObject(existingRows[0]) : null;
    if (!existingRecord) {
      return jsonResponse(
        { ok: false, error: `Permissão negada: registro de ${entity} não encontrado para validar escopo.` },
        403
      );
    }
  }

  const record = parseBodyAsObject(payload.record || {});
  const targetRecords: JsonMap[] = [];
  if (operation === 'create') {
    targetRecords.push(record);
  } else if (operation === 'update') {
    targetRecords.push(existingRecord || {});
    targetRecords.push({ ...(existingRecord || {}), ...record });
  } else if (operation === 'delete') {
    targetRecords.push(existingRecord || {});
  }

  for (const candidate of targetRecords) {
    const scope = await getScopeFromEntityRecord(env, gasSecret, entity, candidate, ctx);
    if (entity !== 'Modulo' && scope.dashboard === DASHBOARD_SCOPE_COMISSOES && !scope.grupo) {
      return jsonResponse(
        {
          ok: false,
          error:
            'Permissão negada: registros do Dashboard Comissões exigem grupo de comissão (grupo_scope).',
        },
        403
      );
    }
    const allowed = matchesScopeRule(rules, action, scope.dashboard, scope.grupo);
    if (!allowed) {
      return jsonResponse(
        {
          ok: false,
          error: `Permissão negada: seu perfil não pode executar ${action} no escopo dashboard=${scope.dashboard}${
            scope.grupo ? `, grupo=${scope.grupo}` : ''
          }.`,
        },
        403
      );
    }
  }
  return null;
}

async function applyScopedFilterToResponse(
  env: Env,
  gasSecret: string,
  payload: JsonMap,
  parsed: unknown,
  userSession: JsonMap | null
): Promise<unknown> {
  const entity = toTrimmedString(payload.entity);
  const operation = toTrimmedString(payload.operation).toLowerCase();
  if (toTrimmedString(payload.kind).toLowerCase() !== 'entity') return parsed;
  if (!SCOPED_ENTITIES.has(entity)) return parsed;
  if (operation !== 'list' && operation !== 'filter') return parsed;

  const envelope = parseBodyAsObject(parsed);
  if (envelope.ok !== true || !Array.isArray(envelope.data)) return parsed;
  const rows = envelope.data as JsonMap[];
  const requestedEntityType = ENTITIES_WITH_ENTITY_TYPE.has(entity)
    ? requestedEntityTypeFromPayload(payload)
    : '';
  let filtered = rows;

  if (!userSession) {
    // Leitura pública: por padrão legado; quando o cliente solicita explicitamente
    // dashboard_scope=comissoes, retorna apenas dados de comissões.
    const rawFilter =
      payload.filter && typeof payload.filter === 'object' && !Array.isArray(payload.filter)
        ? (payload.filter as JsonMap)
        : null;
    const requestedScope = normalizeDashboardScope(rawFilter?.dashboard_scope);
    const publicScope =
      requestedScope === DASHBOARD_SCOPE_COMISSOES || requestedScope === DASHBOARD_SCOPE_PRATICAS_MEDICAS
        ? requestedScope
        : DASHBOARD_SCOPE_LEGACY;
    filtered = await filterEntityRowsByScope(
      env,
      gasSecret,
      entity,
      rows,
      [{ acao: ACTION_VISUALIZAR, dashboard: publicScope, grupo: WILDCARD }],
      ACTION_VISUALIZAR
    );
  } else {
    const userType = toTrimmedString(userSession.tipo).toLowerCase();
    if (userType === 'gestor') {
      const gestor = await getGestorBySession(env, gasSecret, userSession);
      if (!gestor) {
        filtered = [];
      } else {
        const rules = parseScopeRules(gestor.permissoes_escopo);
        if (rules.length > 0) {
          filtered = await filterEntityRowsByScope(
            env,
            gasSecret,
            entity,
            rows,
            rules,
            ACTION_VISUALIZAR
          );
        }
      }
    }
  }
  if (ENTITIES_WITH_ENTITY_TYPE.has(entity)) {
    filtered = filtered.filter((row) => normalizeEntityType(row.entity_type, ENTITY_TYPE_SETOR) === requestedEntityType);
  }
  return {
    ...envelope,
    data: filtered,
  };
}

function statusMeta(valor: number | null, meta: number | null, direcaoRaw: unknown): 'ok' | 'atencao' | 'sem_dados' {
  if (valor === null || meta === null) return 'sem_dados';
  const direcao = toTrimmedString(direcaoRaw).toLowerCase();
  const menorMelhor = direcao.includes('menor');
  if (menorMelhor) return valor <= meta ? 'ok' : 'atencao';
  return valor >= meta ? 'ok' : 'atencao';
}

function normalizeStringArray(v: unknown, fallback: string[]): string[] {
  if (!Array.isArray(v)) return fallback;
  const out = v.map((item) => toTrimmedString(item)).filter(Boolean);
  return out.length ? out.slice(0, 6) : fallback;
}

function normalizeConfianca(v: unknown): 'baixa' | 'media' | 'alta' {
  const s = toTrimmedString(v).toLowerCase();
  if (s === 'baixa' || s === 'alta') return s;
  return 'media';
}

function extractJsonObjectFromText(text: string): JsonMap | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  try {
    return parseBodyAsObject(JSON.parse(trimmed));
  } catch {
    // noop
  }
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    return parseBodyAsObject(JSON.parse(trimmed.slice(start, end + 1)));
  } catch {
    return null;
  }
}

function fallbackSummary(
  setorNome: string,
  moduloNome: string,
  mes: number,
  ano: number,
  indicadoresResumo: JsonMap[]
): JsonMap {
  type SummaryTotals = { ok: number; atencao: number; sem_dados: number };
  const totais = indicadoresResumo.reduce(
    (acc: SummaryTotals, item) => {
      const s = toTrimmedString(item.status);
      if (s === 'ok') acc.ok += 1;
      else if (s === 'atencao') acc.atencao += 1;
      else acc.sem_dados += 1;
      return acc;
    },
    { ok: 0, atencao: 0, sem_dados: 0 } as SummaryTotals
  );

  const topAtencao = indicadoresResumo
    .filter((item) => toTrimmedString(item.status) === 'atencao')
    .slice(0, 3)
    .map((item) => `Revisar ${toTrimmedString(item.nome)} (valor ${toTrimmedString(item.valor_mes)}).`);

  return {
    resumo_executivo: `Resumo automático para ${moduloNome} (${setorNome}) em ${mes}/${ano}: ${totais.ok} indicadores em meta, ${totais.atencao} em atenção e ${totais.sem_dados} sem dados.`,
    pontos_criticos:
      topAtencao.length > 0
        ? topAtencao
        : ['Não há indicadores críticos evidentes no período, mas há itens sem dados para acompanhar.'],
    acoes_recomendadas: [
      'Validar registros faltantes e conferir consistência de lançamento no mês.',
      'Priorizar indicadores em atenção com plano de ação e responsável definido.',
      'Revisar aderência às metas do módulo antes da próxima reunião de gestão.',
    ],
    riscos: [
      'Dados incompletos podem mascarar piora operacional.',
      'Sem acompanhamento semanal, desvios podem persistir até o fechamento do mês.',
    ],
    confianca: totais.sem_dados > 0 ? 'media' : 'alta',
  };
}

async function fetchGasJson(env: Env, gasSecret: string, body: JsonMap): Promise<{ status: number; parsed: unknown }> {
  const gasRes = await fetch(env.GAS_WEBAPP_URL, {
    method: 'POST',
    redirect: 'follow',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      ...body,
      _gasSecret: gasSecret,
    }),
  });
  const text = await gasRes.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(`GAS non-JSON (status ${gasRes.status})`);
  }
  return { status: gasRes.ok ? 200 : gasRes.status, parsed };
}

async function callGasEntity(env: Env, gasSecret: string, entity: string, operation: string, extra: JsonMap = {}) {
  const { parsed } = await fetchGasJson(env, gasSecret, {
    kind: 'entity',
    entity,
    operation,
    ...extra,
  });
  const envelope = parseBodyAsObject(parsed);
  if (envelope.ok !== true) {
    throw new Error(toTrimmedString(envelope.error) || `Falha ao consultar entidade ${entity}`);
  }
  if (!Array.isArray(envelope.data)) {
    throw new Error(`Resposta inválida da entidade ${entity}`);
  }
  return envelope.data as JsonMap[];
}

async function callGeminiSummary(env: Env, prompt: string): Promise<{ model: string; parsed: JsonMap | null }> {
  const apiKey = toTrimmedString(env.GEMINI_API_KEY);
  if (!apiKey) {
    throw new Error('Worker misconfigured: GEMINI_API_KEY missing');
  }
  const model = toTrimmedString(env.GEMINI_MODEL) || DEFAULT_GEMINI_MODEL;
  const endpoint = `${GEMINI_API_BASE}/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      signal: controller.signal,
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 800,
          responseMimeType: 'application/json',
        },
      }),
    });
    const payload = await res.json();
    if (!res.ok) {
      throw new Error(`Gemini HTTP ${res.status}`);
    }
    const root = parseBodyAsObject(payload);
    const candidates = Array.isArray(root.candidates) ? root.candidates : [];
    const first = candidates[0] as JsonMap | undefined;
    const content = first && parseBodyAsObject(first.content);
    const parts = content && Array.isArray(content.parts) ? content.parts : [];
    const text = parts
      .map((part) => {
        if (!part || typeof part !== 'object') return '';
        return toTrimmedString((part as JsonMap).text);
      })
      .join('\n')
      .trim();
    return { model, parsed: extractJsonObjectFromText(text) };
  } finally {
    clearTimeout(timeout);
  }
}

async function handleAiSummary(
  request: Request,
  env: Env,
  corsHeaders: Record<string, string>
): Promise<Response> {
  const traceId = createTraceId();
  let body: JsonMap;
  try {
    body = parseBodyAsObject(await request.json());
  } catch {
    return jsonResponse({ ok: false, error: 'Invalid JSON body' }, 400, corsHeaders);
  }
  const setorId = toTrimmedString(body.setor_id);
  const moduloId = toTrimmedString(body.modulo_id);
  let mes: number;
  let ano: number;
  try {
    mes = parseIntField(body, 'mes', 1, 12);
    ano = parseIntField(body, 'ano', 2000, 2100);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Payload inválido';
    return jsonResponse({ ok: false, error: message }, 400, corsHeaders);
  }
  if (!setorId || !moduloId) {
    return jsonResponse({ ok: false, error: 'Campos "setor_id" e "modulo_id" são obrigatórios.' }, 400, corsHeaders);
  }

  const gasSecret = normalizeSecret(env.GAS_SECRET);
  const webappUrl = toTrimmedString(env.GAS_WEBAPP_URL);
  if (!webappUrl || !gasSecret) {
    console.error('[ai.summary] misconfigured', redactSensitive({ traceId, hasWebappUrl: !!webappUrl, hasGasSecret: !!gasSecret }));
    return internalErrorResponse(traceId, corsHeaders);
  }

  const [setores, modulos, indicadores, metasAno, lancamentosAno] = await Promise.all([
    callGasEntity(env, gasSecret, 'Setor', 'filter', { filter: { id: setorId } }),
    callGasEntity(env, gasSecret, 'Modulo', 'filter', { filter: { id: moduloId } }),
    callGasEntity(env, gasSecret, 'Indicador', 'filter', { filter: { modulo_id: moduloId } }),
    callGasEntity(env, gasSecret, 'Meta', 'filter', { filter: { ano, setor_id: setorId } }),
    callGasEntity(env, gasSecret, 'Lancamento', 'filter', { filter: { ano, setor_id: setorId, mes } }),
  ]);

  const setor = setores[0];
  const modulo = modulos[0];
  if (!setor || !modulo) {
    return jsonResponse({ ok: false, error: 'Setor ou módulo não encontrado.' }, 404, corsHeaders);
  }

  const indicadoresContexto = indicadores
    .slice()
    .sort((a, b) => Number(a.ordem ?? 9999) - Number(b.ordem ?? 9999))
    .slice(0, MAX_INDICADORES_CONTEXTO);

  const indicadoresResumo = indicadoresContexto.map((ind) => {
    const lanc = lancamentosAno.find((l) => sameId(l.indicador_id, ind.id));
    const meta = metasAno.find((m) => sameId(m.indicador_id, ind.id));
    const valor = numberOrNull(lanc?.valor);
    const valorMeta = numberOrNull(meta?.valor);
    const delta = valor !== null && valorMeta !== null ? Number((valor - valorMeta).toFixed(2)) : null;
    return {
      indicador_id: ind.id,
      nome: toTrimmedString(ind.label || ind.nome || ind.id),
      unidade: toTrimmedString(ind.unidade || ''),
      valor_mes: valor,
      meta: valorMeta,
      delta_meta: delta,
      status: statusMeta(valor, valorMeta, ind.tipo_direcao_meta),
    };
  });

  const contextoSeguro = {
    setor_nome: toTrimmedString(setor.nome || setor.id),
    modulo_nome: toTrimmedString(modulo.nome || modulo.id),
    periodo: { mes, ano },
    total_indicadores: indicadoresResumo.length,
    indicadores: indicadoresResumo,
  };

  const prompt = [
    'Você é um analista de indicadores hospitalares.',
    'Responda somente JSON válido com os campos: resumo_executivo (string), pontos_criticos (string[]), acoes_recomendadas (string[]), riscos (string[]), confianca ("baixa"|"media"|"alta").',
    'Use linguagem objetiva para gestão. Não invente dados ausentes; cite ausência quando necessário.',
    'Contexto (sem dados pessoais):',
    JSON.stringify(contextoSeguro),
  ].join('\n');

  let parsedFromModel: JsonMap | null = null;
  let modelUsed = toTrimmedString(env.GEMINI_MODEL) || DEFAULT_GEMINI_MODEL;
  let source: 'gemini' | 'fallback' = 'fallback';
  try {
    const ai = await callGeminiSummary(env, prompt);
    parsedFromModel = ai.parsed;
    modelUsed = ai.model;
    if (parsedFromModel) source = 'gemini';
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[ai.summary] gemini_error', redactSensitive({ message, model: modelUsed }));
  }

  const fallback = fallbackSummary(
    contextoSeguro.setor_nome,
    contextoSeguro.modulo_nome,
    mes,
    ano,
    indicadoresResumo as JsonMap[]
  );
  const output = parsedFromModel || fallback;

  return jsonResponse(
    {
      ok: true,
      data: {
        resumo_executivo: toTrimmedString(output.resumo_executivo || fallback.resumo_executivo),
        pontos_criticos: normalizeStringArray(output.pontos_criticos, fallback.pontos_criticos as string[]),
        acoes_recomendadas: normalizeStringArray(output.acoes_recomendadas, fallback.acoes_recomendadas as string[]),
        riscos: normalizeStringArray(output.riscos, fallback.riscos as string[]),
        confianca: normalizeConfianca(output.confianca || fallback.confianca),
        base_periodo: { mes, ano },
        generated_at: new Date().toISOString(),
        model: modelUsed,
        source,
      },
    },
    200,
    corsHeaders
  );
}

async function issueSessionToken(conta: JsonMap, env: Env): Promise<{ token: string; expiresAt: string } | null> {
  const secret = getAuthSecret(env);
  if (!secret) return null;
  const session: JsonMap = {
    id: toTrimmedString(conta.id),
    login: toTrimmedString(conta.login),
    tipo: toTrimmedString(conta.tipo),
    ativo: conta.ativo,
    unidades: toTrimmedString(conta.unidades),
    divisoes: toTrimmedString(conta.divisoes),
    nivel_acesso: toTrimmedString(conta.nivel_acesso),
    permissoes_escopo: toTrimmedString(conta.permissoes_escopo),
  };
  const token = await signToken({ typ: 'session', session }, secret, SESSION_TOKEN_TTL_SECONDS);
  const expiresAt = new Date(Date.now() + SESSION_TOKEN_TTL_SECONDS * 1000).toISOString();
  return { token, expiresAt };
}

async function issueResetToken(env: Env): Promise<{ token: string; expiresAt: string } | null> {
  const secret = getAuthSecret(env);
  if (!secret) return null;
  const token = await signToken({ typ: RESET_TOKEN_PURPOSE }, secret, RESET_TOKEN_TTL_SECONDS);
  const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_SECONDS * 1000).toISOString();
  return { token, expiresAt };
}

async function isValidResetToken(env: Env, token: unknown): Promise<boolean> {
  const raw = toTrimmedString(token);
  if (!raw) return false;
  const secret = getAuthSecret(env);
  if (!secret) return false;
  const payload = await verifyToken(raw, secret);
  return !!payload && toTrimmedString(payload.typ) === RESET_TOKEN_PURPOSE;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const traceId = createTraceId();
    const url = new URL(request.url);
    const pathname = normalizePathname(url.pathname);
    const isApi = pathname === '/api';
    const isAiSummary = pathname === '/api/ai/summary';
    const isHealth = pathname === '/health';
    const corsHeaders = buildCorsHeaders(request, env);
    const isCorsProtectedPath = isApi || isHealth || isAiSummary;

    if (isCorsProtectedPath && !corsHeaders) {
      return jsonResponse({ ok: false, error: 'CORS origin não permitida.' }, 403);
    }

    if (request.method === 'OPTIONS' && isCorsProtectedPath) {
      return new Response(null, { status: 204, headers: corsHeaders || BASE_CORS_HEADERS });
    }

    if (request.method === 'GET' && isHealth) {
      return jsonResponse({ ok: true, service: 'dashboardhu' }, 200, corsHeaders || BASE_CORS_HEADERS);
    }

    if (!isApi && !isAiSummary) {
      // Demais rotas: assets estáticos + SPA (wrangler.toml run_worker_first)
      return env.ASSETS.fetch(request);
    }

    if (request.method !== 'POST') {
      return jsonResponse({ ok: false, error: 'Method not allowed' }, 405, corsHeaders || BASE_CORS_HEADERS);
    }

    try {
      if (isAiSummary) {
        return await handleAiSummary(request, env, corsHeaders || BASE_CORS_HEADERS);
      }

      const rawBody = await request.text();
      const parsedBody = parseAndValidateRequestText(rawBody);
      if (!parsedBody.ok) {
        return validationErrorResponse(parsedBody.errors || [], corsHeaders || BASE_CORS_HEADERS);
      }
      const payload = parsedBody.sanitized as Record<string, unknown>;

      const headerGasSecret = normalizeSecret(request.headers.get('X-GAS-Secret'));
      const envGasSecret = normalizeSecret(env.GAS_SECRET);
      const gasSecret = envGasSecret || headerGasSecret;
      const hasWebappUrl = !!toTrimmedString(env.GAS_WEBAPP_URL);

      if (!hasWebappUrl || !gasSecret) {
        console.error(
          '[worker] backend_misconfigured',
          redactSensitive({ traceId, path: url.pathname, hasWebappUrl, hasGasSecret: !!gasSecret })
        );
        return internalErrorResponse(traceId, corsHeaders || BASE_CORS_HEADERS);
      }

      const userSession = await readSessionFromAuthHeader(request, env);
      const isMutation = isEntityMutation(payload);
      const entity = toTrimmedString(payload.entity);
      const operation = toTrimmedString(payload.operation).toLowerCase();
      const isScopedMutation = isMutation && SCOPED_ENTITIES.has(entity);

      if (isMutation && !userSession) {
        return jsonResponse(
          { ok: false, error: 'Permissão negada: sessão válida obrigatória para alteração de dados.' },
          403,
          corsHeaders || BASE_CORS_HEADERS
        );
      }

      const isAutenticarCall =
        toTrimmedString(payload.kind).toLowerCase() === 'function' && toTrimmedString(payload.name) === 'autenticar';
      if (isAutenticarCall) {
        const functionPayload =
          payload.payload && typeof payload.payload === 'object' && !Array.isArray(payload.payload)
            ? (payload.payload as JsonMap)
            : {};
        const action = toTrimmedString(functionPayload.action);
        if (action === 'request_reset_token') {
          const configuredPin = normalizeSecret(env.RESET_PIN);
          if (!configuredPin) {
            console.error('[worker] reset_pin_missing', redactSensitive({ traceId, path: url.pathname }));
            return internalErrorResponse(traceId, corsHeaders || BASE_CORS_HEADERS);
          }
          const suppliedPin = normalizeSecret(functionPayload.pin);
          if (!suppliedPin || suppliedPin !== configuredPin) {
            return jsonResponse({ ok: false, error: 'PIN inválido.' }, 403, corsHeaders || BASE_CORS_HEADERS);
          }
          const issued = await issueResetToken(env);
          if (!issued) {
            console.error('[worker] auth_secret_missing', redactSensitive({ traceId, path: url.pathname }));
            return internalErrorResponse(traceId, corsHeaders || BASE_CORS_HEADERS);
          }
          return jsonResponse(
            { ok: true, data: { success: true, reset_token: issued.token, expires_at: issued.expiresAt } },
            200,
            corsHeaders || BASE_CORS_HEADERS
          );
        }
        if (action === 'reset') {
          const resetTokenOk = await isValidResetToken(env, functionPayload.reset_token);
          const canResetBySession = userSession && toTrimmedString(userSession.tipo).toLowerCase() === 'escritorio';
          if (!resetTokenOk && !canResetBySession) {
            return jsonResponse(
              { ok: false, error: 'Permissão negada: token de reset inválido ou expirado.' },
              403,
              corsHeaders || BASE_CORS_HEADERS
            );
          }
          delete functionPayload.reset_token;
          payload.payload = functionPayload;
        }
      }

      if (userSession) {
        const sensitiveError = validateSensitiveEntityPermission(payload, userSession);
        if (sensitiveError) return withCors(sensitiveError, corsHeaders || BASE_CORS_HEADERS);
      }

      const permissionError =
        userSession && isScopedMutation
          ? await validateScopedEntityPermission(env, gasSecret, payload, userSession)
          : null;
      if (permissionError) return withCors(permissionError, corsHeaders || BASE_CORS_HEADERS);

      if (toTrimmedString(payload.kind).toLowerCase() === 'entity' && ENTITIES_WITH_ENTITY_TYPE.has(entity)) {
        if (operation === 'create') {
          const record =
            payload.record && typeof payload.record === 'object' && !Array.isArray(payload.record)
              ? (payload.record as JsonMap)
              : {};
          payload.record = {
            ...record,
            entity_type: normalizeEntityType(record.entity_type, ENTITY_TYPE_SETOR),
          };
        } else if (operation === 'update') {
          const record =
            payload.record && typeof payload.record === 'object' && !Array.isArray(payload.record)
              ? (payload.record as JsonMap)
              : {};
          if (toTrimmedString(record.entity_type)) {
            payload.record = {
              ...record,
              entity_type: normalizeEntityType(record.entity_type, ENTITY_TYPE_SETOR),
            };
          }
        } else if (operation === 'filter') {
          const filter =
            payload.filter && typeof payload.filter === 'object' && !Array.isArray(payload.filter)
              ? (payload.filter as JsonMap)
              : {};
          payload.filter = {
            ...filter,
            entity_type: normalizeEntityType(filter.entity_type, ENTITY_TYPE_SETOR),
          };
        } else if (operation === 'list') {
          payload.operation = 'filter';
          payload.filter = {
            entity_type: ENTITY_TYPE_SETOR,
          };
        }
      }

      const { _gasSecret: _drop, _userSession: _dropUser, ...rest } = payload;
      const { status, parsed } = await fetchGasJson(env, gasSecret, rest);
      let parsedWithScopeFilter = await applyScopedFilterToResponse(
        env,
        gasSecret,
        rest,
        parsed,
        userSession
      );
      if (isAutenticarCall) {
        const envelope = parsedWithScopeFilter && typeof parsedWithScopeFilter === 'object' ? (parsedWithScopeFilter as JsonMap) : null;
        const data = envelope && envelope.data && typeof envelope.data === 'object' ? (envelope.data as JsonMap) : null;
        if (data && data.success === true && data.conta && typeof data.conta === 'object' && !Array.isArray(data.conta)) {
          const issued = await issueSessionToken(data.conta as JsonMap, env);
          if (issued) {
            parsedWithScopeFilter = {
              ...envelope,
              data: {
                ...data,
                conta: {
                  ...(data.conta as JsonMap),
                  session_token: issued.token,
                  session_expires_at: issued.expiresAt,
                },
              },
            };
          }
        }
      }
      if (isGasUnauthorizedEnvelope(parsedWithScopeFilter)) {
        console.error('[worker] gas_unauthorized', redactSensitive({ traceId, path: url.pathname }));
        return internalErrorResponse(traceId, corsHeaders || BASE_CORS_HEADERS, 502, 'Falha ao processar requisição upstream.');
      }
      return new Response(JSON.stringify(parsedWithScopeFilter), {
        status,
        headers: {
          'Content-Type': 'application/json',
          ...(corsHeaders || BASE_CORS_HEADERS),
        },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(
        '[worker] request_error',
        redactSensitive({
          traceId,
          path: url.pathname,
          message,
        })
      );
      return jsonResponse(
        {
          ok: false,
          error: 'Erro interno ao processar requisição.',
          traceId,
        },
        500,
        corsHeaders || BASE_CORS_HEADERS
      );
    }
  },
};
