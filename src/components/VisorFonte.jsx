// src/components/VisorFonte.jsx
//
// Abre o documento citado numa resposta do Lu, na página da fonte, com o trecho ao lado. O caminho do arquivo vem da
// fonte (resposta de IA) ou é descoberto pelo nome do documento (fonte do parecer, que só traz o nome). O pdf.js é
// carregado sob demanda, só quando alguém clica numa fonte.
import React, { useEffect, useRef, useState } from 'react';
import { X, Loader2, AlertCircle, ChevronLeft, ChevronRight } from 'lucide-react';
import { baixarDocumentoDaAnalise } from '../lib/figuras';
import { abrirDocumento } from '../lib/pdfPaginas';
import { listarDocumentosCaso } from '../lib/casos';

const semAcento = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

async function localizarDocumento(fonte, casoId) {
  if (fonte.storage_path) return { storage_path: fonte.storage_path, mime_type: 'application/pdf', nome: fonte.documento };
  const docs = await listarDocumentosCaso(casoId);
  const alvo = semAcento(fonte.documento);
  return (
    docs.find((d) => semAcento(d.nome) === alvo) ||
    docs.find((d) => semAcento(d.nome).includes(alvo) || alvo.includes(semAcento(d.nome))) ||
    null
  );
}

export default function VisorFonte({ fonte, casoId, onFechar }) {
  const canvasRef = useRef(null);
  const docRef = useRef(null);
  const [estado, setEstado] = useState('abrindo'); // 'abrindo' | 'ok' | 'erro'
  const [pagina, setPagina] = useState(fonte.pagina || 1);
  const [total, setTotal] = useState(1);

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const doc = await localizarDocumento(fonte, casoId);
        if (!doc) throw new Error('Documento não encontrado neste caso.');
        const buffer = await baixarDocumentoDaAnalise(doc.storage_path);
        const aberto = await abrirDocumento(buffer, doc.mime_type || 'application/pdf');
        if (!vivo) {
          aberto.fechar?.();
          return;
        }
        docRef.current = aberto;
        setTotal(aberto.numPaginas);
        setEstado('ok');
      } catch (err) {
        console.warn('[VisorFonte] Falha ao abrir a fonte:', err);
        if (vivo) setEstado('erro');
      }
    })();
    return () => {
      vivo = false;
      docRef.current?.fechar?.();
    };
  }, [fonte, casoId]);

  useEffect(() => {
    if (estado !== 'ok' || !canvasRef.current) return;
    docRef.current.desenhar(canvasRef.current, Math.min(Math.max(1, pagina), total), 900).catch(() => setEstado('erro'));
  }, [estado, pagina, total]);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60" onClick={onFechar} />
      <div className="relative flex max-h-[92vh] w-full max-w-4xl flex-col rounded-2xl border border-line bg-ink-800 shadow-2xl" role="dialog" aria-label="Fonte da resposta">
        <div className="flex items-center gap-3 border-b border-line p-4">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-parchment">{fonte.documento}</p>
            <p className="text-xs text-parchment/50">
              {fonte.pagina ? `Página citada: ${fonte.pagina}` : 'O parecer não indica a página: confira o documento.'}
            </p>
          </div>
          <button onClick={onFechar} className="ml-auto text-parchment/40 hover:text-parchment" aria-label="Fechar">
            <X size={18} />
          </button>
        </div>
        {fonte.trecho && <p className="border-b border-line bg-ink-900/60 px-4 py-2 text-xs italic text-parchment/60">“{fonte.trecho}”</p>}
        <div className="min-h-[12rem] flex-1 overflow-auto bg-ink-900 p-4 text-center">
          {estado === 'abrindo' && <Loader2 className="mx-auto mt-10 animate-spin text-gold" />}
          {estado === 'erro' && (
            <p className="mt-10 flex items-center justify-center gap-2 text-sm text-amber-400">
              <AlertCircle size={16} /> Não foi possível abrir este documento agora.
            </p>
          )}
          {estado === 'ok' && <canvas ref={canvasRef} className="mx-auto max-w-full bg-white" />}
        </div>
        {estado === 'ok' && total > 1 && (
          <div className="flex items-center justify-center gap-3 border-t border-line p-3 text-xs text-parchment/70">
            <button onClick={() => setPagina((p) => Math.max(1, p - 1))} disabled={pagina <= 1} className="rounded-lg bg-ink-700 p-1.5 disabled:opacity-40" aria-label="Página anterior">
              <ChevronLeft size={14} />
            </button>
            página {pagina} de {total}
            <button onClick={() => setPagina((p) => Math.min(total, p + 1))} disabled={pagina >= total} className="rounded-lg bg-ink-700 p-1.5 disabled:opacity-40" aria-label="Próxima página">
              <ChevronRight size={14} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
