// api/_gerar-extra.js
//
// Peças "extras" geradas por /api/gerar-peca com `tipo` (modelo genérico, api/_pecas-extras.js): cada tipo sabe o que
// precisa de entrada, como monta o texto e o que devolver para a tela além do arquivo. O endpoint cuida de login, RLS,
// leitura dos documentos, extração dos dados do caso, motor, logo e renderização.
//
// Arquivo com prefixo "_": a Vercel não o expõe como endpoint.

import { lerManifestacao, confrontar, montarReplica } from './_replica.js';
import { pecaEmbargos, pecaAgravo, pecaReconhecimento } from './_pecas-processuais.js';
import { execucaoAjuizada } from './_pecas-extras.js';

export const TIPOS_EXTRAS = {
  replica: { nome: 'Réplica à manifestação da Fazenda', arquivo: 'Replica', precisaManifestacao: true },
  embargos: { nome: 'Embargos à execução fiscal', arquivo: 'Embargos_Execucao' },
  agravo: { nome: 'Agravo de instrumento', arquivo: 'Agravo_Instrumento' },
  reconhecimento_intercorrente: { nome: 'Pedido de reconhecimento da prescrição intercorrente', arquivo: 'Reconhecimento_Intercorrente' },
};

const DATA_RE = /^\d{2}\/\d{2}\/\d{4}$/;
const texto = (v, max) => String(v ?? '').replace(/[\u0000-\u001f]+/g, ' ').trim().slice(0, max);

/** A entrada que a tela manda para cada tipo, validada (data inválida vira "", e a peça leva [PREENCHER]). */
export function sanearEntrada(tipo, entrada = {}) {
  const e = entrada && typeof entrada === 'object' ? entrada : {};
  if (tipo === 'embargos') {
    return {
      data_garantia: DATA_RE.test(texto(e.data_garantia, 10)) ? texto(e.data_garantia, 10) : '',
      forma_garantia: ['penhora', 'deposito', 'fianca_seguro'].includes(e.forma_garantia) ? e.forma_garantia : 'penhora',
    };
  }
  if (tipo === 'agravo') {
    return {
      data_intimacao_decisao: DATA_RE.test(texto(e.data_intimacao_decisao, 10)) ? texto(e.data_intimacao_decisao, 10) : '',
      tribunal: texto(e.tribunal, 120),
      resumo_decisao: texto(e.resumo_decisao, 1500),
    };
  }
  return {};
}

/** Erro de entrada do usuário (vira 422 com a mensagem). */
export class ErroEntrada extends Error {}

/**
 * @param {{ tipo: string, dados: object, agora: Date, apiKey: string, partesManifestacao?: object[], ctx: object,
 *   tesesConsumadas: string[], entrada?: object }} args
 * @returns {Promise<{ peca: object, descricao: string, avisos: string[], detalhe: object }>}
 */
export async function montarPecaExtra({ tipo, dados, agora, apiKey, partesManifestacao = [], ctx = {}, tesesConsumadas = [], entrada = {} }) {
  if (tipo === 'embargos' || tipo === 'agravo' || tipo === 'reconhecimento_intercorrente') {
    if (!execucaoAjuizada(dados)) throw new ErroEntrada('Esta peça exige execução fiscal ajuizada, e os documentos desta análise não mostram uma.');
    const e = sanearEntrada(tipo, entrada);
    const r = tipo === 'embargos' ? pecaEmbargos({ dados, entrada: e, agora }) : tipo === 'agravo' ? pecaAgravo({ dados, entrada: e, agora }) : pecaReconhecimento({ dados, agora });
    if (!r) throw new ErroEntrada('O cálculo do caso não mostra prescrição intercorrente consumada: não há o que pedir com esta peça.');
    const materias = r.materias.length ? r.materias.join(', ') : 'nenhuma matéria sustentada pelo cálculo';
    return { peca: r.peca, descricao: `${TIPOS_EXTRAS[tipo].nome}: ${materias}.`, avisos: r.avisos, detalhe: { materias: r.materias } };
  }
  if (tipo === 'replica') {
    const manifestacao = await lerManifestacao({ apiKey, partesManifestacao, ctx });
    if (manifestacao.alerta_ilegivel) throw new ErroEntrada(`Não consegui ler a manifestação: ${manifestacao.alerta_ilegivel}`);
    if (manifestacao.argumentos.length === 0) {
      throw new ErroEntrada('Não encontrei argumentos da Fazenda nesse arquivo. Confira se é a manifestação (impugnação) e tente de novo.');
    }
    const confrontados = confrontar({ argumentos: manifestacao.argumentos, dados, agora });
    const peca = montarReplica({ dados, manifestacao, confrontados, tesesConsumadas });
    const conta = (s) => confrontados.filter((a) => a.situacao === s).length;
    const avisos = [];
    if (conta('procede')) avisos.push(`${conta('procede')} argumento(s) da Fazenda podem PROCEDER pelo cálculo: confira nos autos antes de protocolar.`);
    if (conta('conferir')) avisos.push(`${conta('conferir')} argumento(s) caem dentro do prazo e precisam de conferência ([CONFIRMAR] na peça).`);
    if (conta('sem_resposta')) avisos.push(`${conta('sem_resposta')} argumento(s) precisam de resposta redigida por você ([PREENCHER] na peça).`);
    return {
      peca,
      descricao: `Réplica a ${confrontados.length} argumento(s) da Fazenda: ${conta('refutado')} refutado(s) pelo cálculo, ${conta('conferir')} a conferir, ${conta('procede')} que pode(m) proceder, ${conta('sem_resposta')} sem resposta automática.`,
      avisos,
      detalhe: {
        data_manifestacao: manifestacao.data_manifestacao,
        argumentos: confrontados.map(({ paragrafos: _p, ...resto }) => resto),
      },
    };
  }
  throw new ErroEntrada('Tipo de peça desconhecido.');
}
