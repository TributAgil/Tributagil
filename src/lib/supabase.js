import { createClient } from '@supabase/supabase-js';

/**
 * Cliente único (singleton) do Supabase.
 *
 * As credenciais são lidas de `import.meta.env`, que o Vite substitui em build time.
 * IMPORTANTE: somente variáveis com o prefixo `VITE_` são embutidas no bundle do
 * browser — por isso a chave `anon` (pública, protegida por RLS) fica aqui, mas
 * qualquer segredo real (service_role, chaves de IA, etc.) NUNCA deve usar esse prefixo.
 */
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Falha explícita e imediata: um deploy sem estas variáveis não deve "passar
// silenciosamente" e quebrar só quando o usuário tentar logar.
if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    '[Supabase] Variáveis de ambiente ausentes. Defina VITE_SUPABASE_URL e ' +
      'VITE_SUPABASE_ANON_KEY no arquivo .env (local) e em Project Settings → ' +
      'Environment Variables na Vercel.',
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
