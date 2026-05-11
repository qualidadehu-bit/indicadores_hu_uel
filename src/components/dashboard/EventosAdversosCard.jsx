import { useState } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, Legend
} from 'recharts';
import { AlertTriangle } from 'lucide-react';

const MESES_CURTO = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

// Row colors cycling like the layout
const ROW_COLORS = [
  '#f59e0b', // laranja
  '#ec4899', // rosa
  '#3b82f6', // azul
  '#ef4444', // vermelho
  '#f59e0b', // laranja
  '#ec4899', // rosa
  '#ef4444', // vermelho
  '#ec4899', // rosa
  '#ef4444', // vermelho
  '#22c55e', // verde
];

// Line colors for density chart
const LINE_COLORS = {
  'Todas':          '#1e3a5f',
  'Identificação':  '#22c55e',
  'Medicação':      '#ec4899',
  'Higiene das mãos': '#06b6d4',
  'LP':             '#8b5cf6',
  'LPDM':           '#a16207',
  'Queda':          '#f97316',
  'IRCVA':          '#ef4444',
};

// Categoria density filter pills
const DENSITY_CATS = ['Todas', 'Identificação', 'Medicação', 'Higiene das mãos', 'LP', 'LPDM', 'Queda', 'IRCVA'];

// Notif. Enviadas is the last category (special dark row)
const NOTIF_LABEL = 'Notif. Enviadas';

