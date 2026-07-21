import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

// Cliente aparte, sin persistSession/autoRefreshToken y con su propio
// storageKey, para que signUp() no reemplace la sesión del admin que
// está creando el usuario (signUp inicia sesión automáticamente como
// el usuario recién creado en el cliente que lo invoca).
export const supabaseNewUser = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
    storageKey: 'teamflow-newuser-temp',
  },
})
