// src/components/ChatLu.jsx
//
// Painel de chat do "Lu" — assistente jurídico RAG restrito ao caso corrente
// (documentos do caso + legislação cadastrada). Só fica disponível depois
// que o parecer é emitido e salvo (precisa de um `casoId`).
//
// Cota fixa de 10 perguntas por caso, mostrada de forma permanente no
// cabeçalho (decai a cada pergunta RESPONDIDA — "não sei" e erros não
// descontam, ver api/lu.js). Ao chegar em 0, a caixa de pergunta é
// desabilitada.

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Send, Loader2, Sparkles, BookOpen, FileText, AlertCircle, RefreshCw, CheckCircle2, Ban } from 'lucide-react';
import { perguntarLu, reindexarCaso } from '../lib/lu';
import { buscarPerguntasLuDisponiveis } from '../lib/casos';

const LIMITE_PERGUNTAS = 10;

// Sugestões pré-montadas, restritas a 3 frentes de uso real do advogado
// tributarista (sem viés didático — o público já domina o protocolo do
// direito tributário): fundamentação legal, estratégia processual e
// conferência de dados. Cada clique consome 1 das 10 perguntas do caso,
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

/**
 * @param {{ casoId: string | null }} props
 */
export default function ChatLu({ casoId }) {
  const [mensagens, setMensagens] = useState([]); // { papel: 'usuario'|'lu', texto, fontes?, limite? }
  const [pergunta, setPergunta] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState(null);
  const [disponiveis, setDisponiveis] = useState(null); // null = carregando/desconhecido
  const [reindexando, setReindexando] = useState(false);
  const [reindexOk, setReindexOk] = useState(null); // resultado da última reindexação manual
  const fimRef = useRef(null);

  useEffect(() => {
    fimRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [mensagens, enviando]);

  useEffect(() => {
    if (!casoId) return;
    let vivo = true;
    buscarPerguntasLuDisponiveis(casoId).then((valor) => {
      if (vivo) setDisponiveis(valor);
    });
    return () => {
      vivo = false;
    };
  }, [casoId]);

  const limiteAtingido = disponiveis === 0;

  const enviar = useCallback(
    async (textoForcado) => {
      const texto = (textoForcado ?? pergunta).trim();
      if (!texto || enviando || !casoId || limiteAtingido) return;

      setErro(null);
      setPergunta('');
      setMensagens((prev) => [...prev, { papel: 'usuario', texto }]);
      setEnviando(true);

      try {
        const historico = mensagens.slice(-6).map((m) => ({ papel: m.papel, texto: m.texto }));
        const { resposta, fontes, perguntasDisponiveis, limiteAtingido: atingiuAgora } = await perguntarLu({
          casoId,
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
    [pergunta, enviando, casoId, limiteAtingido, mensagens],
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
          Você já usou as 10 perguntas disponíveis para este caso. Uma nova análise (caso novo) dá
          outras 10.
        </div>
      )}

      <form onSubmit={handleSubmit} className="flex items-center gap-2 border-t border-line p-3">
        <input
          type="text"
          value={pergunta}
          onChange={(e) => setPergunta(e.target.value)}
          placeholder={limiteAtingido ? 'Cota de perguntas deste caso esgotada' : 'Pergunte ao Lu sobre este caso...'}
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
