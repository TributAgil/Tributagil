// src/components/figuras/EditorRecorte.jsx
//
// Editor de UMA figura: mostra a página do documento com a região proposta destacada. O advogado pode arrastar a
// caixa, redimensionar pelas alças, desenhar uma nova arrastando no fundo da página, trocar de página ou de documento
// e, quando estiver certo, confirmar o recorte (PNG) ou subir o próprio print.

import React, { useEffect, useRef, useState } from 'react';
import { Loader2, ChevronLeft, ChevronRight, Check, Upload, AlertTriangle, Undo2 } from 'lucide-react';
import { caixaSegura, caixaParaEstilo, moverCaixa, redimensionarCaixa, pixelsParaUnidades, MIN_LADO } from '../../lib/figuras';

const LARGURA_TELA = 900; // largura em pixels em que a página é desenhada na tela (o CSS a ajusta ao espaço)
const ALCAS = [
  ['n', 'left-1/2 -top-1.5 -translate-x-1/2 cursor-ns-resize'],
  ['s', 'left-1/2 -bottom-1.5 -translate-x-1/2 cursor-ns-resize'],
  ['o', '-left-1.5 top-1/2 -translate-y-1/2 cursor-ew-resize'],
  ['l', '-right-1.5 top-1/2 -translate-y-1/2 cursor-ew-resize'],
  ['no', '-left-1.5 -top-1.5 cursor-nwse-resize'],
  ['nl', '-right-1.5 -top-1.5 cursor-nesw-resize'],
  ['so', '-left-1.5 -bottom-1.5 cursor-nesw-resize'],
  ['sl', '-right-1.5 -bottom-1.5 cursor-nwse-resize'],
];

