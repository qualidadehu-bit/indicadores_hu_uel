import { useState } from 'react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceDot
} from 'recharts';
import { Layers } from 'lucide-react';

const MESES_CURTO = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

// Color coding for cells based on value thresholds (incidência % — lower is better)
function getCellColor(val, tipo) {
  if (val === null || val === undefined) return { bg: '#e5e7eb', text: '#9ca3af' };
  // For incidência %
  if (tipo === 'incidencia') {
    if (val <= 5)  return { bg: '#22c55e', text: '#fff' };   // verde
    if (val <= 10) return { bg: '#f59e0b', text: '#fff' };   // amarelo
    if (val <= 20) return { bg: '#ef4444', text: '#fff' };   // vermelho
    return             { bg: '#7c3aed', text: '#fff' };      // roxo escuro
  }
  // For expostos / novos casos — use fixed palette cycling
  return { bg: '#ef4444', text: '#fff' };
}

// Alternating colors for expostos/novos
const EXPOSTOS_COLORS = ['#ef4444','#f59e0b','#ef4444','#22c55e','#ef4444','#f59e0b','#ef4444','#f59e0b','#ef4444','#f59e0b','#ef4444','#ef4444'];
const NOVOS_COLORS =    ['#ef4444','#f59e0b','#ef4444','#f59e0b','#22c55e','#22c55e','#ef4444','#22c55e','#ef4444','#22c55e','#ec4899','#f59e0b'];
const INCID_COLORS = (val) => {
  if (val === null || val === undefined) return { bg: '#e5e7eb', text: '#9ca3af' };
  if (val <= 5)  return { bg: '#22c55e', text: '#fff' };
  if (val <= 10) return { bg: '#f59e0b', text: '#fff' };
  if (val <= 20) return { bg: '#ef4444', text: '#fff' };
  return             { bg: '#7c3aed', text: '#fff' };
};

