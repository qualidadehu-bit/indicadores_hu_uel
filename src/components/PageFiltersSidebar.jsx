import { Filter } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

export default function PageFiltersSidebar({
  title,
  chips = [],
  className = '',
  horizontal = false,
  children,
}) {
  return (
    <div className={cn(horizontal ? '' : 'lg:sticky lg:top-20 lg:self-start', className)}>
      <Card className="border-border/80 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <CardContent className="pt-4 space-y-3">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Filter className="w-4 h-4" />
            <span className="font-medium">{title}</span>
          </div>
          {children}
          {chips.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {chips.map((chip) => (
                <Badge key={chip.key} variant="outline" className="bg-muted/40 text-foreground border-border/70">
                  {chip.label}
                </Badge>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