export default function EditorRecorte({ figura, resultado, documentos, abrirDocumento, imagem, onConfirmar, onEnviarPrint, onDesfazer }) {
  const inicial = resultado?.storage_path || documentos[0]?.storage_path || '';
  const [docPath, setDocPath] = useState(inicial);
  const [pagina, setPagina] = useState(resultado?.pagina || 1);
  const [caixa, setCaixa] = useState(resultado?.caixa ? caixaSegura(resultado.caixa) : null);
  const [doc, setDoc] = useState(null);
  const [fase, setFase] = useState('abrindo'); // 'abrindo' | 'pronto' | 'erro'
  const [erro, setErro] = useState('');
  const [confirmando, setConfirmando] = useState(false);
  const canvasRef = useRef(null);
  const quadroRef = useRef(null);
  const janelaRef = useRef(null);
  const arrasteRef = useRef(null);
  const caixaInicialRef = useRef(resultado?.caixa ? caixaSegura(resultado.caixa) : null);
  const inputRef = useRef(null);

  // abre o documento escolhido
  useEffect(() => {
    let vivo = true;
    setFase('abrindo');
    setErro('');
    abrirDocumento(docPath)
      .then((d) => {
        if (!vivo) return;
        setDoc(d);
        setPagina((p) => Math.min(Math.max(1, p), d.numPaginas));
      })
      .catch((err) => {
        if (!vivo) return;
        setErro(err?.message || 'Não foi possível abrir o documento.');
        setFase('erro');
      });
    return () => {
      vivo = false;
    };
  }, [docPath, abrirDocumento]);

  // desenha a página
  useEffect(() => {
    if (!doc || !canvasRef.current) return undefined;
    let vivo = true;
    doc
      .desenhar(canvasRef.current, pagina, LARGURA_TELA)
      .then(({ altura }) => {
        if (!vivo) return;
        setFase('pronto');
        // a janela mostra um pedaço da página: leva a caixa proposta para o meio dela (ou o topo, se não há caixa)
        const janela = janelaRef.current;
        if (janela) {
          const alturaExibida = (altura / canvasRef.current.width) * Math.min(janela.clientWidth, LARGURA_TELA);
          const alvo = caixaInicialRef.current ? ((caixaInicialRef.current[0] + caixaInicialRef.current[2]) / 2000) * alturaExibida : 0;
          janela.scrollTop = Math.max(0, alvo - janela.clientHeight / 2);
        }
      })
      .catch((err) => {
        if (!vivo) return;
        setErro(err?.message || 'Não foi possível desenhar a página.');
        setFase('erro');
      });
    return () => {
      vivo = false;
    };
  }, [doc, pagina]);

  const mudarDocumento = (path) => {
    setDocPath(path);
    setPagina(1);
    setCaixa(null);
    caixaInicialRef.current = null;
  };
  const mudarPagina = (n) => {
    setPagina(n);
    setCaixa(null); // a região proposta valia para a outra página
    caixaInicialRef.current = null;
  };

  // ---- arrasto -------------------------------------------------------------------------------------------------------
  const iniciar = (ev, modo) => {
    if (fase !== 'pronto') return;
    ev.preventDefault();
    ev.stopPropagation();
    const rect = quadroRef.current.getBoundingClientRect();
    const px = ev.clientX - rect.left;
    const py = ev.clientY - rect.top;
    quadroRef.current.setPointerCapture?.(ev.pointerId);
    if (modo === 'nova') {
      const y = (py / rect.height) * 1000;
      const x = (px / rect.width) * 1000;
      arrasteRef.current = { modo, rect, origem: [y, x] };
      setCaixa(caixaSegura([y, x, y + MIN_LADO, x + MIN_LADO]));
    } else {
      arrasteRef.current = { modo, rect, x: ev.clientX, y: ev.clientY, base: caixaSegura(caixa) };
    }
  };
  const arrastar = (ev) => {
    const a = arrasteRef.current;
    if (!a) return;
    if (a.modo === 'nova') {
      const y = limita(((ev.clientY - a.rect.top) / a.rect.height) * 1000);
      const x = limita(((ev.clientX - a.rect.left) / a.rect.width) * 1000);
      setCaixa(caixaSegura([Math.min(a.origem[0], y), Math.min(a.origem[1], x), Math.max(a.origem[0], y), Math.max(a.origem[1], x)]));
      return;
    }
    const dy = pixelsParaUnidades(ev.clientY - a.y, a.rect.height);
    const dx = pixelsParaUnidades(ev.clientX - a.x, a.rect.width);
    setCaixa(a.modo === 'mover' ? moverCaixa(a.base, dy, dx) : redimensionarCaixa(a.base, a.modo, dy, dx));
  };
  const soltar = () => {
    arrasteRef.current = null;
  };

  const confirmar = async () => {
    if (!doc || !caixa) return;
    setConfirmando(true);
    try {
      const blob = await doc.recortar(pagina, caixa);
      const d = documentos.find((x) => x.storage_path === docPath);
      onConfirmar({ blob, origem: 'recorte', documento: d?.nome || '', pagina, caixa });
    } catch (err) {
      setErro(err?.message || 'Não foi possível gerar o recorte.');
    } finally {
      setConfirmando(false);
    }
  };

  const aoEscolherArquivo = (ev) => {
    const arquivo = ev.target.files?.[0];
    ev.target.value = '';
    if (arquivo && /^image\/(png|jpe?g|webp)$/i.test(arquivo.type)) onEnviarPrint(arquivo);
    else if (arquivo) setErro('Envie o print como imagem (PNG, JPG ou WebP).');
  };

  const docAtual = documentos.find((d) => d.storage_path === docPath);
  const estilo = caixa ? caixaParaEstilo(caixa) : null;

  return (
    <div className="space-y-3">
      {/* escolha de documento e página */}
      <div className="flex flex-wrap items-center gap-2 text-xs">
        {documentos.length > 1 && (
          <select
            value={docPath}
            onChange={(e) => mudarDocumento(e.target.value)}
            className="bg-ink-900 border border-line rounded-lg px-2 py-1.5 text-parchment max-w-[16rem]"
            aria-label="Documento"
          >
            {documentos.map((d) => (
              <option key={d.storage_path} value={d.storage_path}>
                {d.nome}
              </option>
            ))}
          </select>
        )}
        {documentos.length === 1 && <span className="text-parchment/60 truncate max-w-[16rem]">{docAtual?.nome}</span>}
        {doc && (
          <div className="inline-flex items-center gap-1">
            <button
              onClick={() => mudarPagina(pagina - 1)}
              disabled={pagina <= 1}
              className="p-1.5 rounded-lg bg-ink-700 hover:bg-ink-600 text-parchment disabled:opacity-30"
              aria-label="Página anterior"
            >
              <ChevronLeft size={14} />
            </button>
            <span className="text-parchment/80 tabular-nums">
              página {pagina} de {doc.numPaginas}
            </span>
            <button
              onClick={() => mudarPagina(pagina + 1)}
              disabled={pagina >= doc.numPaginas}
              className="p-1.5 rounded-lg bg-ink-700 hover:bg-ink-600 text-parchment disabled:opacity-30"
              aria-label="Próxima página"
            >
              <ChevronRight size={14} />
            </button>
          </div>
        )}
        <span className="ml-auto text-parchment/40">Arraste a caixa, use as alças ou desenhe uma nova no fundo da página.</span>
      </div>

      {/* página + caixa */}
      <div ref={janelaRef} className="relative rounded-xl border border-line bg-ink-900 overflow-y-auto max-h-[46vh]">
        {fase !== 'pronto' && fase !== 'erro' && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-ink-900/70">
            <Loader2 size={22} className="animate-spin text-gold" />
          </div>
        )}
        {fase === 'erro' && (
          <p className="p-6 text-sm text-amber-400 flex items-start gap-2">
            <AlertTriangle size={16} className="mt-0.5 shrink-0" /> {erro}
          </p>
        )}
        <div
          ref={quadroRef}
          className="relative mx-auto select-none touch-none"
          style={{ maxWidth: LARGURA_TELA, display: fase === 'erro' ? 'none' : 'block', cursor: fase === 'pronto' ? 'crosshair' : 'default' }}
          onPointerDown={(e) => iniciar(e, 'nova')}
          onPointerMove={arrastar}
          onPointerUp={soltar}
          onPointerCancel={soltar}
        >
          <canvas ref={canvasRef} className="block w-full h-auto bg-white" aria-label={`Página ${pagina} do documento`} />
          {estilo && fase === 'pronto' && (
            <div
              className="absolute border-2 border-gold bg-gold/15 cursor-move"
              style={{ ...estilo, boxShadow: '0 0 0 9999px rgba(0,0,0,0.38)' }}
              onPointerDown={(e) => iniciar(e, 'mover')}
              data-testid="caixa-recorte"
            >
              {ALCAS.map(([alca, pos]) => (
                <span
                  key={alca}
                  className={`absolute w-3 h-3 rounded-sm bg-gold border border-ink ${pos}`}
                  onPointerDown={(e) => iniciar(e, alca)}
                  data-alca={alca}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* trecho que a IA leu */}
      {resultado?.trecho_visto && (
        <p className="text-[11px] text-parchment/50 leading-relaxed">
          <span className="text-parchment/70">Texto lido na região proposta pela IA:</span> “{resultado.trecho_visto}”
        </p>
      )}

      {/* ações */}
      <div className="flex flex-wrap items-center gap-2">
        {imagem ? (
          <button onClick={onDesfazer} className="inline-flex items-center gap-1.5 px-3 py-2 text-xs text-parchment/80 bg-ink-700 hover:bg-ink-600 rounded-xl">
            <Undo2 size={14} /> Desfazer confirmação e ajustar de novo
          </button>
        ) : (
          <button
            onClick={confirmar}
            disabled={!caixa || fase !== 'pronto' || confirmando}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-ink bg-gold hover:bg-gold/90 rounded-xl disabled:opacity-40"
          >
            {confirmando ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Confirmar este recorte
          </button>
        )}
        <button onClick={() => inputRef.current?.click()} className="inline-flex items-center gap-1.5 px-3 py-2 text-xs text-parchment/80 bg-ink-700 hover:bg-ink-600 rounded-xl">
          <Upload size={14} /> Usar o meu próprio print
        </button>
        <input ref={inputRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={aoEscolherArquivo} />
        {erro && fase !== 'erro' && <span className="text-xs text-amber-400">{erro}</span>}
      </div>
    </div>
  );
}

const limita = (v) => Math.max(0, Math.min(1000, v));
