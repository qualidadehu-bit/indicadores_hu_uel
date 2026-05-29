import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ClipboardList, BarChart2, ChevronRight, Lock, Users } from 'lucide-react';
import { api } from '@/api/apiClient';
import LoginModal from '@/components/LoginModal';
import ResetPasswordModal from '@/components/ResetPasswordModal';
import { useToast } from '@/components/ui/use-toast';
import { setStoredUserSession } from '@/lib/sessionStorage';

/**
 * Corpo JSON retornado por `api.functions.invoke('autenticar', …)` (worker → GAS).
 * @typedef {{ success: boolean; message?: string; conta?: Record<string, unknown> }} AutenticarInvokeData
 */

/** Imagem local exibida à esquerda da tela inicial. */
const HU_IMAGE = '/images/hu-cover.png';
const LOGO_IMAGE = '/images/assinatura.png';

export default function Landing() {
  const { toast } = useToast();
  const [loginModal, setLoginModal] = useState(null); // null | 'escritorio' | 'gestor'
  const [resetModal, setResetModal] = useState(false);
  const [resetToken, setResetToken] = useState('');
  const [postLoginRedirect, setPostLoginRedirect] = useState('/dashboard');
  const [openGroup, setOpenGroup] = useState(null); // null | 'dashboard' | 'equipe'

  const openLoginModal = (tipo, redirectTo = '/dashboard') => {
    setPostLoginRedirect(redirectTo);
    setLoginModal(tipo);
  };

  const toggleGroup = (groupKey) => {
    setOpenGroup((prev) => (prev === groupKey ? null : groupKey));
  };

  const handleLogin = async (login, password, tipo) => {
    try {
      const response = await api.functions.invoke('autenticar', {
        login: tipo === 'escritorio' ? 'admin' : login,
        password,
        tipo,
        action: 'login',
      });

      /** @type {AutenticarInvokeData} */
      const data = /** @type {AutenticarInvokeData} */ (response.data);

      if (data.success) {
        setStoredUserSession({
          ...data.conta,
          tipo,
        });
        toast({ title: 'Login realizado com sucesso!' });
        window.location.href = postLoginRedirect || '/dashboard';
      } else {
        toast({
          title: 'Login falhou',
          description: data.message || 'Verifique suas credenciais.',
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

  const handleRequestResetToken = async (pin) => {
    const response = await api.functions.invoke('autenticar', {
      action: 'request_reset_token',
      pin,
    });
    /** @type {{ success?: boolean, message?: string, reset_token?: string }} */
    const payload = /** @type {any} */ (response.data || {});
    if (!payload.success || !payload.reset_token) {
      throw new Error(payload.message || 'PIN inválido.');
    }
    setResetToken(String(payload.reset_token));
  };

  const handleReset = async (newPassword) => {
    try {
      const response = await api.functions.invoke('autenticar', {
        newPassword,
        action: 'reset',
        reset_token: resetToken,
      });

      /** @type {AutenticarInvokeData} */
      const resetData = /** @type {AutenticarInvokeData} */ (response.data);

      if (resetData.success) {
        toast({ title: 'Senha redefinida com sucesso!' });
        setResetModal(false);
        setResetToken('');
      } else {
        toast({
          title: 'Não foi possível redefinir',
          description: resetData.message || '',
          variant: 'destructive',
        });
      }
    } catch (e) {
      toast({
        title: 'Erro',
        description: e.message || 'Falha ao conectar ao servidor.',
        variant: 'destructive',
      });
      throw e;
    }
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-gray-50 flex flex-col md:flex-row">
      {/* LEFT — Hospital image with overlay */}
      <div className="relative md:w-1/2 min-h-[48vh] md:min-h-screen flex items-end">
        <img
          src={HU_IMAGE}
          alt="Hospital Universitário UEL"
          className="absolute inset-0 w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/35 to-transparent" />

        {/* Left content */}
        <div className="relative z-10 w-full px-9 pb-10 md:px-12 md:pb-14 text-white">
          <div className="mb-7">
            <div className="w-12 h-12 rounded-2xl bg-white/10 backdrop-blur-sm border border-white/10 flex items-center justify-center mb-5">
              <ClipboardList className="w-6 h-6 text-white" />
            </div>
            <h1 className="font-jakarta font-extrabold text-4xl md:text-[42px] leading-tight mb-2 drop-shadow-sm">
              Gestão à Vista
            </h1>
            <p className="text-base md:text-lg font-semibold text-white/90 leading-snug">
              Indicadores Hospitalares
            </p>
            <p className="mt-5 text-xs md:text-sm text-white/75 max-w-xs leading-relaxed">
              Sistema integrado de acompanhamento de qualidade e segurança do paciente
            </p>
          </div>

          <div className="border-t border-white/20 pt-5 max-w-sm">
            <p className="text-xs font-semibold uppercase tracking-widest text-white/50 mb-1">
              Instituição
            </p>
            <p className="text-sm text-white/85 font-medium leading-snug">
              Hospital Universitário da<br />Universidade de Londrina
            </p>
          </div>
        </div>
      </div>

      {/* RIGHT — Access cards */}
      <div className="relative md:w-1/2 min-h-[52vh] md:min-h-screen flex flex-col items-center justify-center bg-gray-50 px-8 py-16 md:py-0">
        <div className="absolute top-4 right-4 md:top-6 md:right-8 w-44 md:w-56">
          <img
            src={LOGO_IMAGE}
            alt="Escritório de Qualidade"
            className="w-full h-auto object-contain"
          />
        </div>

        <div className="w-full max-w-[360px] mt-12 md:mt-16">
          <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-muted-foreground text-center mb-7">
            Selecione uma área
          </p>

          {/* Card principal — Dashboard */}
          <button
            onClick={() => toggleGroup('dashboard')}
            className="group flex items-center gap-4 w-full bg-white rounded-2xl border border-gray-200 shadow-sm hover:shadow-md hover:border-primary/30 transition-all duration-200 px-5 py-5 mb-4 cursor-pointer"
          >
            <div className="w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0 group-hover:bg-primary/15 transition-colors">
              <BarChart2 className="w-5 h-5 text-primary" />
            </div>
            <div className="flex-1 text-left">
              <p className="font-jakarta font-bold text-foreground text-[15px]">Dashboard</p>
              <p className="text-sm text-muted-foreground mt-0.5">Indicadores assistenciais e comissões</p>
            </div>
            <ChevronRight
              className={`w-4 h-4 text-muted-foreground group-hover:text-primary transition-all duration-300 ${
                openGroup === 'dashboard' ? 'rotate-90 text-primary' : ''
              }`}
            />
          </button>
          <div
            className={`mb-4 overflow-hidden transition-all duration-300 ease-in-out ${
              openGroup === 'dashboard' ? 'max-h-[320px] opacity-100' : 'max-h-0 opacity-0'
            }`}
          >
            <div className="space-y-3 rounded-2xl border border-primary/20 bg-primary/5 p-3">
              <Link
                to="/visualizacao"
                className="group flex items-center gap-3 w-full bg-white rounded-xl border border-gray-200 shadow-sm hover:shadow-md hover:border-blue-300 transition-all duration-200 px-4 py-4"
              >
                <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0 group-hover:bg-blue-100 transition-colors">
                  <BarChart2 className="w-5 h-5 text-blue-600" />
                </div>
                <div className="flex-1 text-left">
                  <p className="font-jakarta font-bold text-foreground text-[14px]">Dashboard Assistencial</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Visualização dos indicadores — público</p>
                </div>
                <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-blue-500 transition-colors" />
              </Link>

              <Link
                to="/visualizacao/comissoes"
                className="group flex items-center gap-3 w-full bg-white rounded-xl border border-gray-200 shadow-sm hover:shadow-md hover:border-violet-300 transition-all duration-200 px-4 py-4"
              >
                <div className="w-10 h-10 rounded-lg bg-violet-50 flex items-center justify-center flex-shrink-0 group-hover:bg-violet-100 transition-colors">
                  <Users className="w-5 h-5 text-violet-600" />
                </div>
                <div className="flex-1 text-left">
                  <p className="font-jakarta font-bold text-foreground text-[14px]">Dashboard Comissões</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Acesso por perfil e escopo de permissão</p>
                </div>
                <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-violet-500 transition-colors" />
              </Link>
              <Link
                to="/visualizacao/clinicas"
                className="group flex items-center gap-3 w-full bg-white rounded-xl border border-gray-200 shadow-sm hover:shadow-md hover:border-emerald-300 transition-all duration-200 px-4 py-4"
              >
                <div className="w-10 h-10 rounded-lg bg-emerald-50 flex items-center justify-center flex-shrink-0 group-hover:bg-emerald-100 transition-colors">
                  <Users className="w-5 h-5 text-emerald-600" />
                </div>
                <div className="flex-1 text-left">
                  <p className="font-jakarta font-bold text-foreground text-[14px]">Gestão de Práticas Médicas</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Dashboard de clínicas por perfil e escopo</p>
                </div>
                <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-emerald-500 transition-colors" />
              </Link>
            </div>
          </div>

          {/* Card principal — Equipe */}
          <button
            onClick={() => toggleGroup('equipe')}
            className="group flex items-center gap-4 w-full bg-white rounded-2xl border border-gray-200 shadow-sm hover:shadow-md hover:border-orange-300 transition-all duration-200 px-5 py-5 mb-4 cursor-pointer"
          >
            <div className="w-11 h-11 rounded-xl bg-orange-50 flex items-center justify-center flex-shrink-0 group-hover:bg-orange-100 transition-colors">
              <Users className="w-5 h-5 text-orange-600" />
            </div>
            <div className="flex-1 text-left">
              <p className="font-jakarta font-bold text-foreground text-[15px]">Equipe</p>
              <p className="text-sm text-muted-foreground mt-0.5">Gestão de perfis e acessos internos</p>
            </div>
            <ChevronRight
              className={`w-4 h-4 text-muted-foreground group-hover:text-orange-500 transition-all duration-300 ${
                openGroup === 'equipe' ? 'rotate-90 text-orange-500' : ''
              }`}
            />
          </button>
          <div
            className={`overflow-hidden transition-all duration-300 ease-in-out ${
              openGroup === 'equipe' ? 'max-h-[320px] opacity-100' : 'max-h-0 opacity-0'
            }`}
          >
            <div className="space-y-3 rounded-2xl border border-orange-200/70 bg-orange-50/50 p-3">
              <button
                onClick={() => openLoginModal('escritorio', '/dashboard')}
                className="group flex items-center gap-3 w-full bg-white rounded-xl border border-gray-200 shadow-sm hover:shadow-md hover:border-primary/30 transition-all duration-200 px-4 py-4 cursor-pointer"
              >
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0 group-hover:bg-primary/15 transition-colors">
                  <ClipboardList className="w-5 h-5 text-primary" />
                </div>
                <div className="flex-1 text-left">
                  <p className="font-jakarta font-bold text-foreground text-[14px]">Escritório da Qualidade</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Acesso completo — gestor geral</p>
                </div>
                <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
              </button>

              <button
                onClick={() => openLoginModal('gestor', '/dashboard')}
                className="group flex items-center gap-3 w-full bg-white rounded-xl border border-gray-200 shadow-sm hover:shadow-md hover:border-orange-300 transition-all duration-200 px-4 py-4 cursor-pointer"
              >
                <div className="w-10 h-10 rounded-lg bg-orange-50 flex items-center justify-center flex-shrink-0 group-hover:bg-orange-100 transition-colors">
                  <Lock className="w-5 h-5 text-orange-600" />
                </div>
                <div className="flex-1 text-left">
                  <p className="font-jakarta font-bold text-foreground text-[14px]">Membros</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Acesso restrito por divisão</p>
                </div>
                <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-orange-500 transition-colors" />
              </button>
            </div>
          </div>
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
        onClose={() => {
          setResetModal(false);
          setResetToken('');
        }}
        onRequestResetToken={handleRequestResetToken}
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