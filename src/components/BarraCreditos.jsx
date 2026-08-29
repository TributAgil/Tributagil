// src/components/BarraCreditos.jsx
//
// Barra informativa de créditos de análise, lida do Supabase (tabela
// `perfis`). Fica próxima aos botões funcionais principais (Painel e Nova
// Análise) para o usuário sempre saber quantas análises restam antes de
// clicar em "Analisar".
//
// Quando o saldo chega a zero, avisa e oferece um atalho para o suporte
// (renovação de plano / créditos avulsos) via o botão de suporte flutuante.

import React, { useEffect, useState, useCallback } from 'react';
import { Coins, AlertTriangle, Loader2 } from 'lucide-react';
import { buscarCreditos } from '../lib/creditos';

const NOMES_PLANO = {
  gratuito: 'Plano Gratuito',
  essencial: 'Plano Essencial',
  profissional: 'Plano Profissional',
  ilimitado: 'Plano Ilimitado',
};

function abrirSuporte() {
  window.dispatchEvent(new CustomEvent('tributagil:abrir-suporte'));
}

/**
 * @param {{ userId: string, onSaldo?: (saldo: number|null) => void, className?: string }} props
 */
export default function BarraCreditos({ userId, onSaldo, className = '' }) {
  const [carregando, setCarregando] = useState(true);
  const [dados, setDados] = useState(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    const resultado = await buscarCreditos(userId);
    setDados(resultado);
    setCarregando(false);
    onSaldo?.(resultado ? resultado.saldo : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  if (carregando) {
    return (
      <div className={`flex items-center gap-2 rounded-xl border border-line bg-ink-800/50 px-4 py-3 text-sm text-parchment/40 ${className}`}>
        <Loader2 size={14} className="animate-spin" /> Carregando créditos...
      </div>
    );
  }

  // Tabela ainda não existe / falha de leitura: não bloqueia a interface — o
  // servidor (api/gemini) sempre reforça a checagem real antes de gastar IA.
  if (!dados) return null;

  const { plano, saldo } = dados;
  const zerado = saldo <= 0;
  const nomePlano = NOMES_PLANO[String(plano).toLowerCase()] || plano || 'Plano Gratuito';

  return (
    <div
      className={`flex flex-col gap-3 rounded-xl border px-4 py-3 sm:flex-row sm:items-center sm:justify-between ${
        zerado ? 'border-red-500/30 bg-red-500/10' : 'border-gold/25 bg-gold/10'
      } ${className}`}
    >
      <div className="flex items-center gap-2.5">
        <div className={`grid h-9 w-9 flex-shrink-0 place-items-center rounded-lg ${zerado ? 'bg-red-500/15' : 'bg-gold/15'}`}>
          {zerado ? <AlertTriangle size={16} className="text-red-400" /> : <Coins size={16} className="text-gold" />}
        </div>
        <div>
          <p className={`text-sm font-semibold ${zerado ? 'text-red-300' : 'text-gold'}`}>
            {zerado
              ? 'Sem créditos disponíveis'
              : `${saldo} análise${saldo === 1 ? '' : 's'} restante${saldo === 1 ? '' : 's'}`}
          </p>
          <p className="text-xs text-parchment/45">{nomePlano}</p>
        </div>
      </div>
      {zerado && (
        <button
          type="button"
          onClick={abrirSuporte}
          className="shrink-0 rounded-lg bg-gold px-3 py-2 text-xs font-semibold text-ink transition-colors hover:bg-gold-soft"
        >
          Renovar plano / comprar créditos
        </button>
      )}
    </div>
  );
}
