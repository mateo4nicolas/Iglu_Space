import { useState, useCallback, useRef, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import {
  useContenidoExtra, currentMesKey, mesKeyToLabel,
  FORMATO_OPTS, SOLICITA_OPTS, APROBACION_OPTS, DISENADO_OPTS,
  PUBLICACION_OPTS, PRESUPUESTO_OPTS, PAUTA_OPTS,
} from '../hooks/useContenidoExtra'
import { useContenidoExtraHeaders, DEFAULT_HEADERS } from '../hooks/useContenidoExtraHeaders'
import { useTablaLayout } from '../hooks/useTablaLayout'
import TablaLayoutModal from '../components/tablas/TablaLayoutModal'
import CustomCell, { customValueText } from '../components/tablas/CustomCell'
import { downloadXlsx } from '../utils/xlsxExport'
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

// ── Modelo de columnas (orden, grupo, cómo se edita y cómo se exporta) ──────
const fmtDay = v => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(v || ''))
  return m ? `${m[3]}/${m[2]}/${m[1]}` : ''
}
const optLabel = (opts, v) => opts.find(o => o.value === v)?.label || ''

const BASE_COLUMNS = [
  { key: 'col_cliente', group: 'group_arte_extra', hideable: false, width: 22 },
  { key: 'col_formato', group: 'group_arte_extra', field: 'formato', opts: FORMATO_OPTS, width: 12 },
  { key: 'col_solicita', group: 'group_arte_extra', field: 'solicita', opts: SOLICITA_OPTS, width: 11 },
  { key: 'col_fecha_solicitud', group: 'none_1', field: 'fecha_solicitud', kind: 'date', width: 14 },
  { key: 'col_codigo', group: 'group_planificacion', field: 'codigo', kind: 'text', placeholder: 'Código', width: 14 },
  { key: 'col_copy_diseno', group: 'group_planificacion', field: 'copy_diseno', kind: 'textarea', placeholder: 'Copy diseño', wide: true, width: 36 },
  { key: 'col_copy_red_social', group: 'group_planificacion', field: 'copy_red_social', kind: 'textarea', placeholder: 'Copy red social', wide: true, width: 36 },
  { key: 'col_aprobacion', group: 'group_planificacion', field: 'aprobacion', opts: APROBACION_OPTS, width: 12 },
  { key: 'col_fecha_entrega', group: 'group_diseno', field: 'fecha_entrega', kind: 'date', width: 14 },
  { key: 'col_disenado', group: 'group_diseno', field: 'disenado', opts: DISENADO_OPTS, width: 16 },
  { key: 'col_link', group: 'group_publicacion', field: 'link', kind: 'link', width: 30 },
  { key: 'col_publicacion', group: 'group_publicacion', field: 'publicacion', opts: PUBLICACION_OPTS, width: 13 },
  { key: 'col_publicacion_check', group: 'group_publicacion', field: 'publicacion_check', kind: 'check', exportLabel: 'col_publicacion', width: 12 },
  { key: 'col_fecha_publicacion', group: 'group_pauta', field: 'fecha_publicacion', kind: 'date', width: 16 },
  { key: 'col_presupuesto', group: 'group_pauta', field: 'presupuesto', opts: PRESUPUESTO_OPTS, width: 16 },
  { key: 'col_duracion', group: 'group_pauta', field: 'duracion', kind: 'text', placeholder: 'Duración', width: 12 },
  { key: 'col_pauta', group: 'none_2', field: 'pauta', opts: PAUTA_OPTS, width: 12 },
  { key: 'col_pauta_check', group: 'none_2', field: 'verificado', kind: 'check', exportLabel: 'col_pauta', width: 12 },
]
const GROUP_ORDER = ['group_arte_extra', 'none_1', 'group_planificacion', 'group_diseno', 'group_publicacion', 'group_pauta', 'none_2', 'final']
const CUSTOM_GROUPS = [
  { value: 'group_arte_extra', label: 'En: Arte extra' },
  { value: 'group_planificacion', label: 'En: Planificación' },
  { value: 'group_diseno', label: 'En: Diseño' },
  { value: 'group_publicacion', label: 'En: Publicación' },
  { value: 'group_pauta', label: 'En: Pauta' },
  { value: 'final', label: 'Al final (grupo OTROS)' },
]
const LAYOUT_SECTIONS = [
  { title: 'Encabezados de grupo', items: ['group_arte_extra', 'group_planificacion', 'group_diseno', 'group_publicacion', 'group_pauta', 'group_otros'].map(k => ({ key: k, default: k === 'group_otros' ? 'OTROS' : DEFAULT_HEADERS[k] })) },
  { title: 'Columnas (título y si se ve)', items: BASE_COLUMNS.map(c => ({
    key: c.key,
    default: DEFAULT_HEADERS[c.key],
    placeholder: c.exportLabel ? `${DEFAULT_HEADERS[c.key]}  (check de ${DEFAULT_HEADERS[c.exportLabel].toLowerCase()})` : undefined,
    hideable: c.hideable !== false,
  })) },
]

