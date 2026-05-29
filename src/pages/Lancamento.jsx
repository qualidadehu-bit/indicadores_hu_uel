import { useState, useMemo, useEffect } from 'react';
import { api } from '@/api/apiClient';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Save, ChevronDown, ChevronRight, Info, Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { useToast } from '@/components/ui/use-toast';
import { MESES_COMPLETO } from '@/lib/indicadores';
import { filtrarIndicadoresPorDivisao, filtrarIndicadoresPorSetorWhitelist, indicadorIdsWhitelistSetor } from '@/lib/indicadorDivisao';
import { lancamentoModuloPizzaFatias, duplicatePizzaFatiaIndicadorIds } from '@/lib/pizzaFatias';
import { normalizeSheetId } from '@/lib/sheetsEntityNormalize';
import { useAuth } from '@/lib/AuthContext';
import { getSetoresVisiveisParaUsuario } from '@/lib/gestorSession';
import { parseLocaleNumber } from '@/lib/numberParsing';
import {
  DASHBOARD_SCOPE_LEGACY,
  getIndicadorDashboardScope,
  filtrarIndicadoresPorDashboardScope,
  filtrarModulosPorDashboardScope,
  normalizeDashboardScope,
} from '@/lib/dashboardScope';
import { ACAO_LANCAR_DADOS, canUserPerformScopedAction, getUserScopePermissions } from '@/lib/scopePermissions';
import { ENTITY_TYPE_CLINICA, ENTITY_TYPE_COMISSAO, ENTITY_TYPE_SETOR, normalizeEntityType } from '@/lib/entityType';

function ordemLancamentoIndicador(ordem) {
  const n = typeof ordem === 'number' && !Number.isNaN(ordem) ? ordem : Number(ordem);
  return Number.isFinite(n) ? n : 0;
}

const GRUPO_VISUAL_OUTROS = 'Outros';

function nomeGrupoVisualLancamento(indicador) {
  const nome = String(indicador?.grupo_visual ?? '').trim();
  return nome || GRUPO_VISUAL_OUTROS;
}

function compareGrupoVisualLancamento(a, b) {
  const aIsOutros = String(a).toLocaleLowerCase('pt-BR') === GRUPO_VISUAL_OUTROS.toLocaleLowerCase('pt-BR');
  const bIsOutros = String(b).toLocaleLowerCase('pt-BR') === GRUPO_VISUAL_OUTROS.toLocaleLowerCase('pt-BR');
  if (aIsOutros && !bIsOutros) return 1;
  if (bIsOutros && !aIsOutros) return -1;
  return String(a).localeCompare(String(b), 'pt-BR', { sensitivity: 'base' });
}

function grupoOpenKey(moduloId, grupoNome) {
  return `${String(moduloId)}::${String(grupoNome).toLocaleLowerCase('pt-BR')}`;
}

/** Chave estável para o mapa `editando` (ids vêm como `unknown` em entidades da planilha). @param {unknown} id */
function editandoKey(id) {
  return String(id);
}

/**
 * Variáveis do `useMutation` de upsert (TanStack Query não infere `TVariables` em checkJs e cai em `void`).
 * @typedef {{ indicador: Record<string, unknown>; valor: string; nota?: string }} LancamentoUpsertVariables
 */

