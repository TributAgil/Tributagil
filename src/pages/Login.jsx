import { useState } from 'react';
import { Loader2, ArrowRight } from 'lucide-react';
import { supabase } from '../lib/supabase';
import Logo from '../components/Logo';

// Troque à vontade — ver opções no chat.
const SLOGAN = 'O tempo, agora, joga a seu favor.';

// Traduz as mensagens mais comuns do Supabase Auth para PT-BR.
function traduzErroAuth(mensagem = '') {
  const m = mensagem.toLowerCase();
  if (m.includes('invalid login credentials')) return 'E-mail ou senha incorretos.';
  if (m.includes('email not confirmed')) return 'Confirme seu e-mail antes de entrar.';
  if (m.includes('too many requests')) return 'Muitas tentativas. Aguarde alguns minutos.';
  return mensagem || 'Não foi possível concluir o login.';
}

export default function Login({ onLoginSuccess }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const { data, error: authError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (authError) {
        setError(traduzErroAuth(authError.message));
        return;
      }
      onLoginSuccess(data.user);
    } catch (err) {
      console.error('[Login] Erro inesperado:', err);
      setError('Não foi possível conectar ao servidor. Verifique sua conexão e tente novamente.');
    } finally {
      setLoading(false);
    }
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

        <div className="relative">
          <Logo size="lg" />
        </div>

        <div className="relative max-w-md">
          <h1 className="text-balance font-display text-4xl font-semibold leading-[1.12] text-parchment xl:text-[3.25rem]">
            {SLOGAN}
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
      <main className="flex items-center justify-center px-6 py-16">
        <div className="w-full max-w-sm">
          {/* Marca compacta no mobile */}
          <div className="mb-9 flex flex-col items-center text-center lg:hidden">
            <Logo size="md" />
            <p className="mt-5 text-balance font-display text-xl text-parchment/90">{SLOGAN}</p>
          </div>

          <div className="rounded-[var(--radius-xl2)] border border-line bg-white/[0.035] p-8 shadow-[var(--shadow-gold)] backdrop-blur-xl">
            <h2 className="font-display text-2xl text-parchment">Entrar</h2>
            <p className="mt-1 text-sm text-parchment/45">Acesse seu ecossistema jurídico.</p>

            {error && (
              <div className="mt-5 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
                {error}
              </div>
            )}

            <form onSubmit={handleLogin} className="mt-6 space-y-4">
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

              <button
                type="submit"
                disabled={loading}
                className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gold px-4 py-3
                           text-sm font-semibold text-ink shadow-[0_12px_34px_-12px_rgba(212,175,55,0.55)]
                           transition-all duration-300 hover:bg-gold-soft active:scale-[0.985]
                           disabled:cursor-not-allowed disabled:opacity-60
                           focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold"
              >
                {loading ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    Entrando...
                  </>
                ) : (
                  <>
                    Entrar
                    <ArrowRight size={16} />
                  </>
                )}
              </button>
            </form>
          </div>

          <p className="mt-6 text-center text-xs text-parchment/30">
            Problemas de acesso? Fale com a administração do escritório.
          </p>
        </div>
      </main>
    </div>
  );
}
