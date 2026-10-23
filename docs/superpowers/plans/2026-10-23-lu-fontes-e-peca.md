# Lu: respostas com fonte conferida e ligação ao parecer e à peça, plano de implementação

> **Para quem executa:** use superpowers:subagent-driven-development (recomendado) ou superpowers:executing-plans. Os passos usam caixas `- [ ]`.

**Objetivo:** o Lu responde 14 perguntas pré-montadas por código (sem IA, sem cota), responde perguntas livres com IA (cota de 5) com citações numeradas conferidas em código, e passa a conhecer o parecer e o resumo da última peça.

**Arquitetura:** a lógica nova fica em três módulos puros e testáveis (`src/lib/luPreMontadas.js`, `api/_lu-contexto.js`, `api/_lu-citacoes.js`). `api/lu.js` os orquestra e passa a usar `chamarGemini`. A tela (`ChatLu.jsx`) ganha o catálogo, as fontes clicáveis e o aviso de peça ausente. O resumo da peça é gravado pelo navegador em `analises.peca_resumo` logo após a geração.

**Stack:** React 19, Vite, Vercel Functions (Node), Supabase (RLS), Gemini, pdf.js (já existente), vitest.

**Especificação:** `docs/superpowers/specs/2026-10-23-lu-fontes-e-peca-design.md`

## Restrições globais

- Branch `feat/lu-novo`. Nunca fazer push na main.
- Nunca rodar `npm install` ou `yarn install` dentro do projeto. Testes rodam com junctions temporárias para `scratchpad\devenv\node_modules`, removidas no fim (use `[System.IO.Directory]::Delete(caminho)` em cada junction, nunca `Remove-Item -Recurse`).
- A migração do banco (`peca_resumo` e cota 5) é só escrita em arquivo `.sql`. Rodar em produção só com autorização expressa do Luan.
- Cota de perguntas com IA: 5 por consulta. Perguntas pré-montadas não contam.
- Texto escrito pelo sistema segue o jusmanizer: sem travessão, sem dois-pontos de emenda, sem "não apenas X, mas Y", sem gerúndio de fecho.
- Commits pequenos, em português sem acento, com o trailer `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`. Mensagem gravada em arquivo UTF-8 sem BOM.
- Nunca imprimir chaves de API.
- O texto jurídico dos modelos de peça não é alterado nem guardado em lugar nenhum.

## Mapa de arquivos

| Arquivo | Ação | Responsabilidade |
|---|---|---|
| `src/lib/luPreMontadas.js` | criar | catálogo, sugestões de IA e respostas por código (puro) |
| `api/_lu-citacoes.js` | criar | conferir e renumerar citações `[D1]`, `[P2]`… (puro) |
| `api/_lu-contexto.js` | criar | montar blocos numerados e texto de contexto (puro) |
| `api/lu.js` | modificar | orquestração: cota 5, contexto, `chamarGemini`, citações |
| `src/lib/peca.js` | modificar | `resumoParaLu`, `salvarResumoPeca` |
| `src/lib/analises.js` | modificar | cota limitada a 5, `buscarPecaResumoLu` |
| `src/components/ModalGerarPeca.jsx` | modificar | gravar o resumo depois de gerar |
| `src/components/VisorFonte.jsx` | criar | abre o documento citado na página certa |
| `src/components/ChatLu.jsx` | modificar | catálogo, fontes clicáveis, aviso de peça ausente, cota 5 |
| `src/pages/ResultadoAnalise.jsx`, `src/components/ChatLuFlutuante.jsx` | modificar | passar o `resultado` ao chat |
| `docs/migracoes/2026-10-23-lu-peca-resumo-e-cota-5.sql` | criar | migração (não executada) |
| `tests/lu-pre-montadas.test.js`, `tests/lu-citacoes.test.js`, `tests/lu-contexto.test.js`, `tests/lu-api.test.js`, `tests/lu-peca-resumo.test.js` | criar | testes |
| `README.md`, spec | modificar | documentação |

Formato do resumo da peça (`analises.peca_resumo`), usado por todas as tarefas:

```json
{
  "gerada_em": "2026-10-23T17:00:00.000Z",
  "pecas": [
    {
      "modelo": "Exceção de pré-executividade",
      "tese": "Prescrição ordinária",
      "descricao": "texto curto de descreverPeca",
      "data_referencia": "11/10/2026",
      "campos_preencher": 3,
      "figuras": 4,
      "a_confirmar": 1,
      "avisos": ["texto"]
    }
  ]
}
```

Formato de uma fonte devolvida à tela (`fontes[]`), igual para respostas pré-montadas e de IA:

```json
{ "n": 1, "tipo": "documento|parecer|peca|legislacao", "rotulo": "texto curto", "documento": "cda.pdf", "pagina": 3, "storage_path": "u/c/cda.pdf", "norma": "CTN", "identificador": "art. 174", "trecho": "até 280 caracteres" }
```

---

### Task 1: Respostas pré-montadas por código

**Files:**
- Create: `src/lib/luPreMontadas.js`
- Test: `tests/lu-pre-montadas.test.js`

**Interfaces:**
- Produces: `LIMITE_PERGUNTAS_IA = 5`; `GRUPOS_PRE_MONTADAS: Array<{grupo: string, itens: Array<{id: string, pergunta: string}>}>`; `SUGESTOES_IA: string[]` (5 itens); `responderPreMontada(id: string, { resultado, pecaResumo }): { texto: string, fontes: Fonte[], semPeca: boolean }`. O texto traz marcadores `[1]`, `[2]` que apontam para `fontes[n-1]`.

- [ ] **Step 1: Escrever o teste que falha**

