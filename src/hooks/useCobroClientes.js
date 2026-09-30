import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

export const PAUTA_METODOS = [
  { value: 'tarjeta_cliente', label: 'Tarjeta Cliente' },
  { value: 'transferencia_iglu', label: 'Transferencia a Iglü' },
]

export function useCobroClientes() {
  const { profile } = useAuth()
  const [clients, setClients] = useState([])
  const [clientVisibility, setClientVisibility] = useState([])
  const [rows, setRows] = useState([])
  const [meta, setMeta] = useState(15600)
  const [loading, setLoading] = useState(true)

  const fetchAll = useCallback(async () => {
    const [
      { data: clientsData },
      { data: visibilityData },
      { data: rowsData },
      { data: configData },
    ] = await Promise.all([
      supabase.from('clients').select('*').eq('is_active', true).order('brand_name'),
      supabase.from('matriz_client_visibility').select('*').order('mes', { ascending: true }).order('created_at', { ascending: true }),
      supabase.from('cobro_clientes').select('*'),
      supabase.from('cobro_config').select('*').eq('id', 'global').maybeSingle(),
    ])
    setClients(clientsData || [])
    setClientVisibility(visibilityData || [])
    setRows(rowsData || [])
    setMeta(configData?.meta != null ? Number(configData.meta) : 15600)
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchAll()
    const channel = supabase
      .channel('cobro-clientes-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'clients' }, fetchAll)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'matriz_client_visibility' }, fetchAll)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cobro_config' }, fetchAll)
      // cobro_clientes se edita campo a campo: aplicar el cambio puntual en vez de
      // volver a pedir todo, para no pisar lo que la persona está escribiendo.
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cobro_clientes' }, payload => {
        if (payload.eventType === 'DELETE') { setRows(prev => prev.filter(r => r.id !== payload.old.id)); return }
        setRows(prev => {
          const exists = prev.some(r => r.id === payload.new.id)
          return exists ? prev.map(r => (r.id === payload.new.id ? payload.new : r)) : [...prev, payload.new]
        })
      })
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [fetchAll])

  function isClientActiveInMonth(clientId, mes) {
    const entries = clientVisibility.filter(v => v.cliente_id === clientId && v.mes <= mes)
    if (entries.length === 0) return true
    return entries[entries.length - 1].active
  }

  function clientsByPeriod(period, mes) {
    return clients.filter(c => c.billing_period === period && (!mes || isClientActiveInMonth(c.id, mes)))
  }

  // Todos los clientes activos del ciclo de cobro (15 a 14), sin separar por
  // billing_period: el cobro se sigue en una sola tabla para todos.
  function allActiveClients(mes) {
    return clients.filter(c => !mes || isClientActiveInMonth(c.id, mes))
  }

  function rowFor(clienteId, mes) {
    return rows.find(r => r.cliente_id === clienteId && r.mes === mes) || null
  }

  async function saveRow(clienteId, mes, patch) {
    const current = rowFor(clienteId, mes)
    const merged = { ...(current || {}), cliente_id: clienteId, mes, ...patch }
    delete merged.created_at
    delete merged.updated_at
    if (!current) merged.created_by = profile?.id || null

    setRows(prev => {
      const exists = prev.some(r => r.cliente_id === clienteId && r.mes === mes)
      return exists
        ? prev.map(r => (r.cliente_id === clienteId && r.mes === mes ? { ...r, ...merged } : r))
        : [...prev, merged]
    })
    const { error } = await supabase.from('cobro_clientes').upsert(merged, { onConflict: 'cliente_id,mes' })
    if (error) fetchAll()
    return { error }
  }

  // Total recaudado del mes = solo lo registrado en "Pago de agencia" (ambos ciclos)
  function totalAgenciaMes(mes) {
    return rows.filter(r => r.mes === mes).reduce((sum, r) => sum + (Number(r.pago_agencia) || 0), 0)
  }

  function pctForMes(mes) {
    if (!meta || meta <= 0) return 0
    return Math.min(100, Math.round((totalAgenciaMes(mes) / meta) * 1000) / 10)
  }

  async function saveMeta(newMeta) {
    setMeta(newMeta)
    const { error } = await supabase.from('cobro_config').upsert({ id: 'global', meta: newMeta }, { onConflict: 'id' })
    if (error) fetchAll()
    return { error }
  }

  return {
    loading,
    clients,
    clientsByPeriod,
    allActiveClients,
    isClientActiveInMonth,
    rowFor,
    saveRow,
    meta,
    saveMeta,
    totalAgenciaMes,
    pctForMes,
    refetch: fetchAll,
  }
}
