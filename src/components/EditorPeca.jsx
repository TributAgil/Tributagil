// src/components/EditorPeca.jsx
//
// "Revisar a peça": depois de a peça estar pronta e ANTES de baixar o Word, o advogado ajusta o texto por tópicos
// ("DOS FATOS", "DA PRESCRIÇÃO…"), com negrito, itálico e sublinhado, acrescenta ou remove parágrafos, vê ao lado o que
// ainda está em amarelo e monta as FIGURAS no lugar delas, no meio do texto: cada lugar de figura abre o recorte ali
// mesmo (busca nos documentos do caso + EditorRecorte). O texto roda no navegador sobre o .docx que o servidor já
// devolveu, sem IA, preservando a formatação do modelo (ver src/lib/docxEdicao.js); a busca das figuras é a única
// chamada ao Gemini, feita uma vez, quando o advogado abre a primeira figura.
//
// As imagens só entram no Word quando TODAS as figuras foram confirmadas (mesma regra da tela de figuras anterior);
// antes disso o Word sai com o texto editado e os marcadores de figura em amarelo.
//
// As alterações são sempre relativas à peça ORIGINAL: reabrir volta com o que já tinha sido feito (`estadoInicial` e
// `figurasIniciais`). `abrir` e `servicosFiguras` são injetáveis para testar a tela sem .docx, Supabase ou Gemini.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  X, Loader2, PenLine, AlertTriangle, ArrowLeft, Bold, Italic, Underline, Plus, Trash2, RotateCcw, Undo2, Check, Table2, Image as ImageIcon, Lock,
  CheckCircle2, Download, Sparkles,
} from 'lucide-react';
import {
  abrirPecaParaEdicao, listarPendencias, contarPendencias, textoDosTrechos,
} from '../lib/docxEdicao';
import { base64ParaBytes, baixarBlob } from '../lib/docxFiguras';
import {
  trechosParaHtml, htmlParaTrechos, dividirTrechos, alteracoesParaMontagem, contarAlteracoes, textoAtualDoBloco, trechosParaLu, luParaTrechos,
} from '../lib/edicaoTexto';
import { montarPecaRevisada } from '../lib/pecaRevisada';
import { pedirAoLu, ACOES_LU, resumoParaLu } from '../lib/luPeca';
import PropostaLu from './lu/PropostaLu';
import { estadoDaFigura, nomeArquivoFigura } from '../lib/figuras';
import { useFigurasDaPeca, SERVICOS_FIGURAS } from './figuras/useFigurasDaPeca';
import FiguraNoTexto from './figuras/FiguraNoTexto';
import PainelDaFigura from './figuras/PainelDaFigura';

const ROTULO_MOTIVO = {
  tabela: 'Tabela montada pelo sistema',
  imagem: 'Parágrafo com imagem',
};

const COR_PENDENCIA = { preencher: 'text-amber-400', confirmar: 'text-sky-400' };
const ICONE_FIGURA = {
  confere: 'text-sky-400',
  revisar: 'text-amber-400',
  nao_achada: 'text-red-400',
};

/** Posição do cursor (em caracteres do texto) dentro da caixa editável. */
function posicaoDoCursor(caixa) {
  const sel = window.getSelection?.();
  if (!sel || !sel.rangeCount) return null;
  const r = sel.getRangeAt(0);
  if (!caixa.contains(r.startContainer)) return null;
  const antes = document.createRange();
  antes.selectNodeContents(caixa);
  antes.setEnd(r.startContainer, r.startOffset);
  const div = document.createElement('div');
  div.appendChild(antes.cloneContents());
  return textoDosTrechos(htmlParaTrechos(div, { manterQuebraFinal: true })).length;
}

function colarSemFormatacao(ev) {
  ev.preventDefault();
  const texto = (ev.clipboardData?.getData('text/plain') || '').replace(/\r?\n+/g, ' ');
  document.execCommand('insertText', false, texto);
}

