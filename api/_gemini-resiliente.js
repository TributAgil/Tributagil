// api/_gemini-resiliente.js
//
// Chamada ao Gemini que aguenta sobrecarga. Usada pela leitura dos documentos da peça (api/_extracao-peca.js) e pelas
// duas fases do parecer (api/gemini.js), para as três tratarem 429/500/502/503/504 do mesmo jeito:
//
//   1. erro transitório (503 "high demand", 502, 500, 504, 429 por minuto, falha de rede): tenta de novo no MESMO modelo
//      com esperas crescentes (2s, 5s, 12s);
//   2. se continuar, e se houver GEMINI_MODEL_RESERVA, tenta o modelo de reserva (que tem fila e cota próprias);
//   3. se nada funcionar, falha com uma mensagem clara para o usuário (ErroGemini.mensagemUsuario) e o status HTTP certo.
//
// Cota DIÁRIA esgotada (plano gratuito: "retry in 10h...") NÃO é repetida no mesmo modelo, porque só gasta cota: vai
// direto para o modelo de reserva (a cota gratuita é por modelo) e, não havendo, falha na hora.
//
// 402 (créditos pré-pagos esgotados ou ainda não liberados): repete como os transitórios; se persistir, o cliente vê só
// "serviço temporariamente indisponível" e o log recebe [ALERTA-GEMINI-CREDITOS] para o dono do sistema agir.
//
// Erro que repetir não resolve (400 schema recusado, 401/403 chave, 404 modelo inexistente) falha na hora e NÃO aciona a
// reserva: o defeito está na requisição ou na chave, não na disponibilidade do modelo.
//
// Arquivo com prefixo "_": a Vercel não o expõe como endpoint.

const ESPERAS_PADRAO_MS = [2000, 5000, 12000];
const ESPERA_MAXIMA_DICA_MS = 20_000; // se o Gemini disser "retry in 12s", respeita, até este teto
const COTA_DIARIA_MIN_SEGUNDOS = 90; // "retry in" acima disto = cota diária (não adianta esperar)
const TRANSITORIOS = new Set([429, 500, 502, 503, 504]);

export const MENSAGEM_SOBRECARGA =
  'O Gemini (a IA do Google) está sobrecarregado neste momento. Aguarde alguns minutos e tente de novo.';

// 402 = créditos pré-pagos do projeto esgotados (ou crédito recém-comprado que o Google ainda não propagou: logo após a
// compra, as chamadas alternaram entre 200 e 402 por cerca de uma hora). Assunto do dono do sistema, não do cliente: o
// cliente só vê que o serviço está indisponível; o motivo real vai para o log, com um marcador fácil de buscar.
export const MENSAGEM_INDISPONIVEL = 'O serviço de IA está temporariamente indisponível. Tente novamente em alguns minutos.';
export const MARCADOR_ALERTA_CREDITOS = '[ALERTA-GEMINI-CREDITOS]';

export class ErroGemini extends Error {
  /**
   * @param {'sobrecarga'|'cota'|'creditos'|'erro'} tipo
   * @param {number} statusGemini  status HTTP que o Gemini devolveu (0 = falha de rede)
   * @param {object} [extras]      { segundos } para cota
   */
  constructor(tipo, statusGemini, extras = {}) {
    super(`Gemini: ${tipo} (HTTP ${statusGemini})`);
    this.name = 'ErroGemini';
    this.tipo = tipo;
    this.statusGemini = statusGemini;
    this.segundos = extras.segundos || 0;
    this.cotaEsgotada = tipo === 'cota'; // compatível com o executor dos casos fictícios
  }

  /** Status HTTP que o NOSSO endpoint devolve ao navegador. */
  get statusHttp() {
    if (this.tipo === 'cota') return 429;
    if (this.tipo === 'sobrecarga' || this.tipo === 'creditos') return 503;
    return 502;
  }

  get mensagemUsuario() {
    if (this.tipo === 'sobrecarga') return MENSAGEM_SOBRECARGA;
    if (this.tipo === 'creditos') return MENSAGEM_INDISPONIVEL;
    if (this.tipo === 'cota') {
      const quando = this.segundos > 0 ? ` Tente de novo em cerca de ${duracaoPorExtenso(this.segundos)}.` : ' Tente de novo mais tarde.';
      return `O limite de uso da IA (Gemini) foi atingido.${quando}`;
    }
    return `Falha na API do Gemini (HTTP ${this.statusGemini}).`;
  }

  /** Código estável para o navegador. Crédito esgotado não é exposto ao cliente: aparece como "indisponível". */
  get codigo() {
    return this.tipo === 'creditos' ? 'gemini_indisponivel' : `gemini_${this.tipo}`;
  }

  /** Cabeçalho Retry-After (segundos) para o navegador, quando faz sentido. */
  get retryAfterSegundos() {
    if (this.tipo === 'sobrecarga') return 120;
    if (this.tipo === 'creditos') return 300;
    if (this.tipo === 'cota' && this.segundos > 0) return Math.min(this.segundos, 3600);
    return 0;
  }
}

function duracaoPorExtenso(segundos) {
  if (segundos >= 3600) return `${Math.ceil(segundos / 3600)} h`;
  return `${Math.max(1, Math.ceil(segundos / 60))} min`;
}

/** Lê "retry in 10h13m16.34s" / "retry in 12s" do corpo de erro do Gemini; 0 se não houver. */
export function segundosDeEspera(detalhe) {
  const m = /retry in (?:(\d+)h)?(?:(\d+)m)?([\d.]+)s/i.exec(String(detalhe || ''));
  if (!m) return 0;
  return Number(m[1] || 0) * 3600 + Number(m[2] || 0) * 60 + Number(m[3] || 0);
}