```js
// tests/lu-pre-montadas.test.js
import { describe, it, expect } from 'vitest';
import { GRUPOS_PRE_MONTADAS, SUGESTOES_IA, LIMITE_PERGUNTAS_IA, responderPreMontada } from '../src/lib/luPreMontadas.js';

const RESULTADO = {
  alerta_dados_insuficientes: '',
  conclusoes: [
    { id: 1, tipo: 'cautela', severidade: 'atencao', titulo: 'Possível suspensão por parcelamento', resumo: 'Há parcelamento deferido em 2019.', fundamento_legal: 'Art. 151, VI, do CTN', confianca: 60 },
    { id: 2, tipo: 'prescricao', severidade: 'favoravel', titulo: 'Prescrição ordinária consumada', resumo: 'Mais de cinco anos entre a constituição e o ajuizamento.', fundamento_legal: 'Art. 174 do CTN', confianca: 90 },
  ],
  fatos_importantes: [
    { id: 2, categoria: 'processual', data: '20/09/2025', descricao: 'Ajuizamento da execução fiscal', fonte: 'execucao.pdf', relevancia: 'critica' },
    { id: 1, categoria: 'tributaria', data: '30/04/2017', descricao: 'Vencimento do tributo', fonte: 'cda.pdf', relevancia: 'critica' },
    { id: 3, categoria: 'processual', data: '10/11/2025', descricao: 'Citação do executado', fonte: 'execucao.pdf', relevancia: 'media' },
    { id: 4, categoria: 'tributaria', data: '15/01/2018', descricao: 'Inscrição em dívida ativa', fonte: 'cda.pdf', relevancia: 'alta' },
  ],
  raciocinio: [
    { id: 1, premissa: 'O prazo é de cinco anos (art. 174 do CTN).', aplicacao: 'Constituição em 30/04/2017 e ajuizamento em 20/09/2025.', conclusao_logica: 'O prazo se esgotou em 30/04/2022.', referencia: 'CTN art. 174' },
  ],
  recomendacoes: ['Opor exceção de pré-executividade.', 'Juntar o extrato de parcelamento.'],
};

const PECA = {
  gerada_em: '2026-10-23T17:00:00.000Z',
  pecas: [{ modelo: 'Exceção de pré-executividade', tese: 'Prescrição ordinária', descricao: 'Prescrição de dois períodos.', data_referencia: '11/10/2026', campos_preencher: 3, figuras: 4, a_confirmar: 1, avisos: ['Confira a data da citação.'] }],
};

const citados = (r) => [...r.texto.matchAll(/\[(\d+)\]/g)].map((m) => Number(m[1]));

describe('catálogo', () => {
  it('tem as quatro frentes e ids únicos', () => {
    expect(GRUPOS_PRE_MONTADAS.map((g) => g.grupo)).toEqual(['Fundamentação legal', 'Conferência de dados', 'Estratégia processual', 'Peça']);
    const ids = GRUPOS_PRE_MONTADAS.flatMap((g) => g.itens.map((i) => i.id));
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.length).toBe(14);
  });
  it('tem 5 sugestões de IA e a cota é 5', () => {
    expect(SUGESTOES_IA).toHaveLength(5);
    expect(LIMITE_PERGUNTAS_IA).toBe(5);
  });
  it('todo id do catálogo tem resposta, sem rede, mesmo com parecer vazio', () => {
    for (const g of GRUPOS_PRE_MONTADAS) for (const i of g.itens) {
      const r = responderPreMontada(i.id, { resultado: {}, pecaResumo: null });
      expect(typeof r.texto, i.id).toBe('string');
      expect(r.texto.length, i.id).toBeGreaterThan(0);
    }
  });
});

describe('respostas', () => {
  it('conclusão: favorável primeiro, com confiança e citação', () => {
    const r = responderPreMontada('conclusao', { resultado: RESULTADO });
    expect(r.texto.split('\n')[0]).toContain('Prescrição ordinária consumada (favorável, confiança 90%)');
    expect(r.fontes[0]).toMatchObject({ n: 1, tipo: 'parecer', rotulo: 'Parecer, conclusão 2' });
    expect(citados(r)).toEqual([1, 2]);
  });
  it('fundamento legal: conclusões e referências do raciocínio', () => {
    const r = responderPreMontada('fundamento', { resultado: RESULTADO });
    expect(r.texto).toContain('Art. 174 do CTN');
    expect(r.texto).toContain('CTN art. 174');
    expect(r.fontes.some((f) => f.rotulo === 'Parecer, raciocínio 1')).toBe(true);
  });
  it('prazo: regra, aplicação e conclusão do raciocínio', () => {
    const r = responderPreMontada('prazo', { resultado: RESULTADO });
    expect(r.texto).toContain('Regra: O prazo é de cinco anos');
    expect(r.texto).toContain('Aplicação: Constituição em 30/04/2017');
    expect(r.texto).toContain('Conclusão: O prazo se esgotou em 30/04/2022.');
  });
  it('datas: só relevância crítica e alta, em ordem cronológica, com documento', () => {
    const r = responderPreMontada('datas', { resultado: RESULTADO });
    const linhas = r.texto.split('\n');
    expect(linhas).toHaveLength(3);
    expect(linhas[0]).toContain('30/04/2017');
    expect(linhas[1]).toContain('15/01/2018');
    expect(linhas[2]).toContain('20/09/2025');
    expect(r.texto).not.toContain('Citação do executado');
    expect(r.fontes[0]).toMatchObject({ tipo: 'parecer', documento: 'cda.pdf' });
  });
  it('linha do tempo: todos os fatos em ordem de data', () => {
    const r = responderPreMontada('linha_tempo', { resultado: RESULTADO });
    const datas = r.texto.split('\n').map((l) => l.slice(0, 10));
    expect(datas).toEqual(['30/04/2017', '15/01/2018', '20/09/2025', '10/11/2025']);
  });
  it('em que documento consta a citação', () => {
    const r = responderPreMontada('doc_citacao', { resultado: RESULTADO });
    expect(r.texto).toContain('execucao.pdf');
    expect(r.texto).toContain('10/11/2025');
    expect(r.fontes[0].documento).toBe('execucao.pdf');
  });
  it('marco ausente: diz que o parecer não registra', () => {
    const r = responderPreMontada('doc_notificacao', { resultado: RESULTADO });
    expect(r.texto).toContain('não registra');
    expect(r.fontes).toHaveLength(0);
  });
  it('riscos: atenção e cautela; sem nenhum, diz isso', () => {
    expect(responderPreMontada('riscos', { resultado: RESULTADO }).texto).toContain('Possível suspensão por parcelamento');
    expect(responderPreMontada('riscos', { resultado: { conclusoes: [{ id: 1, tipo: 'prescricao', severidade: 'favoravel', titulo: 't', resumo: 'r', fundamento_legal: 'f', confianca: 90 }] } }).texto).toContain('Nenhum ponto de atenção');
  });
  it('confirmar: confiança baixa, alerta e pendências da peça', () => {
    const r = responderPreMontada('confirmar', { resultado: { ...RESULTADO, alerta_dados_insuficientes: '[ALERTA DE DADOS INSUFICIENTES] Informar a data da citação.' }, pecaResumo: PECA });
    expect(r.texto).toContain('Informar a data da citação');
    expect(r.texto).toContain('confiança de 60%');
    expect(r.texto).toContain('3 campo(s) a preencher');
    expect(r.fontes.some((f) => f.tipo === 'peca')).toBe(true);
  });
  it('próximos passos: recomendações numeradas', () => {
    const r = responderPreMontada('proximos', { resultado: RESULTADO });
    expect(r.texto.split('\n')).toEqual(['1. Opor exceção de pré-executividade. [1]', '2. Juntar o extrato de parcelamento. [2]']);
  });
});

describe('peça', () => {
  it('sem peça: avisa e marca semPeca', () => {
    for (const id of ['peca_pendencias', 'peca_modelo']) {
      const r = responderPreMontada(id, { resultado: RESULTADO, pecaResumo: null });
      expect(r.semPeca, id).toBe(true);
      expect(r.texto, id).toContain('Nenhuma peça foi gerada');
    }
  });
  it('com peça: pendências e modelo', () => {
    const p = responderPreMontada('peca_pendencias', { resultado: RESULTADO, pecaResumo: PECA });
    expect(p.semPeca).toBe(false);
    expect(p.texto).toContain('3 campo(s) a preencher');
    expect(p.texto).toContain('4 figura(s)');
    expect(p.texto).toContain('Confira a data da citação.');
    const m = responderPreMontada('peca_modelo', { resultado: RESULTADO, pecaResumo: PECA });
    expect(m.texto).toContain('Exceção de pré-executividade');
    expect(m.texto).toContain('23/10/2026');
  });
});

describe('estilo', () => {
  it('nenhuma resposta usa travessão', () => {
    for (const g of GRUPOS_PRE_MONTADAS) for (const i of g.itens) {
      const r = responderPreMontada(i.id, { resultado: RESULTADO, pecaResumo: PECA });
      expect(r.texto, i.id).not.toMatch(/[—–]/);
    }
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node node_modules\vitest\vitest.mjs run -c vitest.pecas.config.js tests/lu-pre-montadas.test.js`
Expected: FAIL, módulo `luPreMontadas.js` não existe.

- [ ] **Step 3: Implementar**

```js
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
    const usados = (chave.length ? chave : todos).sort(porData);
    if (usados.length === 0) return { linhas: ['O parecer não registra datas.'] };
    return { linhas: usados.map((f) => linhaFato(f, c)) };
  },

  linha_tempo: (r, _p, c) => {
    const todos = [...(r.fatos_importantes || [])].sort(porData);
    if (todos.length === 0) return { linhas: ['O parecer não registra fatos datados.'] };
    return { linhas: todos.map((f) => linhaFato(f, c)) };
  },

  doc_citacao: (r, _p, c) => respostaDocumento(r, c, { marco: 'a citação do executado', regex: /cita[cç][aã]o|citacao/ }),
  doc_ajuizamento: (r, _p, c) => respostaDocumento(r, c, { marco: 'o ajuizamento da execução', regex: /ajuiza/ }),
  doc_notificacao: (r, _p, c) => respostaDocumento(r, c, { marco: 'a notificação do lançamento', regex: /notifica/ }),
  doc_inscricao: (r, _p, c) => respostaDocumento(r, c, { marco: 'a inscrição em dívida ativa', regex: /inscri[cç][aã]o|inscricao/ }),

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
    return {
      linhas: pecas.map((peca) => {
        const data = dataBr(p.gerada_em);
        return `${peca.modelo}, tese de ${peca.tese}. ${peca.descricao || ''} Data de referência: ${peca.data_referencia || 'não informada'}.${data ? ` Gerada em ${data}.` : ''} ${c.citar({ tipo: 'peca', rotulo: `Resumo da peça, ${peca.modelo}` })}`.replace(/\s{2,}/g, ' ');
      }),
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
```

- [ ] **Step 4: Rodar e ver passar**

Run: `node node_modules\vitest\vitest.mjs run -c vitest.pecas.config.js tests/lu-pre-montadas.test.js`
Expected: todos passam. Se algum texto exato divergir (espaços, ordem), ajuste a implementação ao teste, não o contrário.

- [ ] **Step 5: Commit**

```bash
git add src/lib/luPreMontadas.js tests/lu-pre-montadas.test.js
git commit -F <arquivo-com-mensagem>   # "Lu: perguntas pre-montadas respondidas por codigo"
```

---

### Task 2: Conferência das citações

**Files:**
- Create: `api/_lu-citacoes.js`
- Test: `tests/lu-citacoes.test.js`

**Interfaces:**
- Produces: `conferirCitacoes(texto: string, blocos: Array<{id: string}>): { texto: string, usados: object[], semFonte: boolean }`. Troca `[D1]`, `[P2]`, `[A1]`, `[L3]` (e grupos como `[D1, P2]`) por `[1]`, `[2]` na ordem de aparição; remove identificadores que não existem em `blocos`; `usados` são os blocos citados, na ordem dos números.

- [ ] **Step 1: Teste que falha**

