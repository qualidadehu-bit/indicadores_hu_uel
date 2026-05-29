import { useEffect, useMemo, useState } from 'react';
import { api } from '@/api/apiClient';
import { useQuery } from '@tanstack/react-query';
import { Activity, AlertTriangle, CheckCircle2, ChevronDown, ChevronLeft, TrendingDown } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Link } from 'react-router-dom';
import { MESES, MESES_COMPLETO, calcularStatusMeta, STATUS_META, buildAnosDisponiveis } from '@/lib/indicadores';
import ProducaoCard from '@/components/dashboard/ProducaoCard';
import MispCard from '@/components/dashboard/MispCard';
import EventosAdversosCard from '@/components/dashboard/EventosAdversosCard';
import ModuloDashboardBundle from '@/components/dashboard/ModuloDashboardBundle';
import { usesDashboardBundle } from '@/lib/moduloLayout';
import IrasCard from '@/components/dashboard/IrasCard';
import GenericModuloChartGrid from '@/components/dashboard/GenericModuloChartGrid';
import {
  divisaoNomeParaFiltroIndicadores,
  filtrarIndicadoresPorDivisao,
  filtrarIndicadoresPorSetorWhitelist,
  indicadorIdsWhitelistSetor,
} from '@/lib/indicadorDivisao';
import { getModuloDashboardKind } from '@/lib/moduloTipoUi';
import { coveredIndicadorIdsBySpecialCard } from '@/lib/dashboardSpecialCoverage';
import {
  DASHBOARD_SCOPE_LEGACY,
  filtrarIndicadoresPorDashboardScope,
  filtrarModulosPorDashboardScope,
} from '@/lib/dashboardScope';
import { ENTITY_TYPE_SETOR } from '@/lib/entityType';
import { useDropdownClose } from '@/hooks/use-dropdown-close';

const ANOS = buildAnosDisponiveis();

function sameId(a, b) {
  return String(a ?? '') === String(b ?? '');
}

function toOrdemNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

