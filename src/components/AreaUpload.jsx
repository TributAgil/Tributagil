import React, { useRef, useState } from 'react';
import { UploadCloud, FileText, X, AlertCircle } from 'lucide-react';

// ============================================
// COMPONENTE: ÁREA DE UPLOAD (drag & drop + seleção)
// ============================================
// Produz objetos de arquivo no formato que `NovaAnalise` consome:
//   { id, nome, extensao, tipo, tamanho, area, status }
// `status: 'pronto'` marca o arquivo como válido para envio.

const TIPOS_ACEITOS = ['application/pdf', 'image/png', 'image/jpeg', 'image/webp'];
const TAMANHO_MAX_BYTES = 20 * 1024 * 1024; // 20 MB

// Classes fixas por cor — necessário porque o Tailwind não detecta classes
// montadas dinamicamente (ex.: `border-${cor}-500`).
const CORES = {
  emerald: {
    base: 'border-emerald-200',
    ativo: 'border-emerald-500 bg-emerald-50',
    icone: 'text-emerald-600',
    chip: 'bg-emerald-50 text-emerald-700 border-emerald-100',
  },
  blue: {
    base: 'border-blue-200',
    ativo: 'border-blue-500 bg-blue-50',
    icone: 'text-blue-600',
    chip: 'bg-blue-50 text-blue-700 border-blue-100',
  },
};

function formatarTamanho(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function validar(file) {
  if (!TIPOS_ACEITOS.includes(file.type)) {
    return 'Formato não suportado (use PDF, PNG, JPG ou WEBP).';
  }
  if (file.size > TAMANHO_MAX_BYTES) {
    return `Arquivo muito grande (máx. ${formatarTamanho(TAMANHO_MAX_BYTES)}).`;
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
    const novos = [];
    for (const file of Array.from(fileList)) {
      const problema = validar(file);
      novos.push({
        id: `${config.id}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        nome: file.name,
        extensao: file.name.includes('.') ? `.${file.name.split('.').pop().toLowerCase()}` : '',
        tipo: file.type,
        tamanho: file.size,
        area: config.id,
        status: problema ? 'erro' : 'pronto',
        motivoErro: problema ?? undefined,
        // Referência ao File original — útil se, futuramente, for preciso
        // converter para base64 e enviar o conteúdo à IA.
        _file: file,
      });
      if (problema) setErro(problema);
    }
    if (novos.length > 0) onAdicionarArquivos(config.id, novos);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragLocal(false);
    if (e.dataTransfer?.files?.length) processarLista(e.dataTransfer.files);
  };

  const handleInput = (e) => {
    if (e.target.files?.length) processarLista(e.target.files);
    e.target.value = ''; // permite re-selecionar o mesmo arquivo
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
          PDF, PNG, JPG ou WEBP • até {formatarTamanho(TAMANHO_MAX_BYTES)}
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
        <p className="mt-2 flex items-center gap-1.5 text-xs text-red-600">
          <AlertCircle size={13} />
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
                  ? 'border-red-200 bg-red-50'
                  : 'border-slate-200 bg-slate-50'
              }`}
            >
              <FileText
                size={16}
                className={arquivo.status === 'erro' ? 'text-red-500' : 'text-slate-400'}
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-slate-700">{arquivo.nome}</p>
                <p className="text-[11px] text-slate-400">
                  {formatarTamanho(arquivo.tamanho)}
                  {arquivo.status === 'erro' && ` • ${arquivo.motivoErro}`}
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
