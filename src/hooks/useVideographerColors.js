import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'

export const COLOR_PALETTE = ['#6d28d9', '#dc2626', '#16a34a', '#2563eb', '#d97706', '#db2777', '#0891b2', '#65a30d', '#9333ea', '#0d9488']

export function useVideographerColors() {
  const [colors, setColors] = useState([]) // [{ videographer_id, color }]
  const [loading, setLoading] = useState(true)

  const fetchColors = useCallback(async () => {
    const { data, error } = await supabase.from('videographer_colors').select('*')
    if (error) { console.error('fetchVideographerColors error:', error); setLoading(false); return }
    setColors(data || [])
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchColors()
    const channel = supabase
      .channel('videographer-colors-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'videographer_colors' }, fetchColors)
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [fetchColors])

  function colorOf(videographerId) {
    return colors.find(c => c.videographer_id === videographerId)?.color || null
  }

  async function setColor(videographerId, color) {
    setColors(prev => {
      const exists = prev.some(c => c.videographer_id === videographerId)
      return exists
        ? prev.map(c => (c.videographer_id === videographerId ? { ...c, color } : c))
        : [...prev, { videographer_id: videographerId, color }]
    })
    const { error } = await supabase.from('videographer_colors').upsert({ videographer_id: videographerId, color }, { onConflict: 'videographer_id' })
    if (error) fetchColors()
    return { error }
  }

  return { colors, loading, colorOf, setColor }
}
