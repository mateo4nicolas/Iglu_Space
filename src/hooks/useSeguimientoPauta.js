import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

function sameRow(a, b) {
  return (a.id && b.id && a.id === b.id) || (a.cliente_id === b.cliente_id && a.mes === b.mes)
}
function mergeRow(prev, row) {
  const idx = prev.findIndex(r => sameRow(r, row))
  if (idx === -1) return [...prev, row]
  const next = [...prev]
  next[idx] = { ...next[idx], ...row }
  return next
}

export function useSeguimientoPauta() {
  const { profile } = useAuth()
  const [clients, setClients] = useState([])
  const [visibility, setVisibility] = useState([])
  const [rows, setRows] = useState([])
  const [informeCols, setInformeCols] = useState([])
  const [loading, setLoading] = useState(true)

  const fetchAll = useCallback(async () => {
    const [{ data: c }, { data: v }, { data: r }, { data: ic }] = await Promise.all([
      supabase.from('clients').select('*').eq('is_active', true).order('brand_name'),
      supabase.from('matriz_client_visibility').select('*').order('mes', { ascending: true }).order('created_at', { ascending: true }),
      supabase.from('seguimiento_pauta').select('*'),
      supabase.from('seguimiento_pauta_informes').select('*').order('position').order('created_at'),
    ])
    setClients(c || [])
    setVisibility(v || [])
    setRows(r || [])
    setInformeCols(ic || [])
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchAll()
    const channel = supabase
      .channel('seguimiento-pauta-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'seguimiento_pauta_informes' }, fetchAll)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'clients' }, fetchAll)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'matriz_client_visibility' }, fetchAll)
      // Las filas se editan campo a campo: se aplica el cambio puntual para no
      // pisar lo que otra persona está escribiendo.
      .on('postgres_changes', { event: '*', schema: 'public', table: 'seguimiento_pauta' }, payload => {
        if (payload.eventType === 'DELETE') { setRows(prev => prev.filter(x => x.id !== payload.old.id)); return }
        setRows(prev => mergeRow(prev, payload.new))
      })
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [fetchAll])

  // Igual que en la Matriz: pausado/activo por mes y visible desde su mes de inicio
  function isClientActiveInMonth(clientId, mes) {
    const entries = visibility.filter(v => v.cliente_id === clientId && v.mes <= mes)
    if (entries.length === 0) {
      const mesInicio = clients.find(c => c.id === clientId)?.mes_inicio
      return !mesInicio || mes >= mesInicio
    }
    return entries[entries.length - 1].active
  }

  function clientsFor(period, mes) {
    return clients.filter(c => c.billing_period === period && isClientActiveInMonth(c.id, mes))
  }

  function rowFor(clienteId, mes) {
    return rows.find(r => r.cliente_id === clienteId && r.mes === mes) || null
  }

  async function saveRow(clienteId, mes, patch) {
    const current = rowFor(clienteId, mes) || {}
    const merged = {
      cliente_id: clienteId,
      mes,
      semanas: current.semanas || {},
      creativos: current.creativos || [],
      avatar_angulo: current.avatar_angulo ?? null,
      costo_resultado: current.costo_resultado ?? null,
      informes: current.informes || {},
      ...patch,
      updated_by: profile?.id || null,
      updated_at: new Date().toISOString(),
    }
    setRows(prev => mergeRow(prev, merged))
    const { data, error } = await supabase
      .from('seguimiento_pauta')
      .upsert(merged, { onConflict: 'cliente_id,mes' })
      .select('id')
      .single()
    if (error) {
      console.error('saveRow seguimiento_pauta:', error)
      alert('No se pudo guardar: ' + error.message)
      fetchAll()
    } else if (data?.id) {
      setRows(prev => mergeRow(prev, { cliente_id: clienteId, mes, id: data.id }))
    }
    return { error }
  }

  async function addInformeCol(titulo) {
    const t = (titulo || '').trim()
    if (!t) return { error: null }
    const position = informeCols.length ? Math.max(...informeCols.map(c => c.position || 0)) + 1 : 0
    const { error } = await supabase.from('seguimiento_pauta_informes').insert({ titulo: t, position })
    if (!error) fetchAll()
    return { error }
  }

  async function renameInformeCol(id, titulo) {
    const t = (titulo || '').trim()
    if (!t) return { error: null }
    setInformeCols(prev => prev.map(c => (c.id === id ? { ...c, titulo: t } : c)))
    const { error } = await supabase.from('seguimiento_pauta_informes').update({ titulo: t }).eq('id', id)
    if (error) fetchAll()
    return { error }
  }

  async function deleteInformeCol(id) {
    setInformeCols(prev => prev.filter(c => c.id !== id))
    const { error } = await supabase.from('seguimiento_pauta_informes').delete().eq('id', id)
    if (error) fetchAll()
    return { error }
  }

  return {
    loading, clientsFor, rowFor, saveRow,
    informeCols, addInformeCol, renameInformeCol, deleteInformeCol,
  }
}
