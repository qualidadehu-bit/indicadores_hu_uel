import { useState, useMemo, useEffect } from 'react';
import { api } from '@/api/apiClient';
import { useQuery } from '@tanstack/react-query';
import { Activity, TrendingDown, AlertTriangle, CheckCircle2, FileDown } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { MESES, MESES_COMPLETO, calcularStatusMeta, STATUS_META } from '@/lib/indicadores';
import ProducaoCard from '@/components/dashboard/ProducaoCard';
import MispCard from '@/components/dashboard/MispCard';
import EventosAdversosCard from '@/components/dashboard/EventosAdversosCard';
import ModuloDashboardBundle from '@/components/dashboard/ModuloDashboardBundle';
import { usesDashboardBundle } from '@/lib/moduloLayout';
import IrasCard from '@/components/dashboard/IrasCard';
import ExportPDFModal from '@/components/ExportPDFModal';
import GenericModuloChartGrid from '@/components/dashboard/GenericModuloChartGrid';
import {
  divisaoNomeParaFiltroIndicadores,
  filtrarIndicadoresPorDivisao,
  filtrarIndicadoresPorSetorWhitelist,
  indicadorIdsWhitelistSetor,
} from '@/lib/indicadorDivisao';
import { findModuloPorDashboardKind, getModuloDashboardKind } from '@/lib/moduloTipoUi';
import { useAuth } from '@/lib/AuthContext';
import { getSetoresVisiveisParaUsuario } from '@/lib/gestorSession';
import { pickLancamentoMes } from '@/lib/lancamentosDashboard';

