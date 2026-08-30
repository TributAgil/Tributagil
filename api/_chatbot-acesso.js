// api/_chatbot-acesso.js
//
// Ponto ÚNICO de decisão sobre acesso ao chatbot Lu (chat + indexação).
// Hoje sempre libera — decisão explícita enquanto a segmentação de perfis
// é desenvolvida em branch isolada (mesma instrução que tirou a checagem de
// plano do Lu). Quando essa segmentação existir (ex.: plano "com chatbot" x
// "sem chatbot", como uma classificação separada da de créditos de análise),
// o corte entra AQUI — tanto api/lu.js quanto api/indexar-caso.js já chamam
// esta função, então nenhum outro lugar do código precisa mudar.
//
// Arquivo com prefixo "_": a Vercel não o expõe como endpoint.

/**
 * @param {{ perfil?: object }} _ctx  reservado para o futuro corte por perfil/plano
 * @returns {{ liberado: true } | { liberado: false, motivo: string }}
 */
export function chatbotLiberadoParaPerfil(_ctx = {}) {
  return { liberado: true };
}
