/**
 * Aliases de nome/label para cards especiais do dashboard (IRAS, Eventos adversos, bundle LP).
 * Comparação sem acento e case-insensitive; match exato em nome/label antes de parcial.
 */

/** @param {string} s */
export function stripNorm(s) {
  return String(s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

/**
 * @param {Record<string, unknown>[]} indicadores
 * @param {string[]} candidatos — ordem importa: tenta exatos na ordem, depois parciais
 * @returns {Record<string, unknown> | undefined}
 */
export function findIndicadorPorAliases(indicadores, candidatos) {
  if (!Array.isArray(indicadores) || !candidatos?.length) return undefined;
  for (const c of candidatos) {
    const target = stripNorm(c);
    if (!target) continue;
    const exato = indicadores.find((ind) => {
      const n = stripNorm(/** @type {string} */ (ind.nome));
      const l = stripNorm(/** @type {string} */ (ind.label));
      return n === target || l === target;
    });
    if (exato) return exato;
  }
  for (const c of candidatos) {
    const target = stripNorm(c);
    if (!target) continue;
    const parcial = indicadores.find((ind) => {
      const n = stripNorm(/** @type {string} */ (ind.nome));
      const l = stripNorm(/** @type {string} */ (ind.label));
      return (n && n.includes(target)) || (l && l.includes(target));
    });
    if (parcial) return parcial;
  }
  return undefined;
}

/** IRAS — indicadores esperados (rótulo ou nome). */
export const ALIAS_IRAS_DENSIDADE = [
  'Densidade IRAS',
  'Densidade de IRAS',
  'Dens. IRAS',
  'Dens IRAS',
  'Densidade Infecções',
  'Densidade Infeccoes',
  'Densidade Infecção',
  'Densidade Infeccao',
  'Densidade Infecções Hospitalares',
  'Densidade Infeccoes Hospitalares',
  'Densidade Infecção Hospitalar',
  'Densidade Infeccao Hospitalar',
  'Densidade Geral IRAS',
  'Densidade Geral de IRAS',
  'Densidade geral de infecção',
  'Densidade geral de infeccao',
  'Densidade IAH',
  'Densidade HAI',
  'Densidade / 1000 IRAS',
  'Densidade/1000 IRAS',
  'IRAS / 1000',
  'IRAS/1000',
  'Densidade por 1000 paciente-dia IRAS',
  'Densidade por 1000 pd IRAS',
  'Densidade — IRAS',
  'Densidade - IRAS',
  'IRAS density',
  'HAI density',
  'Densidade hospitalar',
];

/**
 * Densidade geral IRAS: aliases; depois heurística (módulo já filtrado por IRAS).
 * @param {Record<string, unknown>[]} indicadores
 * @returns {Record<string, unknown> | undefined}
 */
export function findIndicadorDensidadeIRAS(indicadores) {
  const byAlias = findIndicadorPorAliases(indicadores, ALIAS_IRAS_DENSIDADE);
  if (byAlias) return byAlias;
  if (!Array.isArray(indicadores) || indicadores.length === 0) return undefined;

  const hay = (ind) => stripNorm(`${ind.nome || ''} ${ind.label || ''}`);

  const withDens = indicadores.filter((ind) => {
    const h = hay(ind);
    return h.length > 0 && (h.includes('densidade') || h.includes('density'));
  });
  if (withDens.length === 1) return withDens[0];

  const irasHint = (h) =>
    h.includes('iras') ||
    h.includes('infecc') ||
    h.includes('infeccao') ||
    h.includes('hospitalar') ||
    h.includes('hai') ||
    h.includes('iah') ||
    (h.includes('geral') && (h.includes('infec') || h.includes('infecc')));

  const scored = withDens.map((ind) => {
    const h = hay(ind);
    let score = 0;
    if (irasHint(h)) score += 15;
    if (h.includes('1000') || h.includes('1.000') || h.includes('/1000') || h.includes('por mil')) score += 5;
    if (h.includes('paciente') || h.includes('pac-dia') || h.includes('pac dia') || /\bpd\b/.test(h)) score += 3;
    if ((h.includes('pav') || h.includes('ics') || h.includes('itu') || h.includes('cvc') || h.includes('cvd')) &&
        !irasHint(h)) {
      score -= 10;
    }
    return { ind, score };
  });
  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return (Number(a.ind.ordem) || 999) - (Number(b.ind.ordem) || 999);
  });
  if (scored.length && scored[0].score > 0) return scored[0].ind;
  if (withDens.length) return withDens[0];

  return undefined;
}

