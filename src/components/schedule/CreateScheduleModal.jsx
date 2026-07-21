import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import styles from './CreateScheduleModal.module.css'

export default function CreateScheduleModal({ date, profiles, onClose, onCreate }) {
  const [tasks, setTasks] = useState([])
  const [form, setForm] = useState({
    title: '',
    assigned_to: '',
    task_id: '',
    time_start: '',
    time_end: '',
    notes: '',
  })
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    supabase
      .from('tasks')
      .select('id, title')
      .eq('approved', true)
      .order('title')
      .then(({ data }) => setTasks(data || []))
  }, [])

  // Auto-fill title from task
  function handleTaskChange(taskId) {
    const task = tasks.find(t => t.id === taskId)
    setForm(p => ({
      ...p,
      task_id: taskId,
      title: task ? task.title : p.title,
    }))
  }

  function set(key, val) {
    setForm(p => ({ ...p, [key]: val }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.title.trim() || !form.assigned_to) return
    setLoading(true)
    const { error } = await onCreate({
      title: form.title.trim(),
      assigned_to: form.assigned_to,
      task_id: form.task_id || null,
      time_start: form.time_start || null,
      time_end: form.time_end || null,
      notes: form.notes.trim() || null,
    })
    setLoading(false)
    if (!error) onClose()
  }

  const dateLabel = format(date, "EEEE d 'de' MMMM", { locale: es })

  return (
    <div className={styles.overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className={styles.modal}>
        <div className={styles.header}>
          <div>
            <h2 className={styles.title}>Nueva actividad</h2>
            <p className={styles.dateLabel}>{dateLabel}</p>
          </div>
          <button className={styles.closeBtn} onClick={onClose}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
          </button>
        </div>

        <form className={styles.form} onSubmit={handleSubmit}>
          <div className={styles.field}>
            <label className={styles.label}>Asignar a *</label>
            <select
              className={styles.select}
              value={form.assigned_to}
              onChange={e => set('assigned_to', e.target.value)}
              required
            >
              <option value="">Selecciona una persona...</option>
              {profiles.map(p => (
                <option key={p.id} value={p.id}>{p.full_name}</option>
              ))}
            </select>
          </div>

          <div className={styles.field}>
            <label className={styles.label}>Tarea / cliente relacionado</label>
            <select
              className={styles.select}
              value={form.task_id}
              onChange={e => handleTaskChange(e.target.value)}
            >
              <option value="">Sin tarea relacionada</option>
              {tasks.map(t => (
                <option key={t.id} value={t.id}>{t.title}</option>
              ))}
            </select>
          </div>

          <div className={styles.field}>
            <label className={styles.label}>Actividad *</label>
            <input
              className={styles.input}
              placeholder="Ej: Hacer diseños día de la madre"
              value={form.title}
              onChange={e => set('title', e.target.value)}
              required
            />
          </div>

          <div className={styles.row}>
            <div className={styles.field}>
              <label className={styles.label}>Hora inicio</label>
              <input
                type="time"
                className={styles.input}
                value={form.time_start}
                onChange={e => set('time_start', e.target.value)}
              />
            </div>
            <div className={styles.field}>
              <label className={styles.label}>Hora fin</label>
              <input
                type="time"
                className={styles.input}
                value={form.time_end}
                onChange={e => set('time_end', e.target.value)}
              />
            </div>
          </div>

          <div className={styles.field}>
            <label className={styles.label}>Notas adicionales</label>
            <textarea
              className={styles.textarea}
              placeholder="Instrucciones o comentarios..."
              value={form.notes}
              onChange={e => set('notes', e.target.value)}
              rows={2}
            />
          </div>

          <div className={styles.footer}>
            <button type="button" className="btn btn-ghost" onClick={onClose}>Cancelar</button>
            <button type="submit" className="btn btn-primary" disabled={loading || !form.title.trim() || !form.assigned_to}>
              {loading ? 'Asignando...' : 'Asignar actividad'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
