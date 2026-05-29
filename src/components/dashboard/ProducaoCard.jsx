import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import GenericModuloChartGrid from '@/components/dashboard/GenericModuloChartGrid';
import { MESES } from '@/lib/indicadores';
import { pickLancamentoMes } from '@/lib/lancamentosDashboard';

function moduloFromProps(moduloId) {
  return { id: moduloId, nome: 'Producao', tipo_grafico: 'linha' };
}

export default function ProducaoCard({
  ano,
  mes,
  indicadores,
  lancamentos,
  metas: _metas,
  moduloId,
  setorIds = [],
  setores: _setores,
  anosSelecionados: _anosSelecionados,
  getLancamentoComparado,
  getMetaComparada,
}) {
  const setorPrincipal = useMemo(
    () => (Array.isArray(setorIds) && setorIds.length > 0 ? String(setorIds[0]) : undefined),
    [setorIds]
  );
  const indsModulo = useMemo(
    () =>
      (Array.isArray(indicadores) ? indicadores : []).filter(
        (ind) => String(ind.modulo_id) === String(moduloId)
      ),
    [indicadores, moduloId]
  );

  const getLanc = (indicadorId, sid, mesNum) => {
    if (getLancamentoComparado) return getLancamentoComparado(indicadorId, mesNum, ano);
    return pickLancamentoMes(lancamentos, indicadorId, mesNum, sid || setorPrincipal);
  };

  const buildChartData = (indicadorId, sid) =>
    MESES.map((mesLabel, idx) => ({
      mes: mesLabel,
      valor: getLanc(indicadorId, sid, idx + 1)?.valor ?? null,
      meta: getMetaComparada ? getMetaComparada(indicadorId, ano)?.valor ?? null : null,
    }));

  const getMeta = (indicadorId) =>
    getMetaComparada ? getMetaComparada(indicadorId, ano) : undefined;

  return (
    <Card className="border-border/80 shadow-sm overflow-hidden" data-modulo-id={moduloId} data-setor-id={setorPrincipal}>
      <CardHeader className="pb-3 bg-muted/30 border-b border-border/70">
        <CardTitle className="text-base font-jakarta">Produção</CardTitle>
        <p className="text-xs text-muted-foreground">Ano {ano} · Mês {mes}</p>
      </CardHeader>
      <CardContent className="pt-4">
        <GenericModuloChartGrid
          modulo={moduloFromProps(moduloId)}
          indsDoModulo={indsModulo}
          setorParaGrafico={setorPrincipal}
          mesAtual={mes}
          anoAtual={ano}
          buildChartData={buildChartData}
          getMeta={getMeta}
          getLancamento={getLanc}
        />
      </CardContent>
    </Card>
  );
}
