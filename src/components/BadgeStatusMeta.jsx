import { CheckCircle2, AlertTriangle, XCircle, HelpCircle } from 'lucide-react';
import { STATUS_META, getStatusConfig } from '@/lib/indicadores';
import { cn } from '@/lib/utils';

const ICONS = {
  [STATUS_META.OK]: CheckCircle2,
  [STATUS_META.ATENCAO]: AlertTriangle,
  [STATUS_META.CRITICO]: XCircle,
  [STATUS_META.SEM_DADOS]: HelpCircle,
};

export default function BadgeStatusMeta({ status, className, size = 'sm' }) {
  const config = getStatusConfig(status);
  const Icon = ICONS[status] || HelpCircle;
  const sizeClass = size === 'sm' ? 'text-xs px-2 py-0.5' : 'text-sm px-3 py-1';
  const iconSize = size === 'sm' ? 'w-3 h-3' : 'w-4 h-4';

  return (
    <span className={cn(
      'inline-flex items-center gap-1 rounded-full border font-medium',
      config.bg, config.color, config.border,
      sizeClass,
      className
    )}>
      <Icon className={iconSize} />
      {config.label}
    </span>
  );
}