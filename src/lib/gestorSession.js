/**
 * Membro (gestor): na aba / sessão `gestor`
 * - `unidades`: ids de setor (aba setor), separados por | ou ;
 * - `divisoes`: nomes de divisão (mesmo texto que setor.divisao), separados por | ou ;
 * - `nivel_acesso` (sessão após login): completo | lancamento — ver `gestorNivelAcesso.js`
 * Pode usar só divisões, só setores, ou ambos (interseção).
 */
import { ENTITY_TYPE_CLINICA, ENTITY_TYPE_COMISSAO, ENTITY_TYPE_SETOR, normalizeEntityType } from '@/lib/entityType';

/** @param {unknown} raw */
export function parseGestorUnidadesIds(raw) {
  if (raw == null || String(raw).trim() === '') return null;
  const ids = [...new Set(String(raw).split(/[|;]+/g).map((s) => s.trim()).filter(Boolean))];
  return ids.length ? new Set(ids) : null;
}

/** @param {unknown} raw */
export function parseGestorDivisoesNames(raw) {
  if (raw == null || String(raw).trim() === '') return null;
  const names = [...new Set(String(raw).split(/[|;]+/g).map((s) => s.trim()).filter(Boolean))];
  return names.length ? new Set(names) : null;
}

/** @param {unknown} raw @returns {string[]} */
export function parseGestorDivisoesList(raw) {
  if (raw == null || String(raw).trim() === '') return [];
  return [...new Set(String(raw).split(/[|;]+/g).map((s) => s.trim()).filter(Boolean))];
}

/**
 * @param {Record<string, unknown>[]|undefined} setores
 * @param {Record<string, unknown>|null|undefined} user — sessão (localStorage userSession)
 */
export function getSetoresVisiveisParaUsuario(setores, user) {
  const list = setores || [];
  if (!user || String(user.tipo) !== 'gestor') return list;
  const byIdsLegacy = parseGestorUnidadesIds(user.unidades);
  const byIdsSetor = parseGestorUnidadesIds(user.unidades_setor);
  const byIdsComissao = parseGestorUnidadesIds(user.unidades_comissao);
  const byIdsClinica = parseGestorUnidadesIds(user.unidades_clinica);
  const byDiv = parseGestorDivisoesNames(user.divisoes);
  let out = list;
  if (byDiv && byDiv.size > 0) {
    out = out.filter((s) => byDiv.has(String(s.divisao || '').trim()));
  }
  const hasScopedIds =
    (byIdsSetor && byIdsSetor.size > 0) ||
    (byIdsComissao && byIdsComissao.size > 0) ||
    (byIdsClinica && byIdsClinica.size > 0);
  if (hasScopedIds || (byIdsLegacy && byIdsLegacy.size > 0)) {
    out = out.filter((s) => {
      const sid = String(s.id);
      const rowType = normalizeEntityType(s.entity_type);
      if (rowType === ENTITY_TYPE_COMISSAO) {
        if (byIdsComissao && byIdsComissao.size > 0) return byIdsComissao.has(sid);
        return byIdsLegacy ? byIdsLegacy.has(sid) : false;
      }
      if (rowType === ENTITY_TYPE_CLINICA) {
        if (byIdsClinica && byIdsClinica.size > 0) return byIdsClinica.has(sid);
        return byIdsLegacy ? byIdsLegacy.has(sid) : false;
      }
      if (rowType === ENTITY_TYPE_SETOR) {
        if (byIdsSetor && byIdsSetor.size > 0) return byIdsSetor.has(sid);
        return byIdsLegacy ? byIdsLegacy.has(sid) : false;
      }
      return byIdsLegacy ? byIdsLegacy.has(sid) : false;
    });
  }
  if (
    (!byDiv || byDiv.size === 0) &&
    (!byIdsLegacy || byIdsLegacy.size === 0) &&
    (!byIdsSetor || byIdsSetor.size === 0) &&
    (!byIdsComissao || byIdsComissao.size === 0) &&
    (!byIdsClinica || byIdsClinica.size === 0)
  ) {
    return [];
  }
  return out;
}

/**
 * Conjunto de nomes de divisão para filtrar indicadores na Configuração (membro).
 * @returns {null|Set<string>} `null` se não for gestor (sem filtro); para gestor, `Set` de divisões
 *   (vazio = só indicadores sem restrição em `divisoes`).
 */
export function getDivisoesScopeParaGestor(user, setores) {
  if (!user || String(user.tipo) !== 'gestor') return null;
  const vis = getSetoresVisiveisParaUsuario(setores || [], user);
  const explicit = parseGestorDivisoesNames(user.divisoes);
  const divsFromSetores = new Set(vis.map((s) => String(s.divisao || '').trim()).filter(Boolean));
  if (explicit && explicit.size > 0) {
    const inter = new Set();
    explicit.forEach((d) => {
      if (divsFromSetores.size === 0 || divsFromSetores.has(d)) inter.add(d);
    });
    return inter.size ? inter : new Set(explicit);
  }
  return divsFromSetores;
}
