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
  Clock,
} from 'lucide-react';

// ============================================
// CONFIGURAÇÃO DOS ESTÁGIOS DE PROCESSAMENTO
// ============================================
const ESTAGIOS = [
  { id: 1, min: 0, max: 20, frase: 'Enviando documentos para a Inteligência Artificial...', icone: FileSearch, cor: 'emerald', detalhe: 'Conexão segura com o backend estabelecida' },
  { id: 2, min: 20, max: 40, frase: 'IA analisando variáveis fiscais e carimbos...', icone: Sparkles, cor: 'teal', detalhe: 'Leitura de Fato Gerador e Notificações em andamento' },
  { id: 3, min: 40, max: 60, frase: 'Identificando datas e marcos processuais...', icone: Clock, cor: 'cyan', detalhe: 'Extração de timelines' },
  { id: 4, min: 60, max: 80, frase: 'Rodando motores de cálculo (CTN/LEF)...', icone: Scale, cor: 'blue', detalhe: 'Aplicação de regras de Decadência e Prescrição' },
  { id: 5, min: 80, max: 99, frase: 'Estruturando silogismos jurídicos e recomendações...', icone: Gavel, cor: 'indigo', detalhe: 'Aguardando finalização do modelo Gemini' },
  { id: 6, min: 100, max: 100, frase: 'Análise Concluída!', icone: CheckCircle2, cor: 'emerald', detalhe: 'Parecer pronto para revisão' },
];

const COR_CLASSES = {
  emerald: { text: 'text-emerald-500', bg: 'bg-emerald-500', glow: 'shadow-emerald-500/30', light: 'bg-emerald-50' },
  teal: { text: 'text-teal-500', bg: 'bg-teal-500', glow: 'shadow-teal-500/30', light: 'bg-teal-50' },
  cyan: { text: 'text-cyan-500', bg: 'bg-cyan-500', glow: 'shadow-cyan-500/30', light: 'bg-cyan-50' },
  blue: { text: 'text-blue-500', bg: 'bg-blue-500', glow: 'shadow-blue-500/30', light: 'bg-blue-50' },
  indigo: { text: 'text-indigo-500', bg: 'bg-indigo-500', glow: 'shadow-indigo-500/30', light: 'bg-indigo-50' },
};

// ============================================
// HELPERS DE STREAMING / PARSING (fora do componente: são puros e estáveis)
// ============================================

/**
 * Lê um corpo de resposta em formato SSE (`data: {...}\n\n`) vindo do /api/gemini,
 * acumula os fragmentos de texto e devolve o texto completo gerado pela IA.
 */
async function lerStreamGemini(body, { signal } = {}) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let texto = '';

  try {
    while (true) {
      if (signal?.aborted) break;
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const linhas = buffer.split('\n');
      buffer = linhas.pop() ?? ''; // última linha pode estar incompleta

      for (const linha of linhas) {
        const t = linha.trim();
        if (!t.startsWith('data:')) continue;
        const dados = t.slice(5).trim();
        if (!dados || dados === '[DONE]') continue;
        try {
          const obj = JSON.parse(dados);
          const parte = obj?.candidates?.[0]?.content?.parts?.[0]?.text;
          if (parte) texto += parte;
          const motivo = obj?.candidates?.[0]?.finishReason;
          if (motivo && motivo !== 'STOP') {
            throw new Error(`A IA interrompeu a geração (motivo: ${motivo}).`);
          }
        } catch (e) {
          // Ignora apenas fragmentos JSON parciais; re-lança erros reais.
          if (e instanceof SyntaxError) continue;
          throw e;
        }
      }
    }
  } finally {
    reader.releaseLock?.();
  }

  return texto;
}

/**
 * Extrai um objeto JSON de um texto que pode vir "sujo" (com ```json ... ```,
 * texto antes/depois, etc.).
 */
function extrairJson(texto) {
  const limpo = texto.replace(/```json/gi, '').replace(/```/g, '').trim();
  const inicio = limpo.indexOf('{');
  const fim = limpo.lastIndexOf('}');
  if (inicio === -1 || fim === -1 || fim <= inicio) {
    throw new Error('A IA não retornou um JSON válido.');
  }
  return JSON.parse(limpo.slice(inicio, fim + 1));
}

// ============================================
// COMPONENTES VISUAIS AUXILIARES
// ============================================
const Particula = ({ delay, x, y, tamanho }) => (
  <div className="absolute rounded-full bg-emerald-400/20 animate-pulse" style={{ left: `${x}%`, top: `${y}%`, width: tamanho, height: tamanho, animationDelay: `${delay}ms`, animationDuration: '3s' }} />
);

