import { PieChart, Pie, Cell, Tooltip, Legend } from 'recharts';
import { effectivePizzaFatias } from '@/lib/pizzaFatias';

export const PIZZA_SLICE_COLORS = ['#2d7d46', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

/**
 * @param {Record<string, unknown>|null|undefined} ind
 * @param {Record<string, unknown>|null|undefined} modulo
 * @param {string|null|undefined} setorId
 * @param {number} mesAtual
 * @param {(indicadorId: string|number, setorId: string|null|undefined, mes: number) => Record<string, unknown>|null|undefined} getLancamento
 * @param {(indicadorId: string|number, setorId: string|null|undefined) => { mes: string, valor: unknown }[]} buildChartData
 */
export function buildChartDataPizzaResolved(ind, modulo, setorId, mesAtual, getLancamento, buildChartData) {
  const custom = effectivePizzaFatias(ind, modulo);
  if (custom?.length) {
    return custom.map((f) => ({
      mes: f.label,
      valor: setorId ? getLancamento(f.indicador_id, setorId, mesAtual)?.valor ?? null : null,
    }));
  }
  return buildChartData(ind.id, setorId);
}

/** Converte valor de planilha/API (número ou string) para número finito ou null. */
function coerceValorNumerico(v) {
  if (v === undefined || v === null) return null;
  if (typeof v === 'string' && v.trim() === '') return null;
  const n = typeof v === 'number' ? v : Number(String(v).trim().replace(',', '.'));
  if (!Number.isFinite(n)) return null;
  return n;
}

/** Fatias = meses ou rótulos custom; só valores >0 entram na proporção (Recharts). */
function rowsToPieSlices(chartData) {
  return chartData.map((row) => {
    const num = coerceValorNumerico(row.valor);
    const isNull = num === null;
    const positive = num != null && num > 0 ? num : 0;
    return {
      name: row.mes,
      value: positive,
      rawValor: num,
      semDado: isNull,
      negativo: num != null && num < 0,
      zero: num === 0,
    };
  });
}

/**
 * @param {{ chartData: { mes: string, valor: unknown }[], ind?: Record<string, unknown>|null, idx?: number, emptyMessagesKey?: 'meses' | 'fatias', width?: number, height?: number }} props
 * `width`/`height` — injetados pelo `ResponsiveContainer` do Recharts; necessários para o `PieChart` desenhar.
 */
export function MonthPieChartBody({
  chartData,
  ind,
  idx = 0,
  emptyMessagesKey = 'meses',
  width,
  height,
}) {
  const slices = rowsToPieSlices(chartData);
  const totalPositive = slices.reduce((s, x) => s + x.value, 0);
  const hasNumeric = slices.some((x) => x.rawValor != null && Number.isFinite(x.rawValor));
  const title = ind ? ind.label || ind.nome : null;
  const isFatias = emptyMessagesKey === 'fatias';
  const titleReserve = title ? 24 : 0;
  const boxW = typeof width === 'number' && width > 0 ? width : 300;
  const boxH = typeof height === 'number' && height > 0 ? height : 200;
  const pieW = boxW;
  const pieH = Math.max(80, boxH - titleReserve);

  const pieTooltip = ({ active, payload }) => {
    if (!active || !payload?.length) return null;
    const p = payload[0].payload;
    let detail = '—';
    if (p.semDado) detail = 'Sem dado';
    else if (p.negativo) detail = `${p.rawValor} (negativo — não entra na proporção do gráfico)`;
    else if (p.zero) detail = '0 (sem fatia proporcional)';
    else detail = String(p.rawValor ?? p.value);
    const pct = totalPositive > 0 && p.value > 0 ? ((p.value / totalPositive) * 100).toFixed(1) : null;
    const pctLine =
      pct != null
        ? isFatias
          ? `${pct}% do total entre as fatias deste mês/setor (>0)`
          : `${pct}% do total anual (>0)`
        : null;
    return (
      <div className="rounded-md border bg-background px-2 py-1.5 text-xs shadow-sm">
        <p className="font-medium">{p.name}</p>
        <p className="text-muted-foreground">{detail}</p>
        {pctLine ? <p className="text-muted-foreground">{pctLine}</p> : null}
      </div>
    );
  };

  if (!hasNumeric) {
    return (
      <div
        className="flex h-full min-h-[100px] w-full flex-col items-center justify-center gap-1 px-2 text-center"
        style={{ width: boxW, minHeight: boxH }}
      >
        {title ? <p className="text-xs font-medium text-foreground">{title}</p> : null}
        <p className="text-xs text-muted-foreground">
          {isFatias
            ? 'Nenhum lançamento nas fatias para este mês/setor (valores em branco ou não numéricos).'
            : 'Sem dados numéricos (meses nulos ou em branco).'}
        </p>
      </div>
    );
  }
  if (totalPositive <= 0) {
    return (
      <div
        className="flex h-full min-h-[100px] w-full flex-col items-center justify-center gap-1 px-2 text-center"
        style={{ width: boxW, minHeight: boxH }}
      >
        {title ? <p className="text-xs font-medium text-foreground">{title}</p> : null}
        <p className="text-xs text-muted-foreground">
          {isFatias
            ? 'Nenhum valor positivo nas fatias para este mês/setor. Zeros, negativos ou ausências não formam fatias proporcionais.'
            : 'Não há valores maiores que zero para proporcionar o pizza. Zeros, negativos ou só nulos não formam fatias proporcionais.'}
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full w-full flex-col" style={{ width: boxW, minHeight: boxH }}>
      {title ? <p className="text-xs font-medium text-center truncate shrink-0">{title}</p> : null}
      <PieChart width={pieW} height={pieH} margin={{ top: 4, right: 8, bottom: 4, left: 8 }}>
        <Pie
          data={slices}
          dataKey="value"
          nameKey="name"
          cx="50%"
          cy="50%"
          innerRadius="12%"
          outerRadius="68%"
          paddingAngle={1}
          labelLine={false}
        >
          {slices.map((entry, i) => (
            <Cell key={`${entry.name}-${i}`} fill={PIZZA_SLICE_COLORS[(idx + i) % PIZZA_SLICE_COLORS.length]} stroke="#fff" strokeWidth={1} />
          ))}
        </Pie>
        <Tooltip content={pieTooltip} />
        <Legend wrapperStyle={{ fontSize: 10 }} formatter={(_, __, i) => slices[i]?.name} />
      </PieChart>
    </div>
  );
}
