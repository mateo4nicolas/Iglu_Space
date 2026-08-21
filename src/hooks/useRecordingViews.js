import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

export function useRecordingViews() {
  const { profile } = useAuth()
  const [views, setViews] = useState([])
  const [loading, setLoading] = useState(true)

  const fetchViews = useCallback(async () => {
    const { data, error } = await supabase
      .from('recording_views')
      .select('*, profiles:videographer_id(id, full_name, display_name, username)')
      .order('position', { ascending: true })
    if (error) { console.error('fetchRecordingViews error:', error); setLoading(false); return }
    setViews(data || [])
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchViews()
    const channel = supabase
      .channel('recording-views-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'recording_views' }, fetchViews)
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [fetchViews])

  async function addView(videographerId, label, color) {
    const maxPos = views.reduce((m, v) => Math.max(m, v.position || 0), 0)
    const { error } = await supabase.from('recording_views').insert({
      label,
      videographer_id: videographerId,
      color: color || '#6d28d9',
      position: maxPos + 1,
      created_by: profile?.id || null,
    })
    if (!error) fetchViews()
    return { error }
  }

  async function deleteView(id) {
    const { error } = await supabase.from('recording_views').delete().eq('id', id)
    if (!error) fetchViews()
    return { error }
  }

  return { views, loading, addView, deleteView }
}
