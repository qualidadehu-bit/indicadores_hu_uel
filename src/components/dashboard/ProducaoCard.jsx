import { useState, useMemo } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts';
import { BarChart2 } from 'lucide-react';

const MESES_CURTO = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];

function stripAccents(s) {
  return String(s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

function nomeNormado(ind) {
  const n = stripAccents(ind.nome || '').toLowerCase();
  const l = stripAccents(ind.label || '').toLowerCase();
  return { n, l };
}

/** Resolve indicador do módulo por nome/label cadastrados (sem IDs fixos legados). */
function findIndicadorProducao(indsModulo, candidatos) {
  for (const nomeCanon of candidatos) {
    const target = stripAccents(nomeCanon).toLowerCase();
    const exato = indsModulo.find((ind) => {
      const { n, l } = nomeNormado(ind);
      return n === target || l === target;
    });
    if (exato) return exato;
  }
  for (const nomeCanon of candidatos) {
    const target = stripAccents(nomeCanon).toLowerCase();
    const parcial = indsModulo.find((ind) => {
      const { n, l } = nomeNormado(ind);
      return (n && n.includes(target)) || (l && l.includes(target));
    });
    if (parcial) return parcial;
  }
  return undefined;
}

const CANDIDATOS_OCUPACAO = ['Taxa de Ocupação', 'Taxa de Ocupacao', 'Ocupação', 'Ocupacao'];
const CANDIDATOS_PERMANENCIA = ['Média de Permanência', 'Media de Permanencia', 'Permanência Média', 'Permanencia Media', 'Permanência', 'Permanencia'];
const CANDIDATOS_GIRO = ['Giro de Leito', 'Giro de leito'];

export default function ProducaoCard({ ano, mes, indicadores, lancamentos, metas, setorId, moduloId }) {
  const [mesSelecionado, setMesSelecionado] = useState(mes);

  const indsModulo = useMemo(
    () => indicadores.filter((i) => i.modulo_id === moduloId).sort((a, b) => (a.ordem || 0) - (b.ordem || 0)),
    [indicadores, moduloId]
  );

  const { idOcup, idPerm, idGiro } = useMemo(() => {
    const indOcup = findIndicadorProducao(indsModulo, CANDIDATOS_OCUPACAO);
    const indPerm = findIndicadorProducao(indsModulo, CANDIDATOS_PERMANENCIA);
    const indGiro = findIndicadorProducao(indsModulo, CANDIDATOS_GIRO);
    return {
      idOcup: indOcup?.id,
      idPerm: indPerm?.id,
      idGiro: indGiro?.id,
    };
  }, [indsModulo]);

  const getLanc = (indicadorId, m, setorIdParam) => {
    if (!indicadorId) return undefined;
    return lancamentos.find(l =>
      l.indicador_id === indicadorId &&
      l.mes === m &&
      (!setorIdParam || l.setor_id === setorIdParam)
    );
  };

  const getMeta = (indicadorId, sid) => {
    if (!sid || !indicadorId) return undefined;
    return metas.find(m => m.indicador_id === indicadorId && m.setor_id === sid && m.ano === ano);
  };

  const lancOcup = getLanc(idOcup, mesSelecionado, setorId);
  const lancPerm = getLanc(idPerm, mesSelecionado, setorId);
  const lancGiro = getLanc(idGiro, mesSelecionado, setorId);

  const metaOcup = getMeta(idOcup, setorId);
  const metaPerm = getMeta(idPerm, setorId);
  const metaGiro = getMeta(idGiro, setorId);

  const ocupacaoStatus = lancOcup?.valor >= 90 ? 'alta' : lancOcup?.valor >= 80 ? 'media' : 'normal';

  const chartData = MESES_CURTO.map((label, i) => {
    const m = i + 1;
    const o = getLanc(idOcup, m, setorId);
    const p = getLanc(idPerm, m, setorId);
    const g = getLanc(idGiro, m, setorId);
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

  const avisoResolucao =
    !idOcup || !idPerm || !idGiro ? (
      <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-3 py-2 mx-5 mb-2">
        {!idOcup ? 'Não foi encontrado indicador de Taxa de Ocupação neste módulo. ' : ''}
        {!idPerm ? 'Não foi encontrado indicador de Média de Permanência neste módulo. ' : ''}
        {!idGiro ? 'Não foi encontrado indicador de Giro de Leito neste módulo. ' : ''}
        Confira os nomes ou rótulos na configuração.
      </p>
    ) : null;

  return (
    <div className="bg-white rounded-xl border border-border shadow-sm overflow-hidden" data-modulo-id={moduloId}>
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
        <div className="flex flex-wrap gap-1">
          {MESES_CURTO.map((m, i) => (
            <button
              key={m}
              type="button"
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

      {avisoResolucao}

      <div className="grid grid-cols-3 gap-0 border-t border-b border-border mx-5 my-3 rounded-lg overflow-hidden">
        <div className="p-4 border-r border-border" style={{ borderLeft: '3px solid #ef4444' }}>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Taxa de Ocupação</p>
          <div className="flex items-baseline gap-1 mt-1">
            <span className="text-3xl font-jakarta font-bold">{lancOcup?.valor ?? '—'}</span>
            <span className="text-sm text-muted-foreground">%</span>
          </div>
          {metaOcup?.valor != null && (
            <p className="text-xs text-muted-foreground mt-2">Meta: {metaOcup.valor}%</p>
          )}
          {lancOcup?.valor !== undefined && lancOcup?.valor !== null && (
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

        <div className="p-4 border-r border-border" style={{ borderLeft: '3px solid #06b6d4' }}>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Média de Permanência</p>
          <div className="flex items-baseline gap-1 mt-1">
            <span className="text-3xl font-jakarta font-bold">{lancPerm?.valor ?? '—'}</span>
            <span className="text-sm text-muted-foreground">dias</span>
          </div>
          {metaPerm?.valor != null && (
            <p className="text-xs text-muted-foreground mt-2">Meta: {metaPerm.valor} dias</p>
          )}
        </div>

        <div className="p-4" style={{ borderLeft: '3px solid #10b981' }}>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Giro de Leito</p>
          <div className="flex items-baseline gap-1 mt-1">
            <span className="text-3xl font-jakarta font-bold">{lancGiro?.valor ?? '—'}</span>
            <span className="text-sm text-muted-foreground">pac/leito</span>
          </div>
          {metaGiro?.valor != null && (
            <p className="text-xs text-muted-foreground mt-2">Meta: {metaGiro.valor}</p>
          )}
        </div>
      </div>

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
            <Tooltip content={CustomTooltip} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            {idOcup && (
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
            )}
            {idPerm && (
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
            )}
            {idGiro && (
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
