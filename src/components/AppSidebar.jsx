import { Activity, ChevronLeft, ChevronRight } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useAuth } from '@/lib/AuthContext';
import { getVisibleNavItems } from '@/lib/appNavigation';

export default function AppSidebar({
  collapsed = false,
  onToggleCollapsed,
  mobileOpen = false,
  onMobileOpenChange,
}) {
  const { user } = useAuth();
  const location = useLocation();
  const navItems = getVisibleNavItems(user, false);

  const renderNav = (compact = false, onNavigate) => (
    <nav className="flex flex-col gap-1 px-2 py-3">
      {navItems.map(({ path, label, icon: Icon }) => (
        <Link
          key={path}
          to={path}
          onClick={onNavigate}
          className={cn(
            'flex items-center rounded-lg text-sm font-medium transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-primary',
            compact ? 'justify-center px-2 py-2.5' : 'gap-2 px-3 py-2',
            location.pathname === path
              ? 'bg-sidebar-primary/20 text-sidebar-primary'
              : 'text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent'
          )}
          title={compact ? label : undefined}
          aria-label={label}
        >
          <Icon className="w-4 h-4 shrink-0" />
          {!compact && <span className="truncate">{label}</span>}
        </Link>
      ))}
    </nav>
  );

  return (
    <>
      <aside
        className={cn(
          'hidden lg:flex h-[calc(100vh-4rem)] sticky top-16 bg-sidebar text-sidebar-foreground border-r border-sidebar-border/70 flex-col transition-all duration-200',
          collapsed ? 'w-[4.25rem]' : 'w-64'
        )}
      >
        <div className={cn('px-3 py-3 border-b border-sidebar-border/70', collapsed && 'px-2')}>
          <div className={cn('flex', collapsed ? 'justify-center' : 'justify-start')}>
            <div className="w-8 h-8 rounded-lg bg-sidebar-primary/20 flex items-center justify-center">
              <Activity className="w-5 h-5 text-sidebar-primary" />
            </div>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">{renderNav(collapsed)}</div>
        <div className="p-2 border-t border-sidebar-border/70">
          <Button
            type="button"
            variant="ghost"
            className={cn(
              'w-full text-sidebar-foreground hover:bg-sidebar-accent',
              collapsed ? 'px-0 justify-center' : 'justify-start'
            )}
            onClick={onToggleCollapsed}
            title={collapsed ? 'Expandir menu lateral' : 'Recolher menu lateral'}
          >
            {collapsed ? <ChevronRight className="w-4 h-4" /> : <><ChevronLeft className="w-4 h-4" /> Recolher menu</>}
          </Button>
        </div>
      </aside>

      <Sheet open={mobileOpen} onOpenChange={onMobileOpenChange}>
        <SheetContent side="left" className="p-0 w-[18rem] bg-sidebar text-sidebar-foreground border-sidebar-border/70">
          <div className="h-full flex flex-col">
            <div className="px-3 py-3 border-b border-sidebar-border/70">
              <div className="flex items-center">
                <div className="w-8 h-8 rounded-lg bg-sidebar-primary/20 flex items-center justify-center">
                  <Activity className="w-5 h-5 text-sidebar-primary" />
                </div>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto">{renderNav(false, () => onMobileOpenChange(false))}</div>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
