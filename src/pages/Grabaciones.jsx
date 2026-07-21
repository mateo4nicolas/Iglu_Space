import { useState, useMemo } from 'react'
import { useAuth } from '../context/AuthContext'
import { useRecordings } from '../hooks/useRecordings'
import { format, addWeeks, subWeeks, startOfWeek, addDays } from 'date-fns'
import { es } from 'date-fns/locale'
import styles from './Grabaciones.module.css'

const STATUS_CONFIG = {
  coordinado:   { label: 'Coordinado',   className: 'statusGreen' },
  coordinando:  { label: 'Coordinando',  className: 'statusYellow' },
  reagendado:   { label: 'Re agendado',  className: 'statusRed' },
}

export default function GrabacionesPage() {
  const { isAdmin } = useAuth()
  const [weekAnchor, setWeekAnchor] = useState(new Date())
  const weekStart = startOfWeek(weekAnchor, { weekStartsOn: 1 })
  const weekDays = useMemo(() => Array.from({ length: 5 }, (_, i) => addDays(weekStart, i)), [weekStart])

  const [activeDay, setActiveDay] = useState(0)
  const selectedDate = weekDays[activeDay]

  const {
    items, loading, allProfiles,
    createItem, updateAdminFields, updateUserNotes, deleteItem,
    isAssignedToMe,
  } = useRecordings(selectedDate)

  const [showCreate, setShowCreate] = useState(false)
  const [editing, setEditing] = useState(null)
  const [editingNotes, setEditingNotes] = useState(null)

  const weekLabel = format(weekStart, 'd MMM', { locale: es }) + ' - ' + format(addDays(weekStart, 4), 'd MMM', { locale: es })

  return (
    <div className={styles.page}>
      <div className={styles.topbar}>
        <h1 className={styles.pageTitle}>Grabaciones</h1>
        {isAdmin && (
          <button className="btn btn-primary" onClick={() => setShowCreate(true)}>
            <PlusIcon /> Nueva grabación
          </button>
        )}
      </div>

      <div className={styles.weekNav}>
        <button className={styles.navBtn} onClick={() => setWeekAnchor(d => subWeeks(d, 1))}>
          <ChevronLeft />
        </button>
        <span className={styles.weekLabel}>{weekLabel}</span>
        <button className={styles.navBtn} onClick={() => setWeekAnchor(d => addWeeks(d, 1))}>
          <ChevronRight />
        </button>
      </div>

      <div className={styles.dayTabs}>
        {weekDays.map((day, i) => {
          const isToday = format(day, 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd')
          return (
            <button
              key={i}
              className={`${styles.dayTab} ${activeDay === i ? styles.dayTabActive : ''} ${isToday ? styles.dayTabToday : ''}`}
              onClick={() => setActiveDay(i)}
            >
              <span className={styles.dayTabName}>{format(day, 'EEEE', { locale: es })}</span>
              <span className={styles.dayTabDate}>{format(day, 'd MMM', { locale: es })}</span>
            </button>
          )
        })}
      </div>

      {loading ? (
        <p className={styles.loading}>Cargando...</p>
      ) : items.length === 0 ? (
        <div className={styles.empty}>
          <p>No hay grabaciones programadas para este día</p>
        </div>
      ) : (
        <div className={styles.list}>
          {items.map(item => (
            <RecordingCard
              key={item.id}
              item={item}
              isAdmin={isAdmin}
              canEditNotes={isAssignedToMe(item)}
              onEditAdmin={() => setEditing(item)}
              onEditNotes={() => setEditingNotes(item.id)}
              onSetStatus={(status) => updateAdminFields(item.id, { status })}
              onDelete={() => { if (window.confirm('¿Eliminar esta grabación?')) deleteItem(item.id) }}
            />
          ))}
        </div>
      )}

      {showCreate && (
        <RecordingFormModal
          allProfiles={allProfiles}
          onClose={() => setShowCreate(false)}
          onSave={async (data) => {
            const result = await createItem(data)
            if (!result.error) setShowCreate(false)
            return result
          }}
        />
      )}

      {editing && (
        <RecordingFormModal
          allProfiles={allProfiles}
          initial={editing}
          onClose={() => setEditing(null)}
          onSave={async (data) => {
            const result = await updateAdminFields(editing.id, data)
            if (!result.error) setEditing(null)
            return result
          }}
        />
      )}

      {editingNotes && (
        <NotesModal
          item={items.find(i => i.id === editingNotes)}
          onClose={() => setEditingNotes(null)}
          onSave={async (data) => {
            const result = await updateUserNotes(editingNotes, data)
            if (!result.error) setEditingNotes(null)
            return result
          }}
        />
      )}
    </div>
  )
}

function RecordingCard({ item, isAdmin, canEditNotes, onEditAdmin, onEditNotes, onSetStatus, onDelete }) {
  const timeLabel = item.time_start
    ? `${item.time_start.slice(0, 5)}${item.time_end ? ` – ${item.time_end.slice(0, 5)}` : ''}`
    : 'Sin horario'

  const statusCfg = STATUS_CONFIG[item.status] || STATUS_CONFIG.coordinando

  return (
    <div className={styles.card}>
      <div className={styles.cardHeader}>
        <div className={styles.timeBlock}>
          <ClockIcon />
          <span>{timeLabel}</span>
        </div>
        <div className={styles.headerActions}>
          <span className={`${styles.statusBadge} ${styles[statusCfg.className]}`}>{statusCfg.label}</span>
          {item.videos_uploaded && <span className="badge badge-success">Videos subidos</span>}
          {isAdmin && (
            <>
              <button className={styles.iconBtn} onClick={onEditAdmin} title="Editar"><EditIcon /></button>
              <button className={styles.iconBtn} onClick={onDelete} title="Eliminar"><TrashIcon /></button>
            </>
          )}
        </div>
      </div>

      {isAdmin && (
        <div className={styles.statusRow}>
          <button className={`${styles.statusBtn} ${styles.statusBtnGreen} ${item.status === 'coordinado' ? styles.statusBtnActive : ''}`} onClick={() => onSetStatus('coordinado')}>Coordinado</button>
          <button className={`${styles.statusBtn} ${styles.statusBtnYellow} ${item.status === 'coordinando' ? styles.statusBtnActive : ''}`} onClick={() => onSetStatus('coordinando')}>Coordinando</button>
          <button className={`${styles.statusBtn} ${styles.statusBtnRed} ${item.status === 'reagendado' ? styles.statusBtnActive : ''}`} onClick={() => onSetStatus('reagendado')}>Re agendado</button>
        </div>
      )}

      <div className={styles.cardBody}>
        <div className={styles.fieldsGrid}>
          <Field label="Cliente" value={item.client_name} />
          <Field label="Modelo" value={item.model_name} />
          <Field label="Teléfono modelo" value={item.model_phone} />
          <Field label="Videógrafo(s)" value={
            (item.assignees || []).map(a => a.username || a.display_name || a.full_name).join(', ') || '—'
          } />
        </div>

        {item.admin_notes && (
          <div className={styles.notesBlock}>
            <span className={styles.notesLabel}>Observaciones del admin</span>
            <p className={styles.notesText}>{item.admin_notes}</p>
          </div>
        )}

        <div className={styles.divider} />

        <div className={styles.userNotesBlock}>
          <div className={styles.userNotesHeader}>
            <span className={styles.notesLabel}>Observaciones del videógrafo</span>
            {canEditNotes && (
              <button className={styles.editNotesBtn} onClick={onEditNotes}>
                {item.user_notes ? 'Editar' : '+ Añadir'}
              </button>
            )}
          </div>
          {item.user_notes ? (
            <p className={styles.notesText}>{item.user_notes}</p>
          ) : (
            <p className={styles.notesEmpty}>Sin observaciones todavía</p>
          )}
        </div>
      </div>
    </div>
  )
}

function Field({ label, value }) {
  return (
    <div className={styles.field}>
      <span className={styles.fieldLabel}>{label}</span>
      <span className={styles.fieldValue}>{value || '—'}</span>
    </div>
  )
}

function RecordingFormModal({ allProfiles, initial, onClose, onSave }) {
  const [timeStart, setTimeStart] = useState(initial?.time_start?.slice(0, 5) || '')
  const [timeEnd, setTimeEnd] = useState(initial?.time_end?.slice(0, 5) || '')
  const [assignedTo, setAssignedTo] = useState(initial?.assigned_to || [])
  const [clientName, setClientName] = useState(initial?.client_name || '')
  const [modelName, setModelName] = useState(initial?.model_name || '')
  const [modelPhone, setModelPhone] = useState(initial?.model_phone || '')
  const [adminNotes, setAdminNotes] = useState(initial?.admin_notes || '')
  const [saving, setSaving] = useState(false)

  function toggleAssignee(id) {
    setAssignedTo(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  async function handleSave() {
    setSaving(true)
    try {
      const { error } = await onSave({
        time_start: timeStart || null,
        time_end: timeEnd || null,
        assigned_to: assignedTo,
        client_name: clientName.trim() || null,
        model_name: modelName.trim() || null,
        model_phone: modelPhone.trim() || null,
        admin_notes: adminNotes.trim() || null,
      })
      if (error) alert('No se pudo guardar: ' + (error.message || 'error desconocido'))
    } catch (err) {
      alert('No se pudo guardar: ' + (err?.message || 'error desconocido'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <h2>{initial ? 'Editar grabación' : 'Nueva grabación'}</h2>
          <button className={styles.closeBtn} onClick={onClose}><CloseIcon /></button>
        </div>

        <div className={styles.modalForm}>
          <div className={styles.row2}>
            <div>
              <label className={styles.label}>Hora inicio</label>
              <input className={styles.input} type="time" value={timeStart} onChange={e => setTimeStart(e.target.value)} />
            </div>
            <div>
              <label className={styles.label}>Hora fin</label>
              <input className={styles.input} type="time" value={timeEnd} onChange={e => setTimeEnd(e.target.value)} />
            </div>
          </div>

          <div>
            <label className={styles.label}>Videógrafo(s) asignado(s)</label>
            <div className={styles.assigneeList}>
              {allProfiles.map(p => (
                <button
                  key={p.id}
                  type="button"
                  className={`${styles.assigneeChip} ${assignedTo.includes(p.id) ? styles.assigneeChipActive : ''}`}
                  onClick={() => toggleAssignee(p.id)}
                >
                  {p.username || p.display_name || p.full_name}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className={styles.label}>Cliente</label>
            <input className={styles.input} value={clientName} onChange={e => setClientName(e.target.value)} placeholder="Nombre del cliente" />
          </div>

          <div className={styles.row2}>
            <div>
              <label className={styles.label}>Modelo</label>
              <input className={styles.input} value={modelName} onChange={e => setModelName(e.target.value)} placeholder="Nombre de la modelo" />
            </div>
            <div>
              <label className={styles.label}>Teléfono modelo</label>
              <input className={styles.input} value={modelPhone} onChange={e => setModelPhone(e.target.value)} placeholder="09xxxxxxxx" />
            </div>
          </div>

          <div>
            <label className={styles.label}>Observaciones</label>
            <textarea className={styles.textarea} rows={3} value={adminNotes} onChange={e => setAdminNotes(e.target.value)} placeholder="Detalles adicionales para el videógrafo" />
          </div>

          <button className="btn btn-primary" style={{ justifyContent: 'center', marginTop: 4 }} onClick={handleSave} disabled={saving}>
            {saving ? 'Guardando...' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  )
}

function NotesModal({ item, onClose, onSave }) {
  const [userNotes, setUserNotes] = useState(item?.user_notes || '')
  const [videosUploaded, setVideosUploaded] = useState(item?.videos_uploaded || false)
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    setSaving(true)
    try {
      await onSave({ user_notes: userNotes.trim() || null, videos_uploaded: videosUploaded })
    } catch (err) {
      alert('No se pudo guardar: ' + (err?.message || 'error desconocido'))
    } finally {
      setSaving(false)
    }
  }

  if (!item) return null

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <h2>Mis observaciones</h2>
          <button className={styles.closeBtn} onClick={onClose}><CloseIcon /></button>
        </div>

        <div className={styles.modalForm}>
          <div>
            <label className={styles.label}>Observaciones</label>
            <textarea
              className={styles.textarea}
              rows={4}
              value={userNotes}
              onChange={e => setUserNotes(e.target.value)}
              placeholder="Escribe aquí tus observaciones sobre la grabación..."
              autoFocus
            />
          </div>

          <label className={styles.checkboxRow}>
            <input
              type="checkbox"
              checked={videosUploaded}
              onChange={e => setVideosUploaded(e.target.checked)}
            />
            <span>Videos subidos</span>
          </label>

          <button className="btn btn-primary" style={{ justifyContent: 'center', marginTop: 4 }} onClick={handleSave} disabled={saving}>
            {saving ? 'Guardando...' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  )
}

function PlusIcon()      { return <svg width="14" height="14" viewBox="0 0 20 20" fill="none"><path d="M10 3v14M3 10h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg> }
function ChevronLeft()   { return <svg width="16" height="16" viewBox="0 0 20 20" fill="none"><path d="M12 4l-6 6 6 6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/></svg> }
function ChevronRight()  { return <svg width="16" height="16" viewBox="0 0 20 20" fill="none"><path d="M8 4l6 6-6 6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/></svg> }
function ClockIcon()     { return <svg width="14" height="14" viewBox="0 0 20 20" fill="none"><circle cx="10" cy="10" r="7.5" stroke="currentColor" strokeWidth="1.5"/><path d="M10 5.5V10l3 2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg> }
function EditIcon()      { return <svg width="14" height="14" viewBox="0 0 20 20" fill="none"><path d="M13.5 2.5l4 4L7 17l-5 1 1-5L13.5 2.5z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/></svg> }
function TrashIcon()     { return <svg width="14" height="14" viewBox="0 0 20 20" fill="none"><path d="M3 5h14M8 5V3h4v2M5 5l1 12h8l1-12" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg> }
function CloseIcon()     { return <svg width="14" height="14" viewBox="0 0 20 20" fill="none"><path d="M4 4l12 12M16 4L4 16" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></svg> }
