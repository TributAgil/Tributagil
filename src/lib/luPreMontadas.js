// src/lib/luPreMontadas.js
//
// Perguntas pré-montadas do Lu: respondidas SÓ por código, a partir do parecer (analises.resultado) e do resumo da peça
// (analises.peca_resumo). Sem IA, sem rede, sem desconto da cota; o resultado é sempre o mesmo para o mesmo parecer.
// Cada afirmação traz uma citação [n] que aponta para o item do parecer ou da peça de onde saiu o dado.

export const LIMITE_PERGUNTAS_IA = 5;

export const GRUPOS_PRE_MONTADAS = [
  {
    grupo: 'Fundamentação legal',
    itens: [
      { id: 'conclusao', pergunta: 'Qual a conclusão do parecer e com que confiança?' },
      { id: 'fundamento', pergunta: 'Qual o fundamento legal de cada conclusão?' },
      { id: 'prazo', pergunta: 'Como foi calculado o prazo?' },
    ],
  },
  {
    grupo: 'Conferência de dados',
    itens: [
      { id: 'datas', pergunta: 'Quais datas sustentam o cálculo?' },
      { id: 'linha_tempo', pergunta: 'Mostre a linha do tempo do caso.' },
      { id: 'doc_citacao', pergunta: 'Em que documento consta a data de citação?' },
      { id: 'doc_ajuizamento', pergunta: 'Em que documento consta o ajuizamento da execução?' },
      { id: 'doc_notificacao', pergunta: 'Em que documento consta a notificação do lançamento?' },
      { id: 'doc_inscricao', pergunta: 'Em que documento consta a inscrição em dívida ativa?' },
      { id: 'confirmar', pergunta: 'Há algum dado que precisa ser confirmado?' },
    ],
  },
  {
    grupo: 'Estratégia processual',
    itens: [
      { id: 'riscos', pergunta: 'Existe risco ou ponto de atenção?' },
      { id: 'proximos', pergunta: 'Quais os próximos passos?' },
    ],
  },
  {
    grupo: 'Peça',
    itens: [
      { id: 'peca_pendencias', pergunta: 'O que falta preencher na peça?' },
      { id: 'peca_modelo', pergunta: 'Qual modelo de peça foi usado e por quê?' },
    ],
  },
];

// Sugestões que chamam a IA (cada uma gasta 1 das LIMITE_PERGUNTAS_IA perguntas da consulta)
export const SUGESTOES_IA = [
  'Entre exceção de pré-executividade e embargos, qual caminho você recomenda aqui e por quê?',
  'Há tese complementar ao que o parecer concluiu, como prescrição intercorrente ou nulidade da CDA?',
  'A Fazenda pode alegar causa de interrupção ou suspensão que o parecer não considerou?',
  'Que provas ou documentos ainda reforçariam a conclusão?',
  'Explique a conclusão do parecer em linguagem simples, para o cliente.',
];

const MSG_SEM_PECA = 'Nenhuma peça foi gerada para esta consulta ainda. Gere a peça pelo botão do resultado da análise e volte aqui.';
const ROTULO_SEVERIDADE = { favoravel: 'favorável', atencao: 'atenção', neutro: 'neutro', desfavoravel: 'desfavorável' };
const ORDEM_SEVERIDADE = { favoravel: 0, atencao: 1, desfavoravel: 2, neutro: 3 };
const CONFIANCA_BAIXA = 70;

const semAcento = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** "DD/MM/AAAA" → número comparável (AAAAMMDD); inválida vai para o fim. */
function chaveData(data) {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(data || '').trim());
  return m ? Number(`${m[3]}${m[2]}${m[1]}`) : Number.MAX_SAFE_INTEGER;
}
const porData = (a, b) => chaveData(a.data) - chaveData(b.data) || (a.id ?? 0) - (b.id ?? 0);

/** "2026-10-23T17:00:00.000Z" → "23/10/2026" (sem depender de fuso) */
function dataBr(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '';
}

function criarCitador() {
  const fontes = [];
  return {
    fontes,
    citar(fonte) {
      const limpa = Object.fromEntries(Object.entries(fonte).filter(([, v]) => v !== undefined && v !== null && v !== ''));
      fontes.push({ n: fontes.length + 1, ...limpa });
      return `[${fontes.length}]`;
    },
  };
}

