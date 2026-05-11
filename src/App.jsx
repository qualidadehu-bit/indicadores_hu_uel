import { useState } from 'react';
import { Toaster } from '@/components/ui/toaster';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClientInstance } from '@/lib/query-client';
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import AuthenticatedShell from '@/components/AuthenticatedShell';

import Landing from '@/pages/Landing';
import Dashboard from '@/pages/Dashboard';
import Lancamento from '@/pages/Lancamento';
import Comparacao from '@/pages/Comparacao';
import VisaoExecutiva from '@/pages/VisaoExecutiva';
import Configuracao from '@/pages/Configuracao';
import VisualizacaoDashboard from '@/pages/VisualizacaoDashboard';

const AuthenticatedApp = () => {
  const { isLoadingAuth } = useAuth();
  const [ano, setAno] = useState(new Date().getFullYear());
  const [mes, setMes] = useState(new Date().getMonth() + 1);

  if (isLoadingAuth) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-primary/20 border-t-primary rounded-full animate-spin"></div>
          <p className="text-sm text-muted-foreground">Carregando...</p>
        </div>
      </div>
    );
  }

  const pageProps = { ano, mes };
  const shellProps = {
    ano,
    mes,
    onAnoChange: setAno,
    onMesChange: setMes,
  };

  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/visualizacao" element={<VisualizacaoDashboard />} />

      <Route
        path="/dashboard"
        element={
          <AuthenticatedShell {...shellProps}>
            <Dashboard {...pageProps} />
          </AuthenticatedShell>
        }
      />
      <Route
        path="/lancamento"
        element={
          <AuthenticatedShell {...shellProps}>
            <Lancamento {...pageProps} />
          </AuthenticatedShell>
        }
      />
      <Route
        path="/comparacao"
        element={
          <AuthenticatedShell {...shellProps}>
            <Comparacao {...pageProps} />
          </AuthenticatedShell>
        }
      />
      <Route
        path="/visao-executiva"
        element={
          <AuthenticatedShell {...shellProps}>
            <VisaoExecutiva {...pageProps} />
          </AuthenticatedShell>
        }
      />
      <Route
        path="/configuracao"
        element={
          <AuthenticatedShell {...shellProps}>
            <Configuracao />
          </AuthenticatedShell>
        }
      />
      <Route
        path="*"
        element={
          <AuthenticatedShell {...shellProps}>
            <PageNotFound />
          </AuthenticatedShell>
        }
      />
    </Routes>
  );
};

function App() {
  return (
    <AuthProvider>
      <QueryClientProvider client={queryClientInstance}>
        <Router>
          <AuthenticatedApp />
        </Router>
        <Toaster />
      </QueryClientProvider>
    </AuthProvider>
  );
}

export default App;
