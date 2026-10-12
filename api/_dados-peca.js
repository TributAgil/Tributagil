// api/_dados-peca.js
//
// Normaliza a saída do Gemini (ESQUEMA_DADOS_PECA) antes de entregá-la ao
// motor e ao contexto. O responseSchema garante a FORMA na maior parte das
// vezes, mas "na maior parte das vezes" não basta para algo que vira peça
// processual: aqui toda chave existe com o tipo certo, enums inválidos viram
// o valor neutro ("" / "não consta" — nunca um palpite) e datas fora de
// DD/MM/AAAA são descartadas em vez de passadas adiante.
//
// Arquivo com prefixo "_": a Vercel não o expõe como endpoint.

const s = (v) => (typeof v === 'string' ? v.trim() : '');
const DATA_RE = /^\d{2}\/\d{2}\/\d{4}$/;

function dataFonte(v) {
  const data = s(v?.data);
  return DATA_RE.test(data) ? { data, fonte: s(v?.fonte) } : { data: '', fonte: '' };
}

const enumDe = (v, validos, neutro) => (validos.includes(s(v)) ? s(v) : neutro);
const TRES_ESTADOS = ['sim', 'não', 'não consta'];

export const MODALIDADES = ['homologacao_declarado', 'homologacao_nao_declarado', 'oficio'];
export const TIPOS_EVENTO = ['parcelamento', 'pagamento', 'protesto', 'compensacao'];

export function normalizarDadosPeca(bruto) {
  const b = bruto && typeof bruto === 'object' ? bruto : {};
  const proc = b.processo_execucao || {};
  const exe = b.executado || {};

  return {
    alerta_ilegivel: s(b.alerta_ilegivel),
    ente_credor: {
      esfera: enumDe(b.ente_credor?.esfera, ['União', 'Estado', 'Município'], ''),
      nome: s(b.ente_credor?.nome),
    },
    orgao_cobranca: s(b.orgao_cobranca),
    processo_execucao: {
      numero: s(proc.numero),
      vara: s(proc.vara),
      comarca_secao: s(proc.comarca_secao),
      data_ajuizamento: dataFonte(proc.data_ajuizamento),
      data_despacho_citatorio: dataFonte(proc.data_despacho_citatorio),
      data_citacao: dataFonte(proc.data_citacao),
    },
    executado: {
      nome: s(exe.nome),
      documento: s(exe.documento),
      nacionalidade: s(exe.nacionalidade),
      estado_civil: s(exe.estado_civil),
      profissao: s(exe.profissao),
      endereco: s(exe.endereco),
    },
    inscricoes: (Array.isArray(b.inscricoes) ? b.inscricoes : []).map((i) => ({
      numero_cda: s(i?.numero_cda),
      tributo: s(i?.tributo),
      processo_administrativo: s(i?.processo_administrativo),
      periodos: (Array.isArray(i?.periodos) ? i.periodos : []).map((p) => ({
        periodo: s(p?.periodo),
        // modalidade fora do enum fica "" — o motor trata como "não identificada" e bloqueia
        modalidade_lancamento: enumDe(p?.modalidade_lancamento, MODALIDADES, ''),
        tipo_declaracao: s(p?.tipo_declaracao),
        data_entrega_declaracao: dataFonte(p?.data_entrega_declaracao),
        data_vencimento: dataFonte(p?.data_vencimento),
        data_fato_gerador: dataFonte(p?.data_fato_gerador),
        houve_pagamento_antecipado: enumDe(p?.houve_pagamento_antecipado, TRES_ESTADOS, 'não consta'),
        indicio_dolo_fraude_simulacao: enumDe(p?.indicio_dolo_fraude_simulacao, TRES_ESTADOS, 'não consta'),
        data_notificacao_lancamento: dataFonte(p?.data_notificacao_lancamento),
      })),
      eventos_interruptivos: (Array.isArray(i?.eventos_interruptivos) ? i.eventos_interruptivos : [])
        .filter((e) => TIPOS_EVENTO.includes(s(e?.tipo)))
        // data inválida NÃO é descartada: vira "" para o motor BLOQUEAR (evento sem data exige análise manual)
        .map((e) => ({ tipo: s(e.tipo), data: DATA_RE.test(s(e?.data)) ? s(e.data) : '', fonte: s(e?.fonte) })),
    })),
  };
}
