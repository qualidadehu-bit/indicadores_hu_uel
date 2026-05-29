import { useEffect, useState } from 'react';
import { Shield } from 'lucide-react';
import { MESES } from '@/lib/indicadores';
import {
  RadarQualidadeChartWithLegend,
  RadarQualidadeHistoricoTable,
} from '@/components/dashboard/RadarQualidadeUi';
import { effectiveRadarFaixas } from '@/lib/radarFaixas';
import { pickLancamentoMes } from '@/lib/lancamentosDashboard';

export default function MispCard({ ano, mes, indicadores, lancamentos, setorId, moduloId, modulo, getLancamento }) {
  const [mesSelecionado, setMesSelecionado] = useState(mes);
  useEffect(() => {
    setMesSelecionado(mes);
  }, [mes]);

  const getLanc = (indicadorId, m) =>
    getLancamento ? getLancamento(indicadorId, setorId, m) : pickLancamentoMes(lancamentos, indicadorId, m, setorId);

  const inds = [...indicadores].sort((a, b) => (a.ordem || 0) - (b.ordem || 0));
  const faixas = effectiveRadarFaixas(null, modulo, inds);

  const radarData = inds.map((ind) => {
    const lanc = getLanc(ind.id, mesSelecionado);
    return {
      subject: ind.label || ind.nome,
      value: lanc?.valor ?? null,
      fullMark: 100,
    };
  });

  const tableData = inds.map((ind) => ({
    nome: ind.label || ind.nome,
    valores: MESES.map((_, i) => {
      const lanc = getLanc(ind.id, i + 1);
      return lanc?.valor ?? null;
    }),
  }));

  return (
    <div className="bg-white rounded-xl border border-border shadow-sm overflow-hidden" data-modulo-id={moduloId}>
      <div className="flex items-center justify-between px-5 pt-4 pb-2 flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-orange-500" />
            <span className="font-jakarta font-bold text-base">Indicadores de Qualidade — MISP</span>
          </div>
          <p className="text-xs text-primary font-medium mt-0.5">
            Histórico {ano} · Mês ativo: <span className="capitalize">{MESES[mesSelecionado - 1]}</span>
          </p>
        </div>
        <div className="flex flex-wrap gap-1">
          {MESES.map((m, i) => (
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

      <div className="px-5 pb-1">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          📡 Radar · {MESES[mesSelecionado - 1].toUpperCase()}/{ano}
        </p>
      </div>

      <div className="px-5 pb-4">
        <RadarQualidadeChartWithLegend radarData={radarData} faixas={faixas} />
      </div>

      <div className="px-5 pb-5">
        <RadarQualidadeHistoricoTable tableData={tableData} mesAtivo={mesSelecionado} faixas={faixas} />
      </div>
    </div>
  );
}
