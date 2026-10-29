// src/components/figuras/PainelDaFigura.jsx
//
// Recorte de UMA figura dentro do editor da peça (no lugar da folha): o que a figura precisa mostrar, o estado da busca e
// o EditorRecorte (página do documento com a região proposta). A IA propõe e o código confere o dado lido; quem decide é o
// advogado: confirmar, ajustar a caixa/página ou subir o próprio print. Nenhuma figura entra no Word sem ter sido vista.

import React from 'react';
import { Loader2, AlertTriangle, ArrowLeft, ChevronLeft, ChevronRight, Download, CheckCircle2, Search, BadgeCheck, CircleAlert } from 'lucide-react';
import { estadoDaFigura, ROTULO_ESTADO, referenciaDaFigura, nomeArquivoFigura } from '../../lib/figuras';
import { baixarBlob } from '../../lib/docxFiguras';
import EditorRecorte from './EditorRecorte';

const ICONE_ESTADO = {
  confere: <BadgeCheck size={14} className="text-sky-400" />,
  revisar: <CircleAlert size={14} className="text-amber-400" />,
  nao_achada: <AlertTriangle size={14} className="text-red-400" />,
};

/**
 * @param {{ figura: object, figuras: object[], estado: ReturnType<typeof import('./useFigurasDaPeca').useFigurasDaPeca>,
 *   onTrocar: (numero: number) => void, onVoltar: () => void, onConfirmada: (numero: number) => void }} props
 */
export default function PainelDaFigura({ figura, figuras, estado, onTrocar, onVoltar, onConfirmada }) {
  const { fase, erro, resultados, documentos, procurar, abrirDocumento, imagens, guardarImagem, desfazer } = estado;
  const indice = figuras.findIndex((f) => f.numero === figura.numero);
  const anterior = figuras[indice - 1];
  const proxima = figuras[indice + 1];
  const resultado = resultados[figura.numero];
  const imagem = imagens[figura.numero];
  const situacao = estadoDaFigura(resultado);

  const guardar = (dados) => {
    guardarImagem(figura.numero, dados);
    onConfirmada(figura.numero);
  };

  return (
    <div className="flex flex-col min-h-0 h-full">
      <div className="flex flex-wrap items-center gap-2 mb-2">
        <button onClick={onVoltar} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm text-parchment/80 bg-ink-700 hover:bg-ink-600 rounded-xl">
          <ArrowLeft size={14} /> Voltar ao texto
        </button>
        <span className="ml-auto inline-flex items-center gap-1 text-xs text-parchment/60">
          <button
            onClick={() => anterior && onTrocar(anterior.numero)}
            disabled={!anterior}
            className="p-1.5 rounded-lg bg-ink-700 hover:bg-ink-600 text-parchment disabled:opacity-30"
            aria-label="Figura anterior"
          >
            <ChevronLeft size={14} />
          </button>
          <span className="tabular-nums px-1">
            Figura {figura.numero} de {figuras.length}
          </span>
          <button
            onClick={() => proxima && onTrocar(proxima.numero)}
            disabled={!proxima}
            className="p-1.5 rounded-lg bg-ink-700 hover:bg-ink-600 text-parchment disabled:opacity-30"
            aria-label="Próxima figura"
          >
            <ChevronRight size={14} />
          </button>
        </span>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto rounded-xl border border-line bg-ink-900/40 p-4">
        <div className="mb-3">
          <p className="text-sm font-semibold text-parchment">{figura.legenda}</p>
          <p className="text-xs text-parchment/60">{figura.descricao}</p>
          {figura.evidenciar?.length > 0 && (
            <p className="text-xs text-gold/90 mt-1">
              Precisa aparecer:{' '}
              {figura.evidenciar
                .filter((e) => e.valor)
                .map((e) => `${e.campo} = ${e.valor}`)
                .join('; ')}
            </p>
          )}
          {fase === 'pronto' && (
            <p className="text-[11px] mt-1 flex items-center gap-1.5 text-parchment/50">
              {ICONE_ESTADO[situacao]} {ROTULO_ESTADO[situacao]}
              <span className="text-parchment/30">·</span> {referenciaDaFigura(resultado)}
            </p>
          )}
        </div>

        {fase === 'procurando' && (
          <div className="py-10 flex flex-col items-center gap-3 text-center">
            <Loader2 size={24} className="animate-spin text-gold" />
            <p className="text-sm text-parchment/80 flex items-center gap-2">
              <Search size={14} /> Procurando as {figuras.length} figura(s) nos documentos do caso…
            </p>
            <p className="text-xs text-parchment/40">Leva cerca de um minuto, uma vez só. Nada é inserido sem a sua confirmação.</p>
          </div>
        )}

        {fase === 'erro' && (
          <div className="space-y-3">
            <p className="text-sm text-amber-400 flex items-start gap-2">
              <AlertTriangle size={16} className="mt-0.5 shrink-0" /> {erro}
            </p>
            <button onClick={procurar} className="px-4 py-2 text-sm font-semibold text-ink bg-gold hover:bg-gold/90 rounded-xl">
              Tentar de novo
            </button>
          </div>
        )}

        {fase === 'pronto' && (
          <>
            <EditorRecorte
              key={figura.numero}
              figura={figura}
              resultado={resultado}
              documentos={documentos}
              abrirDocumento={abrirDocumento}
              imagem={imagem}
              onConfirmar={guardar}
              onEnviarPrint={(arquivo) => guardar({ blob: arquivo, origem: 'upload', documento: arquivo.name, pagina: 0, caixa: null })}
              onDesfazer={() => desfazer(figura.numero)}
            />
            {imagem && (
              <div className="mt-3 rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3 space-y-2">
                <p className="text-xs text-emerald-400 flex items-center gap-1.5">
                  <CheckCircle2 size={13} /> Imagem confirmada
                  {imagem.origem === 'upload' ? ' (print enviado por você)' : ` (${imagem.documento}, página ${imagem.pagina})`}
                </p>
                <img src={imagem.url} alt={`Recorte da ${figura.legenda}`} className="max-w-full border border-line bg-white rounded" />
                <button
                  onClick={() => baixarBlob(imagem.blob, nomeArquivoFigura(figura, 'png'))}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs text-parchment/80 bg-ink-700 hover:bg-ink-600 rounded-lg"
                >
                  <Download size={13} /> Baixar esta figura (PNG)
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
