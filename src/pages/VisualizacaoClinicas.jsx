import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { MESES_COMPLETO, buildAnosDisponiveis } from '@/lib/indicadores';
import DashboardPraticasMedicas from '@/pages/DashboardPraticasMedicas';

const ANOS = buildAnosDisponiveis();

export default function VisualizacaoClinicas() {
  const [ano, setAno] = useState(new Date().getFullYear());
  const [mes, setMes] = useState(new Date().getMonth() + 1);

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 bg-sidebar text-sidebar-foreground shadow-lg">
        <div className="max-w-screen-2xl mx-auto px-4">
          <div className="flex items-center justify-between h-14 gap-3 flex-wrap">
            <div className="flex items-center gap-3">
              <Link
                to="/"
                className="flex items-center gap-1.5 text-sm text-sidebar-foreground/70 hover:text-sidebar-foreground transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
                Início
              </Link>
              <span className="text-sidebar-foreground/20">|</span>
              <div>
                <p className="font-jakarta font-bold text-sm text-sidebar-foreground leading-none">
                  Gestão à Vista - Indicadores
                </p>
                <p className="text-xs text-sidebar-foreground/60 leading-none mt-0.5">
                  Visualização Pública · Clínicas
                </p>
              </div>
            </div>

            <div className="flex gap-2 flex-wrap">
              <Select value={String(mes)} onValueChange={(v) => setMes(Number(v))}>
                <SelectTrigger className="h-8 w-36 text-xs bg-sidebar-accent border-sidebar-border text-sidebar-foreground">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MESES_COMPLETO.map((nomeMes, idx) => (
                    <SelectItem key={idx + 1} value={String(idx + 1)}>
                      {nomeMes}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={String(ano)} onValueChange={(v) => setAno(Number(v))}>
                <SelectTrigger className="h-8 w-24 text-xs bg-sidebar-accent border-sidebar-border text-sidebar-foreground">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ANOS.map((anoItem) => (
                    <SelectItem key={anoItem} value={String(anoItem)}>
                      {anoItem}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      </header>

      <DashboardPraticasMedicas ano={ano} mes={mes} />
    </div>
  );
}