export default function Lancamento({ ano, mes, entityType = ENTITY_TYPE_SETOR, dashboardScope = DASHBOARD_SCOPE_LEGACY }) {
  const anoAtual = ano || new Date().getFullYear();
  const mesAtual = mes || new Date().getMonth() + 1;
  const domainType = normalizeEntityType(entityType);
  const isComissao = domainType === ENTITY_TYPE_COMISSAO;
  const isClinica = domainType === ENTITY_TYPE_CLINICA;
  const [setorId, setSetorId] = useState('');
  const [openModulos, setOpenModulos] = useState({});
  const [openGrupos, setOpenGrupos] = useState({});
  const [editando, setEditando] = useState({});
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const dashboardScopeAtivo = normalizeDashboardScope(dashboardScope);
  const entityLabelSingular = isClinica ? 'clínica' : isComissao ? 'comissão' : 'setor';
  const entityArticleSingular = isClinica || isComissao ? 'uma' : 'um';
  const entityScopeDescription = isClinica
    ? 'Fluxo exclusivo de práticas médicas'
    : (isComissao ? 'Fluxo exclusivo de comissões' : 'Fluxo exclusivo de setores hospitalares');

  const { data: setores = [] } = useQuery({
    queryKey: ['setores', domainType],
    queryFn: () => api.entities.Setor.filter({ entity_type: domainType }),
  });
  const setoresVis = useMemo(() => getSetoresVisiveisParaUsuario(setores, user), [setores, user]);

  useEffect(() => {
    if (!setorId) {
      if (setoresVis.length === 1) setSetorId(String(setoresVis[0].id));
      return;
    }
    if (!setoresVis.some((s) => String(s.id) === String(setorId))) {
      setSetorId(setoresVis[0] ? String(setoresVis[0].id) : '');
    }
  }, [setoresVis, setorId]);
  const { data: modulos = [] } = useQuery({
    queryKey: ['modulos', domainType],
    queryFn: () => api.entities.Modulo.filter({ entity_type: domainType }),
  });
  const { data: indicadores = [] } = useQuery({
    queryKey: ['indicadores', domainType],
    queryFn: () => api.entities.Indicador.filter({ entity_type: domainType }),
  });
  const { data: metas = [] } = useQuery({
    queryKey: ['metas', domainType, anoAtual],
    queryFn: () => api.entities.Meta.filter({ ano: anoAtual, entity_type: domainType }),
  });
  const modulosById = useMemo(
    () => new Map(modulos.map((m) => [String(m.id), m])),
    [modulos]
  );
  /** @type {Array<{ id: string|number, nome?: string } & Record<string, unknown>>} */
  const modulosScoped = useMemo(
    () => /** @type {Array<{ id: string|number, nome?: string } & Record<string, unknown>>} */ (
      filtrarModulosPorDashboardScope(modulos, dashboardScopeAtivo)
    ),
    [modulos, dashboardScopeAtivo]
  );
  const indicadoresScoped = useMemo(
    () => filtrarIndicadoresPorDashboardScope(indicadores, modulosById, dashboardScopeAtivo),
    [indicadores, modulosById, dashboardScopeAtivo]
  );

  const setorSelecionado = useMemo(() => setoresVis.find(s => String(s.id) === String(setorId)), [setoresVis, setorId]);
  const divisaoLancamento = setorSelecionado && String(setorSelecionado.divisao || '').trim()
    ? String(setorSelecionado.divisao).trim()
    : null;
  const indicadoresFiltrados = useMemo(() => {
    const porDiv = filtrarIndicadoresPorDivisao(indicadoresScoped, divisaoLancamento);
    return filtrarIndicadoresPorSetorWhitelist(porDiv, setorSelecionado);
  }, [indicadoresScoped, divisaoLancamento, setorSelecionado]);
  const indicadoresPermitidosLancamento = useMemo(
    () =>
      indicadoresFiltrados.filter((ind) =>
        canUserPerformScopedAction(user, ACAO_LANCAR_DADOS, {
          dashboard: getIndicadorDashboardScope(ind, modulosById.get(String(ind.modulo_id))),
          grupo: normalizeSheetId(ind.grupo_scope),
        })
      ),
    [indicadoresFiltrados, user, modulosById]
  );
  const possuiAlgumaPermissaoLancamento = useMemo(() => {
    if (!user || String(user.tipo) !== 'gestor') return true;
    const regras = getUserScopePermissions(user);
    if (!regras.length) return true;
    return regras.some((r) => r.acao === ACAO_LANCAR_DADOS || r.acao === 'admin' || r.acao === '*');
  }, [user]);
  const qtdIndicadoresBloqueadosPorEscopo = Math.max(
    0,
    indicadoresFiltrados.length - indicadoresPermitidosLancamento.length
  );

  const { data: lancamentos = [], isLoading: loadingLanc } = useQuery({
    queryKey: ['lancamentos', domainType, anoAtual, mesAtual, setorId],
    queryFn: () => api.entities.Lancamento.filter({ ano: anoAtual, mes: mesAtual, setor_id: setorId, entity_type: domainType }),
    enabled: !!setorId,
  });

  /** @type {import('@tanstack/react-query').UseMutationOptions<unknown, Error, LancamentoUpsertVariables>} */
  const upsertMutationOptions = {
    mutationFn: async ({ indicador, valor, nota }) => {
      const setor = setoresVis.find(s => String(s.id) === String(setorId));
      const existing = lancamentos.find(l => l.indicador_id === indicador.id);
      const valorParsed = parseLocaleNumber(valor);
      if (valorParsed == null) {
        throw new Error('Valor invalido. Use apenas numeros (ex.: 7,4 ou 1234.56).');
      }
      const payload = {
        indicador_id: indicador.id,
        indicador_nome: indicador.nome,
        setor_id: setorId,
        setor_nome: setor?.nome || '',
        modulo_id: indicador.modulo_id,
        entity_type: domainType,
        dashboard_scope: getIndicadorDashboardScope(indicador, modulosById.get(String(indicador.modulo_id))),
        grupo_scope: normalizeSheetId(indicador.grupo_scope),
        ano: anoAtual,
        mes: mesAtual,
        valor: valorParsed,
        nota: nota || '',
      };
      if (existing) {
        return api.entities.Lancamento.update(existing.id, payload);
      } else {
        return api.entities.Lancamento.create(payload);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lancamentos'] });
      toast({ title: 'Salvo com sucesso!', description: 'Lançamento registrado.' });
    },
    onError: (e) =>
      toast({
        title: e.message?.toLowerCase().includes('permissão negada') ? 'Permissão negada' : 'Erro',
        description: e.message,
        variant: 'destructive',
      }),
  };
  const upsertMutation = useMutation(upsertMutationOptions);

  const getLancamento = (indicadorId) => lancamentos.find(l => l.indicador_id === indicadorId);
  const getMeta = (indicadorId) =>
    metas.find(m => m.indicador_id === indicadorId && m.setor_id === setorId && m.ano === anoAtual);

  const handleEdit = (indicadorId, field, value) => {
    const k = editandoKey(indicadorId);
    setEditando(prev => ({
      ...prev,
      [k]: { ...(prev[k] || {}), [field]: value }
    }));
  };

  const handleSave = (indicador) => {
    const permitido = canUserPerformScopedAction(user, ACAO_LANCAR_DADOS, {
      dashboard: getIndicadorDashboardScope(indicador, modulosById.get(String(indicador.modulo_id))),
      grupo: normalizeSheetId(indicador.grupo_scope),
    });
    if (!permitido) {
      toast({
        title: 'Permissão negada',
        description: 'Seu perfil não pode lançar dados neste dashboard/grupo.',
        variant: 'destructive',
      });
      return;
    }
    const edit = editando[editandoKey(indicador.id)] || {};
    const lanc = getLancamento(indicador.id);
    const valor = edit.valor !== undefined ? edit.valor : String(lanc?.valor ?? '');
    const nota = edit.nota !== undefined ? edit.nota : (lanc?.nota ?? '');
    if (valor === '' || valor === null) return;
    upsertMutation.mutate({ indicador, valor, nota });
  };

  const handleSaveAll = async () => {
    const allInds = indicadoresPermitidosLancamento.filter(i => i.ativo !== false);
    const toSave = allInds.filter(ind => {
      const edit = editando[editandoKey(ind.id)] || {};
      const lanc = getLancamento(ind.id);
      const valor = edit.valor !== undefined ? edit.valor : String(lanc?.valor ?? '');
      return valor !== '' && valor !== null;
    });
    if (toSave.length === 0) {
      toast({ title: 'Nenhum dado para salvar', description: 'Preencha ao menos um campo.', variant: 'destructive' });
      return;
    }
    await Promise.all(toSave.map(ind => {
      const edit = editando[editandoKey(ind.id)] || {};
      const lanc = getLancamento(ind.id);
      const valor = edit.valor !== undefined ? edit.valor : String(lanc?.valor ?? '');
      const nota = edit.nota !== undefined ? edit.nota : (lanc?.nota ?? '');
      return upsertMutation.mutateAsync({ indicador: ind, valor, nota });
    }));
    toast({ title: '✅ Seus dados foram salvos', description: `${toSave.length} indicador(es) registrado(s) com sucesso.` });
  };

  const setModuloOpen = (id, nextOpen) => {
    setOpenModulos((prev) => ({ ...prev, [id]: nextOpen }));
  };
  const setGrupoOpen = (moduloId, grupoNome, nextOpen) => {
    const k = grupoOpenKey(moduloId, grupoNome);
    setOpenGrupos((prev) => ({ ...prev, [k]: nextOpen }));
  };

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-screen-xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-jakarta font-bold">Lançamento de Dados</h1>
          <p className="text-xs text-muted-foreground">{entityScopeDescription}</p>
          <p className="text-muted-foreground text-sm mt-0.5">{MESES_COMPLETO[mesAtual - 1]} / {anoAtual}</p>
        </div>
        <Select value={setorId} onValueChange={setSetorId}>
          <SelectTrigger className="w-56">
            <SelectValue placeholder={`Selecione ${isClinica ? 'a clínica' : isComissao ? 'a comissão' : 'o setor'}...`} />
          </SelectTrigger>
          <SelectContent>
            {setoresVis.map(s => <SelectItem key={String(s.id)} value={String(s.id)}>{String(s.nome ?? '')}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {setorId && setorSelecionado && indicadorIdsWhitelistSetor(setorSelecionado) && indicadoresFiltrados.length === 0 && (
        <div className="rounded-lg border border-orange-200 bg-orange-50 px-4 py-3 text-sm text-orange-900">
          Este setor tem lista restrita de indicadores e nenhum ficou disponível para lançamento. Ajuste em Configuração → Divisões e Setores.
        </div>
      )}
      {setorId && qtdIndicadoresBloqueadosPorEscopo > 0 ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {qtdIndicadoresBloqueadosPorEscopo} indicador(es) foram ocultados por permissão de escopo do seu perfil.
        </div>
      ) : null}

      {!setorId ? (
        <Card className="border-dashed">
          <CardContent className="py-16 text-center">
            <Info className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
            <p className="text-muted-foreground">
              Selecione {`${entityArticleSingular} ${entityLabelSingular}`} para iniciar o lançamento
            </p>
          </CardContent>
        </Card>
      ) : loadingLanc ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      ) : !possuiAlgumaPermissaoLancamento ? (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="py-12 text-center text-red-900">
            Permissão negada: seu perfil não possui a ação <strong>lancar_dados</strong> em nenhum escopo.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {modulosScoped.map(modulo => {
            const inds = indicadoresPermitidosLancamento.filter(i => i.modulo_id === modulo.id && i.ativo !== false);
            if (inds.length === 0) return null;
            const isOpen = openModulos[modulo.id] !== false;

            const indsSorted = [...inds].sort(
              (a, b) => ordemLancamentoIndicador(a.ordem) - ordemLancamentoIndicador(b.ordem) || String(a.nome).localeCompare(String(b.nome))
            );
            /** Lista de fatias customizadas para este módulo no lançamento (ver `lancamentoModuloPizzaFatias`). */
            const fatiasList = lancamentoModuloPizzaFatias(modulo, indsSorted);
            const fatiasDupIds = fatiasList?.length ? duplicatePizzaFatiaIndicadorIds(fatiasList) : [];
            /** Indicadores cujo id aparece como origem de fatia: ocultamos da lista principal para não duplicar linhas. */
            const idsSomenteFatias =
              fatiasList && fatiasList.length > 0
                ? new Set(fatiasList.map((f) => normalizeSheetId(f.indicador_id)))
                : null;
            const indsLinhasNormais =
              idsSomenteFatias && idsSomenteFatias.size > 0
                ? indsSorted.filter((ind) => !idsSomenteFatias.has(normalizeSheetId(ind.id)))
                : indsSorted;
            /** @type {Array<{ nome: string, indicadores: Array<Record<string, unknown>> }>} */
            const gruposOrdenados = (() => {
              /** @type {Map<string, Array<Record<string, unknown>>>} */
              const byGrupo = new Map();
              for (const ind of indsLinhasNormais) {
                const grupoNome = nomeGrupoVisualLancamento(ind);
                if (!byGrupo.has(grupoNome)) byGrupo.set(grupoNome, []);
                byGrupo.get(grupoNome).push(ind);
              }
              return [...byGrupo.entries()]
                .sort((a, b) => compareGrupoVisualLancamento(a[0], b[0]))
                .map(([nome, indicadores]) => ({ nome, indicadores }));
            })();

            return (
              <Collapsible key={modulo.id} open={isOpen} onOpenChange={(nextOpen) => setModuloOpen(modulo.id, nextOpen)}>
                <Card className="overflow-hidden">
                  <CollapsibleTrigger className="w-full">
                    <CardHeader className="pb-3 bg-secondary/30 hover:bg-secondary/50 transition-colors cursor-pointer">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-base font-jakarta flex items-center gap-2">
                          {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                          {modulo.nome}
                        </CardTitle>
                        <Badge variant="outline" className="text-xs">{inds.length} indicadores</Badge>
                      </div>
                    </CardHeader>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <CardContent className="pt-4">
                      <div className="space-y-4">
                        {fatiasDupIds.length > 0 ? (
                          <div
                            className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-950"
                            role="status"
                          >
                            Atenção: o mesmo indicador aparece em mais de uma fatia da pizza (ids:{' '}
                            {fatiasDupIds.join(', ')}). Os valores serão somados no gráfico; confirme se foi intencional.
                          </div>
                        ) : null}
                        {fatiasList && fatiasList.length > 0 ? (
                          <div className="space-y-3 rounded-lg border border-amber-200/80 bg-amber-50/40 p-3" role="region" aria-label="Pizza — fatias">
                            <p className="text-sm font-semibold text-foreground">Pizza — fatias</p>
                            <p className="text-[11px] text-muted-foreground">
                              Cada linha grava no indicador indicado (mesmo mês e setor). Indicadores listados aqui não
                              aparecem duplicados na lista abaixo.
                            </p>
                            {fatiasList.map((fatia, fi) => {
                              const idFat = normalizeSheetId(fatia.indicador_id);
                              const indAlvo = indicadoresPermitidosLancamento.find((x) => String(x.id) === idFat);
                              const lanc = indAlvo ? getLancamento(indAlvo.id) : undefined;
                              const meta = indAlvo ? getMeta(indAlvo.id) : undefined;
                              const editAtual = indAlvo ? editando[editandoKey(indAlvo.id)] || {} : {};
                              const valorDisplay = indAlvo
                                ? editAtual.valor !== undefined
                                  ? editAtual.valor
                                  : String(lanc?.valor ?? '')
                                : '';
                              const notaDisplay = indAlvo
                                ? editAtual.nota !== undefined
                                  ? editAtual.nota
                                  : (lanc?.nota ?? '')
                                : '';
                              const hasChanges = indAlvo && (editAtual.valor !== undefined || editAtual.nota !== undefined);

                              return (
                                <div key={`${idFat}-${fi}`} className="space-y-2">
                                  <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center py-2 border-b border-dashed border-amber-200/60 last:border-0">
                                    <div className="md:col-span-4">
                                      <p className="text-sm font-medium">{fatia.label}</p>
                                      {indAlvo ? (
                                        <p className="text-xs text-muted-foreground">
                                          {String(indAlvo.label || indAlvo.nome || '')}
                                          <span className="font-mono text-[10px] opacity-70"> · {idFat}</span>
                                        </p>
                                      ) : (
                                        <p className="text-xs text-amber-900">
                                          Indicador não disponível neste setor/divisão — ajuste o JSON em Configuração.
                                        </p>
                                      )}
                                      <p className="text-xs text-muted-foreground md:hidden">
                                        {String(indAlvo?.unidade ?? '—')} | Meta: {meta?.valor ?? '—'}
                                      </p>
                                    </div>
                                    <div className="hidden md:flex md:col-span-2 justify-center">
                                      <span className="text-sm font-medium text-muted-foreground">{meta?.valor ?? '—'}</span>
                                    </div>
                                    <div className="hidden md:block md:col-span-2 text-sm text-muted-foreground">{String(indAlvo?.unidade ?? '—')}</div>
                                    <div className="md:col-span-2">
                                      <Input
                                        type="number"
                                        step="any"
                                        value={valorDisplay}
                                        onChange={(e) => indAlvo && handleEdit(indAlvo.id, 'valor', e.target.value)}
                                        placeholder="0"
                                        className="h-8 text-sm text-center"
                                        disabled={!indAlvo}
                                        aria-label={`Valor — ${fatia.label}`}
                                      />
                                    </div>
                                    <div className="md:col-span-1 flex justify-center">
                                      <Button
                                        size="sm"
                                        variant={hasChanges ? 'default' : 'outline'}
                                        className="h-8 px-3"
                                        disabled={upsertMutation.isPending || !indAlvo}
                                        onClick={() => indAlvo && handleSave(indAlvo)}
                                      >
                                        {upsertMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                                      </Button>
                                    </div>
                                  </div>
                                  <div className="md:pl-4">
                                    <Textarea
                                      value={notaDisplay}
                                      onChange={(e) => indAlvo && handleEdit(indAlvo.id, 'nota', e.target.value)}
                                      placeholder="Nota/justificativa (opcional)..."
                                      className="text-xs min-h-0 h-8 resize-none py-1.5"
                                      disabled={!indAlvo}
                                      aria-label={`Nota — ${fatia.label}`}
                                    />
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        ) : null}
                        {gruposOrdenados.map((grupo) => {
                          const grupoKey = grupoOpenKey(modulo.id, grupo.nome);
                          const grupoOpen = openGrupos[grupoKey] !== false;
                          return (
                            <Collapsible
                              key={grupoKey}
                              open={grupoOpen}
                              onOpenChange={(nextOpen) => setGrupoOpen(modulo.id, grupo.nome, nextOpen)}
                            >
                              <div className="rounded-lg border border-border/70 overflow-hidden">
                                <CollapsibleTrigger className="w-full">
                                  <div className="flex items-center justify-between px-3 py-2 bg-muted/25 hover:bg-muted/40 transition-colors">
                                    <p className="text-sm font-semibold flex items-center gap-2">
                                      {grupoOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                                      {grupo.nome}
                                    </p>
                                    <Badge variant="secondary" className="text-[11px]">
                                      {grupo.indicadores.length} indicador(es)
                                    </Badge>
                                  </div>
                                </CollapsibleTrigger>
                                <CollapsibleContent>
                                  <div className="p-3 space-y-3">
                                    <div className="hidden md:grid grid-cols-12 gap-3 text-xs font-medium text-muted-foreground uppercase tracking-wide border-b pb-2">
                                      <div className="col-span-4">Indicador</div>
                                      <div className="col-span-2 text-center">Meta</div>
                                      <div className="col-span-2">Unidade</div>
                                      <div className="col-span-2 text-center">Valor</div>
                                      <div className="col-span-1 text-center">Ação</div>
                                    </div>
                                    {grupo.indicadores.map((ind) => {
                                      const lanc = getLancamento(ind.id);
                                      const meta = getMeta(ind.id);
                                      const editAtual = editando[editandoKey(ind.id)] || {};
                                      const valorDisplay = editAtual.valor !== undefined ? editAtual.valor : String(lanc?.valor ?? '');
                                      const notaDisplay = editAtual.nota !== undefined ? editAtual.nota : (lanc?.nota ?? '');
                                      const hasChanges = editAtual.valor !== undefined || editAtual.nota !== undefined;

                                      return (
                                        <div key={String(ind.id)} className="space-y-2">
                                          <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center py-2 border-b border-dashed last:border-0">
                                            <div className="md:col-span-4">
                                              <p className="text-sm font-medium">{String(ind.label || ind.nome || '')}</p>
                                              <p className="text-xs text-muted-foreground md:hidden">{String(ind.unidade ?? '—')} | Meta: {meta?.valor ?? '—'}</p>
                                            </div>
                                            <div className="hidden md:flex md:col-span-2 justify-center">
                                              <span className="text-sm font-medium text-muted-foreground">{meta?.valor ?? '—'}</span>
                                            </div>
                                            <div className="hidden md:block md:col-span-2 text-sm text-muted-foreground">{String(ind.unidade ?? '—')}</div>
                                            <div className="md:col-span-2">
                                              <Input
                                                type="number"
                                                step="any"
                                                value={valorDisplay}
                                                onChange={e => handleEdit(ind.id, 'valor', e.target.value)}
                                                placeholder="0"
                                                className="h-8 text-sm text-center"
                                              />
                                            </div>
                                            <div className="md:col-span-1 flex justify-center">
                                              <Button
                                                size="sm"
                                                variant={hasChanges ? 'default' : 'outline'}
                                                className="h-8 px-3"
                                                disabled={upsertMutation.isPending}
                                                onClick={() => handleSave(ind)}
                                              >
                                                {upsertMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                                              </Button>
                                            </div>
                                          </div>
                                          <div className="md:pl-4">
                                            <Textarea
                                              value={notaDisplay}
                                              onChange={e => handleEdit(ind.id, 'nota', e.target.value)}
                                              placeholder="Nota/justificativa (opcional)..."
                                              className="text-xs min-h-0 h-8 resize-none py-1.5"
                                            />
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                </CollapsibleContent>
                              </div>
                            </Collapsible>
                          );
                        })}
                      </div>
                    </CardContent>
                  </CollapsibleContent>
                </Card>
              </Collapsible>
            );
          })}
        </div>
      )}

      {setorId && (
        <div className="flex justify-center pt-2 pb-4">
          <Button
            size="lg"
            onClick={handleSaveAll}
            disabled={upsertMutation.isPending}
            className="px-10 gap-2"
          >
            {upsertMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Salvar Dados
          </Button>
        </div>
      )}
      {setorId && indicadoresFiltrados.length > 0 && indicadoresPermitidosLancamento.length === 0 ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
          Permissão negada: seu perfil não possui escopo para lançar dados neste setor/dashboard/grupo.
        </div>
      ) : null}
    </div>
  );
}