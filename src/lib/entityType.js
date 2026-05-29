export const ENTITY_TYPE_SETOR = 'SETOR';
export const ENTITY_TYPE_COMISSAO = 'COMISSAO';
export const ENTITY_TYPE_CLINICA = 'CLINICA';

const ENTITY_TYPES = new Set([ENTITY_TYPE_SETOR, ENTITY_TYPE_COMISSAO, ENTITY_TYPE_CLINICA]);

/**
 * @param {unknown} raw
 * @param {'SETOR'|'COMISSAO'|'CLINICA'} [fallback]
 * @returns {'SETOR'|'COMISSAO'|'CLINICA'}
 */
export function normalizeEntityType(raw, fallback = ENTITY_TYPE_SETOR) {
  const value = String(raw ?? '')
    .trim()
    .toUpperCase();
  if (ENTITY_TYPES.has(value)) return /** @type {'SETOR'|'COMISSAO'|'CLINICA'} */ (value);
  return fallback;
}

/**
 * @param {Array<Record<string, unknown>>|undefined|null} rows
 * @param {'SETOR'|'COMISSAO'|'CLINICA'} entityType
 */
export function filterByEntityType(rows, entityType) {
  const wanted = normalizeEntityType(entityType);
  return (rows || []).filter((row) => normalizeEntityType(row?.entity_type) === wanted);
}

/**
 * @param {Record<string, unknown>|null|undefined} row
 * @param {'SETOR'|'COMISSAO'|'CLINICA'} entityType
 */
export function isEntityType(row, entityType) {
  return normalizeEntityType(row?.entity_type) === normalizeEntityType(entityType);
}
