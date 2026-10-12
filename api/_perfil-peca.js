// api/_perfil-peca.js
//
// "Perfil" dos dados que o advogado informa à mão ao gerar uma peça e que devem sair em TODAS as
// peças seguintes, sem digitar de novo:
//
//   - do ESCRITÓRIO  (escritorios.perfil_peca): nº do Doc. do mandato;
//   - do CASO        (casos.dados_peca):        qualificação do cliente (nome, CPF/CNPJ, nacionalidade,
//                                                estado civil, profissão, endereço).
//
// Precedência (do mais forte ao mais fraco): o que o usuário digitou agora > o que está salvo no caso /
// escritório > o que a IA leu dos documentos > [PREENCHER]. Só valor NÃO vazio sobrescreve: campo em
// branco nunca apaga um dado já conhecido. Tudo aqui é puro (sem rede), para testar sem mocks.
//
// Arquivo com prefixo "_": a Vercel não o expõe como endpoint.

export const CAMPOS_CLIENTE = ['nome', 'documento', 'nacionalidade', 'estado_civil', 'profissao', 'endereco'];
const MAX_CHARS = 300;

// Texto de formulário -> string segura: sem caracteres de controle, espaços normalizados, tamanho limitado.
function limpar(valor) {
  if (typeof valor !== 'string') return '';
  // eslint-disable-next-line no-control-regex
  return valor.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, MAX_CHARS);
}

/** Aceita qualquer lixo e devolve só { doc_mandato, cliente: {…campos conhecidos} } com strings limpas. */
export function normalizarPerfil(entrada) {
  const e = entrada && typeof entrada === 'object' && !Array.isArray(entrada) ? entrada : {};
  const c = e.cliente && typeof e.cliente === 'object' && !Array.isArray(e.cliente) ? e.cliente : {};
  const cliente = {};
  for (const campo of CAMPOS_CLIENTE) cliente[campo] = limpar(c[campo]);
  return { doc_mandato: limpar(e.doc_mandato), cliente };
}

/**
 * Junta, em ordem de precedência crescente, as camadas informadas (a última vence — mas só com valor
 * não vazio). Ex.: mesclarPerfis(doEscritorio, doCaso, doFormulario).
 */
export function mesclarPerfis(...camadas) {
  const saida = normalizarPerfil({});
  for (const camada of camadas) {
    const n = normalizarPerfil(camada);
    if (n.doc_mandato) saida.doc_mandato = n.doc_mandato;
    for (const campo of CAMPOS_CLIENTE) if (n.cliente[campo]) saida.cliente[campo] = n.cliente[campo];
  }
  return saida;
}

/** O perfil do escritório guarda só o que é do escritório; o do caso, só o que é do cliente. */
export const perfilDoEscritorio = (p) => ({ doc_mandato: normalizarPerfil(p).doc_mandato });
export const perfilDoCaso = (p) => ({ cliente: normalizarPerfil(p).cliente });

/**
 * Aplica a qualificação do cliente sobre o `executado` lido pela IA (valor informado vence o lido).
 * @returns {object} novo `executado` (não muta o original)
 */
export function aplicarClienteAoExecutado(executado, cliente) {
  const base = executado && typeof executado === 'object' ? executado : {};
  const n = normalizarPerfil({ cliente }).cliente;
  const saida = { ...base };
  for (const campo of CAMPOS_CLIENTE) if (n[campo]) saida[campo] = n[campo];
  return saida;
}

/** O que efetivamente entrou na peça — é isto que o app grava como "últimos dados utilizados". */
export function perfilEfetivo({ perfil, executado }) {
  const p = normalizarPerfil(perfil);
  const ex = executado && typeof executado === 'object' ? executado : {};
  const cliente = {};
  for (const campo of CAMPOS_CLIENTE) cliente[campo] = limpar(ex[campo]) || p.cliente[campo];
  return { doc_mandato: p.doc_mandato, cliente };
}
