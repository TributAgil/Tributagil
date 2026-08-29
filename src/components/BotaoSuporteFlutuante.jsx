// src/components/BotaoSuporteFlutuante.jsx
import React, { useEffect, useState } from 'react';
import { HelpCircle, X } from 'lucide-react';
import SuporteModal from './SuporteModal';

// ============================================
// COMPONENTE: BOTÃO DE SUPORTE FLUTUANTE
// ============================================
const BotaoSuporteFlutuante = () => {
  const [modalAberto, setModalAberto] = useState(false);

  // Outras telas (barra de créditos zerada, "sem créditos" no Cérebro
  // Tributário) pedem a abertura do suporte via evento global, sem precisar
  // de prop drilling até aqui.
  useEffect(() => {
    const abrir = () => setModalAberto(true);
    window.addEventListener('tributagil:abrir-suporte', abrir);
    return () => window.removeEventListener('tributagil:abrir-suporte', abrir);
  }, []);

  return (
    <>
      {/* Botão flutuante */}
      <button
        onClick={() => setModalAberto(true)}
        className="no-print fixed bottom-4 right-4 sm:bottom-6 sm:right-6 z-40 w-14 h-14 bg-gold hover:bg-gold-soft text-ink rounded-full shadow-xl shadow-[var(--shadow-gold)] flex items-center justify-center transition-all hover:scale-110 hover:shadow-2xl group"
        style={{
          marginBottom: 'env(safe-area-inset-bottom)',
          marginRight: 'env(safe-area-inset-right)',
        }}
        title="Central de Suporte"
      >
        {modalAberto ? (
          <X size={22} />
        ) : (
          <HelpCircle size={24} className="group-hover:rotate-12 text-ink transition-transform" />
        )}
      </button>

      {/* Modal */}
      <SuporteModal
        aberto={modalAberto}
        onFechar={() => setModalAberto(false)}
      />
    </>
  );
};

export default BotaoSuporteFlutuante;