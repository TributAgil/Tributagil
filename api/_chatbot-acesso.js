// api/_chatbot-acesso.js
//
// Ponto ÚNICO de decisão sobre acesso ao chatbot Lu (chat + indexação).
// Desligado por decisão do Luan (24/10/2026): o Lu fica em segundo plano e
// não pode ser usado nem gerar custo de Gemini. Para religar, volte a
// devolver `{ liberado: true }` (ou o corte por perfil/plano) AQUI: tanto
// api/lu.js quanto api/indexar-caso.js já chamam esta função, então nenhum
// outro lugar do servidor precisa mudar.
//
// Arquivo com prefixo "_": a Vercel não o expõe como endpoint.

/**
 * @param {{ perfil?: object }} _ctx  reservado para o futuro corte por perfil/plano
 * @returns {{ liberado: true } | { liberado: false, motivo: string }}
 */
export function chatbotLiberadoParaPerfil(_ctx = {}) {
  return { liberado: false, motivo: 'O chatbot Lu está temporariamente indisponível.' };
}
