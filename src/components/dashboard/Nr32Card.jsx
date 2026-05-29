import { useEffect, useState } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts';
import { ShieldCheck } from 'lucide-react';

const MESES_CURTO = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

const SERIES = [
  { label: 'Adornos',        color: '#1e3a5f' },
  { label: 'Cabelo Solto',   color: '#22c55e' },
  { label: 'Sem Jaleco',    color: '#f59e0b' },
  { label: 'Unhas c/ Relevo', color: '#ef4444' },
  { label: 'Unhas >2mm',    color: '#8b5cf6' },
  { label: 'Unhas Postiças', color: '#ec4899' },
];

export default function Nr32Card({ ano, mes, indicadores, lancamentos, setorId }) {
  const [mesSelecionado, setMesSelecionado] = useState(mes);
  useEffect(() => {
    setMesSelecionado(mes);
  }, [mes]);

  const getLanc = (indicadorId, m) =>
    lancamentos.find(l =>
      l.indicador_id === indicadorId &&
      l.mes === m &&
      (!setorId || l.setor_id === setorId)
    );

  // Build chart data — one entry per month, one key per indicator
  const chartData = MESES_CURTO.map((label, i) => {
    const row = { mes: label };
    indicadores.forEach(ind => {
      const key = ind.label || ind.nome;
      row[key] = getLanc(ind.id, i + 1)?.valor ?? null;
    });
    return row;
  });

  // Sort by ordem
  const inds = [...indicadores].sort((a, b) => (a.ordem || 0) - (b.ordem || 0));

  return (
    <div className="bg-white rounded-xl border border-border shadow-sm overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 pt-4 pb-3 flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-blue-600" />
            <span className="font-jakarta font-bold text-base">NR32 — Conformidade</span>
          </div>
          <p className="text-xs text-primary font-medium mt-0.5">
            Histórico {ano} · Mês: <span className="font-semibold">{MESES_CURTO[mesSelecionado - 1]}</span>
          </p>
        </div>
        <div className="flex flex-wrap gap-1">
          {MESES_CURTO.map((m, i) => (
            <button
              key={m}
              onClick={() => setMesSelecionado(i + 1)}
              className={`px-2 py-0.5 rounded text-xs font-medium transition-all ${
                mesSelecionado === i + 1
                  ? 'bg-cyan-500 text-white'
                  : 'text-muted-foreground hover:bg-secondary'
              }`}
            >
              {m}
            </button>
          ))}
        </div>
      </div>

      {/* KPI row — current month values */}
      <div className="flex flex-wrap gap-3 px-5 pb-3">
        {inds.map((ind, idx) => {
          const val = getLanc(ind.id, mesSelecionado)?.valor;
          const serie = SERIES.find(s => s.label === (ind.label || ind.nome)) || SERIES[idx % SERIES.length];
          return (
            <div key={ind.id} className="flex-1 min-w-[100px] border rounded-lg px-3 py-2" style={{ borderColor: serie.color + '55' }}>
              <p className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: serie.color }}>
                {ind.label || ind.nome}
              </p>
              <p className="text-xl font-jakarta font-bold text-foreground mt-0.5">
                {val !== null && val !== undefined ? `${val}%` : '—'}
              </p>
            </div>
          );
        })}
      </div>

      {/* Line chart */}
      <div className="px-5 pb-5">
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={chartData} margin={{ top: 10, right: 10, left: -10, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
            <XAxis dataKey="mes" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 10 }} axisLine={false} tickLine={false} unit="%" domain={[60, 100]} />
            <Tooltip
              contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #e5e7eb' }}
              formatter={(v, name) => [v !== null ? `${v}%` : '—', name]}
            />
            <Legend wrapperStyle={{ fontSize: 10 }} />
            {inds.map((ind, idx) => {
              const key = ind.label || ind.nome;
              const serie = SERIES.find(s => s.label === key) || SERIES[idx % SERIES.length];
              return (
                <Line
                  key={ind.id}
                  type="monotone"
                  dataKey={key}
                  name={key}
                  stroke={serie.color}
                  strokeWidth={2}
                  dot={{ r: 3, fill: serie.color, strokeWidth: 0 }}
                  connectNulls={false}
                />
              );
            })}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}