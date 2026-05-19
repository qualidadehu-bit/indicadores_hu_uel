import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FileDown, Loader2, CheckSquare, Square } from 'lucide-react';
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
import { drawPdfCover, loadPdfCoverAssets } from '@/lib/pdfCover';
import { filtrarIndicadoresPorSetorWhitelist } from '@/lib/indicadorDivisao';
import { getModuloDashboardKind } from '@/lib/moduloTipoUi';
import { buildAnosDisponiveis } from '@/lib/indicadores';

const MESES_COMPLETO = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

// ---- PDF helpers ----
const MESES_ABREV = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
const PDF_THEME = {
  primary: [27, 120, 27],
  primaryText: [255, 255, 255],
  secondaryText: [212, 245, 212],
  mutedText: [165, 225, 165],
  tableHeaderBg: [232, 245, 232],
  tableHeaderText: [25, 90, 25],
  rowBg: [248, 253, 248],
};

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
  if (s === 'OK') return [45, 125, 70];
  if (s === 'Atenção') return [210, 140, 0];
  if (s === 'Crítico') return [200, 0, 0];
  return [140, 140, 140];
}

function drawModuleHeader(doc, nome, periodLabel) {
  doc.setFillColor(...PDF_THEME.primary);
  doc.rect(0, 0, 210, 22, 'F');
  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...PDF_THEME.primaryText);
  doc.text(nome, 14, 10);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...PDF_THEME.secondaryText);
  doc.text(`Período: ${periodLabel}`, 14, 17);
}

function drawTableHeader(doc, y, tipo) {
  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'bold');
  doc.setFillColor(...PDF_THEME.tableHeaderBg);
  doc.rect(14, y, 182, 7, 'F');
  doc.setTextColor(...PDF_THEME.tableHeaderText);
  doc.text('INDICADOR', 16, y + 5);
  doc.text('UNIDADE', 88, y + 5);
  if (tipo === 'mensal') {
    doc.text('VALOR', 118, y + 5);
    doc.text('META', 143, y + 5);
    doc.text('STATUS', 168, y + 5);
  } else {
    MESES_ABREV.forEach((m, i) => doc.text(m, 90 + i * 9.5, y + 5));
  }
  return y + 9;
}

function drawTableRow(doc, y, ind, lancamentos, metas, tipo, mes, ano, idx, setorId) {
  const rowH = 7;
  if (idx % 2 === 0) {
    doc.setFillColor(...PDF_THEME.rowBg);
    doc.rect(14, y - 1, 182, rowH, 'F');
  }
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(40, 40, 40);
  const nomeLines = doc.splitTextToSize(ind.label || ind.nome, 68);
  doc.text(nomeLines, 16, y + 4);
  doc.text(ind.unidade || '—', 88, y + 4);

  if (tipo === 'mensal') {
    const lanc = lancamentos.find(l =>
      l.indicador_id === ind.id && l.mes === mes && l.ano === ano && l.setor_id === setorId
    );
    const metaRec = metas.find(m =>
      m.indicador_id === ind.id && m.ano === ano && m.setor_id === setorId
    );
    const valor = lanc?.valor != null ? String(lanc.valor) : '—';
    const metaStr = metaRec?.valor != null ? String(metaRec.valor) : '—';
    const st = calcStatus(lanc?.valor, metaRec?.valor, ind.tipo_direcao_meta);
    doc.text(valor, 118, y + 4);
    doc.text(metaStr, 143, y + 4);
    doc.setTextColor(...statusColor(st));
    doc.setFont('helvetica', 'bold');
    doc.text(st, 168, y + 4);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(40, 40, 40);
    let nextY = y + rowH;
    if (lanc?.nota) {
      nextY += rowH - 1;
      doc.setFontSize(7);
      doc.setTextColor(100, 100, 100);
      const notaLines = doc.splitTextToSize(`Obs: ${lanc.nota}`, 178);
      doc.text(notaLines, 16, nextY);
      doc.setFontSize(8.5);
      doc.setTextColor(40, 40, 40);
      nextY += notaLines.length * 3.5;
    }
    return nextY;
  } else {
    MESES_ABREV.forEach((_, mi) => {
      const lanc = lancamentos.find(l =>
        l.indicador_id === ind.id && l.mes === mi + 1 && l.ano === ano && l.setor_id === setorId
      );
      const metaRec = metas.find(m =>
        m.indicador_id === ind.id && m.ano === ano && m.setor_id === setorId
      );
      const val = lanc?.valor != null ? String(lanc.valor) : '—';
      const st = calcStatus(lanc?.valor, metaRec?.valor, ind.tipo_direcao_meta);
      doc.setTextColor(...statusColor(st));
      doc.text(val, 90 + mi * 9.5, y + 4);
      doc.setTextColor(40, 40, 40);
    });
    return y + rowH;
  }
}

