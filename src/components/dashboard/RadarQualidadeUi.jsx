import {
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
} from 'recharts';
import { MESES } from '@/lib/indicadores';
import {
  DEFAULT_RADAR_FAIXAS,
  effectiveRadarFaixas,
  getRadarQualidadeScoreColor as getScoreColorFromFaixas,
  withFaixaRanges,
} from '@/lib/radarFaixas';

export { effectiveRadarFaixas, DEFAULT_RADAR_FAIXAS };

/**
 * @param {number|null|undefined} valor
 * @param {import('@/lib/radarFaixas').RadarFaixa[]} [faixas]
 */
export function getRadarQualidadeScoreColor(valor, faixas) {
  return getScoreColorFromFaixas(valor, faixas);
}

/**
 * @param {object} props
 * @param {import('@/lib/radarFaixas').RadarFaixa[]} [props.faixas]
 */
export function RadarQualidadeLegendPanel({ faixas }) {
  const legend = faixas?.length ? withFaixaRanges(faixas) : withFaixaRanges(DEFAULT_RADAR_FAIXAS);
  return (
    <div className="lg:w-44 w-full flex flex-col gap-3 border border-gray-100 rounded-xl p-4 bg-gray-50/50 flex-shrink-0">
      {legend.map((l) => (
        <div key={`${l.label}-${l.min}-${l.max}`} className="flex items-center gap-3">
          <div
            className="w-9 h-9 rounded-full flex items-center justify-center text-lg flex-shrink-0"
            style={{ backgroundColor: `${l.cor}22`, border: `2px solid ${l.cor}` }}
          >
            {l.emoji}
          </div>
          <div>
            <p className="text-xs font-bold leading-tight" style={{ color: l.cor }}>{l.label}</p>
            <p className="text-xs text-muted-foreground">{l.range}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

export function RadarQualidadeAngleTick({ x, y, payload, textAnchor }) {
  const words = (payload?.value || '').split(' ');
  const lineHeight = 14;
  const lines = [];
  let current = '';
  for (const word of words) {
    if (`${current} ${word}`.trim().length > 18) {
      if (current) lines.push(current);
      current = word;
    } else {
      current = `${current} ${word}`.trim();
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
}

export function RadarQualidadeDot(props) {
  const { cx, cy, payload, faixas } = props;
  if (cx === undefined || cy === undefined) return null;
  const val = payload?.value;
  if (val === null || val === undefined || val === 0) return null;
  const { hex } = getRadarQualidadeScoreColor(val, faixas);
  return (
    <g>
      <circle cx={cx} cy={cy} r={16} fill={hex} />
      <text x={cx} y={cy + 4} textAnchor="middle" fontSize={10} fill="white" fontWeight="bold">
        {val}
      </text>
    </g>
  );
}

/** Todos os indicadores com unidade vazia ou contendo % → escala 0–100 e legenda configurável. */
export function isRadarPercentQualidadeScale(members) {
  if (!members?.length) return false;
  return members.every((ind) => {
    const u = String(ind.unidade || '').trim().toLowerCase();
    return !u || u.includes('%');
  });
}

const defaultMargin = { top: 30, right: 60, bottom: 30, left: 60 };

export function RadarQualidadeChartWithLegend({
  radarData,
  faixas,
  height = 360,
  outerRadius = '65%',
  margin = defaultMargin,
  className = 'flex flex-col lg:flex-row items-center gap-4',
}) {
  const faixasEfetivas = faixas?.length ? faixas : withFaixaRanges(DEFAULT_RADAR_FAIXAS);

  return (
    <div className={className}>
      <div className="flex-1 w-full min-h-[200px]">
        <ResponsiveContainer width="100%" height={height}>
          <RadarChart data={radarData} cx="50%" cy="50%" outerRadius={outerRadius} margin={margin}>
            <PolarGrid stroke="#e5e7eb" />
            <PolarAngleAxis dataKey="subject" tick={RadarQualidadeAngleTick} />
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
              dot={<RadarQualidadeDot faixas={faixasEfetivas} />}
              isAnimationActive
            />
          </RadarChart>
        </ResponsiveContainer>
      </div>
      <RadarQualidadeLegendPanel faixas={faixasEfetivas} />
    </div>
  );
}

/** `tableData`: `{ nome, valores }` com `valores` length 12 (jan–dez). `mesAtivo`: 1–12. */
export function RadarQualidadeHistoricoTable({ tableData, mesAtivo, title = '📋 Histórico Anual', faixas }) {
  const faixasEfetivas = faixas?.length ? faixas : withFaixaRanges(DEFAULT_RADAR_FAIXAS);

  return (
    <div className="space-y-3">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{title}</p>
      <div className="overflow-x-auto">
        <table className="w-full text-xs border-collapse min-w-[700px]">
          <thead>
            <tr>
              <th className="text-left py-2 pr-4 font-semibold text-muted-foreground w-52">Indicador</th>
              {MESES.map((m, i) => (
                <th
                  key={m}
                  className={`text-center py-2 px-0.5 font-semibold w-12 ${
                    mesAtivo === i + 1
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
                  const cfg = getRadarQualidadeScoreColor(val, faixasEfetivas);
                  const isActive = mesAtivo === mi + 1;
                  return (
                    <td key={mi} className="py-1 px-0.5 text-center">
                      {val !== null && val !== undefined ? (
                        <span
                          className={`inline-flex items-center justify-center w-10 h-7 rounded font-bold text-xs text-white ${isActive ? 'ring-2 ring-offset-1 ring-cyan-400' : ''}`}
                          style={{ backgroundColor: cfg.hex }}
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
  );
}
