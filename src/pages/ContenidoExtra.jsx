import { useState, useCallback, useRef, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import {
  useContenidoExtra, currentMesKey,
  FORMATO_OPTS, SOLICITA_OPTS, APROBACION_OPTS, DISENADO_OPTS,
  PUBLICACION_OPTS, PRESUPUESTO_OPTS, PAUTA_OPTS,
} from '../hooks/useContenidoExtra'
import { useContenidoExtraHeaders, HEADER_GROUPS } from '../hooks/useContenidoExtraHeaders'
import styles from './ContenidoExtra.module.css'

function textColorFor(bgHex) {
  if (!bgHex || bgHex[0] !== '#' || bgHex.length !== 7) return '#fff'
  const r = parseInt(bgHex.slice(1, 3), 16)
  const g = parseInt(bgHex.slice(3, 5), 16)
  const b = parseInt(bgHex.slice(5, 7), 16)
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  return lum > 0.62 ? '#14161b' : '#ffffff'
}

function SelectCell({ value, options, onChange }) {
  const opt = options.find(o => o.value === value)
  const bg = opt ? opt.color : 'var(--bg-hover)'
  const fg = opt ? textColorFor(opt.color) : 'var(--text-muted)'
  return (
    <select
      className={styles.selectPill}
      style={{ background: bg, color: fg, borderColor: opt ? bg : 'var(--border)' }}
      value={value || ''}
      onChange={e => onChange(e.target.value || null)}
    >
      <option value="" style={{ background: '#fff', color: '#333' }}>—</option>
      {options.map(o => (
        <option key={o.value} value={o.value} style={{ background: o.color, color: textColorFor(o.color) }}>
          {o.label}
        </option>
      ))}
    </select>
  )
}

function TextCell({ value, onChange, placeholder, multiline }) {
  const [draft, setDraft] = useState(value || '')
  const timer = useRef(null)

  function handleChange(v) {
    setDraft(v)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => onChange(v), 500)
  }

  function handleBlur() {
    clearTimeout(timer.current)
    onChange(draft)
  }

  if (multiline) {
    return (
      <textarea
        className={styles.cellTextarea}
        value={draft}
        placeholder={placeholder}
        onChange={e => handleChange(e.target.value)}
        onBlur={handleBlur}
        rows={2}
      />
    )
  }
  return (
    <input
      className={styles.cellInput}
      value={draft}
      placeholder={placeholder}
      onChange={e => handleChange(e.target.value)}
      onBlur={handleBlur}
    />
  )
}

function DateCell({ value, onChange }) {
  return (
    <input
      type="date"
      className={styles.cellInput}
      value={value || ''}
      onChange={e => onChange(e.target.value || null)}
    />
  )
}

function CheckCell({ checked, onChange }) {
  return (
    <div className={styles.checkWrap}>
      <input type="checkbox" className={styles.checkbox} checked={!!checked} onChange={e => onChange(e.target.checked)} />
    </div>
  )
}

