import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import { FileDown, Loader2, CheckSquare, Square } from 'lucide-react';
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
import { drawPdfCover, loadPdfCoverAssets } from '@/lib/pdfCover';
import { filtrarIndicadoresPorSetorWhitelist } from '@/lib/indicadorDivisao';
import { getModuloDashboardKind } from '@/lib/moduloTipoUi';
import { buildAnosDisponiveis } from '@/lib/indicadores';
import { calcStatus, statusColor } from '@/lib/metaStatus';

const MESES_COMPLETO = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

// ---- PDF helpers ----
const MESES_ABREV = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
const PDF_THEME = {
  primary: [27, 120, 27],
  primaryText: [255, 255, 255],
  secondaryText: [212, 245, 212],
  mutedText: [165, 225, 165],
  tableHeaderBg: [221, 237, 221],
  tableHeaderText: [20, 70, 20],
  rowBg: [242, 248, 242],
};
const CAPTURE_QUALITY_PRESETS = {
  rapido: { defaultScale: 1.0, irasScale: 1.2 },
  padrao: { defaultScale: 1.5, irasScale: 2.0 },
  alta: { defaultScale: 2.0, irasScale: 2.5 },
};
const QUALITY_ORDER = ['rapido', 'padrao', 'alta'];
const DEFAULT_CAPTURE_THROTTLE_MS = 8;
const STABLE_CAPTURE_THROTTLE_MS = 24;
const SLOW_CAPTURE_THRESHOLD_MS = 3000;
const CAPTURE_ERROR_FALLBACK_THRESHOLD = 2;
const CAPTURE_TIMEOUT_MS = 3800;
const CAPTURE_TIMEOUT_MS_IRAS = 2800;
const MAX_CAPTURE_AREA = 1800000;
const MAX_CAPTURE_HEIGHT = 2600;
const MAX_CAPTURE_AREA_STABLE = 1200000;
const MAX_CAPTURE_HEIGHT_STABLE = 1800;
const MAX_CAPTURE_AREA_IRAS = 1300000;
const MAX_CAPTURE_HEIGHT_IRAS = 1800;
const MAX_CAPTURE_AREA_IRAS_STABLE = 900000;
const MAX_CAPTURE_HEIGHT_IRAS_STABLE = 1400;
const IRAS_CAPTURE_SLOW_THRESHOLD_MS = 2400;
const IRAS_MAX_CANVAS_HEIGHT_PX = 4200;
const IRAS_MAX_CANVAS_HEIGHT_PX_STABLE = 3000;
const IRAS_MAX_SLICES = 8;
const IRAS_MAX_SLICES_STABLE = 6;
const IRAS_MAX_SLICE_WORK_MS = 4200;
const MAX_WORK_UNITS_TABLE_ONLY = 120;
const MAX_WORK_UNITS_WITH_GRAPH = 48;
const GRAPH_BATCH_MEDIUM_WORK_UNITS = 12;
const GRAPH_BATCH_LARGE_WORK_UNITS = 24;
const SEVERE_CAPTURE_FAILURES_TO_SKIP_REST = 2;

function nowMs() {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return performance.now();
  }
  return Date.now();
}

