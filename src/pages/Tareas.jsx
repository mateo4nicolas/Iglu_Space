import { useState, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import TaskModal from '../components/tasks/TaskModal'
import CreateTaskModal from '../components/tasks/CreateTaskModal'
import ColumnSettings from '../components/tasks/ColumnSettings'
import styles from './Tareas.module.css'

const PRIORITY_ORDER = { urgent: 0, high: 1, normal: 2, low: 3 }
const priorityConfig = {
  low:    { label: 'Baja',    color: 'var(--text-muted)' },
  normal: { label: 'Normal',  color: 'var(--info)' },
  high:   { label: 'Alta',    color: 'var(--warning)' },
  urgent: { label: 'Urgente', color: 'var(--danger)' },
}

export default function TareasPage() {
  const { profile, isAdmin, isSuperAdmin, myDeptIds } = useAuth()
  const [tasks, setTasks] = useState([])
  const [columns, setColumns] = useState([])
  const [allDeptColumns, setAllDeptColumns] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedTask, setSelectedTask] = useState(null)
  const [showCreate, setShowCreate] = useState(false)
  const [showSettings, setShowSettings] = useState(false)

  // Use first dept from myDeptIds
  const departmentId = myDeptIds?.[0] || null

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
    setAllDeptColumns(allCols)
  }, [departmentId, isAdmin, isSuperAdmin])

  const fetchTasks = useCallback(async () => {
    if (!profile || !departmentId) return
    let query = supabase
      .from('tasks')
      .select('*, profiles!tasks_assigned_to_fkey(id, full_name, display_name, username), kanban_columns(id, title, color, owner_role), departments(id, name, color), allow_transfer, transfer_to_dept_ids')
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
    if (!departmentId) {
      setLoading(false)
      return
    }
    setLoading(true)
    fetchColumns()
    fetchTasks()
    const channel = supabase
      .channel(`tareas-page-${departmentId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks', filter: `department_id=eq.${departmentId}` }, fetchTasks)
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [fetchColumns, fetchTasks, departmentId])

  async function moveTask(taskId, newColumnId) {
    // Optimistic update
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, column_id: newColumnId } : t))
    const { error } = await supabase
      .from('tasks')
      .update({ column_id: newColumnId, updated_at: new Date().toISOString() })
      .eq('id', taskId)
    if (error) fetchTasks() // revert on error
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

  async function saveColumn(col) {
    if (col.id) {
      await supabase.from('kanban_columns').update({
        title: col.title,
        color: col.color,
        position: col.position,
        auto_assign_to: col.auto_assign_to,
        owner_role: col.owner_role,
      }).eq('id', col.id)
    } else {
      await supabase.from('kanban_columns').insert({ ...col, department_id: departmentId })
    }
  }

  async function deleteColumn(id) {
    await supabase.from('kanban_columns').delete().eq('id', id)
  }

  async function handleSettingsClose() {
    setShowSettings(false)
    await fetchColumns()
  }

  function getTasksForColumn(colId) {
    return tasks
      .filter(t => t.column_id === colId && t.approved !== false)
      .sort((a, b) => (PRIORITY_ORDER[a.priority] ?? 2) - (PRIORITY_ORDER[b.priority] ?? 2))
  }

  if (loading) return <div className={styles.loading}>Cargando tablero...</div>
  if (!departmentId) return <div className={styles.loading}>No tienes un departamento asignado.</div>

  const pendingApproval = tasks.filter(t => t.approved === null)

  return (
    <div className={styles.page}>
      <div className={styles.topbar}>
        <div className={styles.topLeft}>
          <h1 className={styles.pageTitle}>Tablero</h1>
          {(isAdmin || isSuperAdmin) && pendingApproval.length > 0 && (
            <span className="badge badge-warning" style={{ fontSize: 12 }}>
              {pendingApproval.length} pendiente{pendingApproval.length > 1 ? 's' : ''} de aprobación
            </span>
          )}
        </div>
        <div className={styles.topRight}>
          {(isAdmin || isSuperAdmin) && (
            <button className="btn btn-ghost" onClick={() => setShowSettings(true)}>
              <SettingsIcon /> Columnas
            </button>
          )}
          <button className="btn btn-primary" onClick={() => setShowCreate(true)}>
            <PlusIcon /> Nueva tarea
          </button>
        </div>
      </div>

      <div className={styles.board}>
        {columns.length === 0 && (
          <div className={styles.emptyCol} style={{ padding: 40, color: 'var(--text-muted)', fontSize: 14 }}>
            {(isAdmin || isSuperAdmin) ? 'Configura las columnas usando el botón "Columnas".' : 'El administrador aún no ha configurado las columnas.'}
          </div>
        )}
        {columns.map(col => {
          const colTasks = getTasksForColumn(col.id)
          return (
            <div key={col.id} className={styles.column}>
              <div className={styles.columnHeader}>
                <div className={styles.columnTitle}>
                  <span className={styles.columnDot} style={{ background: col.color }} />
                  <span>{col.title}</span>
                </div>
                <span className={styles.columnCount}>{colTasks.length}</span>
              </div>
              <div className={styles.cards}>
                {colTasks.length === 0 && <div className={styles.emptyCol}>Sin tareas</div>}
                {colTasks.map(task => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    columns={allDeptColumns}
                    onClick={() => setSelectedTask(task)}
                    onMove={moveTask}
                  />
                ))}
              </div>
            </div>
          )
        })}
      </div>

      {selectedTask && (
        <TaskModal
          task={selectedTask}
          columns={allDeptColumns}
          onClose={() => setSelectedTask(null)}
          onUpdate={async (id, data) => { await updateTask(id, data); setSelectedTask(null) }}
        />
      )}
      {showCreate && (
        <CreateTaskModal
          columns={columns}
          onClose={() => setShowCreate(false)}
          onCreate={createTask}
        />
      )}
      {showSettings && (isAdmin || isSuperAdmin) && (
        <ColumnSettings
          columns={columns}
          allDeptColumns={allDeptColumns}
          onSave={saveColumn}
          onDelete={deleteColumn}
          onClose={handleSettingsClose}
        />
      )}
    </div>
  )
}

function TaskCard({ task, columns, onClick, onMove }) {
  const [showMoveMenu, setShowMoveMenu] = useState(false)
  const [menuPos, setMenuPos] = useState(null)
  const btnRef = useRef(null)
  const menuRef = useRef(null)
  const pc = priorityConfig[task.priority] || priorityConfig.normal
  const isPending = task.approved === null

  // Close menu when clicking outside (button or portaled menu)
  useEffect(() => {
    if (!showMoveMenu) return
    function handleOutside(e) {
      if (btnRef.current?.contains(e.target)) return
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setShowMoveMenu(false)
      }
    }
    document.addEventListener('mousedown', handleOutside)
    document.addEventListener('touchstart', handleOutside)
    return () => {
      document.removeEventListener('mousedown', handleOutside)
      document.removeEventListener('touchstart', handleOutside)
    }
  }, [showMoveMenu])

  function toggleMenu(e) {
    e.stopPropagation()
    if (showMoveMenu) { setShowMoveMenu(false); return }
    const rect = btnRef.current.getBoundingClientRect()
    const menuWidth = 180
    const estimatedHeight = Math.min(280, 40 * columns.filter(c => c.id !== task.column_id).length + 8)
    const spaceBelow = window.innerHeight - rect.bottom
    const openUp = spaceBelow < estimatedHeight + 12 && rect.top > estimatedHeight
    setMenuPos({
      top: openUp ? Math.max(8, rect.top - estimatedHeight - 4) : rect.bottom + 4,
      left: Math.min(Math.max(8, rect.right - menuWidth), window.innerWidth - menuWidth - 8),
    })
    setShowMoveMenu(true)
  }

  return (
    <div
      className={`${styles.card} ${isPending ? styles.cardPending : ''}`}
      onClick={onClick}
    >
      <div className={styles.cardPriorityBar} style={{ background: pc.color }} />
      <div className={styles.cardBody}>
        {isPending && (
          <span className="badge badge-warning" style={{ fontSize: 10, marginBottom: 4 }}>
            Esperando aprobación
          </span>
        )}
        <p className={styles.cardTitle}>{task.title}</p>
        {task.description && <p className={styles.cardDesc}>{task.description}</p>}
        <div className={styles.cardFooter}>
          <div className={styles.cardMeta}>
            {task.profiles && (
              <div className={styles.cardAvatar} title={task.profiles.full_name}>
                {task.profiles.full_name?.[0]?.toUpperCase()}
              </div>
            )}
            {task.departments && (
              <span className={styles.cardDept}>{task.departments.name}</span>
            )}
          </div>
          <div style={{ position: 'relative' }} onClick={e => e.stopPropagation()}>
            <button
              ref={btnRef}
              className={styles.moveBtn}
              onPointerDown={toggleMenu}
              aria-label="Mover tarea"
            >
              <MoveIcon />
            </button>
          </div>
          {showMoveMenu && menuPos && createPortal(
            <div
              ref={menuRef}
              className={styles.moveMenu}
              style={{ position: 'fixed', top: menuPos.top, left: menuPos.left }}
              onClick={e => e.stopPropagation()}
            >
              {columns.filter(c => c.id !== task.column_id).map(c => (
                <button
                  key={c.id}
                  className={styles.moveOption}
                  onPointerDown={e => { e.stopPropagation(); onMove(task.id, c.id); setShowMoveMenu(false) }}
                >
                  <span className={styles.moveDot} style={{ background: c.color }} />
                  {c.title}
                </button>
              ))}
            </div>,
            document.body
          )}
        </div>
      </div>
    </div>
  )
}

function PlusIcon() {
  return <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M8 2v12M2 8h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
}
function SettingsIcon() {
  return <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="2.5" stroke="currentColor" strokeWidth="1.3"/><path d="M8 1v2M8 13v2M1 8h2M13 8h2M3.05 3.05l1.41 1.41M11.54 11.54l1.41 1.41M3.05 12.95l1.41-1.41M11.54 4.46l1.41-1.41" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>
}
function MoveIcon() {
  return <svg width="13" height="13" viewBox="0 0 16 16" fill="none"><path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>
}
