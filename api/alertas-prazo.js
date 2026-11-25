// api/alertas-prazo.js
//
// Alerta de prazo da carteira, por e-mail. Roda uma vez por dia pelo cron da Vercel (vercel.json, "crons"):
//   1. pede ao banco os marcos 'acompanhar' cuja data já passou e que ainda não viraram aviso
//      (RPC alertas_prazo_pendentes, exige o segredo do servidor; docs/sql/carteira.sql);
//   2. manda UM e-mail por advogado, com todos os prazos dele que se consumaram (Resend, mesmo remetente do contato);
//   3. marca como avisados só os que foram de fato enviados (marcar_alertas_enviados). Se o e-mail falhar, o aviso
//      fica pendente e sai no dia seguinte.
//
// Segurança: só o cron da Vercel chama (Authorization: Bearer CRON_SECRET); sem CRON_SECRET configurado, recusa.
// O banco é lido com a chave anon + o segredo SUPABASE_RPC_SEGREDO (nada de service role em api/).
//
// Arquivo na raiz de /api: é endpoint.

const SUPABASE_URL_ENV = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
const SUPABASE_ANON_ENV = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';
const REMETENTE = process.env.CONTATO_EMAIL_FROM || 'TributÁgil <no-reply@tributagil.online>';
const URL_APP = process.env.APP_URL || 'https://tributagil-woad.vercel.app';

const NOME_TESE = {
  prescricao_ordinaria: 'Prescrição ordinária',
  decadencia: 'Decadência',
  prescricao_intercorrente: 'Prescrição intercorrente',
};

const escapar = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const dataBR = (iso) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
  return m ? `${m[3]}/${m[2]}/${m[1]}` : String(iso || '');
};

/** Um e-mail por advogado: agrupa os marcos por e-mail e, dentro dele, por caso. */
export function agruparPorAdvogado(linhas) {
  const porEmail = new Map();
  for (const l of Array.isArray(linhas) ? linhas : []) {
    if (!l?.email) continue;
    if (!porEmail.has(l.email)) porEmail.set(l.email, { email: l.email, ids: [], casos: new Map() });
    const g = porEmail.get(l.email);
    g.ids.push(l.id);
    if (!g.casos.has(l.caso_id)) g.casos.set(l.caso_id, { titulo: l.titulo, marcos: [] });
    g.casos.get(l.caso_id).marcos.push(l);
  }
  return [...porEmail.values()].map((g) => ({ ...g, casos: [...g.casos.values()] }));
}

const descreverMarco = (m) => {
  const onde = [m.cda && `CDA ${m.cda}`, m.periodo && `período ${m.periodo}`].filter(Boolean).join(', ');
  return `${NOME_TESE[m.tese] || m.tese}${onde ? ` (${onde})` : ''}: consumou em ${dataBR(m.data)}${m.condicao ? `, ${m.condicao}` : ''}.`;
};

/** Assunto, texto e HTML do e-mail de um advogado. */
export function montarEmail(grupo) {
  const total = grupo.casos.reduce((n, c) => n + c.marcos.length, 0);
  const assunto = `TributÁgil: ${total} prazo(s) se consumaram nos seus casos`;
  const texto = [
    'Pelo cálculo do TributÁgil, estes prazos se consumaram:',
    '',
    ...grupo.casos.flatMap((c) => [c.titulo, ...c.marcos.map((m) => `  - ${descreverMarco(m)}`), '']),
    'Confira nos autos se houve algum ato que interrompeu o prazo e, se não houve, gere a peça na análise do caso.',
    `Carteira: ${URL_APP}`,
    '',
    'Cálculo automático: confira antes de protocolar. Para não receber avisos de um caso, marque-o como arquivado na carteira.',
  ].join('\n');
  const html = `<div style="font-family:Arial,sans-serif;font-size:14px;color:#1a1a1a;max-width:640px">
<p>Pelo cálculo do <b>TributÁgil</b>, estes prazos se consumaram:</p>
${grupo.casos
  .map((c) => `<p style="margin:16px 0 4px"><b>${escapar(c.titulo)}</b></p><ul style="margin:0;padding-left:20px">${c.marcos
    .map((m) => `<li>${escapar(descreverMarco(m))}</li>`)
    .join('')}</ul>`)
  .join('\n')}
<p>Confira nos autos se houve algum ato que interrompeu o prazo e, se não houve, gere a peça na análise do caso.</p>
<p><a href="${escapar(URL_APP)}" style="display:inline-block;background:#facc15;color:#000;font-weight:bold;padding:10px 16px;border-radius:8px;text-decoration:none">Abrir a carteira</a></p>
<p style="color:#666;font-size:12px">Cálculo automático: confira antes de protocolar. Para não receber avisos de um caso, marque-o como arquivado na carteira.</p>
</div>`;
  return { assunto, texto, html };
}

