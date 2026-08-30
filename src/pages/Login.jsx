import { useState, useRef, useEffect } from 'react';
import { Loader2, ArrowRight, MailCheck } from 'lucide-react';
import { supabase } from '../lib/supabase';
import Logo from '../components/Logo';
import CreditoAutor from '../components/CreditoAutor';

// Sitekey da hCaptcha (valor PÚBLICO — pode ficar no código). O secret key vive
// SÓ no painel do Supabase (Authentication → Attack Protection).
const HCAPTCHA_SITEKEY =
  import.meta.env.VITE_HCAPTCHA_SITEKEY || 'ac76753c-80fe-42c4-abe4-bd3a6fb236f2';

// Slogan da marca (com "TributÁgil" em destaque dourado).
const Slogan = ({ className = '' }) => (
  <span className={className}>
    Da decadência à prescrição, o <span className="text-gold">TributÁgil</span> é a solução.
  </span>
);

// Traduz as mensagens mais comuns do Supabase Auth para PT-BR.
function traduzErroAuth(mensagem = '') {
  const m = mensagem.toLowerCase();
  if (m.includes('invalid login credentials')) return 'E-mail ou senha incorretos.';
  if (m.includes('email not confirmed')) return 'Confirme seu e-mail antes de entrar.';
  if (m.includes('too many requests')) return 'Muitas tentativas. Aguarde alguns minutos.';
  return mensagem || 'Não foi possível concluir o login.';
}

