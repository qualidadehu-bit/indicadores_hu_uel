import { useState, useMemo, useEffect, useCallback } from 'react';
import { api } from '@/api/apiClient';
import { useQuery } from '@tanstack/react-query';
import { Activity, TrendingDown, AlertTriangle, CheckCircle2, FileDown, Sparkles, Loader2, ChevronDown } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { MESES, MESES_COMPLETO, calcularStatusMeta, STATUS_META } from '@/lib/indicadores';
import ProducaoCard from '@/components/dashboard/ProducaoCard';
import MispCard from '@/components/dashboard/MispCard';
import EventosAdversosCard from '@/components/dashboard/EventosAdversosCard';
import ModuloDashboardBundle from '@/components/dashboard/ModuloDashboardBundle';
import { usesDashboardBundle } from '@/lib/moduloLayout';
import IrasCard from '@/components/dashboard/IrasCard';
import ExportPDFModal from '@/components/ExportPDFModal';
import GenericModuloChartGrid from '@/components/dashboard/GenericModuloChartGrid';
import PageFiltersSidebar from '@/components/PageFiltersSidebar';
import {
  divisaoNomeParaFiltroIndicadores,
  filtrarIndicadoresPorDivisao,
  filtrarIndicadoresPorSetorWhitelist,
  indicadorIdsWhitelistSetor,
} from '@/lib/indicadorDivisao';
import { getModuloDashboardKind } from '@/lib/moduloTipoUi';
import { coveredIndicadorIdsBySpecialCard } from '@/lib/dashboardSpecialCoverage';
import { useAuth } from '@/lib/AuthContext';
import { getSetoresVisiveisParaUsuario } from '@/lib/gestorSession';
import {
  getLancamentoComparado,
  getMetaComparada,
} from '@/lib/dashboardComparativo';
import { parseLocaleNumber } from '@/lib/numberParsing';
import {
  DASHBOARD_SCOPE_LEGACY,
  filtrarIndicadoresPorDashboardScope,
  filtrarModulosPorDashboardScope,
} from '@/lib/dashboardScope';
import { ENTITY_TYPE_SETOR } from '@/lib/entityType';
import { useDropdownClose } from '@/hooks/use-dropdown-close';

function sameId(a, b) {
  return String(a ?? '') === String(b ?? '');
}

function toOrdemNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Mantém a ordem global por `ordem`, mas segmenta em blocos contiguous
 * de indicadores especiais vs adicionais para permitir render no card especial.
 * @param {Array<Record<string, unknown>>} orderedIndicators
 * @param {Set<string>} coveredIds
 */
function buildSpecialCoverageSegments(orderedIndicators, coveredIds) {
  const segments = [];
  for (const ind of orderedIndicators || []) {
    const isSpecial = coveredIds.has(String(ind.id));
    const prev = segments[segments.length - 1];
    if (!prev || prev.isSpecial !== isSpecial) {
      segments.push({ isSpecial, items: [ind] });
    } else {
      prev.items.push(ind);
    }
  }
  return segments;
}