const conclusoesOrdenadas = (r) =>
  [...(r.conclusoes || [])].sort((a, b) => (ORDEM_SEVERIDADE[a.severidade] ?? 9) - (ORDEM_SEVERIDADE[b.severidade] ?? 9));

const fonteConclusao = (x) => ({ tipo: 'parecer', rotulo: `Parecer, conclusão ${x.id}` });
const fonteFato = (f) => ({ tipo: 'parecer', rotulo: `Parecer, fato ${f.id}`, documento: f.fonte });
const pecasDoResumo = (p) => (Array.isArray(p?.pecas) ? p.pecas : []);

function linhaFato(f, c) {
  const doc = f.fonte ? ` (documento: ${f.fonte})` : '';
  return `${f.data}: ${f.descricao}${doc} ${c.citar(fonteFato(f))}`;
}

function respostaDocumento(r, c, { marco, regex }) {
  const achados = (r.fatos_importantes || []).filter((f) => regex.test(semAcento(f.descricao))).sort(porData);
  if (achados.length === 0) return { linhas: [`O parecer não registra ${marco}. Confira nos documentos do caso.`] };
  return {
    linhas: achados.map(
      (f) => `${marco[0].toUpperCase()}${marco.slice(1)} consta em ${f.fonte || 'documento não indicado'}, em ${f.data}: ${f.descricao} ${c.citar(fonteFato(f))}`,
    ),
  };
}

