import { useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Activity, Menu, PanelLeft, X, LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { useAuth } from '@/lib/AuthContext';
import { buildAnosDisponiveis } from '@/lib/indicadores';
import { getVisibleNavItems } from '@/lib/appNavigation';
import { clearStoredUserSession } from '@/lib/sessionStorage';

const ANOS = buildAnosDisponiveis();
const MESES = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];

export default function AppHeader({
  ano,
  mes,
  onAnoChange,
  onMesChange,
  isPublic = false,
  showSidebarControls = false,
  isSidebarCollapsed = false,
  onSidebarToggle,
  onMobileNavOpen,
}) {
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const { user } = useAuth();
  const navItems = useMemo(() => getVisibleNavItems(user, isPublic), [user, isPublic]);

  return (
    <header className="sticky top-0 z-50 bg-sidebar/95 text-sidebar-foreground shadow-lg border-b border-sidebar-border/70 backdrop-blur supports-[backdrop-filter]:bg-sidebar/85">
      <div className="max-w-screen-2xl mx-auto px-4">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-sidebar-primary/20 flex items-center justify-center">
              <Activity className="w-5 h-5 text-sidebar-primary" />
            </div>
            <div>
              <p className="font-jakarta font-bold text-sm leading-none text-sidebar-foreground">Gestão à Vista</p>
              <p className="text-xs text-sidebar-foreground/60 leading-none mt-0.5">Indicadores Hospitalares</p>
            </div>
          </div>

          {/* Desktop Nav (public layout only) */}
          {isPublic && (
          <nav className="hidden lg:flex items-center gap-1">
            {navItems.map(({ path, label, icon: Icon }) => (
              <Link
                key={path}
                to={path}
                className={cn(
                  'flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-primary',
                  location.pathname === path
                    ? 'bg-sidebar-primary/20 text-sidebar-primary'
                    : 'text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent'
                )}
              >
                <Icon className="w-4 h-4" />
                {label}
              </Link>
            ))}
          </nav>
          )}

          {/* Controls */}
          <div className="flex items-center gap-2">
            {showSidebarControls && (
              <>
                <Button
                  variant="ghost"
                  size="icon"
                  className="hidden lg:flex text-sidebar-foreground hover:bg-sidebar-accent"
                  title={isSidebarCollapsed ? 'Expandir menu lateral' : 'Recolher menu lateral'}
                  onClick={onSidebarToggle}
                >
                  <PanelLeft className="w-4 h-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="lg:hidden text-sidebar-foreground hover:bg-sidebar-accent"
                  title="Abrir menu"
                  onClick={onMobileNavOpen}
                >
                  <Menu className="w-5 h-5" />
                </Button>
              </>
            )}
            <Select value={String(mes)} onValueChange={v => onMesChange(Number(v))}>
              <SelectTrigger className="h-8 w-20 text-xs bg-sidebar-accent border-sidebar-border text-sidebar-foreground">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MESES.map((m, i) => (
                  <SelectItem key={i + 1} value={String(i + 1)}>{m}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={String(ano)} onValueChange={v => onAnoChange(Number(v))}>
              <SelectTrigger className="h-8 w-24 text-xs bg-sidebar-accent border-sidebar-border text-sidebar-foreground">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ANOS.map(a => (
                  <SelectItem key={a} value={String(a)}>{a}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant="ghost"
              size="icon"
              className="text-sidebar-foreground hover:bg-sidebar-accent"
              title={isPublic ? 'Entrar' : 'Sair'}
              onClick={() => {
                if (!isPublic) clearStoredUserSession();
                window.location.href = '/';
              }}
            >
              <LogOut className="w-4 h-4" />
            </Button>
            {isPublic && (
              <Button
                variant="ghost"
                size="icon"
                className="lg:hidden text-sidebar-foreground hover:bg-sidebar-accent"
                onClick={() => setMobileOpen(!mobileOpen)}
              >
                {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
              </Button>
            )}
          </div>
        </div>

        {/* Mobile Nav */}
        {isPublic && mobileOpen && (
          <div className="lg:hidden pb-3 border-t border-sidebar-border pt-2 flex flex-col gap-1">
            {navItems.map(({ path, label, icon: Icon }) => (
              <Link
                key={path}
                to={path}
                onClick={() => setMobileOpen(false)}
                className={cn(
                  'flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-primary',
                  location.pathname === path
                    ? 'bg-sidebar-primary/20 text-sidebar-primary'
                    : 'text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent'
                )}
              >
                <Icon className="w-4 h-4" />
                {label}
              </Link>
            ))}
          </div>
        )}
      </div>
    </header>
  );
}