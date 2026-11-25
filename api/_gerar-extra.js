// api/_gerar-extra.js
//
// Peças "extras" geradas por /api/gerar-peca com `tipo` (modelo genérico, api/_pecas-extras.js): cada tipo sabe o que
// precisa de entrada, como monta o texto e o que devolver para a tela além do arquivo. O endpoint cuida de login, RLS,
// leitura dos documentos, extração dos dados do caso, motor, logo e renderização.
//
// Arquivo com prefixo "_": a Vercel não o expõe como endpoint.

import { lerManifestacao, confrontar, montarReplica } from './_replica.js';

export const TIPOS_EXTRAS = {
  replica: { nome: 'Réplica à manifestação da Fazenda', arquivo: 'Replica', precisaManifestacao: true },
};

/** Erro de entrada do usuário (vira 422 com a mensagem). */
export class ErroEntrada extends Error {}

/**
 * @param {{ tipo: string, dados: object, agora: Date, apiKey: string, partesManifestacao?: object[], ctx: object,
 *   tesesConsumadas: string[], entrada?: object }} args
 * @returns {Promise<{ peca: object, descricao: string, avisos: string[], detalhe: object }>}
 */
export async function montarPecaExtra({ tipo, dados, agora, apiKey, partesManifestacao = [], ctx = {}, tesesConsumadas = [] }) {
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
