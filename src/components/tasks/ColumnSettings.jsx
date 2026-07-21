import { useState, useRef, useCallback } from 'react'
import styles from './ColumnSettings.module.css'

const COLORS = ['#6366f1','#60a5fa','#34d399','#fbbf24','#f87171','#a78bfa','#fb923c','#e879f9']

export default function ColumnSettings({ columns, allDeptColumns, onSave, onDelete, onClose }) {
  const allCols = allDeptColumns && allDeptColumns.length > 0 ? allDeptColumns : columns

  const [adminCols, setAdminCols] = useState(() =>
    allCols
      .filter(c => c.owner_role === 'admin' || (!c.owner_role && c.auto_assign_to !== 'user'))
      .map(c => ({ ...c }))
      .sort((a, b) => a.position - b.position)
  )
  const [userCols, setUserCols] = useState(() =>
    allCols
      .filter(c => c.owner_role === 'user')
      .map(c => ({ ...c }))
      .sort((a, b) => a.position - b.position)
  )
  const [saving, setSaving] = useState(false)

  // Touch-based drag state
  const dragState = useRef(null)

  function updateCol(role, id, key, val) {
    const setter = role === 'admin' ? setAdminCols : setUserCols
    setter(prev => prev.map(c => c.id === id ? { ...c, [key]: val } : c))
  }

  function addCol(role) {
    const list = role === 'admin' ? adminCols : userCols
    const newCol = {
      id: `new-${Date.now()}`,
      title: '',
      color: COLORS[list.length % COLORS.length],
      position: list.length,
      auto_assign_to: null,
      owner_role: role,
      isNew: true,
    }
    if (role === 'admin') setAdminCols(prev => [...prev, newCol])
    else setUserCols(prev => [...prev, newCol])
  }

  function removeCol(role, id) {
    const setter = role === 'admin' ? setAdminCols : setUserCols
    const list = role === 'admin' ? adminCols : userCols
    const col = list.find(c => c.id === id)
    setter(prev => prev.filter(c => c.id !== id))
    if (col && !col.isNew) onDelete(col.id)
  }

  function reorder(role, fromId, toId) {
    if (fromId === toId) return
    const setter = role === 'admin' ? setAdminCols : setUserCols
    setter(prev => {
      const list = [...prev]
      const fromIdx = list.findIndex(c => c.id === fromId)
      const toIdx = list.findIndex(c => c.id === toId)
      if (fromIdx === -1 || toIdx === -1) return list
      const [moved] = list.splice(fromIdx, 1)
      list.splice(toIdx, 0, moved)
      return list.map((c, i) => ({ ...c, position: i }))
    })
  }

  // Mouse drag handlers
  function onDragStart(role, id) {
    dragState.current = { role, id, type: 'mouse' }
  }
  function onDragOver(e, role, id) {
    e.preventDefault()
    if (!dragState.current || dragState.current.type !== 'mouse') return
    if (dragState.current.role !== role || dragState.current.id === id) return
    dragState.current.overId = id
  }
  function onDrop(e, role, id) {
    e.preventDefault()
    if (!dragState.current || dragState.current.type !== 'mouse') return
    reorder(role, dragState.current.id, id)
    dragState.current = null
  }
  function onDragEnd() { dragState.current = null }

  async function handleSave() {
    setSaving(true)
    for (let i = 0; i < adminCols.length; i++) {
      const col = { ...adminCols[i], position: i }
      if (!col.title.trim()) continue
      if (col.isNew) {
        const { id, isNew, ...rest } = col
        await onSave({ ...rest, position: i })
      } else {
        await onSave({ ...col, position: i })
      }
    }
    for (let i = 0; i < userCols.length; i++) {
      const col = { ...userCols[i], position: i }
      if (!col.title.trim()) continue
      if (col.isNew) {
        const { id, isNew, ...rest } = col
        await onSave({ ...rest, position: i })
      } else {
        await onSave({ ...col, position: i })
      }
    }
    setSaving(false)
    onClose()
  }

  return (
    <div className={styles.overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className={styles.modal}>
        <div className={styles.header}>
          <h2 className={styles.title}>Columnas del departamento</h2>
          <button className={styles.closeBtn} onClick={onClose}><XIcon /></button>
        </div>
        <div className={styles.body}>
          <Section
            label="🔧 Columnas del Admin"
            hint="Arrastra para reordenar"
            cols={adminCols}
            role="admin"
            dragState={dragState}
            onUpdate={updateCol}
            onDelete={removeCol}
            onAdd={() => addCol('admin')}
            onDragStart={onDragStart}
            onDragOver={onDragOver}
            onDrop={onDrop}
            onDragEnd={onDragEnd}
            onReorder={reorder}
          />
          <div className={styles.roleDivider} />
          <Section
            label="👤 Columnas del Usuario"
            hint="Arrastra para reordenar"
            cols={userCols}
            role="user"
            dragState={dragState}
            onUpdate={updateCol}
            onDelete={removeCol}
            onAdd={() => addCol('user')}
            onDragStart={onDragStart}
            onDragOver={onDragOver}
            onDrop={onDrop}
            onDragEnd={onDragEnd}
            onReorder={reorder}
          />
        </div>
        <div className={styles.footer}>
          <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Guardando...' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  )
}

function Section({ label, hint, cols, role, dragState, onUpdate, onDelete, onAdd, onDragStart, onDragOver, onDrop, onDragEnd, onReorder }) {
  return (
    <div className={styles.roleSection}>
      <div className={styles.roleHeader}>
        <span className={styles.roleLabel}>{label}</span>
        <span className={styles.roleHint}>{hint}</span>
      </div>
      {cols.map(col => (
        <ColRow
          key={col.id}
          col={col}
          role={role}
          dragState={dragState}
          onUpdate={onUpdate}
          onDelete={onDelete}
          onDragStart={onDragStart}
          onDragOver={onDragOver}
          onDrop={onDrop}
          onDragEnd={onDragEnd}
          onReorder={onReorder}
        />
      ))}
      <button className={styles.addBtn} onClick={onAdd}>+ Columna</button>
    </div>
  )
}

function ColRow({ col, role, dragState, onUpdate, onDelete, onDragStart, onDragOver, onDrop, onDragEnd, onReorder }) {
  const rowRef = useRef(null)
  const touchRef = useRef(null)
  const [isDragging, setIsDragging] = useState(false)

  // Touch drag support for iOS
  function handleTouchStart(e) {
    const touch = e.touches[0]
    touchRef.current = {
      id: col.id,
      role,
      startY: touch.clientY,
      moved: false,
    }
  }

  function handleTouchMove(e) {
    if (!touchRef.current) return
    const touch = e.touches[0]
    const dy = Math.abs(touch.clientY - touchRef.current.startY)
    if (dy > 5) {
      touchRef.current.moved = true
      e.preventDefault() // prevent scroll while dragging
    }

    // Find which row we're over
    const el = document.elementFromPoint(touch.clientX, touch.clientY)
    if (!el) return
    const targetRow = el.closest('[data-col-id]')
    if (targetRow && targetRow !== rowRef.current) {
      const targetId = targetRow.getAttribute('data-col-id')
      const targetRole = targetRow.getAttribute('data-col-role')
      if (targetRole === role && targetId !== col.id) {
        touchRef.current.overId = targetId
      }
    }
  }

  function handleTouchEnd() {
    if (!touchRef.current) return
    if (touchRef.current.moved && touchRef.current.overId) {
      onReorder(role, col.id, touchRef.current.overId)
    }
    touchRef.current = null
  }

  return (
    <div
      ref={rowRef}
      data-col-id={col.id}
      data-col-role={role}
      draggable
      onDragStart={() => { setIsDragging(true); onDragStart(role, col.id) }}
      onDragOver={e => onDragOver(e, role, col.id)}
      onDrop={e => { onDrop(e, role, col.id); setIsDragging(false) }}
      onDragEnd={() => { setIsDragging(false); onDragEnd() }}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        marginBottom: 6,
        padding: '8px 10px',
        borderRadius: 8,
        border: '1px solid var(--border)',
        background: isDragging ? 'var(--accent-dim)' : 'var(--bg-hover)',
        opacity: isDragging ? 0.5 : 1,
        cursor: 'grab',
        touchAction: 'none',
        userSelect: 'none',
        WebkitUserSelect: 'none',
      }}
    >
      <span style={{ color: 'var(--text-muted)', fontSize: 16, flexShrink: 0, lineHeight: 1 }}>⠿</span>

      <div style={{ position: 'relative', width: 28, height: 28, borderRadius: 6, background: col.color, flexShrink: 0, cursor: 'pointer', overflow: 'hidden' }}>
        <input
          type="color"
          style={{ opacity: 0, position: 'absolute', inset: 0, width: '100%', height: '100%', cursor: 'pointer', border: 'none', padding: 0 }}
          value={col.color}
          onChange={e => onUpdate(role, col.id, 'color', e.target.value)}
          onClick={e => e.stopPropagation()}
        />
      </div>

      <input
        style={{ flex: 1, padding: '6px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-surface)', fontSize: 14, color: 'var(--text-primary)', outline: 'none', fontFamily: 'var(--font)', WebkitAppearance: 'none' }}
        placeholder="Nombre de columna"
        value={col.title}
        onChange={e => onUpdate(role, col.id, 'title', e.target.value)}
        onTouchStart={e => e.stopPropagation()}
        onClick={e => e.stopPropagation()}
      />

      <button
        style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'none', cursor: 'pointer', color: 'var(--danger)', display: 'flex', flexShrink: 0, minWidth: 32, minHeight: 32, alignItems: 'center', justifyContent: 'center' }}
        onPointerDown={e => { e.stopPropagation(); onDelete(role, col.id) }}
      >
        <XIcon />
      </button>
    </div>
  )
}

function XIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
      <path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}
