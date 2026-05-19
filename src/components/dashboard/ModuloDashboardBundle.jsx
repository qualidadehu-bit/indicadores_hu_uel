import { useState, useMemo } from 'react';
import {
  AreaChart, Area, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import { Layers } from 'lucide-react';
import BadgeStatusMeta from '@/components/BadgeStatusMeta';
import { calcularStatusMeta, STATUS_META } from '@/lib/indicadores';
import { isLesaoPressaoModuleShape } from '@/lib/moduloLayout';
import {
  findIndicadorPorAliases,
  findIndicadorDensidadeLP,
  ALIAS_LP_EXPOSTOS,
  ALIAS_LP_NOVOS,
  ALIAS_LP_PAC_DIA,
  ALIAS_LP_INCIDENCIA,
} from '@/lib/dashboardIndicadorLabels';
import { pickLancamentoMes } from '@/lib/lancamentosDashboard';
import { normalizeTipoGrafico, tipoGraficoEfetivoIndicador } from '@/lib/graficoTipo';
import { effectivePizzaFatias } from '@/lib/pizzaFatias';
import { buildChartDataPizzaResolved, MonthPieChartBody } from '@/components/dashboard/ModuloPizzaMonthShared';
import { RadarModuloGrid } from '@/components/dashboard/GenericModuloChartGrid';

const MESES_CURTO = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

const EXPOSTOS_COLORS = ['#ef4444', '#f59e0b', '#ef4444', '#22c55e', '#ef4444', '#f59e0b', '#ef4444', '#f59e0b', '#ef4444', '#f59e0b', '#ef4444', '#ef4444'];
const NOVOS_COLORS = ['#ef4444', '#f59e0b', '#ef4444', '#f59e0b', '#22c55e', '#22c55e', '#ef4444', '#22c55e', '#ef4444', '#22c55e', '#ec4899', '#f59e0b'];

function INCID_COLORS(val) {
  if (val === null || val === undefined) return { bg: '#e5e7eb', text: '#9ca3af' };
  if (val <= 5) return { bg: '#22c55e', text: '#fff' };
  if (val <= 10) return { bg: '#f59e0b', text: '#fff' };
  if (val <= 20) return { bg: '#ef4444', text: '#fff' };
  return { bg: '#7c3aed', text: '#fff' };
}

const GENERIC_LINE_COLORS = ['#2563eb', '#059669', '#d97706', '#dc2626', '#7c3aed', '#db2777', '#0d9488', '#4f46e5'];

function LesaoPressaoBundle({
  modulo, ano, mes, indicadores, lancamentos, metas, setorId, moduloId,
}) {
  const [mesSelecionado, setMesSelecionado] = useState(mes);

  const getMetaVal = (indicadorId) => {
    if (!setorId || !indicadorId) return undefined;
    const m = metas.find(
      (x) => x.indicador_id === indicadorId && x.setor_id === setorId && Number(x.ano) === Number(ano)
    );
    return m?.valor;
  };

  const getLanc = (indicadorId, m) => pickLancamentoMes(lancamentos, indicadorId, m, setorId);

  const indExpostos = findIndicadorPorAliases(indicadores, ALIAS_LP_EXPOSTOS);
  const indNovos = findIndicadorPorAliases(indicadores, ALIAS_LP_NOVOS);
  const indPacDia = findIndicadorPorAliases(indicadores, ALIAS_LP_PAC_DIA);
  const indDensidade = findIndicadorDensidadeLP(indicadores);
  const indIncidencia =
    findIndicadorPorAliases(indicadores, ALIAS_LP_INCIDENCIA) ||
    indicadores.find((i) => Number(i.ordem) === 1);

  const expostoAtual = indExpostos ? getLanc(indExpostos.id, mesSelecionado)?.valor : null;
  const novosAtual = indNovos ? getLanc(indNovos.id, mesSelecionado)?.valor : null;
  const pacDiaAtual = indPacDia ? getLanc(indPacDia.id, mesSelecionado)?.valor : null;
  const densAtual = indDensidade ? getLanc(indDensidade.id, mesSelecionado)?.valor : null;

  const calcIncid = (novos, expostos) => {
    if (!expostos || expostos === 0 || novos === null) return null;
    return parseFloat(((novos / expostos) * 100).toFixed(1));
  };

  const incidAtual = calcIncid(novosAtual, expostoAtual);

  const expostosMes = MESES_CURTO.map((_, i) => (indExpostos ? getLanc(indExpostos.id, i + 1)?.valor ?? null : null));
  const novosMes = MESES_CURTO.map((_, i) => (indNovos ? getLanc(indNovos.id, i + 1)?.valor ?? null : null));
  const densidadeMes = MESES_CURTO.map((_, i) => (indDensidade ? getLanc(indDensidade.id, i + 1)?.valor ?? null : null));
  const incidMes = MESES_CURTO.map((_, i) => calcIncid(novosMes[i], expostosMes[i]));

  const chartData = MESES_CURTO.map((label, i) => ({
    mes: label,
    densidade: densidadeMes[i],
  }));

  const KpiBox = ({
    label,
    value,
    display = undefined,
    unit,
    color = '#374151',
    borderColor = '#e5e7eb',
    indicador,
    numericForStatus = undefined,
  }) => {
    const num =
      numericForStatus !== undefined
        ? numericForStatus
        : (typeof value === 'number' ? value : null);
    const metaVal = indicador ? getMetaVal(indicador.id) : undefined;
    const status =
      setorId && indicador && num !== null && num !== undefined && metaVal !== null && metaVal !== undefined
        ? calcularStatusMeta(num, metaVal, indicador.tipo_direcao_meta)
        : null;
    const text =
      display !== undefined && display !== null
        ? display
        : (value !== null && value !== undefined ? String(value) : '—');
    return (
      <div className="flex-1 min-w-[110px] border rounded-lg px-4 py-3" style={{ borderColor }}>
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{label}</p>
        <div className="flex items-baseline gap-1 mt-1 flex-wrap">
          <span className="text-2xl font-jakarta font-bold" style={{ color }}>
            {text}
          </span>
          {unit && <span className="text-xs text-muted-foreground">{unit}</span>}
          {status && status !== STATUS_META.SEM_DADOS && (
            <BadgeStatusMeta status={status} />
          )}
        </div>
      </div>
    );
  };

  const TableCell = ({ val, bg, text, isActive, display = undefined }) => (
    <td className="py-1 px-0.5 text-center">
      {val !== null && val !== undefined ? (
        <span
          className="inline-flex items-center justify-center min-w-[3rem] h-7 px-1 rounded font-bold text-xs"
          style={{
            backgroundColor: bg,
            color: text,
            outline: isActive ? '2px solid #06b6d4' : 'none',
            outlineOffset: '1px',
          }}
        >
          {display ?? val}
        </span>
      ) : (
        <span className="inline-flex items-center justify-center w-12 h-7 text-gray-300 text-xs">—</span>
      )}
    </td>
  );

  const title = modulo?.nome || 'Lesão por Pressão (LP)';

  return (
    <div className="bg-white rounded-xl border border-border shadow-sm overflow-hidden" data-modulo-id={moduloId}>
      <div className="flex items-center justify-between px-5 pt-4 pb-3 flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-blue-500" />
            <span className="font-jakarta font-bold text-base">{title}</span>
          </div>
          <p className="text-xs text-primary font-medium mt-0.5">
            Histórico {ano} · Mês: <span className="font-semibold">{MESES_CURTO[mesSelecionado - 1]}</span>
          </p>
        </div>
        <div className="flex flex-wrap gap-1">
          {MESES_CURTO.map((m, i) => (
            <button
              key={m}
              type="button"
              onClick={() => setMesSelecionado(i + 1)}
              className={`px-2 py-0.5 rounded text-xs font-medium transition-all ${
                mesSelecionado === i + 1 ? 'bg-cyan-500 text-white' : 'text-muted-foreground hover:bg-secondary'
              }`}
            >
              {m}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap gap-3 px-5 pb-4">
        <KpiBox label="Expostos" value={expostoAtual} unit="pac" indicador={indExpostos} />
        <KpiBox label="Novos Casos" value={novosAtual} unit="casos" color="#06b6d4" borderColor="#06b6d4" indicador={indNovos} />
        {indPacDia && (
          <KpiBox label="Paciente Dia" value={pacDiaAtual} unit="" color="#374151" borderColor="#06b6d4" indicador={indPacDia} />
        )}
        <KpiBox label="Densidade LP" value={densAtual} unit="/1k" color="#ef4444" borderColor="#ef4444" indicador={indDensidade} />
        <KpiBox
          label="Incidência LP"
          value={incidAtual}
          display={incidAtual !== null ? `${incidAtual}%` : null}
          unit=""
          color="#ef4444"
          borderColor="#ef4444"
          indicador={indIncidencia || undefined}
          numericForStatus={incidAtual}
        />
      </div>

      <div className="px-5 pb-4">
        <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-3 flex items-center gap-1">
          <span className="text-primary">≡</span> Histórico Anual
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse min-w-[780px]">
            <thead>
              <tr>
                <th className="text-left py-1 pr-3 w-36 text-muted-foreground font-semibold" />
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
              <tr>
                <td className="py-1.5 pr-3 font-medium text-foreground text-xs">Expostos</td>
                {expostosMes.map((val, mi) => (
                  <TableCell key={mi} val={val} bg={EXPOSTOS_COLORS[mi]} text="#fff" isActive={mesSelecionado === mi + 1} />
                ))}
              </tr>
              <tr>
                <td className="py-1.5 pr-3 font-medium text-foreground text-xs">Novos Casos</td>
                {novosMes.map((val, mi) => (
                  <TableCell key={mi} val={val} bg={NOVOS_COLORS[mi]} text="#fff" isActive={mesSelecionado === mi + 1} />
                ))}
              </tr>
              <tr>
                <td className="py-1.5 pr-3 font-medium text-foreground text-xs">Incidência (%)</td>
                {incidMes.map((val, mi) => {
                  const cfg = INCID_COLORS(val);
                  return (
                    <TableCell
                      key={mi}
                      val={val}
                      bg={cfg.bg}
                      text={cfg.text}
                      isActive={mesSelecionado === mi + 1}
                      display={val !== null ? `${val}%` : null}
                    />
                  );
                })}
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div className="px-5 pb-5">
        <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-3 flex items-center gap-1">
          <span className="text-primary">~</span> Densidade LP / 1.000 Paciente-Dia
        </p>
        <ResponsiveContainer width="100%" height={200}>
          <AreaChart data={chartData} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
            <defs>
              <linearGradient id={`lpGrad-${moduloId || 'lp'}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#ec4899" stopOpacity={0.15} />
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
              fill={`url(#lpGrad-${moduloId || 'lp'})`}
              dot={{ r: 4, fill: '#ec4899', strokeWidth: 0 }}
              connectNulls={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function GenericModuloBundle({
  modulo, ano, mes, indicadores, lancamentos, metas, setorId, moduloId,
}) {
  const [mesSelecionado, setMesSelecionado] = useState(mes);
  const indsSorted = useMemo(
    () => [...indicadores].sort((a, b) => (a.ordem || 0) - (b.ordem || 0)),
    [indicadores]
  );
  const tipoModulo = normalizeTipoGrafico(modulo?.tipo_grafico);

  const indsPizza = useMemo(
    () => indsSorted.filter((ind) => tipoGraficoEfetivoIndicador(ind, modulo) === 'pizza'),
    [indsSorted, modulo]
  );
  const indsRadar = useMemo(() => {
    if (tipoModulo === 'radar') {
      return indsSorted.filter((ind) => tipoGraficoEfetivoIndicador(ind, modulo) !== 'pizza');
    }
    return indsSorted.filter((ind) => tipoGraficoEfetivoIndicador(ind, modulo) === 'radar');
  }, [indsSorted, modulo, tipoModulo]);
  const indsSerie = useMemo(
    () =>
      indsSorted.filter((ind) => {
        const t = tipoGraficoEfetivoIndicador(ind, modulo);
        return t !== 'pizza' && t !== 'radar';
      }),
    [indsSorted, modulo]
  );

  const getMetaVal = (indicadorId) => {
    if (!setorId || !indicadorId) return undefined;
    const m = metas.find(
      (x) => x.indicador_id === indicadorId && x.setor_id === setorId && Number(x.ano) === Number(ano)
    );
    return m?.valor;
  };

  const getLanc = (indicadorId, m) => pickLancamentoMes(lancamentos, indicadorId, m, setorId);

  const getLancamentoBundle = (indicadorId, sid, mesNum) =>
    sid ? pickLancamentoMes(lancamentos, indicadorId, mesNum, sid) : null;

  const getMetaBundle = (indicadorId, sid) => {
    if (!sid || !indicadorId) return undefined;
    return metas.find(
      (x) => x.indicador_id === indicadorId && x.setor_id === sid && Number(x.ano) === Number(ano)
    );
  };

  const buildChartDataBundle = (indicadorId, sid) =>
    MESES_CURTO.map((label, i) => ({
      mes: label,
      valor: sid ? pickLancamentoMes(lancamentos, indicadorId, i + 1, sid)?.valor ?? null : null,
    }));

  const chartDataLine = MESES_CURTO.map((label, i) => {
    const row = { mes: label };
    indsSerie.forEach((ind) => {
      row[`v_${ind.id}`] = getLanc(ind.id, i + 1)?.valor ?? null;
    });
    return row;
  });

  const fmt = (v, ind) => {
    if (v === null || v === undefined) return '—';
    const u = ind.unidade || '';
    return u.startsWith('%') ? `${v}%` : String(v);
  };

  return (
    <div className="bg-white rounded-xl border border-border shadow-sm overflow-hidden" data-modulo-id={moduloId}>
      <div className="flex items-center justify-between px-5 pt-4 pb-3 flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-primary" />
            <span className="font-jakarta font-bold text-base">{modulo.nome}</span>
          </div>
          <p className="text-xs text-primary font-medium mt-0.5">
            Histórico {ano} · Mês: <span className="font-semibold">{MESES_CURTO[mesSelecionado - 1]}</span>
          </p>
        </div>
        <div className="flex flex-wrap gap-1">
          {MESES_CURTO.map((m, i) => (
            <button
              key={m}
              type="button"
              onClick={() => setMesSelecionado(i + 1)}
              className={`px-2 py-0.5 rounded text-xs font-medium transition-all ${
                mesSelecionado === i + 1 ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-secondary'
              }`}
            >
              {m}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap gap-3 px-5 pb-4">
        {indsSorted.map((ind) => {
          const v = getLanc(ind.id, mesSelecionado)?.valor;
          const metaVal = getMetaVal(ind.id);
          const status =
            setorId && v !== null && v !== undefined && metaVal !== null && metaVal !== undefined
              ? calcularStatusMeta(Number(v), Number(metaVal), ind.tipo_direcao_meta)
              : STATUS_META.SEM_DADOS;
          return (
            <div key={ind.id} className="flex-1 min-w-[100px] border rounded-lg px-3 py-2 border-border">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide truncate">
                {ind.label || ind.nome}
              </p>
              <div className="flex items-baseline gap-1 mt-1 flex-wrap">
                <span className="text-xl font-jakarta font-bold">{fmt(v, ind)}</span>
                {setorId && status !== STATUS_META.SEM_DADOS && <BadgeStatusMeta status={status} />}
              </div>
            </div>
          );
        })}
      </div>

      <div className="px-5 pb-4">
        <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-2">Histórico Anual</p>
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse min-w-[640px]">
            <thead>
              <tr>
                <th className="text-left py-1 pr-2 text-muted-foreground font-semibold w-32">Indicador</th>
                {MESES_CURTO.map((m, i) => (
                  <th
                    key={m}
                    className="text-center py-1 px-0.5 font-semibold text-[10px]"
                    style={{
                      color: mesSelecionado === i + 1 ? 'hsl(var(--primary))' : '#6b7280',
                      borderBottom: mesSelecionado === i + 1 ? '2px solid hsl(var(--primary))' : '1px solid transparent',
                    }}
                  >
                    {m}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {indsSorted.map((ind) => (
                <tr key={ind.id} className="border-t border-dashed border-border/60">
                  <td className="py-1.5 pr-2 font-medium text-foreground truncate max-w-[8rem]">
                    {ind.label || ind.nome}
                  </td>
                  {MESES_CURTO.map((_, mi) => {
                    const val = getLanc(ind.id, mi + 1)?.valor;
                    return (
                      <td key={mi} className="text-center py-1 px-0.5 text-foreground font-medium">
                        {val !== null && val !== undefined ? fmt(val, ind) : '—'}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="px-5 pb-5 space-y-5">
        {indsRadar.length > 0 ? (
          <div>
            <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-2">Radar (mês selecionado)</p>
            {!setorId ? (
              <p className="text-xs text-muted-foreground rounded-md border border-dashed border-muted-foreground/30 px-3 py-2">
                Selecione um setor no dashboard para visualizar os gráficos radar.
              </p>
            ) : (
              <RadarModuloGrid
                inds={indsRadar}
                setorParaGrafico={setorId}
                mesAtual={mesSelecionado}
                anoAtual={ano}
                getLancamento={getLancamentoBundle}
                getMeta={getMetaBundle}
                showNota={false}
                modulo={modulo}
              />
            )}
          </div>
        ) : null}

        {indsSerie.length > 0 ? (
          <div>
            <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-2">Tendência (ano)</p>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={chartDataLine} margin={{ top: 5, right: 16, left: -12, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="mes" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8 }} />
                {indsSerie.map((ind, idx) => (
                  <Line
                    key={ind.id}
                    type="monotone"
                    dataKey={`v_${ind.id}`}
                    name={ind.label || ind.nome}
                    stroke={GENERIC_LINE_COLORS[idx % GENERIC_LINE_COLORS.length]}
                    strokeWidth={2}
                    dot={{ r: 2 }}
                    connectNulls={false}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        ) : null}

        {indsPizza.length > 0 ? (
          <div>
            <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-2">
              Distribuição no mês (pizza)
            </p>
            {!setorId ? (
              <p className="text-xs text-muted-foreground rounded-md border border-dashed border-muted-foreground/30 px-3 py-2">
                Selecione um setor no dashboard para carregar os valores das fatias neste painel.
              </p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {indsPizza.map((ind, pidx) => {
                  const pieData = buildChartDataPizzaResolved(
                    ind,
                    modulo,
                    setorId,
                    mesSelecionado,
                    getLancamentoBundle,
                    buildChartDataBundle
                  );
                  const emptyKey = effectivePizzaFatias(ind, modulo)?.length ? 'fatias' : 'meses';
                  return (
                    <div key={ind.id} className="min-h-[220px] rounded-lg border border-border/60 bg-muted/10 p-2">
                      <ResponsiveContainer width="100%" height={220}>
                        <MonthPieChartBody chartData={pieData} ind={ind} idx={pidx} emptyMessagesKey={emptyKey} />
                      </ResponsiveContainer>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}

/**
 * Painel reutilizável: KPIs + seleção de mês + tabela 12 meses + gráfico.
 * Preset LP quando o módulo tem o formato Expostos/Novos Casos ou nome legado; caso contrário, layout genérico por indicador.
 */
export default function ModuloDashboardBundle({
  modulo,
  indicadores,
  lancamentos,
  metas = [],
  ano,
  mes,
  setorId,
  moduloId,
}) {
  const lpShape = isLesaoPressaoModuleShape(modulo, indicadores);
  if (lpShape) {
    return (
      <LesaoPressaoBundle
        modulo={modulo}
        ano={ano}
        mes={mes}
        indicadores={indicadores}
        lancamentos={lancamentos}
        metas={metas}
        setorId={setorId}
        moduloId={moduloId}
      />
    );
  }
  return (
    <GenericModuloBundle
      modulo={modulo}
      ano={ano}
      mes={mes}
      indicadores={indicadores}
      lancamentos={lancamentos}
      metas={metas}
      setorId={setorId}
      moduloId={moduloId}
    />
  );
}