const RESPOSTAS = {
  conclusao: (r, _p, c) => {
    const lista = conclusoesOrdenadas(r);
    if (lista.length === 0) return { linhas: ['O parecer não registra conclusões.'] };
    const linhas = lista.map((x) => {
      const conf = Number.isFinite(x.confianca) ? `, confiança ${x.confianca}%` : '';
      return `${x.titulo} (${ROTULO_SEVERIDADE[x.severidade] || x.severidade}${conf}): ${x.resumo} ${c.citar(fonteConclusao(x))}`;
    });
    if (r.alerta_dados_insuficientes) linhas.push(`Atenção: ${r.alerta_dados_insuficientes}`);
    return { linhas };
  },

  fundamento: (r, _p, c) => {
    const linhas = conclusoesOrdenadas(r).map((x) => `${x.titulo}: ${x.fundamento_legal} ${c.citar(fonteConclusao(x))}`);
    for (const x of r.raciocinio || []) {
      if (x.referencia) linhas.push(`Raciocínio ${x.id}: ${x.referencia} ${c.citar({ tipo: 'parecer', rotulo: `Parecer, raciocínio ${x.id}` })}`);
    }
    return { linhas: linhas.length ? linhas : ['O parecer não traz fundamento legal registrado.'] };
  },

  prazo: (r, _p, c) => {
    const itens = r.raciocinio || [];
    if (itens.length === 0) return { linhas: ['O parecer não traz o raciocínio do cálculo do prazo.'] };
    return {
      linhas: itens.map(
        (x) =>
          `Regra: ${x.premissa} Aplicação: ${x.aplicacao} Conclusão: ${x.conclusao_logica}${x.referencia ? ` (${x.referencia})` : ''} ${c.citar({ tipo: 'parecer', rotulo: `Parecer, raciocínio ${x.id}` })}`,
      ),
    };
  },

  datas: (r, _p, c) => {
    const todos = r.fatos_importantes || [];
    const chave = todos.filter((f) => f.relevancia === 'critica' || f.relevancia === 'alta');
    const usados = [...(chave.length ? chave : todos)].sort(porData);
    if (usados.length === 0) return { linhas: ['O parecer não registra datas.'] };
    return { linhas: usados.map((f) => linhaFato(f, c)) };
  },

  linha_tempo: (r, _p, c) => {
    const todos = [...(r.fatos_importantes || [])].sort(porData);
    if (todos.length === 0) return { linhas: ['O parecer não registra fatos datados.'] };
    return { linhas: todos.map((f) => linhaFato(f, c)) };
  },

  doc_citacao: (r, _p, c) => respostaDocumento(r, c, { marco: 'a citação do executado', regex: /citacao/ }),
  doc_ajuizamento: (r, _p, c) => respostaDocumento(r, c, { marco: 'o ajuizamento da execução', regex: /ajuiza/ }),
  doc_notificacao: (r, _p, c) => respostaDocumento(r, c, { marco: 'a notificação do lançamento', regex: /notifica/ }),
  doc_inscricao: (r, _p, c) => respostaDocumento(r, c, { marco: 'a inscrição em dívida ativa', regex: /inscricao/ }),

  confirmar: (r, p, c) => {
    const linhas = [];
    if (r.alerta_dados_insuficientes) linhas.push(r.alerta_dados_insuficientes);
    for (const x of conclusoesOrdenadas(r)) {
      if (Number.isFinite(x.confianca) && x.confianca < CONFIANCA_BAIXA) {
        linhas.push(`${x.titulo}: confiança de ${x.confianca}%, vale conferir os dados que a sustentam ${c.citar(fonteConclusao(x))}`);
      }
    }
    for (const peca of pecasDoResumo(p)) {
      if (peca.campos_preencher > 0 || peca.a_confirmar > 0 || peca.figuras > 0) {
        linhas.push(
          `Peça (${peca.modelo}): ${peca.campos_preencher || 0} campo(s) a preencher, ${peca.a_confirmar || 0} a confirmar, ${peca.figuras || 0} figura(s) ${c.citar({ tipo: 'peca', rotulo: `Resumo da peça, ${peca.modelo}` })}`,
        );
      }
    }
    return { linhas: linhas.length ? linhas : ['O parecer não aponta dado pendente de confirmação.'] };
  },

  riscos: (r, _p, c) => {
    const alvo = conclusoesOrdenadas(r).filter(
      (x) => x.severidade === 'atencao' || x.severidade === 'desfavoravel' || x.tipo === 'cautela' || x.tipo === 'suspensao_ativa',
    );
    if (alvo.length === 0) return { linhas: ['Nenhum ponto de atenção registrado no parecer.'] };
    return { linhas: alvo.map((x) => `${x.titulo} (${ROTULO_SEVERIDADE[x.severidade] || x.severidade}): ${x.resumo} ${c.citar(fonteConclusao(x))}`) };
  },

  proximos: (r, _p, c) => {
    const itens = r.recomendacoes || [];
    if (itens.length === 0) return { linhas: ['O parecer não traz recomendações para este caso.'] };
    return { linhas: itens.map((t, i) => `${i + 1}. ${t} ${c.citar({ tipo: 'parecer', rotulo: `Parecer, recomendação ${i + 1}` })}`) };
  },

  peca_pendencias: (_r, p, c) => {
    const pecas = pecasDoResumo(p);
    if (pecas.length === 0) return { linhas: [MSG_SEM_PECA], semPeca: true };
    const linhas = [];
    for (const peca of pecas) {
      linhas.push(
        `${peca.modelo} (${peca.tese}): ${peca.campos_preencher || 0} campo(s) a preencher, ${peca.a_confirmar || 0} trecho(s) a confirmar e ${peca.figuras || 0} figura(s) a anexar ${c.citar({ tipo: 'peca', rotulo: `Resumo da peça, ${peca.modelo}` })}`,
      );
      for (const aviso of peca.avisos || []) linhas.push(aviso);
    }
    return { linhas };
  },

  peca_modelo: (_r, p, c) => {
    const pecas = pecasDoResumo(p);
    if (pecas.length === 0) return { linhas: [MSG_SEM_PECA], semPeca: true };
    const data = dataBr(p.gerada_em);
    return {
      linhas: pecas.map((peca) =>
        `${peca.modelo}, tese de ${peca.tese}. ${peca.descricao || ''} Data de referência: ${peca.data_referencia || 'não informada'}.${data ? ` Gerada em ${data}.` : ''} ${c.citar({ tipo: 'peca', rotulo: `Resumo da peça, ${peca.modelo}` })}`.replace(/\s{2,}/g, ' '),
      ),
    };
  },
};

/**
 * @param {string} id  id do catálogo
 * @param {{ resultado: object, pecaResumo?: object|null }} dados  parecer salvo e resumo da peça
 * @returns {{ texto: string, fontes: object[], semPeca: boolean }}
 */
export function responderPreMontada(id, { resultado, pecaResumo = null } = {}) {
  const resposta = RESPOSTAS[id];
  if (!resposta) return { texto: 'Pergunta não reconhecida.', fontes: [], semPeca: false };
  const citador = criarCitador();
  const r = resposta(resultado || {}, pecaResumo, citador);
  return { texto: r.linhas.join('\n'), fontes: citador.fontes, semPeca: Boolean(r.semPeca) };
}
