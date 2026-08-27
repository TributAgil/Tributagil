// src/pages/CerebroTributario.jsx
import React, { useState, useEffect, useRef } from 'react';
import { 
  Brain, 
  FileSearch, 
  Sparkles, 
  Scale, 
  Gavel, 
  CheckCircle2, 
  Zap,
  Activity,
  ShieldCheck,
  Clock
} from 'lucide-react';

// ============================================
// CONFIGURAÇÃO DOS ESTÁGIOS DE PROCESSAMENTO
// ============================================
const ESTAGIOS = [
  {
    id: 1,
    min: 0,
    max: 20,
    frase: 'Lendo documentos e extraindo variáveis fiscais...',
    icone: FileSearch,
    cor: 'emerald',
    detalhe: 'OCR + NLP ativos nos documentos principais',
  },
  {
    id: 2,
    min: 20,
    max: 40,
    frase: 'Limpando ruídos de imagem e carimbos processuais...',
    icone: Sparkles,
    cor: 'teal',
    detalhe: 'Denoising e reconstrução de texto degradado',
  },
  {
    id: 3,
    min: 40,
    max: 60,
    frase: 'Identificando datas do Fato Gerador e Notificações...',
    icone: Clock,
    cor: 'cyan',
    detalhe: 'Extração de timelines e marcos processuais',
  },
  {
    id: 4,
    min: 60,
    max: 80,
    frase: 'Rodando motores de cálculo de Decadência e Prescrição (CTN/LEF)...',
    icone: Scale,
    cor: 'blue',
    detalhe: 'Aplicação de art. 150 CTN e art. 40 LEF',
  },
  {
    id: 5,
    min: 80,
    max: 99,
    frase: 'Cruzando resultados com Súmulas do STJ e formatando defesa...',
    icone: Gavel,
    cor: 'indigo',
    detalhe: 'Matching com jurisprudência e templates advocatícios',
  },
  {
    id: 6,
    min: 100,
    max: 100,
    frase: 'Análise Concluída!',
    icone: CheckCircle2,
    cor: 'emerald',
    detalhe: 'Parecer pronto para revisão',
  },
];

const COR_CLASSES = {
  emerald: { text: 'text-emerald-500', bg: 'bg-emerald-500', glow: 'shadow-emerald-500/30', light: 'bg-emerald-50' },
  teal: { text: 'text-teal-500', bg: 'bg-teal-500', glow: 'shadow-teal-500/30', light: 'bg-teal-50' },
  cyan: { text: 'text-cyan-500', bg: 'bg-cyan-500', glow: 'shadow-cyan-500/30', light: 'bg-cyan-50' },
  blue: { text: 'text-blue-500', bg: 'bg-blue-500', glow: 'shadow-blue-500/30', light: 'bg-blue-50' },
  indigo: { text: 'text-indigo-500', bg: 'bg-indigo-500', glow: 'shadow-indigo-500/30', light: 'bg-indigo-50' },
};

// ============================================
// COMPONENTE: PARTÍCULA FLUTUANTE (DECORATIVA)
// ============================================
const Particula = ({ delay, x, y, tamanho }) => (
  <div
    className="absolute rounded-full bg-emerald-400/20 animate-pulse"
    style={{
      left: `${x}%`,
      top: `${y}%`,
      width: tamanho,
      height: tamanho,
      animationDelay: `${delay}ms`,
      animationDuration: '3s',
    }}
  />
);

