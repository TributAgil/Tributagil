// api/_extracao-peca.js
//
// Chamada ÚNICA ao Gemini que extrai os FATOS da peça (api/_schema-dados-peca.js): temperatura 0, saída em JSON
// com schema. Separada do endpoint para o executor dos casos fictícios (scripts/casos-ficticios/) usar exatamente
// o mesmo código que roda em produção.
//
// Arquivo com prefixo "_": a Vercel não o expõe como endpoint.

import { ESQUEMA_DADOS_PECA, PROMPT_DADOS_PECA } from './_schema-dados-peca.js';
import { chamarGemini } from './_gemini-resiliente.js';

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
  const montarUrl = (m) => `${GEMINI}/v1beta/models/${m}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_EXTRACAO_MS);
  try {
    // Sobrecarga (502/503), limite de taxa e cota diária são tratados em api/_gemini-resiliente.js: esperas crescentes,
    // modelo de reserva (GEMINI_MODEL_RESERVA) e, no fim, ErroGemini com a mensagem para o usuário.
    const { resp, modelo: usado, usouReserva } = await chamarGemini({ montarUrl, corpo, modelo, signal: controller.signal, rotulo: 'extracao-peca' });
    ctx.modelo = usado;
    ctx.usouReserva = usouReserva;
    const json = await resp.json();
    ctx.tokens = json?.usageMetadata?.totalTokenCount ?? null;
    const texto = json?.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('') || '';
    return JSON.parse(texto);
  } finally {
    clearTimeout(timer);
  }
}

