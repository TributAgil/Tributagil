// src/components/PainelFiguras.jsx
//
// Etapa "Montar as figuras" da geração da peça: depois de a peça estar pronta e ANTES de baixar o Word, o advogado revisa,
// figura por figura, o recorte que o sistema propôs (documento, página e região). A IA propõe e o código confere o dado
// lido; quem decide é o advogado: confirmar, ajustar a caixa/página ou subir o próprio print. Nenhuma figura entra em
// lugar nenhum sem ter sido vista.
//
// `servicos` é injetável para testar a tela sem Supabase nem Gemini; em produção usa os reais de src/lib/figuras.js.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { X, Loader2, Images, AlertTriangle, CheckCircle2, CircleAlert, BadgeCheck, Download, ArrowLeft, Search, FileText } from 'lucide-react';
import {
  localizarFigurasNaAnalise,
  baixarDocumentoDaAnalise,
  estadoDaFigura,
  ROTULO_ESTADO,
  referenciaDaFigura,
  resumoDeConfirmacao,
  nomeArquivoFigura,
} from '../lib/figuras';
import { abrirDocumento as abrirDocumentoReal } from '../lib/pdfPaginas';
import { montarWordComFiguras } from '../lib/docxFiguras';
import EditorRecorte from './figuras/EditorRecorte';

const SERVICOS_REAIS = {
  localizar: localizarFigurasNaAnalise,
  carregarDocumento: baixarDocumentoDaAnalise,
  abrir: abrirDocumentoReal,
};

const ICONE_ESTADO = {
  confere: <BadgeCheck size={14} className="text-sky-400" />,
  revisar: <CircleAlert size={14} className="text-amber-400" />,
  nao_achada: <AlertTriangle size={14} className="text-red-400" />,
};

function baixarBlob(blob, nome) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * @param {{ analiseId: string, figuras: object[], arquivo?: {nome: string, mime: string, base64: string}, tituloPeca?: string, onFechar: () => void, servicos?: object }} props
 */
