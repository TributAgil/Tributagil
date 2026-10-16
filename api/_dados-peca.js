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
export const CATEGORIAS_EXECUCAO = ['intimacao_nao_localizacao_bens', 'requerimento_constricao', 'penhora_constricao', 'citacao'];
export const OBJETOS_NAO_LOCALIZADO = ['devedor', 'bens', 'devedor_e_bens', 'não consta'];

const CAMPOS_DATA_PERIODO = ['data_entrega_declaracao', 'data_vencimento', 'data_fato_gerador', 'data_decisao_anulatoria', 'data_notificacao_lancamento'];
function periodoFantasma(p) {
  return s(p?.periodo) === '' && CAMPOS_DATA_PERIODO.every((k) => !DATA_RE.test(s(p?.[k]?.data)));
}

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
      exequente: s(proc.exequente),
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
      // Período fantasma (sem nome e sem nenhuma data) é invenção da leitura, típica de CDA sem período no documento:
      // descartado, senão o motor o avalia e aparece uma tese de decadência "bloqueada" sem existir nada a avaliar.
      periodos: (Array.isArray(i?.periodos) ? i.periodos : []).filter((p) => !periodoFantasma(p)).map((p) => ({
        periodo: s(p?.periodo),
        // modalidade fora do enum fica "" — o motor trata como "não identificada" e bloqueia
        modalidade_lancamento: enumDe(p?.modalidade_lancamento, MODALIDADES, ''),
        // o schema não aceita enum vazio (Gemini 400): "não consta" volta a ser "" aqui
        tipo_declaracao: s(p?.tipo_declaracao) === 'não consta' ? '' : s(p?.tipo_declaracao),
        data_entrega_declaracao: dataFonte(p?.data_entrega_declaracao),
        data_vencimento: dataFonte(p?.data_vencimento),
        data_fato_gerador: dataFonte(p?.data_fato_gerador),
        houve_pagamento_antecipado: enumDe(p?.houve_pagamento_antecipado, TRES_ESTADOS, 'não consta'),
        fonte_pagamento_antecipado: s(p?.fonte_pagamento_antecipado),
        imputacao_dolo_fraude_simulacao: enumDe(p?.imputacao_dolo_fraude_simulacao, TRES_ESTADOS, 'não consta'),
        imputacao_dolo_fraude_simulacao_fonte: s(p?.imputacao_dolo_fraude_simulacao_fonte),
        lancamento_anterior_anulado_vicio_formal: enumDe(p?.lancamento_anterior_anulado_vicio_formal, TRES_ESTADOS, 'não consta'),
        lancamento_anterior_anulado_vicio_formal_fonte: s(p?.lancamento_anterior_anulado_vicio_formal_fonte),
        data_decisao_anulatoria: dataFonte(p?.data_decisao_anulatoria),
        data_notificacao_lancamento: dataFonte(p?.data_notificacao_lancamento),
      })),
      eventos_interruptivos: (Array.isArray(i?.eventos_interruptivos) ? i.eventos_interruptivos : [])
        .filter((e) => TIPOS_EVENTO.includes(s(e?.tipo)))
        // data inválida NÃO é descartada: vira "" para o motor BLOQUEAR (evento sem data exige análise manual)
        .map((e) => ({ tipo: s(e.tipo), data: DATA_RE.test(s(e?.data)) ? s(e.data) : '', fonte: s(e?.fonte) })),
    })),
    // categoria fora do enum some; data inválida some (evento sem data não conta como marco)
    eventos_execucao: (Array.isArray(b.eventos_execucao) ? b.eventos_execucao : [])
      .filter((e) => CATEGORIAS_EXECUCAO.includes(s(e?.categoria)) && DATA_RE.test(s(e?.data)))
      .map((e) => ({
        categoria: s(e.categoria),
        data: s(e.data),
        inscricao: s(e?.inscricao),
        objeto_nao_localizado: enumDe(e?.objeto_nao_localizado, OBJETOS_NAO_LOCALIZADO, 'não consta'),
        fonte: s(e?.fonte),
      })),
  };
}
