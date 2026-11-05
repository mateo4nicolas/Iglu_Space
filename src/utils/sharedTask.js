// Utilidades para tareas compartidas (varios editores en una misma tarea).
// Miembros = assigned_to (responsable) + shared_with.
// shared_progress = { [uid]: { column_id, sent_at } } — lo mantiene el trigger
// handle_shared_task_move en la base de datos.

export function sharedMembers(task) {
  if (!task) return []
  const ids = [task.assigned_to, ...(task.shared_with || [])].filter(Boolean)
  return [...new Set(ids)]
}

export function isSharedMember(task, uid) {
  return !!task?.is_shared && sharedMembers(task).includes(uid)
}

export function memberProgress(task, uid) {
  return (task?.shared_progress || {})[uid] || null
}

export function memberSentAt(task, uid) {
  return memberProgress(task, uid)?.sent_at || null
}

export function sharedSentCount(task) {
  const members = sharedMembers(task)
  const sent = members.filter(uid => !!memberSentAt(task, uid)).length
  return { sent, total: members.length }
}

// Vista personal de un editor: la tarea aparece en SU columna, o se oculta
// si ya mandó su parte. Devuelve null cuando no debe mostrarse.
export function personalTaskView(task, uid, columns = []) {
  if (!isSharedMember(task, uid)) return task
  if (memberSentAt(task, uid)) return null
  const colId = memberProgress(task, uid)?.column_id || task.column_id
  if (colId === task.column_id) return task
  const col = columns.find(c => c.id === colId)
  return {
    ...task,
    column_id: colId,
    kanban_columns: col
      ? { id: col.id, title: col.title, color: col.color, owner_role: col.owner_role }
      : task.kanban_columns,
  }
}
