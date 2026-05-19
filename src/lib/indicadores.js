// Direção da meta
export const DIRECAO_META = {
  MAIOR_E_MELHOR: 'MAIOR_E_MELHOR',
  MENOR_E_MELHOR: 'MENOR_E_MELHOR',
  META_CONTRATUAL: 'META_CONTRATUAL',
};

// Status possíveis
export const STATUS_META = {
  OK: 'OK',
  ATENCAO: 'ATENCAO',
  CRITICO: 'CRITICO',
  SEM_DADOS: 'SEM_DADOS',
};

/**
 * Calcula o status da meta comparando valor real vs meta
 * @param {number|null} valor - valor lançado
 * @param {number|null} meta - meta definida
 * @param {string} direcao - MAIOR_E_MELHOR | MENOR_E_MELHOR | META_CONTRATUAL
 * @returns {string} status
 */
export function calcularStatusMeta(valor, meta, direcao = DIRECAO_META.MENOR_E_MELHOR) {
  if (valor === null || valor === undefined || meta === null || meta === undefined) {
    return STATUS_META.SEM_DADOS;
  }

  const tolerancia = 0.05; // 5% de tolerância para "atenção"

  if (direcao === DIRECAO_META.MAIOR_E_MELHOR) {
    if (valor >= meta) return STATUS_META.OK;
    if (valor >= meta * (1 - tolerancia)) return STATUS_META.ATENCAO;
    return STATUS_META.CRITICO;
  }

  if (direcao === DIRECAO_META.MENOR_E_MELHOR) {
    if (valor <= meta) return STATUS_META.OK;
    if (valor <= meta * (1 + tolerancia)) return STATUS_META.ATENCAO;
    return STATUS_META.CRITICO;
  }

  if (direcao === DIRECAO_META.META_CONTRATUAL) {
    const diff = Math.abs(valor - meta) / (meta || 1);
    if (diff <= 0.02) return STATUS_META.OK;
    if (diff <= 0.08) return STATUS_META.ATENCAO;
    return STATUS_META.CRITICO;
  }

  return STATUS_META.SEM_DADOS;
}

/**
 * Calcula a tendência entre dois valores
 * @param {number} valorAtual
 * @param {number} valorAnterior
 * @param {string} direcao
 * @returns {{ direcao: 'SUBINDO'|'DESCENDO'|'ESTAVEL', positiva: boolean }}
 */
export function calcularTendencia(valorAtual, valorAnterior, direcao = DIRECAO_META.MENOR_E_MELHOR) {
  if (valorAtual === null || valorAnterior === null || valorAtual === undefined || valorAnterior === undefined) {
    return { direcao: 'ESTAVEL', positiva: null };
  }

  const diff = valorAtual - valorAnterior;
  if (Math.abs(diff) < 0.001) return { direcao: 'ESTAVEL', positiva: null };

  const subindo = diff > 0;

  let positiva;
  if (direcao === DIRECAO_META.MAIOR_E_MELHOR) {
    positiva = subindo;
  } else if (direcao === DIRECAO_META.MENOR_E_MELHOR) {
    positiva = !subindo;
  } else {
    positiva = null; // neutro para contratual
  }

  return { direcao: subindo ? 'SUBINDO' : 'DESCENDO', positiva };
}

/**
 * Retorna configuração visual baseada no status
 */
export function getStatusConfig(status) {
  switch (status) {
    case STATUS_META.OK:
      return { label: 'OK', color: 'text-green-700', bg: 'bg-green-50', border: 'border-green-200', dot: 'bg-green-500' };
    case STATUS_META.ATENCAO:
      return { label: 'Atenção', color: 'text-amber-700', bg: 'bg-amber-50', border: 'border-amber-200', dot: 'bg-amber-500' };
    case STATUS_META.CRITICO:
      return { label: 'Crítico', color: 'text-red-700', bg: 'bg-red-50', border: 'border-red-200', dot: 'bg-red-500' };
    default:
      return { label: 'Sem Dados', color: 'text-gray-500', bg: 'bg-gray-50', border: 'border-gray-200', dot: 'bg-gray-400' };
  }
}

export const MESES = [
  'Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun',
  'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'
];

export const MESES_COMPLETO = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
];

/** Ano mínimo padrão nos selects (histórico legado do hospital). */
export const ANO_SELECT_MIN = 2020;

/** Quantos anos à frente do ano civil atual incluir nos selects. */
export const ANO_SELECT_FUTURE = 10;

/**
 * Lista de anos para selects (lançamento, dashboard, comparação, PDF).
 * @param {{ from?: number, future?: number, referenceYear?: number }} [opts]
 * @returns {number[]}
 */
export function buildAnosDisponiveis(opts = {}) {
  const from = opts.from ?? ANO_SELECT_MIN;
  const future = opts.future ?? ANO_SELECT_FUTURE;
  const ref = opts.referenceYear ?? new Date().getFullYear();
  const end = ref + future;
  const anos = [];
  for (let y = from; y <= end; y++) anos.push(y);
  return anos;
}