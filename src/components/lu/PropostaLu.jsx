// src/components/lu/PropostaLu.jsx
//
// O que o Lu propôs para UM parágrafo, logo abaixo dele na folha do editor: o texto novo (como vai ficar), a
// explicação e as fontes. Nada muda no parágrafo até o advogado clicar em "Aceitar".
// Nas conferências ("Conferir com os autos", "Conferir os prazos") não há texto novo: é uma lista, item a item.

import React from 'react';
import { Sparkles, Check, X, RotateCcw, Loader2, AlertTriangle, CircleCheck, CircleX, CircleHelp } from 'lucide-react';
import { trechosParaHtml } from '../../lib/edicaoTexto';
import { ACOES_LU } from '../../lib/luPeca';

const SITUACAO = {
  confere: { Icone: CircleCheck, cor: 'text-emerald-400', nome: 'confere' },
  diverge: { Icone: CircleX, cor: 'text-red-400', nome: 'diverge' },
  sem_fonte: { Icone: CircleHelp, cor: 'text-amber-300', nome: 'sem fonte' },
};

/**
 * @param {{ proposta: { acao: string, carregando?: boolean, erro?: string, encontrou?: boolean, trechos?: object[],
 *   explicacao?: string, fontes?: string[] }, objetos?: object[], onAceitar: () => void, onRecusar: () => void,
 *   onDeNovo?: () => void }} props  (sem onDeNovo: sem o botão "Pedir de novo")
 */
