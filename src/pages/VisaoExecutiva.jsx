import { useState } from 'react';
import { api } from '@/api/apiClient';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, AlertTriangle, XCircle, HelpCircle, TrendingUp } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import BadgeStatusMeta from '@/components/BadgeStatusMeta';
import { calcularStatusMeta, getStatusConfig, STATUS_META, MESES_COMPLETO } from '@/lib/indicadores';

const STATUS_ICONS = {
  [STATUS_META.OK]: CheckCircle2,
  [STATUS_META.ATENCAO]: AlertTriangle,
  [STATUS_META.CRITICO]: XCircle,
  [STATUS_META.SEM_DADOS]: HelpCircle,
};

export default function VisaoExecutiva({ ano, mes }) {
  const anoAtual = ano || new Date().getFullYear();
  const mesAtual = mes || new Date().getMonth() + 1;
  const [filtroStatus, setFiltroStatus] = useState('todos');
  const [filtroDivisao, setFiltroDivisao] = useState('todos');

  const { data: setores = [] } = useQuery({ queryKey: ['setores'], queryFn: () => api.entities.Setor.list() });
  const { data: indicadores = [] } = useQuery({ queryKey: ['indicadores'], queryFn: () => api.entities.Indicador.list() });
  const { data: lancamentos = [] } = useQuery({
    queryKey: ['lancamentos', anoAtual, mesAtual],
    queryFn: () => api.entities.Lancamento.filter({ ano: anoAtual, mes: mesAtual }),
  });
  const { data: metas = [] } = useQuery({
    queryKey: ['metas', anoAtual],
    queryFn: () => api.entities.Meta.filter({ ano: anoAtual }),
  });

  const divisoes = [...new Set(setores.map(s => s.divisao).filter(Boolean))];

  const getStatusSetor = (setorId) => {
    const inds = indicadores;
    const statusCounts = { ok: 0, atencao: 0, critico: 0, semDados: 0 };

    inds.forEach(ind => {
      const lanc = lancamentos.find(l => l.indicador_id === ind.id && l.setor_id === setorId);
      const meta = metas.find(m => m.indicador_id === ind.id && m.setor_id === setorId);
      const status = calcularStatusMeta(lanc?.valor, meta?.valor, ind.tipo_direcao_meta);
      if (status === STATUS_META.OK) statusCounts.ok++;
      else if (status === STATUS_META.ATENCAO) statusCounts.atencao++;
      else if (status === STATUS_META.CRITICO) statusCounts.critico++;
      else statusCounts.semDados++;
    });

    return statusCounts;
  };

  const getStatusGlobalSetor = (counts) => {
    if (counts.critico > 0) return STATUS_META.CRITICO;
    if (counts.atencao > 0) return STATUS_META.ATENCAO;
    if (counts.ok > 0) return STATUS_META.OK;
    return STATUS_META.SEM_DADOS;
  };

  const setoresFiltrados = setores
    .filter(s => filtroDivisao === 'todos' || s.divisao === filtroDivisao)
    .map(s => {
      const counts = getStatusSetor(s.id);
      const statusGlobal = getStatusGlobalSetor(counts);
      return { ...s, counts, statusGlobal };
    })
    .filter(s => filtroStatus === 'todos' || s.statusGlobal === filtroStatus);

  // Global summary
  const totalIndicadores = indicadores.length * setores.length;
  let globalOk = 0, globalAtencao = 0, globalCritico = 0, globalSemDados = 0;
  setores.forEach(s => {
    const c = getStatusSetor(s.id);
    globalOk += c.ok;
    globalAtencao += c.atencao;
    globalCritico += c.critico;
    globalSemDados += c.semDados;
  });
  const globalTotal = globalOk + globalAtencao + globalCritico + globalSemDados || 1;

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-screen-xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-jakarta font-bold flex items-center gap-2">
            <TrendingUp className="w-6 h-6 text-primary" />
            Visão Executiva
          </h1>
          <p className="text-muted-foreground text-sm mt-0.5">{MESES_COMPLETO[mesAtual - 1]} / {anoAtual}</p>
        </div>
      </div>

      {/* Global Summary */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'OK', count: globalOk, status: STATUS_META.OK },
          { label: 'Atenção', count: globalAtencao, status: STATUS_META.ATENCAO },
          { label: 'Crítico', count: globalCritico, status: STATUS_META.CRITICO },
          { label: 'Sem Dados', count: globalSemDados, status: STATUS_META.SEM_DADOS },
        ].map(({ label, count, status }) => {
          const cfg = getStatusConfig(status);
          const Icon = STATUS_ICONS[status];
          const pct = Math.round((count / globalTotal) * 100);
          return (
            <Card key={status} className={`border ${cfg.border} card-hover`}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <p className={`text-xs font-medium uppercase tracking-wide ${cfg.color}`}>{label}</p>
                  <Icon className={`w-4 h-4 ${cfg.color}`} />
                </div>
                <p className={`text-3xl font-jakarta font-bold ${cfg.color}`}>{count}</p>
                <Progress value={pct} className="mt-2 h-1.5" />
                <p className="text-xs text-muted-foreground mt-1">{pct}% do total</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <Select value={filtroDivisao} onValueChange={setFiltroDivisao}>
          <SelectTrigger className="w-44 h-9 text-sm">
            <SelectValue placeholder="Todas as divisões" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todas as divisões</SelectItem>
            {divisoes.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filtroStatus} onValueChange={setFiltroStatus}>
          <SelectTrigger className="w-36 h-9 text-sm">
            <SelectValue placeholder="Todos os status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos</SelectItem>
            <SelectItem value={STATUS_META.OK}>OK</SelectItem>
            <SelectItem value={STATUS_META.ATENCAO}>Atenção</SelectItem>
            <SelectItem value={STATUS_META.CRITICO}>Crítico</SelectItem>
            <SelectItem value={STATUS_META.SEM_DADOS}>Sem Dados</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Sector Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {setoresFiltrados.length === 0 ? (
          <div className="col-span-full text-center py-12 text-muted-foreground">
            Nenhum setor encontrado com os filtros selecionados
          </div>
        ) : (
          setoresFiltrados.map(setor => {
            const cfg = getStatusConfig(setor.statusGlobal);
            const Icon = STATUS_ICONS[setor.statusGlobal];
            const total = setor.counts.ok + setor.counts.atencao + setor.counts.critico + setor.counts.semDados || 1;
            const okPct = Math.round((setor.counts.ok / total) * 100);

            return (
              <Card key={setor.id} className={`border-l-4 card-hover ${cfg.border}`} style={{ borderLeftColor: '' }}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <p className="font-medium text-sm">{setor.nome}</p>
                      <p className="text-xs text-muted-foreground">{setor.divisao}</p>
                    </div>
                    <BadgeStatusMeta status={setor.statusGlobal} />
                  </div>
                  <div className="grid grid-cols-4 gap-2 text-center">
                    {[
                      { val: setor.counts.ok, color: 'text-green-600', bg: 'bg-green-50', label: 'OK' },
                      { val: setor.counts.atencao, color: 'text-amber-600', bg: 'bg-amber-50', label: 'Atç' },
                      { val: setor.counts.critico, color: 'text-red-600', bg: 'bg-red-50', label: 'Crít' },
                      { val: setor.counts.semDados, color: 'text-gray-500', bg: 'bg-gray-50', label: 'S/D' },
                    ].map(({ val, color, bg, label }) => (
                      <div key={label} className={`rounded-lg p-2 ${bg}`}>
                        <p className={`text-lg font-jakarta font-bold ${color}`}>{val}</p>
                        <p className={`text-xs ${color} opacity-70`}>{label}</p>
                      </div>
                    ))}
                  </div>
                  <div className="mt-3">
                    <div className="flex justify-between text-xs text-muted-foreground mb-1">
                      <span>Conformidade</span>
                      <span>{okPct}%</span>
                    </div>
                    <Progress value={okPct} className="h-1.5" />
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
}