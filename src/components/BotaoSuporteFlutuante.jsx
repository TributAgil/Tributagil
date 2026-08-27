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
        className="fixed bottom-6 right-6 z-40 w-14 h-14 bg-emerald-600 hover:bg-emerald-700 text-white rounded-full shadow-xl shadow-emerald-600/30 flex items-center justify-center transition-all hover:scale-110 hover:shadow-2xl group"
        title="Central de Suporte"
      >
        {modalAberto ? (
          <X size={22} />
        ) : (
          <HelpCircle size={24} className="group-hover:rotate-12 transition-transform" />
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