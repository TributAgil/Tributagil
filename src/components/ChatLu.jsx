// src/components/ChatLu.jsx
//
// Painel de chat do "Lu" — assistente jurídico RAG restrito ao caso corrente
// (documentos do caso + legislação cadastrada). Só fica disponível depois
// que o parecer é emitido e salvo (precisa de um `casoId`).
//
// Cota fixa de 10 perguntas por CONSULTA DE ANÁLISE (cada linha de
// `analises` — a original e cada reanálise, já que cada uma consome 1
// crédito próprio — tem sua própria cota, nunca compartilhada com outras
// versões do mesmo caso). Mostrada de forma permanente no cabeçalho, decai
// a cada pergunta RESPONDIDA ("não sei" e erros não descontam, ver
// api/lu.js). Ao chegar em 0, a caixa de pergunta é desabilitada.
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
// ~2 minutos sem concluir, assume-se problema de backend não identificado:
// abre automaticamente a Central de Suporte na aba "Reportar Erro", já
// preenchida com o relato técnico, para o usuário revisar e enviar.

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Send, Loader2, Sparkles, BookOpen, FileText, AlertCircle, RefreshCw, CheckCircle2, Ban, MailWarning } from 'lucide-react';
import { perguntarLu, reindexarCaso } from '../lib/lu';
import { buscarStatusIndexacaoCaso } from '../lib/casos';
import { buscarPerguntasLuDisponiveis } from '../lib/analises';

const LIMITE_PERGUNTAS = 10;
const INTERVALO_POLL_MS = 3000;
// Depois de ~45s ainda carregando, mostra um aviso de demora (não desbloqueia).
const AVISOS_ANTES_DE_DEMORA = Math.ceil(45_000 / INTERVALO_POLL_MS);
// Depois de ~2min ainda carregando, assume problema de backend e abre
// automaticamente a Central de Suporte com o relato pronto.
const TENTATIVAS_ANTES_DE_TRAVADO = Math.ceil(120_000 / INTERVALO_POLL_MS);

// Sugestões pré-montadas, restritas a 3 frentes de uso real do advogado
// tributarista (sem viés didático — o público já domina o protocolo do
// direito tributário): fundamentação legal, estratégia processual e
// conferência de dados. Cada clique consome 1 das 10 perguntas da consulta,
// então o critério de inclusão é "vale o crédito", não cobertura ampla.
const SUGESTOES_POR_CATEGORIA = [
  {
    categoria: 'Fundamentação legal',
    perguntas: [
      'Qual o fundamento legal exato da conclusão mais favorável deste parecer?',
      'Essa decadência se enquadra no art. 150, §4º ou no art. 173, I do CTN — e por quê?',
    ],
  },
  {
    categoria: 'Estratégia processual',
    perguntas: [
      'Entre exceção de pré-executividade e embargos, qual você recomenda aqui e por quê?',
      'Quais são os próximos passos recomendados para este caso?',
    ],
  },
  {
    categoria: 'Conferência de dados',
    perguntas: [
      'Existe alguma data usada no cálculo que ainda precisa ser confirmada nos documentos?',
      'Em que documento consta a data de citação do executado?',
    ],
  },
];