function findChartCaptureElement(moduloId) {
  const root = document.querySelector(`[data-modulo-id="${moduloId}"]`);
  if (!(root instanceof HTMLElement)) return null;
  const scoped = root.querySelector('[data-pdf-export]');
  return scoped instanceof HTMLElement ? scoped : root;
}

// ---- Capture live dashboard cards from the DOM ----
async function captureDashboardCards(modulosSelecionados, modulos) {
  const modById = new Map(modulos.map((m) => [m.id, m]));
  const canvases = {};
  for (const moduloId of modulosSelecionados) {
    const el = findChartCaptureElement(moduloId);
    if (!el) continue;
    const isIras = getModuloDashboardKind(modById.get(moduloId)) === 'iras';
    try {
      el.scrollIntoView({ block: 'nearest', behavior: 'instant' });
      await new Promise((r) => setTimeout(r, 80));
      const canvas = await html2canvas(el, {
        scale: isIras ? 3 : 2,
        backgroundColor: '#ffffff',
        useCORS: true,
        logging: false,
        allowTaint: true,
      });
      canvases[moduloId] = canvas.toDataURL('image/png');
    } catch {
      // skip on error
    }
  }
  return canvases;
}

const CHART_MARGIN_X = 14;
const CHART_MAX_W_DEFAULT = 182;
const IRAS_CHART_X = 7;
const IRAS_CHART_MAX_W = 196;

/** Escala imagem para caber em maxW × maxH mantendo proporção. */
function fitImageToBox(naturalW, naturalH, maxW, maxH) {
  if (!naturalW || !naturalH) return { w: maxW, h: maxH };
  let w = maxW;
  let h = (naturalH / naturalW) * w;
  if (h > maxH) {
    h = maxH;
    w = (naturalW / naturalH) * h;
  }
  return { w, h };
}

/** IRAS: largura fixa em maxW; altura proporcional (pode exceder maxH — fatiar depois). */
function fitImageWidthFirst(naturalW, naturalH, maxW) {
  if (!naturalW || !naturalH) return { w: maxW, h: maxW };
  const w = maxW;
  const h = (naturalH / naturalW) * w;
  return { w, h };
}

function loadImageElement(imgSrc) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = imgSrc;
  });
}

/** Desenha fatias verticais da imagem em páginas seguintes, mantendo largura maxW. */
async function addImageSlicedVertical(doc, img, imgSrc, chartX, chartY, maxW, maxHPerPage, onExtraPage, continuationY) {
  const { w: drawW, h: drawH } = fitImageWidthFirst(img.naturalWidth, img.naturalHeight, maxW);
  if (drawH <= maxHPerPage) {
    doc.addImage(imgSrc, 'PNG', chartX, chartY, drawW, drawH);
    return;
  }

  const pxPerMm = img.naturalWidth / drawW;
  const nextPageY = continuationY ?? chartY;
  let srcYpx = 0;
  let pageY = chartY;
  let remainingMm = drawH;

  while (remainingMm > 0.5) {
    const sliceHmm = Math.min(maxHPerPage, remainingMm);
    const sliceHpx = Math.min(
      Math.round(sliceHmm * pxPerMm),
      img.naturalHeight - srcYpx,
    );
    if (sliceHpx <= 0) break;

    const actualSliceHmm = sliceHpx / pxPerMm;
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = sliceHpx;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(img, 0, srcYpx, img.naturalWidth, sliceHpx, 0, 0, img.naturalWidth, sliceHpx);
      doc.addImage(canvas.toDataURL('image/png'), 'PNG', chartX, pageY, drawW, actualSliceHmm);
    }

    srcYpx += sliceHpx;
    remainingMm -= actualSliceHmm;

    if (remainingMm > 0.5) {
      doc.addPage();
      onExtraPage?.();
      pageY = nextPageY;
    }
  }
}

