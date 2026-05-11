import { useState } from 'react';
import {
  AreaChart, Area, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend
} from 'recharts';
import { Activity } from 'lucide-react';

const MESES_CURTO = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

// Custom dot with label for red line
const LabeledDot = (props) => {
  const { cx, cy, value } = props;
  if (value === null || value === undefined || cx === undefined) return null;
  return (
    <g>
      <circle cx={cx} cy={cy} r={14} fill="#ef4444" />
      <text x={cx} y={cy + 4} textAnchor="middle" fontSize={9} fill="white" fontWeight="bold">
        {value}
      </text>
    </g>
  );
};

function DeviceSection({ title, kpi1Label, kpi1Value, kpi1Unit, kpi2Label, kpi2Value, kpi2Unit, chartData, line1Key, line1Name, line2Key, line2Name }) {
  return (
    <div className="border border-gray-100 rounded-xl overflow-hidden mb-4">
      {/* Sub-header */}
      <div className="px-4 py-2 bg-gray-50 border-b border-gray-100">
        <p className="text-xs font-bold text-cyan-600">{title}</p>
      </div>
      {/* KPI row */}
      <div className="flex divide-x divide-gray-100">
        <div className="flex-1 px-5 py-3">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{kpi1Label}</p>
          <div className="flex items-baseline gap-1 mt-0.5">
            <span className="text-2xl font-jakarta font-bold text-foreground">{kpi1Value ?? '—'}</span>
            {kpi1Unit && <span className="text-xs text-muted-foreground">{kpi1Unit}</span>}
          </div>
        </div>
        <div className="flex-1 px-5 py-3">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{kpi2Label}</p>
          <div className="flex items-baseline gap-1 mt-0.5">
            <span className="text-2xl font-jakarta font-bold text-cyan-600">{kpi2Value !== null && kpi2Value !== undefined ? `${kpi2Value}%` : '—'}</span>
          </div>
        </div>
      </div>
      {/* Dual-axis chart */}
      <div className="px-4 pb-4">
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={chartData} margin={{ top: 15, right: 50, left: -10, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
            <XAxis dataKey="mes" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
            <YAxis yAxisId="left" tick={{ fontSize: 9 }} axisLine={false} tickLine={false} domain={[0, 'auto']} />
            <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 9 }} axisLine={false} tickLine={false} domain={[70, 100]} unit="%" />
            <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #e5e7eb' }} />
            <Legend wrapperStyle={{ fontSize: 10 }} iconType="square" />
            <Line
              yAxisId="left"
              type="monotone"
              dataKey={line1Key}
              name={line1Name}
              stroke="#ef4444"
              strokeWidth={2}
              dot={<LabeledDot />}
              connectNulls={false}
            />
            <Line
              yAxisId="right"
              type="monotone"
              dataKey={line2Key}
              name={line2Name}
              stroke="#9ca3af"
              strokeWidth={1.5}
              strokeDasharray="5 4"
              dot={{ r: 3, fill: '#9ca3af' }}
              connectNulls={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

const NR32_SERIES = [
  { label: 'Adornos',          color: '#1e3a5f' },
  { label: 'Cabelo Solto',     color: '#22c55e' },
  { label: 'Sem Jaleco',       color: '#f59e0b' },
  { label: 'Unhas c/ Relevo',  color: '#ef4444' },
  { label: 'Unhas >2mm',       color: '#8b5cf6' },
  { label: 'Unhas Postiças',   color: '#ec4899' },
];

export default function IrasCard({ ano, mes, indicadores, lancamentos, setorId, indicadoresNr32 = [], moduloId }) {
  const [mesSelecionado, setMesSelecionado] = useState(mes);

  const getLanc = (indicadorId, m) =>
    lancamentos.find(l =>
      l.indicador_id === indicadorId &&
      l.mes === m &&
      (!setorId || l.setor_id === setorId)
    );

  const getVal = (ind, m) => ind ? getLanc(ind.id, m)?.valor ?? null : null;

  // Find indicators by label
  const indDens    = indicadores.find(i => i.label === 'Densidade IRAS');
  const indPAVInc  = indicadores.find(i => i.label === 'Incidência PAV');
  const indTaxaVM  = indicadores.find(i => i.label === 'Taxa VM (%)');
  const indICSInc  = indicadores.find(i => i.label === 'Incidência ICS');
  const indTaxaCVC = indicadores.find(i => i.label === 'Taxa CVC (%)');
  const indITUInc  = indicadores.find(i => i.label === 'Incidência ITU');
  const indTaxaCVD = indicadores.find(i => i.label === 'Taxa CVD (%)');

  // Higiene das mãos
  const indMedAval  = indicadores.find(i => i.label === 'HM Medicina Aval.');
  const indMedAdes  = indicadores.find(i => i.label === 'HM Medicina Ades.');
  const indEnfAval  = indicadores.find(i => i.label === 'HM Enfermagem Aval.');
  const indEnfAdes  = indicadores.find(i => i.label === 'HM Enfermagem Ades.');
  const indFisAval  = indicadores.find(i => i.label === 'HM Fisioterapia Aval.');
  const indFisAdes  = indicadores.find(i => i.label === 'HM Fisioterapia Ades.');

  // Density chart data
  const densData = MESES_CURTO.map((label, i) => ({
    mes: label,
    densidade: getVal(indDens, i + 1),
  }));

  // PAV chart data
  const pavData = MESES_CURTO.map((label, i) => ({
    mes: label,
    incPAV: getVal(indPAVInc, i + 1),
    taxaVM: getVal(indTaxaVM, i + 1),
  }));

  // ICS chart data
  const icsData = MESES_CURTO.map((label, i) => ({
    mes: label,
    incICS: getVal(indICSInc, i + 1),
    taxaCVC: getVal(indTaxaCVC, i + 1),
  }));

  // ITU chart data
  const ituData = MESES_CURTO.map((label, i) => ({
    mes: label,
    incITU: getVal(indITUInc, i + 1),
    taxaCVD: getVal(indTaxaCVD, i + 1),
  }));

  // Higiene line chart data
  const higieneData = MESES_CURTO.map((label, i) => ({
    mes: label,
    medicina:    getVal(indMedAdes,  i + 1),
    enfermagem:  getVal(indEnfAdes,  i + 1),
    fisioterapia: getVal(indFisAdes, i + 1),
  }));

  // Current month KPIs
  const pavAtual  = getVal(indPAVInc, mesSelecionado);
  const vmAtual   = getVal(indTaxaVM, mesSelecionado);
  const icsAtual  = getVal(indICSInc, mesSelecionado);
  const cvcAtual  = getVal(indTaxaCVC, mesSelecionado);
  const ituAtual  = getVal(indITUInc, mesSelecionado);
  const cvdAtual  = getVal(indTaxaCVD, mesSelecionado);

  const medAvalAtual = getVal(indMedAval, mesSelecionado);
  const medAdesAtual = getVal(indMedAdes, mesSelecionado);
  const enfAvalAtual = getVal(indEnfAval, mesSelecionado);
  const enfAdesAtual = getVal(indEnfAdes, mesSelecionado);
  const fisAvalAtual = getVal(indFisAval, mesSelecionado);
  const fisAdesAtual = getVal(indFisAdes, mesSelecionado);

  return (
    <div className="bg-white rounded-xl border border-border shadow-sm overflow-hidden" data-modulo-id={moduloId}>
      {/* Header */}
      <div className="flex items-center justify-between px-5 pt-4 pb-3 flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-purple-500" />
            <span className="font-jakarta font-bold text-base">IRAS — Infecções</span>
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

      <div className="px-5 pb-5 space-y-5">
        {/* SECTION 1: Densidade Geral */}
        <div>
          <p className="text-xs font-bold text-primary uppercase tracking-wide mb-2 flex items-center gap-1">
            <span>🦠</span> Densidade Geral de IRAS
          </p>
          <ResponsiveContainer width="100%" height={180}>
            <AreaChart data={densData} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
              <defs>
                <linearGradient id="irasGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#8b5cf6" stopOpacity={0.18} />
                  <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0.01} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
              <XAxis dataKey="mes" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #e5e7eb' }} formatter={(v) => [v, 'Densidade IRAS']} />
              <Legend wrapperStyle={{ fontSize: 10 }} />
              <Area type="monotone" dataKey="densidade" name="Densidade IRAS" stroke="#8b5cf6" strokeWidth={2} fill="url(#irasGrad)" dot={{ r: 3, fill: '#8b5cf6', strokeWidth: 0 }} connectNulls={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* SECTION 2: Infecções por Dispositivo */}
        <div>
          <p className="text-xs font-bold text-primary uppercase tracking-wide mb-3 flex items-center gap-1">
            <span>🔌</span> Infecções por Dispositivo
          </p>

          <DeviceSection
            title="PAV — Pneumonia Associada à VM"
            kpi1Label="Incidência PAV"
            kpi1Value={pavAtual}
            kpi2Label="Taxa VM (%)"
            kpi2Value={vmAtual}
            chartData={pavData}
            line1Key="incPAV"
            line1Name="Incidência PAV"
            line2Key="taxaVM"
            line2Name="Taxa VM (%)"
          />

          <DeviceSection
            title="ICS — Infecção Corrente Sanguínea"
            kpi1Label="Incidência ICS"
            kpi1Value={icsAtual}
            kpi2Label="Taxa CVC (%)"
            kpi2Value={cvcAtual}
            chartData={icsData}
            line1Key="incICS"
            line1Name="Incidência ICS"
            line2Key="taxaCVC"
            line2Name="Taxa CVC (%)"
          />

          <DeviceSection
            title="ITU — Infecção do Trato Urinário"
            kpi1Label="Incidência ITU"
            kpi1Value={ituAtual}
            kpi2Label="Taxa CVD (%)"
            kpi2Value={cvdAtual}
            chartData={ituData}
            line1Key="incITU"
            line1Name="Incidência ITU"
            line2Key="taxaCVD"
            line2Name="Taxa CVD (%)"
          />
        </div>

        {/* SECTION 3: Higiene das Mãos */}
        <div>
          <p className="text-xs font-bold text-primary uppercase tracking-wide mb-3 flex items-center gap-1">
            <span>🖐</span> Higiene das Mãos
          </p>
          {/* KPI row */}
          <div className="grid grid-cols-3 gap-3 mb-3">
            {[
              { label: 'Medicina',    aval: medAvalAtual, ades: medAdesAtual,  color: '#3b82f6' },
              { label: 'Enfermagem', aval: enfAvalAtual, ades: enfAdesAtual,  color: '#22c55e' },
              { label: 'Fisioterapia', aval: fisAvalAtual, ades: fisAdesAtual, color: '#f97316' },
            ].map(({ label, aval, ades, color }) => (
              <div key={label} className="border border-gray-100 rounded-xl px-4 py-3">
                <p className="text-xs font-bold mb-1" style={{ color }}>{label}</p>
                <div className="flex gap-4">
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase">Avaliações</p>
                    <p className="text-lg font-jakarta font-bold text-foreground">{aval ?? '—'}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase">Adesão</p>
                    <p className="text-lg font-jakarta font-bold" style={{ color }}>{ades !== null && ades !== undefined ? `${ades}%` : '—'}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
          {/* Higiene line chart */}
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={higieneData} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
              <XAxis dataKey="mes" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10 }} axisLine={false} tickLine={false} unit="%" domain={[60, 100]} />
              <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #e5e7eb' }} formatter={(v) => [`${v}%`]} />
              <Legend wrapperStyle={{ fontSize: 10 }} />
              <Line type="monotone" dataKey="medicina"    name="Medicina"     stroke="#3b82f6" strokeWidth={2} dot={{ r: 3, fill: '#3b82f6' }} connectNulls={false} />
              <Line type="monotone" dataKey="enfermagem"  name="Enfermagem"   stroke="#22c55e" strokeWidth={2} dot={{ r: 3, fill: '#22c55e' }} connectNulls={false} />
              <Line type="monotone" dataKey="fisioterapia" name="Fisioterapia" stroke="#f97316" strokeWidth={2} dot={{ r: 3, fill: '#f97316' }} connectNulls={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* SECTION 4: NR32 */}
        {indicadoresNr32.length > 0 && (() => {
          const nr32Inds = [...indicadoresNr32].sort((a, b) => (a.ordem || 0) - (b.ordem || 0));
          const nr32ChartData = MESES_CURTO.map((label, i) => {
            const row = { mes: label };
            nr32Inds.forEach(ind => {
              const key = ind.label || ind.nome;
              const lanc = lancamentos.find(l =>
                l.indicador_id === ind.id && l.mes === i + 1 && (!setorId || l.setor_id === setorId)
              );
              row[key] = lanc?.valor ?? null;
            });
            return row;
          });

          return (
            <div>
              <p className="text-xs font-bold text-primary uppercase tracking-wide mb-3 flex items-center gap-1">
                <span>🦺</span> NR32 — Conformidade
              </p>
              {/* KPI row */}
              <div className="flex flex-wrap gap-3 mb-3">
                {nr32Inds.map((ind, idx) => {
                  const lanc = lancamentos.find(l =>
                    l.indicador_id === ind.id && l.mes === mesSelecionado && (!setorId || l.setor_id === setorId)
                  );
                  const serie = NR32_SERIES.find(s => s.label === (ind.label || ind.nome)) || NR32_SERIES[idx % NR32_SERIES.length];
                  return (
                    <div key={ind.id} className="flex-1 min-w-[100px] border rounded-lg px-3 py-2" style={{ borderColor: serie.color + '55' }}>
                      <p className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: serie.color }}>
                        {ind.label || ind.nome}
                      </p>
                      <p className="text-xl font-jakarta font-bold text-foreground mt-0.5">
                        {lanc?.valor !== undefined && lanc?.valor !== null ? `${lanc.valor}%` : '—'}
                      </p>
                    </div>
                  );
                })}
              </div>
              {/* NR32 line chart */}
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={nr32ChartData} margin={{ top: 10, right: 10, left: -10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                  <XAxis dataKey="mes" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10 }} axisLine={false} tickLine={false} unit="%" domain={[60, 100]} />
                  <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #e5e7eb' }} formatter={(v, name) => [v !== null ? `${v}%` : '—', name]} />
                  <Legend wrapperStyle={{ fontSize: 10 }} />
                  {nr32Inds.map((ind, idx) => {
                    const key = ind.label || ind.nome;
                    const serie = NR32_SERIES.find(s => s.label === key) || NR32_SERIES[idx % NR32_SERIES.length];
                    return (
                      <Line key={ind.id} type="monotone" dataKey={key} name={key} stroke={serie.color} strokeWidth={2} dot={{ r: 3, fill: serie.color, strokeWidth: 0 }} connectNulls={false} />
                    );
                  })}
                </LineChart>
              </ResponsiveContainer>
            </div>
          );
        })()}
      </div>
    </div>
  );
}