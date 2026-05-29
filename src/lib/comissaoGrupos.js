/**
 * Estrutura base de grupos para Dashboard Comissões.
 * Pode ser expandida sem alterar a lógica das páginas.
 */

export const COMISSAO_GRUPO_OBITOS = 'comissao_obitos';
export const COMISSAO_GRUPO_SEGURANCA_PACIENTE = 'comissao_seguranca_paciente';
export const COMISSAO_GRUPO_REVISAO_PRONTUARIO = 'comissao_revisao_prontuario';

export const COMISSAO_GRUPOS_DEFAULT = [
  { value: COMISSAO_GRUPO_OBITOS, label: 'Comissão de Óbitos' },
  { value: COMISSAO_GRUPO_SEGURANCA_PACIENTE, label: 'Comissão de Segurança do Paciente' },
  { value: COMISSAO_GRUPO_REVISAO_PRONTUARIO, label: 'Comissão de Revisão de Prontuário' },
];

/**
 * @param {unknown} raw
 * @returns {string}
 */
export function normalizeGrupoComissao(raw) {
  return String(raw ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_');
}

/**
 * @param {string} value
 * @param {Array<{ value: string, label: string }>} [options]
 */
export function labelGrupoComissao(value, options = COMISSAO_GRUPOS_DEFAULT) {
  const norm = normalizeGrupoComissao(value);
  const found = options.find((op) => normalizeGrupoComissao(op.value) === norm);
  return found ? found.label : value;
}

/**
 * Monta lista de opções base + grupos encontrados nos indicadores.
 * @param {Array<{ grupo_scope?: unknown }>} indicadores
 * @returns {Array<{ value: string, label: string }>}
 */
export function buildGrupoComissaoOptions(indicadores) {
  const byValue = new Map(
    COMISSAO_GRUPOS_DEFAULT.map((op) => [normalizeGrupoComissao(op.value), { ...op, value: normalizeGrupoComissao(op.value) }])
  );
  for (const ind of indicadores || []) {
    const v = normalizeGrupoComissao(ind?.grupo_scope);
    if (!v) continue;
    if (byValue.has(v)) continue;
    byValue.set(v, { value: v, label: v.replace(/_/g, ' ') });
  }
  return [...byValue.values()].sort((a, b) =>
    String(a.label || '').localeCompare(String(b.label || ''), 'pt-BR')
  );
}
