// src/lib/figuras.js
//
// Cliente do assistente de figuras da peça: a chamada a /api/localizar-figuras e a matemática do recorte (puras, testadas
// em tests/figuras-cliente.test.js). A tela (PainelFiguras.jsx) só desenha; as decisões ficam aqui.
//
// Convenção de caixa: [ymin, xmin, ymax, xmax], inteiros de 0 a 1000 em relação à PÁGINA (origem no canto superior
// esquerdo), a mesma que o servidor devolve (api/_localizacao-figuras.js).

import { supabase } from './supabase';

export const MIN_LADO = 15; // menor lado permitido para a caixa (0..1000), para ela não "sumir" ao arrastar
const BUCKET_DOCUMENTOS = 'documentos';

async function tokenDaSessao() {
  const { data } = await supabase.auth.getSession().catch(() => ({ data: {} }));
  return data?.session?.access_token || '';
}

/**
 * Pede ao servidor a localização (documento, página, caixa) de cada figura da peça.
 * @returns {Promise<{ok: boolean, figuras?: object[], documentos?: object[], error?: string}>}
 */
export async function localizarFigurasNaAnalise({ analiseId, figuras }) {
  const token = await tokenDaSessao();
  if (!token) return { ok: false, error: 'Sessão expirada. Faça login novamente.' };
  try {
    const resposta = await fetch('/api/localizar-figuras', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ analise_id: analiseId, figuras }),
    });
    const dados = await resposta.json().catch(() => ({}));
    if (!resposta.ok) return { ok: false, error: dados.error || 'Não foi possível procurar as figuras agora.' };
    return { ok: true, ...dados };
  } catch (err) {
    console.warn('[figuras] Falha ao localizar as figuras:', err);
    return { ok: false, error: 'Erro de rede ao procurar as figuras.' };
  }
}

/** Baixa um documento da análise (Storage, com o token do próprio usuário: RLS) como ArrayBuffer. */
export async function baixarDocumentoDaAnalise(storagePath) {
  const { data, error } = await supabase.storage.from(BUCKET_DOCUMENTOS).download(storagePath);
  if (error || !data) throw new Error('Não foi possível abrir um documento da análise.');
  return data.arrayBuffer();
}

// ---------------------------------------------------------------------------------------------------------------------
// Estado de cada figura
// ---------------------------------------------------------------------------------------------------------------------

/**
 * 'confere'    — a IA achou e o dado que a figura precisa mostrar aparece no texto lido (conferido em código)
 * 'revisar'    — a IA achou, mas o dado não pôde ser conferido ou não bateu: o advogado precisa olhar
 * 'nao_achada' — nenhum documento tem o trecho: o advogado escolhe a página ou sobe o próprio print
 */
export function estadoDaFigura(resultado) {
  if (!resultado || !resultado.encontrado || !resultado.pagina) return 'nao_achada';
  return resultado.dado_confere === true ? 'confere' : 'revisar';
}

export const ROTULO_ESTADO = {
  confere: 'Dado conferido no texto',
  revisar: 'Revise: o dado não pôde ser conferido',
  nao_achada: 'Não encontrada nos documentos',
};

/** Contagem para o rodapé: quantas figuras já têm imagem confirmada pelo advogado. */
export function resumoDeConfirmacao(figuras, imagens) {
  const total = figuras.length;
  const confirmadas = figuras.filter((f) => imagens[f.numero]).length;
  return { total, confirmadas, faltam: total - confirmadas, completo: total > 0 && confirmadas === total };
}

// ---------------------------------------------------------------------------------------------------------------------
// Matemática da caixa
// ---------------------------------------------------------------------------------------------------------------------

const limita = (v, a, b) => Math.max(a, Math.min(b, v));

