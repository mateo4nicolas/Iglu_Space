import { useEffect, useState, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { format } from 'date-fns'

export function useRecordingsWeek(weekStart, weekEnd) {
  const { profile, loading: authLoading } = useAuth()
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const mountedRef = useRef(true)
  const startStr = format(weekStart, 'yyyy-MM-dd')
  const endStr = format(weekEnd, 'yyyy-MM-dd')

  const fetchItems = useCallback(async () => {
    if (!profile) { setItems([]); setLoading(false); return }
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('recordings')
        .select('*')
        .gte('date', startStr)
        .lte('date', endStr)
        .order('time_start', { ascending: true, nullsFirst: false })
      if (!mountedRef.current) return
      if (error) { console.error('fetchRecordingsWeek error:', error); setLoading(false); return }
      setItems(data || [])
    } catch (err) {
      console.error('useRecordingsWeek fetchItems error:', err)
      if (mountedRef.current) setItems([])
    } finally {
      if (mountedRef.current) setLoading(false)
    }
  }, [profile, startStr, endStr])

  useEffect(() => {
    mountedRef.current = true
    if (authLoading) return
    fetchItems()
    if (!profile) return
    const channel = supabase
      .channel(`recordings-week-${startStr}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'recordings' }, fetchItems)
      .subscribe()
    return () => {
      mountedRef.current = false
      supabase.removeChannel(channel)
    }
  }, [fetchItems, startStr, profile, authLoading])

  return { items, loading }
}
