// Converte um caso fictício (cenarios.json) nos DADOS que a extração do Gemini entregaria ao motor
// (mesmo formato de api/_schema-dados-peca.js, já normalizado), e roda o motor nesses dados.
// Usado pelo gabarito (gerar-gabarito.mjs) e pelo teste automático (tests/casos-ficticios.test.js).
import { avaliarPecas } from '../../api/_motor-peca.js';

const dt = (data, fonte) => ({ data: data || '', fonte: data ? fonte : '' });
const NEUTRO = { data: '', fonte: '' };

export function dadosDoCaso(c) {
  const ex = c.execucao;
  const inscricoes = c.cdas.map((cda) => ({
    numero_cda: cda.numero,
    tributo: cda.tributo,
    processo_administrativo: cda.pa,
    periodos: cda.periodos.map((p) => ({
      periodo: p.periodo,
      modalidade_lancamento: p.modalidade,
      tipo_declaracao: p.declaracao || '',
      data_entrega_declaracao: dt(p.entrega, 'Certidão de Dívida Ativa'),
      data_vencimento: dt(p.vencimento, 'Certidão de Dívida Ativa'),
      data_fato_gerador: dt(p.fato_gerador, 'Auto de Infração'),
      houve_pagamento_antecipado: p.pagamento || 'não consta',
      fonte_pagamento_antecipado: p.fonte_pagamento || '',
      imputacao_dolo_fraude_simulacao: p.dolo || 'não consta',
      imputacao_dolo_fraude_simulacao_fonte: p.dolo && p.dolo !== 'não consta' ? 'Auto de Infração' : '',
      lancamento_anterior_anulado_vicio_formal: p.vicio || 'não consta',
      lancamento_anterior_anulado_vicio_formal_fonte: p.vicio && p.vicio !== 'não consta' ? 'Auto de Infração' : '',
      data_decisao_anulatoria: dt(p.anulacao, 'Decisão anulatória'),
      data_notificacao_lancamento: dt(p.notificacao, 'Auto de Infração'),
    })),
    eventos_interruptivos: (cda.eventos || []).map((e) => ({ tipo: e.tipo, data: e.data, fonte: 'Extrato de débito' })),
  }));
  return {
    alerta_ilegivel: '',
    ente_credor: { esfera: c.ente, nome: c.ente === 'União' ? 'Fazenda Nacional' : 'Estado da Bahia' },
    orgao_cobranca: c.orgao,
    processo_execucao: ex
      ? {
          numero: ex.numero,
          exequente: ex.exequente,
          vara: ex.vara,
          comarca_secao: ex.secao,
          data_ajuizamento: dt(ex.ajuizamento, 'Termo de autuação'),
          data_despacho_citatorio: NEUTRO,
          data_citacao: NEUTRO,
        }
      : { numero: '', exequente: '', vara: '', comarca_secao: '', data_ajuizamento: NEUTRO, data_despacho_citatorio: NEUTRO, data_citacao: NEUTRO },
    executado: {
      nome: c.parte.nome, documento: c.parte.doc, nacionalidade: c.parte.nacionalidade || '', estado_civil: c.parte.estado_civil || '',
      profissao: c.parte.profissao || '', endereco: c.parte.endereco,
    },
    inscricoes,
    eventos_execucao: ex
      ? ex.eventos.map((e) => ({ categoria: e.categoria, data: e.data, inscricao: e.inscricao || '', objeto_nao_localizado: e.categoria === 'intimacao_nao_localizacao_bens' ? e.objeto : 'não consta', fonte: 'Andamento processual' }))
      : [],
  };
}

const parseBR = (s) => {
  const [d, m, a] = s.split('/').map(Number);
  return new Date(Date.UTC(a, m - 1, d));
};

/** Roda o motor como se o parecer da IA concordasse com o caso (parecer_favoravel). */
export function avaliarCaso(c) {
  const dados = dadosDoCaso(c);
  const conclusoes = (c.parecer_favoravel || []).map((tipo) => ({
    tipo: tipo === 'prescricao_ordinaria' ? 'prescricao' : tipo,
    severidade: 'favoravel',
    confianca: 90,
  }));
  const { pecas } = avaliarPecas({ dados, conclusoesParecer: conclusoes, agora: parseBR(c.agora) });
  return { dados, pecas };
}
