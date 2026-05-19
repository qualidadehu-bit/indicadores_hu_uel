import { useState, useMemo, useEffect } from 'react';
import { api } from '@/api/apiClient';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeftRight, FileDown, Loader2 } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import BadgeTendencia from '@/components/BadgeTendencia';
import BadgeStatusMeta from '@/components/BadgeStatusMeta';
import { MESES, MESES_COMPLETO, calcularStatusMeta, calcularTendencia, buildAnosDisponiveis } from '@/lib/indicadores';
import { jsPDF } from 'jspdf';
import { filtrarIndicadoresPorDivisao, filtrarIndicadoresPorSetorWhitelist, indicadorPermitidoParaSetor } from '@/lib/indicadorDivisao';
import { useAuth } from '@/lib/AuthContext';
import { getSetoresVisiveisParaUsuario } from '@/lib/gestorSession';
import { drawPdfCover, loadPdfCoverAssets } from '@/lib/pdfCover';

/**
 * @typedef {Object} SetorEntity
 * @property {string|number} id
 * @property {string} [nome]
 * @property {string} [divisao]
 */

/**
 * @typedef {Object} IndicadorEntity
 * @property {string|number} id
 * @property {string|number} [modulo_id]
 * @property {number} [ordem]
 * @property {string} [label]
 * @property {string} [nome]
 * @property {string} [unidade]
 * @property {string} [tipo_direcao_meta]
 * @property {string} [divisoes]
 */

/**
 * @typedef {Object} ModuloEntity
 * @property {string|number} id
 * @property {string} [nome]
 */

const ANOS = buildAnosDisponiveis();

const PDF_THEME = {
  primary: [27, 120, 27],
  primaryText: [255, 255, 255],
  secondaryText: [212, 245, 212],
  mutedText: [165, 225, 165],
  tableHeaderBg: [232, 245, 232],
  tableHeaderText: [25, 90, 25],
  rowBg: [248, 253, 248],
};

/** Evita spread de `number[]` em APIs jsPDF (TS2556 em checkJs). */
function pdfSetFillRgb(doc, rgb) {
  doc.setFillColor(rgb[0], rgb[1], rgb[2]);
}
function pdfSetTextRgb(doc, rgb) {
  doc.setTextColor(rgb[0], rgb[1], rgb[2]);
}

function calcStatus(valor, metaVal, direcao) {
  if (valor === null || valor === undefined || metaVal === null || metaVal === undefined) {
    return valor !== null && valor !== undefined ? 'Sem meta' : 'Sem dados';
  }
  const diff = valor - metaVal;
  if (direcao === 'MAIOR_E_MELHOR') {
    if (diff >= 0) return 'OK';
    if (diff >= -metaVal * 0.1) return 'Atenção';
    return 'Crítico';
  } else {
    if (diff <= 0) return 'OK';
    if (diff <= metaVal * 0.1) return 'Atenção';
    return 'Crítico';
  }
}

function statusColor(s) {
  if (s === 'OK') return [34, 139, 34];
  if (s === 'Atenção') return [210, 140, 0];
  if (s === 'Crítico') return [200, 0, 0];
  return [140, 140, 140];
}

/** Média aritmética dos lançamentos do indicador nos setores listados (ignora ausentes). */
function mediaValoresLancamentoPorSetores(lancamentos, indicadorId, setorIds) {
  if (!setorIds?.length || !lancamentos?.length) return null;
  const nums = setorIds
    .map((sid) =>
      lancamentos.find(
        (l) => l.indicador_id === indicadorId && String(l.setor_id) === String(sid)
      )?.valor
    )
    .filter((v) => v !== null && v !== undefined && !Number.isNaN(Number(v)));
  if (!nums.length) return null;
  return nums.reduce((a, b) => a + Number(b), 0) / nums.length;
}

