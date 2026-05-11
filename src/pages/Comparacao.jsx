import { useState } from 'react';
import { api } from '@/api/apiClient';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeftRight, FileDown, Loader2 } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import BadgeTendencia from '@/components/BadgeTendencia';
import BadgeStatusMeta from '@/components/BadgeStatusMeta';
import { MESES, MESES_COMPLETO, calcularStatusMeta, calcularTendencia } from '@/lib/indicadores';
import { jsPDF } from 'jspdf';

const ANOS = [2022, 2023, 2024, 2025, 2026];

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

function gerarPDFComparacao({ modulos, indicadores, lancamentosA, lancamentosB, metas, labelA, labelB, setorId, anoMetaB }) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  // Cover
  doc.setFillColor(10, 45, 94);
  doc.rect(0, 0, 210, 297, 'F');
  doc.setFontSize(26);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(255, 255, 255);
  doc.text('Relatório de', 20, 90);
  doc.text('Comparação de Períodos', 20, 106);
  doc.setFontSize(14);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(160, 200, 255);
  doc.text(`${labelA}  ×  ${labelB}`, 20, 122);
  doc.setFontSize(8);
  doc.setTextColor(80, 120, 190);
  doc.text(`Gerado em ${new Date().toLocaleDateString('pt-BR')} às ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`, 20, 280);

  const getValor = (lancamentos, indicadorId) =>
    lancamentos.find(l => l.indicador_id === indicadorId && l.setor_id === setorId)?.valor ?? null;
  const getMeta = (indicadorId) =>
    metas.find(m => m.indicador_id === indicadorId && m.setor_id === setorId && m.ano === anoMetaB);

  const modulosComInds = modulos
    .map(mod => ({ mod, inds: indicadores.filter(i => i.modulo_id === mod.id).sort((a, b) => (a.ordem || 0) - (b.ordem || 0)) }))
    .filter(({ inds }) => inds.length > 0);

  for (const { mod, inds } of modulosComInds) {
    doc.addPage();

    // Page header
    doc.setFillColor(10, 45, 94);
    doc.rect(0, 0, 210, 22, 'F');
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(255, 255, 255);
    doc.text(mod.nome, 14, 10);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(160, 200, 255);
    doc.text(`Comparação: ${labelA}  ×  ${labelB}`, 14, 17);

    let y = 30;

    // Table header
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.setFillColor(230, 238, 255);
    doc.rect(14, y, 182, 7, 'F');
    doc.setTextColor(30, 50, 100);
    doc.text('INDICADOR', 16, y + 5);
    doc.text('UNIDADE', 72, y + 5);
    doc.text(labelA, 95, y + 5);
    doc.text(labelB, 122, y + 5);
    doc.text('META', 149, y + 5);
    doc.text('VAR.%', 163, y + 5);
    doc.text('STATUS', 177, y + 5);
    y += 9;

    inds.forEach((ind, idx) => {
      if (y > 272) { doc.addPage(); y = 14; }

      const vA = getValor(lancamentosA, ind.id);
      const vB = getValor(lancamentosB, ind.id);
      const meta = getMeta(ind.id);
      const variacao = vA !== null && vB !== null && vA !== 0
        ? ((vB - vA) / Math.abs(vA)) * 100
        : null;
      const st = calcStatus(vB, meta?.valor, ind.tipo_direcao_meta);

      if (idx % 2 === 0) {
        doc.setFillColor(248, 250, 255);
        doc.rect(14, y - 1, 182, 7, 'F');
      }

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(40, 40, 40);

      const nomeLines = doc.splitTextToSize(ind.label || ind.nome, 52);
      doc.text(nomeLines, 16, y + 4);
      doc.text(ind.unidade || '—', 72, y + 4);
      doc.text(vA !== null ? String(vA) : '—', 95, y + 4);
      doc.text(vB !== null ? String(vB) : '—', 122, y + 4);
      doc.text(meta?.valor !== null && meta?.valor !== undefined ? String(meta.valor) : '—', 149, y + 4);

      if (variacao !== null) {
        doc.setTextColor(variacao > 0 ? 34 : variacao < 0 ? 200 : 100, variacao > 0 ? 139 : variacao < 0 ? 0 : 100, 34);
        doc.text(`${variacao > 0 ? '+' : ''}${variacao.toFixed(1)}%`, 163, y + 4);
      } else {
        doc.setTextColor(150, 150, 150);
        doc.text('—', 163, y + 4);
      }

      doc.setTextColor(...statusColor(st));
      doc.setFont('helvetica', 'bold');
      doc.text(st, 177, y + 4);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(40, 40, 40);

      y += 7;
    });
  }

  // Footer
  const total = doc.getNumberOfPages();
  for (let p = 2; p <= total; p++) {
    doc.setPage(p);
    doc.setFontSize(7);
    doc.setTextColor(180, 180, 180);
    doc.text(`Pág. ${p - 1} / ${total - 1}  ·  ${labelA} × ${labelB}`, 14, 292);
    doc.text('Gerado automaticamente', 155, 292);
  }

  doc.save(`Comparacao_${labelA.replace(/\s+/g, '_')}_x_${labelB.replace(/\s+/g, '_')}.pdf`);
}

