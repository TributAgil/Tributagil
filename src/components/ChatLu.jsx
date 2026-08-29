// src/components/ChatLu.jsx
//
// Painel de chat do "Lu" — assistente jurídico RAG restrito ao caso corrente
// (documentos do caso + legislação cadastrada). Só fica disponível depois
// que o parecer é emitido e salvo (precisa de um `casoId`).

import React, { useState, useRef, useEffect } from 'react';
import { Send, Loader2, Sparkles, BookOpen, FileText, AlertCircle } from 'lucide-react';
import { perguntarLu } from '../lib/lu';

const SUGESTOES = [
  'A prescrição intercorrente já está consumada neste caso?',
  'Qual o fundamento legal para arguir decadência aqui?',
  'Que instrumento processual você recomenda para esta conclusão?',
];

function FontesConsultadas({ fontes }) {
  if (!fontes || fontes.length === 0) return null;
  return (
    <div className="mt-3 space-y-1.5 border-t border-line/60 pt-3">
      <p className="text-[10px] font-bold uppercase tracking-wider text-parchment/40">Fontes consultadas</p>
      <ul className="space-y-1">
        {fontes.map((f, i) => (
          <li key={i} className="flex items-start gap-1.5 text-xs text-parchment/55">
            {f.tipo === 'legislacao' ? (
              <BookOpen size={12} className="mt-0.5 flex-shrink-0 text-gold/70" />
            ) : (
              <FileText size={12} className="mt-0.5 flex-shrink-0 text-parchment/40" />
            )}
            {f.tipo === 'legislacao' ? (
              <span>{f.norma} {f.identificador}</span>
            ) : (
              <span>
                {f.documento}
                {f.pagina != null ? ` — pág. ${f.pagina}` : ''}
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * @param {{ casoId: string | null }} props
 */
export default function ChatLu({ casoId }) {
  const [mensagens, setMensagens] = useState([]); // { papel: 'usuario'|'lu', texto, fontes? }
  const [pergunta, setPergunta] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState(null);
  const fimRef = useRef(null);

  useEffect(() => {
    fimRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [mensagens, enviando]);

  const enviar = async (textoForcado) => {
    const texto = (textoForcado ?? pergunta).trim();
    if (!texto || enviando || !casoId) return;

    setErro(null);
    setPergunta('');
    setMensagens((prev) => [...prev, { papel: 'usuario', texto }]);
    setEnviando(true);

    try {
      const historico = mensagens.slice(-6).map((m) => ({ papel: m.papel, texto: m.texto }));
      const { resposta, fontes } = await perguntarLu({ casoId, pergunta: texto, historico });
      setMensagens((prev) => [...prev, { papel: 'lu', texto: resposta, fontes }]);
    } catch (err) {
      console.error('[ChatLu] Falha ao perguntar:', err);
      setErro(err.message || 'Não foi possível falar com o Lu agora.');
    } finally {
      setEnviando(false);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    enviar();
  };

  if (!casoId) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-line bg-ink-800/30 px-8 py-14 text-center">
        <Sparkles size={22} className="text-parchment/30" />
        <p className="text-sm text-parchment/50">
          O Lu fica disponível assim que esta análise for salva no histórico. Aguarde alguns
          segundos ou reabra a análise pelo Histórico.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col rounded-xl border border-line bg-ink-800/50">
      <div className="flex items-center gap-2.5 border-b border-line px-5 py-3.5">
        <div className="grid h-8 w-8 place-items-center rounded-lg bg-gold/15">
          <Sparkles size={15} className="text-gold" />
        </div>
        <div>
          <p className="text-sm font-semibold text-parchment">Lu — assistente jurídico</p>
          <p className="text-xs text-parchment/40">Responde só com base neste caso e na legislação cadastrada</p>
        </div>
      </div>

      <div className="flex max-h-[28rem] min-h-[16rem] flex-col gap-4 overflow-y-auto px-5 py-4">
        {mensagens.length === 0 && (
          <div className="space-y-3">
            <p className="text-sm text-parchment/50">
              Pergunte sobre os documentos deste caso ou sobre a legislação de prescrição/decadência
              aplicada no parecer.
            </p>
            <div className="flex flex-col gap-2">
              {SUGESTOES.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => enviar(s)}
                  className="rounded-lg border border-line bg-ink-900/50 px-3 py-2 text-left text-xs text-parchment/60 transition-colors hover:border-gold/30 hover:text-parchment/85"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {mensagens.map((m, i) => (
          <div key={i} className={`flex ${m.papel === 'usuario' ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`max-w-[85%] rounded-xl px-4 py-3 text-sm leading-relaxed ${
                m.papel === 'usuario'
                  ? 'bg-gold text-ink font-medium'
                  : 'border border-line bg-ink-900/60 text-parchment/85'
              }`}
            >
              <p className="whitespace-pre-wrap">{m.texto}</p>
              {m.papel === 'lu' && <FontesConsultadas fontes={m.fontes} />}
            </div>
          </div>
        ))}

        {enviando && (
          <div className="flex items-center gap-2 text-xs text-parchment/40">
            <Loader2 size={13} className="animate-spin" /> Lu está consultando o caso e a legislação...
          </div>
        )}

        {erro && (
          <div className="flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
            <AlertCircle size={13} className="mt-0.5 flex-shrink-0" />
            {erro}
          </div>
        )}

        <div ref={fimRef} />
      </div>

      <form onSubmit={handleSubmit} className="flex items-center gap-2 border-t border-line p-3">
        <input
          type="text"
          value={pergunta}
          onChange={(e) => setPergunta(e.target.value)}
          placeholder="Pergunte ao Lu sobre este caso..."
          disabled={enviando}
          maxLength={2000}
          className="flex-1 rounded-lg border border-line bg-ink-900 px-3 py-2.5 text-sm text-parchment placeholder:text-parchment/30 outline-none transition-all focus:border-gold/50 focus:ring-2 focus:ring-gold/15 disabled:opacity-60"
        />
        <button
          type="submit"
          disabled={enviando || !pergunta.trim()}
          className="grid h-10 w-10 flex-shrink-0 place-items-center rounded-lg bg-gold text-ink transition-colors hover:bg-gold-soft disabled:cursor-not-allowed disabled:opacity-40"
          aria-label="Enviar pergunta"
        >
          {enviando ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
        </button>
      </form>
    </div>
  );
}