export const ALIAS_IRAS_INC_PAV = [
  'Incidência PAV',
  'Incidencia PAV',
  'Incidência de PAV',
  'Incidencia de PAV',
];
export const ALIAS_IRAS_TAXA_VM = [
  'Taxa VM (%)',
  'Taxa VM',
  'Taxa de VM',
  'Taxa Uso VM',
  'Uso VM (%)',
  'Uso VM',
  'Pacientes VM %',
  'Paciente VM %',
  'Tx VM',
  'TX VM',
  'Taxa Ventilação Mecânica',
  'Taxa Ventilacao Mecanica',
  'Taxa Ventilação Mecânica (%)',
  'Taxa Ventilacao Mecanica (%)',
  'Taxa VM %',
  'Taxa utilização VM',
  'Taxa utilizacao VM',
  'Taxa de utilização VM',
  'Taxa de utilizacao VM',
  '% VM',
  '% ventilação mecânica',
  '% ventilacao mecanica',
  'VM (%)',
  'Taxa VM — UTI',
  'Taxa VM - UTI',
];
export const ALIAS_IRAS_INC_ICS = ['Incidência ICS', 'Incidencia ICS'];
export const ALIAS_IRAS_TAXA_CVC = ['Taxa CVC (%)', 'Taxa CVC'];
export const ALIAS_IRAS_INC_ITU = ['Incidência ITU', 'Incidencia ITU'];
export const ALIAS_IRAS_TAXA_CVD = ['Taxa CVD (%)', 'Taxa CVD'];
export const ALIAS_IRAS_HM_MED_AVAL = ['HM Medicina Aval.', 'HM Medicina Aval', 'Medicina Aval'];
export const ALIAS_IRAS_HM_MED_ADES = ['HM Medicina Ades.', 'HM Medicina Ades', 'Medicina Ades'];
export const ALIAS_IRAS_HM_ENF_AVAL = [
  'HM Enfermagem Aval.',
  'HM Enfermagem Aval',
  'Enfermagem Aval.',
  'Enfermagem Aval',
  'HM Enf. Aval.',
];
export const ALIAS_IRAS_HM_ENF_ADES = [
  'HM Enfermagem Ades.',
  'HM Enfermagem Ades',
  'Enfermagem Ades.',
  'Enfermagem Ades',
  'HM Enf. Ades.',
  'Adesão Enfermagem',
  'Adesao Enfermagem',
  'Enfermagem — Adesão HM',
  'Enfermagem - Adesao HM',
];
export const ALIAS_IRAS_HM_FIS_AVAL = [
  'HM Fisioterapia Aval.',
  'HM Fisioterapia Aval',
  'Fisioterapia Aval.',
  'Fisioterapia Aval',
  'HM Fis. Aval.',
];
export const ALIAS_IRAS_HM_FIS_ADES = [
  'HM Fisioterapia Ades.',
  'HM Fisioterapia Ades',
  'Fisioterapia Ades.',
  'Fisioterapia Ades',
  'HM Fis. Ades.',
  'Adesão Fisioterapia',
  'Adesao Fisioterapia',
  'Fisioterapia — Adesão HM',
  'Fisioterapia - Adesao HM',
];

/** Eventos adversos — notificações. */
export const ALIAS_EVENTOS_NOTIF = ['Notif. Enviadas', 'Notificações Enviadas', 'Notificacoes Enviadas'];

/**
 * Pílulas de densidade (rótulo na UI) → aliases aceitos em nome/label do indicador.
 * @type {Record<string, string[]>}
 */
export const EVENTOS_ADVERSOS_CATEGORIA_ALIASES = {
  Identificação: ['Identificação', 'Identificacao', 'Identificacao de Eventos'],
  Medicação: ['Medicação', 'Medicacao', 'Erro de Medicação', 'Erro de Medicacao'],
  'Higiene das mãos': ['Higiene das mãos', 'Higiene das maos', 'Higiene das Mãos', 'Higiene Maos'],
  LP: ['LP', 'Lesão por Pressão', 'Lesao por Pressao'],
  LPDM: ['LPDM'],
  Queda: ['Queda'],
  IRCVA: ['IRCVA'],
};

/**
 * @param {Record<string, unknown>[]} mainInds
 * @param {string} categoriaUiLabel — ex.: "Identificação" ou "Todas"
 */
export function filterIndicadoresCategoriaEventos(mainInds, categoriaUiLabel) {
  if (categoriaUiLabel === 'Todas' || !categoriaUiLabel) return mainInds;
  const aliases = EVENTOS_ADVERSOS_CATEGORIA_ALIASES[categoriaUiLabel];
  if (!aliases) return [];
  const byAlias = mainInds.filter((ind) => findIndicadorPorAliases([ind], aliases));
  if (byAlias.length) return byAlias;
  const catNorm = stripNorm(categoriaUiLabel);
  const words = catNorm.split(/\s+/).filter((w) => w.length > 1);
  return mainInds.filter((ind) => {
    const hay = stripNorm(`${ind.nome || ''} ${ind.label || ''}`);
    if (!hay) return false;
    if (hay.includes(catNorm)) return true;
    return words.some((w) => hay.includes(w));
  });
}

