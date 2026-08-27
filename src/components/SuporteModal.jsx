// src/components/SuporteModal.jsx
import React, { useState } from 'react';
import {
  MessageSquare,
  Bug,
  X,
  Send,
  Star,
  AlertCircle,
  CheckCircle2,
  Loader2,
  HelpCircle
} from 'lucide-react';

// ============================================
// COMPONENTE: MODAL DE SUPORTE UNIFICADO
// ============================================
const SuporteModal = ({ aberto, onFechar }) => {
  const [abaAtiva, setAbaAtiva] = useState('feedback');
  const [enviando, setEnviando] = useState(false);
  const [enviado, setEnviado] = useState(false);

  // Formulário de Feedback
  const [feedback, setFeedback] = useState({
    avaliacao: 0,
    comentario: '',
    analiseId: '',
  });

  // Formulário de Bug
  const [bug, setBug] = useState({
    tipo: '',
    descricao: '',
    passos: '',
    analiseId: '',
    email: '',
  });

  const handleEnviarFeedback = async (e) => {
    e.preventDefault();
    setEnviando(true);

    // ============================================
    // LÓGICA DE ENVIO DE E-MAIL AO SUPORTE
    // ============================================
    const payloadEmail = {
      para: 'suporte@tributagil.com.br',
      assunto: `[Feedback] Avaliação da Análise ${feedback.analiseId || 'Geral'}`,
      corpo: `
DE: Usuário TributÁgil
DATA: ${new Date().toLocaleString('pt-BR')}

AVALIAÇÃO: ${feedback.avaliacao} estrela(s)
ANÁLISE ID: ${feedback.analiseId || 'Não informado'}

COMENTÁRIO:
${feedback.comentario}

---
Enviado via TributÁgil — Sistema de Suporte
      `,
    };

    // Simulação de envio via API de e-mail
    console.log('📧 ENVIANDO E-MAIL DE FEEDBACK:', payloadEmail);
    await new Promise((resolve) => setTimeout(resolve, 1500));

    setEnviando(false);
    setEnviado(true);
    setTimeout(() => {
      setEnviado(false);
      setFeedback({ avaliacao: 0, comentario: '', analiseId: '' });
      onFechar();
    }, 2000);
  };

  const handleEnviarBug = async (e) => {
    e.preventDefault();
    setEnviando(true);

    // ============================================
    // LÓGICA DE ENVIO DE E-MAIL DE BUG
    // ============================================
    const payloadEmail = {
      para: 'suporte@tributagil.com.br',
      cc: 'tech@tributagil.com.br',
      assunto: `[BUG] ${bug.tipo} — Reportado em ${new Date().toLocaleDateString('pt-BR')}`,
      corpo: `
DE: ${bug.email || 'Usuário anônimo'}
DATA: ${new Date().toLocaleString('pt-BR')}
PRIORIDADE: Alta (reporte de bug)

TIPO DO PROBLEMA: ${bug.tipo}
ANÁLISE ID (se aplicável): ${bug.analiseId || 'Não informado'}

DESCRIÇÃO DO ERRO:
${bug.descricao}

PASSOS PARA REPRODUZIR:
${bug.passos}

---
Enviado via TributÁgil — Sistema de Suporte
      `,
    };

    // Simulação de envio via API de e-mail
    console.log('🐛 ENVIANDO E-MAIL DE BUG:', payloadEmail);
    await new Promise((resolve) => setTimeout(resolve, 1500));

    setEnviando(false);
    setEnviado(true);
    setTimeout(() => {
      setEnviado(false);
      setBug({ tipo: '', descricao: '', passos: '', analiseId: '', email: '' });
      onFechar();
    }, 2000);
  };

  const tiposBug = [
    'Erro na análise da IA',
    'Problema de upload de documentos',
    'Dados incorretos no parecer',
    'Erro de cálculo de prazos',
    'Problema de login/sessão',
    'Lentidão no sistema',
    'Outro',
  ];

  if (!aberto) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onFechar} />
      
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in duration-200">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-2">
            <HelpCircle size={20} className="text-emerald-600" />
            <h2 className="text-lg font-bold text-slate-800">Central de Suporte</h2>
          </div>
          <button
            onClick={onFechar}
            className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-200 rounded-lg transition-all"
          >
            <X size={18} />
          </button>
        </div>

        {/* Abas */}
        <div className="flex border-b border-slate-100">
          <button
            onClick={() => setAbaAtiva('feedback')}
            className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium transition-all ${
              abaAtiva === 'feedback'
                ? 'text-emerald-700 border-b-2 border-emerald-500 bg-emerald-50/30'
                : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'
            }`}
          >
            <MessageSquare size={16} />
            Feedback da Análise
          </button>
          <button
            onClick={() => setAbaAtiva('bug')}
            className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium transition-all ${
              abaAtiva === 'bug'
                ? 'text-emerald-700 border-b-2 border-emerald-500 bg-emerald-50/30'
                : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'
            }`}
          >
            <Bug size={16} />
            Reportar Erro
          </button>
        </div>

        {/* Conteúdo */}
        <div className="p-6 max-h-[60vh] overflow-y-auto">
          {enviado ? (
            <div className="text-center py-8">
              <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <CheckCircle2 size={32} className="text-emerald-600" />
              </div>
              <h3 className="text-lg font-semibold text-slate-800">Enviado com sucesso!</h3>
              <p className="text-sm text-slate-500 mt-1">Nossa equipe analisará sua mensagem em breve.</p>
            </div>
          ) : abaAtiva === 'feedback' ? (
            <form onSubmit={handleEnviarFeedback} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Como você avalia a qualidade desta análise?
                </label>
                <div className="flex items-center gap-2">
                  {[1, 2, 3, 4, 5].map((estrela) => (
                    <button
                      key={estrela}
                      type="button"
                      onClick={() => setFeedback({ ...feedback, avaliacao: estrela })}
                      className="p-1 transition-transform hover:scale-110"
                    >
                      <Star
                        size={28}
                        className={estrela <= feedback.avaliacao ? 'text-amber-400 fill-amber-400' : 'text-slate-200'}
                      />
                    </button>
                  ))}
                 <span className="text-sm text-slate-400 ml-2">
  {feedback.avaliacao > 0 ? `${feedback.avaliacao}/5` : 'Selecione'}
</span>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  ID da Análise (opcional)
                </label>
                <input
                  type="text"
                  value={feedback.analiseId}
                  onChange={(e) => setFeedback({ ...feedback, analiseId: e.target.value })}
                  placeholder="Ex: TRB-2026-0847"
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  Seu comentário
                </label>
                <textarea
                  value={feedback.comentario}
                  onChange={(e) => setFeedback({ ...feedback, comentario: e.target.value })}
                  placeholder="Conte-nos o que achou da análise, sugestões de melhoria..."
                  rows={4}
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 resize-none"
                  required
                />
              </div>

              <button
                type="submit"
                disabled={enviando || feedback.avaliacao === 0}
                className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-xl shadow-lg shadow-emerald-600/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {enviando ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    Enviando...
                  </>
                ) : (
                  <>
                    <Send size={16} />
                    Enviar Feedback
                  </>
                )}
              </button>
            </form>
          ) : (
            <form onSubmit={handleEnviarBug} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  Tipo do problema <span className="text-red-500">*</span>
                </label>
                <select
                  value={bug.tipo}
                  onChange={(e) => setBug({ ...bug, tipo: e.target.value })}
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                  required
                >
                  <option value="">Selecione o tipo de erro</option>
                  {tiposBug.map((tipo) => (
                    <option key={tipo} value={tipo}>{tipo}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  ID da Análise (se aplicável)
                </label>
                <input
                  type="text"
                  value={bug.analiseId}
                  onChange={(e) => setBug({ ...bug, analiseId: e.target.value })}
                  placeholder="Ex: TRB-2026-0847"
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  Seu e-mail <span className="text-red-500">*</span>
                </label>
                <input
                  type="email"
                  value={bug.email}
                  onChange={(e) => setBug({ ...bug, email: e.target.value })}
                  placeholder="para retorno do suporte"
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  Descrição do erro <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={bug.descricao}
                  onChange={(e) => setBug({ ...bug, descricao: e.target.value })}
                  placeholder="Descreva o erro com o máximo de detalhes possível..."
                  rows={3}
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 resize-none"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  Passos para reproduzir
                </label>
                <textarea
                  value={bug.passos}
                  onChange={(e) => setBug({ ...bug, passos: e.target.value })}
                  placeholder="1. Acessei a tela...\n2. Cliquei em...\n3. O erro ocorreu..."
                  rows={3}
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 resize-none"
                />
              </div>

              <button
                type="submit"
                disabled={enviando}
                className="w-full py-3 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-xl shadow-lg shadow-red-600/20 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {enviando ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    Enviando...
                  </>
                ) : (
                  <>
                    <AlertCircle size={16} />
                    Reportar Erro ao Suporte
                  </>
                )}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};

export default SuporteModal;