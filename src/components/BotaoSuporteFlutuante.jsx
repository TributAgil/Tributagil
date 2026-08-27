// src/components/BotaoSuporteFlutuante.jsx
import React, { useState } from 'react';
import { HelpCircle, X } from 'lucide-react';
import SuporteModal from './SuporteModal';

// ============================================
// COMPONENTE: BOTÃO DE SUPORTE FLUTUANTE
// ============================================
const BotaoSuporteFlutuante = () => {
  const [modalAberto, setModalAberto] = useState(false);

  return (
    <>
      {/* Botão flutuante */}
      <button
        onClick={() => setModalAberto(true)}
        className="fixed bottom-4 right-4 sm:bottom-6 sm:right-6 z-40 w-14 h-14 bg-gold hover:bg-gold-soft text-ink rounded-full shadow-xl shadow-[var(--shadow-gold)] flex items-center justify-center transition-all hover:scale-110 hover:shadow-2xl group"
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