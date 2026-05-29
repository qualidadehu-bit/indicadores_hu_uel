import { BarChart3, ClipboardList, Eye, LayoutDashboard, Settings, Users } from 'lucide-react';
import { gestorPodeAcessarConfiguracao } from '@/lib/gestorNivelAcesso';
import { ACAO_VISUALIZAR, canUserPerformScopedAction } from '@/lib/scopePermissions';
import { DASHBOARD_SCOPE_COMISSOES, DASHBOARD_SCOPE_PRATICAS_MEDICAS } from '@/lib/dashboardScope';

export const NAV_ITEMS = [
  { path: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { path: '/dashboard-comissoes', label: 'Dashboard Comissões', icon: Users },
  { path: '/dashboard-praticas-medicas', label: 'Dashboard Práticas Médicas', icon: Users },
  { path: '/lancamento-setores', label: 'Lançamento Setores', icon: ClipboardList },
  { path: '/lancamento-comissoes', label: 'Lançamento Comissões', icon: ClipboardList },
  { path: '/lancamento-praticas-medicas', label: 'Lançamento Práticas Médicas', icon: ClipboardList },
  { path: '/comparacao', label: 'Comparação', icon: BarChart3 },
  { path: '/visao-executiva', label: 'Visão Executiva', icon: Eye },
  { path: '/configuracao', label: 'Configuração', icon: Settings },
];

const PUBLIC_NAV_PATHS = new Set(['/visualizacao', '/visualizacao/comissoes', '/visualizacao/clinicas']);

export function getVisibleNavItems(user, isPublic = false) {
  if (isPublic) {
    return NAV_ITEMS.filter((item) => PUBLIC_NAV_PATHS.has(item.path));
  }

  let items = NAV_ITEMS;
  if (!gestorPodeAcessarConfiguracao(user)) {
    items = items.filter((item) => item.path !== '/configuracao');
  }
  const podeVerComissoes = canUserPerformScopedAction(user, ACAO_VISUALIZAR, {
    dashboard: DASHBOARD_SCOPE_COMISSOES,
  });
  const podeVerPraticasMedicas = canUserPerformScopedAction(user, ACAO_VISUALIZAR, {
    dashboard: DASHBOARD_SCOPE_PRATICAS_MEDICAS,
  });
  if (!podeVerComissoes) {
    items = items.filter((item) => item.path !== '/dashboard-comissoes' && item.path !== '/lancamento-comissoes');
  }
  if (!podeVerPraticasMedicas) {
    items = items.filter(
      (item) => item.path !== '/dashboard-praticas-medicas' && item.path !== '/lancamento-praticas-medicas'
    );
  }
  return items;
}