// ============================================
// COMPONENTE: BARRA DE PROGRESSO ESTILIZADA
// ============================================
const BarraProgresso = ({ progresso, cor, concluido }) => {
  const c = COR_CLASSES[cor];
  
  return (
    <div className="relative w-full">
      {/* Fundo */}
      <div className="h-3 bg-slate-100 rounded-full overflow-hidden">
        {/* Barra principal */}
        <div
          className={`h-full ${c.bg} rounded-full transition-all duration-500 ease-out relative`}
          style={{ width: `${progresso}%` }}
        >
          {/* Brilho animado */}
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent animate-shimmer" />
        </div>
      </div>
      
      {/* Marcadores de estágio */}
      <div className="flex justify-between mt-2">
        {ESTAGIOS.slice(0, -1).map((est) => (
          <div
            key={est.id}
            className={`flex flex-col items-center transition-all duration-300 ${
              progresso >= est.min ? 'opacity-100' : 'opacity-30'
            }`}
          >
            <div className={`w-2 h-2 rounded-full ${progresso >= est.max ? c.bg : 'bg-slate-300'}`} />
            <span className="text-[10px] text-slate-400 mt-1 hidden sm:block">{est.min}%</span>
          </div>
        ))}
        <div className={`flex flex-col items-center transition-all duration-300 ${progresso >= 100 ? 'opacity-100' : 'opacity-30'}`}>
          <div className={`w-2 h-2 rounded-full ${progresso >= 100 ? c.bg : 'bg-slate-300'}`} />
          <span className="text-[10px] text-slate-400 mt-1 hidden sm:block">100%</span>
        </div>
      </div>
    </div>
  );
};

// ============================================
// COMPONENTE: LOG DE PROCESSAMENTO
// ============================================
const LogProcessamento = ({ logs, estagioAtual }) => (
  <div className="bg-slate-900 rounded-xl p-4 font-mono text-xs space-y-1.5 max-h-48 overflow-y-auto">
    <div className="flex items-center gap-2 text-slate-500 mb-2 border-b border-slate-800 pb-2">
      <Activity size={12} />
      <span>console.log — Cérebro Tributário v2.1</span>
    </div>
    {logs.map((log, idx) => (
      <div
        key={idx}
        className={`flex items-start gap-2 transition-all duration-300 ${
          idx === logs.length - 1 ? 'text-emerald-400' : 'text-slate-400'
        }`}
      >
        <span className="text-slate-600 flex-shrink-0">[{log.tempo}]</span>
        <span className={log.tipo === 'erro' ? 'text-red-400' : log.tipo === 'sucesso' ? 'text-emerald-400' : ''}>
          {log.mensagem}
        </span>
      </div>
    ))}
    <div className="animate-pulse text-emerald-500">_</div>
  </div>
);