/** Média aritmética das metas do indicador nos setores (ano da meta B na comparação). */
function mediaValoresMetaPorSetores(metas, indicadorId, setorIds, anoMeta) {
  if (!setorIds?.length || !metas?.length) return null;
  const nums = setorIds
    .map((sid) =>
      metas.find(
        (m) =>
          m.indicador_id === indicadorId &&
          String(m.setor_id) === String(sid) &&
          Number(m.ano) === Number(anoMeta)
      )?.valor
    )
    .filter((v) => v !== null && v !== undefined && !Number.isNaN(Number(v)));
  if (!nums.length) return null;
  return nums.reduce((a, b) => a + Number(b), 0) / nums.length;
}

function formatValorCelula(v, usarDecimais) {
  if (v === null || v === undefined || Number.isNaN(Number(v))) return '—';
  const n = Number(v);
  if (!usarDecimais) return String(n);
  return n.toLocaleString('pt-BR', { maximumFractionDigits: 2, minimumFractionDigits: 0 });
}

async function gerarPDFComparacao({
  modulos,
  indicadores,
  lancamentosA,
  lancamentosB,
  metas,
  labelA,
  labelB,
  setorId,
  anoMetaB,
  agregacao = 'setor',
  setorIdsDivisao = [],
  contextoPdf = '',
}) {
  const MAX_CONTENT_PAGES = 2;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const margin = 14;
  const innerW = 182;
  const bottomY = 276;
  let y = 0;
  let truncated = false;
  let globalRow = 0;
  const ehMediaDivisao = agregacao === 'divisao' && setorIdsDivisao.length > 0;

  const getValor = (lancamentos, indicadorId) => {
    if (ehMediaDivisao) {
      return mediaValoresLancamentoPorSetores(lancamentos, indicadorId, setorIdsDivisao);
    }
    return (
      lancamentos.find(
        (l) => l.indicador_id === indicadorId && String(l.setor_id) === String(setorId)
      )?.valor ?? null
    );
  };
  const getMeta = (indicadorId) => {
    if (ehMediaDivisao) {
      const m = mediaValoresMetaPorSetores(metas, indicadorId, setorIdsDivisao, anoMetaB);
      return m !== null ? { valor: m } : undefined;
    }
    return metas.find(
      (m) =>
        m.indicador_id === indicadorId &&
        String(m.setor_id) === String(setorId) &&
        Number(m.ano) === Number(anoMetaB)
    );
  };

  function drawCover() {
    drawPdfCover(doc, {
      title: 'Comparação de períodos',
      subtitle: `${labelA} × ${labelB}`,
      details: contextoPdf,
      generatedAt: `Gerado em ${new Date().toLocaleDateString('pt-BR')} às ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`,
      theme: PDF_THEME,
      assets: coverAssets,
    });
  }

  function drawBannerFirstPage() {
    pdfSetFillRgb(doc, PDF_THEME.primary);
    doc.rect(0, 0, 210, 28, 'F');
    doc.setFontSize(13);
    doc.setFont('helvetica', 'bold');
    pdfSetTextRgb(doc, PDF_THEME.primaryText);
    doc.text('Comparação de períodos', margin, 11);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    pdfSetTextRgb(doc, PDF_THEME.secondaryText);
    doc.text(`${labelA}  ×  ${labelB}`, margin, 18);
    let yMuted = 24;
    if (contextoPdf) {
      doc.setFontSize(6.5);
      pdfSetTextRgb(doc, PDF_THEME.secondaryText);
      doc.text(contextoPdf, margin, 22.5);
      yMuted = 27;
    }
    doc.setFontSize(6.5);
    pdfSetTextRgb(doc, PDF_THEME.mutedText);
    doc.text(
      `Gerado em ${new Date().toLocaleDateString('pt-BR')} ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`,
      margin,
      yMuted
    );
    y = yMuted + 8;
  }

  function drawBannerContinuation() {
    pdfSetFillRgb(doc, PDF_THEME.primary);
    doc.rect(0, 0, 210, 14, 'F');
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    pdfSetTextRgb(doc, PDF_THEME.primaryText);
    doc.text('Comparação (continuação)', margin, 9);
    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    pdfSetTextRgb(doc, PDF_THEME.secondaryText);
    doc.text(`${labelA} × ${labelB}`, margin, 13);
    y = 18;
  }

  /** Garante altura h na página atual ou passa para a 2.ª folha de conteúdo. */
  function ensureSpace(h) {
    if (y + h <= bottomY) return true;
    if (doc.getNumberOfPages() >= MAX_CONTENT_PAGES + 1) {
      truncated = true;
      return false;
    }
    doc.addPage();
    drawBannerContinuation();
    if (y + h <= bottomY) return true;
    truncated = true;
    return false;
  }

  const coverAssets = await loadPdfCoverAssets();
  drawCover();
  doc.addPage();
  drawBannerFirstPage();

  const modulosComInds = modulos
    .map((mod) => ({
      mod,
      inds: indicadores.filter((i) => i.modulo_id === mod.id).sort((a, b) => (a.ordem || 0) - (b.ordem || 0)),
    }))
    .filter(({ inds }) => inds.length > 0);

  const shortLabel = (s, max = 12) => {
    const t = String(s || '');
    return t.length <= max ? t : `${t.slice(0, max - 1)}…`;
  };

  let stopPdf = false;
  for (const { mod, inds } of modulosComInds) {
    if (stopPdf) break;

    const titleBlock = 8;
    if (!ensureSpace(titleBlock + 10)) {
      stopPdf = true;
      break;
    }

    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    pdfSetTextRgb(doc, PDF_THEME.primary);
    doc.text(String(mod.nome || 'Módulo'), margin, y);
    y += titleBlock;

    const th = 6;
    if (!ensureSpace(th + 1)) {
      stopPdf = true;
      break;
    }
    doc.setFontSize(6.5);
    doc.setFont('helvetica', 'bold');
    pdfSetFillRgb(doc, PDF_THEME.tableHeaderBg);
    doc.rect(margin, y, innerW, th, 'F');
    pdfSetTextRgb(doc, PDF_THEME.tableHeaderText);
    doc.text('INDICADOR', margin + 2, y + 4.2);
    doc.text('UNID.', margin + 58, y + 4.2);
    doc.text(shortLabel(labelA), margin + 76, y + 4.2);
    doc.text(shortLabel(labelB), margin + 100, y + 4.2);
    doc.text('META', margin + 126, y + 4.2);
    doc.text('VAR.%', margin + 146, y + 4.2);
    doc.text('STATUS', margin + 162, y + 4.2);
    y += th + 2;

    for (const ind of inds) {
      const vA = getValor(lancamentosA, ind.id);
      const vB = getValor(lancamentosB, ind.id);
      const meta = getMeta(ind.id);
      const variacao =
        vA !== null && vB !== null && vA !== 0 ? ((vB - vA) / Math.abs(vA)) * 100 : null;
      const st = calcStatus(vB, meta?.valor, ind.tipo_direcao_meta);

      doc.setFontSize(6.5);
      const nomeLines = doc.splitTextToSize(ind.label || ind.nome, 52);
      const lineStep = 3.1;
      const rowH = Math.max(5.5, 2.5 + nomeLines.length * lineStep);

      if (!ensureSpace(rowH)) {
        stopPdf = true;
        break;
      }

      if (globalRow % 2 === 0) {
        pdfSetFillRgb(doc, PDF_THEME.rowBg);
        doc.rect(margin, y - 0.5, innerW, rowH, 'F');
      }

      doc.setFont('helvetica', 'normal');
      doc.setTextColor(40, 40, 40);
      doc.text(nomeLines, margin + 2, y + 3.2);
      doc.text(
        ehMediaDivisao ? 'méd.div.' : String(ind.unidade || '—').slice(0, 16),
        margin + 58,
        y + 3.2
      );
      doc.text(formatValorCelula(vA, ehMediaDivisao), margin + 76, y + 3.2);
      doc.text(formatValorCelula(vB, ehMediaDivisao), margin + 100, y + 3.2);
      doc.text(
        meta?.valor !== null && meta?.valor !== undefined
          ? formatValorCelula(meta.valor, ehMediaDivisao)
          : '—',
        margin + 126,
        y + 3.2
      );

      if (variacao !== null) {
        doc.setTextColor(
          variacao > 0 ? 34 : variacao < 0 ? 200 : 100,
          variacao > 0 ? 139 : variacao < 0 ? 0 : 100,
          34
        );
        doc.text(`${variacao > 0 ? '+' : ''}${variacao.toFixed(1)}%`, margin + 146, y + 3.2);
      } else {
        doc.setTextColor(150, 150, 150);
        doc.text('—', margin + 146, y + 3.2);
      }

      pdfSetTextRgb(doc, statusColor(st));
      doc.setFont('helvetica', 'bold');
      doc.text(st, margin + 162, y + 3.2);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(40, 40, 40);

      y += rowH;
      globalRow += 1;
    }

    y += 3;
  }

  if (truncated && ensureSpace(5)) {
    doc.setFontSize(6);
    doc.setFont('helvetica', 'italic');
    doc.setTextColor(140, 60, 60);
    doc.text('Conteúdo limitado a no máximo 2 páginas.', margin, y);
  }

  const total = doc.getNumberOfPages();
  const totalContentPages = total - 1;
  for (let p = 2; p <= total; p++) {
    doc.setPage(p);
    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(160, 160, 160);
    doc.text(`Pág. ${p - 1}/${totalContentPages} · ${labelA} × ${labelB}`, margin, 292);
    doc.text('Gerado automaticamente', 196, 292);
  }

  doc.save(`Comparacao_${labelA.replace(/\s+/g, '_')}_x_${labelB.replace(/\s+/g, '_')}.pdf`);
}