```js
// tests/lu-citacoes.test.js
import { describe, it, expect } from 'vitest';
import { conferirCitacoes } from '../api/_lu-citacoes.js';

const BLOCOS = [{ id: 'D1' }, { id: 'D2' }, { id: 'P1' }, { id: 'L1' }];

describe('conferirCitacoes', () => {
  it('renumera por ordem de aparição e devolve os blocos usados', () => {
    const r = conferirCitacoes('A citação ocorreu em 2025 [P1]. O prazo é de cinco anos [L1], conforme a CDA [D2].', BLOCOS);
    expect(r.texto).toBe('A citação ocorreu em 2025 [1]. O prazo é de cinco anos [2], conforme a CDA [3].');
    expect(r.usados.map((b) => b.id)).toEqual(['P1', 'L1', 'D2']);
    expect(r.semFonte).toBe(false);
  });
  it('mesma fonte citada duas vezes mantém o mesmo número', () => {
    const r = conferirCitacoes('Primeiro [D1]. Depois de novo [D1], e outra [D2].', BLOCOS);
    expect(r.texto).toBe('Primeiro [1]. Depois de novo [1], e outra [2].');
    expect(r.usados).toHaveLength(2);
  });
  it('remove identificador inventado', () => {
    const r = conferirCitacoes('Fato real [D1] e fato inventado [D9].', BLOCOS);
    expect(r.texto).toBe('Fato real [1] e fato inventado.');
    expect(r.usados.map((b) => b.id)).toEqual(['D1']);
  });
  it('grupo com identificador válido e inválido mantém só o válido', () => {
    const r = conferirCitacoes('Duas fontes [D1, X7].', BLOCOS);
    expect(r.texto).toBe('Duas fontes [1].');
  });
  it('grupo com vários válidos vira vários números', () => {
    const r = conferirCitacoes('Duas fontes [D1, P1].', BLOCOS);
    expect(r.texto).toBe('Duas fontes [1][2].');
  });
  it('aceita minúscula', () => {
    expect(conferirCitacoes('Texto [d1].', BLOCOS).texto).toBe('Texto [1].');
  });
  it('sem nenhuma citação válida marca semFonte', () => {
    const r = conferirCitacoes('Resposta sem fonte nenhuma.', BLOCOS);
    expect(r.semFonte).toBe(true);
    expect(r.usados).toEqual([]);
    const s = conferirCitacoes('Só inventada [D9].', BLOCOS);
    expect(s.semFonte).toBe(true);
    expect(s.texto).toBe('Só inventada.');
  });
  it('não mexe em colchetes que não são citação', () => {
    expect(conferirCitacoes('Veja o art. 174 [parágrafo único] e [D1].', BLOCOS).texto).toBe('Veja o art. 174 [parágrafo único] e [1].');
  });
  it('texto vazio', () => {
    expect(conferirCitacoes('', BLOCOS)).toMatchObject({ texto: '', semFonte: true });
    expect(conferirCitacoes(undefined, BLOCOS).texto).toBe('');
  });
});
```

- [ ] **Step 2: Rodar, ver falhar** (`node node_modules\vitest\vitest.mjs run -c vitest.pecas.config.js tests/lu-citacoes.test.js`; esperado: módulo ausente).

- [ ] **Step 3: Implementar**

```js
// api/_lu-citacoes.js
//
// Conferência das citações da resposta do Lu. O modelo cita os blocos de contexto pelos identificadores que recebeu
// ([D1] documento, [P2] parecer, [A1] peça, [L3] legislação). O código aceita só identificador que existe, apaga o
// inventado e renumera por ordem de aparição ([1], [2]…), que é o que a tela mostra ao lado da lista de fontes.
//
// Arquivo com prefixo "_": a Vercel não o expõe como endpoint.

const ID = '[DPAL]\\d+';
const GRUPO = new RegExp(`\\[\\s*(${ID}(?:\\s*[,;]\\s*${ID})*)\\s*\\]`, 'gi');

/**
 * @param {string} texto
 * @param {Array<{id: string}>} blocos  os blocos que foram enviados ao modelo
 * @returns {{ texto: string, usados: object[], semFonte: boolean }}
 */
export function conferirCitacoes(texto, blocos) {
  const porId = new Map(blocos.map((b) => [b.id, b]));
  const ordem = [];
  const numero = (id) => {
    let i = ordem.indexOf(id);
    if (i < 0) {
      ordem.push(id);
      i = ordem.length - 1;
    }
    return i + 1;
  };
  const limpo = String(texto || '')
    .replace(GRUPO, (_, grupo) => {
      const ids = grupo.split(/[,;]/).map((s) => s.trim().toUpperCase());
      const validos = [...new Set(ids.filter((id) => porId.has(id)))];
      return validos.map((id) => `[${numero(id)}]`).join('');
    })
    .replace(/[ \t]+([.,;:])/g, '$1')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
  const usados = ordem.map((id) => porId.get(id));
  return { texto: limpo, usados, semFonte: usados.length === 0 };
}
```

- [ ] **Step 4: Rodar, ver passar.**
- [ ] **Step 5: Commit** ("Lu: conferencia das citacoes em codigo").

---

### Task 3: Contexto numerado (parecer, peça, documentos, legislação)

**Files:**
- Create: `api/_lu-contexto.js`
- Test: `tests/lu-contexto.test.js`

**Interfaces:**
- Consumes: formato do parecer (`resultado`) e do resumo da peça (ver "Formato do resumo da peça").
- Produces: `montarContextoLu({ docs, legislacao, resultado, pecaResumo }): { blocos: Bloco[], texto: string, temFonteDoCaso: boolean }` onde `Bloco = { id, tipo: 'documento'|'parecer'|'peca'|'legislacao', rotulo, texto, documento?, pagina?, storage_path?, norma?, identificador? }`; `fonteParaCliente(bloco, n): Fonte` (formato de fonte devolvido à tela, com `trecho` de até 280 caracteres).

- [ ] **Step 1: Teste que falha**

```js
// tests/lu-contexto.test.js
import { describe, it, expect } from 'vitest';
import { montarContextoLu, fonteParaCliente } from '../api/_lu-contexto.js';

const RESULTADO = {
  conclusoes: [{ id: 1, tipo: 'prescricao', severidade: 'favoravel', titulo: 'Prescrição consumada', resumo: 'Mais de cinco anos.', fundamento_legal: 'Art. 174 do CTN', confianca: 90 }],
  fatos_importantes: [{ id: 1, categoria: 'processual', data: '20/09/2025', descricao: 'Ajuizamento', fonte: 'cda.pdf', relevancia: 'critica' }],
  raciocinio: [{ id: 1, premissa: 'Prazo de cinco anos.', aplicacao: 'Datas.', conclusao_logica: 'Esgotado.', referencia: 'CTN art. 174' }],
  recomendacoes: ['Opor exceção.'],
};
const DOCS = [{ documento_nome: 'cda.pdf', pagina: 2, conteudo: 'Data de vencimento 30/04/2017', storage_path: 'u/c/cda.pdf', similaridade: 0.8 }];
const LEIS = [{ norma: 'CTN', identificador: 'art. 174', texto_integral: 'A ação prescreve em cinco anos.', similaridade: 0.9 }];
const PECA = { gerada_em: '2026-10-23T17:00:00.000Z', pecas: [{ modelo: 'EPE', tese: 'Prescrição', descricao: 'Texto.', data_referencia: '11/10/2026', campos_preencher: 2, figuras: 1, a_confirmar: 0, avisos: [] }] };

describe('montarContextoLu', () => {
  it('numera os blocos por tipo e monta o texto', () => {
    const c = montarContextoLu({ docs: DOCS, legislacao: LEIS, resultado: RESULTADO, pecaResumo: PECA });
    const ids = c.blocos.map((b) => b.id);
    expect(ids).toContain('D1');
    expect(ids).toContain('L1');
    expect(ids.filter((i) => i.startsWith('P')).length).toBe(4); // conclusão, fato, raciocínio, recomendação
    expect(ids).toContain('A1');
    expect(new Set(ids).size).toBe(ids.length);
    expect(c.texto).toContain('[D1] cda.pdf, pág. 2');
    expect(c.texto).toContain('Data de vencimento 30/04/2017');
    expect(c.texto).toContain('Art. 174 do CTN');
    expect(c.temFonteDoCaso).toBe(true);
  });
  it('sem peça: avisa no texto e não cria bloco A', () => {
    const c = montarContextoLu({ docs: DOCS, legislacao: [], resultado: RESULTADO, pecaResumo: null });
    expect(c.blocos.some((b) => b.id.startsWith('A'))).toBe(false);
    expect(c.texto).toContain('Nenhuma peça foi gerada');
  });
  it('só legislação não é fonte do caso', () => {
    const c = montarContextoLu({ docs: [], legislacao: LEIS, resultado: null, pecaResumo: null });
    expect(c.temFonteDoCaso).toBe(false);
  });
  it('só o parecer já basta como fonte do caso', () => {
    const c = montarContextoLu({ docs: [], legislacao: [], resultado: RESULTADO, pecaResumo: null });
    expect(c.temFonteDoCaso).toBe(true);
  });
  it('parecer vazio ou ausente não gera blocos', () => {
    expect(montarContextoLu({ resultado: {} }).blocos).toEqual([]);
    expect(montarContextoLu({ resultado: null }).blocos).toEqual([]);
  });
  it('texto longo de um bloco é cortado', () => {
    const c = montarContextoLu({ docs: [{ documento_nome: 'x.pdf', pagina: 1, conteudo: 'a'.repeat(5000) }], resultado: null });
    expect(c.blocos[0].texto.length).toBeLessThanOrEqual(1500);
  });
});

describe('fonteParaCliente', () => {
  it('documento leva nome, página e caminho; trecho com no máximo 280 caracteres', () => {
    const c = montarContextoLu({ docs: [{ ...DOCS[0], conteudo: 'b'.repeat(900) }] });
    const f = fonteParaCliente(c.blocos[0], 1);
    expect(f).toMatchObject({ n: 1, tipo: 'documento', documento: 'cda.pdf', pagina: 2, storage_path: 'u/c/cda.pdf' });
    expect(f.trecho.length).toBe(280);
  });
  it('legislação leva norma e identificador', () => {
    const c = montarContextoLu({ legislacao: LEIS });
    expect(fonteParaCliente(c.blocos[0], 2)).toMatchObject({ n: 2, tipo: 'legislacao', norma: 'CTN', identificador: 'art. 174' });
  });
  it('parecer e peça levam o rótulo', () => {
    const c = montarContextoLu({ resultado: RESULTADO, pecaResumo: PECA });
    const p = c.blocos.find((b) => b.tipo === 'parecer');
    expect(fonteParaCliente(p, 1).rotulo).toMatch(/^Parecer, /);
    const a = c.blocos.find((b) => b.tipo === 'peca');
    expect(fonteParaCliente(a, 2).rotulo).toBe('Resumo da peça, EPE');
  });
});
```

