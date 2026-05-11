import { useState } from 'react';
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer
} from 'recharts';
import { Shield } from 'lucide-react';

const MESES_CURTO = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

function getScoreColor(valor) {
  if (valor === null || valor === undefined) return { bg: 'bg-gray-200', text: 'text-gray-500', hex: '#d1d5db' };
  if (valor >= 100) return { bg: 'bg-blue-500',   text: 'text-white', hex: '#3b82f6' };
  if (valor >= 90)  return { bg: 'bg-green-500',  text: 'text-white', hex: '#22c55e' };
  if (valor >= 80)  return { bg: 'bg-yellow-400', text: 'text-white', hex: '#facc15' };
  if (valor >= 70)  return { bg: 'bg-orange-500', text: 'text-white', hex: '#f97316' };
  return               { bg: 'bg-red-600',     text: 'text-white', hex: '#dc2626' };
}

const LEGEND = [
  { label: 'SEGURO',       range: '100%',   emoji: '😊', hex: '#3b82f6' },
  { label: 'ADEQUADO',     range: '90-99%', emoji: '🙂', hex: '#22c55e' },
  { label: 'DESEJÁVEL',    range: '80-89%', emoji: '😐', hex: '#ca8a04' },
  { label: 'LIMÍTROFE',    range: '70-79%', emoji: '😟', hex: '#f97316' },
  { label: 'INSUFICIENTE', range: '≤69%',   emoji: '😢', hex: '#dc2626' },
];

// Custom dot with value label inside colored circle
const CustomDot = (props) => {
  const { cx, cy, payload } = props;
  if (cx === undefined || cy === undefined) return null;
  const val = payload?.value;
  if (val === null || val === undefined || val === 0) return null;
  const { hex } = getScoreColor(val);
  return (
    <g>
      <circle cx={cx} cy={cy} r={16} fill={hex} />
      <text x={cx} y={cy + 4} textAnchor="middle" fontSize={10} fill="white" fontWeight="bold">
        {val}
      </text>
    </g>
  );
};

// Custom PolarAngleAxis tick — wraps long labels
const CustomAngleTick = ({ x, y, payload, textAnchor }) => {
  const words = (payload?.value || '').split(' ');
  const lineHeight = 14;
  const lines = [];
  let current = '';
  for (const word of words) {
    if ((current + ' ' + word).trim().length > 18) {
      if (current) lines.push(current);
      current = word;
    } else {
      current = (current + ' ' + word).trim();
    }
  }
  if (current) lines.push(current);

  const startY = y - ((lines.length - 1) * lineHeight) / 2;

  return (
    <g>
      {lines.map((line, i) => (
        <text
          key={i}
          x={x}
          y={startY + i * lineHeight}
          textAnchor={textAnchor || 'middle'}
          fontSize={11}
          fill="#374151"
          fontWeight="500"
        >
          {line}
        </text>
      ))}
    </g>
  );
};

