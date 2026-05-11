import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Eye, EyeOff, Loader2, Lock } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';

export default function LoginModal({ open, onClose, onLogin, title, tipo, subtitle, onForgotPassword }) {
  const { toast } = useToast();
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleReset = () => {
    setLogin('');
    setPassword('');
    setShowPassword(false);
    setError('');
  };

  const handleOpenChange = (v) => {
    if (!v) {
      handleReset();
      onClose();
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (tipo === 'escritorio') {
      if (!password) {
        setError('Preencha a senha');
        return;
      }
    } else {
      if (!login || !password) {
        setError('Preencha todos os campos');
        return;
      }
    }

    setError('');
    setLoading(true);
    try {
      await onLogin(login, password, tipo);
      handleReset();
    } catch (err) {
      setError(err.response?.data?.error || 'Erro ao fazer login');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="font-jakarta text-lg font-bold">{title}</DialogTitle>
          {subtitle && <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>}
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 pt-4">
          {tipo === 'escritorio' ? (
            <>
              <div>
                <Label className="text-xs font-semibold">Senha</Label>
                <Input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Digite a senha"
                  className="mt-1"
                  disabled={loading}
                />
              </div>
            </>
          ) : (
            <>
              <div>
                <Label className="text-xs font-semibold">Login</Label>
                <Input
                  type="text"
                  value={login}
                  onChange={(e) => setLogin(e.target.value)}
                  placeholder="Digite seu login"
                  className="mt-1"
                  disabled={loading}
                  autoFocus
                />
              </div>
              <div>
                <Label className="text-xs font-semibold">Senha</Label>
                <div className="relative">
                  <Input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Digite sua senha"
                    className="mt-1 pr-10"
                    disabled={loading}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 transform -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            </>
          )}

          {error && (
            <div className="text-xs text-destructive bg-destructive/10 border border-destructive/20 rounded px-3 py-2">
              {error}
            </div>
          )}

          <div className="flex flex-col gap-2 pt-2">
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => handleOpenChange(false)}
                disabled={loading}
                className="flex-1"
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={loading} className="flex-1 gap-2">
                {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                Entrar
              </Button>
            </div>
            {onForgotPassword && (
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  handleOpenChange(false);
                  onForgotPassword();
                }}
                disabled={loading}
                className="text-xs gap-1 h-8"
              >
                <Lock className="w-3 h-3" />
                Esqueci a senha
              </Button>
            )}
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}