import { useState, useMemo } from 'react'
import { useAuth } from '../context/AuthContext'
import { useManagementEvents } from '../hooks/useManagementEvents'
import EventModal from '../components/agenda/EventModal'
import {
  format, addDays, subDays, addWeeks, subWeeks,
  startOfWeek, endOfWeek, eachDayOfInterval, isToday, isSameDay,
} from 'date-fns'
import { es } from 'date-fns/locale'
import styles from './AgendaGestion.module.css'

const HOUR_START = 6
const HOUR_END = 22 // exclusivo (última fila empieza a las 21:00)
const ROW_HEIGHT = 56

function toMinutes(t) {
  if (!t) return 0
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}

function nameFor(p) {
  if (!p) return '—'
  return p.username || p.display_name || p.full_name
}

function assigneeLabel(ids, teamProfiles) {
  if (!ids || ids.length === 0) return '—'
  const names = ids.map(id => {
    const p = teamProfiles.find(tp => tp.id === id)
    return p ? nameFor(p) : null
  }).filter(Boolean)
  if (names.length === 0) return '—'
  if (names.length === 1) return names[0]
  return `${names[0]} +${names.length - 1}`
}

// Distribuye eventos superpuestos en columnas dentro del mismo día
function layoutEvents(dayEvents) {
  const sorted = [...dayEvents].sort((a, b) => toMinutes(a.time_start) - toMinutes(b.time_start))
  const clusters = []
  let current = []
  let clusterEnd = -1

  sorted.forEach(ev => {
    const start = toMinutes(ev.time_start)
    const end = Math.max(toMinutes(ev.time_end) || start + 30, start + 30)
    if (current.length === 0 || start < clusterEnd) {
      current.push({ ev, start, end })
      clusterEnd = Math.max(clusterEnd, end)
    } else {
      clusters.push(current)
      current = [{ ev, start, end }]
      clusterEnd = end
    }
  })
  if (current.length > 0) clusters.push(current)

  const result = []
  clusters.forEach(cluster => {
    // asignar columnas greedy
    const columns = [] // array de "fin" por columna
    cluster.forEach(item => {
      let col = columns.findIndex(endTime => item.start >= endTime)
      if (col === -1) { col = columns.length; columns.push(item.end) }
      else columns[col] = item.end
      item.col = col
    })
    const totalCols = columns.length
    cluster.forEach(item => result.push({ ...item, totalCols }))
  })
  return result
}

