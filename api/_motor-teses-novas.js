// api/_motor-teses-novas.js
//
// Etapa 3: NOVAS TESES de defesa na execução fiscal, decididas em CÓDIGO a partir dos fatos extraídos
// (api/_schema-dados-peca.js), como as três originais. Regras conservadoras: na dúvida, BLOQUEIA (análise manual).
//
//   ilegitimidade_passiva  — redirecionamento indevido ao sócio (art. 135, III, CTN):
//       * nome do sócio na CDA: não cabe exceção (REsp 1.110.925/SP, ônus é do sócio) -> bloqueada, via são os embargos;
//       * fundamento "mero inadimplemento" -> Súmula 430/STJ;
//       * dissolução irregular, mas o sócio saiu regularmente antes dela ou não era gerente nela -> Temas 962 e 981/STJ;
//       * prescrição para o redirecionamento (Tema 444/STJ): pedido mais de 5 anos depois da citação da empresa, com a
//         dissolução anterior à citação -> argumento com [CONFIRMAR] (a inércia da Fazenda precisa ser demonstrada).
//   nulidade_cda           — requisito essencial ausente na CDA anexada (art. 202 CTN, art. 2º, § 5º, LEF); aviso da
//                            Súmula 392/STJ (a Fazenda pode substituir a CDA).
//   cobranca_indevida      — período quitado integralmente antes da inscrição (art. 156, I, CTN) e/ou o mesmo tributo
//                            e período cobrado em duas inscrições (duplicidade).
//
// Cada avaliação tem o MESMO formato de avaliarPeca (api/_motor-peca.js), com `generica: true` (a peça sai no modelo
// genérico, api/_pecas-teses-novas.js) e `fatos` (o que a peça usa).
//
// Arquivo com prefixo "_": a Vercel não o expõe como endpoint.

import { parseDataBR, formatarDataBR, somarAnos, execucaoAjuizada } from './_motor-peca.js';
import { REQUISITOS_CDA } from './_dados-peca.js';

export const TESES_NOVAS = ['ilegitimidade_passiva', 'nulidade_cda', 'cobranca_indevida'];
export const TEMPLATE_GENERICO = 'Peca_generica';
export const NOME_TESE_NOVA = {
  ilegitimidade_passiva: 'Ilegitimidade passiva do sócio (redirecionamento indevido)',
  nulidade_cda: 'Nulidade da CDA',
  cobranca_indevida: 'Cobrança indevida (pagamento ou duplicidade)',
};

// requisitos cuja falta torna a CDA nula; domicílio ("sempre que conhecido") e processo administrativo ("se nele estiver
// apurado o valor") dependem do caso: viram aviso, não tese
const ESSENCIAIS = ['nome_devedor', 'valor_originario', 'forma_calculo_juros_encargos', 'origem_natureza_fundamento_legal', 'data_numero_inscricao'];
export const NOME_REQUISITO = {
  nome_devedor: 'nome do devedor',
  domicilio: 'domicílio do devedor',
  valor_originario: 'valor originário da dívida',
  forma_calculo_juros_encargos: 'termo inicial e forma de calcular os juros de mora e demais encargos',
  origem_natureza_fundamento_legal: 'origem, natureza e fundamento legal da dívida',
  data_numero_inscricao: 'data e número da inscrição',
  processo_administrativo: 'número do processo administrativo ou do auto de infração',
};

const dataDe = (x) => parseDataBR(typeof x === 'string' ? x : x?.data);
const normalizar = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

function base(tese) {
  return {
    tese,
    generica: true,
    relevante: false,
    template: null,
    creditos: [],
    omitidos: [],
    avaliados: [],
    avisos: [],
    bloqueios: [],
    divergencias: [],
    dataReferencia: '',
    intercorrente: null,
    mensagem: '',
    status: 'sem_tese',
    fatos: {},
    resumoCreditos: [],
    descricao: '',
  };
}

function fechar(r, { motivoSemTese } = {}) {
  if (!r.relevante) return r;
  if (r.bloqueios.length) return { ...r, status: 'bloqueada', template: null, mensagem: 'A peça não pode ser gerada automaticamente.' };
  if (!r.fatos.argumentos?.length && !r.fatos.ok) return { ...r, status: 'sem_tese', mensagem: motivoSemTese || `O cálculo não identificou ${NOME_TESE_NOVA[r.tese].toLowerCase()}.` };
  return { ...r, status: 'ok', template: TEMPLATE_GENERICO, mensagem: '' };
}

