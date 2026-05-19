/**
 * Tipos de gráfico do módulo / override por indicador (dashboard genérico).
 * `mapa_calor` e valores desconhecidos caem em linha (comportamento legado).
 */

/**
 * @param {unknown} raw
 * @returns {'linha'|'barra'|'area'|'radar'|'pizza'}
 */
export function normalizeTipoGrafico(raw) {
  const t = String(raw || 'linha').toLowerCase();
  if (['linha', 'barra', 'area', 'radar', 'pizza'].includes(t)) return t;
  return 'linha';
}

/**
 * Override opcional em `ind.tipo_grafico`; vazio = usa o módulo.
 * @param {Record<string, unknown>|null|undefined} ind
 * @param {Record<string, unknown>|null|undefined} modulo
 */
export function tipoGraficoEfetivoIndicador(ind, modulo) {
  const own = ind?.tipo_grafico;
  if (own != null && String(own).trim() !== '') return normalizeTipoGrafico(own);
  return normalizeTipoGrafico(modulo?.tipo_grafico);
}
