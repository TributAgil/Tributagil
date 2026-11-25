// src/components/lu/ConversaDaAnalise.jsx
//
// "Conversar com o Lu" na tela do RESULTADO DA ANÁLISE: um botão preto e amarelo fixo no canto e, ao clicar, o mesmo
// chat do editor da peça (ConversaLu) num painel lateral (no celular, a tela toda). O Lu responde sobre este caso com
// os documentos enviados e o parecer (api/lu-peca.js, acao 'conversar', onde 'analise'): aqui não há peça nem
// proposta. Gasta os mesmos créditos do dia do editor. A conversa não é salva: saiu da tela, sumiu.

import React, { useEffect, useRef, useState } from 'react';
import { MessageCircle } from 'lucide-react';
import ConversaLu from './ConversaLu';
import MedidorLu from './MedidorLu';
import { conversarComLu, lerConsumoLu } from '../../lib/luPeca';

/** @param {{ analiseId: string, escondido?: boolean }} props  escondido: com o modal da peça aberto (a conversa fica guardada) */
export default function ConversaDaAnalise({ analiseId, escondido = false }) {
  const [aberto, setAberto] = useState(false);
  const [mensagens, setMensagens] = useState([]); // { id, papel, texto, erro?, fontes?, deFora? }
  const [enviando, setEnviando] = useState(false);
  const [consumo, setConsumo] = useState(null);
  const [recusouHoje, setRecusouHoje] = useState(false);
  const idMensagem = useRef(0);
  const esgotado = recusouHoje || Boolean(consumo && consumo.creditos >= consumo.limite);

  // o medidor só é lido quando o advogado abre a conversa (sem chamada à toa a cada análise aberta)
  useEffect(() => {
    let vivo = true;
    if (aberto && !consumo) lerConsumoLu().then((c) => vivo && c && setConsumo(c));
    return () => {
      vivo = false;
    };
  }, [aberto, consumo]);

  const enviar = async (texto) => {
    const historico = mensagens.filter((m) => !m.erro).map((m) => ({ papel: m.papel, texto: m.texto }));
    setMensagens((c) => [...c, { id: ++idMensagem.current, papel: 'advogado', texto }]);
    setEnviando(true);
    const r = await conversarComLu({ analiseId, mensagem: texto, historico, onde: 'analise' });
    setEnviando(false);
    if (r.consumo) setConsumo(r.consumo);
    if (r.limiteAtingido) setRecusouHoje(true);
    const id = ++idMensagem.current;
    setMensagens((c) => [
      ...c,
      r.ok
        ? { id, papel: 'lu', texto: r.resposta, fontes: r.fontes || [], deFora: r.documentos?.deFora || [] }
        : { id, papel: 'lu', texto: r.error, erro: true },
    ]);
  };

  if (!analiseId || escondido) return null;

  return (
    <>
      {!aberto && (
        <button
          onClick={() => setAberto(true)}
          className="no-print fixed bottom-5 right-5 z-40 inline-flex items-center gap-2 px-5 py-3 text-sm font-extrabold text-yellow-400 bg-black border-2 border-yellow-400 rounded-2xl shadow-[0_0_0_4px_rgba(250,204,21,0.18)] hover:bg-yellow-400 hover:text-black transition-colors"
        >
          <MessageCircle size={18} /> Conversar com o Lu
        </button>
      )}
      {aberto && (
        <div className="no-print fixed inset-0 z-50 sm:inset-auto sm:right-4 sm:bottom-4 sm:top-24 sm:w-[26rem] flex flex-col p-2 sm:p-0 bg-black/60 sm:bg-transparent">
          <ConversaLu
            contexto="analise"
            mensagens={mensagens}
            enviando={enviando}
            bloqueio={esgotado ? 'Créditos do Lu de hoje esgotados: voltam à meia-noite.' : ''}
            medidor={<MedidorLu consumo={consumo} esgotado={esgotado} />}
            onEnviar={enviar}
            onVerProposta={() => {}}
            onLimpar={() => setMensagens([])}
            onFechar={() => setAberto(false)}
          />
        </div>
      )}
    </>
  );
}
