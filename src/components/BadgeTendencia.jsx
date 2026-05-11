import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function BadgeTendencia({ tendencia, variacao, className }) {
  if (!tendencia || tendencia.direcao === 'ESTAVEL') {
    return (
      <span className={cn('inline-flex items-center gap-1 text-xs text-gray-500', className)}>
        <Minus className="w-3 h-3" />
        Estável
      </span>
    );
  }

  const subindo = tendencia.direcao === 'SUBINDO';
  const positiva = tendencia.positiva;

  const color = positiva === null
    ? 'text-blue-600'
    : positiva
      ? 'text-green-600'
      : 'text-red-600';

  const Icon = subindo ? TrendingUp : TrendingDown;

  return (
    <span className={cn('inline-flex items-center gap-1 text-xs font-medium', color, className)}>
      <Icon className="w-3 h-3" />
      {variacao !== undefined && variacao !== null
        ? `${variacao > 0 ? '+' : ''}${variacao.toFixed(1)}%`
        : tendencia.direcao === 'SUBINDO' ? 'Subindo' : 'Descendo'
      }
    </span>
  );
}