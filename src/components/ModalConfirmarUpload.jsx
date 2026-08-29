// src/components/ModalConfirmarUpload.jsx
//
// Confirmação obrigatória ao adicionar um arquivo COMPLEMENTAR a um caso já
// existente (reanálise). Documentos antigos nunca podem ser removidos/
// substituídos (proteção antifraude) — então, uma vez confirmado aqui, o
// arquivo passa a fazer parte definitiva do histórico do caso.

import React from 'react';
import { AlertTriangle, X, Paperclip } from 'lucide-react';

/**
 * @param {{
 *   aberto: boolean,
 *   arquivos: Array<{ nome: string }>,
 *   onConfirmar: () => void,
 *   onCancelar: () => void,
 * }} props
 */
export default function ModalConfirmarUpload({ aberto, arquivos = [], onConfirmar, onCancelar }) {
  if (!aberto) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onCancelar} />
      <div className="relative w-full max-w-md rounded-2xl border border-line bg-ink-800/95 p-6 shadow-2xl">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="grid h-11 w-11 flex-shrink-0 place-items-center rounded-xl bg-amber-500/15">
              <AlertTriangle size={20} className="text-amber-400" />
            </div>
            <h3 className="text-base font-bold text-parchment">Adicionar arquivo complementar</h3>
          </div>
          <button
            type="button"
            onClick={onCancelar}
            className="rounded-lg p-1 text-parchment/40 transition-colors hover:text-parchment/70"
            aria-label="Fechar"
          >
            <X size={18} />
          </button>
        </div>

        <p className="mb-3 text-sm leading-relaxed text-parchment">
          Você tem certeza que vai adicionar esse arquivo a análise?
        </p>

        {arquivos.length > 0 && (
          <ul className="mb-4 space-y-1.5">
            {arquivos.map((a, i) => (
              <li key={i} className="flex items-center gap-2 rounded-lg border border-line bg-ink-900/60 px-3 py-2 text-xs text-parchment/70">
                <Paperclip size={12} className="flex-shrink-0 text-parchment/40" />
                <span className="truncate">{a.nome}</span>
              </li>
            ))}
          </ul>
        )}

        <div className="mb-6 flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3">
          <AlertTriangle size={14} className="mt-0.5 flex-shrink-0 text-amber-400" />
          <p className="text-xs leading-relaxed text-amber-200/90">
            O envio de um documento incorreto pode comprometer a fluidez da análise e
            resultar no desperdício irreversível do crédito recém-utilizado. Documentos já
            anexados a este caso não podem ser removidos ou substituídos — confira o arquivo
            com atenção antes de confirmar.
          </p>
        </div>

        <div className="flex gap-3">
          <button
            type="button"
            onClick={onCancelar}
            className="flex-1 rounded-xl bg-ink-700 py-2.5 text-sm font-medium text-parchment/70 transition-colors hover:bg-ink-600"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={onConfirmar}
            className="flex-1 rounded-xl bg-gold py-2.5 text-sm font-semibold text-ink transition-colors hover:bg-gold-soft"
          >
            Sim, adicionar arquivo
          </button>
        </div>
      </div>
    </div>
  );
}
