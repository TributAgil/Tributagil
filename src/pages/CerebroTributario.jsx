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
  Coins,
} from 'lucide-react';
import RodapeLegal from '../components/RodapeLegal';
import BotaoSinalizarErro from '../components/BotaoSinalizarErro';
import Logo from '../components/Logo';

// Tempo mínimo que a tela de andamento fica visível, mesmo que a IA responda
// muito rápido — garante que o usuário SEMPRE veja o feedback de processamento.
const TEMPO_MINIMO_VISIVEL_MS = 2600;

// ============================================
// CONFIGURAÇÃO DOS ESTÁGIOS DE PROCESSAMENTO
// ============================================
const ESTAGIOS = [
  { id: 1, min: 0, max: 20, frase: 'Enviando documentos para a Inteligência Artificial...', icone: FileSearch, detalhe: 'Conexão segura com o backend estabelecida' },
  { id: 2, min: 20, max: 40, frase: 'IA analisando variáveis fiscais e carimbos...', icone: Sparkles, detalhe: 'Leitura de Fato Gerador e Notificações em andamento' },
  { id: 3, min: 40, max: 60, frase: 'Identificando datas e marcos processuais...', icone: Clock, detalhe: 'Extração de timelines' },
  { id: 4, min: 60, max: 80, frase: 'Rodando motores de cálculo (CTN/LEF)...', icone: Scale, detalhe: 'Aplicação de regras de Decadência e Prescrição' },
  { id: 5, min: 80, max: 99, frase: 'Estruturando silogismos jurídicos e recomendações...', icone: Gavel, detalhe: 'Aguardando finalização do modelo Gemini' },
  { id: 6, min: 100, max: 100, frase: 'Análise Concluída!', icone: CheckCircle2, detalhe: 'Parecer pronto para revisão' },
];

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

/* Poeira dourada de fundo: deriva devagar em vez de piscar. É o único
   movimento em loop fora do núcleo — fica atrás de tudo, bem discreto. */
const Particula = ({ delay, x, y, tamanho }) => (
  <div
    className="absolute rounded-full bg-gold/25 anim-drift"
    style={{ left: `${x}%`, top: `${y}%`, width: tamanho, height: tamanho, animationDelay: `${delay}ms` }}
  />
);

/**
 * NÚCLEO — a balança da marca "pesando" o caso enquanto a IA trabalha.
 * Dois anéis de pontos orbitam em sentidos opostos (processamento), um halo
 * respira atrás, e a balança oscila até achar o fiel. Ao concluir, tudo para
 * e um selo bate no lugar (`anim-seal`) — o veredito chegou.
 */
const NucleoAnalise = ({ concluido }) => (
  <div className="relative mx-auto mb-6 h-32 w-32">
    {/* halo difuso */}
    <div
      className={`absolute inset-3 rounded-full bg-gold/15 blur-2xl ${concluido ? '' : 'anim-breathe'}`}
    />

    {!concluido && (
      <>
        {/* anéis orbitais em sentidos opostos */}
        <div className="absolute inset-0 anim-orbit">
          <span className="absolute left-1/2 top-0 h-1.5 w-1.5 -translate-x-1/2 rounded-full bg-gold" />
          <span className="absolute left-1/2 bottom-0 h-1 w-1 -translate-x-1/2 rounded-full bg-gold/50" />
        </div>
        <div className="absolute inset-4 anim-orbit-rev">
          <span className="absolute left-0 top-1/2 h-1 w-1 -translate-y-1/2 rounded-full bg-gold/60" />
        </div>
        {/* aro tênue que delimita a órbita */}
        <div className="absolute inset-0 rounded-full border border-gold/10" />
        <div className="absolute inset-4 rounded-full border border-gold/[0.07]" />
      </>
    )}

    <div className="absolute inset-0 grid place-items-center">
      {concluido ? (
        <div className="anim-seal grid h-24 w-24 place-items-center rounded-full border-2 border-gold bg-gold/15">
          <CheckCircle2 size={44} className="text-gold" />
        </div>
      ) : (
        <Logo variant="mark" size="xl" showWordmark={false} animated />
      )}
    </div>
  </div>
);

/**
 * TRILHA DE ETAPAS — substitui os pontinhos soltos por um caminho visível.
 * Cada nó tem três estados (concluído / atual / pendente); ao ser vencido,
 * o nó recebe o selo. É aqui que o usuário lê "onde estamos" sem precisar
 * decifrar porcentagem.
 */
