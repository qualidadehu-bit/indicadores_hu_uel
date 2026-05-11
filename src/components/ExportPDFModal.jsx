import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FileDown, Loader2, CheckSquare, Square } from 'lucide-react';
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';

const MESES_COMPLETO = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

// ---- PDF helpers ----
const MESES_ABREV = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];

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
  doc.setFillColor(10, 45, 94);
  doc.rect(0, 0, 210, 22, 'F');
  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(255, 255, 255);
  doc.text(nome, 14, 10);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(160, 200, 255);
  doc.text(`Período: ${periodLabel}`, 14, 17);
}

function drawTableHeader(doc, y, tipo) {
  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'bold');
  doc.setFillColor(230, 238, 255);
  doc.rect(14, y, 182, 7, 'F');
  doc.setTextColor(30, 50, 100);
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
    doc.setFillColor(248, 250, 255);
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

// ---- Capture live dashboard cards from the DOM ----
async function captureDashboardCards(modulosSelecionados) {
  const canvases = {};
  for (const moduloId of modulosSelecionados) {
    const el = document.querySelector(`[data-modulo-id="${moduloId}"]`);
    if (!el) continue;
    try {
      const canvas = await html2canvas(el, {
        scale: 2,
        backgroundColor: '#ffffff',
        useCORS: true,
        logging: false,
        allowTaint: true,
      });
      canvases[moduloId] = canvas.toDataURL('image/png');
    } catch (e) {
      // skip on error
    }
  }
  return canvases;
}

// ---- Main PDF generator ----
async function gerarPDF({ modulos, indicadores, lancamentos, metas, modulosSelecionados, tipo, mes, ano, conteudo = 'ambos', setorId }) {
  // First capture live charts from DOM
  const chartCanvases = await captureDashboardCards(modulosSelecionados);

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const periodLabel = tipo === 'mensal' ? `${MESES_COMPLETO[mes - 1]}/${ano}` : `Anual ${ano}`;

  // ---- Cover ----
  doc.setFillColor(10, 45, 94);
  doc.rect(0, 0, 210, 297, 'F');
  doc.setFontSize(30);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(255, 255, 255);
  doc.text('Relatório de', 20, 90);
  doc.text('Indicadores', 20, 107);
  doc.setFontSize(17);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(160, 200, 255);
  doc.text(periodLabel, 20, 122);
  doc.setFontSize(9);
  doc.setTextColor(100, 140, 210);
  const modsNomes = modulos.filter(m => modulosSelecionados.includes(m.id)).map(m => m.nome).join(' · ');
  const modsLines = doc.splitTextToSize(modsNomes, 170);
  doc.text(modsLines, 20, 140);
  doc.setFontSize(8);
  doc.setTextColor(80, 120, 190);
  doc.text(`Gerado em ${new Date().toLocaleDateString('pt-BR')} às ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`, 20, 280);

  const modsParaExportar = modulos.filter(m => modulosSelecionados.includes(m.id));

  for (const modulo of modsParaExportar) {
    const inds = indicadores
      .filter(i => i.modulo_id === modulo.id)
      .sort((a, b) => (a.ordem || 0) - (b.ordem || 0));
    if (inds.length === 0) continue;

    const incluirTabela = conteudo === 'tabela' || conteudo === 'ambos';
    const incluirGrafico = conteudo === 'grafico' || conteudo === 'ambos';

    // ---- TABLE PAGE ----
    if (incluirTabela) {
      doc.addPage();
      drawModuleHeader(doc, modulo.nome, periodLabel);
      let y = 30;

      doc.setFontSize(9);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(30, 50, 100);
      doc.text('RESUMO DE INDICADORES', 14, y);
      y += 5;
      y = drawTableHeader(doc, y, tipo);

      for (let idx = 0; idx < inds.length; idx++) {
        if (y > 272) { doc.addPage(); y = 14; }
        y = drawTableRow(doc, y, inds[idx], lancamentos, metas, tipo, mes, ano, idx, setorId);
      }
    }

    // ---- CHART PAGE — use live DOM capture ----
    if (incluirGrafico) {
      const imgData = chartCanvases[modulo.id];
      if (imgData) {
        doc.addPage();
        drawModuleHeader(doc, `${modulo.nome} — Visualização`, periodLabel);

        const img = new Image();
        img.src = imgData;
        await new Promise(resolve => { img.onload = resolve; });
        const imgW = 182;
        const imgH = (img.naturalHeight / img.naturalWidth) * imgW;
        const maxH = 260;
        const finalH = Math.min(imgH, maxH);

        doc.addImage(imgData, 'PNG', 14, 26, imgW, finalH);
      }
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
    await gerarPDF({
      modulos,
      indicadores,
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

  const anos = [anoAtual - 1, anoAtual, anoAtual + 1];

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