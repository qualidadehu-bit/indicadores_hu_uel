import { useState, useEffect } from 'react';
import { api } from '@/api/apiClient';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, Edit2, Layers, FileDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/use-toast';
import { jsPDF } from 'jspdf';

const TIPO_GRAFICO_LABEL = {
  linha: 'Linha',
  barra: 'Barras',
  area: 'Área',
  radar: 'Radar',
};

const MODULO_ICONS = {
  'Produção': '📊',
  'MISP': '🎯',
  'Eventos Adversos': '⚠️',
  'Lesão por Pressão (LP)': '🩹',
  'IRAS': '🦠',
  'NR32': '🦺',
};
const DEFAULT_ICON = '📋';

const CHART_TYPES = [
  { value: 'mapa_calor', label: 'Mapa de Calor', emoji: '🟦' },
  { value: 'linha',      label: 'Linha',          emoji: '📈' },
  { value: 'barra',      label: 'Barras',         emoji: '📊' },
  { value: 'area',       label: 'Área',           emoji: '🏔️' },
  { value: 'radar',      label: 'Radar',          emoji: '🕸️' },
];

// ---- Modal: new/edit Módulo ----
function ModuloModal({ open, modulo, onSave, onCancel }) {
  const [nome, setNome] = useState(modulo?.nome || '');
  const [icone, setIcone] = useState(modulo?.icone || '📋');
  const [cor, setCor] = useState(modulo?.cor || '#0a2d5e');
  const [tipo_grafico, setTipoGrafico] = useState(modulo?.tipo_grafico || 'linha');

  // Reset on open
  const handleOpenChange = (v) => { if (!v) onCancel(); };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-jakarta text-lg font-bold">{modulo ? 'Editar Módulo' : 'Novo Módulo'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-1">
          {/* Ícone */}
          <div>
            <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Ícone</Label>
            <Input value={icone} onChange={e => setIcone(e.target.value)} placeholder="📋" className="mt-1 text-lg" />
          </div>
          {/* Nome */}
          <div>
            <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Nome do Módulo</Label>
            <Input autoFocus value={nome} onChange={e => setNome(e.target.value)} placeholder="Ex: Indicadores Cirúrgicos" className="mt-1" />
          </div>
          {/* Cor */}
          <div>
            <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Cor (HEX)</Label>
            <Input value={cor} onChange={e => setCor(e.target.value)} placeholder="#0a2d5e" className="mt-1" />
          </div>
          {/* Tipo de gráfico */}
          <div>
            <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Tipo de Gráfico Principal</Label>
            <div className="grid grid-cols-3 gap-3 mt-2">
              {CHART_TYPES.map(ct => (
                <button
                  key={ct.value}
                  type="button"
                  onClick={() => setTipoGrafico(ct.value)}
                  className={`flex flex-col items-center justify-center gap-2 rounded-xl border-2 py-4 transition-all text-sm font-medium ${
                    tipo_grafico === ct.value
                      ? 'border-cyan-400 bg-cyan-50 text-cyan-700'
                      : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  <span className="text-2xl">{ct.emoji}</span>
                  <span>{ct.label}</span>
                </button>
              ))}
            </div>
          </div>
          {/* Actions */}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={onCancel} className="text-red-500 border-red-200 hover:bg-red-50">
              Cancelar
            </Button>
            <Button
              onClick={() => onSave({ nome: nome.trim(), icone, cor, tipo_grafico })}
              disabled={!nome.trim()}
              className="bg-green-500 hover:bg-green-600 text-white"
            >
              ✓ {modulo ? 'Salvar' : 'Criar'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ---- Modal: new/edit Indicador ----
function IndicadorModal({ open, indicador, metaAtual, anoMeta, nomeSetorMeta, onSave, onCancel }) {
  const [nome, setNome] = useState(indicador?.nome || '');
  const [label, setLabel] = useState(indicador?.label || '');
  const [unidade, setUnidade] = useState(indicador?.unidade || '');
  const [tipoDirecao, setTipoDirecao] = useState(indicador?.tipo_direcao_meta || 'MENOR_E_MELHOR');
  const [meta, setMeta] = useState(metaAtual !== undefined && metaAtual !== null ? String(metaAtual) : '');

  // Reset when opening
  const handleOpenChange = (v) => { if (!v) onCancel(); };

  const DIRECAO_OPTIONS = [
    { value: 'MENOR_E_MELHOR', label: '↓ Menor é Melhor', desc: 'Ex: taxas de infecção, erros' },
    { value: 'MAIOR_E_MELHOR', label: '↑ Maior é Melhor', desc: 'Ex: adesão, satisfação' },
    { value: 'META_CONTRATUAL', label: '≈ Meta Contratual', desc: 'Valor exato acordado' },
  ];

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="font-jakarta text-lg">{indicador ? 'Editar Indicador' : 'Novo Indicador'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-1">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Nome do Indicador</Label>
              <Input
                autoFocus
                value={nome}
                onChange={e => setNome(e.target.value)}
                placeholder="Ex: Taxa de Cancelamento"
                className="mt-1"
              />
            </div>
            <div>
              <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Rótulo Curto</Label>
              <Input
                value={label}
                onChange={e => setLabel(e.target.value)}
                placeholder="Ex: Taxa LP"
                className="mt-1"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Unidade</Label>
              <Input
                value={unidade}
                onChange={e => setUnidade(e.target.value)}
                placeholder="Ex: % ou /1k"
                className="mt-1"
              />
            </div>
            <div>
              <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Meta {anoMeta}{nomeSetorMeta ? ` — ${nomeSetorMeta}` : ''}
              </Label>
              <Input
                type="number"
                value={meta}
                onChange={e => setMeta(e.target.value)}
                placeholder="Ex: 90"
                className="mt-1"
              />
            </div>
          </div>
          {/* Direção da Meta */}
          <div>
            <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Direção da Meta</Label>
            <div className="grid grid-cols-3 gap-2 mt-2">
              {DIRECAO_OPTIONS.map(op => (
                <button
                  key={op.value}
                  type="button"
                  onClick={() => setTipoDirecao(op.value)}
                  className={`flex flex-col items-center justify-center gap-1 rounded-lg border-2 py-3 px-2 text-center transition-all ${
                    tipoDirecao === op.value
                      ? 'border-cyan-400 bg-cyan-50 text-cyan-700'
                      : 'border-gray-200 bg-white text-gray-500 hover:border-gray-300'
                  }`}
                >
                  <span className="text-sm font-bold">{op.label.split(' ')[0]}</span>
                  <span className="text-xs font-medium leading-tight">{op.label.split(' ').slice(1).join(' ')}</span>
                  <span className="text-[10px] text-muted-foreground leading-tight">{op.desc}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={onCancel} className="text-red-500 border-red-200 hover:bg-red-50">
              Cancelar
            </Button>
            <Button
              onClick={() => onSave({ nome: nome.trim(), label: label.trim(), unidade, tipo_direcao_meta: tipoDirecao, meta: meta !== '' ? Number(meta) : null })}
              disabled={!nome.trim()}
              className="bg-green-500 hover:bg-green-600 text-white"
            >
              ✓ {indicador ? 'Salvar' : 'Criar'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

const MESES_COMPLETO = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

function exportModuloPDF(modulo, indicadores, lancamentos, metas, ano, mes, setorId) {
  const doc = new jsPDF();
  const mesNome = MESES_COMPLETO[mes - 1];
  const icon = MODULO_ICONS[modulo.nome] || DEFAULT_ICON;

  // Header
  doc.setFillColor(10, 45, 94);
  doc.rect(0, 0, 210, 28, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text(`${modulo.nome}`, 14, 12);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(`Relatório de Indicadores — ${mesNome}/${ano}`, 14, 21);

  doc.setTextColor(40, 40, 40);
  let y = 38;

  // Summary row
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.setFillColor(240, 245, 255);
  doc.rect(14, y - 5, 182, 8, 'F');
  doc.text('INDICADOR', 16, y);
  doc.text('UNIDADE', 90, y);
  doc.text('VALOR MÊS', 125, y);
  doc.text('META', 155, y);
  doc.text('STATUS', 175, y);
  y += 4;
  doc.setLineWidth(0.3);
  doc.setDrawColor(200, 210, 230);
  doc.line(14, y, 196, y);
  y += 5;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);

  indicadores.forEach((ind, idx) => {
    if (y > 270) { doc.addPage(); y = 20; }

    const lancamento = lancamentos.find(l =>
      l.indicador_id === ind.id && l.mes === mes && l.ano === ano && l.setor_id === setorId
    );
    const meta = metas.find(m =>
      m.indicador_id === ind.id && m.ano === ano && m.setor_id === setorId
    );

    const valor = lancamento?.valor !== undefined && lancamento?.valor !== null ? String(lancamento.valor) : '—';
    const metaVal = meta?.valor !== undefined && meta?.valor !== null ? String(meta.valor) : '—';

    let status = '–';
    let statusColor = [120, 120, 120];
    if (lancamento?.valor !== null && lancamento?.valor !== undefined && meta?.valor !== undefined) {
      const diff = lancamento.valor - meta.valor;
      if (ind.tipo_direcao_meta === 'MAIOR_E_MELHOR') {
        if (diff >= 0) { status = 'OK'; statusColor = [34, 139, 34]; }
        else if (diff >= -meta.valor * 0.1) { status = 'Atenção'; statusColor = [210, 140, 0]; }
        else { status = 'Crítico'; statusColor = [200, 0, 0]; }
      } else {
        if (diff <= 0) { status = 'OK'; statusColor = [34, 139, 34]; }
        else if (diff <= meta.valor * 0.1) { status = 'Atenção'; statusColor = [210, 140, 0]; }
        else { status = 'Crítico'; statusColor = [200, 0, 0]; }
      }
    } else if (lancamento?.valor !== null && lancamento?.valor !== undefined) {
      status = 'Sem meta';
    } else {
      status = 'Sem dados';
    }

    if (idx % 2 === 0) {
      doc.setFillColor(250, 252, 255);
      doc.rect(14, y - 4, 182, 7, 'F');
    }

    doc.setTextColor(40, 40, 40);
    const nomeText = doc.splitTextToSize(ind.nome, 70);
    doc.text(nomeText, 16, y);
    doc.text(ind.unidade || '—', 90, y);
    doc.text(valor, 125, y);
    doc.text(metaVal, 155, y);
    doc.setTextColor(...statusColor);
    doc.setFont('helvetica', 'bold');
    doc.text(status, 175, y);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(40, 40, 40);

    y += nomeText.length > 1 ? 10 : 8;
  });

  // Notes section
  y += 4;
  doc.setDrawColor(200, 210, 230);
  doc.line(14, y, 196, y);
  y += 6;
  doc.setFontSize(8);
  doc.setTextColor(120, 120, 120);
  doc.text(`Gerado em: ${new Date().toLocaleDateString('pt-BR')} às ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`, 14, y);

  doc.save(`${modulo.nome.replace(/\s+/g, '_')}_${mesNome}_${ano}.pdf`);
}

export default function ModulosIndicadores() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const anoAtual = new Date().getFullYear();
  const mesAtual = new Date().getMonth() + 1;

  const { data: setores = [] } = useQuery({ queryKey: ['setores'], queryFn: () => api.entities.Setor.list() });
  const { data: modulos = [] } = useQuery({ queryKey: ['modulos'], queryFn: () => api.entities.Modulo.list() });
  const { data: indicadores = [] } = useQuery({ queryKey: ['indicadores'], queryFn: () => api.entities.Indicador.list() });
  const { data: lancamentos = [] } = useQuery({ queryKey: ['lancamentos', anoAtual], queryFn: () => api.entities.Lancamento.filter({ ano: anoAtual }) });
  const { data: metas = [] } = useQuery({ queryKey: ['metas', anoAtual], queryFn: () => api.entities.Meta.filter({ ano: anoAtual }) });

  const invalidateModulos = () => queryClient.invalidateQueries({ queryKey: ['modulos'] });
  const invalidateIndicadores = () => queryClient.invalidateQueries({ queryKey: ['indicadores'] });

  const createModulo = useMutation({
    mutationFn: (data) => api.entities.Modulo.create(data),
    onSuccess: () => { invalidateModulos(); setModuloModal(null); toast({ title: 'Módulo criado!' }); },
  });
  const updateModulo = useMutation({
    mutationFn: ({ id, data }) => api.entities.Modulo.update(id, data),
    onSuccess: () => { invalidateModulos(); setModuloModal(null); toast({ title: 'Módulo atualizado!' }); },
  });

  const createIndicador = useMutation({
    mutationFn: (data) => api.entities.Indicador.create(data),
    onSuccess: () => { invalidateIndicadores(); setModalState(null); toast({ title: 'Indicador criado!' }); },
  });
  const updateIndicador = useMutation({
    mutationFn: ({ id, data }) => api.entities.Indicador.update(id, data),
    onSuccess: () => { invalidateIndicadores(); setModalState(null); toast({ title: 'Indicador atualizado!' }); },
  });
  const deleteIndicador = useMutation({
    mutationFn: (id) => api.entities.Indicador.delete(id),
    onSuccess: () => { invalidateIndicadores(); toast({ title: 'Indicador removido.' }); },
  });

  const anoAtualRef = anoAtual;

  const [setorMetaId, setSetorMetaId] = useState('');

  useEffect(() => {
    if (!setores.length) return;
    setSetorMetaId(prev => (prev && setores.some(s => s.id === prev) ? prev : setores[0].id));
  }, [setores]);

  const nomeSetorMeta = setores.find(s => s.id === setorMetaId)?.nome || '';

  const saveMeta = async (indicadorId, valor, sid) => {
    if (valor === null || valor === '' || !sid) return;
    const existing = metas.find(m =>
      m.indicador_id === indicadorId && m.ano === anoAtualRef && m.setor_id === sid
    );
    if (existing) {
      await api.entities.Meta.update(existing.id, { valor: Number(valor) });
    } else {
      await api.entities.Meta.create({
        indicador_id: indicadorId,
        setor_id: sid,
        ano: anoAtualRef,
        valor: Number(valor),
      });
    }
    queryClient.invalidateQueries({ queryKey: ['metas'] });
  };

  const [moduloModal, setModuloModal] = useState(null); // null | { modulo? }
  // modalState: null | { moduloId, modulo, indicador? }
  const [modalState, setModalState] = useState(null);

  const modulosOrdenados = [...modulos].sort((a, b) => (a.ordem || 0) - (b.ordem || 0));

  return (
    <div className="space-y-2">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-4">
        <div className="flex items-center gap-2">
          <Layers className="w-4 h-4 text-primary" />
          <span className="font-jakarta font-bold text-base">Módulos e Indicadores</span>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
          <Label className="text-xs text-muted-foreground whitespace-nowrap">Meta ({anoAtual}) para o setor:</Label>
          <Select value={setorMetaId} onValueChange={setSetorMetaId} disabled={!setores.length}>
            <SelectTrigger className="h-8 w-52 text-xs">
              <SelectValue placeholder="Selecione o setor" />
            </SelectTrigger>
            <SelectContent>
              {setores.map(s => (
                <SelectItem key={s.id} value={s.id}>{s.nome}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-xs border-cyan-400 text-cyan-600 hover:bg-cyan-50 gap-1"
          onClick={() => setModuloModal({ modulo: null })}
        >
          <Plus className="w-3 h-3" />Novo Módulo
        </Button>
      </div>

      {/* Módulos list */}
      {modulosOrdenados.map(modulo => {
        const inds = indicadores.filter(i => i.modulo_id === modulo.id).sort((a, b) => (a.ordem || 0) - (b.ordem || 0));
        const icon = MODULO_ICONS[modulo.nome] || DEFAULT_ICON;
        return (
          <div key={modulo.id} className="border border-gray-200 rounded-xl overflow-hidden mb-3">
            {/* Módulo header */}
            <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-b border-gray-200">
              <div className="flex items-center gap-2 flex-wrap">
                <div className="w-3 h-3 rounded-sm bg-indigo-400 flex-shrink-0" />
                <span className="text-sm font-bold text-foreground">{icon} {modulo.nome}</span>
                <span className="text-xs text-muted-foreground">{inds.length} indicador(es) · Gráfico: {TIPO_GRAFICO_LABEL[modulo.tipo_grafico] || modulo.tipo_grafico}</span>
              </div>
              <div className="flex gap-2 flex-shrink-0">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs gap-1 text-indigo-600 border-indigo-300 hover:bg-indigo-50"
                  onClick={() => {
                    if (!setorMetaId) {
                      toast({ title: 'Selecione um setor', description: 'Escolha o setor acima para gerar o PDF com meta e lançamentos corretos.', variant: 'destructive' });
                      return;
                    }
                    exportModuloPDF(modulo, inds, lancamentos, metas, anoAtual, mesAtual, setorMetaId);
                  }}
                >
                  <FileDown className="w-3 h-3" />PDF
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs gap-1 text-amber-600 border-amber-300 hover:bg-amber-50"
                  onClick={() => setModuloModal({ modulo })}
                >
                  <Edit2 className="w-3 h-3" />Editar
                </Button>
              </div>
            </div>

            {/* Indicadores rows */}
            {inds.map(ind => (
              <div
                key={ind.id}
                className="flex items-center justify-between px-6 py-2.5 border-b border-gray-100 last:border-0 hover:bg-gray-50/60 transition-colors"
              >
                <div>
                  <p className="text-sm font-medium text-foreground">{ind.nome}</p>
                  <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                    {ind.unidade && <span className="text-xs text-muted-foreground">Unid: {ind.unidade}</span>}
                    <span className="text-xs text-muted-foreground">
                      {ind.tipo_direcao_meta === 'MAIOR_E_MELHOR' ? '↑ Maior é melhor' : ind.tipo_direcao_meta === 'MENOR_E_MELHOR' ? '↓ Menor é melhor' : '≈ Contratual'}
                    </span>
                    {(() => {
                      const ms = metas.filter(mt => mt.indicador_id === ind.id && mt.ano === anoAtual);
                      if (ms.length === 0) return null;
                      const mSel = ms.find(mt => mt.setor_id === setorMetaId);
                      if (ms.length === 1) {
                        return <span className="text-xs font-medium text-indigo-600">Meta {anoAtual}: {ms[0].valor}</span>;
                      }
                      return (
                        <span className="text-xs font-medium text-indigo-600">
                          {mSel ? `Meta (${nomeSetorMeta}): ${mSel.valor}` : `${ms.length} metas (${anoAtual})`}
                        </span>
                      );
                    })()}
                  </div>
                </div>
                <div className="flex gap-1 flex-shrink-0">
                  <button
                    onClick={() => setModalState({ moduloId: modulo.id, modulo, indicador: ind })}
                    className="w-7 h-7 flex items-center justify-center rounded border border-amber-200 bg-amber-50 text-amber-500 hover:bg-amber-100 transition-colors"
                  >
                    <Edit2 className="w-3 h-3" />
                  </button>
                  <button
                    onClick={() => deleteIndicador.mutate(ind.id)}
                    className="w-7 h-7 flex items-center justify-center rounded border border-red-200 bg-red-50 text-red-400 hover:bg-red-100 transition-colors"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              </div>
            ))}

            {/* Add indicador button */}
            <button
              onClick={() => setModalState({ moduloId: modulo.id, modulo, indicador: null })}
              className="w-full flex items-center justify-center gap-1.5 px-4 py-2.5 text-xs font-medium text-cyan-500 border-t border-dashed border-cyan-300 hover:bg-cyan-50/50 transition-colors"
            >
              <Plus className="w-3 h-3" />Adicionar Indicador
            </button>
          </div>
        );
      })}

      {modulosOrdenados.length === 0 && !moduloModal && (
        <div className="text-center text-muted-foreground py-10 text-sm">
          Nenhum módulo cadastrado. Clique em "+ Novo Módulo" para começar.
        </div>
      )}

      {/* Módulo Modal */}
      <ModuloModal
        open={!!moduloModal}
        modulo={moduloModal?.modulo}
        onCancel={() => setModuloModal(null)}
        onSave={(d) => {
          if (moduloModal?.modulo) {
            updateModulo.mutate({ id: moduloModal.modulo.id, data: d });
          } else {
            createModulo.mutate(d);
          }
        }}
      />

      {/* Indicador Modal */}
      <IndicadorModal
        open={!!modalState}
        indicador={modalState?.indicador}
        anoMeta={anoAtual}
        nomeSetorMeta={nomeSetorMeta}
        metaAtual={modalState?.indicador
          ? metas.find(m =>
              m.indicador_id === modalState.indicador.id &&
              m.ano === anoAtual &&
              m.setor_id === setorMetaId
            )?.valor
          : undefined}
        onCancel={() => setModalState(null)}
        onSave={async (d) => {
          const { meta, ...indData } = d;
          if (modalState?.indicador) {
            updateIndicador.mutate({ id: modalState.indicador.id, data: { ...modalState.indicador, ...indData } });
          } else {
            const created = await api.entities.Indicador.create({ ...indData, modulo_id: modalState.moduloId, modulo_nome: modalState.modulo.nome, ativo: true });
            if (meta !== null && setorMetaId) await saveMeta(created.id, meta, setorMetaId);
            queryClient.invalidateQueries({ queryKey: ['indicadores'] });
            setModalState(null);
            toast({ title: 'Indicador criado!' });
            return;
          }
          if (meta !== null && setorMetaId) await saveMeta(modalState.indicador.id, meta, setorMetaId);
        }}
      />
    </div>
  );
}