function FontesConsultadas({ fontes }) {
  if (!fontes || fontes.length === 0) return null;
  return (
    <div className="mt-3 space-y-1.5 border-t border-line/60 pt-3">
      <p className="text-[10px] font-bold uppercase tracking-wider text-parchment/40">Fontes consultadas</p>
      <ul className="space-y-1">
        {fontes.map((f, i) => (
          <li key={i} className="flex items-start gap-1.5 text-xs text-parchment/55">
            {f.tipo === 'legislacao' ? (
              <BookOpen size={12} className="mt-0.5 flex-shrink-0 text-gold/70" />
            ) : (
              <FileText size={12} className="mt-0.5 flex-shrink-0 text-parchment/40" />
            )}
            {f.tipo === 'legislacao' ? (
              <span>{f.norma} {f.identificador}</span>
            ) : (
              <span>
                {f.documento}
                {f.pagina != null ? ` — pág. ${f.pagina}` : ''}
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Contador FIXO e visível da cota de perguntas — barra de decaimento até 0. */
function ContadorPerguntas({ disponiveis }) {
  if (disponiveis == null) {
    return <p className="text-xs text-parchment/35">Carregando cota de perguntas...</p>;
  }
  const pct = Math.max(0, Math.min(100, (disponiveis / LIMITE_PERGUNTAS) * 100));
  const zerado = disponiveis <= 0;
  const baixo = disponiveis > 0 && disponiveis <= 2;

  return (
    <div className="w-full sm:w-44">
      <div className="mb-1 flex items-center justify-between text-[11px]">
        <span className={zerado ? 'font-semibold text-red-300' : baixo ? 'font-semibold text-amber-300' : 'text-parchment/50'}>
          {disponiveis} de {LIMITE_PERGUNTAS} perguntas
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-ink-700">
        <div
          className={`h-full rounded-full transition-all ${zerado ? 'bg-red-500' : baixo ? 'bg-amber-400' : 'bg-gold'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

/** Monta e dispara o pedido de abertura da Central de Suporte já preenchido. */
function abrirSuporteComRelato({ casoId, analiseId, user, minutos }) {
  const bug = {
    tipo: 'Chatbot Lu não carregou',
    descricao:
      `O chatbot Lu não liberou o chat deste caso — a tela "Carregando dados do caso..." ficou ` +
      `travada por mais de ${minutos} minuto(s) sem concluir.\n\n` +
      `Solicito uma avaliação técnica (parecer) sobre a causa provável deste erro.\n\n` +
      `Se possível, anexe abaixo uma captura de tela da tela travada.`,
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

/**
 * @param {{ casoId: string | null, analiseId: string | null, user?: object }} props
 */
export default function ChatLu({ casoId, analiseId, user }) {
  const [mensagens, setMensagens] = useState([]); // { papel: 'usuario'|'lu', texto, fontes?, limite? }
  const [pergunta, setPergunta] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState(null);
  const [disponiveis, setDisponiveis] = useState(null); // null = carregando/desconhecido
  const [reindexando, setReindexando] = useState(false);
  const [reindexOk, setReindexOk] = useState(null); // resultado da última reindexação manual
  // 'carregando' | 'sem-conteudo' | 'pronto'
  const [statusChat, setStatusChat] = useState('carregando');
  const [demorando, setDemorando] = useState(false);
  const [travado, setTravado] = useState(false);
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
        abrirSuporteComRelato({
          casoId,
          analiseId,
          user,
          minutos: Math.round((tentativas * INTERVALO_POLL_MS) / 60000),
        });
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
      setMensagens((prev) => [...prev, { papel: 'usuario', texto }]);
      setEnviando(true);

      try {
        const historico = mensagens.slice(-6).map((m) => ({ papel: m.papel, texto: m.texto }));
        const { resposta, fontes, perguntasDisponiveis, limiteAtingido: atingiuAgora } = await perguntarLu({
          casoId,
          analiseId,
          pergunta: texto,
          historico,
        });
        setMensagens((prev) => [...prev, { papel: 'lu', texto: resposta, fontes, limite: !!atingiuAgora }]);
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
      <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-line bg-ink-800/30 px-8 py-14 text-center">
        <Sparkles size={22} className="text-parchment/30" />
        <p className="text-sm text-parchment/50">
          O Lu fica disponível assim que esta análise for salva no histórico. Aguarde alguns
          segundos ou reabra a análise pelo Histórico.
        </p>
      </div>
    );
  }

  // Indexação ainda rodando em segundo plano: nada clicável até terminar —
  // evita um "não sei" que na verdade é só timing (documento ainda não
  // processado), não falta real de informação.
  if (statusChat === 'carregando') {
    return (
      <div className="flex flex-col items-center justify-center gap-4 rounded-xl border border-line bg-ink-800/50 px-8 py-16 text-center">
        <div className={`grid h-12 w-12 place-items-center rounded-xl ${travado ? 'bg-red-500/15' : 'bg-gold/15'}`}>
          {travado ? <MailWarning size={22} className="text-red-400" /> : <Loader2 size={22} className="animate-spin text-gold" />}
        </div>
        {travado ? (
          <div>
            <p className="text-sm font-semibold text-parchment">Isso está demorando demais</p>
            <p className="mt-1.5 max-w-sm text-xs text-parchment/45">
              Identificamos um problema de backend não identificado ao processar os documentos deste
              caso. Abrimos a Central de Suporte com um relato pronto — revise, anexe uma captura de
              tela se puder, e envie para nossa equipe avaliar. O chat libera sozinho se a indexação
              terminar enquanto isso.
            </p>
          </div>
        ) : (
          <div>
            <p className="text-sm font-semibold text-parchment">Carregando dados do caso...</p>
            <p className="mt-1.5 max-w-sm text-xs text-parchment/45">
              O Lu está processando os documentos deste caso. Isso leva só alguns instantes — a
              pergunta libera automaticamente assim que terminar.
            </p>
          </div>
        )}
        {demorando && !travado && (
          <p className="max-w-sm text-xs text-amber-300/80">
            Isso está demorando mais que o normal. Continue aguardando mais um pouco.
          </p>
        )}
      </div>
    );
  }

  // Indexação terminou, mas nenhum documento produziu conteúdo aproveitável
  // (ilegível/em branco) — o Lu exige documento encontrado para responder,
  // então não há chat possível aqui (estado final, não "carregando").
  if (statusChat === 'sem-conteudo') {
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-line bg-ink-800/50 px-8 py-14 text-center">
        <Ban size={22} className="text-parchment/30" />
        <p className="text-sm font-semibold text-parchment">Nenhum documento deste caso ficou disponível para o Lu</p>
        <p className="max-w-sm text-xs text-parchment/45">
          Os documentos anexados não produziram texto aproveitável (podem estar ilegíveis ou em
          branco). O Lu não responde só com base em legislação genérica, sem relação com este caso.
          Tente reindexar ou anexe um documento novo numa reanálise.
        </p>
        <button
          type="button"
          onClick={handleReindexar}
          disabled={reindexando}
          className="mt-1 flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-xs text-parchment/60 transition-colors hover:border-gold/30 hover:text-parchment/85 disabled:opacity-50"
        >
          {reindexando ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
          Tentar reindexar
        </button>
        {reindexOk && (
          <p className={`text-xs ${reindexOk.ok ? 'text-gold' : 'text-red-300'}`}>
            {reindexOk.ok
              ? `${reindexOk.chunks_indexados ?? 0} trecho(s) novo(s) indexado(s).`
              : reindexOk.error || 'Não foi possível reindexar agora.'}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col rounded-xl border border-line bg-ink-800/50">
      <div className="flex flex-col gap-3 border-b border-line px-5 py-3.5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-lg bg-gold/15">
            <Sparkles size={15} className="text-gold" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-parchment">Lu — assistente jurídico</p>
            <p className="text-xs text-parchment/40">Responde só com base neste caso e na legislação cadastrada</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <ContadorPerguntas disponiveis={disponiveis} />
          <button
            type="button"
            onClick={handleReindexar}
            disabled={reindexando}
            title="Se o Lu não estiver encontrando um documento que você já anexou, tente reindexar — seguro de repetir, documentos já indexados são pulados"
            className="flex shrink-0 items-center gap-1.5 rounded-lg border border-line px-2.5 py-1.5 text-xs text-parchment/50 transition-colors hover:border-gold/30 hover:text-parchment/80 disabled:opacity-50"
          >
            {reindexando ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
            <span className="hidden sm:inline">Reindexar</span>
          </button>
        </div>
      </div>

      {reindexOk && (
        <div
          className={`flex items-center gap-2 border-b border-line px-5 py-2 text-xs ${
            reindexOk.ok ? 'text-gold' : 'text-red-300'
          }`}
        >
          {reindexOk.ok ? <CheckCircle2 size={12} /> : <AlertCircle size={12} />}
          {reindexOk.ok
            ? `Documentos reindexados: ${reindexOk.chunks_indexados ?? 0} trecho(s) novo(s), ${reindexOk.documentos_pulados ?? 0} já estava(m) em dia.`
            : reindexOk.error || 'Não foi possível reindexar agora.'}
        </div>
      )}

      <div className="flex max-h-[28rem] min-h-[16rem] flex-col gap-4 overflow-y-auto px-5 py-4">
        {mensagens.length === 0 && !limiteAtingido && (
          <div className="space-y-4">
            <p className="text-sm text-parchment/50">
              Pergunte sobre os documentos deste caso ou sobre a legislação de prescrição/decadência
              aplicada no parecer.
            </p>
            {SUGESTOES_POR_CATEGORIA.map((grupo) => (
              <div key={grupo.categoria}>
                <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-parchment/35">
                  {grupo.categoria}
                </p>
                <div className="flex flex-col gap-2">
                  {grupo.perguntas.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => enviar(s)}
                      className="rounded-lg border border-line bg-ink-900/50 px-3 py-2 text-left text-xs text-parchment/60 transition-colors hover:border-gold/30 hover:text-parchment/85"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {mensagens.map((m, i) => (
          <div key={i} className={`flex ${m.papel === 'usuario' ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`max-w-[85%] rounded-xl px-4 py-3 text-sm leading-relaxed ${
                m.papel === 'usuario'
                  ? 'bg-gold text-ink font-medium'
                  : m.limite
                    ? 'border border-amber-500/30 bg-amber-500/10 text-amber-200/90'
                    : 'border border-line bg-ink-900/60 text-parchment/85'
              }`}
            >
              <p className="whitespace-pre-wrap">{m.texto}</p>
              {m.papel === 'lu' && <FontesConsultadas fontes={m.fontes} />}
            </div>
          </div>
        ))}

        {enviando && (
          <div className="flex items-center gap-2 text-xs text-parchment/40">
            <Loader2 size={13} className="animate-spin" /> Lu está consultando o caso e a legislação...
          </div>
        )}

        {erro && (
          <div className="flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
            <AlertCircle size={13} className="mt-0.5 flex-shrink-0" />
            {erro}
          </div>
        )}

        <div ref={fimRef} />
      </div>

      {limiteAtingido && (
        <div className="mx-5 mb-3 flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200/90">
          <Ban size={13} className="mt-0.5 flex-shrink-0" />
          Você já usou as 10 perguntas disponíveis para esta consulta. Uma reanálise deste caso (nova
          consulta) dá outras 10.
        </div>
      )}

      <form onSubmit={handleSubmit} className="flex items-center gap-2 border-t border-line p-3">
        <input
          type="text"
          value={pergunta}
          onChange={(e) => setPergunta(e.target.value)}
          placeholder={limiteAtingido ? 'Cota de perguntas desta consulta esgotada' : 'Pergunte ao Lu sobre este caso...'}
          disabled={enviando || limiteAtingido}
          maxLength={2000}
          className="flex-1 rounded-lg border border-line bg-ink-900 px-3 py-2.5 text-sm text-parchment placeholder:text-parchment/30 outline-none transition-all focus:border-gold/50 focus:ring-2 focus:ring-gold/15 disabled:opacity-60"
        />
        <button
          type="submit"
          disabled={enviando || limiteAtingido || !pergunta.trim()}
          className="grid h-10 w-10 flex-shrink-0 place-items-center rounded-lg bg-gold text-ink transition-colors hover:bg-gold-soft disabled:cursor-not-allowed disabled:opacity-40"
          aria-label="Enviar pergunta"
        >
          {enviando ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
        </button>
      </form>
    </div>
  );
}
