import { parseLocaleNumber } from '@/lib/numberParsing';

/** Compara ids de indicador/setor entre API (string | number) e planilha. */
export function idsMatch(a, b) {
  if (a === b) return true;
  if (a == null || b == null) return false;
  return String(a) === String(b);
}

/**
 * Agrega lançamentos do mesmo indicador/mês quando o dashboard não filtra por setor.
 * — Percentuais (0–100): média simples.
 * — Demais números: soma (totais por hospital).
 */
export function aggregateValorLancamentos(matches) {
  if (!matches?.length) return undefined;
  const raw = matches.map((l) => l.valor).filter((v) => v !== null && v !== undefined && v !== '');
  if (!raw.length) return undefined;
  const nums = raw.map((v) => parseLocaleNumber(v)).filter((n) => n != null);
  if (nums.length !== raw.length) return parseLocaleNumber(raw[0]);
  if (nums.length === 1) return nums[0];
  const allPct = nums.every((n) => n >= 0 && n <= 100);
  if (allPct) return Number((nums.reduce((a, b) => a + b, 0) / nums.length).toFixed(1));
  const sum = nums.reduce((a, b) => a + b, 0);
  return Number.isInteger(sum) ? sum : Number(sum.toFixed(2));
}

/**
 * @param {Record<string, unknown>[]} lancamentos
 * @param {string|number} indicadorId
 * @param {number} mes — 1–12
 * @param {string|null|undefined} setorId
 * @returns {Record<string, unknown>|undefined} primeiro lançamento do grupo, com `valor` agregado se vários setores sem filtro
 */
export function pickLancamentoMes(lancamentos, indicadorId, mes, setorId) {
  const list = lancamentos || [];
  const matches = list.filter(
    (l) =>
      idsMatch(l.indicador_id, indicadorId) &&
      Number(l.mes) === Number(mes) &&
      (!setorId || idsMatch(l.setor_id, setorId))
  );
  if (!matches.length) return undefined;
  if (setorId || matches.length === 1) return matches[0];
  const valor = aggregateValorLancamentos(matches);
  return { ...matches[0], valor };
}
