import { useState, useEffect, useMemo } from 'react';
import { api } from '@/api/apiClient';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, Edit2, Check, LayoutGrid } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/components/ui/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  filtrarIndicadoresPorDivisao,
  indicadorIdsWhitelistSetor,
  serializeSetorIndicadorIdsFromSelection,
} from '@/lib/indicadorDivisao';
import { normalizeSheetId } from '@/lib/sheetsEntityNormalize';
import { ENTITY_TYPE_CLINICA, ENTITY_TYPE_COMISSAO, ENTITY_TYPE_SETOR, normalizeEntityType } from '@/lib/entityType';

// ---- Modal: criar / editar setor (nome + indicadores permitidos) ----
function SetorModal({ open, divisaoNome, setor, indicadores, onSave, onCancel, isSaving, entityLabel, entityLabelLower }) {
  const { toast } = useToast();
  const [nome, setNome] = useState('');
  const [selectedIds, setSelectedIds] = useState(() => new Set());

  const eligible = useMemo(
    () =>
      filtrarIndicadoresPorDivisao(indicadores || [], divisaoNome).filter((i) => i.ativo !== false),
    [indicadores, divisaoNome]
  );

  useEffect(() => {
    if (!open) return;
    setNome(setor?.nome != null ? String(setor.nome) : '');
    const w = setor ? indicadorIdsWhitelistSetor(setor) : null;
    if (w == null) {
      setSelectedIds(new Set(eligible.map((i) => normalizeSheetId(i.id))));
    } else {
      const next = new Set();
      for (const id of w) {
        if (eligible.some((e) => normalizeSheetId(e.id) === id)) next.add(id);
      }
      setSelectedIds(next.size > 0 ? next : new Set(eligible.map((i) => normalizeSheetId(i.id))));
    }
  }, [open, setor, eligible]);

  const toggleId = (id) => {
    const k = normalizeSheetId(id);
    setSelectedIds((prev) => {
      const n = new Set(prev);
      if (n.has(k)) n.delete(k);
      else n.add(k);
      return n;
    });
  };

  const selectAll = () => setSelectedIds(new Set(eligible.map((i) => normalizeSheetId(i.id))));
  const clearAll = () => setSelectedIds(new Set());

  const trySave = () => {
    const n = nome.trim();
    if (!n) return;
    const full = new Set(eligible.map((i) => normalizeSheetId(i.id)));
    const every = full.size > 0 && [...full].every((id) => selectedIds.has(id));
    const chosen = [...selectedIds].filter((id) => full.has(id));
    if (!every && chosen.length === 0 && full.size > 0) {
      toast({
        title: 'Selecione indicadores',
        description: 'Marque ao menos um indicador ou use «Marcar todos».',
        variant: 'destructive',
      });
      return;
    }
    const indicador_ids = serializeSetorIndicadorIdsFromSelection(eligible, selectedIds);
    onSave({ nome: n, indicador_ids });
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !isSaving && onCancel()}>
      <DialogContent className="max-w-lg max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="font-jakarta text-lg">{setor ? `Editar ${entityLabel.toLowerCase()}` : `Novo ${entityLabel.toLowerCase()}`}</DialogTitle>
          <p className="text-xs text-muted-foreground">Divisão: {divisaoNome}</p>
        </DialogHeader>
        <div className="space-y-3 overflow-y-auto flex-1 min-h-0 pr-1">
          <div>
            <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Nome do {entityLabel.toLowerCase()}</Label>
            <Input value={nome} onChange={(e) => setNome(e.target.value)} className="mt-1 h-9" placeholder={`Ex: ${entityLabel === 'Comissão' ? 'Comissão de óbitos' : 'Centro Cirúrgico'}`} />
          </div>
          <div>
            <div className="flex items-center justify-between gap-2 flex-wrap">
            <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {`Indicadores d${entityLabelLower === 'clínica' ? 'a' : 'o'} ${entityLabelLower}`}
            </Label>
              <div className="flex gap-1">
                <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={selectAll}>
                  Marcar todos
                </Button>
                <Button type="button" variant="ghost" size="sm" className="h-7 text-xs" onClick={clearAll}>
                  Desmarcar todos
                </Button>
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground mt-1 mb-2">
              Lista branca opcional. Com todos marcados (ou campo vazio na planilha), {`o(a) ${entityLabelLower}`} usa todos os indicadores já permitidos pela divisão. Caso contrário, só os marcados aparecem no dashboard, lançamento, etc.
            </p>
            {eligible.length === 0 ? (
              <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-md p-2">
                Nenhum indicador ativo para esta divisão. Pode criar o setor só com o nome; depois edite o setor para restringir a lista.
              </p>
            ) : (
              <div className="max-h-52 overflow-y-auto rounded-md border border-border p-2 space-y-2">
                {eligible.map((ind) => {
                  const id = normalizeSheetId(ind.id);
                  const checked = selectedIds.has(id);
                  return (
                    <label
                      key={id}
                      className="flex items-start gap-2 text-sm cursor-pointer hover:bg-secondary/50 rounded px-1 py-1"
                    >
                      <Checkbox checked={checked} onCheckedChange={() => toggleId(id)} className="mt-0.5" />
                      <span>
                        <span className="font-medium">{String(ind.label || ind.nome || '')}</span>
                        {ind.unidade ? (
                          <span className="text-muted-foreground text-xs"> · {String(ind.unidade)}</span>
                        ) : null}
                      </span>
                    </label>
                  );
                })}
              </div>
            )}
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-2 border-t">
          <Button variant="outline" onClick={onCancel} disabled={isSaving}>
            Cancelar
          </Button>
          <Button className="bg-green-600 hover:bg-green-700" disabled={isSaving || !nome.trim()} onClick={trySave}>
            {isSaving ? '…' : 'Salvar'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function DivisaoModal({ open, nome: initialNome, onSave, onCancel }) {
  const [icone, setIcone] = useState('🏥');
  const [nome, setNome] = useState(initialNome || '');
  const isEdit = !!initialNome;

  const handleOpenChange = (o) => {
    if (!o) onCancel();
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="font-jakarta text-lg">{isEdit ? 'Editar Divisão' : 'Nova Divisão'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-1">
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Ícone (Emoji)</Label>
            <Input value={icone} onChange={(e) => setIcone(e.target.value)} className="text-lg h-10" maxLength={2} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Nome da Divisão</Label>
            <Input
              autoFocus
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Ex: Centro Cirúrgico"
              className="h-10"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" className="text-red-500 border-red-200 hover:bg-red-50" onClick={onCancel}>
              Cancelar
            </Button>
            <Button
              disabled={!nome.trim()}
              className="bg-green-500 hover:bg-green-600 text-white"
              onClick={() => onSave(nome.trim(), icone)}
            >
              <Check className="w-3.5 h-3.5 mr-1" />
              {isEdit ? 'Salvar' : 'Criar'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function DivisoesSetores({ entityType = ENTITY_TYPE_SETOR, title }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const domainType = normalizeEntityType(entityType);
  const isComissao = domainType === ENTITY_TYPE_COMISSAO;
  const isClinica = domainType === ENTITY_TYPE_CLINICA;
  const entityLabel = isClinica ? 'Clínica' : (isComissao ? 'Comissão' : 'Setor');
  const entityLabelPlural = isClinica ? 'Clínicas' : (isComissao ? 'Comissões' : 'Setores');
  const entityLabelLower = entityLabel.toLowerCase();

  const { data: setores = [] } = useQuery({
    queryKey: ['setores', domainType],
    queryFn: () => api.entities.Setor.filter({ entity_type: domainType }),
  });

  const { data: indicadores = [] } = useQuery({
    queryKey: ['indicadores', domainType],
    queryFn: () => api.entities.Indicador.filter({ entity_type: domainType }),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['setores'] });

  const setorCreateMutation = useMutation({
    /** @param {{ nome: string, divisao: string, ativo: boolean, indicador_ids?: unknown, entity_type?: string }} data */
    mutationFn: (data) => api.entities.Setor.create(data),
    onSuccess: () => {
      invalidate();
      toast({ title: `${entityLabel} criado(a)!` });
    },
  });
  const setorUpdateMutation = useMutation({
    /** @param {{ id: string, data: Record<string, unknown> }} vars */
    mutationFn: ({ id, data }) => api.entities.Setor.update(id, data),
    onSuccess: () => {
      invalidate();
      toast({ title: `${entityLabel} atualizado(a)!` });
    },
  });
  const setorDeleteMutation = useMutation({
    /** @param {string} id */
    mutationFn: (id) => api.entities.Setor.delete(id),
    onSuccess: () => {
      invalidate();
      toast({ title: `${entityLabel} removido(a).` });
    },
  });

  const [showNewDivisao, setShowNewDivisao] = useState(false);
  const [editingDivisao, setEditingDivisao] = useState(null);
  const [novaDivisaoNome, setNovaDivisaoNome] = useState(null);
  const [setorModal, setSetorModal] = useState(null);

  const divisoes = [...new Set(setores.map((s) => s.divisao).filter(Boolean))];

  const handleCreateDivisao = (nome, _icone) => {
    setShowNewDivisao(false);
    setNovaDivisaoNome(nome.trim());
    setSetorModal({ divisao: nome.trim(), setor: undefined });
  };

  const handleRenameDivisao = async (oldNome, newNome) => {
    const affectedSetores = setores.filter((s) => s.divisao === oldNome);
    await Promise.all(
      affectedSetores.map((s) => api.entities.Setor.update(s.id, { ...s, divisao: newNome.trim() }))
    );
    invalidate();
    setEditingDivisao(null);
    toast({ title: 'Divisão renomeada!' });
  };

  const handleDeleteDivisao = async (divisaoNome) => {
    const affectedSetores = setores.filter((s) => s.divisao === divisaoNome);
    await Promise.all(affectedSetores.map((s) => api.entities.Setor.delete(s.id)));
    invalidate();
    toast({ title: 'Divisão e seus setores removidos.' });
  };

  const savingSetor = setorCreateMutation.isPending || setorUpdateMutation.isPending;

  const onSetorModalSave = ({ nome, indicador_ids }) => {
    if (!setorModal?.divisao) return;
    const divisaoNome = setorModal.divisao;
    const existing = setorModal.setor;
    if (existing) {
      setorUpdateMutation.mutate({
        id: existing.id,
        data: { ...existing, nome, divisao: divisaoNome, indicador_ids, entity_type: domainType },
      });
    } else {
      setorCreateMutation.mutate({ nome, divisao: divisaoNome, ativo: true, indicador_ids, entity_type: domainType });
    }
    setSetorModal(null);
    setNovaDivisaoNome(null);
  };

  const closeSetorModal = () => {
    setSetorModal(null);
    setNovaDivisaoNome(null);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-3 mb-4">
        <div className="flex items-center gap-2">
          <LayoutGrid className="w-4 h-4 text-primary" />
          <span className="font-jakarta font-bold text-base">{title || `Divisões e ${entityLabelPlural}`}</span>
        </div>
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-xs border-cyan-400 text-cyan-600 hover:bg-cyan-50 gap-1"
          onClick={() => setShowNewDivisao(true)}
        >
          <Plus className="w-3 h-3" />
          Nova Divisão
        </Button>
      </div>

      <DivisaoModal open={showNewDivisao} nome="" onSave={handleCreateDivisao} onCancel={() => setShowNewDivisao(false)} />

      {divisoes.map((divisao) => {
        const setoresDaDivisao = setores.filter((s) => s.divisao === divisao);
        const isEditingDiv = editingDivisao === divisao;

        return (
          <div key={divisao} className="border border-gray-200 rounded-xl overflow-hidden mb-3">
            <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-b border-gray-200">
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <div className="w-3 h-3 rounded-sm bg-indigo-400 flex-shrink-0" />
                {isEditingDiv ? null : (
                  <div>
                    <p className="text-sm font-bold text-foreground">{divisao}</p>
                    <p className="text-xs text-muted-foreground">{setoresDaDivisao.length} {entityLabel.toLowerCase()}(s)</p>
                  </div>
                )}
              </div>
              {!isEditingDiv && (
                <div className="flex gap-2 flex-shrink-0">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs gap-1 text-amber-600 border-amber-300 hover:bg-amber-50"
                    onClick={() => setEditingDivisao(divisao)}
                  >
                    <Edit2 className="w-3 h-3" />
                    Editar
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs gap-1 text-red-500 border-red-200 hover:bg-red-50"
                    onClick={() => handleDeleteDivisao(divisao)}
                  >
                    <Trash2 className="w-3 h-3" />
                    Remover
                  </Button>
                </div>
              )}
            </div>

            {setoresDaDivisao.map((setor) => (
              <div
                key={setor.id}
                className="flex items-center justify-between px-6 py-2.5 border-b border-gray-100 last:border-0 hover:bg-gray-50/60 transition-colors"
              >
                <span className="text-sm text-foreground">{setor.nome}</span>
                <div className="flex gap-1">
                  <button
                    type="button"
                    onClick={() => setSetorModal({ divisao, setor })}
                    className="w-7 h-7 flex items-center justify-center rounded border border-amber-200 bg-amber-50 text-amber-500 hover:bg-amber-100 transition-colors"
                  >
                    <Edit2 className="w-3 h-3" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setorDeleteMutation.mutate(setor.id)}
                    className="w-7 h-7 flex items-center justify-center rounded border border-red-200 bg-red-50 text-red-400 hover:bg-red-100 transition-colors"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              </div>
            ))}

            <button
              type="button"
              onClick={() => setSetorModal({ divisao, setor: undefined })}
              className="w-full flex items-center justify-center gap-1.5 px-4 py-2.5 text-xs font-medium text-cyan-500 border-t border-dashed border-cyan-300 hover:bg-cyan-50/50 transition-colors"
            >
              <Plus className="w-3 h-3" />
              Adicionar {entityLabel}
            </button>
          </div>
        );
      })}

      {novaDivisaoNome && !divisoes.includes(novaDivisaoNome) && (
        <div className="border border-cyan-300 rounded-xl overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-3 bg-gray-50 border-b border-gray-200">
            <div className="w-3 h-3 rounded-sm bg-indigo-400 flex-shrink-0" />
            <div>
              <p className="text-sm font-bold text-foreground">{novaDivisaoNome}</p>
              <p className="text-xs text-muted-foreground">0 {entityLabel.toLowerCase()}(s) — crie o primeiro no modal.</p>
            </div>
          </div>
        </div>
      )}

      <DivisaoModal
        open={!!editingDivisao}
        nome={editingDivisao || ''}
        onSave={(newNome) => handleRenameDivisao(editingDivisao, newNome)}
        onCancel={() => setEditingDivisao(null)}
      />

      <SetorModal
        open={!!setorModal}
        divisaoNome={setorModal?.divisao || ''}
        setor={setorModal?.setor}
        indicadores={indicadores}
        entityLabel={entityLabel}
        entityLabelLower={entityLabelLower}
        isSaving={savingSetor}
        onCancel={closeSetorModal}
        onSave={onSetorModalSave}
      />

      {divisoes.length === 0 && !showNewDivisao && !novaDivisaoNome && (
        <div className="text-center text-muted-foreground py-10 text-sm">
          Nenhuma divisão cadastrada. Clique em &quot;+ Nova Divisão&quot; para começar.
        </div>
      )}
    </div>
  );
}