// ---- Ilegitimidade passiva (redirecionamento) ----------------------------------------------------------------------------
export function avaliarIlegitimidade({ dados }) {
  const r = base('ilegitimidade_passiva');
  const red = dados?.redirecionamento || {};
  if (red.houve !== 'sim' || !execucaoAjuizada(dados?.processo_execucao)) return r;
  r.relevante = true;
  const argumentos = [];
  const socio = red.socio_nome || '';
  r.fatos = { socio, socio_documento: red.socio_documento || '', fundamento: red.fundamento, argumentos };

  if (red.socio_consta_na_cda === 'sim') {
    r.bloqueios.push(
      `O nome de ${socio || 'o sócio'} consta da CDA como corresponsável: presume-se a responsabilidade e o ônus de provar o contrário é dele, o que exige prova (REsp 1.110.925/SP). A via adequada são os embargos à execução, não a exceção.`,
    );
    return fechar(r);
  }
  if (red.socio_consta_na_cda === 'não consta') {
    r.bloqueios.push('Não foi possível conferir se o sócio consta da CDA (a CDA não está entre os documentos): sem isso, a exceção pode ser incabível (REsp 1.110.925/SP). Anexe a CDA e gere de novo.');
    return fechar(r);
  }

  if (red.fundamento === 'mero_inadimplemento') {
    argumentos.push({ tipo: 'sumula_430' });
  } else if (red.fundamento === 'dissolucao_irregular') {
    const dissolucao = dataDe(red.data_dissolucao_irregular);
    const saida = dataDe(red.data_saida_socio);
    r.fatos.data_dissolucao = dissolucao ? formatarDataBR(dissolucao) : '';
    r.fatos.data_saida = saida ? formatarDataBR(saida) : '';
    if (saida && dissolucao && saida < dissolucao) argumentos.push({ tipo: 'saida_antes_dissolucao' });
    else if (red.socio_gerente_na_dissolucao === 'não') argumentos.push({ tipo: 'nao_gerente_na_dissolucao' });
    else if (red.socio_gerente_na_dissolucao === 'não consta' && !saida) {
      r.bloqueios.push('O redirecionamento se funda em dissolução irregular, mas os documentos não mostram se o sócio tinha poderes de gerência na data da dissolução nem quando saiu da sociedade (Temas 962 e 981/STJ). Anexe o contrato social e as alterações.');
    }
    // Tema 444: dissolução ANTES da citação da empresa e pedido mais de 5 anos depois da citação
    const citacao = dataDe(dados?.processo_execucao?.data_citacao);
    const pedido = dataDe(red.data_pedido_redirecionamento);
    if (citacao && pedido && dissolucao && dissolucao <= citacao && pedido > somarAnos(citacao, 5)) {
      argumentos.push({ tipo: 'prescricao_redirecionamento', citacao: formatarDataBR(citacao), pedido: formatarDataBR(pedido) });
      r.avisos.push('Prescrição para o redirecionamento (Tema 444/STJ): exige demonstrar a inércia da Fazenda no quinquênio. O tópico sai com [CONFIRMAR].');
    }
    if (!argumentos.length && !r.bloqueios.length) {
      return { ...r, status: 'sem_tese', mensagem: 'O sócio tinha poderes de gerência na dissolução irregular: o redirecionamento é, em tese, cabível (Tema 981/STJ).' };
    }
  } else {
    r.bloqueios.push(
      red.fundamento === 'outro'
        ? 'O redirecionamento se funda em ato do art. 135 do CTN que não é inadimplemento nem dissolução irregular (fraude, excesso de poderes...): exige análise manual e, em regra, prova (embargos).'
        : 'Os documentos não mostram o fundamento do redirecionamento. Anexe o pedido da Fazenda e a decisão que incluiu o sócio.',
    );
  }
  r.descricao = `Exclusão de ${socio || 'o sócio'} do polo passivo (${argumentos.map((a) => ROTULO_ARGUMENTO[a.tipo]).join('; ') || 'sem argumento'}).`;
  return fechar(r);
}

const ROTULO_ARGUMENTO = {
  sumula_430: 'mero inadimplemento, Súmula 430/STJ',
  saida_antes_dissolucao: 'retirada regular antes da dissolução, Tema 962/STJ',
  nao_gerente_na_dissolucao: 'sem gerência na dissolução, Tema 981/STJ',
  prescricao_redirecionamento: 'prescrição para o redirecionamento, Tema 444/STJ',
};