export default function Dashboard({ ano, mes }) {
  const anoAtual = ano || new Date().getFullYear();
  const mesAtual = mes || new Date().getMonth() + 1;
  const [divisaoSelecionada, setDivisaoSelecionada] = useState('todas');
  const [setoresSelecionados, setSetoresSelecionados] = useState([]);
  const [showSetorMenu, setShowSetorMenu] = useState(false);
  const [anosSelecionados, setAnosSelecionados] = useState([]);
  const [showAnoMenu, setShowAnoMenu] = useState(false);
  const [moduloSelecionado, setModuloSelecionado] = useState('todos');
  const [showExport, setShowExport] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState('');
  const [aiResumo, setAiResumo] = useState(null);
  const { user } = useAuth();
  const dashboardScopeAtivo = DASHBOARD_SCOPE_LEGACY;
  const domainType = ENTITY_TYPE_SETOR;
  const closeSetorMenu = useCallback(() => setShowSetorMenu(false), []);
  const closeAnoMenu = useCallback(() => setShowAnoMenu(false), []);
  const setorMenuRef = useDropdownClose(showSetorMenu, closeSetorMenu);
  const anoMenuRef = useDropdownClose(showAnoMenu, closeAnoMenu);

  const { data: setores = [] } = useQuery({
    queryKey: ['setores', domainType],
    queryFn: () => api.entities.Setor.filter({ entity_type: domainType }),
  });

  const setoresVis = useMemo(() => getSetoresVisiveisParaUsuario(setores, user), [setores, user]);

  useEffect(() => {
    if (String(user?.tipo) !== 'gestor' || setoresVis.length !== 1) return;
    if (setoresSelecionados.length === 0) {
      setSetoresSelecionados([String(setoresVis[0].id)]);
    }
  }, [user?.tipo, setoresVis, setoresSelecionados]);

  // Agrupar setores por divisão (lista filtrada para membros)
  const divisoes = [...new Set(setoresVis.map(s => String(s.divisao || '').trim()).filter(Boolean))].sort();
  const setoresDaDivisao = divisaoSelecionada === 'todas'
    ? setoresVis
    : setoresVis.filter(s => s.divisao === divisaoSelecionada);

  const { data: modulos = [] } = useQuery({
    queryKey: ['modulos', domainType],
    queryFn: () => api.entities.Modulo.filter({ entity_type: domainType }),
  });

  const { data: indicadores = [] } = useQuery({
    queryKey: ['indicadores', domainType],
    queryFn: () => api.entities.Indicador.filter({ entity_type: domainType }),
  });

  const { data: lancamentos = [] } = useQuery({
    queryKey: ['lancamentos', domainType],
    queryFn: () => api.entities.Lancamento.filter({ entity_type: domainType }),
  });

  const { data: metas = [] } = useQuery({
    queryKey: ['metas', domainType],
    queryFn: () => api.entities.Meta.filter({ entity_type: domainType }),
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

  const setorIdsSelecionadosNaDivisao = useMemo(() => {
    const idsDaDivisao = new Set(setoresDaDivisao.map((s) => String(s.id)));
    return setoresSelecionados.filter((sid) => idsDaDivisao.has(String(sid)));
  }, [setoresSelecionados, setoresDaDivisao]);
  const setorContextoId = setorIdsSelecionadosNaDivisao.length === 1 ? setorIdsSelecionadosNaDivisao[0] : null;
  const setorIdsAtivos = useMemo(() => {
    if (setorIdsSelecionadosNaDivisao.length > 0) return setorIdsSelecionadosNaDivisao.map(String);
    return setoresDaDivisao.map((s) => String(s.id));
  }, [setorIdsSelecionadosNaDivisao, setoresDaDivisao]);

  const anosDisponiveis = useMemo(() => {
    const years = [...new Set((lancamentos || []).map((l) => Number(l.ano)).filter((n) => Number.isFinite(n)))].sort(
      (a, b) => b - a
    );
    if (years.length) return years;
    return [anoAtual, anoAtual - 1, anoAtual - 2];
  }, [lancamentos, anoAtual]);
  const anosAtivos = anosSelecionados.length > 0 ? anosSelecionados : [anoAtual];
  const moduloContextoId = moduloSelecionado !== 'todos' ? moduloSelecionado : null;

  const divisaoFiltroInd = useMemo(
    () => divisaoNomeParaFiltroIndicadores(setores, setorContextoId || 'todos', divisaoSelecionada),
    [setores, setorContextoId, divisaoSelecionada]
  );
  const setorContextoObj = useMemo(() => {
    if (!setorContextoId) return null;
    return setores.find((s) => String(s.id) === String(setorContextoId)) || null;
  }, [setores, setorContextoId]);

  const indicadoresAposDivisao = useMemo(
    () =>
      filtrarIndicadoresPorDivisao(indicadoresScoped, divisaoFiltroInd)
        .slice()
        .sort((a, b) => toOrdemNumber(a.ordem) - toOrdemNumber(b.ordem)),
    [indicadoresScoped, divisaoFiltroInd]
  );
  const indicadoresFiltrados = useMemo(
    () =>
      filtrarIndicadoresPorSetorWhitelist(indicadoresAposDivisao, setorContextoObj)
        .slice()
        .sort((a, b) => toOrdemNumber(a.ordem) - toOrdemNumber(b.ordem)),
    [indicadoresAposDivisao, setorContextoObj]
  );

  const getLancamento = (indicadorId, setorId, m, anoRef = anoAtual, estrategia) =>
    getLancamentoComparado({
      lancamentos,
      indicadorId,
      mes: m,
      ano: anoRef,
      setorIdsAtivos: setorId ? [String(setorId)] : setorIdsAtivos,
      estrategia,
    });

  const getMeta = (indicadorId, sid, anoRef = anoAtual, estrategia) =>
    getMetaComparada({
      metas,
      indicadorId,
      ano: anoRef,
      setorIdsAtivos: sid ? [String(sid)] : setorIdsAtivos,
      estrategia,
    });

  const getLancamentoComparadoContexto = (indicadorId, sid, m, anoRef = anoAtual, estrategia) => {
    if (sid) return getLancamento(indicadorId, sid, m, anoRef, estrategia);
    return getLancamentoComparado({
      lancamentos,
      indicadorId,
      mes: m,
      ano: anoRef,
      setorIdsAtivos,
      estrategia,
    });
  };

  const getMetaComparadaContexto = (indicadorId, sid, anoRef = anoAtual, estrategia) => {
    if (sid) return getMeta(indicadorId, sid, anoRef, estrategia);
    return getMetaComparada({
      metas,
      indicadorId,
      ano: anoRef,
      setorIdsAtivos,
      estrategia,
    });
  };

  const debugPipeline = useMemo(() => {
    const totalLancamentos = lancamentos.length;
    const aposAnoMes = lancamentos.filter(
      (l) => Number(l.ano) === Number(anoAtual) && Number(l.mes) === Number(mesAtual)
    );
    const idsSetorAtivos = new Set(setorIdsAtivos.map(String));
    const idsIndicadoresDivisao = new Set(indicadoresAposDivisao.map((i) => String(i.id)));
    const aposSetorDivisao = aposAnoMes.filter(
      (l) => idsSetorAtivos.has(String(l.setor_id)) && idsIndicadoresDivisao.has(String(l.indicador_id))
    );
    const idsIndicadoresWhitelist = new Set(indicadoresFiltrados.map((i) => String(i.id)));
    const aposWhitelist = aposSetorDivisao.filter((l) => idsIndicadoresWhitelist.has(String(l.indicador_id)));

    const renderedModules = moduloSelecionado === 'todos'
      ? modulosScoped
      : modulosScoped.filter((m) => String(m.id) === String(moduloSelecionado));
    const idsIndicadoresRender = new Set();
    const idsEspecialLayout = new Set();

    renderedModules.forEach((modulo) => {
      const kind = getModuloDashboardKind(modulo);
      const inds = indicadoresFiltrados.filter((i) => String(i.modulo_id) === String(modulo.id));
      inds.forEach((ind) => idsIndicadoresRender.add(String(ind.id)));
      const covered = coveredIndicadorIdsBySpecialCard(kind, inds);
      covered.forEach((id) => idsEspecialLayout.add(String(id)));
    });

    const aposModuloTipoLayout = aposWhitelist.filter((l) => idsIndicadoresRender.has(String(l.indicador_id)));
    const aposEspecialLayout = aposModuloTipoLayout.filter((l) => idsEspecialLayout.has(String(l.indicador_id)));
    const viaGridGenerico = aposModuloTipoLayout.length - aposEspecialLayout.length;

    return {
      totalLancamentos,
      aposAnoMes: aposAnoMes.length,
      aposSetorDivisao: aposSetorDivisao.length,
      aposWhitelist: aposWhitelist.length,
      aposModuloTipoLayout: aposModuloTipoLayout.length,
      aposEspecialLayout: aposEspecialLayout.length,
      viaGridGenerico,
    };
  }, [
    lancamentos,
    anoAtual,
    mesAtual,
    setorIdsAtivos,
    indicadoresAposDivisao,
    indicadoresFiltrados,
    moduloSelecionado,
    modulosScoped,
  ]);

  useEffect(() => {
    const isLocalDebugRuntime =
      typeof window !== 'undefined' &&
      ['localhost', '127.0.0.1'].includes(String(window.location.hostname || '').toLowerCase());
    if (!isLocalDebugRuntime) return;
    const byQuery = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('debugDashboard') === '1';
    const byStorage = typeof window !== 'undefined' && window.localStorage.getItem('dashboardDebug') === '1';
    if (!byQuery && !byStorage) return;
    console.groupCollapsed('[dashboard:debug] pipeline');
    console.table(debugPipeline);
    console.groupEnd();
  }, [debugPipeline]);

  // KPI summary (exige setor selecionado — sem meta global por setor)
  const kpis = (() => {
    let ok = 0, atencao = 0, critico = 0, semDados = 0;
    indicadoresFiltrados.forEach(ind => {
      const metaRec = getMeta(ind.id, setorContextoId, anoAtual);
      const lancRec = setorContextoId
        ? getLancamento(ind.id, setorContextoId, mesAtual, anoAtual)
        : getLancamentoComparadoContexto(ind.id, null, mesAtual, anoAtual);
      const direcao =
        typeof ind.tipo_direcao_meta === 'string' ? ind.tipo_direcao_meta : undefined;
      const valorLanc = parseLocaleNumber(lancRec?.valor);
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
      const lanc = sid ? getLancamento(indicadorId, sid, i + 1, anoAtual) : null;
      const metaRec = sid ? getMeta(indicadorId, sid) : getMetaComparadaContexto(indicadorId, null, anoAtual);
      return {
        mes: m,
        valor: (sid ? lanc : getLancamentoComparadoContexto(indicadorId, null, i + 1, anoAtual))?.valor ?? null,
        meta: metaRec?.valor ?? null,
      };
    });
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

  const moduloContextoObj = useMemo(() => {
    if (!moduloContextoId) return null;
    return modulosScoped.find((m) => String(m.id) === String(moduloContextoId)) || null;
  }, [modulosScoped, moduloContextoId]);

  useEffect(() => {
    setAiResumo(null);
    setAiError('');
  }, [setorContextoId, moduloContextoId, mesAtual, anoAtual]);

  const podeGerarResumoIa = !!setorContextoId && !!moduloContextoId;

  const gerarResumoIa = async () => {
    if (!podeGerarResumoIa) {
      setAiError('Selecione um setor e um módulo específico para gerar o resumo com IA.');
      return;
    }
    setAiLoading(true);
    setAiError('');
    try {
      const res = await api.ai.summary({
        setor_id: setorContextoId,
        modulo_id: moduloContextoId,
        mes: mesAtual,
        ano: anoAtual,
      });
      setAiResumo(res?.data || null);
    } catch (err) {
      setAiResumo(null);
      setAiError(err?.message || 'Não foi possível gerar o resumo com IA no momento.');
    } finally {
      setAiLoading(false);
    }
  };

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
  const filtrosAtivos = useMemo(() => {
    const chips = [];
    if (divisaoSelecionada !== 'todas') {
      chips.push({ key: 'divisao', label: `Divisão: ${divisaoSelecionada}` });
    } else {
      chips.push({ key: 'divisao', label: 'Divisão: Todas' });
    }
    chips.push({ key: 'setores', label: `Setores: ${labelSetoresSelecionados}` });
    if (moduloSelecionado !== 'todos') {
      const mod = modulosScoped.find((m) => String(m.id) === String(moduloSelecionado));
      chips.push({ key: 'modulo', label: `Módulo: ${String(mod?.nome || moduloSelecionado)}` });
    } else {
      chips.push({ key: 'modulo', label: 'Módulo: Todos' });
    }
    chips.push({
      key: 'anos',
      label: anosAtivos.length === 1 ? `Ano: ${anosAtivos[0]}` : `Anos: ${anosAtivos.join(', ')}`,
    });
    return chips;
  }, [divisaoSelecionada, labelSetoresSelecionados, moduloSelecionado, modulosScoped, anosAtivos]);
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
  const renderIndicadoresAdicionais = (modulo, indsExtras, setorId, anoRef) => {
    if (!indsExtras.length) return null;
    return (
      <Card className="mt-3 border-dashed border-primary/30">
        <CardHeader className="pb-2 bg-primary/5">
          <CardTitle className="text-sm font-jakarta">Indicadores adicionais ({indsExtras.length})</CardTitle>
        </CardHeader>
        <CardContent className="pt-3">
          <GenericModuloChartGrid
            modulo={modulo}
            indsDoModulo={indsExtras}
            setorParaGrafico={setorId}
            mesAtual={mesAtual}
            anoAtual={anoRef}
            buildChartData={(indicadorId, sid) =>
              MESES.map((m, i) => ({
                mes: m,
                valor: getLancamentoComparadoContexto(indicadorId, sid || setorId, i + 1, anoRef)?.valor ?? null,
                meta: getMetaComparadaContexto(indicadorId, sid || setorId, anoRef)?.valor ?? null,
              }))
            }
            getMeta={(indicadorId, sid) => getMetaComparadaContexto(indicadorId, sid || setorId, anoRef)}
            getLancamento={(indicadorId, sid, m) =>
              getLancamentoComparadoContexto(indicadorId, sid || setorId, m, anoRef)
            }
          />
        </CardContent>
      </Card>
    );
  };
  const toggleAno = (year) => {
    setAnosSelecionados((prev) => {
      const y = Number(year);
      if (prev.includes(y)) return prev.filter((p) => p !== y);
      return [...prev, y].sort((a, b) => b - a);
    });
  };

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-screen-2xl mx-auto">
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
            className="h-9 gap-2 border-violet-300 text-violet-700 hover:bg-violet-50 disabled:opacity-60"
            onClick={gerarResumoIa}
            disabled={aiLoading}
          >
            {aiLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            {aiLoading ? 'Gerando resumo...' : 'Resumo IA'}
          </Button>
           <Button
            variant="outline"
            size="sm"
            className="h-9 gap-2 border-indigo-300 text-indigo-600 hover:bg-indigo-50"
            onClick={() => setShowExport(true)}
          >
            <FileDown className="w-4 h-4" />
            Exportar PDF
          </Button>
        </div>
      </div>

      <PageFiltersSidebar title="Filtros da visualização" chips={filtrosAtivos} horizontal>
            <div className="grid grid-cols-1 gap-3">
              <Select value={divisaoSelecionada} onValueChange={(v) => { setDivisaoSelecionada(v); setSetoresSelecionados([]); }}>
                <SelectTrigger className="h-9 text-sm">
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
                  className="h-9 text-sm justify-between w-full font-normal"
                  onClick={() => setShowSetorMenu((v) => !v)}
                >
                  <span className="truncate">{labelSetoresSelecionados}</span>
                  <ChevronDown className="w-4 h-4 opacity-70" />
                </Button>
                {showSetorMenu && (
                  <div className="absolute right-0 mt-2 w-72 rounded-md border bg-popover text-popover-foreground shadow-md z-50 p-3">
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
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue placeholder="Módulo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos os Módulos</SelectItem>
                  {modulosScoped.map(m => <SelectItem key={String(m.id)} value={String(m.id)}>{m.nome}</SelectItem>)}
                </SelectContent>
              </Select>
              <div className="relative" ref={anoMenuRef}>
                <Button
                  type="button"
                  variant="outline"
                  className="h-9 text-sm justify-between w-full font-normal"
                  onClick={() => setShowAnoMenu((v) => !v)}
                >
                  <span className="truncate">{anosAtivos.length === 1 ? `Ano ${anosAtivos[0]}` : `${anosAtivos.length} anos`}</span>
                  <ChevronDown className="w-4 h-4 opacity-70" />
                </Button>
                {showAnoMenu && (
                  <div className="absolute right-0 mt-2 w-52 rounded-md border bg-popover text-popover-foreground shadow-md z-50 p-3">
                    <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">Anos</p>
                    <div className="space-y-2 max-h-56 overflow-y-auto">
                      {anosDisponiveis.map((year) => (
                        <label key={year} className="flex items-center gap-2 text-sm cursor-pointer">
                          <Checkbox checked={anosAtivos.includes(year)} onCheckedChange={() => toggleAno(year)} />
                          <span>{year}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
      </PageFiltersSidebar>

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
        <div className="rounded-lg border border-cyan-200 bg-cyan-50 px-4 py-3 text-sm text-cyan-900">
          {setorIdsSelecionadosNaDivisao.length > 1
            ? 'Comparativo multi-setor ativo: os valores exibidos usam agregação entre os setores selecionados. Para gerar Resumo IA, selecione apenas 1 setor.'
            : 'Comparativo multi-setor ativo: os valores exibidos usam agregação entre os setores visíveis da divisão. Para gerar Resumo IA, selecione apenas 1 setor.'}
        </div>
      )}

      {!moduloContextoId && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Selecione um módulo específico para liberar o resumo com IA.
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

      {(aiError || aiResumo) && (
        <Card className="border-violet-200 bg-violet-50/40">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-jakarta flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-violet-700" />
              Resumo IA
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {aiError && (
              <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{aiError}</div>
            )}
            {aiResumo && (
              <>
                <p className="text-sm text-foreground">{aiResumo.resumo_executivo || 'Resumo indisponível.'}</p>
                <div className="grid md:grid-cols-3 gap-3 text-sm">
                  <div>
                    <p className="font-semibold mb-1">Pontos críticos</p>
                    <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
                      {(aiResumo.pontos_criticos || []).map((item, idx) => <li key={`pc-${idx}`}>{item}</li>)}
                    </ul>
                  </div>
                  <div>
                    <p className="font-semibold mb-1">Ações recomendadas</p>
                    <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
                      {(aiResumo.acoes_recomendadas || []).map((item, idx) => <li key={`ar-${idx}`}>{item}</li>)}
                    </ul>
                  </div>
                  <div>
                    <p className="font-semibold mb-1">Riscos</p>
                    <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
                      {(aiResumo.riscos || []).map((item, idx) => <li key={`ri-${idx}`}>{item}</li>)}
                    </ul>
                  </div>
                </div>
                <div className="text-xs text-muted-foreground flex flex-wrap gap-3">
                  <span>Confiança: <strong>{aiResumo.confianca || 'media'}</strong></span>
                  <span>Modelo: <strong>{aiResumo.model || 'fallback'}</strong></span>
                  <span>Fonte: <strong>{aiResumo.source || 'fallback'}</strong></span>
                  {aiResumo.generated_at && <span>Gerado em: <strong>{new Date(aiResumo.generated_at).toLocaleString()}</strong></span>}
                  {setorContextoObj && <span>Setor: <strong>{setorContextoObj.nome}</strong></span>}
                  {moduloContextoObj && <span>Módulo: <strong>{moduloContextoObj.nome}</strong></span>}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-semibold text-foreground">Resumo de desempenho</h2>
          <p className="text-xs text-muted-foreground">Leitura rápida dos indicadores para a reunião operacional.</p>
        </div>
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
      </section>

      {/* Charts by Module */}
      {indicadoresFiltrados.length === 0 ? (
        <Card className="border-dashed border-border/80">
          <CardContent className="py-16 text-center">
            <Activity className="w-12 h-12 text-muted-foreground/40 mx-auto mb-3" />
            <p className="text-foreground font-medium">
              {indicadores.length === 0
                ? 'Nenhum indicador configurado'
                : indicadoresAposDivisao.length === 0
                  ? 'Nenhum indicador para a divisão / filtro atual'
                  : 'Nenhum indicador visível para este setor'}
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              {indicadores.length === 0
                ? 'Acesse Configuração para adicionar módulos e indicadores'
                : indicadoresAposDivisao.length === 0
                  ? 'Troque o filtro de divisão ou de setor, ou amplie as divisões do indicador na configuração.'
                  : 'Se o setor usa lista restrita (indicador_ids), inclua indicadores ou marque todos em Configuração → Divisões e Setores.'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <section className="space-y-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-base font-semibold text-foreground">Detalhamento por módulo</h2>
            <Badge variant="secondary" className="text-xs">{modulosFiltrados.length} módulo(s)</Badge>
          </div>
          {modulosFiltrados.map(modulo => {
          const indsDoModulo = indicadoresFiltrados
            .filter((i) => sameId(i.modulo_id, modulo.id))
            .sort((a, b) => toOrdemNumber(a.ordem) - toOrdemNumber(b.ordem));
          if (indsDoModulo.length === 0) return null;
          const anosRender = anosAtivos;

          const dashboardKind = getModuloDashboardKind(modulo);
          const coveredIds = coveredIndicadorIdsBySpecialCard(dashboardKind, indsDoModulo);
          const indsSpecial = indsDoModulo.filter((ind) => coveredIds.has(String(ind.id)));
          const indsExtras = indsDoModulo.filter((ind) => !coveredIds.has(String(ind.id)));
          const hasSpecialCoverage = coveredIds.size > 0;

          if (dashboardKind === 'iras' && hasSpecialCoverage) {
            const layout = getSetorLayout(setoresRender.length * anosRender.length);
            return (
              <div key={modulo.id}>
                <div className={layout.containerClass}>
                  {setoresRender.map((setorItem) =>
                    anosRender.map((anoRef) => (
                      <div key={`${modulo.id}-${setorItem.id}-${anoRef}`} className={layout.itemClass}>
                        <Badge variant="outline" className="mb-2 text-xs">{setorItem.nome} · {anoRef}</Badge>
                        {buildSpecialCoverageSegments(indsDoModulo, coveredIds).map((segment, segIdx) =>
                          segment.isSpecial ? (
                            <IrasCard
                              key={`${modulo.id}-${setorItem.id}-${anoRef}-special-${segIdx}`}
                              ano={anoRef}
                              mes={mesAtual}
                              indicadores={segment.items}
                              lancamentos={lancamentos}
                              setorId={setorItem.id}
                              moduloId={modulo.id}
                              getLancamento={(indicadorId, sid, m) =>
                                getLancamentoComparadoContexto(indicadorId, sid || setorItem.id, m, anoRef)
                              }
                            />
                          ) : (
                            <div key={`${modulo.id}-${setorItem.id}-${anoRef}-extra-${segIdx}`}>
                              {renderIndicadoresAdicionais(modulo, segment.items, setorItem.id, anoRef)}
                            </div>
                          )
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>
            );
          }

          if (dashboardKind === 'eventos_adversos' && hasSpecialCoverage) {
            const layout = getSetorLayout(setoresRender.length * anosRender.length);
            return (
              <div key={modulo.id}>
                <div className={layout.containerClass}>
                  {setoresRender.map((setorItem) =>
                    anosRender.map((anoRef) => (
                      <div key={`${modulo.id}-${setorItem.id}-${anoRef}`} className={layout.itemClass}>
                        <Badge variant="outline" className="mb-2 text-xs">{setorItem.nome} · {anoRef}</Badge>
                        <EventosAdversosCard
                          ano={anoRef}
                          mes={mesAtual}
                          indicadores={indsSpecial}
                          lancamentos={lancamentos}
                          setorId={setorItem.id}
                          moduloId={modulo.id}
                          getLancamento={(indicadorId, sid, m) => getLancamentoComparadoContexto(indicadorId, sid || setorItem.id, m, anoRef)}
                        />
                        {renderIndicadoresAdicionais(modulo, indsExtras, setorItem.id, anoRef)}
                      </div>
                    ))
                  )}
                </div>
              </div>
            );
          }

          if (dashboardKind === 'misp') {
            const layout = getSetorLayout(setoresRender.length * anosRender.length);
            return (
              <div key={modulo.id}>
                <div className={layout.containerClass}>
                  {setoresRender.map((setorItem) =>
                    anosRender.map((anoRef) => (
                      <div key={`${modulo.id}-${setorItem.id}-${anoRef}`} className={layout.itemClass}>
                        <Badge variant="outline" className="mb-2 text-xs">{setorItem.nome} · {anoRef}</Badge>
                        <MispCard
                          ano={anoRef}
                          mes={mesAtual}
                          indicadores={indsDoModulo}
                          lancamentos={lancamentos}
                          setorId={setorItem.id}
                          moduloId={modulo.id}
                          modulo={modulo}
                          getLancamento={(indicadorId, sid, m) => getLancamentoComparadoContexto(indicadorId, sid || setorItem.id, m, anoRef)}
                        />
                        {renderIndicadoresAdicionais(modulo, indsExtras, setorItem.id, anoRef)}
                      </div>
                    ))
                  )}
                </div>
              </div>
            );
          }

          if (dashboardKind === 'producao' && hasSpecialCoverage) {
            const layout = getSetorLayout(setoresRender.length);
            return (
              <div key={modulo.id}>
                <div className={layout.containerClass}>
                  {setoresRender.map((setorItem) => (
                    <div key={`${modulo.id}-${setorItem.id}`} className={layout.itemClass}>
                      <Badge variant="outline" className="mb-2 text-xs">{setorItem.nome}</Badge>
                      <ProducaoCard
                        ano={anoAtual}
                        mes={mesAtual}
                        indicadores={indsSpecial}
                        lancamentos={lancamentos}
                        metas={metas}
                        setorIds={[setorItem.id]}
                        setores={setoresDaDivisao}
                        moduloId={modulo.id}
                        anosSelecionados={anosAtivos}
                        getLancamentoComparado={(indicadorId, m, anoRef) =>
                          getLancamentoComparadoContexto(indicadorId, setorItem.id, m, anoRef)
                        }
                        getMetaComparada={(indicadorId, anoRef) => getMetaComparadaContexto(indicadorId, setorItem.id, anoRef)}
                      />
                      {renderIndicadoresAdicionais(modulo, indsExtras, setorItem.id, anoAtual)}
                    </div>
                  ))}
                </div>
              </div>
            );
          }

          if (usesDashboardBundle(modulo)) {
            const layout = getSetorLayout(setoresRender.length * anosRender.length);
            return (
              <div key={modulo.id}>
                <div className={layout.containerClass}>
                  {setoresRender.map((setorItem) =>
                    anosRender.map((anoRef) => (
                      <div key={`${modulo.id}-${setorItem.id}-${anoRef}`} className={layout.itemClass}>
                        <Badge variant="outline" className="mb-2 text-xs">{setorItem.nome} · {anoRef}</Badge>
                        <ModuloDashboardBundle
                          modulo={modulo}
                          indicadores={indsDoModulo}
                          lancamentos={lancamentos}
                          metas={metas}
                          ano={anoRef}
                          mes={mesAtual}
                          setorId={setorItem.id}
                          setorIdsAtivos={[setorItem.id]}
                          moduloId={modulo.id}
                          getLancamento={(indicadorId, sid, m) => getLancamentoComparadoContexto(indicadorId, sid || setorItem.id, m, anoRef)}
                          getMeta={(indicadorId, sid) => getMetaComparadaContexto(indicadorId, sid || setorItem.id, anoRef)}
                        />
                      </div>
                    ))
                  )}
                </div>
              </div>
            );
          }

          const layout = getSetorLayout(setoresRender.length * anosRender.length);
          return (
            <div key={modulo.id}>
              <div className={layout.containerClass}>
                {setoresRender.map((setorItem) =>
                  anosRender.map((anoRef) => (
                    <Card
                      key={`${modulo.id}-${setorItem.id}-${anoRef}`}
                      className={`${layout.itemClass} overflow-hidden`}
                      data-modulo-id={modulo.id}
                      data-setor-id={setorItem.id}
                    >
                      <CardHeader className="pb-2 bg-secondary/30">
                        <div className="flex items-center justify-between">
                          <CardTitle className="text-base font-jakarta">{modulo.nome}</CardTitle>
                          <Badge variant="outline" className="text-xs">{indsDoModulo.length} indicadores · {setorItem.nome} · {anoRef}</Badge>
                        </div>
                      </CardHeader>
                      <CardContent className="pt-4">
                        <GenericModuloChartGrid
                          modulo={modulo}
                          indsDoModulo={indsDoModulo}
                          setorParaGrafico={setorItem.id}
                          mesAtual={mesAtual}
                          anoAtual={anoRef}
                          buildChartData={(indicadorId, sid) =>
                            MESES.map((m, i) => ({
                              mes: m,
                              valor: getLancamentoComparadoContexto(indicadorId, sid || setorItem.id, i + 1, anoRef)?.valor ?? null,
                              meta: getMetaComparadaContexto(indicadorId, sid || setorItem.id, anoRef)?.valor ?? null,
                            }))
                          }
                          getMeta={(indicadorId, sid) => getMetaComparadaContexto(indicadorId, sid || setorItem.id, anoRef)}
                          getLancamento={(indicadorId, sid, m) => getLancamentoComparadoContexto(indicadorId, sid || setorItem.id, m, anoRef)}
                        />
                      </CardContent>
                    </Card>
                  ))
                )}
              </div>
            </div>
          );
        })}
        </section>
      )}
      {showExport && (
        <ExportPDFModal
          open={showExport}
          onClose={() => setShowExport(false)}
          modulos={modulosScoped}
          indicadores={indicadoresFiltrados}
          lancamentos={lancamentos}
          metas={metas}
          anoAtual={anoAtual}
          mesAtual={mesAtual}
          setores={setoresDaDivisao}
          dashboardSetorId={setorIdsAtivos}
        />
      )}
    </div>
  );
}