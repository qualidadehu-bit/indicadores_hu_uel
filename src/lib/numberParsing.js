/**
 * Converte números em string (pt-BR/en-US) para `number` finito.
 * Exemplos:
 * - "7,4" -> 7.4
 * - "1.234,56" -> 1234.56
 * - "1,234.56" -> 1234.56
 * Retorna `null` para vazio/inválido.
 *
 * @param {unknown} value
 * @returns {number|null}
 */
export function parseLocaleNumber(value) {
  if (value == null || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;

  let raw = String(value).trim();
  if (!raw) return null;

  // Remove espaços comuns e invisíveis que podem vir da planilha/copiar-colar.
  raw = raw.replace(/[\s\u00A0\u202F]+/g, '');

  const hasComma = raw.includes(',');
  const hasDot = raw.includes('.');
  let normalized = raw;

  if (hasComma && hasDot) {
    // Quando há ambos separadores, o último tende a ser o decimal.
    const lastComma = raw.lastIndexOf(',');
    const lastDot = raw.lastIndexOf('.');
    const decimalSep = lastComma > lastDot ? ',' : '.';
    const thousandsSep = decimalSep === ',' ? '.' : ',';
    normalized = raw.split(thousandsSep).join('');
    if (decimalSep === ',') normalized = normalized.replace(',', '.');
  } else if (hasComma) {
    const commaCount = (raw.match(/,/g) || []).length;
    if (commaCount > 1) {
      const idx = raw.lastIndexOf(',');
      normalized = `${raw.slice(0, idx).replace(/,/g, '')}.${raw.slice(idx + 1)}`;
    } else {
      normalized = raw.replace(',', '.');
    }
  } else if (hasDot) {
    const dotCount = (raw.match(/\./g) || []).length;
    if (dotCount > 1) {
      const idx = raw.lastIndexOf('.');
      normalized = `${raw.slice(0, idx).replace(/\./g, '')}.${raw.slice(idx + 1)}`;
    }
  }

  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

