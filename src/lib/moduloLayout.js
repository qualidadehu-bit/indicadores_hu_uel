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
  if (modulo.nome === 'Lesão por Pressão (LP)') return true;
  return false;
}

/**
 * Preset visual LP (Expostos, Novos Casos, incidência derivada, densidade em área).
 */
export function isLesaoPressaoModuleShape(modulo, indicadores) {
  if (modulo?.nome === 'Lesão por Pressão (LP)') return true;
  const tokens = new Set();
  for (const i of indicadores || []) {
    const l = String(i.label || '').trim();
    const n = String(i.nome || '').trim();
    if (l) tokens.add(l);
    if (n) tokens.add(n);
  }
  return tokens.has('Expostos') && tokens.has('Novos Casos');
}
