import { useEffect, useMemo, useState } from 'react';
import { api } from '@/api/apiClient';
import { useQuery } from '@tanstack/react-query';
import { Activity, AlertTriangle, CheckCircle2, ChevronDown, FileDown, TrendingDown, Users } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import GenericModuloChartGrid from '@/components/dashboard/GenericModuloChartGrid';
import IrasCard from '@/components/dashboard/IrasCard';
import EventosAdversosCard from '@/components/dashboard/EventosAdversosCard';
import MispCard from '@/components/dashboard/MispCard';
import ProducaoCard from '@/components/dashboard/ProducaoCard';
import ModuloDashboardBundle from '@/components/dashboard/ModuloDashboardBundle';
import { MESES, MESES_COMPLETO, calcularStatusMeta, STATUS_META } from '@/lib/indicadores';
import { useAuth } from '@/lib/AuthContext';
import { getSetoresVisiveisParaUsuario } from '@/lib/gestorSession';
import { filtrarIndicadoresPorSetorWhitelist, divisaoNomeParaFiltroIndicadores, filtrarIndicadoresPorDivisao } from '@/lib/indicadorDivisao';
import {
  DASHBOARD_SCOPE_COMISSOES,
  DASHBOARD_SCOPE_PRATICAS_MEDICAS,
  filtrarIndicadoresPorDashboardScope,
  filtrarModulosPorDashboardScope,
} from '@/lib/dashboardScope';
import { buildGrupoComissaoOptions, normalizeGrupoComissao } from '@/lib/comissaoGrupos';
import { ACAO_VISUALIZAR, canUserPerformScopedAction } from '@/lib/scopePermissions';
import { ENTITY_TYPE_CLINICA, ENTITY_TYPE_COMISSAO } from '@/lib/entityType';
import { useDropdownClose } from '@/hooks/use-dropdown-close';
import { usesDashboardBundle } from '@/lib/moduloLayout';
import { getModuloDashboardKind } from '@/lib/moduloTipoUi';
import { coveredIndicadorIdsBySpecialCard } from '@/lib/dashboardSpecialCoverage';
import ExportPDFModal from '@/components/ExportPDFModal';

function toOrdemNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Preserva ordem global e separa blocos contíguos de cobertura especial.
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

