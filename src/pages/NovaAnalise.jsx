import React, { useState, useEffect, useRef } from 'react';
import { ChevronRight, BrainCircuit, Loader2, AlertTriangle } from 'lucide-react';
import { AreaUpload } from '../components/AreaUpload';
import { BlocoResultado } from '../components/BlocoResultado';
import { formatarBytes, LIMITE_TOTAL_DOCS } from '../lib/prepararDocumentos';
import { uploadDocumento, removerDocumentos } from '../lib/storageDocumentos';

const AREA_CONFIG = {
  principal: {
    id: 'principal',
    titulo: 'Documentos Principais',
    descricao: 'Documentos essenciais para a análise tributária',
    tooltip: 'CDA, Auto de Infração/Notificação, Petição Inicial, Despacho "Cite-se", Mandado Frustrado e SISBAJUD.',
    cor: 'emerald',
  },
  secundario: {
    id: 'secundario',
    titulo: 'Documentos Secundários',
    descricao: 'Documentos complementares para enriquecer a análise',
    tooltip: 'Extratos (e-CAC/SEFAZ), DCTF/PGDAS, Comprovantes DARF/DAS, Andamento Integral, Decisões Administrativas e CPEN.',
    cor: 'blue',
  },
};

const novoId = () =>
  (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`);

const NovaAnalise = ({ user, onIniciarAnalise, onVoltar }) => {
  const [arquivos, setArquivos] = useState([]);
  const [isDraggingGlobal, setIsDraggingGlobal] = useState(false);
  const [analisando, setAnalisando] = useState(false);
  // Uma pasta no Storage por sessão de "Nova Análise".
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

  // Sobe cada novo arquivo para o Supabase Storage, em segundo plano.
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
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-40">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center gap-3">
          <button
            onClick={onVoltar}
            disabled={analisando}
            className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-all disabled:opacity-40"
          >
            <ChevronRight size={20} className="rotate-180" />
          </button>
          <div>
            <h1 className="text-xl font-bold text-slate-800">Nova Análise</h1>
            <p className="text-sm text-slate-500">
              Anexe os documentos — a IA analisa <strong>somente</strong> o que for enviado aqui.
            </p>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-6">
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

        {/* Medidor do limite */}
        {prontos.length > 0 && (
          <div className="mb-6">
            <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
              <span>Tamanho total dos documentos</span>
              <span className={acimaDoLimite ? 'text-red-600 font-semibold' : ''}>
                {formatarBytes(totalBytes)} / {formatarBytes(LIMITE_TOTAL_DOCS)}
              </span>
            </div>
            <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${acimaDoLimite ? 'bg-red-500' : 'bg-emerald-500'}`}
                style={{ width: `${pctLimite}%` }}
              />
            </div>
            {acimaDoLimite && (
              <p className="mt-2 flex items-start gap-1.5 text-xs text-red-600">
                <AlertTriangle size={13} className="mt-0.5 flex-shrink-0" />
                Limite excedido. Remova alguns arquivos desta análise.
              </p>
            )}
          </div>
        )}

        <div className="flex flex-col items-center gap-2">
          <button
            onClick={handleAnalisar}
            disabled={!podeAnalisar}
            className={`group relative px-8 py-4 rounded-2xl font-semibold text-lg shadow-xl transition-all flex items-center gap-3 ${
              podeAnalisar
                ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-600/25 hover:shadow-emerald-600/40 hover:-translate-y-0.5'
                : 'bg-slate-200 text-slate-400 cursor-not-allowed'
            }`}
          >
            {analisando || processando ? (
              <>
                <Loader2 size={22} className="animate-spin" />
                {analisando ? 'Enviando para análise...' : 'Enviando arquivos...'}
              </>
            ) : (
              <>
                <BrainCircuit size={22} className="group-hover:scale-110 transition-transform" />
                Analisar com IA
                {prontos.length > 0 && (
                  <span className="ml-1 text-sm bg-white/20 px-2 py-0.5 rounded-lg">{prontos.length}</span>
                )}
              </>
            )}
          </button>
          {principaisProntos.length === 0 && !processando && (
            <p className="text-xs text-slate-400">Adicione ao menos 1 documento principal.</p>
          )}
        </div>

        <BlocoResultado resultado={null} />
      </main>
    </div>
  );
};

export default NovaAnalise;
