// api/_chatbot-acesso.js
//
// Ponto ÚNICO de decisão sobre acesso ao Lu, por USO:
//   'caso' (padrão): o chat do caso (api/lu.js) e a indexação dos documentos (api/indexar-caso.js). Desligado por
//                    decisão do Luan (24/10/2026): não pode ser usado nem gerar custo de Gemini.
//   'peca':          o "Pedir ao Lu" dentro do editor da peça (api/lu-peca.js): reescrever, fundamentar e preencher
//                    um trecho. Ligado por decisão do Luan (30/10/2026), no plano piloto (Plano Dedicado).
// Para religar o chat do caso, devolva `{ liberado: true }` para 'caso' AQUI: api/lu.js e api/indexar-caso.js já
// chamam esta função, então nenhum outro lugar do servidor precisa mudar.
//
// Arquivo com prefixo "_": a Vercel não o expõe como endpoint.

/**
 * @param {{ uso?: 'caso' | 'peca', perfil?: object }} [ctx]  `perfil` reservado para o futuro corte por plano
 * @returns {{ liberado: true } | { liberado: false, motivo: string }}
 */
export function chatbotLiberadoParaPerfil({ uso = 'caso' } = {}) {
  if (uso === 'peca') return { liberado: true };
  return { liberado: false, motivo: 'O chatbot Lu está temporariamente indisponível.' };
}