export default function ContenidoExtraPage() {
  const { isAdmin } = useAuth()
  const { rows, meses, loading, addRow, updateRow, deleteRow, deleteMes, generarNuevoMes } = useContenidoExtra()
  const { labelFor, saveHeaders } = useContenidoExtraHeaders()
  const [confirmDeleteId, setConfirmDeleteId] = useState(null)
  const [confirmDeleteMes, setConfirmDeleteMes] = useState(null)
  const [activeMes, setActiveMes] = useState(currentMesKey())
  const [generating, setGenerating] = useState(false)
  const [showEditHeaders, setShowEditHeaders] = useState(false)

  // Cuando cargan los meses, si el mes activo (actual) todavía no existe como
  // fila en `meses`, igual se muestra: la tabla filtra por fila, no requiere
  // que el mes exista ahí. Si hay meses guardados y el activo no está entre
  // ellos, se posiciona en el más reciente.
  useEffect(() => {
    if (meses.length > 0 && !meses.some(m => m.mes === activeMes)) {
      setActiveMes(meses[meses.length - 1].mes)
    }
  }, [meses]) // eslint-disable-line react-hooks/exhaustive-deps

  const patch = useCallback((id, field) => (val) => updateRow(id, { [field]: val }), [updateRow])
  const rowsForMes = rows.filter(r => r.mes === activeMes)

  async function handleDelete(id) {
    if (confirmDeleteId !== id) { setConfirmDeleteId(id); return }
    setConfirmDeleteId(null)
    await deleteRow(id)
  }

  async function handleGenerarMes() {
    setGenerating(true)
    const { mes, error } = await generarNuevoMes()
    setGenerating(false)
    if (error) {
      alert('No se pudo generar el nuevo mes: ' + (error.message || 'error desconocido'))
    } else {
      setActiveMes(mes)
    }
  }

  async function handleDeleteMes(mesKey) {
    if (confirmDeleteMes !== mesKey) { setConfirmDeleteMes(mesKey); return }
    setConfirmDeleteMes(null)
    const { error } = await deleteMes(mesKey)
    if (error) alert('No se pudo eliminar el mes: ' + (error.message || 'error desconocido'))
  }

  if (loading) return <div className={styles.loading}>Cargando contenido extra...</div>

  return (
    <div className={styles.page}>
      <div className={styles.topbar}>
        <div>
          <h1 className={styles.pageTitle}>Contenido Extra</h1>
          <p className={styles.pageSubtitle}>Arte y publicaciones extra fuera del cronograma regular</p>
        </div>
        <button className="btn btn-primary" onClick={() => addRow(activeMes)}>+ Nueva fila</button>
        {isAdmin && (
          <button className={styles.editHeadersBtn} onClick={() => setShowEditHeaders(true)}>
            ✏️ Editar títulos
          </button>
        )}
      </div>

      <div className={styles.monthTabs}>
        {meses.map(m => (
          <div key={m.mes} className={styles.monthTabWrap}>
            <button
              className={`${styles.monthTab} ${activeMes === m.mes ? styles.monthTabActive : ''}`}
              onClick={() => setActiveMes(m.mes)}
            >
              {m.label}
            </button>
            <button
              className={styles.monthTabRemove}
              title={confirmDeleteMes === m.mes ? 'Confirmar eliminación' : 'Eliminar mes'}
              onClick={() => handleDeleteMes(m.mes)}
            >
              {confirmDeleteMes === m.mes ? '✓' : <CloseIcon />}
            </button>
          </div>
        ))}
        <button className={styles.generarMesBtn} onClick={handleGenerarMes} disabled={generating}>
          + {generating ? 'Generando...' : 'Generar nuevo mes'}
        </button>
      </div>

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th className={styles.groupHeader} colSpan={3}>{labelFor('group_arte_extra')}</th>
              <th className={styles.groupHeader}></th>
              <th className={styles.groupHeader} colSpan={4}>{labelFor('group_planificacion')}</th>
              <th className={styles.groupHeader} colSpan={2}>{labelFor('group_diseno')}</th>
              <th className={styles.groupHeader} colSpan={3}>{labelFor('group_publicacion')}</th>
              <th className={styles.groupHeader} colSpan={3}>{labelFor('group_pauta')}</th>
              <th className={styles.groupHeader}></th>
            </tr>
            <tr>
              <th className={`${styles.colHeader} ${styles.stickyColHead}`}>{labelFor('col_cliente')}</th>
              <th className={styles.colHeader}>{labelFor('col_formato')}</th>
              <th className={styles.colHeader}>{labelFor('col_solicita')}</th>
              <th className={styles.colHeader}>{labelFor('col_fecha_solicitud')}</th>
              <th className={styles.colHeader}>{labelFor('col_codigo')}</th>
              <th className={styles.colHeader}>{labelFor('col_copy_diseno')}</th>
              <th className={styles.colHeader}>{labelFor('col_copy_red_social')}</th>
              <th className={styles.colHeader}>{labelFor('col_aprobacion')}</th>
              <th className={styles.colHeader}>{labelFor('col_fecha_entrega')}</th>
              <th className={styles.colHeader}>{labelFor('col_disenado')}</th>
              <th className={styles.colHeader}>{labelFor('col_link')}</th>
              <th className={styles.colHeader}>{labelFor('col_publicacion')}</th>
              <th className={styles.colHeader}>{labelFor('col_publicacion_check')}</th>
              <th className={styles.colHeader}>{labelFor('col_fecha_publicacion')}</th>
              <th className={styles.colHeader}>{labelFor('col_presupuesto')}</th>
              <th className={styles.colHeader}>{labelFor('col_duracion')}</th>
              <th className={styles.colHeader}>{labelFor('col_pauta')}</th>
              <th className={styles.colHeader}>{labelFor('col_pauta_check')}</th>
            </tr>
          </thead>
          <tbody>
            {rowsForMes.length === 0 && (
              <tr><td className={styles.emptyRow} colSpan={18}>No hay filas todavía en este mes. Usa "+ Nueva fila" para empezar.</td></tr>
            )}
            {rowsForMes.map(row => (
              <tr key={row.id} className={styles.row}>
                <td className={`${styles.cell} ${styles.stickyCol}`}>
                  <div className={styles.clientCellWrap}>
                    <TextCell value={row.cliente} placeholder="Cliente" onChange={patch(row.id, 'cliente')} />
                    <button className={styles.deleteBtn} title="Eliminar fila" onClick={() => handleDelete(row.id)}>
                      {confirmDeleteId === row.id ? '✓' : <TrashIcon />}
                    </button>
                  </div>
                </td>
                <td className={styles.cell}><SelectCell value={row.formato} options={FORMATO_OPTS} onChange={patch(row.id, 'formato')} /></td>
                <td className={styles.cell}><SelectCell value={row.solicita} options={SOLICITA_OPTS} onChange={patch(row.id, 'solicita')} /></td>
                <td className={styles.cell}><DateCell value={row.fecha_solicitud} onChange={patch(row.id, 'fecha_solicitud')} /></td>
                <td className={styles.cell}><TextCell value={row.codigo} placeholder="Código" onChange={patch(row.id, 'codigo')} /></td>
                <td className={styles.cellWide}><TextCell value={row.copy_diseno} placeholder="Copy diseño" multiline onChange={patch(row.id, 'copy_diseno')} /></td>
                <td className={styles.cellWide}><TextCell value={row.copy_red_social} placeholder="Copy red social" multiline onChange={patch(row.id, 'copy_red_social')} /></td>
                <td className={styles.cell}><SelectCell value={row.aprobacion} options={APROBACION_OPTS} onChange={patch(row.id, 'aprobacion')} /></td>
                <td className={styles.cell}><DateCell value={row.fecha_entrega} onChange={patch(row.id, 'fecha_entrega')} /></td>
                <td className={styles.cell}><SelectCell value={row.disenado} options={DISENADO_OPTS} onChange={patch(row.id, 'disenado')} /></td>
                <td className={styles.cell}>
                  {row.link ? (
                    <div className={styles.linkCellWrap}>
                      <a className={styles.linkChip} href={row.link} target="_blank" rel="noreferrer" title={row.link}>🔗 Extras</a>
                      <TextCell value={row.link} placeholder="URL" onChange={patch(row.id, 'link')} />
                    </div>
                  ) : (
                    <TextCell value={row.link} placeholder="Pegar link" onChange={patch(row.id, 'link')} />
                  )}
                </td>
                <td className={styles.cell}><SelectCell value={row.publicacion} options={PUBLICACION_OPTS} onChange={patch(row.id, 'publicacion')} /></td>
                <td className={styles.cellCheck}><CheckCell checked={row.publicacion_check} onChange={patch(row.id, 'publicacion_check')} /></td>
                <td className={styles.cell}><DateCell value={row.fecha_publicacion} onChange={patch(row.id, 'fecha_publicacion')} /></td>
                <td className={styles.cell}><SelectCell value={row.presupuesto} options={PRESUPUESTO_OPTS} onChange={patch(row.id, 'presupuesto')} /></td>
                <td className={styles.cell}><TextCell value={row.duracion} placeholder="Duración" onChange={patch(row.id, 'duracion')} /></td>
                <td className={styles.cell}><SelectCell value={row.pauta} options={PAUTA_OPTS} onChange={patch(row.id, 'pauta')} /></td>
                <td className={styles.cellCheck}><CheckCell checked={row.verificado} onChange={patch(row.id, 'verificado')} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showEditHeaders && (
        <EditHeadersModal labelFor={labelFor} onSave={saveHeaders} onClose={() => setShowEditHeaders(false)} />
      )}
    </div>
  )
}

function EditHeadersModal({ labelFor, onSave, onClose }) {
  const [draft, setDraft] = useState(() => {
    const all = {}
    for (const group of HEADER_GROUPS) for (const key of group.keys) all[key] = labelFor(key)
    return all
  })
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    setSaving(true)
    const changes = {}
    for (const group of HEADER_GROUPS) {
      for (const key of group.keys) {
        if (draft[key] !== labelFor(key)) changes[key] = draft[key]
      }
    }
    const { error } = await onSave(changes)
    setSaving(false)
    if (error) alert('No se pudo guardar: ' + (error.message || 'error desconocido'))
    else onClose()
  }

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.editHeadersModal} onClick={e => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <h2>Editar títulos de la tabla</h2>
          <button className={styles.closeBtn} onClick={onClose}><CloseIcon /></button>
        </div>
        <div className={styles.modalForm}>
          {HEADER_GROUPS.map(group => (
            <div key={group.title}>
              <p className={styles.headerGroupTitle}>{group.title}</p>
              <div className={styles.headerFieldsGrid}>
                {group.keys.map(key => (
                  <input
                    key={key}
                    className={styles.cellInput}
                    style={{ border: '1px solid var(--border)', padding: '7px 8px' }}
                    value={draft[key]}
                    onChange={e => setDraft(prev => ({ ...prev, [key]: e.target.value }))}
                  />
                ))}
              </div>
            </div>
          ))}
          <button className="btn btn-primary" style={{ justifyContent: 'center' }} onClick={handleSave} disabled={saving}>
            {saving ? 'Guardando...' : 'Guardar cambios'}
          </button>
        </div>
      </div>
    </div>
  )
}

function TrashIcon() { return <svg width="13" height="13" viewBox="0 0 16 16" fill="none"><path d="M2 4h12M5 4V3h6v1M6 7v5M10 7v5M3 4l1 9h8l1-9" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/></svg> }
function CloseIcon() { return <svg width="9" height="9" viewBox="0 0 16 16" fill="none"><path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg> }
