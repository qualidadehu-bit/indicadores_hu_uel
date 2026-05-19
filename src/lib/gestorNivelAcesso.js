/**
 * Nível de acesso do membro (Gestor) — coluna na planilha `gestor`: `nivel_acesso` ou "Nivel de acesso".
 *
 * Valores gravados (recomendado, minúsculo):
 * - `completo` — Lançamento + Configuração (aba Módulos, como hoje).
 * - `lancamento` — apenas rotas gerais; sem acesso à página Configuração.
 *
 * Vazio ou ausente ou qualquer outro valor → tratado como `completo` (retrocompatibilidade).
 */

export const GESTOR_NIVEL_COMPLETO = 'completo';
export const GESTOR_NIVEL_LANCAMENTO = 'lancamento';

/** @param {unknown} raw */
export function normalizeGestorNivelAcesso(raw) {
  const s = String(raw ?? '')
    .trim()
    .toLowerCase();
  if (s === GESTOR_NIVEL_LANCAMENTO) return GESTOR_NIVEL_LANCAMENTO;
  return GESTOR_NIVEL_COMPLETO;
}

/**
 * @param {Record<string, unknown>|null|undefined} row — linha Gestor da API / planilha
 * @returns {string} valor bruto da célula ou ''
 */
export function pickNivelAcessoFromGestorRow(row) {
  if (!row || typeof row !== 'object') return '';
  if (row.nivel_acesso != null && String(row.nivel_acesso).trim() !== '') {
    return String(row.nivel_acesso).trim();
  }
  for (const k of Object.keys(row)) {
    const nk = String(k || '')
      .toLowerCase()
      .replace(/\s+/g, '')
      .replace(/_/g, '');
    if (nk === 'nivelacesso' || nk === 'niveldeacesso') {
      const v = row[k];
      if (v != null && String(v).trim() !== '') return String(v).trim();
    }
  }
  return '';
}

/** @param {Record<string, unknown>|null|undefined} user — sessão (userSession) */
export function gestorPodeAcessarConfiguracao(user) {
  if (!user || String(user.tipo) !== 'gestor') return true;
  return normalizeGestorNivelAcesso(user.nivel_acesso) !== GESTOR_NIVEL_LANCAMENTO;
}

/** Rótulo curto para listas */
export function labelGestorNivelAcesso(raw) {
  return normalizeGestorNivelAcesso(raw) === GESTOR_NIVEL_LANCAMENTO
    ? 'Apenas lançamento'
    : 'Lançamento e configuração';
}
