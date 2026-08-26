import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://jegowovgiqckhtlrrfxv.supabase.co'
const supabaseAnonKey = 'sb_publishable_EVPU2JhEPPkgL68c2F1W9A__oEKO_2w'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)