export default function PropostaLu({ proposta, objetos = [], onAceitar, onRecusar, onDeNovo }) {
  const rotulo = proposta.acao === 'conversa' ? 'Proposta da conversa' : ACOES_LU[proposta.acao]?.rotulo || 'Lu';
  const conferencia = proposta.tipo === 'conferencia';
  return (
    <div id="proposta-lu" className="rounded-xl border-2 border-yellow-400 bg-neutral-950 text-neutral-100 p-3 sm:p-4 shadow-lg" role="region" aria-label="Proposta do Lu">
      <p className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide font-bold text-yellow-400 mb-2">
        <Sparkles size={13} /> Lu · {rotulo}
      </p>

      {proposta.carregando && (
        <p className="flex items-center gap-2 text-sm text-neutral-300 py-2">
          <Loader2 size={15} className="animate-spin text-yellow-400" /> O Lu está trabalhando neste trecho…
        </p>
      )}

      {proposta.erro && (
        <>
          <p className="flex items-start gap-2 text-sm text-amber-300">
            <AlertTriangle size={15} className="mt-0.5 shrink-0" /> {proposta.erro}
          </p>
          <div className="flex gap-2 mt-3">
            {onDeNovo && (
              <button onClick={onDeNovo} className="px-3 py-1.5 text-xs font-bold text-neutral-950 bg-yellow-400 hover:bg-yellow-300 rounded-lg">
                Tentar de novo
              </button>
            )}
            <button onClick={onRecusar} className="px-3 py-1.5 text-xs text-neutral-300 hover:text-white">
              Fechar
            </button>
          </div>
        </>
      )}

      {!proposta.carregando && !proposta.erro && conferencia && (
        <>
          {proposta.itens?.length > 0 ? (
            <ul className="space-y-1.5">
              {proposta.itens.map((i, k) => {
                const { Icone, cor, nome } = SITUACAO[i.situacao] || SITUACAO.sem_fonte;
                return (
                  <li key={k} className="rounded-lg bg-neutral-900 border border-neutral-800 px-3 py-2">
                    <p className="flex items-start gap-2 text-sm">
                      <Icone size={16} className={`mt-0.5 shrink-0 ${cor}`} />
                      <span className="flex-1">
                        <span className="text-neutral-100">“{i.afirmacao}”</span> <span className={`text-xs font-bold ${cor}`}>{nome}</span>
                        {i.detalhe && <span className="block text-xs text-neutral-300 mt-0.5">{i.detalhe}</span>}
                        {i.fonte && <span className="block text-[11px] text-yellow-200/70 mt-0.5">Fonte: {i.fonte}</span>}
                      </span>
                    </p>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-sm text-neutral-300">Nada para conferir neste parágrafo.</p>
          )}
          {proposta.resumo && <p className="mt-2 text-xs text-neutral-300">{proposta.resumo}</p>}
          <div className="flex flex-wrap gap-2 mt-3">
            <button onClick={onRecusar} className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-bold text-neutral-950 bg-yellow-400 hover:bg-yellow-300 rounded-lg">
              <Check size={15} /> Entendi
            </button>
            <button onClick={onDeNovo} className="inline-flex items-center gap-1.5 px-3 py-2 text-sm text-neutral-300 hover:text-white">
              <RotateCcw size={14} /> Conferir de novo
            </button>
          </div>
          <p className="mt-2 text-[10px] text-neutral-500">Conferência só aponta: o texto não muda. Corrija no parágrafo, se for o caso.</p>
        </>
      )}

      {!proposta.carregando && !proposta.erro && !conferencia && (
        <>
          {proposta.encontrou ? (
            <div
              className="rounded-lg bg-white text-neutral-900 px-3 py-2 text-[14px] leading-relaxed text-justify whitespace-pre-wrap [&_mark]:bg-yellow-300 [&_.etiqueta-word]:inline-block [&_.etiqueta-word]:mx-0.5 [&_.etiqueta-word]:px-1.5 [&_.etiqueta-word]:rounded [&_.etiqueta-word]:bg-sky-100 [&_.etiqueta-word]:text-sky-800 [&_.etiqueta-word]:text-[11px] [&_.etiqueta-word]:font-semibold"
              // texto já escapado por trechosParaHtml (só <b>, <i>, <u>, <mark>, <br> e etiquetas)
              dangerouslySetInnerHTML={{ __html: trechosParaHtml(proposta.trechos, objetos) }}
            />
          ) : (
            <p className="text-sm text-amber-300 flex items-start gap-2">
              <AlertTriangle size={15} className="mt-0.5 shrink-0" /> O Lu não conseguiu fazer isso com o que tem do caso. O parágrafo continua como
              está.
            </p>
          )}
          {proposta.explicacao && <p className="mt-2 text-xs text-neutral-300">{proposta.explicacao}</p>}
          {proposta.acao === 'conversa' && <p className="mt-1 text-[11px] text-yellow-200/70">As fontes estão na resposta, na conversa ao lado.</p>}
          {proposta.fontes?.length > 0 && (
            <p className="mt-1 text-[11px] text-yellow-200/80">
              <span className="font-semibold text-yellow-400">Fontes:</span> {proposta.fontes.join(' · ')}
            </p>
          )}
          <div className="flex flex-wrap gap-2 mt-3">
            {proposta.encontrou && (
              <button onClick={onAceitar} className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-bold text-neutral-950 bg-yellow-400 hover:bg-yellow-300 rounded-lg">
                <Check size={15} /> Aceitar
              </button>
            )}
            <button onClick={onRecusar} className="inline-flex items-center gap-1.5 px-3 py-2 text-sm text-neutral-200 border border-neutral-700 hover:border-neutral-500 rounded-lg">
              <X size={15} /> {proposta.encontrou ? 'Recusar' : 'Fechar'}
            </button>
            {onDeNovo && (
              <button onClick={onDeNovo} className="inline-flex items-center gap-1.5 px-3 py-2 text-sm text-neutral-300 hover:text-white">
                <RotateCcw size={14} /> Pedir de novo
              </button>
            )}
          </div>
          <p className="mt-2 text-[10px] text-neutral-500">Revise antes de aceitar: o Lu propõe, quem decide e assina é o advogado.</p>
        </>
      )}
    </div>
  );
}
