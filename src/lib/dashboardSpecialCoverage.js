function asNorm(value) {
  return String(value || '').trim().toLowerCase();
}

function indicadorIsSpecialForCard(indicador, dashboardKind) {
  const layoutType = asNorm(
    indicador?.layout_type ||
      indicador?.layoutType ||
      indicador?.dashboard_layout_type ||
      indicador?.dashboardLayoutType
  );
  if (layoutType !== 'special') return false;

  const cardKey = asNorm(
    indicador?.special_card_key ||
      indicador?.specialCardKey ||
      indicador?.layout_card_key ||
      indicador?.layoutCardKey
  );
  if (!cardKey) return true;
  return cardKey === asNorm(dashboardKind);
}

/**
 * Retorna ids cobertos por card especial com base exclusiva em metadado.
 * Sem metadado explícito, retorna conjunto vazio (fallback para grid genérico).
 * @param {'iras'|'misp'|'producao'|'eventos_adversos'|'nr32'|'generico'} dashboardKind
 * @param {Record<string, unknown>[]} indsDoModulo
 * @returns {Set<string>}
 */
export function coveredIndicadorIdsBySpecialCard(dashboardKind, indsDoModulo) {
  const inds = Array.isArray(indsDoModulo) ? indsDoModulo : [];
  if (!inds.length) return new Set();
  const special = inds
    .filter((ind) => indicadorIsSpecialForCard(ind, dashboardKind))
    .map((ind) => String(ind.id))
    .filter(Boolean);
  return new Set(special);
}