// ---- Main PDF generator ----
async function gerarPDF({ modulos, indicadores, lancamentos, metas, modulosSelecionados, tipo, mes, ano, conteudo = 'ambos', setorId }) {
  // First capture live charts from DOM
  const chartCanvases = await captureDashboardCards(modulosSelecionados, modulos);

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const periodLabel = tipo === 'mensal' ? `${MESES_COMPLETO[mes - 1]}/${ano}` : `Anual ${ano}`;
  const coverAssets = await loadPdfCoverAssets();

  // ---- Cover ----
  const modsNomes = modulos.filter(m => modulosSelecionados.includes(m.id)).map(m => m.nome).join(' · ');
  drawPdfCover(doc, {
    title: 'Relatório de Indicadores',
    subtitle: periodLabel,
    details: modsNomes,
    generatedAt: `Gerado em ${new Date().toLocaleDateString('pt-BR')} às ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`,
    theme: PDF_THEME,
    assets: coverAssets,
  });

  const modsParaExportar = modulos.filter(m => modulosSelecionados.includes(m.id));
  const FOOTER_TOP = 278;
  const CHART_PAGE_TOP = 26;
  const CHART_MAX_H_FULL_PAGE = FOOTER_TOP - CHART_PAGE_TOP;
  const CHART_MIN_SPACE_MM = 40;
  const CHART_AFTER_TABLE_GAP = 6;

  for (const modulo of modsParaExportar) {
    const inds = indicadores
      .filter(i => i.modulo_id === modulo.id)
      .sort((a, b) => (a.ordem || 0) - (b.ordem || 0));
    if (inds.length === 0) continue;

    const incluirTabela = conteudo === 'tabela' || conteudo === 'ambos';
    const incluirGrafico = conteudo === 'grafico' || conteudo === 'ambos';
    const imgData = chartCanvases[modulo.id];
    const fluxoAmbos = incluirTabela && incluirGrafico;
    const isIras = getModuloDashboardKind(modulo) === 'iras';

    /** Desenha tabela a partir de y; devolve y final. */
    const drawModuloTabela = (yStart) => {
      let y = yStart;
      doc.setFontSize(9);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(
        PDF_THEME.tableHeaderText[0],
        PDF_THEME.tableHeaderText[1],
        PDF_THEME.tableHeaderText[2],
      );
      doc.text('RESUMO DE INDICADORES', 14, y);
      y += 5;
      y = drawTableHeader(doc, y, tipo);
      for (let idx = 0; idx < inds.length; idx++) {
        if (y > 272) {
          doc.addPage();
          y = 14;
        }
        y = drawTableRow(doc, y, inds[idx], lancamentos, metas, tipo, mes, ano, idx, setorId);
      }
      return y;
    };

    const chartLayout = isIras
      ? { chartX: IRAS_CHART_X, maxW: IRAS_CHART_MAX_W, widthFirst: true }
      : { chartX: CHART_MARGIN_X, maxW: CHART_MAX_W_DEFAULT, widthFirst: false };

    const redrawModuloHeader = () => drawModuleHeader(doc, modulo.nome, periodLabel);

    const placeChartImage = async (imgSrc, chartY, maxH) => {
      const img = await loadImageElement(imgSrc);
      if (!img?.naturalWidth) return;

      const { chartX, maxW, widthFirst } = chartLayout;
      const safeMaxH = Math.max(10, maxH);

      if (widthFirst) {
        await addImageSlicedVertical(
          doc,
          img,
          imgSrc,
          chartX,
          chartY,
          maxW,
          safeMaxH,
          redrawModuloHeader,
          CHART_PAGE_TOP,
        );
        return;
      }

      const { w: drawW, h: drawH } = fitImageToBox(
        img.naturalWidth,
        img.naturalHeight,
        maxW,
        safeMaxH,
      );
      const x = chartX + (maxW - drawW) / 2;
      doc.addImage(imgSrc, 'PNG', x, chartY, drawW, drawH);
    };

    if (fluxoAmbos) {
      doc.addPage();
      drawModuleHeader(doc, modulo.nome, periodLabel);
      let y = drawModuloTabela(30);

      if (imgData) {
        let chartY = y + CHART_AFTER_TABLE_GAP;
        let availableH = FOOTER_TOP - chartY;

        if (isIras) {
          doc.addPage();
          redrawModuloHeader();
          chartY = CHART_PAGE_TOP;
          availableH = CHART_MAX_H_FULL_PAGE;
        } else if (availableH < CHART_MIN_SPACE_MM) {
          doc.addPage();
          redrawModuloHeader();
          chartY = CHART_PAGE_TOP;
          availableH = FOOTER_TOP - chartY;
        }

        await placeChartImage(imgData, chartY, availableH);
      }
    } else if (incluirTabela) {
      doc.addPage();
      drawModuleHeader(doc, modulo.nome, periodLabel);
      drawModuloTabela(30);
    } else if (incluirGrafico && imgData) {
      doc.addPage();
      drawModuleHeader(doc, `${modulo.nome} — Visualização`, periodLabel);
      const maxH = isIras ? CHART_MAX_H_FULL_PAGE : FOOTER_TOP - CHART_PAGE_TOP;
      await placeChartImage(imgData, CHART_PAGE_TOP, maxH);
    }
  }

  // Footer on all content pages
  const totalPages = doc.getNumberOfPages();
  for (let p = 2; p <= totalPages; p++) {
    doc.setPage(p);
    doc.setFontSize(7);
    doc.setTextColor(180, 180, 180);
    doc.text(`Pág. ${p - 1} / ${totalPages - 1}  ·  ${periodLabel}`, 14, 292);
    doc.text('Gerado automaticamente', 155, 292);
  }

  doc.save(`Relatorio_${tipo === 'mensal' ? `${MESES_COMPLETO[mes - 1]}_` : 'Anual_'}${ano}.pdf`);
}

