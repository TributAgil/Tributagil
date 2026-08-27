// api/contato.js
//
// Recebe as mensagens do "Central de Suporte" (feedback e report de bug) e as
// encaminha por e-mail para a caixa corporativa.
//
// Segurança:
//   - O DESTINATÁRIO é definido no servidor (env), nunca pelo cliente — assim o
//     endpoint não pode ser usado como "open relay" para spam a terceiros.
//   - Honeypot anti-bot: o campo `website` é invisível no formulário; se vier
//     preenchido, tratamos como bot e descartamos silenciosamente.
//   - Toda entrada do usuário é sanitizada e truncada antes de ir para o e-mail.
//   - O screenshot é validado (tipo e tamanho) antes de virar anexo.
//   - Sem RESEND_API_KEY o endpoint apenas registra a mensagem (útil em dev/preview)
//     e responde 202, sem quebrar o fluxo do formulário.

export const config = { runtime: 'edge' };

const DESTINATARIO = process.env.CONTATO_EMAIL_TO || 'contato@tributagil.online';
const REMETENTE = process.env.CONTATO_EMAIL_FROM || 'TributÁgil <no-reply@tributagil.online>';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Caracteres de controle ASCII (U+0000–U+001F e U+007F): removidos para evitar
// header injection e lixo no corpo do e-mail.
const CONTROLE_RE = new RegExp('[\\u0000-\\u001F\\u007F]', 'g');
// data URL de imagem: data:image/png;base64,AAAA...
const DATA_URL_RE = /^data:(image\/(png|jpe?g|webp));base64,([A-Za-z0-9+/=]+)$/;
const SCREENSHOT_MAX_BYTES = 4 * 1024 * 1024; // ~4 MB já decodificado

export default async function handler(req) {
  if (req.method !== 'POST') {
    return json({ error: 'Método não permitido. Use POST.' }, 405);
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Corpo inválido — envie um JSON.' }, 400);
  }

  // Honeypot: bots costumam preencher todos os campos.
  if (typeof body.website === 'string' && body.website.trim() !== '') {
    return json({ ok: true }, 200);
  }

  const tipo = body.tipo === 'bug' ? 'bug' : 'feedback';
  const emailUsuario = sanitize(body.email, 160);
  const mensagem = sanitize(body.comentario ?? body.descricao, 5000);
  const passos = sanitize(body.passos, 3000);
  const avaliacao = sanitize(String(body.avaliacao ?? ''), 3);
  const tipoBug = sanitize(body.tipoProblema ?? body.tipo_bug, 80);

  // ---- Validação -----------------------------------------------------------
  if (!mensagem) {
    return json({ error: 'Escreva sua mensagem antes de enviar.' }, 400);
  }
  if (emailUsuario && !EMAIL_RE.test(emailUsuario)) {
    return json({ error: 'O e-mail informado é inválido.' }, 400);
  }
  if (tipo === 'bug' && !emailUsuario) {
    return json({ error: 'Informe um e-mail para retorno do suporte.' }, 400);
  }

  // ---- Screenshot (opcional) ---------------------------------------------
  let anexo = null;
  if (body.screenshotBase64) {
    const match = String(body.screenshotBase64).match(DATA_URL_RE);
    if (!match) {
      return json({ error: 'A captura de tela deve ser uma imagem PNG, JPG ou WEBP.' }, 400);
    }
    const base64 = match[3];
    const bytes = Math.floor((base64.length * 3) / 4);
    if (bytes > SCREENSHOT_MAX_BYTES) {
      return json({ error: 'A captura de tela excede o limite de 4 MB.' }, 413);
    }
    const ext = match[1] === 'image/jpeg' ? 'jpg' : match[1].split('/')[1];
    anexo = {
      filename: sanitize(body.screenshotNome, 120) || `screenshot.${ext}`,
      content: base64, // Resend aceita string base64 pura
    };
  }

  // ---- Montagem do e-mail ------------------------------------------------
  const assunto =
    tipo === 'bug'
      ? `[BUG] ${tipoBug || 'Não especificado'}`
      : `[Feedback] TributÁgil${avaliacao ? ` — ${avaliacao}/5` : ''}`;

  const corpo = [
    `Tipo .............: ${tipo}`,
    `Data .............: ${new Date().toISOString()}`,
    `E-mail do usuário : ${emailUsuario || 'não informado'}`,
    tipo === 'feedback' && avaliacao ? `Avaliação ........: ${avaliacao}/5` : null,
    tipo === 'bug' && tipoBug ? `Categoria ........: ${tipoBug}` : null,
    `Screenshot .......: ${anexo ? anexo.filename : 'nenhum'}`,
    '',
    'Mensagem:',
    mensagem,
    tipo === 'bug' && passos ? `\nPassos para reproduzir:\n${passos}` : null,
    '',
    '— Enviado via TributÁgil / Central de Suporte',
  ]
    .filter((linha) => linha !== null)
    .join('\n');

  // ---- Envio -----------------------------------------------------------
  const RESEND_API_KEY = process.env.RESEND_API_KEY;
  if (!RESEND_API_KEY) {
    console.warn('[api/contato] RESEND_API_KEY ausente — mensagem apenas registrada:', {
      assunto,
      emailUsuario,
      temAnexo: !!anexo,
    });
    return json({ ok: true, delivered: false }, 202);
  }

  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: REMETENTE,
        to: [DESTINATARIO],
        subject: assunto,
        text: corpo,
        ...(emailUsuario ? { reply_to: emailUsuario } : {}),
        ...(anexo ? { attachments: [anexo] } : {}),
      }),
    });

    if (!r.ok) {
      const detalhe = await r.text().catch(() => '');
      console.error('[api/contato] Resend falhou:', r.status, detalhe);
      return json({ error: 'Não foi possível enviar sua mensagem agora. Tente novamente.' }, 502);
    }

    return json({ ok: true, delivered: true }, 200);
  } catch (err) {
    console.error('[api/contato] Erro de rede:', err);
    return json({ error: 'Erro de rede ao enviar a mensagem.' }, 502);
  }
}

// Remove caracteres de controle, apara espaços e trunca no tamanho máximo.
function sanitize(valor, max) {
  if (valor == null) return '';
  return String(valor).replace(CONTROLE_RE, ' ').trim().slice(0, max);
}

function json(data, status) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}
