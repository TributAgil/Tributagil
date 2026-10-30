// src/components/lu/ConversaLu.jsx
//
// "Conversar com o Lu": o chat ao lado da folha do editor. O advogado pergunta sobre ESTE caso e ESTA peça; o Lu
// responde com os documentos enviados na análise, o parecer, o cálculo de prazos, a peça atual e a base de
// legislação, citando de onde tirou. Quando o pedido é mudar um parágrafo, o Lu PROPÕE: a proposta aparece embaixo do
// parágrafo na folha, com Aceitar / Recusar, como no "Pedir ao Lu". A conversa não é salva: fechou o editor, sumiu.

import React, { useEffect, useRef, useState } from 'react';
import { MessageCircle, X, Send, Loader2, AlertTriangle, FileText, ArrowRight, Trash2 } from 'lucide-react';

const SUGESTOES = [
  'Qual a data de vencimento de cada CDA, segundo os documentos?',
  'Em que página dos autos está a citação do executado?',
  'A peça já pede a condenação em honorários?',
  'Há documento que comprove a entrega da declaração?',
];

/** **negrito** do Lu vira <b>; o resto é texto puro (React escapa). */
function TextoDoLu({ texto }) {
  return String(texto || '')
    .split(/(\*\*[^*]+\*\*)/)
    .map((p, i) => (/^\*\*[^*]+\*\*$/.test(p) ? <b key={i}>{p.slice(2, -2)}</b> : <React.Fragment key={i}>{p}</React.Fragment>));
}

/**
 * @param {{ mensagens: Array<{ papel: 'advogado'|'lu', texto: string, erro?: boolean, fontes?: Array<{ tipo: string, rotulo: string }>,
 *   proposta?: { paragrafo: number, topico: string, situacao: 'pendente'|'aceita'|'recusada' }, deFora?: string[] }>,
 *   enviando: boolean, bloqueio?: string, medidor?: React.ReactNode,
 *   onEnviar: (texto: string) => void, onVerProposta: (indice: number) => void, onLimpar: () => void, onFechar: () => void }} props
 */
