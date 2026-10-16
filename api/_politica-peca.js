// api/_politica-peca.js
//
// Política comercial da geração de peça, num lugar só para ser trocada sem
// caçar pelo código. HOJE: gerar a peça a partir de uma análise já feita NÃO
// consome crédito — a análise original já foi paga, e a peça só reaproveita
// os documentos dela.
//
// Se um dia passar a cobrar: api/gerar-peca.js já consulta esta função antes
// de chamar a IA e recusa (501) enquanto a cobrança não estiver implementada,
// em vez de servir de graça por esquecimento. A implementação deve seguir a
// máquina de estados de api/gemini.js (consumir_credito + idempotência +
// estorno automático), não um débito avulso.
//
// Arquivo com prefixo "_": a Vercel não o expõe como endpoint.

/** @returns {number} créditos consumidos por peça gerada */
export function creditosParaGerarPeca() {
  return 0;
}
