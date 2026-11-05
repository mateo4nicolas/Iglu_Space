import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

// Diseño editable de una tabla (títulos, columnas ocultas y columnas propias).
// Lo comparten todos los usuarios; solo un admin puede cambiarlo.
export const CUSTOM_TIPOS = [
  { value: 'texto', label: 'Texto' },
  { value: 'fecha', label: 'Fecha' },
  { value: 'numero', label: 'Número' },
  { value: 'link', label: 'Link' },
  { value: 'check', label: 'Check (✓)' },
]

const EMPTY = { labels: {}, hidden: [], custom_cols: [] }

export function useTablaLayout(tabla) {
  const { profile } = useAuth()
  const [layout, setLayout] = useState(EMPTY)

  const fetchLayout = useCallback(async () => {
    const { data, error } = await supabase.from('tabla_layout').select('*').eq('tabla', tabla).maybeSingle()
    if (error) { console.error('tabla_layout:', error); return }
    setLayout({
      labels: data?.labels || {},
      hidden: data?.hidden || [],
      custom_cols: Array.isArray(data?.custom_cols) ? data.custom_cols : [],
    })
  }, [tabla])

  useEffect(() => {
    fetchLayout()
    const channel = supabase
      .channel(`tabla-layout-${tabla}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tabla_layout', filter: `tabla=eq.${tabla}` }, fetchLayout)
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [tabla, fetchLayout])

  function labelFor(key, fallback) {
    const v = layout.labels?.[key]
    return v && String(v).trim() ? v : fallback
  }
  function isHidden(key) { return (layout.hidden || []).includes(key) }
  function customIn(grupo) { return (layout.custom_cols || []).filter(c => (c.grupo || 'final') === grupo) }

  async function saveLayout(next) {
    const merged = { ...layout, ...next }
    setLayout(merged)
    const { error } = await supabase.from('tabla_layout').upsert({
      tabla,
      labels: merged.labels,
      hidden: merged.hidden,
      custom_cols: merged.custom_cols,
      updated_by: profile?.id || null,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'tabla' })
    if (error) fetchLayout()
    return { error }
  }

  return { layout, labelFor, isHidden, customIn, customCols: layout.custom_cols || [], saveLayout }
}

export function newCustomId() {
  return 'c_' + Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-3)
}
