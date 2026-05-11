import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ClipboardList, BarChart2, ChevronRight, Lock } from 'lucide-react';
import { api } from '@/api/apiClient';
import LoginModal from '@/components/LoginModal';
import ResetPasswordModal from '@/components/ResetPasswordModal';
import { useToast } from '@/components/ui/use-toast';

/** Imagens locais — substitua por hu.jpg / assinatura.png se preferir (ver README). */
const HU_IMAGE = '/images/hu-cover.svg';

export default function Landing() {
  const { toast } = useToast();
  const [loginModal, setLoginModal] = useState(null); // null | 'escritorio' | 'gestor'
  const [resetModal, setResetModal] = useState(false);

  const handleLogin = async (login, password, tipo) => {
    try {
      const response = await api.functions.invoke('autenticar', {
        login: tipo === 'escritorio' ? 'admin' : login,
        password,
        tipo,
        action: 'login',
      });

      if (response.data.success) {
        localStorage.setItem(
          'userSession',
          JSON.stringify({
            ...response.data.conta,
            tipo,
          })
        );
        toast({ title: 'Login realizado com sucesso!' });
        window.location.href = '/dashboard';
      } else {
        toast({
          title: 'Login falhou',
          description: response.data.message || 'Verifique suas credenciais.',
          variant: 'destructive',
        });
      }
    } catch (e) {
      toast({
        title: 'Erro',
        description: e.message || 'Falha ao conectar ao servidor.',
        variant: 'destructive',
      });
    }
  };

  const handleReset = async (newPassword) => {
    try {
      const response = await api.functions.invoke('autenticar', {
        newPassword,
        action: 'reset',
      });

      if (response.data.success) {
        toast({ title: 'Senha redefinida com sucesso!' });
        setResetModal(false);
      } else {
        toast({
          title: 'Não foi possível redefinir',
          description: response.data.message || '',
          variant: 'destructive',
        });
      }
    } catch (e) {
      toast({
        title: 'Erro',
        description: e.message || 'Falha ao conectar ao servidor.',
        variant: 'destructive',
      });
    }
  };

  return (
    <div className="min-h-screen flex flex-col md:flex-row">
      {/* Logo — canto superior direito */}
      <div className="absolute top-4 right-4 z-20 max-w-[180px]">
        <img
          src="/images/assinatura.svg"
          alt="Escritório de Qualidade"
          className="w-full h-auto object-contain"
        />
      </div>

      {/* LEFT — Hospital image with overlay */}
      <div className="relative md:w-1/2 min-h-[40vh] md:min-h-screen flex items-end">
        <img
          src={HU_IMAGE}
          alt="Hospital Universitário UEL"
          className="absolute inset-0 w-full h-full object-cover"
        />

        {/* Left content */}
        <div className="relative z-10 p-8 md:p-12 text-white w-full pb-12 bg-black/40">
          <div className="mb-6">
            <div className="w-14 h-14 rounded-2xl bg-white/15 backdrop-blur-sm flex items-center justify-center mb-5">
              <ClipboardList className="w-7 h-7 text-white" />
            </div>
            <h1 className="font-jakarta font-extrabold text-4xl md:text-5xl leading-tight mb-3">
              Gestão à Vista
            </h1>
            <p className="text-lg md:text-xl font-semibold text-white/90 leading-snug">
              Indicadores Hospitalares
            </p>
            <p className="mt-4 text-sm text-white/70 max-w-xs leading-relaxed">
              Sistema integrado de acompanhamento de qualidade e segurança do paciente
            </p>
          </div>

          <div className="border-t border-white/20 pt-5 mt-2">
            <p className="text-xs font-semibold uppercase tracking-widest text-white/50 mb-1">
              Instituição
            </p>
            <p className="text-sm text-white/80 font-medium leading-snug">
              Hospital Universitário da<br />Universidade de Londrina
            </p>
          </div>
        </div>
      </div>

      {/* RIGHT — Access cards */}
      <div className="md:w-1/2 flex flex-col items-center justify-center bg-gray-50 px-8 py-14 md:py-0">
        <div className="w-full max-w-sm">
          <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground text-center mb-8">
            Selecione seu acesso
          </p>

          {/* Card 1 — Escritório da Qualidade */}
          <button
            onClick={() => setLoginModal('escritorio')}
            className="group flex items-center gap-4 w-full bg-white rounded-2xl border border-border shadow-sm hover:shadow-md hover:border-primary/30 transition-all duration-200 px-5 py-5 mb-4 cursor-pointer"
          >
            <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0 group-hover:bg-primary/15 transition-colors">
              <ClipboardList className="w-6 h-6 text-primary" />
            </div>
            <div className="flex-1 text-left">
              <p className="font-jakarta font-bold text-foreground text-base">Escritório da Qualidade</p>
              <p className="text-sm text-muted-foreground mt-0.5">Acesso completo — gestor geral</p>
            </div>
            <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
          </button>

          {/* Card 2 — Membros */}
          <button
            onClick={() => setLoginModal('gestor')}
            className="group flex items-center gap-4 w-full bg-white rounded-2xl border border-border shadow-sm hover:shadow-md hover:border-orange-300 transition-all duration-200 px-5 py-5 mb-4 cursor-pointer"
          >
            <div className="w-12 h-12 rounded-xl bg-orange-50 flex items-center justify-center flex-shrink-0 group-hover:bg-orange-100 transition-colors">
              <Lock className="w-6 h-6 text-orange-600" />
            </div>
            <div className="flex-1 text-left">
              <p className="font-jakarta font-bold text-foreground text-base">Membros</p>
              <p className="text-sm text-muted-foreground mt-0.5">Acesso restrito por divisão</p>
            </div>
            <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-orange-500 transition-colors" />
          </button>

          {/* Card 3 — Acesso ao Dashboard público */}
          <Link
            to="/visualizacao"
            className="group flex items-center gap-4 w-full bg-white rounded-2xl border border-border shadow-sm hover:shadow-md hover:border-blue-300 transition-all duration-200 px-5 py-5"
          >
            <div className="w-12 h-12 rounded-xl bg-blue-50 flex items-center justify-center flex-shrink-0 group-hover:bg-blue-100 transition-colors">
              <BarChart2 className="w-6 h-6 text-blue-600" />
            </div>
            <div className="flex-1 text-left">
              <p className="font-jakarta font-bold text-foreground text-base">Acesso ao Dashboard</p>
              <p className="text-sm text-muted-foreground mt-0.5">Visualização dos indicadores — público</p>
            </div>
            <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-blue-500 transition-colors" />
          </Link>
        </div>
      </div>

      {/* Login Modal */}
      <LoginModal
        open={!!loginModal}
        onClose={() => setLoginModal(null)}
        onLogin={async (login, password) => {
          await handleLogin(login, password, loginModal);
        }}
        tipo={loginModal}
        title={loginModal === 'escritorio' ? 'Escritório da Qualidade' : 'Membros'}
        subtitle={loginModal === 'escritorio' ? 'Digite apenas a senha' : 'Login e senha obrigatórios'}
        onForgotPassword={() => setResetModal(true)}
      />

      {/* Reset Password Modal */}
      <ResetPasswordModal
        open={resetModal}
        onClose={() => setResetModal(false)}
        onReset={handleReset}
      />

      {/* Botão flutuante para redefinir senha */}
      <button
        onClick={() => setResetModal(true)}
        className="fixed bottom-6 right-6 w-12 h-12 rounded-full bg-primary text-white shadow-lg hover:shadow-xl hover:scale-110 transition-all duration-200 flex items-center justify-center"
        title="Redefinir senha do escritório"
      >
        <Lock className="w-5 h-5" />
      </button>
    </div>
  );
}