import { useEffect, useRef, useState } from 'react';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Legend,
} from 'recharts';
import { Card, CardContent } from '@/components/ui/card';
import BadgeStatusMeta from '@/components/BadgeStatusMeta';
import { DIRECAO_META, MESES, STATUS_META, calcularStatusMeta } from '@/lib/indicadores';
import {
  isRadarPercentQualidadeScale,
  RadarQualidadeChartWithLegend,
  RadarQualidadeHistoricoTable,
} from '@/components/dashboard/RadarQualidadeUi';
import { effectiveRadarFaixas } from '@/lib/radarFaixas';
import { normalizeTipoGrafico, tipoGraficoEfetivoIndicador } from '@/lib/graficoTipo';
import { effectivePizzaFatias } from '@/lib/pizzaFatias';
import { buildChartDataPizzaResolved, MonthPieChartBody, PIZZA_SLICE_COLORS } from '@/components/dashboard/ModuloPizzaMonthShared';
import { getIndicadorGrupoVisual, getIndicadorNomeSerie } from '@/lib/dashboardVisualGrouping';
import { parseLocaleNumber } from '@/lib/numberParsing';

const COLORS = PIZZA_SLICE_COLORS;

const CHART_MIN_WIDTH = 320;
const SINGLE_POINT_DOT_RADIUS = 7;
const SINGLE_POINT_ACTIVE_DOT_RADIUS = 9;
const FALLBACK_NEUTRAL_BLUE = '#3b82f6';