export default function Dashboard({ ano, mes }) {
  const anoAtual = ano || new Date().getFullYear();
  const mesAtual = mes || new Date().getMonth() + 1;
  const [divisaoSelecionada, setDivisaoSelecionada] = useState('todas');
  const [setorSelecionado, setSetorSelecionado] = useState('todos');
  const [moduloSelecionado, setModuloSelecionado] = useState('todos');
  const [showExport, setShowExport] = useState(false);
  const { user } = useAuth();

  const { data: setores = [] } = useQuery({
    queryKey: ['setores'],
    queryFn: () => api.entities.Setor.list(),
  });

  const setoresVis = useMemo(() => getSetoresVisiveisParaUsuario(setores, user), [setores, user]);

  useEffect(() => {
    if (String(user?.tipo) !== 'gestor' || setoresVis.length !== 1) return;
    if (setorSelecionado === 'todos') {
      setSetorSelecionado(String(setoresVis[0].id));
    }
  }, [user?.tipo, setoresVis, setorSelecionado]);

  // Agrupar setores por divisão (lista filtrada para membros)
  const divisoes = [...new Set(setoresVis.map(s => String(s.divisao || '').trim()).filter(Boolean))].sort();
  const setoresDaDivisao = divisaoSelecionada === 'todas'
    ? setoresVis
    : setoresVis.filter(s => s.divisao === divisaoSelecionada);

  const { data: modulos = [] } = useQuery({
    queryKey: ['modulos'],
    queryFn: () => api.entities.Modulo.list(),
  });

  const { data: indicadores = [] } = useQuery({
    queryKey: ['indicadores'],
    queryFn: () => api.entities.Indicador.list(),
  });

  const { data: lancamentos = [] } = useQuery({
    queryKey: ['lancamentos', anoAtual],
    queryFn: () => api.entities.Lancamento.filter({ ano: anoAtual }),
  });

  const { data: metas = [] } = useQuery({
    queryKey: ['metas', anoAtual],
    queryFn: () => api.entities.Meta.filter({ ano: anoAtual }),
  });

  const setorContextoId = setorSelecionado !== 'todos' ? setorSelecionado : null;

  const divisaoFiltroInd = useMemo(
    () => divisaoNomeParaFiltroIndicadores(setores, setorSelecionado, divisaoSelecionada),
    [setores, setorSelecionado, divisaoSelecionada]
  );
  const setorContextoObj = useMemo(() => {
    if (!setorContextoId) return null;
    return setores.find((s) => String(s.id) === String(setorContextoId)) || null;
  }, [setores, setorContextoId]);

  const indicadoresAposDivisao = useMemo(
    () => filtrarIndicadoresPorDivisao(indicadores, divisaoFiltroInd),
    [indicadores, divisaoFiltroInd]
  );
  const indicadoresFiltrados = useMemo(
    () => filtrarIndicadoresPorSetorWhitelist(indicadoresAposDivisao, setorContextoObj),
    [indicadoresAposDivisao, setorContextoObj]
  );

  const getLancamento = (indicadorId, setorId, m) =>
    pickLancamentoMes(lancamentos, indicadorId, m, setorId);

  const getMeta = (indicadorId, sid) => {
    if (!sid) return undefined;
    return metas.find(m => m.indicador_id === indicadorId && m.setor_id === sid);
  };

  // KPI summary (exige setor selecionado — sem meta global por setor)
  const kpis = (() => {
    let ok = 0, atencao = 0, critico = 0, semDados = 0;
    indicadoresFiltrados.forEach(ind => {
      const metaRec = getMeta(ind.id, setorContextoId);
      const lancRec = setorContextoId ? getLancamento(ind.id, setorContextoId, mesAtual) : undefined;
      const direcao =
        typeof ind.tipo_direcao_meta === 'string' ? ind.tipo_direcao_meta : undefined;
      const valorLanc =
        lancRec?.valor != null && lancRec.valor !== '' ? Number(lancRec.valor) : null;
      const status = calcularStatusMeta(valorLanc, metaRec?.valor, direcao);
      if (status === STATUS_META.OK) ok++;
      else if (status === STATUS_META.ATENCAO) atencao++;
      else if (status === STATUS_META.CRITICO) critico++;
      else semDados++;
    });
    return { ok, atencao, critico, semDados };
  })();

  // Build chart data for the year (months)
  const buildChartData = (indicadorId, sid) => {
    return MESES.map((m, i) => {
      const lanc = sid ? getLancamento(indicadorId, sid, i + 1) : null;
      const metaRec = getMeta(indicadorId, sid);
      return {
        mes: m,
        valor: lanc?.valor ?? null,
        meta: metaRec?.valor ?? null,
      };
    });
  };

  const modulosFiltrados = moduloSelecionado === 'todos'
    ? modulos
    : modulos.filter(m => m.id === moduloSelecionado);

  const setorParaGrafico = setorContextoId;

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-screen-2xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-jakarta font-bold text-foreground">Dashboard</h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            {MESES_COMPLETO[mesAtual - 1]} de {anoAtual}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
           <Button
            variant="outline"
            size="sm"
            className="h-9 gap-2 border-indigo-300 text-indigo-600 hover:bg-indigo-50"
            onClick={() => setShowExport(true)}
          >
            <FileDown className="w-4 h-4" />
            Exportar PDF
          </Button>
          <Select value={divisaoSelecionada} onValueChange={(v) => { setDivisaoSelecionada(v); setSetorSelecionado('todos'); }}>
            <SelectTrigger className="w-40 h-9 text-sm">
              <SelectValue placeholder="Divisão" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">Todas as Divisões</SelectItem>
              {divisoes.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={setorSelecionado} onValueChange={setSetorSelecionado}>
            <SelectTrigger className="w-40 h-9 text-sm">
              <SelectValue placeholder="Setor" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os Setores</SelectItem>
              {setoresDaDivisao.map(s => (
                <SelectItem key={String(s.id)} value={String(s.id)}>{String(s.nome)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={moduloSelecionado} onValueChange={setModuloSelecionado}>
            <SelectTrigger className="w-44 h-9 text-sm">
              <SelectValue placeholder="Módulo" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os Módulos</SelectItem>
              {modulos.map(m => <SelectItem key={m.id} value={m.id}>{m.nome}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      {String(user?.tipo) === 'gestor' && setoresVis.length === 0 && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
          Sua conta não tem divisões ou setores configurados no perfil. Peça ao escritório da qualidade para associar
          divisões e/ou setores ao seu acesso.
        </div>
      )}

      {setorContextoObj && indicadorIdsWhitelistSetor(setorContextoObj) && indicadoresFiltrados.length === 0 && (
        <div className="rounded-lg border border-orange-200 bg-orange-50 px-4 py-3 text-sm text-orange-900">
          Este setor tem lista restrita de indicadores (<span className="font-mono text-xs">indicador_ids</span>) e nenhum indicador aplicável ficou visível. Ajuste a lista em Configuração → Divisões e Setores ou alinhe os ids com os indicadores existentes.
        </div>
      )}

      {!setorContextoId && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Selecione um setor para comparar lançamentos com a meta específica desse setor. Com &quot;Todos os Setores&quot;, KPIs e linhas de meta no gráfico não são aplicados.
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Indicadores OK', value: kpis.ok, color: 'text-green-600', bg: 'bg-green-50', icon: CheckCircle2, border: 'border-green-100' },
          { label: 'Em Atenção', value: kpis.atencao, color: 'text-amber-600', bg: 'bg-amber-50', icon: AlertTriangle, border: 'border-amber-100' },
          { label: 'Críticos', value: kpis.critico, color: 'text-red-600', bg: 'bg-red-50', icon: TrendingDown, border: 'border-red-100' },
          { label: 'Sem Dados', value: kpis.semDados, color: 'text-gray-500', bg: 'bg-gray-50', icon: Activity, border: 'border-gray-100' },
        ].map(({ label, value, color, bg, icon: Icon, border }) => (
          <Card key={label} className={`${border} border card-hover`}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">{label}</p>
                  <p className={`text-3xl font-jakarta font-bold mt-1 ${color}`}>{value}</p>
                </div>
                <div className={`w-10 h-10 rounded-xl ${bg} flex items-center justify-center`}>
                  <Icon className={`w-5 h-5 ${color}`} />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Charts by Module */}
      {indicadoresFiltrados.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-16 text-center">
            <Activity className="w-12 h-12 text-muted-foreground/40 mx-auto mb-3" />
            <p className="text-muted-foreground font-medium">
              {indicadores.length === 0
                ? 'Nenhum indicador configurado'
                : indicadoresAposDivisao.length === 0
                  ? 'Nenhum indicador para a divisão / filtro atual'
                  : 'Nenhum indicador visível para este setor'}
            </p>
            <p className="text-sm text-muted-foreground/60 mt-1">
              {indicadores.length === 0
                ? 'Acesse Configuração para adicionar módulos e indicadores'
                : indicadoresAposDivisao.length === 0
                  ? 'Troque o filtro de divisão ou de setor, ou amplie as divisões do indicador na configuração.'
                  : 'Se o setor usa lista restrita (indicador_ids), inclua indicadores ou marque todos em Configuração → Divisões e Setores.'}
            </p>
          </CardContent>
        </Card>
      ) : (
        modulosFiltrados.map(modulo => {
          const indsDoModulo = indicadoresFiltrados.filter(i => i.modulo_id === modulo.id);
          if (indsDoModulo.length === 0) return null;

          const dashboardKind = getModuloDashboardKind(modulo);

          if (dashboardKind === 'iras') {
            const moduloNr32 = findModuloPorDashboardKind(modulos, 'nr32');
            const indsNr32 = moduloNr32 ? indicadoresFiltrados.filter(i => i.modulo_id === moduloNr32.id) : [];
            return (
              <IrasCard
                key={modulo.id}
                ano={anoAtual}
                mes={mesAtual}
                indicadores={indsDoModulo}
                lancamentos={lancamentos}
                setorId={setorParaGrafico}
                indicadoresNr32={indsNr32}
                moduloId={modulo.id}
              />
            );
          }

          if (dashboardKind === 'eventos_adversos') {
            return (
              <EventosAdversosCard
                key={modulo.id}
                ano={anoAtual}
                mes={mesAtual}
                indicadores={indsDoModulo}
                lancamentos={lancamentos}
                setorId={setorParaGrafico}
                moduloId={modulo.id}
              />
            );
          }

          if (dashboardKind === 'nr32') return null;

          if (dashboardKind === 'misp') {
            return (
              <MispCard
                key={modulo.id}
                ano={anoAtual}
                mes={mesAtual}
                indicadores={indsDoModulo}
                lancamentos={lancamentos}
                setorId={setorParaGrafico}
                moduloId={modulo.id}
                modulo={modulo}
              />
            );
          }

          if (dashboardKind === 'producao') {
            return (
              <ProducaoCard
                key={modulo.id}
                ano={anoAtual}
                mes={mesAtual}
                indicadores={indicadoresFiltrados}
                lancamentos={lancamentos}
                metas={metas}
                setorId={setorParaGrafico}
                moduloId={modulo.id}
              />
            );
          }

          if (usesDashboardBundle(modulo)) {
            return (
              <ModuloDashboardBundle
                key={modulo.id}
                modulo={modulo}
                indicadores={indsDoModulo}
                lancamentos={lancamentos}
                metas={metas}
                ano={anoAtual}
                mes={mesAtual}
                setorId={setorParaGrafico}
                moduloId={modulo.id}
              />
            );
          }

          return (
          <Card key={modulo.id} className="overflow-hidden" data-modulo-id={modulo.id}>
              <CardHeader className="pb-2 bg-secondary/30">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base font-jakarta">{modulo.nome}</CardTitle>
                  <Badge variant="outline" className="text-xs">{indsDoModulo.length} indicadores</Badge>
                </div>
              </CardHeader>
              <CardContent className="pt-4">
                <GenericModuloChartGrid
                  modulo={modulo}
                  indsDoModulo={indsDoModulo}
                  setorParaGrafico={setorParaGrafico}
                  mesAtual={mesAtual}
                  anoAtual={anoAtual}
                  buildChartData={buildChartData}
                  getMeta={getMeta}
                  getLancamento={getLancamento}
                />
              </CardContent>
            </Card>
          );
        })
      )}
      {showExport && (
        <ExportPDFModal
          open={showExport}
          onClose={() => setShowExport(false)}
          modulos={modulos}
          indicadores={indicadoresFiltrados}
          lancamentos={lancamentos}
          metas={metas}
          anoAtual={anoAtual}
          mesAtual={mesAtual}
          setores={setoresDaDivisao}
          dashboardSetorId={setorContextoId}
        />
      )}
    </div>
  );
}