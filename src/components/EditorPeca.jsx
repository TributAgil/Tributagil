// src/components/EditorPeca.jsx
//
// Aba "Editar o texto" da peça: depois de a peça estar pronta e ANTES de baixar o Word, o advogado ajusta o texto por
// tópicos ("DOS FATOS", "DA PRESCRIÇÃO…"), com negrito, itálico e sublinhado, acrescenta ou remove parágrafos e vê, ao
// lado, o que ainda está em amarelo para preencher. Tudo roda no navegador sobre o .docx que o servidor já devolveu:
// nenhuma IA é chamada e a formatação do modelo do escritório é preservada (ver src/lib/docxEdicao.js).
//
// As alterações são sempre relativas à peça ORIGINAL: reabrir a aba volta com o que já tinha sido feito (`estadoInicial`).
// `abrir` é injetável para testar a tela sem um .docx de verdade.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  X, Loader2, PenLine, AlertTriangle, ArrowLeft, Bold, Italic, Underline, Plus, Trash2, RotateCcw, Undo2, Check, Table2, Image as ImageIcon, Lock,
} from 'lucide-react';
import {
  abrirPecaParaEdicao, montarDocxEditado, listarPendencias, contarPendencias, textoDosTrechos, nomeEditado, bytesParaBase64,
} from '../lib/docxEdicao';
import { base64ParaBytes } from '../lib/docxFiguras';
import { trechosParaHtml, htmlParaTrechos, dividirTrechos, alteracoesParaMontagem, contarAlteracoes } from '../lib/edicaoTexto';

const ROTULO_MOTIVO = {
  tabela: 'Tabela montada pelo sistema',
  figura: 'Lugar da figura (inserida no passo “Montar as figuras”)',
  imagem: 'Parágrafo com imagem',
};

