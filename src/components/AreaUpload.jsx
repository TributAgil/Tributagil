import React, { useRef, useState } from 'react';
import { UploadCloud, FileText, X, AlertCircle, Loader2, CheckCircle2 } from 'lucide-react';
import { formatarBytes, MAX_PDF_BYTES, MAX_IMAGEM_BYTES } from '../lib/prepararDocumentos';

// ============================================
// COMPONENTE: ÁREA DE UPLOAD (drag & drop + seleção)
// ============================================
// Só faz: escolher arquivos, validar tipo/tamanho e exibir a lista.
// O upload para o Supabase Storage (e a compressão de imagens) acontece em
// `NovaAnalise`, que é a dona do estado. Status de cada arquivo:
//   'processando' → subindo p/ o Storage    'pronto'    'erro'
//
// O objeto entregue por `onAdicionarArquivos` traz o File original em `_file`.

const TIPOS_ACEITOS = ['application/pdf', 'image/png', 'image/jpeg', 'image/webp'];

const CORES = {
  emerald: { base: 'border-emerald-200', ativo: 'border-emerald-500 bg-emerald-50', icone: 'text-emerald-600' },
  blue: { base: 'border-blue-200', ativo: 'border-blue-500 bg-blue-50', icone: 'text-blue-600' },
};

function validar(file) {
  if (!TIPOS_ACEITOS.includes(file.type)) {
    return 'Formato não suportado (use PDF, PNG, JPG ou WEBP).';
  }
  if (file.type === 'application/pdf' && file.size > MAX_PDF_BYTES) {
    return `PDF muito grande (máx. ${formatarBytes(MAX_PDF_BYTES)}). Fotografe as páginas ou divida o arquivo.`;
  }
  if (file.type !== 'application/pdf' && file.size > MAX_IMAGEM_BYTES) {
    return `Imagem muito grande (máx. ${formatarBytes(MAX_IMAGEM_BYTES)}).`;
  }
  return null;
}

export function AreaUpload({
  config,
  arquivos,
  onAdicionarArquivos,
  onRemoverArquivo,
  isDraggingGlobal = false,
}) {
  const inputRef = useRef(null);
  const [dragLocal, setDragLocal] = useState(false);
  const [erro, setErro] = useState(null);

  const cor = CORES[config.cor] ?? CORES.emerald;
  const arquivosDaArea = arquivos.filter((a) => a.area === config.id);

  const processarLista = (fileList) => {
    setErro(null);
    const novos = Array.from(fileList).map((file) => {
      const problema = validar(file);
      if (problema) setErro(problema);
      return {
        id: `${config.id}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        nome: file.name,
        extensao: file.name.includes('.') ? `.${file.name.split('.').pop().toLowerCase()}` : '',
        tipo: file.type,
        tamanho: file.size,
        area: config.id,
        status: problema ? 'erro' : 'processando',
        motivoErro: problema ?? undefined,
        _file: file, // NovaAnalise converte para base64
      };
    });
    if (novos.length > 0) onAdicionarArquivos(config.id, novos);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragLocal(false);
    if (e.dataTransfer?.files?.length) processarLista(e.dataTransfer.files);
  };

  const handleInput = (e) => {
    if (e.target.files?.length) processarLista(e.target.files);
    e.target.value = '';
  };

  const destacar = dragLocal || isDraggingGlobal;

  return (
    <section className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
      <header className="mb-3">
        <h3 className="text-base font-semibold text-slate-800">{config.titulo}</h3>
        <p className="text-xs text-slate-500">{config.descricao}</p>
      </header>

      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragLocal(true);
        }}
        onDragLeave={() => setDragLocal(false)}
        onDrop={handleDrop}
        className={`w-full flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-6 text-center transition-all ${
          destacar ? cor.ativo : `${cor.base} bg-slate-50/50 hover:bg-slate-50`
        }`}
        title={config.tooltip}
      >
        <UploadCloud size={28} className={cor.icone} />
        <span className="text-sm font-medium text-slate-700">
          Arraste arquivos aqui ou clique para selecionar
        </span>
        <span className="text-[11px] text-slate-400">
          PDF (até {formatarBytes(MAX_PDF_BYTES)}) ou imagens JPG/PNG/WEBP — vários arquivos
        </span>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={TIPOS_ACEITOS.join(',')}
          onChange={handleInput}
          className="hidden"
        />
      </button>

      {erro && (
        <p className="mt-2 flex items-start gap-1.5 text-xs text-red-600">
          <AlertCircle size={13} className="mt-0.5 flex-shrink-0" />
          {erro}
        </p>
      )}

      {arquivosDaArea.length > 0 && (
        <ul className="mt-4 space-y-2">
          {arquivosDaArea.map((arquivo) => (
            <li
              key={arquivo.id}
              className={`flex items-center gap-3 rounded-lg border px-3 py-2 text-sm ${
                arquivo.status === 'erro' ? 'border-red-200 bg-red-50' : 'border-slate-200 bg-slate-50'
              }`}
            >
              {arquivo.status === 'processando' ? (
                <Loader2 size={16} className="animate-spin text-slate-400 flex-shrink-0" />
              ) : arquivo.status === 'erro' ? (
                <AlertCircle size={16} className="text-red-500 flex-shrink-0" />
              ) : (
                <CheckCircle2 size={16} className="text-emerald-500 flex-shrink-0" />
              )}

              <div className="min-w-0 flex-1">
                <p className="truncate text-slate-700">{arquivo.nome}</p>
                <p className="text-[11px] text-slate-400">
                  {arquivo.status === 'processando' && 'enviando ao servidor seguro...'}
                  {arquivo.status === 'pronto' &&
                    formatarBytes(arquivo.tamanhoFinal ?? arquivo.tamanho)}
                  {arquivo.status === 'erro' && arquivo.motivoErro}
                </p>
              </div>

              <button
                type="button"
                onClick={() => onRemoverArquivo(arquivo.id)}
                className="rounded-md p-1 text-slate-400 transition-colors hover:bg-slate-200 hover:text-slate-600"
                aria-label={`Remover ${arquivo.nome}`}
              >
                <X size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export default AreaUpload;
