/**
 * Fatias customizadas para gráfico tipo pizza (dashboard genérico).
 * Campo `pizza_fatias` no indicador e/ou no módulo: JSON `[{ "label": "...", "indicador_id": "..." }, ...]`.
 * Valor de cada fatia = lançamento do **mês selecionado** no dashboard (mesmo mês dos KPIs), para o setor selecionado.
 * Lista vazia ou campo ausente = pizza clássico (fatias = meses do ano).
 */

import { normalizeSheetId } from '@/lib/sheetsEntityNormalize';
import { tipoGraficoEfetivoIndicador } from '@/lib/graficoTipo';

/**
 * @typedef {{ label: string, indicador_id: string }} PizzaFatia
 */

/**
 * @param {unknown} raw
 * @returns {PizzaFatia[]}
 */
export function parsePizzaFatiasRaw(raw) {
  if (raw == null || String(raw).trim() === '') return [];
  const s = String(raw).trim();
  try {
    const j = JSON.parse(s);
    if (!Array.isArray(j)) return [];
    /** @type {PizzaFatia[]} */
    const out = [];
    for (const row of j) {
      if (!row || typeof row !== 'object') continue;
      const label = row.label != null ? String(row.label).trim() : '';
      const id = normalizeSheetId(row.indicador_id ?? row.indicadorId);
      if (!label || !id) continue;
      out.push({ label, indicador_id: id });
    }
    return out;
  } catch {
    return [];
  }
}

/**
 * @param {PizzaFatia[]} slices
 * @returns {string} string vazia se nada a gravar
 */
export function serializePizzaFatias(slices) {
  if (!slices?.length) return '';
  const clean = slices
    .map((r) => ({
      label: String(r.label || '').trim(),
      indicador_id: normalizeSheetId(r.indicador_id),
    }))
    .filter((r) => r.label && r.indicador_id);
  if (clean.length === 0) return '';
  return JSON.stringify(clean);
}

/**
 * Indicador tem prioridade sobre o módulo.
 * @param {Record<string, unknown>|null|undefined} ind
 * @param {Record<string, unknown>|null|undefined} modulo
 * @returns {PizzaFatia[] | null} `null` = usar pizza por meses (legado)
 */
export function effectivePizzaFatias(ind, modulo) {
  const fromInd = parsePizzaFatiasRaw(ind?.pizza_fatias);
  if (fromInd.length > 0) return fromInd;
  const fromMod = parsePizzaFatiasRaw(modulo?.pizza_fatias);
  if (fromMod.length > 0) return fromMod;
  return null;
}

/**
 * Lista de fatias para o lançamento por módulo: primeiro indicador (ordem da lista) com tipo efetivo
 * `pizza` e `effectivePizzaFatias` não nulo/vazio define a lista (indicador com `pizza_fatias` próprio
 * ou fallback do módulo, igual ao dashboard).
 * @param {Record<string, unknown>} modulo
 * @param {Record<string, unknown>[]} indsDoModuloSorted
 * @returns {PizzaFatia[] | null}
 */
export function lancamentoModuloPizzaFatias(modulo, indsDoModuloSorted) {
  const list = indsDoModuloSorted || [];
  for (const ind of list) {
    if (tipoGraficoEfetivoIndicador(ind, modulo) !== 'pizza') continue;
    const f = effectivePizzaFatias(ind, modulo);
    if (f && f.length > 0) return f;
  }
  return null;
}

/**
 * Indicadores repetidos em `pizza_fatias` (mesmo id em mais de uma fatia).
 * @param {PizzaFatia[]|null|undefined} slices
 * @returns {string[]} ids normalizados duplicados
 */
export function duplicatePizzaFatiaIndicadorIds(slices) {
  if (!slices?.length) return [];
  const seen = new Set();
  /** @type {Set<string>} */
  const dups = new Set();
  for (const r of slices) {
    const id = normalizeSheetId(r.indicador_id);
    if (!id) continue;
    if (seen.has(id)) dups.add(id);
    else seen.add(id);
  }
  return [...dups];
}
