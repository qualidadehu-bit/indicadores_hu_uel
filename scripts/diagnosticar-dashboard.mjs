const baseUrl = process.env.DASHBOARD_API_URL || 'http://127.0.0.1:8788/api';

function normalizeId(v) {
  return String(v ?? '').trim();
}

function normalizeText(v) {
  return String(v ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

function parseWhitelist(raw) {
  const s = String(raw ?? '').trim();
  if (!s) return null;
  const ids = s.split(/[|;]+/g).map((x) => normalizeId(x)).filter(Boolean);
  return ids.length ? new Set(ids) : null;
}

function parseDivisoes(raw) {
  const s = String(raw ?? '').trim();
  if (!s) return [];
  return [...new Set(s.split(/[|;]+/g).map((x) => String(x).trim()).filter(Boolean))];
}

function findByAliases(indicadores, aliases) {
  for (const a of aliases) {
    const target = normalizeText(a);
    const exact = indicadores.find((ind) => {
      const n = normalizeText(ind.nome);
      const l = normalizeText(ind.label);
      return n === target || l === target;
    });
    if (exact) return exact;
  }
  for (const a of aliases) {
    const target = normalizeText(a);
    const partial = indicadores.find((ind) => {
      const n = normalizeText(ind.nome);
      const l = normalizeText(ind.label);
      return (n && n.includes(target)) || (l && l.includes(target));
    });
    if (partial) return partial;
  }
  return undefined;
}

async function post(body) {
  const res = await fetch(baseUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!res.ok || json.ok === false) {
    throw new Error(json.error || `HTTP ${res.status}`);
  }
  return json.data || [];
}

function moduloKind(modulo) {
  const fromTipo = String(modulo.tipo_ui || modulo.slug || '').trim().toLowerCase();
  if (['iras', 'misp', 'producao', 'eventos_adversos', 'nr32', 'generico'].includes(fromTipo)) return fromTipo;
  const byName = {
    IRAS: 'iras',
    MISP: 'misp',
    Produção: 'producao',
    'Eventos Adversos': 'eventos_adversos',
    NR32: 'nr32',
  };
  return byName[String(modulo.nome || '').trim()] || 'generico';
}

function coveredBySpecialAliases(kind, indsModulo) {
  if (kind === 'misp' || kind === 'eventos_adversos' || kind === 'nr32' || kind === 'generico') {
    return new Set(indsModulo.map((i) => normalizeId(i.id)));
  }
  if (kind === 'producao') {
    const c1 = findByAliases(indsModulo, ['Taxa de Ocupação', 'Taxa de Ocupacao', 'Taxa Ocupação', 'Taxa Ocupacao', 'TO']);
    const c2 = findByAliases(indsModulo, ['Média de Permanência', 'Media de Permanencia', 'Permanência Média', 'Permanencia Media']);
    const c3 = findByAliases(indsModulo, ['Giro de Leito', 'Giro de leito']);
    return new Set([c1?.id, c2?.id, c3?.id].filter(Boolean).map(normalizeId));
  }
  if (kind === 'iras') {
    const groups = [
      ['Densidade IRAS', 'Densidade de IRAS', 'Densidade geral de infecção', 'Densidade geral de infeccao', 'Densidade Geral IRAS'],
      ['Incidência PAV', 'Incidencia PAV'],
      ['Taxa VM (%)', 'Taxa VM', 'Taxa de VM', 'Taxa Uso VM'],
      ['Incidência ICS', 'Incidencia ICS'],
      ['Taxa CVC (%)', 'Taxa CVC'],
      ['Incidência ITU', 'Incidencia ITU'],
      ['Taxa CVD (%)', 'Taxa CVD'],
      ['HM Medicina Aval.', 'Medicina Aval'],
      ['HM Medicina Ades.', 'Medicina Ades'],
      ['HM Enfermagem Aval.', 'Enfermagem Aval.'],
      ['HM Enfermagem Ades.', 'Enfermagem Ades.'],
      ['HM Fisioterapia Aval.', 'Fisioterapia Aval.'],
      ['HM Fisioterapia Ades.', 'Fisioterapia Ades.'],
    ];
    const ids = groups.map((g) => findByAliases(indsModulo, g)?.id).filter(Boolean).map(normalizeId);
    return new Set(ids);
  }
  return new Set();
}

const [setores, modulos, indicadores, lancamentos] = await Promise.all(
  ['Setor', 'Modulo', 'Indicador', 'Lancamento'].map((entity) =>
    post({ kind: 'entity', entity, operation: 'list' })
  )
);

const setoresNorm = setores.map((s) => ({
  ...s,
  id: normalizeId(s.id),
  divisao: String(s.divisao ?? '').trim(),
  indicador_ids: String(s.indicador_ids ?? '').trim(),
}));
const modulosNorm = modulos.map((m) => ({ ...m, id: normalizeId(m.id), nome: String(m.nome ?? '').trim() }));
const indicadoresNorm = indicadores.map((i) => ({
  ...i,
  id: normalizeId(i.id),
  modulo_id: normalizeId(i.modulo_id),
  divisoes: String(i.divisoes ?? '').trim(),
  ativo: !(String(i.ativo).toLowerCase() === 'false' || String(i.ativo) === '0'),
}));
const lancamentosNorm = lancamentos.map((l) => ({
  ...l,
  indicador_id: normalizeId(l.indicador_id),
  setor_id: normalizeId(l.setor_id),
  modulo_id: normalizeId(l.modulo_id),
  ano: Number(l.ano),
  mes: Number(l.mes),
}));

const periodCount = new Map();
for (const l of lancamentosNorm) {
  if (!Number.isFinite(l.ano) || !Number.isFinite(l.mes)) continue;
  const key = `${l.ano}-${String(l.mes).padStart(2, '0')}`;
  periodCount.set(key, (periodCount.get(key) || 0) + 1);
}
const [periodoMaisRecente] = [...periodCount.entries()].sort((a, b) => b[1] - a[1]);
const [anoRef, mesRef] = (periodoMaisRecente?.[0] || `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`)
  .split('-')
  .map(Number);

const totalLancamentoList = lancamentosNorm.length;
const aposAnoMes = lancamentosNorm.filter((l) => l.ano === anoRef && l.mes === mesRef);

const porSetor = setoresNorm.map((setor) => {
  const s2 = aposAnoMes.filter((l) => l.setor_id === setor.id);
  const indsDivisao = indicadoresNorm.filter((ind) => {
    const divs = parseDivisoes(ind.divisoes);
    if (divs.length === 0) return true;
    if (!setor.divisao) return true;
    return divs.includes(setor.divisao);
  });
  const wl = parseWhitelist(setor.indicador_ids);
  const indsWhitelist = indsDivisao.filter((ind) => !wl || wl.has(ind.id));
  const idsWhitelist = new Set(indsWhitelist.map((ind) => ind.id));
  const s4 = s2.filter((l) => idsWhitelist.has(l.indicador_id));
  return {
    setor_id: setor.id,
    setor_nome: setor.nome,
    divisao: setor.divisao,
    aposSetor: s2.length,
    aposWhitelist: s4.length,
    removidosWhitelist: s2.length - s4.length,
    indicadoresDivisao: indsDivisao.length,
    indicadoresWhitelist: indsWhitelist.length,
  };
});

const modulosResumo = modulosNorm.map((modulo) => {
  const kind = moduloKind(modulo);
  const indsModulo = indicadoresNorm.filter((ind) => ind.modulo_id === modulo.id);
  const idsModulo = new Set(indsModulo.map((i) => i.id));
  const lModulo = aposAnoMes.filter((l) => idsModulo.has(l.indicador_id));
  const coveredAlias = coveredBySpecialAliases(kind, indsModulo);
  const lAlias = lModulo.filter((l) => coveredAlias.has(l.indicador_id));
  const naoMapeados = indsModulo.filter((ind) => !coveredAlias.has(ind.id)).map((ind) => ({
    id: ind.id,
    nome: ind.nome,
    label: ind.label,
  }));
  return {
    modulo_id: modulo.id,
    modulo: modulo.nome,
    tipo_ui: kind,
    layout_dashboard: modulo.layout_dashboard || 'padrao',
    indicadoresModulo: indsModulo.length,
    lancamentosModuloAnoMes: lModulo.length,
    aposAliasEspecial: lAlias.length,
    restanteParaGridGenerico: lModulo.length - lAlias.length,
    indicadoresNaoMapeadosPorAlias: naoMapeados,
  };
});

const saida = {
  apiUrl: baseUrl,
  periodoAnalise: { ano: anoRef, mes: mesRef },
  totals: {
    totalLancamentoList,
    aposAnoMes: aposAnoMes.length,
  },
  filtrosPorSetor: porSetor.sort((a, b) => b.aposSetor - a.aposSetor),
  filtrosModuloTipoLayoutEAlias: modulosResumo.filter(
    (m) => m.lancamentosModuloAnoMes > 0 || m.indicadoresModulo > 0
  ),
};

console.log(JSON.stringify(saida, null, 2));
