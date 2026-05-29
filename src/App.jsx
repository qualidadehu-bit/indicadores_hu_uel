import { useState } from 'react';
import { Toaster } from '@/components/ui/toaster';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClientInstance } from '@/lib/query-client';
import { BrowserRouter as Router, Navigate, Route, Routes } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import AuthenticatedShell from '@/components/AuthenticatedShell';

import Landing from '@/pages/Landing';
import Dashboard from '@/pages/Dashboard';
import DashboardComissoes from '@/pages/DashboardComissoes';
import DashboardPraticasMedicas from '@/pages/DashboardPraticasMedicas';
import Lancamento from '@/pages/Lancamento';
import Comparacao from '@/pages/Comparacao';
import VisaoExecutiva from '@/pages/VisaoExecutiva';
import Configuracao from '@/pages/Configuracao';
import VisualizacaoDashboard from '@/pages/VisualizacaoDashboard';
import VisualizacaoComissoes from '@/pages/VisualizacaoComissoes';
import VisualizacaoClinicas from '@/pages/VisualizacaoClinicas';
import { ENTITY_TYPE_CLINICA, ENTITY_TYPE_COMISSAO, ENTITY_TYPE_SETOR } from '@/lib/entityType';
import { DASHBOARD_SCOPE_COMISSOES, DASHBOARD_SCOPE_LEGACY, DASHBOARD_SCOPE_PRATICAS_MEDICAS } from '@/lib/dashboardScope';

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
      <Route path="/visualizacao/comissoes" element={<VisualizacaoComissoes />} />
      <Route path="/visualizacao/clinicas" element={<VisualizacaoClinicas />} />
      <Route
        path="/dashboard-comissoes"
        element={
          <AuthenticatedShell {...shellProps}>
            <DashboardComissoes {...pageProps} />
          </AuthenticatedShell>
        }
      />
      <Route
        path="/dashboard-praticas-medicas"
        element={
          <AuthenticatedShell {...shellProps}>
            <DashboardPraticasMedicas {...pageProps} />
          </AuthenticatedShell>
        }
      />

      <Route
        path="/dashboard"
        element={
          <AuthenticatedShell {...shellProps}>
            <Dashboard {...pageProps} />
          </AuthenticatedShell>
        }
      />
      <Route
        path="/lancamento-setores"
        element={
          <AuthenticatedShell {...shellProps}>
            <Lancamento
              {...pageProps}
              entityType={ENTITY_TYPE_SETOR}
              dashboardScope={DASHBOARD_SCOPE_LEGACY}
            />
          </AuthenticatedShell>
        }
      />
      <Route
        path="/lancamento-comissoes"
        element={
          <AuthenticatedShell {...shellProps}>
            <Lancamento
              {...pageProps}
              entityType={ENTITY_TYPE_COMISSAO}
              dashboardScope={DASHBOARD_SCOPE_COMISSOES}
            />
          </AuthenticatedShell>
        }
      />
      <Route
        path="/lancamento-praticas-medicas"
        element={
          <AuthenticatedShell {...shellProps}>
            <Lancamento
              {...pageProps}
              entityType={ENTITY_TYPE_CLINICA}
              dashboardScope={DASHBOARD_SCOPE_PRATICAS_MEDICAS}
            />
          </AuthenticatedShell>
        }
      />
      <Route path="/lancamento" element={<Navigate to="/lancamento-setores" replace />} />
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
