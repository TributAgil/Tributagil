// src/lib/pecaRevisada.js
//
// Monta o Word REVISADO a partir do .docx original da peça + o estado do editor (alterações de texto) + as imagens
// confirmadas das figuras. É o mesmo caminho para o "Aplicar à peça" do editor e para reabrir uma peça salva no banco
// (src/lib/pecasSalvas.js), que guarda só o original e a versão — o Word final é sempre remontado aqui, no navegador.
//
// Regra das figuras (a mesma desde a tela de figuras): as imagens só entram no Word quando TODAS estão confirmadas;
// antes disso o Word sai com o texto editado e os marcadores de figura em amarelo.

import { abrirPecaParaEdicao, montarDocxEditado, listarPendencias, contarPendencias, nomeEditado, bytesParaBase64 } from './docxEdicao';
import { base64ParaBytes, inserirFigurasNoDocx, prepararImagens, nomeComFiguras } from './docxFiguras';
import { alteracoesParaMontagem, contarAlteracoes, textoAtualDoBloco } from './edicaoTexto';

/**
 * @param {{ arquivo: { nome: string, mime: string, base64: string }, estado?: object,
 *   imagens?: Record<number, { blob: Blob }>, figuras?: object[], peca?: object }} args
 *   `peca`: o resultado de abrirPecaParaEdicao, quando já aberto (o editor passa o dele; sem ele, abre aqui)
 * @returns {Promise<{ arquivo: object|null, total: number, figurasNoWord: boolean, figurasConfirmadas: number,
 *   contagem: { preencher: number, confirmar: number, figuras: number } }>}  `arquivo` null = igual ao original
 */
export async function montarPecaRevisada({ arquivo, estado = {}, imagens = {}, figuras = [], peca = null }) {
  const aberta = peca || (await abrirPecaParaEdicao(base64ParaBytes(arquivo.base64)));
  const alteracoes = alteracoesParaMontagem(estado, aberta.blocos);
  const total = contarAlteracoes(alteracoes);
  const figurasConfirmadas = figuras.filter((f) => imagens[f.numero]).length;
  const figurasNoWord = figuras.length > 0 && figurasConfirmadas === figuras.length;

  const pendencias = listarPendencias(aberta.blocos, (b) => textoAtualDoBloco(estado, b)).filter((p) => p.tipo !== 'figura');
  const marcadoresDeFigura = aberta.blocos.filter((b) => b.figura).length;
  // o que continua em amarelo NO WORD: sem todas as figuras confirmadas, os marcadores de figura ficam todos
  const contagem = { ...contarPendencias(pendencias), figuras: figurasNoWord ? 0 : marcadoresDeFigura };

  if (total === 0 && !figurasNoWord) return { arquivo: null, total, figurasNoWord, figurasConfirmadas, contagem };

  let bytes = await montarDocxEditado(aberta.fonte, alteracoes);
  let nome = total > 0 ? nomeEditado(arquivo.nome) : arquivo.nome;
  if (figurasNoWord) {
    const doWord = Object.fromEntries(figuras.map((f) => [f.numero, { blob: imagens[f.numero].blob, descricao: f.legenda }]));
    const r = await inserirFigurasNoDocx(bytes, await prepararImagens(doWord));
    bytes = r.docx;
    nome = nomeComFiguras(nome);
    if (r.restantes.length) contagem.figuras = r.restantes.length;
  }
  return { arquivo: { nome, mime: arquivo.mime, base64: bytesParaBase64(bytes) }, total, figurasNoWord, figurasConfirmadas, contagem };
}
