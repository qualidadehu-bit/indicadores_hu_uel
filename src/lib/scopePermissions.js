import { normalizeDashboardScope } from '@/lib/dashboardScope';
import { normalizeGrupoComissao } from '@/lib/comissaoGrupos';

export const ACAO_LANCAR_DADOS = 'lancar_dados';
export const ACAO_VISUALIZAR = 'visualizar';
export const ACAO_EDITAR = 'editar';
export const ACAO_ADMIN = 'admin';

export const ACOES_ESCOPO_OPTIONS = [
  { value: ACAO_LANCAR_DADOS, label: 'Lançar dados' },
  { value: ACAO_VISUALIZAR, label: 'Visualizar' },
  { value: ACAO_EDITAR, label: 'Editar' },
  { value: ACAO_ADMIN, label: 'Administrar' },
];

const WILDCARD = '*';

/**
 * @param {unknown} raw
 * @returns {string}
 */
function normalizeScopeAction(raw) {
  const value = String(raw || '').trim().toLowerCase();
  const flat = value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\s-]+/g, '_');
  if (!flat) return '';
  if (flat === WILDCARD) return WILDCARD;
  if (flat === ACAO_ADMIN || flat === 'administrar' || flat === 'administracao') return ACAO_ADMIN;
  if (flat === ACAO_VISUALIZAR || flat === 'visualizacao' || flat === 'ver') return ACAO_VISUALIZAR;
  if (flat === ACAO_EDITAR || flat === 'edicao') return ACAO_EDITAR;
  if (flat === ACAO_LANCAR_DADOS || flat === 'lancar' || flat === 'lancamento') return ACAO_LANCAR_DADOS;
  return flat;
}

/**
 * @typedef {{
 *  acao: string,
 *  dashboard: string,
 *  grupo?: string,
 * }} ScopePermissionRule
 */

/**
 * @param {unknown} raw
 * @returns {ScopePermissionRule[]}
 */
export function parseScopePermissions(raw) {
  if (raw == null || String(raw).trim() === '') return [];
  try {
    const parsed = JSON.parse(String(raw));
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((r) => normalizeScopePermissionRule(r))
      .filter(Boolean);
  } catch {
    return [];
  }
}

/**
 * @param {unknown} raw
 * @returns {ScopePermissionRule|null}
 */
export function normalizeScopePermissionRule(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const row = /** @type {Record<string, unknown>} */ (raw);
  const acao = normalizeScopeAction(row.acao);
  if (!acao) return null;
  const dashboardRaw = String(row.dashboard || '').trim();
  const dashboard = dashboardRaw === WILDCARD ? WILDCARD : normalizeDashboardScope(dashboardRaw);
  const grupoRaw = String(row.grupo || '').trim();
  const grupo = grupoRaw === WILDCARD ? WILDCARD : normalizeGrupoComissao(grupoRaw);
  return {
    acao,
    dashboard,
    grupo: grupo || '',
  };
}

/**
 * @param {ScopePermissionRule[]} rules
 */
export function serializeScopePermissions(rules) {
  const normalized = (rules || [])
    .map((r) => normalizeScopePermissionRule(r))
    .filter(Boolean);
  return normalized.length ? JSON.stringify(normalized) : '';
}

/**
 * @param {Record<string, unknown>|null|undefined} user
 */
export function getUserScopePermissions(user) {
  return parseScopePermissions(user?.permissoes_escopo);
}

/**
 * @param {ScopePermissionRule[]} rules
 * @param {string} acao
 * @param {{ dashboard: string, grupo?: string }} scope
 */
export function hasScopedPermission(rules, acao, scope) {
  const acaoNorm = normalizeScopeAction(acao);
  const dashboardNorm = normalizeDashboardScope(scope?.dashboard);
  const grupoNorm = normalizeGrupoComissao(scope?.grupo);
  return (rules || []).some((rule) => {
    const acaoOk = rule.acao === acaoNorm || rule.acao === ACAO_ADMIN || rule.acao === WILDCARD;
    const dashboardOk = rule.dashboard === WILDCARD || rule.dashboard === dashboardNorm;
    if (!acaoOk || !dashboardOk) return false;
    const ruleGrupo = normalizeGrupoComissao(rule.grupo);
    if (!ruleGrupo || ruleGrupo === WILDCARD) return true;
    return ruleGrupo === grupoNorm;
  });
}

/**
 * Política frontend:
 * - sem regras cadastradas => mantém legado (permitido)
 * - com regras => exige match por escopo
 * @param {Record<string, unknown>|null|undefined} user
 * @param {string} acao
 * @param {{ dashboard: string, grupo?: string }} scope
 */
export function canUserPerformScopedAction(user, acao, scope) {
  if (!user || String(user.tipo) !== 'gestor') return true;
  const rules = getUserScopePermissions(user);
  if (!rules.length) return true;
  return hasScopedPermission(rules, acao, scope);
}
