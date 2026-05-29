/**
 * Escopo de dashboard para separar módulos/indicadores/lançamentos.
 * Registros legados sem coluna/valor continuam no dashboard padrão.
 */

export const DASHBOARD_SCOPE_LEGACY = 'assistencial';
export const DASHBOARD_SCOPE_COMISSOES = 'comissoes';
export const DASHBOARD_SCOPE_PRATICAS_MEDICAS = 'praticas_medicas';

export const DASHBOARD_SCOPE_OPTIONS = [
  { value: DASHBOARD_SCOPE_LEGACY, label: 'Dashboard Assistencial (legado)' },
  { value: DASHBOARD_SCOPE_COMISSOES, label: 'Dashboard Comissões' },
  { value: DASHBOARD_SCOPE_PRATICAS_MEDICAS, label: 'Dashboard Práticas Médicas' },
];

const DASHBOARD_SCOPE_SET = new Set(DASHBOARD_SCOPE_OPTIONS.map((op) => op.value));

/**
 * @param {unknown} raw
 * @returns {'assistencial'|'comissoes'|'praticas_medicas'}
 */
export function normalizeDashboardScope(raw) {
  const value = String(raw ?? '')
    .trim()
    .toLowerCase();
  const valueFlat = value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\s-]+/g, '_');
  if (valueFlat === 'comissoes' || valueFlat === 'dashboard_comissoes') return DASHBOARD_SCOPE_COMISSOES;
  if (
    valueFlat === 'praticas_medicas' ||
    valueFlat === 'praticas' ||
    valueFlat === 'clinicas' ||
    valueFlat === 'dashboard_praticas_medicas'
  ) {
    return DASHBOARD_SCOPE_PRATICAS_MEDICAS;
  }
  if (valueFlat === 'assistencial' || valueFlat === 'dashboard_assistencial' || valueFlat === 'legado') {
    return DASHBOARD_SCOPE_LEGACY;
  }
  if (DASHBOARD_SCOPE_SET.has(value)) return /** @type {'assistencial'|'comissoes'|'praticas_medicas'} */ (value);
  return DASHBOARD_SCOPE_LEGACY;
}

/**
 * Escopo efetivo de módulo.
 * Campo vazio/ausente = legado.
 * @param {Record<string, unknown>|null|undefined} modulo
 */
export function getModuloDashboardScope(modulo) {
  return normalizeDashboardScope(modulo?.dashboard_scope);
}

/**
 * Escopo efetivo de indicador:
 * - usa `indicador.dashboard_scope` quando presente/válido
 * - senão herda de `modulo.dashboard_scope`
 * - senão cai no legado
 * @param {Record<string, unknown>|null|undefined} indicador
 * @param {Record<string, unknown>|null|undefined} modulo
 */
export function getIndicadorDashboardScope(indicador, modulo) {
  const rawIndicador = String(indicador?.dashboard_scope ?? '').trim();
  if (rawIndicador) return normalizeDashboardScope(rawIndicador);
  return getModuloDashboardScope(modulo);
}

/**
 * @param {any[]} modulos
 * @param {'assistencial'|'comissoes'|'praticas_medicas'} scope
 * @returns {any[]}
 */
export function filtrarModulosPorDashboardScope(modulos, scope) {
  const target = normalizeDashboardScope(scope);
  return (modulos || []).filter((m) => getModuloDashboardScope(m) === target);
}

/**
 * @param {any[]} indicadores
 * @param {Map<string, any>} moduloById
 * @param {'assistencial'|'comissoes'|'praticas_medicas'} scope
 * @returns {any[]}
 */
export function filtrarIndicadoresPorDashboardScope(indicadores, moduloById, scope) {
  const target = normalizeDashboardScope(scope);
  return (indicadores || []).filter((ind) => {
    const modulo = moduloById.get(String(ind.modulo_id ?? ''));
    return getIndicadorDashboardScope(ind, modulo) === target;
  });
}
