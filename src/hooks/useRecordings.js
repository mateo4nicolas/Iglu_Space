import { useEffect, useState, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { format } from 'date-fns'

export function useRecordings(selectedDate) {
  const { profile, isAdmin, loading: authLoading } = useAuth()
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [allProfiles, setAllProfiles] = useState([])
  const mountedRef = useRef(true)
  const dateStr = selectedDate ? format(selectedDate, 'yyyy-MM-dd') : format(new Date(), 'yyyy-MM-dd')

  const fetchItems = useCallback(async () => {
    if (!profile) {
      setItems([])
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('recordings')
        .select('*')
        .eq('date', dateStr)
        .order('time_start', { ascending: true, nullsFirst: false })

      if (!mountedRef.current) return
      if (error) { console.error('fetchRecordings error:', error); setLoading(false); return }

      if (data && data.length > 0) {
        const allUids = [...new Set(data.flatMap(i => i.assigned_to || []))]
        const { data: profileData } = await supabase
          .from('profiles')
          .select('id, full_name, display_name, username')
          .in('id', allUids.length > 0 ? allUids : ['00000000-0000-0000-0000-000000000000'])
        if (!mountedRef.current) return
        const profileMap = Object.fromEntries((profileData || []).map(p => [p.id, p]))
        setItems(data.map(item => ({
          ...item,
          assignees: (item.assigned_to || []).map(uid => profileMap[uid]).filter(Boolean),
        })))
      } else {
        setItems([])
      }
    } catch (err) {
      console.error('useRecordings fetchItems error:', err)
      if (mountedRef.current) setItems([])
    } finally {
      if (mountedRef.current) setLoading(false)
    }
  }, [profile, dateStr])

  useEffect(() => {
    mountedRef.current = true
    if (authLoading) return
    fetchItems()
    if (!profile) return

    const channel = supabase
      .channel(`recordings-${dateStr}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'recordings' }, fetchItems)
      .subscribe()

    return () => {
      mountedRef.current = false
      supabase.removeChannel(channel)
    }
  }, [fetchItems, dateStr, profile, authLoading])

  useEffect(() => {
    if (!profile) return
    supabase
      .from('profiles')
      .select('id, full_name, display_name, username')
      .then(({ data }) => { if (mountedRef.current) setAllProfiles(data || []) })
  }, [profile])

  async function createItem(itemData) {
    try {
      const { error } = await supabase
        .from('recordings')
        .insert({ ...itemData, date: dateStr, created_by: profile.id, status: 'coordinando' })
      if (error) { console.error('createItem error:', error); return { error } }
      fetchItems()
      return { error: null }
    } catch (err) {
      console.error('createItem exception:', err)
      return { error: err }
    }
  }

  async function updateAdminFields(id, updates) {
    try {
      const { error } = await supabase.from('recordings').update(updates).eq('id', id)
      if (error) { console.error('updateAdminFields error:', error); return { error } }
      fetchItems()
      return { error: null }
    } catch (err) {
      console.error('updateAdminFields exception:', err)
      return { error: err }
    }
  }

  async function updateUserNotes(id, { user_notes, videos_uploaded }) {
    try {
      const updates = {}
      if (user_notes !== undefined) updates.user_notes = user_notes
      if (videos_uploaded !== undefined) updates.videos_uploaded = videos_uploaded
      const { error } = await supabase.from('recordings').update(updates).eq('id', id)
      if (error) { console.error('updateUserNotes error:', error); return { error } }
      fetchItems()
      return { error: null }
    } catch (err) {
      console.error('updateUserNotes exception:', err)
      return { error: err }
    }
  }

  async function deleteItem(id) {
    try {
      const { error } = await supabase.from('recordings').delete().eq('id', id)
      if (!error) fetchItems()
      return { error }
    } catch (err) {
      console.error('deleteItem exception:', err)
      return { error: err }
    }
  }

  function isAssignedToMe(item) {
    return (item.assigned_to || []).includes(profile?.id)
  }

  return {
    items, loading, allProfiles,
    createItem, updateAdminFields, updateUserNotes, deleteItem,
    isAssignedToMe,
    refetch: fetchItems,
  }
}