export default function DashboardComissoes({ ano, mes, context = 'comissoes' }) {
  const anoAtual = Number(ano) || new Date().getFullYear();
  const mesAtual = Number(mes) || new Date().getMonth() + 1;
  const { user } = useAuth();
  const isPublicView = !user;
  const isClinicaContext = context === 'praticas_medicas';
  const dashboardScopeAtivo = isClinicaContext
    ? DASHBOARD_SCOPE_PRATICAS_MEDICAS
    : DASHBOARD_SCOPE_COMISSOES;
  const dashboardTitle = isClinicaContext ? 'Dashboard Práticas Médicas' : 'Dashboard Comissões';
  const entityLabelSingular = isClinicaContext ? 'clínica' : 'setor';
  const entityLabelPlural = isClinicaContext ? 'clínicas' : 'setores';
  const entityType = isClinicaContext ? ENTITY_TYPE_CLINICA : ENTITY_TYPE_COMISSAO;
  const ehGestorAutenticado = !!user && String(user.tipo) === 'gestor';
  const podeVisualizarComissoes = !ehGestorAutenticado || canUserPerformScopedAction(user, ACAO_VISUALIZAR, {
    dashboard: dashboardScopeAtivo,
  });
  const domainType = entityType;

  const [setoresSelecionados, setSetoresSelecionados] = useState([]);
  const [showSetorMenu, setShowSetorMenu] = useState(false);
  const [grupoSelecionado, setGrupoSelecionado] = useState('todos');
  const [moduloSelecionado, setModuloSelecionado] = useState('todos');
  const [showExport, setShowExport] = useState(false);
  const setorMenuRef = useDropdownClose(showSetorMenu, () => setShowSetorMenu(false));

  const { data: setores = [] } = useQuery({
    queryKey: ['setores', domainType],
    queryFn: () => api.entities.Setor.filter({ entity_type: domainType }),
  });
  const { data: modulos = [] } = useQuery({
    queryKey: ['modulos', domainType],
    queryFn: () =>
      api.entities.Modulo.filter({ dashboard_scope: dashboardScopeAtivo, entity_type: domainType }),
  });
  const { data: indicadores = [] } = useQuery({
    queryKey: ['indicadores', domainType],
    queryFn: () =>
      api.entities.Indicador.filter({ dashboard_scope: dashboardScopeAtivo, entity_type: domainType }),
  });
  const { data: lancamentos = [] } = useQuery({
    queryKey: ['lancamentos', domainType, anoAtual],
    queryFn: () =>
      api.entities.Lancamento.filter({
        ano: anoAtual,
        dashboard_scope: dashboardScopeAtivo,
        entity_type: domainType,
      }),
  });
  const { data: metas = [] } = useQuery({
    queryKey: ['metas', domainType, anoAtual],
    queryFn: () =>
      api.entities.Meta.filter({
        ano: anoAtual,
        dashboard_scope: dashboardScopeAtivo,
        entity_type: domainType,
      }),
  });

  const setoresVisiveis = useMemo(() => getSetoresVisiveisParaUsuario(setores, user), [setores, user]);

  useEffect(() => {
    const idsValidos = new Set(setoresVisiveis.map((s) => String(s.id)));
    setSetoresSelecionados((prev) => prev.filter((sid) => idsValidos.has(String(sid))));
  }, [setoresVisiveis]);

  const setorIdsSelecionadosVisiveis = useMemo(() => {
    const idsVisiveis = new Set(setoresVisiveis.map((s) => String(s.id)));
    return setoresSelecionados.filter((sid) => idsVisiveis.has(String(sid)));
  }, [setoresSelecionados, setoresVisiveis]);

  const setorIdsAtivos = useMemo(() => {
    if (setorIdsSelecionadosVisiveis.length > 0) return setorIdsSelecionadosVisiveis.map(String);
    return setoresVisiveis.map((s) => String(s.id));
  }, [setorIdsSelecionadosVisiveis, setoresVisiveis]);
  const setorContextoId =
    setorIdsSelecionadosVisiveis.length === 1 ? String(setorIdsSelecionadosVisiveis[0]) : null;

  const setoresRender = useMemo(
    () =>
      setorIdsAtivos
        .map((sid) => {
          const setor = setoresVisiveis.find((s) => String(s.id) === String(sid));
          if (!setor) return null;
          return { id: String(setor.id), nome: String(setor.nome || `Setor ${sid}`), setor };
        })
        .filter(Boolean),
    [setorIdsAtivos, setoresVisiveis]
  );

  const labelSetoresSelecionados = (() => {
    if (setorIdsSelecionadosVisiveis.length === 0) return `Todas as ${entityLabelPlural}`;
    if (setorIdsSelecionadosVisiveis.length === 1) {
      const setor = setoresVisiveis.find((s) => String(s.id) === String(setorIdsSelecionadosVisiveis[0]));
      return String(setor?.nome || `1 ${entityLabelSingular}`);
    }
    return `${setorIdsSelecionadosVisiveis.length} ${entityLabelPlural}`;
  })();

  const toggleSetor = (sid) => {
    const id = String(sid);
    setSetoresSelecionados((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const moduloById = useMemo(
    () => new Map(modulos.map((m) => [String(m.id), m])),
    [modulos]
  );
  const modulosComissoes = useMemo(
    () =>
      filtrarModulosPorDashboardScope(modulos, dashboardScopeAtivo)
        .slice()
        .sort((a, b) => toOrdemNumber(a.ordem) - toOrdemNumber(b.ordem)),
    [modulos, dashboardScopeAtivo]
  );

  const indicadoresComissoes = useMemo(
    () =>
      filtrarIndicadoresPorDashboardScope(indicadores, moduloById, dashboardScopeAtivo)
        .slice()
        .sort((a, b) => toOrdemNumber(a.ordem) - toOrdemNumber(b.ordem)),
    [indicadores, moduloById, dashboardScopeAtivo]
  );

  const grupoOptions = useMemo(
    () => buildGrupoComissaoOptions(indicadoresComissoes),
    [indicadoresComissoes]
  );

  const indicadoresBySetorId = useMemo(() => {
    const map = new Map();
    for (const setor of setoresVisiveis) {
      const divisaoFiltro = divisaoNomeParaFiltroIndicadores(setoresVisiveis, String(setor.id), 'todas');
      const porDivisao = filtrarIndicadoresPorDivisao(indicadoresComissoes, divisaoFiltro);
      const porSetor = filtrarIndicadoresPorSetorWhitelist(porDivisao, setor)
        .slice()
        .sort((a, b) => toOrdemNumber(a.ordem) - toOrdemNumber(b.ordem));
      map.set(String(setor.id), porSetor);
    }
    return map;
  }, [setoresVisiveis, indicadoresComissoes]);

  const getIndicadoresSetorFiltrados = (sid, moduloId = null) => {
    const all = indicadoresBySetorId.get(String(sid)) || [];
    const target = normalizeGrupoComissao(grupoSelecionado);
    const byGrupo = isClinicaContext
      ? [...all]
      : (grupoSelecionado === 'todos'
          ? [...all]
          : all.filter((ind) => normalizeGrupoComissao(ind.grupo_scope) === target));
    const byModulo =
      moduloId == null
        ? byGrupo
        : byGrupo.filter((ind) => String(ind.modulo_id) === String(moduloId));
    return byModulo.sort((a, b) => toOrdemNumber(a.ordem) - toOrdemNumber(b.ordem));
  };

  const modulosFiltrados = useMemo(
    () =>
      moduloSelecionado === 'todos'
        ? modulosComissoes
        : modulosComissoes.filter((m) => String(m.id) === String(moduloSelecionado)),
    [modulosComissoes, moduloSelecionado]
  );

  const hasAnyIndicadorToRender = useMemo(
    () =>
      modulosFiltrados.some((modulo) =>
        setorIdsAtivos.some((sid) => getIndicadoresSetorFiltrados(sid, modulo.id).length > 0)
      ),
    [modulosFiltrados, setorIdsAtivos, indicadoresBySetorId, grupoSelecionado]
  );

  const getLancamento = (indicadorId, sid, m) =>
    lancamentos.find(
      (l) =>
        String(l.indicador_id) === String(indicadorId) &&
        Number(l.mes) === Number(m) &&
        String(l.setor_id) === String(sid)
    );

  const getMeta = (indicadorId, sid) =>
    metas.find(
      (mt) =>
        String(mt.indicador_id) === String(indicadorId) &&
        String(mt.setor_id) === String(sid) &&
        Number(mt.ano) === Number(anoAtual)
    );

  const kpis = (() => {
    let ok = 0;
    let atencao = 0;
    let critico = 0;
    let semDados = 0;
    for (const sid of setorIdsAtivos) {
      const inds = getIndicadoresSetorFiltrados(sid);
      inds.forEach((ind) => {
        const metaRec = getMeta(ind.id, sid);
        const lancRec = getLancamento(ind.id, sid, mesAtual);
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

  const renderIndicadoresAdicionais = (modulo, indsExtras, setorId) => {
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
            anoAtual={anoAtual}
            buildChartData={(indicadorId, sid) =>
              MESES.map((m, i) => ({
                mes: m,
                valor: getLancamento(indicadorId, sid || setorId, i + 1)?.valor ?? null,
                meta: getMeta(indicadorId, sid || setorId)?.valor ?? null,
              }))
            }
            getMeta={(indicadorId, sid) => getMeta(indicadorId, sid || setorId)}
            getLancamento={(indicadorId, sid, m) =>
              getLancamento(indicadorId, sid || setorId, m)
            }
          />
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-screen-2xl mx-auto">
      {!podeVisualizarComissoes ? (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="py-8 text-sm text-red-900">
            Permissão negada: seu perfil não possui acesso de visualização para este dashboard.
          </CardContent>
        </Card>
      ) : null}
      {podeVisualizarComissoes ? (
        <>
          {isPublicView ? (
            <div className="rounded-lg border border-cyan-200 bg-cyan-50 px-4 py-3 text-sm text-cyan-900">
              Modo público de visualização: filtros, comparativo e exportação PDF estão disponíveis.
            </div>
          ) : null}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h1 className="text-2xl font-jakarta font-bold text-foreground">{dashboardTitle}</h1>
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
              <div className="relative" ref={setorMenuRef}>
                <Button
                  type="button"
                  variant="outline"
                  className="h-9 text-sm justify-between w-52 font-normal"
                  onClick={() => setShowSetorMenu((v) => !v)}
                >
                  <span className="truncate">{labelSetoresSelecionados}</span>
                  <ChevronDown className="w-4 h-4 opacity-70" />
                </Button>
                {showSetorMenu && (
                  <div className="absolute right-0 mt-2 w-64 rounded-md border bg-popover text-popover-foreground shadow-md z-50 p-3">
                    <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                      {isClinicaContext ? 'Clínicas' : 'Setores'}
                    </p>
                    <div className="space-y-2 max-h-64 overflow-y-auto">
                      {setoresVisiveis.map((s) => {
                        const sid = String(s.id);
                        return (
                          <label key={sid} className="flex items-center gap-2 text-sm cursor-pointer">
                            <Checkbox
                              checked={setorIdsSelecionadosVisiveis.includes(sid)}
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
                <SelectTrigger className="w-44 h-9 text-sm">
                  <SelectValue placeholder="Módulo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos os módulos</SelectItem>
                  {modulosComissoes.map((modulo) => (
                    <SelectItem key={String(modulo.id)} value={String(modulo.id)}>
                      {String(modulo.nome || 'Módulo')}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {!isClinicaContext ? (
                <Select value={grupoSelecionado} onValueChange={setGrupoSelecionado}>
                  <SelectTrigger className="w-56 h-9 text-sm">
                    <SelectValue placeholder="Grupo da comissão" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos os grupos</SelectItem>
                    {grupoOptions.map((g) => (
                      <SelectItem key={g.value} value={g.value}>
                        {g.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : null}
            </div>
          </div>

          {setoresRender.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="py-16 text-center">
                <Users className="w-12 h-12 text-muted-foreground/40 mx-auto mb-3" />
                <p className="text-muted-foreground font-medium">
                  Nenhuma {entityLabelSingular} visível para o seu perfil
                </p>
              </CardContent>
            </Card>
          ) : (
            <>
              {setorIdsSelecionadosVisiveis.length === 0 && setoresRender.length > 1 ? (
                <div className="rounded-lg border border-cyan-200 bg-cyan-50 px-4 py-3 text-sm text-cyan-900">
                  {`Comparativo multi-${entityLabelSingular} ativo: exibindo todas as ${entityLabelPlural} visíveis lado a lado.`}
                </div>
              ) : null}
              {moduloSelecionado !== 'todos' && !hasAnyIndicadorToRender ? (
                <div className="rounded-lg border border-orange-200 bg-orange-50 px-4 py-3 text-sm text-orange-900">
                  O módulo selecionado possui indicadores no escopo, mas não há itens visíveis com os filtros atuais.
                  {isClinicaContext ? 'Verifique os filtros de clínica.' : 'Verifique os filtros de setor e grupo.'}
                </div>
              ) : null}
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

              {!hasAnyIndicadorToRender ? (
                <Card className="border-dashed">
                  <CardContent className="py-12 text-center text-muted-foreground">
                    <p className="font-medium">
                      {indicadoresComissoes.length === 0
                        ? (isClinicaContext
                          ? 'Nenhum indicador configurado para práticas médicas'
                          : 'Nenhum indicador configurado para comissões')
                        : 'Nenhum indicador encontrado para os filtros selecionados'}
                    </p>
                    <p className="text-sm text-muted-foreground/70 mt-1">
                      {indicadoresComissoes.length === 0
                        ? `Acesse Configuração para adicionar módulos e indicadores do escopo de ${isClinicaContext ? 'práticas médicas' : 'comissões'}.`
                        : (isClinicaContext
                          ? 'Ajuste os filtros de clínica ou módulo para visualizar os cards.'
                          : 'Ajuste os filtros de setor, módulo ou grupo para visualizar os cards.')}
                    </p>
                  </CardContent>
                </Card>
              ) : (
                modulosFiltrados.map((modulo) => {
                  const hasIndicadoresNoModulo = setoresRender.some(
                    (setorItem) => getIndicadoresSetorFiltrados(setorItem.id, modulo.id).length > 0
                  );
                  if (!hasIndicadoresNoModulo) return null;
                  const layout = getSetorLayout(setoresRender.length);
                  const dashboardKind = getModuloDashboardKind(modulo);
                  const indsDoModuloGlobal = setorIdsAtivos
                    .flatMap((sid) => getIndicadoresSetorFiltrados(sid, modulo.id))
                    .filter((ind, idx, arr) =>
                      arr.findIndex((x) => String(x.id) === String(ind.id)) === idx
                    )
                    .sort((a, b) => toOrdemNumber(a.ordem) - toOrdemNumber(b.ordem));
                  const coveredIds = coveredIndicadorIdsBySpecialCard(dashboardKind, indsDoModuloGlobal);
                  const hasSpecialCoverage = coveredIds.size > 0;

                  if (dashboardKind === 'iras' && hasSpecialCoverage) {
                    return (
                      <div key={String(modulo.id)}>
                        <div className={layout.containerClass}>
                          {setoresRender.map((setorItem) => {
                            const indsModulo = getIndicadoresSetorFiltrados(setorItem.id, modulo.id);
                            if (indsModulo.length === 0) return null;
                            return (
                              <div key={`${String(modulo.id)}-${setorItem.id}`} className={layout.itemClass}>
                                <Badge variant="outline" className="mb-2 text-xs">{setorItem.nome}</Badge>
                                {buildSpecialCoverageSegments(indsModulo, coveredIds).map((segment, segIdx) =>
                                  segment.isSpecial ? (
                                    <IrasCard
                                      key={`${String(modulo.id)}-${setorItem.id}-special-${segIdx}`}
                                      ano={anoAtual}
                                      mes={mesAtual}
                                      indicadores={segment.items}
                                      lancamentos={lancamentos}
                                      setorId={setorItem.id}
                                      moduloId={modulo.id}
                                      getLancamento={(indicadorId, sid, m) =>
                                        getLancamento(indicadorId, sid || setorItem.id, m)
                                      }
                                    />
                                  ) : (
                                    <div key={`${String(modulo.id)}-${setorItem.id}-extra-${segIdx}`}>
                                      {renderIndicadoresAdicionais(modulo, segment.items, setorItem.id)}
                                    </div>
                                  )
                                )}
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
                            const indsModulo = getIndicadoresSetorFiltrados(setorItem.id, modulo.id);
                            const indsSpecial = indsModulo.filter((ind) => coveredIds.has(String(ind.id)));
                            const indsExtras = indsModulo.filter((ind) => !coveredIds.has(String(ind.id)));
                            if (indsModulo.length === 0) return null;
                            return (
                              <div key={`${String(modulo.id)}-${setorItem.id}`} className={layout.itemClass}>
                                <Badge variant="outline" className="mb-2 text-xs">{setorItem.nome}</Badge>
                                <EventosAdversosCard
                                  ano={anoAtual}
                                  mes={mesAtual}
                                  indicadores={indsSpecial}
                                  lancamentos={lancamentos}
                                  setorId={setorItem.id}
                                  moduloId={modulo.id}
                                  getLancamento={(indicadorId, sid, m) =>
                                    getLancamento(indicadorId, sid || setorItem.id, m)
                                  }
                                />
                                {renderIndicadoresAdicionais(modulo, indsExtras, setorItem.id)}
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
                            const indsModulo = getIndicadoresSetorFiltrados(setorItem.id, modulo.id);
                            const indsExtras = indsModulo.filter((ind) => !coveredIds.has(String(ind.id)));
                            if (indsModulo.length === 0) return null;
                            return (
                              <div key={`${String(modulo.id)}-${setorItem.id}`} className={layout.itemClass}>
                                <Badge variant="outline" className="mb-2 text-xs">{setorItem.nome}</Badge>
                                <MispCard
                                  ano={anoAtual}
                                  mes={mesAtual}
                                  indicadores={indsModulo}
                                  lancamentos={lancamentos}
                                  setorId={setorItem.id}
                                  moduloId={modulo.id}
                                  modulo={modulo}
                                  getLancamento={(indicadorId, sid, m) =>
                                    getLancamento(indicadorId, sid || setorItem.id, m)
                                  }
                                />
                                {renderIndicadoresAdicionais(modulo, indsExtras, setorItem.id)}
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
                            const indsModulo = getIndicadoresSetorFiltrados(setorItem.id, modulo.id);
                            const indsSpecial = indsModulo.filter((ind) => coveredIds.has(String(ind.id)));
                            const indsExtras = indsModulo.filter((ind) => !coveredIds.has(String(ind.id)));
                            if (indsModulo.length === 0) return null;
                            return (
                              <div key={`${String(modulo.id)}-${setorItem.id}`} className={layout.itemClass}>
                                <Badge variant="outline" className="mb-2 text-xs">{setorItem.nome}</Badge>
                                <ProducaoCard
                                  ano={anoAtual}
                                  mes={mesAtual}
                                  indicadores={indsSpecial}
                                  lancamentos={lancamentos}
                                  metas={metas}
                                  setorIds={[setorItem.id]}
                                  setores={setoresVisiveis}
                                  moduloId={modulo.id}
                                  anosSelecionados={[anoAtual]}
                                  getLancamentoComparado={(indicadorId, m) =>
                                    getLancamento(indicadorId, setorItem.id, m)
                                  }
                                  getMetaComparada={(indicadorId) => getMeta(indicadorId, setorItem.id)}
                                />
                                {renderIndicadoresAdicionais(modulo, indsExtras, setorItem.id)}
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
                            const indsModulo = getIndicadoresSetorFiltrados(setorItem.id, modulo.id);
                            if (indsModulo.length === 0) return null;
                            return (
                              <div key={`${String(modulo.id)}-${setorItem.id}`} className={layout.itemClass}>
                                <Badge variant="outline" className="mb-2 text-xs">{setorItem.nome}</Badge>
                                <ModuloDashboardBundle
                                  modulo={modulo}
                                  indicadores={indsModulo}
                                  lancamentos={lancamentos}
                                  metas={metas}
                                  ano={anoAtual}
                                  mes={mesAtual}
                                  setorId={setorItem.id}
                                  moduloId={modulo.id}
                                  getLancamento={(indicadorId, sid, m) =>
                                    getLancamento(indicadorId, sid || setorItem.id, m)
                                  }
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
                          const indsModulo = getIndicadoresSetorFiltrados(setorItem.id, modulo.id)
                            .sort((a, b) => toOrdemNumber(a.ordem) - toOrdemNumber(b.ordem));
                          if (indsModulo.length === 0) return null;
                          return (
                            <Card
                              key={`${String(modulo.id)}-${setorItem.id}`}
                              className={`${layout.itemClass} overflow-hidden`}
                              data-modulo-id={String(modulo.id)}
                              data-setor-id={setorItem.id}
                            >
                              <CardHeader className="pb-2 bg-secondary/30">
                                <div className="flex items-center justify-between">
                                  <CardTitle className="text-base font-jakarta">{String(modulo.nome || 'Módulo')}</CardTitle>
                                  <Badge variant="outline" className="text-xs">
                                    {indsModulo.length} indicadores · {setorItem.nome}
                                  </Badge>
                                </div>
                              </CardHeader>
                              <CardContent className="pt-4">
                                <GenericModuloChartGrid
                                  modulo={modulo}
                                  indsDoModulo={indsModulo}
                                  setorParaGrafico={String(setorItem.id)}
                                  mesAtual={mesAtual}
                                  anoAtual={anoAtual}
                                  buildChartData={(indicadorId, sid) =>
                                    MESES.map((m, i) => ({
                                      mes: m,
                                      valor: getLancamento(indicadorId, sid || String(setorItem.id), i + 1)?.valor ?? null,
                                      meta: getMeta(indicadorId, sid || String(setorItem.id))?.valor ?? null,
                                    }))
                                  }
                                  getMeta={(indicadorId, sid) => getMeta(indicadorId, sid || String(setorItem.id))}
                                  getLancamento={(indicadorId, sid, m) =>
                                    getLancamento(indicadorId, sid || String(setorItem.id), m)
                                  }
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
            </>
          )}
        </>
      ) : null}
      {showExport ? (
        <ExportPDFModal
          open={showExport}
          onClose={() => setShowExport(false)}
          modulos={modulosComissoes}
          indicadores={indicadoresComissoes}
          lancamentos={lancamentos}
          metas={metas}
          anoAtual={anoAtual}
          mesAtual={mesAtual}
          setores={setoresVisiveis}
          dashboardSetorId={setorIdsAtivos}
        />
      ) : null}
    </div>
  );
}
