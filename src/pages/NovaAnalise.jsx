import React, { useState, useEffect, useRef } from 'react';
import { ArrowLeft, Loader2, AlertTriangle } from 'lucide-react';
import { AreaUpload } from '../components/AreaUpload';
import BotaoComecarAnalise from '../components/BotaoComecarAnalise';
import { formatarBytes, LIMITE_TOTAL_DOCS } from '../lib/prepararDocumentos';
import { uploadDocumento, removerDocumentos } from '../lib/storageDocumentos';

const AREA_CONFIG = {
  principal: {
    id: 'principal',
    titulo: 'Documentos Principais',
    descricao: 'Documentos essenciais para a análise tributária',
    tooltip: 'CDA, Auto de Infração/Notificação, Petição Inicial, Despacho "Cite-se", Mandado Frustrado e SISBAJUD.',
  },
  secundario: {
    id: 'secundario',
    titulo: 'Documentos Secundários',
    descricao: 'Documentos complementares para enriquecer a análise',
    tooltip: 'Extratos (e-CAC/SEFAZ), DCTF/PGDAS, Comprovantes DARF/DAS, Andamento Integral, Decisões Administrativas e CPEN.',
  },
};

const novoId = () =>
  (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`);

const NovaAnalise = ({ user, onIniciarAnalise, onVoltar }) => {
  const [arquivos, setArquivos] = useState([]);
  const [isDraggingGlobal, setIsDraggingGlobal] = useState(false);
  const [analisando, setAnalisando] = useState(false);
  const analiseIdRef = useRef(novoId());

  useEffect(() => {
    const on = () => setIsDraggingGlobal(true);
    const off = () => setIsDraggingGlobal(false);
    window.addEventListener('dragenter', on);
    window.addEventListener('dragleave', off);
    window.addEventListener('drop', off);
    return () => {
      window.removeEventListener('dragenter', on);
      window.removeEventListener('dragleave', off);
      window.removeEventListener('drop', off);
    };
  }, []);

  const enviarParaStorage = async (novos) => {
    for (const item of novos) {
      if (item.status !== 'processando' || !item._file) continue;
      try {
        const { storagePath, mime, tamanho } = await uploadDocumento({
          userId: user?.id,
          analiseId: analiseIdRef.current,
          fileId: item.id,
          file: item._file,
        });
        setArquivos((prev) =>
          prev.map((a) =>
            a.id === item.id
              ? { ...a, status: 'pronto', mimeFinal: mime, storagePath, tamanhoFinal: tamanho, _file: undefined }
              : a,
          ),
        );
      } catch (err) {
        console.error('[NovaAnalise] Falha ao enviar arquivo:', err);
        setArquivos((prev) =>
          prev.map((a) =>
            a.id === item.id
              ? { ...a, status: 'erro', motivoErro: err?.message || 'Falha ao enviar o arquivo.', _file: undefined }
              : a,
          ),
        );
      }
    }
  };

  const handleAdicionarArquivos = (_areaId, novosArquivos) => {
    setArquivos((prev) => [...prev, ...novosArquivos]);
    enviarParaStorage(novosArquivos);
  };

  const handleRemoverArquivo = (arquivoId) => {
    setArquivos((prev) => {
      const alvo = prev.find((a) => a.id === arquivoId);
      if (alvo?.storagePath) removerDocumentos([alvo.storagePath]);
      return prev.filter((a) => a.id !== arquivoId);
    });
  };

  const prontos = arquivos.filter((a) => a.status === 'pronto' && a.storagePath);
  const principaisProntos = prontos.filter((a) => a.area === 'principal');
  const processando = arquivos.some((a) => a.status === 'processando');
  const totalBytes = prontos.reduce((s, a) => s + (a.tamanhoFinal || 0), 0);
  const acimaDoLimite = totalBytes > LIMITE_TOTAL_DOCS;
  const podeAnalisar =
    principaisProntos.length > 0 && !processando && !acimaDoLimite && !analisando;

  const handleAnalisar = () => {
    if (!podeAnalisar) return;
    const payload = {
      metadata: {
        usuario_id: user?.id || null,
        analise_id: analiseIdRef.current,
        timestamp: new Date().toISOString(),
        total_arquivos: prontos.length,
        origem: 'tributagil_web',
      },
      documentos: prontos.map((a) => ({
        id: a.id,
        nome: a.nome,
        mime_type: a.mimeFinal || a.tipo,
        categoria: a.area,
        storage_path: a.storagePath,
      })),
    };
    setAnalisando(true);
    onIniciarAnalise(payload);
  };

  const pctLimite = Math.min(100, Math.round((totalBytes / LIMITE_TOTAL_DOCS) * 100));

  return (
    <div className="bg-noir min-h-screen font-sans text-parchment">
      <header className="border-b border-line">
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-6 py-5">
          <button
            onClick={onVoltar}
            disabled={analisando}
            className="rounded-lg border border-line p-2 text-parchment/50 transition-colors hover:border-gold/40 hover:text-gold disabled:opacity-40"
          >
            <ArrowLeft size={18} />
          </button>
          <div>
            <h1 className="font-display text-xl font-semibold text-parchment">Nova Análise</h1>
            <p className="text-sm text-parchment/45">
              Anexe os documentos — a IA analisa <strong className="text-parchment/70">somente</strong> o que for enviado aqui.
            </p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-10">
        <div className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
          <AreaUpload
            config={AREA_CONFIG.principal}
            arquivos={arquivos}
            onAdicionarArquivos={handleAdicionarArquivos}
            onRemoverArquivo={handleRemoverArquivo}
            isDraggingGlobal={isDraggingGlobal}
          />
          <AreaUpload
            config={AREA_CONFIG.secundario}
            arquivos={arquivos}
            onAdicionarArquivos={handleAdicionarArquivos}
            onRemoverArquivo={handleRemoverArquivo}
            isDraggingGlobal={isDraggingGlobal}
          />
        </div>

        {prontos.length > 0 && (
          <div className="mb-8">
            <div className="mb-1 flex items-center justify-between text-xs text-parchment/45">
              <span>Tamanho total dos documentos</span>
              <span className={acimaDoLimite ? 'font-semibold text-red-400' : ''}>
                {formatarBytes(totalBytes)} / {formatarBytes(LIMITE_TOTAL_DOCS)}
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-ink-700">
              <div
                className={`h-full rounded-full transition-all ${acimaDoLimite ? 'bg-red-500' : 'bg-gold'}`}
                style={{ width: `${pctLimite}%` }}
              />
            </div>
            {acimaDoLimite && (
              <p className="mt-2 flex items-start gap-1.5 text-xs text-red-400">
                <AlertTriangle size={13} className="mt-0.5 flex-shrink-0" />
                Limite excedido. Remova alguns arquivos desta análise.
              </p>
            )}
          </div>
        )}

        <div className="flex flex-col items-center gap-3 pt-2">
          <BotaoComecarAnalise onComecar={handleAnalisar} disabled={!podeAnalisar}>
            {analisando ? 'Enviando para análise...' : 'Analisar Documento'}
          </BotaoComecarAnalise>

          {processando && (
            <p className="flex items-center gap-2 text-xs text-parchment/45">
              <Loader2 size={13} className="animate-spin" /> Preparando arquivos...
            </p>
          )}
          {!processando && principaisProntos.length === 0 && (
            <p className="text-xs text-parchment/35">Adicione ao menos 1 documento principal.</p>
          )}
        </div>
      </main>
    </div>
  );
};

export default NovaAnalise;
