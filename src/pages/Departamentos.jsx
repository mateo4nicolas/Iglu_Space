import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { useTasks } from '../hooks/useTasks'
import { useMatriz } from '../hooks/useMatriz'
import TaskModal from '../components/tasks/TaskModal'
import CreateTaskModal from '../components/tasks/CreateTaskModal'
import ColumnSettings from '../components/tasks/ColumnSettings'
import { cycleLabel, currentMesBase } from '../utils/cycleLabel'
import styles from './Departamentos.module.css'

export default function DepartamentosPage() {
  const { profile, isAdmin, myDeptIds } = useAuth()
  const [departments, setDepartments] = useState([])
  const [members, setMembers] = useState([])
  const [deptAdmins, setDeptAdmins] = useState({}) // { deptId: [userId,...] }
  const [expanded, setExpanded] = useState({})
  const [editingDept, setEditingDept] = useState(null)
  const [showNewDept, setShowNewDept] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => { fetchAll() }, [])

  async function fetchAll() {
    const [{ data: depts }, { data: profs }, { data: pd }] = await Promise.all([
      supabase.from('departments').select('*').order('position'),
      supabase.from('profiles').select('id, full_name, display_name, username, department_id, role'),
      supabase.from('profile_departments').select('user_id, department_id, member_role'),
    ])

    setDepartments(depts || [])

    // Build member map (for showing members inside dept)
    const pdMap = {}
    const adminMap = {}
    ;(pd || []).forEach(r => {
      if (!pdMap[r.user_id]) pdMap[r.user_id] = []
      pdMap[r.user_id].push(r.department_id)
      if (r.member_role === 'admin') {
        if (!adminMap[r.department_id]) adminMap[r.department_id] = []
        adminMap[r.department_id].push(r.user_id)
      }
    })
    setDeptAdmins(adminMap)

    const enriched = (profs || []).map(p => ({
      ...p,
      all_department_ids: pdMap[p.id] || (p.department_id ? [p.department_id] : []),
    }))
    setMembers(enriched)

    if (!isAdmin && profile?.department_id) {
      setExpanded({ [profile.department_id]: true })
    }
    setLoading(false)
  }

  async function saveDept(dept) {
    let deptId = dept.id
    if (deptId) {
      await supabase.from('departments').update({ name: dept.name, color: dept.color }).eq('id', deptId)
    } else {
      const { data: nd } = await supabase
        .from('departments')
        .insert({ name: dept.name, color: dept.color, position: departments.length })
        .select()
        .single()
      deptId = nd?.id
    }

    if (deptId && Array.isArray(dept.adminIds)) {
      // Remove old admin assignments, re-insert new ones
      await supabase.from('profile_departments').delete().eq('department_id', deptId).eq('member_role', 'admin')
      if (dept.adminIds.length > 0) {
        await supabase.from('profile_departments').upsert(
          dept.adminIds.map(uid => ({ user_id: uid, department_id: deptId, member_role: 'admin' })),
          { onConflict: 'user_id,department_id' }
        )
      }
    }

    setEditingDept(null)
    setShowNewDept(false)
    fetchAll()
  }

  async function deleteDept(id) {
    if (!confirm('¿Eliminar este departamento?')) return
    await supabase.from('departments').delete().eq('id', id)
    fetchAll()
  }

  function toggleExpand(id) {
    setExpanded(p => ({ ...p, [id]: !p[id] }))
  }

  // Each admin only sees departments where their ID is in deptAdmins[deptId]
  // Each user sees only their assigned depts
  // myDeptIds comes from AuthContext (already filtered correctly)
  const visibleDepts = departments.filter(d => (myDeptIds || []).includes(d.id))

  // All admin profiles (for dept admin picker)
  const adminProfiles = members.filter(m => m.role === 'admin')

  if (loading) return <div className={styles.loading}>Cargando departamentos...</div>

  return (
    <div className={styles.page}>
      <div className={styles.topbar}>
        <h1 className={styles.pageTitle}>Departamentos</h1>
        {isAdmin && (
          <button className="btn btn-primary" onClick={() => setShowNewDept(true)}>
            <PlusIcon /> Nuevo departamento
          </button>
        )}
      </div>

      {showNewDept && isAdmin && (
        <DeptForm
          adminProfiles={adminProfiles}
          currentAdminIds={[]}
          onSave={saveDept}
          onCancel={() => setShowNewDept(false)}
        />
      )}

      {visibleDepts.length === 0 && !showNewDept && (
        <div className={styles.empty}>
          {isAdmin
            ? 'No tienes departamentos asignados. Pide a otro admin que te asigne, o crea uno nuevo.'
            : 'Aún no estás asignado a un departamento.'}
        </div>
      )}

      <div className={styles.deptList}>
        {visibleDepts.map(dept => {
          const deptMembers = members.filter(m => (m.all_department_ids || []).includes(dept.id))
          const isOpen = expanded[dept.id]
          const currentDeptAdminIds = deptAdmins[dept.id] || []

          return (
            <div key={dept.id} className={styles.deptBlock}>
              <div className={styles.deptHeader} onClick={() => toggleExpand(dept.id)}>
                <div className={styles.deptLeft}>
                  <div className={styles.deptDot} style={{ background: dept.color }} />
                  {editingDept === dept.id ? (
                    <DeptForm
                      dept={dept}
                      adminProfiles={adminProfiles}
                      currentAdminIds={currentDeptAdminIds}
                      onSave={saveDept}
                      onCancel={() => setEditingDept(null)}
                      inline
                    />
                  ) : (
                    <span className={styles.deptName}>{dept.name}</span>
                  )}
                  <span className={styles.deptCount}>
                    {deptMembers.length} miembro{deptMembers.length !== 1 ? 's' : ''}
                  </span>
                </div>
                <div className={styles.deptRight} onClick={e => e.stopPropagation()}>
                  {isAdmin && editingDept !== dept.id && (
                    <>
                      <button className={styles.iconBtn} onClick={() => setEditingDept(dept.id)}><EditIcon /></button>
                      <button className={styles.iconBtn} style={{ color: 'var(--danger)' }} onClick={() => deleteDept(dept.id)}><TrashIcon /></button>
                    </>
                  )}
                  <span className={`${styles.chevron} ${isOpen ? styles.chevronOpen : ''}`}><ChevronIcon /></span>
                </div>
              </div>

              {isOpen && (
                <div className={styles.deptBody}>
                  <div className={styles.membersList}>
                    {deptMembers.length === 0 ? (
                      <p className={styles.noMembers}>Sin miembros asignados</p>
                    ) : (
                      deptMembers.map(m => (
                        <div key={m.id} className={styles.memberRow}>
                          <div className={styles.memberAvatar} style={{ background: dept.color + '22', color: dept.color }}>
                            {(m.username || m.display_name || m.full_name)[0].toUpperCase()}
                          </div>
                          <span className={styles.memberName}>
                            {m.username || m.display_name || m.full_name}
                          </span>
                          <span className={`badge ${m.role === 'admin' ? 'badge-admin' : 'badge-user'}`} style={{ fontSize: 10 }}>
                            {m.role === 'admin' ? 'Admin' : 'Usuario'}
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                  <DeptKanban departmentId={dept.id} deptColor={dept.color} isAdmin={isAdmin} />
                </div>
              )}
            </div>
          )
        })}
      </div>

      {isAdmin && <ClientesBoard isAdmin={isAdmin} />}
    </div>
  )
}

// ── Vista Clientes (espacio fijo, columnas = clientes activos por ciclo) ─────
const CLIENT_PERIODS = [
  { value: '1_31',  label: 'Clientes 1 al 31' },
  { value: '15_14', label: 'Clientes 15 al 14' },
]

function ClientesBoard({ isAdmin }) {
  const { clientsByPeriod, tasks, columnsForDept, updateTask, deleteTask, loading } = useMatriz()
  const [period, setPeriod] = useState(CLIENT_PERIODS[0].value)
  const [mesTarea, setMesTarea] = useState(currentMesBase())
  const [selectedTask, setSelectedTask] = useState(null)
  const [collapsed, setCollapsed] = useState({})

  const clientsInPeriod = clientsByPeriod(period)

  function tasksForClient(clientId) {
    return tasks.filter(t => t.cliente_id === clientId && t.approved !== false && t.mes_tarea === mesTarea)
  }

  function toggleCollapse(clientId) {
    setCollapsed(p => ({ ...p, [clientId]: !p[clientId] }))
  }

  function getOppositeColumnsFor(task) {
    // Consulta directa a Supabase (sin depender del cache de useMatriz) para
    // garantizar que se listen TODAS las columnas del departamento —
    // tanto las de usuarios como las de supervisores — sin ningún filtro por rol.
    return async () => {
      const { data } = await supabase
        .from('kanban_columns')
        .select('*')
        .eq('department_id', task.department_id)
        .order('position')
      if (data && data.length > 0) {
        return data.filter(c => c.id !== task.column_id)
      }
      // Fallback al cache local si la consulta directa no devuelve nada
      return columnsForDept(task.department_id).filter(c => c.id !== task.column_id)
    }
  }

  if (loading) return <div className={styles.kanbanLoading}>Cargando vista de clientes...</div>

  return (
    <div className={styles.clientesBoardBlock}>
      <div className={styles.kanbanTopbar}>
        <span className={styles.kanbanTitle}>Vista Clientes</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input
            type="month"
            className={styles.monthInput}
            value={mesTarea}
            onChange={e => setMesTarea(e.target.value)}
            title="Mes de las tareas a visualizar"
          />
          <span className={styles.cycleLabelBadge}>{cycleLabel(mesTarea, period)}</span>
        </div>
      </div>

      <div className={styles.clientTabs}>
        {CLIENT_PERIODS.map(p => (
          <button
            key={p.value}
            className={`${styles.clientTab} ${period === p.value ? styles.clientTabActive : ''}`}
            onClick={() => setPeriod(p.value)}
          >
            {p.label}
            <span className={styles.deptCount}>{clientsByPeriod(p.value).length}</span>
          </button>
        ))}
      </div>

      {clientsInPeriod.length === 0 ? (
        <p className={styles.noColumns}>No hay clientes activos en este ciclo.</p>
      ) : (
        <div className={styles.board}>
          {clientsInPeriod.map(client => {
            const clientTasks = tasksForClient(client.id)
            const isCollapsed = !!collapsed[client.id]
            return (
              <div key={client.id} className={`${styles.column} ${isCollapsed ? styles.columnCollapsed : ''}`}>
                <div className={styles.colHeader}>
                  <button
                    className={styles.collapseBtn}
                    onClick={() => toggleCollapse(client.id)}
                    title={isCollapsed ? 'Expandir' : 'Colapsar'}
                  >
                    <ChevronDownIcon collapsed={isCollapsed} />
                  </button>
                  <div className={styles.colDot} style={{ background: 'var(--accent)' }} />
                  <span className={styles.colTitle}>{client.brand_name}</span>
                  <span className={styles.colCount}>{clientTasks.length}</span>
                </div>
                {!isCollapsed && (
                  <div className={styles.cards}>
                    {clientTasks.length === 0 && <p className={styles.emptyCol}>Sin tareas este mes</p>}
                    {clientTasks.map(task => (
                      <TaskCard
                        key={task.id}
                        task={task}
                        isAdmin={isAdmin}
                        onClick={() => setSelectedTask(task)}
                        getOppositeColumns={getOppositeColumnsFor(task)}
                        onMove={(taskId, colId) => updateTask(taskId, { column_id: colId })}
                      />
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {selectedTask && (
        <TaskModal
          task={selectedTask}
          columns={columnsForDept(selectedTask.department_id)}
          onClose={() => setSelectedTask(null)}
          onUpdate={async (id, data) => { await updateTask(id, data); setSelectedTask(null) }}
          onApprove={async (id, approved) => { await updateTask(id, { approved }); setSelectedTask(null) }}
          onDelete={async (id) => { await deleteTask(id); setSelectedTask(null) }}
        />
      )}
    </div>
  )
}

// ── Kanban ──────────────────────────────────────────────────────────────────
function DeptKanban({ departmentId, isAdmin }) {
  const { tasks, columns, loading, createTask, updateTask, moveTask, deleteTask, saveColumn, deleteColumn, getOppositeColumns } = useTasks(departmentId)
  const [selectedTask, setSelectedTask] = useState(null)
  const [showCreate, setShowCreate] = useState(false)
  const [showColSettings, setShowColSettings] = useState(false)
  const [allDeptColumns, setAllDeptColumns] = useState([])

  useEffect(() => {
    if (!isAdmin) return
    supabase.from('kanban_columns').select('*').eq('department_id', departmentId).order('position')
      .then(({ data }) => setAllDeptColumns(data || []))
  }, [departmentId, isAdmin, showColSettings])

  const pendingApproval = tasks.filter(t => t.approved === null)

  if (loading) return <div className={styles.kanbanLoading}>Cargando tareas...</div>
  if (columns.length === 0 && !isAdmin) {
    return <p className={styles.noColumns}>El administrador aún no ha configurado las columnas.</p>
  }

  function getColTasks(colId) {
    return tasks.filter(t => t.column_id === colId && t.approved !== false)
  }

  return (
    <div className={styles.kanbanSection}>
      <div className={styles.kanbanTopbar}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span className={styles.kanbanTitle}>Tareas / Clientes</span>
          {isAdmin && pendingApproval.length > 0 && (
            <span className="badge badge-warning">{pendingApproval.length} pendiente{pendingApproval.length > 1 ? 's' : ''}</span>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {isAdmin && (
            <button className="btn btn-ghost" style={{ fontSize: 12, padding: '5px 10px' }} onClick={() => setShowColSettings(true)}>
              <SettingsIcon /> Columnas
            </button>
          )}
          <button className="btn btn-primary" style={{ fontSize: 12, padding: '5px 12px' }} onClick={() => setShowCreate(true)}>
            <PlusIcon /> Nueva tarea
          </button>
        </div>
      </div>

      <div className={styles.board}>
        {columns.map(col => {
          const colTasks = getColTasks(col.id)
          return (
            <div key={col.id} className={styles.column}>
              <div className={styles.colHeader}>
                <div className={styles.colDot} style={{ background: col.color }} />
                <span className={styles.colTitle}>{col.title}</span>
                <span className={styles.colCount}>{colTasks.length}</span>
              </div>
              <div className={styles.cards}>
                {colTasks.length === 0 && <p className={styles.emptyCol}>Sin tareas</p>}
                {colTasks.map(task => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    isAdmin={isAdmin}
                    onClick={() => setSelectedTask(task)}
                    getOppositeColumns={() => getOppositeColumns(task)}
                    onMove={moveTask}
                  />
                ))}
              </div>
            </div>
          )
        })}
        {columns.length === 0 && isAdmin && (
          <div className={styles.noColumns}>Configura las columnas usando el botón <strong>Columnas</strong>.</div>
        )}
      </div>

      {selectedTask && (
        <TaskModal
          task={selectedTask}
          columns={columns}
          onClose={() => setSelectedTask(null)}
          onUpdate={async (id, data) => { await updateTask(id, data); setSelectedTask(null) }}
          onApprove={async (id, approved) => {
            await updateTask(id, { approved, column_id: approved ? columns[0]?.id : null })
            setSelectedTask(null)
          }}
          onDelete={async (id) => { const r = await deleteTask(id); if (!r?.error) setSelectedTask(null) }}
        />
      )}
      {showCreate && (
        <CreateTaskModal columns={columns} departmentId={departmentId} onClose={() => setShowCreate(false)} onCreate={createTask} />
      )}
      {showColSettings && isAdmin && (
        <ColumnSettings
          columns={columns}
          allDeptColumns={allDeptColumns}
          onSave={col => {
            saveColumn(col)
            supabase.from('kanban_columns').select('*').eq('department_id', departmentId).order('position').then(({ data }) => setAllDeptColumns(data || []))
          }}
          onDelete={deleteColumn}
          onClose={() => setShowColSettings(false)}
        />
      )}
    </div>
  )
}

// ── Task Card ───────────────────────────────────────────────────────────────
function TaskCard({ task, isAdmin, onClick, getOppositeColumns, onMove }) {
  const [showMenu, setShowMenu] = useState(false)
  const [oppCols, setOppCols] = useState([])
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0 })
  const [loadingCols, setLoadingCols] = useState(false)
  const wrapRef = useRef(null)
  const closeTimer = useRef(null)
  const priorityColors = { urgent: 'var(--danger)', high: 'var(--warning)', normal: 'var(--info)', low: 'var(--text-muted)' }

  async function openMenu(e) {
    e.stopPropagation()
    if (showMenu) { setShowMenu(false); return }
    setLoadingCols(true)
    const cols = await getOppositeColumns()
    setOppCols(cols)
    const rect = wrapRef.current?.getBoundingClientRect()
    if (rect) {
      const menuWidth = 160
      const estimatedHeight = Math.min(280, 44 * cols.length + 8) || 60
      const spaceBelow = window.innerHeight - rect.bottom
      const openUp = spaceBelow < estimatedHeight + 12 && rect.top > estimatedHeight
      setMenuPos({
        top: openUp ? Math.max(8, rect.top - estimatedHeight - 4) : rect.bottom + 4,
        left: Math.min(Math.max(8, rect.right - menuWidth), window.innerWidth - menuWidth - 8),
      })
    }
    setLoadingCols(false)
    setShowMenu(true)
  }

  function startClose() { closeTimer.current = setTimeout(() => setShowMenu(false), 400) }
  function cancelClose() { clearTimeout(closeTimer.current) }

  useEffect(() => {
    if (!showMenu) return
    function handleClick(e) {
      const menuEl = document.getElementById('task-move-menu-' + task.id)
      if (menuEl?.contains(e.target)) return
      if (wrapRef.current?.contains(e.target)) return
      setShowMenu(false)
    }
    document.addEventListener('mousedown', handleClick, true)
    return () => document.removeEventListener('mousedown', handleClick, true)
  }, [showMenu, task.id])

  useEffect(() => () => clearTimeout(closeTimer.current), [])

  const assigneeName = task.profiles ? (task.profiles.username || task.profiles.display_name || task.profiles.full_name) : null

  return (
    <div className={styles.card} onClick={onClick}>
      <div className={styles.cardBar} style={{ background: priorityColors[task.priority] || 'var(--border)' }} />
      <div className={styles.cardBody}>
        {task.is_finished && <span className="badge badge-danger" style={{ fontSize: 10, marginBottom: 4 }}>Finalizado</span>}
        {task.approved === null && !task.is_finished && <span className="badge badge-warning" style={{ fontSize: 10, marginBottom: 4 }}>Pendiente aprobación</span>}
        <p className={styles.cardTitle}>{task.title}</p>
        {task.description && <p className={styles.cardDesc}>{task.description}</p>}
        {task.allow_transfer && !task.is_finished && <span style={{ fontSize: 9, color: 'var(--info)', marginTop: 2, display: 'block' }}>🔀 Transferible</span>}
        <div className={styles.cardFooter}>
          {assigneeName && <div className={styles.cardAvatar} title={assigneeName}>{assigneeName[0].toUpperCase()}</div>}
          <div
            ref={wrapRef}
            style={{ position: 'relative', marginLeft: 'auto' }}
            onClick={e => e.stopPropagation()}
            onMouseLeave={startClose}
            onMouseEnter={cancelClose}
          >
            <button className={styles.moveBtn} onClick={openMenu} disabled={loadingCols}><MoveIcon /></button>
          </div>
          {showMenu && createPortal(
            <div
              id={'task-move-menu-' + task.id}
              className={styles.moveMenu}
              style={{ top: menuPos.top, left: menuPos.left, position: 'fixed' }}
              onMouseEnter={cancelClose}
              onMouseLeave={startClose}
            >
              {oppCols.length === 0
                ? <p style={{ padding: '8px 10px', fontSize: 12, color: 'var(--text-muted)' }}>Sin columnas disponibles</p>
                : oppCols.map(c => (
                  <button key={c.id} className={styles.moveOpt} onClick={() => { cancelClose(); onMove(task.id, c.id); setShowMenu(false) }}>
                    <span className={styles.moveDot} style={{ background: c.color }} />
                    {c.title}
                  </button>
                ))
              }
            </div>,
            document.body
          )}
        </div>
      </div>
    </div>
  )
}

// ── Dept form ───────────────────────────────────────────────────────────────
const COLORS = ['#6366f1','#60a5fa','#34d399','#fbbf24','#f87171','#a78bfa','#fb923c','#e879f9','#2dd4bf']

function DeptForm({ dept, adminProfiles, currentAdminIds, onSave, onCancel, inline }) {
  const [name, setName] = useState(dept?.name || '')
  const [color, setColor] = useState(dept?.color || COLORS[0])
  const [adminIds, setAdminIds] = useState(currentAdminIds || [])

  function toggleAdmin(id) {
    setAdminIds(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id])
  }

  function nameFor(p) { return p.username || p.display_name || p.full_name }

  return (
    <div className={inline ? styles.deptFormInline : styles.deptFormCard} onClick={e => e.stopPropagation()}>
      <input
        className={styles.deptInput}
        placeholder="Nombre del departamento"
        value={name}
        onChange={e => setName(e.target.value)}
        autoFocus
      />
      <div className={styles.colorRow}>
        {COLORS.map(c => (
          <button key={c} type="button" className={`${styles.colorChip} ${color === c ? styles.colorSel : ''}`} style={{ background: c }} onClick={() => setColor(c)} />
        ))}
      </div>

      {adminProfiles.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Admins autorizados para este departamento
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {adminProfiles.map(p => {
              const nm = nameFor(p)
              const sel = adminIds.includes(p.id)
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => toggleAdmin(p.id)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    padding: '5px 12px', borderRadius: 999,
                    border: `1.5px solid ${sel ? 'var(--accent)' : 'var(--border)'}`,
                    background: sel ? 'var(--accent-dim)' : 'var(--bg-hover)',
                    color: sel ? 'var(--accent)' : 'var(--text-secondary)',
                    fontSize: 12, fontWeight: sel ? 600 : 400, cursor: 'pointer',
                    transition: 'all 0.12s',
                  }}
                >
                  <span style={{ width: 20, height: 20, borderRadius: '50%', background: sel ? 'var(--accent)' : 'var(--border)', color: '#fff', fontSize: 10, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    {nm[0]?.toUpperCase()}
                  </span>
                  {nm}{sel ? ' ✓' : ''}
                </button>
              )
            })}
          </div>
          <p style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 5 }}>
            Solo los admins seleccionados podrán ver y gestionar este departamento.
          </p>
        </div>
      )}

      <div style={{ display: 'flex', gap: 6, marginTop: 12 }}>
        <button
          className="btn btn-primary"
          style={{ fontSize: 12, padding: '5px 12px' }}
          onClick={() => name.trim() && onSave({ ...dept, name: name.trim(), color, adminIds })}
        >
          {dept?.id ? 'Guardar' : 'Crear'}
        </button>
        <button className="btn btn-ghost" style={{ fontSize: 12, padding: '5px 12px' }} onClick={onCancel}>Cancelar</button>
      </div>
    </div>
  )
}

function PlusIcon()     { return <svg width="13" height="13" viewBox="0 0 16 16" fill="none"><path d="M8 2v12M2 8h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg> }
function EditIcon()     { return <svg width="13" height="13" viewBox="0 0 16 16" fill="none"><path d="M11 2l3 3-9 9H2v-3l9-9z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/></svg> }
function TrashIcon()    { return <svg width="13" height="13" viewBox="0 0 16 16" fill="none"><path d="M2 4h12M5 4V3h6v1M6 7v5M10 7v5M3 4l1 9h8l1-9" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/></svg> }
function ChevronIcon()  { return <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg> }
function SettingsIcon() { return <svg width="13" height="13" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="2.5" stroke="currentColor" strokeWidth="1.3"/><path d="M8 1v2M8 13v2M1 8h2M13 8h2M3.05 3.05l1.41 1.41M11.54 11.54l1.41 1.41M3.05 12.95l1.41-1.41M11.54 4.46l1.41-1.41" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg> }
function MoveIcon()     { return <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg> }
function ChevronDownIcon({ collapsed }) {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" style={{ transform: collapsed ? 'rotate(-90deg)' : 'none', transition: 'transform 0.15s' }}>
      <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}