- [ ] **Step 2: Rodar, ver falhar.**
- [ ] **Step 3: Implementar**

```js
// api/_lu-contexto.js
//
// Monta o contexto que o Lu envia ao modelo: blocos numerados por tipo ([D#] documentos do caso, [P#] parecer,
// [A#] resumo da peça, [L#] legislação). O modelo cita por esses identificadores e api/_lu-citacoes.js confere.
//
// Arquivo com prefixo "_": a Vercel não o expõe como endpoint.

const MAX_BLOCO = 1500;
const corta = (s, n = MAX_BLOCO) => String(s ?? '').slice(0, n);

/**
 * @param {{ docs?: object[], legislacao?: object[], resultado?: object|null, pecaResumo?: object|null }} args
 * @returns {{ blocos: object[], texto: string, temFonteDoCaso: boolean }}
 */
export function montarContextoLu({ docs = [], legislacao = [], resultado = null, pecaResumo = null } = {}) {
  const blocos = [];
  const contagem = {};
  const add = (prefixo, tipo, dados) => {
    contagem[prefixo] = (contagem[prefixo] || 0) + 1;
    const bloco = { id: `${prefixo}${contagem[prefixo]}`, tipo, ...dados, texto: corta(dados.texto) };
    blocos.push(bloco);
    return bloco;
  };

  for (const d of docs) {
    add('D', 'documento', {
      rotulo: `${d.documento_nome || 'documento'}, pág. ${d.pagina ?? 's/n'}`,
      texto: d.conteudo,
      documento: d.documento_nome || 'documento',
      pagina: d.pagina ?? null,
      storage_path: d.storage_path || null,
    });
  }

  const r = resultado || {};
  for (const x of r.conclusoes || []) {
    add('P', 'parecer', {
      rotulo: `Parecer, conclusão ${x.id}`,
      texto: `${x.titulo} (${x.severidade}, confiança ${x.confianca}%): ${x.resumo} Fundamento: ${x.fundamento_legal}`,
    });
  }
  for (const f of r.fatos_importantes || []) {
    add('P', 'parecer', {
      rotulo: `Parecer, fato ${f.id}`,
      texto: `${f.data}: ${f.descricao} (documento: ${f.fonte || 'não indicado'}; relevância ${f.relevancia})`,
      documento: f.fonte || undefined,
    });
  }
  for (const x of r.raciocinio || []) {
    add('P', 'parecer', {
      rotulo: `Parecer, raciocínio ${x.id}`,
      texto: `Regra: ${x.premissa} Aplicação: ${x.aplicacao} Conclusão: ${x.conclusao_logica} (${x.referencia})`,
    });
  }
  (r.recomendacoes || []).forEach((t, i) => add('P', 'parecer', { rotulo: `Parecer, recomendação ${i + 1}`, texto: t }));
  if (r.alerta_dados_insuficientes) add('P', 'parecer', { rotulo: 'Parecer, alerta', texto: r.alerta_dados_insuficientes });

  const pecas = Array.isArray(pecaResumo?.pecas) ? pecaResumo.pecas : [];
  for (const p of pecas) {
    add('A', 'peca', {
      rotulo: `Resumo da peça, ${p.modelo}`,
      texto:
        `Modelo ${p.modelo}, tese ${p.tese}. ${p.descricao || ''} Data de referência: ${p.data_referencia || 'não informada'}. ` +
        `Campos a preencher: ${p.campos_preencher || 0}. Trechos a confirmar: ${p.a_confirmar || 0}. Figuras a anexar: ${p.figuras || 0}.` +
        `${(p.avisos || []).length ? ` Avisos: ${p.avisos.join(' ')}` : ''}`,
    });
  }

  for (const l of legislacao) {
    add('L', 'legislacao', {
      rotulo: `${l.norma} ${l.identificador}`,
      texto: l.texto_integral,
      norma: l.norma,
      identificador: l.identificador,
    });
  }

  const secao = (titulo, tipo) => {
    const itens = blocos.filter((b) => b.tipo === tipo);
    return itens.length ? `--- ${titulo} ---\n${itens.map((b) => `[${b.id}] ${b.rotulo}\n${b.texto}`).join('\n\n')}\n\n` : '';
  };
  const aviso = pecas.length === 0 ? 'AVISO: nenhuma peça foi gerada para esta consulta. Se perguntarem sobre a peça, diga isso.\n\n' : '';
  const texto = (secao('PARECER DO CASO', 'parecer') + secao('RESUMO DA PEÇA', 'peca') + aviso + secao('DOCUMENTOS DO CASO', 'documento') + secao('LEGISLAÇÃO E JURISPRUDÊNCIA', 'legislacao')).trim();

  return { blocos, texto, temFonteDoCaso: blocos.some((b) => b.tipo !== 'legislacao') };
}

/** Fonte no formato que a tela mostra (numerada pela ordem de citação). */
export function fonteParaCliente(bloco, n) {
  const base = { n, tipo: bloco.tipo, rotulo: bloco.rotulo, trecho: String(bloco.texto || '').slice(0, 280) };
  if (bloco.tipo === 'documento') return { ...base, documento: bloco.documento, pagina: bloco.pagina, storage_path: bloco.storage_path };
  if (bloco.tipo === 'legislacao') return { ...base, norma: bloco.norma, identificador: bloco.identificador };
  if (bloco.documento) return { ...base, documento: bloco.documento };
  return base;
}
```

- [ ] **Step 4: Rodar, ver passar.**
- [ ] **Step 5: Commit** ("Lu: contexto numerado com parecer e resumo da peca").

---

### Task 4: Endpoint `api/lu.js` (cota 5, contexto, citações, `chamarGemini`)

**Files:**
- Modify: `api/lu.js` (constantes e prompt, leitura da análise, regra de resposta, geração, resposta)
- Test: `tests/lu-api.test.js`

**Interfaces:**
- Consumes: `montarContextoLu`, `fonteParaCliente` (Task 3), `conferirCitacoes` (Task 2), `chamarGemini`/`ErroGemini` de `api/_gemini-resiliente.js`.
- Produces: resposta JSON `{ resposta, fontes: Fonte[], semFonteConferida?: boolean, perguntasDisponiveis, limiteAtingido? }`. A cota máxima é 5 (`Math.min(valor, 5)`).

- [ ] **Step 1: Teste que falha**

