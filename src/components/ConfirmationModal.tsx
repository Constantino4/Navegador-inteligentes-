import React from 'react';
import { ShieldAlert, AlertTriangle, CheckCircle, XCircle } from 'lucide-react';
import { SensitiveActionRequest } from '../types/agent';

interface ConfirmationModalProps {
  request: SensitiveActionRequest | null;
  onConfirm: (approved: boolean) => void;
}

export const ConfirmationModal: React.FC<ConfirmationModalProps> = ({ request, onConfirm }) => {
  if (!request || request.status !== 'PENDING') return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
      <div className="bg-slate-900 border-2 border-amber-500/80 rounded-2xl max-w-md w-full p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-200">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2.5 rounded-xl bg-amber-950/80 border border-amber-600/80 text-amber-400">
            <ShieldAlert className="w-6 h-6 animate-pulse" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white uppercase tracking-wider font-mono">
              Confirmação de Segurança
            </h3>
            <span className="text-[10px] text-amber-400 font-mono font-medium">
              Ação Sensível Detectada ({request.actionType})
            </span>
          </div>
        </div>

        <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 mb-4 text-xs font-sans text-slate-200 leading-relaxed">
          <p className="mb-2 font-medium text-white">{request.description}</p>
          <div className="flex items-center gap-2 text-[10px] font-mono text-slate-400">
            <span>Nível de Risco:</span>
            <span className={`px-2 py-0.5 rounded font-bold ${
              request.riskLevel === 'HIGH' ? 'bg-rose-950 text-rose-400 border border-rose-800' : 'bg-amber-950 text-amber-400 border border-amber-800'
            }`}>
              {request.riskLevel}
            </span>
          </div>
        </div>

        <p className="text-[11px] text-slate-400 mb-5 leading-normal">
          O assistente solicitou a tua autorização expressa antes de prosseguir com esta ação. Desejas permitir ou recusar?
        </p>

        <div className="flex items-center justify-end gap-3">
          <button
            onClick={() => onConfirm(false)}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-semibold transition-colors"
          >
            <XCircle className="w-4 h-4 text-rose-400" />
            Recusar Ação
          </button>
          <button
            onClick={() => onConfirm(true)}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-xs font-semibold shadow-lg shadow-amber-950 transition-colors"
          >
            <CheckCircle className="w-4 h-4" />
            Aprovar e Continuar
          </button>
        </div>
      </div>
    </div>
  );
};