export default function LesaoPressaoCard({ ano, mes, indicadores, lancamentos, setorId, moduloId }) {
  const [mesSelecionado, setMesSelecionado] = useState(mes);

  const getLanc = (indicadorId, m) =>
    lancamentos.find(l =>
      l.indicador_id === indicadorId &&
      l.mes === m &&
      (!setorId || l.setor_id === setorId)
    );

  // Identify each indicator by label
  const indExpostos   = indicadores.find(i => i.label === 'Expostos');
  const indNovos      = indicadores.find(i => i.label === 'Novos Casos');
  const indPacDia     = indicadores.find(i => i.label === 'Paciente Dia');
  const indDensidade  = indicadores.find(i => i.label === 'Densidade LP');
  const indIncidencia = indicadores.find(i => i.label === 'LP Estad. 2+' || i.ordem === 1);

  // Current month values
  const expostoAtual  = indExpostos  ? getLanc(indExpostos.id,  mesSelecionado)?.valor : null;
  const novosAtual    = indNovos     ? getLanc(indNovos.id,     mesSelecionado)?.valor : null;
  const pacDiaAtual   = indPacDia    ? getLanc(indPacDia.id,    mesSelecionado)?.valor : null;
  const densAtual     = indDensidade ? getLanc(indDensidade.id, mesSelecionado)?.valor : null;

  // Incidência = novos / expostos * 100
  const calcIncid = (novos, expostos) => {
    if (!expostos || expostos === 0 || novos === null) return null;
    return parseFloat(((novos / expostos) * 100).toFixed(1));
  };

  const incidAtual = calcIncid(novosAtual, expostoAtual);

  // Annual table rows
  const expostosMes  = MESES_CURTO.map((_, i) => indExpostos  ? getLanc(indExpostos.id,  i+1)?.valor ?? null : null);
  const novosMes     = MESES_CURTO.map((_, i) => indNovos     ? getLanc(indNovos.id,     i+1)?.valor ?? null : null);
  const densidadeMes = MESES_CURTO.map((_, i) => indDensidade ? getLanc(indDensidade.id, i+1)?.valor ?? null : null);
  const incidMes     = MESES_CURTO.map((_, i) => calcIncid(novosMes[i], expostosMes[i]));

  // Area chart data
  const chartData = MESES_CURTO.map((label, i) => ({
    mes: label,
    densidade: densidadeMes[i],
  }));

  const KpiBox = ({ label, value, unit, color = '#374151', borderColor = '#e5e7eb' }) => (
    <div className="flex-1 min-w-[110px] border rounded-lg px-4 py-3" style={{ borderColor }}>
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{label}</p>
      <div className="flex items-baseline gap-1 mt-1">
        <span className="text-2xl font-jakarta font-bold" style={{ color }}>
          {value !== null && value !== undefined ? value : '—'}
        </span>
        {unit && <span className="text-xs text-muted-foreground">{unit}</span>}
      </div>
    </div>
  );

  const TableCell = ({ val, bg, text, isActive, mi }) => (
    <td className="py-1 px-0.5 text-center">
      {val !== null && val !== undefined ? (
        <span
          className="inline-flex items-center justify-center w-12 h-7 rounded font-bold text-xs"
          style={{
            backgroundColor: bg,
            color: text,
            outline: isActive ? '2px solid #06b6d4' : 'none',
            outlineOffset: '1px',
          }}
        >
          {val}
        </span>
      ) : (
        <span className="inline-flex items-center justify-center w-12 h-7 text-gray-300 text-xs">—</span>
      )}
    </td>
  );

  return (
    <div className="bg-white rounded-xl border border-border shadow-sm overflow-hidden" data-modulo-id={moduloId}>
      {/* Header */}
      <div className="flex items-center justify-between px-5 pt-4 pb-3 flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-blue-500" />
            <span className="font-jakarta font-bold text-base">Lesão por Pressão (LP)</span>
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

      {/* KPI Row */}
      <div className="flex flex-wrap gap-3 px-5 pb-4">
        <KpiBox label="Expostos"     value={expostoAtual}    unit="pac"    borderColor="#e5e7eb" />
        <KpiBox label="Novos Casos"  value={novosAtual}      unit="casos"  borderColor="#06b6d4" color="#06b6d4" />
        <KpiBox label="Paciente Dia" value={pacDiaAtual}     unit=""       borderColor="#06b6d4" color="#374151" />
        <KpiBox label="Densidade LP" value={densAtual}       unit="/1k"    borderColor="#ef4444" color="#ef4444" />
        <KpiBox label="Incidência LP" value={incidAtual !== null ? `${incidAtual}%` : null} unit="" borderColor="#ef4444" color="#ef4444" />
      </div>

      {/* Annual Table */}
      <div className="px-5 pb-4">
        <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-3 flex items-center gap-1">
          <span className="text-primary">≡</span> Histórico Anual
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse min-w-[780px]">
            <thead>
              <tr>
                <th className="text-left py-1 pr-3 w-36 text-muted-foreground font-semibold"></th>
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
              {/* Expostos */}
              <tr>
                <td className="py-1.5 pr-3 font-medium text-foreground text-xs">Expostos</td>
                {expostosMes.map((val, mi) => (
                  <TableCell key={mi} val={val} bg={EXPOSTOS_COLORS[mi]} text="#fff" isActive={mesSelecionado === mi+1} />
                ))}
              </tr>
              {/* Novos Casos */}
              <tr>
                <td className="py-1.5 pr-3 font-medium text-foreground text-xs">Novos Casos</td>
                {novosMes.map((val, mi) => (
                  <TableCell key={mi} val={val} bg={NOVOS_COLORS[mi]} text="#fff" isActive={mesSelecionado === mi+1} />
                ))}
              </tr>
              {/* Incidência */}
              <tr>
                <td className="py-1.5 pr-3 font-medium text-foreground text-xs">Incidência (%)</td>
                {incidMes.map((val, mi) => {
                  const cfg = INCID_COLORS(val);
                  return (
                    <TableCell key={mi} val={val !== null ? `${val}%` : null} bg={cfg.bg} text={cfg.text} isActive={mesSelecionado === mi+1} />
                  );
                })}
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Density Area Chart */}
      <div className="px-5 pb-5">
        <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-3 flex items-center gap-1">
          <span className="text-primary">~</span> Densidade LP / 1.000 Paciente-Dia
        </p>
        <ResponsiveContainer width="100%" height={200}>
          <AreaChart data={chartData} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
            <defs>
              <linearGradient id="lpGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor="#ec4899" stopOpacity={0.15} />
                <stop offset="95%" stopColor="#ec4899" stopOpacity={0.01} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
            <XAxis dataKey="mes" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
            <Tooltip
              contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e5e7eb' }}
              formatter={(v) => [v, 'Densidade LP']}
            />
            <Area
              type="monotone"
              dataKey="densidade"
              name="Densidade LP"
              stroke="#ec4899"
              strokeWidth={2}
              fill="url(#lpGrad)"
              dot={{ r: 4, fill: '#ec4899', strokeWidth: 0 }}
              connectNulls={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}