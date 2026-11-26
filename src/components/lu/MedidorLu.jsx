// src/components/lu/MedidorLu.jsx
//
// Medidor dos créditos do Lu no dia (1.000.000 = uso completo; quem decide o limite é o servidor). Usado no editor da
// peça e na conversa da tela do resultado da análise.

import React from 'react';
import { formatarCreditos } from '../../lib/luPeca';

/** @param {{ consumo: { creditos: number, limite: number } | null, esgotado?: boolean, compacto?: boolean }} props */
export default function MedidorLu({ consumo, esgotado = false, compacto = false }) {
  if (!consumo) return null;
  const usado = Math.min(1, consumo.creditos / consumo.limite);
  const restante = Math.max(0, consumo.limite - consumo.creditos);
  return (
    <div className={compacto ? 'w-40' : 'mb-2'} title="Créditos informativos do Lu: 1.000.000 por dia é o uso completo. Voltam à meia-noite (Brasília).">
      <div className="flex items-baseline justify-between gap-2 text-[10px] text-neutral-400">
        <span className="uppercase tracking-wide font-bold text-yellow-400/80">Créditos do Lu hoje</span>
        {!compacto && <span>{formatarCreditos(restante)} restantes</span>}
      </div>
      <div className="h-1.5 mt-1 rounded-full bg-neutral-800 overflow-hidden" role="meter" aria-valuemin={0} aria-valuemax={consumo.limite} aria-valuenow={consumo.creditos} aria-label="Créditos do Lu usados hoje">
        <div className={`h-full ${usado >= 1 ? 'bg-red-500' : usado >= 0.8 ? 'bg-amber-400' : 'bg-yellow-400'}`} style={{ width: `${Math.max(usado * 100, usado > 0 ? 2 : 0)}%` }} />
      </div>
      <p className="text-[10px] text-neutral-400 mt-0.5 tabular-nums">
        {formatarCreditos(consumo.creditos)} de {formatarCreditos(consumo.limite)}
        {esgotado && <span className="text-red-400 font-semibold"> · esgotados até a meia-noite</span>}
      </p>
    </div>
  );
}