export default function EventosAdversosCard({ ano, mes, indicadores, lancamentos, setorId, moduloId }) {
  const [mesSelecionado, setMesSelecionado] = useState(mes);
  const [densityCat, setDensityCat] = useState('Todas');

  const getLanc = (indicadorId, m) =>
    lancamentos.find(l =>
      l.indicador_id === indicadorId &&
      l.mes === m &&
      (!setorId || l.setor_id === setorId)
    );

  // Sort indicadores by ordem
  const inds = [...indicadores].sort((a, b) => (a.ordem || 0) - (b.ordem || 0));

  // Separate "Notif. Enviadas" from the rest
  const notifInd = inds.find(i => i.label === NOTIF_LABEL || i.nome === 'Notificações Enviadas');
  const mainInds = inds.filter(i => i.id !== notifInd?.id);

  // === SECTION 1: Bar chart — total events per month (sum of all non-notif indicators)
  const barData = MESES_CURTO.map((label, i) => {
    const m = i + 1;
    const total = mainInds.reduce((acc, ind) => {
      const lanc = getLanc(ind.id, m);
      return acc + (lanc?.valor ?? 0);
    }, 0);
    return { mes: label, total };
  });

  // === SECTION 2: Table — one row per indicador, 12 month columns
  const tableRows = mainInds.map((ind, rowIdx) => ({
    nome: ind.label || ind.nome,
    color: ROW_COLORS[rowIdx % ROW_COLORS.length],
    valores: MESES_CURTO.map((_, i) => {
      const lanc = getLanc(ind.id, i + 1);
      return lanc?.valor ?? null;
    }),
  }));

  // Notif. Enviadas row
  const notifRow = notifInd
    ? {
        nome: NOTIF_LABEL,
        color: '#1e3a5f',
        valores: MESES_CURTO.map((_, i) => {
          const lanc = getLanc(notifInd.id, i + 1);
          return lanc?.valor ?? null;
        }),
      }
    : null;

  // === SECTION 3: Density line chart
  const densityIndsMap = {
    'Todas':            mainInds,
    'Identificação':    mainInds.filter(i => i.label === 'Identificação'),
    'Medicação':        mainInds.filter(i => i.label === 'Medicação'),
    'Higiene das mãos': mainInds.filter(i => i.label === 'Higiene das mãos'),
    'LP':               mainInds.filter(i => i.label === 'LP'),
    'LPDM':             mainInds.filter(i => i.label === 'LPDM'),
    'Queda':            mainInds.filter(i => i.label === 'Queda'),
    'IRCVA':            mainInds.filter(i => i.label === 'IRCVA'),
  };

  const densityData = MESES_CURTO.map((label, i) => {
    const m = i + 1;
    const row = { mes: label };
    if (densityCat === 'Todas') {
      mainInds.forEach(ind => {
        const lanc = getLanc(ind.id, m);
        row[ind.label || ind.nome] = lanc?.valor ?? null;
      });
    } else {
      const filtered = densityIndsMap[densityCat] || [];
      filtered.forEach(ind => {
        const lanc = getLanc(ind.id, m);
        row[ind.label || ind.nome] = lanc?.valor ?? null;
      });
    }
    return row;
  });

  const densityLines = densityCat === 'Todas'
    ? mainInds.map((ind, idx) => ({ key: ind.label || ind.nome, color: Object.values(LINE_COLORS)[idx % Object.values(LINE_COLORS).length] }))
    : (densityIndsMap[densityCat] || []).map(ind => ({ key: ind.label || ind.nome, color: LINE_COLORS[densityCat] || '#3b82f6' }));

  return (
    <div className="bg-white rounded-xl border border-border shadow-sm overflow-hidden" data-modulo-id={moduloId}>
      {/* Header */}
      <div className="flex items-center justify-between px-5 pt-4 pb-3 flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-500" />
            <span className="font-jakarta font-bold text-base">Eventos Adversos</span>
          </div>
          <p className="text-xs text-primary font-medium mt-0.5">
            Histórico {ano} · Mês ativo: <span className="font-semibold">{MESES_CURTO[mesSelecionado - 1]}</span>
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

      {/* SECTION 1: Bar chart */}
      <div className="px-5 pb-2">
        <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-2">
          📊 Total de Eventos por Mês
        </p>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={barData} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
            <XAxis dataKey="mes" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
            <Tooltip
              contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e5e7eb' }}
              formatter={(v) => [v, 'Total']}
            />
            <Bar dataKey="total" fill="#ef4444" radius={[3, 3, 0, 0]} maxBarSize={40} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* SECTION 2: Notification types table */}
      <div className="px-5 pb-4">
        <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-3">
          📋 Tipos de Notificação
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse min-w-[780px]">
            <thead>
              <tr>
                <th className="text-left py-1 pr-3 font-semibold text-muted-foreground w-36"></th>
                {MESES_CURTO.map((m, i) => (
                  <th
                    key={m}
                    className="text-center py-1 px-0.5 font-bold text-xs w-14"
                    style={{
                      color: mesSelecionado === i + 1 ? '#06b6d4' : '#6b7280',
                      borderBottom: mesSelecionado === i + 1 ? '3px solid #06b6d4' : '1px solid transparent',
                    }}
                  >
                    {m.toUpperCase()}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tableRows.map((row, ri) => (
                <tr key={ri}>
                  <td className="py-1.5 pr-3 font-medium text-foreground text-xs whitespace-nowrap">{row.nome}</td>
                  {row.valores.map((val, mi) => (
                    <td key={mi} className="py-1 px-0.5 text-center">
                      {val !== null ? (
                        <span
                          className="inline-flex items-center justify-center w-11 h-7 rounded font-bold text-xs text-white"
                          style={{
                            backgroundColor: row.color,
                            outline: mesSelecionado === mi + 1 ? '2px solid #06b6d4' : 'none',
                            outlineOffset: '1px',
                          }}
                        >
                          {val}
                        </span>
                      ) : (
                        <span className="inline-flex items-center justify-center w-11 h-7 text-gray-300 text-xs">—</span>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
              {/* Notif. Enviadas row */}
              {notifRow && (
                <tr>
                  <td className="py-1.5 pr-3 font-bold text-foreground text-xs whitespace-nowrap" style={{ color: '#1e3a5f' }}>
                    {notifRow.nome}
                  </td>
                  {notifRow.valores.map((val, mi) => (
                    <td key={mi} className="py-1 px-0.5 text-center">
                      {val !== null ? (
                        <span
                          className="inline-flex items-center justify-center w-11 h-7 rounded font-bold text-xs text-white"
                          style={{
                            backgroundColor: '#1e3a5f',
                            outline: mesSelecionado === mi + 1 ? '2px solid #06b6d4' : 'none',
                            outlineOffset: '1px',
                          }}
                        >
                          {val}
                        </span>
                      ) : (
                        <span className="inline-flex items-center justify-center w-11 h-7 text-gray-300 text-xs">—</span>
                      )}
                    </td>
                  ))}
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* SECTION 3: Density line chart */}
      <div className="px-5 pb-5">
        <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-2">
          📈 Densidade de Eventos / 1.000 Pac Dia
        </p>
        {/* Category pills */}
        <div className="flex flex-wrap gap-1.5 mb-2">
          {DENSITY_CATS.map(cat => {
            const color = LINE_COLORS[cat] || '#1e3a5f';
            const isActive = densityCat === cat;
            return (
              <button
                key={cat}
                onClick={() => setDensityCat(cat)}
                className="px-3 py-1 rounded-full text-xs font-semibold transition-all border"
                style={{
                  backgroundColor: isActive ? color : 'white',
                  color: isActive ? 'white' : color,
                  borderColor: color,
                }}
              >
                {cat}
              </button>
            );
          })}
        </div>
        {densityCat !== 'Todas' && (
          <p className="text-xs text-amber-500 mb-1">⚡ Selecione 1 categoria para rótulos de valor</p>
        )}
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={densityData} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="mes" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
            <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #e5e7eb' }} />
            {densityLines.map(({ key, color }) => (
              <Line
                key={key}
                type="monotone"
                dataKey={key}
                stroke={color}
                strokeWidth={2}
                dot={false}
                connectNulls={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}