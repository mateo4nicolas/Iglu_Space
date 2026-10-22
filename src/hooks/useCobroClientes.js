import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

export const PAUTA_METODOS = [
  { value: 'tarjeta_cliente', label: 'Tarjeta Cliente' },
  { value: 'transferencia_iglu', label: 'Transferencia a Iglü' },
]

// Une una fila en el estado sin duplicarla: la misma fila puede llegar por la edición local
// (sin id todavía) y por el evento en vivo (con id); se identifican por id o por cliente+mes.
function mergeRow(prev, row) {
  const idx = prev.findIndex(r => (row.id && r.id === row.id) || (r.cliente_id === row.cliente_id && r.mes === row.mes))
  if (idx === -1) return [...prev, row]
  const next = [...prev]
  next[idx] = { ...prev[idx], ...row }
  return next
}

export function useCobroClientes() {
  const { profile } = useAuth()
  const [clients, setClients] = useState([])
  const [rows, setRows] = useState([])
  const [meta, setMeta] = useState(15600)
  const [loading, setLoading] = useState(true)

  const fetchAll = useCallback(async () => {
    const [
      { data: clientsData },
      { data: rowsData },
      { data: configData },
    ] = await Promise.all([
      supabase.from('cobro_lista_clientes').select('*').eq('is_active', true).order('nombre'),
      supabase.from('cobro_clientes').select('*'),
      supabase.from('cobro_config').select('*').eq('id', 'global').maybeSingle(),
    ])
    setClients(clientsData || [])
    setRows((rowsData || []).reduce((acc, r) => mergeRow(acc, r), []))
    setMeta(configData?.meta != null ? Number(configData.meta) : 15600)
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchAll()
    const channel = supabase
      .channel('cobro-clientes-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cobro_lista_clientes' }, fetchAll)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cobro_config' }, fetchAll)
      // cobro_clientes se edita campo a campo: aplicar el cambio puntual en vez de
      // volver a pedir todo, para no pisar lo que la persona está escribiendo.
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cobro_clientes' }, payload => {
        if (payload.eventType === 'DELETE') { setRows(prev => prev.filter(r => r.id !== payload.old.id)); return }
        setRows(prev => mergeRow(prev, payload.new))
      })
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [fetchAll])

  // Lista propia de Cobro Clientes: independiente de la Matriz y del resto de la plataforma
  function allActiveClients() {
    return clients
  }

  async function addClient(nombre) {
    const name = (nombre || '').trim()
    if (!name) return { error: new Error('Nombre vacío') }
    const { error } = await supabase.from('cobro_lista_clientes').insert({ nombre: name, created_by: profile?.id || null })
    if (!error) fetchAll()
    return { error }
  }

  async function removeClient(clienteId) {
    setClients(prev => prev.filter(c => c.id !== clienteId))
    setRows(prev => prev.filter(r => r.cliente_id !== clienteId))
    const { error } = await supabase.from('cobro_lista_clientes').delete().eq('id', clienteId)
    if (error) fetchAll()
    return { error }
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

    setRows(prev => mergeRow(prev, merged))
    const { data, error } = await supabase
      .from('cobro_clientes')
      .upsert(merged, { onConflict: 'cliente_id,mes' })
      .select('id')
      .single()
    if (error) fetchAll()
    else if (data?.id) setRows(prev => mergeRow(prev, { cliente_id: clienteId, mes, id: data.id }))
    return { error }
  }

  // Total recaudado del mes = solo lo registrado en "Pago de agencia" (ambos ciclos)
  function totalAgenciaMes(mes) {
    // Una sola fila por cliente y mes: nunca se cuenta dos veces el mismo pago
    const unicas = rows.filter(r => r.mes === mes).reduce((acc, r) => mergeRow(acc, r), [])
    return unicas.reduce((sum, r) => sum + (Number(r.pago_agencia) || 0), 0)
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
    allActiveClients,
    addClient,
    removeClient,
    rowFor,
    saveRow,
    meta,
    saveMeta,
    totalAgenciaMes,
    pctForMes,
    refetch: fetchAll,
  }
}
