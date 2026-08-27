// src/pages/CerebroTributario.jsx
import React, { useState, useEffect, useRef } from 'react';
import { supabase, supabaseUrl, supabaseAnonKey } from '../lib/supabase';
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
  AlertTriangle,
  ArrowLeft,
} from 'lucide-react';

// Tempo mínimo que a tela de andamento fica visível, mesmo que a IA responda
// muito rápido — garante que o usuário SEMPRE veja o feedback de processamento.
const TEMPO_MINIMO_VISIVEL_MS = 2600;

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

// Todos os estágios usam a mesma família dourada (identidade única).
const COR_DOURADA = {
  text: 'text-gold',
  bg: 'bg-gold',
  glow: 'shadow-[0_0_40px_rgba(212,175,55,0.25)]',
  light: 'bg-gold/[0.06]',
};
const COR_CLASSES = {
  emerald: COR_DOURADA,
  teal: COR_DOURADA,
  cyan: COR_DOURADA,
  blue: COR_DOURADA,
  indigo: COR_DOURADA,
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
          // Concatena o texto de TODAS as parts (modelos com "thinking" podem
          // devolver mais de uma part por chunk).
          const partes = obj?.candidates?.[0]?.content?.parts;
          if (Array.isArray(partes)) {
            for (const p of partes) if (typeof p?.text === 'string') texto += p.text;
          }
          const motivo = obj?.candidates?.[0]?.finishReason;
          if (motivo && motivo !== 'STOP' && motivo !== 'MAX_TOKENS') {
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
    const e = new Error('A IA não retornou um JSON válido.');
    e.textoBruto = limpo;
    throw e;
  }
  try {
    return JSON.parse(limpo.slice(inicio, fim + 1));
  } catch (err) {
    err.textoBruto = limpo;
    throw err;
  }
}

// ============================================
// COMPONENTES VISUAIS AUXILIARES
// ============================================
const Particula = ({ delay, x, y, tamanho }) => (
  <div className="absolute rounded-full bg-gold/20 animate-pulse" style={{ left: `${x}%`, top: `${y}%`, width: tamanho, height: tamanho, animationDelay: `${delay}ms`, animationDuration: '3s' }} />
);

const BarraProgresso = ({ progresso, cor }) => {
  const c = COR_CLASSES[cor] ?? COR_CLASSES.emerald;
  return (
    <div className="relative w-full">
      <div className="h-3 bg-ink-700 rounded-full overflow-hidden">
        <div className={`h-full ${c.bg} rounded-full transition-all duration-500 ease-out relative`} style={{ width: `${progresso}%` }}>
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent animate-shimmer" />
        </div>
      </div>
      <div className="flex justify-between mt-2">
        {ESTAGIOS.slice(0, -1).map((est) => (
          <div key={est.id} className={`flex flex-col items-center transition-all duration-300 ${progresso >= est.min ? 'opacity-100' : 'opacity-30'}`}>
            <div className={`w-2 h-2 rounded-full ${progresso >= est.max ? c.bg : 'bg-ink-600'}`} />
            <span className="text-[10px] text-parchment/50 mt-1 hidden sm:block">{est.min}%</span>
          </div>
        ))}
        <div className={`flex flex-col items-center transition-all duration-300 ${progresso >= 100 ? 'opacity-100' : 'opacity-30'}`}>
          <div className={`w-2 h-2 rounded-full ${progresso >= 100 ? c.bg : 'bg-ink-600'}`} />
          <span className="text-[10px] text-parchment/50 mt-1 hidden sm:block">100%</span>
        </div>
      </div>
    </div>
  );
};

