import AppHeader from '@/components/AppHeader';

export default function PublicAppShell({ ano, mes, onAnoChange, onMesChange, children }) {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <AppHeader
        ano={ano}
        mes={mes}
        onAnoChange={onAnoChange}
        onMesChange={onMesChange}
        isPublic
      />
      <main className="flex-1">{children}</main>
    </div>
  );
}
