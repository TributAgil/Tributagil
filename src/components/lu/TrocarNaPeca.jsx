// src/components/lu/TrocarNaPeca.jsx
//
// "Trocar em toda a peça" (no menu do Lu, mas sem IA): o advogado digita o que procurar e o que pôr no lugar, vê cada
// parágrafo onde aparece (com o trecho em volta), desmarca o que não quer e aplica de uma vez. A troca é feita em
// código (src/lib/edicaoTexto.js, substituirNosTrechos), preservando a formatação em volta. Tabelas, marcadores de
// figura e outras partes só de leitura não mudam: a tela avisa quantas ocorrências ficaram lá, para trocar no Word.

import React, { useMemo, useState } from 'react';
import { ArrowLeft, Replace, AlertTriangle, Check } from 'lucide-react';
import { ocorrencias } from '../../lib/edicaoTexto';
import { textoDosTrechos } from '../../lib/docxEdicao';

const semEtiquetas = (s) => s.replace(/[-]/g, '');

function trechoEmVolta(texto, ini, fim) {
  const a = Math.max(0, ini - 50);
  const b = Math.min(texto.length, fim + 50);
  return { antes: (a > 0 ? '…' : '') + texto.slice(a, ini), achado: texto.slice(ini, fim), depois: texto.slice(fim, b) + (b < texto.length ? '…' : '') };
}

/**
 * @param {{ paragrafos: Array<{ chave: string, alvo: object, trechos: object[], topico: string }>,
 *   soLeitura: Array<{ texto: string, topico: string }>, buscaInicial?: string,
 *   onAplicar: (r: { busca: string, troca: string, alvos: object[], diferenciarMaiusculas: boolean }) => void,
 *   onVoltar: () => void }} props
 */
export default function TrocarNaPeca({ paragrafos, soLeitura, buscaInicial = '', onAplicar, onVoltar }) {
  const [busca, setBusca] = useState(buscaInicial);
  const [troca, setTroca] = useState('');
  const [diferenciar, setDiferenciar] = useState(false);
  const [desmarcados, setDesmarcados] = useState(() => new Set());
  const opcoes = { diferenciarMaiusculas: diferenciar };

  const achados = useMemo(
    () =>
      paragrafos
        .map((p) => {
          const texto = semEtiquetas(textoDosTrechos(p.trechos));
          return { ...p, texto, posicoes: ocorrencias(texto, busca, { diferenciarMaiusculas: diferenciar }) };
        })
        .filter((p) => p.posicoes.length > 0),
    [paragrafos, busca, diferenciar],
  );
  const naoEditaveis = useMemo(
    () => soLeitura.reduce((n, b) => n + ocorrencias(b.texto, busca, { diferenciarMaiusculas: diferenciar }).length, 0),
    [soLeitura, busca, diferenciar],
  );
  const marcados = achados.filter((p) => !desmarcados.has(p.chave));
  const total = marcados.reduce((n, p) => n + p.posicoes.length, 0);
  const alternar = (chave) =>
    setDesmarcados((d) => {
      const n = new Set(d);
      if (n.has(chave)) n.delete(chave);
      else n.add(chave);
      return n;
    });

  return (
    <div className="flex flex-col min-h-0 h-full">
      <div className="flex flex-wrap items-center gap-2 mb-2">
        <button onClick={onVoltar} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm text-parchment/80 bg-ink-700 hover:bg-ink-600 rounded-xl">
          <ArrowLeft size={14} /> Voltar ao texto
        </button>
        <p className="ml-auto text-xs text-parchment/50">Troca feita pelo sistema, sem IA. Nada muda até você clicar em “Trocar”.</p>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto rounded-xl border-2 border-yellow-400 bg-black p-4 space-y-3">
        <p className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide font-bold text-yellow-400">
          <Replace size={13} /> Trocar em toda a peça
        </p>
        <div className="grid sm:grid-cols-2 gap-2">
          <label className="block">
            <span className="block text-[11px] text-neutral-400 mb-1">Procurar</span>
            <input
              autoFocus
              value={busca}
              maxLength={300}
              onChange={(ev) => {
                setBusca(ev.target.value);
                setDesmarcados(new Set());
              }}
              placeholder="ex.: 12 3 45 678901-23"
              className="w-full rounded-lg bg-neutral-900 border border-neutral-700 px-2.5 py-1.5 text-sm text-neutral-100 focus:outline-none focus:border-yellow-400"
            />
          </label>
          <label className="block">
            <span className="block text-[11px] text-neutral-400 mb-1">Trocar por</span>
            <input
              value={troca}
              maxLength={300}
              onChange={(ev) => setTroca(ev.target.value)}
              placeholder="deixe vazio para apagar"
              className="w-full rounded-lg bg-neutral-900 border border-neutral-700 px-2.5 py-1.5 text-sm text-neutral-100 focus:outline-none focus:border-yellow-400"
            />
          </label>
        </div>
        <label className="flex items-center gap-2 text-xs text-neutral-300">
          <input type="checkbox" checked={diferenciar} onChange={(ev) => setDiferenciar(ev.target.checked)} />
          Diferenciar maiúsculas e minúsculas
        </label>

        {busca && (
          <p className="text-xs text-neutral-300">
            {achados.length === 0 ? 'Nenhuma ocorrência nos parágrafos editáveis.' : `${achados.reduce((n, p) => n + p.posicoes.length, 0)} ocorrência(s) em ${achados.length} parágrafo(s).`}
          </p>
        )}
        {naoEditaveis > 0 && (
          <p className="text-xs text-amber-300 flex items-start gap-1.5">
            <AlertTriangle size={13} className="mt-0.5 shrink-0" /> {naoEditaveis} ocorrência(s) em tabela, figura ou outra parte só de leitura: essas
            continuam iguais, troque no Word.
          </p>
        )}

        <ul className="space-y-1.5">
          {achados.map((p) => {
            const [ini, fim] = p.posicoes[0];
            const t = trechoEmVolta(p.texto, ini, fim);
            const marcado = !desmarcados.has(p.chave);
            return (
              <li key={p.chave}>
                <label className={`flex items-start gap-2 rounded-lg border px-3 py-2 cursor-pointer ${marcado ? 'border-yellow-400/50 bg-neutral-900' : 'border-neutral-800 opacity-60'}`}>
                  <input type="checkbox" className="mt-1" checked={marcado} onChange={() => alternar(p.chave)} />
                  <span className="flex-1 min-w-0 text-xs">
                    <span className="block text-[11px] text-neutral-500">
                      {p.topico}
                      {p.posicoes.length > 1 ? ` · ${p.posicoes.length} vezes neste parágrafo` : ''}
                    </span>
                    <span className="block text-neutral-200 break-words">
                      {t.antes}
                      <mark className="bg-yellow-400 text-black px-0.5 rounded">{t.achado}</mark>
                      {troca && <span className="text-emerald-300"> → {troca}</span>}
                      {t.depois}
                    </span>
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      </div>
      <div className="flex justify-end mt-2">
        <button
          disabled={total === 0 || troca === busca}
          onClick={() => onAplicar({ busca, troca, alvos: marcados.map((p) => p.alvo), diferenciarMaiusculas: opcoes.diferenciarMaiusculas })}
          className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-extrabold text-black bg-yellow-400 hover:bg-yellow-300 rounded-xl disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Check size={15} /> Trocar {total} ocorrência(s)
        </button>
      </div>
    </div>
  );
}