const TrilhaEtapas = ({ progresso, estagioAtual }) => (
  <ol className="flex items-start justify-between gap-1">
    {ESTAGIOS.map((est, idx) => {
      const Icone = est.icone;
      const vencido = progresso >= est.max;
      const atual = !vencido && idx === estagioAtual;

      return (
        <li key={est.id} className="relative flex min-w-0 flex-1 flex-col items-center">
          {/* trilho ligando ao nó anterior */}
          {idx > 0 && (
            <span
              aria-hidden="true"
              className={`absolute right-1/2 top-4 h-px w-full transition-colors duration-700 ${
                vencido || atual ? 'bg-gold/45' : 'bg-line'
              }`}
            />
          )}

          <span
            className={`relative grid h-8 w-8 place-items-center rounded-full border transition-all duration-500 ${
              vencido
                ? 'border-gold bg-gold text-ink'
                : atual
                  ? 'border-gold bg-gold/10 text-gold'
                  : 'border-line bg-ink-800 text-parchment/25'
            }`}
          >
            {vencido ? (
              <CheckCircle2 size={15} className="anim-seal" />
            ) : (
              <Icone size={15} className={atual ? 'anim-breathe' : ''} />
            )}
            {/* halo pulsante só no nó atual */}
            {atual && (
              <span className="absolute inset-0 animate-ping rounded-full border border-gold/40" style={{ animationDuration: '2.2s' }} />
            )}
          </span>

          <span
            className={`mt-1.5 hidden text-center text-[10px] leading-tight transition-colors duration-500 sm:block ${
              vencido || atual ? 'text-parchment/60' : 'text-parchment/25'
            }`}
          >
            {est.id === ESTAGIOS.length ? 'Parecer' : `Etapa ${est.id}`}
          </span>
        </li>
      );
    })}
  </ol>
);

const BarraProgresso = ({ progresso }) => (
  <div className="relative h-2.5 w-full overflow-hidden rounded-full bg-ink-700">
    <div
      className="relative h-full rounded-full bg-gradient-to-r from-gold-soft to-gold transition-[width] duration-700 ease-decide"
      style={{ width: `${progresso}%` }}
    >
      <div className="absolute inset-0 anim-shimmer bg-gradient-to-r from-transparent via-white/35 to-transparent" />
    </div>
  </div>
);

const LogProcessamento = ({ logs }) => (
  <div className="anim-scan max-h-44 overflow-y-auto rounded-xl bg-ink-900 p-4 font-mono text-xs">
    <div className="mb-2 flex items-center gap-2 border-b border-line pb-2 text-parchment/40">
      <Activity size={12} className="anim-breathe" />
      <span>console.log — Cérebro Tributário v2.1 (Conectado via API)</span>
    </div>
    <div className="space-y-1.5">
      {logs.map((log, idx) => (
        <div
          key={idx}
          className={`anim-log-in flex items-start gap-2 ${idx === logs.length - 1 ? 'text-gold' : 'text-parchment/50'}`}
        >
          <span className="flex-shrink-0 text-parchment/30">[{log.tempo}]</span>
          <span className={log.tipo === 'erro' ? 'text-red-400' : log.tipo === 'sucesso' ? 'text-gold' : ''}>
            {log.mensagem}
          </span>
        </div>
      ))}
    </div>
    <div className="anim-breathe mt-1 text-gold">_</div>
  </div>
);