export default function ConversaLu({ mensagens, enviando, bloqueio = '', medidor = null, onEnviar, onVerProposta, onLimpar, onFechar }) {
  const [texto, setTexto] = useState('');
  const fimRef = useRef(null);
  const campoRef = useRef(null);

  useEffect(() => {
    // conversa vazia: fica no topo, com a explicação e as sugestões à vista
    if (mensagens.length) fimRef.current?.scrollIntoView?.({ block: 'end' });
  }, [mensagens.length, enviando]);
  useEffect(() => {
    campoRef.current?.focus();
  }, []);

  const enviar = (t = texto) => {
    const limpo = t.trim();
    if (!limpo || enviando || bloqueio) return;
    onEnviar(limpo);
    setTexto('');
  };

  return (
    <section className="flex flex-col min-h-0 h-full rounded-xl border-2 border-yellow-400 bg-black text-neutral-100" aria-label="Conversa com o Lu">
      <header className="flex items-center gap-2 px-3 py-2.5 border-b border-yellow-400/30">
        <MessageCircle size={16} className="text-yellow-400" />
        <p className="flex-1 text-sm font-extrabold text-yellow-400">Conversar com o Lu</p>
        {mensagens.length > 0 && (
          <button onClick={onLimpar} disabled={enviando} title="Limpar a conversa" aria-label="Limpar a conversa" className="p-1 text-neutral-500 hover:text-white disabled:opacity-40">
            <Trash2 size={14} />
          </button>
        )}
        <button onClick={onFechar} aria-label="Fechar a conversa" className="p-1 text-neutral-400 hover:text-white">
          <X size={16} />
        </button>
      </header>

      <div className="flex-1 min-h-0 overflow-y-auto px-3 py-3 space-y-3" aria-live="polite">
        {mensagens.length === 0 && (
          <div className="text-xs text-neutral-300 space-y-2">
            <p>
              Pergunte sobre <b className="text-yellow-400">este caso e esta peça</b>: o Lu procura nos documentos enviados, no parecer, no cálculo dos
              prazos e na peça, e diz de onde tirou. Para mudar um parágrafo, peça aqui: a proposta aparece na folha para você aceitar ou recusar.
            </p>
            <div className="flex flex-col gap-1.5 pt-1">
              {SUGESTOES.map((s) => (
                <button
                  key={s}
                  onClick={() => enviar(s)}
                  disabled={Boolean(bloqueio) || enviando}
                  className="text-left rounded-lg border border-yellow-400/40 px-2.5 py-1.5 text-yellow-200 hover:bg-yellow-400 hover:text-black disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-yellow-200"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {mensagens.map((m, i) =>
          m.papel === 'advogado' ? (
            <div key={i} className="flex justify-end">
              <p className="max-w-[85%] rounded-2xl rounded-br-sm bg-yellow-400 text-black px-3 py-2 text-sm whitespace-pre-wrap break-words">{m.texto}</p>
            </div>
          ) : (
            <div key={i} className="max-w-[95%]">
              <div className={`rounded-2xl rounded-bl-sm border px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap break-words ${m.erro ? 'border-amber-500/50 bg-neutral-950 text-amber-300' : 'border-neutral-800 bg-neutral-900'}`}>
                {m.erro && <AlertTriangle size={14} className="inline mr-1 -mt-0.5" />}
                <TextoDoLu texto={m.texto} />
              </div>
              {m.fontes?.length > 0 && (
                <ul className="mt-1 flex flex-wrap gap-1">
                  {m.fontes.map((f) => (
                    <li key={f.rotulo} className="inline-flex items-center gap-1 rounded bg-neutral-900 border border-yellow-400/20 px-1.5 py-0.5 text-[10px] text-yellow-200/80">
                      {f.tipo === 'documento' && <FileText size={10} />} {f.rotulo}
                    </li>
                  ))}
                </ul>
              )}
              {m.deFora?.length > 0 && (
                <p className="mt-1 text-[10px] text-neutral-500">Não li (tamanho ou formato): {m.deFora.join(', ')}.</p>
              )}
              {m.proposta && (
                <button
                  onClick={() => onVerProposta(i)}
                  disabled={m.proposta.situacao !== 'pendente'}
                  className="mt-1.5 w-full inline-flex items-center gap-2 rounded-lg border border-yellow-400 px-2.5 py-1.5 text-left text-xs font-bold text-yellow-400 hover:bg-yellow-400 hover:text-black disabled:opacity-60 disabled:cursor-default disabled:hover:bg-transparent disabled:hover:text-yellow-400"
                >
                  <span className="flex-1">
                    {m.proposta.situacao === 'aceita'
                      ? `Proposta aceita no §${m.proposta.paragrafo}`
                      : m.proposta.situacao === 'recusada'
                        ? `Proposta recusada (§${m.proposta.paragrafo})`
                        : `Ver a proposta na folha: §${m.proposta.paragrafo}`}
                    {m.proposta.topico && <span className="block font-normal text-[10px] opacity-70 truncate">{m.proposta.topico}</span>}
                  </span>
                  {m.proposta.situacao === 'pendente' && <ArrowRight size={14} />}
                </button>
              )}
            </div>
          ),
        )}

        {enviando && (
          <p className="flex items-center gap-2 text-xs text-neutral-300">
            <Loader2 size={14} className="animate-spin text-yellow-400" /> O Lu está lendo o caso… (com documentos, pode levar até um minuto)
          </p>
        )}
        <div ref={fimRef} />
      </div>

      <footer className="border-t border-yellow-400/30 p-2.5 space-y-2">
        {medidor}
        {bloqueio && <p className="text-[11px] text-amber-300">{bloqueio}</p>}
        <div className="flex items-end gap-2">
          <textarea
            ref={campoRef}
            value={texto}
            onChange={(ev) => setTexto(ev.target.value)}
            onKeyDown={(ev) => {
              if (ev.key === 'Enter' && !ev.shiftKey) {
                ev.preventDefault();
                enviar();
              }
            }}
            rows={2}
            maxLength={2000}
            disabled={Boolean(bloqueio)}
            placeholder="Pergunte sobre o caso ou peça uma mudança na peça…"
            aria-label="Pergunta para o Lu"
            className="flex-1 resize-none rounded-lg bg-neutral-900 border border-neutral-700 px-2.5 py-1.5 text-sm text-neutral-100 placeholder:text-neutral-500 focus:outline-none focus:border-yellow-400 disabled:opacity-50"
          />
          <button
            onClick={() => enviar()}
            disabled={!texto.trim() || enviando || Boolean(bloqueio)}
            aria-label="Enviar"
            className="shrink-0 p-2.5 rounded-lg bg-yellow-400 text-black hover:bg-yellow-300 disabled:opacity-40"
          >
            {enviando ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
          </button>
        </div>
        <p className="text-[10px] text-neutral-500">O Lu só responde sobre este caso e esta peça. A conversa não fica salva. Enter envia · Shift+Enter quebra a linha.</p>
      </footer>
    </section>
  );
}