```js
// tests/lu-api.test.js
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';

process.env.GEMINI_API_KEY = 'chave-de-teste';
process.env.SUPABASE_URL = 'https://abc123.supabase.co';
process.env.SUPABASE_ANON_KEY = 'anon-de-teste';
delete process.env.GEMINI_MODEL_RESERVA;

let POST;
let gemini;   // { texto } ou { status }
let analise;  // linha de analises devolvida
let docs;     // chunks de documento
let chamadasGeracao;
let rpcs;

const resp = (corpo, status = 200) => new Response(typeof corpo === 'string' ? corpo : JSON.stringify(corpo), { status });
const PARECER = {
  conclusoes: [{ id: 1, tipo: 'prescricao', severidade: 'favoravel', titulo: 'Prescrição consumada', resumo: 'Mais de cinco anos.', fundamento_legal: 'Art. 174 do CTN', confianca: 90 }],
  fatos_importantes: [], raciocinio: [], recomendacoes: [], alerta_dados_insuficientes: '',
};

beforeAll(async () => { ({ POST } = await import('../api/lu.js')); });

beforeEach(() => {
  chamadasGeracao = 0;
  rpcs = [];
  gemini = { texto: 'A prescrição se consumou [P1].' };
  analise = { perguntas_lu_disponiveis: 5, resultado: PARECER, peca_resumo: null };
  docs = [{ documento_nome: 'cda.pdf', storage_path: 'u/c/cda.pdf', pagina: 2, conteudo: 'Vencimento 30/04/2017', similaridade: 0.9 }];
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.stubGlobal('fetch', async (url) => {
    const u = String(url);
    if (u.endsWith('/auth/v1/user')) return resp({ id: 'user-1' });
    if (u.includes('/rest/v1/analises')) return resp([analise]);
    if (u.includes('/rest/v1/rpc/')) {
      const nome = u.split('/rpc/')[1];
      rpcs.push(nome);
      if (nome === 'rate_limit_checar') return resp([{ ok: true }]);
      if (nome === 'buscar_documento_chunks') return resp(docs);
      if (nome === 'buscar_legislacao_chunks') return resp([{ norma: 'CTN', identificador: 'art. 174', texto_integral: 'Cinco anos.', similaridade: 0.9 }]);
      if (nome === 'decrementar_pergunta_lu') return resp(Math.max(0, analise.perguntas_lu_disponiveis - 1));
      return new Response(null, { status: 204 });
    }
    if (u.includes(':embedContent')) return resp({ embedding: { values: new Array(768).fill(0.1) } });
    if (u.includes(':generateContent')) {
      chamadasGeracao += 1;
      if (gemini.status) return resp({ error: { status: 'INVALID_ARGUMENT', message: 'x' } }, gemini.status);
      return resp({ candidates: [{ content: { parts: [{ text: gemini.texto }] } }] });
    }
    throw new Error(`fetch inesperado: ${u}`);
  });
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

const pedir = (pergunta = 'Qual a conclusão?') =>
  POST(new Request('http://localhost/api/lu', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-forwarded-for': '8.8.8.8' },
    body: JSON.stringify({ casoId: 'c1', analiseId: 'a1', pergunta, historico: [], userToken: 'tok' }),
  }));

describe('api/lu', () => {
  it('responde com citação válida, devolve só a fonte citada e desconta 1 da cota', async () => {
    const r = await pedir();
    const j = await r.json();
    expect(r.status).toBe(200);
    expect(j.resposta).toBe('A prescrição se consumou [1].');
    expect(j.fontes).toHaveLength(1);
    expect(j.fontes[0]).toMatchObject({ n: 1, tipo: 'parecer' });
    expect(j.perguntasDisponiveis).toBe(4);
    expect(rpcs).toContain('decrementar_pergunta_lu');
  });

  it('cita documento: a fonte leva página e caminho do arquivo', async () => {
    gemini.texto = 'O vencimento foi em 30/04/2017 [D1].';
    const j = await (await pedir()).json();
    expect(j.fontes[0]).toMatchObject({ tipo: 'documento', documento: 'cda.pdf', pagina: 2, storage_path: 'u/c/cda.pdf' });
  });

  it('resposta sem citação válida: marca semFonteConferida e NÃO desconta', async () => {
    gemini.texto = 'Resposta com fonte inventada [D9].';
    const j = await (await pedir()).json();
    expect(j.semFonteConferida).toBe(true);
    expect(j.fontes).toEqual([]);
    expect(j.perguntasDisponiveis).toBe(5);
    expect(rpcs).not.toContain('decrementar_pergunta_lu');
  });

  it('sem documento mas com parecer: ainda responde', async () => {
    docs = [];
    const j = await (await pedir()).json();
    expect(chamadasGeracao).toBe(1);
    expect(j.fontes[0].tipo).toBe('parecer');
  });

  it('sem documento e sem parecer: "não sei" sem chamar o modelo e sem descontar', async () => {
    docs = [];
    analise = { perguntas_lu_disponiveis: 5, resultado: null, peca_resumo: null };
    const j = await (await pedir()).json();
    expect(chamadasGeracao).toBe(0);
    expect(j.resposta).toMatch(/Não encontrei/);
    expect(rpcs).not.toContain('decrementar_pergunta_lu');
  });

  it('cota zerada: nem chama o modelo', async () => {
    analise.perguntas_lu_disponiveis = 0;
    const j = await (await pedir()).json();
    expect(j.limiteAtingido).toBe(true);
    expect(j.resposta).toMatch(/5 perguntas/);
    expect(chamadasGeracao).toBe(0);
  });

  it('consulta antiga com mais de 5 passa a valer no máximo 5', async () => {
    analise.perguntas_lu_disponiveis = 9;
    docs = [];
    analise.resultado = null;
    const j = await (await pedir()).json();
    expect(j.perguntasDisponiveis).toBe(5);
  });

  it('erro do Gemini que repetir não resolve: 502 com mensagem clara', async () => {
    gemini = { status: 400 };
    const r = await pedir();
    expect(r.status).toBe(502);
    expect((await r.json()).error).toBeTruthy();
    expect(rpcs).not.toContain('decrementar_pergunta_lu');
  });
});
```

- [ ] **Step 2: Rodar, ver falhar** (`tests/lu-api.test.js`; esperado: falhas por `fontes` no formato antigo, cota 10, etc.).

- [ ] **Step 3: Implementar em `api/lu.js`**

Edições, na ordem do arquivo:

1. Imports: trocar o bloco de imports por

```js
import { rateLimit, ipDoRequest } from './_ratelimit.js';
import { gerarEmbedding } from './_embeddings.js';
import { chatbotLiberadoParaPerfil } from './_chatbot-acesso.js';
import { chamarGemini, ErroGemini } from './_gemini-resiliente.js';
import { montarContextoLu, fonteParaCliente } from './_lu-contexto.js';
import { conferirCitacoes } from './_lu-citacoes.js';
```

2. Constantes: acrescentar `const LIMITE_PERGUNTAS = 5;` e trocar `RESPOSTA_LIMITE_ATINGIDO` por

```js
const RESPOSTA_LIMITE_ATINGIDO =
  'Você já usou as 5 perguntas com IA disponíveis para esta consulta. As perguntas prontas continuam liberadas, e uma reanálise deste caso (nova ' +
  'consulta) dá outras 5.';
const RESPOSTA_NAO_SEI =
  'Não encontrei essa informação nos documentos nem no parecer deste caso. Não vou responder com base só na ' +
  'legislação, sem nenhuma fonte do caso relacionada. Confira diretamente nos autos ou reformule a pergunta.';
```

3. `SYSTEM_LU`: substituir as regras 4 a 7 por

```
4. Cada afirmação deve terminar com a citação do bloco de onde veio, usando EXATAMENTE o identificador do bloco entre colchetes, como [D1], [P2], [A1] ou [L3]. Para duas fontes, [D1][P2]. Nunca invente um identificador e nunca cite um bloco que não esteja no contexto.
5. Documentos do caso são os blocos [D#] (cite o documento e a página pelo identificador). O parecer são os blocos [P#]. O resumo da peça são os blocos [A#]. Legislação são os blocos [L#].
6. NÃO escreva uma seção "Fontes consultadas": a tela já mostra as fontes a partir das suas citações.
7. Se a peça não foi gerada (aviso no contexto), diga isso quando perguntarem sobre ela.
8. Nunca use travessão. Seja direto.
```

4. Substituir `lerPerguntasDisponiveis` por `lerAnalise` (uma leitura traz cota, parecer e resumo da peça; se a coluna `peca_resumo` ainda não existir, repete sem ela):

```js
async function lerAnalise({ supabaseUrl, supabaseAnonKey, userToken, analiseId }) {
  const ler = async (colunas) => {
    const resp = await fetch(
      `${supabaseUrl}/rest/v1/analises?id=eq.${encodeURIComponent(analiseId)}&select=${colunas}&limit=1`,
      { headers: { apikey: supabaseAnonKey, Authorization: `Bearer ${userToken}` } },
    );
    return resp.ok ? (await resp.json().catch(() => []))?.[0] || null : undefined;
  };
  try {
    let linha = await ler('perguntas_lu_disponiveis,resultado,peca_resumo');
    if (linha === undefined) linha = await ler('perguntas_lu_disponiveis,resultado'); // migração do resumo ainda pendente
    if (!linha) return { disponiveis: null, resultado: null, pecaResumo: null };
    const v = linha.perguntas_lu_disponiveis;
    return {
      disponiveis: Number.isFinite(v) ? Math.min(v, LIMITE_PERGUNTAS) : null,
      resultado: linha.resultado || null,
      pecaResumo: linha.peca_resumo || null,
    };
  } catch (err) {
    console.warn('[api/lu] Falha ao ler a análise:', err.message);
    return { disponiveis: null, resultado: null, pecaResumo: null };
  }
}
```

