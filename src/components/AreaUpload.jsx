import React, { useRef, useState } from 'react';
import { UploadCloud, FileText, X, AlertCircle, Loader2, CheckCircle2, Lock } from 'lucide-react';
import { formatarBytes, MAX_PDF_BYTES, MAX_IMAGEM_BYTES } from '../lib/prepararDocumentos';

// ============================================================
// ÁREA DE UPLOAD (drag & drop) — design system preto + dourado
// Status por arquivo: 'processando' | 'pronto' | 'erro'
// ============================================================

const TIPOS_ACEITOS = ['application/pdf', 'image/png', 'image/jpeg', 'image/webp'];

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
        _file: file,
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
    <section className="rounded-[var(--radius-xl2)] border border-line bg-ink-800/50 p-4 sm:p-6">
      <header className="mb-3">
        <h3 className="font-display text-base font-semibold text-parchment/90">{config.titulo}</h3>
        <p className="text-xs text-parchment/45">{config.descricao}</p>
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
        className={`flex w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-6 text-center transition-all ${
          destacar
            ? 'border-gold/60 bg-gold/[0.06]'
            : 'border-line bg-ink-900/50 hover:border-gold/30 hover:bg-ink-900'
        }`}
        title={config.tooltip}
      >
        <UploadCloud size={28} className="text-gold" />
        <span className="text-sm font-medium text-parchment/85">
          Arraste arquivos aqui ou clique para selecionar
        </span>
        <span className="text-[11px] text-parchment/35">
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
        <p className="mt-2 flex items-start gap-1.5 text-xs text-red-400">
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
                arquivo.status === 'erro'
                  ? 'border-red-500/30 bg-red-500/10'
                  : 'border-line bg-ink-900/60'
              }`}
            >
              {arquivo.status === 'processando' ? (
                <Loader2 size={16} className="flex-shrink-0 animate-spin text-parchment/40" />
              ) : arquivo.status === 'erro' ? (
                <AlertCircle size={16} className="flex-shrink-0 text-red-400" />
              ) : arquivo.bloqueado ? (
                <Lock size={16} className="flex-shrink-0 text-parchment/35" />
              ) : (
                <CheckCircle2 size={16} className="flex-shrink-0 text-gold" />
              )}

              <div className="min-w-0 flex-1">
                <p className="truncate text-parchment/85">{arquivo.nome}</p>
                <p className="text-[11px] text-parchment/35">
                  {arquivo.status === 'processando' && 'enviando ao servidor seguro...'}
                  {arquivo.status === 'pronto' && !arquivo.bloqueado &&
                    formatarBytes(arquivo.tamanhoFinal ?? arquivo.tamanho)}
                  {arquivo.status === 'pronto' && arquivo.bloqueado && 'já anexado a este caso'}
                  {arquivo.status === 'erro' && arquivo.motivoErro}
                </p>
              </div>

              {arquivo.bloqueado ? (
                <span
                  className="rounded-md p-1 text-parchment/25"
                  title="Documento já registrado no caso — não pode ser removido ou substituído"
                >
                  <Lock size={14} />
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => onRemoverArquivo(arquivo.id)}
                  className="rounded-md p-1 text-parchment/40 transition-colors hover:bg-white/5 hover:text-parchment/80"
                  aria-label={`Remover ${arquivo.nome}`}
                >
                  <X size={14} />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export default AreaUpload;
