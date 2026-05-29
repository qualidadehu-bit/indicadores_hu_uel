import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import GenericModuloChartGrid from '@/components/dashboard/GenericModuloChartGrid';
import { MESES } from '@/lib/indicadores';
import { pickLancamentoMes } from '@/lib/lancamentosDashboard';

export default function ModuloDashboardBundle(props) {
  const {
    modulo,
    indicadores,
    lancamentos,
    metas: _metas,
    ano,
    mes,
    setorId,
    setorIdsAtivos: _setorIdsAtivos,
    moduloId,
    getLancamento,
    getMeta,
  } = props || {};
  const inds = Array.isArray(indicadores) ? indicadores : [];
  const getLanc = (indicadorId, sid, mesNum) =>
    getLancamento
      ? getLancamento(indicadorId, sid, mesNum)
      : pickLancamentoMes(lancamentos, indicadorId, mesNum, sid);

  const buildChartData = (indicadorId, sid) =>
    MESES.map((mesLabel, idx) => ({
      mes: mesLabel,
      valor: getLanc(indicadorId, sid, idx + 1)?.valor ?? null,
      meta: getMeta ? getMeta(indicadorId, sid)?.valor ?? null : null,
    }));

  return (
    <Card className="border-border/80 shadow-sm overflow-hidden" data-modulo-id={moduloId} data-setor-id={setorId}>
      <CardHeader className="pb-3 bg-muted/30 border-b border-border/70">
        <CardTitle className="text-base font-jakarta">
          {String(modulo?.nome || 'Modulo')}
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Ano {ano} · Mês {mes}
        </p>
      </CardHeader>
      <CardContent className="pt-4">
        <GenericModuloChartGrid
          modulo={modulo || { id: moduloId, nome: 'Modulo' }}
          indsDoModulo={inds}
          setorParaGrafico={setorId}
          mesAtual={mes}
          anoAtual={ano}
          buildChartData={buildChartData}
          getMeta={getMeta || (() => undefined)}
          getLancamento={getLanc}
        />
      </CardContent>
    </Card>
  );
}