No `POST`, trocar a chamada `lerPerguntasDisponiveis(...)` por

```js
const { disponiveis: disponiveisAntes, resultado, pecaResumo } = await lerAnalise({ supabaseUrl, supabaseAnonKey, userToken, analiseId });
```

5. Regra de resposta e contexto: substituir o trecho de `docs.length === 0` até a montagem de `contextoTexto`/`fontes` por

```js
  const contexto = montarContextoLu({ docs, legislacao, resultado, pecaResumo });
  // Exige pelo menos 1 fonte do CASO (documento, parecer ou peça). Legislação sozinha não basta.
  if (!contexto.temFonteDoCaso) {
    return json({ resposta: RESPOSTA_NAO_SEI, fontes: [], perguntasDisponiveis: disponiveisAntes }, 200);
  }
```

e, em `contents`, usar `contexto.texto` no lugar de `contextoTexto`.

6. Geração: trocar o `fetch` direto por `chamarGemini`:

```js
  try {
    const { resp } = await chamarGemini({
      montarUrl: (m) => `${GEMINI}/v1beta/models/${m}:generateContent?key=${encodeURIComponent(apiKey)}`,
      corpo: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM_LU }] },
        contents,
        generationConfig: { temperature: Number.isFinite(temperatura) ? temperatura : 0.2 },
      }),
      modelo,
      rotulo: 'lu',
    });
    const data = await resp.json();
    const texto = data?.candidates?.[0]?.content?.parts?.map((p) => p?.text || '').join('') || '';
    if (!texto.trim()) return json({ error: 'A IA não retornou uma resposta. Tente reformular a pergunta.' }, 502);

    const conferida = conferirCitacoes(texto, contexto.blocos);
    const fontes = conferida.usados.map((b, i) => fonteParaCliente(b, i + 1));
    if (conferida.semFonte) {
      // Sem nenhuma citação válida: a resposta aparece marcada e NÃO desconta da cota
      return json({ resposta: conferida.texto, fontes: [], semFonteConferida: true, perguntasDisponiveis: disponiveisAntes }, 200);
    }
    const perguntasDisponiveis = await decrementarPerguntas({ supabaseUrl, supabaseAnonKey, userToken, analiseId, disponiveisAntes });
    return json({ resposta: conferida.texto, fontes, perguntasDisponiveis }, 200);
  } catch (err) {
    if (err instanceof ErroGemini) return json({ error: err.mensagemUsuario }, err.statusHttp);
    console.error('[api/lu] Erro ao gerar resposta:', err);
    return json({ error: 'Erro ao conectar com a IA.' }, 502);
  }
```

(remover o `const resp = await fetch(...)`, a checagem `!resp.ok` antiga e o trecho antigo de desconto, que passam a viver no bloco acima). Atualizar o comentário do topo do arquivo: cota de 5, parecer e peça como fontes.

- [ ] **Step 4: Rodar `tests/lu-api.test.js`, ver passar.** Depois rodar a suíte inteira para garantir que nada mais quebrou.
- [ ] **Step 5: Commit** ("Lu: cota de 5, parecer e peca como fonte, citacoes conferidas e chamarGemini").

---

### Task 5: Resumo da peça (gravar e ler) e cota no cliente

**Files:**
- Modify: `src/lib/peca.js` (acrescentar `resumoParaLu`, `salvarResumoPeca`)
- Modify: `src/lib/analises.js` (limitar cota a 5; acrescentar `buscarPecaResumoLu`)
- Modify: `src/components/ModalGerarPeca.jsx` (gravar após gerar)
- Create: `docs/migracoes/2026-10-23-lu-peca-resumo-e-cota-5.sql`
- Test: `tests/lu-peca-resumo.test.js`

**Interfaces:**
- Produces: `resumoParaLu(resposta: {pecas: Array<{status, resumo}>}, agora?: Date): { gerada_em, pecas: [...] } | null` (só peças com `status === 'ok'`; `null` se nenhuma); `salvarResumoPeca({ analiseId, resposta }): Promise<boolean>`; `buscarPecaResumoLu(analiseId): Promise<object|null>`.

- [ ] **Step 1: Teste que falha**

```js
// tests/lu-peca-resumo.test.js
import { describe, it, expect, vi } from 'vitest';
vi.mock('../src/lib/supabase', () => ({ supabase: { auth: { getSession: vi.fn() }, from: vi.fn() } }));
import { resumoParaLu } from '../src/lib/peca.js';

const RESPOSTA = {
  status: 'ok',
  pecas: [
    {
      status: 'ok',
      template: 'EPE_prescricao_ordinaria',
      resumo: { modelo: 'Exceção de pré-executividade', tese: 'Prescrição ordinária', descricao: 'Texto curto.', data_referencia: '11/10/2026', campos_preencher: 3, figuras: 4, a_confirmar: 1, avisos: ['Aviso 1'], aviso_fixo: 'x', creditos: [{ qualquer: 'coisa' }] },
      arquivo: { nome: 'a.docx', base64: 'AAAA' },
      figuras: [{ numero: 1 }],
    },
    { status: 'indisponivel', tese: 'decadencia', mensagem: 'sem modelo' },
  ],
};

describe('resumoParaLu', () => {
  it('guarda só o que o Lu precisa, sem o arquivo nem o texto dos modelos', () => {
    const r = resumoParaLu(RESPOSTA, new Date(Date.UTC(2026, 9, 23, 17)));
    expect(r.gerada_em).toBe('2026-10-23T17:00:00.000Z');
    expect(r.pecas).toEqual([{ modelo: 'Exceção de pré-executividade', tese: 'Prescrição ordinária', descricao: 'Texto curto.', data_referencia: '11/10/2026', campos_preencher: 3, figuras: 4, a_confirmar: 1, avisos: ['Aviso 1'] }]);
    expect(JSON.stringify(r)).not.toContain('base64');
  });
  it('sem peça pronta devolve null', () => {
    expect(resumoParaLu({ status: 'ok', pecas: [{ status: 'indisponivel' }] })).toBeNull();
    expect(resumoParaLu({ status: 'bloqueado' })).toBeNull();
    expect(resumoParaLu(null)).toBeNull();
  });
});
```

- [ ] **Step 2: Rodar, ver falhar.**

- [ ] **Step 3: Implementar**

Em `src/lib/peca.js`, acrescentar ao final:

```js
/**
 * Resumo da peça gerada que o Lu lê (analises.peca_resumo). Guarda só números, nomes e avisos: nunca o arquivo
 * nem o texto jurídico dos modelos.
 * @returns {{ gerada_em: string, pecas: object[] } | null}
 */
export function resumoParaLu(resposta, agora = new Date()) {
  const prontas = (resposta?.pecas || []).filter((p) => p?.status === 'ok' && p.resumo);
  if (prontas.length === 0) return null;
  return {
    gerada_em: agora.toISOString(),
    pecas: prontas.map(({ resumo: r }) => ({
      modelo: r.modelo,
      tese: r.tese,
      descricao: r.descricao || '',
      data_referencia: r.data_referencia || '',
      campos_preencher: r.campos_preencher || 0,
      figuras: r.figuras || 0,
      a_confirmar: r.a_confirmar || 0,
      avisos: Array.isArray(r.avisos) ? r.avisos : [],
    })),
  };
}

/** Grava o resumo da peça na consulta (RLS do próprio usuário). Falha silenciosa: o Lu só fica sem saber da peça. */
export async function salvarResumoPeca({ analiseId, resposta }) {
  const resumo = resumoParaLu(resposta);
  if (!analiseId || !resumo) return false;
  try {
    const { error } = await supabase.from('analises').update({ peca_resumo: resumo }).eq('id', analiseId);
    if (error) {
      console.warn('[peca] Falha ao gravar o resumo da peça para o Lu:', error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.warn('[peca] Erro ao gravar o resumo da peça para o Lu:', err);
    return false;
  }
}
```

Em `src/lib/analises.js`: no `import`s do topo acrescentar `import { LIMITE_PERGUNTAS_IA } from './luPreMontadas';`; em `buscarPerguntasLuDisponiveis` trocar o `return` final por `Number.isFinite(...) ? Math.min(data.perguntas_lu_disponiveis, LIMITE_PERGUNTAS_IA) : null`; e acrescentar

```js
/** Resumo da última peça gerada nesta consulta (analises.peca_resumo). null = nenhuma peça ou migração pendente. */
export async function buscarPecaResumoLu(analiseId) {
  if (!analiseId) return null;
  try {
    const { data, error } = await supabase.from('analises').select('peca_resumo').eq('id', analiseId).single();
    if (error) return null; // coluna ainda não existe: o Lu segue sem peça
    return data?.peca_resumo || null;
  } catch {
    return null;
  }
}
```

