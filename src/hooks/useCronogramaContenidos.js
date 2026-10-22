import { useEffect, useState, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

export const STAGE_DEFS = [
  { id: 'fria',     label: 'Conversión Fría',     short: 'FRÍA' },
  { id: 'caliente', label: 'Conversión Caliente', short: 'CALIENTE' },
  { id: 'extra',    label: 'Extras',              short: 'EXTRA' },
]

export const WEEK_DEFS = [
  { id: 's1', label: 'Semana 1', short: 'SEM 1' },
  { id: 's2', label: 'Semana 2', short: 'SEM 2' },
  { id: 's3', label: 'Semana 3', short: 'SEM 3' },
  { id: 's4', label: 'Semana 4', short: 'SEM 4' },
  { id: 'extra', label: 'Extras', short: 'EXTRA' },
]

export const NETWORK_DEFS = [
  { id: 'fb', field: 'fb', label: 'Facebook' },
  { id: 'ig', field: 'ig', label: 'Instagram' },
  { id: 'tt', field: 'tt', label: 'TikTok' },
]

export const ACTIVITY_FIELDS = [
  { key: 'tabla_productos', label: 'Tabla productos' },
  { key: 'mallas',          label: 'Aprobación mallas' },
  { key: 'guiones',         label: 'Aprobación guiones' },
  { key: 'produccion',      label: 'Producción' },
]

const DEFAULT_CONFIG = { mode: 'etapas', stages: ['fria', 'caliente', 'extra'], vectors: 1, weeks: ['s1', 's2', 's3', 's4'], networks: ['fb', 'ig', 'tt'], nota_general: '' }

// Especificación de filas iniciales por sección: fría/caliente arrancan con
// "vectores*2" piezas de tipo post y "vectores*2" de tipo video (con 1 vector:
// 2 post + 2 video); extras arranca con 2 filas sin tipo; semanas con 3 filas sin tipo.
export function buildSeedSpecs(mode, sectionId, vectors) {
  if (mode === 'semanas') return Array.from({ length: 3 }, () => ({ tipo: null }))
  if (sectionId === 'extra') return Array.from({ length: 2 }, () => ({ tipo: null }))
  const n = Math.max(1, vectors) * 2
  return [
    ...Array.from({ length: n }, () => ({ tipo: 'post' })),
    ...Array.from({ length: n }, () => ({ tipo: 'video' })),
  ]
}

const STAGE_KEYWORDS = { fria: /\bcf\b|fr[ií]a/i, caliente: /\bcc\b|caliente/i }
const TIPO_KEYWORDS = { post: /dise[ñn]o|post/i, video: /video/i }

export function useCronogramaContenidos() {
  const { profile } = useAuth()
  const [clients, setClients] = useState([])
  const [clientVisibility, setClientVisibility] = useState([])
  const [matrizColumns, setMatrizColumns] = useState([])
  const [tablaProductos, setTablaProductos] = useState([])
  const [matrizTasks, setMatrizTasks] = useState([])
  const [configs, setConfigs] = useState([])
  const [filas, setFilas] = useState([])
  const [actividadNotas, setActividadNotas] = useState([])
  const [loading, setLoading] = useState(true)
  const seededRef = useRef(new Set()) // evita re-sembrar filas ya sembradas en esta sesión

  const fetchAll = useCallback(async () => {
    const [
      { data: clientsData },
      { data: visibilityData },
      { data: colsData },
      { data: tablaProdData },
      { data: tasksData },
      { data: configData },
      { data: filasData },
      { data: notasData },
    ] = await Promise.all([
      supabase.from('clients').select('*').eq('is_active', true).order('brand_name'),
      supabase.from('matriz_client_visibility').select('*').order('mes', { ascending: true }).order('created_at', { ascending: true }),
      supabase.from('columnas_matriz').select('*').order('position', { ascending: true }),
      supabase.from('matriz_tabla_productos').select('*'),
      supabase.from('tasks').select('id, cliente_id, mes_tarea, columna_matriz, matriz_aprobado_at').not('cliente_id', 'is', null).not('columna_matriz', 'is', null),
      supabase.from('cronograma_config').select('*'),
      supabase.from('cronograma_filas').select('*').order('position', { ascending: true }),
      supabase.from('cronograma_actividad_notas').select('*'),
    ])
    setClients(clientsData || [])
    setClientVisibility(visibilityData || [])
    setMatrizColumns(colsData || [])
    setTablaProductos(tablaProdData || [])
    setMatrizTasks(tasksData || [])
    setConfigs(configData || [])
    setFilas(filasData || [])
    setActividadNotas(notasData || [])
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchAll()
    const channel = supabase
      .channel('cronograma-contenidos-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'clients' }, fetchAll)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'matriz_client_visibility' }, fetchAll)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'matriz_tabla_productos' }, fetchAll)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'columnas_matriz' }, fetchAll)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, fetchAll)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cronograma_config' }, fetchAll)
      // cronograma_filas y cronograma_actividad_notas se editan letra a letra: en vez de
      // volver a pedir todo (lo que pisaba lo que la persona estaba escribiendo), se
      // aplica el cambio puntual que manda Supabase.
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cronograma_filas' }, payload => {
        if (payload.eventType === 'DELETE') { setFilas(prev => prev.filter(f => f.id !== payload.old.id)); return }
        setFilas(prev => {
          const exists = prev.some(f => f.id === payload.new.id)
          return exists ? prev.map(f => (f.id === payload.new.id ? payload.new : f)) : [...prev, payload.new]
        })
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cronograma_actividad_notas' }, payload => {
        if (payload.eventType === 'DELETE') return
        const row = payload.new
        setActividadNotas(prev => {
          const exists = prev.some(n => n.cliente_id === row.cliente_id && n.mes === row.mes && n.campo === row.campo)
          return exists
            ? prev.map(n => (n.cliente_id === row.cliente_id && n.mes === row.mes && n.campo === row.campo ? row : n))
            : [...prev, row]
        })
      })
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [fetchAll])

  // ── Conexión con Matriz: solo clientes activos ese mes (igual que en Matriz de Control) ──
  function isClientActiveInMonth(clientId, mes) {
    const entries = clientVisibility.filter(v => v.cliente_id === clientId && v.mes <= mes)
    if (entries.length === 0) {
      // sin registro -> activo solo desde el ciclo en que se añadió el cliente
      const mesInicio = clients.find(c => c.id === clientId)?.mes_inicio
      return !mesInicio || mes >= mesInicio
    }
    return entries[entries.length - 1].active
  }

  function clientsByPeriod(period, mes) {
    return clients.filter(c => c.billing_period === period && (!mes || isClientActiveInMonth(c.id, mes)))
  }

  function getConfig(clienteId) {
    const cfg = configs.find(c => c.cliente_id === clienteId)
    return cfg ? { ...DEFAULT_CONFIG, ...cfg } : { ...DEFAULT_CONFIG }
  }

  async function saveConfig(clienteId, patch) {
    const current = getConfig(clienteId)
    const merged = { ...current, ...patch, cliente_id: clienteId }
    delete merged.created_at
    delete merged.updated_at
    setConfigs(prev => {
      const exists = prev.some(c => c.cliente_id === clienteId)
      return exists ? prev.map(c => (c.cliente_id === clienteId ? { ...c, ...merged } : c)) : [...prev, merged]
    })
    const { error } = await supabase.from('cronograma_config').upsert(merged, { onConflict: 'cliente_id' })
    if (error) fetchAll()
    return { error }
  }

  function sectionsForClient(clienteId) {
    const cfg = getConfig(clienteId)
    if (cfg.mode === 'semanas') return WEEK_DEFS.filter(w => cfg.weeks.includes(w.id))
    return STAGE_DEFS.filter(s => cfg.stages.includes(s.id))
  }

  function networksForClient(clienteId) {
    return NETWORK_DEFS.filter(n => getConfig(clienteId).networks.includes(n.id))
  }

  function hasVectorColumn(clienteId) {
    return getConfig(clienteId).mode !== 'semanas'
  }

  function rowsFor(clienteId, mes, seccionId) {
    return filas
      .filter(f => f.cliente_id === clienteId && f.mes === mes && f.seccion === seccionId)
      .sort((a, b) => (a.position || 0) - (b.position || 0))
  }

  function allRowsFor(clienteId, mes) {
    return filas.filter(f => f.cliente_id === clienteId && f.mes === mes)
  }

  async function addRow(clienteId, mes, seccionId, tipo = null) {
    const rowsInSec = filas.filter(f => f.cliente_id === clienteId && f.mes === mes && f.seccion === seccionId)
    const maxPos = rowsInSec.reduce((m, r) => Math.max(m, r.position || 0), 0)
    const { data, error } = await supabase
      .from('cronograma_filas')
      .insert({ cliente_id: clienteId, mes, seccion: seccionId, tipo, position: maxPos + 1, created_by: profile?.id || null })
      .select()
      .single()
    if (!error) setFilas(prev => [...prev, data])
    return { data, error }
  }

  // Siembra automática: si una etapa/semana aún no tiene filas para este mes,
  // crea las piezas iniciales que corresponden (ver buildSeedSpecs).
  async function ensureSeeded(clienteId, mes, seccionId, mode, vectors) {
    const seedKey = `${clienteId}|${mes}|${seccionId}`
    if (seededRef.current.has(seedKey)) return
    const existing = filas.filter(f => f.cliente_id === clienteId && f.mes === mes && f.seccion === seccionId)
    if (existing.length > 0) { seededRef.current.add(seedKey); return }
    seededRef.current.add(seedKey)
    const specs = buildSeedSpecs(mode, seccionId, vectors)
    const rows = specs.map((spec, i) => ({ cliente_id: clienteId, mes, seccion: seccionId, tipo: spec.tipo, position: i + 1, created_by: profile?.id || null }))
    const { data, error } = await supabase.from('cronograma_filas').insert(rows).select()
    if (!error && data) setFilas(prev => [...prev, ...data])
  }

  async function updateRow(id, patch) {
    setFilas(prev => prev.map(f => (f.id === id ? { ...f, ...patch } : f)))
    const { error } = await supabase.from('cronograma_filas').update(patch).eq('id', id)
    if (error) fetchAll()
    return { error }
  }

  async function deleteRow(id) {
    setFilas(prev => prev.filter(f => f.id !== id))
    const { error } = await supabase.from('cronograma_filas').delete().eq('id', id)
    if (error) fetchAll()
    return { error }
  }

  // ── Conexión en vivo con Matriz de Control (fechas de actividad) ────────
  function tablaProductosFecha(clienteId, mes) {
    const row = tablaProductos.find(t => t.cliente_id === clienteId && t.mes === mes)
    return row && row.checked ? row.checked_at : null
  }

  function matrizColumnByKeyword(keyword) {
    return matrizColumns.find(c => (c.label || '').toLowerCase().includes(keyword) || (c.value || '').toLowerCase().includes(keyword))
  }

  function aprobacionMatrizFecha(clienteId, mes, keyword) {
    const col = matrizColumnByKeyword(keyword)
    const columnaValue = col ? col.value : keyword
    const task = matrizTasks.find(t => t.cliente_id === clienteId && t.mes_tarea === mes && t.columna_matriz === columnaValue && t.matriz_aprobado_at)
    return task ? task.matriz_aprobado_at : null
  }

  // Columnas de Matriz que corresponden a "Diseño/Post" o "Video" de una etapa Fría/Caliente
  function candidateMatrizColumnsFor(seccionId, tipo) {
    const stageRe = STAGE_KEYWORDS[seccionId]
    const tipoRe = TIPO_KEYWORDS[tipo]
    if (!stageRe || !tipoRe) return []
    return matrizColumns
      .filter(c => stageRe.test(c.label || '') && tipoRe.test(c.label || ''))
      .sort((a, b) => (a.position || 0) - (b.position || 0))
  }

  // Fecha y hora en que la pieza (fila de fría/caliente, tipo post o video) pasó a
  // estado "Aprobado" en su tarea correspondiente de la Matriz, según el orden en
  // que aparece entre las filas del mismo tipo en esa sección (indexEnTipo, 0-based).
  function aprobacionFilaFecha(clienteId, mes, seccionId, tipo, indexEnTipo) {
    if (!tipo) return null
    const candidates = candidateMatrizColumnsFor(seccionId, tipo)
    const col = candidates[indexEnTipo]
    if (!col) return null
    const task = matrizTasks.find(t => t.cliente_id === clienteId && t.mes_tarea === mes && t.columna_matriz === col.value && t.matriz_aprobado_at)
    return task ? task.matriz_aprobado_at : null
  }

  function actividadNota(clienteId, mes, campo) {
    return actividadNotas.find(n => n.cliente_id === clienteId && n.mes === mes && n.campo === campo) || null
  }

  async function saveActividadNota(clienteId, mes, campo, patch) {
    const merged = { cliente_id: clienteId, mes, campo, ...patch }
    setActividadNotas(prev => {
      const exists = prev.some(n => n.cliente_id === clienteId && n.mes === mes && n.campo === campo)
      return exists
        ? prev.map(n => (n.cliente_id === clienteId && n.mes === mes && n.campo === campo ? { ...n, ...merged } : n))
        : [...prev, merged]
    })
    const { error } = await supabase.from('cronograma_actividad_notas').upsert(merged, { onConflict: 'cliente_id,mes,campo' })
    if (error) fetchAll()
    return { error }
  }

  function actividadFecha(clienteId, mes, campo) {
    if (campo === 'tabla_productos') return tablaProductosFecha(clienteId, mes)
    if (campo === 'mallas') return aprobacionMatrizFecha(clienteId, mes, 'malla')
    if (campo === 'guiones') return aprobacionMatrizFecha(clienteId, mes, 'guion')
    return actividadNota(clienteId, mes, campo)?.fecha_manual || null
  }

  return {
    loading,
    clients,
    clientsByPeriod,
    isClientActiveInMonth,
    getConfig,
    saveConfig,
    sectionsForClient,
    networksForClient,
    hasVectorColumn,
    rowsFor,
    allRowsFor,
    addRow,
    ensureSeeded,
    updateRow,
    deleteRow,
    actividadFecha,
    actividadNota,
    saveActividadNota,
    aprobacionFilaFecha,
    refetch: fetchAll,
  }
}
