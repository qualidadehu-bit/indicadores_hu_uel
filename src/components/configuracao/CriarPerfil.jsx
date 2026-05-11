import { useState } from 'react';
import { api } from '@/api/apiClient';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, Edit2, Check, X, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/use-toast';

function GestorModal({ open, gestor, divisoes, onSave, onCancel }) {
  const [email, setEmail] = useState(gestor?.email || '');
  const [nome, setNome] = useState(gestor?.nome || '');
  const [divisao, setDivisao] = useState(gestor?.divisao || '');

  const handleOpenChange = (v) => { if (!v) onCancel(); };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="font-jakarta text-lg font-bold">
            {gestor ? 'Editar Gestor' : 'Novo Gestor'}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-1">
          <div>
            <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Email</Label>
            <Input
              autoFocus
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="gestor@hospital.com"
              className="mt-1"
            />
          </div>
          <div>
            <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Nome Completo</Label>
            <Input
              value={nome}
              onChange={e => setNome(e.target.value)}
              placeholder="Ex: João Silva"
              className="mt-1"
            />
          </div>
          <div>
            <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Divisão</Label>
            <Select value={divisao} onValueChange={setDivisao}>
              <SelectTrigger className="mt-1">
                <SelectValue placeholder="Selecione uma divisão" />
              </SelectTrigger>
              <SelectContent>
                {divisoes.map(d => (
                  <SelectItem key={d} value={d}>{d}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={onCancel} className="text-red-500 border-red-200 hover:bg-red-50">
              Cancelar
            </Button>
            <Button
              onClick={() => onSave({ email: email.trim(), nome: nome.trim(), divisao })}
              disabled={!email.trim() || !nome.trim() || !divisao}
              className="bg-green-500 hover:bg-green-600 text-white"
            >
              ✓ {gestor ? 'Salvar' : 'Criar'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function CriarPerfil() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [editingGestor, setEditingGestor] = useState(null);

  const { data: setores = [] } = useQuery({
    queryKey: ['setores'],
    queryFn: () => api.entities.Setor.list(),
  });

  const { data: gestores = [] } = useQuery({
    queryKey: ['gestores'],
    queryFn: () => api.entities.Gestor.list(),
  });

  const divisoes = [...new Set(setores.map(s => s.divisao))].sort();

  const createGestor = useMutation({
    mutationFn: (data) => api.entities.Gestor.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['gestores'] });
      setModalOpen(false);
      setEditingGestor(null);
      toast({ title: 'Gestor criado com sucesso!' });
    },
  });

  const updateGestor = useMutation({
    mutationFn: ({ id, data }) => api.entities.Gestor.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['gestores'] });
      setModalOpen(false);
      setEditingGestor(null);
      toast({ title: 'Gestor atualizado!' });
    },
  });

  const deleteGestor = useMutation({
    mutationFn: (id) => api.entities.Gestor.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['gestores'] });
      toast({ title: 'Gestor removido.' });
    },
  });

  const handleSave = (data) => {
    if (editingGestor) {
      updateGestor.mutate({ id: editingGestor.id, data });
    } else {
      createGestor.mutate(data);
    }
  };

  const handleEdit = (gestor) => {
    setEditingGestor(gestor);
    setModalOpen(true);
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <div className="flex items-center gap-2">
          <Users className="w-4 h-4 text-primary" />
          <span className="font-jakarta font-bold text-base">Criar Perfis de Gestores</span>
        </div>
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-xs border-cyan-400 text-cyan-600 hover:bg-cyan-50 gap-1"
          onClick={() => {
            setEditingGestor(null);
            setModalOpen(true);
          }}
        >
          <Plus className="w-3 h-3" />Novo Gestor
        </Button>
      </div>

      {/* Gestores List */}
      <div className="space-y-2">
        {gestores.length === 0 ? (
          <div className="text-center text-muted-foreground py-8 text-sm border border-dashed rounded-lg">
            Nenhum gestor cadastrado. Clique em "+ Novo Gestor" para começar.
          </div>
        ) : (
          gestores.map(gestor => (
            <div
              key={gestor.id}
              className="flex items-center justify-between p-4 rounded-lg border bg-card hover:bg-secondary/20 transition-colors group"
            >
              <div className="flex-1">
                <p className="text-sm font-medium text-foreground">{gestor.nome}</p>
                <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground flex-wrap">
                  <span>📧 {gestor.email}</span>
                  <span>•</span>
                  <span>🏢 {gestor.divisao}</span>
                  {!gestor.ativo && (
                    <>
                      <span>•</span>
                      <span className="text-red-600 font-medium">Inativo</span>
                    </>
                  )}
                </div>
              </div>
              <div className="flex gap-1 ml-2 opacity-0 group-hover:opacity-100 transition-opacity">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => handleEdit(gestor)}
                >
                  <Edit2 className="w-3.5 h-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-destructive hover:text-destructive"
                  onClick={() => deleteGestor.mutate(gestor.id)}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Modal */}
      <GestorModal
        open={modalOpen}
        gestor={editingGestor}
        divisoes={divisoes}
        onSave={handleSave}
        onCancel={() => {
          setModalOpen(false);
          setEditingGestor(null);
        }}
      />
    </div>
  );
}