Em `src/components/ModalGerarPeca.jsx`, importar `salvarResumoPeca` junto de `gerarPeca` e, logo depois de `setFase('resultado')`, acrescentar

```js
    if (r.status === 'ok') salvarResumoPeca({ analiseId: analise.id, resposta: r }); // o Lu passa a conhecer a peça
```

Criar `docs/migracoes/2026-10-23-lu-peca-resumo-e-cota-5.sql` (NÃO executar):

```sql
-- Lu: resumo da última peça gerada e cota de 5 perguntas com IA por consulta.
-- Rodar em produção SÓ com autorização expressa do Luan.
alter table public.analises add column if not exists peca_resumo jsonb;
alter table public.analises alter column perguntas_lu_disponiveis set default 5;
-- consultas antigas com mais de 5 perguntas sobrando passam a ter no máximo 5 (o código já limita, isto só alinha o banco)
update public.analises set perguntas_lu_disponiveis = 5 where perguntas_lu_disponiveis > 5;
```

- [ ] **Step 4: Rodar `tests/lu-peca-resumo.test.js`, ver passar.**
- [ ] **Step 5: Commit** ("Lu: resumo da peca gravado na consulta e cota limitada a 5 no cliente").

---

### Task 6: Tela do Lu (catálogo, fontes clicáveis, aviso de peça ausente)

**Files:**
- Create: `src/components/VisorFonte.jsx`
- Modify: `src/components/ChatLu.jsx`
- Modify: `src/components/ChatLuFlutuante.jsx`, `src/pages/ResultadoAnalise.jsx` (passar `resultado`)

**Interfaces:**
- Consumes: `GRUPOS_PRE_MONTADAS`, `SUGESTOES_IA`, `LIMITE_PERGUNTAS_IA`, `responderPreMontada` (Task 1); `buscarPecaResumoLu` (Task 5); `baixarDocumentoDaAnalise` (`src/lib/figuras.js`); `abrirDocumento` (`src/lib/pdfPaginas.js`); `listarDocumentosCaso` (`src/lib/casos.js`).
- Produces: `VisorFonte({ fonte, casoId, onFechar })`; `ChatLu` com a nova prop `resultado`.

Verificação desta tarefa é no navegador (Step 3), porque é interface.

- [ ] **Step 1: `VisorFonte.jsx`** (modal que abre o documento na página citada)

