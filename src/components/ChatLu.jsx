// src/components/ChatLu.jsx
//
// Painel de chat do "Lu" — assistente jurídico RAG restrito ao caso corrente
// (documentos do caso + legislação cadastrada). Só fica disponível depois
// que o parecer é emitido e salvo (precisa de um `casoId`).
//
// Duas famílias de pergunta:
//   1. PERGUNTAS PRONTAS (catálogo em src/lib/luPreMontadas.js): respondidas só por
//      código, a partir do parecer e do resumo da peça. Resposta imediata, sem IA,
//      sem rede e SEM descontar da cota.
//   2. PERGUNTAS COM IA (campo livre e sugestões): cota fixa de 5 por CONSULTA DE
//      ANÁLISE (cada linha de `analises` — a original e cada reanálise — tem sua
//      própria cota). Mostrada de forma permanente no cabeçalho, decai a cada
//      pergunta RESPONDIDA com fonte conferida ("não sei", erros e resposta sem fonte
//      não descontam, ver api/lu.js). Ao chegar em 0, só o campo livre é desabilitado:
//      as perguntas prontas continuam liberadas.
//
// EXIGÊNCIA DE DOCUMENTO: o Lu só responde quando a busca encontra pelo
// menos 1 documento do caso relevante — legislação sozinha não é
// suficiente (ver api/lu.js). Por isso o chat também trava (estado final,
// não "carregando") se a indexação terminar sem nenhum documento
// aproveitável.
//
// BLOQUEIO DURANTE A INDEXAÇÃO: a indexação dos documentos (extração +
// embedding) roda em segundo plano depois que o parecer é salvo — pode
// levar alguns segundos a minutos. Enquanto não terminar, o chat inteiro
// fica travado (nada clicável, só a mensagem de carregamento). Se passar de
// ~2 minutos sem concluir, assume-se problema de backend não identificado e
// dispara um ENVIO DUPLO:
//   1. Automático, sem confirmação — um diagnóstico técnico detalhado
//      (possíveis causas) vai direto ao suporte via /api/contato.
//   2. Manual — a Central de Suporte abre na aba "Reportar Erro", já
//      preenchida, e só envia quando o usuário revisar e confirmar.
// Junto, um botão pequeno "Retornar à tela inicial do Lu" deixa o usuário
// voltar a tentar perguntar sem esperar — e nenhum erro desconta pergunta
// da cota (só uma resposta gerada com sucesso desconta, ver api/lu.js).

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Send, Loader2, Sparkles, BookOpen, FileText, AlertCircle, RefreshCw, CheckCircle2, Ban, MailWarning, ArrowLeft, ListChecks } from 'lucide-react';
import { perguntarLu, reindexarCaso, sinalizarIndexacaoTravadaAutomatico } from '../lib/lu';
import { buscarStatusIndexacaoCaso } from '../lib/casos';
import { buscarPerguntasLuDisponiveis, buscarPecaResumoLu } from '../lib/analises';
import { GRUPOS_PRE_MONTADAS, SUGESTOES_IA, LIMITE_PERGUNTAS_IA, responderPreMontada } from '../lib/luPreMontadas';
import VisorFonte from './VisorFonte';

const INTERVALO_POLL_MS = 3000;
// Depois de ~45s ainda carregando, mostra um aviso de demora (não desbloqueia).
const AVISOS_ANTES_DE_DEMORA = Math.ceil(45_000 / INTERVALO_POLL_MS);
// Depois de ~2min ainda carregando, assume problema de backend e abre
// automaticamente a Central de Suporte com o relato pronto.
const TENTATIVAS_ANTES_DE_TRAVADO = Math.ceil(120_000 / INTERVALO_POLL_MS);

