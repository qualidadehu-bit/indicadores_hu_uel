import { useState } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts';
import { BarChart2 } from 'lucide-react';
const MESES_CURTO = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];

// IDs fixos dos indicadores de produção
const ID_OCUPACAO = '6a01c0f63bea98ba3556cc44';
const ID_PERMANENCIA = '6a01c0f63bea98ba3556cc45';

export default function ProducaoCard({ ano, mes, indicadores, lancamentos, metas, setorId, moduloId }) {
  const [mesSelecionado, setMesSelecionado] = useState(mes);

  // Encontra o indicador de Giro de Leito dinamicamente
  const indGiro = indicadores.find(i => i.nome === 'Giro de Leito');
  const ID_GIRO = indGiro?.id;

  const getLanc = (indicadorId, m, setorIdParam) => {
    return lancamentos.find(l =>
      l.indicador_id === indicadorId &&
      l.mes === m &&
      (!setorIdParam || l.setor_id === setorIdParam)
    );
  };

  const getMeta = (indicadorId, sid) => {
    if (!sid) return undefined;
    return metas.find(m => m.indicador_id === indicadorId && m.setor_id === sid && m.ano === ano);
  };

  // Valor do mês selecionado
  const lancOcup = getLanc(ID_OCUPACAO, mesSelecionado, setorId);
  const lancPerm = getLanc(ID_PERMANENCIA, mesSelecionado, setorId);
  const lancGiro = ID_GIRO ? getLanc(ID_GIRO, mesSelecionado, setorId) : null;

  const metaOcup = getMeta(ID_OCUPACAO, setorId);
  const metaPerm = getMeta(ID_PERMANENCIA, setorId);
  const metaGiro = ID_GIRO ? getMeta(ID_GIRO, setorId) : null;

  // Status de ocupação
  const ocupacaoStatus = lancOcup?.valor >= 90 ? 'alta' : lancOcup?.valor >= 80 ? 'media' : 'normal';

  // Dados do gráfico anual
  const chartData = MESES_CURTO.map((label, i) => {
    const m = i + 1;
    const o = getLanc(ID_OCUPACAO, m, setorId);
    const p = getLanc(ID_PERMANENCIA, m, setorId);
    const g = ID_GIRO ? getLanc(ID_GIRO, m, setorId) : null;
    return {
      mes: label,
      ocupacao: o?.valor ?? null,
      permanencia: p?.valor ?? null,
      giro: g?.valor ?? null,
    };
  });

  const CustomTooltip = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null;
    return (
      <div className="bg-white border border-gray-200 rounded-lg shadow-lg p-3 text-xs">
        <p className="font-semibold mb-1">{label}</p>
        {payload.map(p => (
          <p key={p.dataKey} style={{ color: p.color }}>
            {p.name}: {p.value !== null ? p.value : '—'}
          </p>
        ))}
      </div>
    );
  };

  return (
    <div className="bg-white rounded-xl border border-border shadow-sm overflow-hidden" data-modulo-id={moduloId}>
      {/* Header */}
      <div className="flex items-center justify-between px-5 pt-4 pb-2 flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-2">
            <BarChart2 className="w-4 h-4 text-primary" />
            <span className="font-jakarta font-bold text-base">Dados de Produção</span>
          </div>
          <p className="text-xs text-primary font-medium mt-0.5">
            Histórico {ano} · Mês ativo: {MESES_CURTO[mesSelecionado - 1]}
          </p>
        </div>
        {/* Month selector pills */}
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

      {/* KPI Row */}
      <div className="grid grid-cols-3 gap-0 border-t border-b border-border mx-5 my-3 rounded-lg overflow-hidden">
        {/* Ocupação */}
        <div className="p-4 border-r border-border" style={{ borderLeft: '3px solid #ef4444' }}>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Taxa de Ocupação</p>
          <div className="flex items-baseline gap-1 mt-1">
            <span className="text-3xl font-jakarta font-bold">{lancOcup?.valor ?? '—'}</span>
            <span className="text-sm text-muted-foreground">%</span>
          </div>
          {lancOcup?.valor !== undefined && (
            <span className={`inline-flex items-center gap-1 text-xs mt-2 px-2 py-0.5 rounded-full border font-medium ${
              ocupacaoStatus === 'alta'
                ? 'bg-red-50 text-red-600 border-red-200'
                : ocupacaoStatus === 'media'
                ? 'bg-amber-50 text-amber-600 border-amber-200'
                : 'bg-green-50 text-green-600 border-green-200'
            }`}>
              {ocupacaoStatus === 'alta' ? '⚠ Alta ocupação' : ocupacaoStatus === 'media' ? '~ Ocupação média' : '✓ Ocupação normal'}
            </span>
          )}
        </div>

        {/* Permanência */}
        <div className="p-4 border-r border-border" style={{ borderLeft: '3px solid #06b6d4' }}>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Média de Permanência</p>
          <div className="flex items-baseline gap-1 mt-1">
            <span className="text-3xl font-jakarta font-bold">{lancPerm?.valor ?? '—'}</span>
            <span className="text-sm text-muted-foreground">dias</span>
          </div>
          {metaPerm?.valor && (
            <p className="text-xs text-muted-foreground mt-2">Meta: {metaPerm.valor} dias</p>
          )}
        </div>

        {/* Giro de Leito */}
        <div className="p-4" style={{ borderLeft: '3px solid #10b981' }}>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Giro de Leito</p>
          <div className="flex items-baseline gap-1 mt-1">
            <span className="text-3xl font-jakarta font-bold">{lancGiro?.valor ?? '—'}</span>
            <span className="text-sm text-muted-foreground">pac/leito</span>
          </div>
          {metaGiro?.valor && (
            <p className="text-xs text-muted-foreground mt-2">Meta: {metaGiro.valor}</p>
          )}
        </div>
      </div>

      {/* Chart */}
      <div className="px-5 pb-5">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
          📈 Linha Histórica — {ano}
        </p>
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={chartData} margin={{ top: 5, right: 30, left: -10, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
            <YAxis yAxisId="left" tick={{ fontSize: 10 }} unit="%" domain={[0, 100]} />
            <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10 }} />
            <Tooltip content={<CustomTooltip />} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Line
              yAxisId="left"
              type="monotone"
              dataKey="ocupacao"
              name="Taxa de Ocupação (%)"
              stroke="#1e3a5f"
              strokeWidth={2}
              dot={{ r: 3, fill: '#1e3a5f' }}
              connectNulls={false}
            />
            <Line
              yAxisId="right"
              type="monotone"
              dataKey="permanencia"
              name="Média de Permanência (dias)"
              stroke="#06b6d4"
              strokeWidth={2}
              dot={{ r: 3, fill: '#06b6d4' }}
              connectNulls={false}
            />
            {ID_GIRO && (
              <Line
                yAxisId="right"
                type="monotone"
                dataKey="giro"
                name="Giro de Leito (pac/leito)"
                stroke="#10b981"
                strokeWidth={2}
                dot={{ r: 3, fill: '#10b981' }}
                connectNulls={false}
              />
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}