// ============================================
// COMPONENTE PRINCIPAL: CÉREBRO TRIBUTÁRIO
// ============================================
const CerebroTributario = ({ payload, onConcluido, onErro }) => {
  const [progresso, setProgresso] = useState(0);
  const [estagioAtual, setEstagioAtual] = useState(0);
  const [logs, setLogs] = useState([]);
  const [concluido, setConcluido] = useState(false);
  const [pulsando, setPulsando] = useState(true);
  const intervalRef = useRef(null);
  const logsEndRef = useRef(null);

  // Auto-scroll do log
  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  // Gerar timestamp formatado
  const getTimestamp = () => {
    const now = new Date();
    return `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}.${now.getMilliseconds().toString().padStart(3, '0')}`;
  };

  // Adicionar log
  const addLog = (mensagem, tipo = 'info') => {
    setLogs((prev) => [...prev, { tempo: getTimestamp(), mensagem, tipo }]);
  };

  // ============================================
  // LÓGICA PRINCIPAL DE PROGRESSÃO
  // ============================================
  useEffect(() => {
    addLog('Inicializando Cérebro Tributário...', 'info');
    addLog(`Payload recebido: ${payload?.documentos?.length || 0} documento(s)`, 'info');

    let currentProgress = 0;
    const totalDuration = 12000; // 12 segundos totais de simulação
    const updateInterval = 80; // Atualiza a cada 80ms
    const increment = 100 / (totalDuration / updateInterval);

    intervalRef.current = setInterval(() => {
      currentProgress += increment + (Math.random() * 0.3); // Variação natural

      if (currentProgress >= 100) {
        currentProgress = 100;
        clearInterval(intervalRef.current);
      }

      setProgresso(currentProgress);

      // Determinar estágio atual
      const novoEstagio = ESTAGIOS.findIndex(
        (e) => currentProgress >= e.min && currentProgress <= e.max
      );

      if (novoEstagio !== -1 && novoEstagio !== estagioAtual) {
        setEstagioAtual(novoEstagio);
        const est = ESTAGIOS[novoEstagio];
        
        // Logs por estágio
        if (est.id === 1) {
          addLog('Módulo OCR carregado — resolução 300 DPI', 'info');
          addLog('Extraindo texto de PDFs e DOCXs...', 'info');
        } else if (est.id === 2) {
          addLog('Aplicando filtros de denoising (Gaussian blur + threshold)', 'info');
          addLog('Reconhecendo carimbos e assinaturas digitais...', 'info');
        } else if (est.id === 3) {
          addLog('Regex engine ativo — padrões de data identificados', 'info');
          addLog('Fato Gerador localizado em documento principal', 'sucesso');
        } else if (est.id === 4) {
          addLog('Carregando base legal: CTN (arts. 146-175) + LEF (arts. 38-46)', 'info');
          addLog('Calculando prazos decadenciais e prescricionais...', 'info');
          addLog('⚖️ Decadência: ARTIGO 173 CTN aplicado', 'sucesso');
        } else if (est.id === 5) {
          addLog('Consultando Súmulas STJ (Vinculantes 1-100)', 'info');
          addLog('Gerando template de defesa preliminar...', 'info');
        } else if (est.id === 6) {
          addLog('✅ Parecer tributário gerado com sucesso', 'sucesso');
          addLog('Redirecionando para tela de resultados...', 'info');
          setConcluido(true);
          setPulsando(false);
          
          // Redirecionar após 2 segundos
          setTimeout(() => {
            onConcluido?.();
          }, 2500);
        }
      }
    }, updateInterval);

    return () => clearInterval(intervalRef.current);
  }, []);

  const estagio = ESTAGIOS[estagioAtual] || ESTAGIOS[0];
  const IconeAtual = estagio.icone;
  const corAtual = COR_CLASSES[estagio.cor];

  // Partículas decorativas
  const particulas = Array.from({ length: 12 }, (_, i) => ({
    delay: i * 200,
    x: 10 + (i * 7) % 80,
    y: 15 + (i * 13) % 70,
    tamanho: 4 + (i % 3) * 3,
  }));

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4 relative overflow-hidden">
      {/* Background decorativo */}
      <div className="absolute inset-0">
        {particulas.map((p, i) => (
          <Particula key={i} {...p} />
        ))}
        {/* Grid sutil */}
        <div 
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage: 'linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)',
            backgroundSize: '50px 50px',
          }}
        />
      </div>

      <div className="relative z-10 w-full max-w-2xl">
        {/* Card principal */}
        <div className="bg-slate-900/80 backdrop-blur-xl rounded-3xl border border-slate-800 shadow-2xl overflow-hidden">
          
          {/* Header com cérebro pulsante */}
          <div className="relative px-8 pt-10 pb-6 text-center">
            {/* Círculo de glow */}
            <div className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-32 h-32 rounded-full ${corAtual.bg} opacity-10 blur-3xl transition-all duration-1000`} />
            
            {/* Ícone do cérebro */}
            <div className="relative inline-block">
              <div className={`
                w-24 h-24 rounded-2xl flex items-center justify-center mx-auto mb-6
                ${concluido ? 'bg-emerald-500/20' : 'bg-slate-800'}
                border border-slate-700 transition-all duration-500
                ${pulsando ? 'animate-pulse-slow' : ''}
              `}>
                {concluido ? (
                  <CheckCircle2 size={40} className="text-emerald-400" />
                ) : (
                  <Brain 
                    size={40} 
                    className={`${corAtual.text} transition-colors duration-500`}
                  />
                )}
              </div>
              
              {/* Anéis de pulso */}
              {pulsando && (
                <>
                  <div className="absolute inset-0 rounded-2xl border-2 border-emerald-500/20 animate-ping" style={{ animationDuration: '2s' }} />
                  <div className="absolute inset-0 rounded-2xl border border-emerald-500/10 animate-ping" style={{ animationDuration: '3s', animationDelay: '0.5s' }} />
                </>
              )}
            </div>

            <h1 className="text-2xl font-bold text-white mb-2">
              {concluido ? 'Pronto!' : 'Cérebro Tributário'}
            </h1>
            <p className="text-slate-400 text-sm">
              {concluido 
                ? 'Sua análise foi processada com sucesso' 
                : 'Processando documentos com IA avançada'
              }
            </p>
          </div>

          {/* Conteúdo */}
          <div className="px-8 pb-8 space-y-6">
            
            {/* Progresso */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-slate-300">
                  {estagio.frase}
                </span>
                <span className={`text-sm font-bold ${corAtual.text} tabular-nums`}>
                  {Math.floor(progresso)}%
                </span>
              </div>
              
              <BarraProgresso 
                progresso={progresso} 
                cor={estagio.cor} 
                concluido={concluido} 
              />
            </div>

            {/* Detalhe do estágio */}
            <div className={`
              flex items-center gap-3 p-4 rounded-xl border transition-all duration-500
              ${corAtual.light} border-slate-700/50
            `}>
              <div className={`p-2 rounded-lg ${corAtual.bg} bg-opacity-20`}>
                <IconeAtual size={18} className={corAtual.text} />
              </div>
              <div>
                <p className="text-xs text-slate-500 uppercase tracking-wider font-semibold">
                  Etapa {estagio.id} de {ESTAGIOS.length}
                </p>
                <p className="text-sm text-slate-300 mt-0.5">
                  {estagio.detalhe}
                </p>
              </div>
            </div>

            {/* Métricas rápidas */}
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-slate-800/50 rounded-xl p-3 text-center border border-slate-700/50">
                <Zap size={16} className="text-amber-400 mx-auto mb-1" />
                <p className="text-lg font-bold text-white">{payload?.documentos?.length || 0}</p>
                <p className="text-[10px] text-slate-500 uppercase">Documentos</p>
              </div>
              <div className="bg-slate-800/50 rounded-xl p-3 text-center border border-slate-700/50">
                <ShieldCheck size={16} className="text-emerald-400 mx-auto mb-1" />
                <p className="text-lg font-bold text-white">CTN/LEF</p>
                <p className="text-[10px] text-slate-500 uppercase">Base Legal</p>
              </div>
              <div className="bg-slate-800/50 rounded-xl p-3 text-center border border-slate-700/50">
                <Brain size={16} className="text-blue-400 mx-auto mb-1" />
                <p className="text-lg font-bold text-white">GPT-4o</p>
                <p className="text-[10px] text-slate-500 uppercase">Modelo IA</p>
              </div>
            </div>

            {/* Console/Log */}
            <LogProcessamento logs={logs} estagioAtual={estagioAtual} />
            <div ref={logsEndRef} />

            {/* Footer */}
            <div className="flex items-center justify-center gap-2 text-xs text-slate-600">
              <div className={`w-1.5 h-1.5 rounded-full ${pulsando ? 'bg-emerald-500 animate-pulse' : 'bg-emerald-500'}`} />
              <span>{concluido ? 'Processo finalizado' : 'Processamento ativo — não feche esta janela'}</span>
            </div>
          </div>
        </div>

        {/* Slogan */}
        <p className="text-center text-slate-600 text-xs mt-6">
          "Da decadência à prescrição, o TributÁgil é a sua solução."
        </p>
      </div>

      {/* Estilos de animação customizados */}
      <style>{`
        @keyframes shimmer {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(200%); }
        }
        @keyframes pulse-slow {
          0%, 100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.05); opacity: 0.8; }
        }
        .animate-shimmer {
          animation: shimmer 2s infinite;
        }
        .animate-pulse-slow {
          animation: pulse-slow 3s ease-in-out infinite;
        }
      `}</style>
    </div>
  );
};

export default CerebroTributario;