export async function GET(request) {
  const inicio = Date.now();
  const ctx = { pendentes: 0, enviados: 0, falhas: 0 };
  let resposta;
  try {
    resposta = await processar(request, ctx);
    return resposta;
  } finally {
    console.log(JSON.stringify({ evento: 'api_alertas_prazo', ...ctx, httpStatus: resposta?.status ?? null, duracaoMs: Date.now() - inicio }));
  }
}

async function processar(request, ctx) {
  const cronSecret = process.env.CRON_SECRET || '';
  if (!cronSecret) {
    console.error('[api/alertas-prazo] CRON_SECRET ausente: endpoint desligado.');
    return json({ error: 'Não configurado.' }, 503);
  }
  if ((request.headers.get('authorization') || '') !== `Bearer ${cronSecret}`) return json({ error: 'Não autorizado.' }, 401);

  const segredo = process.env.SUPABASE_RPC_SEGREDO || '';
  if (!SUPABASE_URL_ENV || !SUPABASE_ANON_ENV || !segredo) {
    console.error('[api/alertas-prazo] SUPABASE_URL/SUPABASE_ANON_KEY/SUPABASE_RPC_SEGREDO ausentes.');
    return json({ error: 'Configuração do servidor ausente.' }, 500);
  }
  const rpc = async (nome, params) => {
    const resp = await fetch(`${SUPABASE_URL_ENV}/rest/v1/rpc/${nome}`, {
      method: 'POST',
      headers: { apikey: SUPABASE_ANON_ENV, Authorization: `Bearer ${SUPABASE_ANON_ENV}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_segredo: segredo, ...params }),
    });
    if (!resp.ok) throw new Error(`RPC ${nome} HTTP ${resp.status}: ${(await resp.text().catch(() => '')).slice(0, 200)}`);
    return resp.json();
  };

  let linhas;
  try {
    linhas = await rpc('alertas_prazo_pendentes', {});
  } catch (err) {
    console.error('[api/alertas-prazo] Falha ao ler os prazos pendentes:', err?.message);
    return json({ error: 'Falha ao ler os prazos.' }, 502);
  }
  ctx.pendentes = Array.isArray(linhas) ? linhas.length : 0;
  if (!ctx.pendentes) return json({ ok: true, pendentes: 0, enviados: 0 }, 200);

  const resendKey = process.env.RESEND_API_KEY || '';
  if (!resendKey) {
    // sem e-mail configurado os avisos ficam pendentes (não marca), para sair quando houver
    console.warn('[api/alertas-prazo] RESEND_API_KEY ausente: avisos ficam pendentes.');
    return json({ ok: false, pendentes: ctx.pendentes, enviados: 0 }, 503);
  }

  for (const grupo of agruparPorAdvogado(linhas)) {
    const { assunto, texto, html } = montarEmail(grupo);
    try {
      const r = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: REMETENTE, to: [grupo.email], subject: assunto, text: texto, html }),
      });
      if (!r.ok) throw new Error(`Resend HTTP ${r.status}`);
      await rpc('marcar_alertas_enviados', { p_ids: grupo.ids });
      ctx.enviados += 1;
    } catch (err) {
      ctx.falhas += 1;
      console.error('[api/alertas-prazo] Falha ao avisar um advogado (fica para amanhã):', err?.message);
    }
  }
  return json({ ok: ctx.falhas === 0, pendentes: ctx.pendentes, enviados: ctx.enviados, falhas: ctx.falhas }, 200);
}

function json(data, status) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json; charset=utf-8' } });
}
