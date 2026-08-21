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
  const [loading, setLoading] = useState(true)

  const fetchAll = useCallback(async () => {
    const [
      { data: clientsData },
      { data: tasksData },
      { data: colsData },
      { data: deptData },
      { data: matrizColsData },
    ] = await Promise.all([
      supabase.from('clients').select('*').eq('is_active', true).order('brand_name'),
      supabase.from('tasks').select(TASK_SELECT).not('cliente_id', 'is', null).order('updated_at', { ascending: false }),
      supabase.from('kanban_columns').select('*').order('position'),
      supabase.from('departments').select('*').order('position'),
      supabase.from('columnas_matriz').select('*').order('position'),
    ])
    setClients(clientsData || [])
    setTasks(tasksData || [])
    setAllColumns(colsData || [])
    setDepartments(deptData || [])
    setMatrizColumns(matrizColsData || [])
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

  // ── Checkbox "Tabla de productos" por cliente ────────────────────────────
  async function toggleTablaProductos(clientId) {
    setClients(prev => prev.map(c => c.id === clientId ? { ...c, tabla_productos: !c.tabla_productos } : c))
    const { data, error } = await supabase.rpc('toggle_tabla_productos', { p_client_id: clientId })
    if (error) {
      fetchAll()
    } else {
      setClients(prev => prev.map(c => c.id === clientId ? { ...c, tabla_productos: data } : c))
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
    saveMatrizColumn,
    deleteMatrizColumn,
    generarProximoMes,
    refetch: fetchAll,
  }
}
