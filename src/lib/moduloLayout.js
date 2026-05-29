/** Valores da coluna opcional `layout_dashboard` na aba `modulo` (planilha / API). */
export const LAYOUT_DASHBOARD = {
  PADRAO: 'padrao',
  BUNDLE_KPI_TABELA: 'bundle_kpi_tabela',
};

/**
 * Usa o painel KPI + tabela 12 meses + gráfico (bundle) quando configurado ou legado LP.
 */
export function usesDashboardBundle(modulo) {
  if (!modulo) return false;
  if (modulo.layout_dashboard === LAYOUT_DASHBOARD.BUNDLE_KPI_TABELA) return true;
  return false;
}

/**
 * Preset visual legado removido: agora depende só de metadado explícito.
 */
export function isLesaoPressaoModuleShape(modulo, indicadores) {
  void modulo;
  void indicadores;
  return false;
}
