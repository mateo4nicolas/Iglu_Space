import { useState } from 'react'
import { CUSTOM_TIPOS, newCustomId } from '../../hooks/useTablaLayout'
import styles from './TablaLayoutModal.module.css'

// Editor del diseño de una tabla (solo admin):
//   · Renombrar títulos (grupos, columnas, etc.)
//   · Mostrar / ocultar columnas
//   · Añadir, renombrar o quitar columnas propias (texto, fecha, número, link, check)
//
// sections: [{ title, items: [{ key, default, hideable }] }]
// customGroups: [{ value, label }] — dónde se puede ubicar una columna propia
// labelsOverride / onSaveLabels: opcional, cuando los títulos se guardan en otro lado
export default function TablaLayoutModal({
  title = 'Editar tabla', sections, customGroups, layout, onSave, onClose,
  labelsOverride, onSaveLabels,
}) {
  const initialLabels = labelsOverride || layout.labels || {}
  const [labels, setLabels] = useState(() => {
    const all = {}
    sections.forEach(sec => sec.items.forEach(it => { all[it.key] = initialLabels[it.key] ?? '' }))
    return all
  })
  const [hidden, setHidden] = useState(() => new Set(layout.hidden || []))
  const [custom, setCustom] = useState(() => (layout.custom_cols || []).map(c => ({ ...c })))
  const [saving, setSaving] = useState(false)

  function toggleHidden(key) {
    setHidden(prev => {
      const n = new Set(prev)
      n.has(key) ? n.delete(key) : n.add(key)
      return n
    })
  }
  function addCustom() {
    setCustom(prev => [...prev, { id: newCustomId(), label: 'Nueva columna', tipo: 'texto', grupo: customGroups[customGroups.length - 1]?.value || 'final' }])
  }
  function patchCustom(id, patch) { setCustom(prev => prev.map(c => (c.id === id ? { ...c, ...patch } : c))) }
  function removeCustom(id) {
    const c = custom.find(x => x.id === id)
    if (!window.confirm(`¿Quitar la columna "${c?.label}"? Sus datos dejarán de mostrarse.`)) return
    setCustom(prev => prev.filter(x => x.id !== id))
  }

  async function handleSave() {
    setSaving(true)
    const cleanLabels = {}
    Object.entries(labels).forEach(([k, v]) => { if ((v || '').trim()) cleanLabels[k] = v.trim() })
    const cleanCustom = custom
      .map(c => ({ ...c, label: (c.label || '').trim() || 'Columna' }))
    let error = null
    if (onSaveLabels) {
      // Títulos guardados en otro lado (ej. tabla de encabezados existente)
      const changes = {}
      sections.forEach(sec => sec.items.forEach(it => {
        const now = (labels[it.key] || '').trim() || it.default
        const before = (initialLabels[it.key] || '').trim() || it.default
        if (now !== before) changes[it.key] = now
      }))
      const r1 = await onSaveLabels(changes)
      error = r1?.error || null
      if (!error) {
        const r2 = await onSave({ hidden: [...hidden], custom_cols: cleanCustom })
        error = r2?.error || null
      }
    } else {
      const r = await onSave({ labels: cleanLabels, hidden: [...hidden], custom_cols: cleanCustom })
      error = r?.error || null
    }
    setSaving(false)
    if (error) alert('No se pudo guardar: ' + (error.message || 'error desconocido'))
    else onClose()
  }

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <div className={styles.head}>
          <h2>{title}</h2>
          <button className={styles.close} onClick={onClose} aria-label="Cerrar">✕</button>
        </div>

        <div className={styles.body}>
          <p className={styles.hint}>Los cambios aplican para todos los usuarios. Deja un título vacío para usar el original.</p>

          {sections.map(sec => (
            <div key={sec.title} className={styles.section}>
              <p className={styles.sectionTitle}>{sec.title}</p>
              <div className={styles.grid}>
                {sec.items.map(it => (
                  <div key={it.key} className={`${styles.item} ${hidden.has(it.key) ? styles.itemHidden : ''}`}>
                    <input
                      className={styles.input}
                      value={labels[it.key]}
                      placeholder={it.placeholder || it.default}
                      title={it.placeholder || it.default}
                      onChange={e => setLabels(prev => ({ ...prev, [it.key]: e.target.value }))}
                    />
                    {it.hideable && (
                      <label className={styles.visible} title={hidden.has(it.key) ? 'Columna oculta' : 'Columna visible'}>
                        <input type="checkbox" checked={!hidden.has(it.key)} onChange={() => toggleHidden(it.key)} />
                        Ver
                      </label>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}

          <div className={styles.section}>
            <p className={styles.sectionTitle}>Columnas propias</p>
            {custom.length === 0 && <p className={styles.empty}>Todavía no hay columnas propias.</p>}
            {custom.map(c => (
              <div key={c.id} className={`${styles.customRow} ${hidden.has(c.id) ? styles.itemHidden : ''}`}>
                <input className={styles.input} value={c.label} onChange={e => patchCustom(c.id, { label: e.target.value })} placeholder="Título" />
                <select className={styles.select} value={c.tipo} onChange={e => patchCustom(c.id, { tipo: e.target.value })}>
                  {CUSTOM_TIPOS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
                <select className={styles.select} value={c.grupo || 'final'} onChange={e => patchCustom(c.id, { grupo: e.target.value })}>
                  {customGroups.map(g => <option key={g.value} value={g.value}>{g.label}</option>)}
                </select>
                <label className={styles.visible}>
                  <input type="checkbox" checked={!hidden.has(c.id)} onChange={() => toggleHidden(c.id)} />
                  Ver
                </label>
                <button className={styles.del} onClick={() => removeCustom(c.id)} title="Quitar columna">✕</button>
              </div>
            ))}
            <button className={styles.add} onClick={addCustom}>+ Añadir columna</button>
          </div>
        </div>

        <div className={styles.foot}>
          <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>{saving ? 'Guardando...' : 'Guardar cambios'}</button>
        </div>
      </div>
    </div>
  )
}
