import { Navigate } from 'react-router-dom';
import AppHeader from '@/components/AppHeader';

export default function AuthenticatedShell({ ano, mes, onAnoChange, onMesChange, children }) {
  const raw = typeof window !== 'undefined' ? localStorage.getItem('userSession') : null;
  if (!raw) {
    return <Navigate to="/" replace />;
  }
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <AppHeader ano={ano} mes={mes} onAnoChange={onAnoChange} onMesChange={onMesChange} />
      <main className="flex-1">{children}</main>
    </div>
  );
}
