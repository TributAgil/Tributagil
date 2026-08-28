import { useState } from 'react';
import { Loader2, CheckCircle2, KeyRound } from 'lucide-react';
import { supabase } from '../lib/supabase';
import Logo from '../components/Logo';

// ============================================================
// REDEFINIR SENHA — tela aberta quando o usuário chega pelo link
// de recuperação enviado por e-mail (evento PASSWORD_RECOVERY).
// ============================================================

const MIN_SENHA = 8;

function traduzErro(mensagem = '') {
  const m = mensagem.toLowerCase();
  if (m.includes('should be different') || m.includes('same_password')) {
    return 'A nova senha precisa ser diferente da anterior.';
  }
  if (m.includes('at least') || m.includes('weak')) {
    return `Use uma senha mais forte (mínimo ${MIN_SENHA} caracteres).`;
  }
  if (m.includes('expired') || m.includes('invalid')) {
    return 'O link de recuperação expirou. Solicite um novo na tela de login.';
  }
  return mensagem || 'Não foi possível redefinir a senha.';
}

export default function RedefinirSenha({ onConcluido }) {
  const [senha, setSenha] = useState('');
  const [confirma, setConfirma] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [ok, setOk] = useState(false);

  const submeter = async (e) => {
    e.preventDefault();
    if (senha.length < MIN_SENHA) {
      setError(`A senha precisa de pelo menos ${MIN_SENHA} caracteres.`);
      return;
    }
    if (senha !== confirma) {
      setError('As senhas não coincidem.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const { error: err } = await supabase.auth.updateUser({ password: senha });
      if (err) {
        setError(traduzErro(err.message));
        return;
      }
      setOk(true);
      setTimeout(() => onConcluido?.(), 2000);
    } catch (err) {
      console.error('[RedefinirSenha] Erro inesperado:', err);
      setError('Não foi possível redefinir a senha agora. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  const inputCls =
    'w-full rounded-xl border border-line bg-ink-800/60 px-4 py-3 text-sm text-parchment ' +
    'placeholder:text-parchment/25 outline-none transition-all ' +
    'focus:border-gold/50 focus:bg-ink-800 focus:ring-2 focus:ring-gold/15';

  return (
    <div className="bg-noir flex min-h-screen items-center justify-center px-5 py-10 font-sans text-parchment">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <Logo size="md" />
        </div>

        <div className="rounded-[var(--radius-xl2)] border border-line bg-white/[0.035] p-8 shadow-[var(--shadow-gold)] backdrop-blur-xl">
          {ok ? (
            <div className="py-4 text-center">
              <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-full bg-gold/15">
                <CheckCircle2 size={28} className="text-gold" />
              </div>
              <h2 className="font-display text-xl text-parchment">Senha redefinida</h2>
              <p className="mt-2 text-sm text-parchment/50">
                Você já pode entrar com a nova senha.
              </p>
            </div>
          ) : (
            <>
              <div className="mb-1 flex items-center gap-2">
                <KeyRound size={18} className="text-gold" />
                <h2 className="font-display text-2xl text-parchment">Nova senha</h2>
              </div>
              <p className="mt-1 text-sm text-parchment/45">
                Escolha uma senha com pelo menos {MIN_SENHA} caracteres.
              </p>

              {error && (
                <div className="mt-5 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
                  {error}
                </div>
              )}

              <form onSubmit={submeter} className="mt-6 space-y-4">
                <div>
                  <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-parchment/40">
                    Nova senha
                  </label>
                  <input
                    type="password"
                    value={senha}
                    onChange={(e) => setSenha(e.target.value)}
                    required
                    autoComplete="new-password"
                    placeholder="••••••••"
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-parchment/40">
                    Confirmar senha
                  </label>
                  <input
                    type="password"
                    value={confirma}
                    onChange={(e) => setConfirma(e.target.value)}
                    required
                    autoComplete="new-password"
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
                             disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {loading ? (
                    <>
                      <Loader2 size={16} className="animate-spin" />
                      Salvando...
                    </>
                  ) : (
                    'Redefinir senha'
                  )}
                </button>
              </form>
            </>
          )}
        </div>

        <button
          onClick={() => onConcluido?.()}
          className="mt-6 block w-full text-center text-xs text-parchment/30 transition-colors hover:text-gold"
        >
          Voltar para o login
        </button>
      </div>
    </div>
  );
}
