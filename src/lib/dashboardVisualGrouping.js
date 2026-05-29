/** @param {unknown} v */
function asTrimmed(v) {
  return v == null ? '' : String(v).trim();
}

/**
 * Agrupador visual universal (fluxo novo):
 * - prioridade: grupo_visual
 * - fallback temporário: grupo_serie (legado)
 * @param {Record<string, unknown>|null|undefined} indicador
 */
export function getIndicadorGrupoVisual(indicador) {
  return asTrimmed(indicador?.grupo_visual) || asTrimmed(indicador?.grupo_serie);
}

/**
 * Nome da série/fatia exibido nos gráficos:
 * - prioridade: nome_serie
 * - fallback: label/nome
 * @param {Record<string, unknown>|null|undefined} indicador
 */
export function getIndicadorNomeSerie(indicador) {
  return (
    asTrimmed(indicador?.nome_serie) ||
    asTrimmed(indicador?.label) ||
    asTrimmed(indicador?.nome) ||
    '—'
  );
}

