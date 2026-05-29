import DashboardComissoes from '@/pages/DashboardComissoes';

export default function DashboardPraticasMedicas({ ano, mes }) {
  return <DashboardComissoes ano={ano} mes={mes} context="praticas_medicas" />;
}
