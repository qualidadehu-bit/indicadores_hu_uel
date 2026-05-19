/**
 * Campo opcional `divisoes` no indicador: nomes de divisão (mesmo texto que `Setor.divisao`),
 * separados por `|` ou `;`. Vazio ou ausente = indicador vale para todas as divisões.
 */

import { normalizeSheetId } from '@/lib/sheetsEntityNormalize';

/**
 * Lista branca opcional no setor (`indicador_ids`): ids do indicador separados por `|` ou `;`.
 * @param {Record<string, unknown>|null|undefined} setor
 * @returns {Set<string>|null} `null` = sem restrição (todos os indicadores já permitidos pelo resto do app)
 */
export function indicadorIdsWhitelistSetor(setor) {
  if (!setor || typeof setor !== 'object') return null;
  const raw = setor.indicador_ids;
  if (raw == null) return null;
  const s = String(raw).trim();
  if (s === '') return null;
  const parts = s
    .split(/[|;]+/g)
    .map((x) => normalizeSheetId(x))
    .filter(Boolean);
  if (parts.length === 0) return null;
  return new Set(parts);
}

/**
 * @param {Record<string, unknown>} ind
 * @param {Record<string, unknown>|null|undefined} setor
 */
export function indicadorPermitidoParaSetor(ind, setor) {
  const w = indicadorIdsWhitelistSetor(setor);
  if (w == null) return true;
  const id = normalizeSheetId(ind?.id);
  return id !== '' && w.has(id);
}

/**
 * @param {Record<string, unknown>[]} indicadores
 * @param {Record<string, unknown>|null|undefined} setor — sem setor = não aplica lista branca
 */
export function filtrarIndicadoresPorSetorWhitelist(indicadores, setor) {
  if (!indicadores?.length) return [];
  if (!setor) return indicadores;
  return indicadores.filter((ind) => indicadorPermitidoParaSetor(ind, setor));
}

/**
 * Serializa seleção de checkboxes para `setor.indicador_ids`.
 * Se todos os indicadores elegíveis estiverem marcados, devolve string vazia (= sem lista branca).
 * @param {Record<string, unknown>[]} eligibleIndicadores
 * @param {Set<string>} selectedIdSet ids normalizados
 */
export function serializeSetorIndicadorIdsFromSelection(eligibleIndicadores, selectedIdSet) {
  const full = new Set(
    (eligibleIndicadores || []).map((i) => normalizeSheetId(i.id)).filter(Boolean)
  );
  if (full.size === 0) return '';
  const every = [...full].every((id) => selectedIdSet.has(id));
  if (every) return '';
  const chosen = [...selectedIdSet].map((x) => normalizeSheetId(x)).filter((id) => full.has(id));
  return chosen.join('|');
}

/** @param {Record<string, unknown>} ind */
export function parseDivisoesIndicador(ind) {
  const raw = ind?.divisoes;
  if (raw == null || String(raw).trim() === '') return [];
  return [...new Set(
    String(raw)
      .split(/[|;]+/g)
      .map((s) => s.trim())
      .filter(Boolean)
  )];
}

/**
 * @param {Record<string, unknown>} ind
 * @param {string | null | undefined} divisaoContexto — ex.: `setor.divisao` ou filtro do dashboard (`'todas'` → trate no chamador)
 */
export function indicadorVisivelParaDivisao(ind, divisaoContexto) {
  const lista = parseDivisoesIndicador(ind);
  if (lista.length === 0) return true;
  const d = divisaoContexto != null && String(divisaoContexto).trim() !== ''
    ? String(divisaoContexto).trim()
    : null;
  if (!d) return true;
  return lista.includes(d);
}

/**
 * @param {Record<string, unknown>[]} indicadores
 * @param {string | null | undefined} divisaoFiltro — `'todas'` ou omitido: sem filtro por divisão
 */
export function filtrarIndicadoresPorDivisao(indicadores, divisaoFiltro) {
  if (!indicadores?.length) return [];
  if (divisaoFiltro == null || divisaoFiltro === 'todas') return indicadores;
  return indicadores.filter((ind) => indicadorVisivelParaDivisao(ind, divisaoFiltro));
}

/**
 * Filtra indicadores para o membro na Configuração (escopo por divisão).
 * @param {Record<string, unknown>[]} indicadores
 * @param {Set<string>|null|undefined} divisoesScope — `null`/`undefined` = sem filtro (escritório)
 */
export function filtrarIndicadoresPorDivisoesGestor(indicadores, divisoesScope) {
  if (!indicadores?.length) return [];
  if (divisoesScope == null) return indicadores;
  if (!(divisoesScope instanceof Set) || divisoesScope.size === 0) {
    return indicadores.filter((ind) => parseDivisoesIndicador(ind).length === 0);
  }
  return indicadores.filter((ind) => {
    const lista = parseDivisoesIndicador(ind);
    if (lista.length === 0) return true;
    return lista.some((d) => divisoesScope.has(String(d).trim()));
  });
}

/**
 * Nome da divisão usada para filtrar indicadores no dashboard: prioriza `setor.divisao` quando há
 * setor selecionado; senão usa o filtro de divisão da tela (`'todas'` → sem filtro).
 * @param {Record<string, unknown>[]} setores
 * @param {string | null | undefined} setorSelecionadoId — `'todos'` ou vazio = sem setor
 * @param {string | null | undefined} divisaoSelecionada — `'todas'` = sem filtro por dropdown
 * @returns {string | null}
 */
export function divisaoNomeParaFiltroIndicadores(setores, setorSelecionadoId, divisaoSelecionada) {
  const sid = setorSelecionadoId && setorSelecionadoId !== 'todos' ? String(setorSelecionadoId) : '';
  const setor = sid && Array.isArray(setores) ? setores.find((x) => String(x.id) === sid) : null;
  const fromSetor = setor && String(setor.divisao || '').trim();
  if (fromSetor) return fromSetor;
  if (divisaoSelecionada != null && divisaoSelecionada !== '' && divisaoSelecionada !== 'todas') {
    const d = String(divisaoSelecionada).trim();
    return d || null;
  }
  return null;
}

/** Serializa seleção do modal para o campo `divisoes` (trim, dedupe, `|`). Vazio = todas as divisões. */
export function serializeDivisoesParaIndicador(nomesSelecionados) {
  const arr = (Array.isArray(nomesSelecionados) ? nomesSelecionados : [])
    .map((s) => String(s).trim())
    .filter(Boolean);
  const unique = [...new Set(arr)];
  return unique.length ? unique.join('|') : '';
}
