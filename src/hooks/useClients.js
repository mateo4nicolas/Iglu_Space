import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

export const BILLING_PERIODS = [
  { value: '1_31', label: '1 al 31' },
  { value: '15_14', label: '15 al 14' },
]

export function useClients() {
  const { profile } = useAuth()
  const [clients, setClients] = useState([])
  const [loading, setLoading] = useState(true)

  const fetchClients = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('clients')
      .select('*')
      .order('brand_name', { ascending: true })

    if (error) {
      console.error('fetchClients error:', error)
      setLoading(false)
      return
    }
    setClients(data || [])
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchClients()
    const channel = supabase
      .channel('clients-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'clients' }, fetchClients)
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [fetchClients])

  async function createClient({ brand_name, billing_period }) {
    const { error } = await supabase.from('clients').insert({
      brand_name: brand_name.trim(),
      billing_period,
      is_active: true,
      created_by: profile?.id || null,
    })
    if (!error) fetchClients()
    return { error }
  }

  async function updateClient(id, updates) {
    const { error } = await supabase.from('clients').update(updates).eq('id', id)
    if (!error) fetchClients()
    return { error }
  }

  // Borrado lógico: archiva (is_active = false) o reactiva (is_active = true)
  async function setActive(id, is_active) {
    return updateClient(id, { is_active })
  }

  // Borrado definitivo
  async function deleteClient(id) {
    const { error } = await supabase.from('clients').delete().eq('id', id)
    if (!error) fetchClients()
    return { error }
  }

  const activeClients = clients.filter(c => c.is_active)
  const archivedClients = clients.filter(c => !c.is_active)

  const byPeriod = (list) =>
    BILLING_PERIODS.map(p => ({
      period: p,
      clients: list.filter(c => c.billing_period === p.value),
    }))

  return {
    clients,
    activeClients,
    archivedClients,
    byPeriod,
    loading,
    createClient,
    updateClient,
    setActive,
    deleteClient,
    refetch: fetchClients,
  }
}
