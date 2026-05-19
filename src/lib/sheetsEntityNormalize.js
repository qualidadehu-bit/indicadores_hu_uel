/**
 * Normaliza registros vindos do Google Sheets (via GAS) para tipos estáveis no React.
 * Evita falhas de join por `===` (ex.: mes 3 vs "3", id com espaços, número vs string).
 */

import { normalizeGestorNivelAcesso, pickNivelAcessoFromGestorRow } from '@/lib/gestorNivelAcesso';

/** @param {unknown} v */
export function normalizeSheetId(v) {
  if (v == null) return '';
  return String(v).trim();
}

/**
 * @param {unknown} v
 * @returns {number | null}
 */
export function normalizeSheetInt(v) {
  if (v == null || v === '') return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return Math.trunc(n);
}

/**
 * @param {unknown} v
 * @returns {number | null}
 */
export function normalizeSheetNumber(v) {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** @param {unknown} v */
function normalizeAtivoIndicador(v) {
  if (v === false || v === 0) return false;
  if (v == null || v === '') return true;
  const s = String(v).trim().toLowerCase();
  if (['false', '0', 'no', 'não', 'nao', 'f'].includes(s)) return false;
  return true;
}

/** @param {Record<string, unknown>} row */
export function normalizeLancamento(row) {
  if (!row || typeof row !== 'object') return row;
  const mes = normalizeSheetInt(row.mes);
  const ano = normalizeSheetInt(row.ano);
  const valorN = normalizeSheetNumber(row.valor);
  return {
    ...row,
    id: normalizeSheetId(row.id),
    indicador_id: normalizeSheetId(row.indicador_id),
    setor_id: normalizeSheetId(row.setor_id),
    modulo_id: normalizeSheetId(row.modulo_id),
    mes: mes ?? row.mes,
    ano: ano ?? row.ano,
    valor: valorN !== null ? valorN : row.valor,
  };
}

/** @param {Record<string, unknown>} row */
export function normalizeMeta(row) {
  if (!row || typeof row !== 'object') return row;
  const ano = normalizeSheetInt(row.ano);
  const valorN = normalizeSheetNumber(row.valor);
  return {
    ...row,
    id: normalizeSheetId(row.id),
    indicador_id: normalizeSheetId(row.indicador_id),
    setor_id: normalizeSheetId(row.setor_id),
    ano: ano ?? row.ano,
    valor: valorN !== null ? valorN : row.valor,
  };
}

/** @param {Record<string, unknown>} row */
export function normalizeIndicador(row) {
  if (!row || typeof row !== 'object') return row;
  const ordem = normalizeSheetInt(row.ordem);
  const tipo = row.tipo_direcao_meta;
  return {
    ...row,
    id: normalizeSheetId(row.id),
    modulo_id: normalizeSheetId(row.modulo_id),
    modulo_nome: row.modulo_nome != null && String(row.modulo_nome).trim() !== '' ? String(row.modulo_nome).trim() : row.modulo_nome,
    tipo_direcao_meta: tipo != null && String(tipo).trim() !== '' ? String(tipo).trim() : tipo,
    nome: row.nome != null ? String(row.nome).trim() : row.nome,
    label: row.label != null ? String(row.label).trim() : row.label,
    unidade: row.unidade != null ? String(row.unidade).trim() : row.unidade,
    grupo_radar: row.grupo_radar != null ? String(row.grupo_radar).trim() : row.grupo_radar,
    grupo_serie: row.grupo_serie != null ? String(row.grupo_serie).trim() : row.grupo_serie,
    tipo_grafico:
      row.tipo_grafico != null && String(row.tipo_grafico).trim() !== ''
        ? String(row.tipo_grafico).trim().toLowerCase()
        : '',
    divisoes: row.divisoes != null ? String(row.divisoes).trim() : row.divisoes,
    pizza_fatias:
      row.pizza_fatias != null && String(row.pizza_fatias).trim() !== ''
        ? String(row.pizza_fatias).trim()
        : '',
    radar_faixas:
      row.radar_faixas != null && String(row.radar_faixas).trim() !== ''
        ? String(row.radar_faixas).trim()
        : '',
    ordem: ordem ?? row.ordem ?? 0,
    ativo: normalizeAtivoIndicador(row.ativo),
  };
}

/** @param {Record<string, unknown>} row */
export function normalizeModulo(row) {
  if (!row || typeof row !== 'object') return row;
  const ordem = normalizeSheetInt(row.ordem);
  const tipoUiTrim =
    row.tipo_ui != null && String(row.tipo_ui).trim() !== ''
      ? String(row.tipo_ui).trim().toLowerCase()
      : row.tipo_ui;
  const slugTrim =
    row.slug != null && String(row.slug).trim() !== ''
      ? String(row.slug).trim().toLowerCase()
      : row.slug;
  return {
    ...row,
    id: normalizeSheetId(row.id),
    nome: row.nome != null ? String(row.nome).trim() : row.nome,
    ordem: ordem ?? row.ordem ?? 0,
    pizza_fatias:
      row.pizza_fatias != null && String(row.pizza_fatias).trim() !== ''
        ? String(row.pizza_fatias).trim()
        : '',
    radar_faixas:
      row.radar_faixas != null && String(row.radar_faixas).trim() !== ''
        ? String(row.radar_faixas).trim()
        : '',
    tipo_grafico: row.tipo_grafico != null ? String(row.tipo_grafico).trim().toLowerCase() : row.tipo_grafico,
    layout_modulo: row.layout_modulo != null ? String(row.layout_modulo).trim() : row.layout_modulo,
    layout_dashboard: row.layout_dashboard != null ? String(row.layout_dashboard).trim() : row.layout_dashboard,
    tipo_ui: tipoUiTrim,
    slug: slugTrim,
  };
}

/** @param {Record<string, unknown>} row */
export function normalizeSetor(row) {
  if (!row || typeof row !== 'object') return row;
  const indicadorIds =
    row.indicador_ids != null && String(row.indicador_ids).trim() !== ''
      ? String(row.indicador_ids).trim()
      : '';
  return {
    ...row,
    id: normalizeSheetId(row.id),
    nome: row.nome != null ? String(row.nome).trim() : row.nome,
    divisao: row.divisao != null ? String(row.divisao).trim() : row.divisao,
    indicador_ids: indicadorIds,
  };
}

/** @param {Record<string, unknown>} row */
export function normalizeConta(row) {
  if (!row || typeof row !== 'object') return row;
  return {
    ...row,
    id: normalizeSheetId(row.id),
    login: row.login != null ? String(row.login).trim() : row.login,
  };
}

/** @param {Record<string, unknown>} row */
export function normalizeGestor(row) {
  if (!row || typeof row !== 'object') return row;
  const { senha_hash: _sh, senha: _pw, ...rest } = row;
  const loginVal = String(rest.login ?? rest.nome ?? '').trim();
  const nivelRaw = pickNivelAcessoFromGestorRow(rest);
  return {
    ...rest,
    id: normalizeSheetId(rest.id),
    login: loginVal || undefined,
    unidades: rest.unidades != null ? String(rest.unidades).trim() : '',
    divisoes: rest.divisoes != null ? String(rest.divisoes).trim() : '',
    nome: rest.nome != null ? String(rest.nome).trim() : rest.nome,
    email: rest.email != null ? String(rest.email).trim() : rest.email,
    divisao: rest.divisao != null ? String(rest.divisao).trim() : rest.divisao,
    ativo: rest.ativo,
    nivel_acesso: normalizeGestorNivelAcesso(nivelRaw),
  };
}

const NORMALIZERS = {
  Lancamento: normalizeLancamento,
  Meta: normalizeMeta,
  Indicador: normalizeIndicador,
  Modulo: normalizeModulo,
  Setor: normalizeSetor,
  Conta: normalizeConta,
  Gestor: normalizeGestor,
};

/**
 * @param {string} entity — mesmo nome usado em `entityApi('Indicador')`
 * @param {unknown} data — array (list/filter) ou um objeto (create)
 */
export function normalizeEntityResponse(entity, data) {
  const fn = NORMALIZERS[entity];
  if (!fn) return data;
  if (Array.isArray(data)) return data.map((row) => fn(row));
  if (data && typeof data === 'object') return fn(data);
  return data;
}