function normalizeHexColor(raw) {
  const s = String(raw ?? '').trim();
  if (!s) return null;
  if (/^#([0-9a-f]{3})$/i.test(s)) {
    const [, short] = s.match(/^#([0-9a-f]{3})$/i) || [];
    if (!short) return null;
    return `#${short[0]}${short[0]}${short[1]}${short[1]}${short[2]}${short[2]}`.toLowerCase();
  }
  if (/^#([0-9a-f]{6})$/i.test(s)) return s.toLowerCase();
  return null;
}

function tintHex(hex, ratio = 0.42) {
  const safe = normalizeHexColor(hex);
  if (!safe) return FALLBACK_NEUTRAL_BLUE;
  const r = Number.parseInt(safe.slice(1, 3), 16);
  const g = Number.parseInt(safe.slice(3, 5), 16);
  const b = Number.parseInt(safe.slice(5, 7), 16);
  const mix = (channel) => Math.round(channel + (255 - channel) * ratio);
  const toHex = (n) => n.toString(16).padStart(2, '0');
  return `#${toHex(mix(r))}${toHex(mix(g))}${toHex(mix(b))}`;
}

function statusToColor(status) {
  switch (status) {
    case 'OK':
      return {
        badgeToneClass: 'bg-green-500 ring-green-300',
        lineHex: '#22c55e',
      };
    case 'ATENCAO':
      return {
        badgeToneClass: 'bg-amber-500 ring-amber-300',
        lineHex: '#f59e0b',
      };
    case 'CRITICO':
      return {
        badgeToneClass: 'bg-red-500 ring-red-300',
        lineHex: '#ef4444',
      };
    default:
      return {
        badgeToneClass: 'bg-blue-500 ring-blue-300',
        lineHex: FALLBACK_NEUTRAL_BLUE,
      };
  }
}

function colorFromHex(hex) {
  return {
    badgeToneClass: '',
    textClass: 'text-white',
    lineHex: hex,
    badgeStyle: {
      backgroundColor: hex,
      '--tw-ring-color': tintHex(hex),
    },
  };
}

function resolveMetaColor({ ind, metaRec, status }) {
  const direcaoMeta = String(ind?.tipo_direcao_meta || '').trim().toUpperCase();
  const indicadorHex =
    normalizeHexColor(ind?.cor) ||
    normalizeHexColor(ind?.color);
  const metaOverrideHex =
    normalizeHexColor(metaRec?.cor) ||
    normalizeHexColor(metaRec?.color) ||
    normalizeHexColor(metaRec?.meta_cor) ||
    normalizeHexColor(metaRec?.cor_meta);

  // Regra principal:
  // - NAO_SE_APLICA => cor manual do indicador
  // - Com meta aplicável => status da meta (com possível override explícito na meta)
  if (direcaoMeta === DIRECAO_META.NAO_SE_APLICA) {
    if (indicadorHex) return colorFromHex(indicadorHex);
    return {
      ...statusToColor(STATUS_META.NA),
      textClass: 'text-white',
      badgeStyle: undefined,
    };
  }

  if (metaOverrideHex) return colorFromHex(metaOverrideHex);

  const byStatus = statusToColor(status);
  return {
    ...byStatus,
    textClass: 'text-white',
    badgeStyle: undefined,
  };
}

/** @param {unknown} ordem */
function ordemSortKey(ordem) {
  const n = typeof ordem === 'number' && !Number.isNaN(ordem) ? ordem : Number(ordem);
  return Number.isFinite(n) ? n : 0;
}

/**
 * @param {Array<Record<string, unknown>>} data
 * @param {string} dataKey
 */
function findSinglePointInfo(data, dataKey) {
  let count = 0;
  let mes = null;
  for (const row of data || []) {
    const n = parseLocaleNumber(row?.[dataKey]);
    if (n == null) continue;
    count += 1;
    if (mes == null) mes = String(row?.mes || '');
    if (count > 1) break;
  }
  return { count, mes };
}

/**
 * Evita colapso do Y quando só existe um valor (min === max).
 * @param {Array<Record<string, unknown>>} rows
 * @param {string[]} keys
 * @returns {[number, number]|undefined}
 */
function buildStableYAxisDomain(rows, keys) {
  const values = [];
  for (const row of rows || []) {
    for (const key of keys || []) {
      const n = parseLocaleNumber(row?.[key]);
      if (n != null) values.push(n);
    }
  }
  if (!values.length) return undefined;
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (min === max) {
    const base = Math.max(Math.abs(min), 1);
    const pad = Math.max(base * 0.1, 1);
    return [min - pad, max + pad];
  }
  const span = max - min;
  const pad = Math.max(span * 0.1, 0.5);
  return [min - pad, max + pad];
}

function isDashboardDebugEnabled() {
  if (typeof window === 'undefined') return false;
  const byQuery = new URLSearchParams(window.location.search).get('debugDashboard') === '1';
  const byStorage = window.localStorage.getItem('dashboardDebug') === '1';
  return byQuery || byStorage;
}

function useMeasuredWidth(minWidth = CHART_MIN_WIDTH, debugTag = '', debugEnabled = false) {
  const hostRef = useRef(null);
  const [width, setWidth] = useState(minWidth);

  useEffect(() => {
    const el = hostRef.current;
    if (!el) return;
    let rafId = 0;
    const measure = () => {
      const rect = el.getBoundingClientRect();
      const next = Math.max(minWidth, Math.floor(rect.width || 0));
      setWidth((prev) => (prev === next ? prev : next));
      if (debugEnabled) {
        console.debug('[dashboard:chart-host-size]', {
          tag: debugTag,
          width: next,
          rectW: rect.width,
          rectH: rect.height,
        });
      }
    };
    const onResize = () => {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(measure);
    };
    measure();
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(onResize) : null;
    observer?.observe(el);
    window.addEventListener('resize', onResize);
    return () => {
      cancelAnimationFrame(rafId);
      observer?.disconnect();
      window.removeEventListener('resize', onResize);
    };
  }, [minWidth, debugTag, debugEnabled]);

  return { hostRef, width };
}

function StableChartContainer({
  height = 220,
  minWidth = CHART_MIN_WIDTH,
  debugTag = '',
  debugEnabled = false,
  allowHorizontalScroll = false,
  children,
}) {
  const { hostRef, width } = useMeasuredWidth(minWidth, debugTag, debugEnabled);
  return (
    <div ref={hostRef} className={`w-full ${allowHorizontalScroll ? 'overflow-x-auto' : 'overflow-x-hidden'}`}>
      {children(width, height)}
    </div>
  );
}

function useCardGraficoLayout(modulo) {
  return modulo?.layout_modulo === 'card_grafico';
}

function MonthlyIndicatorTrackingTable({ members, setorId, mesAtual, getLancamento, getMeta, getMetaColor }) {
  return (
    <div className="overflow-x-auto rounded-lg border bg-card/30">
      <table className="w-full min-w-[860px] text-xs border-collapse" aria-label="Tabela de acompanhamento mensal dos indicadores">
        <thead>
          <tr className="border-b border-border/80">
            <th className="w-72 text-left px-3 py-2 font-semibold text-muted-foreground">Indicador</th>
            {MESES.map((mes, idx) => {
              const isAtivo = mesAtual === idx + 1;
              return (
                <th
                  key={mes}
                  className={`w-12 text-center px-1 py-2 font-semibold ${
                    isAtivo
                      ? 'text-foreground border-t-2 border-emerald-600'
                      : 'text-muted-foreground'
                  }`}
                >
                  {String(mes).toUpperCase()}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {members.map((ind) => {
            const metaRec = getMeta(ind.id, setorId);
            const lancAtual = getLancamento(ind.id, setorId, mesAtual);
            const status = calcularStatusMeta(lancAtual?.valor, metaRec?.valor, ind.tipo_direcao_meta);
            const colorCfg = getMetaColor({ ind, metaRec, status });
            const hasActiveValue = parseLocaleNumber(lancAtual?.valor) != null;
            return (
              <tr key={ind.id} className="border-t border-border/60">
                <td className="px-3 py-2 text-left font-medium text-foreground">
                  <span className="inline-flex items-center gap-2">
                    <span className="inline-block w-2 h-2 rounded-full" style={{ backgroundColor: colorCfg.lineHex }} />
                    <span>{ind.label || ind.nome || '—'}</span>
                  </span>
                </td>
                {MESES.map((_, idx) => {
                  const isAtivo = mesAtual === idx + 1;
                  if (!isAtivo || !hasActiveValue) {
                    return (
                      <td key={`${ind.id}-${idx}`} className="px-1 py-2 text-center">
                        <span className="text-gray-300">—</span>
                      </td>
                    );
                  }
                  return (
                    <td key={`${ind.id}-${idx}`} className="px-1 py-2 text-center">
                      <span
                        className={`inline-flex min-w-[3rem] items-center justify-center rounded-md px-2 py-1 text-xs font-bold tabular-nums ring-2 ring-offset-1 ${colorCfg.textClass} ${colorCfg.badgeToneClass}`}
                        style={colorCfg.badgeStyle}
                      >
                        {lancAtual?.valor}
                      </span>
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function partitionRadarGroups(inds) {
  const list = [...inds].sort((a, b) => ordemSortKey(a.ordem) - ordemSortKey(b.ordem));
  const byGroup = new Map();
  const emptyKey = [];
  for (const ind of list) {
    const g = String(ind.grupo_radar || '').trim();
    if (!g) {
      emptyKey.push(ind);
      continue;
    }
    if (!byGroup.has(g)) byGroup.set(g, []);
    byGroup.get(g).push(ind);
  }
  const combinedGroups = [];
  const solo = [...emptyKey];
  for (const [key, members] of byGroup) {
    if (members.length >= 2) combinedGroups.push({ key, members });
    else solo.push(...members);
  }
  combinedGroups.sort((a, b) => ordemSortKey(a.members[0]?.ordem) - ordemSortKey(b.members[0]?.ordem));
  solo.sort((a, b) => ordemSortKey(a.ordem) - ordemSortKey(b.ordem));
  return { combinedGroups, soloIndicators: solo };
}

/**
 * Mesmo módulo, mesmo grupo_visual (trim, não vazio), 2+ membros com o mesmo tipo efetivo → bloco agrupado.
 * Fallback temporário: grupo_serie quando grupo_visual não existir.
 * Tipos efetivos diferentes no mesmo nome de grupo viram subgrupos separados (sem MultiSeriesChart misto).
 * Linha/barra/área: um gráfico multi-série.
 * Pizza: quando agrupado, um único pizza com uma fatia por indicador (mês ativo).
 * Sem grupo_visual/grupo_serie (solo), mantém comportamento legado por indicador.
 * @param {Record<string, unknown>[]} inds
 * @param {Record<string, unknown>|null|undefined} modulo
 */
function partitionSerieGroups(inds, modulo) {
  const list = [...inds].sort((a, b) => ordemSortKey(a.ordem) - ordemSortKey(b.ordem));
  const byGroup = new Map();
  const metaByBucket = new Map();
  const emptyKey = [];
  for (const ind of list) {
    const g = getIndicadorGrupoVisual(ind);
    if (!g) {
      emptyKey.push(ind);
      continue;
    }
    const tipoE = tipoGraficoEfetivoIndicador(ind, modulo);
    const bucket = `${g}\u0001${tipoE}`;
    if (!byGroup.has(bucket)) byGroup.set(bucket, []);
    byGroup.get(bucket).push(ind);
    if (!metaByBucket.has(bucket)) {
      metaByBucket.set(bucket, {
        key: bucket,
        labelSerie: g,
        tipo: /** @type {'linha'|'barra'|'area'|'radar'|'pizza'} */ (tipoE),
      });
    }
  }
  const combinedGroups = [];
  const solo = [...emptyKey];
  const combinedGroupByBucket = new Map();
  for (const [bucket, members] of byGroup) {
    const meta = metaByBucket.get(bucket);
    const labelSerie = meta?.labelSerie || bucket.split('\u0001')[0];
    const tipo = meta?.tipo || /** @type {'linha'|'barra'|'area'|'radar'|'pizza'} */ ('linha');
    if (members.length >= 2) {
      const group = { key: bucket, labelSerie, tipo, members };
      combinedGroups.push(group);
      combinedGroupByBucket.set(bucket, group);
    }
    else solo.push(...members);
  }
  combinedGroups.sort((a, b) => ordemSortKey(a.members[0]?.ordem) - ordemSortKey(b.members[0]?.ordem));
  solo.sort((a, b) => ordemSortKey(a.ordem) - ordemSortKey(b.ordem));
  const orderedSerieBlocks = [];
  const emittedCombined = new Set();
  for (const ind of list) {
    const g = getIndicadorGrupoVisual(ind);
    if (!g) {
      orderedSerieBlocks.push({ kind: 'solo', ind });
      continue;
    }
    const tipoE = tipoGraficoEfetivoIndicador(ind, modulo);
    const bucket = `${g}\u0001${tipoE}`;
    if (combinedGroupByBucket.has(bucket)) {
      if (emittedCombined.has(bucket)) continue;
      emittedCombined.add(bucket);
      orderedSerieBlocks.push({ kind: 'group', group: combinedGroupByBucket.get(bucket) });
      continue;
    }
    orderedSerieBlocks.push({ kind: 'solo', ind });
  }
  return { combinedSerieGroups: combinedGroups, soloSerieIndicators: solo, orderedSerieBlocks };
}

function serieValueKey(indId) {
  const safe = String(indId ?? '')
    .trim()
    .replace(/[^a-zA-Z0-9_]/g, '_');
  return `v_${safe}`;
}

function buildCombinedSeriesData(members, setorId, getLancamento) {
  return MESES.map((mesLabel, i) => {
    const row = { mes: mesLabel };
    for (const ind of members) {
      row[serieValueKey(ind.id)] = parseLocaleNumber(getLancamento(ind.id, setorId, i + 1)?.valor);
    }
    return row;
  });
}

function buildGroupedPizzaData(members, setorId, mesAtual, getLancamento) {
  return members.map((ind) => ({
    mes: getIndicadorNomeSerie(ind),
    valor: getLancamento(ind.id, setorId, mesAtual)?.valor ?? null,
  }));
}

function buildRadarRows(members, setorId, mes, getLancamento, getMeta) {
  const rows = members.map((ind) => ({
    subject: (ind.label || ind.nome || '—').slice(0, 28),
    value: getLancamento(ind.id, setorId, mes)?.valor ?? null,
  }));
  if (rows.length === 1) {
    const ind = members[0];
    const mv = getMeta(ind.id, setorId)?.valor;
    rows.push({
      subject: mv != null && mv !== '' ? 'Meta' : 'Referência',
      value: mv != null ? mv : 0,
    });
  }
  return rows;
}

function buildQualidadeRadarRows(members, setorId, mes, getLancamento, getMeta) {
  const rows = members.map((ind) => ({
    subject: ind.label || ind.nome || '—',
    value: getLancamento(ind.id, setorId, mes)?.valor ?? null,
    fullMark: 100,
  }));
  if (rows.length === 1) {
    const ind = members[0];
    const mv = getMeta(ind.id, setorId)?.valor;
    rows.push({
      subject: mv != null && mv !== '' ? 'Meta' : 'Referência',
      value: mv != null ? mv : 0,
      fullMark: 100,
    });
  }
  return rows;
}

function domainFromRadarRows(rows) {
  let max = 0;
  for (const r of rows) {
    const v = r.value;
    if (typeof v === 'number' && !Number.isNaN(v)) max = Math.max(max, Math.abs(v));
  }
  if (max <= 0) return 100;
  return Math.ceil(max * 1.15);
}

function MiniRadarChart({ members, setorId, mes, getLancamento, getMeta, height = 200 }) {
  const radarData = buildRadarRows(members, setorId, mes, getLancamento, getMeta);
  const domainMax = domainFromRadarRows(radarData);

  return (
    <div className="space-y-2">
      <ResponsiveContainer width="100%" height={height}>
        <RadarChart data={radarData} cx="50%" cy="50%" outerRadius="70%" margin={{ top: 16, right: 24, bottom: 16, left: 24 }}>
          <PolarGrid stroke="#e5e7eb" />
          <PolarAngleAxis dataKey="subject" tick={{ fontSize: 10, fill: '#4b5563' }} />
          <PolarRadiusAxis angle={30} domain={[0, domainMax]} tick={{ fontSize: 9 }} />
          <Tooltip formatter={(v) => [v !== null && v !== undefined ? v : '—', 'Valor']} />
          <Radar name="Valor" dataKey="value" stroke="#0d9488" fill="#14b8a6" fillOpacity={0.35} strokeWidth={2} connectNulls />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
}

function RadarMispStyleSection({
  members,
  setorId,
  mes,
  anoAtual,
  getLancamento,
  getMeta,
  modulo,
  highlight = false,
}) {
  const faixas = effectiveRadarFaixas(null, modulo, members);
  const radarData = buildQualidadeRadarRows(members, setorId, mes, getLancamento, getMeta);
  const tableData = members.map((ind) => ({
    nome: ind.label || ind.nome,
    valores: MESES.map((_, i) => getLancamento(ind.id, setorId, i + 1)?.valor ?? null),
  }));
  const mesLabel = MESES[mes - 1] || String(mes);

  return (
    <div className="space-y-4 w-full">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
        📡 Radar · {mesLabel.toUpperCase()}/{anoAtual}
      </p>
      <RadarQualidadeChartWithLegend radarData={radarData} faixas={faixas} highlight={highlight} />
      <RadarQualidadeHistoricoTable tableData={tableData} mesAtivo={mes} faixas={faixas} />
    </div>
  );
}

export function RadarSection({
  members,
  setorId,
  mes,
  anoAtual,
  getLancamento,
  getMeta,
  modulo,
  dynamicHeight = 220,
  highlight = false,
}) {
  if (isRadarPercentQualidadeScale(members)) {
    return (
      <RadarMispStyleSection
        members={members}
        setorId={setorId}
        mes={mes}
        anoAtual={anoAtual}
        getLancamento={getLancamento}
        getMeta={getMeta}
        modulo={modulo}
        highlight={highlight}
      />
    );
  }
  return (
    <MiniRadarChart
      members={members}
      setorId={setorId}
      mes={mes}
      getLancamento={getLancamento}
      getMeta={getMeta}
      height={dynamicHeight}
    />
  );
}

function MultiSeriesChart({
  tipo,
  members,
  data,
  setorId,
  getMeta,
  mesAtual,
  anoAtual,
  getLancamento,
  modulo,
  chartWidth = undefined,
  chartHeight = 220,
}) {
  const visualByIndicadorId = new Map(
    members.map((ind) => {
      const metaRec = getMeta(ind.id, setorId);
      const lancAtual = getLancamento(ind.id, setorId, mesAtual);
      const status = calcularStatusMeta(lancAtual?.valor, metaRec?.valor, ind.tipo_direcao_meta);
      const colorCfg = resolveMetaColor({ ind, metaRec, status });
      return [String(ind.id), colorCfg];
    })
  );

  const yAxisDomain = tipo === 'linha'
    ? buildStableYAxisDomain(
      data,
      members.map((ind) => serieValueKey(ind.id))
    )
    : undefined;

  if (tipo === 'radar') {
    return (
      <RadarSection
        members={members}
        setorId={setorId}
        mes={mesAtual}
        anoAtual={anoAtual}
        getLancamento={getLancamento}
        getMeta={getMeta}
        modulo={modulo}
        dynamicHeight={260}
      />
    );
  }

  const common = (
    <>
      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
      <XAxis dataKey="mes" tick={{ fontSize: 10 }} />
      <YAxis tick={{ fontSize: 10 }} domain={yAxisDomain || undefined} />
      <Tooltip formatter={(v, n) => [v !== null && v !== undefined ? v : '—', n]} />
      <Legend wrapperStyle={{ fontSize: 11 }} />
    </>
  );

  const metaLines = members.map((ind, idx) => {
    const metaRec = getMeta(ind.id, setorId);
    const metaValor = parseLocaleNumber(metaRec?.valor);
    if (metaValor == null) return null;
    const stroke = visualByIndicadorId.get(String(ind.id))?.lineHex || COLORS[idx % COLORS.length];
    return (
      <ReferenceLine
        key={`meta-${ind.id}`}
        y={metaValor}
        stroke={stroke}
        strokeDasharray="5 5"
        strokeOpacity={0.75}
        label={{
          value: `${(ind.label || ind.nome || '').slice(0, 14)} meta`,
          fontSize: 9,
          fill: stroke,
        }}
      />
    );
  });

  const singlePointGuides =
    tipo === 'linha'
      ? members.map((ind, idx) => {
          const dk = serieValueKey(ind.id);
          const single = findSinglePointInfo(data, dk);
          if (single.count !== 1 || !single.mes) return null;
          return (
            <ReferenceLine
              key={`single-guide-${ind.id}`}
              x={single.mes}
              stroke={visualByIndicadorId.get(String(ind.id))?.lineHex || COLORS[idx % COLORS.length]}
              strokeDasharray="3 3"
              strokeOpacity={0.35}
            />
          );
        })
      : [];

  const series = members.map((ind, idx) => {
    const stroke = visualByIndicadorId.get(String(ind.id))?.lineHex || COLORS[idx % COLORS.length];
    const name = getIndicadorNomeSerie(ind);
    const dk = serieValueKey(ind.id);
    const single = findSinglePointInfo(data, dk);
    const hasSinglePoint = single.count === 1;
    if (tipo === 'barra') {
      return <Bar key={ind.id} dataKey={dk} name={name} fill={stroke} radius={[2, 2, 0, 0]} />;
    }
    if (tipo === 'area') {
      return (
        <Area
          key={ind.id}
          type="monotone"
          dataKey={dk}
          name={name}
          stroke={stroke}
          fill={stroke}
          fillOpacity={0.15}
          strokeWidth={2}
          connectNulls={false}
        />
      );
    }
    return (
      <Line
        key={ind.id}
        type="monotone"
        dataKey={dk}
        name={name}
        stroke={stroke}
        strokeWidth={hasSinglePoint ? 3 : 2}
        dot={{
          r: hasSinglePoint ? SINGLE_POINT_DOT_RADIUS : 3,
          strokeWidth: hasSinglePoint ? 2 : 1.5,
          fill: stroke,
        }}
        activeDot={{ r: hasSinglePoint ? SINGLE_POINT_ACTIVE_DOT_RADIUS : 4 }}
        connectNulls={hasSinglePoint}
      />
    );
  });

  const margin = { top: 8, right: 8, left: -12, bottom: 8 };
  const chartSize = chartWidth ? { width: chartWidth, height: chartHeight } : {};

  if (tipo === 'barra') {
    return (
      <BarChart data={data} margin={margin} {...chartSize}>
        {common}
        {metaLines}
        {series}
      </BarChart>
    );
  }
  if (tipo === 'area') {
    return (
      <AreaChart data={data} margin={margin} {...chartSize}>
        {common}
        {metaLines}
        {series}
      </AreaChart>
    );
  }
  return (
    <LineChart data={data} margin={margin} {...chartSize}>
      {common}
      {metaLines}
      {singlePointGuides}
      {series}
    </LineChart>
  );
}

/**
 * @typedef {object} SeriesChartProps
 * @property {'linha'|'barra'|'area'|'radar'|'pizza'} tipo
 * @property {any} chartData
 * @property {any} ind
 * @property {number} idx
 * @property {any} metaRec
 * @property {any} modulo
 * @property {any} mesAtual
 * @property {any} getLancamento
 * @property {any} setorParaGrafico
 * @property {any} buildChartData
 * @property {any} [getMeta]
 * @property {number} [anoAtual]
 * @property {number} [width] Injetado pelo `ResponsiveContainer` (Recharts).
 * @property {number} [height]
 * @property {number} [chartWidth]
 * @property {number} [chartHeight]
 */

/** @param {SeriesChartProps} props */
function SeriesChart(props) {
  const {
    tipo,
    chartData,
    ind,
    idx,
    metaRec,
    modulo,
    mesAtual,
    getLancamento,
    setorParaGrafico,
    buildChartData,
    getMeta,
    anoAtual,
    width,
    height,
    chartWidth,
    chartHeight,
  } = props;
  const resolvedWidth = chartWidth ?? width;
  const resolvedHeight = chartHeight ?? height;
  const chartSize = resolvedWidth ? { width: resolvedWidth, height: resolvedHeight || 160 } : {};
  const normalizedChartData = Array.isArray(chartData)
    ? chartData.map((row) => ({
        ...row,
        valor: parseLocaleNumber(row?.valor),
        meta: parseLocaleNumber(row?.meta),
      }))
    : [];
  const yAxisDomain = tipo === 'linha'
    ? buildStableYAxisDomain(normalizedChartData, ['valor', 'meta'])
    : undefined;
  const metaValor = parseLocaleNumber(metaRec?.valor);
  const singlePoint = findSinglePointInfo(normalizedChartData, 'valor');
  const hasSinglePoint = singlePoint.count === 1;
  if (tipo === 'radar') {
    return (
      <RadarSection
        members={[ind]}
        setorId={setorParaGrafico}
        mes={mesAtual}
        anoAtual={anoAtual ?? new Date().getFullYear()}
        getLancamento={getLancamento}
        getMeta={getMeta}
        modulo={modulo}
        dynamicHeight={height || 200}
      />
    );
  }
  if (tipo === 'pizza') {
    const pieData = buildChartDataPizzaResolved(ind, modulo, setorParaGrafico, mesAtual, getLancamento, buildChartData);
    const emptyKey = effectivePizzaFatias(ind, modulo)?.length ? 'fatias' : 'meses';
    return (
      <MonthPieChartBody
        chartData={pieData}
        ind={ind}
        idx={idx}
        emptyMessagesKey={emptyKey}
        width={resolvedWidth}
        height={resolvedHeight}
      />
    );
  }

  const lancAtual = getLancamento(ind.id, setorParaGrafico, mesAtual);
  const status = calcularStatusMeta(lancAtual?.valor, metaRec?.valor, ind.tipo_direcao_meta);
  const colorCfg = resolveMetaColor({ ind, metaRec, status });
  const stroke = colorCfg.lineHex || COLORS[idx % COLORS.length];
  const serieNome = getIndicadorNomeSerie(ind);
  const commonAxis = (
    <>
      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
      <XAxis dataKey="mes" tick={{ fontSize: 10 }} />
      <YAxis tick={{ fontSize: 10 }} domain={yAxisDomain || undefined} />
      <Tooltip
        contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e5e7eb' }}
        formatter={(v, name) => [v !== null ? v : '-', name === 'valor' ? serieNome : 'Meta']}
      />
      {metaValor != null && (
        <ReferenceLine
          y={metaValor}
          stroke={colorCfg.lineHex}
          strokeDasharray="4 4"
          label={{ value: 'Meta', fontSize: 10, fill: colorCfg.lineHex }}
        />
      )}
      {tipo === 'linha' && hasSinglePoint && singlePoint.mes ? (
        <ReferenceLine x={singlePoint.mes} stroke={stroke} strokeDasharray="3 3" strokeOpacity={0.35} />
      ) : null}
    </>
  );

  if (tipo === 'barra') {
    return (
      <BarChart data={normalizedChartData} margin={{ top: 5, right: 10, left: -20, bottom: 5 }} {...chartSize}>
        {commonAxis}
        <Bar dataKey="valor" fill={stroke} name={serieNome} radius={[3, 3, 0, 0]} />
      </BarChart>
    );
  }
  if (tipo === 'area') {
    return (
      <AreaChart data={normalizedChartData} margin={{ top: 5, right: 10, left: -20, bottom: 5 }} {...chartSize}>
        {commonAxis}
        <Area type="monotone" dataKey="valor" stroke={stroke} fill={stroke} fillOpacity={0.2} strokeWidth={2} name={serieNome} />
      </AreaChart>
    );
  }
  return (
    <LineChart data={normalizedChartData} margin={{ top: 5, right: 10, left: -20, bottom: 5 }} {...chartSize}>
      {commonAxis}
      <Line
        type="monotone"
        dataKey="valor"
        stroke={stroke}
        strokeWidth={hasSinglePoint ? 3 : 2}
        dot={{
          r: hasSinglePoint ? SINGLE_POINT_DOT_RADIUS : 3,
          strokeWidth: hasSinglePoint ? 2 : 1.5,
          fill: stroke,
        }}
        activeDot={{ r: hasSinglePoint ? SINGLE_POINT_ACTIVE_DOT_RADIUS : 4 }}
        connectNulls={hasSinglePoint}
        name={serieNome}
      />
    </LineChart>
  );
}

function IndicadorKpiCard({ ind, setorId, mesAtual, getLancamento, getMeta }) {
  const metaRec = getMeta(ind.id, setorId);
  const lancAtual = getLancamento(ind.id, setorId, mesAtual);
  const status = calcularStatusMeta(lancAtual?.valor, metaRec?.valor, ind.tipo_direcao_meta);
  const valorMeta = parseLocaleNumber(metaRec?.valor);
  return (
    <Card className="shadow-sm border-border/80">
      <CardContent className="p-3 space-y-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide truncate">{ind.label || ind.nome}</p>
          {ind.unidade ? <p className="text-[11px] text-muted-foreground">{ind.unidade}</p> : null}
        </div>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="rounded-md bg-muted/40 px-2 py-1.5">
            <p className="text-muted-foreground">Atual</p>
            <p className="font-semibold tabular-nums">{lancAtual?.valor ?? '—'}</p>
          </div>
          <div className="rounded-md bg-muted/40 px-2 py-1.5">
            <p className="text-muted-foreground">Meta</p>
            <p className="font-semibold tabular-nums">{valorMeta != null ? metaRec?.valor : '—'}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <BadgeStatusMeta status={status} />
        </div>
      </CardContent>
    </Card>
  );
}

/** Bloco radar completo (grupos + solos) — usado com módulo radar ou com indicadores com override radar. */
export function RadarModuloGrid({
  inds,
  setorParaGrafico,
  mesAtual,
  anoAtual,
  getLancamento,
  getMeta,
  showNota,
  modulo,
}) {
  const { combinedGroups, soloIndicators } = partitionRadarGroups(inds);
  const isSingleRadarCard = combinedGroups.length + soloIndicators.length === 1;
  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
      {combinedGroups.map((group) => (
        <div
          key={group.key}
          className="space-y-2 rounded-lg border bg-card/50 p-3 xl:col-span-2"
        >
          <RadarSection
            members={group.members}
            setorId={setorParaGrafico}
            mes={mesAtual}
            anoAtual={anoAtual}
            getLancamento={getLancamento}
            getMeta={getMeta}
            modulo={modulo}
            dynamicHeight={260}
            highlight={isSingleRadarCard}
          />
        </div>
      ))}
      {soloIndicators.map((ind) => {
        const metaRec = getMeta(ind.id, setorParaGrafico);
        const lancAtual = getLancamento(ind.id, setorParaGrafico, mesAtual);
        const status = calcularStatusMeta(lancAtual?.valor, metaRec?.valor, ind.tipo_direcao_meta);
        const wide = isRadarPercentQualidadeScale([ind]);
        return (
          <div key={ind.id} className={`space-y-2 ${wide ? 'xl:col-span-2' : ''}`}>
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div>
                <p className="text-sm font-medium">{ind.label || ind.nome}</p>
                <p className="text-xs text-muted-foreground">{ind.unidade}</p>
              </div>
              <div className="flex items-center gap-2">
                {lancAtual?.valor !== undefined && (
                  <span className="text-lg font-jakarta font-bold">
                    {lancAtual.valor}
                    {ind.unidade?.startsWith('%') ? '%' : ''}
                  </span>
                )}
                <BadgeStatusMeta status={status} />
              </div>
            </div>
            <RadarSection
              members={[ind]}
              setorId={setorParaGrafico}
              mes={mesAtual}
              anoAtual={anoAtual}
              getLancamento={getLancamento}
              getMeta={getMeta}
              modulo={modulo}
              dynamicHeight={180}
              highlight={isSingleRadarCard}
            />
            {showNota && lancAtual?.nota && (
              <p className="text-xs text-muted-foreground italic bg-secondary/40 rounded px-2 py-1">
                📝 {lancAtual.nota}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function GenericModuloChartGrid({
  modulo,
  indsDoModulo,
  setorParaGrafico,
  mesAtual,
  anoAtual = new Date().getFullYear(),
  buildChartData,
  getMeta,
  getLancamento,
  showNota = true,
}) {
  const tipoModulo = normalizeTipoGrafico(modulo.tipo_grafico);
  const cardLayout = useCardGraficoLayout(modulo);
  const chartDebug = isDashboardDebugEnabled();
  const rootRef = useRef(null);

  useEffect(() => {
    if (!chartDebug) return;
    const root = rootRef.current;
    if (!root) return;
    const logSnapshot = () => {
      const wrappers = Array.from(root.querySelectorAll('.recharts-wrapper'));
      const surfaces = root.querySelectorAll('.recharts-surface').length;
      const curves = root.querySelectorAll('.recharts-line-curve').length;
      const dots = root.querySelectorAll('.recharts-dot').length;
      const rects = wrappers.slice(0, 6).map((el, i) => {
        const r = el.getBoundingClientRect();
        return { i, w: Math.round(r.width), h: Math.round(r.height) };
      });
      console.debug('[dashboard:chart-dom]', {
        moduloId: modulo?.id,
        tipoUi: modulo?.tipo_ui,
        wrappers: wrappers.length,
        surfaces,
        curves,
        dots,
        rects,
      });
    };
    const t = setTimeout(logSnapshot, 300);
    logSnapshot();
    return () => clearTimeout(t);
  }, [chartDebug, modulo?.id, modulo?.tipo_ui, indsDoModulo, setorParaGrafico, mesAtual, anoAtual]);

  if (tipoModulo === 'radar') {
    return (
      <RadarModuloGrid
        inds={indsDoModulo}
        setorParaGrafico={setorParaGrafico}
        mesAtual={mesAtual}
        anoAtual={anoAtual}
        getLancamento={getLancamento}
        getMeta={getMeta}
        showNota={showNota}
        modulo={modulo}
      />
    );
  }

  const indsRadar = indsDoModulo.filter((ind) => tipoGraficoEfetivoIndicador(ind, modulo) === 'radar');
  const indsSerie = indsDoModulo.filter((ind) => tipoGraficoEfetivoIndicador(ind, modulo) !== 'radar');
  const { orderedSerieBlocks } = partitionSerieGroups(indsSerie, modulo);
  const soloSerieIndicators = orderedSerieBlocks
    .filter((block) => block.kind === 'solo')
    .map((block) => block.ind);
  const soloHasOddCount = soloSerieIndicators.length % 2 === 1;
  let soloRenderIdx = -1;

  return (
    <div className="space-y-8" ref={rootRef}>
      {indsRadar.length > 0 ? (
        <RadarModuloGrid
          inds={indsRadar}
          setorParaGrafico={setorParaGrafico}
          mesAtual={mesAtual}
          anoAtual={anoAtual}
          getLancamento={getLancamento}
          getMeta={getMeta}
          showNota={showNota}
          modulo={modulo}
        />
      ) : null}

      {indsSerie.length > 0 ? (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          {orderedSerieBlocks.map((block) => {
            if (block.kind === 'group') {
              const group = block.group;
              const combinedData = buildCombinedSeriesData(group.members, setorParaGrafico, getLancamento);
              if (chartDebug) {
                const finitePoints = group.members.map((m) => {
                  const dk = serieValueKey(m.id);
                  const count = combinedData.reduce((acc, row) => (parseLocaleNumber(row?.[dk]) != null ? acc + 1 : acc), 0);
                  return { indicadorId: String(m.id), dataKey: dk, pontos: count };
                });
                console.debug('[dashboard:chart-data:group]', {
                  moduloId: modulo?.id,
                  group: group.labelSerie,
                  tipo: group.tipo,
                  amostra: combinedData.slice(0, 6),
                  finitePoints,
                });
              }
              const notas = group.members
                .map((ind) => {
                  const n = getLancamento(ind.id, setorParaGrafico, mesAtual)?.nota;
                  return n ? { ind, n } : null;
                })
                .filter(Boolean);
              const tipoGrupo = group.tipo;

              return (
                <div
                  key={group.key}
                  className={`space-y-3 xl:col-span-2 ${cardLayout ? 'rounded-xl border border-border/60 bg-muted/20 p-3' : ''}`}
                >
                  {cardLayout ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                      {group.members.map((ind) => (
                        <IndicadorKpiCard
                          key={ind.id}
                          ind={ind}
                          setorId={setorParaGrafico}
                          mesAtual={mesAtual}
                          getLancamento={getLancamento}
                          getMeta={getMeta}
                        />
                      ))}
                    </div>
                  ) : (
                    <MonthlyIndicatorTrackingTable
                      members={group.members}
                      setorId={setorParaGrafico}
                      mesAtual={mesAtual}
                      getLancamento={getLancamento}
                      getMeta={getMeta}
                      getMetaColor={resolveMetaColor}
                    />
                  )}

                  {tipoGrupo === 'pizza' ? (
                    <>
                      <div className="min-h-[300px] rounded-lg border bg-card/40 p-2">
                        <ResponsiveContainer
                          width="100%"
                          height={300}
                          minWidth={CHART_MIN_WIDTH}
                          onResize={
                            chartDebug
                              ? (w, h) => console.debug('[dashboard:chart-resize:group-pizza]', { w, h, group: group.labelSerie, moduloId: modulo?.id })
                              : undefined
                          }
                        >
                          <MonthPieChartBody
                            chartData={buildGroupedPizzaData(group.members, setorParaGrafico, mesAtual, getLancamento)}
                            ind={{ label: group.labelSerie }}
                            idx={0}
                            emptyMessagesKey="fatias"
                          />
                        </ResponsiveContainer>
                      </div>
                    </>
                  ) : tipoGrupo === 'radar' ? (
                    <MultiSeriesChart
                      tipo={tipoGrupo}
                      members={group.members}
                      data={combinedData}
                      setorId={setorParaGrafico}
                      getMeta={getMeta}
                      mesAtual={mesAtual}
                      anoAtual={anoAtual}
                      getLancamento={getLancamento}
                      modulo={modulo}
                    />
                  ) : (
                    <StableChartContainer
                      height={220}
                      minWidth={CHART_MIN_WIDTH}
                      debugTag={`group:${String(modulo?.id || '')}:${group.labelSerie}`}
                      debugEnabled={chartDebug}
                      allowHorizontalScroll
                    >
                      {(chartWidth, chartHeight) => (
                        <MultiSeriesChart
                          tipo={tipoGrupo}
                          members={group.members}
                          data={combinedData}
                          setorId={setorParaGrafico}
                          getMeta={getMeta}
                          mesAtual={mesAtual}
                          anoAtual={anoAtual}
                          getLancamento={getLancamento}
                          modulo={modulo}
                          chartWidth={chartWidth}
                          chartHeight={chartHeight}
                        />
                      )}
                    </StableChartContainer>
                  )}

                  {showNota && notas.length > 0 && (
                    <div className="space-y-1">
                      {notas.map(({ ind, n }) => (
                        <p key={ind.id} className="text-xs text-muted-foreground italic bg-secondary/40 rounded px-2 py-1">
                          <span className="font-medium not-italic text-foreground">{ind.label || ind.nome}:</span> 📝 {n}
                        </p>
                      ))}
                    </div>
                  )}
                </div>
              );
            }

            soloRenderIdx += 1;
            const ind = block.ind;
            const idx = soloRenderIdx;
            const indId = String(ind.id ?? idx);
            const soloShouldSpanFull = soloHasOddCount && idx === soloSerieIndicators.length - 1;
            const chartData = buildChartData(indId, setorParaGrafico);
            if (chartDebug) {
              const pontos = chartData.reduce((acc, row) => (parseLocaleNumber(row?.valor) != null ? acc + 1 : acc), 0);
              console.debug('[dashboard:chart-data:solo]', {
                moduloId: modulo?.id,
                indicadorId: indId,
                tipo: tipoGraficoEfetivoIndicador(ind, modulo),
                pontos,
                amostra: chartData.slice(0, 6),
              });
            }
            const metaRec = getMeta(indId, setorParaGrafico);
            const lancAtual = getLancamento(indId, setorParaGrafico, mesAtual);
            const direcaoMeta =
              typeof ind.tipo_direcao_meta === 'string' ? ind.tipo_direcao_meta : DIRECAO_META.MENOR_E_MELHOR;
            const status = calcularStatusMeta(lancAtual?.valor, metaRec?.valor, direcaoMeta);
            const tipoInd = tipoGraficoEfetivoIndicador(ind, modulo);
            const labelNome = String(ind.label ?? ind.nome ?? '');
            const unidadeStr = String(ind.unidade ?? '');

            if (cardLayout) {
              return (
                <div
                  key={indId}
                  className={`space-y-3 rounded-xl border border-border/60 bg-muted/15 p-3 ${soloShouldSpanFull ? 'xl:col-span-2' : ''}`}
                >
                  <IndicadorKpiCard
                    ind={ind}
                    setorId={setorParaGrafico}
                    mesAtual={mesAtual}
                    getLancamento={getLancamento}
                    getMeta={getMeta}
                  />
                  {tipoInd === 'radar' ? (
                    <SeriesChart
                      tipo={tipoInd}
                      chartData={chartData}
                      ind={ind}
                      idx={idx}
                      metaRec={metaRec}
                      modulo={modulo}
                      mesAtual={mesAtual}
                      anoAtual={anoAtual}
                      getLancamento={getLancamento}
                      getMeta={getMeta}
                      setorParaGrafico={setorParaGrafico}
                      buildChartData={buildChartData}
                    />
                  ) : (
                    // Linha/barra/area no solo devem preencher o card sem scrollbar interno.
                    // Pizza mantém minWidth/scroll para preservar layout circular.
                    <StableChartContainer
                      height={tipoInd === 'pizza' ? 300 : 160}
                      minWidth={tipoInd === 'pizza' ? CHART_MIN_WIDTH : 0}
                      debugTag={`solo-card:${String(modulo?.id || '')}:${indId}`}
                      debugEnabled={chartDebug}
                      allowHorizontalScroll={tipoInd === 'pizza'}
                    >
                      {(chartW, chartH) => (
                        <SeriesChart
                          tipo={tipoInd}
                          chartData={chartData}
                          ind={ind}
                          idx={idx}
                          metaRec={metaRec}
                          modulo={modulo}
                          mesAtual={mesAtual}
                          anoAtual={anoAtual}
                          getLancamento={getLancamento}
                          getMeta={getMeta}
                          setorParaGrafico={setorParaGrafico}
                          buildChartData={buildChartData}
                          chartWidth={chartW}
                          chartHeight={chartH}
                        />
                      )}
                    </StableChartContainer>
                  )}
                  {showNota && lancAtual?.nota && (
                    <p className="text-xs text-muted-foreground italic bg-secondary/40 rounded px-2 py-1">
                      📝 {lancAtual.nota}
                    </p>
                  )}
                </div>
              );
            }

            return (
              <div key={indId} className={`space-y-2 ${soloShouldSpanFull ? 'xl:col-span-2' : ''}`}>
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div>
                    <p className="text-sm font-medium">{labelNome}</p>
                    <p className="text-xs text-muted-foreground">{unidadeStr}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {lancAtual?.valor !== undefined && (
                      <span className="text-lg font-jakarta font-bold">
                        {lancAtual.valor}
                        {unidadeStr.startsWith('%') ? '%' : ''}
                      </span>
                    )}
                    <BadgeStatusMeta status={status} />
                  </div>
                </div>
                {tipoInd === 'radar' ? (
                  <SeriesChart
                    tipo={tipoInd}
                    chartData={chartData}
                    ind={ind}
                    idx={idx}
                    metaRec={metaRec}
                    modulo={modulo}
                    mesAtual={mesAtual}
                    anoAtual={anoAtual}
                    getLancamento={getLancamento}
                    getMeta={getMeta}
                    setorParaGrafico={setorParaGrafico}
                    buildChartData={buildChartData}
                  />
                ) : (
                  // Linha/barra/area no solo devem preencher o card sem scrollbar interno.
                  // Pizza mantém minWidth/scroll para preservar layout circular.
                  <StableChartContainer
                    height={tipoInd === 'pizza' ? 300 : 160}
                    minWidth={tipoInd === 'pizza' ? CHART_MIN_WIDTH : 0}
                    debugTag={`solo-plain:${String(modulo?.id || '')}:${indId}`}
                    debugEnabled={chartDebug}
                    allowHorizontalScroll={tipoInd === 'pizza'}
                  >
                    {(chartW, chartH) => (
                      <SeriesChart
                        tipo={tipoInd}
                        chartData={chartData}
                        ind={ind}
                        idx={idx}
                        metaRec={metaRec}
                        modulo={modulo}
                        mesAtual={mesAtual}
                        anoAtual={anoAtual}
                        getLancamento={getLancamento}
                        getMeta={getMeta}
                        setorParaGrafico={setorParaGrafico}
                        buildChartData={buildChartData}
                        chartWidth={chartW}
                        chartHeight={chartH}
                      />
                    )}
                  </StableChartContainer>
                )}
                {showNota && lancAtual?.nota && (
                  <p className="text-xs text-muted-foreground italic bg-secondary/40 rounded px-2 py-1">
                    📝 {lancAtual.nota}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
