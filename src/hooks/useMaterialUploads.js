import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

export function useMaterialUploads() {
  const { profile } = useAuth()
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)

  const fetchItems = useCallback(async () => {
    const { data, error } = await supabase
      .from('material_uploads')
      .select('*')
      .order('created_at', { ascending: false })
    if (error) { console.error('fetchMaterialUploads error:', error); setLoading(false); return }
    setItems(data || [])
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchItems()
    const channel = supabase
      .channel('material-uploads-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'material_uploads' }, fetchItems)
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [fetchItems])

  async function createItem({ client_name, videographer_ids, date, time_start }) {
    const { error } = await supabase.from('material_uploads').insert({
      client_name: client_name.trim(),
      videographer_ids,
      date,
      time_start: time_start || null,
      status: 'no_subido',
      created_by: profile?.id || null,
    })
    if (!error) fetchItems()
    return { error }
  }

  async function setStatus(id, status) {
    setItems(prev => prev.map(i => (i.id === id ? { ...i, status } : i)))
    const { error } = await supabase.from('material_uploads').update({ status }).eq('id', id)
    if (error) fetchItems()
    return { error }
  }

  async function deleteItem(id) {
    setItems(prev => prev.filter(i => i.id !== id))
    const { error } = await supabase.from('material_uploads').delete().eq('id', id)
    if (error) fetchItems()
    return { error }
  }

  function isAssignedToMe(item) {
    return (item.videographer_ids || []).includes(profile?.id)
  }

  return { items, loading, createItem, setStatus, deleteItem, isAssignedToMe }
}
