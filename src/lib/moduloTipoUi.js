/**
 * Painel especial do dashboard por módulo.
 * Coluna opcional `tipo_ui` na aba modulo (ou legado `slug`): iras | misp | producao | eventos_adversos | nr32 | generico.
 * Se vazio ou inválido, infere pelo `nome` do módulo (comportamento anterior).
 */

/** @typedef {'iras'|'misp'|'producao'|'eventos_adversos'|'nr32'|'generico'} ModuloDashboardKind */

const ALLOWED = new Set(['iras', 'misp', 'producao', 'eventos_adversos', 'nr32', 'generico']);

/** Valor válido salvo na planilha, ou `__auto` se vazio / inválido (controle de UI). */
export function storedTipoUiForSelect(modulo) {
  const t = String(modulo?.tipo_ui || modulo?.slug || '').trim().toLowerCase();
  if (ALLOWED.has(t)) return t;
  return '__auto';
}

/** Nome exato do módulo na planilha → kind (fallback). */
const NOME_PARA_KIND = {
  IRAS: 'iras',
  MISP: 'misp',
  Produção: 'producao',
  'Eventos Adversos': 'eventos_adversos',
  NR32: 'nr32',
};

/**
 * @param {Record<string, unknown> | null | undefined} modulo
 * @returns {ModuloDashboardKind}
 */
export function getModuloDashboardKind(modulo) {
  if (!modulo || typeof modulo !== 'object') return 'generico';
  const raw = String(modulo.tipo_ui || modulo.slug || '').trim().toLowerCase();
  if (ALLOWED.has(raw)) return /** @type {ModuloDashboardKind} */ (raw);
  const nome = String(modulo.nome || '').trim();
  const fromNome = NOME_PARA_KIND[nome];
  if (fromNome) return /** @type {ModuloDashboardKind} */ (fromNome);
  return 'generico';
}

/**
 * @param {Record<string, unknown>[]} modulos
 * @param {ModuloDashboardKind} kind
 */
export function findModuloPorDashboardKind(modulos, kind) {
  if (!Array.isArray(modulos)) return undefined;
  return modulos.find((m) => getModuloDashboardKind(m) === kind);
}

/** Opções para select de configuração (`__auto` = não gravar tipo_ui — inferir pelo nome). */
export const TIPO_UI_SELECT_OPTIONS = [
  { value: '__auto', label: 'Automático (pelo nome do módulo)' },
  { value: 'generico', label: 'Genérico — bloco de gráficos padrão' },
  { value: 'iras', label: 'IRAS — card IRAS + NR32' },
  { value: 'nr32', label: 'NR32 — só NR32 (normalmente embutido no IRAS)' },
  { value: 'misp', label: 'MISP — radar qualidade' },
  { value: 'producao', label: 'Produção — KPI ocupação / permanência / giro' },
  { value: 'eventos_adversos', label: 'Eventos adversos — tabela e densidade' },
];