/** Lesão por Pressão (bundle) — labels esperados. */
export const ALIAS_LP_EXPOSTOS = ['Expostos', 'Pacientes Expostos', 'Expostos LP'];
export const ALIAS_LP_NOVOS = ['Novos Casos', 'Novos casos', 'Casos Novos', 'Novos casos LP'];
export const ALIAS_LP_PAC_DIA = ['Paciente Dia', 'Paciente-dia', 'Pacientes Dia', 'Paciente Dia LP'];
export const ALIAS_LP_DENSIDADE = [
  'Densidade LP',
  'Dens. LP',
  'Dens LP',
  'Dens LP/1000',
  'Densidade Lesão por Pressão',
  'Densidade Lesao por Pressao',
  'Densidade / 1k LP',
  'Densidade /1k LP',
  'Densidade /1000',
  'Densidade/1000',
  'Densidade LP / 1.000',
  'Densidade por 1000 paciente-dia',
  'Densidade por 1000 paciente dia',
  'Densidade por mil',
  'Densidade por 1.000',
  'Densidade por 1.000 pd',
  'per 1000 pd',
  'por 1000 pd',
  'Densidade (LP)',
  'Densidade LP (por mil)',
  'IR LP densidade',
  'Densidade IR LP',
  'Densidade por 1000 Pacientes-Dia',
  'Densidade por 1000 pacientes-dia',
  'Densidade / 1000 PD',
  'Densidade/1000 PD',
  'Densidade 1000 PD',
  'Dens por 1000 pd',
  'Dens. por 1000 pac-dia',
  'Densidade (por 1000 pd)',
  'Densidade por mil paciente-dia',
  'Densidade por mil pacientes-dia',
  'Por 1000 paciente-dia',
  'Por 1.000 paciente-dia',
  'Por 1000 pacientes-dia',
  'Densidade — LP',
  'Densidade - LP',
];

/**
 * Densidade LP: aliases primeiro; se falhar, heurística no módulo (lista já é do módulo LP).
 * Cobre rótulos só com "densidade" + "1000"/"paciente-dia" sem a sigla LP no texto.
 * @param {Record<string, unknown>[]} indicadores
 * @returns {Record<string, unknown> | undefined}
 */
export function findIndicadorDensidadeLP(indicadores) {
  const byAlias = findIndicadorPorAliases(indicadores, ALIAS_LP_DENSIDADE);
  if (byAlias) return byAlias;
  if (!Array.isArray(indicadores) || indicadores.length === 0) return undefined;

  const hay = (ind) => stripNorm(`${ind.nome || ''} ${ind.label || ''}`);

  const withDensidade = indicadores.filter((ind) => {
    const h = hay(ind);
    return h.length > 0 && (h.includes('densidade') || h.includes('density'));
  });
  if (withDensidade.length === 1) return withDensidade[0];

  const lpHint = (h) =>
    (/\blp\b/.test(h) || /(^|[^a-z0-9])lp([^a-z0-9]|$)/.test(h)) ||
    h.includes('lesao') ||
    h.includes('pressao');

  const scored = withDensidade.map((ind) => {
    const h = hay(ind);
    let score = 0;
    if (lpHint(h)) score += 10;
    if (h.includes('1000') || h.includes('1.000') || h.includes('/1000') || h.includes('por mil')) score += 5;
    if (h.includes('paciente') || h.includes('pac-dia') || h.includes('pac dia') || /\bpd\b/.test(h)) score += 3;
    return { ind, score };
  });
  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return (Number(a.ind.ordem) || 999) - (Number(b.ind.ordem) || 999);
  });
  if (scored.length && scored[0].score > 0) return scored[0].ind;
  if (withDensidade.length) return withDensidade[0];

  return undefined;
}

export const ALIAS_LP_INCIDENCIA = [
  'LP Estad. 2+',
  'LP Estad 2+',
  'Incidência LP',
  'Incidencia LP',
  'Incidência Lesão por Pressão',
  'Incidencia Lesao por Pressao',
];

/**
 * NR32 — cor por série; aceita pequenas variações de texto no indicador.
 * @type {{ label: string, aliases: string[], color: string }[]}
 */
export const NR32_SERIE_STYLES = [
  { label: 'Adornos', aliases: ['Adornos'], color: '#1e3a5f' },
  { label: 'Cabelo Solto', aliases: ['Cabelo Solto', 'Cabelo solto'], color: '#22c55e' },
  { label: 'Sem Jaleco', aliases: ['Sem Jaleco', 'Sem jaleco'], color: '#f59e0b' },
  { label: 'Unhas c/ Relevo', aliases: ['Unhas c/ Relevo', 'Unhas c/ relevo', 'Unhas com Relevo'], color: '#ef4444' },
  { label: 'Unhas >2mm', aliases: ['Unhas >2mm', 'Unhas > 2mm'], color: '#8b5cf6' },
  { label: 'Unhas Postiças', aliases: ['Unhas Postiças', 'Unhas Posticas'], color: '#ec4899' },
];

/**
 * @param {Record<string, unknown>} ind
 * @param {number} idx
 */
export function nr32SerieStyleForIndicador(ind, idx) {
  const key = stripNorm(/** @type {string} */ (ind.label || ind.nome));
  const found = NR32_SERIE_STYLES.find((s) => s.aliases.some((a) => stripNorm(a) === key || key.includes(stripNorm(a))));
  if (found) return found;
  return NR32_SERIE_STYLES[idx % NR32_SERIE_STYLES.length];
}
