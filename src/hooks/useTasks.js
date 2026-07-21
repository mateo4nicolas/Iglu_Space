import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

export function useTasks(departmentId) {
  const { profile, isAdmin, isSuperAdmin } = useAuth()
  const [tasks, setTasks] = useState([])
  const [columns, setColumns] = useState([])
  const [loading, setLoading] = useState(true)

  const fetchColumns = useCallback(async () => {
    if (!departmentId) return
    const { data } = await supabase
      .from('kanban_columns')
      .select('*')
      .eq('department_id', departmentId)
      .order('position')

    const allCols = data || []

    if (isSuperAdmin) {
      setColumns(allCols)
    } else if (isAdmin) {
      setColumns(allCols.filter(c => c.owner_role === 'admin' || (!c.owner_role && c.auto_assign_to !== 'user')))
    } else {
      setColumns(allCols.filter(c => c.owner_role === 'user'))
    }
  }, [departmentId, isAdmin, isSuperAdmin])

  const fetchTasks = useCallback(async () => {
    if (!profile || !departmentId) return
    let query = supabase
      .from('tasks')
      .select('*, profiles!tasks_assigned_to_fkey(id, full_name, display_name, username), kanban_columns(id, title, color, owner_role), departments(id, name, color), clients(id, brand_name, billing_period), allow_transfer, transfer_to_dept_ids')
      .eq('department_id', departmentId)
      .order('created_at', { ascending: false })

    if (!isAdmin && !isSuperAdmin) {
      query = query.or(`assigned_to.eq.${profile.id},created_by.eq.${profile.id}`)
    }

    const { data } = await query
    setTasks(data || [])
    setLoading(false)
  }, [profile, isAdmin, isSuperAdmin, departmentId])

  useEffect(() => {
    if (!departmentId) return
    fetchColumns()
    fetchTasks()
    const channel = supabase
      .channel(`tasks-${departmentId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks', filter: `department_id=eq.${departmentId}` }, fetchTasks)
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [fetchColumns, fetchTasks, departmentId])

  function normTitle(t) {
    return (t || '').toString().trim().toLowerCase()
  }

  async function getOppositeColumns(task) {
    const { data } = await supabase
      .from('kanban_columns')
      .select('*')
      .eq('department_id', departmentId)
      .order('position')
    if (!data) return []
    if (isSuperAdmin) {
      return data
    } else if (isAdmin) {
      return data.filter(c => c.owner_role === 'user')
    } else {
      let result = data.filter(c => c.owner_role === 'admin' || (!c.owner_role && c.auto_assign_to !== 'user'))
      // Excepción: desde "Enviar al Cliente" el usuario también puede pasar
      // directamente a "Enviado al Cliente" (ambas columnas de usuario),
      // para llevar el control de lo que ya se envió. No aplica en ninguna otra columna.
      if (task) {
        const currentCol = data.find(c => c.id === task.column_id)
        if (currentCol && normTitle(currentCol.title) === 'enviar al cliente') {
          const enviado = data.find(c => c.owner_role === 'user' && normTitle(c.title) === 'enviado al cliente')
          if (enviado && !result.some(c => c.id === enviado.id)) {
            result = [...result, enviado]
          }
        }
      }
      return result
    }
  }

  async function createTask(taskData) {
    const firstCol = columns[0]
    const { data, error } = await supabase
      .from('tasks')
      .insert({
        ...taskData,
        created_by: profile.id,
        approved: (isAdmin || isSuperAdmin) ? true : null,
        column_id: taskData.column_id || firstCol?.id,
        department_id: departmentId,
      })
      .select()
      .single()
    if (!error) fetchTasks()
    return { data, error }
  }

  async function updateTask(id, updates) {
    const { error } = await supabase
      .from('tasks')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id)
    if (!error) fetchTasks()
    return { error }
  }

  async function moveTask(taskId, newColumnId) {
    return updateTask(taskId, { column_id: newColumnId })
  }

  // saveColumn: saves a single column WITHOUT triggering fetchColumns
  // fetchColumns is only called once at the end (from Tareas.jsx after all saves)
  async function saveColumn(col) {
    if (col.id) {
      await supabase
        .from('kanban_columns')
        .update({
          title: col.title,
          color: col.color,
          position: col.position,
          auto_assign_to: col.auto_assign_to,
          owner_role: col.owner_role,
        })
        .eq('id', col.id)
    } else {
      await supabase
        .from('kanban_columns')
        .insert({ ...col, department_id: departmentId })
    }
    // Do NOT call fetchColumns() here — caller controls when to refresh
  }

  // refreshColumns: explicit refresh after all saves are done
  async function refreshColumns() {
    await fetchColumns()
  }

  async function deleteColumn(id) {
    await supabase.from('kanban_columns').delete().eq('id', id)
    // Don't refresh here either — ColumnSettings removes it from local state immediately
  }

  async function deleteTask(id) {
    const { error } = await supabase.from('tasks').delete().eq('id', id)
    if (error) { console.error('deleteTask error:', error); return { error } }
    fetchTasks()
    return { error: null }
  }

  return { tasks, columns, loading, createTask, updateTask, moveTask, deleteTask, saveColumn, deleteColumn, refreshColumns, getOppositeColumns, refetch: fetchTasks }
}