const LogProcessamento = ({ logs }) => (
  <div className="bg-ink-900 rounded-xl p-4 font-mono text-xs space-y-1.5 max-h-48 overflow-y-auto">
    <div className="flex items-center gap-2 text-parchment/40 mb-2 border-b border-line pb-2">
      <Activity size={12} />
      <span>console.log — Cérebro Tributário v2.1 (Conectado via API)</span>
    </div>
    {logs.map((log, idx) => (
      <div key={idx} className={`flex items-start gap-2 transition-all duration-300 ${idx === logs.length - 1 ? 'text-gold' : 'text-parchment/50'}`}>
        <span className="text-parchment/30 flex-shrink-0">[{log.tempo}]</span>
        <span className={log.tipo === 'erro' ? 'text-red-400' : log.tipo === 'sucesso' ? 'text-gold' : ''}>{log.mensagem}</span>
      </div>
    ))}
    <div className="animate-pulse text-gold">_</div>
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
  // Quando a IA falha, mostramos o erro NA PRÓPRIA tela em vez de "sumir"
  // instantaneamente de volta para o upload.
  const [erroFatal, setErroFatal] = useState(null);
  // Quando a IA responde que faltam dados (Protocolo de Alerta do Motor TributÁgil).
  const [alertaDados, setAlertaDados] = useState(null);
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
    const inicio = Date.now();
    let cancelado = false;
    let progressoLocal = 0;
    let estagioLocal = 0;

    setErroFatal(null);
    setAlertaDados(null);
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
        // As regras jurídicas ficam no system instruction "Motor TributÁgil"
        // (backend). Aqui só definimos o FORMATO da resposta.
        const promptEngenharia = `Execute a análise pericial completa conforme suas instruções de sistema (Motor TributÁgil), usando EXCLUSIVAMENTE os documentos anexados nesta mensagem. Não invente dados, não use conhecimento externo e não faça buscas.

Retorne APENAS um objeto JSON com esta estrutura:
{
  "metadata": {
    "processo": "número do processo, se houver",
    "parte_autora": "exequente / Fisco / credor",
    "parte_reu": "executado / contribuinte / devedor",
    "valor_causa": "valor da execução/causa, com R$ e separadores",
    "local": "comarca, vara e/ou tribunal (ex.: '2ª Vara de Execuções Fiscais — Comarca de São Paulo/SP')"
  },
  "conclusoes": [
    { "id": 1, "tipo": "prescricao|decadencia|prescricao_intercorrente|cautela|procedimental", "severidade": "favoravel|atencao|neutro|desfavoravel", "titulo": "...", "resumo": "...", "fundamento_legal": "...", "confianca": 0 a 100 }
  ],
  "fatos_importantes": [
    { "id": 1, "categoria": "cronologica|processual|tributaria", "data": "DD/MM/AAAA", "descricao": "...", "fonte": "nome do documento anexado", "relevancia": "critica|alta|media|baixa" }
  ],
  "raciocinio": [
    { "id": 1, "premissa": "regra jurídica (DIREITO)", "aplicacao": "aplicação ao caso concreto (FATO)", "conclusao_logica": "conclusão / pedido", "referencia": "CTN/LEF/Súmula/REsp" }
  ],
  "recomendacoes": ["ação estratégica 1", "ação estratégica 2"]
}

Em "metadata", extraia cada campo EXATAMENTE dos documentos anexados. Se algum não constar nos documentos, escreva exatamente "Não identificado" (nunca invente).
Distribua o conteúdo de FATO / DIREITO / CONCLUSÃO-PEDIDO nos campos acima. Toda data e todo fato precisa citar em "fonte" o documento anexado de origem.
Se faltar qualquer data essencial ou os documentos estiverem ilegíveis, responda APENAS: {"alerta_dados_insuficientes": "[ALERTA DE DADOS INSUFICIENTES] Necessário informar a data exata de <dado> para prosseguir."}

Metadados da requisição: ${JSON.stringify(payload?.metadata ?? {})}`;

        const documentos = (payload?.documentos ?? []).map((d) => ({
          nome: d.nome,
          mime_type: d.mime_type,
          storage_path: d.storage_path,
        }));

        // Token do usuário: o backend usa para ler os arquivos no Storage
        // respeitando a RLS (só a pasta do próprio usuário).
        const { data: sess } = await supabase.auth.getSession().catch(() => ({ data: {} }));
        const userToken = sess?.session?.access_token;
        if (!userToken) throw new Error('Sessão expirada. Faça login novamente.');

        addLog(`Enviando ${documentos.length} documento(s) para análise...`, 'info');

        const resposta = await fetch('/api/gemini', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            prompt: promptEngenharia,
            documentos,
            supabaseUrl,
            supabaseAnonKey,
            userToken,
          }),
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

        // Protocolo de Alerta do Motor TributÁgil: dados insuficientes.
        if (resultadoIA && resultadoIA.alerta_dados_insuficientes) {
          clearInterval(intervalRef.current);
          setPulsando(false);
          addLog('IA sinalizou dados insuficientes.', 'erro');
          setAlertaDados(String(resultadoIA.alerta_dados_insuficientes));
          return;
        }

        clearInterval(intervalRef.current);
        setProgresso(100);
        setEstagioAtual(ESTAGIOS.length - 1);
        addLog('✅ Parecer tributário estruturado com sucesso!', 'sucesso');
        setConcluido(true);
        setPulsando(false);

        // Só avança para o resultado depois do tempo mínimo de exibição —
        // assim a tela de andamento nunca "pisca".
        const restante = Math.max(0, TEMPO_MINIMO_VISIVEL_MS - (Date.now() - inicio));
        setTimeout(() => {
          if (!cancelado) onConcluido?.(resultadoIA);
        }, restante + 700);
      } catch (erro) {
        if (cancelado || erro?.name === 'AbortError') return;
        clearInterval(intervalRef.current);
        console.error('[CerebroTributario] Erro no processamento:', erro);
        setPulsando(false);

        // Se o texto continha o alerta mas não parseou como JSON, trata como alerta.
        if (typeof erro?.textoBruto === 'string' && erro.textoBruto.includes('[ALERTA DE DADOS INSUFICIENTES]')) {
          addLog('IA sinalizou dados insuficientes.', 'erro');
          setAlertaDados(erro.textoBruto.trim());
          return;
        }

        addLog(`Falha na IA: ${erro.message}`, 'erro');
        // Mantém a tela visível com o erro; o usuário decide voltar/tentar de novo.
        setErroFatal(erro.message || 'Falha ao processar a análise.');
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

  // ---- ALERTA DE DADOS INSUFICIENTES: a IA não inventa — pede mais documentos --
  if (alertaDados) {
    return (
      <div className="min-h-screen bg-noir flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-ink-800/70 backdrop-blur-xl rounded-3xl border border-amber-500/30 shadow-2xl p-8 text-center">
          <div className="w-16 h-16 rounded-2xl bg-amber-500/15 flex items-center justify-center mx-auto mb-5">
            <AlertTriangle size={32} className="text-amber-400" />
          </div>
          <h1 className="text-xl font-bold text-parchment">Dados insuficientes</h1>
          <p className="text-sm text-parchment/70 mt-3 whitespace-pre-wrap">{alertaDados}</p>
          <p className="text-xs text-parchment/40 mt-3">
            A IA está restrita aos documentos enviados e não preenche lacunas por conta própria.
            Anexe o documento que traz a data/informação faltante e rode de novo.
          </p>
          <button
            onClick={() => onErro?.(new Error('dados_insuficientes'))}
            className="mt-6 inline-flex items-center gap-2 px-5 py-2.5 bg-amber-400 hover:bg-amber-300 text-ink text-sm font-semibold rounded-xl transition-colors"
          >
            <ArrowLeft size={16} />
            Voltar e anexar mais documentos
          </button>
        </div>
      </div>
    );
  }

  // ---- Estado de ERRO: permanece na tela, sem "piscar" de volta ao upload ----
  if (erroFatal) {
    return (
      <div className="min-h-screen bg-noir flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-ink-800/70 backdrop-blur-xl rounded-3xl border border-red-500/30 shadow-2xl p-8 text-center">
          <div className="w-16 h-16 rounded-2xl bg-red-500/15 flex items-center justify-center mx-auto mb-5">
            <AlertTriangle size={32} className="text-red-400" />
          </div>
          <h1 className="text-xl font-bold text-parchment">Não foi possível concluir a análise</h1>
          <p className="text-sm text-parchment/50 mt-2">{erroFatal}</p>
          <p className="text-xs text-parchment/30 mt-3">
            Tente novamente. Se persistir, reduza a quantidade/tamanho dos documentos.
          </p>
          <button
            onClick={() => onErro?.(new Error(erroFatal))}
            className="mt-6 inline-flex items-center gap-2 px-5 py-2.5 border border-line text-parchment/80 hover:border-gold/40 hover:text-gold text-sm font-semibold rounded-xl transition-colors"
          >
            <ArrowLeft size={16} />
            Voltar e revisar os documentos
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-noir flex items-center justify-center p-4 relative overflow-hidden">
      <div className="absolute inset-0">
        {particulas.map((p, i) => <Particula key={i} {...p} />)}
        <div className="absolute inset-0 opacity-[0.03]" style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)', backgroundSize: '50px 50px' }} />
      </div>

      <div className="relative z-10 w-full max-w-2xl">
        <div className="bg-ink-800/70 backdrop-blur-xl rounded-3xl border border-line shadow-2xl overflow-hidden">

          <div className="relative px-8 pt-10 pb-6 text-center">
            <div className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-32 h-32 rounded-full ${corAtual.bg} opacity-10 blur-3xl transition-all duration-1000`} />
            <div className="relative inline-block">
              <div className={`w-24 h-24 rounded-2xl flex items-center justify-center mx-auto mb-6 ${concluido ? 'bg-gold/15' : 'bg-ink-800'} border border-line transition-all duration-500 ${pulsando ? 'animate-pulse-slow' : ''}`}>
                {concluido ? <CheckCircle2 size={40} className="text-gold" /> : <Brain size={40} className={`${corAtual.text} transition-colors duration-500`} />}
              </div>
              {pulsando && (
                <>
                  <div className="absolute inset-0 rounded-2xl border-2 border-gold/20 animate-ping" style={{ animationDuration: '2s' }} />
                  <div className="absolute inset-0 rounded-2xl border border-gold/10 animate-ping" style={{ animationDuration: '3s', animationDelay: '0.5s' }} />
                </>
              )}
            </div>
            <h1 className="text-2xl font-bold text-parchment mb-2">{concluido ? 'Pronto!' : 'Cérebro Tributário'}</h1>
            <p className="text-parchment/50 text-sm">{concluido ? 'Sua análise foi processada com sucesso' : 'Processando documentos com IA avançada'}</p>
          </div>

          <div className="px-8 pb-8 space-y-6">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-parchment/70">{estagio.frase}</span>
                <span className={`text-sm font-bold ${corAtual.text} tabular-nums`}>{Math.floor(progresso)}%</span>
              </div>
              <BarraProgresso progresso={progresso} cor={estagio.cor} />
            </div>

            <div className={`flex items-center gap-3 p-4 rounded-xl border transition-all duration-500 ${corAtual.light} border-line`}>
              <div className={`p-2 rounded-lg ${corAtual.bg} bg-opacity-20`}>
                <IconeAtual size={18} className={corAtual.text} />
              </div>
              <div>
                <p className="text-xs text-parchment/40 uppercase tracking-wider font-semibold">Etapa {estagio.id} de {ESTAGIOS.length}</p>
                <p className="text-sm text-parchment/70 mt-0.5">{estagio.detalhe}</p>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="bg-ink-800/60 rounded-xl p-3 text-center border border-line">
                <Zap size={16} className="text-gold mx-auto mb-1" />
                <p className="text-lg font-bold text-parchment">{payload?.documentos?.length || 0}</p>
                <p className="text-[10px] text-parchment/40 uppercase">Documentos</p>
              </div>
              <div className="bg-ink-800/60 rounded-xl p-3 text-center border border-line">
                <ShieldCheck size={16} className="text-gold mx-auto mb-1" />
                <p className="text-lg font-bold text-parchment">CTN/LEF</p>
                <p className="text-[10px] text-parchment/40 uppercase">Base Legal</p>
              </div>
              <div className="bg-ink-800/60 rounded-xl p-3 text-center border border-line">
                <Brain size={16} className="text-gold mx-auto mb-1" />
                <p className="text-lg font-bold text-parchment">Backend</p>
                <p className="text-[10px] text-parchment/40 uppercase">API Segura</p>
              </div>
            </div>

            <LogProcessamento logs={logs} />
            <div ref={logsEndRef} />

            <div className="flex items-center justify-center gap-2 text-xs text-parchment/30">
              <div className={`w-1.5 h-1.5 rounded-full ${pulsando ? 'bg-gold animate-pulse' : 'bg-gold'}`} />
              <span>{concluido ? 'Processo finalizado' : 'Processamento ativo — aguardando resposta da IA'}</span>
            </div>
          </div>
        </div>
        <p className="text-center text-parchment/30 text-xs mt-6">"Da decadência à prescrição, o TributÁgil é a sua solução."</p>
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