const BarraProgresso = ({ progresso, cor }) => {
  const c = COR_CLASSES[cor] ?? COR_CLASSES.emerald;
  return (
    <div className="relative w-full">
      <div className="h-3 bg-slate-100 rounded-full overflow-hidden">
        <div className={`h-full ${c.bg} rounded-full transition-all duration-500 ease-out relative`} style={{ width: `${progresso}%` }}>
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent animate-shimmer" />
        </div>
      </div>
      <div className="flex justify-between mt-2">
        {ESTAGIOS.slice(0, -1).map((est) => (
          <div key={est.id} className={`flex flex-col items-center transition-all duration-300 ${progresso >= est.min ? 'opacity-100' : 'opacity-30'}`}>
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

const LogProcessamento = ({ logs }) => (
  <div className="bg-slate-900 rounded-xl p-4 font-mono text-xs space-y-1.5 max-h-48 overflow-y-auto">
    <div className="flex items-center gap-2 text-slate-500 mb-2 border-b border-slate-800 pb-2">
      <Activity size={12} />
      <span>console.log — Cérebro Tributário v2.1 (Conectado via API)</span>
    </div>
    {logs.map((log, idx) => (
      <div key={idx} className={`flex items-start gap-2 transition-all duration-300 ${idx === logs.length - 1 ? 'text-emerald-400' : 'text-slate-400'}`}>
        <span className="text-slate-600 flex-shrink-0">[{log.tempo}]</span>
        <span className={log.tipo === 'erro' ? 'text-red-400' : log.tipo === 'sucesso' ? 'text-emerald-400' : ''}>{log.mensagem}</span>
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

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  const getTimestamp = () => {
    const now = new Date();
    return `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}.${now.getMilliseconds().toString().padStart(3, '0')}`;
  };

  const addLog = (mensagem, tipo = 'info') => {
    setLogs((prev) => [...prev, { tempo: getTimestamp(), mensagem, tipo }]);
  };

  // ============================================
  // INTEGRAÇÃO REAL COM A API DO GEMINI (executa UMA vez por payload)
  // ============================================
  useEffect(() => {
    if (!payload) return;

    const abortController = new AbortController();
    let cancelado = false;
    let progressoLocal = 0;
    let estagioLocal = 0;

    addLog('Inicializando conexão segura com backend...', 'info');

    // 1. Progresso "otimista" enquanto a IA trabalha (trava em 90% até a resposta).
    intervalRef.current = setInterval(() => {
      if (progressoLocal >= 90) return;
      progressoLocal = Math.min(90, progressoLocal + Math.random() * 4);
      setProgresso(progressoLocal);

      const novoEstagio = ESTAGIOS.findIndex(
        (e) => progressoLocal >= e.min && progressoLocal <= e.max,
      );
      if (novoEstagio !== -1 && novoEstagio !== estagioLocal) {
        estagioLocal = novoEstagio;
        setEstagioAtual(novoEstagio);
        addLog(ESTAGIOS[novoEstagio].frase, 'info');
      }
    }, 1000);

    // 2. Chamada real (streaming) ao backend.
    const processarComIA = async () => {
      try {
        const promptEngenharia = `
          Você é um advogado tributarista sênior analisando um caso para a plataforma TributÁgil.
          Analise os dados fornecidos abaixo e retorne APENAS um JSON válido. Não inclua blocos de código markdown (como \`\`\`json).
          O JSON deve seguir EXATAMENTE esta estrutura de chaves e arrays para não quebrar o frontend:
          {
            "metadata": { "modelo_ia": "Gemini (Backend)" },
            "conclusoes": [
              { "id": 1, "tipo": "prescricao", "severidade": "favoravel", "titulo": "Título Curto", "resumo": "Análise detalhada...", "fundamento_legal": "Lei X...", "confianca": 95 }
            ],
            "fatos_importantes": [
              { "id": 1, "categoria": "cronologica", "data": "DD/MM/AAAA", "descricao": "Fato...", "fonte": "Documento Y", "relevancia": "alta" }
            ],
            "raciocinio": [
              { "id": 1, "premissa": "Regra geral...", "aplicacao": "No caso...", "conclusao_logica": "Portanto...", "referencia": "STJ..." }
            ],
            "recomendacoes": ["Ação 1", "Ação 2"]
          }

          Use severidades: "favoravel", "atencao", "neutro", "desfavoravel".
          Use relevancias: "critica", "alta", "media", "baixa".
          Use categorias: "cronologica", "processual", "tributaria".

          DADOS ENVIADOS PELO USUÁRIO PARA ANÁLISE:
          ${JSON.stringify(payload)}
        `;

        addLog('Disparando requisição POST para /api/gemini...', 'info');

        const resposta = await fetch('/api/gemini', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt: promptEngenharia }),
          signal: abortController.signal,
        });

        if (!resposta.ok || !resposta.body) {
          const erroJson = await resposta.json().catch(() => ({}));
          throw new Error(erroJson.error || `Falha na IA (HTTP ${resposta.status}).`);
        }

        addLog('Streaming da IA iniciado — recebendo parecer...', 'info');
        const textoIA = await lerStreamGemini(resposta.body, { signal: abortController.signal });
        if (cancelado) return;

        addLog('Resposta recebida. Estruturando dados...', 'info');
        const resultadoIA = extrairJson(textoIA);

        clearInterval(intervalRef.current);
        setProgresso(100);
        setEstagioAtual(ESTAGIOS.length - 1);
        addLog('✅ Parecer tributário estruturado com sucesso!', 'sucesso');
        setConcluido(true);
        setPulsando(false);

        setTimeout(() => {
          if (!cancelado) onConcluido?.(resultadoIA);
        }, 1500);
      } catch (erro) {
        if (cancelado || erro?.name === 'AbortError') return;
        clearInterval(intervalRef.current);
        addLog(`Falha na IA: ${erro.message}`, 'erro');
        console.error('[CerebroTributario] Erro no processamento:', erro);
        onErro?.(erro);
      }
    };

    processarComIA();

    return () => {
      cancelado = true;
      abortController.abort();
      clearInterval(intervalRef.current);
    };
    // Depende apenas de `payload`: a análise roda uma única vez por conjunto de dados.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payload]);

  const estagio = ESTAGIOS[estagioAtual] || ESTAGIOS[0];
  const IconeAtual = estagio.icone;
  const corAtual = COR_CLASSES[estagio.cor] ?? COR_CLASSES.emerald;

  const particulas = Array.from({ length: 12 }, (_, i) => ({ delay: i * 200, x: 10 + (i * 7) % 80, y: 15 + (i * 13) % 70, tamanho: 4 + (i % 3) * 3 }));

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4 relative overflow-hidden">
      <div className="absolute inset-0">
        {particulas.map((p, i) => <Particula key={i} {...p} />)}
        <div className="absolute inset-0 opacity-[0.03]" style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)', backgroundSize: '50px 50px' }} />
      </div>

      <div className="relative z-10 w-full max-w-2xl">
        <div className="bg-slate-900/80 backdrop-blur-xl rounded-3xl border border-slate-800 shadow-2xl overflow-hidden">

          <div className="relative px-8 pt-10 pb-6 text-center">
            <div className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-32 h-32 rounded-full ${corAtual.bg} opacity-10 blur-3xl transition-all duration-1000`} />
            <div className="relative inline-block">
              <div className={`w-24 h-24 rounded-2xl flex items-center justify-center mx-auto mb-6 ${concluido ? 'bg-emerald-500/20' : 'bg-slate-800'} border border-slate-700 transition-all duration-500 ${pulsando ? 'animate-pulse-slow' : ''}`}>
                {concluido ? <CheckCircle2 size={40} className="text-emerald-400" /> : <Brain size={40} className={`${corAtual.text} transition-colors duration-500`} />}
              </div>
              {pulsando && (
                <>
                  <div className="absolute inset-0 rounded-2xl border-2 border-emerald-500/20 animate-ping" style={{ animationDuration: '2s' }} />
                  <div className="absolute inset-0 rounded-2xl border border-emerald-500/10 animate-ping" style={{ animationDuration: '3s', animationDelay: '0.5s' }} />
                </>
              )}
            </div>
            <h1 className="text-2xl font-bold text-white mb-2">{concluido ? 'Pronto!' : 'Cérebro Tributário'}</h1>
            <p className="text-slate-400 text-sm">{concluido ? 'Sua análise foi processada com sucesso' : 'Processando documentos com IA avançada'}</p>
          </div>

          <div className="px-8 pb-8 space-y-6">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-slate-300">{estagio.frase}</span>
                <span className={`text-sm font-bold ${corAtual.text} tabular-nums`}>{Math.floor(progresso)}%</span>
              </div>
              <BarraProgresso progresso={progresso} cor={estagio.cor} />
            </div>

            <div className={`flex items-center gap-3 p-4 rounded-xl border transition-all duration-500 ${corAtual.light} border-slate-700/50`}>
              <div className={`p-2 rounded-lg ${corAtual.bg} bg-opacity-20`}>
                <IconeAtual size={18} className={corAtual.text} />
              </div>
              <div>
                <p className="text-xs text-slate-500 uppercase tracking-wider font-semibold">Etapa {estagio.id} de {ESTAGIOS.length}</p>
                <p className="text-sm text-slate-300 mt-0.5">{estagio.detalhe}</p>
              </div>
            </div>

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
                <p className="text-lg font-bold text-white">Backend</p>
                <p className="text-[10px] text-slate-500 uppercase">API Segura</p>
              </div>
            </div>

            <LogProcessamento logs={logs} />
            <div ref={logsEndRef} />

            <div className="flex items-center justify-center gap-2 text-xs text-slate-600">
              <div className={`w-1.5 h-1.5 rounded-full ${pulsando ? 'bg-emerald-500 animate-pulse' : 'bg-emerald-500'}`} />
              <span>{concluido ? 'Processo finalizado' : 'Processamento ativo — aguardando resposta da IA'}</span>
            </div>
          </div>
        </div>
        <p className="text-center text-slate-600 text-xs mt-6">"Da decadência à prescrição, o TributÁgil é a sua solução."</p>
      </div>

      <style>{`
        @keyframes shimmer { 0% { transform: translateX(-100%); } 100% { transform: translateX(200%); } }
        @keyframes pulse-slow { 0%, 100% { transform: scale(1); opacity: 1; } 50% { transform: scale(1.05); opacity: 0.8; } }
        .animate-shimmer { animation: shimmer 2s infinite; }
        .animate-pulse-slow { animation: pulse-slow 3s ease-in-out infinite; }
      `}</style>
    </div>
  );
};

export default CerebroTributario;