// ---- Nulidade da CDA -------------------------------------------------------------------------------------------------------
export function avaliarNulidadeCda({ dados }) {
  const r = base('nulidade_cda');
  const vicios = [];
  for (const i of dados?.inscricoes || []) {
    if (i?.cda_anexada !== 'sim') continue;
    const ausentes = REQUISITOS_CDA.filter((k) => i.requisitos_cda?.[k] === 'ausente');
    if (!ausentes.length) continue;
    const essenciais = ausentes.filter((k) => ESSENCIAIS.includes(k));
    vicios.push({ cda: i.numero_cda, essenciais, outros: ausentes.filter((k) => !ESSENCIAIS.includes(k)) });
  }
  if (!vicios.length) return r;
  r.relevante = true;
  const comEssencial = vicios.filter((v) => v.essenciais.length);
  for (const v of vicios.filter((x) => !x.essenciais.length)) {
    r.avisos.push(`CDA ${v.cda || '(sem número)'}: falta ${v.outros.map((k) => NOME_REQUISITO[k]).join(' e ')} (requisito que depende do caso: conferir se basta para a nulidade).`);
  }
  r.fatos = { vicios: comEssencial, ok: comEssencial.length > 0 };
  r.avisos.push('A Fazenda pode substituir a CDA até a sentença dos embargos, para corrigir erro material ou formal, sem mudar o devedor (Súmula 392/STJ e art. 203 do CTN): a tese pode levar à substituição do título, e não necessariamente à extinção.');
  r.resumoCreditos = comEssencial.map((v) => ({ cda: v.cda, periodo: '', termo_inicial: '', consumacao: '' }));
  r.descricao = `Nulidade da(s) CDA(s) ${comEssencial.map((v) => v.cda || '(sem número)').join(', ')}: falta(m) ${[...new Set(comEssencial.flatMap((v) => v.essenciais))].map((k) => NOME_REQUISITO[k]).join('; ')}.`;
  return fechar(r, { motivoSemTese: 'Faltam na CDA só requisitos que dependem do caso (domicílio ou processo administrativo): veja os avisos.' });
}

// ---- Cobrança indevida (pagamento antes da inscrição, duplicidade) ---------------------------------------------------------
export function avaliarCobrancaIndevida({ dados }) {
  const r = base('cobranca_indevida');
  const pagos = [];
  const duplicados = [];
  const inscricoes = dados?.inscricoes || [];
  for (const i of inscricoes) {
    const inscricao = dataDe(i?.data_inscricao);
    for (const p of i?.periodos || []) {
      const q = p?.quitacao_integral;
      if (q?.situacao !== 'sim') continue;
      const dataPag = dataDe(q.data);
      if (!dataPag) {
        r.bloqueios.push(`${i.numero_cda || 'CDA'} / ${p.periodo || 'período'}: consta quitação integral, mas sem a data do pagamento. Anexe o comprovante.`);
        continue;
      }
      if (inscricao && dataPag > inscricao) {
        r.avisos.push(`${i.numero_cda || 'CDA'} / ${p.periodo || 'período'}: pagamento em ${q.data}, depois da inscrição em ${formatarDataBR(inscricao)}. Pagamento posterior extingue o crédito, mas a cobrança até ali não era indevida: conferir o pedido.`);
      }
      pagos.push({ cda: i.numero_cda, periodo: p.periodo, data: q.data, fonte: q.fonte, posteriorInscricao: Boolean(inscricao && dataPag > inscricao) });
      if (!q.fonte) r.avisos.push(`${i.numero_cda || 'CDA'} / ${p.periodo || 'período'}: quitação sem documento indicado: anexe o comprovante (a exceção não admite prova a produzir).`);
    }
  }
  // duplicidade: mesmo tributo e mesmo período em duas inscrições diferentes
  const vistos = new Map();
  for (const i of inscricoes) {
    const tributo = normalizar(i?.tributo);
    if (!tributo) continue;
    for (const p of i?.periodos || []) {
      const periodo = normalizar(p?.periodo);
      if (!periodo) continue;
      const chave = `${tributo}|${periodo}`;
      const outro = vistos.get(chave);
      if (outro && outro.cda !== i.numero_cda) duplicados.push({ tributo: i.tributo, periodo: p.periodo, cdas: [outro.cda, i.numero_cda] });
      else if (!outro) vistos.set(chave, { cda: i.numero_cda });
    }
  }
  if (!pagos.length && !duplicados.length && !r.bloqueios.length) return r;
  r.relevante = true;
  if (duplicados.length) {
    r.avisos.push('Duplicidade: confira se as inscrições não cobram parcelas ou fatos geradores distintos do mesmo período (ex.: auto de infração complementar) antes de protocolar.');
  }
  r.fatos = { pagos, duplicados, ok: pagos.length > 0 || duplicados.length > 0 };
  r.resumoCreditos = [
    ...pagos.map((p) => ({ cda: p.cda, periodo: p.periodo, termo_inicial: '', consumacao: `pago em ${p.data}` })),
    ...duplicados.map((d) => ({ cda: d.cdas.join(' = '), periodo: d.periodo, termo_inicial: '', consumacao: 'cobrança em duplicidade' })),
  ];
  r.descricao = [
    pagos.length ? `${pagos.length} período(s) quitado(s) integralmente` : '',
    duplicados.length ? `${duplicados.length} período(s) cobrado(s) em duplicidade` : '',
  ].filter(Boolean).join(' e ') + '.';
  return fechar(r);
}

/** As três novas teses, no formato de avaliarPeca. */
export function avaliarTesesNovas({ dados }) {
  return [avaliarIlegitimidade({ dados }), avaliarNulidadeCda({ dados }), avaliarCobrancaIndevida({ dados })];
}
