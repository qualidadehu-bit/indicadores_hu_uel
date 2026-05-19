import { useState, useEffect, useMemo } from 'react';
import { api } from '@/api/apiClient';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, Edit2, Layers, FileDown, ChevronUp, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/components/ui/use-toast';
import {
  parseDivisoesIndicador,
  serializeDivisoesParaIndicador,
  filtrarIndicadoresPorDivisoesGestor,
  filtrarIndicadoresPorSetorWhitelist,
} from '@/lib/indicadorDivisao';
import { useAuth } from '@/lib/AuthContext';
import { getSetoresVisiveisParaUsuario, getDivisoesScopeParaGestor } from '@/lib/gestorSession';
import { getModuloDashboardKind, storedTipoUiForSelect, TIPO_UI_SELECT_OPTIONS } from '@/lib/moduloTipoUi';
import {
  parseRadarFaixasRaw,
  serializeRadarFaixas,
  defaultRadarFaixasEditorRows,
  formatFaixaRange,
  radarFaixasPatchIfEditing,
} from '@/lib/radarFaixas';
import { drawPdfCover, loadPdfCoverAssets } from '@/lib/pdfCover';
import { jsPDF } from 'jspdf';
import { normalizeTipoGrafico, tipoGraficoEfetivoIndicador } from '@/lib/graficoTipo';
import { parsePizzaFatiasRaw, serializePizzaFatias, duplicatePizzaFatiaIndicadorIds } from '@/lib/pizzaFatias';
import { normalizeSheetId } from '@/lib/sheetsEntityNormalize';

const TIPO_GRAFICO_LABEL = {
  linha: 'Linha',
  barra: 'Barras',
  area: 'Área',
  radar: 'Radar',
  pizza: 'Pizza',
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
  { value: 'pizza',      label: 'Pizza',          emoji: '🍕' },
  { value: 'radar',      label: 'Radar',          emoji: '🕸️' },
];

/** @typedef {{ id: string, nome?: string, divisao?: string, indicador_ids?: string }} SetorEntity */
/** @typedef {{ id: string, nome?: string, tipo_grafico?: string, layout_modulo?: string, layout_dashboard?: string, ordem?: number }} ModuloEntity */
/** @typedef {{ id: string, nome?: string, label?: string, unidade?: string, grupo_radar?: string, grupo_serie?: string, tipo_grafico?: string, tipo_direcao_meta?: string, divisoes?: string, ordem?: number, modulo_id?: string, ativo?: boolean }} IndicadorEntity */

/**
 * Mesmo nome de grupo_serie com tipos efetivos diferentes: o dashboard separa em blocos;
 * avisamos aqui para o gestor alinhar override ou grupo.
 * @param {Record<string, unknown>[]} inds
 * @param {Record<string, unknown>|null|undefined} modulo
 */
function findGrupoSerieTipoConflicts(inds, modulo) {
  /** @type {Map<string, Set<string>>} */
  const byGrupo = new Map();
  for (const ind of inds) {
    const g = String(ind.grupo_serie || '').trim();
    if (!g) continue;
    const t = tipoGraficoEfetivoIndicador(ind, modulo);
    if (!byGrupo.has(g)) byGrupo.set(g, new Set());
    byGrupo.get(g).add(t);
  }
  /** @type {{ grupo: string, tipos: string[] }[]} */
  const out = [];
  for (const [grupo, set] of byGrupo) {
    if (set.size > 1) out.push({ grupo, tipos: [...set].sort() });
  }
  return out;
}

function chartTypeLabel(value) {
  return CHART_TYPES.find((c) => c.value === value)?.label || value;
}

// ---- Modal: new/edit Módulo ----
const LAYOUT_MODULO_OPTIONS = [
  { value: 'padrao', label: 'Compacto (padrão)', desc: 'Título e valor na mesma linha do gráfico' },
  { value: 'card_grafico', label: 'Card + gráfico', desc: 'Destaque do valor do mês em card acima do gráfico' },
];

const LAYOUT_DASHBOARD_OPTIONS = [
  { value: 'padrao', label: 'Dashboard padrão', desc: 'Bloco genérico com gráficos por indicador (ou cards especiais)' },
  {
    value: 'bundle_kpi_tabela',
    label: 'Bundle KPI + tabela + gráfico',
    desc: 'Faixa de KPIs, tabela 12 meses e tendência; LP usa preset automático; demais módulos usam layout genérico',
  },
];

/**
 * Editor de fatias para pizza customizada (rótulo + indicador de origem do valor).
 * @param {{ rows: { label: string, indicador_id: string }[], onChange: (r: { label: string, indicador_id: string }[]) => void, indicadorOpcoes: { id: string, titulo: string }[], disabled?: boolean }} props
 */
const RADAR_COR_OPCOES = [
  { value: '#3b82f6', label: 'Azul' },
  { value: '#22c55e', label: 'Verde' },
  { value: '#ca8a04', label: 'Amarelo' },
  { value: '#f97316', label: 'Laranja' },
  { value: '#dc2626', label: 'Vermelho' },
  { value: '#7c3aed', label: 'Roxo' },
  { value: '#0d9488', label: 'Teal' },
];

/**
 * Editor de faixas da legenda do radar qualidade (%).
 * @param {{ rows: import('@/lib/radarFaixas').RadarFaixa[], onChange: (r: import('@/lib/radarFaixas').RadarFaixa[]) => void, disabled?: boolean, inheritHint?: string }} props
 */
