// api/_carteira.js
//
// Carteira de casos: transforma o resultado do MOTOR (api/_motor-peca.js e api/_motor-prazos.js, os mesmos cálculos
// da peça) nos MARCOS que a carteira mostra e que geram o alerta por e-mail. Puro e determinístico: nada de IA aqui.
//
// Dois tipos de marco:
//   'consumado'  — já prescrito/decaído na data do cálculo: há tese para a peça agora.
//   'acompanhar' — ainda NÃO consumado, mas vai se consumar numa data conhecida SE nada interromper até lá:
//                  * prescrição ordinária sem execução ajuizada: consuma se a execução não for ajuizada (com despacho
//                    de citação) até a data;
//                  * prescrição intercorrente com ciclo em curso: consuma se não houver penhora efetiva, citação ou
//                    outro ato interruptivo até a data.
//                  É este que vira alerta quando a data passa (api/alertas-prazo.js).
// Decadência só entra como 'consumado': com o lançamento já notificado, a conta não muda com o tempo.
// Prescrição ordinária COM execução ajuizada e ainda não prescrita também não entra: o ajuizamento já interrompeu.
//
// Arquivo com prefixo "_": a Vercel não o expõe como endpoint.

import { TESES, avaliarPeca, execucaoAjuizada, formatarDataBR } from './_motor-peca.js';
import { calcularPrescricaoIntercorrente } from './_motor-prazos.js';

export const FASES = ['analisado', 'peca_gerada', 'protocolado', 'decidido', 'arquivado'];

const CONDICAO_ORDINARIA = 'desde que a execução fiscal não tenha sido ajuizada (com despacho de citação) até essa data';
const CONDICAO_INTERCORRENTE = 'desde que não tenha havido penhora efetiva, citação ou outro ato interruptivo até essa data';

const dataBR = (d) => (d instanceof Date ? formatarDataBR(d) : String(d || ''));

/**
 * @param {{ dados: object, conclusoesParecer?: object[], agora?: Date }} args  `dados`: a saída normalizada da extração da
 *   peça; `conclusoesParecer`: as do parecer salvo (o status de cada tese considera a divergência, como na peça)
 * @returns {{ ajuizada: boolean, teses: Array<{ tese: string, status: string, mensagem: string, bloqueios: string[] }>,
 *   marcos: Array<{ chave: string, tese: string, cda: string, periodo: string, data: string, tipo: 'consumado'|'acompanhar',
 *   condicao: string }> }}
 */
export function marcosDoCaso({ dados, conclusoesParecer = [], agora = new Date() }) {
  const ajuizada = execucaoAjuizada(dados?.processo_execucao);
  const marcos = [];
  const teses = [];

  for (const tese of TESES) {
    const a = avaliarPeca({ dados, tese, conclusoesParecer, agora });
    teses.push({ tese, status: a.status, mensagem: a.mensagem || '', bloqueios: a.bloqueios.slice(0, 10) });
    if (tese === 'prescricao_ordinaria') {
      for (const c of a.avaliados) {
        if (c.prescrito) marcos.push({ tese, cda: c.cda, periodo: c.periodo, data: dataBR(c.consumacao), tipo: 'consumado', condicao: '' });
        else if (!ajuizada) marcos.push({ tese, cda: c.cda, periodo: c.periodo, data: dataBR(c.consumacao), tipo: 'acompanhar', condicao: CONDICAO_ORDINARIA });
      }
    } else if (tese === 'decadencia') {
      for (const c of a.avaliados) {
        if (c.decaido) marcos.push({ tese, cda: c.cda, periodo: c.periodo, data: dataBR(c.termoFinal), tipo: 'consumado', condicao: '' });
      }
    }
  }

  // Intercorrente direto do motor de prazos: inclui o ciclo EM CURSO, que a peça ignora (não há o que pedir ainda)
  if (ajuizada) {
    const eventos = (dados?.eventos_execucao || []).map((e) => ({ data: e.data, inscricao: e.inscricao || '', categoria: e.categoria, fonte: e.fonte }));
    for (const r of calcularPrescricaoIntercorrente(eventos, agora)) {
      const ativo = r.ciclos.find((c) => c.status === 'ativo');
      if (!ativo) continue;
      marcos.push({
        tese: 'prescricao_intercorrente',
        cda: r.inscricao === '(execução)' ? '' : r.inscricao,
        periodo: '',
        data: ativo.dataPrazoFinal,
        tipo: ativo.reconhecida ? 'consumado' : 'acompanhar',
        condicao: ativo.reconhecida ? '' : CONDICAO_INTERCORRENTE,
      });
    }
  }

  // chave estável: o mesmo marco recalculado depois não gera um segundo e-mail
  const vistos = new Set();
  const unicos = [];
  for (const m of marcos) {
    const chave = [m.tese, m.cda, m.periodo, m.data].join('|');
    if (vistos.has(chave)) continue;
    vistos.add(chave);
    unicos.push({ chave, ...m });
  }
  return { ajuizada, teses, marcos: unicos };
}

/** "DD/MM/AAAA" -> "AAAA-MM-DD" (o formato do Postgres); vazio se inválida. */
export function dataIso(br) {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(br || ''));
  return m ? `${m[3]}-${m[2]}-${m[1]}` : '';
}