export default function MispCard({ ano, mes, indicadores, lancamentos, setorId, moduloId }) {
  const [mesSelecionado, setMesSelecionado] = useState(mes);

  const getLanc = (indicadorId, m) =>
    lancamentos.find(l =>
      l.indicador_id === indicadorId &&
      l.mes === m &&
      (!setorId || l.setor_id === setorId)
    );

  // Sort by ordem
  const inds = [...indicadores].sort((a, b) => (a.ordem || 0) - (b.ordem || 0));

  // Radar data
  const radarData = inds.map(ind => {
    const lanc = getLanc(ind.id, mesSelecionado);
    return {
      subject: ind.label || ind.nome,
      value: lanc?.valor ?? null,
      fullMark: 100,
    };
  });

  // Annual table
  const tableData = inds.map(ind => ({
    nome: ind.label || ind.nome,
    valores: MESES_CURTO.map((_, i) => {
      const lanc = getLanc(ind.id, i + 1);
      return lanc?.valor ?? null;
    }),
  }));

  return (
    <div className="bg-white rounded-xl border border-border shadow-sm overflow-hidden" data-modulo-id={moduloId}>
      {/* Header */}
      <div className="flex items-center justify-between px-5 pt-4 pb-2 flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-orange-500" />
            <span className="font-jakarta font-bold text-base">Indicadores de Qualidade — MISP</span>
          </div>
          <p className="text-xs text-primary font-medium mt-0.5">
            Histórico {ano} · Mês ativo: <span className="capitalize">{MESES_CURTO[mesSelecionado - 1]}</span>
          </p>
        </div>
        <div className="flex flex-wrap gap-1">
          {MESES_CURTO.map((m, i) => (
            <button
              key={m}
              onClick={() => setMesSelecionado(i + 1)}
              className={`px-2 py-0.5 rounded text-xs font-medium transition-all ${
                mesSelecionado === i + 1
                  ? 'bg-primary text-white'
                  : 'text-muted-foreground hover:bg-secondary'
              }`}
            >
              {m}
            </button>
          ))}
        </div>
      </div>

      {/* Radar label */}
      <div className="px-5 pb-1">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          📡 Radar · {MESES_CURTO[mesSelecionado - 1].toUpperCase()}/{ano}
        </p>
      </div>

      {/* Radar + Legend row */}
      <div className="flex flex-col lg:flex-row items-center gap-4 px-5 pb-4">
        {/* Radar chart */}
        <div className="flex-1 w-full">
          <ResponsiveContainer width="100%" height={360}>
            <RadarChart data={radarData} cx="50%" cy="50%" outerRadius="65%" margin={{ top: 30, right: 60, bottom: 30, left: 60 }}>
              <PolarGrid stroke="#e5e7eb" />
              <PolarAngleAxis dataKey="subject" tick={<CustomAngleTick />} />
              <PolarRadiusAxis
                angle={90}
                domain={[0, 100]}
                tickCount={6}
                tick={{ fontSize: 9, fill: '#9ca3af' }}
                axisLine={false}
              />
              <Radar
                dataKey="value"
                stroke="#f97316"
                fill="#f97316"
                fillOpacity={0.15}
                strokeWidth={2}
                dot={<CustomDot />}
                isAnimationActive={true}
              />
            </RadarChart>
          </ResponsiveContainer>
        </div>

        {/* Legend */}
        <div className="lg:w-44 w-full flex flex-col gap-3 border border-gray-100 rounded-xl p-4 bg-gray-50/50">
          {LEGEND.map(l => (
            <div key={l.label} className="flex items-center gap-3">
              <div
                className="w-9 h-9 rounded-full flex items-center justify-center text-lg flex-shrink-0"
                style={{ backgroundColor: l.hex + '22', border: `2px solid ${l.hex}` }}
              >
                {l.emoji}
              </div>
              <div>
                <p className="text-xs font-bold leading-tight" style={{ color: l.hex }}>{l.label}</p>
                <p className="text-xs text-muted-foreground">{l.range}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Annual Table */}
      <div className="px-5 pb-5">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
          📋 Histórico Anual
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse min-w-[700px]">
            <thead>
              <tr>
                <th className="text-left py-2 pr-4 font-semibold text-muted-foreground w-52">Indicador</th>
                {MESES_CURTO.map((m, i) => (
                  <th
                    key={m}
                    className={`text-center py-2 px-0.5 font-semibold w-12 ${
                      mesSelecionado === i + 1
                        ? 'text-primary border-b-2 border-primary'
                        : 'text-muted-foreground'
                    }`}
                  >
                    {m.toUpperCase()}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tableData.map((row, ri) => (
                <tr key={ri} className="border-t border-gray-100">
                  <td className="py-2 pr-4 font-medium text-foreground text-xs">{row.nome}</td>
                  {row.valores.map((val, mi) => {
                    const cfg = getScoreColor(val);
                    const isActive = mesSelecionado === mi + 1;
                    return (
                      <td key={mi} className="py-1 px-0.5 text-center">
                        {val !== null ? (
                          <span
                            className={`inline-flex items-center justify-center w-10 h-7 rounded font-bold text-xs ${cfg.bg} ${cfg.text} ${isActive ? 'ring-2 ring-offset-1 ring-cyan-400' : ''}`}
                          >
                            {val}
                          </span>
                        ) : (
                          <span className="inline-flex items-center justify-center w-10 h-7 text-gray-300 text-xs">—</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}