export default function Login({ onLoginSuccess }) {
  // 'entrar' | 'recuperar' | 'enviado'
  const [modo, setModo] = useState('entrar');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // hCaptcha: o widget é montado via API explícita (window.hcaptcha.render)
  // porque o auto-scan não funciona bem com o ciclo de vida do React.
  const [captchaToken, setCaptchaToken] = useState('');
  const captchaRef = useRef(null);
  const widgetId = useRef(null);

  useEffect(() => {
    let cancelado = false;
    let intervalo = null;

    const montar = () => {
      if (cancelado || widgetId.current !== null) return;
      if (!window.hcaptcha?.render || !captchaRef.current) return;
      widgetId.current = window.hcaptcha.render(captchaRef.current, {
        sitekey: HCAPTCHA_SITEKEY,
        theme: 'dark',
        // O widget "normal" tem ~300px fixos e estoura em telas de 375px.
        // "compact" (~164px) cabe em qualquer celular.
        size: window.innerWidth < 480 ? 'compact' : 'normal',
        callback: (token) => setCaptchaToken(token),
        'expired-callback': () => setCaptchaToken(''),
        'error-callback': () => setCaptchaToken(''),
      });
    };

    if (window.hcaptcha?.render) montar();
    else intervalo = setInterval(montar, 200); // aguarda o script async carregar

    return () => {
      cancelado = true;
      if (intervalo) clearInterval(intervalo);
      if (window.hcaptcha?.remove && widgetId.current !== null) {
        try {
          window.hcaptcha.remove(widgetId.current);
        } catch {
          /* widget já removido */
        }
      }
      widgetId.current = null;
    };
  }, []);

  const resetarCaptcha = () => {
    setCaptchaToken('');
    if (window.hcaptcha?.reset && widgetId.current !== null) {
      try {
        window.hcaptcha.reset(widgetId.current);
      } catch {
        /* ignore */
      }
    }
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    if (!captchaToken) {
      setError('Confirme o "Não sou um robô" antes de entrar.');
      return;
    }
    setLoading(true);
    setError(null);

    try {
      const { data, error: authError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
        options: { captchaToken },
      });
      if (authError) {
        setError(traduzErroAuth(authError.message));
        resetarCaptcha(); // token da hCaptcha é de uso único
        return;
      }
      onLoginSuccess(data.user);
    } catch (err) {
      console.error('[Login] Erro inesperado:', err);
      setError('Não foi possível conectar ao servidor. Verifique sua conexão e tente novamente.');
      resetarCaptcha();
    } finally {
      setLoading(false);
    }
  };

  const handleRecuperar = async (e) => {
    e.preventDefault();
    if (!email.trim()) {
      setError('Informe o e-mail da sua conta.');
      return;
    }
    if (!captchaToken) {
      setError('Confirme o "Não sou um robô" antes de continuar.');
      return;
    }
    setLoading(true);
    setError(null);

    try {
      const { error: err } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        captchaToken,
        redirectTo: window.location.origin,
      });
      resetarCaptcha(); // token de uso único
      if (err) {
        // Não revelamos se o e-mail existe — mensagem neutra em quase todo caso.
        if (/too many requests/i.test(err.message)) {
          setError('Muitas tentativas. Aguarde alguns minutos.');
          return;
        }
        console.warn('[Login] resetPasswordForEmail:', err.message);
      }
      setModo('enviado');
    } catch (err) {
      console.error('[Login] Erro ao pedir recuperação:', err);
      setError('Não foi possível enviar o link agora. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  const irPara = (novoModo) => {
    setModo(novoModo);
    setError(null);
    setPassword('');
    resetarCaptcha();
  };

  const inputCls =
    'w-full rounded-xl border border-line bg-ink-800/60 px-4 py-3 text-sm text-parchment ' +
    'placeholder:text-parchment/25 outline-none transition-all ' +
    'focus:border-gold/50 focus:bg-ink-800 focus:ring-2 focus:ring-gold/15';

  return (
    <div className="bg-noir grid min-h-screen font-sans text-parchment lg:grid-cols-2">
      {/* ===================== COLUNA BRANDING ===================== */}
      <aside className="relative hidden flex-col justify-between overflow-hidden border-r border-line p-14 lg:flex xl:p-16">
        <div className="login-pillars" aria-hidden="true" />
        <div className="login-sheen" aria-hidden="true" />

        <header className="relative -mx-14 -mt-14 mb-2 border-b border-line bg-ink-900/40 px-14 py-9 xl:-mx-16 xl:-mt-16 xl:px-16">
          <Logo size="xl" />
        </header>

        <div className="relative max-w-lg">
          <h1 className="text-balance font-display text-4xl font-semibold leading-[1.14] text-parchment xl:text-5xl">
            <Slogan />
          </h1>
          <p className="mt-6 leading-relaxed text-parchment/55">
            Perícia tributária assistida por IA — prescrição, decadência e prescrição
            intercorrente, com rigor e rastreabilidade.
          </p>
          <ul className="mt-9 space-y-3 text-sm text-parchment/45">
            {['CTN · LEF · Súmulas do STJ e STF',
              'Parecer estruturado em minutos',
              'Zero alucinação — apenas o que está nos autos'].map((t) => (
              <li key={t} className="flex items-center gap-3">
                <span className="h-px w-7 bg-gold/60" />
                {t}
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-xs text-parchment/25">
          © {new Date().getFullYear()} TributÁgil · Acesso restrito a advogados cadastrados
        </p>
      </aside>

      {/* ===================== COLUNA FORMULÁRIO ===================== */}
      {/* min-w-0: impede o "blowout" do grid quando um filho rígido (o widget
          da hCaptcha) tenta forçar a coluna a ficar maior que a tela. */}
      <main className="flex min-w-0 items-center justify-center px-5 py-10 sm:px-6 sm:py-16">
        <div className="w-full max-w-sm">
          {/* Marca compacta no mobile */}
          <div className="-mx-5 mb-9 flex flex-col items-center border-b border-line px-5 pb-7 text-center sm:-mx-6 sm:px-6 lg:hidden">
            <Logo size="lg" />
            <Slogan className="mt-5 block text-balance font-display text-lg leading-snug text-parchment/90" />
          </div>

          <div className="rounded-[var(--radius-xl2)] border border-line bg-white/[0.035] p-8 shadow-[var(--shadow-gold)] backdrop-blur-xl">
            {modo === 'enviado' ? (
              <div className="py-4 text-center">
                <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-full bg-gold/15">
                  <MailCheck size={26} className="text-gold" />
                </div>
                <h2 className="font-display text-xl text-parchment">Verifique seu e-mail</h2>
                <p className="mt-2 text-sm text-parchment/50">
                  Se houver uma conta para <span className="text-parchment/80">{email.trim()}</span>,
                  enviamos um link para redefinir a senha. O link expira em 1 hora.
                </p>
              </div>
            ) : (
              <>
                <h2 className="font-display text-2xl text-parchment">
                  {modo === 'recuperar' ? 'Recuperar acesso' : 'Entrar'}
                </h2>
                <p className="mt-1 text-sm text-parchment/45">
                  {modo === 'recuperar'
                    ? 'Enviaremos um link de redefinição para o seu e-mail.'
                    : 'Acesse seu ecossistema jurídico.'}
                </p>

                {error && (
                  <div className="mt-5 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
                    {error}
                  </div>
                )}

                <form
                  onSubmit={modo === 'recuperar' ? handleRecuperar : handleLogin}
                  className="mt-6 space-y-4"
                >
                  <div>
                    <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-parchment/40">
                      E-mail
                    </label>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      autoComplete="email"
                      placeholder="voce@escritorio.com"
                      className={inputCls}
                    />
                  </div>

                  {modo === 'entrar' && (
                    <div>
                      <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-parchment/40">
                        Senha
                      </label>
                      <input
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                        autoComplete="current-password"
                        placeholder="••••••••"
                        className={inputCls}
                      />
                    </div>
                  )}

                  <div ref={captchaRef} className="flex min-h-[78px] justify-center pt-1" />

                  <button
                    type="submit"
                    disabled={loading || !captchaToken}
                    className="cursor-gavel mt-2 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gold px-4 py-3
                               text-sm font-semibold text-ink shadow-[0_12px_34px_-12px_rgba(212,175,55,0.55)]
                               transition-all duration-300 hover:bg-gold-soft active:scale-[0.985]
                               disabled:cursor-not-allowed disabled:opacity-60
                               focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold"
                  >
                    {loading ? (
                      <>
                        <Loader2 size={16} className="animate-spin" />
                        {modo === 'recuperar' ? 'Enviando...' : 'Entrando...'}
                      </>
                    ) : modo === 'recuperar' ? (
                      'Enviar link de recuperação'
                    ) : (
                      <>
                        Entrar
                        <ArrowRight size={16} />
                      </>
                    )}
                  </button>
                </form>
              </>
            )}

            <div className="mt-5 text-center text-xs">
              {modo === 'entrar' ? (
                <button
                  type="button"
                  onClick={() => irPara('recuperar')}
                  className="text-parchment/45 transition-colors hover:text-gold"
                >
                  Esqueci minha senha
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => irPara('entrar')}
                  className="text-parchment/45 transition-colors hover:text-gold"
                >
                  ← Voltar para o login
                </button>
              )}
            </div>
          </div>

          <p className="mt-6 text-center text-xs text-parchment/30">
            Problemas de acesso? Fale com a administração do escritório.
          </p>

          <nav className="mt-4 flex items-center justify-center gap-4 text-xs text-parchment/35">
            <a href="/privacidade.html" target="_blank" rel="noopener noreferrer" className="transition-colors hover:text-gold">
              Privacidade
            </a>
            <span aria-hidden="true">·</span>
            <a href="/termos.html" target="_blank" rel="noopener noreferrer" className="transition-colors hover:text-gold">
              Termos de Uso
            </a>
          </nav>

          <CreditoAutor className="mt-4" />
        </div>
      </main>
    </div>
  );
}
