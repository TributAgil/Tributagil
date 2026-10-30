// src/components/figuras/useFigurasDaPeca.js
//
// Estado das figuras da peça dentro do editor: a busca de cada figura nos documentos do caso (/api/localizar-figuras,
// uma chamada ao Gemini por peça, feita só quando o advogado abre a primeira figura), os documentos abertos (cada PDF é
// baixado e aberto uma vez só) e as imagens que o advogado confirmou.
//
// `inicial` traz o que já foi feito antes de fechar o editor ({ localizacao, imagens }), para reabrir sem repetir a
// busca (custo) nem perder os recortes. As imagens guardam só o Blob: a URL de miniatura é criada aqui e liberada ao sair.
//
// `servicos` é injetável para testar a tela sem Supabase nem Gemini; em produção usa os reais de src/lib/figuras.js.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { localizarFigurasNaAnalise, baixarDocumentoDaAnalise, resumoDeConfirmacao } from '../../lib/figuras';
import { abrirDocumento as abrirDocumentoReal } from '../../lib/pdfPaginas';

export const SERVICOS_FIGURAS = {
  localizar: localizarFigurasNaAnalise,
  carregarDocumento: baixarDocumentoDaAnalise,
  abrir: abrirDocumentoReal,
};

const comUrl = (imagens) =>
  Object.fromEntries(Object.entries(imagens || {}).map(([n, i]) => [n, { ...i, url: URL.createObjectURL(i.blob) }]));

/**
 * @param {{ analiseId: string, figuras: object[], inicial?: { localizacao?: object, imagens?: object }, servicos?: object }} args
 */
export function useFigurasDaPeca({ analiseId, figuras, inicial = {}, servicos = SERVICOS_FIGURAS }) {
  // 'ocioso' (ainda não buscou) | 'procurando' | 'erro' | 'pronto'
  const [fase, setFase] = useState(inicial.localizacao ? 'pronto' : 'ocioso');
  const [erro, setErro] = useState('');
  const [localizacao, setLocalizacao] = useState(inicial.localizacao || null); // { resultados: {numero: r}, documentos }
  const [imagens, setImagens] = useState(() => comUrl(inicial.imagens)); // numero -> { blob, url, origem, documento, pagina, caixa }
  const abertos = useRef(new Map()); // storage_path -> Promise<documento aberto>
  const imagensRef = useRef(imagens);
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
    setLocalizacao({ resultados: Object.fromEntries((r.figuras || []).map((x) => [x.numero, x])), documentos: r.documentos || [] });
    setFase('pronto');
  }, [analiseId, figuras, servicos]);

  /** Busca uma vez só: abrir a segunda figura (ou reabrir o editor) não chama o Gemini de novo. */
  const garantirBusca = useCallback(() => {
    if (fase === 'ocioso' || fase === 'erro') procurar();
  }, [fase, procurar]);

  // libera os documentos abertos e as miniaturas ao sair
  useEffect(
    () => () => {
      abertos.current.forEach((p) => p.then((d) => d.fechar?.()).catch(() => {}));
      Object.values(imagensRef.current).forEach((i) => URL.revokeObjectURL(i.url));
    },
    [],
  );

  const documentos = useMemo(() => localizacao?.documentos || [], [localizacao]);

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

  const guardarImagem = useCallback((numero, dados) => {
    setImagens((atual) => {
      if (atual[numero]) URL.revokeObjectURL(atual[numero].url);
      return { ...atual, [numero]: { ...dados, url: URL.createObjectURL(dados.blob) } };
    });
  }, []);

  const desfazer = useCallback((numero) => {
    setImagens((atual) => {
      if (atual[numero]) URL.revokeObjectURL(atual[numero].url);
      const { [numero]: _removida, ...resto } = atual;
      return resto;
    });
  }, []);

  const resumo = useMemo(() => resumoDeConfirmacao(figuras, imagens), [figuras, imagens]);

  /** O que volta para o modal ao aplicar: sem as URLs (elas morrem com o editor). */
  const paraGuardar = useCallback(
    () => ({
      localizacao,
      imagens: Object.fromEntries(Object.entries(imagensRef.current).map(([n, { url: _url, ...resto }]) => [n, resto])),
    }),
    [localizacao],
  );

  return {
    fase,
    erro,
    resultados: localizacao?.resultados || {},
    documentos,
    procurar,
    garantirBusca,
    abrirDocumento,
    imagens,
    guardarImagem,
    desfazer,
    resumo,
    paraGuardar,
  };
}
