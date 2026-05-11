import { useState } from 'react';
import { api } from '@/api/apiClient';
import { useQuery } from '@tanstack/react-query';
import { Activity, TrendingDown, AlertTriangle, CheckCircle2, ChevronLeft } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Link } from 'react-router-dom';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine
} from 'recharts';
import { MESES, MESES_COMPLETO, calcularStatusMeta, STATUS_META } from '@/lib/indicadores';
import BadgeStatusMeta from '@/components/BadgeStatusMeta';
import ProducaoCard from '@/components/dashboard/ProducaoCard';
import MispCard from '@/components/dashboard/MispCard';
import EventosAdversosCard from '@/components/dashboard/EventosAdversosCard';
import LesaoPressaoCard from '@/components/dashboard/LesaoPressaoCard';
import IrasCard from '@/components/dashboard/IrasCard';

const COLORS = ['#2d7d46', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];
const ANOS = [new Date().getFullYear() - 1, new Date().getFullYear(), new Date().getFullYear() + 1];

export default function VisualizacaoDashboard() {
  const [ano, setAno] = useState(new Date().getFullYear());
  const [mes, setMes] = useState(new Date().getMonth() + 1);
  const [divisaoSelecionada, setDivisaoSelecionada] = useState('todas');
  const [setorSelecionado, setSetorSelecionado] = useState('todos');
  const [moduloSelecionado, setModuloSelecionado] = useState('todos');

  const { data: setores = [] } = useQuery({ queryKey: ['setores-pub'], queryFn: () => api.entities.Setor.list() });
  const { data: modulos = [] } = useQuery({ queryKey: ['modulos-pub'], queryFn: () => api.entities.Modulo.list() });
  const { data: indicadores = [] } = useQuery({ queryKey: ['indicadores-pub'], queryFn: () => api.entities.Indicador.list() });
  const { data: lancamentos = [] } = useQuery({ queryKey: ['lancamentos-pub', ano], queryFn: () => api.entities.Lancamento.filter({ ano }) });
  const { data: metas = [] } = useQuery({ queryKey: ['metas-pub', ano], queryFn: () => api.entities.Meta.filter({ ano }) });

  // Agrupar setores por divisão
  const divisoes = [...new Set(setores.map(s => s.divisao))].sort();
  const setoresDaDivisao = divisaoSelecionada === 'todas'
    ? setores
    : setores.filter(s => s.divisao === divisaoSelecionada);

  const setorContextoId = setorSelecionado !== 'todos' ? setorSelecionado : null;
  const setorParaGrafico = setorContextoId;

  const getLancamento = (indicadorId, sid, m) =>
    sid ? lancamentos.find(l => l.indicador_id === indicadorId && l.setor_id === sid && l.mes === m) : undefined;

  const getMeta = (indicadorId, sid) =>
    sid ? metas.find(m => m.indicador_id === indicadorId && m.setor_id === sid) : undefined;

  const buildChartData = (indicadorId, setorId) =>
    MESES.map((m, i) => {
      const lanc = getLancamento(indicadorId, setorId, i + 1);
      const metaRec = getMeta(indicadorId, setorId);
      return { mes: m, valor: lanc?.valor ?? null, meta: metaRec?.valor ?? null };
    });

  const kpis = (() => {
    let ok = 0, atencao = 0, critico = 0, semDados = 0;
    indicadores.forEach(ind => {
      const metaRec = getMeta(ind.id, setorContextoId);
      const lancRec = getLancamento(ind.id, setorContextoId, mes);
      const status = calcularStatusMeta(lancRec?.valor, metaRec?.valor, ind.tipo_direcao_meta);
      if (status === STATUS_META.OK) ok++;
      else if (status === STATUS_META.ATENCAO) atencao++;
      else if (status === STATUS_META.CRITICO) critico++;
      else semDados++;
    });
    return { ok, atencao, critico, semDados };
  })();

  const modulosFiltrados = moduloSelecionado === 'todos'
    ? modulos
    : modulos.filter(m => m.id === moduloSelecionado);

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
              <Select value={divisaoSelecionada} onValueChange={(v) => { setDivisaoSelecionada(v); setSetorSelecionado('todos'); }}>
                <SelectTrigger className="h-8 w-40 text-xs bg-sidebar-accent border-sidebar-border text-sidebar-foreground">
                  <SelectValue placeholder="Divisão" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todas">Todas as Divisões</SelectItem>
                  {divisoes.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={setorSelecionado} onValueChange={setSetorSelecionado}>
                <SelectTrigger className="h-8 w-40 text-xs bg-sidebar-accent border-sidebar-border text-sidebar-foreground">
                  <SelectValue placeholder="Setor" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos os Setores</SelectItem>
                  {setoresDaDivisao.map(s => <SelectItem key={s.id} value={s.id}>{s.nome}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={moduloSelecionado} onValueChange={setModuloSelecionado}>
                <SelectTrigger className="h-8 w-44 text-xs bg-sidebar-accent border-sidebar-border text-sidebar-foreground">
                  <SelectValue placeholder="Módulo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos os Módulos</SelectItem>
                  {modulos.map(m => <SelectItem key={m.id} value={m.id}>{m.nome}</SelectItem>)}
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

        {!setorContextoId && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            Selecione um setor nos filtros para comparar indicadores com a meta de cada setor. Com &quot;Todos os Setores&quot;, os KPIs e linhas de meta não são calculados.
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
        {indicadores.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="py-16 text-center">
              <Activity className="w-12 h-12 text-muted-foreground/40 mx-auto mb-3" />
              <p className="text-muted-foreground font-medium">Nenhum indicador configurado</p>
            </CardContent>
          </Card>
        ) : (
          modulosFiltrados.map(modulo => {
            const indsDoModulo = indicadores.filter(i => i.modulo_id === modulo.id);
            if (indsDoModulo.length === 0) return null;

            if (modulo.nome === 'Lesão por Pressão (LP)') {
              return (
                <LesaoPressaoCard
                  key={modulo.id}
                  ano={ano}
                  mes={mes}
                  indicadores={indsDoModulo}
                  lancamentos={lancamentos}
                  setorId={setorParaGrafico}
                />
              );
            }

            if (modulo.nome === 'IRAS') {
              const moduloNr32 = modulos.find(m => m.nome === 'NR32');
              const indsNr32 = moduloNr32 ? indicadores.filter(i => i.modulo_id === moduloNr32.id) : [];
              return (
                <IrasCard
                  key={modulo.id}
                  ano={ano}
                  mes={mes}
                  indicadores={indsDoModulo}
                  lancamentos={lancamentos}
                  setorId={setorParaGrafico}
                  indicadoresNr32={indsNr32}
                />
              );
            }

            if (modulo.nome === 'Eventos Adversos') {
              return (
                <EventosAdversosCard
                  key={modulo.id}
                  ano={ano}
                  mes={mes}
                  indicadores={indsDoModulo}
                  lancamentos={lancamentos}
                  setorId={setorParaGrafico}
                />
              );
            }

            if (modulo.nome === 'NR32') return null;

            if (modulo.nome === 'MISP') {
              return (
                <MispCard
                  key={modulo.id}
                  ano={ano}
                  mes={mes}
                  indicadores={indsDoModulo}
                  lancamentos={lancamentos}
                  setorId={setorParaGrafico}
                />
              );
            }

            if (modulo.nome === 'Produção') {
              return (
                <ProducaoCard
                  key={modulo.id}
                  ano={ano}
                  mes={mes}
                  indicadores={indicadores}
                  lancamentos={lancamentos}
                  metas={metas}
                  setorId={setorParaGrafico}
                />
              );
            }

            return (
              <Card key={modulo.id} className="overflow-hidden">
                <CardHeader className="pb-2 bg-secondary/30">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base font-jakarta">{modulo.nome}</CardTitle>
                    <Badge variant="outline" className="text-xs">{indsDoModulo.length} indicadores</Badge>
                  </div>
                </CardHeader>
                <CardContent className="pt-4">
                  <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                    {indsDoModulo.map((ind, idx) => {
                      const chartData = buildChartData(ind.id, setorParaGrafico);
                      const metaRec = getMeta(ind.id, setorParaGrafico);
                      const lancAtual = getLancamento(ind.id, setorParaGrafico, mes);
                      const status = calcularStatusMeta(lancAtual?.valor, metaRec?.valor, ind.tipo_direcao_meta);

                      return (
                        <div key={ind.id} className="space-y-2">
                          <div className="flex items-center justify-between flex-wrap gap-2">
                            <div>
                              <p className="text-sm font-medium">{ind.label || ind.nome}</p>
                              <p className="text-xs text-muted-foreground">{ind.unidade}</p>
                            </div>
                            <div className="flex items-center gap-2">
                              {lancAtual?.valor !== undefined && (
                                <span className="text-lg font-jakarta font-bold">
                                  {lancAtual.valor}{ind.unidade?.startsWith('%') ? '%' : ''}
                                </span>
                              )}
                              <BadgeStatusMeta status={status} />
                            </div>
                          </div>
                          <ResponsiveContainer width="100%" height={160}>
                            <LineChart data={chartData} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
                              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                              <XAxis dataKey="mes" tick={{ fontSize: 10 }} />
                              <YAxis tick={{ fontSize: 10 }} />
                              <Tooltip
                                contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e5e7eb' }}
                                formatter={(v, name) => [v !== null ? v : '-', name === 'valor' ? ind.label || ind.nome : 'Meta']}
                              />
                              {metaRec?.valor && (
                                <ReferenceLine y={metaRec.valor} stroke="#f59e0b" strokeDasharray="4 4"
                                  label={{ value: 'Meta', fontSize: 10, fill: '#f59e0b' }} />
                              )}
                              <Line type="monotone" dataKey="valor" stroke={COLORS[idx % COLORS.length]}
                                strokeWidth={2} dot={{ r: 3 }} connectNulls={false} name={ind.label || ind.nome} />
                            </LineChart>
                          </ResponsiveContainer>
                          {lancAtual?.nota && (
                            <p className="text-xs text-muted-foreground italic bg-secondary/40 rounded px-2 py-1">
                              📝 {lancAtual.nota}
                            </p>
                          )}
                        </div>
                      );
                    })}
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