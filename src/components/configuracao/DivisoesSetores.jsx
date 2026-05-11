import { useState } from 'react';
import { api } from '@/api/apiClient';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, Edit2, Check, X, LayoutGrid } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

// ---- Inline edit form for a sector ----
function SetorInlineForm({ nome: initialNome, onSave, onCancel }) {
  const [nome, setNome] = useState(initialNome || '');
  return (
    <div className="flex items-center gap-2 py-1">
      <Input
        autoFocus
        value={nome}
        onChange={e => setNome(e.target.value)}
        placeholder="Nome do setor"
        className="h-8 text-sm flex-1"
      />
      <Button size="sm" className="h-8 px-3" onClick={() => onSave(nome)} disabled={!nome.trim()}>
        <Check className="w-3 h-3" />
      </Button>
      <Button size="sm" variant="outline" className="h-8 px-3" onClick={onCancel}>
        <X className="w-3 h-3" />
      </Button>
    </div>
  );
}

// ---- Modal for creating/editing a divisão ----
function DivisaoModal({ open, nome: initialNome, onSave, onCancel }) {
  const [icone, setIcone] = useState('🏥');
  const [nome, setNome] = useState(initialNome || '');
  const isEdit = !!initialNome;

  // reset on open
  const handleOpenChange = (o) => { if (!o) onCancel(); };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="font-jakarta text-lg">{isEdit ? 'Editar Divisão' : 'Nova Divisão'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-1">
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Ícone (Emoji)</Label>
            <Input
              value={icone}
              onChange={e => setIcone(e.target.value)}
              className="text-lg h-10"
              maxLength={2}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Nome da Divisão</Label>
            <Input
              autoFocus
              value={nome}
              onChange={e => setNome(e.target.value)}
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
              <Check className="w-3.5 h-3.5 mr-1" />{isEdit ? 'Salvar' : 'Criar'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function DivisoesSetores() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: setores = [] } = useQuery({
    queryKey: ['setores'],
    queryFn: () => api.entities.Setor.list(),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['setores'] });

  const createSetor = useMutation({
    mutationFn: (data) => api.entities.Setor.create(data),
    onSuccess: invalidate,
  });
  const updateSetor = useMutation({
    mutationFn: ({ id, data }) => api.entities.Setor.update(id, data),
    onSuccess: () => { invalidate(); toast({ title: 'Setor atualizado!' }); },
  });
  const deleteSetor = useMutation({
    mutationFn: (id) => api.entities.Setor.delete(id),
    onSuccess: () => { invalidate(); toast({ title: 'Setor removido.' }); },
  });

  // Local state
  const [showNewDivisao, setShowNewDivisao] = useState(false);
  const [editingDivisao, setEditingDivisao] = useState(null); // divisão name being edited
  const [addingSetorToDivisao, setAddingSetorToDivisao] = useState(null); // divisão name
  const [editingSetorId, setEditingSetorId] = useState(null);

  // Group setores by divisão
  const divisoes = [...new Set(setores.map(s => s.divisao).filter(Boolean))];

  const handleCreateDivisao = (nome) => {
    setShowNewDivisao(false);
    setAddingSetorToDivisao(nome.trim());
  };

  const handleRenameDivisao = async (oldNome, newNome) => {
    const affectedSetores = setores.filter(s => s.divisao === oldNome);
    await Promise.all(affectedSetores.map(s =>
      api.entities.Setor.update(s.id, { ...s, divisao: newNome.trim() })
    ));
    invalidate();
    setEditingDivisao(null);
    toast({ title: 'Divisão renomeada!' });
  };

  const handleDeleteDivisao = async (divisaoNome) => {
    const affectedSetores = setores.filter(s => s.divisao === divisaoNome);
    await Promise.all(affectedSetores.map(s => api.entities.Setor.delete(s.id)));
    invalidate();
    toast({ title: 'Divisão e seus setores removidos.' });
  };

  const handleAddSetor = (divisaoNome, setorNome) => {
    createSetor.mutate({ nome: setorNome.trim(), divisao: divisaoNome, ativo: true });
    setAddingSetorToDivisao(null);
  };

  const handleUpdateSetor = (setor, newNome) => {
    updateSetor.mutate({ id: setor.id, data: { ...setor, nome: newNome.trim() } });
    setEditingSetorId(null);
  };

  return (
    <div className="space-y-2">
      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <div className="flex items-center gap-2">
          <LayoutGrid className="w-4 h-4 text-primary" />
          <span className="font-jakarta font-bold text-base">Divisões e Setores</span>
        </div>
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-xs border-cyan-400 text-cyan-600 hover:bg-cyan-50 gap-1"
          onClick={() => setShowNewDivisao(true)}
        >
          <Plus className="w-3 h-3" />Nova Divisão
        </Button>
      </div>

      {/* New Divisão modal */}
      <DivisaoModal
        open={showNewDivisao}
        onSave={handleCreateDivisao}
        onCancel={() => setShowNewDivisao(false)}
      />

      {/* Divisões list */}
      {divisoes.map(divisao => {
        const setoresDaDivisao = setores.filter(s => s.divisao === divisao);
        const isEditingDiv = editingDivisao === divisao;

        return (
          <div key={divisao} className="border border-gray-200 rounded-xl overflow-hidden mb-3">
            {/* Divisão header */}
            <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-b border-gray-200">
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <div className="w-3 h-3 rounded-sm bg-indigo-400 flex-shrink-0" />
                {isEditingDiv ? null : (
                  <div>
                    <p className="text-sm font-bold text-foreground">{divisao}</p>
                    <p className="text-xs text-muted-foreground">{setoresDaDivisao.length} setor(es)</p>
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
                    <Edit2 className="w-3 h-3" />Editar
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs gap-1 text-red-500 border-red-200 hover:bg-red-50"
                    onClick={() => handleDeleteDivisao(divisao)}
                  >
                    <Trash2 className="w-3 h-3" />Remover
                  </Button>
                </div>
              )}
            </div>

            {/* Setores rows */}
            {setoresDaDivisao.map((setor, idx) => (
              <div
                key={setor.id}
                className="flex items-center justify-between px-6 py-2.5 border-b border-gray-100 last:border-0 hover:bg-gray-50/60 transition-colors"
              >
                {editingSetorId === setor.id ? (
                  <div className="flex-1">
                    <SetorInlineForm
                      nome={setor.nome}
                      onSave={(nome) => handleUpdateSetor(setor, nome)}
                      onCancel={() => setEditingSetorId(null)}
                    />
                  </div>
                ) : (
                  <>
                    <span className="text-sm text-foreground">{setor.nome}</span>
                    <div className="flex gap-1">
                      <button
                        onClick={() => setEditingSetorId(setor.id)}
                        className="w-7 h-7 flex items-center justify-center rounded border border-amber-200 bg-amber-50 text-amber-500 hover:bg-amber-100 transition-colors"
                      >
                        <Edit2 className="w-3 h-3" />
                      </button>
                      <button
                        onClick={() => deleteSetor.mutate(setor.id)}
                        className="w-7 h-7 flex items-center justify-center rounded border border-red-200 bg-red-50 text-red-400 hover:bg-red-100 transition-colors"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </>
                )}
              </div>
            ))}

            {/* Add setor form or button */}
            {addingSetorToDivisao === divisao ? (
              <div className="px-6 py-2.5">
                <SetorInlineForm
                  onSave={(nome) => handleAddSetor(divisao, nome)}
                  onCancel={() => setAddingSetorToDivisao(null)}
                />
              </div>
            ) : (
              <button
                onClick={() => setAddingSetorToDivisao(divisao)}
                className="w-full flex items-center justify-center gap-1.5 px-4 py-2.5 text-xs font-medium text-cyan-500 border-t border-dashed border-cyan-300 hover:bg-cyan-50/50 transition-colors"
              >
                <Plus className="w-3 h-3" />Adicionar Setor
              </button>
            )}
          </div>
        );
      })}

      {/* New divisão quick-add: if divisão was just named, show add setor form for it */}
      {addingSetorToDivisao && !divisoes.includes(addingSetorToDivisao) && (
        <div className="border border-cyan-300 rounded-xl overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-3 bg-gray-50 border-b border-gray-200">
            <div className="w-3 h-3 rounded-sm bg-indigo-400 flex-shrink-0" />
            <div>
              <p className="text-sm font-bold text-foreground">{addingSetorToDivisao}</p>
              <p className="text-xs text-muted-foreground">0 setor(es)</p>
            </div>
          </div>
          <div className="px-6 py-2.5">
            <SetorInlineForm
              onSave={(nome) => handleAddSetor(addingSetorToDivisao, nome)}
              onCancel={() => setAddingSetorToDivisao(null)}
            />
          </div>
        </div>
      )}

      {/* Edit Divisão modal */}
      <DivisaoModal
        open={!!editingDivisao}
        nome={editingDivisao || ''}
        onSave={(newNome) => handleRenameDivisao(editingDivisao, newNome)}
        onCancel={() => setEditingDivisao(null)}
      />

      {divisoes.length === 0 && !showNewDivisao && !addingSetorToDivisao && (
        <div className="text-center text-muted-foreground py-10 text-sm">
          Nenhuma divisão cadastrada. Clique em "+ Nova Divisão" para começar.
        </div>
      )}
    </div>
  );
}