const COR_PENDENCIA = { preencher: 'text-amber-400', confirmar: 'text-sky-400', figura: 'text-parchment/60' };

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
function CaixaDeTexto({ trechos, objetos, rotulo, titulo, aoMudar, aoEnter, registrar }) {
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

/**
 * @param {{
 *   arquivo: { nome: string, mime: string, base64: string },
 *   tituloPeca?: string,
 *   estadoInicial?: object,
 *   onFechar: () => void,
 *   onAplicar: (r: { arquivo: object|null, estado: object, total: number, contagem: object }) => void,
 *   abrir?: (bytes: Uint8Array) => Promise<object>,
 * }} props
 */
export default function EditorPeca({ arquivo, tituloPeca = '', estadoInicial = {}, onFechar, onAplicar, abrir = abrirPecaParaEdicao }) {
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
  const sujo = JSON.stringify(alteracoes) !== JSON.stringify(alteracoesParaMontagem(estadoInicial, blocos));

  const textoAtual = useCallback(
    (b) => {
      const alt = estado[b.id];
      const proprio = alt?.removido ? '' : alt?.trechos ? textoDosTrechos(alt.trechos) : b.texto;
      return [proprio, ...(alt?.novos || []).map((n) => textoDosTrechos(n.trechos))].join('\n');
    },
    [estado],
  );
  const pendencias = useMemo(() => listarPendencias(blocos, textoAtual), [blocos, textoAtual]);

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

  const fechar = () => {
    if (sujo && !window.confirm('Sair sem aplicar as alterações feitas no texto?')) return;
    onFechar();
  };

  const irPara = (id) => {
    const t = topicoDoBloco.get(id);
    if (t !== undefined) setTopicoAtivo(t);
    setTimeout(() => {
      const el = caixas.current.get(`p-${id}`) || document.getElementById(`bloco-${id}`);
      el?.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
      if (el?.isContentEditable) el.focus();
    }, 0);
  };

  const aplicar = async () => {
    setAplicando(true);
    try {
      const contagem = contarPendencias(pendencias);
      if (total === 0) {
        onAplicar({ arquivo: null, estado: {}, total: 0, contagem });
        return;
      }
      const bytes = await montarDocxEditado(peca.fonte, alteracoes);
      onAplicar({
        arquivo: { nome: nomeEditado(arquivo.nome), mime: arquivo.mime, base64: bytesParaBase64(bytes) },
        estado,
        total,
        contagem,
      });
    } catch (err) {
      console.warn('[editor-peca] Falha ao montar o Word editado:', err);
      setErro('Não foi possível montar o Word com as alterações. Tente de novo; se persistir, baixe o Word e edite nele.');
    } finally {
      setAplicando(false);
    }
  };

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
        {novos.map((n, k) => (
          <div key={n.chave} className="group relative pl-3 border-l-2 border-emerald-500">
            <CaixaDeTexto
              key={`${n.chave}-${versoes[n.chave] || 0}`}
              trechos={n.trechos}
              objetos={b.objetos}
              rotulo="Parágrafo novo"
              registrar={registrar(n.chave)}
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
        ))}
      </div>
    );
  };

  const contagem = contarPendencias(pendencias);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={aplicando ? undefined : fechar} />
      <div className="relative bg-ink-800 rounded-2xl shadow-2xl w-full max-w-6xl h-[94vh] flex flex-col border border-line" role="dialog" aria-label="Editar o texto da peça">
        {/* cabeçalho */}
        <div className="flex items-center gap-3 p-5 pb-3 border-b border-line">
          <div className="w-11 h-11 rounded-xl bg-gold/15 flex items-center justify-center shrink-0">
            <PenLine size={20} className="text-gold" />
          </div>
          <div className="min-w-0">
            <h3 className="text-lg font-bold text-parchment">Editar o texto da peça</h3>
            <p className="text-xs text-parchment/50 truncate">{tituloPeca || 'Ajuste o texto por tópico antes de baixar o Word.'}</p>
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
            <button onClick={onFechar} className="w-full py-2.5 text-sm text-parchment/70 bg-ink-700 hover:bg-ink-600 rounded-xl">
              Voltar à peça
            </button>
          </div>
        )}

        {fase === 'edicao' && topico && (
          <>
            <div className="flex-1 min-h-0 grid md:grid-cols-[17rem_1fr] gap-4 p-5 overflow-hidden">
              {/* tópicos e pendências */}
              <div className="flex flex-col gap-4 min-h-0 overflow-y-auto pr-1 md:max-h-full max-h-40">
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
                              colunaRef.current?.scrollTo?.({ top: 0 });
                            }}
                            aria-current={ativo ? 'true' : undefined}
                            className={`w-full text-left rounded-xl border px-3 py-2 transition-colors ${
                              ativo ? 'border-gold bg-gold/10' : 'border-line bg-ink-900/50 hover:bg-ink-900'
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

                <section aria-label="Pendências da peça">
                  <p className="text-[11px] uppercase tracking-wide text-parchment/40 mb-1.5">Ainda em amarelo</p>
                  {pendencias.length === 0 ? (
                    <p className="text-xs text-emerald-400 flex items-center gap-1.5">
                      <Check size={13} /> Nada para preencher.
                    </p>
                  ) : (
                    <>
                      <p className="text-xs text-parchment/60 mb-1.5">
                        {contagem.preencher} a preencher · {contagem.confirmar} a confirmar · {contagem.figuras} figura(s)
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

              {/* folha */}
              <div className="flex flex-col min-h-0 min-w-0">
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
                  <p className="ml-3 text-[11px] text-parchment/40 hidden sm:block">
                    Enter cria um parágrafo novo · Shift+Enter quebra a linha · etiquetas azuis (nota de rodapé, numeração, data) saem iguais no Word
                  </p>
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
              </p>
              <button
                onClick={aplicar}
                disabled={aplicando || !sujo}
                title={sujo ? undefined : 'Nenhuma alteração nova para aplicar'}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-ink bg-gold hover:bg-gold/90 rounded-xl disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {aplicando ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Aplicar à peça
              </button>
              {erro && <p className="basis-full text-right text-xs text-amber-400">{erro}</p>}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
