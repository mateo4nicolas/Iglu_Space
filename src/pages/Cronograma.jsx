import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useAuth } from '../context/AuthContext'
import { useSchedule } from '../hooks/useSchedule'
import {
  format, addDays, subDays, isToday, addMonths, subMonths,
  startOfMonth, endOfMonth, eachDayOfInterval, getDay,
} from 'date-fns'
import { es } from 'date-fns/locale'
import { supabase } from '../lib/supabase'
import TaskModal from '../components/tasks/TaskModal'
import { cycleLabel } from '../utils/cycleLabel'
import styles from './Cronograma.module.css'

export default function CronogramaPage() {
  const { isAdmin } = useAuth()
  const [selectedDate, setSelectedDate] = useState(new Date())
  const [viewMode, setViewMode] = useState('day')
  const [calMonth, setCalMonth] = useState(new Date())
  const [showCreate, setShowCreate] = useState(false)
  const [showAssignChoice, setShowAssignChoice] = useState(false)
  const [showLinkTask, setShowLinkTask] = useState(false)
  const [editingItem, setEditingItem] = useState(null)
  const [openTask, setOpenTask] = useState(null) // { task, columns }

  const {
    items,
    itemsByUser,
    loading,
    allProfiles,
    doneCount,
    totalCount,
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
    refetch,
  } = useSchedule(selectedDate)

  async function handleOpenTask(task) {
    if (!task?.id) return
    const { data: fullTask } = await supabase
      .from('tasks')
      .select('*, profiles!tasks_assigned_to_fkey(id, full_name, display_name, username), kanban_columns(id, title, color, owner_role), departments(id, name, color), clients(id, brand_name, billing_period)')
      .eq('id', task.id)
      .single()
    if (!fullTask) return
    const { data: cols } = await supabase
      .from('kanban_columns')
      .select('*')
      .eq('department_id', fullTask.department_id)
      .order('position')
    setOpenTask({ task: fullTask, columns: cols || [] })
  }

  async function updateOpenTask(id, updates) {
    await supabase.from('tasks').update({ ...updates, updated_at: new Date().toISOString() }).eq('id', id)
    refetch()
  }
  async function approveOpenTask(id, approved) {
    await updateOpenTask(id, { approved })
  }
  async function deleteOpenTask(id) {
    await supabase.from('tasks').delete().eq('id', id)
    refetch()
  }

  const dateLabel = format(selectedDate, "EEEE d 'de' MMMM, yyyy", { locale: es })
  const progress = totalCount > 0 ? Math.round((doneCount / totalCount) * 100) : 0

  return (
    <div className={styles.page}>
      <div className={styles.topbar}>
        <div className={styles.topLeft}>
          <h1 className={styles.pageTitle}>Cronograma</h1>
          {viewMode === 'day' && isToday(selectedDate) && (
            <span className="badge badge-success">Hoy</span>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <div className={styles.viewToggle}>
            <button
              className={`${styles.viewBtn} ${viewMode === 'day' ? styles.viewBtnActive : ''}`}
              onClick={() => setViewMode('day')}
            >
              Día
            </button>
            <button
              className={`${styles.viewBtn} ${viewMode === 'month' ? styles.viewBtnActive : ''}`}
              onClick={() => setViewMode('month')}
            >
              Mes
            </button>
          </div>
          {isAdmin && (
            <button className="btn btn-primary" onClick={() => setShowAssignChoice(true)}>
              <PlusIcon /> Asignar pendiente
            </button>
          )}
        </div>
      </div>

      {viewMode === 'day' ? (
        <>
          <div className={styles.dateNav}>
            <button className={styles.navBtn} onClick={() => setSelectedDate(d => subDays(d, 1))}>
              <ChevronLeft />
            </button>
            <span className={styles.dateLabel}>{dateLabel}</span>
            <button className={styles.navBtn} onClick={() => setSelectedDate(d => addDays(d, 1))}>
              <ChevronRight />
            </button>
            {!isToday(selectedDate) && (
              <button className={styles.todayBtn} onClick={() => setSelectedDate(new Date())}>
                Hoy
              </button>
            )}
          </div>

          {isAdmin && totalCount > 0 && (
            <div className={styles.progressBar}>
              <div className={styles.progressHeader}>
                <span>Progreso del día</span>
                <span>{doneCount}/{totalCount} completados</span>
              </div>
              <div className={styles.bar}>
                <div className={styles.fill} style={{ width: `${progress}%` }} />
              </div>
            </div>
          )}

          {loading ? (
            <p className={styles.loading}>Cargando...</p>
          ) : isAdmin ? (
            <AdminView itemsByUser={itemsByUser} onToggle={toggleDone} onDelete={deleteItem} onEdit={setEditingItem} isDoneByUser={isDoneByUser} isDoneByAll={isDoneByAll} adminSetDone={adminSetDone} onCompleteNative={completeNativeItem} onOpenTask={handleOpenTask} />
          ) : (
            <UserView items={items} onToggle={toggleDone} onSaveObs={updateObservation} isDoneByUser={isDoneByUser} isDoneByAll={isDoneByAll} onCompleteNative={completeNativeItem} onOpenTask={handleOpenTask} />
          )}
        </>
      ) : (
        <MonthView
          calMonth={calMonth}
          setCalMonth={setCalMonth}
          onSelectDate={d => { setSelectedDate(d); setViewMode('day') }}
        />
      )}

      {showAssignChoice && isAdmin && (
        <AssignChoiceModal
          onClose={() => setShowAssignChoice(false)}
          onChooseLink={() => { setShowAssignChoice(false); setShowLinkTask(true) }}
          onChooseFree={() => { setShowAssignChoice(false); setShowCreate(true) }}
        />
      )}

      {showLinkTask && isAdmin && (
        <LinkTaskModal
          profiles={allProfiles}
          defaultDate={selectedDate}
          onClose={() => setShowLinkTask(false)}
          onLink={linkTask}
        />
      )}

      {showCreate && isAdmin && (
        <CreatePendienteModal
          profiles={allProfiles}
          onClose={() => setShowCreate(false)}
          onCreate={createItemForDate}
          defaultDate={selectedDate}
        />
      )}

      {openTask && (
        <TaskModal
          task={openTask.task}
          columns={openTask.columns}
          onClose={() => { setOpenTask(null); refetch() }}
          onUpdate={updateOpenTask}
          onApprove={approveOpenTask}
          onDelete={deleteOpenTask}
        />
      )}

      {editingItem && isAdmin && (
        <EditPendienteModal
          item={editingItem}
          profiles={allProfiles}
          onClose={() => setEditingItem(null)}
          onSave={async (updates) => {
            const { error } = await updateItem(editingItem.id, updates)
            if (!error) setEditingItem(null)
            return { error }
          }}
        />
      )}
    </div>
  )
}

// ── Month calendar ───────────────────────────────────────────────────────────
function MonthView({ calMonth, setCalMonth, onSelectDate }) {
  const [monthItems, setMonthItems] = useState({})

  useEffect(() => {
    fetchMonthItems()
  }, [calMonth])

  async function fetchMonthItems() {
    const start = format(startOfMonth(calMonth), 'yyyy-MM-dd')
    const end = format(endOfMonth(calMonth), 'yyyy-MM-dd')
    const { data } = await supabase
      .from('schedule_items')
      .select('date, is_done')
      .gte('date', start)
      .lte('date', end)
    const map = {}
    ;(data || []).forEach(item => {
      if (!map[item.date]) map[item.date] = []
      map[item.date].push(item)
    })
    setMonthItems(map)
  }

  const monthLabel = format(calMonth, 'MMMM yyyy', { locale: es })
  const days = eachDayOfInterval({ start: startOfMonth(calMonth), end: endOfMonth(calMonth) })
  const firstDow = (getDay(startOfMonth(calMonth)) + 6) % 7

  return (
    <div className={styles.monthContainer}>
      <div className={styles.monthNav}>
        <button className={styles.navBtn} onClick={() => setCalMonth(m => subMonths(m, 1))}>
          <ChevronLeft />
        </button>
        <span className={styles.monthLabel} style={{ textTransform: 'capitalize' }}>
          {monthLabel}
        </span>
        <button className={styles.navBtn} onClick={() => setCalMonth(m => addMonths(m, 1))}>
          <ChevronRight />
        </button>
      </div>
      <div className={styles.calGrid}>
        {['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'].map(d => (
          <div key={d} className={styles.calDayHeader}>{d}</div>
        ))}
        {Array.from({ length: firstDow }).map((_, i) => (
          <div key={`e-${i}`} className={styles.calCell} />
        ))}
        {days.map(day => {
          const ds = format(day, 'yyyy-MM-dd')
          const dayItems = monthItems[ds] || []
          const allDone = dayItems.length > 0 && dayItems.every(i => i.is_done)
          const hasPending = dayItems.some(i => !i.is_done)
          return (
            <div
              key={ds}
              className={`${styles.calCell} ${styles.calCellDay} ${isToday(day) ? styles.calToday : ''}`}
              onClick={() => onSelectDate(day)}
            >
              <span className={styles.calDayNum}>{format(day, 'd')}</span>
              {dayItems.length > 0 && (
                <div className={styles.calDots}>
                  <span
                    className={styles.calDot}
                    style={{
                      background: allDone
                        ? 'var(--success)'
                        : hasPending
                        ? 'var(--warning)'
                        : 'var(--info)',
                    }}
                  />
                  <span className={styles.calCount}>{dayItems.length}</span>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function AdminView({ itemsByUser, onToggle, onDelete, onEdit, isDoneByUser, isDoneByAll, adminSetDone, onCompleteNative, onOpenTask }) {
  const entries = Object.entries(itemsByUser)
  if (entries.length === 0) return <EmptyState isAdmin />
  return (
    <div className={styles.adminGrid}>
      {entries.map(([uid, { assignee, items }]) => (
        <div key={uid} className={styles.userBlock}>
          <div className={styles.userBlockHeader}>
            <div className={styles.uAvatar}>
              {(assignee?.username || assignee?.display_name || assignee?.full_name || '?')[0].toUpperCase()}
            </div>
            <div>
              <p className={styles.uName}>
                {assignee?.username || assignee?.display_name || assignee?.full_name || 'Sin nombre'}
              </p>
              <p className={styles.uCount}>{items.filter(i => i.is_done).length}/{items.length} listos</p>
            </div>
          </div>
          <div className={styles.itemList}>
            {items.map(item => (
              <PendienteItem key={item.id} item={item} isAdmin onToggle={onToggle} onDelete={onDelete} onEdit={onEdit} isDoneByUser={isDoneByUser} isDoneByAll={isDoneByAll} uid={assignee?.id} onCompleteNative={onCompleteNative} onOpenTask={onOpenTask} />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

function UserView({ items, onToggle, onSaveObs, isDoneByUser, isDoneByAll, onCompleteNative, onOpenTask }) {
  if (items.length === 0) return <EmptyState />
  return (
    <div className={styles.itemList} style={{ maxWidth: 700 }}>
      {items.map(item => (
        <PendienteItem key={item.id} item={item} isAdmin={false} onToggle={onToggle} onSaveObs={onSaveObs} isDoneByUser={isDoneByUser} isDoneByAll={isDoneByAll} onCompleteNative={onCompleteNative} onOpenTask={onOpenTask} />
      ))}
    </div>
  )
}

function PendienteItem({ item, isAdmin, onToggle, onDelete, onEdit, onSaveObs, isDoneByUser, isDoneByAll, uid, onCompleteNative, onOpenTask }) {
  const { profile } = useAuth()
  const [showObs, setShowObs] = useState(false)
  const [obsText, setObsText] = useState(item.user_observation || '')
  const [showStatusMenu, setShowStatusMenu] = useState(false)
  const [menuPos, setMenuPos] = useState(null)
  const [deptColumns, setDeptColumns] = useState([])
  const checkRef = useRef(null)
  const menuRef = useRef(null)
  const myId = uid || profile?.id
  const myDone = isDoneByUser ? isDoneByUser(item, myId) : item.is_done
  const allDone = isDoneByAll ? isDoneByAll(item) : item.is_done
  const multiAssign = (item.assigned_to || []).length > 1
  const isNative = !!item.task_id

  useEffect(() => {
    if (!showStatusMenu) return
    function handleOutside(e) {
      if (checkRef.current?.contains(e.target)) return
      if (menuRef.current && !menuRef.current.contains(e.target)) setShowStatusMenu(false)
    }
    document.addEventListener('mousedown', handleOutside)
    return () => document.removeEventListener('mousedown', handleOutside)
  }, [showStatusMenu])

  async function saveObs() {
    await onSaveObs(item.id, obsText)
    setShowObs(false)
  }

  async function handleCheckClick(e) {
    e.stopPropagation()
    if (!isNative) {
      onToggle(item.id, item.done_by)
      return
    }
    if (myDone) {
      // Ya cumplido: permite desmarcar el pendiente sin tocar la tarea
      onToggle(item.id, item.done_by)
      return
    }
    const rect = checkRef.current.getBoundingClientRect()
    const { data } = await supabase
      .from('kanban_columns')
      .select('*')
      .eq('department_id', item.tasks?.department_id)
      .order('position')
    setDeptColumns(data || [])
    const estimatedHeight = Math.min(260, 40 * (data?.length || 1) + 46)
    const spaceBelow = window.innerHeight - rect.bottom
    const openUp = spaceBelow < estimatedHeight + 12 && rect.top > estimatedHeight
    setMenuPos({
      top: openUp ? Math.max(8, rect.top - estimatedHeight - 4) : rect.bottom + 4,
      left: Math.min(Math.max(8, rect.left), window.innerWidth - 240),
    })
    setShowStatusMenu(true)
  }

  async function chooseStatus(colId) {
    await onCompleteNative(item, colId)
    setShowStatusMenu(false)
  }

  return (
    <div className={`${styles.item} ${allDone ? styles.itemDone : ''}`}>
      <button
        ref={checkRef}
        className={`${styles.checkbox} ${myDone ? styles.checked : ''}`}
        onClick={handleCheckClick}
      >
        {myDone && <CheckIcon />}
      </button>

      {showStatusMenu && menuPos && createPortal(
        <div
          ref={menuRef}
          className={styles.statusMenu}
          style={{ position: 'fixed', top: menuPos.top, left: menuPos.left }}
          onClick={e => e.stopPropagation()}
        >
          <p className={styles.statusMenuTitle}>¿A qué estado pasa este entregable?</p>
          {deptColumns.length === 0 && <p className={styles.statusMenuEmpty}>Sin columnas en este departamento</p>}
          {deptColumns.map(c => (
            <button key={c.id} className={styles.statusMenuOption} onClick={() => chooseStatus(c.id)}>
              <span className={styles.statusMenuDot} style={{ background: c.color }} />
              {c.title}
            </button>
          ))}
        </div>,
        document.body
      )}

      <div className={styles.itemBody}>
        <div className={styles.itemTop}>
          <span
            className={styles.itemTitle}
            style={isNative ? { cursor: 'pointer', textDecoration: 'underline', textDecorationStyle: 'dotted' } : {}}
            onClick={() => isNative && onOpenTask?.(item.tasks)}
          >
            {item.title}
          </span>
          {isNative && <span className="badge badge-info" style={{ fontSize: 10 }}>Tarea nativa</span>}
          {item.time_start && (
            <span className={styles.itemTime}>
              {item.time_start.slice(0,5)}{item.time_end ? ` – ${item.time_end.slice(0,5)}` : ''}
            </span>
          )}
          {item.is_overdue && (
            <span className={styles.itemTime} style={{ color: 'var(--danger)' }}>
              Del {format(new Date(item.date + 'T00:00:00'), "d 'de' MMM", { locale: es })}
            </span>
          )}
        </div>
        {item.notes && <p className={styles.itemNotes}>{item.notes}</p>}

        {!isAdmin && (
          showObs ? (
            <div className={styles.obsBox}>
              <textarea className={styles.obsInput} value={obsText} onChange={e => setObsText(e.target.value)} placeholder="Escribe tu observación..." rows={2} />
              <div style={{ display: 'flex', gap: 6 }}>
                <button className="btn btn-primary" style={{ fontSize: 12, padding: '5px 12px' }} onClick={saveObs}>Guardar</button>
                <button className="btn btn-ghost" style={{ fontSize: 12, padding: '5px 12px' }} onClick={() => setShowObs(false)}>Cancelar</button>
              </div>
            </div>
          ) : (
            <div className={styles.obsRow}>
              {item.user_observation && <p className={styles.obsText}>📝 {item.user_observation}</p>}
              <button className={styles.obsBtn} onClick={() => setShowObs(true)}>
                {item.user_observation ? 'Editar observación' : '+ Añadir observación'}
              </button>
            </div>
          )
        )}

        {isAdmin && item.user_observation && (
          <p className={styles.obsAdmin}>Observación: {item.user_observation}</p>
        )}
      </div>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0, flexDirection: 'column' }}>
        {multiAssign && (
          <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
            {item.assignees?.map(a => (
              <span key={a.id} style={{ fontSize: 10, padding: '1px 6px', borderRadius: 999, border: '1px solid', borderColor: (item.done_by||[]).includes(a.id) ? 'var(--success)' : 'var(--border)', color: (item.done_by||[]).includes(a.id) ? 'var(--success)' : 'var(--text-muted)', background: (item.done_by||[]).includes(a.id) ? 'var(--success-dim)' : 'transparent' }}>
                {(a.username||a.display_name||a.full_name||'?')[0].toUpperCase()}{(item.done_by||[]).includes(a.id)?'✓':''}
              </span>
            ))}
          </div>
        )}
        {allDone
          ? <span className="badge badge-success">Listo</span>
          : myDone
          ? <span className="badge badge-info" style={{fontSize:11}}>Tu parte ✓</span>
          : item.is_overdue
          ? <span className="badge badge-danger">Atrasado</span>
          : <span className="badge badge-warning">Pendiente</span>}
        {isAdmin && !isNative && (
          <button className={styles.delBtn} onClick={() => onEdit(item)} title="Editar" style={{ color: 'var(--accent)' }}>
            <EditIcon />
          </button>
        )}
        {isAdmin && (
          <button className={styles.delBtn} onClick={() => onDelete(item.id)}>
            <TrashIcon />
          </button>
        )}
      </div>
    </div>
  )
}

function EmptyState({ isAdmin }) {
  return (
    <div className={styles.empty}>
      <p>{isAdmin ? 'No hay pendientes asignados para este día' : 'No tienes pendientes para este día'}</p>
    </div>
  )
}

function AssignChoiceModal({ onClose, onChooseLink, onChooseFree }) {
  return (
    <div className={styles.overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className={styles.modal} style={{ maxWidth: 440 }}>
        <div className={styles.modalHeader}>
          <h2>Asignar pendiente</h2>
          <button className={styles.closeBtn} onClick={onClose}><CloseIcon /></button>
        </div>
        <div className={styles.modalForm} style={{ gap: 10 }}>
          <button className={styles.choiceCard} onClick={onChooseLink}>
            <span className={styles.choiceIcon}><LinkIcon /></span>
            <span>
              <span className={styles.choiceTitle}>Vincular Tarea de Departamento</span>
              <span className={styles.choiceDesc}>Busca un entregable existente de un cliente y agéndalo hoy</span>
            </span>
          </button>
          <button className={styles.choiceCard} onClick={onChooseFree}>
            <span className={styles.choiceIcon}><NoteIcon /></span>
            <span>
              <span className={styles.choiceTitle}>Crear Evento Libre</span>
              <span className={styles.choiceDesc}>Reuniones, capacitaciones u otras notas — solo vive en el cronograma</span>
            </span>
          </button>
        </div>
      </div>
    </div>
  )
}

function LinkTaskModal({ profiles, defaultDate, onClose, onLink }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [searching, setSearching] = useState(false)
  const [selectedTask, setSelectedTask] = useState(null)
  const [assignedTo, setAssignedTo] = useState('')
  const [date, setDate] = useState(format(defaultDate, 'yyyy-MM-dd'))
  const [timeStart, setTimeStart] = useState('')
  const [timeEnd, setTimeEnd] = useState('')
  const [loading, setLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')

  useEffect(() => {
    const handle = setTimeout(async () => {
      setSearching(true)
      let q = supabase
        .from('tasks')
        .select('id, title, department_id, column_id, periodo, mes_tarea, kanban_columns(title, color), clients(brand_name), departments(name)')
        .not('cliente_id', 'is', null)
        .order('updated_at', { ascending: false })
        .limit(20)
      if (query.trim()) q = q.ilike('title', `%${query.trim()}%`)
      const { data } = await q
      setResults(data || [])
      setSearching(false)
    }, 300)
    return () => clearTimeout(handle)
  }, [query])

  async function handleSubmit(e) {
    e.preventDefault()
    if (!selectedTask || !assignedTo || !date) return
    setLoading(true)
    setErrorMsg('')
    const { error } = await onLink({
      taskId: selectedTask.id,
      taskTitle: selectedTask.title,
      assignedToUserId: assignedTo,
      date,
      time_start: timeStart || null,
      time_end: timeEnd || null,
    })
    setLoading(false)
    if (error) setErrorMsg(error.message || 'No se pudo vincular la tarea')
    else onClose()
  }

  return (
    <div className={styles.overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className={styles.modal} style={{ maxWidth: 520 }}>
        <div className={styles.modalHeader}>
          <h2>Vincular Tarea de Departamento</h2>
          <button className={styles.closeBtn} onClick={onClose}><CloseIcon /></button>
        </div>
        <form className={styles.modalForm} onSubmit={handleSubmit}>
          {!selectedTask ? (
            <>
              <input
                className={styles.input}
                placeholder="Buscar entregable por título..."
                value={query}
                onChange={e => setQuery(e.target.value)}
                autoFocus
              />
              <div className={styles.searchResults}>
                {searching && <p className={styles.hint}>Buscando...</p>}
                {!searching && results.length === 0 && <p className={styles.hint}>Sin resultados</p>}
                {results.map(t => (
                  <button key={t.id} type="button" className={styles.searchResultItem} onClick={() => setSelectedTask(t)}>
                    <span className={styles.searchResultTitle}>{t.title}</span>
                    <span className={styles.searchResultMeta}>
                      {t.clients?.brand_name && <span className="badge badge-info" style={{ fontSize: 10 }}>{t.clients.brand_name}</span>}
                      {t.mes_tarea && (
                        <span className="badge" style={{ fontSize: 10 }}>{cycleLabel(t.mes_tarea, t.periodo)}</span>
                      )}
                      {t.kanban_columns?.title && (
                        <span className="badge" style={{ fontSize: 10, background: (t.kanban_columns.color || '#888') + '22', color: t.kanban_columns.color || '#888' }}>
                          {t.kanban_columns.title}
                        </span>
                      )}
                      {!t.kanban_columns?.title && <span className="badge badge-warning" style={{ fontSize: 10 }}>Por Distribuir</span>}
                    </span>
                  </button>
                ))}
              </div>
            </>
          ) : (
            <>
              <div className={styles.inputedTaskBox}>
                <span>{selectedTask.title}</span>
                <button type="button" className={styles.obsBtn} onClick={() => setSelectedTask(null)}>Cambiar</button>
              </div>

              <label className={styles.label}>Asignar a *</label>
              <select className={styles.input} value={assignedTo} onChange={e => setAssignedTo(e.target.value)} required>
                <option value="">Selecciona un colaborador</option>
                {profiles.map(p => (
                  <option key={p.id} value={p.id}>{p.username || p.display_name || p.full_name}</option>
                ))}
              </select>

              <label className={styles.label}>Fecha *</label>
              <input type="date" className={styles.input} value={date} onChange={e => setDate(e.target.value)} required />

              <div style={{ display: 'flex', gap: 8 }}>
                <div style={{ flex: 1 }}>
                  <label className={styles.label}>Hora inicio</label>
                  <input type="time" className={styles.input} value={timeStart} onChange={e => setTimeStart(e.target.value)} />
                </div>
                <div style={{ flex: 1 }}>
                  <label className={styles.label}>Hora fin</label>
                  <input type="time" className={styles.input} value={timeEnd} onChange={e => setTimeEnd(e.target.value)} />
                </div>
              </div>

              {errorMsg && <p className={styles.errorMsg}>{errorMsg}</p>}

              <div className={styles.modalFooter}>
                <button type="button" className="btn btn-ghost" onClick={onClose}>Cancelar</button>
                <button type="submit" className="btn btn-primary" disabled={loading || !assignedTo}>
                  {loading ? 'Agendando...' : 'Agendar en el cronograma'}
                </button>
              </div>
            </>
          )}
        </form>
      </div>
    </div>
  )
}

function CreatePendienteModal({ profiles, onClose, onCreate, defaultDate }) {
  const [form, setForm] = useState({
    title: '',
    notes: '',
    assigned_to: [],
    time_start: '',
    time_end: '',
    date: format(defaultDate || new Date(), 'yyyy-MM-dd'),
  })
  const [loading, setLoading] = useState(false)

  function togglePerson(id) {
    setForm(p => ({
      ...p,
      assigned_to: p.assigned_to.includes(id)
        ? p.assigned_to.filter(x => x !== id)
        : [...p.assigned_to, id],
    }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.title.trim() || form.assigned_to.length === 0) return
    setLoading(true)
    await onCreate(
      {
        title: form.title.trim(),
        notes: form.notes.trim() || null,
        assigned_to: form.assigned_to,
        time_start: form.time_start || null,
        time_end: form.time_end || null,
      },
      form.date
    )
    setLoading(false)
    onClose()
  }

  return (
    <div className={styles.overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className={styles.modal}>
        <div className={styles.modalHeader}>
          <h2>Asignar pendiente</h2>
          <button className={styles.closeBtn} onClick={onClose}><CloseIcon /></button>
        </div>
        <form className={styles.modalForm} onSubmit={handleSubmit}>
          <label className={styles.label}>Pendiente *</label>
          <input className={styles.input} placeholder="¿Qué hay que hacer?" value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} required />

          <label className={styles.label}>Información adicional</label>
          <textarea className={styles.textarea} placeholder="Instrucciones, detalles..." value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} rows={2} />

          <label className={styles.label}>Fecha *</label>
          <input type="date" className={styles.input} value={form.date} onChange={e => setForm(p => ({ ...p, date: e.target.value }))} required />

          <div className={styles.timeRow}>
            <div>
              <label className={styles.label}>Hora inicio</label>
              <input type="time" className={styles.input} value={form.time_start} onChange={e => setForm(p => ({ ...p, time_start: e.target.value }))} />
            </div>
            <div>
              <label className={styles.label}>Hora fin</label>
              <input type="time" className={styles.input} value={form.time_end} onChange={e => setForm(p => ({ ...p, time_end: e.target.value }))} />
            </div>
          </div>

          <label className={styles.label}>Asignar a (puedes seleccionar varios) *</label>
          <div className={styles.peopleGrid}>
            {profiles.map(p => (
              <button key={p.id} type="button"
                className={`${styles.personChip} ${form.assigned_to.includes(p.id) ? styles.personSelected : ''}`}
                onClick={() => togglePerson(p.id)}
              >
                <span className={styles.chipAvatar}>
                  {(p.username || p.display_name || p.full_name)[0].toUpperCase()}
                </span>
                {p.username || p.display_name || p.full_name}
                {form.assigned_to.includes(p.id) && ' ✓'}
              </button>
            ))}
          </div>

          <div className={styles.modalFooter}>
            <button type="button" className="btn btn-ghost" onClick={onClose}>Cancelar</button>
            <button type="submit" className="btn btn-primary" disabled={loading || !form.title.trim() || form.assigned_to.length === 0}>
              {loading ? 'Asignando...' : 'Asignar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function EditPendienteModal({ item, profiles, onClose, onSave }) {
  const [form, setForm] = useState({
    title: item.title || '',
    notes: item.notes || '',
    assigned_to: item.assigned_to || [],
    time_start: item.time_start ? item.time_start.slice(0, 5) : '',
    time_end: item.time_end ? item.time_end.slice(0, 5) : '',
    date: item.date || format(new Date(), 'yyyy-MM-dd'),
  })
  const [loading, setLoading] = useState(false)

  function togglePerson(id) {
    setForm(p => ({
      ...p,
      assigned_to: p.assigned_to.includes(id)
        ? p.assigned_to.filter(x => x !== id)
        : [...p.assigned_to, id],
    }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.title.trim() || form.assigned_to.length === 0) return
    setLoading(true)
    try {
      const { error } = await onSave({
        title: form.title.trim(),
        notes: form.notes.trim() || null,
        assigned_to: form.assigned_to,
        time_start: form.time_start || null,
        time_end: form.time_end || null,
        date: form.date,
      })
      if (error) alert('No se pudo guardar: ' + (error.message || 'error desconocido'))
    } catch (err) {
      alert('No se pudo guardar: ' + (err?.message || 'error desconocido'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className={styles.overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className={styles.modal}>
        <div className={styles.modalHeader}>
          <h2>Editar pendiente</h2>
          <button className={styles.closeBtn} onClick={onClose}><CloseIcon /></button>
        </div>
        <form className={styles.modalForm} onSubmit={handleSubmit}>
          <label className={styles.label}>Pendiente *</label>
          <input className={styles.input} placeholder="¿Qué hay que hacer?" value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} required />

          <label className={styles.label}>Información adicional</label>
          <textarea className={styles.textarea} placeholder="Instrucciones, detalles..." value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} rows={2} />

          <label className={styles.label}>Fecha *</label>
          <input type="date" className={styles.input} value={form.date} onChange={e => setForm(p => ({ ...p, date: e.target.value }))} required />

          <div className={styles.timeRow}>
            <div>
              <label className={styles.label}>Hora inicio</label>
              <input type="time" className={styles.input} value={form.time_start} onChange={e => setForm(p => ({ ...p, time_start: e.target.value }))} />
            </div>
            <div>
              <label className={styles.label}>Hora fin</label>
              <input type="time" className={styles.input} value={form.time_end} onChange={e => setForm(p => ({ ...p, time_end: e.target.value }))} />
            </div>
          </div>

          <label className={styles.label}>Asignar a (puedes seleccionar varios) *</label>
          <div className={styles.peopleGrid}>
            {profiles.map(p => (
              <button key={p.id} type="button"
                className={`${styles.personChip} ${form.assigned_to.includes(p.id) ? styles.personSelected : ''}`}
                onClick={() => togglePerson(p.id)}
              >
                <span className={styles.chipAvatar}>
                  {(p.username || p.display_name || p.full_name)[0].toUpperCase()}
                </span>
                {p.username || p.display_name || p.full_name}
                {form.assigned_to.includes(p.id) && ' ✓'}
              </button>
            ))}
          </div>

          <div className={styles.modalFooter}>
            <button type="button" className="btn btn-ghost" onClick={onClose}>Cancelar</button>
            <button type="submit" className="btn btn-primary" disabled={loading || !form.title.trim() || form.assigned_to.length === 0}>
              {loading ? 'Guardando...' : 'Guardar cambios'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function PlusIcon()    { return <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M8 2v12M2 8h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg> }
function ChevronLeft() { return <svg width="15" height="15" viewBox="0 0 16 16" fill="none"><path d="M10 4L6 8l4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg> }
function ChevronRight(){ return <svg width="15" height="15" viewBox="0 0 16 16" fill="none"><path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg> }
function CheckIcon()   { return <svg width="11" height="11" viewBox="0 0 12 12" fill="none"><path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg> }
function EditIcon()    { return <svg width="13" height="13" viewBox="0 0 16 16" fill="none"><path d="M11 2l3 3-9 9-4 1 1-4 9-9z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/></svg> }
function TrashIcon()   { return <svg width="13" height="13" viewBox="0 0 16 16" fill="none"><path d="M2 4h12M5 4V3h6v1M6 7v5M10 7v5M3 4l1 9h8l1-9" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/></svg> }
function CloseIcon()   { return <svg width="15" height="15" viewBox="0 0 16 16" fill="none"><path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg> }
function LinkIcon()    { return <svg width="18" height="18" viewBox="0 0 20 20" fill="none"><path d="M8 12l4-4M7 15l-2 2a3 3 0 01-4-4l2-2M13 5l2-2a3 3 0 014 4l-2 2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg> }
function NoteIcon()    { return <svg width="18" height="18" viewBox="0 0 20 20" fill="none"><rect x="3" y="3" width="14" height="14" rx="2" stroke="currentColor" strokeWidth="1.5"/><path d="M6.5 8h7M6.5 11.5h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg> }