// ---- Modal component ----
export default function ExportPDFModal({
  open,
  onClose,
  modulos,
  indicadores,
  lancamentos,
  metas,
  anoAtual,
  mesAtual,
  setores = [],
  dashboardSetorId = null,
}) {
  const [tipo, setTipo] = useState('mensal');
  const [mesSel, setMesSel] = useState(String(mesAtual));
  const [anoSel, setAnoSel] = useState(String(anoAtual));
  const [modulosSelecionados, setModulosSelecionados] = useState([]);
  const [loading, setLoading] = useState(false);
  const [conteudo, setConteudo] = useState('ambos'); // 'grafico' | 'tabela' | 'ambos'
  const [exportSetorId, setExportSetorId] = useState('');

  useEffect(() => {
    if (open) {
      setModulosSelecionados(modulos.map(m => m.id));
      setExportSetorId(dashboardSetorId || setores[0]?.id || '');
    }
  }, [open, modulos, dashboardSetorId, setores]);

  const toggleModulo = (id) =>
    setModulosSelecionados(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

  const toggleAll = () =>
    setModulosSelecionados(modulosSelecionados.length === modulos.length ? [] : modulos.map(m => m.id));

  const handleExport = async () => {
    if (!exportSetorId) return;
    setLoading(true);
    const exportSetor = setores.find((s) => String(s.id) === String(exportSetorId));
    const indicadoresExport = filtrarIndicadoresPorSetorWhitelist(indicadores, exportSetor);
    await gerarPDF({
      modulos,
      indicadores: indicadoresExport,
      lancamentos,
      metas,
      modulosSelecionados,
      tipo,
      mes: Number(mesSel),
      ano: Number(anoSel),
      conteudo,
      setorId: exportSetorId,
    });
    setLoading(false);
    onClose();
  };

  const anos = buildAnosDisponiveis({ referenceYear: anoAtual });

  return (
    <Dialog open={open} onOpenChange={v => !v && !loading && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-jakarta text-lg font-bold flex items-center gap-2">
            <FileDown className="w-5 h-5 text-indigo-600" />
            Exportar Relatório PDF
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5 pt-1">
          {/* Tipo */}
          <div>
            <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Período</Label>
            <div className="flex gap-3 mt-2">
              {[{ value: 'mensal', label: '📅 Mensal' }, { value: 'anual', label: '📆 Anual' }].map(op => (
                <button
                  key={op.value}
                  onClick={() => setTipo(op.value)}
                  className={`flex-1 py-2.5 rounded-lg border-2 text-sm font-medium transition-all ${
                    tipo === op.value
                      ? 'border-indigo-400 bg-indigo-50 text-indigo-700'
                      : 'border-gray-200 text-gray-600 hover:border-gray-300'
                  }`}
                >
                  {op.label}
                </button>
              ))}
            </div>
          </div>

          {/* Setor (meta e lançamentos são por setor) */}
          <div>
            <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Setor no PDF</Label>
            <Select value={exportSetorId || '__none'} onValueChange={(v) => setExportSetorId(v === '__none' ? '' : v)}>
              <SelectTrigger className="mt-1 h-9"><SelectValue placeholder="Selecione o setor" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none">Selecione…</SelectItem>
                {setores.map(s => (
                  <SelectItem key={s.id} value={s.id}>{s.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Ano + Mês */}
          <div className="flex gap-3">
            <div className="flex-1">
              <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Ano</Label>
              <Select value={anoSel} onValueChange={setAnoSel}>
                <SelectTrigger className="mt-1 h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {anos.map(a => <SelectItem key={a} value={String(a)}>{a}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {tipo === 'mensal' && (
              <div className="flex-1">
                <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Mês</Label>
                <Select value={mesSel} onValueChange={setMesSel}>
                  <SelectTrigger className="mt-1 h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {MESES_COMPLETO.map((m, i) => (
                      <SelectItem key={i + 1} value={String(i + 1)}>{m}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          {/* Conteúdo */}
          <div>
            <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Conteúdo</Label>
            <div className="flex gap-3 mt-2">
              {[
                { value: 'ambos',   label: '📊+📋 Gráfico e Tabela' },
                { value: 'grafico', label: '📊 Só Gráfico' },
                { value: 'tabela',  label: '📋 Só Tabela' },
              ].map(op => (
                <button
                  key={op.value}
                  onClick={() => setConteudo(op.value)}
                  className={`flex-1 py-2.5 rounded-lg border-2 text-xs font-medium transition-all ${
                    conteudo === op.value
                      ? 'border-indigo-400 bg-indigo-50 text-indigo-700'
                      : 'border-gray-200 text-gray-600 hover:border-gray-300'
                  }`}
                >
                  {op.label}
                </button>
              ))}
            </div>
          </div>

          {/* Módulos */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Módulos</Label>
              <button onClick={toggleAll} className="text-xs text-indigo-600 hover:underline">
                {modulosSelecionados.length === modulos.length ? 'Desmarcar todos' : 'Selecionar todos'}
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto pr-1">
              {modulos.map(m => {
                const selected = modulosSelecionados.includes(m.id);
                return (
                  <button
                    key={m.id}
                    onClick={() => toggleModulo(m.id)}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-left text-sm transition-all ${
                      selected
                        ? 'border-indigo-300 bg-indigo-50 text-indigo-800'
                        : 'border-gray-200 text-gray-500 hover:border-gray-300'
                    }`}
                  >
                    {selected
                      ? <CheckSquare className="w-4 h-4 text-indigo-500 flex-shrink-0" />
                      : <Square className="w-4 h-4 text-gray-400 flex-shrink-0" />
                    }
                    <span className="truncate">{m.nome}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <p className="text-xs text-muted-foreground bg-blue-50 border border-blue-100 rounded-lg px-3 py-2">
            💡 Os gráficos serão capturados diretamente do dashboard atual — certifique-se de que os cards estão visíveis na tela. A tabela do PDF usa lançamentos e metas do setor escolhido acima.
          </p>

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" onClick={onClose} disabled={loading}>Cancelar</Button>
            <Button
              disabled={loading || modulosSelecionados.length === 0 || !exportSetorId}
              onClick={handleExport}
              className="bg-indigo-600 hover:bg-indigo-700 text-white gap-2"
            >
              {loading
                ? <><Loader2 className="w-4 h-4 animate-spin" />Gerando PDF...</>
                : <><FileDown className="w-4 h-4" />Exportar PDF</>
              }
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}