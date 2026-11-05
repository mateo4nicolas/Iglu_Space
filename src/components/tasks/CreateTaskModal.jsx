import { useState, useEffect } from 'react'
import { useAuth } from '../../context/AuthContext'
import { supabase } from '../../lib/supabase'
import styles from './CreateTaskModal.module.css'

function todayStr(date = new Date()) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function currentMesTarea(date = new Date()) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  return `${y}-${m}`
}

export default function CreateTaskModal({ columns, departmentId, onClose, onCreate }) {
  const { profile, isAdmin } = useAuth()
  const [profiles, setProfiles] = useState([])
  const [departments, setDepartments] = useState([])
  const [deptMembers, setDeptMembers] = useState([])
  const [form, setForm] = useState({
    title: '',
    description: '',
    priority: 'normal',
    assigned_to: '',
    column_id: columns[0]?.id || '',
    mes_tarea: currentMesTarea(),
    is_shared: false,
    shared_with: [],
    fecha_cronograma: todayStr(),
  })
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    supabase.from('profiles').select('id, full_name, display_name, username').then(({ data }) => setProfiles(data || []))
    supabase.from('departments').select('id, name, color').order('name').then(({ data }) => setDepartments(data || []))
    if (departmentId) {
      supabase.from('profile_departments')
        .select('user_id, profiles(id, full_name, display_name, username)')
        .eq('department_id', departmentId)
        .then(({ data }) => setDeptMembers((data || []).map(r => r.profiles).filter(Boolean)))
    }
  }, [departmentId])

  function toggleShared(id) {
    setForm(p => ({
      ...p,
      shared_with: p.shared_with.includes(id) ? p.shared_with.filter(x => x !== id) : [...p.shared_with, id],
    }))
  }

  function set(key, val) { setForm(p => ({ ...p, [key]: val })) }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.title.trim() || !form.mes_tarea) return
    setLoading(true)
    const sharedWith = form.is_shared ? form.shared_with.filter(id => id !== form.assigned_to) : []
    const { error } = await onCreate({
      title: form.title.trim(),
      description: form.description.trim() || null,
      priority: form.priority,
      assigned_to: form.assigned_to || null,
      column_id: form.column_id || columns[0]?.id,
      mes_tarea: form.mes_tarea,
      allow_transfer: true,
      is_shared: sharedWith.length > 0,
      shared_with: sharedWith,
      ...((form.assigned_to || sharedWith.length > 0) && form.fecha_cronograma
        ? { fecha_cronograma: form.fecha_cronograma }
        : {}),
    })
    setLoading(false)
    if (!error) onClose()
  }

  function nameFor(p) { return p.username || p.display_name || p.full_name }

  return (
    <div className={styles.overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className={styles.modal}>
        <div className={styles.header}>
          <h2 className={styles.title}>Nueva tarea / cliente</h2>
          <button className={styles.closeBtn} onClick={onClose}><CloseIcon /></button>
        </div>
        {!isAdmin && (
          <div className={styles.notice}>Tu tarea quedará pendiente de aprobación por un administrador.</div>
        )}
        <form className={styles.form} onSubmit={handleSubmit}>
          <Field label="Nombre del cliente / tarea *">
            <input className={styles.input} placeholder="Ej: Cliente ABC - Campaña Mayo" value={form.title} onChange={e => set('title', e.target.value)} required autoFocus />
          </Field>
          <Field label="Descripción">
            <textarea className={styles.textarea} placeholder="Describe el trabajo a realizar..." value={form.description} onChange={e => set('description', e.target.value)} rows={3} />
          </Field>
          <div className={styles.row}>
            <Field label="Prioridad">
              <select className={styles.select} value={form.priority} onChange={e => set('priority', e.target.value)}>
                <option value="low">Baja</option>
                <option value="normal">Normal</option>
                <option value="high">Alta</option>
                <option value="urgent">Urgente</option>
              </select>
            </Field>
            <Field label="Columna inicial">
              <select className={styles.select} value={form.column_id} onChange={e => set('column_id', e.target.value)}>
                {columns.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
              </select>
            </Field>
          </div>

          <Field label="Mes *">
            <input
              type="month"
              className={styles.input}
              value={form.mes_tarea}
              onChange={e => set('mes_tarea', e.target.value)}
              required
            />
          </Field>

          {isAdmin && (
            <Field label="Asignar a">
              <select className={styles.select} value={form.assigned_to} onChange={e => set('assigned_to', e.target.value)}>
                <option value="">Sin asignar</option>
                {profiles.map(p => <option key={p.id} value={p.id}>{nameFor(p)}</option>)}
              </select>
            </Field>
          )}

          {isAdmin && (form.assigned_to || (form.is_shared && form.shared_with.length > 0)) && (
            <Field label="Fecha en el cronograma">
              <input
                type="date"
                className={styles.input}
                value={form.fecha_cronograma}
                onChange={e => set('fecha_cronograma', e.target.value)}
                required
              />
            </Field>
          )}

          {isAdmin && (
            <div style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 10, background: 'var(--bg-hover)' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, fontWeight: 500, color: 'var(--text-primary)' }}>
                <input
                  type="checkbox"
                  checked={form.is_shared}
                  onChange={e => set('is_shared', e.target.checked)}
                  style={{ accentColor: 'var(--accent)', width: 14, height: 14 }}
                />
                Tarea compartida
              </label>
              {form.is_shared && (
                <>
                  <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '6px 0' }}>
                    Elige con quién se comparte. Llega a revisión solo cuando todos la manden.
                  </p>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {(deptMembers.length > 0 ? deptMembers : profiles)
                      .filter(p => p.id !== form.assigned_to)
                      .map(p => {
                        const sel = form.shared_with.includes(p.id)
                        return (
                          <button
                            key={p.id}
                            type="button"
                            onClick={() => toggleShared(p.id)}
                            style={{
                              padding: '5px 12px', borderRadius: 999, fontSize: 12, cursor: 'pointer',
                              border: `1.5px solid ${sel ? 'var(--accent)' : 'var(--border)'}`,
                              background: sel ? 'var(--accent-dim)' : 'var(--bg-card)',
                              color: sel ? 'var(--accent)' : 'var(--text-secondary)',
                              fontWeight: sel ? 600 : 400,
                            }}
                          >
                            {nameFor(p)}{sel ? ' ✓' : ''}
                          </button>
                        )
                      })}
                  </div>
                </>
              )}
            </div>
          )}

          <div className={styles.footer}>
            <button type="button" className="btn btn-ghost" onClick={onClose}>Cancelar</button>
            <button type="submit" className="btn btn-primary" disabled={loading || !form.title.trim()}>
              {loading ? 'Creando...' : isAdmin ? 'Crear tarea' : 'Enviar para aprobación'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function Field({ label, children }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      <label style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 4, display: 'block' }}>{label}</label>
      {children}
    </div>
  )
}

function CloseIcon() {
  return <svg width="15" height="15" viewBox="0 0 16 16" fill="none"><path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
}
