/**
 * Faixas / legenda do radar estilo qualidade (escala 0–100%, pontos e tabela histórica).
 * Campo `radar_faixas` no módulo e/ou indicador: JSON
 * `[{ "label": "...", "min": 90, "max": 99, "emoji": "🙂", "cor": "#22c55e" }, ...]`.
 * Vazio ou ausente = padrão MISP (SEGURO … INSUFICIENTE).
 */

/**
 * @typedef {{ label: string, min: number, max: number, emoji: string, cor: string, range?: string }} RadarFaixa
 */

/** Padrão MISP (legado fixo em RadarQualidadeUi). */
export const DEFAULT_RADAR_FAIXAS = /** @type {RadarFaixa[]} */ ([
  { label: 'SEGURO', min: 100, max: 100, emoji: '😊', cor: '#3b82f6' },
  { label: 'ADEQUADO', min: 90, max: 99, emoji: '🙂', cor: '#22c55e' },
  { label: 'DESEJÁVEL', min: 80, max: 89, emoji: '😐', cor: '#ca8a04' },
  { label: 'LIMÍTROFE', min: 70, max: 79, emoji: '😟', cor: '#f97316' },
  { label: 'INSUFICIENTE', min: 0, max: 69, emoji: '😢', cor: '#dc2626' },
]);

const HEX_RE = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

/**
 * @param {unknown} raw
 * @returns {string}
 */
function normalizeHex(raw) {
  const s = String(raw || '').trim();
  if (!HEX_RE.test(s)) return '#6b7280';
  if (s.length === 4) {
    const r = s[1];
    const g = s[2];
    const b = s[3];
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
  }
  return s.toLowerCase();
}

/**
 * @param {unknown} n
 * @param {number} fallback
 */
function toNum(n, fallback) {
  const v = Number(n);
  return Number.isFinite(v) ? v : fallback;
}

/**
 * @param {RadarFaixa} faixa
 * @returns {string}
 */
export function formatFaixaRange(faixa) {
  const min = faixa.min;
  const max = faixa.max;
  if (min === max && max === 100) return '100%';
  if (min <= 0 && max < 100) return `≤${max}%`;
  if (min === max) return `${min}%`;
  return `${min}-${max}%`;
}

/**
 * @param {RadarFaixa[]} faixas
 * @returns {RadarFaixa[]}
 */
export function withFaixaRanges(faixas) {
  return faixas.map((f) => ({ ...f, range: formatFaixaRange(f) }));
}

/**
 * @param {unknown} raw
 * @returns {RadarFaixa[]}
 */
export function parseRadarFaixasRaw(raw) {
  if (raw == null || String(raw).trim() === '') return [];
  try {
    const j = JSON.parse(String(raw).trim());
    if (!Array.isArray(j)) return [];
    /** @type {RadarFaixa[]} */
    const out = [];
    for (const row of j) {
      if (!row || typeof row !== 'object') continue;
      const label = row.label != null ? String(row.label).trim() : '';
      if (!label) continue;
      const min = toNum(row.min, 0);
      const max = toNum(row.max, min);
      const emoji = row.emoji != null ? String(row.emoji).trim() : '●';
      const cor = normalizeHex(row.cor);
      out.push({ label, min: Math.min(min, max), max: Math.max(min, max), emoji, cor });
    }
    return out.sort((a, b) => b.min - a.min);
  } catch {
    return [];
  }
}

/**
 * @param {RadarFaixa[]} rows
 * @returns {string}
 */
export function serializeRadarFaixas(rows) {
  if (!rows?.length) return '';
  const clean = rows
    .map((r) => ({
      label: String(r.label || '').trim(),
      min: toNum(r.min, 0),
      max: toNum(r.max, 0),
      emoji: String(r.emoji || '●').trim() || '●',
      cor: normalizeHex(r.cor),
    }))
    .filter((r) => r.label);
  if (clean.length === 0) return '';
  return JSON.stringify(clean);
}

/**
 * Indicador tem prioridade sobre o módulo; vazio = padrão MISP.
 * @param {Record<string, unknown>|null|undefined} ind
 * @param {Record<string, unknown>|null|undefined} modulo
 * @param {Record<string, unknown>[]|null|undefined} [members] - se informado, usa override do primeiro membro com faixas
 * @returns {RadarFaixa[]}
 */
export function effectiveRadarFaixas(ind, modulo, members) {
  if (members?.length) {
    for (const m of members) {
      const from = parseRadarFaixasRaw(m?.radar_faixas);
      if (from.length > 0) return withFaixaRanges(from);
    }
  }
  const fromInd = ind ? parseRadarFaixasRaw(ind.radar_faixas) : [];
  if (fromInd.length > 0) return withFaixaRanges(fromInd);
  const fromMod = parseRadarFaixasRaw(modulo?.radar_faixas);
  if (fromMod.length > 0) return withFaixaRanges(fromMod);
  return withFaixaRanges(DEFAULT_RADAR_FAIXAS);
}

/**
 * @param {number|null|undefined} valor
 * @param {RadarFaixa[]} [faixas]
 */
export function getRadarQualidadeScoreColor(valor, faixas) {
  const empty = { bg: 'bg-gray-200', text: 'text-gray-500', hex: '#d1d5db' };
  if (valor === null || valor === undefined) return empty;
  const v = Number(valor);
  if (!Number.isFinite(v)) return empty;

  const list = faixas?.length ? faixas : withFaixaRanges(DEFAULT_RADAR_FAIXAS);
  const sorted = [...list].sort((a, b) => b.min - a.min);
  for (const f of sorted) {
    if (v >= f.min && v <= f.max) {
      return { bg: '', text: 'text-white', hex: f.cor };
    }
  }
  const last = sorted[sorted.length - 1];
  return { bg: '', text: 'text-white', hex: last?.cor || '#dc2626' };
}

/** Linhas iniciais para o editor quando não há JSON salvo. */
export function defaultRadarFaixasEditorRows() {
  return DEFAULT_RADAR_FAIXAS.map((f) => ({ ...f }));
}

/**
 * Incluir `radar_faixas` no patch só quando o editor está visível (evita apagar na planilha ao salvar outro campo).
 * @param {boolean} showEditor
 * @param {RadarFaixa[]} rows
 * @returns {Record<string, string>}
 */
export function radarFaixasPatchIfEditing(showEditor, rows) {
  if (!showEditor) return {};
  return { radar_faixas: serializeRadarFaixas(rows) };
}
