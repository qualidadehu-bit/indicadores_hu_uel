import { Navigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import AppHeader from '@/components/AppHeader';
import AppSidebar from '@/components/AppSidebar';
import { useAuth } from '@/lib/AuthContext';

export default function AuthenticatedShell({ ano, mes, onAnoChange, onMesChange, children }) {
  const { isAuthenticated } = useAuth();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.localStorage.getItem('layout.sidebarCollapsed') === '1';
  });
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem('layout.sidebarCollapsed', sidebarCollapsed ? '1' : '0');
  }, [sidebarCollapsed]);
  if (!isAuthenticated) {
    return <Navigate to="/" replace />;
  }
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <AppHeader
        ano={ano}
        mes={mes}
        onAnoChange={onAnoChange}
        onMesChange={onMesChange}
        showSidebarControls
        isSidebarCollapsed={sidebarCollapsed}
        onSidebarToggle={() => setSidebarCollapsed((prev) => !prev)}
        onMobileNavOpen={() => setMobileNavOpen(true)}
      />
      <div className="flex-1 flex min-h-0">
        <AppSidebar
          collapsed={sidebarCollapsed}
          onToggleCollapsed={() => setSidebarCollapsed((prev) => !prev)}
          mobileOpen={mobileNavOpen}
          onMobileOpenChange={setMobileNavOpen}
        />
        <main className="flex-1 min-w-0">{children}</main>
      </div>
    </div>
  );
}
