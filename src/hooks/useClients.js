import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { FICHA_TEXT_FIELDS, FICHA_DATE_FIELD, FICHA_NUM_FIELDS, FICHA_INVERSION_FIELDS, RESUMEN_LINKS, normalizeUrl } from '../utils/clientFicha'

export const BILLING_PERIODS = [
  { value: '1_31', label: '1 al 31' },
  { value: '15_14', label: '15 al 14' },
]

export function useClients() {
  const { profile, isAdmin } = useAuth()
  const [clients, setClients] = useState([])
  const [fichas, setFichas] = useState({})
  const [loading, setLoading] = useState(true)

  const fetchClients = useCallback(async () => {
    setLoading(true)
    // Admin: ficha completa. Resto del equipo: solo la vista de enlaces (sin datos internos).
    const fichaQuery = isAdmin
      ? supabase.from('client_ficha').select('*')
      : supabase.from('client_resumen').select('*')
    const [{ data, error }, { data: fichaData }] = await Promise.all([
      supabase.from('clients').select('*').order('brand_name', { ascending: true }),
      fichaQuery,
    ])

    if (error) {
      console.error('fetchClients error:', error)
      setLoading(false)
      return
    }
    setClients(data || [])
    const map = {}
    ;(fichaData || []).forEach(f => { map[f.client_id] = f })
    setFichas(map)
    setLoading(false)
  }, [isAdmin])

  useEffect(() => {
    fetchClients()
    const channel = supabase
      .channel('clients-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'clients' }, fetchClients)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'client_ficha' }, fetchClients)
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [fetchClients])

  async function createClient({ brand_name, billing_period }) {
    const { data, error } = await supabase.from('clients').insert({
      brand_name: brand_name.trim(),
      billing_period,
      is_active: true,
      created_by: profile?.id || null,
    }).select('id').single()
    if (!error) fetchClients()
    return { error, id: data?.id }
  }

  // Guarda la ficha (solo admins por RLS); se refleja en la tabla de resumen y en todas las tareas del cliente
  async function saveFicha(clientId, values) {
    const payload = { client_id: clientId }
    FICHA_TEXT_FIELDS.forEach(({ key }) => { payload[key] = (values[key] || '').trim() || null })
    payload[FICHA_DATE_FIELD.key] = (values[FICHA_DATE_FIELD.key] || '').trim() || null
    ;[...FICHA_NUM_FIELDS, ...FICHA_INVERSION_FIELDS].forEach(({ key }) => {
      const n = values[key] === '' || values[key] == null ? null : Number(values[key])
      payload[key] = Number.isFinite(n) ? n : null
    })
    RESUMEN_LINKS.forEach(({ key }) => { payload[key] = normalizeUrl(values[key]) })
    const { error } = await supabase.from('client_ficha').upsert(payload, { onConflict: 'client_id' })
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
    fichas,
    saveFicha,
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
