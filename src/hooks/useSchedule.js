import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { format } from 'date-fns'

export function useSchedule(selectedDate) {
  const { profile, isAdmin } = useAuth()
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [allProfiles, setAllProfiles] = useState([])
  const dateStr = selectedDate ? format(selectedDate, 'yyyy-MM-dd') : format(new Date(), 'yyyy-MM-dd')

  const fetchItems = useCallback(async () => {
    if (!profile) return
    setLoading(true)
    // Trae los pendientes del día seleccionado, más los pendientes de días
    // anteriores que aún no se han marcado como cumplidos (atrasados).
    // Un pendiente atrasado deja de aparecer únicamente cuando se le da el check.
    // Si el pendiente está vinculado a una Tarea Nativa (task_id), se trae
    // también el estado actual de esa tarea en su departamento operativo.
    let query = supabase
      .from('schedule_items')
      .select('*, tasks(id, title, cliente_id, department_id, column_id, kanban_columns(id, title, color, owner_role), clients(id, brand_name))')
      .or(`date.eq.${dateStr},and(date.lt.${dateStr},is_done.eq.false)`)
      .order('date', { ascending: true })
      .order('time_start', { ascending: true, nullsFirst: false })

    if (!isAdmin) {
      query = query.contains('assigned_to', [profile.id])
    }

    const { data, error } = await query
    if (error) {
      console.error('fetchItems error:', error)
      setLoading(false)
      return
    }

    if (data && data.length > 0) {
      const allUids = [...new Set(data.flatMap(i => i.assigned_to || []))]
      const { data: profileData } = await supabase
        .from('profiles')
        .select('id, full_name, display_name, username')
        .in('id', allUids)
      const profileMap = Object.fromEntries((profileData || []).map(p => [p.id, p]))
      setItems(
        data.map(item => ({
          ...item,
          done_by: item.done_by || [],
          assignees: (item.assigned_to || []).map(uid => profileMap[uid]).filter(Boolean),
          is_overdue: item.date < dateStr,
        }))
      )
    } else {
      setItems([])
    }
    setLoading(false)
  }, [profile, isAdmin, dateStr])

  useEffect(() => {
    if (!profile) return
    fetchItems()
    const channel = supabase
      .channel(`schedule-${dateStr}-${profile.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'schedule_items' }, fetchItems)
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [fetchItems, dateStr, profile])

  useEffect(() => {
    supabase
      .from('profiles')
      .select('id, full_name, display_name, username, department_id')
      .then(({ data }) => setAllProfiles(data || []))
  }, [])

  async function createItem(itemData) {
    const { error } = await supabase
      .from('schedule_items')
      .insert({ ...itemData, date: dateStr, created_by: profile.id, done_by: [] })
    if (!error) fetchItems()
    return { error }
  }

  async function createItemForDate(itemData, targetDateStr) {
    const { error } = await supabase
      .from('schedule_items')
      .insert({ ...itemData, date: targetDateStr, created_by: profile.id, done_by: [] })
    if (!error) fetchItems()
    return { error }
  }

  // toggleDone: per-user check.
  // - If multiple assignees: toggle this user's uid in done_by array.
  //   The DB trigger recalculates is_done (true only when ALL have checked).
  // - If single assignee or no assignees: toggle is_done directly.
  async function toggleDone(id, currentDoneBy) {
    const item = items.find(i => i.id === id)
    if (!item) return

    const assignees = item.assigned_to || []
    const doneBy = currentDoneBy || item.done_by || []
    const myId = profile.id

    if (assignees.length <= 1) {
      // Simple toggle: single or no assignee
      const newDoneBy = doneBy.includes(myId) ? [] : [myId]
      await supabase
        .from('schedule_items')
        .update({ done_by: newDoneBy })
        .eq('id', id)
    } else {
      // Multi-assignee: toggle current user's mark
      const newDoneBy = doneBy.includes(myId)
        ? doneBy.filter(uid => uid !== myId)
        : [...doneBy, myId]
      await supabase
        .from('schedule_items')
        .update({ done_by: newDoneBy })
        .eq('id', id)
    }
    fetchItems()
  }

  // Admin can force-reset or force-complete all
  async function adminSetDone(id, done) {
    const item = items.find(i => i.id === id)
    if (!item) return
    const newDoneBy = done ? [...(item.assigned_to || [])] : []
    await supabase.from('schedule_items').update({ done_by: newDoneBy }).eq('id', id)
    fetchItems()
  }

  async function updateItem(id, updates) {
    const { error } = await supabase.from('schedule_items').update(updates).eq('id', id)
    if (!error) fetchItems()
    return { error }
  }

  // Vincula una Tarea Nativa (de un departamento/cliente) al cronograma de un
  // día: crea el pendiente enlazado y refleja la asignación/fecha en la tarea.
  async function linkTask({ taskId, taskTitle, assignedToUserId, date, time_start, time_end }) {
    const { error: itemError } = await supabase.from('schedule_items').insert({
      title: taskTitle,
      task_id: taskId,
      assigned_to: [assignedToUserId],
      date,
      time_start: time_start || null,
      time_end: time_end || null,
      created_by: profile.id,
      done_by: [],
    })
    if (itemError) return { error: itemError }

    const { error: taskError } = await supabase
      .from('tasks')
      .update({ assigned_to: assignedToUserId, fecha_cronograma: date, updated_at: new Date().toISOString() })
      .eq('id', taskId)

    fetchItems()
    return { error: taskError || null }
  }

  // Súper-check de una Tarea Nativa: marca el pendiente como cumplido para
  // el usuario Y mueve la tarea a la columna de estado elegida en su
  // departamento operativo.
  async function completeNativeItem(item, targetColumnId) {
    if (!item.task_id) return { error: new Error('Este pendiente no está vinculado a una tarea') }
    const myId = profile.id
    const doneBy = item.done_by || []
    const newDoneBy = doneBy.includes(myId) ? doneBy : [...doneBy, myId]

    const { error: itemError } = await supabase
      .from('schedule_items')
      .update({ done_by: newDoneBy })
      .eq('id', item.id)

    const { error: taskError } = await supabase
      .from('tasks')
      .update({ column_id: targetColumnId, updated_at: new Date().toISOString() })
      .eq('id', item.task_id)

    fetchItems()
    return { error: itemError || taskError || null }
  }

  async function updateObservation(id, user_observation) {
    const item = items.find(i => i.id === id)
    await supabase.from('schedule_items').update({ user_observation }).eq('id', id)
    // Si el pendiente está vinculado a una Tarea Nativa, la observación
    // también queda registrada en el chat de esa tarea.
    if (item?.task_id && user_observation?.trim()) {
      await supabase.from('task_messages').insert({
        task_id: item.task_id,
        user_id: profile.id,
        content: `📋 Observación del cronograma: ${user_observation.trim()}`,
      })
    }
    fetchItems()
  }

  async function deleteItem(id) {
    await supabase.from('schedule_items').delete().eq('id', id)
    fetchItems()
  }

  // Helpers for UI
  // isDoneByUser: has this specific user checked?
  function isDoneByUser(item, userId) {
    return (item.done_by || []).includes(userId)
  }

  // isDoneByAll: all assignees have checked
  function isDoneByAll(item) {
    const assignees = item.assigned_to || []
    if (assignees.length === 0) return item.is_done
    return assignees.every(uid => (item.done_by || []).includes(uid))
  }

  // Admin's own items assigned to themselves
  const myItems = isAdmin
    ? items.filter(i => (i.assigned_to || []).includes(profile?.id))
    : items

  // Group by user (admin view)
  const itemsByUser = {}
  if (isAdmin) {
    items.forEach(item => {
      ;(item.assigned_to || []).forEach(uid => {
        if (!itemsByUser[uid]) {
          itemsByUser[uid] = {
            assignee: item.assignees?.find(a => a.id === uid),
            items: [],
          }
        }
        itemsByUser[uid].items.push(item)
      })
    })
  }

  const doneCount = items.filter(i => isDoneByAll(i)).length
  const totalCount = items.length

  return {
    items,
    myItems,
    itemsByUser,
    loading,
    allProfiles,
    doneCount,
    totalCount,
    createItem,
    createItemForDate,
    updateItem,
    toggleDone,
    adminSetDone,
    updateObservation,
    deleteItem,
    linkTask,
    completeNativeItem,
    isDoneByUser,
    isDoneByAll,
    refetch: fetchItems,
  }
}
