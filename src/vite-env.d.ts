/// <reference types="vite/client" />

/**
 * Tipagem forte para as variáveis de ambiente expostas ao browser.
 * Substitui a antiga gambiarra `const importMeta = import.meta as any`.
 */
interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
