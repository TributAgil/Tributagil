// src/components/BotaoSinalizarErro.jsx
//
// Aparece quando uma análise falha por responsabilidade do sistema (erro da
// IA / instabilidade do software) — nunca no fluxo normal de "dados
// insuficientes", que é uma resposta legítima do Motor TributÁgil, não uma
// falha técnica.
//
// Dispara um e-mail formatado para o suporte (via /api/contato, o mesmo
// backend seguro do formulário de suporte), com os logs do erro e os dados
// do usuário, solicitando a avaliação técnica para o estorno do crédito
// perdido em formato de bônus na conta.

import React, { useState } from 'react';
import { CheckCircle2, Loader2, ShieldAlert } from 'lucide-react';

export default function BotaoSinalizarErro({ user, mensagemErro, logs = [], casoId, analiseId }) {
  const [estado, setEstado] = useState('idle'); // idle | enviando | enviado | erro

  const enviar = async () => {
    setEstado('enviando');
    try {
      const linhasLog = logs.map((l) => `[${l.tempo}] ${l.mensagem}`).join('\n');
      const passos = [
        `Usuário: ${user?.email || 'não identificado'} (id: ${user?.id || '—'})`,
        casoId ? `Caso: ${casoId}` : null,
        analiseId ? `Tentativa de análise: ${analiseId}` : null,
        `Data/hora: ${new Date().toISOString()}`,
        '',
        'Log de processamento:',
        linhasLog || '(sem logs)',
      ]
        .filter(Boolean)
        .join('\n');

      const resposta = await fetch('/api/contato', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tipo: 'erro_sistema',
          email: user?.email || '',
          descricao:
            `Falha de sistema/IA durante o processamento de uma análise. ` +
            `Solicito avaliação técnica para o estorno do crédito consumido, em formato de bônus na conta.\n\n` +
            `Erro reportado: ${mensagemErro || 'não informado'}`,
          passos,
        }),
      });

      if (!resposta.ok) throw new Error('Falha ao enviar sinalização.');
      setEstado('enviado');
    } catch (err) {
      console.error('[BotaoSinalizarErro] Falha ao sinalizar:', err);
      setEstado('erro');
    }
  };

  if (estado === 'enviado') {
    return (
      <div className="mt-4 flex items-center justify-center gap-2 text-sm text-gold">
        <CheckCircle2 size={16} />
        Sinalização enviada. Nossa equipe vai avaliar o estorno do crédito.
      </div>
    );
  }

  return (
    <div className="mt-4">
      <button
        type="button"
        onClick={enviar}
        disabled={estado === 'enviando'}
        className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-2.5 text-sm font-semibold text-red-300 transition-colors hover:bg-red-500/15 disabled:opacity-50"
      >
        {estado === 'enviando' ? <Loader2 size={15} className="animate-spin" /> : <ShieldAlert size={15} />}
        Sinalização Automática de Erro
      </button>
      {estado === 'erro' && (
        <p className="mt-2 text-xs text-red-400">
          Não foi possível enviar agora. Use o botão de suporte flutuante para relatar manualmente.
        </p>
      )}
      <p className="mt-2 text-center text-xs text-parchment/35">
        Envia os logs desta falha e seus dados ao suporte, solicitando avaliação para o estorno do crédito perdido.
      </p>
    </div>
  );
}