export default function ContenidoExtraPage() {
  const { isAdmin } = useAuth()
  const { rows, meses, loading, addRow, updateRow, deleteRow, deleteMes, generarNuevoMes } = useContenidoExtra()
  const { headers, labelFor: headerLabel, saveHeaders } = useContenidoExtraHeaders()
  const tabla = useTablaLayout('contenido_extra')
  const labelFor = key => (key === 'group_otros' ? (headers.group_otros || 'OTROS') : headerLabel(key))

  // Columnas visibles en orden, agrupadas (incluye columnas propias)
  const visibleCols = []
  GROUP_ORDER.forEach(g => {
    BASE_COLUMNS.filter(c => c.group === g && !tabla.isHidden(c.key)).forEach(c => visibleCols.push({ ...c, label: labelFor(c.key) }))
    tabla.customIn(g).filter(c => !tabla.isHidden(c.id)).forEach(c => visibleCols.push({ key: c.id, group: g === 'final' ? 'group_otros' : g, custom: c, label: c.label, width: 16 }))
  })
  const groupRuns = []
  visibleCols.forEach(c => {
    const last = groupRuns[groupRuns.length - 1]
    if (last && last.group === c.group) last.span += 1
    else groupRuns.push({ group: c.group, span: 1 })
  })
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

  // Filtros por Tipo (formato) y Cliente
  const [fTipo, setFTipo] = useState('')
  const [fCliente, setFCliente] = useState('')
  const [pinned, setPinned] = useState(() => new Set()) // filas editadas que no desaparecen mientras se escribe

  function changeFilter(setter, value) {
    setter(value)
    setPinned(new Set())
  }

  const patch = useCallback((id, field) => (val) => {
    if (field === 'cliente' || field === 'formato') setPinned(p => new Set(p).add(id))
    return updateRow(id, { [field]: val })
  }, [updateRow])

  const norm = v => (v || '').trim().toLowerCase()
  const rowsOfMes = rows.filter(r => r.mes === activeMes)
  const clienteOptions = [...new Map(
    rowsOfMes.filter(r => norm(r.cliente)).map(r => [norm(r.cliente), r.cliente.trim()])
  ).values()].sort((a, b) => a.localeCompare(b, 'es'))
  const rowsForMes = rowsOfMes.filter(r =>
    pinned.has(r.id) ||
    ((!fTipo || r.formato === fTipo) && (!fCliente || norm(r.cliente) === norm(fCliente)))
  )
  const filtering = !!(fTipo || fCliente)

  // Descarga en Excel: todo el mes, o solo lo que se ve cuando hay filtro activo
  function handleDownload() {
    const headersX = visibleCols.map(c => c.exportLabel ? `${labelFor(c.exportLabel)} (check)` : c.label)
    const valueOf = (c, r) => {
      if (c.custom) return customValueText(c.custom.tipo, r.extra?.[c.custom.id])
      if (c.key === 'col_cliente') return r.cliente
      if (c.opts) return optLabel(c.opts, r[c.field])
      if (c.kind === 'date') return fmtDay(r[c.field])
      if (c.kind === 'check') return r[c.field] ? 'Sí' : ''
      return r[c.field]
    }
    const data = rowsForMes.map(r => visibleCols.map(c => valueOf(c, r)))
    const sufijo = filtering ? '-filtrado' : ''
    downloadXlsx(`contenido-extra-${activeMes}${sufijo}.xlsx`, {
      sheetName: mesKeyToLabel(activeMes),
      headers: headersX,
      rows: data,
      widths: visibleCols.map(c => c.width || 14),
    })
  }

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
        <button className="btn btn-primary" onClick={() => addRow(activeMes, { formato: fTipo || null, cliente: fCliente || '' })}>+ Nueva fila</button>
        {isAdmin && (
          <button className={styles.editHeadersBtn} onClick={() => setShowEditHeaders(true)}>
            ✏️ Editar tabla
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

      <div className={styles.filterBar}>
        <span className={styles.filterLabel}>Filtro</span>
        <select className={styles.filterSelect} value={fTipo} onChange={e => changeFilter(setFTipo, e.target.value)}>
          <option value="">Tipo: todos</option>
          {FORMATO_OPTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <select className={styles.filterSelect} value={fCliente} onChange={e => changeFilter(setFCliente, e.target.value)}>
          <option value="">Clientes: todos</option>
          {clienteOptions.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <button className={styles.downloadBtn} onClick={handleDownload} disabled={rowsForMes.length === 0} title={filtering ? 'Descarga solo las filas que se ven con el filtro' : 'Descarga todas las filas del mes'}>
          ⬇ {filtering ? `Descargar filtro (${rowsForMes.length})` : `Descargar todo (${rowsForMes.length})`}
        </button>
        {filtering && (
          <>
            <button className={styles.filterClear} onClick={() => { setFTipo(''); setFCliente(''); setPinned(new Set()) }}>Limpiar filtro</button>
            <span className={styles.filterCount}>{rowsForMes.length} de {rowsOfMes.length} filas</span>
          </>
        )}
      </div>

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              {groupRuns.map((g, i) => (
                <th key={i} className={styles.groupHeader} colSpan={g.span}>
                  {g.group.startsWith('none') ? '' : labelFor(g.group)}
                </th>
              ))}
            </tr>
            <tr>
              {visibleCols.map(c => (
                <th key={c.key} className={`${styles.colHeader} ${c.key === 'col_cliente' ? styles.stickyColHead : ''}`}>{c.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rowsForMes.length === 0 && (
              <tr><td className={styles.emptyRow} colSpan={visibleCols.length}>{filtering ? 'Ninguna fila coincide con el filtro.' : 'No hay filas todavía en este mes. Usa "+ Nueva fila" para empezar.'}</td></tr>
            )}
            {rowsForMes.map(row => (
              <tr key={row.id} className={styles.row}>
                {visibleCols.map(c => {
                  if (c.key === 'col_cliente') {
                    return (
                      <td key={c.key} className={`${styles.cell} ${styles.stickyCol}`}>
                        <div className={styles.clientCellWrap}>
                          <TextCell value={row.cliente} placeholder="Cliente" onChange={patch(row.id, 'cliente')} />
                          <button className={styles.deleteBtn} title="Eliminar fila" onClick={() => handleDelete(row.id)}>
                            {confirmDeleteId === row.id ? '✓' : <TrashIcon />}
                          </button>
                        </div>
                      </td>
                    )
                  }
                  if (c.custom) {
                    return (
                      <td key={c.key} className={c.custom.tipo === 'check' ? styles.cellCheck : styles.cell}>
                        <CustomCell
                          tipo={c.custom.tipo}
                          value={row.extra?.[c.custom.id]}
                          inputClassName={styles.cellInput}
                          checkClassName={styles.checkbox}
                          onCommit={v => updateRow(row.id, { extra: { ...(row.extra || {}), [c.custom.id]: v } })}
                        />
                      </td>
                    )
                  }
                  if (c.opts) return <td key={c.key} className={styles.cell}><SelectCell value={row[c.field]} options={c.opts} onChange={patch(row.id, c.field)} /></td>
                  if (c.kind === 'date') return <td key={c.key} className={styles.cell}><DateCell value={row[c.field]} onChange={patch(row.id, c.field)} /></td>
                  if (c.kind === 'check') return <td key={c.key} className={styles.cellCheck}><CheckCell checked={row[c.field]} onChange={patch(row.id, c.field)} /></td>
                  if (c.kind === 'textarea') return <td key={c.key} className={styles.cellWide}><TextCell value={row[c.field]} placeholder={c.placeholder} multiline onChange={patch(row.id, c.field)} /></td>
                  if (c.kind === 'link') {
                    return (
                      <td key={c.key} className={styles.cell}>
                        {row.link ? (
                          <div className={styles.linkCellWrap}>
                            <a className={styles.linkChip} href={row.link} target="_blank" rel="noreferrer" title={row.link}>🔗 Extras</a>
                            <TextCell value={row.link} placeholder="URL" onChange={patch(row.id, 'link')} />
                          </div>
                        ) : (
                          <TextCell value={row.link} placeholder="Pegar link" onChange={patch(row.id, 'link')} />
                        )}
                      </td>
                    )
                  }
                  return <td key={c.key} className={styles.cell}><TextCell value={row[c.field]} placeholder={c.placeholder} onChange={patch(row.id, c.field)} /></td>
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showEditHeaders && (
        <TablaLayoutModal
          title="Editar tabla · Contenido Extra"
          sections={LAYOUT_SECTIONS}
          customGroups={CUSTOM_GROUPS}
          layout={tabla.layout}
          labelsOverride={Object.fromEntries(LAYOUT_SECTIONS.flatMap(sec => sec.items.map(it => [it.key, headers[it.key] ?? ''])))}
          onSaveLabels={saveHeaders}
          onSave={tabla.saveLayout}
          onClose={() => setShowEditHeaders(false)}
        />
      )}
    </div>
  )
}

function TrashIcon() { return <svg width="13" height="13" viewBox="0 0 16 16" fill="none"><path d="M2 4h12M5 4V3h6v1M6 7v5M10 7v5M3 4l1 9h8l1-9" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/></svg> }
function CloseIcon() { return <svg width="9" height="9" viewBox="0 0 16 16" fill="none"><path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg> }
