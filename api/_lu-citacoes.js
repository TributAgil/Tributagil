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
