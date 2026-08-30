// src/components/ChatLuFlutuante.jsx
//
// Wrapper flutuante do ChatLu — antes vivia como uma aba fixa dentro do
// Resultado da Análise; agora é uma janela de chat que abre por cima do
// conteúdo, com a paleta de cores INVERTIDA em relação ao restante da tela
// (lá o preto é a cor principal e o dourado é o destaque secundário; aqui o
// dourado é a cor principal — fundo do painel e do botão — e o preto vira o
// destaque secundário, nas bolhas de mensagem e nos cartões internos), para
// que o chat se distinga claramente do bloco de resultados por trás dele.
import React, { useState } from 'react';
import { Sparkles, X } from 'lucide-react';
import ChatLu from './ChatLu';

export default function ChatLuFlutuante({ casoId, analiseId, user }) {
  const [aberto, setAberto] = useState(false);

  if (!casoId) return null;

  return (
    <>
      <button
        onClick={() => setAberto((v) => !v)}
        className="no-print fixed bottom-4 left-4 sm:bottom-6 sm:left-6 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-gold text-ink shadow-xl shadow-[var(--shadow-gold)] transition-all hover:scale-110 hover:bg-gold-soft hover:shadow-2xl"
        style={{
          marginBottom: 'env(safe-area-inset-bottom)',
          marginLeft: 'env(safe-area-inset-left)',
        }}
        title={aberto ? 'Fechar o Lu' : 'Perguntar ao Lu'}
      >
        {aberto ? <X size={22} /> : <Sparkles size={22} />}
      </button>

      {aberto && (
        <div
          className="no-print fixed bottom-20 left-4 z-40 w-[min(24rem,calc(100vw-2rem))] sm:bottom-24 sm:left-6"
          style={{ marginLeft: 'env(safe-area-inset-left)' }}
        >
          <ChatLu casoId={casoId} analiseId={analiseId} user={user} invertido />
        </div>
      )}
    </>
  );
}