export default function VisualizacaoDashboard() {
  const [ano, setAno] = useState(new Date().getFullYear());
  const [mes, setMes] = useState(new Date().getMonth() + 1);
  const [divisaoSelecionada, setDivisaoSelecionada] = useState('todas');
  const [setoresSelecionados, setSetoresSelecionados] = useState([]);
  const [showSetorMenu, setShowSetorMenu] = useState(false);
  const [moduloSelecionado, setModuloSelecionado] = useState('todos');
  const dashboardScopeAtivo = DASHBOARD_SCOPE_LEGACY;
  const domainType = ENTITY_TYPE_SETOR;
  const setorMenuRef = useDropdownClose(showSetorMenu, () => setShowSetorMenu(false));

  const { data: setores = [] } = useQuery({
    queryKey: ['setores-pub', domainType],
    queryFn: () => api.entities.Setor.filter({ entity_type: domainType }),
  });
  const { data: modulos = [] } = useQuery({
    queryKey: ['modulos-pub', domainType],
    queryFn: () => api.entities.Modulo.filter({ entity_type: domainType }),
  });
  const { data: indicadores = [] } = useQuery({
    queryKey: ['indicadores-pub', domainType],
    queryFn: () => api.entities.Indicador.filter({ entity_type: domainType }),
  });
  const modulosById = useMemo(
    () => new Map(modulos.map((m) => [String(m.id), m])),
    [modulos]
  );
  /** @type {Array<{ id: string|number, nome?: string } & Record<string, unknown>>} */
  const modulosScoped = useMemo(
    () => /** @type {Array<{ id: string|number, nome?: string } & Record<string, unknown>>} */ (
      filtrarModulosPorDashboardScope(modulos, dashboardScopeAtivo)
        .slice()
        .sort((a, b) => toOrdemNumber(a.ordem) - toOrdemNumber(b.ordem))
    ),
    [modulos, dashboardScopeAtivo]
  );
  const indicadoresScoped = useMemo(
    () =>
      filtrarIndicadoresPorDashboardScope(indicadores, modulosById, dashboardScopeAtivo)
        .slice()
        .sort((a, b) => toOrdemNumber(a.ordem) - toOrdemNumber(b.ordem)),
    [indicadores, modulosById, dashboardScopeAtivo]
  );

  const { data: lancamentos = [] } = useQuery({
    queryKey: ['lancamentos-pub', domainType, ano],
    queryFn: () => api.entities.Lancamento.filter({ ano, entity_type: domainType }),
  });
  const { data: metas = [] } = useQuery({
    queryKey: ['metas-pub', domainType, ano],
    queryFn: () => api.entities.Meta.filter({ ano, entity_type: domainType }),
  });

  // Agrupar setores por divisão
  const divisoes = [...new Set(setores.map(s => s.divisao))].sort();
  const setoresDaDivisao = divisaoSelecionada === 'todas'
    ? setores
    : setores.filter(s => s.divisao === divisaoSelecionada);
  const setorIdsSelecionadosNaDivisao = useMemo(() => {
    const idsDaDivisao = new Set(setoresDaDivisao.map((s) => String(s.id)));
    return setoresSelecionados.filter((sid) => idsDaDivisao.has(String(sid)));
  }, [setoresSelecionados, setoresDaDivisao]);
  const setorIdsAtivos = useMemo(() => {
    if (setorIdsSelecionadosNaDivisao.length > 0) return setorIdsSelecionadosNaDivisao.map(String);
    return setoresDaDivisao.map((s) => String(s.id));
  }, [setorIdsSelecionadosNaDivisao, setoresDaDivisao]);
  const setorContextoId = setorIdsSelecionadosNaDivisao.length === 1 ? setorIdsSelecionadosNaDivisao[0] : null;

  useEffect(() => {
    const idsValidos = new Set(setoresDaDivisao.map((s) => String(s.id)));
    setSetoresSelecionados((prev) => prev.filter((sid) => idsValidos.has(String(sid))));
  }, [setoresDaDivisao]);

  const divisaoFiltroInd = useMemo(
    () => divisaoNomeParaFiltroIndicadores(setores, setorContextoId || 'todos', divisaoSelecionada),
    [setores, setorContextoId, divisaoSelecionada]
  );
  const indicadoresAposDivisao = useMemo(
    () =>
      filtrarIndicadoresPorDivisao(indicadoresScoped, divisaoFiltroInd)
        .slice()
        .sort((a, b) => toOrdemNumber(a.ordem) - toOrdemNumber(b.ordem)),
    [indicadoresScoped, divisaoFiltroInd]
  );
  const setorContextoObj = useMemo(() => {
    if (!setorContextoId) return null;
    return setoresDaDivisao.find((s) => String(s.id) === String(setorContextoId)) || null;
  }, [setoresDaDivisao, setorContextoId]);
  const indicadoresPorSetorId = useMemo(() => {
    const map = new Map();
    for (const setor of setoresDaDivisao) {
      map.set(
        String(setor.id),
        filtrarIndicadoresPorSetorWhitelist(indicadoresAposDivisao, setor)
          .slice()
          .sort((a, b) => toOrdemNumber(a.ordem) - toOrdemNumber(b.ordem))
      );
    }
    return map;
  }, [setoresDaDivisao, indicadoresAposDivisao]);
  const indicadoresFiltrados = useMemo(() => {
    if (setorContextoId && indicadoresPorSetorId.has(String(setorContextoId))) {
      return indicadoresPorSetorId.get(String(setorContextoId)) || [];
    }
    const byId = new Map();
    for (const sid of setorIdsAtivos) {
      const inds = indicadoresPorSetorId.get(String(sid)) || [];
      inds.forEach((ind) => byId.set(String(ind.id), ind));
    }
    return [...byId.values()].sort((a, b) => toOrdemNumber(a.ordem) - toOrdemNumber(b.ordem));
  }, [setorContextoId, setorIdsAtivos, indicadoresPorSetorId]);

  const getLancamento = (indicadorId, sid, m) =>
    sid
      ? lancamentos.find(
          (l) =>
            String(l.indicador_id) === String(indicadorId) &&
            String(l.setor_id) === String(sid) &&
            Number(l.mes) === Number(m)
        )
      : undefined;

  const getMeta = (indicadorId, sid) =>
    sid
      ? metas.find((m) => String(m.indicador_id) === String(indicadorId) && String(m.setor_id) === String(sid))
      : undefined;

  const buildChartData = (indicadorId, setorId) =>
    MESES.map((m, i) => {
      const lanc = getLancamento(indicadorId, setorId, i + 1);
      const metaRec = getMeta(indicadorId, setorId);
      return { mes: m, valor: lanc?.valor ?? null, meta: metaRec?.valor ?? null };
    });

  const kpis = (() => {
    let ok = 0;
    let atencao = 0;
    let critico = 0;
    let semDados = 0;
    for (const sid of setorIdsAtivos) {
      const inds = indicadoresPorSetorId.get(String(sid)) || [];
      inds.forEach((ind) => {
        const metaRec = getMeta(ind.id, sid);
        const lancRec = getLancamento(ind.id, sid, mes);
        const direcao = typeof ind.tipo_direcao_meta === 'string' ? ind.tipo_direcao_meta : undefined;
        const status = calcularStatusMeta(lancRec?.valor, metaRec?.valor, direcao);
        if (status === STATUS_META.OK) ok++;
        else if (status === STATUS_META.ATENCAO) atencao++;
        else if (status === STATUS_META.CRITICO) critico++;
        else semDados++;
      });
    }
    return { ok, atencao, critico, semDados };
  })();

  const setoresRender = useMemo(
    () =>
      setorIdsAtivos.map((sid) => ({
        id: String(sid),
        nome: String(setoresDaDivisao.find((s) => String(s.id) === String(sid))?.nome || `Setor ${sid}`),
      })),
    [setorIdsAtivos, setoresDaDivisao]
  );
  const toggleSetor = (sid) => {
    const id = String(sid);
    setSetoresSelecionados((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };
  const labelSetoresSelecionados = (() => {
    if (setorIdsSelecionadosNaDivisao.length === 0) return 'Todos os setores';
    if (setorIdsSelecionadosNaDivisao.length === 1) {
      const setor = setoresDaDivisao.find((s) => String(s.id) === String(setorIdsSelecionadosNaDivisao[0]));
      return String(setor?.nome || '1 setor');
    }
    return `${setorIdsSelecionadosNaDivisao.length} setores`;
  })();
  const getSetorLayout = (cardsCount) => {
    if (cardsCount <= 1) {
      return {
        containerClass: 'block',
        itemClass: 'w-full',
      };
    }
    if (cardsCount === 2) {
      return {
        containerClass: 'grid grid-cols-1 xl:grid-cols-2 gap-6',
        itemClass: 'w-full min-w-0',
      };
    }
    return {
      containerClass: 'flex overflow-x-auto space-x-6 pb-4 snap-x',
      itemClass: 'w-[85vw] xl:w-[46rem] min-w-[22rem] snap-start shrink-0',
    };
  };

  const modulosFiltrados = moduloSelecionado === 'todos'
    ? modulosScoped
    : modulosScoped.filter((m) => sameId(m.id, moduloSelecionado));

  const moduloSelecionadoDebug = useMemo(() => {
    if (moduloSelecionado === 'todos') return null;
    const moduloId = String(moduloSelecionado);
    return {
      totalNoEscopo: indicadoresScoped.filter((i) => sameId(i.modulo_id, moduloId)).length,
      aposDivisao: indicadoresAposDivisao.filter((i) => sameId(i.modulo_id, moduloId)).length,
      aposWhitelist: indicadoresFiltrados.filter((i) => sameId(i.modulo_id, moduloId)).length,
    };
  }, [moduloSelecionado, indicadoresScoped, indicadoresAposDivisao, indicadoresFiltrados]);

  return (
    <div className="min-h-screen bg-background">
      {/* Top bar — mirrors AppHeader style */}
      <header className="sticky top-0 z-50 bg-sidebar text-sidebar-foreground shadow-lg">
        <div className="max-w-screen-2xl mx-auto px-4">
          <div className="flex items-center justify-between h-14 gap-3 flex-wrap">
            <div className="flex items-center gap-3">
              <Link to="/" className="flex items-center gap-1.5 text-sm text-sidebar-foreground/70 hover:text-sidebar-foreground transition-colors">
                <ChevronLeft className="w-4 h-4" />
                Início
              </Link>
              <span className="text-sidebar-foreground/20">|</span>
              <div>
                <p className="font-jakarta font-bold text-sm text-sidebar-foreground leading-none">Gestão à Vista — Indicadores</p>
                <p className="text-xs text-sidebar-foreground/60 leading-none mt-0.5">Hospital Universitário · UEL</p>
              </div>
            </div>

            <div className="flex gap-2 flex-wrap">
              <Select value={String(mes)} onValueChange={v => setMes(Number(v))}>
                <SelectTrigger className="h-8 w-32 text-xs bg-sidebar-accent border-sidebar-border text-sidebar-foreground">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MESES_COMPLETO.map((m, i) => <SelectItem key={i + 1} value={String(i + 1)}>{m}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={String(ano)} onValueChange={v => setAno(Number(v))}>
                <SelectTrigger className="h-8 w-24 text-xs bg-sidebar-accent border-sidebar-border text-sidebar-foreground">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ANOS.map(a => <SelectItem key={a} value={String(a)}>{a}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select
                value={divisaoSelecionada}
                onValueChange={(v) => {
                  setDivisaoSelecionada(v);
                  setSetoresSelecionados([]);
                }}
              >
                <SelectTrigger className="h-8 w-40 text-xs bg-sidebar-accent border-sidebar-border text-sidebar-foreground">
                  <SelectValue placeholder="Divisão" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todas">Todas as Divisões</SelectItem>
                  {divisoes.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                </SelectContent>
              </Select>
              <div className="relative" ref={setorMenuRef}>
                <Button
                  type="button"
                  variant="outline"
                  className="h-8 text-xs justify-between w-48 font-normal bg-sidebar-accent border-sidebar-border text-sidebar-foreground hover:bg-sidebar-accent/80"
                  onClick={() => setShowSetorMenu((v) => !v)}
                >
                  <span className="truncate">{labelSetoresSelecionados}</span>
                  <ChevronDown className="w-4 h-4 opacity-70" />
                </Button>
                {showSetorMenu && (
                  <div className="absolute right-0 mt-2 w-64 rounded-md border bg-popover text-popover-foreground shadow-md z-50 p-3">
                    <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">Setores</p>
                    <div className="space-y-2 max-h-64 overflow-y-auto">
                      {setoresDaDivisao.map((s) => {
                        const sid = String(s.id);
                        return (
                          <label key={sid} className="flex items-center gap-2 text-sm cursor-pointer">
                            <Checkbox
                              checked={setorIdsSelecionadosNaDivisao.includes(sid)}
                              onCheckedChange={() => toggleSetor(sid)}
                            />
                            <span>{String(s.nome)}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
              <Select value={moduloSelecionado} onValueChange={setModuloSelecionado}>
                <SelectTrigger className="h-8 w-44 text-xs bg-sidebar-accent border-sidebar-border text-sidebar-foreground">
                  <SelectValue placeholder="Módulo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos os Módulos</SelectItem>
                  {modulosScoped.map(m => <SelectItem key={String(m.id)} value={String(m.id)}>{m.nome}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      </header>

      <div className="p-4 md:p-6 space-y-6 max-w-screen-2xl mx-auto">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-jakarta font-bold text-foreground">Dashboard</h1>
          <p className="text-muted-foreground text-sm mt-0.5">{MESES_COMPLETO[mes - 1]} de {ano}</p>
        </div>

        {setorIdsSelecionadosNaDivisao.length === 0 && setoresRender.length > 1 ? (
          <div className="rounded-lg border border-cyan-200 bg-cyan-50 px-4 py-3 text-sm text-cyan-900">
            Comparativo multi-setor ativo: os módulos serão exibidos lado a lado para todos os setores visíveis da divisão.
          </div>
        ) : null}

        {setorContextoObj && indicadorIdsWhitelistSetor(setorContextoObj) && indicadoresFiltrados.length === 0 && (
          <div className="rounded-lg border border-orange-200 bg-orange-50 px-4 py-3 text-sm text-orange-900">
            Este setor tem lista restrita de indicadores e nenhum indicador aplicável ficou visível. Ajuste em Configuração → Divisões e Setores.
          </div>
        )}
        {moduloSelecionado !== 'todos' &&
          moduloSelecionadoDebug &&
          moduloSelecionadoDebug.totalNoEscopo > 0 &&
          moduloSelecionadoDebug.aposWhitelist === 0 && (
            <div className="rounded-lg border border-orange-200 bg-orange-50 px-4 py-3 text-sm text-orange-900">
              O módulo selecionado possui indicadores no escopo, mas foi filtrado antes da renderização.
              Verifique divisão do indicador (`divisoes`) e lista branca do setor (`indicador_ids`).
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

        {/* Charts — identical logic to Dashboard.jsx */}
        {indicadoresFiltrados.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="py-16 text-center">
              <Activity className="w-12 h-12 text-muted-foreground/40 mx-auto mb-3" />
              <p className="text-muted-foreground font-medium">
                {indicadores.length === 0
                  ? 'Nenhum indicador configurado'
                  : indicadoresAposDivisao.length === 0
                    ? 'Nenhum indicador para a divisão / filtro atual'
                    : 'Nenhum indicador visível para os setores selecionados'}
              </p>
            </CardContent>
          </Card>
        ) : (
          modulosFiltrados.map(modulo => {
            const dashboardKind = getModuloDashboardKind(modulo);
            const indsDoModulo = indicadoresFiltrados
              .filter((i) => String(i.modulo_id) === String(modulo.id))
              .sort((a, b) => toOrdemNumber(a.ordem) - toOrdemNumber(b.ordem));
            if (indsDoModulo.length === 0) return null;
            const coveredIds = coveredIndicadorIdsBySpecialCard(dashboardKind, indsDoModulo);
            const hasSpecialCoverage = coveredIds.size > 0;
            const layout = getSetorLayout(setoresRender.length);

            const renderSetorBadge = (setorNome) => (
              <Badge variant="outline" className="mb-2 text-xs">{setorNome}</Badge>
            );

            if (dashboardKind === 'iras' && hasSpecialCoverage) {
              return (
                <div key={String(modulo.id)}>
                  <div className={layout.containerClass}>
                    {setoresRender.map((setorItem) => {
                      const indsSetor = (indicadoresPorSetorId.get(setorItem.id) || []).filter(
                        (i) => String(i.modulo_id) === String(modulo.id) && coveredIds.has(String(i.id))
                      ).sort((a, b) => toOrdemNumber(a.ordem) - toOrdemNumber(b.ordem));
                      if (indsSetor.length === 0) return null;
                      return (
                        <div key={`${modulo.id}-${setorItem.id}`} className={layout.itemClass}>
                          {renderSetorBadge(setorItem.nome)}
                          <IrasCard
                            ano={ano}
                            mes={mes}
                            indicadores={indsSetor}
                            lancamentos={lancamentos}
                            setorId={setorItem.id}
                            moduloId={modulo.id}
                            getLancamento={(indicadorId, sid, m) =>
                              getLancamento(indicadorId, sid || setorItem.id, m)
                            }
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            }

            if (dashboardKind === 'eventos_adversos' && hasSpecialCoverage) {
              return (
                <div key={String(modulo.id)}>
                  <div className={layout.containerClass}>
                    {setoresRender.map((setorItem) => {
                      const indsSetor = (indicadoresPorSetorId.get(setorItem.id) || []).filter(
                        (i) => String(i.modulo_id) === String(modulo.id) && coveredIds.has(String(i.id))
                      ).sort((a, b) => toOrdemNumber(a.ordem) - toOrdemNumber(b.ordem));
                      if (indsSetor.length === 0) return null;
                      return (
                        <div key={`${modulo.id}-${setorItem.id}`} className={layout.itemClass}>
                          {renderSetorBadge(setorItem.nome)}
                          <EventosAdversosCard
                            ano={ano}
                            mes={mes}
                            indicadores={indsSetor}
                            lancamentos={lancamentos}
                            setorId={setorItem.id}
                            moduloId={modulo.id}
                            getLancamento={(indicadorId, sid, m) =>
                              getLancamento(indicadorId, sid || setorItem.id, m)
                            }
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            }

            if (dashboardKind === 'misp') {
              return (
                <div key={String(modulo.id)}>
                  <div className={layout.containerClass}>
                    {setoresRender.map((setorItem) => {
                      const indsSetor = (indicadoresPorSetorId.get(setorItem.id) || []).filter((i) =>
                        sameId(i.modulo_id, modulo.id)
                      ).sort((a, b) => toOrdemNumber(a.ordem) - toOrdemNumber(b.ordem));
                      if (indsSetor.length === 0) return null;
                      return (
                        <div key={`${modulo.id}-${setorItem.id}`} className={layout.itemClass}>
                          {renderSetorBadge(setorItem.nome)}
                          <MispCard
                            ano={ano}
                            mes={mes}
                            indicadores={indsSetor}
                            lancamentos={lancamentos}
                            setorId={setorItem.id}
                            moduloId={modulo.id}
                            modulo={modulo}
                            getLancamento={(indicadorId, sid, m) =>
                              getLancamento(indicadorId, sid || setorItem.id, m)
                            }
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            }

            if (dashboardKind === 'producao' && hasSpecialCoverage) {
              return (
                <div key={String(modulo.id)}>
                  <div className={layout.containerClass}>
                    {setoresRender.map((setorItem) => {
                      const indsSetor = (indicadoresPorSetorId.get(setorItem.id) || []).filter(
                        (i) => String(i.modulo_id) === String(modulo.id) && coveredIds.has(String(i.id))
                      ).sort((a, b) => toOrdemNumber(a.ordem) - toOrdemNumber(b.ordem));
                      if (indsSetor.length === 0) return null;
                      return (
                        <div key={`${modulo.id}-${setorItem.id}`} className={layout.itemClass}>
                          {renderSetorBadge(setorItem.nome)}
                          <ProducaoCard
                            ano={ano}
                            mes={mes}
                            indicadores={indsSetor}
                            lancamentos={lancamentos}
                            metas={metas}
                            setorIds={[setorItem.id]}
                            setores={setoresDaDivisao}
                            moduloId={modulo.id}
                            anosSelecionados={[ano]}
                            getLancamentoComparado={(indicadorId, m) =>
                              getLancamento(indicadorId, setorItem.id, m)
                            }
                            getMetaComparada={(indicadorId) => getMeta(indicadorId, setorItem.id)}
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            }

            if (usesDashboardBundle(modulo)) {
              return (
                <div key={String(modulo.id)}>
                  <div className={layout.containerClass}>
                    {setoresRender.map((setorItem) => {
                      const indsSetor = (indicadoresPorSetorId.get(setorItem.id) || []).filter((i) =>
                        sameId(i.modulo_id, modulo.id)
                      ).sort((a, b) => toOrdemNumber(a.ordem) - toOrdemNumber(b.ordem));
                      if (indsSetor.length === 0) return null;
                      return (
                        <div key={`${modulo.id}-${setorItem.id}`} className={layout.itemClass}>
                          {renderSetorBadge(setorItem.nome)}
                          <ModuloDashboardBundle
                            modulo={modulo}
                            indicadores={indsSetor}
                            lancamentos={lancamentos}
                            metas={metas}
                            ano={ano}
                            mes={mes}
                            setorId={setorItem.id}
                            moduloId={modulo.id}
                            getLancamento={(indicadorId, sid, m) => getLancamento(indicadorId, sid || setorItem.id, m)}
                            getMeta={(indicadorId, sid) => getMeta(indicadorId, sid || setorItem.id)}
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            }

            return (
              <div key={String(modulo.id)}>
                <div className={layout.containerClass}>
                  {setoresRender.map((setorItem) => {
                    const indsSetor = (indicadoresPorSetorId.get(setorItem.id) || []).filter((i) =>
                      sameId(i.modulo_id, modulo.id)
                    ).sort((a, b) => toOrdemNumber(a.ordem) - toOrdemNumber(b.ordem));
                    if (indsSetor.length === 0) return null;
                    return (
                      <Card key={`${modulo.id}-${setorItem.id}`} className={`${layout.itemClass} overflow-hidden`}>
                        <CardHeader className="pb-2 bg-secondary/30">
                          <div className="flex items-center justify-between">
                            <CardTitle className="text-base font-jakarta">{modulo.nome}</CardTitle>
                            <Badge variant="outline" className="text-xs">
                              {indsSetor.length} indicadores · {setorItem.nome}
                            </Badge>
                          </div>
                        </CardHeader>
                        <CardContent className="pt-4">
                          <GenericModuloChartGrid
                            modulo={modulo}
                            indsDoModulo={indsSetor}
                            setorParaGrafico={setorItem.id}
                            mesAtual={mes}
                            anoAtual={ano}
                            buildChartData={buildChartData}
                            getMeta={getMeta}
                            getLancamento={getLancamento}
                          />
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}