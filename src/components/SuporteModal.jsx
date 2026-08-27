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
  HelpCircle,
} from 'lucide-react';

// ============================================
// COMPONENTE: MODAL DE SUPORTE UNIFICADO
// ============================================
// Envia feedback e reports de bug para o backend seguro `/api/contato`, que por
// sua vez encaminha o e-mail para a caixa corporativa (contato@tributagil.online).
// O cliente NUNCA define o destinatário nem manipula credenciais de e-mail.

const TIPOS_BUG = [
  'Erro na análise da IA',
  'Problema de upload de documentos',
  'Dados incorretos no parecer',
  'Erro de cálculo de prazos',
  'Problema de login/sessão',
  'Lentidão no sistema',
  'Outro',
];

const FEEDBACK_INICIAL = { avaliacao: 0, comentario: '', analiseId: '' };
const BUG_INICIAL = { tipo: '', descricao: '', passos: '', analiseId: '', email: '' };

const SuporteModal = ({ aberto, onFechar }) => {
  const [abaAtiva, setAbaAtiva] = useState('feedback');
  const [enviando, setEnviando] = useState(false);
  const [enviado, setEnviado] = useState(false);
  const [erro, setErro] = useState(null);

  const [feedback, setFeedback] = useState(FEEDBACK_INICIAL);
  const [bug, setBug] = useState(BUG_INICIAL);
  // Honeypot anti-bot: mantido fora da tela; humanos nunca preenchem.
  const [honeypot, setHoneypot] = useState('');

  const resetar = () => {
    setFeedback(FEEDBACK_INICIAL);
    setBug(BUG_INICIAL);
    setHoneypot('');
    setErro(null);
  };

  const fecharComReset = () => {
    resetar();
    onFechar();
  };

  // ============================================
  // ENVIO PARA O BACKEND
  // ============================================
  const enviarSuporte = async (payload) => {
    setEnviando(true);
    setErro(null);

    try {
      const resposta = await fetch('/api/contato', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...payload, website: honeypot }),
      });

      const dados = await resposta.json().catch(() => ({}));

      if (!resposta.ok) {
        throw new Error(dados.error || 'Não foi possível enviar sua mensagem. Tente novamente.');
      }

      setEnviado(true);
      setTimeout(() => {
        setEnviado(false);
        fecharComReset();
      }, 2200);
    } catch (e) {
      console.error('[SuporteModal] Falha no envio:', e);
      setErro(e.message);
    } finally {
      setEnviando(false);
    }
  };

  const handleEnviarFeedback = (e) => {
    e.preventDefault();
    enviarSuporte({
      tipo: 'feedback',
      avaliacao: feedback.avaliacao,
      comentario: feedback.comentario,
      analiseId: feedback.analiseId,
    });
  };

  const handleEnviarBug = (e) => {
    e.preventDefault();
    enviarSuporte({
      tipo: 'bug',
      tipoProblema: bug.tipo,
      descricao: bug.descricao,
      passos: bug.passos,
      analiseId: bug.analiseId,
      email: bug.email,
    });
  };

  if (!aberto) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={fecharComReset} />

      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in duration-200">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-2">
            <HelpCircle size={20} className="text-emerald-600" />
            <h2 className="text-lg font-bold text-slate-800">Central de Suporte</h2>
          </div>
          <button
            onClick={fecharComReset}
            className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-200 rounded-lg transition-all"
          >
            <X size={18} />
          </button>
        </div>

        {/* Abas */}
        <div className="flex border-b border-slate-100">
          <button
            onClick={() => {
              setAbaAtiva('feedback');
              setErro(null);
            }}
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
            onClick={() => {
              setAbaAtiva('bug');
              setErro(null);
            }}
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
          {/* Honeypot: escondido de humanos, visível para bots */}
          <input
            type="text"
            name="website"
            tabIndex={-1}
            autoComplete="off"
            value={honeypot}
            onChange={(e) => setHoneypot(e.target.value)}
            className="hidden"
            aria-hidden="true"
          />

          {erro && (
            <div className="mb-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              <AlertCircle size={15} className="mt-0.5 flex-shrink-0" />
              <span>{erro}</span>
            </div>
          )}

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
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Seu comentário</label>
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
                  {TIPOS_BUG.map((tipo) => (
                    <option key={tipo} value={tipo}>
                      {tipo}
                    </option>
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
                  placeholder={'1. Acessei a tela...\n2. Cliquei em...\n3. O erro ocorreu...'}
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
