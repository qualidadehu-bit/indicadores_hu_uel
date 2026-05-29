import { useEffect, useRef, useState } from 'react';
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
    <div className="w-full flex flex-col gap-3 border border-gray-100 rounded-xl p-4 bg-gray-50/50 min-w-0">
      {legend.map((l) => (
        <div key={`${l.label}-${l.min}-${l.max}`} className="flex items-center gap-3">
          <div
            className="w-9 h-9 rounded-full flex items-center justify-center text-lg flex-shrink-0"
            style={{ backgroundColor: `${l.cor}22`, border: `2px solid ${l.cor}` }}
          >
            {l.emoji}
          </div>
          <div className="min-w-0">
            <p className="text-xs font-bold leading-tight" style={{ color: l.cor }}>{l.label}</p>
            <p className="text-xs text-muted-foreground">{l.range}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

export function RadarQualidadeAngleTick({ x, y, cx, cy, payload, textAnchor }) {
  if (x == null || y == null) return null;
  const words = (payload?.value || '').split(' ');
  const lineHeight = 14;
  const maxCharsPerLine = 16;
  const lines = [];
  let current = '';
  for (const word of words) {
    if (`${current} ${word}`.trim().length > maxCharsPerLine) {
      if (current) lines.push(current);
      current = word;
    } else {
      current = `${current} ${word}`.trim();
    }
  }
  if (current) lines.push(current);

  const px = typeof payload?.x === 'number' ? payload.x : x;
  const py = typeof payload?.y === 'number' ? payload.y : y;
  const dx = cx == null ? 0 : px - cx;
  const dy = cy == null ? 0 : py - cy;
  const len = Math.hypot(dx, dy) || 1;
  const radialOffset = 16;
  const textX = px + (dx / len) * radialOffset;
  const textY = py + (dy / len) * radialOffset;
  const isUpperHalf = dy < -6;
  const isLowerHalf = dy > 6;
  const startY = isUpperHalf
    ? textY - (lines.length - 1) * lineHeight
    : isLowerHalf
      ? textY
      : textY - ((lines.length - 1) * lineHeight) / 2;
  const resolvedAnchor =
    textAnchor || (dx > 8 ? 'start' : dx < -8 ? 'end' : 'middle');

  return (
    <g>
      {lines.map((line, i) => (
        <text
          key={i}
          x={textX}
          y={startY + i * lineHeight}
          textAnchor={resolvedAnchor}
          fontSize={11}
          fill="#374151"
          fontWeight="500"
          stroke="#ffffff"
          strokeWidth={2}
          paintOrder="stroke"
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

const defaultMargin = { top: 58, right: 132, bottom: 58, left: 132 };
const compactRowMargin = { top: 52, right: 110, bottom: 52, left: 110 };
const stackMargin = { top: 46, right: 84, bottom: 46, left: 84 };
const wideMargin = { top: 62, right: 146, bottom: 62, left: 146 };
const highlightMargin = { top: 66, right: 156, bottom: 66, left: 156 };
const RADAR_STACK_THRESHOLD_PX = 920;
const RADAR_COMPACT_ROW_THRESHOLD_PX = 1240;
const RADAR_WIDE_THRESHOLD_PX = 1520;
const RADAR_HIGHLIGHT_THRESHOLD_PX = 1160;

export function RadarQualidadeChartWithLegend({
  radarData,
  faixas,
  height = 360,
  outerRadius = '65%',
  margin = defaultMargin,
  className = '',
  highlight = false,
}) {
  const faixasEfetivas = faixas?.length ? faixas : withFaixaRanges(DEFAULT_RADAR_FAIXAS);
  const containerRef = useRef(null);
  const [containerWidth, setContainerWidth] = useState(null);

  useEffect(() => {
    const node = containerRef.current;
    if (!node || typeof ResizeObserver === 'undefined') return undefined;

    const observer = new ResizeObserver((entries) => {
      const width = entries?.[0]?.contentRect?.width;
      if (!width) return;
      setContainerWidth(Math.round(width));
    });

    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const isStacked = containerWidth != null ? containerWidth < RADAR_STACK_THRESHOLD_PX : false;
  const isCompactRow =
    containerWidth != null &&
    containerWidth >= RADAR_STACK_THRESHOLD_PX &&
    containerWidth < RADAR_COMPACT_ROW_THRESHOLD_PX;
  const isWideRow = containerWidth != null && containerWidth >= RADAR_WIDE_THRESHOLD_PX;
  const isHighlight = highlight && (containerWidth == null || containerWidth >= RADAR_HIGHLIGHT_THRESHOLD_PX);
  const chartMargin = isStacked
    ? stackMargin
    : isHighlight
      ? highlightMargin
      : isWideRow
        ? wideMargin
        : isCompactRow
          ? compactRowMargin
          : margin;
  const chartOuterRadius = isStacked
    ? '55%'
    : isHighlight
      ? '74%'
      : isWideRow
        ? '68%'
        : isCompactRow
          ? '60%'
          : outerRadius;
  const chartHeight = isStacked
    ? Math.max(height, 372)
    : isHighlight
      ? Math.max(height, 470)
      : isWideRow
        ? Math.max(height, 430)
        : isCompactRow
          ? Math.max(height, 390)
          : Math.max(height, 410);
  const legendWidthClass = isCompactRow
    ? 'w-[176px] min-w-[176px]'
    : isHighlight
      ? 'w-[224px] min-w-[224px]'
      : 'w-[200px] min-w-[200px]';
  const chartHostClass = isStacked
    ? 'min-h-[320px]'
    : isHighlight
      ? 'flex-1 min-w-[420px] min-h-[440px]'
      : isCompactRow
        ? 'flex-1 min-w-[320px] min-h-[350px]'
        : isWideRow
          ? 'flex-1 min-w-[380px] min-h-[400px]'
          : 'flex-1 min-w-[340px] min-h-[360px]';
  const containerClasses = [
    'flex w-full',
    isHighlight ? 'gap-6' : 'gap-4',
    isStacked ? 'flex-col items-stretch' : 'flex-row items-start',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div ref={containerRef} className={containerClasses}>
      <div className={`w-full min-w-0 ${chartHostClass}`}>
        <ResponsiveContainer width="100%" height={chartHeight}>
          <RadarChart
            data={radarData}
            cx="50%"
            cy="50%"
            outerRadius={chartOuterRadius}
            margin={chartMargin}
          >
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
      <div className={isStacked ? 'w-full min-w-0' : `${legendWidthClass} flex-shrink-0`}>
        <RadarQualidadeLegendPanel faixas={faixasEfetivas} />
      </div>
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