async function yieldToMainThread() {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

async function sleepMs(ms) {
  if (!ms || ms <= 0) return;
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function downgradeQuality(currentQuality) {
  const idx = QUALITY_ORDER.indexOf(currentQuality);
  if (idx <= 0) return 'rapido';
  return QUALITY_ORDER[idx - 1];
}

function resolveChartImageFormat({ isIras, modoEstavel }) {
  if (isIras) return 'PNG';
  if (modoEstavel) return 'JPEG';
  return 'JPEG';
}

function addDocImage(doc, source, format, x, y, w, h) {
  const compression = format === 'JPEG' ? 'FAST' : undefined;
  doc.addImage(source, format, x, y, w, h, undefined, compression);
}

function clampCanvasHeight(sourceCanvas, maxHeightPx) {
  if (!sourceCanvas?.width || !sourceCanvas?.height) return sourceCanvas;
  if (!maxHeightPx || sourceCanvas.height <= maxHeightPx) return sourceCanvas;
  const ratio = maxHeightPx / sourceCanvas.height;
  const out = document.createElement('canvas');
  out.width = Math.max(1, Math.round(sourceCanvas.width * ratio));
  out.height = maxHeightPx;
  const ctx = out.getContext('2d');
  if (ctx) {
    ctx.drawImage(sourceCanvas, 0, 0, sourceCanvas.width, sourceCanvas.height, 0, 0, out.width, out.height);
  }
  return out;
}

function lancamentoKey(indicadorId, ano, mes, setorId) {
  return `${String(indicadorId)}|${Number(ano)}|${Number(mes)}|${String(setorId)}`;
}

function metaKey(indicadorId, ano, setorId) {
  return `${String(indicadorId)}|${Number(ano)}|${String(setorId)}`;
}

function moduleScopeKey(moduloId, setorId) {
  return `${String(moduloId)}|${String(setorId)}`;
}

function formatFallbackReason(reason) {
  if (reason === 'precheck_limit') return 'limite preventivo';
  if (reason === 'timeout') return 'tempo limite';
  if (reason === 'capture_error') return 'erro na captura';
  if (reason === 'slice_limit') return 'limite de processamento';
  if (reason === 'slow_capture') return 'captura lenta';
  return 'fallback';
}

function resolveCapturePrecheckLimits({ isIras, modoEstavel, conservative = false }) {
  const areaFactor = conservative ? 0.72 : 1;
  const heightFactor = conservative ? 0.78 : 1;
  if (isIras && modoEstavel) {
    return {
      maxArea: Math.round(MAX_CAPTURE_AREA_IRAS_STABLE * areaFactor),
      maxHeight: Math.round(MAX_CAPTURE_HEIGHT_IRAS_STABLE * heightFactor),
    };
  }
  if (isIras) {
    return {
      maxArea: Math.round(MAX_CAPTURE_AREA_IRAS * areaFactor),
      maxHeight: Math.round(MAX_CAPTURE_HEIGHT_IRAS * heightFactor),
    };
  }
  if (modoEstavel) {
    return {
      maxArea: Math.round(MAX_CAPTURE_AREA_STABLE * areaFactor),
      maxHeight: Math.round(MAX_CAPTURE_HEIGHT_STABLE * heightFactor),
    };
  }
  return {
    maxArea: Math.round(MAX_CAPTURE_AREA * areaFactor),
    maxHeight: Math.round(MAX_CAPTURE_HEIGHT * heightFactor),
  };
}

function precheckCaptureElementCost({ element, isIras, modoEstavel, conservative = false }) {
  if (!(element instanceof HTMLElement)) {
    return { ok: false, reason: 'capture_error', width: 0, height: 0, area: 0, childNodes: 0 };
  }
  const width = Number(element.clientWidth || element.scrollWidth || 0);
  const height = Number(element.clientHeight || element.scrollHeight || 0);
  const area = Math.max(0, width * height);
  const childNodes = Number(element.querySelectorAll('*').length || 0);
  const limits = resolveCapturePrecheckLimits({ isIras, modoEstavel, conservative });
  const ok = width > 0 && height > 0 && area <= limits.maxArea && height <= limits.maxHeight;
  return {
    ok,
    reason: ok ? '' : 'precheck_limit',
    width,
    height,
    area,
    childNodes,
    ...limits,
  };
}

function buildLancamentosIndex(lancamentos) {
  const index = new Map();
  for (const l of lancamentos || []) {
    index.set(lancamentoKey(l.indicador_id, l.ano, l.mes, l.setor_id), l);
  }
  return index;
}

function buildMetasIndex(metas) {
  const index = new Map();
  for (const m of metas || []) {
    index.set(metaKey(m.indicador_id, m.ano, m.setor_id), m);
  }
  return index;
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

const TABLE_X = 14;
const TABLE_W = 182;
const TABLE_HEADER_H = 7;
const TABLE_PADDING_X = 2;
const TABLE_PADDING_Y = 1.4;
const TABLE_LINE_HEIGHT = 3.4;
const TABLE_NOTE_LINE_HEIGHT = 3.1;
const TABLE_TEXT_BASELINE = 2.7;
const TABLE_NOTE_BASELINE = 2.4;
const TABLE_ROW_MIN_H = 7;
const TABLE_HEADER_GAP = 2;
const TABLE_NOTE_GAP = 1.2;
const TABLE_NOTE_PADDING_Y = 1.0;
const TABLE_PAGE_BOTTOM = 272;
const TABLE_TEXT_COLOR = [35, 35, 35];
const TABLE_NOTE_COLOR = [105, 105, 105];
const TABLE_GRID_COLOR = [210, 222, 210];
const TABLE_ROW_BG_ALT = [248, 251, 248];

function getTableColumns(tipo) {
  if (tipo === 'mensal') {
    return [
      { key: 'indicador', header: 'INDICADOR', x: 14, w: 72, maxLines: 3, align: 'left' },
      { key: 'unidade', header: 'UNIDADE', x: 86, w: 30, maxLines: 2, align: 'left' },
      { key: 'valor', header: 'VALOR', x: 116, w: 25, maxLines: 2, align: 'right' },
      { key: 'meta', header: 'META', x: 141, w: 25, maxLines: 2, align: 'right' },
      { key: 'status', header: 'STATUS', x: 166, w: 30, maxLines: 2, align: 'left' },
    ];
  }
  return [
    { key: 'indicador', header: 'INDICADOR', x: 14, w: 68, maxLines: 3, align: 'left' },
    { key: 'unidade', header: 'UNIDADE', x: 82, w: 14, maxLines: 2, align: 'left' },
    ...MESES_ABREV.map((m, i) => ({
      key: `mes_${i + 1}`,
      header: m,
      x: 96 + i * (100 / 12),
      w: 100 / 12,
      maxLines: 1,
      align: 'right',
    })),
  ];
}

function normalizeCellDisplay(value) {
  const txt = value == null ? '' : String(value).trim();
  return txt ? txt : '—';
}

function normalizeStatusDisplay(status) {
  const txt = status == null ? '' : String(status).trim();
  return txt ? txt : 'N/A';
}

function fitTextWithEllipsis(doc, text, maxWidth) {
  const safeText = String(text || '').trim();
  if (!safeText) return '...';
  if (doc.getTextWidth(safeText) <= maxWidth) return safeText;
  let base = safeText;
  while (base.length > 1 && doc.getTextWidth(`${base}...`) > maxWidth) {
    base = base.slice(0, -1).trimEnd();
  }
  return `${base || safeText.slice(0, 1)}...`;
}

function splitCellLines(doc, text, maxWidth, maxLines) {
  const raw = normalizeCellDisplay(text);
  const lines = doc.splitTextToSize(raw, maxWidth);
  if (lines.length <= maxLines) return lines;
  const limited = lines.slice(0, maxLines);
  limited[maxLines - 1] = fitTextWithEllipsis(doc, limited[maxLines - 1], maxWidth);
  return limited;
}

function buildTableRowLayout(doc, ind, lookup, tipo, mes, ano, setorId) {
  const cols = getTableColumns(tipo);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);

  const baseCells = new Map();
  const cellColors = new Map();
  const cellStyles = new Map();
  baseCells.set('indicador', ind.label || ind.nome || '—');
  baseCells.set('unidade', normalizeCellDisplay(ind.unidade));

  let notaLines = [];
  if (tipo === 'mensal') {
    const lanc = lookup.getLancamento(ind.id, ano, mes, setorId);
    const metaRec = lookup.getMeta(ind.id, ano, setorId);
    const stRaw = calcStatus(lanc?.valor, metaRec?.valor, ind.tipo_direcao_meta);
    const st = normalizeStatusDisplay(stRaw);
    baseCells.set('valor', lanc?.valor != null ? String(lanc.valor) : '—');
    baseCells.set('meta', metaRec?.valor != null ? String(metaRec.valor) : '—');
    baseCells.set('status', st);
    cellStyles.set('status', 'bold');
    cellColors.set('status', statusColor(st));
    if (lanc?.nota) {
      doc.setFontSize(7);
      notaLines = splitCellLines(
        doc,
        `Obs: ${lanc.nota}`,
        TABLE_W - TABLE_PADDING_X * 2,
        3,
      );
      doc.setFontSize(8.5);
    }
  } else {
    const metaRec = lookup.getMeta(ind.id, ano, setorId);
    for (let mi = 0; mi < 12; mi += 1) {
      const lanc = lookup.getLancamento(ind.id, ano, mi + 1, setorId);
      const val = lanc?.valor != null ? String(lanc.valor) : '—';
      const cellKey = `mes_${mi + 1}`;
      baseCells.set(cellKey, normalizeCellDisplay(val));
    }
  }

  const renderedCells = cols.map((col) => {
    const maxWidth = Math.max(1, col.w - TABLE_PADDING_X * 2);
    const lines = splitCellLines(doc, baseCells.get(col.key), maxWidth, col.maxLines);
    const resolvedColor = cellColors.get(col.key) || TABLE_TEXT_COLOR;
    return {
      key: col.key,
      x: col.x,
      w: col.w,
      lines,
      align: col.align || 'left',
      fontStyle: cellStyles.get(col.key) || 'normal',
      textColor: resolvedColor,
    };
  });

  const mainLineCount = Math.max(1, ...renderedCells.map((c) => c.lines.length));
  const mainHeight = Math.max(
    TABLE_ROW_MIN_H,
    TABLE_PADDING_Y * 2 + mainLineCount * TABLE_LINE_HEIGHT,
  );
  const noteHeight = notaLines.length
    ? TABLE_NOTE_GAP + TABLE_NOTE_PADDING_Y * 2 + notaLines.length * TABLE_NOTE_LINE_HEIGHT
    : 0;

  return {
    cells: renderedCells,
    noteLines: notaLines,
    mainHeight,
    rowHeight: mainHeight + noteHeight,
  };
}

function drawTableHeader(doc, y, tipo) {
  const cols = getTableColumns(tipo);
  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'bold');
  doc.setFillColor(...PDF_THEME.tableHeaderBg);
  doc.rect(TABLE_X, y, TABLE_W, TABLE_HEADER_H, 'F');
  doc.setDrawColor(...TABLE_GRID_COLOR);
  doc.line(TABLE_X, y + TABLE_HEADER_H, TABLE_X + TABLE_W, y + TABLE_HEADER_H);
  doc.setTextColor(...PDF_THEME.tableHeaderText);
  cols.forEach((col) => {
    const textX = col.align === 'right'
      ? col.x + col.w - TABLE_PADDING_X
      : col.x + TABLE_PADDING_X;
    doc.text(col.header, textX, y + 5, { align: col.align === 'right' ? 'right' : 'left' });
  });
  return y + TABLE_HEADER_H + TABLE_HEADER_GAP;
}

function drawTableRow(doc, y, rowLayout, idx) {
  doc.setFillColor(...(idx % 2 === 0 ? PDF_THEME.rowBg : TABLE_ROW_BG_ALT));
  doc.rect(TABLE_X, y - 0.3, TABLE_W, rowLayout.rowHeight, 'F');

  doc.setDrawColor(...TABLE_GRID_COLOR);
  for (const cell of rowLayout.cells) {
    doc.line(cell.x, y - 0.3, cell.x, y - 0.3 + rowLayout.mainHeight);
  }
  doc.line(TABLE_X + TABLE_W, y - 0.3, TABLE_X + TABLE_W, y - 0.3 + rowLayout.mainHeight);
  doc.line(TABLE_X, y - 0.3 + rowLayout.mainHeight, TABLE_X + TABLE_W, y - 0.3 + rowLayout.mainHeight);

  doc.setFontSize(8.5);
  const maxLineCount = Math.max(1, ...rowLayout.cells.map((cell) => cell.lines.length));
  const verticalReferenceTop = y + TABLE_PADDING_Y + TABLE_TEXT_BASELINE;
  rowLayout.cells.forEach((cell) => {
    doc.setFont('helvetica', cell.fontStyle);
    doc.setTextColor(...cell.textColor);
    const linesOffset = ((maxLineCount - cell.lines.length) * TABLE_LINE_HEIGHT) / 2;
    const textStartY = verticalReferenceTop + linesOffset;
    const textX = cell.align === 'right'
      ? cell.x + cell.w - TABLE_PADDING_X
      : cell.x + TABLE_PADDING_X;
    cell.lines.forEach((line, lineIdx) => {
      doc.text(String(line), textX, textStartY + lineIdx * TABLE_LINE_HEIGHT, {
        align: cell.align === 'right' ? 'right' : 'left',
      });
    });
  });

  if (rowLayout.noteLines.length) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(...TABLE_NOTE_COLOR);
    const noteY = y + rowLayout.mainHeight + TABLE_NOTE_GAP + TABLE_NOTE_PADDING_Y + TABLE_NOTE_BASELINE;
    rowLayout.noteLines.forEach((line, idxLine) => {
      doc.text(String(line), TABLE_X + TABLE_PADDING_X + 0.8, noteY + idxLine * TABLE_NOTE_LINE_HEIGHT);
    });
  }

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(...TABLE_TEXT_COLOR);
  return y + rowLayout.rowHeight;
}

