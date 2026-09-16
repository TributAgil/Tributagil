// src/components/ModalSolicitarEstorno.jsx
//
// Solicitação de estorno de crédito POR ANÁLISE, a partir do Histórico —
// diferente do BotaoSinalizarErro (que aparece na hora de uma falha ao
// vivo), este cobre o caso de o usuário revisar uma análise já concluída
// depois e considerar que o resultado não deveria ter consumido crédito.
//
// Janela de 5 dias a partir de `item.created_at`: passado esse prazo, o
// botão que abre este modal nem aparece no Histórico (ver Historico.jsx).
//
// Sempre SUJEITO A APROVAÇÃO HUMANA — este componente só envia um e-mail
// para o suporte (mesmo backend seguro de BotaoSinalizarErro, /api/contato).
// Nenhum crédito é devolvido automaticamente por esta ação.

import React, { useState } from 'react';
import { X, Loader2, CheckCircle2, Undo2 } from 'lucide-react';

export default function ModalSolicitarEstorno({ item, user, onFechar }) {
  const [motivo, setMotivo] = useState('');
  const [estado, setEstado] = useState('idle'); // idle | enviando | enviado | erro

  if (!item) return null;

  const enviar = async () => {
    if (!motivo.trim()) return;
    setEstado('enviando');
    try {
      const passos = [
        `Usuário: ${user?.email || 'não identificado'} (id: ${user?.id || '—'})`,
        `Caso: ${item.caso_id || '—'}`,
        `Análise: ${item.id}`,
        `Título: ${item.titulo || '—'}`,
        `Data da análise: ${item.created_at || '—'}`,
        `Solicitação enviada em: ${new Date().toISOString()}`,
      ].join('\n');

      const resposta = await fetch('/api/contato', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tipo: 'erro_sistema',
          email: user?.email || '',
          descricao: `Solicitação de estorno de crédito para uma análise já concluída (dentro do prazo de 5 dias).\n\nMotivo informado pelo usuário:\n${motivo.trim()}`,
          passos,
          assuntoErroSistema: 'Solicitação de estorno (análise concluída)',
          acaoSolicitada: 'Avaliar o motivo e, se procedente, devolver 1 crédito como bônus na conta do usuário.',
        }),
      });

      if (!resposta.ok) throw new Error('Falha ao enviar solicitação.');
      setEstado('enviado');
    } catch (err) {
      console.error('[ModalSolicitarEstorno] Falha ao enviar:', err);
      setEstado('erro');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onFechar} />
      <div className="relative bg-ink-800/50 rounded-2xl shadow-2xl max-w-md w-full p-6">
        <button
          onClick={onFechar}
          className="absolute right-4 top-4 text-parchment/40 hover:text-parchment transition-colors"
        >
          <X size={18} />
        </button>

        <div className="flex items-center gap-3 mb-4">
          <div className="w-12 h-12 rounded-xl bg-amber-500/15 flex items-center justify-center">
            <Undo2 size={22} className="text-amber-400" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-parchment">Solicitar estorno</h3>
            <p className="text-xs text-parchment/50">Análise #{String(item.id).slice(0, 8)}</p>
          </div>
        </div>

        {estado === 'enviado' ? (
          <div className="flex flex-col items-center gap-3 py-4 text-center">
            <CheckCircle2 size={32} className="text-gold" />
            <p className="text-sm text-parchment/80">
              Solicitação enviada. Nossa equipe vai avaliar e, se procedente, o crédito é devolvido como bônus na sua conta.
            </p>
            <button
              onClick={onFechar}
              className="mt-2 px-4 py-2 text-sm font-medium text-parchment/70 bg-ink-700 hover:bg-ink-600 rounded-xl transition-colors"
            >
              Fechar
            </button>
          </div>
        ) : (
          <>
            <p className="text-sm text-parchment/60 leading-relaxed mb-3">
              Conte o que houve com esta análise. Sua solicitação é sempre avaliada pela nossa equipe antes de qualquer estorno — não é automático.
            </p>
            <textarea
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              maxLength={2000}
              rows={4}
              placeholder="Ex.: o parecer não considerou um documento anexado / apresentou erro na leitura de datas..."
              className="w-full rounded-xl bg-ink-900/60 border border-line px-3 py-2.5 text-sm text-parchment placeholder:text-parchment/30 focus:outline-none focus:border-gold/50 resize-none"
            />
            {estado === 'erro' && (
              <p className="mt-2 text-xs text-red-400">
                Não foi possível enviar agora. Tente de novo em instantes.
              </p>
            )}
            <div className="flex gap-3 mt-5">
              <button
                onClick={onFechar}
                className="flex-1 py-2.5 text-sm font-medium text-parchment/60 bg-ink-700 hover:bg-ink-600 rounded-xl transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={enviar}
                disabled={!motivo.trim() || estado === 'enviando'}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-semibold text-ink bg-gold hover:bg-gold/90 rounded-xl shadow-lg shadow-gold/20 transition-all disabled:opacity-50"
              >
                {estado === 'enviando' && <Loader2 size={15} className="animate-spin" />}
                Enviar solicitação
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
