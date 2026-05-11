import { useState } from 'react';
import { api } from '@/api/apiClient';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Save, ChevronDown, ChevronRight, Info, Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { useToast } from '@/components/ui/use-toast';
import { MESES_COMPLETO } from '@/lib/indicadores';

export default function Lancamento({ ano, mes }) {
  const anoAtual = ano || new Date().getFullYear();
  const mesAtual = mes || new Date().getMonth() + 1;
  const [setorId, setSetorId] = useState('');
  const [openModulos, setOpenModulos] = useState({});
  const [editando, setEditando] = useState({});
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: setores = [] } = useQuery({ queryKey: ['setores'], queryFn: () => api.entities.Setor.list() });
  const { data: modulos = [] } = useQuery({ queryKey: ['modulos'], queryFn: () => api.entities.Modulo.list() });
  const { data: indicadores = [] } = useQuery({ queryKey: ['indicadores'], queryFn: () => api.entities.Indicador.list() });
  const { data: metas = [] } = useQuery({ queryKey: ['metas', anoAtual], queryFn: () => api.entities.Meta.filter({ ano: anoAtual }) });

  const { data: lancamentos = [], isLoading: loadingLanc } = useQuery({
    queryKey: ['lancamentos', anoAtual, mesAtual, setorId],
    queryFn: () => api.entities.Lancamento.filter({ ano: anoAtual, mes: mesAtual, setor_id: setorId }),
    enabled: !!setorId,
  });

  const upsertMutation = useMutation({
    mutationFn: async ({ indicador, valor, nota }) => {
      const setor = setores.find(s => s.id === setorId);
      const existing = lancamentos.find(l => l.indicador_id === indicador.id);
      const payload = {
        indicador_id: indicador.id,
        indicador_nome: indicador.nome,
        setor_id: setorId,
        setor_nome: setor?.nome || '',
        modulo_id: indicador.modulo_id,
        ano: anoAtual,
        mes: mesAtual,
        valor: parseFloat(valor),
        nota: nota || '',
      };
      if (existing) {
        return api.entities.Lancamento.update(existing.id, payload);
      } else {
        return api.entities.Lancamento.create(payload);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lancamentos'] });
      toast({ title: 'Salvo com sucesso!', description: 'Lançamento registrado.' });
    },
    onError: (e) => toast({ title: 'Erro', description: e.message, variant: 'destructive' }),
  });

  const getLancamento = (indicadorId) => lancamentos.find(l => l.indicador_id === indicadorId);
  const getMeta = (indicadorId) =>
    metas.find(m => m.indicador_id === indicadorId && m.setor_id === setorId && m.ano === anoAtual);

  const handleEdit = (indicadorId, field, value) => {
    setEditando(prev => ({
      ...prev,
      [indicadorId]: { ...prev[indicadorId], [field]: value }
    }));
  };

  const handleSave = (indicador) => {
    const edit = editando[indicador.id] || {};
    const lanc = getLancamento(indicador.id);
    const valor = edit.valor !== undefined ? edit.valor : String(lanc?.valor ?? '');
    const nota = edit.nota !== undefined ? edit.nota : (lanc?.nota ?? '');
    if (valor === '' || valor === null) return;
    upsertMutation.mutate({ indicador, valor, nota });
  };

  const handleSaveAll = async () => {
    const allInds = indicadores.filter(i => i.ativo !== false);
    const toSave = allInds.filter(ind => {
      const edit = editando[ind.id] || {};
      const lanc = getLancamento(ind.id);
      const valor = edit.valor !== undefined ? edit.valor : String(lanc?.valor ?? '');
      return valor !== '' && valor !== null;
    });
    if (toSave.length === 0) {
      toast({ title: 'Nenhum dado para salvar', description: 'Preencha ao menos um campo.', variant: 'destructive' });
      return;
    }
    await Promise.all(toSave.map(ind => {
      const edit = editando[ind.id] || {};
      const lanc = getLancamento(ind.id);
      const valor = edit.valor !== undefined ? edit.valor : String(lanc?.valor ?? '');
      const nota = edit.nota !== undefined ? edit.nota : (lanc?.nota ?? '');
      return upsertMutation.mutateAsync({ indicador: ind, valor, nota });
    }));
    toast({ title: '✅ Seus dados foram salvos', description: `${toSave.length} indicador(es) registrado(s) com sucesso.` });
  };

  const toggleModulo = (id) => setOpenModulos(prev => ({ ...prev, [id]: !prev[id] }));

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-screen-xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-jakarta font-bold">Lançamento de Dados</h1>
          <p className="text-muted-foreground text-sm mt-0.5">{MESES_COMPLETO[mesAtual - 1]} / {anoAtual}</p>
        </div>
        <Select value={setorId} onValueChange={setSetorId}>
          <SelectTrigger className="w-56">
            <SelectValue placeholder="Selecione o setor..." />
          </SelectTrigger>
          <SelectContent>
            {setores.map(s => <SelectItem key={s.id} value={s.id}>{s.nome}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {!setorId ? (
        <Card className="border-dashed">
          <CardContent className="py-16 text-center">
            <Info className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
            <p className="text-muted-foreground">Selecione um setor para iniciar o lançamento</p>
          </CardContent>
        </Card>
      ) : loadingLanc ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      ) : (
        <div className="space-y-4">
          {modulos.map(modulo => {
            const inds = indicadores.filter(i => i.modulo_id === modulo.id && i.ativo !== false);
            if (inds.length === 0) return null;
            const isOpen = openModulos[modulo.id] !== false;

            return (
              <Collapsible key={modulo.id} open={isOpen} onOpenChange={() => toggleModulo(modulo.id)}>
                <Card className="overflow-hidden">
                  <CollapsibleTrigger className="w-full">
                    <CardHeader className="pb-3 bg-secondary/30 hover:bg-secondary/50 transition-colors cursor-pointer">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-base font-jakarta flex items-center gap-2">
                          {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                          {modulo.nome}
                        </CardTitle>
                        <Badge variant="outline" className="text-xs">{inds.length} indicadores</Badge>
                      </div>
                    </CardHeader>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <CardContent className="pt-4">
                      <div className="space-y-4">
                        {/* Header row */}
                        <div className="hidden md:grid grid-cols-12 gap-3 text-xs font-medium text-muted-foreground uppercase tracking-wide border-b pb-2">
                          <div className="col-span-4">Indicador</div>
                          <div className="col-span-2 text-center">Meta</div>
                          <div className="col-span-2">Unidade</div>
                          <div className="col-span-2 text-center">Valor</div>
                          <div className="col-span-1 text-center">Ação</div>
                        </div>
                        {inds.map(ind => {
                          const lanc = getLancamento(ind.id);
                          const meta = getMeta(ind.id);
                          const editAtual = editando[ind.id] || {};
                          const valorDisplay = editAtual.valor !== undefined ? editAtual.valor : String(lanc?.valor ?? '');
                          const notaDisplay = editAtual.nota !== undefined ? editAtual.nota : (lanc?.nota ?? '');
                          const hasChanges = editAtual.valor !== undefined || editAtual.nota !== undefined;

                          return (
                            <div key={ind.id} className="space-y-2">
                              <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center py-2 border-b border-dashed last:border-0">
                                <div className="md:col-span-4">
                                  <p className="text-sm font-medium">{ind.label || ind.nome}</p>
                                  <p className="text-xs text-muted-foreground md:hidden">{ind.unidade} | Meta: {meta?.valor ?? '—'}</p>
                                </div>
                                <div className="hidden md:flex md:col-span-2 justify-center">
                                  <span className="text-sm font-medium text-muted-foreground">{meta?.valor ?? '—'}</span>
                                </div>
                                <div className="hidden md:block md:col-span-2 text-sm text-muted-foreground">{ind.unidade}</div>
                                <div className="md:col-span-2">
                                  <Input
                                    type="number"
                                    step="any"
                                    value={valorDisplay}
                                    onChange={e => handleEdit(ind.id, 'valor', e.target.value)}
                                    placeholder="0"
                                    className="h-8 text-sm text-center"
                                  />
                                </div>
                                <div className="md:col-span-1 flex justify-center">
                                  <Button
                                    size="sm"
                                    variant={hasChanges ? 'default' : 'outline'}
                                    className="h-8 px-3"
                                    disabled={upsertMutation.isPending}
                                    onClick={() => handleSave(ind)}
                                  >
                                    {upsertMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                                  </Button>
                                </div>
                              </div>
                              <div className="md:pl-4">
                                <Textarea
                                  value={notaDisplay}
                                  onChange={e => handleEdit(ind.id, 'nota', e.target.value)}
                                  placeholder="Nota/justificativa (opcional)..."
                                  className="text-xs min-h-0 h-8 resize-none py-1.5"
                                />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </CardContent>
                  </CollapsibleContent>
                </Card>
              </Collapsible>
            );
          })}
        </div>
      )}

      {setorId && (
        <div className="flex justify-center pt-2 pb-4">
          <Button
            size="lg"
            onClick={handleSaveAll}
            disabled={upsertMutation.isPending}
            className="px-10 gap-2"
          >
            {upsertMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Salvar Dados
          </Button>
        </div>
      )}
    </div>
  );
}