/** Caixa válida, dentro da página e com lado mínimo; qualquer entrada ruim vira a caixa padrão (parte central). */
export function caixaSegura(caixa) {
  const padrao = [300, 100, 400, 900];
  if (!Array.isArray(caixa) || caixa.length !== 4 || !caixa.every(Number.isFinite)) return padrao;
  let [y0, x0, y1, x1] = caixa.map((v) => limita(Math.round(v), 0, 1000));
  if (y1 < y0) [y0, y1] = [y1, y0];
  if (x1 < x0) [x0, x1] = [x1, x0];
  if (y1 - y0 < MIN_LADO) y1 = Math.min(1000, y0 + MIN_LADO), y0 = Math.max(0, y1 - MIN_LADO);
  if (x1 - x0 < MIN_LADO) x1 = Math.min(1000, x0 + MIN_LADO), x0 = Math.max(0, x1 - MIN_LADO);
  return [y0, x0, y1, x1];
}

/** Caixa (0..1000) → estilo em porcentagem para sobrepor à página. */
export function caixaParaEstilo(caixa) {
  const [y0, x0, y1, x1] = caixaSegura(caixa);
  return { top: `${y0 / 10}%`, left: `${x0 / 10}%`, height: `${(y1 - y0) / 10}%`, width: `${(x1 - x0) / 10}%` };
}

/** Caixa (0..1000) → retângulo em pixels de um canvas de largura × altura. */
export function caixaParaPixels(caixa, largura, altura) {
  const [y0, x0, y1, x1] = caixaSegura(caixa);
  const x = Math.round((x0 / 1000) * largura);
  const y = Math.round((y0 / 1000) * altura);
  return { x, y, largura: Math.max(1, Math.round((x1 / 1000) * largura) - x), altura: Math.max(1, Math.round((y1 / 1000) * altura) - y) };
}

/** Move a caixa inteira por (dy, dx) em unidades 0..1000, sem sair da página. */
export function moverCaixa(caixa, dy, dx) {
  const [y0, x0, y1, x1] = caixaSegura(caixa);
  const h = y1 - y0;
  const w = x1 - x0;
  const ny = limita(y0 + dy, 0, 1000 - h);
  const nx = limita(x0 + dx, 0, 1000 - w);
  return [Math.round(ny), Math.round(nx), Math.round(ny + h), Math.round(nx + w)];
}

/**
 * Arrasta um canto/lado. `alca` combina n/s/l/o ("n", "se", "o"...). O lado oposto fica parado; respeita o lado mínimo.
 */
export function redimensionarCaixa(caixa, alca, dy, dx) {
  let [y0, x0, y1, x1] = caixaSegura(caixa);
  if (alca.includes('n')) y0 = limita(y0 + dy, 0, y1 - MIN_LADO);
  if (alca.includes('s')) y1 = limita(y1 + dy, y0 + MIN_LADO, 1000);
  if (alca.includes('o')) x0 = limita(x0 + dx, 0, x1 - MIN_LADO);
  if (alca.includes('l')) x1 = limita(x1 + dx, x0 + MIN_LADO, 1000);
  return [Math.round(y0), Math.round(x0), Math.round(y1), Math.round(x1)];
}

/** Converte um deslocamento em pixels na tela para unidades 0..1000 da página exibida. */
export function pixelsParaUnidades(dpx, tamanhoPx) {
  return tamanhoPx > 0 ? (dpx / tamanhoPx) * 1000 : 0;
}

// ---------------------------------------------------------------------------------------------------------------------
// Nome do arquivo
// ---------------------------------------------------------------------------------------------------------------------

const semAcento = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '');

/** "Figura-03_extrato_vencimento_2017.png": ordenável, sem acento nem caractere que o Windows recusa. */
export function nomeArquivoFigura(figura, extensao = 'png') {
  const n = String(figura.numero).padStart(2, '0');
  const resto = [figura.chave, figura.periodo]
    .map((p) => semAcento(p).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''))
    .filter(Boolean)
    .join('_');
  return `Figura-${n}${resto ? `_${resto}` : ''}.${extensao}`;
}

/** Texto curto da referência, para o advogado achar o trecho no próprio documento. */
export function referenciaDaFigura(resultado) {
  if (!resultado?.encontrado || !resultado.documento_nome) return 'Não encontrada';
  return `${resultado.documento_nome}, página ${resultado.pagina}`;
}