function findChartCaptureElement(moduloId, setorId = null) {
  const selector = setorId != null
    ? `[data-modulo-id="${moduloId}"][data-setor-id="${setorId}"]`
    : `[data-modulo-id="${moduloId}"]`;
  const root = document.querySelector(selector);
  if (!(root instanceof HTMLElement)) return null;
  const scoped = root.querySelector('[data-pdf-export]');
  return scoped instanceof HTMLElement ? scoped : root;
}

// ---- Capture live dashboard card from the DOM (single module) ----
async function captureDashboardCard({
  element = null,
  moduloId,
  setorId = null,
  quality = 'padrao',
  isIras = false,
  throttleMs = 0,
  timeoutMs = CAPTURE_TIMEOUT_MS,
}) {
  const el = element || findChartCaptureElement(moduloId, setorId);
  if (!el) return null;
  const scalePreset = CAPTURE_QUALITY_PRESETS[quality] || CAPTURE_QUALITY_PRESETS.padrao;
  el.scrollIntoView({ block: 'nearest', behavior: 'instant' });
  await sleepMs(Math.max(40, throttleMs));
  const capturePromise = html2canvas(el, {
    scale: isIras ? scalePreset.irasScale : scalePreset.defaultScale,
    backgroundColor: '#ffffff',
    useCORS: true,
    logging: false,
    allowTaint: true,
  });
  const timeoutPromise = new Promise((_, reject) => {
    setTimeout(() => reject(new Error(`capture_timeout_${timeoutMs}`)), timeoutMs);
  });
  return Promise.race([capturePromise, timeoutPromise]);
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

/** Desenha fatias verticais da imagem em páginas seguintes, mantendo largura maxW. */
async function addImageSlicedVertical(
  doc,
  sourceCanvas,
  chartX,
  chartY,
  maxW,
  maxHPerPage,
  onExtraPage,
  continuationY,
  options = {}
) {
  const { maxSlices = Number.POSITIVE_INFINITY, maxProcessingMs = Number.POSITIVE_INFINITY } = options;
  const { w: drawW, h: drawH } = fitImageWidthFirst(sourceCanvas.width, sourceCanvas.height, maxW);
  if (drawH <= maxHPerPage) {
    addDocImage(doc, sourceCanvas, 'PNG', chartX, chartY, drawW, drawH);
    return { completed: true, slices: 1, clipped: false };
  }

  const pxPerMm = sourceCanvas.width / drawW;
  const nextPageY = continuationY ?? chartY;
  let srcYpx = 0;
  let pageY = chartY;
  let remainingMm = drawH;
  let slices = 0;
  const sliceStart = nowMs();
  const sliceCanvas = document.createElement('canvas');
  sliceCanvas.width = sourceCanvas.width;
  const ctx = sliceCanvas.getContext('2d');

  while (remainingMm > 0.5) {
    if (slices >= maxSlices || nowMs() - sliceStart > maxProcessingMs) {
      return { completed: false, slices, clipped: true };
    }
    const sliceHmm = Math.min(maxHPerPage, remainingMm);
    const sliceHpx = Math.min(
      Math.round(sliceHmm * pxPerMm),
      sourceCanvas.height - srcYpx,
    );
    if (sliceHpx <= 0) break;

    const actualSliceHmm = sliceHpx / pxPerMm;
    sliceCanvas.height = sliceHpx;
    if (ctx) {
      ctx.clearRect(0, 0, sliceCanvas.width, sliceCanvas.height);
      ctx.drawImage(sourceCanvas, 0, srcYpx, sourceCanvas.width, sliceHpx, 0, 0, sourceCanvas.width, sliceHpx);
      addDocImage(doc, sliceCanvas, 'PNG', chartX, pageY, drawW, actualSliceHmm);
    }
    slices += 1;

    srcYpx += sliceHpx;
    remainingMm -= actualSliceHmm;

    if (remainingMm > 0.5) {
      doc.addPage();
      onExtraPage?.();
      pageY = nextPageY;
    }
  }
  return { completed: true, slices, clipped: false };
}

// ---- Main PDF generator ----
async function gerarPDF({
  modulos,
  indicadores,
  lancamentos,
  metas,
  modulosSelecionados,
  tipo,
  mes,
  ano,
  conteudo = 'ambos',
  setorIds = [],
  setores = [],
  qualidade = 'padrao',
  modoEstavel = false,
}) {
  const metrics = {
    captureMs: 0,
    contentMs: 0,
    saveMs: 0,
    totalMs: 0,
    fallbackCount: 0,
    fallbackActivated: false,
    captureErrors: 0,
    captureAttempts: 0,
    irasSimplified: 0,
    irasGraphSkipped: 0,
    modulesGraphOk: 0,
    modulesGraphUnavailable: 0,
    modulesFallbackTable: 0,
    modulesPrecheckSkipped: 0,
    moduleErrors: 0,
    fallbackModules: [],
  };
  const totalStart = nowMs();
  const setorIdsValidos = (Array.isArray(setorIds) ? setorIds : [])
    .map((id) => String(id))
    .filter(Boolean);
  if (!setorIdsValidos.length) return metrics;

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const periodLabel = tipo === 'mensal' ? `${MESES_COMPLETO[mes - 1]}/${ano}` : `Anual ${ano}`;
  const coverAssets = await loadPdfCoverAssets();
  const modsParaExportar = modulos.filter((m) => modulosSelecionados.includes(m.id));
  const FOOTER_TOP = 278;
  const CHART_PAGE_TOP = 26;
  const CHART_MAX_H_FULL_PAGE = FOOTER_TOP - CHART_PAGE_TOP;
  const CHART_MIN_SPACE_MM = 40;
  const CHART_AFTER_TABLE_GAP = 6;
  const coverPages = new Set();
  const lancamentosIndex = buildLancamentosIndex(lancamentos);
  const metasIndex = buildMetasIndex(metas);
  const lookup = {
    getLancamento: (indicadorId, anoRef, mesRef, setorRef) =>
      lancamentosIndex.get(lancamentoKey(indicadorId, anoRef, mesRef, setorRef)),
    getMeta: (indicadorId, anoRef, setorRef) =>
      metasIndex.get(metaKey(indicadorId, anoRef, setorRef)),
  };
  const incluirAlgumGrafico = conteudo === 'grafico' || conteudo === 'ambos';
  const strictGraphMode = conteudo === 'grafico';
  const workUnitsEstimate = setorIdsValidos.length * modsParaExportar.length;
  const captureThrottleMs = modoEstavel ? STABLE_CAPTURE_THROTTLE_MS : DEFAULT_CAPTURE_THROTTLE_MS;
  const rowsYieldEvery = modoEstavel ? 4 : 10;
  const modulesYieldEvery = modoEstavel ? 1 : 2;
  const irasMaxCanvasHeight = modoEstavel ? IRAS_MAX_CANVAS_HEIGHT_PX_STABLE : IRAS_MAX_CANVAS_HEIGHT_PX;
  const irasMaxSlices = modoEstavel ? IRAS_MAX_SLICES_STABLE : IRAS_MAX_SLICES;
  const moduleFallbackMap = new Map();
  let captureQualityAtual = modoEstavel ? 'rapido' : qualidade;
  if (incluirAlgumGrafico && !modoEstavel) {
    if (workUnitsEstimate >= GRAPH_BATCH_LARGE_WORK_UNITS) {
      captureQualityAtual = 'rapido';
    } else if (workUnitsEstimate >= GRAPH_BATCH_MEDIUM_WORK_UNITS) {
      captureQualityAtual = downgradeQuality(captureQualityAtual);
    }
  }
  let captureErrorsSeguidos = 0;
  let severeCaptureFailuresInRow = 0;
  let skipChartsForRest = false;
  let skipChartsReason = '';
  let isFirstSetor = true;
  console.info('[pdf-export] start', {
    tipo,
    conteudo,
    qualidade,
    captureQualityInicial: captureQualityAtual,
    modoEstavel,
    setores: setorIdsValidos.length,
    modulosSelecionados: modsParaExportar.length,
    workUnitsEstimate,
  });

  for (let setorIdx = 0; setorIdx < setorIdsValidos.length; setorIdx += 1) {
    const setorId = setorIdsValidos[setorIdx];
    const setor = setores.find((s) => String(s.id) === String(setorId));
    const nomeSetor = String(setor?.nome || `Setor ${setorId}`);
    if (!isFirstSetor) doc.addPage();
    isFirstSetor = false;

    const capaPage = doc.getNumberOfPages();
    coverPages.add(capaPage);
    const modsNomes = modsParaExportar.map((m) => m.nome).join(' · ');
    drawPdfCover(doc, {
      title: 'Relatório de Indicadores',
      subtitle: periodLabel,
      details: `${nomeSetor}${modsNomes ? ` · ${modsNomes}` : ''}`,
      generatedAt: `Gerado em ${new Date().toLocaleDateString('pt-BR')} às ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`,
      theme: PDF_THEME,
      assets: coverAssets,
    });

    const indicadoresSetor = filtrarIndicadoresPorSetorWhitelist(indicadores, setor);

    for (let moduloIdx = 0; moduloIdx < modsParaExportar.length; moduloIdx += 1) {
      const contentStart = nowMs();
      const modulo = modsParaExportar[moduloIdx];
      console.info('[pdf-export] module:start', {
        setorId,
        moduloId: modulo.id,
        moduloNome: modulo.nome,
        idx: moduloIdx + 1,
        total: modsParaExportar.length,
      });
      try {
        const inds = indicadoresSetor
          .filter((i) => String(i.modulo_id) === String(modulo.id))
          .sort((a, b) => Number(a.ordem || 0) - Number(b.ordem || 0));
        if (inds.length === 0) {
          console.info('[pdf-export] module:skip-empty', {
            setorId,
            moduloId: modulo.id,
          });
          continue;
        }

        const incluirTabela = conteudo === 'tabela' || conteudo === 'ambos';
        const incluirGrafico = conteudo === 'grafico' || conteudo === 'ambos';
        const fluxoAmbos = incluirTabela && incluirGrafico;
        const isIras = getModuloDashboardKind(modulo) === 'iras';
        const conservativeGraphPrecheck = incluirGrafico && workUnitsEstimate >= GRAPH_BATCH_MEDIUM_WORK_UNITS;
        const redrawModuloHeader = () => drawModuleHeader(doc, `${modulo.nome} · ${nomeSetor}`, periodLabel);

      const drawModuloTabela = async (yStart) => {
        const drawTableSectionHeader = (baseY) => {
          let y = baseY;
          doc.setFontSize(9);
          doc.setFont('helvetica', 'bold');
          doc.setTextColor(
            PDF_THEME.tableHeaderText[0],
            PDF_THEME.tableHeaderText[1],
            PDF_THEME.tableHeaderText[2],
          );
          doc.text('RESUMO DE INDICADORES', 14, y);
          y += 5;
          return drawTableHeader(doc, y, tipo);
        };

        const sectionHeaderHeight = 5 + TABLE_HEADER_H + TABLE_HEADER_GAP;
        const pageStartY = 30;
        const availableCurrentPage = Math.max(0, TABLE_PAGE_BOTTOM - yStart);
        const availableFreshPage = Math.max(0, TABLE_PAGE_BOTTOM - pageStartY);
        const rowLayouts = [];
        let rowsTotalHeight = 0;
        for (let idx = 0; idx < inds.length; idx++) {
          const rowLayout = buildTableRowLayout(doc, inds[idx], lookup, tipo, mes, ano, setorId);
          rowLayouts.push(rowLayout);
          rowsTotalHeight += rowLayout.rowHeight;
          if ((idx + 1) % rowsYieldEvery === 0) await yieldToMainThread();
        }
        const totalBlockHeight = sectionHeaderHeight + rowsTotalHeight;

        // Regra principal: não repartir tabela quando ela cabe inteira.
        const drawWholeTable = (startY) => {
          let y = drawTableSectionHeader(startY);
          rowLayouts.forEach((layout, idx) => {
            y = drawTableRow(doc, y, layout, idx);
          });
          return y;
        };

        if (totalBlockHeight <= availableCurrentPage) {
          return drawWholeTable(yStart);
        }

        if (totalBlockHeight <= availableFreshPage) {
          doc.addPage();
          redrawModuloHeader();
          return drawWholeTable(pageStartY);
        }

        // Fallback controlado: tabela maior que página inteira.
        // Ainda assim, a quebra ocorre apenas entre linhas (nunca no meio da linha).
        let y = drawTableSectionHeader(yStart);
        for (let idx = 0; idx < rowLayouts.length; idx++) {
          const rowLayout = rowLayouts[idx];
          const nextY = y + rowLayout.rowHeight;
          if (nextY > TABLE_PAGE_BOTTOM) {
            doc.addPage();
            redrawModuloHeader();
            y = drawTableSectionHeader(pageStartY);
          }
          y = drawTableRow(doc, y, rowLayout, idx);
          if ((idx + 1) % rowsYieldEvery === 0) {
            await yieldToMainThread();
          }
        }
        return y;
      };

      const chartLayout = isIras
        ? { chartX: IRAS_CHART_X, maxW: IRAS_CHART_MAX_W, widthFirst: true }
        : { chartX: CHART_MARGIN_X, maxW: CHART_MAX_W_DEFAULT, widthFirst: false };

      const placeChartImage = async (sourceCanvas, chartY, maxH) => {
        if (!sourceCanvas?.width) return;

        const { chartX, maxW, widthFirst } = chartLayout;
        const safeMaxH = Math.max(10, maxH);
        const chartImageFormat = resolveChartImageFormat({ isIras, modoEstavel });
        let canvasForDraw = sourceCanvas;
        let irasSimplified = false;

        if (widthFirst) {
          const beforeHeight = canvasForDraw.height;
          canvasForDraw = clampCanvasHeight(canvasForDraw, irasMaxCanvasHeight);
          irasSimplified = canvasForDraw.height < beforeHeight;
          const slicingResult = await addImageSlicedVertical(
            doc,
            canvasForDraw,
            chartX,
            chartY,
            maxW,
            safeMaxH,
            redrawModuloHeader,
            CHART_PAGE_TOP,
            {
              maxSlices: irasMaxSlices,
              maxProcessingMs: IRAS_MAX_SLICE_WORK_MS,
            }
          );
          return {
            rendered: !!slicingResult?.completed,
            limited: !!slicingResult?.clipped,
            slices: slicingResult?.slices || 0,
            simplified: irasSimplified,
          };
        }

        const { w: drawW, h: drawH } = fitImageToBox(
          canvasForDraw.width,
          canvasForDraw.height,
          maxW,
          safeMaxH,
        );
        const x = chartX + (maxW - drawW) / 2;
        addDocImage(doc, canvasForDraw, chartImageFormat, x, chartY, drawW, drawH);
        return { rendered: true, limited: false, slices: 1, simplified: false };
      };

      const fallbackKey = moduleScopeKey(modulo.id, setorId);
      const fallbackReasonPrev = moduleFallbackMap.get(fallbackKey);
      let chartCanvas = null;
      let fallbackThisModuleReason = fallbackReasonPrev || null;
      let precheckInfo = null;
      let captureElement = null;
      if (!strictGraphMode && incluirGrafico && skipChartsForRest && !fallbackThisModuleReason) {
        fallbackThisModuleReason = skipChartsReason || 'capture_error';
        moduleFallbackMap.set(fallbackKey, fallbackThisModuleReason);
        console.warn('[pdf-export] skip chart capture for remaining modules', {
          setorId,
          moduloId: modulo.id,
          moduloNome: modulo.nome,
          reason: skipChartsReason || 'capture_failure',
        });
      }
      if (incluirGrafico && incluirAlgumGrafico && !fallbackReasonPrev) {
        captureElement = findChartCaptureElement(modulo.id, setorId);
        precheckInfo = precheckCaptureElementCost({
          element: captureElement,
          isIras,
          modoEstavel,
          conservative: conservativeGraphPrecheck,
        });
        if (!precheckInfo.ok) {
          fallbackThisModuleReason = precheckInfo.reason || 'precheck_limit';
          moduleFallbackMap.set(fallbackKey, fallbackThisModuleReason);
          metrics.modulesPrecheckSkipped += 1;
          console.warn('[pdf-export] precheck fallback_table', {
            moduloId: modulo.id,
            moduloNome: modulo.nome,
            setorId,
            reason: fallbackThisModuleReason,
            width: precheckInfo.width,
            height: precheckInfo.height,
            area: precheckInfo.area,
            childNodes: precheckInfo.childNodes,
            maxArea: 'maxArea' in precheckInfo ? precheckInfo.maxArea : undefined,
            maxHeight: 'maxHeight' in precheckInfo ? precheckInfo.maxHeight : undefined,
          });
        }
      }
      if (incluirGrafico && incluirAlgumGrafico && !fallbackReasonPrev && !fallbackThisModuleReason) {
        const captureStart = nowMs();
        metrics.captureAttempts += 1;
        try {
          const captureTimeout = isIras ? CAPTURE_TIMEOUT_MS_IRAS : CAPTURE_TIMEOUT_MS;
          chartCanvas = await captureDashboardCard({
            element: captureElement,
            moduloId: modulo.id,
            setorId,
            quality: captureQualityAtual,
            isIras,
            throttleMs: captureThrottleMs,
            timeoutMs: captureTimeout,
          });
          const captureElapsed = nowMs() - captureStart;
          metrics.captureMs += captureElapsed;
          captureErrorsSeguidos = 0;
          severeCaptureFailuresInRow = 0;

          const captureSlowThreshold = isIras ? IRAS_CAPTURE_SLOW_THRESHOLD_MS : SLOW_CAPTURE_THRESHOLD_MS;
          if (captureElapsed > captureSlowThreshold && captureQualityAtual !== 'rapido') {
            const previousQuality = captureQualityAtual;
            const nextQuality = downgradeQuality(captureQualityAtual);
            if (nextQuality !== captureQualityAtual) {
              captureQualityAtual = nextQuality;
              metrics.fallbackCount += 1;
              metrics.fallbackActivated = true;
              console.warn('[pdf-export] slow capture quality downgrade', {
                moduloId: modulo.id,
                setorId,
                captureElapsedMs: Math.round(captureElapsed),
                previousQuality,
                nextQuality,
              });
            }
          }
        } catch (error) {
          metrics.captureErrors += 1;
          captureErrorsSeguidos += 1;
          metrics.captureMs += nowMs() - captureStart;
          const msg = error instanceof Error ? error.message : String(error);
          fallbackThisModuleReason = String(msg).includes('capture_timeout_') ? 'timeout' : 'capture_error';
          moduleFallbackMap.set(fallbackKey, fallbackThisModuleReason);
          severeCaptureFailuresInRow += 1;
          if (!strictGraphMode && !skipChartsForRest && severeCaptureFailuresInRow >= SEVERE_CAPTURE_FAILURES_TO_SKIP_REST) {
            skipChartsForRest = true;
            skipChartsReason = fallbackThisModuleReason;
            console.warn('[pdf-export] activating skipChartsForRest after severe failures', {
              moduloId: modulo.id,
              setorId,
              reason: skipChartsReason,
              severeFailuresInRow: severeCaptureFailuresInRow,
            });
          } else {
            console.warn('[pdf-export] severe capture failure but keeping next chart attempts', {
              moduloId: modulo.id,
              setorId,
              reason: fallbackThisModuleReason,
              severeFailuresInRow: severeCaptureFailuresInRow,
              threshold: SEVERE_CAPTURE_FAILURES_TO_SKIP_REST,
            });
          }
          console.warn('[pdf-export] capture failed', {
            moduloId: modulo.id,
            setorId,
            quality: captureQualityAtual,
            error: msg,
          });

          if (captureErrorsSeguidos >= CAPTURE_ERROR_FALLBACK_THRESHOLD && captureQualityAtual !== 'rapido') {
            const nextQuality = downgradeQuality(captureQualityAtual);
            if (nextQuality !== captureQualityAtual) {
              captureQualityAtual = nextQuality;
              metrics.fallbackCount += 1;
              metrics.fallbackActivated = true;
              console.warn('[pdf-export] error fallback activated', {
                moduloId: modulo.id,
                setorId,
                errorsInRow: captureErrorsSeguidos,
                nextQuality,
              });
            }
          }
        }
      }
      if (incluirGrafico && !chartCanvas && !fallbackThisModuleReason) {
        fallbackThisModuleReason = 'capture_error';
        moduleFallbackMap.set(fallbackKey, fallbackThisModuleReason);
        console.warn('[pdf-export] chart-missing forcing table fallback', {
          moduloId: modulo.id,
          moduloNome: modulo.nome,
          setorId,
        });
      }
      const shouldUseTableFallback = !strictGraphMode && !!fallbackThisModuleReason;
      const fluxoAmbosEfetivo = fluxoAmbos || (incluirGrafico && !incluirTabela && shouldUseTableFallback);
      if (shouldUseTableFallback) {
        metrics.modulesFallbackTable += 1;
        metrics.fallbackActivated = true;
        metrics.fallbackCount += 1;
        metrics.fallbackModules.push({
          moduloId: String(modulo.id),
          moduloNome: String(modulo.nome || modulo.id),
          setorId: String(setorId),
          motivo: fallbackThisModuleReason,
        });
        console.warn('[pdf-export] module fallback_table', {
          moduloId: modulo.id,
          moduloNome: modulo.nome,
          setorId,
          reason: fallbackThisModuleReason,
        });
      }

      if (fluxoAmbosEfetivo) {
        doc.addPage();
        drawModuleHeader(doc, `${modulo.nome} · ${nomeSetor}`, periodLabel);
        let y = await drawModuloTabela(30);

        if (chartCanvas && !shouldUseTableFallback) {
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

          const chartPlacement = await placeChartImage(chartCanvas, chartY, availableH);
          if (isIras && chartPlacement?.simplified) {
            metrics.irasSimplified += 1;
          }
          if (isIras && chartPlacement?.limited) {
            moduleFallbackMap.set(fallbackKey, 'slice_limit');
            metrics.irasGraphSkipped += 1;
            if (!strictGraphMode) {
              metrics.modulesFallbackTable += 1;
            }
            metrics.fallbackActivated = true;
            metrics.fallbackCount += 1;
            if (!strictGraphMode) {
              metrics.fallbackModules.push({
                moduloId: String(modulo.id),
                moduloNome: String(modulo.nome || modulo.id),
                setorId: String(setorId),
                motivo: 'slice_limit',
              });
            }
            console.warn('[pdf-export] iras graph skipped after slice limits', {
              moduloId: modulo.id,
              setorId,
              slices: chartPlacement?.slices,
              quality: captureQualityAtual,
            });
          }
        }
        if (shouldUseTableFallback) {
          doc.setFontSize(8);
          doc.setTextColor(120, 90, 0);
          doc.text(
            `Gráfico deste módulo omitido por proteção (${formatFallbackReason(fallbackThisModuleReason)}).`,
            14,
            Math.min(286, y + 6)
          );
          doc.setTextColor(40, 40, 40);
        } else {
          metrics.modulesGraphOk += 1;
        }
      } else if (incluirTabela) {
        doc.addPage();
        drawModuleHeader(doc, `${modulo.nome} · ${nomeSetor}`, periodLabel);
        await drawModuloTabela(30);
      } else if (incluirGrafico) {
        doc.addPage();
        drawModuleHeader(doc, `${modulo.nome} · ${nomeSetor}`, periodLabel);
        if (chartCanvas) {
          const maxH = isIras ? CHART_MAX_H_FULL_PAGE : FOOTER_TOP - CHART_PAGE_TOP;
          const chartPlacement = await placeChartImage(chartCanvas, CHART_PAGE_TOP, maxH);
          if (isIras && chartPlacement?.simplified) {
            metrics.irasSimplified += 1;
          }
          if (isIras && chartPlacement?.limited) {
            moduleFallbackMap.set(fallbackKey, 'slice_limit');
            metrics.irasGraphSkipped += 1;
            if (!strictGraphMode) {
              metrics.modulesFallbackTable += 1;
            }
            metrics.fallbackActivated = true;
            metrics.fallbackCount += 1;
            if (!strictGraphMode) {
              metrics.fallbackModules.push({
                moduloId: String(modulo.id),
                moduloNome: String(modulo.nome || modulo.id),
                setorId: String(setorId),
                motivo: 'slice_limit',
              });
            }
            doc.setFontSize(8);
            doc.setTextColor(120, 90, 0);
            doc.text(
              strictGraphMode
                ? 'Gráfico IRAS indisponível neste módulo por proteção de desempenho.'
                : 'Gráfico IRAS simplificado por proteção de desempenho. Utilize "Tabela" para detalhamento completo.',
              14,
              286
            );
            doc.setTextColor(40, 40, 40);
            console.warn('[pdf-export] iras graph-only limited', {
              moduloId: modulo.id,
              setorId,
              slices: chartPlacement?.slices,
              quality: captureQualityAtual,
            });
          } else {
            metrics.modulesGraphOk += 1;
          }
        } else {
          metrics.modulesGraphUnavailable += 1;
          doc.setFontSize(9);
          doc.setTextColor(130, 90, 20);
          doc.text('Gráfico indisponível neste módulo.', 14, 34);
          if (fallbackThisModuleReason) {
            doc.setFontSize(8);
            doc.setTextColor(100, 100, 100);
            doc.text(`Motivo: ${formatFallbackReason(fallbackThisModuleReason)}.`, 14, 40);
          }
          doc.setTextColor(40, 40, 40);
          console.warn('[pdf-export] strict graph mode unavailable module', {
            moduloId: modulo.id,
            moduloNome: modulo.nome,
            setorId,
            reason: fallbackThisModuleReason || 'capture_unavailable',
          });
        }
      }
        chartCanvas = null;
      } catch (error) {
        metrics.moduleErrors += 1;
        const msg = error instanceof Error ? error.message : String(error);
        console.error('[pdf-export] module:error', {
          setorId,
          moduloId: modulo.id,
          moduloNome: modulo.nome,
          error: msg,
          stack: error instanceof Error ? error.stack : undefined,
        });
        doc.addPage();
        drawModuleHeader(doc, `${modulo.nome} · ${nomeSetor}`, periodLabel);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9);
        doc.setTextColor(160, 60, 60);
        doc.text('Módulo não pôde ser renderizado completamente; exportado parcialmente.', 14, 32);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.setTextColor(90, 90, 90);
        doc.text(`Motivo: ${msg.slice(0, 110)}`, 14, 38);
        doc.setTextColor(40, 40, 40);
      } finally {
        if ((moduloIdx + 1) % modulesYieldEvery === 0) {
          await yieldToMainThread();
        }
        metrics.contentMs += nowMs() - contentStart;
      }
    }
    if ((setorIdx + 1) % 1 === 0) {
      await yieldToMainThread();
    }
  }

  const totalPages = doc.getNumberOfPages();
  let contentPage = 0;
  for (let p = 1; p <= totalPages; p++) {
    if (coverPages.has(p)) continue;
    contentPage += 1;
    doc.setPage(p);
    if (metrics.modulesFallbackTable > 0) {
      doc.setFontSize(6.5);
      doc.setTextColor(130, 120, 90);
      doc.text('Alguns módulos foram exportados somente em tabela para garantir estabilidade.', 14, 288);
    }
    doc.setFontSize(7);
    doc.setTextColor(180, 180, 180);
    doc.text(`Pág. ${contentPage}  ·  ${periodLabel}`, 14, 292);
    doc.text('Gerado automaticamente', 155, 292);
  }

  const saveStart = nowMs();
  doc.save(`Relatorio_${tipo === 'mensal' ? `${MESES_COMPLETO[mes - 1]}_` : 'Anual_'}${ano}.pdf`);
  metrics.saveMs = nowMs() - saveStart;
  metrics.totalMs = nowMs() - totalStart;
  metrics.captureQualityFinal = captureQualityAtual;
  console.info('[pdf-export] done', {
    totalPages,
    totalMs: Math.round(metrics.totalMs),
    captureMs: Math.round(metrics.captureMs),
    fallbackCount: metrics.fallbackCount,
    moduleErrors: metrics.moduleErrors,
    modulesGraphUnavailable: metrics.modulesGraphUnavailable,
    modulesFallbackTable: metrics.modulesFallbackTable,
    skipChartsForRest,
    skipChartsReason,
  });
  return metrics;
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
  const { toast } = useToast();
  const [tipo, setTipo] = useState('mensal');
  const [mesSel, setMesSel] = useState(String(mesAtual));
  const [anoSel, setAnoSel] = useState(String(anoAtual));
  const [modulosSelecionados, setModulosSelecionados] = useState([]);
  const [loading, setLoading] = useState(false);
  const [conteudo, setConteudo] = useState('ambos'); // 'grafico' | 'tabela' | 'ambos'
  const [qualidade, setQualidade] = useState('padrao');
  const [modoEstavel, setModoEstavel] = useState(false);
  const [exportSetorIds, setExportSetorIds] = useState([]);
  const [lastMetrics, setLastMetrics] = useState(null);
  const [metricsHistory, setMetricsHistory] = useState([]);

  useEffect(() => {
    if (open) {
      setModulosSelecionados(modulos.map(m => m.id));
      const prefIds = Array.isArray(dashboardSetorId) ? dashboardSetorId.map((id) => String(id)).filter(Boolean) : [];
      if (prefIds.length > 0) {
        setExportSetorIds([...new Set(prefIds)]);
      } else if (dashboardSetorId) {
        setExportSetorIds([String(dashboardSetorId)]);
      } else {
        setExportSetorIds(setores.map((s) => String(s.id)));
      }
    }
  }, [open, modulos, dashboardSetorId, setores]);

  const toggleModulo = (id) =>
    setModulosSelecionados(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

  const toggleAll = () =>
    setModulosSelecionados(modulosSelecionados.length === modulos.length ? [] : modulos.map(m => m.id));

  const toggleSetor = (id) =>
    setExportSetorIds((prev) =>
      prev.includes(String(id))
        ? prev.filter((x) => String(x) !== String(id))
        : [...prev, String(id)]
    );

  const toggleAllSetores = () =>
    setExportSetorIds(
      exportSetorIds.length === setores.length ? [] : setores.map((s) => String(s.id))
    );

  const handleExport = async () => {
    if (!exportSetorIds.length) return;
    const selectedModules = modulosSelecionados.length;
    const selectedSetores = exportSetorIds.length;
    const workUnits = selectedModules * selectedSetores;
    const maxWorkUnits = conteudo === 'tabela' ? MAX_WORK_UNITS_TABLE_ONLY : MAX_WORK_UNITS_WITH_GRAPH;
    let conteudoEfetivo = conteudo;
    if (workUnits > maxWorkUnits) {
      toast({
        title: 'Exportação grande',
        description: `Este lote (${workUnits} blocos) pode ficar lento. Mantendo ${conteudoEfetivo}; se necessário, exporte em partes.`,
      });
    }
    try {
      setLoading(true);
      console.info('[pdf-export] handleExport:start', {
        conteudo,
        conteudoEfetivo,
        tipo,
        mes: Number(mesSel),
        ano: Number(anoSel),
        setores: selectedSetores,
        modulos: selectedModules,
        workUnits,
      });
      const metrics = await gerarPDF({
        modulos,
        indicadores,
        lancamentos,
        metas,
        modulosSelecionados,
        tipo,
        mes: Number(mesSel),
        ano: Number(anoSel),
        conteudo: conteudoEfetivo,
        qualidade,
        modoEstavel,
        setorIds: exportSetorIds,
        setores,
      });
      const metricsSec = {
        captura_s: Number((metrics.captureMs / 1000).toFixed(3)),
        conteudo_s: Number((metrics.contentMs / 1000).toFixed(3)),
        save_s: Number((metrics.saveMs / 1000).toFixed(3)),
        total_s: Number((metrics.totalMs / 1000).toFixed(3)),
        fallback_ativado: !!metrics.fallbackActivated,
        fallback_count: Number(metrics.fallbackCount || 0),
        capture_errors: Number(metrics.captureErrors || 0),
        module_errors: Number(metrics.moduleErrors || 0),
        modules_graph_unavailable: Number(metrics.modulesGraphUnavailable || 0),
        quality_final: metrics.captureQualityFinal || (modoEstavel ? 'rapido' : qualidade),
        iras_simplified: Number(metrics.irasSimplified || 0),
        iras_graph_skipped: Number(metrics.irasGraphSkipped || 0),
        modules_graph_ok: Number(metrics.modulesGraphOk || 0),
        modules_fallback_tabela: Number(metrics.modulesFallbackTable || 0),
        modules_precheck_skipped: Number(metrics.modulesPrecheckSkipped || 0),
      };
      const fallbackModules = Array.isArray(metrics.fallbackModules) ? metrics.fallbackModules.slice(0, 5) : [];
      const snapshot = {
        ...metricsSec,
        conteudo: conteudoEfetivo,
        qualidade,
        modo_estavel: modoEstavel,
        setores: exportSetorIds.length,
        modulos: modulosSelecionados.length,
        fallback_modules: fallbackModules,
        at: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      };
      setLastMetrics(snapshot);
      setMetricsHistory((prev) => [snapshot, ...prev].slice(0, 5));
      // Telemetria simples para benchmark real no navegador.
      console.info('[pdf-export] timings', metricsSec);
      if (metricsSec.module_errors > 0 || metricsSec.modules_graph_unavailable > 0) {
        toast({
          title: 'PDF gerado parcialmente',
          description: `Concluído em ${metricsSec.total_s}s com ${metricsSec.module_errors} falha(s) e ${metricsSec.modules_graph_unavailable} gráfico(s) indisponível(is).`,
        });
      } else {
        toast({
          title: 'PDF gerado com sucesso',
          description: `Exportação concluída em ${metricsSec.total_s}s.`,
        });
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error('[pdf-export] handleExport:error', {
        conteudo,
        conteudoEfetivo,
        tipo,
        mes: Number(mesSel),
        ano: Number(anoSel),
        setores: selectedSetores,
        modulos: selectedModules,
        workUnits,
        error: msg,
        stack: error instanceof Error ? error.stack : undefined,
      });
      toast({
        variant: 'destructive',
        title: 'Falha ao gerar PDF',
        description: 'A exportação não foi concluída. Tente com menos módulos/setores ou modo Tabela.',
      });
    } finally {
      setLoading(false);
    }
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

          {/* Setores (cada setor gera capa + bloco próprio) */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Setores no PDF</Label>
              <button onClick={toggleAllSetores} className="text-xs text-indigo-600 hover:underline">
                {exportSetorIds.length === setores.length ? 'Desmarcar todos' : 'Selecionar todos'}
              </button>
            </div>
            <div className="grid grid-cols-1 gap-2 max-h-36 overflow-y-auto pr-1">
              {setores.map((s) => {
                const selected = exportSetorIds.includes(String(s.id));
                return (
                  <button
                    key={s.id}
                    onClick={() => toggleSetor(s.id)}
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
                    <span className="truncate">{s.nome}</span>
                  </button>
                );
              })}
            </div>
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

          {/* Qualidade */}
          <div>
            <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Qualidade</Label>
            <Select value={qualidade} onValueChange={setQualidade} disabled={modoEstavel}>
              <SelectTrigger className="mt-1 h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="rapido">Rápido</SelectItem>
                <SelectItem value="padrao">Padrão</SelectItem>
                <SelectItem value="alta">Alta</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground mt-1">
              Rápido acelera exportação; Alta aumenta nitidez e custo de processamento.
              {modoEstavel ? ' Modo estável ativo: qualidade efetiva fixa em Rápido.' : ''}
            </p>
          </div>

          {/* Modo estável */}
          <div className="rounded-lg border border-amber-200 bg-amber-50/60 px-3 py-2">
            <div className="flex items-start gap-2">
              <Checkbox
                id="pdf-modo-estavel"
                checked={modoEstavel}
                onCheckedChange={(checked) => setModoEstavel(Boolean(checked))}
                className="mt-0.5"
              />
              <div className="space-y-1">
                <Label htmlFor="pdf-modo-estavel" className="text-xs font-semibold uppercase tracking-wide text-amber-900">
                  Modo estável (anti-travamento)
                </Label>
                <p className="text-[11px] text-amber-900/90">
                  Prioriza estabilidade em lotes grandes: força captura rápida, aumenta respiros no processamento e reduz picos.
                </p>
              </div>
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
            💡 O PDF será gerado em blocos sequenciais por setor (capa do setor + conteúdo), sempre em página normal.
            Os gráficos são capturados do dashboard atual para cada setor selecionado.
          </p>

          {(lastMetrics || metricsHistory.length > 0) && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50/60 px-3 py-2.5 space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-emerald-900">Benchmark da exportação</p>
              {lastMetrics && (
                <p className="text-xs text-emerald-900">
                  Última: total <strong>{lastMetrics.total_s}s</strong> (captura {lastMetrics.captura_s}s, conteúdo {lastMetrics.conteudo_s}s, salvar {lastMetrics.save_s}s)
                </p>
              )}
              {lastMetrics?.fallback_ativado && (
                <p className="text-[11px] text-emerald-900/90">
                  Proteção automática ativada ({lastMetrics.fallback_count}x): qualidade final {lastMetrics.quality_final}.
                </p>
              )}
              <p className="text-[11px] text-emerald-900/90">
                Módulos: gráfico ok {lastMetrics?.modules_graph_ok ?? 0} · fallback tabela {lastMetrics?.modules_fallback_tabela ?? 0} · pré-check skip {lastMetrics?.modules_precheck_skipped ?? 0}
              </p>
              {(lastMetrics?.iras_simplified > 0 || lastMetrics?.iras_graph_skipped > 0) && (
                <p className="text-[11px] text-emerald-900/90">
                  IRAS: {lastMetrics.iras_simplified} simplificado(s), {lastMetrics.iras_graph_skipped} gráfico(s) limitado(s)/pulado(s) por proteção.
                </p>
              )}
              {Array.isArray(lastMetrics?.fallback_modules) && lastMetrics.fallback_modules.length > 0 && (
                <div className="space-y-1">
                  {lastMetrics.fallback_modules.map((item, idx) => (
                    <p key={`fb-${item.moduloId}-${item.setorId}-${idx}`} className="text-[11px] text-emerald-900/90">
                      fallback · {item.moduloNome} (setor {item.setorId}): {formatFallbackReason(item.motivo)}
                    </p>
                  ))}
                </div>
              )}
              {metricsHistory.length > 1 && (
                <div className="space-y-1">
                  {metricsHistory.slice(0, 5).map((item, idx) => (
                    <p key={`${item.at}-${idx}`} className="text-[11px] text-emerald-900/90">
                      {item.at} · {item.conteudo}/{item.qualidade}{item.modo_estavel ? '+estável' : ''} · {item.setores} setor(es), {item.modulos} módulo(s): {item.total_s}s
                      {item.iras_simplified > 0 || item.iras_graph_skipped > 0
                        ? ` · IRAS sim:${item.iras_simplified} skip:${item.iras_graph_skipped}`
                        : ''}
                      {item.modules_fallback_tabela > 0
                        ? ` · fallback tabela:${item.modules_fallback_tabela}`
                        : ''}
                      {item.modules_precheck_skipped > 0
                        ? ` · precheck:${item.modules_precheck_skipped}`
                        : ''}
                    </p>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" onClick={onClose} disabled={loading}>Cancelar</Button>
            <Button
              disabled={loading || modulosSelecionados.length === 0 || exportSetorIds.length === 0}
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