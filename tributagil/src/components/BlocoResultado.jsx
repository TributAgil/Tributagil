import React from 'react';
import { CheckCircle2, AlertCircle } from 'lucide-react';

export function BlocoResultado({ resultado }) {
  if (!resultado) return null;

  return (
    <div className={`mt-8 p-6 rounded-2xl border ${resultado.sucesso ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'}`}>
      <div className="flex items-center gap-3 mb-4">
        {resultado.sucesso ? <CheckCircle2 size={24} className="text-emerald-600" /> : <AlertCircle size={24} className="text-red-600" />}
        <h3 className={`text-lg font-semibold ${resultado.sucesso ? 'text-emerald-800' : 'text-red-800'}`}>
          {resultado.mensagem}
        </h3>
      </div>
      {resultado.sucesso && resultado.payload && (
        <div className="bg-white rounded-xl p-4 border border-emerald-100">
          <p className="text-xs font-mono text-slate-500 mb-2">PAYLOAD ENVIADO (preview):</p>
          <pre className="text-xs text-slate-600 overflow-x-auto whitespace-pre-wrap">
            {JSON.stringify(resultado.payload, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}