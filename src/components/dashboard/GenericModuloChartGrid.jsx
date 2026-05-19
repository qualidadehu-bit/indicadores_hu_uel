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
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import BadgeStatusMeta from '@/components/BadgeStatusMeta';
import { DIRECAO_META, MESES, calcularStatusMeta } from '@/lib/indicadores';
import {
  isRadarPercentQualidadeScale,
  RadarQualidadeChartWithLegend,
  RadarQualidadeHistoricoTable,
} from '@/components/dashboard/RadarQualidadeUi';
import { effectiveRadarFaixas } from '@/lib/radarFaixas';
import { normalizeTipoGrafico, tipoGraficoEfetivoIndicador } from '@/lib/graficoTipo';
import { effectivePizzaFatias } from '@/lib/pizzaFatias';
import { buildChartDataPizzaResolved, MonthPieChartBody, PIZZA_SLICE_COLORS } from '@/components/dashboard/ModuloPizzaMonthShared';

const COLORS = PIZZA_SLICE_COLORS;

const TIPO_GRAFICO_LABEL_SHORT = {
  linha: 'Linha',
  barra: 'Barras',
  area: 'Área',
  radar: 'Radar',
  pizza: 'Pizza',
};

/** @param {unknown} ordem */
function ordemSortKey(ordem) {
  const n = typeof ordem === 'number' && !Number.isNaN(ordem) ? ordem : Number(ordem);
  return Number.isFinite(n) ? n : 0;
}

