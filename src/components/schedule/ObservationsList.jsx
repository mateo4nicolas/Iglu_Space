import { useState } from 'react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { useAuth } from '../../context/AuthContext'
import styles from './ObservationsList.module.css'

// Lista de observaciones de un pendiente del Cronograma: cada persona
// (usuario o admin) puede añadir varias; edita/borra las suyas y el admin
// puede borrar cualquiera.
export default function ObservationsList({ item, onAdd, onEdit, onDelete, canAdd = true }) {
  const { profile, isAdmin } = useAuth()
  const [adding, setAdding] = useState(false)
  const [text, setText] = useState('')
  const [editingId, setEditingId] = useState(null)
  const [editText, setEditText] = useState('')
  const [busy, setBusy] = useState(false)

  const observations = item.observations_view || []

  async function submitAdd() {
    if (!text.trim() || busy) return
    setBusy(true)
    const { error } = await onAdd(item.id, text)
    setBusy(false)
    if (error) { alert('No se pudo guardar la observación: ' + error.message); return }
    setText('')
    setAdding(false)
  }

  async function submitEdit(obsId) {
    if (!editText.trim() || busy) return
    setBusy(true)
    const { error } = await onEdit(item.id, obsId, editText)
    setBusy(false)
    if (error) { alert('No se pudo editar la observación: ' + error.message); return }
    setEditingId(null)
  }

  async function remove(obsId) {
    if (!window.confirm('¿Borrar esta observación?')) return
    const { error } = await onDelete(item.id, obsId)
    if (error) alert('No se pudo borrar la observación: ' + error.message)
  }

  function authorName(o) {
    const p = o.author
    return p ? (p.username || p.display_name || p.full_name) : 'Observación'
  }

  return (
    <div className={styles.wrap}>
      {observations.map(o => {
        const mine = o.user_id === profile?.id
        return (
          <div key={o.id} className={`${styles.obs} ${mine ? styles.obsMine : ''}`}>
            <div className={styles.obsHead}>
              <span className={styles.author}>📝 {authorName(o)}</span>
              {o.created_at && (
                <span className={styles.time}>
                  {format(new Date(o.created_at), "d MMM, HH:mm", { locale: es })}
                  {o.edited_at && ' · editada'}
                </span>
              )}
              <span className={styles.actions}>
                {mine && editingId !== o.id && (
                  <button className={styles.iconBtn} onClick={() => { setEditingId(o.id); setEditText(o.text) }} title="Editar">✎</button>
                )}
                {(mine || isAdmin) && editingId !== o.id && (
                  <button className={`${styles.iconBtn} ${styles.iconDanger}`} onClick={() => remove(o.id)} title="Borrar">✕</button>
                )}
              </span>
            </div>
            {editingId === o.id ? (
              <div className={styles.editBox}>
                <textarea className={styles.input} value={editText} onChange={e => setEditText(e.target.value)} rows={2} autoFocus />
                <div className={styles.btnRow}>
                  <button className="btn btn-primary" style={{ fontSize: 12, padding: '5px 12px' }} disabled={busy || !editText.trim()} onClick={() => submitEdit(o.id)}>Guardar</button>
                  <button className="btn btn-ghost" style={{ fontSize: 12, padding: '5px 12px' }} onClick={() => setEditingId(null)}>Cancelar</button>
                </div>
              </div>
            ) : (
              <p className={styles.text}>{o.text}</p>
            )}
          </div>
        )
      })}

      {canAdd && (adding ? (
        <div className={styles.editBox}>
          <textarea
            className={styles.input}
            value={text}
            onChange={e => setText(e.target.value)}
            placeholder="Escribe tu observación..."
            rows={2}
            autoFocus
          />
          <div className={styles.btnRow}>
            <button className="btn btn-primary" style={{ fontSize: 12, padding: '5px 12px' }} disabled={busy || !text.trim()} onClick={submitAdd}>
              {busy ? 'Guardando...' : 'Guardar'}
            </button>
            <button className="btn btn-ghost" style={{ fontSize: 12, padding: '5px 12px' }} onClick={() => { setAdding(false); setText('') }}>Cancelar</button>
          </div>
        </div>
      ) : (
        <button className={styles.addBtn} onClick={() => setAdding(true)}>+ Añadir observación</button>
      ))}
    </div>
  )
}
