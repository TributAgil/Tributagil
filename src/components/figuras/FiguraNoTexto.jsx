// src/components/figuras/FiguraNoTexto.jsx
//
// O lugar de uma figura na folha do editor da peça: com a imagem confirmada, mostra a imagem como vai sair no Word;
// sem ela, um quadro com o que a figura precisa mostrar e o botão para montá-la (abre o recorte ali mesmo no editor).

import React from 'react';
import { Image as ImageIcon, BadgeCheck, CircleAlert, AlertTriangle, Crop, Undo2 } from 'lucide-react';
import { estadoDaFigura, ROTULO_ESTADO, referenciaDaFigura } from '../../lib/figuras';

const ICONE_ESTADO = {
  confere: <BadgeCheck size={13} className="text-sky-600" />,
  revisar: <CircleAlert size={13} className="text-amber-600" />,
  nao_achada: <AlertTriangle size={13} className="text-red-600" />,
};

/**
 * @param {{ numero: number, figura?: object, resultado?: object, buscou: boolean, imagem?: object,
 *   onMontar: () => void, onDesfazer: () => void }} props
 */
export default function FiguraNoTexto({ numero, figura, resultado, buscou, imagem, onMontar, onDesfazer }) {
  if (imagem) {
    return (
      <figure id={`figura-${numero}`} className="group rounded-lg border border-emerald-300/70 bg-emerald-50/40 p-3 not-prose">
        <img src={imagem.url} alt={`Figura ${numero}: ${figura?.descricao || ''}`} className="mx-auto max-h-[22rem] max-w-full border border-neutral-200 bg-white" />
        <figcaption className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-neutral-500">
          <span className="font-semibold text-emerald-700">Figura {numero} confirmada</span>
          <span>{imagem.origem === 'upload' ? 'print enviado por você' : `${imagem.documento}, página ${imagem.pagina}`}</span>
          <span className="ml-auto flex gap-3">
            <button onClick={onMontar} className="inline-flex items-center gap-1 hover:text-neutral-800">
              <Crop size={11} /> Ajustar
            </button>
            <button onClick={onDesfazer} className="inline-flex items-center gap-1 hover:text-red-600">
              <Undo2 size={11} /> Tirar a imagem
            </button>
          </span>
        </figcaption>
      </figure>
    );
  }

  const estado = buscou ? estadoDaFigura(resultado) : null;
  return (
    <div id={`figura-${numero}`} className="rounded-lg border-2 border-dashed border-amber-300 bg-amber-50/60 px-4 py-4 text-center">
      <p className="flex items-center justify-center gap-1.5 text-[11px] uppercase tracking-wide font-semibold text-amber-700">
        <ImageIcon size={13} /> Lugar da figura {numero}
      </p>
      <p className="mt-1 text-[13px] text-neutral-700">{figura?.descricao || figura?.legenda || 'Figura do modelo'}</p>
      {estado && (
        <p className="mt-1 flex items-center justify-center gap-1.5 text-[11px] text-neutral-500">
          {ICONE_ESTADO[estado]} {ROTULO_ESTADO[estado]} · {referenciaDaFigura(resultado)}
        </p>
      )}
      <button
        onClick={onMontar}
        className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-neutral-900 bg-gold hover:bg-gold/90 rounded-lg"
      >
        <Crop size={13} /> Montar a figura {numero}
      </button>
    </div>
  );
}