export default function Comparacao() {
  const [periodoA, setPeriodoA] = useState({ ano: new Date().getFullYear(), mes: new Date().getMonth() });
  const [periodoB, setPeriodoB] = useState({ ano: new Date().getFullYear(), mes: new Date().getMonth() + 1 > 12 ? 12 : new Date().getMonth() + 1 });
  const [setorId, setSetorId] = useState('');
  const [moduloId, setModuloId] = useState('');
  const [pdfLoading, setPdfLoading] = useState(false);

  const { data: setores = [] } = useQuery({ queryKey: ['setores'], queryFn: () => api.entities.Setor.list() });
  const { data: modulos = [] } = useQuery({ queryKey: ['modulos'], queryFn: () => api.entities.Modulo.list() });
  const { data: indicadores = [] } = useQuery({ queryKey: ['indicadores'], queryFn: () => api.entities.Indicador.list() });

  const { data: lancamentosA = [] } = useQuery({
    queryKey: ['lancamentos', periodoA.ano, periodoA.mes, setorId],
    queryFn: () => api.entities.Lancamento.filter({ ano: periodoA.ano, mes: periodoA.mes, setor_id: setorId }),
    enabled: !!periodoA.mes && !!setorId,
  });

  const { data: lancamentosB = [] } = useQuery({
    queryKey: ['lancamentos', periodoB.ano, periodoB.mes, setorId],
    queryFn: () => api.entities.Lancamento.filter({ ano: periodoB.ano, mes: periodoB.mes, setor_id: setorId }),
    enabled: !!periodoB.mes && !!setorId,
  });

  const { data: metasA = [] } = useQuery({
    queryKey: ['metas', periodoA.ano, setorId],
    queryFn: () => api.entities.Meta.filter({ ano: periodoA.ano }),
    enabled: !!setorId,
  });
  const { data: metasB = [] } = useQuery({
    queryKey: ['metas', periodoB.ano, setorId],
    queryFn: () => api.entities.Meta.filter({ ano: periodoB.ano }),
    enabled: !!setorId,
  });
  const metas = [...metasA, ...metasB];

  const getValor = (lancamentos, indicadorId) =>
    lancamentos.find(l => l.indicador_id === indicadorId && l.setor_id === setorId)?.valor ?? null;
  const getMeta = (indicadorId, anoMeta) =>
    metas.find(m => m.indicador_id === indicadorId && m.setor_id === setorId && m.ano === anoMeta);

  const labelA = `${MESES_COMPLETO[periodoA.mes - 1]} / ${periodoA.ano}`;
  const labelB = `${MESES_COMPLETO[periodoB.mes - 1]} / ${periodoB.ano}`;

  const modulosFiltrados = moduloId ? modulos.filter(m => m.id === moduloId) : modulos;

  const handleExportPDF = async () => {
    if (!setorId) return;
    setPdfLoading(true);
    const indsParaPDF = indicadores.filter(i => !moduloId || i.modulo_id === moduloId);
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
    });
    setPdfLoading(false);
  };

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
          disabled={pdfLoading || !setorId}
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
          <div className="grid grid-cols-2 gap-3">
            <Select value={setorId || '__none'} onValueChange={(v) => setSetorId(v === '__none' ? '' : v)}>
              <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Selecione o setor" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none">Selecione o setor…</SelectItem>
                {setores.map(s => <SelectItem key={s.id} value={s.id}>{s.nome}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={moduloId || '__all'} onValueChange={(v) => setModuloId(v === '__all' ? '' : v)}>
              <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Todos os módulos" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all">Todos os módulos</SelectItem>
                {modulos.map(m => <SelectItem key={m.id} value={m.id}>{m.nome}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Tables grouped by module */}
      <div className="space-y-5">
        {!setorId && (
          <Card className="border-dashed border-amber-200 bg-amber-50/50">
            <CardContent className="py-10 text-center text-sm text-amber-900">
              Selecione um setor acima para comparar períodos e ver a meta específica desse setor.
            </CardContent>
          </Card>
        )}
        {setorId && modulosFiltrados.map(mod => {
          const inds = indicadores
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
                          <td className="text-center py-3 px-3 text-muted-foreground">{vA !== null ? vA : '—'}</td>
                          <td className="text-center py-3 px-3 font-semibold">{vB !== null ? vB : '—'}</td>
                          <td className="text-center py-3 px-3">
                            {meta?.valor !== null && meta?.valor !== undefined
                              ? <span className="text-indigo-600 font-medium">{meta.valor}</span>
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
                            <BadgeTendencia tendencia={tendencia} />
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