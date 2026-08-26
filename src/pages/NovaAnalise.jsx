// src/pages/NovaAnalise.jsx
import React, { useState, useRef, useCallback } from 'react';
import { 
  Upload, 
  FileText, 
  X, 
  AlertCircle, 
  Info, 
  CheckCircle2, 
  FileCheck,
  BrainCircuit,
  Loader2,
  File,
  ChevronRight
} from 'lucide-react';

const EXTENSOES_PERMITIDAS = ['.pdf', '.docx', '.txt'];
const TIPOS_MIME = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/plain'];

const AREA_CONFIG = {
  principal: {
    id: 'principal',
    titulo: 'Documentos Principais',
    descricao: 'Documentos essenciais para a análise tributária',
    tooltip: 'CDA, Auto de Infração/Notificação, Petição Inicial, Despacho "Cite-se", Mandado Frustrado e SISBAJUD.',
    cor: 'emerald',
    icone: FileCheck,
    obrigatorio: true,
  },
  secundario: {
    id: 'secundario',
    titulo: 'Documentos Secundários',
    descricao: 'Documentos complementares para enriquecer a análise',
    tooltip: 'Extratos (e-CAC/SEFAZ), DCTF/PGDAS, Comprovantes DARF/DAS, Andamento Integral, Decisões Administrativas e CPEN.',
    cor: 'blue',
    icone: FileText,
    obrigatorio: false,
  },
};

