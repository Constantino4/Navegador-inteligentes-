import React, { useState } from 'react';
import { Mail, Smartphone, ShieldCheck, KeyRound, Globe, X } from 'lucide-react';
import { VerificationChallenge } from '../types/agent';

interface VerificationModalProps {
  challenge: VerificationChallenge | undefined;
  onSubmitCode: (code: string) => void;
  onOpenBrowser: () => void;
  onDismiss: () => void;
}

export const VerificationModal: React.FC<VerificationModalProps> = ({
  challenge,
  onSubmitCode,
  onOpenBrowser,
  onDismiss,
}) => {
  const [code, setCode] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!challenge || !challenge.detected) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim() || isSubmitting) return;
    setIsSubmitting(true);
    onSubmitCode(code.trim());
    setTimeout(() => {
      setIsSubmitting(false);
      setCode('');
    }, 1000);
  };

  const isEmail = challenge.type === 'email';
  const isSms = challenge.type === 'sms';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-[#1f2023] border border-neutral-700 w-full max-w-md rounded-2xl p-6 shadow-2xl text-neutral-100 space-y-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
              {isEmail ? (
                <Mail className="w-5 h-5" />
              ) : isSms ? (
                <Smartphone className="w-5 h-5" />
              ) : (
                <KeyRound className="w-5 h-5" />
              )}
            </div>
            <div>
              <h3 className="font-semibold text-white text-base">
                Código de Confirmação Requerido
              </h3>
              <p className="text-xs text-neutral-400">
                {isEmail
                  ? 'Verificação por Email'
                  : isSms
                  ? 'Verificação por SMS'
                  : 'Autenticação em Dois Passos'}
              </p>
            </div>
          </div>
          <button
            onClick={onDismiss}
            className="p-1 rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors"
            title="Fechar"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-3.5 rounded-xl bg-neutral-900/80 border border-neutral-800 text-xs text-neutral-300 leading-relaxed">
          {challenge.prompt ||
            'A plataforma solicitou um código de confirmação para concluir o processo.'}
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-neutral-400 mb-1.5">
              Insira o código recebido:
            </label>
            <input
              type="text"
              autoFocus
              value={code}
              onChange={e => setCode(e.target.value)}
              placeholder="Ex: 123456"
              className="w-full bg-[#121316] border border-neutral-700 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 rounded-xl px-4 py-3 text-lg font-mono text-center tracking-widest text-white outline-none transition-all placeholder:text-neutral-600 placeholder:text-sm placeholder:font-sans placeholder:tracking-normal"
            />
          </div>

          <div className="flex flex-col sm:flex-row items-center gap-2 pt-2">
            <button
              type="submit"
              disabled={!code.trim() || isSubmitting}
              className="w-full sm:flex-1 py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:hover:bg-emerald-600 text-white font-medium text-sm transition-colors flex items-center justify-center gap-2 shadow-sm"
            >
              <ShieldCheck className="w-4 h-4" />
              <span>{isSubmitting ? 'A enviar...' : 'Confirmar e Enviar'}</span>
            </button>

            <button
              type="button"
              onClick={onOpenBrowser}
              className="w-full sm:w-auto py-2.5 px-3.5 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-xs font-medium transition-colors flex items-center justify-center gap-1.5 border border-neutral-700"
            >
              <Globe className="w-3.5 h-3.5 text-emerald-400" />
              <span>Visualizar</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
