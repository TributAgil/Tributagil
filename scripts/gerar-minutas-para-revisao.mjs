// Gera as minutas dos modelos NOVOS renderizadas com dados FICTÍCIOS, para a advogada ler o texto
// final como ele sai (templates/pecas/minutas-para-revisao/). Rodar da raiz do repositório:
//
//   node scripts/gerar-minutas-para-revisao.mjs
//
// Usa as mesmas fixtures dos testes (tests/fixtures-peca.js) e o mesmo caminho de código da API
// (motor -> contexto -> docx-templates), então a minuta é exatamente o que o sistema produz.
// Exige as dependências instaladas (docx-templates, jszip).

import fs from 'node:fs';
import path from 'node:path';
import { avaliarPeca } from '../api/_motor-peca.js';
import { montarContexto } from '../api/_contexto-peca.js';
import { renderizarPeca } from '../api/_render-peca.js';
import {
  AGORA, escritorio, dadosDecadencia, dadosIntercorrente, periodoDecadencia, intimacao, evento, dt, parecerFavoravel,
} from '../tests/fixtures-peca.js';

const SAIDA = path.join(process.cwd(), 'templates', 'pecas', 'minutas-para-revisao');
fs.mkdirSync(SAIDA, { recursive: true });

async function minuta({ arquivo, dados, tese, tipoParecer }) {
  const avaliacao = avaliarPeca({ dados, tese, conclusoesParecer: parecerFavoravel(tipoParecer), agora: AGORA });
  if (avaliacao.status !== 'ok') throw new Error(`${arquivo}: ${avaliacao.status} ${JSON.stringify(avaliacao.bloqueios)}`);
  const contexto = montarContexto({ dados, avaliacao, escritorio, agora: AGORA });
  const docx = await renderizarPeca({ template: avaliacao.template, contexto });
  fs.writeFileSync(path.join(SAIDA, arquivo), docx);
  console.log('gerada:', arquivo, `(${avaliacao.template})`);
}

// Revisão PGFN — decadência: União, dois períodos (um pelo art. 173, I e outro pelo art. 150, § 4º), com protesto.
await minuta({
  arquivo: 'Minuta_Revisao_PGFN_decadencia.docx',
  tese: 'decadencia',
  tipoParecer: 'decadencia',
  dados: dadosDecadencia({
    ajuizada: false,
    protesto: true,
    periodos: [
      periodoDecadencia(),
      periodoDecadencia({
        periodo: '2006',
        data_fato_gerador: dt('30/06/2006', 'auto_infracao.pdf'),
        data_vencimento: dt('31/07/2006', 'auto_infracao.pdf'),
        houve_pagamento_antecipado: 'sim',
        fonte_pagamento_antecipado: 'comprovante_pagamento_2006.pdf',
      }),
    ],
  }),
});

// EPE — prescrição intercorrente: dois ciclos (o 1º interrompido por citação; o 2º ativo), com protesto.
await minuta({
  arquivo: 'Minuta_EPE_prescricao_intercorrente.docx',
  tese: 'prescricao_intercorrente',
  tipoParecer: 'prescricao_intercorrente',
  dados: dadosIntercorrente({
    protesto: true,
    eventos: [intimacao('10/03/2016', 'devedor'), evento('citacao', '15/05/2016'), intimacao('10/03/2017', 'devedor_e_bens')],
  }),
});
