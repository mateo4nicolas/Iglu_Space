import { useState } from 'react'
import { format } from 'date-fns'
import styles from './EventModal.module.css'

const COLORS = ['#5b5fcf', '#2563eb', '#16a34a', '#d97706', '#dc2626', '#a855f7', '#0d9488', '#ec4899']

function nameFor(p) {
  return p.username || p.display_name || p.full_name
}

export default function EventModal({ event, canAssignOthers, teamProfiles, myProfileId, canEdit, defaultDate, defaultTime, onClose, onSave, onDelete }) {
  const isEditing = !!event
  const [form, setForm] = useState({
    title: event?.title || '',
    description: event?.description || '',
    event_date: event?.event_date || defaultDate || format(new Date(), 'yyyy-MM-dd'),
    time_start: event?.time_start ? event.time_start.slice(0, 5) : (defaultTime || '09:00'),
    time_end: event?.time_end ? event.time_end.slice(0, 5) : '',
    color: event?.color || COLORS[0],
    assigned_to_ids: event?.assigned_to_ids?.length ? event.assigned_to_ids : [myProfileId],
  })
  const [loading, setLoading] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  function set(key, val) { setForm(p => ({ ...p, [key]: val })) }

  function togglePerson(id) {
    setForm(p => {
      const has = p.assigned_to_ids.includes(id)
      const next = has ? p.assigned_to_ids.filter(x => x !== id) : [...p.assigned_to_ids, id]
      return { ...p, assigned_to_ids: next.length ? next : p.assigned_to_ids } // no permitir dejarlo vacío
    })
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.title.trim() || !form.event_date || !form.time_start || form.assigned_to_ids.length === 0) return
    setLoading(true)
    const { error } = await onSave({ ...form, title: form.title.trim(), description: form.description.trim() })
    setLoading(false)
    if (!error) onClose()
  }

  async function handleDelete() {
    setLoading(true)
    const { error } = await onDelete(event.id)
    setLoading(false)
    if (!error) onClose()
  }

  const readOnly = isEditing && !canEdit

  return (
    <div className={styles.overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className={styles.modal}>
        <div className={styles.header}>
          <h2 className={styles.title}>{isEditing ? (readOnly ? 'Evento' : 'Editar evento') : 'Nuevo evento'}</h2>
          <button className={styles.closeBtn} onClick={onClose}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
          </button>
        </div>

        <form className={styles.form} onSubmit={handleSubmit}>
          <div className={styles.field}>
            <label className={styles.label}>Título *</label>
            <input
              className={styles.input}
              placeholder="Ej: Llamada con cliente, reunión de equipo..."
              value={form.title}
              onChange={e => set('title', e.target.value)}
              disabled={readOnly}
              required
            />
          </div>

          <div className={styles.field}>
            <label className={styles.label}>Notas</label>
            <textarea
              className={styles.textarea}
              placeholder="Detalles, agenda, enlace de la llamada..."
              value={form.description}
              onChange={e => set('description', e.target.value)}
              disabled={readOnly}
              rows={3}
            />
          </div>

          <div className={styles.field}>
            <label className={styles.label}>Fecha *</label>
            <input type="date" className={styles.input} value={form.event_date} onChange={e => set('event_date', e.target.value)} disabled={readOnly} required />
          </div>

          <div className={styles.row}>
            <div className={styles.field}>
              <label className={styles.label}>Hora inicio *</label>
              <input type="time" className={styles.input} value={form.time_start} onChange={e => set('time_start', e.target.value)} disabled={readOnly} required />
            </div>
            <div className={styles.field}>
              <label className={styles.label}>Hora fin</label>
              <input type="time" className={styles.input} value={form.time_end} onChange={e => set('time_end', e.target.value)} disabled={readOnly} />
            </div>
          </div>

          {canAssignOthers ? (
            <div className={styles.field}>
              <label className={styles.label}>Asignar a (puedes seleccionar varios) *</label>
              <div className={styles.peopleGrid}>
                {teamProfiles.map(p => (
                  <button
                    key={p.id}
                    type="button"
                    className={`${styles.personChip} ${form.assigned_to_ids.includes(p.id) ? styles.personSelected : ''}`}
                    onClick={() => !readOnly && togglePerson(p.id)}
                    disabled={readOnly}
                  >
                    <span className={styles.chipAvatar}>{nameFor(p)[0].toUpperCase()}</span>
                    {nameFor(p)}{p.id === myProfileId ? ' (yo)' : ''}
                    {form.assigned_to_ids.includes(p.id) && ' ✓'}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            isEditing && form.assigned_to_ids.length > 1 && (
              <div className={styles.field}>
                <label className={styles.label}>Asignado a</label>
                <div className={styles.peopleGrid}>
                  {teamProfiles.filter(p => form.assigned_to_ids.includes(p.id)).map(p => (
                    <span key={p.id} className={styles.personChip}>
                      <span className={styles.chipAvatar}>{nameFor(p)[0].toUpperCase()}</span>
                      {nameFor(p)}{p.id === myProfileId ? ' (yo)' : ''}
                    </span>
                  ))}
                </div>
              </div>
            )
          )}

          <div className={styles.field}>
            <label className={styles.label}>Color</label>
            <div className={styles.colorRow}>
              {COLORS.map(c => (
                <button
                  key={c}
                  type="button"
                  className={`${styles.colorChip} ${form.color === c ? styles.colorSel : ''}`}
                  style={{ background: c }}
                  onClick={() => !readOnly && set('color', c)}
                  disabled={readOnly}
                />
              ))}
            </div>
          </div>

          {!readOnly && (
            <div className={styles.footer}>
              {isEditing && !confirmDelete && (
                <button type="button" className="btn btn-danger" onClick={() => setConfirmDelete(true)} disabled={loading}>Eliminar</button>
              )}
              {isEditing && confirmDelete && (
                <>
                  <span className={styles.confirmText}>¿Eliminar este evento?</span>
                  <button type="button" className="btn btn-ghost" onClick={() => setConfirmDelete(false)} disabled={loading}>No</button>
                  <button type="button" className="btn btn-danger" onClick={handleDelete} disabled={loading}>Sí, eliminar</button>
                </>
              )}
              {!confirmDelete && (
                <>
                  <button type="button" className="btn btn-ghost" onClick={onClose} disabled={loading}>Cancelar</button>
                  <button type="submit" className="btn btn-primary" disabled={loading || form.assigned_to_ids.length === 0}>
                    {loading ? 'Guardando...' : isEditing ? 'Guardar cambios' : 'Crear evento'}
                  </button>
                </>
              )}
            </div>
          )}
        </form>
      </div>
    </div>
  )
}
