// api/_extracao-peca.js
//
// Chamada ÚNICA ao Gemini que extrai os FATOS da peça (api/_schema-dados-peca.js): temperatura 0, saída em JSON
// com schema. Separada do endpoint para o executor dos casos fictícios (scripts/casos-ficticios/) usar exatamente
// o mesmo código que roda em produção.
//
// Arquivo com prefixo "_": a Vercel não o expõe como endpoint.

import { ESQUEMA_DADOS_PECA, PROMPT_DADOS_PECA } from './_schema-dados-peca.js';

const GEMINI = 'https://generativelanguage.googleapis.com';
const TIMEOUT_EXTRACAO_MS = 200_000;
const MODELO_PADRAO = 'gemini-3.5-flash'; // GEMINI_MODEL

function configuracaoThinking() {
  const nivel = (process.env.GEMINI_THINKING_LEVEL || 'high').toLowerCase();
  const orcamento = Number.parseInt(process.env.GEMINI_THINKING_BUDGET ?? '', 10);
  if (['off', 'none', 'disabled', 'false'].includes(nivel)) return undefined;
  if (nivel === 'budget' && Number.isFinite(orcamento)) return orcamento > 0 ? { thinkingBudget: orcamento } : undefined;
  return { thinkingLevel: nivel };
}

export async function extrairDados({ apiKey, partes, ctx }) {
  const modelo = process.env.GEMINI_MODEL || MODELO_PADRAO;
  const thinking = configuracaoThinking();
  const corpo = JSON.stringify({
    systemInstruction: { parts: [{ text: PROMPT_DADOS_PECA }] },
    contents: [{ role: 'user', parts: [{ text: 'Extraia os dados dos documentos anexados abaixo.' }, ...partes] }],
    generationConfig: {
      temperature: 0, // fatos não podem variar entre execuções do mesmo processo
      responseMimeType: 'application/json',
      responseSchema: ESQUEMA_DADOS_PECA,
      ...(thinking ? { thinkingConfig: thinking } : {}),
    },
  });
  const url = `${GEMINI}/v1beta/models/${modelo}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_EXTRACAO_MS);
  try {
    let ultimo;
    for (let tentativa = 0; tentativa < 3; tentativa++) {
      const resp = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: corpo, signal: controller.signal });
      if (resp.ok) {
        const json = await resp.json();
        ctx.tokens = json?.usageMetadata?.totalTokenCount ?? null;
        const texto = json?.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('') || '';
        return JSON.parse(texto);
      }
      ultimo = resp.status;
      // Corpo do erro do Gemini (ex.: schema recusado, modelo inexistente): sem isto o 400 é indecifrável nos logs.
      const detalhe = await resp.text().catch(() => '');
      console.error('[extracao-peca] Gemini erro', resp.status, detalhe.slice(0, 800));
      // só tenta de novo em erro transitório (limite de taxa / indisponibilidade)
      if (![429, 500, 502, 503].includes(resp.status)) break;
      await new Promise((r) => setTimeout(r, 1500 * (tentativa + 1)));
    }
    throw new Error(`Gemini respondeu HTTP ${ultimo}`);
  } finally {
    clearTimeout(timer);
  }
}

