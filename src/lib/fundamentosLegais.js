// src/lib/fundamentosLegais.js
//
// Texto de apoio para as citações legais que o motor já usa
// (api/_motor-tributagil.js) — CTN, LEF e a jurisprudência do STJ citadas
// nos módulos de decadência/prescrição. Escrito à mão a partir do texto
// oficial das normas, NUNCA gerado pela IA: o motor tem tolerância zero
// para alucinação sobre os documentos do caso, e o mesmo vale aqui — o
// texto da lei não pode vir de uma IA que pode reescrever a norma errado.
// Como o motor só cita um conjunto pequeno e fixo de dispositivos, dá para
// manter essa tabela por extenso e correta, ao contrário de tentar cobrir
// "qualquer citação possível" (o que exigiria confiar de novo na IA).
//
// Cada entrada tem `padroes` (expressões regulares que casam com o texto
// livre gerado pela IA em "referencia"/"fundamento_legal") e o texto de
// apoio a mostrar. `buscarFundamentos` só devolve o que efetivamente bateu
// um padrão conhecido — nunca inventa uma correspondência.

export const FUNDAMENTOS_LEGAIS = [
  {
    id: 'ctn-150-4',
    titulo: 'Art. 150, § 4º, do CTN',
    padroes: [/art\.?\s*150.{0,25}§\s*4/i, /§\s*4.{0,25}art\.?\s*150/i],
    texto:
      '"Se a lei não fixar prazo à homologação, será ele de cinco anos, a contar da ocorrência do fato gerador; expirado esse prazo sem que a Fazenda Pública se tenha pronunciado, considera-se homologado o lançamento e definitivamente extinto o crédito, salvo se comprovada a ocorrência de dolo, fraude ou simulação."',
  },
  {
    id: 'ctn-151',
    titulo: 'Art. 151 do CTN',
    padroes: [/art\.?\s*151\b/i],
    texto:
      'Suspendem a exigibilidade do crédito tributário: a moratória; o depósito do seu montante integral; as reclamações e recursos administrativos; a liminar em mandado de segurança; a liminar ou tutela antecipada em outras ações judiciais; e o parcelamento.',
  },
  {
    id: 'ctn-156-5',
    titulo: 'Art. 156, V, do CTN',
    padroes: [/art\.?\s*156.{0,12}(v\b|inciso\s*v)/i],
    texto: '"Extinguem o crédito tributário: (...) V - a prescrição e a decadência;"',
  },
  {
    id: 'ctn-165-1',
    titulo: 'Art. 165, I, do CTN',
    padroes: [/art\.?\s*165\b/i],
    texto:
      '"O sujeito passivo tem direito, independentemente de prévio protesto, à restituição total ou parcial do tributo, seja qual for a modalidade do seu pagamento (...): I - cobrança ou pagamento espontâneo de tributo indevido ou maior que o devido em face da legislação tributária aplicável (...)"',
  },
  {
    id: 'ctn-173-1',
    titulo: 'Art. 173, I, do CTN',
    padroes: [/art\.?\s*173\b/i],
    texto:
      '"O direito de a Fazenda Pública constituir o crédito tributário extingue-se após 5 (cinco) anos, contados: I - do primeiro dia do exercício seguinte àquele em que o lançamento poderia ter sido efetuado;"',
  },
  {
    id: 'ctn-174',
    titulo: 'Art. 174 do CTN',
    padroes: [/art\.?\s*174\b/i],
    texto:
      '"A ação para a cobrança do crédito tributário prescreve em cinco anos, contados da data da sua constituição definitiva. Parágrafo único. A prescrição se interrompe: I – pelo despacho do juiz que ordenar a citação em execução fiscal; II - pelo protesto judicial; III - por qualquer ato judicial que constitua em mora o devedor; IV - por qualquer ato inequívoco, ainda que extrajudicial, que importe em reconhecimento do débito pelo devedor."',
  },
  {
    id: 'lef-8',
    titulo: 'Art. 8º da Lei nº 6.830/1980 (LEF)',
    padroes: [/art\.?\s*8[ºo]?\s*(,?\s*da\s*)?lef/i, /art\.?\s*8[ºo]?.{0,30}(6\.?830|execu[cç][aã]o\s*fiscal)/i],
    texto:
      '"O executado será citado para, no prazo de 5 (cinco) dias, pagar a dívida com os juros e multa de mora e encargos indicados na Certidão de Dívida Ativa, ou garantir a execução (...) § 2º - O despacho do Juiz, que ordenar a citação, interrompe a prescrição."',
  },
  {
    id: 'lef-40',
    titulo: 'Art. 40 da Lei nº 6.830/1980 (LEF)',
    padroes: [/art\.?\s*40\b/i],
    texto:
      '"O Juiz suspenderá o curso da execução, enquanto não for localizado o devedor ou encontrados bens sobre os quais possa recair a penhora, e, nesses casos, não correrá o prazo de prescrição. (...) § 2º - Decorrido o prazo máximo de 1 (um) ano, sem que seja localizado o devedor ou encontrados bens penhoráveis, o Juiz ordenará o arquivamento dos autos. § 4º Se da decisão que ordenar o arquivamento tiver decorrido o prazo prescricional, o juiz, depois de ouvida a Fazenda Pública, poderá, de ofício, reconhecer a prescrição intercorrente e decretá-la de imediato."',
  },
  {
    id: 'stj-sumula-106',
    titulo: 'Súmula 106 do STJ',
    padroes: [/s[uú]mula\s*106\b/i],
    texto:
      '"Proposta a ação no prazo fixado para o seu exercício, a demora na citação, por motivos inerentes ao mecanismo da Justiça, não justifica o acolhimento da arguição de prescrição ou decadência."',
  },
  {
    id: 'stj-tema-566',
    titulo: 'Tema 566 do STJ (REsp 1.340.553/RS) — síntese da tese fixada',
    padroes: [/tema\s*566\b/i, /1\.?340\.?553/i],
    texto:
      'O prazo de 1 ano de suspensão (art. 40, §§ 1º e 2º, da LEF) começa a contar automaticamente da ciência da Fazenda sobre a não localização do devedor ou de bens penhoráveis. Findo esse prazo, inicia-se automaticamente a prescrição intercorrente de 5 anos. Apenas a efetiva constrição patrimonial e a efetiva citação (mesmo por edital) interrompem esse prazo — mero peticionamento em juízo não basta. (Síntese das teses 4.1 a 4.3 fixadas no REsp 1.340.553/RS; não é transcrição literal do acórdão.)',
  },
];

export function buscarFundamentos(textoReferencia) {
  const texto = String(textoReferencia || '');
  if (!texto.trim()) return [];
  return FUNDAMENTOS_LEGAIS.filter((f) => f.padroes.some((re) => re.test(texto)));
}

export default FUNDAMENTOS_LEGAIS;
