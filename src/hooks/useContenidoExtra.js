import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

export const FORMATO_OPTS = [
  { value: 'post',       label: 'Post',       color: '#1e9e5a' },
  { value: 'historia',   label: 'Historia',   color: '#d92d2d' },
  { value: 'variacion',  label: 'Variación',  color: '#2563eb' },
  { value: 'otro',       label: 'Otro',       color: '#d4a91a' },
]

export const SOLICITA_OPTS = [
  { value: 'mkt',      label: 'MKT',     color: '#d92d2d' },
  { value: 'cliente',  label: 'Cliente', color: '#1e9e5a' },
  { value: 'pauta',    label: 'Pauta',   color: '#d4a91a' },
]

export const APROBACION_OPTS = [
  { value: 'si', label: 'SI', color: '#1e9e5a' },
  { value: 'no', label: 'NO', color: '#d92d2d' },
]

export const DISENADO_OPTS = [
  { value: 'en_proceso',   label: 'En Proceso',      color: '#d4a91a' },
  { value: 'subido_drive', label: 'Subido al Drive', color: '#1e9e5a' },
  { value: 'no_aplica',    label: 'No Aplica',       color: '#d92d2d' },
]

export const PUBLICACION_OPTS = [
  { value: 'si', label: 'SI', color: '#1e9e5a' },
  { value: 'no', label: 'NO', color: '#d92d2d' },
]

export const PRESUPUESTO_OPTS = [
  { value: 'campana',       label: 'Campaña',        color: '#1e9e5a' },
  { value: 'anuncio_extra', label: 'Anuncio Extra',  color: '#d92d2d' },
  { value: 'campana_extra', label: 'Campaña Extra',  color: '#d4a91a' },
  { value: 'no_aplica',     label: 'No Aplica',      color: '#8a5a2b' },
]

export const PAUTA_OPTS = [
  { value: 'si',        label: 'SI',        color: '#1e9e5a' },
  { value: 'no',         label: 'NO',        color: '#d92d2d' },
  { value: 'no_aplica',  label: 'No Aplica', color: '#d4a91a' },
]

const EMPTY_ROW = {
  cliente: '', formato: null, solicita: null, fecha_solicitud: null,
  codigo: '', copy_diseno: '', copy_red_social: '', aprobacion: null,
  fecha_entrega: null, disenado: null, link: '', publicacion: null,
  publicacion_check: false, fecha_publicacion: null, presupuesto: null,
  duracion: '', pauta: null, verificado: false,
}

const MESES_ES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']

export function mesKeyToLabel(mesKey) {
  const [y, m] = mesKey.split('-').map(Number)
  return `${MESES_ES[m - 1]} ${y}`
}

export function currentMesKey() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export function nextMesKey(mesKey) {
  const [y, m] = mesKey.split('-').map(Number)
  const d = new Date(y, m, 1) // m es 1-indexed → avanza un mes
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export function useContenidoExtra() {
  const { profile } = useAuth()
  const [rows, setRows] = useState([])
  const [meses, setMeses] = useState([])
  const [loading, setLoading] = useState(true)

  const fetchAll = useCallback(async () => {
    const [{ data: rowsData, error }, { data: mesesData }] = await Promise.all([
      supabase.from('contenido_extra').select('*').order('position', { ascending: true }).order('created_at', { ascending: true }),
      supabase.from('contenido_extra_meses').select('*').order('position', { ascending: true }).order('mes', { ascending: true }),
    ])
    if (error) {
      console.error('fetchContenidoExtra error:', error)
      setLoading(false)
      return
    }
    setRows(rowsData || [])
    setMeses(mesesData || [])
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchAll()
    const channel = supabase
      .channel('contenido-extra-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'contenido_extra' }, fetchAll)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'contenido_extra_meses' }, fetchAll)
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [fetchAll])

  async function addRow(mes) {
    const rowsInMes = rows.filter(r => r.mes === mes)
    const maxPos = rowsInMes.reduce((m, r) => Math.max(m, r.position || 0), 0)
    const { data, error } = await supabase
      .from('contenido_extra')
      .insert({ ...EMPTY_ROW, mes, position: maxPos + 1, created_by: profile?.id || null })
      .select()
      .single()
    if (!error) setRows(prev => [...prev, data])
    return { data, error }
  }

  // Genera el siguiente mes a partir del último mes existente (o del mes actual si no hay ninguno)
  async function generarNuevoMes() {
    const ultimoMes = meses.reduce((max, m) => (m.mes > max ? m.mes : max), currentMesKey())
    const nuevoMes = nextMesKey(ultimoMes)
    if (meses.some(m => m.mes === nuevoMes)) return { mes: nuevoMes, error: null }
    const { error } = await supabase.from('contenido_extra_meses').insert({
      mes: nuevoMes,
      label: mesKeyToLabel(nuevoMes),
      position: meses.length,
      created_by: profile?.id || null,
    })
    if (!error) fetchAll()
    return { mes: nuevoMes, error }
  }

  async function updateRow(id, patch) {
    setRows(prev => prev.map(r => (r.id === id ? { ...r, ...patch } : r)))
    const { error } = await supabase.from('contenido_extra').update(patch).eq('id', id)
    if (error) {
      console.error('updateContenidoExtra error:', error)
      fetchAll()
    }
    return { error }
  }

  async function deleteRow(id) {
    setRows(prev => prev.filter(r => r.id !== id))
    const { error } = await supabase.from('contenido_extra').delete().eq('id', id)
    if (error) fetchAll()
    return { error }
  }

  async function deleteMes(mesKey) {
    const { error } = await supabase.from('contenido_extra_meses').delete().eq('mes', mesKey)
    if (!error) fetchAll()
    return { error }
  }

  return { rows, meses, loading, addRow, updateRow, deleteRow, deleteMes, generarNuevoMes, refetch: fetchAll }
}
