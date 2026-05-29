import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AlertCircle } from 'lucide-react';

export default function ResetPasswordModal({ open, onClose, onReset, onRequestResetToken }) {
  const [pin, setPin] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState('pin'); // 'pin' ou 'password'

  const handleSubmitPin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      await onRequestResetToken(pin);
      setStep('password');
      setPin('');
    } catch (err) {
      setError(err.message || 'PIN incorreto');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmitPassword = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await onReset(newPassword);
      handleClose();
    } catch (err) {
      setError(err.message || 'Erro ao redefinir senha');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setPin('');
    setNewPassword('');
    setError('');
    setStep('pin');
    onClose();
  };

  const handleOpenChange = (v) => {
    if (!v) handleClose();
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="font-jakarta text-lg font-bold">Redefinir Senha</DialogTitle>
          <p className="text-xs text-muted-foreground mt-1">
            {step === 'pin' ? 'Digite o PIN de segurança' : 'Crie uma nova senha'}
          </p>
        </DialogHeader>

        {step === 'pin' ? (
          <form onSubmit={handleSubmitPin} className="space-y-4 pt-4">
            {error && (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-red-50 border border-red-200">
                <AlertCircle className="w-4 h-4 text-red-600" />
                <span className="text-sm text-red-600">{error}</span>
              </div>
            )}

            <div>
              <Label htmlFor="pin" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                PIN de Segurança
              </Label>
              <Input
                id="pin"
                type="password"
                placeholder="••••"
                value={pin}
                onChange={e => setPin(e.target.value)}
                disabled={loading}
                className="mt-1"
                autoFocus
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={handleClose}
                disabled={loading}
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={loading || !pin.trim()}
                className="bg-primary hover:bg-primary/90"
              >
                {loading ? 'Validando...' : 'Continuar'}
              </Button>
            </div>
          </form>
        ) : (
          <form onSubmit={handleSubmitPassword} className="space-y-4 pt-4">
            {error && (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-red-50 border border-red-200">
                <AlertCircle className="w-4 h-4 text-red-600" />
                <span className="text-sm text-red-600">{error}</span>
              </div>
            )}

            <div>
              <Label htmlFor="newPassword" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Nova Senha
              </Label>
              <Input
                id="newPassword"
                type="password"
                placeholder="••••••••"
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                disabled={loading}
                className="mt-1"
                autoFocus
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setStep('pin');
                  setNewPassword('');
                  setError('');
                }}
                disabled={loading}
              >
                Voltar
              </Button>
              <Button
                type="submit"
                disabled={loading || !newPassword.trim()}
                className="bg-primary hover:bg-primary/90"
              >
                {loading ? 'Redefinindo...' : 'Redefinir'}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}