export default function PainelFiguras({ analiseId, figuras, arquivo = null, tituloPeca = '', onFechar, servicos = SERVICOS_REAIS }) {
  const [fase, setFase] = useState('procurando'); // 'procurando' | 'erro' | 'revisao'
  const [erro, setErro] = useState('');
  const [resultados, setResultados] = useState({});
  const [documentos, setDocumentos] = useState([]);
  const [selecionada, setSelecionada] = useState(figuras[0]?.numero);
  const [montando, setMontando] = useState(false);
  const [avisoWord, setAvisoWord] = useState('');
  const [imagens, setImagens] = useState({}); // numero -> { blob, url, origem, documento, pagina }
  const abertos = useRef(new Map()); // storage_path -> Promise<documento aberto>
  const imagensRef = useRef({});
  const colunaRef = useRef(null);
  imagensRef.current = imagens;

  const procurar = useCallback(async () => {
    setFase('procurando');
    setErro('');
    const r = await servicos.localizar({ analiseId, figuras });
    if (!r.ok) {
      setErro(r.error || 'Não foi possível procurar as figuras agora.');
      setFase('erro');
      return;
    }
    setResultados(Object.fromEntries((r.figuras || []).map((x) => [x.numero, x])));
    setDocumentos(r.documentos || []);
    setSelecionada((atual) => atual ?? figuras[0]?.numero);
    setFase('revisao');
  }, [analiseId, figuras, servicos]);

  useEffect(() => {
    procurar();
  }, [procurar]);

  // ao trocar de figura, a coluna do editor volta ao topo (o título e a referência ficam à vista)
  useEffect(() => {
    colunaRef.current?.scrollTo?.({ top: 0 });
  }, [selecionada]);

  // libera os documentos abertos e as miniaturas ao sair
  useEffect(
    () => () => {
      abertos.current.forEach((p) => p.then((d) => d.fechar?.()).catch(() => {}));
      Object.values(imagensRef.current).forEach((i) => URL.revokeObjectURL(i.url));
    },
    [],
  );

  // abre cada documento uma vez só, mesmo que várias figuras apontem para ele
  const abrirDocumento = useCallback(
    (storagePath) => {
      if (!abertos.current.has(storagePath)) {
        const meta = documentos.find((d) => d.storage_path === storagePath);
        const promessa = servicos
          .carregarDocumento(storagePath)
          .then((buffer) => servicos.abrir(buffer, meta?.mime_type || 'application/pdf'))
          .catch((err) => {
            abertos.current.delete(storagePath);
            throw err;
          });
        abertos.current.set(storagePath, promessa);
      }
      return abertos.current.get(storagePath);
    },
    [documentos, servicos],
  );

  const guardarImagem = (numero, dados) => {
    setImagens((atual) => {
      if (atual[numero]) URL.revokeObjectURL(atual[numero].url);
      return { ...atual, [numero]: { ...dados, url: URL.createObjectURL(dados.blob) } };
    });
    // vai para a próxima figura ainda sem imagem
    const proxima = figuras.find((f) => f.numero !== numero && !imagensRef.current[f.numero]);
    if (proxima) setSelecionada(proxima.numero);
  };
  const desfazer = (numero) =>
    setImagens((atual) => {
      if (atual[numero]) URL.revokeObjectURL(atual[numero].url);
      const { [numero]: _removida, ...resto } = atual;
      return resto;
    });

  const resumo = useMemo(() => resumoDeConfirmacao(figuras, imagens), [figuras, imagens]);
  const figuraAtual = figuras.find((f) => f.numero === selecionada) || figuras[0];

  const baixarZip = async () => {
    // JSZip só é baixado quando o advogado pede o .zip
    const { default: JSZip } = await import('jszip');
    const zip = new JSZip();
    for (const f of figuras) {
      const i = imagens[f.numero];
      if (!i) continue;
      const extensao = /jpe?g/i.test(i.blob.type) ? 'jpg' : /webp/i.test(i.blob.type) ? 'webp' : 'png';
      zip.file(nomeArquivoFigura(f, extensao), i.blob);
    }
    baixarBlob(await zip.generateAsync({ type: 'blob' }), 'figuras-da-peca.zip');
  };

  // Etapa (d): o Word sai com as imagens confirmadas no lugar dos marcadores; as demais ficam como marcador amarelo
  const baixarWord = async () => {
    setMontando(true);
    setAvisoWord('');
    try {
      const imagensDoWord = Object.fromEntries(
        figuras.filter((f) => imagens[f.numero]).map((f) => [f.numero, { blob: imagens[f.numero].blob, descricao: f.legenda }]),
      );
      const r = await montarWordComFiguras(arquivo, imagensDoWord);
      baixarBlob(r.blob, r.nome);
      setAvisoWord(
        r.restantes.length > 0
          ? `Word baixado com ${r.inseridas.length} figura(s). ${r.restantes.length} continua(m) como marcador amarelo para você preencher.`
          : `Word baixado com as ${r.inseridas.length} figura(s) nos lugares.`,
      );
    } catch (err) {
      console.warn('[figuras] Falha ao montar o Word com as figuras:', err);
      setAvisoWord('Não foi possível montar o Word com as figuras. Baixe as imagens (.zip) ou o Word sem figuras e insira à mão.');
    } finally {
      setMontando(false);
    }
  };

  const contagemEstados = useMemo(() => {
    const c = { confere: 0, revisar: 0, nao_achada: 0 };
    for (const f of figuras) c[estadoDaFigura(resultados[f.numero])]++;
    return c;
  }, [figuras, resultados]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={fase === 'procurando' ? undefined : onFechar} />
      <div className="relative bg-ink-800 rounded-2xl shadow-2xl w-full max-w-6xl max-h-[94vh] flex flex-col border border-line" role="dialog" aria-label="Montar as figuras da peça">
        {/* cabeçalho */}
        <div className="flex items-center gap-3 p-5 pb-3 border-b border-line">
          <div className="w-11 h-11 rounded-xl bg-gold/15 flex items-center justify-center shrink-0">
            <Images size={20} className="text-gold" />
          </div>
          <div className="min-w-0">
            <h3 className="text-lg font-bold text-parchment">Montar as figuras</h3>
            <p className="text-xs text-parchment/50 truncate">{tituloPeca || 'Revise o recorte proposto para cada figura da peça.'}</p>
          </div>
          {fase !== 'procurando' && (
            <button onClick={onFechar} className="ml-auto text-parchment/40 hover:text-parchment" aria-label="Fechar">
              <X size={18} />
            </button>
          )}
        </div>

        {fase === 'procurando' && (
          <div className="p-10 flex flex-col items-center gap-3 text-center">
            <Loader2 size={26} className="animate-spin text-gold" />
            <p className="text-sm text-parchment/80 flex items-center gap-2">
              <Search size={14} /> Procurando as {figuras.length} figura(s) nos documentos do caso…
            </p>
            <p className="text-xs text-parchment/40">Leva cerca de um minuto. Nada é inserido sem a sua confirmação.</p>
          </div>
        )}

        {fase === 'erro' && (
          <div className="p-6 space-y-4">
            <p className="text-sm text-amber-400 flex items-start gap-2">
              <AlertTriangle size={16} className="mt-0.5 shrink-0" /> {erro}
            </p>
            <div className="flex gap-3">
              <button onClick={onFechar} className="flex-1 py-2.5 text-sm text-parchment/70 bg-ink-700 hover:bg-ink-600 rounded-xl">
                Voltar à peça
              </button>
              <button onClick={procurar} className="flex-1 py-2.5 text-sm font-semibold text-ink bg-gold hover:bg-gold/90 rounded-xl">
                Tentar de novo
              </button>
            </div>
          </div>
        )}

        {fase === 'revisao' && figuraAtual && (
          <>
            <div className="px-5 pt-3 text-xs text-parchment/60 flex flex-wrap gap-x-4 gap-y-1">
              <span>
                <b className="text-sky-400">{contagemEstados.confere}</b> com o dado conferido
              </span>
              <span>
                <b className="text-amber-400">{contagemEstados.revisar}</b> para revisar
              </span>
              <span>
                <b className="text-red-400">{contagemEstados.nao_achada}</b> não encontrada(s)
              </span>
              <span className="text-parchment/40">“Conferido” significa que a data ou o número aparece no texto lido; ainda assim, olhe o recorte antes de confirmar.</span>
            </div>

            <div className="flex-1 min-h-0 grid md:grid-cols-[17rem_1fr] gap-4 p-5 overflow-hidden">
              {/* lista */}
              <ol className="space-y-1.5 overflow-y-auto pr-1 md:max-h-full max-h-32" aria-label="Figuras da peça">
                {figuras.map((f) => {
                  const estado = estadoDaFigura(resultados[f.numero]);
                  const confirmada = Boolean(imagens[f.numero]);
                  const ativa = f.numero === figuraAtual.numero;
                  return (
                    <li key={f.numero}>
                      <button
                        onClick={() => setSelecionada(f.numero)}
                        className={`w-full text-left rounded-xl border px-3 py-2 transition-colors ${
                          ativa ? 'border-gold bg-gold/10' : 'border-line bg-ink-900/50 hover:bg-ink-900'
                        }`}
                        aria-current={ativa ? 'true' : undefined}
                      >
                        <span className="flex items-center gap-2">
                          <span className="text-xs font-bold text-gold tabular-nums">Fig. {f.numero}</span>
                          <span className="ml-auto flex items-center gap-1 text-[11px]">
                            {confirmada ? (
                              <span className="inline-flex items-center gap-1 text-emerald-400">
                                <CheckCircle2 size={14} /> confirmada
                              </span>
                            ) : (
                              ICONE_ESTADO[estado]
                            )}
                          </span>
                        </span>
                        <span className="block text-xs text-parchment/80 mt-0.5 leading-snug">{f.descricao}</span>
                        <span className="block text-[11px] text-parchment/40 mt-0.5 truncate">{referenciaDaFigura(resultados[f.numero])}</span>
                      </button>
                    </li>
                  );
                })}
              </ol>

              {/* editor */}
              <div ref={colunaRef} className="overflow-y-auto pr-1 min-w-0">
                <div className="mb-3">
                  <p className="text-sm font-semibold text-parchment">{figuraAtual.legenda}</p>
                  <p className="text-xs text-parchment/60">{figuraAtual.descricao}</p>
                  {figuraAtual.evidenciar?.length > 0 && (
                    <p className="text-xs text-gold/90 mt-1">
                      Precisa aparecer:{' '}
                      {figuraAtual.evidenciar
                        .filter((e) => e.valor)
                        .map((e) => `${e.campo} = ${e.valor}`)
                        .join('; ')}
                    </p>
                  )}
                  <p className="text-[11px] mt-1 flex items-center gap-1.5 text-parchment/50">
                    {ICONE_ESTADO[estadoDaFigura(resultados[figuraAtual.numero])]} {ROTULO_ESTADO[estadoDaFigura(resultados[figuraAtual.numero])]}
                    <span className="text-parchment/30">·</span> {referenciaDaFigura(resultados[figuraAtual.numero])}
                  </p>
                </div>

                <EditorRecorte
                  key={figuraAtual.numero}
                  figura={figuraAtual}
                  resultado={resultados[figuraAtual.numero]}
                  documentos={documentos}
                  abrirDocumento={abrirDocumento}
                  imagem={imagens[figuraAtual.numero]}
                  onConfirmar={(dados) => guardarImagem(figuraAtual.numero, dados)}
                  onEnviarPrint={(arquivo) => guardarImagem(figuraAtual.numero, { blob: arquivo, origem: 'upload', documento: arquivo.name, pagina: 0, caixa: null })}
                  onDesfazer={() => desfazer(figuraAtual.numero)}
                />

                {imagens[figuraAtual.numero] && (
                  <div className="mt-3 rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3 space-y-2">
                    <p className="text-xs text-emerald-400 flex items-center gap-1.5">
                      <CheckCircle2 size={13} /> Imagem confirmada
                      {imagens[figuraAtual.numero].origem === 'upload' ? ' (print enviado por você)' : ` (${imagens[figuraAtual.numero].documento}, página ${imagens[figuraAtual.numero].pagina})`}
                    </p>
                    <img src={imagens[figuraAtual.numero].url} alt={`Recorte da ${figuraAtual.legenda}`} className="max-w-full border border-line bg-white rounded" />
                    <button
                      onClick={() => baixarBlob(imagens[figuraAtual.numero].blob, nomeArquivoFigura(figuraAtual, 'png'))}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs text-parchment/80 bg-ink-700 hover:bg-ink-600 rounded-lg"
                    >
                      <Download size={13} /> Baixar esta figura (PNG)
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* rodapé */}
            <div className="flex flex-wrap items-center gap-3 p-4 border-t border-line">
              <button onClick={onFechar} className="inline-flex items-center gap-1.5 px-3 py-2 text-sm text-parchment/70 bg-ink-700 hover:bg-ink-600 rounded-xl">
                <ArrowLeft size={14} /> Voltar à peça
              </button>
              <p className="text-sm text-parchment/80 ml-auto" aria-live="polite">
                <b className={resumo.completo ? 'text-emerald-400' : 'text-gold'}>{resumo.confirmadas}</b> de {resumo.total} figura(s) confirmada(s)
                {resumo.faltam > 0 && <span className="text-parchment/40"> · faltam {resumo.faltam}</span>}
              </p>
              <button
                onClick={baixarZip}
                disabled={resumo.confirmadas === 0}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-sm text-parchment/80 bg-ink-700 hover:bg-ink-600 rounded-xl disabled:opacity-40"
              >
                <Download size={14} /> Baixar as imagens (.zip)
              </button>
              {arquivo && (
                <button
                  onClick={baixarWord}
                  disabled={resumo.confirmadas === 0 || montando}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-ink bg-gold hover:bg-gold/90 rounded-xl disabled:opacity-40"
                >
                  {montando ? <Loader2 size={14} className="animate-spin" /> : <FileText size={14} />} Baixar o Word com as figuras
                </button>
              )}
              {(avisoWord || (arquivo && resumo.confirmadas > 0 && resumo.faltam > 0)) && (
                <p className="basis-full text-right text-xs text-parchment/60" aria-live="polite">
                  {avisoWord || `${resumo.faltam} figura(s) sem imagem ficam no Word como marcador amarelo.`}
                </p>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
