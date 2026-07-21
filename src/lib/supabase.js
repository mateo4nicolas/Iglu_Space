import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

// iOS Safari ITP: use explicit localStorage adapter
const safariStorage = {
  getItem: function(key) {
    try { return window.localStorage.getItem(key) } catch(e) { return null }
  },
  setItem: function(key, value) {
    try { window.localStorage.setItem(key, value) } catch(e) {}
  },
  removeItem: function(key) {
    try { window.localStorage.removeItem(key) } catch(e) {}
  },
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
    storage: safariStorage,
    storageKey: 'teamflow-auth-v1',
  },
})