export default function AgendaGestionPage() {
  const { profile, isSuperAdmin } = useAuth()
  const [viewMode, setViewMode] = useState('week') // 'week' | 'day'
  const [anchorDate, setAnchorDate] = useState(new Date())
  const [viewingPersonId, setViewingPersonId] = useState('self') // 'self' | 'all' | userId
  const [modalState, setModalState] = useState(null) // { event, defaultDate, defaultTime } | null

  const rangeStart = viewMode === 'week' ? startOfWeek(anchorDate, { weekStartsOn: 1 }) : anchorDate
  const rangeEnd = viewMode === 'week' ? endOfWeek(anchorDate, { weekStartsOn: 1 }) : anchorDate
  const days = useMemo(() => eachDayOfInterval({ start: rangeStart, end: rangeEnd }), [rangeStart.getTime(), rangeEnd.getTime()])

  const { events, teamProfiles, loading, createEvent, updateEvent, deleteEvent } = useManagementEvents(rangeStart, rangeEnd)

  const visibleEvents = useMemo(() => {
    if (!isSuperAdmin || viewingPersonId === 'self') {
      return events.filter(e => e.assigned_to_ids?.includes(profile?.id) || e.created_by === profile?.id)
    }
    if (viewingPersonId === 'all') return events
    return events.filter(e => e.assigned_to_ids?.includes(viewingPersonId))
  }, [events, isSuperAdmin, viewingPersonId, profile?.id])

  const hours = []
  for (let h = HOUR_START; h < HOUR_END; h++) hours.push(h)
  const gridHeight = hours.length * ROW_HEIGHT

  function goPrev() { setAnchorDate(d => viewMode === 'week' ? subWeeks(d, 1) : subDays(d, 1)) }
  function goNext() { setAnchorDate(d => viewMode === 'week' ? addWeeks(d, 1) : addDays(d, 1)) }
  function goToday() { setAnchorDate(new Date()) }

  function openCreate(date, hour) {
    setModalState({
      event: null,
      defaultDate: format(date, 'yyyy-MM-dd'),
      defaultTime: hour != null ? `${String(hour).padStart(2, '0')}:00` : '09:00',
    })
  }
  function openEdit(ev) { setModalState({ event: ev }) }
  function closeModal() { setModalState(null) }

  async function handleSave(data) {
    if (modalState.event) return updateEvent(modalState.event.id, data)
    return createEvent(data)
  }

  const rangeLabel = viewMode === 'week'
    ? `${format(rangeStart, "d 'de' MMM", { locale: es })} – ${format(rangeEnd, "d 'de' MMM yyyy", { locale: es })}`
    : format(anchorDate, "EEEE d 'de' MMMM, yyyy", { locale: es })

  return (
    <div className={styles.page}>
      <div className={styles.topbar}>
        <h1 className={styles.pageTitle}>Agenda de Gestión</h1>
        <div className={styles.topRight}>
          {isSuperAdmin && (
            <select className={styles.personSelect} value={viewingPersonId} onChange={e => setViewingPersonId(e.target.value)}>
              <option value="self">Mi agenda</option>
              <option value="all">Todo el equipo</option>
              {teamProfiles.filter(p => p.id !== profile?.id).map(p => (
                <option key={p.id} value={p.id}>{nameFor(p)}</option>
              ))}
            </select>
          )}
          <div className={styles.viewToggle}>
            <button className={`${styles.viewBtn} ${viewMode === 'day' ? styles.viewBtnActive : ''}`} onClick={() => setViewMode('day')}>Día</button>
            <button className={`${styles.viewBtn} ${viewMode === 'week' ? styles.viewBtnActive : ''}`} onClick={() => setViewMode('week')}>Semana</button>
          </div>
          <button className="btn btn-primary" style={{ fontSize: 12, padding: '7px 14px' }} onClick={() => openCreate(isToday(anchorDate) ? new Date() : anchorDate)}>
            <PlusIcon /> Nuevo evento
          </button>
        </div>
      </div>

      <div className={styles.dateNav}>
        <button className={styles.navBtn} onClick={goPrev}><ChevronLeft /></button>
        <span className={styles.rangeLabel}>{rangeLabel}</span>
        <button className={styles.navBtn} onClick={goNext}><ChevronRight /></button>
        {!(viewMode === 'day' ? isToday(anchorDate) : days.some(isToday)) && (
          <button className={styles.todayBtn} onClick={goToday}>Hoy</button>
        )}
      </div>

      {loading ? (
        <p className={styles.loading}>Cargando agenda...</p>
      ) : (
        <div className={styles.calendarWrap}>
          <div className={styles.dayHeaders} style={{ gridTemplateColumns: `56px repeat(${days.length}, 1fr)` }}>
            <div className={styles.gutterHeaderCell} />
            {days.map(d => (
              <div key={d.toISOString()} className={`${styles.dayHeaderCell} ${isToday(d) ? styles.dayHeaderToday : ''}`}>
                <span className={styles.dayHeaderWeekday}>{format(d, 'EEE', { locale: es })}</span>
                <span className={styles.dayHeaderNum}>{format(d, 'd')}</span>
              </div>
            ))}
          </div>

          <div className={styles.gridScroll}>
            <div className={styles.grid} style={{ gridTemplateColumns: `56px repeat(${days.length}, 1fr)`, height: gridHeight }}>
              <div className={styles.gutter}>
                {hours.map(h => (
                  <div key={h} className={styles.hourLabel} style={{ height: ROW_HEIGHT }}>
                    {String(h).padStart(2, '0')}:00
                  </div>
                ))}
              </div>

              {days.map(day => {
                const dayEvents = visibleEvents.filter(e => e.event_date === format(day, 'yyyy-MM-dd'))
                const laidOut = layoutEvents(dayEvents)
                return (
                  <div key={day.toISOString()} className={styles.dayColumn}>
                    {hours.map(h => (
                      <div
                        key={h}
                        className={styles.hourCell}
                        style={{ height: ROW_HEIGHT }}
                        onClick={() => openCreate(day, h)}
                      />
                    ))}
                    {isToday(day) && <NowLine />}
                    {laidOut.map(({ ev, start, end, col, totalCols }) => {
                      const top = ((start - HOUR_START * 60) / 60) * ROW_HEIGHT
                      const height = Math.max(((end - start) / 60) * ROW_HEIGHT, 22)
                      const widthPct = 100 / totalCols
                      const canEdit = ev.created_by === profile?.id || isSuperAdmin
                      return (
                        <button
                          key={ev.id}
                          className={styles.eventBlock}
                          style={{
                            top, height,
                            left: `${col * widthPct}%`,
                            width: `calc(${widthPct}% - 3px)`,
                            background: (ev.color || '#5b5fcf') + 'e6',
                            borderColor: ev.color || '#5b5fcf',
                          }}
                          onClick={e => { e.stopPropagation(); openEdit(ev) }}
                          title={ev.title}
                        >
                          <span className={styles.eventTitle}>{ev.title}</span>
                          {height > 34 && (
                            <span className={styles.eventMeta}>
                              {ev.time_start?.slice(0, 5)}{ev.time_end ? `–${ev.time_end.slice(0, 5)}` : ''} · {assigneeLabel(ev.assigned_to_ids, teamProfiles)}
                            </span>
                          )}
                          {!canEdit && <span className={styles.eventLockDot} title="Solo lectura" />}
                        </button>
                      )
                    })}
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {modalState && (
        <EventModal
          event={modalState.event}
          canEdit={!modalState.event || modalState.event.created_by === profile?.id || isSuperAdmin}
          canAssignOthers={isSuperAdmin}
          teamProfiles={teamProfiles}
          myProfileId={profile?.id}
          defaultDate={modalState.defaultDate}
          defaultTime={modalState.defaultTime}
          onClose={closeModal}
          onSave={handleSave}
          onDelete={deleteEvent}
        />
      )}
    </div>
  )
}

function NowLine() {
  const now = new Date()
  const minutes = now.getHours() * 60 + now.getMinutes()
  if (minutes < HOUR_START * 60 || minutes > HOUR_END * 60) return null
  const top = ((minutes - HOUR_START * 60) / 60) * ROW_HEIGHT
  return <div className={styles.nowLine} style={{ top }} />
}

function PlusIcon()     { return <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M8 2v12M2 8h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg> }
function ChevronLeft()  { return <svg width="15" height="15" viewBox="0 0 16 16" fill="none"><path d="M10 4L6 8l4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg> }
function ChevronRight() { return <svg width="15" height="15" viewBox="0 0 16 16" fill="none"><path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg> }