// ============================================
// COMPONENTE PRINCIPAL: CÉREBRO TRIBUTÁRIO
// ============================================
const CerebroTributario = ({ payload, user, onConcluido, onErro }) => {
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
  // Quando o backend recusa por falta de créditos (HTTP 402) — não é falha do
  // sistema, então NÃO oferece o botão de sinalização/estorno.
  const [semCreditos, setSemCreditos] = useState(null);
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
    setSemCreditos(null);
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
Distribua o conteúdo de FATO / DIREITO / CONCLUSÃO-PEDIDO nos campos acima, seguindo o mapeamento das [REGRAS DE SAÍDA — JSON] do Motor TributÁgil. Toda data e todo fato precisa citar em "fonte" o documento anexado de origem.
Neutralidade de resultado: rode os Módulos 2, 3 e 4 até o fim. Se NENHUM prazo foi ultrapassado, ainda assim retorne "conclusoes" com "severidade":"desfavoravel", a frase "Não foi identificada causa de extinção do crédito tributário por decadência ou prescrição até a presente data. O crédito permanece exigível." e o tempo restante até o próximo prazo. Se algum prazo foi ultrapassado, use "severidade":"favoravel" e a frase "O crédito tributário encontra-se inexigível, impondo-se seu imediato cancelamento / extinção da execução fiscal.".
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
          const erroHttp = new Error(erroJson.error || `Falha na IA (HTTP ${resposta.status}).`);
          erroHttp.status = resposta.status;
          throw erroHttp;
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

        // Sem créditos (HTTP 402): não é falha do sistema — não oferece estorno.
        if (erro?.status === 402) {
          addLog('Sem créditos disponíveis para esta análise.', 'erro');
          setSemCreditos(erro.message || 'Você não possui créditos disponíveis.');
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

  // ---- Sem créditos disponíveis (HTTP 402): bloqueio condicional do plano ----
  if (semCreditos) {
    return (
      <div className="min-h-screen bg-noir flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-ink-800/70 backdrop-blur-xl rounded-3xl border border-amber-500/30 shadow-2xl p-8 text-center">
          <div className="w-16 h-16 rounded-2xl bg-amber-500/15 flex items-center justify-center mx-auto mb-5">
            <Coins size={32} className="text-amber-400" />
          </div>
          <h1 className="text-xl font-bold text-parchment">Sem créditos disponíveis</h1>
          <p className="text-sm text-parchment/70 mt-3">{semCreditos}</p>
          <div className="mt-6 flex flex-col sm:flex-row items-center justify-center gap-3">
            <button
              onClick={() => onErro?.(new Error('sem_creditos'))}
              className="inline-flex items-center gap-2 px-5 py-2.5 border border-line text-parchment/80 hover:border-gold/40 hover:text-gold text-sm font-semibold rounded-xl transition-colors"
            >
              <ArrowLeft size={16} />
              Voltar
            </button>
            <button
              onClick={() => window.dispatchEvent(new CustomEvent('tributagil:abrir-suporte'))}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-gold hover:bg-gold-soft text-ink text-sm font-semibold rounded-xl transition-colors"
            >
              Renovar plano / comprar créditos
            </button>
          </div>
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

          <BotaoSinalizarErro
            user={user}
            mensagemErro={erroFatal}
            logs={logs}
            casoId={payload?.metadata?.caso_id}
            analiseId={payload?.metadata?.analise_id}
          />
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

          <div className="relative px-5 pt-8 pb-6 text-center sm:px-8 sm:pt-10">
            <NucleoAnalise concluido={concluido} />
            <h1 className="mb-2 font-display text-2xl font-bold tracking-tight text-parchment">
              {concluido ? 'Veredito pronto' : 'Cérebro Tributário'}
            </h1>
            <p className="text-sm text-parchment/50">
              {concluido
                ? 'Sua análise foi processada com sucesso'
                : 'Pesando documentos, prazos e fundamentos'}
            </p>
          </div>

          <div className="space-y-6 px-5 pb-8 sm:px-8">
            <div className="space-y-3">
              <div className="flex items-baseline justify-between gap-3">
                <span className="min-w-0 text-sm font-medium text-parchment/70">{estagio.frase}</span>
                <span className="text-lg font-bold tabular-nums text-gold">{Math.floor(progresso)}%</span>
              </div>
              <BarraProgresso progresso={progresso} />
            </div>

            <TrilhaEtapas progresso={progresso} estagioAtual={estagioAtual} />

            <div className="flex items-center gap-3 rounded-xl border border-line bg-gold/[0.06] p-4 transition-all duration-500">
              <div className="grid h-10 w-10 flex-shrink-0 place-items-center rounded-lg bg-gold/15">
                <IconeAtual size={18} className="text-gold" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-wider text-parchment/40">
                  Etapa {estagio.id} de {ESTAGIOS.length}
                </p>
                <p className="mt-0.5 text-sm text-parchment/70">{estagio.detalhe}</p>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2 sm:gap-3">
              {[
                { icone: Zap, valor: payload?.documentos?.length || 0, rotulo: 'Documentos' },
                { icone: ShieldCheck, valor: 'CTN/LEF', rotulo: 'Base Legal' },
                { icone: Brain, valor: 'Backend', rotulo: 'API Segura' },
              ].map(({ icone: Ic, valor, rotulo }) => (
                <div
                  key={rotulo}
                  className="mi-lift group rounded-xl border border-line bg-ink-800/60 p-3 text-center"
                >
                  <Ic size={16} className="mi-icon mx-auto mb-1 text-gold" />
                  <p className="text-base font-bold text-parchment sm:text-lg">{valor}</p>
                  <p className="text-[10px] uppercase text-parchment/40">{rotulo}</p>
                </div>
              ))}
            </div>

            <LogProcessamento logs={logs} />
            <div ref={logsEndRef} />

            <div className="flex items-center justify-center gap-2 text-xs text-parchment/30">
              <div className={`h-1.5 w-1.5 rounded-full bg-gold ${pulsando ? 'anim-breathe' : ''}`} />
              <span>{concluido ? 'Processo finalizado' : 'Processamento ativo — aguardando resposta da IA'}</span>
            </div>
          </div>
        </div>
        <RodapeLegal comBorda={false} className="mt-4" />
      </div>
    </div>
  );
};

export default CerebroTributario;
