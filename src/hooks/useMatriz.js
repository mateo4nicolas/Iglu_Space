import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'

const TASK_SELECT = `
  id, title, description, links, status, priority, approved, is_finished,
  cliente_id, periodo, columna_matriz, column_id, department_id, mes_tarea,
  assigned_to, created_by, created_at, updated_at,
  allow_transfer, transfer_to_dept_ids,
  profiles!tasks_assigned_to_fkey(id, full_name, display_name, username),
  kanban_columns(id, title, color, owner_role),
  departments(id, name, color),
  clients(id, brand_name, billing_period)
`

export function useMatriz() {
  const [clients, setClients] = useState([])
  const [tasks, setTasks] = useState([])
  const [allColumns, setAllColumns] = useState([])
  const [departments, setDepartments] = useState([])
  const [matrizColumns, setMatrizColumns] = useState([])
  const [tablaProductos, setTablaProductos] = useState([]) // [{ cliente_id, mes, checked }]
  const [clientVisibility, setClientVisibility] = useState([]) // [{ cliente_id, mes, active }]
  const [loading, setLoading] = useState(true)

  const fetchAll = useCallback(async () => {
    const [
      { data: clientsData },
      { data: tasksData },
      { data: colsData },
      { data: deptData },
      { data: matrizColsData },
      { data: tablaProductosData },
      { data: visibilityData },
    ] = await Promise.all([
      supabase.from('clients').select('*').eq('is_active', true).order('brand_name'),
      supabase.from('tasks').select(TASK_SELECT).not('cliente_id', 'is', null).order('updated_at', { ascending: false }),
      supabase.from('kanban_columns').select('*').order('position'),
      supabase.from('departments').select('*').order('position'),
      supabase.from('columnas_matriz').select('*').order('position'),
      supabase.from('matriz_tabla_productos').select('*'),
      supabase.from('matriz_client_visibility').select('*').order('mes', { ascending: true }).order('created_at', { ascending: true }),
    ])
    setClients(clientsData || [])
    setTasks(tasksData || [])
    setAllColumns(colsData || [])
    setDepartments(deptData || [])
    setMatrizColumns(matrizColsData || [])
    setTablaProductos(tablaProductosData || [])
    setClientVisibility(visibilityData || [])
    setLoading(false)
  }, [])

  useEffect(() => {
    setLoading(true)
    fetchAll()
    const channel = supabase
      .channel('matriz-control-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, fetchAll)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'clients' }, fetchAll)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'kanban_columns' }, fetchAll)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'columnas_matriz' }, fetchAll)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'historial_matriz' }, fetchAll)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'matriz_tabla_productos' }, fetchAll)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'matriz_client_visibility' }, fetchAll)
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [fetchAll])

  const activeMatrizColumns = matrizColumns.filter(c => c.is_active)

  // Tarea más reciente para un cliente + entregable + mes dado
  function taskFor(clienteId, columnaMatriz, mesTarea) {
    return tasks.find(t => t.cliente_id === clienteId && t.columna_matriz === columnaMatriz && t.mes_tarea === mesTarea) || null
  }

  function clientsByPeriod(period) {
    return clients.filter(c => c.billing_period === period)
  }

  // ── Pausar/reactivar un cliente en la Matriz, por mes, sin borrar historial ──
  function isClientActiveInMonth(clientId, mes) {
    const entries = clientVisibility.filter(v => v.cliente_id === clientId && v.mes <= mes)
    if (entries.length === 0) return true // sin registro -> activo por defecto
    const latest = entries[entries.length - 1] // vienen ordenadas por mes asc desde fetchAll
    return latest.active
  }

  async function setClientActiveFrom(clientId, mes, active) {
    setClientVisibility(prev => {
      const exists = prev.some(v => v.cliente_id === clientId && v.mes === mes)
      return exists
        ? prev.map(v => (v.cliente_id === clientId && v.mes === mes ? { ...v, active } : v))
        : [...prev, { cliente_id: clientId, mes, active }]
    })
    const { error } = await supabase
      .from('matriz_client_visibility')
      .upsert({ cliente_id: clientId, mes, active }, { onConflict: 'cliente_id,mes' })
    if (error) fetchAll()
    return { error }
  }

  function columnsForDept(departmentId) {
    return allColumns.filter(c => c.department_id === departmentId)
  }

  async function updateTask(id, updates) {
    const { error } = await supabase
      .from('tasks')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id)
    if (!error) fetchAll()
    return { error }
  }

  async function approveTask(id, approved) {
    return updateTask(id, { approved })
  }

  async function deleteTask(id) {
    const { error } = await supabase.from('tasks').delete().eq('id', id)
    if (!error) fetchAll()
    return { error }
  }

  // ── Checkbox "Tabla de productos" por cliente Y por mes ──────────────────
  function tablaProductosChecked(clientId, mes) {
    return !!tablaProductos.find(t => t.cliente_id === clientId && t.mes === mes)?.checked
  }

  async function toggleTablaProductos(clientId, mes) {
    setTablaProductos(prev => {
      const exists = prev.some(t => t.cliente_id === clientId && t.mes === mes)
      return exists
        ? prev.map(t => (t.cliente_id === clientId && t.mes === mes ? { ...t, checked: !t.checked } : t))
        : [...prev, { cliente_id: clientId, mes, checked: true }]
    })
    const { data, error } = await supabase.rpc('toggle_tabla_productos_mes', { p_client_id: clientId, p_mes: mes })
    if (error) {
      fetchAll()
    } else {
      setTablaProductos(prev => {
        const exists = prev.some(t => t.cliente_id === clientId && t.mes === mes)
        return exists
          ? prev.map(t => (t.cliente_id === clientId && t.mes === mes ? { ...t, checked: data } : t))
          : [...prev, { cliente_id: clientId, mes, checked: data }]
      })
    }
    return { data, error }
  }

  // ── Gestión de columnas dinámicas de la matriz ──────────────────────────
  async function saveMatrizColumn(col) {
    if (col.id) {
      const { error } = await supabase
        .from('columnas_matriz')
        .update({
          label: col.label,
          value: col.value,
          department_id: col.department_id || null,
          position: col.position,
          is_active: col.is_active,
        })
        .eq('id', col.id)
      if (!error) fetchAll()
      return { error }
    }
    const { error } = await supabase.from('columnas_matriz').insert({
      label: col.label,
      value: col.value,
      department_id: col.department_id || null,
      position: col.position ?? matrizColumns.length,
      is_active: true,
    })
    if (!error) fetchAll()
    return { error }
  }

  async function deleteMatrizColumn(id) {
    const { error } = await supabase.from('columnas_matriz').delete().eq('id', id)
    if (!error) fetchAll()
    return { error }
  }

  // ── Generar tareas del próximo mes para un cliente (no toca el mes actual) ──
  async function generarProximoMes(clienteId, mesActual) {
    const { data, error } = await supabase.rpc('handle_generar_proximo_mes_cliente', {
      p_cliente_id: clienteId,
      p_mes_actual: mesActual,
    })
    if (!error) fetchAll()
    return { data, error }
  }

  return {
    clients,
    tasks,
    allColumns,
    departments,
    matrizColumns,
    activeMatrizColumns,
    loading,
    taskFor,
    clientsByPeriod,
    columnsForDept,
    updateTask,
    approveTask,
    deleteTask,
    toggleTablaProductos,
    tablaProductosChecked,
    isClientActiveInMonth,
    setClientActiveFrom,
    saveMatrizColumn,
    deleteMatrizColumn,
    generarProximoMes,
    refetch: fetchAll,
  }
}