export default function Comparacao() {
  const [periodoA, setPeriodoA] = useState({ ano: new Date().getFullYear(), mes: new Date().getMonth() });
  const [periodoB, setPeriodoB] = useState({ ano: new Date().getFullYear(), mes: new Date().getMonth() + 1 > 12 ? 12 : new Date().getMonth() + 1 });
  const [modoAgrupamento, setModoAgrupamento] = useState('setor');
  const [setorId, setSetorId] = useState('');
  const [divisaoNome, setDivisaoNome] = useState('');
  const [moduloId, setModuloId] = useState('');
  const [pdfLoading, setPdfLoading] = useState(false);
  const { user } = useAuth();

  const { data: setores = [] } = useQuery({ queryKey: ['setores'], queryFn: () => api.entities.Setor.list() });
  const setoresVis = useMemo(
    () => /** @type {SetorEntity[]} */ (getSetoresVisiveisParaUsuario(setores, user)),
    [setores, user]
  );

  const divisoesDisponiveis = useMemo(() => {
    const nomes = setoresVis.map((s) => String(s.divisao || '').trim()).filter(Boolean);
    return [...new Set(nomes)].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }, [setoresVis]);

  const setorIdsNaDivisao = useMemo(() => {
    if (!divisaoNome) return [];
    return setoresVis
      .filter((s) => String(s.divisao || '').trim() === String(divisaoNome).trim())
      .map((s) => String(s.id));
  }, [setoresVis, divisaoNome]);

  useEffect(() => {
    if (modoAgrupamento !== 'setor') return;
    if (!setorId) {
      if (setoresVis.length === 1) setSetorId(String(setoresVis[0].id));
      return;
    }
    if (!setoresVis.some((s) => String(s.id) === String(setorId))) {
      setSetorId(setoresVis[0] ? String(setoresVis[0].id) : '');
    }
  }, [setoresVis, setorId, modoAgrupamento]);

  useEffect(() => {
    if (modoAgrupamento !== 'divisao') return;
    if (!divisoesDisponiveis.length) {
      setDivisaoNome('');
      return;
    }
    if (!divisaoNome || !divisoesDisponiveis.includes(divisaoNome)) {
      setDivisaoNome(divisoesDisponiveis[0]);
    }
  }, [modoAgrupamento, divisoesDisponiveis, divisaoNome]);

  const { data: modulos = [] } = useQuery({ queryKey: ['modulos'], queryFn: () => api.entities.Modulo.list() });
  const { data: indicadores = [] } = useQuery({
    queryKey: ['indicadores'],
    queryFn: async () => {
      const list = await api.entities.Indicador.list();
      return /** @type {IndicadorEntity[]} */ (list);
    },
  });

  const setorSelecionado = useMemo(
    () => (modoAgrupamento === 'setor' ? setoresVis.find((s) => String(s.id) === String(setorId)) : null),
    [modoAgrupamento, setoresVis, setorId]
  );
  const divisaoComparacao =
    modoAgrupamento === 'divisao'
      ? divisaoNome && String(divisaoNome).trim()
        ? String(divisaoNome).trim()
        : null
      : setorSelecionado && String(setorSelecionado.divisao || '').trim()
        ? String(setorSelecionado.divisao).trim()
        : null;
  const indicadoresAposDivisao = useMemo(
    () => /** @type {IndicadorEntity[]} */ (filtrarIndicadoresPorDivisao(indicadores, divisaoComparacao)),
    [indicadores, divisaoComparacao]
  );
  const indicadoresFiltrados = useMemo(() => {
    if (modoAgrupamento === 'setor' && setorSelecionado) {
      return /** @type {IndicadorEntity[]} */ (
        filtrarIndicadoresPorSetorWhitelist(indicadoresAposDivisao, setorSelecionado)
      );
    }
    if (modoAgrupamento === 'divisao' && setorIdsNaDivisao.length > 0) {
      return indicadoresAposDivisao.filter((ind) =>
        setorIdsNaDivisao.some((sid) => {
          const s = setoresVis.find((x) => String(x.id) === String(sid));
          return s && indicadorPermitidoParaSetor(ind, s);
        })
      );
    }
    return indicadoresAposDivisao;
  }, [modoAgrupamento, setorSelecionado, indicadoresAposDivisao, setorIdsNaDivisao, setoresVis]);

  const lancamentosSetorEnabled = modoAgrupamento === 'setor' && !!periodoA.mes && !!setorId;

  const { data: lancamentosASetor = [] } = useQuery({
    queryKey: ['lancamentos', periodoA.ano, periodoA.mes, setorId],
    queryFn: () => api.entities.Lancamento.filter({ ano: periodoA.ano, mes: periodoA.mes, setor_id: setorId }),
    enabled: lancamentosSetorEnabled,
  });
  const { data: lancamentosBSetor = [] } = useQuery({
    queryKey: ['lancamentos', periodoB.ano, periodoB.mes, setorId],
    queryFn: () => api.entities.Lancamento.filter({ ano: periodoB.ano, mes: periodoB.mes, setor_id: setorId }),
    enabled: modoAgrupamento === 'setor' && !!periodoB.mes && !!setorId,
  });

  const { data: lancamentosADiv = [] } = useQuery({
    queryKey: ['lancamentos', periodoA.ano, periodoA.mes, 'all-setores'],
    queryFn: () => api.entities.Lancamento.filter({ ano: periodoA.ano, mes: periodoA.mes }),
    enabled: modoAgrupamento === 'divisao' && !!periodoA.mes && setorIdsNaDivisao.length > 0,
  });
  const { data: lancamentosBDiv = [] } = useQuery({
    queryKey: ['lancamentos', periodoB.ano, periodoB.mes, 'all-setores'],
    queryFn: () => api.entities.Lancamento.filter({ ano: periodoB.ano, mes: periodoB.mes }),
    enabled: modoAgrupamento === 'divisao' && !!periodoB.mes && setorIdsNaDivisao.length > 0,
  });

  const lancamentosA = modoAgrupamento === 'setor' ? lancamentosASetor : lancamentosADiv;
  const lancamentosB = modoAgrupamento === 'setor' ? lancamentosBSetor : lancamentosBDiv;

  const metasEnabled =
    (modoAgrupamento === 'setor' && !!setorId) ||
    (modoAgrupamento === 'divisao' && !!divisaoNome && setorIdsNaDivisao.length > 0);

  const { data: metasA = [] } = useQuery({
    queryKey: ['metas', periodoA.ano, 'comparacao'],
    queryFn: () => api.entities.Meta.filter({ ano: periodoA.ano }),
    enabled: metasEnabled,
  });
  const { data: metasB = [] } = useQuery({
    queryKey: ['metas', periodoB.ano, 'comparacao'],
    queryFn: () => api.entities.Meta.filter({ ano: periodoB.ano }),
    enabled: metasEnabled,
  });
  const metas = [...metasA, ...metasB];

  const ehMediaDivisaoUi = modoAgrupamento === 'divisao' && setorIdsNaDivisao.length > 0;

  const getValor = (lancamentos, indicadorId) => {
    if (ehMediaDivisaoUi) {
      return mediaValoresLancamentoPorSetores(lancamentos, indicadorId, setorIdsNaDivisao);
    }
    return lancamentos.find((l) => l.indicador_id === indicadorId && l.setor_id === setorId)?.valor ?? null;
  };

  const getMeta = (indicadorId, anoMeta) => {
    if (ehMediaDivisaoUi) {
      const m = mediaValoresMetaPorSetores(metas, indicadorId, setorIdsNaDivisao, anoMeta);
      return m !== null ? { valor: m } : undefined;
    }
    return metas.find((m) => m.indicador_id === indicadorId && m.setor_id === setorId && m.ano === anoMeta);
  };

  const labelA = `${MESES_COMPLETO[periodoA.mes - 1]} / ${periodoA.ano}`;
  const labelB = `${MESES_COMPLETO[periodoB.mes - 1]} / ${periodoB.ano}`;

  const modulosFiltrados = /** @type {ModuloEntity[]} */ (
    moduloId ? modulos.filter((m) => m.id === moduloId) : modulos
  );

  const handleExportPDF = async () => {
    if (modoAgrupamento === 'setor' && !setorId) return;
    if (modoAgrupamento === 'divisao' && (!divisaoNome || !setorIdsNaDivisao.length)) return;
    setPdfLoading(true);
    const indsParaPDF = indicadoresFiltrados.filter((i) => !moduloId || i.modulo_id === moduloId);
    await gerarPDFComparacao({
      modulos: modulosFiltrados,
      indicadores: indsParaPDF,
      lancamentosA,
      lancamentosB,
      metas,
      labelA,
      labelB,
      setorId,
      anoMetaB: periodoB.ano,
      agregacao: modoAgrupamento,
      setorIdsDivisao: modoAgrupamento === 'divisao' ? setorIdsNaDivisao : [],
      contextoPdf:
        modoAgrupamento === 'divisao' && divisaoNome
          ? `Divisão: ${divisaoNome} — média de ${setorIdsNaDivisao.length} setor(es)`
          : '',
    });
    setPdfLoading(false);
  };

  const dadosComparacaoProntos =
    (modoAgrupamento === 'setor' && !!setorId) ||
    (modoAgrupamento === 'divisao' && !!divisaoNome && setorIdsNaDivisao.length > 0);

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-screen-xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-jakarta font-bold flex items-center gap-2">
            <ArrowLeftRight className="w-6 h-6 text-primary" />
            Comparação de Períodos
          </h1>
          <p className="text-muted-foreground text-sm mt-0.5">Analise a evolução entre dois períodos</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="h-9 gap-2 border-indigo-300 text-indigo-600 hover:bg-indigo-50"
          onClick={handleExportPDF}
          disabled={pdfLoading || !dadosComparacaoProntos}
        >
          {pdfLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileDown className="w-4 h-4" />}
          Exportar PDF
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-4">
          <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
            <div className="col-span-2 md:col-span-1">
              <p className="text-xs font-medium text-muted-foreground mb-1.5">Período A — Mês</p>
              <Select value={String(periodoA.mes)} onValueChange={v => setPeriodoA(p => ({ ...p, mes: Number(v) }))}>
                <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>{MESES.map((m, i) => <SelectItem key={i + 1} value={String(i + 1)}>{m}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1.5">Ano A</p>
              <Select value={String(periodoA.ano)} onValueChange={v => setPeriodoA(p => ({ ...p, ano: Number(v) }))}>
                <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>{ANOS.map(a => <SelectItem key={a} value={String(a)}>{a}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="hidden md:flex items-end justify-center pb-1">
              <ArrowLeftRight className="w-4 h-4 text-muted-foreground" />
            </div>
            <div className="col-span-2 md:col-span-1">
              <p className="text-xs font-medium text-muted-foreground mb-1.5">Período B — Mês</p>
              <Select value={String(periodoB.mes)} onValueChange={v => setPeriodoB(p => ({ ...p, mes: Number(v) }))}>
                <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>{MESES.map((m, i) => <SelectItem key={i + 1} value={String(i + 1)}>{m}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1.5">Ano B</p>
              <Select value={String(periodoB.ano)} onValueChange={v => setPeriodoB(p => ({ ...p, ano: Number(v) }))}>
                <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>{ANOS.map(a => <SelectItem key={a} value={String(a)}>{a}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <Separator className="my-3" />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1.5">Comparar por</p>
              <Select value={modoAgrupamento} onValueChange={setModoAgrupamento}>
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="setor">Setor (uma unidade)</SelectItem>
                  <SelectItem value="divisao">Divisão (média dos setores)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {modoAgrupamento === 'setor' ? (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1.5">Setor</p>
                <Select value={setorId || '__none'} onValueChange={(v) => setSetorId(v === '__none' ? '' : v)}>
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue placeholder="Selecione o setor" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none">Selecione o setor…</SelectItem>
                    {setoresVis.map((s) => (
                      <SelectItem key={s.id} value={String(s.id)}>
                        {s.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1.5">Divisão</p>
                <Select
                  value={divisaoNome || '__none'}
                  onValueChange={(v) => setDivisaoNome(v === '__none' ? '' : v)}
                  disabled={!divisoesDisponiveis.length}
                >
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue placeholder="Divisão" />
                  </SelectTrigger>
                  <SelectContent>
                    {!divisoesDisponiveis.length ? (
                      <SelectItem value="__none" disabled>
                        Cadastre divisões nos setores
                      </SelectItem>
                    ) : (
                      divisoesDisponiveis.map((d) => (
                        <SelectItem key={d} value={d}>
                          {d}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          {modoAgrupamento === 'divisao' && divisaoNome && setorIdsNaDivisao.length > 0 ? (
            <p className="text-[11px] text-muted-foreground mt-2 leading-relaxed">
              Os valores dos períodos A e B são a <strong>média aritmética</strong> dos lançamentos dos{' '}
              {setorIdsNaDivisao.length} setor(es) desta divisão (só entram na média os setores com dado no mês). A meta
              exibida é a <strong>média das metas</strong> desses setores no ano correspondente à coluna (referência do
              período B).
            </p>
          ) : null}
          {modoAgrupamento === 'divisao' && !divisoesDisponiveis.length ? (
            <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-2 py-1.5 mt-2">
              Nenhuma divisão encontrada nos setores visíveis. Cadastre o campo divisão nos setores para comparar por
              divisão.
            </p>
          ) : null}
          <div className="mt-3">
            <p className="text-xs font-medium text-muted-foreground mb-1.5">Módulo</p>
            <Select value={moduloId || '__all'} onValueChange={(v) => setModuloId(v === '__all' ? '' : v)}>
              <SelectTrigger className="h-9 text-sm">
                <SelectValue placeholder="Todos os módulos" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all">Todos os módulos</SelectItem>
                {modulos.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Tables grouped by module */}
      <div className="space-y-5">
        {!dadosComparacaoProntos && (
          <Card className="border-dashed border-amber-200 bg-amber-50/50">
            <CardContent className="py-10 text-center text-sm text-amber-900">
              {modoAgrupamento === 'setor'
                ? 'Selecione um setor acima para comparar períodos e ver a meta específica desse setor.'
                : divisoesDisponiveis.length === 0
                  ? 'Defina divisões nos setores para usar a comparação por divisão.'
                  : 'Selecione uma divisão acima para comparar a média dos setores dessa divisão.'}
            </CardContent>
          </Card>
        )}
        {dadosComparacaoProntos && modulosFiltrados.map(mod => {
          const inds = indicadoresFiltrados
            .filter(i => i.modulo_id === mod.id)
            .sort((a, b) => (a.ordem || 0) - (b.ordem || 0));
          if (inds.length === 0) return null;

          return (
            <Card key={mod.id} className="overflow-hidden">
              {/* Module header */}
              <div className="px-5 py-3 bg-primary/10 border-b border-border flex items-center justify-between">
                <h2 className="font-jakarta font-bold text-sm text-primary">{mod.nome}</h2>
                <span className="text-xs text-muted-foreground">{inds.length} indicadores</span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-xs text-muted-foreground uppercase tracking-wide bg-secondary/30">
                      <th className="text-left py-2.5 px-4 font-semibold">Indicador</th>
                      <th className="text-center py-2.5 px-3 font-semibold">{labelA}</th>
                      <th className="text-center py-2.5 px-3 font-semibold">{labelB}</th>
                      <th className="text-center py-2.5 px-3 font-semibold">Meta</th>
                      <th className="text-center py-2.5 px-3 font-semibold">Var.%</th>
                      <th className="text-center py-2.5 px-3 font-semibold">Tendência</th>
                      <th className="text-center py-2.5 px-3 font-semibold">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {inds.map((ind, idx) => {
                      const vA = getValor(lancamentosA, ind.id);
                      const vB = getValor(lancamentosB, ind.id);
                      const meta = getMeta(ind.id, periodoB.ano);
                      const variacao = vA !== null && vB !== null && vA !== 0
                        ? ((vB - vA) / Math.abs(vA)) * 100
                        : null;
                      const tendencia = calcularTendencia(vB, vA, ind.tipo_direcao_meta);
                      const status = calcularStatusMeta(vB, meta?.valor, ind.tipo_direcao_meta);

                      return (
                        <tr key={ind.id} className={`border-b border-dashed hover:bg-secondary/20 transition-colors ${idx % 2 === 0 ? '' : 'bg-gray-50/50'}`}>
                          <td className="py-3 px-4">
                            <p className="font-medium text-sm">{ind.label || ind.nome}</p>
                            {ind.unidade && <p className="text-xs text-muted-foreground">{ind.unidade}</p>}
                          </td>
                          <td className="text-center py-3 px-3 text-muted-foreground">
                            {formatValorCelula(vA, ehMediaDivisaoUi)}
                          </td>
                          <td className="text-center py-3 px-3 font-semibold">
                            {formatValorCelula(vB, ehMediaDivisaoUi)}
                          </td>
                          <td className="text-center py-3 px-3">
                            {meta?.valor !== null && meta?.valor !== undefined
                              ? (
                                <span className="text-indigo-600 font-medium">
                                  {formatValorCelula(meta.valor, ehMediaDivisaoUi)}
                                </span>
                              )
                              : <span className="text-gray-300">—</span>
                            }
                          </td>
                          <td className="text-center py-3 px-3">
                            {variacao !== null ? (
                              <span className={`font-semibold ${variacao > 0 ? 'text-green-600' : variacao < 0 ? 'text-red-600' : 'text-gray-500'}`}>
                                {variacao > 0 ? '+' : ''}{variacao.toFixed(1)}%
                              </span>
                            ) : '—'}
                          </td>
                          <td className="text-center py-3 px-3">
                            <BadgeTendencia tendencia={tendencia} variacao={undefined} className={undefined} />
                          </td>
                          <td className="text-center py-3 px-3">
                            <BadgeStatusMeta status={status} />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Card>
          );
        })}

        {modulos.length === 0 && (
          <p className="text-center text-muted-foreground py-12">Nenhum módulo configurado</p>
        )}
      </div>
    </div>
  );
}