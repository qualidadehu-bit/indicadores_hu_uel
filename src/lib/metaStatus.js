/**
 * @param {number|null|undefined} valor
 * @param {number|null|undefined} metaVal
 * @param {string|undefined} direcao
 * @returns {'N/A'|'Sem meta'|'Sem dados'|'OK'|'Atenção'|'Crítico'}
 */
export function calcStatus(valor, metaVal, direcao) {
  if (direcao === 'NAO_SE_APLICA') return 'N/A';
  if (valor === null || valor === undefined || metaVal === null || metaVal === undefined) {
    return valor !== null && valor !== undefined ? 'Sem meta' : 'Sem dados';
  }
  const diff = valor - metaVal;
  if (direcao === 'MAIOR_E_MELHOR') {
    if (diff >= 0) return 'OK';
    if (diff >= -metaVal * 0.1) return 'Atenção';
    return 'Crítico';
  }
  if (diff <= 0) return 'OK';
  if (diff <= metaVal * 0.1) return 'Atenção';
  return 'Crítico';
}

/**
 * @param {'N/A'|'Sem meta'|'Sem dados'|'OK'|'Atenção'|'Crítico'|string} status
 * @param {'comparacao'|'pdf'} [palette]
 */
export function statusColor(status, palette = 'comparacao') {
  if (status === 'OK') return palette === 'pdf' ? [45, 125, 70] : [34, 139, 34];
  if (status === 'Atenção') return [210, 140, 0];
  if (status === 'Crítico') return [200, 0, 0];
  return [140, 140, 140];
}
