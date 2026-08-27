import { createClient } from '@supabase/supabase-js'

// Tipagem direta para o TypeScript aceitar o import.meta.env
const importMeta = import.meta as any

const supabaseUrl = importMeta.env.VITE_SUPABASE_URL as string
const supabaseAnonKey = importMeta.env.VITE_SUPABASE_ANON_KEY as string

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Faltam as variáveis de ambiente do Supabase no arquivo .env!')
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)