// ============================================
// COMPONENTE: ÁREA DE UPLOAD (REUTILIZÁVEL)
// ============================================
const AreaUpload = ({ 
  config, 
  arquivos, 
  onAdicionarArquivos, 
  onRemoverArquivo, 
  isDraggingGlobal 
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [mostrarTooltip, setMostrarTooltip] = useState(false);
  const inputRef = useRef(null);

  const { id, titulo, descricao, tooltip, cor, icone: Icone, obrigatorio } = config;
  
  const corClasses = {
    emerald: {
      border: 'border-emerald-200',
      borderHover: 'border-emerald-400',
      bg: 'bg-emerald-50',
      bgHover: 'bg-emerald-100',
      text: 'text-emerald-700',
      textLight: 'text-emerald-600',
      badge: 'bg-emerald-100 text-emerald-700',
      progress: 'bg-emerald-500',
      ring: 'ring-emerald-500/20',
    },
    blue: {
      border: 'border-blue-200',
      borderHover: 'border-blue-400',
      bg: 'bg-blue-50',
      bgHover: 'bg-blue-100',
      text: 'text-blue-700',
      textLight: 'text-blue-600',
      badge: 'bg-blue-100 text-blue-700',
      progress: 'bg-blue-500',
      ring: 'ring-blue-500/20',
    },
  };

  const c = corClasses[cor];

  const validarArquivo = (file) => {
    const extensao = '.' + file.name.split('.').pop().toLowerCase();
    const tipoValido = TIPOS_MIME.includes(file.type) || EXTENSOES_PERMITIDAS.includes(extensao);
    const tamanhoValido = file.size <= 50 * 1024 * 1024; // 50MB max
    
    if (!tipoValido) return { valido: false, erro: `Formato não permitido. Use: ${EXTENSOES_PERMITIDAS.join(', ')}` };
    if (!tamanhoValido) return { valido: false, erro: 'Arquivo excede 50MB' };
    
    return { valido: true };
  };

  const processarArquivos = (files) => {
    const novosArquivos = [];
    
    Array.from(files).forEach((file) => {
      const validacao = validarArquivo(file);
      
      novosArquivos.push({
        id: `${id}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        file,
        nome: file.name,
        tamanho: file.size,
        tipo: file.type,
        extensao: '.' + file.name.split('.').pop().toLowerCase(),
        area: id,
        status: validacao.valido ? 'pronto' : 'erro',
        erro: validacao.erro || null,
        progresso: validacao.valido ? 100 : 0,
      });
    });

    onAdicionarArquivos(id, novosArquivos);
  };

  const handleDragOver = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    processarArquivos(e.dataTransfer.files);
  }, []);

  const handleInputChange = (e) => {
    processarArquivos(e.target.files);
    e.target.value = ''; // Reset para permitir re-upload do mesmo arquivo
  };

  const formatarTamanho = (bytes) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const arquivosArea = arquivos.filter((a) => a.area === id);
  const arquivosValidos = arquivosArea.filter((a) => a.status === 'pronto');
  const arquivosComErro = arquivosArea.filter((a) => a.status === 'erro');

  return (
    <div className="space-y-4">
      {/* Header da área */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-xl ${c.bg} flex items-center justify-center`}>
            <Icone className={`w-5 h-5 ${c.text}`} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-semibold text-slate-800">{titulo}</h3>
              {obrigatorio && (
                <span className="text-xs font-medium text-red-500 bg-red-50 px-2 py-0.5 rounded-full">
                  Obrigatório
                </span>
              )}
              <div className="relative">
                <button
                  type="button"
                  onMouseEnter={() => setMostrarTooltip(true)}
                  onMouseLeave={() => setMostrarTooltip(false)}
                  onClick={() => setMostrarTooltip(!mostrarTooltip)}
                  className="text-slate-400 hover:text-slate-600 transition-colors"
                >
                  <Info size={16} />
                </button>
                {mostrarTooltip && (
                  <div className="absolute left-full ml-2 top-0 w-72 p-3 bg-slate-800 text-white text-xs rounded-lg shadow-xl z-50">
                    <div className="absolute left-0 top-3 -translate-x-1 w-2 h-2 bg-slate-800 rotate-45" />
                    <p className="font-medium mb-1">Documentos esperados:</p>
                    <p className="text-slate-300 leading-relaxed">{tooltip}</p>
                  </div>
                )}
              </div>
            </div>
            <p className="text-sm text-slate-500 mt-0.5">{descricao}</p>
          </div>
        </div>
        {arquivosValidos.length > 0 && (
          <span className={`text-xs font-medium ${c.badge} px-2.5 py-1 rounded-full`}>
            {arquivosValidos.length} arquivo{arquivosValidos.length > 1 ? 's' : ''}
          </span>
        )}
      </div>

      {/* Área de Drop */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        className={`
          relative border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer
          transition-all duration-200
          ${isDragging || isDraggingGlobal 
            ? `${c.borderHover} ${c.bgHover} ring-2 ${c.ring}` 
            : `${c.border} ${c.bg} hover:${c.borderHover} hover:${c.bgHover}`
          }
        `}
      >
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={EXTENSOES_PERMITIDAS.join(',')}
          onChange={handleInputChange}
          className="hidden"
        />
        
        <div className={`mx-auto w-14 h-14 rounded-xl ${c.bg} flex items-center justify-center mb-3`}>
          <Upload className={`w-6 h-6 ${c.text}`} />
        </div>
        
        <p className={`font-medium ${c.text}`}>
          {isDragging ? 'Solte os arquivos aqui' : 'Arraste arquivos ou clique para selecionar'}
        </p>
        <p className="text-xs text-slate-400 mt-1.5">
          PDF, DOCX ou TXT • Máx. 50MB por arquivo
        </p>
      </div>

      {/* Lista de arquivos */}
      {arquivosArea.length > 0 && (
        <div className="space-y-2">
          {arquivosComErro.length > 0 && (
            <div className="flex items-center gap-2 text-amber-600 bg-amber-50 px-3 py-2 rounded-lg text-xs">
              <AlertCircle size={14} />
              <span>{arquivosComErro.length} arquivo(s) com erro de formato</span>
            </div>
          )}
          
          {arquivosArea.map((arquivo) => (
            <div
              key={arquivo.id}
              className={`
                flex items-center gap-3 p-3 rounded-xl border transition-all
                ${arquivo.status === 'erro' 
                  ? 'bg-red-50 border-red-100' 
                  : 'bg-white border-slate-100 hover:border-slate-200'
                }
              `}
            >
              <div className={`
                w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0
                ${arquivo.status === 'erro' ? 'bg-red-100' : c.bg}
              `}>
                {arquivo.status === 'erro' ? (
                  <AlertCircle size={16} className="text-red-500" />
                ) : arquivo.extensao === '.pdf' ? (
                  <FileText size={16} className={c.text} />
                ) : arquivo.extensao === '.docx' ? (
                  <File size={16} className={c.text} />
                ) : (
                  <FileText size={16} className={c.text} />
                )}
              </div>
              
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-medium truncate ${arquivo.status === 'erro' ? 'text-red-700' : 'text-slate-700'}`}>
                  {arquivo.nome}
                </p>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-xs text-slate-400">{formatarTamanho(arquivo.tamanho)}</span>
                  {arquivo.status === 'erro' && (
                    <span className="text-xs text-red-500 font-medium">{arquivo.erro}</span>
                  )}
                </div>
                {arquivo.status === 'pronto' && (
                  <div className="mt-1.5 h-1 bg-slate-100 rounded-full overflow-hidden">
                    <div className={`h-full ${c.progress} rounded-full transition-all`} style={{ width: '100%' }} />
                  </div>
                )}
              </div>

              <button
                onClick={() => onRemoverArquivo(arquivo.id)}
                className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                title="Remover arquivo"
              >
                <X size={16} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// ============================================
// COMPONENTE PRINCIPAL: NOVA ANÁLISE
// ============================================
const NovaAnalise = ({ user, onIniciarAnalise, onVoltar }) => {
  const [arquivos, setArquivos] = useState([]);
  const [isDraggingGlobal, setIsDraggingGlobal] = useState(false);
  const [analisando, setAnalisando] = useState(false);
  const [resultado, setResultado] = useState(null);

  // Drag global para highlight em todas as áreas
  React.useEffect(() => {
    const handleDragEnter = () => setIsDraggingGlobal(true);
    const handleDragEnd = () => setIsDraggingGlobal(false);
    
    window.addEventListener('dragenter', handleDragEnter);
    window.addEventListener('dragleave', handleDragEnd);
    window.addEventListener('drop', handleDragEnd);
    
    return () => {
      window.removeEventListener('dragenter', handleDragEnter);
      window.removeEventListener('dragleave', handleDragEnd);
      window.removeEventListener('drop', handleDragEnd);
    };
  }, []);

  const handleAdicionarArquivos = (areaId, novosArquivos) => {
    setArquivos((prev) => [...prev, ...novosArquivos]);
  };

  const handleRemoverArquivo = (arquivoId) => {
    setArquivos((prev) => prev.filter((a) => a.id !== arquivoId));
  };

  const handleAnalisar = async () => {
  const arquivosValidos = arquivos.filter((a) => a.status === 'pronto');
  const arquivosPrincipal = arquivosValidos.filter((a) => a.area === 'principal');

  if (arquivosPrincipal.length === 0) {
    alert('Adicione pelo menos um documento principal para prosseguir.');
    return;
  }

  const payload = {
    metadata: {
      usuario_id: user?.id || null,
      timestamp: new Date().toISOString(),
      total_arquivos: arquivosValidos.length,
      origem: 'tributagil_web',
    },
    documentos: arquivosValidos.map((arquivo) => ({
      id: arquivo.id,
      nome: arquivo.nome,
      extensao: arquivo.extensao,
      tipo_mime: arquivo.tipo,
      tamanho_bytes: arquivo.tamanho,
      categoria: arquivo.area,
      conteudo_base64: null,
    })),
  };

  onIniciarAnalise(payload); // ← Dispara os dados para o App.jsx gerenciar a próxima tela
};

  const arquivosValidos = arquivos.filter((a) => a.status === 'pronto');
  const arquivosPrincipal = arquivosValidos.filter((a) => a.area === 'principal');
  const arquivosSecundario = arquivosValidos.filter((a) => a.area === 'secundario');
  const totalArquivos = arquivosValidos.length;

  const podeAnalisar = arquivosPrincipal.length > 0 && !analisando;

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-40">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={onVoltar}
              className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-all"
            >
              <ChevronRight size={20} className="rotate-180" />
            </button>
            <div>
              <h1 className="text-xl font-bold text-slate-800">Nova Análise</h1>
              <p className="text-sm text-slate-500">Upload de documentos para processamento inteligente</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <p className="text-sm font-medium text-slate-700">{user?.email || 'Usuário'}</p>
              <p className="text-xs text-slate-400">Advogado</p>
            </div>
            <div className="w-10 h-10 bg-emerald-100 rounded-full flex items-center justify-center">
              <span className="text-emerald-700 font-bold text-sm">
                {(user?.email || 'U')[0].toUpperCase()}
              </span>
            </div>
          </div>
        </div>
      </header>

      {/* Conteúdo */}
      <main className="max-w-5xl mx-auto px-6 py-8">
        {/* Resumo */}
        {totalArquivos > 0 && (
          <div className="mb-6 flex items-center gap-4">
            <div className="flex-1 bg-white rounded-xl border border-slate-200 p-4 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <CheckCircle2 size={18} className="text-emerald-500" />
                  <span className="text-sm font-medium text-slate-700">
                    Principais: <span className="text-emerald-600">{arquivosPrincipal.length}</span>
                  </span>
                </div>
                <div className="w-px h-4 bg-slate-200" />
                <div className="flex items-center gap-2">
                  <FileText size={18} className="text-blue-500" />
                  <span className="text-sm font-medium text-slate-700">
                    Secundários: <span className="text-blue-600">{arquivosSecundario.length}</span>
                  </span>
                </div>
              </div>
              <span className="text-xs text-slate-400">
                {totalArquivos} arquivo{totalArquivos > 1 ? 's' : ''} pronto{totalArquivos > 1 ? 's' : ''} para análise
              </span>
            </div>
          </div>
        )}

        {/* Áreas de Upload */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
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

        {/* Botão de Análise */}
        <div className="mt-10 flex items-center justify-center">
          <button
            onClick={handleAnalisar}
            disabled={!podeAnalisar}
            className={`
              group relative px-8 py-4 rounded-2xl font-semibold text-lg shadow-xl transition-all
              flex items-center gap-3
              ${podeAnalisar
                ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-600/25 hover:shadow-emerald-600/40 hover:-translate-y-0.5'
                : 'bg-slate-200 text-slate-400 cursor-not-allowed'
              }
            `}
          >
            {analisando ? (
              <>
                <Loader2 size={22} className="animate-spin" />
                Processando documentos...
              </>
            ) : (
              <>
                <BrainCircuit size={22} className="group-hover:scale-110 transition-transform" />
                Analisar com IA
                {totalArquivos > 0 && (
                  <span className="ml-1 text-sm bg-white/20 px-2 py-0.5 rounded-lg">
                    {totalArquivos}
                  </span>
                )}
              </>
            )}
          </button>
        </div>

        {!podeAnalisar && !analisando && (
          <p className="text-center text-sm text-slate-400 mt-3">
            Adicione pelo menos um documento principal para iniciar a análise
          </p>
        )}

        {/* Resultado */}
        {resultado && (
          <div className={`mt-8 p-6 rounded-2xl border ${resultado.sucesso ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'}`}>
            <div className="flex items-center gap-3 mb-4">
              {resultado.sucesso ? (
                <CheckCircle2 size={24} className="text-emerald-600" />
              ) : (
                <AlertCircle size={24} className="text-red-600" />
              )}
              <h3 className={`text-lg font-semibold ${resultado.sucesso ? 'text-emerald-800' : 'text-red-800'}`}>
                {resultado.mensagem}
              </h3>
            </div>
            
            {resultado.sucesso && resultado.payload && (
              <div className="bg-white rounded-xl p-4 border border-emerald-100">
                <p className="text-xs font-mono text-slate-500 mb-2">PAYLOAD ENVIADO (preview):</p>
                <pre className="text-xs text-slate-600 overflow-x-auto whitespace-pre-wrap">
                  {JSON.stringify(resultado.payload, null, 2)}
                </pre>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
};

export default NovaAnalise;
import CerebroTributario from './CerebroTributario';
const [fase, setFase] = useState('upload'); // 'upload' | 'processando' | 'resultado'
const [payloadAnalise, setPayloadAnalise] = useState(null);
// NO FINAL DO COMPONENTE NovaAnalise, SUBSTITUA O RETURN:

if (fase === 'processando') {
  return (
    <CerebroTributario
      payload={payloadAnalise}
      onConcluido={() => setFase('resultado')}
      onErro={(err) => {
        console.error(err);
        setFase('upload');
        alert('Erro no processamento. Tente novamente.');
      }}
    />
  );
}

// if (fase === 'resultado') return <ResultadoAnalise ... />; // Etapa 4

return (
  <div className="min-h-screen bg-slate-50">
    {/* ... todo o conteúdo anterior do return ... */}
  </div>
);