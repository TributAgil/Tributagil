import React, { useState, useEffect } from 'react';
import { ChevronRight, BrainCircuit, Loader2, CheckCircle2, FileText } from 'lucide-react';
import CerebroTributario from './CerebroTributario';
import { FormularioDadosPrincipais } from '../components/FormularioDadosPrincipais';
import AreaUpload from '../components/AreaUpload';
import { BlocoResultado } from '../components/BlocoResultado';

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

const NovaAnalise = ({ user, onIniciarAnalise, onVoltar }) => {
  const [dadosPartes, setDadosPartes] = useState({ sujeitoAtivo: '', sujeitoPassivo: '' });
  const [arquivos, setArquivos] = useState([]);
  const [isDraggingGlobal, setIsDraggingGlobal] = useState(false);
  const [analisando, setAnalisando] = useState(false);
  const [resultado, setResultado] = useState(null);
  const [fase, setFase] = useState('upload');
  const [payloadAnalise, setPayloadAnalise] = useState(null);

  useEffect(() => {
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
      partes: dadosPartes,
      documentos: arquivosValidos.map((arquivo) => ({
        id: arquivo.id,
        nome: arquivo.nome,
        extensao: arquivo.extensao,
        tipo_mime: arquivo.tipo,
        tamanho_bytes: arquivo.tamanho,
        categoria: arquivo.area,
      })),
    };

    setPayloadAnalise(payload);
    setFase('processando');
    onIniciarAnalise(payload);
  };

  const arquivosValidos = arquivos.filter((a) => a.status === 'pronto');
  const arquivosPrincipal = arquivosValidos.filter((a) => a.area === 'principal');
  const arquivosSecundario = arquivosValidos.filter((a) => a.area === 'secundario');
  const totalArquivos = arquivosValidos.length;
  const podeAnalisar = arquivosPrincipal.length > 0 && !analisando;

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

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-40">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={onVoltar} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-all">
              <ChevronRight size={20} className="rotate-180" />
            </button>
            <div>
              <h1 className="text-xl font-bold text-slate-800">Nova Análise</h1>
              <p className="text-sm text-slate-500">Upload de documentos e dados para o Cérebro Tributário</p>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8">
        {/* Bloco 1: Dados Principais (Sujeitos) */}
        <FormularioDadosPrincipais dados={dadosPartes} setDados={setDadosPartes} />

        {/* Bloco 2: Áreas de Upload (FormularioAnalise) */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
          <AreaUpload config={AREA_CONFIG.principal} arquivos={arquivos} onAdicionarArquivos={handleAdicionarArquivos} onRemoverArquivo={handleRemoverArquivo} isDraggingGlobal={isDraggingGlobal} />
          <AreaUpload config={AREA_CONFIG.secundario} arquivos={arquivos} onAdicionarArquivos={handleAdicionarArquivos} onRemoverArquivo={handleRemoverArquivo} isDraggingGlobal={isDraggingGlobal} />
        </div>

        {/* Botão de Disparo */}
        <div className="flex items-center justify-center">
          <button
            onClick={handleAnalisar}
            disabled={!podeAnalisar}
            className={`group relative px-8 py-4 rounded-2xl font-semibold text-lg shadow-xl transition-all flex items-center gap-3 ${
              podeAnalisar ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-600/25 hover:shadow-emerald-600/40 hover:-translate-y-0.5' : 'bg-slate-200 text-slate-400 cursor-not-allowed'
            }`}
          >
            {analisando ? (
              <>
                <Loader2 size={22} className="animate-spin" /> Processando documentos...
              </>
            ) : (
              <>
                <BrainCircuit size={22} className="group-hover:scale-110 transition-transform" /> Analisar com IA
                {totalArquivos > 0 && <span className="ml-1 text-sm bg-white/20 px-2 py-0.5 rounded-lg">{totalArquivos}</span>}
              </>
            )}
          </button>
        </div>

        {/* Bloco 3: Resultado */}
        <BlocoResultado resultado={resultado} />
      </main>
    </div>
  );
};

export default NovaAnalise;