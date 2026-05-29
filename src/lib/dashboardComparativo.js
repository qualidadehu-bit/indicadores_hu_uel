import { idsMatch } from '@/lib/lancamentosDashboard';
import { parseLocaleNumber } from '@/lib/numberParsing';

function defaultStrategy(values, estrategia) {
  if (typeof estrategia === 'string') {
    if (estrategia === 'media' || estrategia === 'soma') return estrategia;
  }
  if (typeof estrategia === 'function') {
    const custom = estrategia(values);
    if (custom === 'media' || custom === 'soma') return custom;
  }
  const allRateLike = values.length > 0 && values.every((v) => v >= 0 && v <= 100);
  return allRateLike ? 'media' : 'soma';
}

function aggregate(values, estrategia) {
  if (!values.length) return null;
  const strategy = defaultStrategy(values, estrategia);
  if (strategy === 'media') {
    return values.reduce((acc, v) => acc + v, 0) / values.length;
  }
  return values.reduce((acc, v) => acc + v, 0);
}

export function getLancamentoComparado({
  lancamentos,
  indicadorId,
  mes,
  ano,
  setorIdsAtivos,
  estrategia,
}) {
  const setorIds = (setorIdsAtivos || []).map(String).filter(Boolean);
  const rows = (lancamentos || []).filter(
    (l) =>
      idsMatch(l.indicador_id, indicadorId) &&
      Number(l.mes) === Number(mes) &&
      Number(l.ano) === Number(ano) &&
      (setorIds.length === 0 || setorIds.some((sid) => idsMatch(l.setor_id, sid)))
  );
  if (!rows.length) return undefined;
  const values = rows.map((r) => parseLocaleNumber(r.valor)).filter((v) => v != null);
  if (!values.length) return undefined;
  return { ...rows[0], valor: aggregate(values, estrategia) };
}

export function getMetaComparada({
  metas,
  indicadorId,
  ano,
  setorIdsAtivos,
  estrategia,
}) {
  const setorIds = (setorIdsAtivos || []).map(String).filter(Boolean);
  const rows = (metas || []).filter(
    (m) =>
      idsMatch(m.indicador_id, indicadorId) &&
      Number(m.ano) === Number(ano) &&
      (setorIds.length === 0 || setorIds.some((sid) => idsMatch(m.setor_id, sid)))
  );
  if (!rows.length) return undefined;
  const values = rows.map((r) => parseLocaleNumber(r.valor)).filter((v) => v != null);
  if (!values.length) return undefined;
  return { ...rows[0], valor: aggregate(values, estrategia) };
}

export function buildSerieMensalComparada({
  lancamentos,
  indicadorId,
  ano,
  setorIdsAtivos,
  estrategia,
}) {
  return Array.from({ length: 12 }, (_, i) =>
    getLancamentoComparado({
      lancamentos,
      indicadorId,
      mes: i + 1,
      ano,
      setorIdsAtivos,
      estrategia,
    })?.valor ?? null
  );
}