function FontesConsultadas({ fontes, onAbrir }) {
  if (!fontes || fontes.length === 0) return null;
  return (
    <div className="mt-3 space-y-1.5 border-t border-line/60 pt-3">
      <p className="text-[10px] font-bold uppercase tracking-wider text-parchment/40">Fontes consultadas</p>
      <ul className="space-y-1">
        {fontes.map((f) => {
          const clicavel = Boolean(f.documento);
          const rotulo =
            f.tipo === 'legislacao'
              ? `${f.norma} ${f.identificador}`
              : f.tipo === 'documento'
                ? `${f.documento}${f.pagina != null ? `, pág. ${f.pagina}` : ''}`
                : f.documento
                  ? `${f.rotulo} (${f.documento})`
                  : f.rotulo;
          return (
            <li key={f.n} className="flex items-start gap-1.5 text-xs text-parchment/55">
              <span className="mt-0.5 w-4 flex-shrink-0 text-right font-semibold text-gold/80">{f.n}</span>
              {f.tipo === 'legislacao' ? (
                <BookOpen size={12} className="mt-0.5 flex-shrink-0 text-gold/70" />
              ) : (
                <FileText size={12} className="mt-0.5 flex-shrink-0 text-parchment/40" />
              )}
              {clicavel ? (
                <button type="button" onClick={() => onAbrir(f)} className="text-left underline decoration-dotted underline-offset-2 hover:text-parchment" title="Abrir o documento">
                  {rotulo}
                </button>
              ) : (
                <span>{rotulo}</span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Catálogo da tela inicial: perguntas prontas (sem IA) e sugestões com IA (cada uma usa 1 da cota). */
function CatalogoPerguntas({ T, onPronta, onIA, disponiveis, limiteAtingido }) {
  return (
    <div className="space-y-4">
      <p className={`text-sm ${T.textoSecundario}`}>
        Escolha uma pergunta pronta, com resposta imediata que não usa as suas perguntas, ou escreva a sua.
      </p>
      {GRUPOS_PRE_MONTADAS.map((grupo) => (
        <div key={grupo.grupo}>
          <p className={`mb-1.5 text-[10px] font-bold uppercase tracking-wider ${T.textoTerciario}`}>{grupo.grupo}</p>
          <div className="flex flex-col gap-2">
            {grupo.itens.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => onPronta(item)}
                className={`rounded-lg border px-3 py-2 text-left text-xs transition-colors ${T.sugestaoBotao}`}
              >
                {item.pergunta}
              </button>
            ))}
          </div>
        </div>
      ))}
      <div>
        <p className={`mb-0.5 text-[10px] font-bold uppercase tracking-wider ${T.textoTerciario}`}>Perguntas com IA</p>
        <p className={`mb-1.5 text-[11px] ${T.textoTerciario}`}>
          Cada uma usa 1 das {LIMITE_PERGUNTAS_IA} perguntas com IA desta consulta{disponiveis != null ? ` (restam ${disponiveis})` : ''}.
        </p>
        <div className="flex flex-col gap-2">
          {SUGESTOES_IA.map((texto) => (
            <button
              key={texto}
              type="button"
              disabled={limiteAtingido}
              onClick={() => onIA(texto)}
              className={`rounded-lg border px-3 py-2 text-left text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${T.sugestaoBotao}`}
            >
              {texto}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Contador FIXO e visível da cota de perguntas — barra de decaimento até 0. */
function ContadorPerguntas({ disponiveis, invertido }) {
  if (disponiveis == null) {
    return <p className={`text-xs ${invertido ? 'text-ink/50' : 'text-parchment/35'}`}>Carregando cota de perguntas...</p>;
  }
  const pct = Math.max(0, Math.min(100, (disponiveis / LIMITE_PERGUNTAS_IA) * 100));
  const zerado = disponiveis <= 0;
  const baixo = disponiveis > 0 && disponiveis <= 2;
  const corNeutra = invertido ? 'text-ink/70' : 'text-parchment/50';
  const corTrilha = invertido ? 'bg-ink/15' : 'bg-ink-700';
  const corBarraNormal = invertido ? 'bg-ink' : 'bg-gold';

  return (
    <div className="w-36 flex-shrink-0">
      <div className="mb-1 flex items-center justify-between text-[11px]">
        <span className={zerado ? 'font-semibold text-red-700' : baixo ? 'font-semibold text-amber-700' : corNeutra}>
          {disponiveis} de {LIMITE_PERGUNTAS_IA} perguntas com IA
        </span>
      </div>
      <div className={`h-1.5 overflow-hidden rounded-full ${corTrilha}`}>
        <div
          className={`h-full rounded-full transition-all ${zerado ? 'bg-red-500' : baixo ? 'bg-amber-400' : corBarraNormal}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

/** Monta e dispara o pedido de abertura da Central de Suporte já preenchido (2º envio — manual). */
function abrirSuporteComRelato({ casoId, analiseId, user, minutos }) {
  const bug = {
    tipo: 'Chatbot Lu não carregou',
    descricao:
      `O chatbot Lu não liberou o chat deste caso — a tela "Carregando dados do caso..." ficou ` +
      `travada por mais de ${minutos} minuto(s) sem concluir.\n\n` +
      `Um diagnóstico técnico automático já foi enviado ao suporte assim que o travamento foi detectado. ` +
      `Esta mensagem é complementar — sinta-se à vontade para adicionar mais contexto e anexar uma ` +
      `captura de tela da tela travada, se tiver.\n\n` +
      `Solicito uma avaliação técnica (parecer) sobre a causa provável deste erro.`,
    passos:
      `Caso: ${casoId}\n` +
      `Consulta (análise): ${analiseId || '—'}\n` +
      `Usuário: ${user?.email || 'não identificado'} (id: ${user?.id || '—'})\n` +
      `Tempo decorrido: ~${minutos} min\n` +
      `Data/hora: ${new Date().toISOString()}`,
    email: user?.email || '',
  };
  window.dispatchEvent(new CustomEvent('tributagil:abrir-suporte', { detail: { bug } }));
}

// Paleta do chat. Por padrão segue o resto do app (preto principal, dourado
// de destaque). Com `invertido` (janela flutuante — ver ChatLuFlutuante.jsx)
// o painel principal vira dourado e o preto passa a ser o destaque
// secundário, para o chat se diferenciar visualmente do bloco de resultados.
function temaChat(invertido) {
  if (!invertido) {
    return {
      painel: 'border border-line bg-ink-800/50',
      cabecalhoBorda: 'border-line',
      iconeFundo: 'bg-gold/15',
      iconeCor: 'text-gold',
      titulo: 'text-parchment',
      subtitulo: 'text-parchment/40',
      botaoBorda: 'border-line text-parchment/50 hover:border-gold/30 hover:text-parchment/80',
      bolhaUsuario: 'bg-gold text-ink font-medium',
      bolhaLu: 'border border-line bg-ink-900/60 text-parchment/85',
      inputBorda: 'border-line bg-ink-900 text-parchment placeholder:text-parchment/30 focus:border-gold/50 focus:ring-gold/15',
      enviarBotao: 'bg-gold text-ink hover:bg-gold-soft',
      sugestaoBotao: 'border-line bg-ink-900/50 text-parchment/60 hover:border-gold/30 hover:text-parchment/85',
      textoPrimario: 'text-parchment',
      textoSecundario: 'text-parchment/50',
      textoTerciario: 'text-parchment/45',
    };
  }
  return {
    painel: 'border border-ink-900/30 bg-gold shadow-2xl shadow-[var(--shadow-gold)]',
    cabecalhoBorda: 'border-ink-900/15',
    iconeFundo: 'bg-ink/10',
    iconeCor: 'text-ink',
    titulo: 'text-ink',
    subtitulo: 'text-ink/60',
    botaoBorda: 'border-ink/20 text-ink/60 hover:border-ink/40 hover:text-ink',
    bolhaUsuario: 'bg-ink text-gold font-medium',
    bolhaLu: 'border border-ink/15 bg-ink text-parchment',
    inputBorda: 'border-ink/25 bg-ink text-parchment placeholder:text-parchment/35 focus:border-ink/50 focus:ring-ink/15',
    enviarBotao: 'bg-ink text-gold hover:bg-ink-800',
    sugestaoBotao: 'border-ink/20 bg-ink/90 text-parchment/80 hover:border-ink/40 hover:text-parchment',
    textoPrimario: 'text-ink',
    textoSecundario: 'text-ink/70',
    textoTerciario: 'text-ink/60',
  };
}

/**
 * @param {{ casoId: string | null, analiseId: string | null, user?: object, invertido?: boolean }} props
 */
export default function ChatLu({ casoId, analiseId, user, resultado, invertido = false }) {
  const T = temaChat(invertido);
  const [mensagens, setMensagens] = useState([]); // { papel: 'usuario'|'lu', texto, fontes?, limite? }
  const [pergunta, setPergunta] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState(null);
  const [disponiveis, setDisponiveis] = useState(null); // null = carregando/desconhecido
  const [pecaResumo, setPecaResumo] = useState(null); // resumo da última peça gerada (null = nenhuma)
  const [fonteAberta, setFonteAberta] = useState(null);
  const [verCatalogo, setVerCatalogo] = useState(true);
  const [reindexando, setReindexando] = useState(false);
  const [reindexOk, setReindexOk] = useState(null); // resultado da última reindexação manual
  // 'carregando' | 'sem-conteudo' | 'pronto'
  const [statusChat, setStatusChat] = useState('carregando');
  const [demorando, setDemorando] = useState(false);
  const [travado, setTravado] = useState(false);
  // Escape manual: "Retornar à tela inicial do Lu" — deixa o usuário voltar
  // a tentar perguntar mesmo com a indexação ainda travada (o próprio Lu
  // protege contra resposta ruim: sem documento encontrado, é "não sei",
  // que não desconta pergunta — ver api/lu.js).
  const [ignorarBloqueio, setIgnorarBloqueio] = useState(false);
  const fimRef = useRef(null);

  useEffect(() => {
    fimRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [mensagens, enviando]);

  useEffect(() => {
    if (!analiseId) return;
    let vivo = true;
    buscarPerguntasLuDisponiveis(analiseId).then((valor) => {
      if (vivo) setDisponiveis(valor);
    });
    return () => {
      vivo = false;
    };
  }, [analiseId]);

  // Resumo da última peça gerada: lido ao abrir e de novo quando a peça é gerada (evento do ModalGerarPeca)
  useEffect(() => {
    if (!analiseId) return;
    let vivo = true;
    const carregar = () =>
      buscarPecaResumoLu(analiseId).then((v) => {
        if (vivo) setPecaResumo(v);
      });
    carregar();
    window.addEventListener('tributagil:peca-gerada', carregar);
    return () => {
      vivo = false;
      window.removeEventListener('tributagil:peca-gerada', carregar);
    };
  }, [analiseId]);

  // Poll do status de indexação até completar com conteúdo aproveitável (ou
  // até não dar mais para checar — migração pendente etc., aí libera por
  // padrão, nunca bloqueia pra sempre por um motivo que não é "processando").
  useEffect(() => {
    if (!casoId) return;
    // Reseta de imediato (síncrono) ao trocar de caso — evita mostrar por um
    // instante o status do caso ANTERIOR enquanto a 1ª checagem não voltou.
    setStatusChat('carregando');
    setDemorando(false);
    setTravado(false);
    setIgnorarBloqueio(false);
    let vivo = true;
    let tentativas = 0;
    let avisoEnviado = false;

    const checar = async () => {
      const status = await buscarStatusIndexacaoCaso(casoId);
      if (!vivo) return;

      if (status === null) {
        // Não deu pra checar (migração pendente) — não bloqueia à toa.
        setStatusChat('pronto');
        return;
      }
      if (status.completo) {
        setStatusChat(status.algumComConteudo ? 'pronto' : 'sem-conteudo');
        return;
      }

      tentativas += 1;
      setStatusChat('carregando');
      setDemorando(tentativas >= AVISOS_ANTES_DE_DEMORA);

      if (tentativas >= TENTATIVAS_ANTES_DE_TRAVADO && !avisoEnviado) {
        avisoEnviado = true;
        setTravado(true);
        const minutos = Math.round((tentativas * INTERVALO_POLL_MS) / 60000);
        // Envio 1 — automático, sem confirmação: diagnóstico técnico direto ao suporte.
        sinalizarIndexacaoTravadaAutomatico({ casoId, analiseId, user, minutos });
        // Envio 2 — manual: abre a Central de Suporte já preenchida; só sai
        // do ar quando o usuário revisar e clicar em enviar.
        abrirSuporteComRelato({ casoId, analiseId, user, minutos });
      }

      setTimeout(() => {
        if (vivo) checar();
      }, INTERVALO_POLL_MS);
    };

    checar();
    return () => {
      vivo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [casoId]);

  const limiteAtingido = disponiveis === 0;

  const enviar = useCallback(
    async (textoForcado) => {
      const texto = (textoForcado ?? pergunta).trim();
      if (!texto || enviando || !casoId || !analiseId || limiteAtingido) return;

      setErro(null);
      setPergunta('');
      setVerCatalogo(false);
      setMensagens((prev) => [...prev, { papel: 'usuario', texto }]);
      setEnviando(true);

      try {
        const historico = mensagens.filter((m) => !m.pronta).slice(-6).map((m) => ({ papel: m.papel, texto: m.texto }));
        const { resposta, fontes, perguntasDisponiveis, limiteAtingido: atingiuAgora, semFonteConferida } = await perguntarLu({
          casoId,
          analiseId,
          pergunta: texto,
          historico,
        });
        setMensagens((prev) => [...prev, { papel: 'lu', texto: resposta, fontes, limite: !!atingiuAgora, semFonteConferida: !!semFonteConferida }]);
        if (Number.isFinite(perguntasDisponiveis)) setDisponiveis(perguntasDisponiveis);
      } catch (err) {
        console.error('[ChatLu] Falha ao perguntar:', err);
        setErro(err.message || 'Não foi possível falar com o Lu agora.');
      } finally {
        setEnviando(false);
      }
    },
    [pergunta, enviando, casoId, analiseId, limiteAtingido, mensagens],
  );

  // Pergunta pronta: respondida aqui mesmo, por código. Não chama o servidor e não mexe na cota.
  const perguntarPronta = useCallback(
    (item) => {
      const { texto, fontes, semPeca } = responderPreMontada(item.id, { resultado, pecaResumo });
      setVerCatalogo(false);
      setMensagens((prev) => [...prev, { papel: 'usuario', texto: item.pergunta }, { papel: 'lu', texto, fontes, pronta: true, semPeca }]);
    },
    [resultado, pecaResumo],
  );

  const handleSubmit = (e) => {
    e.preventDefault();
    enviar();
  };

  const handleReindexar = async () => {
    if (reindexando || !casoId) return;
    setReindexando(true);
    setReindexOk(null);
    const resultado = await reindexarCaso(casoId);
    setReindexando(false);
    setReindexOk(resultado);
  };

  if (!casoId) {
    return (
      <div className={`flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed px-6 py-8 text-center ${T.painel}`}>
        <Sparkles size={22} className={T.textoTerciario} />
        <p className={`text-sm ${T.textoSecundario}`}>
          O Lu fica disponível assim que esta análise for salva no histórico. Aguarde alguns
          segundos ou reabra a análise pelo Histórico.
        </p>
      </div>
    );
  }

  // Indexação ainda rodando em segundo plano: nada clicável até terminar —
  // evita um "não sei" que na verdade é só timing (documento ainda não
  // processado), não falta real de informação. Exceção: `ignorarBloqueio`
  // (botão "Retornar à tela inicial do Lu") deixa o usuário voltar a
  // tentar mesmo travado — o próprio Lu já protege contra resposta ruim.
  if (statusChat === 'carregando' && !ignorarBloqueio) {
    return (
      <div className={`flex flex-col items-center justify-center gap-4 rounded-xl px-6 py-8 text-center ${T.painel}`}>
        <div className={`grid h-12 w-12 place-items-center rounded-xl ${travado ? 'bg-red-500/15' : T.iconeFundo}`}>
          {travado ? <MailWarning size={22} className="text-red-400" /> : <Loader2 size={22} className={`animate-spin ${T.iconeCor}`} />}
        </div>
        {travado ? (
          <div>
            <p className={`text-sm font-semibold ${T.titulo}`}>Isso está demorando demais</p>
            <p className={`mt-1.5 max-w-sm text-xs ${T.textoTerciario}`}>
              Identificamos um problema de backend não identificado ao processar os documentos deste
              caso. Já enviamos um diagnóstico técnico automático ao suporte e abrimos a Central de
              Suporte com um relato pronto — revise, anexe uma captura de tela se puder, e confirme o
              envio quando quiser. O chat libera sozinho se a indexação terminar enquanto isso.
            </p>
            <p className={`mt-2 max-w-sm text-xs ${T.textoTerciario}`}>
              Nenhuma pergunta foi descontada da sua cota por causa desse problema.
            </p>
          </div>
        ) : (
          <div>
            <p className={`text-sm font-semibold ${T.titulo}`}>Carregando dados do caso...</p>
            <p className={`mt-1.5 max-w-sm text-xs ${T.textoTerciario}`}>
              O Lu está processando os documentos deste caso. Isso leva só alguns instantes — a
              pergunta libera automaticamente assim que terminar.
            </p>
          </div>
        )}
        {demorando && !travado && (
          <p className="max-w-sm text-xs text-amber-700/90">
            Isso está demorando mais que o normal. Continue aguardando mais um pouco.
          </p>
        )}
        {travado && (
          <button
            type="button"
            onClick={() => setIgnorarBloqueio(true)}
            className={`mt-1 flex items-center gap-1 text-[11px] underline-offset-2 transition-colors hover:underline ${T.textoTerciario}`}
          >
            <ArrowLeft size={11} />
            Retornar à tela inicial do Lu
          </button>
        )}
      </div>
    );
  }

  // Indexação terminou, mas nenhum documento produziu conteúdo aproveitável
  // (ilegível/em branco) — o Lu exige documento encontrado para responder,
  // então não há chat possível aqui (estado final, não "carregando").
  if (statusChat === 'sem-conteudo') {
    return (
      <div className={`flex flex-col items-center justify-center gap-3 rounded-xl px-6 py-8 text-center ${T.painel}`}>
        <Ban size={22} className={T.textoTerciario} />
        <p className={`text-sm font-semibold ${T.titulo}`}>Nenhum documento deste caso ficou disponível para o Lu</p>
        <p className={`max-w-sm text-xs ${T.textoTerciario}`}>
          Os documentos anexados não produziram texto aproveitável (podem estar ilegíveis ou em
          branco). O Lu não responde só com base em legislação genérica, sem relação com este caso.
          Tente reindexar ou anexe um documento novo numa reanálise.
        </p>
        <button
          type="button"
          onClick={handleReindexar}
          disabled={reindexando}
          className={`mt-1 flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs transition-colors disabled:opacity-50 ${T.botaoBorda}`}
        >
          {reindexando ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
          Tentar reindexar
        </button>
        {reindexOk && (
          <p className={`text-xs ${reindexOk.ok ? T.textoPrimario : 'text-red-700'}`}>
            {reindexOk.ok
              ? `${reindexOk.chunks_indexados ?? 0} trecho(s) novo(s) indexado(s).`
              : reindexOk.error || 'Não foi possível reindexar agora.'}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className={`flex h-full min-h-0 flex-col rounded-xl ${T.painel}`}>
      <div className={`flex flex-col gap-2.5 border-b px-4 py-3 ${T.cabecalhoBorda}`}>
        <div className="flex items-center gap-2.5 min-w-0">
          <div className={`grid h-8 w-8 flex-shrink-0 place-items-center rounded-lg ${T.iconeFundo}`}>
            <Sparkles size={15} className={T.iconeCor} />
          </div>
          <div className="min-w-0">
            <p className={`text-sm font-semibold ${T.titulo}`}>Bate-papo com o Lu</p>
            <p className={`text-xs ${T.subtitulo}`}>Responde só com base neste caso e na legislação cadastrada</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <ContadorPerguntas disponiveis={disponiveis} invertido={invertido} />
          <button
            type="button"
            onClick={() => setVerCatalogo((v) => !v)}
            title="Mostrar ou esconder as perguntas prontas"
            className={`flex shrink-0 items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs transition-colors ${T.botaoBorda}`}
          >
            <ListChecks size={12} />
            <span className="hidden sm:inline">Perguntas prontas</span>
          </button>
          <button
            type="button"
            onClick={handleReindexar}
            disabled={reindexando}
            title="Se o Lu não estiver encontrando um documento que você já anexou, tente reindexar — seguro de repetir, documentos já indexados são pulados"
            className={`flex shrink-0 items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs transition-colors disabled:opacity-50 ${T.botaoBorda}`}
          >
            {reindexando ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
            <span className="hidden sm:inline">Reindexar</span>
          </button>
        </div>
      </div>

      {reindexOk && (
        <div
          className={`flex items-center gap-2 border-b px-5 py-2 text-xs ${T.cabecalhoBorda} ${
            reindexOk.ok ? T.textoPrimario : 'text-red-700'
          }`}
        >
          {reindexOk.ok ? <CheckCircle2 size={12} /> : <AlertCircle size={12} />}
          {reindexOk.ok
            ? `Documentos reindexados: ${reindexOk.chunks_indexados ?? 0} trecho(s) novo(s), ${reindexOk.documentos_pulados ?? 0} já estava(m) em dia.`
            : reindexOk.error || 'Não foi possível reindexar agora.'}
        </div>
      )}

      {!pecaResumo && (
        <p className={`px-4 pt-2 text-[11px] opacity-60 ${T.textoSecundario}`}>
          Nenhuma peça foi gerada para esta consulta ainda. O Lu responde com base no parecer e nos documentos.
        </p>
      )}

      <div className="flex min-h-[12rem] flex-1 flex-col gap-3 overflow-y-auto px-4 py-3">
        {verCatalogo && (
          <CatalogoPerguntas T={T} onPronta={perguntarPronta} onIA={(t) => enviar(t)} disponiveis={disponiveis} limiteAtingido={limiteAtingido} />
        )}

        {mensagens.map((m, i) => (
          <div key={i} className={`flex ${m.papel === 'usuario' ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`max-w-[85%] rounded-xl px-4 py-3 text-sm leading-relaxed ${
                m.papel === 'usuario'
                  ? T.bolhaUsuario
                  : m.limite
                    ? 'border border-amber-500/30 bg-amber-500/10 text-amber-900'
                    : T.bolhaLu
              }`}
            >
              {m.semFonteConferida && (
                <p className="mb-2 text-xs font-semibold text-amber-400">Resposta sem fonte conferida: confira nos documentos antes de usar.</p>
              )}
              <p className="whitespace-pre-wrap">{m.texto}</p>
              {m.papel === 'lu' && <FontesConsultadas fontes={m.fontes} onAbrir={setFonteAberta} />}
              {m.pronta && <p className="mt-2 text-[10px] uppercase tracking-wider opacity-50">Resposta pronta, sem IA</p>}
            </div>
          </div>
        ))}

        {enviando && (
          <div className={`flex items-center gap-2 text-xs ${T.textoTerciario}`}>
            <Loader2 size={13} className="animate-spin" /> Lu está consultando o caso e a legislação...
          </div>
        )}

        {erro && (
          <div className="flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-700">
            <AlertCircle size={13} className="mt-0.5 flex-shrink-0" />
            {erro}
          </div>
        )}

        <div ref={fimRef} />
      </div>

      {limiteAtingido && (
        <div className="mx-5 mb-3 flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-900">
          <Ban size={13} className="mt-0.5 flex-shrink-0" />
          Você já usou as 5 perguntas com IA desta consulta. As perguntas prontas continuam liberadas, e
          uma reanálise deste caso (nova consulta) dá outras 5.
        </div>
      )}

      <form onSubmit={handleSubmit} className={`flex items-center gap-2 border-t p-3 ${T.cabecalhoBorda}`}>
        <input
          type="text"
          value={pergunta}
          onChange={(e) => setPergunta(e.target.value)}
          placeholder={limiteAtingido ? 'Perguntas com IA esgotadas nesta consulta' : disponiveis != null ? `Pergunta livre (usa 1 das ${disponiveis} perguntas com IA)` : 'Pergunta livre ao Lu...'}
          disabled={enviando || limiteAtingido}
          maxLength={2000}
          className={`flex-1 rounded-lg border px-3 py-2.5 text-sm outline-none transition-all focus:ring-2 disabled:opacity-60 ${T.inputBorda}`}
        />
        <button
          type="submit"
          disabled={enviando || limiteAtingido || !pergunta.trim()}
          className={`grid h-10 w-10 flex-shrink-0 place-items-center rounded-lg transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${T.enviarBotao}`}
          aria-label="Enviar pergunta"
        >
          {enviando ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
        </button>
      </form>

      {fonteAberta && <VisorFonte fonte={fonteAberta} casoId={casoId} onFechar={() => setFonteAberta(null)} />}
    </div>
  );
}
