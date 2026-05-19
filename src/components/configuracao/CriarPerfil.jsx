import { useState, useEffect, useMemo } from 'react';
import { api } from '@/api/apiClient';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, Edit2, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/components/ui/use-toast';
import { parseGestorDivisoesList } from '@/lib/gestorSession';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  GESTOR_NIVEL_COMPLETO,
  GESTOR_NIVEL_LANCAMENTO,
  labelGestorNivelAcesso,
  normalizeGestorNivelAcesso,
} from '@/lib/gestorNivelAcesso';

/** @param {unknown} raw */
function parseUnidadesIds(raw) {
  if (raw == null || String(raw).trim() === '') return [];
  return [...new Set(String(raw).split(/[|;]+/g).map((s) => s.trim()).filter(Boolean))];
}

function GestorModal({ open, gestor, setores, onSave, onCancel }) {
  const [login, setLogin] = useState('');
  const [senha, setSenha] = useState('');
  const [divisoesSel, setDivisoesSel] = useState([]);
  const [unidadesSel, setUnidadesSel] = useState([]);
  const [nivelAcesso, setNivelAcesso] = useState(GESTOR_NIVEL_COMPLETO);

  useEffect(() => {
    if (!open) return;
    setLogin(String(gestor?.login || gestor?.nome || '').trim());
    setSenha('');
    setDivisoesSel(parseGestorDivisoesList(gestor?.divisoes));
    setUnidadesSel(parseUnidadesIds(gestor?.unidades));
    setNivelAcesso(normalizeGestorNivelAcesso(gestor?.nivel_acesso));
  }, [open, gestor?.id, gestor?.login, gestor?.nome, gestor?.unidades, gestor?.divisoes, gestor?.nivel_acesso]);

  const setoresOrdenados = useMemo(
    () => [...setores].sort((a, b) => String(a.nome || '').localeCompare(String(b.nome || ''), 'pt-BR')),
    [setores]
  );

  const divisoesOpcoes = useMemo(() => {
    const nomes = setoresOrdenados.map((s) => String(s.divisao || '').trim()).filter(Boolean);
    return [...new Set(nomes)].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }, [setoresOrdenados]);

  const setoresParaUnidades = useMemo(() => {
    if (!divisoesSel.length) return setoresOrdenados;
    const allow = new Set(divisoesSel.map((d) => String(d).trim()));
    return setoresOrdenados.filter((s) => allow.has(String(s.divisao || '').trim()));
  }, [setoresOrdenados, divisoesSel]);

  useEffect(() => {
    if (!open || !divisoesSel.length) return;
    const valid = new Set(setoresParaUnidades.map((s) => String(s.id)));
    setUnidadesSel((prev) => prev.filter((id) => valid.has(String(id))));
  }, [open, divisoesSel, setoresParaUnidades]);

  const toggleDivisao = (nome) => {
    const n = String(nome).trim();
    setDivisoesSel((prev) => (prev.includes(n) ? prev.filter((x) => x !== n) : [...prev, n]));
  };

  const toggleUnidade = (setorId) => {
    const sid = String(setorId);
    setUnidadesSel((prev) => (prev.includes(sid) ? prev.filter((x) => x !== sid) : [...prev, sid]));
  };

  const handleOpenChange = (v) => {
    if (!v) onCancel();
  };

  const isEdit = Boolean(gestor?.id);
  const temEscopo = divisoesSel.length > 0 || unidadesSel.length > 0;
  const canSubmit =
    login.trim().length > 0 && temEscopo && (!isEdit ? senha.trim().length > 0 : true);

  const handleSubmit = () => {
    let divisoesArr = [...divisoesSel];
    if (!divisoesArr.length && unidadesSel.length) {
      const d = new Set();
      unidadesSel.forEach((id) => {
        const s = setores.find((x) => String(x.id) === String(id));
        const div = s && String(s.divisao || '').trim();
        if (div) d.add(div);
      });
      divisoesArr = [...d];
    }
    const divisoes = divisoesArr.join('|');
    const unidades = unidadesSel.join('|');
    const nivel = normalizeGestorNivelAcesso(nivelAcesso);
    if (isEdit) {
      const data = { login: login.trim(), unidades, divisoes, nivel_acesso: nivel };
      if (senha.trim()) data.senha = senha.trim();
      onSave(data);
    } else {
      onSave({
        login: login.trim(),
        senha: senha.trim(),
        unidades,
        divisoes,
        ativo: true,
        nivel_acesso: nivel,
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="font-jakarta text-lg font-bold">
            {isEdit ? 'Editar membro' : 'Novo membro'}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-1">
          <p className="text-xs text-muted-foreground">
            Login, senha, divisões de acesso (definidas nos setores) e, opcionalmente, setores para refinar o acesso.
          </p>
          <div>
            <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Login</Label>
            <Input
              autoFocus
              type="text"
              autoComplete="username"
              value={login}
              onChange={(e) => setLogin(e.target.value)}
              placeholder="Ex: maria.silva"
              className="mt-1"
            />
          </div>
          <div>
            <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Senha {isEdit && <span className="font-normal normal-case">(deixe em branco para manter)</span>}
            </Label>
            <Input
              type="password"
              autoComplete={isEdit ? 'new-password' : 'new-password'}
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              placeholder={isEdit ? '••••••••' : 'Mínimo recomendado: 6 caracteres'}
              className="mt-1"
            />
          </div>
          <div>
            <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Divisões com acesso
            </Label>
            <p className="text-[11px] text-muted-foreground mt-1 mb-2">
              O membro vê dados e configuração dos indicadores dessas divisões. Pode combinar com a lista de setores abaixo.
            </p>
            <div className="mt-2 max-h-36 overflow-y-auto rounded-md border border-border p-2 space-y-2">
              {divisoesOpcoes.length === 0 ? (
                <p className="text-xs text-muted-foreground">Defina divisões nos setores (aba Setores) para listar aqui.</p>
              ) : (
                divisoesOpcoes.map((nome) => {
                  const checked = divisoesSel.includes(nome);
                  return (
                    <label
                      key={nome}
                      className="flex items-center gap-2 text-sm cursor-pointer hover:bg-secondary/50 rounded px-1 py-0.5"
                    >
                      <Checkbox checked={checked} onCheckedChange={() => toggleDivisao(nome)} />
                      <span className="font-medium">{nome}</span>
                    </label>
                  );
                })
              )}
            </div>
          </div>
          <div>
            <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Nível de acesso
            </Label>
            <p className="text-[11px] text-muted-foreground mt-1 mb-2">
              &quot;Apenas lançamento&quot; oculta a área Configuração para este membro (outras páginas permanecem).
            </p>
            <RadioGroup
              value={nivelAcesso}
              onValueChange={(v) => setNivelAcesso(v)}
              className="mt-2 space-y-2 rounded-md border border-border p-3"
            >
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <RadioGroupItem value={GESTOR_NIVEL_COMPLETO} id="nivel-completo" />
                <span>Lançamento e configuração (módulos do âmbito da divisão)</span>
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <RadioGroupItem value={GESTOR_NIVEL_LANCAMENTO} id="nivel-lancamento" />
                <span>Apenas lançamento</span>
              </label>
            </RadioGroup>
          </div>
          <div>
            <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Setores (opcional — refina o acesso)
            </Label>
            <div className="mt-2 max-h-52 overflow-y-auto rounded-md border border-border p-2 space-y-2">
              {setoresParaUnidades.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  {divisoesSel.length
                    ? 'Nenhum setor nas divisões selecionadas.'
                    : 'Cadastre setores na aba Setores primeiro.'}
                </p>
              ) : (
                setoresParaUnidades.map((s) => {
                  const sid = String(s.id);
                  const checked = unidadesSel.includes(sid);
                  return (
                    <label
                      key={sid}
                      className="flex items-center gap-2 text-sm cursor-pointer hover:bg-secondary/50 rounded px-1 py-0.5"
                    >
                      <Checkbox checked={checked} onCheckedChange={() => toggleUnidade(sid)} />
                      <span className="flex-1">
                        <span className="font-medium">{s.nome}</span>
                        {s.divisao ? (
                          <span className="text-muted-foreground text-xs ml-1">({s.divisao})</span>
                        ) : null}
                      </span>
                    </label>
                  );
                })
              )}
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={onCancel} className="text-red-500 border-red-200 hover:bg-red-50">
              Cancelar
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={!canSubmit}
              className="bg-green-500 hover:bg-green-600 text-white"
            >
              ✓ {isEdit ? 'Salvar' : 'Criar'}
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

  const nomeSetor = (id) => setores.find((s) => String(s.id) === String(id))?.nome || id;

  const formatUnidades = (raw) => {
    const ids = parseUnidadesIds(raw);
    if (!ids.length) return '—';
    return ids.map(nomeSetor).join(', ');
  };

  const formatDivisoes = (raw) => {
    const list = parseGestorDivisoesList(raw);
    return list.length ? list.join(', ') : '—';
  };

  const createGestor = useMutation({
    mutationFn: (data) => api.entities.Gestor.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['gestores'] });
      setModalOpen(false);
      setEditingGestor(null);
      toast({ title: 'Membro criado com sucesso!' });
    },
    onError: (e) => {
      toast({
        title: 'Erro ao criar',
        description: e?.message || String(e),
        variant: 'destructive',
      });
    },
  });

  const updateGestor = useMutation({
    /**
     * @param {{ id: string | number, data: Record<string, unknown> }} vars
     */
    mutationFn: (vars) => api.entities.Gestor.update(vars.id, vars.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['gestores'] });
      setModalOpen(false);
      setEditingGestor(null);
      toast({ title: 'Membro atualizado!' });
    },
    onError: (e) => {
      toast({
        title: 'Erro ao atualizar',
        description: e?.message || String(e),
        variant: 'destructive',
      });
    },
  });

  const deleteGestor = useMutation({
    mutationFn: (id) => api.entities.Gestor.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['gestores'] });
      toast({ title: 'Membro removido.' });
    },
  });

  const handleSave = (data) => {
    if (editingGestor) {
      updateGestor.mutate({ id: editingGestor.id, data });
    } else {
      createGestor.mutate(data);
    }
  };

  const handleEdit = (g) => {
    setEditingGestor(g);
    setModalOpen(true);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 mb-4">
        <div className="flex items-center gap-2">
          <Users className="w-4 h-4 text-primary" />
          <span className="font-jakarta font-bold text-base">Perfis de membros</span>
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
          <Plus className="w-3 h-3" />
          Novo membro
        </Button>
      </div>

      <div className="space-y-2">
        {gestores.length === 0 ? (
          <div className="text-center text-muted-foreground py-8 text-sm border border-dashed rounded-lg">
            Nenhum membro cadastrado. Clique em &quot;Novo membro&quot; para adicionar login, senha, divisões e setores.
          </div>
        ) : (
          gestores.map((g) => (
            <div
              key={g.id}
              className="flex items-center justify-between p-4 rounded-lg border bg-card hover:bg-secondary/20 transition-colors group"
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground">{g.login || g.nome || '—'}</p>
                <p className="text-xs text-muted-foreground mt-1 break-words">
                  <span className="font-medium text-foreground/80">Divisões:</span> {formatDivisoes(g.divisoes)}
                </p>
                <p className="text-xs text-muted-foreground mt-1 break-words">
                  <span className="font-medium text-foreground/80">Setores:</span> {formatUnidades(g.unidades)}
                </p>
                <p className="text-xs text-muted-foreground mt-1 break-words">
                  <span className="font-medium text-foreground/80">Nível:</span> {labelGestorNivelAcesso(g.nivel_acesso)}
                </p>
                {g.ativo === false || g.ativo === 'FALSE' ? (
                  <p className="text-xs text-red-600 font-medium mt-1">Inativo</p>
                ) : null}
              </div>
              <div className="flex gap-1 ml-2 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleEdit(g)}>
                  <Edit2 className="w-3.5 h-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-destructive hover:text-destructive"
                  onClick={() => deleteGestor.mutate(g.id)}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
          ))
        )}
      </div>

      <GestorModal
        open={modalOpen}
        gestor={editingGestor}
        setores={setores}
        onSave={handleSave}
        onCancel={() => {
          setModalOpen(false);
          setEditingGestor(null);
        }}
      />
    </div>
  );
}