function RadarFaixasEditor({ rows, onChange, disabled, inheritHint }) {
  const setRow = (i, patch) => {
    onChange(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  };
  const add = () => onChange([...rows, { label: '', min: 0, max: 100, emoji: '●', cor: '#22c55e' }]);
  const remove = (i) => onChange(rows.filter((_, j) => j !== i));
  const move = (i, dir) => {
    const j = i + dir;
    if (j < 0 || j >= rows.length) return;
    const next = [...rows];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };

  return (
    <div className="space-y-2 rounded-lg border border-border/80 bg-muted/20 p-3">
      <p className="text-xs font-semibold text-foreground">Legenda do radar (faixas de %)</p>
      <p className="text-[11px] text-muted-foreground">
        Cada faixa define o rótulo, intervalo de valor (0–100), emoji e cor na legenda e nas células coloridas.
        {inheritHint ? ` ${inheritHint}` : ''}
      </p>
      <p className="text-[10px] text-amber-900 bg-amber-50 border border-amber-200 rounded-md px-2 py-1.5">
        Na planilha Google, a linha 1 da aba <strong>modulo</strong> ou <strong>indicador</strong> precisa da coluna{' '}
        <span className="font-mono">radar_faixas</span> — sem ela o salvamento não persiste e o dashboard usa o padrão MISP.
      </p>
      {rows.length === 0 ? (
        <p className="text-xs text-muted-foreground italic">
          Nenhuma faixa customizada — será usado o padrão MISP ou o do módulo.
        </p>
      ) : (
        <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
          {rows.map((row, i) => (
            <div key={i} className="flex flex-col gap-2 rounded-md border bg-background p-2">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-[10px] uppercase text-muted-foreground">Rótulo</Label>
                  <Input
                    value={row.label}
                    onChange={(e) => setRow(i, { label: e.target.value })}
                    placeholder="Ex: ADEQUADO"
                    className="h-8 text-sm"
                    disabled={disabled}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px] uppercase text-muted-foreground">Emoji</Label>
                  <Input
                    value={row.emoji}
                    onChange={(e) => setRow(i, { emoji: e.target.value })}
                    placeholder="🙂"
                    className="h-8 text-sm"
                    disabled={disabled}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px] uppercase text-muted-foreground">Mín. %</Label>
                  <Input
                    type="number"
                    value={row.min}
                    onChange={(e) => setRow(i, { min: Number(e.target.value) })}
                    className="h-8 text-sm"
                    disabled={disabled}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px] uppercase text-muted-foreground">Máx. %</Label>
                  <Input
                    type="number"
                    value={row.max}
                    onChange={(e) => setRow(i, { max: Number(e.target.value) })}
                    className="h-8 text-sm"
                    disabled={disabled}
                  />
                </div>
                <div className="space-y-1 sm:col-span-2">
                  <Label className="text-[10px] uppercase text-muted-foreground">Cor</Label>
                  <Select
                    value={row.cor || '#22c55e'}
                    onValueChange={(v) => setRow(i, { cor: v })}
                    disabled={disabled}
                  >
                    <SelectTrigger className="h-8 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {RADAR_COR_OPCOES.map((op) => (
                        <SelectItem key={op.value} value={op.value}>
                          <span className="inline-flex items-center gap-2">
                            <span className="w-3 h-3 rounded-full" style={{ backgroundColor: op.value }} />
                            {op.label}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    Prévia: {formatFaixaRange(row)}
                  </p>
                </div>
              </div>
              <div className="flex gap-0.5 justify-end">
                <Button type="button" variant="ghost" size="icon" className="h-8 w-8" disabled={disabled || i === 0} onClick={() => move(i, -1)} aria-label="Subir">
                  <ChevronUp className="w-4 h-4" />
                </Button>
                <Button type="button" variant="ghost" size="icon" className="h-8 w-8" disabled={disabled || i === rows.length - 1} onClick={() => move(i, 1)} aria-label="Descer">
                  <ChevronDown className="w-4 h-4" />
                </Button>
                <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-destructive" disabled={disabled} onClick={() => remove(i)} aria-label="Remover">
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" className="h-8 text-xs" onClick={add} disabled={disabled}>
          <Plus className="w-3 h-3 mr-1" />
          Adicionar faixa
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 text-xs"
          disabled={disabled}
          onClick={() => onChange(defaultRadarFaixasEditorRows())}
        >
          Restaurar padrão MISP
        </Button>
      </div>
    </div>
  );
}

function PizzaFatiasEditor({ rows, onChange, indicadorOpcoes, disabled = false }) {
  const dupFatiaIds = useMemo(() => duplicatePizzaFatiaIndicadorIds(rows), [rows]);
  const setRow = (i, patch) => {
    const next = rows.map((r, j) => (j === i ? { ...r, ...patch } : r));
    onChange(next);
  };
  const add = () => onChange([...rows, { label: '', indicador_id: '' }]);
  const remove = (i) => onChange(rows.filter((_, j) => j !== i));
  const move = (i, dir) => {
    const j = i + dir;
    if (j < 0 || j >= rows.length) return;
    const next = [...rows];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };

  return (
    <div className="space-y-2 rounded-lg border border-border/80 bg-muted/20 p-3">
      <p className="text-xs font-semibold text-foreground">Fatias do gráfico pizza</p>
      <p className="text-[11px] text-muted-foreground">
        Cada fatia mostra o valor de lançamento do <strong>mês atual do dashboard</strong> para o indicador
        escolhido. Deixe sem linhas para manter o pizza clássico (fatias = meses do ano).
      </p>
      {dupFatiaIds.length > 0 ? (
        <p className="text-xs text-amber-950 bg-amber-50 border border-amber-200 rounded-md px-2 py-1.5">
          O mesmo indicador está associado a mais de uma fatia (ids: {dupFatiaIds.join(', ')}). O gráfico somará
          valores duplicados na proporção; confirme se foi intencional.
        </p>
      ) : null}
      {rows.length === 0 ? (
        <p className="text-xs text-muted-foreground italic">Nenhuma fatia — será usada a distribuição por meses.</p>
      ) : (
        <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
          {rows.map((row, i) => (
            <div key={i} className="flex flex-col gap-2 rounded-md border bg-background p-2 sm:flex-row sm:items-end">
              <div className="flex-1 space-y-1">
                <Label className="text-[10px] uppercase text-muted-foreground">Rótulo da fatia</Label>
                <Input
                  value={row.label}
                  onChange={(e) => setRow(i, { label: e.target.value })}
                  placeholder="Ex: 13 a 19 anos"
                  className="h-8 text-sm"
                  disabled={disabled}
                />
              </div>
              <div className="flex-[1.2] space-y-1 min-w-0">
                <Label className="text-[10px] uppercase text-muted-foreground">Indicador (origem do valor)</Label>
                <Select
                  value={row.indicador_id || '__none'}
                  onValueChange={(v) => setRow(i, { indicador_id: v === '__none' ? '' : v })}
                  disabled={disabled}
                >
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue placeholder="Escolher…" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none">—</SelectItem>
                    {indicadorOpcoes.map((op) => (
                      <SelectItem key={op.id} value={op.id}>
                        {op.titulo}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex gap-0.5 shrink-0">
                <Button type="button" variant="ghost" size="icon" className="h-8 w-8" disabled={disabled || i === 0} onClick={() => move(i, -1)} aria-label="Subir">
                  <ChevronUp className="w-4 h-4" />
                </Button>
                <Button type="button" variant="ghost" size="icon" className="h-8 w-8" disabled={disabled || i === rows.length - 1} onClick={() => move(i, 1)} aria-label="Descer">
                  <ChevronDown className="w-4 h-4" />
                </Button>
                <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-destructive" disabled={disabled} onClick={() => remove(i)} aria-label="Remover">
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
      <Button type="button" variant="outline" size="sm" className="h-8 text-xs" onClick={add} disabled={disabled}>
        <Plus className="w-3 h-3 mr-1" />
        Adicionar fatia
      </Button>
    </div>
  );
}

function ModuloModal({ open, modulo, indicadoresDoModulo = [], onSave, onCancel }) {
  const [nome, setNome] = useState(modulo?.nome || '');
  const [icone, setIcone] = useState(modulo?.icone || '📋');
  const [cor, setCor] = useState(modulo?.cor || '#0a2d5e');
  const [tipo_grafico, setTipoGrafico] = useState(modulo?.tipo_grafico || 'linha');
  const [layout_modulo, setLayoutModulo] = useState(
    modulo?.layout_modulo === 'card_grafico' ? 'card_grafico' : 'padrao'
  );
  const [layout_dashboard, setLayoutDashboard] = useState(
    modulo?.layout_dashboard === 'bundle_kpi_tabela' ? 'bundle_kpi_tabela' : 'padrao'
  );
  const [tipoUi, setTipoUi] = useState('__auto');
  const [pizzaFatiasRows, setPizzaFatiasRows] = useState([]);
  const [radarFaixasRows, setRadarFaixasRows] = useState([]);

  const moduloKindEfetivo = useMemo(
    () =>
      getModuloDashboardKind({
        ...(modulo || {}),
        nome: nome.trim() || modulo?.nome,
        tipo_grafico,
        tipo_ui: tipoUi === '__auto' ? '' : tipoUi,
      }),
    [modulo, nome, tipo_grafico, tipoUi]
  );

  const showRadarFaixasModulo =
    normalizeTipoGrafico(tipo_grafico) === 'radar' ||
    tipoUi === 'misp' ||
    moduloKindEfetivo === 'misp';

  const opcionesPizzaModulo = useMemo(
    () =>
      [...indicadoresDoModulo]
        .sort((a, b) => {
          const oa = typeof a.ordem === 'number' && !Number.isNaN(a.ordem) ? a.ordem : Number(a.ordem) || 0;
          const ob = typeof b.ordem === 'number' && !Number.isNaN(b.ordem) ? b.ordem : Number(b.ordem) || 0;
          return oa - ob || String(a.nome).localeCompare(String(b.nome));
        })
        .map((ind) => ({
          id: normalizeSheetId(ind.id),
          titulo: `${ind.label || ind.nome}${ind.nome && ind.label && String(ind.nome) !== String(ind.label) ? ` (${ind.nome})` : ''}`,
        })),
    [indicadoresDoModulo]
  );

  useEffect(() => {
    if (!open) return;
    setNome(modulo?.nome || '');
    setIcone(modulo?.icone || '📋');
    setCor(modulo?.cor || '#0a2d5e');
    setTipoGrafico(modulo?.tipo_grafico || 'linha');
    setLayoutModulo(modulo?.layout_modulo === 'card_grafico' ? 'card_grafico' : 'padrao');
    setLayoutDashboard(modulo?.layout_dashboard === 'bundle_kpi_tabela' ? 'bundle_kpi_tabela' : 'padrao');
    setTipoUi(modulo ? storedTipoUiForSelect(modulo) : '__auto');
    setPizzaFatiasRows(parsePizzaFatiasRaw(modulo?.pizza_fatias));
    const parsedRadar = parseRadarFaixasRaw(modulo?.radar_faixas);
    if (parsedRadar.length > 0) {
      setRadarFaixasRows(parsedRadar);
    } else {
      const kind = getModuloDashboardKind(modulo);
      setRadarFaixasRows(
        kind === 'misp' || normalizeTipoGrafico(modulo?.tipo_grafico) === 'radar'
          ? defaultRadarFaixasEditorRows()
          : []
      );
    }
  }, [open, modulo]);

  const handleOpenChange = (v) => { if (!v) onCancel(); };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
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
          {normalizeTipoGrafico(tipo_grafico) === 'pizza' ? (
            <div className="space-y-2">
              {!modulo?.id ? (
                <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-md p-2">
                  Após criar o módulo e adicionar indicadores, edite-o novamente para definir fatias padrão do pizza
                  (opcional).
                </p>
              ) : indicadoresDoModulo.length === 0 ? (
                <p className="text-xs text-muted-foreground">Adicione indicadores ao módulo para escolher a origem de cada fatia.</p>
              ) : (
                <PizzaFatiasEditor
                  rows={pizzaFatiasRows}
                  onChange={setPizzaFatiasRows}
                  indicadorOpcoes={opcionesPizzaModulo}
                />
              )}
            </div>
          ) : null}
          {showRadarFaixasModulo ? (
            <RadarFaixasEditor
              rows={radarFaixasRows}
              onChange={setRadarFaixasRows}
              inheritHint="Salvo no módulo; indicadores podem sobrescrever com faixas próprias."
            />
          ) : null}
          <div>
            <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Layout no dashboard (genérico)</Label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
              {LAYOUT_MODULO_OPTIONS.map((op) => (
                <button
                  key={op.value}
                  type="button"
                  onClick={() => setLayoutModulo(op.value)}
                  className={`text-left rounded-lg border-2 p-3 transition-all ${
                    layout_modulo === op.value
                      ? 'border-cyan-400 bg-cyan-50 text-cyan-800'
                      : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                  }`}
                >
                  <p className="text-sm font-semibold">{op.label}</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">{op.desc}</p>
                </button>
              ))}
            </div>
          </div>
          <div>
            <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Tipo de card no dashboard</Label>
            <p className="text-[11px] text-muted-foreground mt-1 mb-2">
              Opcional. Define painel especial (IRAS, MISP, etc.). Automático = mesmo comportamento de antes (pelo nome do módulo).
            </p>
            <Select value={tipoUi} onValueChange={setTipoUi}>
              <SelectTrigger className="mt-1 h-9 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TIPO_UI_SELECT_OPTIONS.map((op) => (
                  <SelectItem key={op.value} value={op.value}>{op.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Tipo de painel no dashboard</Label>
            <div className="grid grid-cols-1 gap-2 mt-2">
              {LAYOUT_DASHBOARD_OPTIONS.map((op) => (
                <button
                  key={op.value}
                  type="button"
                  onClick={() => setLayoutDashboard(op.value)}
                  className={`text-left rounded-lg border-2 p-3 transition-all ${
                    layout_dashboard === op.value
                      ? 'border-indigo-400 bg-indigo-50 text-indigo-900'
                      : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                  }`}
                >
                  <p className="text-sm font-semibold">{op.label}</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">{op.desc}</p>
                </button>
              ))}
            </div>
            {layout_dashboard === 'bundle_kpi_tabela' && normalizeTipoGrafico(tipo_grafico) === 'radar' ? (
              <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-md p-2 mt-2">
                Com <strong>Bundle KPI + tabela</strong> e tipo <strong>Radar</strong>, o painel mantém KPIs e tabela anual;
                a tendência usa gráficos radar (não linha). Para só blocos radar sem bundle, use <strong>Dashboard padrão</strong>.
              </p>
            ) : null}
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={onCancel} className="text-red-500 border-red-200 hover:bg-red-50">
              Cancelar
            </Button>
            <Button
              onClick={() => onSave({
                nome: nome.trim(),
                icone,
                cor,
                tipo_grafico,
                layout_modulo,
                layout_dashboard,
                tipo_ui: tipoUi === '__auto' ? '' : tipoUi,
                pizza_fatias:
                  normalizeTipoGrafico(tipo_grafico) === 'pizza' ? serializePizzaFatias(pizzaFatiasRows) : '',
                ...radarFaixasPatchIfEditing(showRadarFaixasModulo, radarFaixasRows),
              })}
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
function IndicadorModal({
  open,
  indicador,
  modulo,
  indicadoresMesmoModulo = [],
  metaAtual,
  anoMeta,
  nomeSetorMeta,
  divisoesDisponiveis = [],
  ocultarDivisoesIndicador = false,
  onSave,
  onCancel,
}) {
  const [nome, setNome] = useState(indicador?.nome || '');
  const [label, setLabel] = useState(indicador?.label || '');
  const [unidade, setUnidade] = useState(indicador?.unidade || '');
  const [tipoDirecao, setTipoDirecao] = useState(indicador?.tipo_direcao_meta || 'MENOR_E_MELHOR');
  const [grupoRadar, setGrupoRadar] = useState(indicador?.grupo_radar || '');
  const [grupoSerie, setGrupoSerie] = useState(indicador?.grupo_serie || '');
  const [tipoGraficoInd, setTipoGraficoInd] = useState('__modulo');
  const [divsSel, setDivsSel] = useState([]);
  const [meta, setMeta] = useState(metaAtual !== undefined && metaAtual !== null ? String(metaAtual) : '');
  const [pizzaFatiasRows, setPizzaFatiasRows] = useState([]);
  const [radarFaixasRows, setRadarFaixasRows] = useState([]);

  const tipoGraficoEfetivoModal = useMemo(
    () => normalizeTipoGrafico(tipoGraficoInd === '__modulo' ? modulo?.tipo_grafico : tipoGraficoInd),
    [tipoGraficoInd, modulo?.tipo_grafico]
  );

  const showRadarFaixasInd =
    tipoGraficoEfetivoModal === 'radar' || getModuloDashboardKind(modulo) === 'misp';

  const opcionesPizzaIndicador = useMemo(
    () =>
      [...indicadoresMesmoModulo]
        .sort((a, b) => {
          const oa = typeof a.ordem === 'number' && !Number.isNaN(a.ordem) ? a.ordem : Number(a.ordem) || 0;
          const ob = typeof b.ordem === 'number' && !Number.isNaN(b.ordem) ? b.ordem : Number(b.ordem) || 0;
          return oa - ob || String(a.nome).localeCompare(String(b.nome));
        })
        .map((ind) => ({
          id: normalizeSheetId(ind.id),
          titulo: `${ind.label || ind.nome}${ind.nome && ind.label && String(ind.nome) !== String(ind.label) ? ` (${ind.nome})` : ''}`,
        })),
    [indicadoresMesmoModulo]
  );

  useEffect(() => {
    if (!open) return;
    setNome(indicador?.nome || '');
    setLabel(indicador?.label || '');
    setUnidade(indicador?.unidade || '');
    setTipoDirecao(indicador?.tipo_direcao_meta || 'MENOR_E_MELHOR');
    setGrupoRadar(indicador?.grupo_radar || '');
    setGrupoSerie(indicador?.grupo_serie || '');
    const rawTg = indicador?.tipo_grafico;
    setTipoGraficoInd(rawTg != null && String(rawTg).trim() !== '' ? String(rawTg).trim().toLowerCase() : '__modulo');
    setDivsSel(parseDivisoesIndicador(indicador || {}));
    setMeta(metaAtual !== undefined && metaAtual !== null ? String(metaAtual) : '');
    setPizzaFatiasRows(parsePizzaFatiasRaw(indicador?.pizza_fatias));
    const fromIndRadar = parseRadarFaixasRaw(indicador?.radar_faixas);
    if (fromIndRadar.length > 0) {
      setRadarFaixasRows(fromIndRadar);
    } else {
      const fromModRadar = parseRadarFaixasRaw(modulo?.radar_faixas);
      if (fromModRadar.length > 0) {
        setRadarFaixasRows(fromModRadar);
      } else if (
        getModuloDashboardKind(modulo) === 'misp' ||
        normalizeTipoGrafico(modulo?.tipo_grafico) === 'radar'
      ) {
        setRadarFaixasRows(defaultRadarFaixasEditorRows());
      } else {
        setRadarFaixasRows([]);
      }
    }
  }, [open, indicador, metaAtual, modulo]);

  const toggleDivisao = (nome) => {
    setDivsSel((prev) => (prev.includes(nome) ? prev.filter((x) => x !== nome) : [...prev, nome]));
  };

  // Reset when opening
  const handleOpenChange = (v) => { if (!v) onCancel(); };

  const DIRECAO_OPTIONS = [
    { value: 'MENOR_E_MELHOR', label: '↓ Menor é Melhor', desc: 'Ex: taxas de infecção, erros' },
    { value: 'MAIOR_E_MELHOR', label: '↑ Maior é Melhor', desc: 'Ex: adesão, satisfação' },
    { value: 'META_CONTRATUAL', label: '≈ Meta Contratual', desc: 'Valor exato acordado' },
  ];

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto flex flex-col">
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
            <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Grupo radar (opcional)</Label>
            <Input
              value={grupoRadar}
              onChange={e => setGrupoRadar(e.target.value)}
              placeholder="Ex: dominios_enfermagem — mesmo texto no módulo radar agrupa indicadores"
              className="mt-1"
            />
            <p className="text-[11px] text-muted-foreground mt-1">
              Só tem efeito quando o módulo está com tipo de gráfico <strong>Radar</strong>: indicadores com o mesmo valor (não vazio) aparecem num único gráfico.
            </p>
          </div>
          <div>
            <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Grupo série (opcional)</Label>
            <Input
              value={grupoSerie}
              onChange={e => setGrupoSerie(e.target.value)}
              placeholder="Ex: pav_vm — mesmo texto em linha/barra/área agrupa no mesmo gráfico"
              className="mt-1"
            />
            <p className="text-[11px] text-muted-foreground mt-1">
              Com <strong>Linha</strong>, <strong>Barras</strong> ou <strong>Área</strong>: mesmo valor (não vazio) e o{' '}
              <strong>mesmo tipo de gráfico efetivo</strong> (módulo ou override abaixo) = uma série por indicador no
              mesmo gráfico. Tipos diferentes no mesmo nome de grupo geram blocos separados no painel.
            </p>
          </div>
          <div>
            <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Tipo de gráfico (opcional)
            </Label>
            <Select value={tipoGraficoInd} onValueChange={setTipoGraficoInd}>
              <SelectTrigger className="mt-1">
                <SelectValue placeholder="Usar o do módulo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__modulo">
                  Usar o do módulo ({chartTypeLabel(modulo?.tipo_grafico) || modulo?.tipo_grafico || 'linha'})
                </SelectItem>
                {CHART_TYPES.map((ct) => (
                  <SelectItem key={ct.value} value={ct.value}>
                    {ct.emoji} {ct.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground mt-1">
              Sobrescreve só este indicador no dashboard genérico. Vazio = herda o tipo principal do módulo (
              <strong>{chartTypeLabel(modulo?.tipo_grafico || 'linha')}</strong>).
            </p>
          </div>
          {tipoGraficoEfetivoModal === 'pizza' ? (
            opcionesPizzaIndicador.length === 0 ? (
              <p className="text-xs text-muted-foreground rounded-md border border-dashed p-2">
                Salve o indicador após criar outros no mesmo módulo para poder referenciar indicadores nas fatias do
                pizza.
              </p>
            ) : (
              <>
                <PizzaFatiasEditor
                  rows={pizzaFatiasRows}
                  onChange={setPizzaFatiasRows}
                  indicadorOpcoes={opcionesPizzaIndicador}
                />
                <p className="text-[10px] text-muted-foreground">
                  Se não adicionar fatias aqui, o app usa as do módulo (se existirem) ou o pizza clássico por meses.
                </p>
              </>
            )
          ) : null}
          {showRadarFaixasInd ? (
            <>
              <RadarFaixasEditor
                rows={radarFaixasRows}
                onChange={setRadarFaixasRows}
                inheritHint="Deixe sem faixas para herdar do módulo ou usar o padrão MISP."
              />
              <p className="text-[10px] text-muted-foreground">
                Se não adicionar faixas aqui, o app usa as do módulo (se existirem) ou o padrão MISP.
              </p>
            </>
          ) : null}
          {!ocultarDivisoesIndicador ? (
            <div>
              <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Divisões (opcional)</Label>
              <p className="text-[11px] text-muted-foreground mt-1 mb-2">
                Sem seleção = todas as divisões. Com uma ou mais marcadas, o indicador só aparece quando o filtro de divisão ou o setor corresponder a uma delas (mesmo texto que em Setor).
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 text-xs mb-2"
                onClick={() => setDivsSel([])}
              >
                Todas as divisões
              </Button>
              {divisoesDisponiveis.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  Nenhuma divisão cadastrada nos setores — use a tela Divisões / Setores.
                </p>
              ) : (
                <div className="max-h-36 overflow-y-auto space-y-2 border rounded-md p-3">
                  {divisoesDisponiveis.map((d) => (
                    <label key={d} className="flex items-center gap-2 text-sm cursor-pointer">
                      <Checkbox
                        checked={divsSel.includes(d)}
                        onCheckedChange={() => toggleDivisao(d)}
                      />
                      <span>{d}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          ) : null}
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
              onClick={() => onSave({
                nome: nome.trim(),
                label: label.trim(),
                unidade,
                tipo_direcao_meta: tipoDirecao,
                grupo_radar: grupoRadar.trim() || '',
                grupo_serie: grupoSerie.trim() || '',
                tipo_grafico: tipoGraficoInd === '__modulo' ? '' : tipoGraficoInd,
                divisoes: serializeDivisoesParaIndicador(divsSel),
                pizza_fatias:
                  tipoGraficoEfetivoModal === 'pizza' ? serializePizzaFatias(pizzaFatiasRows) : '',
                ...radarFaixasPatchIfEditing(showRadarFaixasInd, radarFaixasRows),
                meta: meta !== '' ? Number(meta) : null,
              })}
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
/** jsPDF RGB helpers need tuple types, not `number[]`, when using spread (TS2556). */
const PDF_THEME = /** @type {const} */ ({
  primary: [27, 120, 27],
  primaryText: [255, 255, 255],
  tableHeaderBg: [232, 245, 232],
  tableStroke: [186, 220, 186],
  rowBg: [248, 253, 248],
});

async function exportModuloPDF(modulo, indicadores, lancamentos, metas, ano, mes, setorId) {
  const doc = new jsPDF();
  const mesNome = MESES_COMPLETO[mes - 1];
  const icon = MODULO_ICONS[modulo.nome] || DEFAULT_ICON;
  const generatedAt = `Gerado em ${new Date().toLocaleDateString('pt-BR')} às ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
  const coverAssets = await loadPdfCoverAssets();

  drawPdfCover(doc, {
    title: 'Relatório de Indicadores',
    subtitle: `${mesNome}/${ano}`,
    details: modulo.nome,
    generatedAt,
    theme: PDF_THEME,
    assets: coverAssets,
  });

  // Header
  doc.addPage();
  doc.setFillColor(...PDF_THEME.primary);
  doc.rect(0, 0, 210, 28, 'F');
  doc.setTextColor(...PDF_THEME.primaryText);
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text(`${icon} ${modulo.nome}`, 14, 12);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(`Relatório de Indicadores — ${mesNome}/${ano}`, 14, 21);

  doc.setTextColor(40, 40, 40);
  let y = 38;

  // Summary row
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.setFillColor(...PDF_THEME.tableHeaderBg);
  doc.rect(14, y - 5, 182, 8, 'F');
  doc.text('INDICADOR', 16, y);
  doc.text('UNIDADE', 90, y);
  doc.text('VALOR MÊS', 125, y);
  doc.text('META', 155, y);
  doc.text('STATUS', 175, y);
  y += 4;
  doc.setLineWidth(0.3);
  doc.setDrawColor(...PDF_THEME.tableStroke);
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
    /** @type {[number, number, number]} */
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
      doc.setFillColor(...PDF_THEME.rowBg);
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
  doc.setDrawColor(...PDF_THEME.tableStroke);
  doc.line(14, y, 196, y);
  y += 6;
  doc.setFontSize(8);
  doc.setTextColor(120, 120, 120);
  doc.text(generatedAt, 14, y);

  doc.save(`${modulo.nome.replace(/\s+/g, '_')}_${mesNome}_${ano}.pdf`);
}

/**
 * Remove lançamentos, metas, indicadores do módulo e por fim o módulo (planilhas / API entity delete).
 * @param {string} moduloId
 * @param {Record<string, unknown>[]} indicadoresList lista completa de indicadores (ex.: cache da query)
 */
async function deleteModuloCascadeApi(moduloId, indicadoresList) {
  const mid = String(normalizeSheetId(moduloId));
  const indicadorIds = indicadoresList
    .filter((i) => String(normalizeSheetId(i.modulo_id ?? '')) === mid)
    .map((i) => String(normalizeSheetId(i.id)));
  const idSet = new Set(indicadorIds);

  const [allLanc, allMetas] = await Promise.all([
    api.entities.Lancamento.list(),
    api.entities.Meta.list(),
  ]);

  for (const row of allLanc) {
    if (row.indicador_id != null && idSet.has(String(normalizeSheetId(row.indicador_id)))) {
      await api.entities.Lancamento.delete(String(row.id));
    }
  }
  for (const row of allMetas) {
    if (row.indicador_id != null && idSet.has(String(normalizeSheetId(row.indicador_id)))) {
      await api.entities.Meta.delete(String(row.id));
    }
  }
  for (const indId of indicadorIds) {
    await api.entities.Indicador.delete(indId);
  }
  await api.entities.Modulo.delete(mid);
}

export default function ModulosIndicadores() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const anoAtual = new Date().getFullYear();
  const mesAtual = new Date().getMonth() + 1;

  const { data: setoresData } = useQuery({ queryKey: ['setores'], queryFn: () => api.entities.Setor.list() });
  const { data: modulosData } = useQuery({ queryKey: ['modulos'], queryFn: () => api.entities.Modulo.list() });
  const { data: indicadoresData } = useQuery({ queryKey: ['indicadores'], queryFn: () => api.entities.Indicador.list() });
  /** @type {SetorEntity[]} */
  const setores = setoresData ?? [];
  /** @type {ModuloEntity[]} */
  const modulos = modulosData ?? [];
  /** @type {IndicadorEntity[]} */
  const indicadores = indicadoresData ?? [];
  const { data: lancamentos = [] } = useQuery({ queryKey: ['lancamentos', anoAtual], queryFn: () => api.entities.Lancamento.filter({ ano: anoAtual }) });
  const { data: metas = [] } = useQuery({ queryKey: ['metas', anoAtual], queryFn: () => api.entities.Meta.filter({ ano: anoAtual }) });

  const { user } = useAuth();
  const isGestor = String(user?.tipo) === 'gestor';
  /** @type {SetorEntity[]} */
  const setoresVisiveis = useMemo(
    () => /** @type {SetorEntity[]} */ (getSetoresVisiveisParaUsuario(setores, user)),
    [setores, user]
  );
  const divisoesScope = useMemo(() => getDivisoesScopeParaGestor(user, setores), [user, setores]);
  const indicadoresFiltrados = useMemo(() => {
    const rows = filtrarIndicadoresPorDivisoesGestor(indicadores, isGestor ? divisoesScope : null);
    return /** @type {IndicadorEntity[]} */ (rows);
  }, [indicadores, isGestor, divisoesScope]);

  const invalidateModulos = () => queryClient.invalidateQueries({ queryKey: ['modulos'] });
  const invalidateIndicadores = () => queryClient.invalidateQueries({ queryKey: ['indicadores'] });

  const createModulo = useMutation({
    mutationFn: (data) => api.entities.Modulo.create(data),
    onSuccess: () => { invalidateModulos(); setModuloModal(null); toast({ title: 'Módulo criado!' }); },
  });
  const updateModulo = useMutation(
    /** @type {import('@tanstack/react-query').UseMutationOptions<unknown, Error, { id: string, data: Record<string, unknown> }>} */ ({
      mutationFn: ({ id, data }) => api.entities.Modulo.update(id, data),
      onSuccess: () => { invalidateModulos(); setModuloModal(null); toast({ title: 'Módulo atualizado!' }); },
    })
  );

  const updateIndicador = useMutation(
    /** @type {import('@tanstack/react-query').UseMutationOptions<unknown, Error, { id: string, data: Record<string, unknown> }>} */ ({
      mutationFn: ({ id, data }) => api.entities.Indicador.update(id, data),
      onSuccess: () => { invalidateIndicadores(); setModalState(null); toast({ title: 'Indicador atualizado!' }); },
    })
  );
  const deleteIndicador = useMutation(
    /** @type {import('@tanstack/react-query').UseMutationOptions<unknown, Error, string>} */ ({
      mutationFn: (id) => api.entities.Indicador.delete(id),
      onSuccess: () => { invalidateIndicadores(); toast({ title: 'Indicador removido.' }); },
    })
  );

  const [deleteModuloConfirm, setDeleteModuloConfirm] = useState(
    /** @type {null | { modulo: Record<string, unknown>, nIndicadores: number }} */ (null)
  );

  const deleteModuloCascade = useMutation(
    /** @type {import('@tanstack/react-query').UseMutationOptions<unknown, Error, string>} */ ({
      mutationFn: (moduloId) => deleteModuloCascadeApi(moduloId, indicadores),
      onSuccess: (_, moduloId) => {
        invalidateModulos();
        invalidateIndicadores();
        queryClient.invalidateQueries({ queryKey: ['lancamentos'] });
        queryClient.invalidateQueries({ queryKey: ['metas'] });
        setDeleteModuloConfirm(null);
        setModuloModal((prev) => (prev?.modulo && String(prev.modulo.id) === String(moduloId) ? null : prev));
        setModalState((prev) => (prev?.moduloId && String(prev.moduloId) === String(moduloId) ? null : prev));
        toast({
          title: 'Módulo excluído',
          description: 'O módulo e os indicadores foram removidos; lançamentos e metas ligados a esses indicadores também.',
        });
      },
      onError: (err) => {
        toast({
          title: 'Não foi possível excluir o módulo',
          description: err instanceof Error ? err.message : String(err),
          variant: 'destructive',
        });
      },
    })
  );

  const anoAtualRef = anoAtual;

  const [setorMetaId, setSetorMetaId] = useState('');

  useEffect(() => {
    if (!setoresVisiveis.length) return;
    setSetorMetaId((prev) =>
      prev && setoresVisiveis.some((s) => String(s.id) === prev) ? prev : String(setoresVisiveis[0]?.id ?? '')
    );
  }, [setoresVisiveis]);

  const nomeSetorMeta = setoresVisiveis.find((s) => s.id === setorMetaId)?.nome || '';
  const setorMetaRow = setoresVisiveis.find((s) => s.id === setorMetaId) || null;
  const divisoesDisponiveis = useMemo(
    () =>
      [...new Set(setoresVisiveis.map((s) => s.divisao).filter(Boolean))].sort((a, b) =>
        String(a).localeCompare(String(b), 'pt-BR')
      ),
    [setoresVisiveis]
  );

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

  const modulosOrdenados = useMemo(() => {
    const sorted = [...modulos].sort((a, b) => (a.ordem || 0) - (b.ordem || 0));
    if (!isGestor) return sorted;
    return sorted.filter((m) => indicadoresFiltrados.some((i) => i.modulo_id === m.id));
  }, [modulos, isGestor, indicadoresFiltrados]);

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
          <Select value={setorMetaId} onValueChange={setSetorMetaId} disabled={!setoresVisiveis.length}>
            <SelectTrigger className="h-8 w-52 text-xs">
              <SelectValue placeholder="Selecione o setor" />
            </SelectTrigger>
            <SelectContent>
              {setoresVisiveis.map((s) => (
                <SelectItem key={String(s.id)} value={String(s.id)}>
                  {String(s.nome)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {!isGestor ? (
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs border-cyan-400 text-cyan-600 hover:bg-cyan-50 gap-1"
            onClick={() => setModuloModal({ modulo: null })}
          >
            <Plus className="w-3 h-3" />
            Novo Módulo
          </Button>
        ) : null}
      </div>

      {/* Módulos list */}
      {modulosOrdenados.map((modulo) => {
        const inds = filtrarIndicadoresPorSetorWhitelist(
          /** @type {IndicadorEntity[]} */ (
            indicadoresFiltrados
              .filter((i) => i.modulo_id === modulo.id)
              .sort((a, b) => (Number(a.ordem) || 0) - (Number(b.ordem) || 0))
          ),
          setorMetaRow
        );
        const serieConflicts = findGrupoSerieTipoConflicts(inds, modulo);
        const icon = MODULO_ICONS[modulo.nome] || DEFAULT_ICON;
        return (
          <div key={modulo.id} className="border border-gray-200 rounded-xl overflow-hidden mb-3">
            {/* Módulo header */}
            <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-b border-gray-200">
              <div className="flex items-center gap-2 flex-wrap">
                <div className="w-3 h-3 rounded-sm bg-indigo-400 flex-shrink-0" />
                <span className="text-sm font-bold text-foreground">{icon} {modulo.nome}</span>
                <span className="text-xs text-muted-foreground">
                  {inds.length} indicador(es) · Gráfico: {TIPO_GRAFICO_LABEL[modulo.tipo_grafico] || modulo.tipo_grafico}
                  {modulo.layout_modulo === 'card_grafico' ? ' · Layout card+gráfico' : ''}
                  {modulo.layout_dashboard === 'bundle_kpi_tabela' ? ' · Painel KPI+tabela' : ''}
                </span>
              </div>
              <div className="flex gap-2 flex-shrink-0">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs gap-1 text-indigo-600 border-indigo-300 hover:bg-indigo-50"
                  onClick={async () => {
                    if (!setorMetaId) {
                      toast({ title: 'Selecione um setor', description: 'Escolha o setor acima para gerar o PDF com meta e lançamentos corretos.', variant: 'destructive' });
                      return;
                    }
                    const setorMeta = setoresVisiveis.find((s) => s.id === setorMetaId);
                    const indsPdf = filtrarIndicadoresPorSetorWhitelist(inds, setorMeta);
                    await exportModuloPDF(modulo, indsPdf, lancamentos, metas, anoAtual, mesAtual, setorMetaId);
                  }}
                >
                  <FileDown className="w-3 h-3" />PDF
                </Button>
                {!isGestor ? (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs gap-1 text-amber-600 border-amber-300 hover:bg-amber-50"
                    onClick={() => setModuloModal({ modulo })}
                  >
                    <Edit2 className="w-3 h-3" />
                    Editar
                  </Button>
                ) : null}
                {!isGestor ? (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs gap-1 text-red-600 border-red-300 hover:bg-red-50"
                    disabled={deleteModuloCascade.isPending}
                    onClick={() => {
                      const nIndicadores = indicadores.filter((i) => String(i.modulo_id) === String(modulo.id)).length;
                      setDeleteModuloConfirm({ modulo, nIndicadores });
                    }}
                  >
                    <Trash2 className="w-3 h-3" />
                    Excluir módulo
                  </Button>
                ) : null}
              </div>
            </div>

            {serieConflicts.length > 0 ? (
              <div className="px-4 py-2.5 bg-amber-50 border-b border-amber-200 text-xs text-amber-950 space-y-1">
                <p className="font-semibold">Atenção — grupo série com tipos de gráfico diferentes</p>
                <p className="text-amber-900/90">
                  Indicadores com o mesmo <strong>grupo_serie</strong> mas tipo efetivo distinto (override ou módulo)
                  aparecem em <strong>blocos separados</strong> no dashboard. Considere alinhar o tipo ou o nome do
                  grupo.
                </p>
                <ul className="list-disc pl-4 space-y-0.5">
                  {serieConflicts.map((c) => (
                    <li key={c.grupo}>
                      «{c.grupo}»: {c.tipos.map((t) => chartTypeLabel(t)).join(', ')}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {/* Indicadores rows */}
            {inds.map(ind => (
              <div
                key={String(ind.id)}
                className="flex items-center justify-between px-6 py-2.5 border-b border-gray-100 last:border-0 hover:bg-gray-50/60 transition-colors"
              >
                <div>
                  <p className="text-sm font-medium text-foreground">{String(ind.nome)}</p>
                  <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                    {ind.unidade && <span className="text-xs text-muted-foreground">Unid: {String(ind.unidade)}</span>}
                    {ind.grupo_radar ? (
                      <span className="text-xs font-medium text-teal-700 bg-teal-50 px-1.5 py-0.5 rounded">Radar: {String(ind.grupo_radar)}</span>
                    ) : null}
                    {ind.grupo_serie ? (
                      <span className="text-xs font-medium text-violet-700 bg-violet-50 px-1.5 py-0.5 rounded">Série: {String(ind.grupo_serie)}</span>
                    ) : null}
                    {ind.tipo_grafico != null && String(ind.tipo_grafico).trim() !== '' ? (
                      <span className="text-xs font-medium text-cyan-800 bg-cyan-50 px-1.5 py-0.5 rounded">
                        Gráfico: {chartTypeLabel(String(ind.tipo_grafico).trim().toLowerCase())}
                      </span>
                    ) : null}
                    {(() => {
                      const divsRow = parseDivisoesIndicador(ind);
                      return divsRow.length > 0 ? (
                        <span className="text-xs font-medium text-sky-700 bg-sky-50 px-1.5 py-0.5 rounded max-w-[220px] truncate" title={divsRow.join(', ')}>
                          Div.: {divsRow.join(', ')}
                        </span>
                      ) : null;
                    })()}
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
                  {!isGestor ? (
                    <button
                      onClick={() => deleteIndicador.mutate(String(ind.id))}
                      className="w-7 h-7 flex items-center justify-center rounded border border-red-200 bg-red-50 text-red-400 hover:bg-red-100 transition-colors"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  ) : null}
                </div>
              </div>
            ))}

            {!isGestor ? (
              <button
                onClick={() => setModalState({ moduloId: modulo.id, modulo, indicador: null })}
                className="w-full flex items-center justify-center gap-1.5 px-4 py-2.5 text-xs font-medium text-cyan-500 border-t border-dashed border-cyan-300 hover:bg-cyan-50/50 transition-colors"
              >
                <Plus className="w-3 h-3" />
                Adicionar Indicador
              </button>
            ) : null}
          </div>
        );
      })}

      {modulosOrdenados.length === 0 && !moduloModal && (
        <div className="text-center text-muted-foreground py-10 text-sm">
          {isGestor
            ? 'Não há módulos ou indicadores no âmbito da sua divisão. Peça ao escritório para rever divisões, setores ou o campo divisões dos indicadores.'
            : 'Nenhum módulo cadastrado. Clique em "+ Novo Módulo" para começar.'}
        </div>
      )}

      {/* Módulo Modal */}
      <ModuloModal
        open={!!moduloModal}
        modulo={moduloModal?.modulo}
        indicadoresDoModulo={
          moduloModal?.modulo?.id
            ? indicadoresFiltrados.filter((i) => String(i.modulo_id) === String(moduloModal.modulo.id))
            : []
        }
        onCancel={() => setModuloModal(null)}
        onSave={(d) => {
          if (moduloModal?.modulo) {
            updateModulo.mutate({ id: moduloModal.modulo.id, data: d });
          } else {
            createModulo.mutate(d);
          }
        }}
      />

      <Dialog
        open={!!deleteModuloConfirm}
        onOpenChange={(open) => {
          if (!open && !deleteModuloCascade.isPending) setDeleteModuloConfirm(null);
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="font-jakarta text-lg text-destructive">Excluir módulo permanentemente</DialogTitle>
            <DialogDescription className="sr-only">
              Confirmação para eliminar o módulo, todos os seus indicadores e os lançamentos e metas associados. Ação
              irreversível.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 text-sm text-foreground">
            <p>
              Esta ação <strong>não pode ser desfeita</strong>. Será apagado o módulo{' '}
              <strong>«{String(deleteModuloConfirm?.modulo?.nome ?? '')}»</strong> e{' '}
              <strong>todos os {deleteModuloConfirm?.nIndicadores ?? 0} indicador(es)</strong> deste módulo.
            </p>
            <p>
              Também serão removidos <strong>todos os lançamentos</strong> e <strong>todas as metas</strong> da planilha
              que estejam associados a esses indicadores (em qualquer ano ou setor).
            </p>
            <p className="text-destructive font-medium">
              Confirme apenas se tiver a certeza de que estes dados podem ser perdidos de forma definitiva.
            </p>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              disabled={deleteModuloCascade.isPending}
              onClick={() => setDeleteModuloConfirm(null)}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={deleteModuloCascade.isPending || !deleteModuloConfirm?.modulo?.id}
              onClick={() => {
                const id = deleteModuloConfirm?.modulo?.id;
                if (id) deleteModuloCascade.mutate(String(id));
              }}
            >
              {deleteModuloCascade.isPending ? 'A excluir…' : 'Sim, excluir tudo'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Indicador Modal */}
      <IndicadorModal
        open={!!modalState}
        indicador={modalState?.indicador}
        modulo={modalState?.modulo}
        indicadoresMesmoModulo={
          modalState
            ? indicadoresFiltrados.filter(
                (i) => String(i.modulo_id) === String(modalState.moduloId || modalState.modulo?.id)
              )
            : []
        }
        anoMeta={anoAtual}
        nomeSetorMeta={nomeSetorMeta}
        divisoesDisponiveis={divisoesDisponiveis}
        ocultarDivisoesIndicador={isGestor}
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