```jsx
// src/components/VisorFonte.jsx
//
// Abre o documento citado numa resposta do Lu, na página da fonte, com o trecho ao lado. O caminho do arquivo vem da
// fonte (resposta de IA) ou é descoberto pelo nome do documento (fonte do parecer). pdf.js carrega sob demanda.
import React, { useEffect, useRef, useState } from 'react';
import { X, Loader2, AlertCircle, ChevronLeft, ChevronRight } from 'lucide-react';
import { baixarDocumentoDaAnalise } from '../lib/figuras';
import { abrirDocumento } from '../lib/pdfPaginas';
import { listarDocumentosCaso } from '../lib/casos';

const semAcento = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

async function localizarDocumento(fonte, casoId) {
  if (fonte.storage_path) return { storage_path: fonte.storage_path, mime_type: 'application/pdf', nome: fonte.documento };
  const docs = await listarDocumentosCaso(casoId);
  const alvo = semAcento(fonte.documento);
  return docs.find((d) => semAcento(d.nome) === alvo) || docs.find((d) => semAcento(d.nome).includes(alvo) || alvo.includes(semAcento(d.nome))) || null;
}

export default function VisorFonte({ fonte, casoId, onFechar }) {
  const canvasRef = useRef(null);
  const docRef = useRef(null);
  const [estado, setEstado] = useState('abrindo'); // 'abrindo' | 'ok' | 'erro'
  const [pagina, setPagina] = useState(fonte.pagina || 1);
  const [total, setTotal] = useState(1);

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const doc = await localizarDocumento(fonte, casoId);
        if (!doc) throw new Error('Documento não encontrado neste caso.');
        const buffer = await baixarDocumentoDaAnalise(doc.storage_path);
        const aberto = await abrirDocumento(buffer, doc.mime_type || 'application/pdf');
        if (!vivo) return aberto.fechar?.();
        docRef.current = aberto;
        setTotal(aberto.numPaginas);
        setEstado('ok');
      } catch (err) {
        console.warn('[VisorFonte] Falha ao abrir a fonte:', err);
        if (vivo) setEstado('erro');
      }
    })();
    return () => {
      vivo = false;
      docRef.current?.fechar?.();
    };
  }, [fonte, casoId]);

  useEffect(() => {
    if (estado !== 'ok' || !canvasRef.current) return;
    docRef.current.desenhar(canvasRef.current, Math.min(Math.max(1, pagina), total), 900).catch(() => setEstado('erro'));
  }, [estado, pagina, total]);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60" onClick={onFechar} />
      <div className="relative flex max-h-[92vh] w-full max-w-4xl flex-col rounded-2xl border border-line bg-ink-800 shadow-2xl" role="dialog" aria-label="Fonte da resposta">
        <div className="flex items-center gap-3 border-b border-line p-4">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-parchment">{fonte.documento}</p>
            <p className="text-xs text-parchment/50">{fonte.pagina ? `Página citada: ${fonte.pagina}` : 'O parecer não indica a página: confira o documento.'}</p>
          </div>
          <button onClick={onFechar} className="ml-auto text-parchment/40 hover:text-parchment" aria-label="Fechar">
            <X size={18} />
          </button>
        </div>
        {fonte.trecho && <p className="border-b border-line bg-ink-900/60 px-4 py-2 text-xs italic text-parchment/60">“{fonte.trecho}”</p>}
        <div className="min-h-[12rem] flex-1 overflow-auto bg-ink-900 p-4 text-center">
          {estado === 'abrindo' && <Loader2 className="mx-auto mt-10 animate-spin text-gold" />}
          {estado === 'erro' && (
            <p className="mt-10 flex items-center justify-center gap-2 text-sm text-amber-400">
              <AlertCircle size={16} /> Não foi possível abrir este documento agora.
            </p>
          )}
          {estado === 'ok' && <canvas ref={canvasRef} className="mx-auto max-w-full bg-white" />}
        </div>
        {estado === 'ok' && total > 1 && (
          <div className="flex items-center justify-center gap-3 border-t border-line p-3 text-xs text-parchment/70">
            <button onClick={() => setPagina((p) => Math.max(1, p - 1))} disabled={pagina <= 1} className="rounded-lg bg-ink-700 p-1.5 disabled:opacity-40" aria-label="Página anterior">
              <ChevronLeft size={14} />
            </button>
            página {pagina} de {total}
            <button onClick={() => setPagina((p) => Math.min(total, p + 1))} disabled={pagina >= total} className="rounded-lg bg-ink-700 p-1.5 disabled:opacity-40" aria-label="Próxima página">
              <ChevronRight size={14} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Alterar `ChatLu.jsx`**

Mudanças, todas no mesmo arquivo:

a) Imports: acrescentar

```js
import { GRUPOS_PRE_MONTADAS, SUGESTOES_IA, LIMITE_PERGUNTAS_IA, responderPreMontada } from '../lib/luPreMontadas';
import { buscarPecaResumoLu } from '../lib/analises';
import VisorFonte from './VisorFonte';
```

(`buscarPerguntasLuDisponiveis` já vem de `../lib/analises`; juntar no mesmo import.) Remover `const LIMITE_PERGUNTAS = 10;` e a constante `SUGESTOES_POR_CATEGORIA`; trocar todo uso de `LIMITE_PERGUNTAS` por `LIMITE_PERGUNTAS_IA`.

b) `FontesConsultadas` recebe `onAbrir` e mostra todos os tipos, com número e clique em fonte que tem documento:

```jsx
function FontesConsultadas({ fontes, onAbrir }) {
  if (!fontes || fontes.length === 0) return null;
  return (
    <div className="mt-3 space-y-1.5 border-t border-line/60 pt-3">
      <p className="text-[10px] font-bold uppercase tracking-wider text-parchment/40">Fontes consultadas</p>
      <ul className="space-y-1">
        {fontes.map((f) => {
          const clicavel = Boolean(f.documento);
          const rotulo =
            f.tipo === 'legislacao' ? `${f.norma} ${f.identificador}`
            : f.tipo === 'documento' ? `${f.documento}${f.pagina != null ? `, pág. ${f.pagina}` : ''}`
            : f.documento ? `${f.rotulo} (${f.documento})` : f.rotulo;
          return (
            <li key={f.n} className="flex items-start gap-1.5 text-xs text-parchment/55">
              <span className="mt-0.5 w-4 flex-shrink-0 text-right font-semibold text-gold/80">{f.n}</span>
              {f.tipo === 'legislacao' ? <BookOpen size={12} className="mt-0.5 flex-shrink-0 text-gold/70" /> : <FileText size={12} className="mt-0.5 flex-shrink-0 text-parchment/40" />}
              {clicavel ? (
                <button type="button" onClick={() => onAbrir(f)} className="text-left underline decoration-dotted underline-offset-2 hover:text-parchment" title="Abrir o documento">
                  {rotulo}
                </button>
              ) : (
                <span>{rotulo}</span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
```

c) Props e estado: assinatura `ChatLu({ casoId, analiseId, user, resultado, invertido = false })`; novos estados `const [pecaResumo, setPecaResumo] = useState(null);` e `const [fonteAberta, setFonteAberta] = useState(null);`; efeito que carrega o resumo ao abrir e depois de gerar peça:

```js
  useEffect(() => {
    if (!analiseId) return;
    let vivo = true;
    const carregar = () => buscarPecaResumoLu(analiseId).then((v) => vivo && setPecaResumo(v));
    carregar();
    window.addEventListener('tributagil:peca-gerada', carregar);
    return () => {
      vivo = false;
      window.removeEventListener('tributagil:peca-gerada', carregar);
    };
  }, [analiseId]);
```

(em `ModalGerarPeca.jsx`, depois do `salvarResumoPeca(...)`, disparar `window.dispatchEvent(new Event('tributagil:peca-gerada'))` quando o `await` terminar: trocar a linha para `salvarResumoPeca({ analiseId: analise.id, resposta: r }).then(() => window.dispatchEvent(new Event('tributagil:peca-gerada')));`.)

d) Função para uma pergunta pronta (não chama o servidor, não mexe na cota):

```js
  const perguntarPronta = useCallback(
    (item) => {
      const { texto, fontes, semPeca } = responderPreMontada(item.id, { resultado, pecaResumo });
      setMensagens((prev) => [...prev, { papel: 'usuario', texto: item.pergunta }, { papel: 'lu', texto, fontes, pronta: true, semPeca }]);
    },
    [resultado, pecaResumo],
  );
```

e) O histórico enviado à IA exclui as mensagens `pronta` (elas não consomem nem contaminam a conversa): em `enviar`, `mensagens.filter((m) => !m.pronta).slice(-6)`.

f) Tela inicial (substitui o bloco `SUGESTOES_POR_CATEGORIA.map`): primeiro as perguntas prontas por grupo (botões que chamam `perguntarPronta(item)`, com a legenda "Resposta imediata, não usa suas perguntas"), depois o grupo "Perguntas com IA" com `SUGESTOES_IA` (botões que chamam `enviar(s)`, com a legenda "Cada uma usa 1 das N perguntas com IA"). Mostrar o catálogo também acima do campo de texto depois da primeira resposta? Não: após a primeira mensagem, um botão discreto "Ver perguntas prontas" volta à lista (`setMensagens([])` não: use um estado `verCatalogo` que mostra o bloco acima das mensagens). Implementar `verCatalogo` inicial `true`; ao clicar numa pergunta pronta ou ao enviar, `setVerCatalogo(false)`; o botão "Ver perguntas prontas" no cabeçalho do chat alterna.

g) Aviso de peça ausente (opacidade reduzida), logo abaixo do cabeçalho e acima das mensagens, só quando `!pecaResumo`:

```jsx
      {!pecaResumo && (
        <p className={`px-4 pt-2 text-[11px] opacity-60 ${T.textoSecundario}`}>
          Nenhuma peça foi gerada para esta consulta ainda. O Lu responde com base no parecer e nos documentos.
        </p>
      )}
```

h) Renderização das mensagens: `<FontesConsultadas fontes={m.fontes} onAbrir={setFonteAberta} />`; mensagem com `m.semFonteConferida` mostra antes do texto uma linha em âmbar "Resposta sem fonte conferida: confira nos documentos."; bolha `pronta` ganha um selo pequeno "resposta pronta, sem IA". Em `enviar`, ao receber a resposta guardar também `semFonteConferida`:

```js
const { resposta, fontes, perguntasDisponiveis, limiteAtingido: atingiuAgora, semFonteConferida } = await perguntarLu({...});
setMensagens((prev) => [...prev, { papel: 'lu', texto: resposta, fontes, limite: !!atingiuAgora, semFonteConferida }]);
```

i) Textos da cota: `ContadorPerguntas` mostra `{disponiveis} de {LIMITE_PERGUNTAS_IA} perguntas com IA`; mensagem de limite: "Você já usou as 5 perguntas com IA desta consulta. As perguntas prontas continuam liberadas." e o campo de texto continua desabilitado só para IA. Placeholder: `Pergunta livre (usa 1 das ${disponiveis} perguntas com IA)`. O botão de enviar fica desabilitado com cota zerada, mas o catálogo continua clicável.

j) Ao final do JSX do componente (dentro do `return` principal), `{fonteAberta && <VisorFonte fonte={fonteAberta} casoId={casoId} onFechar={() => setFonteAberta(null)} />}`.

k) Passar `resultado`: em `ChatLuFlutuante.jsx` aceitar e repassar a prop `resultado`; em `src/pages/ResultadoAnalise.jsx` linha 879 usar `<ChatLuFlutuante casoId={casoId} analiseId={analiseId} user={user} resultado={resultado} />` (confirmar o nome da variável do parecer nessa página antes de editar).

- [ ] **Step 3: Verificar no navegador** (harness do scratch `ui`, copiando os arquivos novos): tela inicial com as 4 frentes e o bloco de IA; clicar numa pergunta pronta mostra resposta com citações e fontes; fonte com documento abre o `VisorFonte`; aviso de peça ausente visível e esmaecido; com `pecaResumo` simulado o aviso some e as perguntas de peça respondem; contador mostra "N de 5"; com cota 0 o campo bloqueia e as prontas seguem funcionando. Capturar tela como prova.

- [ ] **Step 4: Commit** ("Lu: tela com perguntas prontas, fontes clicaveis e aviso de peca ausente").

---

### Task 7: Rodada com o Gemini real, documentação e entrega

**Files:**
- Create: `scripts/lu/medir-citacoes.mjs` (rodada com Gemini real, sem Supabase)
- Modify: `README.md`, `docs/superpowers/specs/2026-10-23-lu-fontes-e-peca-design.md`

- [ ] **Step 1: Script de medição.** Para 6 casos fictícios (P03, D05, I01 e outros 3 de `scripts/casos-ficticios/cenarios.json`), montar parecer sintético com `avaliarCaso` + trechos dos PDFs como documentos, chamar `montarContextoLu`, fazer as 5 sugestões de IA com o Gemini real (`chamarGemini`, chave lida do `.env.local`, sem imprimir), passar por `conferirCitacoes` e imprimir: taxa de respostas com citação válida, número de identificadores inventados removidos, respostas sem fonte. Critério de aceite: pelo menos 90% das respostas com ao menos uma citação válida e nenhuma afirmação sobre peça quando não há peça.
- [ ] **Step 2: Rodar o script** (custo: cerca de 30 chamadas, centavos) e registrar o resultado na spec.
- [ ] **Step 3: Atualizar README** (seção do Lu: pré-montadas, cota 5, citações, resumo da peça, migração pendente) e a spec (estado, catálogo de 14 perguntas, formato `pecas[]`).
- [ ] **Step 4: Suíte completa** com junctions temporárias, depois remover as junctions.
- [ ] **Step 5: Commit e push na `feat/lu-novo`.** Avisar o Luan que a migração `docs/migracoes/2026-10-23-lu-peca-resumo-e-cota-5.sql` aguarda autorização para rodar em produção, e que o Lu da main continua com o código antigo até o merge.

---

## Auto-revisão

- **Cobertura da especificação:** pré-montadas sem IA (Task 1); cota 5 (Tasks 4 e 5); citações numeradas e conferidas (Tasks 2, 3, 4); fontes clicáveis (Task 6); parecer e peça como fonte (Tasks 3 e 4); resumo da peça gravado (Task 5); aviso esmaecido sem peça (Task 6); `chamarGemini` (Task 4); migração só em arquivo (Task 5); testes e rodada real (Task 7). A spec diz "11 perguntas": o catálogo tem 14 porque a pergunta "em que documento consta" virou quatro variantes; Task 7 atualiza a spec.
- **Marcadores proibidos:** nenhum passo sem código ou comando; os trechos de UI da Task 6 são descritos item a item com o código das partes não triviais.
- **Consistência de tipos:** `responderPreMontada` e `fonteParaCliente` produzem o mesmo formato de fonte (`n`, `tipo`, `rotulo`, `documento`, `pagina`, `storage_path`, `norma`, `identificador`, `trecho`); `pecaResumo.pecas[]` tem os mesmos campos em `resumoParaLu`, `montarContextoLu` e `responderPreMontada`; `LIMITE_PERGUNTAS_IA` (cliente) e `LIMITE_PERGUNTAS` (servidor) valem 5.