function useCardGraficoLayout(modulo) {
  return modulo?.layout_modulo === 'card_grafico';
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
 * Mesmo módulo, mesmo grupo_serie (trim, não vazio), 2+ membros com o mesmo tipo efetivo → bloco agrupado.
 * Tipos efetivos diferentes no mesmo nome de grupo viram subgrupos separados (sem MultiSeriesChart misto).
 * Linha/barra/área: um gráfico multi-série. Pizza: um gráfico pizza por indicador; fatias = meses do ano,
 * salvo se existir pizza_fatias (JSON no indicador ou módulo; ver src/lib/pizzaFatias.js).
 * @param {Record<string, unknown>[]} inds
 * @param {Record<string, unknown>|null|undefined} modulo
 */
function partitionSerieGroups(inds, modulo) {
  const list = [...inds].sort((a, b) => ordemSortKey(a.ordem) - ordemSortKey(b.ordem));
  const byGroup = new Map();
  const emptyKey = [];
  for (const ind of list) {
    const g = String(ind.grupo_serie || '').trim();
    if (!g) {
      emptyKey.push(ind);
      continue;
    }
    const tipoE = tipoGraficoEfetivoIndicador(ind, modulo);
    const bucket = `${g}\u0001${tipoE}`;
    if (!byGroup.has(bucket)) byGroup.set(bucket, []);
    byGroup.get(bucket).push(ind);
  }
  const combinedGroups = [];
  const solo = [...emptyKey];
  for (const [bucket, members] of byGroup) {
    const labelSerie = bucket.split('\u0001')[0];
    const tipo = /** @type {'linha'|'barra'|'area'|'radar'|'pizza'} */ (members[0] ? tipoGraficoEfetivoIndicador(members[0], modulo) : 'linha');
    if (members.length >= 2) combinedGroups.push({ key: bucket, labelSerie, tipo, members });
    else solo.push(...members);
  }
  combinedGroups.sort((a, b) => ordemSortKey(a.members[0]?.ordem) - ordemSortKey(b.members[0]?.ordem));
  solo.sort((a, b) => ordemSortKey(a.ordem) - ordemSortKey(b.ordem));
  return { combinedSerieGroups: combinedGroups, soloSerieIndicators: solo };
}

function serieValueKey(indId) {
  return `v_${indId}`;
}

function buildCombinedSeriesData(members, setorId, getLancamento) {
  return MESES.map((mesLabel, i) => {
    const row = { mes: mesLabel };
    for (const ind of members) {
      row[serieValueKey(ind.id)] = getLancamento(ind.id, setorId, i + 1)?.valor ?? null;
    }
    return row;
  });
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
      <RadarQualidadeChartWithLegend radarData={radarData} faixas={faixas} />
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

function MultiSeriesChart({ tipo, members, data, setorId, getMeta, mesAtual, anoAtual, getLancamento, modulo }) {
  if (tipo === 'radar') {
    if (!setorId) {
      return (
        <p className="text-xs text-muted-foreground text-center py-4 rounded-md border border-dashed border-muted-foreground/30 px-3">
          Selecione um setor para visualizar o gráfico radar.
        </p>
      );
    }
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
      <YAxis tick={{ fontSize: 10 }} />
      <Tooltip formatter={(v, n) => [v !== null && v !== undefined ? v : '—', n]} />
      <Legend wrapperStyle={{ fontSize: 11 }} />
    </>
  );

  const metaLines = members.map((ind, idx) => {
    const metaRec = getMeta(ind.id, setorId);
    if (metaRec?.valor == null) return null;
    const stroke = COLORS[idx % COLORS.length];
    return (
      <ReferenceLine
        key={`meta-${ind.id}`}
        y={metaRec.valor}
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

  const series = members.map((ind, idx) => {
    const stroke = COLORS[idx % COLORS.length];
    const name = ind.label || ind.nome;
    const dk = serieValueKey(ind.id);
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
        strokeWidth={2}
        dot={{ r: 3 }}
        connectNulls={false}
      />
    );
  });

  const margin = { top: 8, right: 8, left: -12, bottom: 8 };

  if (tipo === 'barra') {
    return (
      <BarChart data={data} margin={margin}>
        {common}
        {metaLines}
        {series}
      </BarChart>
    );
  }
  if (tipo === 'area') {
    return (
      <AreaChart data={data} margin={margin}>
        {common}
        {metaLines}
        {series}
      </AreaChart>
    );
  }
  return (
    <LineChart data={data} margin={margin}>
      {common}
      {metaLines}
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
  } = props;
  if (tipo === 'radar') {
    if (!setorParaGrafico) {
      return (
        <p className="text-xs text-muted-foreground text-center py-3">
          Selecione um setor para visualizar o gráfico radar.
        </p>
      );
    }
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
        width={width}
        height={height}
      />
    );
  }

  const stroke = COLORS[idx % COLORS.length];
  const commonAxis = (
    <>
      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
      <XAxis dataKey="mes" tick={{ fontSize: 10 }} />
      <YAxis tick={{ fontSize: 10 }} />
      <Tooltip
        contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e5e7eb' }}
        formatter={(v, name) => [v !== null ? v : '-', name === 'valor' ? ind.label || ind.nome : 'Meta']}
      />
      {metaRec?.valor != null && (
        <ReferenceLine
          y={metaRec.valor}
          stroke="#f59e0b"
          strokeDasharray="4 4"
          label={{ value: 'Meta', fontSize: 10, fill: '#f59e0b' }}
        />
      )}
    </>
  );

  if (tipo === 'barra') {
    return (
      <BarChart data={chartData} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
        {commonAxis}
        <Bar dataKey="valor" fill={stroke} name={ind.label || ind.nome} radius={[3, 3, 0, 0]} />
      </BarChart>
    );
  }
  if (tipo === 'area') {
    return (
      <AreaChart data={chartData} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
        {commonAxis}
        <Area type="monotone" dataKey="valor" stroke={stroke} fill={stroke} fillOpacity={0.2} strokeWidth={2} name={ind.label || ind.nome} />
      </AreaChart>
    );
  }
  return (
    <LineChart data={chartData} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
      {commonAxis}
      <Line
        type="monotone"
        dataKey="valor"
        stroke={stroke}
        strokeWidth={2}
        dot={{ r: 3 }}
        connectNulls={false}
        name={ind.label || ind.nome}
      />
    </LineChart>
  );
}

function IndicadorKpiCard({ ind, setorId, mesAtual, getLancamento, getMeta }) {
  const metaRec = getMeta(ind.id, setorId);
  const lancAtual = getLancamento(ind.id, setorId, mesAtual);
  const status = calcularStatusMeta(lancAtual?.valor, metaRec?.valor, ind.tipo_direcao_meta);
  return (
    <Card className="shadow-sm border-border/80">
      <CardContent className="p-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide truncate">{ind.label || ind.nome}</p>
          {ind.unidade ? <p className="text-[11px] text-muted-foreground">{ind.unidade}</p> : null}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {lancAtual?.valor !== undefined && lancAtual?.valor !== null ? (
            <span className="text-xl font-jakarta font-bold tabular-nums">
              {lancAtual.valor}
              {String(ind.unidade || '').includes('%') ? '%' : ''}
            </span>
          ) : (
            <span className="text-sm text-muted-foreground">—</span>
          )}
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
  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
      {combinedGroups.map((group) => (
        <div
          key={group.key}
          className="space-y-2 rounded-lg border bg-card/50 p-3 xl:col-span-2"
        >
          <div className="flex items-center justify-between flex-wrap gap-2">
            <p className="text-sm font-medium">Radar — grupo «{group.key}»</p>
            <Badge variant="secondary" className="text-xs">
              {group.members.length} indicadores
            </Badge>
          </div>
          <RadarSection
            members={group.members}
            setorId={setorParaGrafico}
            mes={mesAtual}
            anoAtual={anoAtual}
            getLancamento={getLancamento}
            getMeta={getMeta}
            modulo={modulo}
            dynamicHeight={260}
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

  if (tipoModulo === 'radar' && !setorParaGrafico) {
    return (
      <p className="text-sm text-muted-foreground py-4 text-center">
        Selecione um setor para visualizar os gráficos radar deste módulo.
      </p>
    );
  }

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
  const { combinedSerieGroups, soloSerieIndicators } = partitionSerieGroups(indsSerie, modulo);

  return (
    <div className="space-y-8">
      {indsRadar.length > 0 && !setorParaGrafico ? (
        <p className="text-sm text-muted-foreground py-3 text-center rounded-lg border border-dashed border-muted-foreground/30 px-3">
          Selecione um setor para visualizar os gráficos radar dos indicadores com tipo <strong>radar</strong> neste
          módulo.
        </p>
      ) : null}
      {indsRadar.length > 0 && setorParaGrafico ? (
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
          {combinedSerieGroups.map((group) => {
            const combinedData = buildCombinedSeriesData(group.members, setorParaGrafico, getLancamento);
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
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <p className="text-sm font-medium">
                    Série — «{group.labelSerie}» · {TIPO_GRAFICO_LABEL_SHORT[tipoGrupo] || tipoGrupo}
                  </p>
                  <Badge variant="secondary" className="text-xs">
                    {group.members.length} indicadores
                  </Badge>
                </div>

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
                  <div className="flex flex-wrap gap-2">
                    {group.members.map((ind) => {
                      const metaRec = getMeta(ind.id, setorParaGrafico);
                      const lancAtual = getLancamento(ind.id, setorParaGrafico, mesAtual);
                      const status = calcularStatusMeta(lancAtual?.valor, metaRec?.valor, ind.tipo_direcao_meta);
                      return (
                        <div
                          key={ind.id}
                          className="inline-flex flex-wrap items-center gap-2 rounded-lg border bg-card/60 px-2 py-1.5 text-xs"
                        >
                          <span className="font-medium text-foreground">{ind.label || ind.nome}</span>
                          {lancAtual?.valor !== undefined && lancAtual?.valor !== null ? (
                            <span className="font-jakarta font-bold tabular-nums">{lancAtual.valor}</span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                          <BadgeStatusMeta status={status} />
                        </div>
                      );
                    })}
                  </div>
                )}

                {tipoGrupo === 'pizza' ? (
                  <>
                    <p className="text-[11px] text-muted-foreground">
                      Tipo pizza: cada indicador do grupo tem o próprio gráfico. Sem fatias configuradas em
                      Configuração, as fatias são os meses do ano (só valores &gt; 0 entram na proporção). Com{' '}
                      <span className="font-mono text-[10px]">pizza_fatias</span> no indicador ou módulo, cada fatia
                      usa o valor do mês selecionado no dashboard para o indicador indicado.
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                      {group.members.map((ind, midx) => {
                        const emptyKey = effectivePizzaFatias(ind, modulo)?.length ? 'fatias' : 'meses';
                        return (
                        <div key={ind.id} className="min-h-[220px] rounded-lg border bg-card/40 p-2">
                          <ResponsiveContainer width="100%" height={220}>
                            <MonthPieChartBody
                              chartData={buildChartDataPizzaResolved(
                                ind,
                                modulo,
                                setorParaGrafico,
                                mesAtual,
                                getLancamento,
                                buildChartData
                              )}
                              ind={ind}
                              idx={midx}
                              emptyMessagesKey={emptyKey}
                            />
                          </ResponsiveContainer>
                        </div>
                        );
                      })}
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
                  <ResponsiveContainer width="100%" height={220}>
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
                  </ResponsiveContainer>
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
          })}

          {soloSerieIndicators.map((ind, idx) => {
            const indId = String(ind.id ?? idx);
            const chartData = buildChartData(indId, setorParaGrafico);
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
                <div key={indId} className="space-y-3 rounded-xl border border-border/60 bg-muted/15 p-3">
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
                    <ResponsiveContainer width="100%" height={tipoInd === 'pizza' ? 240 : 160}>
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
                    </ResponsiveContainer>
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
              <div key={indId} className="space-y-2">
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
                  <ResponsiveContainer width="100%" height={tipoInd === 'pizza' ? 240 : 160}>
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
                  </ResponsiveContainer>
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