/** Caixa editável de UM parágrafo. Não controlada: o HTML só é reescrito quando a `key` muda (restaurar, dividir). */
function CaixaDeTexto({ trechos, objetos, rotulo, titulo, aoMudar, aoEnter, registrar, aoFocar }) {
  const ref = useRef(null);
  useEffect(() => {
    if (ref.current) ref.current.innerHTML = trechosParaHtml(trechos, objetos);
    // só na montagem: depois disso o texto é do usuário
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      ref={(el) => {
        ref.current = el;
        registrar?.(el);
      }}
      contentEditable
      suppressContentEditableWarning
      role="textbox"
      aria-multiline="true"
      aria-label={rotulo}
      spellCheck
      lang="pt-BR"
      onInput={() => aoMudar(htmlParaTrechos(ref.current))}
      onFocus={aoFocar}
      onPaste={colarSemFormatacao}
      onKeyDown={(ev) => {
        if (ev.key !== 'Enter') return;
        ev.preventDefault();
        if (!aoEnter) return; // título: uma linha só
        if (ev.shiftKey) {
          document.execCommand('insertLineBreak');
          return;
        }
        const sel = window.getSelection?.();
        if (sel && !sel.isCollapsed) document.execCommand('delete');
        aoEnter(htmlParaTrechos(ref.current), posicaoDoCursor(ref.current) ?? Infinity);
      }}
      className={`whitespace-pre-wrap break-words outline-none rounded px-2 py-1 -mx-2 focus:bg-amber-50 focus:ring-2 focus:ring-gold/60 [&_mark]:bg-yellow-300 [&_mark]:text-neutral-900 [&_.etiqueta-word]:inline-block [&_.etiqueta-word]:mx-0.5 [&_.etiqueta-word]:px-1.5 [&_.etiqueta-word]:rounded [&_.etiqueta-word]:bg-sky-100 [&_.etiqueta-word]:text-sky-800 [&_.etiqueta-word]:text-[11px] [&_.etiqueta-word]:font-semibold [&_.etiqueta-word]:not-italic [&_.etiqueta-word]:align-middle [&_.etiqueta-word]:cursor-default [&_.etiqueta-word]:select-none ${
        titulo === 1 ? 'font-bold uppercase tracking-wide text-[15px]' : titulo === 2 ? 'font-bold' : ''
      }`}
    />
  );
}

/** As imagens confirmadas mudaram em relação ao que veio ao abrir? (mesmo Blob = mesma imagem) */
function imagensMudaram(atuais, iniciais = {}) {
  const a = Object.keys(atuais);
  const b = Object.keys(iniciais);
  return a.length !== b.length || a.some((n) => atuais[n].blob !== iniciais[n]?.blob);
}

/**
 * @param {{
 *   arquivo: { nome: string, mime: string, base64: string },
 *   analiseId?: string,
 *   figuras?: object[],
 *   tituloPeca?: string,
 *   estadoInicial?: object,
 *   figurasIniciais?: { localizacao?: object, imagens?: object },
 *   onFechar: (guardar: { figuras: { localizacao: object|null } }) => void,
 *   onAplicar: (r: { arquivo: object|null, estado: object, total: number, contagem: object, figuras: object,
 *     figurasNoWord: boolean, figurasConfirmadas: number }) => void,
 *   abrir?: (bytes: Uint8Array) => Promise<object>,
 *   servicosFiguras?: object,
 * }} props
 */
export default function EditorPeca({
  arquivo, analiseId = '', figuras = [], tituloPeca = '', resumoPeca = {}, estadoInicial = {}, figurasIniciais = {}, onFechar, onAplicar,
  abrir = abrirPecaParaEdicao, servicosFiguras = SERVICOS_FIGURAS,
}) {
  const [fase, setFase] = useState('abrindo'); // 'abrindo' | 'erro' | 'edicao'
  const [erro, setErro] = useState('');
  const [peca, setPeca] = useState(null);
  const [estado, setEstado] = useState(estadoInicial);
  const [versoes, setVersoes] = useState({}); // chave da caixa -> nº (muda quando o texto é reescrito por código)
  const [topicoAtivo, setTopicoAtivo] = useState(0);
  const [aplicando, setAplicando] = useState(false);
  const caixas = useRef(new Map()); // chave -> elemento
  const focoPendente = useRef(null);
  const contadorNovos = useRef(0);
  const colunaRef = useRef(null);
  const fig = useFigurasDaPeca({ analiseId, figuras, inicial: figurasIniciais, servicos: servicosFiguras });
  const [figuraAberta, setFiguraAberta] = useState(null); // número da figura cujo recorte está aberto no lugar da folha
  // "Pedir ao Lu": o parágrafo em foco (original: { id }; novo: { id, chave }), o painel de ações e a proposta na folha
  const [alvoLu, setAlvoLu] = useState(null);
  const [painelLu, setPainelLu] = useState(false);
  const [instrucaoLu, setInstrucaoLu] = useState('');
  const [proposta, setProposta] = useState(null); // { alvo, acao, instrucao, carregando?, erro?, encontrou?, trechos?, explicacao?, fontes? }

  useEffect(() => {
    let vivo = true;
    abrir(base64ParaBytes(arquivo.base64))
      .then((p) => {
        if (!vivo) return;
        setPeca(p);
        setFase('edicao');
      })
      .catch((err) => {
        console.warn('[editor-peca] Falha ao abrir o Word da peça:', err);
        if (!vivo) return;
        setErro('Não foi possível abrir o texto desta peça para edição. Baixe o Word e edite nele.');
        setFase('erro');
      });
    return () => {
      vivo = false;
    };
  }, [arquivo.base64, abrir]);

  const blocos = useMemo(() => peca?.blocos || [], [peca]);
  const topicos = useMemo(() => peca?.topicos || [], [peca]);
  const porId = useMemo(() => new Map(blocos.map((b) => [b.id, b])), [blocos]);
  const topicoDoBloco = useMemo(() => {
    const m = new Map();
    topicos.forEach((t, i) => t.blocos.forEach((id) => m.set(id, i)));
    return m;
  }, [topicos]);

  const alteracoes = useMemo(() => alteracoesParaMontagem(estado, blocos), [estado, blocos]);
  const total = contarAlteracoes(alteracoes);
  const sujo =
    JSON.stringify(alteracoes) !== JSON.stringify(alteracoesParaMontagem(estadoInicial, blocos)) ||
    imagensMudaram(fig.imagens, figurasIniciais.imagens);

  const textoAtual = useCallback((b) => textoAtualDoBloco(estado, b), [estado]);
  // as figuras têm a seção delas na lateral: aqui ficam só os campos a preencher e os trechos a confirmar
  const pendencias = useMemo(() => listarPendencias(blocos, textoAtual).filter((p) => p.tipo !== 'figura'), [blocos, textoAtual]);
  const figuraDoNumero = useMemo(() => new Map(figuras.map((f) => [f.numero, f])), [figuras]);
  const blocoDaFigura = useMemo(() => new Map(blocos.filter((b) => b.figura).map((b) => [b.figura, b.id])), [blocos]);

  // foco na caixa recém-criada (Enter ou "parágrafo abaixo"), depois que ela existe na tela
  useEffect(() => {
    const chave = focoPendente.current;
    if (!chave) return;
    const el = caixas.current.get(chave);
    if (el) {
      focoPendente.current = null;
      el.focus();
    }
  });

  const registrar = useCallback(
    (chave) => (el) => {
      if (el) caixas.current.set(chave, el);
      else caixas.current.delete(chave);
    },
    [],
  );

  const reescrever = (chave) => setVersoes((v) => ({ ...v, [chave]: (v[chave] || 0) + 1 }));
  const novaChave = () => `novo-${++contadorNovos.current}-${Date.now()}`;

  const mudarOriginal = (id, trechos) => setEstado((e) => ({ ...e, [id]: { ...e[id], trechos } }));
  const mudarNovo = (id, chave, trechos) =>
    setEstado((e) => ({ ...e, [id]: { ...e[id], novos: (e[id]?.novos || []).map((n) => (n.chave === chave ? { ...n, trechos } : n)) } }));

  /** Parágrafo novo logo depois de `posicao` (-1 = logo abaixo do original). */
  const inserirNovo = (id, posicao, trechos = []) => {
    const chave = novaChave();
    setEstado((e) => {
      const novos = [...(e[id]?.novos || [])];
      novos.splice(posicao + 1, 0, { chave, trechos });
      return { ...e, [id]: { ...e[id], novos } };
    });
    focoPendente.current = chave;
  };

  const enterNoOriginal = (id, trechos, pos) => {
    const [antes, depois] = dividirTrechos(trechos, pos);
    mudarOriginal(id, antes);
    reescrever(`p-${id}`);
    inserirNovo(id, -1, depois);
  };
  const enterNoNovo = (id, chave, trechos, pos) => {
    const [antes, depois] = dividirTrechos(trechos, pos);
    const indice = (estado[id]?.novos || []).findIndex((n) => n.chave === chave);
    mudarNovo(id, chave, antes);
    reescrever(chave);
    inserirNovo(id, indice, depois);
  };

  const restaurar = (id) => {
    setEstado((e) => {
      const { trechos: _t, removido: _r, ...resto } = e[id] || {};
      return { ...e, [id]: resto };
    });
    reescrever(`p-${id}`);
  };
  const remover = (id) => setEstado((e) => ({ ...e, [id]: { ...e[id], removido: true } }));
  const desfazerRemocao = (id) => setEstado((e) => ({ ...e, [id]: { ...e[id], removido: false } }));
  const removerNovo = (id, chave) =>
    setEstado((e) => ({ ...e, [id]: { ...e[id], novos: (e[id]?.novos || []).filter((n) => n.chave !== chave) } }));

  const desfazerTudo = () => {
    if (!window.confirm('Desfazer todas as alterações e voltar ao texto gerado pelo sistema?')) return;
    setEstado({});
    // todas as caixas dos originais voltam ao texto gerado
    setVersoes((v) => ({ ...v, ...Object.fromEntries(blocos.map((b) => [`p-${b.id}`, (v[`p-${b.id}`] || 0) + 1])) }));
  };

  // a busca das figuras (custo de IA) é guardada mesmo saindo sem aplicar: reabrir não busca de novo
  const fechar = () => {
    if (sujo && !window.confirm('Sair sem aplicar as alterações feitas no texto e nas figuras?')) return;
    onFechar({ figuras: { localizacao: fig.paraGuardar().localizacao } });
  };

  const abrirFigura = (numero) => {
    if (!figuraDoNumero.has(numero)) return;
    fig.garantirBusca();
    setFiguraAberta(numero);
  };

  /** Depois de confirmar: vai para a próxima figura sem imagem; se não houver, volta ao texto, no lugar da figura. */
  const depoisDeConfirmar = (numero) => {
    const ordem = figuras.map((f) => f.numero);
    const depois = [...ordem.slice(ordem.indexOf(numero) + 1), ...ordem.slice(0, ordem.indexOf(numero))];
    const proxima = depois.find((n) => !fig.imagens[n]);
    if (proxima !== undefined) {
      setFiguraAberta(proxima);
      return;
    }
    setFiguraAberta(null);
    const id = blocoDaFigura.get(numero);
    if (id !== undefined) irPara(id, `figura-${numero}`);
  };

  const baixarZip = async () => {
    if (!fig.resumo.completo) return;
    // JSZip só é baixado quando o advogado pede o .zip
    const { default: JSZip } = await import('jszip');
    const zip = new JSZip();
    for (const f of figuras) {
      const i = fig.imagens[f.numero];
      if (!i) continue;
      const extensao = /jpe?g/i.test(i.blob.type) ? 'jpg' : /webp/i.test(i.blob.type) ? 'webp' : 'png';
      zip.file(nomeArquivoFigura(f, extensao), i.blob);
    }
    baixarBlob(await zip.generateAsync({ type: 'blob' }), 'figuras-da-peca.zip');
  };

  function irPara(id, elementoId) {
    const t = topicoDoBloco.get(id);
    if (t !== undefined) setTopicoAtivo(t);
    setFiguraAberta(null);
    setTimeout(() => {
      const el = (elementoId && document.getElementById(elementoId)) || caixas.current.get(`p-${id}`) || document.getElementById(`bloco-${id}`);
      el?.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
      if (el?.isContentEditable) el.focus();
    }, 0);
  }

  const aplicar = async () => {
    setAplicando(true);
    setErro('');
    try {
      const imagensConfirmadas = Object.fromEntries(Object.entries(fig.imagens).map(([n, i]) => [n, { blob: i.blob }]));
      const r = await montarPecaRevisada({ arquivo, estado, imagens: imagensConfirmadas, figuras, peca });
      onAplicar({ ...r, estado: r.total > 0 ? estado : {}, figuras: fig.paraGuardar() });
    } catch (err) {
      console.warn('[editor-peca] Falha ao montar o Word editado:', err);
      setErro('Não foi possível montar o Word com as alterações. Tente de novo; se persistir, baixe o Word e edite nele.');
    } finally {
      setAplicando(false);
    }
  };

  // ---- Pedir ao Lu ----------------------------------------------------------------------------------------------------
  const mesmoAlvo = (a, b) => Boolean(a && b) && a.id === b.id && (a.chave || null) === (b.chave || null);
  const blocoDoAlvo = (alvo) => (alvo ? porId.get(alvo.id) : null);
  /** O parágrafo do alvo como está agora no editor (o original editado ou o parágrafo novo). */
  const trechosDoAlvo = (alvo) => {
    const b = blocoDoAlvo(alvo);
    if (!b) return [];
    if (alvo.chave) return (estado[b.id]?.novos || []).find((n) => n.chave === alvo.chave)?.trechos || [];
    return estado[b.id]?.trechos || b.trechos;
  };
  const alvoValido = (() => {
    const b = blocoDoAlvo(alvoLu);
    return Boolean(b && b.editavel && !estado[b.id]?.removido && (alvoLu.chave || !b.titulo) && textoDosTrechos(trechosDoAlvo(alvoLu)).trim());
  })();
  const alvoTemCampo = alvoValido && /\[PREENCHER:/.test(textoDosTrechos(trechosDoAlvo(alvoLu)));

  const pedir = async (acao, instrucao = '', alvo = alvoLu) => {
    const b = blocoDoAlvo(alvo);
    if (!b) return;
    setPainelLu(false);
    setProposta({ alvo, acao, instrucao, carregando: true });
    const r = await pedirAoLu({
      analiseId,
      acao,
      instrucao,
      paragrafo: trechosParaLu(trechosDoAlvo(alvo)),
      topico: topicos[topicoDoBloco.get(b.id)]?.titulo || '',
      resumoPeca: resumoParaLu(resumoPeca),
    });
    setProposta((atual) => {
      if (!atual || !mesmoAlvo(atual.alvo, alvo) || atual.acao !== acao) return atual; // o advogado já mudou de ideia
      if (!r.ok) return { alvo, acao, instrucao, erro: r.error };
      return { alvo, acao, instrucao, encontrou: r.encontrou, trechos: luParaTrechos(r.texto, b.objetos.length), explicacao: r.explicacao, fontes: r.fontes };
    });
  };

  const aceitarProposta = () => {
    const { alvo, trechos } = proposta;
    if (alvo.chave) {
      mudarNovo(alvo.id, alvo.chave, trechos);
      reescrever(alvo.chave);
    } else {
      mudarOriginal(alvo.id, trechos);
      reescrever(`p-${alvo.id}`);
    }
    setProposta(null);
  };

  const propostaPara = (alvo) =>
    proposta && mesmoAlvo(proposta.alvo, alvo) ? (
      <PropostaLu
        proposta={proposta}
        objetos={blocoDoAlvo(alvo)?.objetos}
        onAceitar={aceitarProposta}
        onRecusar={() => setProposta(null)}
        onDeNovo={() => pedir(proposta.acao, proposta.instrucao, proposta.alvo)}
      />
    ) : null;

  // botões de formatação: onMouseDown com preventDefault mantém a seleção dentro da caixa
  const formatar = (comando) => (ev) => {
    ev.preventDefault();
    document.execCommand('styleWithCSS', false, false);
    document.execCommand(comando);
  };

  const topico = topicos[topicoAtivo];
  const alteradosNoTopico = (t) =>
    t.blocos.reduce((n, id) => n + contarAlteracoes(alteracoes[id] ? { [id]: alteracoes[id] } : {}), 0);
  const pendenciasNoTopico = (i) => pendencias.filter((p) => topicoDoBloco.get(p.id) === i).length;

  const renderizarBloco = (b) => {
    const alt = estado[b.id] || {};
    const novos = alt.novos || [];
    const editado = Boolean(alteracoes[b.id]?.trechos);
    let corpo;

    if (b.vazio && novos.length === 0) return null; // linhas em branco do modelo: continuam no Word, não poluem a tela

    if (b.vazio) {
      corpo = null;
    } else if (b.figura) {
      corpo = (
        <FiguraNoTexto
          numero={b.figura}
          figura={figuraDoNumero.get(b.figura)}
          resultado={fig.resultados[b.figura]}
          buscou={fig.fase === 'pronto'}
          imagem={fig.imagens[b.figura]}
          onMontar={figuraDoNumero.has(b.figura) ? () => abrirFigura(b.figura) : undefined}
          onDesfazer={() => fig.desfazer(b.figura)}
        />
      );
    } else if (!b.editavel) {
      const Icone = b.tipo === 'tabela' ? Table2 : b.figura || b.motivo === 'imagem' ? ImageIcon : Lock;
      corpo = (
        <div id={`bloco-${b.id}`} className="rounded-lg border border-dashed border-neutral-300 bg-neutral-50 px-3 py-2 text-neutral-500">
          <p className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide font-semibold text-neutral-400 mb-1">
            <Icone size={12} /> {ROTULO_MOTIVO[b.motivo] || `Só leitura (${b.motivo})`} · edite no Word, se precisar
          </p>
          {b.texto && <p className="whitespace-pre-wrap text-[13px] leading-relaxed line-clamp-6">{b.texto}</p>}
        </div>
      );
    } else if (alt.removido) {
      corpo = (
        <div id={`bloco-${b.id}`} className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 flex items-start gap-3">
          <p className="flex-1 text-[13px] text-red-800/70 line-through line-clamp-2">{b.texto}</p>
          <button onClick={() => desfazerRemocao(b.id)} className="shrink-0 inline-flex items-center gap-1 text-xs font-medium text-red-700 hover:underline">
            <Undo2 size={12} /> Desfazer remoção
          </button>
        </div>
      );
    } else {
      corpo = (
        <div className={`group relative pl-3 border-l-2 ${editado ? 'border-gold' : 'border-transparent hover:border-neutral-200'}`}>
          <CaixaDeTexto
            key={`p-${b.id}-${versoes[`p-${b.id}`] || 0}`}
            trechos={alt.trechos || b.trechos}
            objetos={b.objetos}
            titulo={b.titulo}
            rotulo={b.titulo ? `Título: ${b.texto}` : 'Parágrafo da peça'}
            registrar={registrar(`p-${b.id}`)}
            aoFocar={() => setAlvoLu({ id: b.id })}
            aoMudar={(t) => mudarOriginal(b.id, t)}
            aoEnter={b.titulo ? undefined : (t, pos) => enterNoOriginal(b.id, t, pos)}
          />
          <div className="flex flex-wrap items-center gap-3 mt-0.5 text-[11px] text-neutral-400 opacity-60 group-hover:opacity-100 group-focus-within:opacity-100">
            {editado && <span className="text-amber-700 font-medium">alterado</span>}
            {editado && (
              <button onClick={() => restaurar(b.id)} className="inline-flex items-center gap-1 hover:text-neutral-700">
                <RotateCcw size={11} /> Restaurar original
              </button>
            )}
            {/* parágrafo novo herda a formatação do de cima: abaixo de um título sairia com a fonte do título */}
            {!b.titulo && (
              <button onClick={() => inserirNovo(b.id, novos.length - 1)} className="inline-flex items-center gap-1 hover:text-neutral-700">
                <Plus size={11} /> Parágrafo abaixo
              </button>
            )}
            {b.removivel && !b.titulo && (
              <button onClick={() => remover(b.id)} className="inline-flex items-center gap-1 hover:text-red-600">
                <Trash2 size={11} /> Remover
              </button>
            )}
          </div>
        </div>
      );
    }

    return (
      <div key={b.id} className="space-y-2">
        {corpo}
        {propostaPara({ id: b.id })}
        {novos.map((n, k) => (
          <React.Fragment key={n.chave}>
          <div className="group relative pl-3 border-l-2 border-emerald-500">
            <CaixaDeTexto
              key={`${n.chave}-${versoes[n.chave] || 0}`}
              trechos={n.trechos}
              objetos={b.objetos}
              rotulo="Parágrafo novo"
              registrar={registrar(n.chave)}
              aoFocar={() => setAlvoLu({ id: b.id, chave: n.chave })}
              aoMudar={(t) => mudarNovo(b.id, n.chave, t)}
              aoEnter={(t, pos) => enterNoNovo(b.id, n.chave, t, pos)}
            />
            <div className="flex items-center gap-3 mt-0.5 text-[11px] text-neutral-400 opacity-60 group-hover:opacity-100 group-focus-within:opacity-100">
              <span className="text-emerald-700 font-medium">novo</span>
              <button onClick={() => inserirNovo(b.id, k)} className="inline-flex items-center gap-1 hover:text-neutral-700">
                <Plus size={11} /> Parágrafo abaixo
              </button>
              <button onClick={() => removerNovo(b.id, n.chave)} className="inline-flex items-center gap-1 hover:text-red-600">
                <Trash2 size={11} /> Remover
              </button>
            </div>
          </div>
          {propostaPara({ id: b.id, chave: n.chave })}
          </React.Fragment>
        ))}
      </div>
    );
  };

  const contagem = contarPendencias(pendencias);
  const figuraEmEdicao = figuraAberta !== null ? figuraDoNumero.get(figuraAberta) : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={aplicando ? undefined : fechar} />
      <div className="relative bg-ink-800 rounded-2xl shadow-2xl w-full max-w-6xl h-[94vh] flex flex-col border border-line" role="dialog" aria-label="Revisar a peça">
        {/* cabeçalho */}
        <div className="flex items-center gap-3 p-5 pb-3 border-b border-line">
          <div className="w-11 h-11 rounded-xl bg-gold/15 flex items-center justify-center shrink-0">
            <PenLine size={20} className="text-gold" />
          </div>
          <div className="min-w-0">
            <h3 className="text-lg font-bold text-parchment">Revisar a peça: texto e figuras</h3>
            <p className="text-xs text-parchment/50 truncate">{tituloPeca || 'Ajuste o texto e monte as figuras antes de baixar o Word.'}</p>
          </div>
          {!aplicando && (
            <button onClick={fechar} className="ml-auto text-parchment/40 hover:text-parchment" aria-label="Fechar">
              <X size={18} />
            </button>
          )}
        </div>

        {fase === 'abrindo' && (
          <div className="p-10 flex flex-col items-center gap-3 text-center">
            <Loader2 size={26} className="animate-spin text-gold" />
            <p className="text-sm text-parchment/80">Abrindo o texto da peça…</p>
          </div>
        )}

        {fase === 'erro' && (
          <div className="p-6 space-y-4">
            <p className="text-sm text-amber-400 flex items-start gap-2">
              <AlertTriangle size={16} className="mt-0.5 shrink-0" /> {erro}
            </p>
            <button onClick={() => onFechar({ figuras: { localizacao: null } })} className="w-full py-2.5 text-sm text-parchment/70 bg-ink-700 hover:bg-ink-600 rounded-xl">
              Voltar à peça
            </button>
          </div>
        )}

        {fase === 'edicao' && topico && (
          <>
            <div className="flex-1 min-h-0 grid md:grid-cols-[17rem_1fr] gap-4 p-5 overflow-hidden">
              {/* tópicos e pendências */}
              {/* no celular, com uma figura aberta, a lateral sai da frente: o recorte precisa da tela toda */}
              <div className={`flex-col gap-4 min-h-0 overflow-y-auto pr-1 md:max-h-full max-h-40 ${figuraEmEdicao ? 'hidden md:flex' : 'flex'}`}>
                <nav aria-label="Tópicos da peça">
                  <p className="text-[11px] uppercase tracking-wide text-parchment/40 mb-1.5">Tópicos</p>
                  <ol className="space-y-1">
                    {topicos.map((t, i) => {
                      const ativo = i === topicoAtivo;
                      const alterados = alteradosNoTopico(t);
                      const pend = pendenciasNoTopico(i);
                      return (
                        <li key={t.inicio}>
                          <button
                            onClick={() => {
                              setTopicoAtivo(i);
                              setFiguraAberta(null);
                              colunaRef.current?.scrollTo?.({ top: 0 });
                            }}
                            aria-current={ativo && figuraAberta === null ? 'true' : undefined}
                            className={`w-full text-left rounded-xl border px-3 py-2 transition-colors ${
                              ativo && figuraAberta === null ? 'border-gold bg-gold/10' : 'border-line bg-ink-900/50 hover:bg-ink-900'
                            }`}
                          >
                            <span className="block text-xs text-parchment/90 leading-snug line-clamp-2">{t.titulo}</span>
                            {(alterados > 0 || pend > 0) && (
                              <span className="flex gap-2 mt-0.5 text-[11px]">
                                {alterados > 0 && <span className="text-gold">{alterados} alteração(ões)</span>}
                                {pend > 0 && <span className="text-amber-400">{pend} pendência(s)</span>}
                              </span>
                            )}
                          </button>
                        </li>
                      );
                    })}
                  </ol>
                </nav>

                {figuras.length > 0 && (
                  <section aria-label="Figuras da peça">
                    <p className="text-[11px] uppercase tracking-wide text-parchment/40 mb-1.5">Figuras</p>
                    <p className="text-xs text-parchment/70 mb-1.5">
                      <b className={fig.resumo.completo ? 'text-emerald-400' : 'text-gold'}>{fig.resumo.confirmadas}</b> de {fig.resumo.total} confirmada(s)
                    </p>
                    <ul className="space-y-1">
                      {figuras.map((f) => {
                        const confirmada = Boolean(fig.imagens[f.numero]);
                        const ativa = f.numero === figuraAberta;
                        return (
                          <li key={f.numero}>
                            <button
                              onClick={() => abrirFigura(f.numero)}
                              aria-current={ativa ? 'true' : undefined}
                              className={`w-full text-left rounded-lg px-2 py-1.5 text-[11px] leading-snug ${ativa ? 'bg-gold/10 ring-1 ring-gold' : 'hover:bg-ink-900'}`}
                            >
                              <span className="flex items-center gap-1.5">
                                <span className="font-semibold text-gold tabular-nums">Fig. {f.numero}</span>
                                {confirmada ? (
                                  <span className="ml-auto inline-flex items-center gap-1 text-emerald-400">
                                    <CheckCircle2 size={12} /> confirmada
                                  </span>
                                ) : fig.fase === 'pronto' ? (
                                  <span className={`ml-auto ${ICONE_FIGURA[estadoDaFigura(fig.resultados[f.numero])]}`}>
                                    {estadoDaFigura(fig.resultados[f.numero]) === 'confere' ? 'proposta conferida' : estadoDaFigura(fig.resultados[f.numero]) === 'revisar' ? 'revisar' : 'não encontrada'}
                                  </span>
                                ) : (
                                  <span className="ml-auto text-parchment/40">a montar</span>
                                )}
                              </span>
                              <span className="block text-parchment/70 line-clamp-2">{f.descricao}</span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </section>
                )}

                <section aria-label="Pendências da peça">
                  <p className="text-[11px] uppercase tracking-wide text-parchment/40 mb-1.5">Ainda em amarelo</p>
                  {pendencias.length === 0 ? (
                    <p className="text-xs text-emerald-400 flex items-center gap-1.5">
                      <Check size={13} /> Nenhum campo para preencher.
                    </p>
                  ) : (
                    <>
                      <p className="text-xs text-parchment/60 mb-1.5">
                        {contagem.preencher} a preencher · {contagem.confirmar} a confirmar
                      </p>
                      <ul className="space-y-1">
                        {pendencias.map((p, i) => (
                          <li key={`${p.id}-${i}`}>
                            <button onClick={() => irPara(p.id)} className="w-full text-left rounded-lg px-2 py-1.5 hover:bg-ink-900 text-[11px] leading-snug">
                              <span className={`font-semibold ${COR_PENDENCIA[p.tipo]}`}>{p.rotulo}</span>
                              <span className="text-parchment/40"> · {topicos[topicoDoBloco.get(p.id)]?.titulo?.slice(0, 40)}</span>
                              <span className="block text-parchment/70 line-clamp-2">{p.trecho}</span>
                              {p.naTabela && <span className="block text-parchment/40">na tabela: preencha no Word</span>}
                            </button>
                          </li>
                        ))}
                      </ul>
                    </>
                  )}
                </section>
              </div>

              {/* recorte de uma figura, no lugar da folha */}
              {figuraEmEdicao && (
                <div className="flex flex-col min-h-0 min-w-0">
                  <PainelDaFigura
                    figura={figuraEmEdicao}
                    figuras={figuras}
                    estado={fig}
                    onTrocar={abrirFigura}
                    onConfirmada={depoisDeConfirmar}
                    onVoltar={() => {
                      const id = blocoDaFigura.get(figuraEmEdicao.numero);
                      if (id !== undefined) irPara(id, `figura-${figuraEmEdicao.numero}`);
                      else setFiguraAberta(null);
                    }}
                  />
                </div>
              )}

              {/* folha */}
              <div className={`flex-col min-h-0 min-w-0 ${figuraEmEdicao ? 'hidden' : 'flex'}`}>
                <div className="flex items-center gap-1 mb-2" role="toolbar" aria-label="Formatação">
                  <button onMouseDown={formatar('bold')} title="Negrito (Ctrl+B)" aria-label="Negrito" className="p-2 rounded-lg text-parchment/80 hover:bg-ink-700">
                    <Bold size={15} />
                  </button>
                  <button onMouseDown={formatar('italic')} title="Itálico (Ctrl+I)" aria-label="Itálico" className="p-2 rounded-lg text-parchment/80 hover:bg-ink-700">
                    <Italic size={15} />
                  </button>
                  <button onMouseDown={formatar('underline')} title="Sublinhado (Ctrl+U)" aria-label="Sublinhado" className="p-2 rounded-lg text-parchment/80 hover:bg-ink-700">
                    <Underline size={15} />
                  </button>
                  <p className="ml-3 text-[11px] text-parchment/40 hidden lg:block">
                    Enter cria um parágrafo novo · Shift+Enter quebra a linha · etiquetas azuis (nota de rodapé, numeração, data) saem iguais no Word
                  </p>
                  {analiseId && (
                    <div className="ml-auto relative shrink-0">
                      <button
                        // onMouseDown: o foco continua no parágrafo escolhido
                        onMouseDown={(ev) => ev.preventDefault()}
                        onClick={() => setPainelLu((v) => !v)}
                        disabled={!alvoValido}
                        title={alvoValido ? 'Pedir ao Lu: reescrever, fundamentar ou preencher este parágrafo' : 'Clique num parágrafo da peça (títulos não) e depois em "Pedir ao Lu"'}
                        aria-expanded={painelLu}
                        className="inline-flex items-center gap-2 whitespace-nowrap shrink-0 px-4 py-2 text-sm font-extrabold text-yellow-400 bg-black border-2 border-yellow-400 rounded-xl shadow-[0_0_0_3px_rgba(250,204,21,0.15)] hover:bg-yellow-400 hover:text-black transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-black disabled:hover:text-yellow-400"
                      >
                        <Sparkles size={16} /> Pedir ao Lu
                      </button>
                      {painelLu && alvoValido && (
                        <div className="absolute right-0 top-full mt-2 z-20 w-[min(22rem,calc(100vw-3rem))] rounded-xl border-2 border-yellow-400 bg-black p-3 shadow-2xl" role="menu" aria-label="O que o Lu deve fazer">
                          <p className="text-[11px] uppercase tracking-wide font-bold text-yellow-400 mb-2">O que o Lu faz com este parágrafo?</p>
                          <label className="block text-[11px] text-neutral-400 mb-1" htmlFor="instrucao-lu">
                            Como? (opcional; vale para reescrever e fundamentar)
                          </label>
                          <input
                            id="instrucao-lu"
                            value={instrucaoLu}
                            maxLength={500}
                            onChange={(ev) => setInstrucaoLu(ev.target.value)}
                            placeholder="ex.: mais incisivo; incluir a Súmula 436"
                            className="w-full mb-2 rounded-lg bg-neutral-900 border border-neutral-700 px-2.5 py-1.5 text-sm text-neutral-100 placeholder:text-neutral-500 focus:outline-none focus:border-yellow-400"
                          />
                          <div className="space-y-1.5">
                            {Object.entries(ACOES_LU).map(([acao, a]) => {
                              const bloqueada = acao === 'preencher' && !alvoTemCampo;
                              return (
                                <button
                                  key={acao}
                                  role="menuitem"
                                  disabled={bloqueada}
                                  onClick={() => pedir(acao, acao === 'preencher' ? '' : instrucaoLu.trim())}
                                  className="w-full text-left rounded-lg border border-yellow-400/40 px-3 py-2 hover:bg-yellow-400 hover:text-black text-yellow-300 disabled:opacity-35 disabled:hover:bg-transparent disabled:hover:text-yellow-300 disabled:cursor-not-allowed group"
                                >
                                  <span className="block text-sm font-bold">{a.rotulo}</span>
                                  <span className="block text-[11px] text-neutral-400 group-hover:text-black/70">
                                    {bloqueada ? 'Este parágrafo não tem campo [PREENCHER].' : a.dica}
                                  </span>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
                <div ref={colunaRef} className="flex-1 min-h-0 overflow-y-auto rounded-xl bg-neutral-200/90 p-3 sm:p-6">
                  <article className="mx-auto max-w-[46rem] bg-white text-neutral-900 shadow-md rounded-sm px-5 sm:px-12 py-8 space-y-3 text-[14px] leading-relaxed text-justify">
                    {topico.blocos.map((id) => renderizarBloco(porId.get(id))).filter(Boolean)}
                  </article>
                  <div className="mx-auto max-w-[46rem] flex justify-between mt-3 text-xs">
                    <button
                      disabled={topicoAtivo === 0}
                      onClick={() => {
                        setTopicoAtivo((i) => i - 1);
                        colunaRef.current?.scrollTo?.({ top: 0 });
                      }}
                      className="px-3 py-1.5 rounded-lg text-neutral-700 hover:bg-neutral-300 disabled:opacity-30"
                    >
                      ← Tópico anterior
                    </button>
                    <button
                      disabled={topicoAtivo === topicos.length - 1}
                      onClick={() => {
                        setTopicoAtivo((i) => i + 1);
                        colunaRef.current?.scrollTo?.({ top: 0 });
                      }}
                      className="px-3 py-1.5 rounded-lg text-neutral-700 hover:bg-neutral-300 disabled:opacity-30"
                    >
                      Próximo tópico →
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* rodapé */}
            <div className="flex flex-wrap items-center gap-3 p-4 border-t border-line">
              <button onClick={fechar} disabled={aplicando} className="inline-flex items-center gap-1.5 px-3 py-2 text-sm text-parchment/70 bg-ink-700 hover:bg-ink-600 rounded-xl">
                <ArrowLeft size={14} /> Voltar sem aplicar
              </button>
              {total > 0 && (
                <button onClick={desfazerTudo} disabled={aplicando} className="inline-flex items-center gap-1.5 px-3 py-2 text-sm text-parchment/60 hover:text-parchment">
                  <Undo2 size={14} /> Desfazer tudo
                </button>
              )}
              <p className="text-sm text-parchment/80 ml-auto" aria-live="polite">
                <b className={total ? 'text-gold' : 'text-parchment/50'}>{total}</b> alteração(ões) no texto
                {figuras.length > 0 && (
                  <>
                    <span className="text-parchment/30"> · </span>
                    <b className={fig.resumo.completo ? 'text-emerald-400' : 'text-gold'}>{fig.resumo.confirmadas}</b> de {fig.resumo.total} figura(s)
                  </>
                )}
              </p>
              {figuras.length > 0 && (
                <button
                  onClick={baixarZip}
                  disabled={!fig.resumo.completo || aplicando}
                  title={fig.resumo.completo ? undefined : 'Disponível depois de confirmar todas as figuras'}
                  className="inline-flex items-center gap-1.5 px-3 py-2 text-sm text-parchment/80 bg-ink-700 hover:bg-ink-600 rounded-xl disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Download size={14} /> Imagens (.zip)
                </button>
              )}
              <button
                onClick={aplicar}
                disabled={aplicando || !sujo}
                title={sujo ? undefined : 'Nenhuma alteração nova para aplicar'}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-ink bg-gold hover:bg-gold/90 rounded-xl disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {aplicando ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Aplicar à peça
              </button>
              {erro && <p className="basis-full text-right text-xs text-amber-400">{erro}</p>}
              {!erro && figuras.length > 0 && !fig.resumo.completo && (
                <p className="basis-full text-right text-xs text-parchment/50 hidden sm:block">
                  As imagens entram no Word quando as {fig.resumo.total} figura(s) estiverem confirmadas (faltam {fig.resumo.faltam}). Até lá, o Word sai com o
                  texto editado e as figuras em amarelo.
                </p>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