function dormirPadrao(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(Object.assign(new Error('Aborted'), { name: 'AbortError' }));
    const t = setTimeout(() => { signal?.removeEventListener('abort', onAbort); resolve(); }, ms);
    function onAbort() { clearTimeout(t); reject(Object.assign(new Error('Aborted'), { name: 'AbortError' })); }
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

/** Uma rodada de tentativas num único modelo. Devolve { resp } ou { falha: { tipo, status, segundos } }. */
async function tentarModelo({ url, corpo, signal, esperasMs, dormir, rotulo, modelo }) {
  for (let tentativa = 0; ; tentativa++) {
    let resp;
    try {
      resp = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: corpo, signal });
    } catch (err) {
      if (err?.name === 'AbortError') throw err;
      // falha de rede até o Google: transitória
      console.warn(`[${rotulo}] ${modelo}: falha de rede (${err?.message})`);
      if (tentativa >= esperasMs.length) return { falha: { tipo: 'sobrecarga', status: 0, segundos: 0 } };
      await dormir(esperasMs[tentativa], signal);
      continue;
    }

    if (resp.ok) return { resp };

    // Corpo do erro do Gemini (schema recusado, modelo inexistente, cota...): sem isto o 400 é indecifrável nos logs.
    const detalhe = await resp.text().catch(() => '');
    console.error(`[${rotulo}] Gemini erro ${resp.status} (${modelo}):`, detalhe.slice(0, 800));

    const dica = resp.status === 429 ? segundosDeEspera(detalhe) : 0;
    if (resp.status === 429 && dica > COTA_DIARIA_MIN_SEGUNDOS) {
      return { falha: { tipo: 'cota', status: 429, segundos: dica } };
    }
    // 402: tenta de novo (a propagação do crédito é intermitente); se persistir, vira "creditos" e NÃO aciona a reserva,
    // porque o crédito é do projeto e o modelo de reserva cai no mesmo 402.
    if (resp.status === 402) {
      if (tentativa >= esperasMs.length) return { falha: { tipo: 'creditos', status: 402, segundos: 0 } };
      console.warn(`[${rotulo}] HTTP 402 em ${modelo}: nova tentativa ${tentativa + 1}/${esperasMs.length} em ${esperasMs[tentativa]} ms`);
      await dormir(esperasMs[tentativa], signal);
      continue;
    }
    if (!TRANSITORIOS.has(resp.status)) return { falha: { tipo: 'erro', status: resp.status, segundos: 0 } };
    if (tentativa >= esperasMs.length) return { falha: { tipo: resp.status === 429 ? 'cota' : 'sobrecarga', status: resp.status, segundos: dica } };

    const espera = Math.max(esperasMs[tentativa], Math.min(dica * 1000, ESPERA_MAXIMA_DICA_MS));
    console.warn(`[${rotulo}] HTTP ${resp.status} em ${modelo}: nova tentativa ${tentativa + 1}/${esperasMs.length} em ${espera} ms`);
    await dormir(espera, signal);
  }
}

/**
 * @param {object} args
 * @param {(modelo: string) => string} args.montarUrl   monta a URL do endpoint para um modelo
 * @param {string} args.corpo                           JSON já serializado
 * @param {string} args.modelo                          modelo principal
 * @param {AbortSignal} [args.signal]                   o mesmo timeout de quem chama vale para a rodada inteira
 * @param {string} [args.modeloReserva]                 padrão: process.env.GEMINI_MODEL_RESERVA
 * @param {number[]} [args.esperasMs]
 * @param {(ms: number, signal?: AbortSignal) => Promise<void>} [args.dormir]   injetável nos testes
 * @param {string} [args.rotulo]                        prefixo dos logs
 * @returns {Promise<{ resp: Response, modelo: string, usouReserva: boolean }>}
 * @throws {ErroGemini | Error} AbortError se o timeout de quem chama estourar
 */
export async function chamarGemini({
  montarUrl, corpo, modelo, signal,
  modeloReserva = process.env.GEMINI_MODEL_RESERVA || '',
  esperasMs = ESPERAS_PADRAO_MS, dormir = dormirPadrao, rotulo = 'gemini',
}) {
  const reserva = String(modeloReserva || '').trim();
  const modelos = reserva && reserva !== modelo ? [modelo, reserva] : [modelo];

  let falhaPrincipal;
  for (let i = 0; i < modelos.length; i++) {
    const m = modelos[i];
    const r = await tentarModelo({ url: montarUrl(m), corpo, signal, esperasMs, dormir, rotulo, modelo: m });
    if (r.resp) {
      if (i > 0) console.warn(`[${rotulo}] atendido pelo modelo de reserva ${m} (o principal ${modelo} falhou: ${falhaPrincipal?.tipo} HTTP ${falhaPrincipal?.status})`);
      return { resp: r.resp, modelo: m, usouReserva: i > 0 };
    }
    if (i === 0) falhaPrincipal = r.falha;
    else console.error(`[${rotulo}] modelo de reserva ${m} também falhou: ${r.falha.tipo} HTTP ${r.falha.status}`);
    // defeito da requisição/chave (ou crédito do projeto, que a reserva também usaria): a reserva não resolveria
    if (i === 0 && (r.falha.tipo === 'erro' || r.falha.tipo === 'creditos')) break;
  }
  if (falhaPrincipal.tipo === 'creditos') {
    console.error(`${MARCADOR_ALERTA_CREDITOS} [${rotulo}] O Gemini recusou a chamada com HTTP 402 depois de todas as tentativas: créditos pré-pagos esgotados ou ainda não liberados. Confira o saldo em aistudio.google.com > Faturamento e recarregue.`);
  }
  throw new ErroGemini(falhaPrincipal.tipo, falhaPrincipal.status, { segundos: falhaPrincipal.segundos });
}
