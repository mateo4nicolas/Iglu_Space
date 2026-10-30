import { useState, useEffect, useRef } from 'react'
import { useSeguimientoPauta } from '../hooks/useSeguimientoPauta'
import { cycleLabel, currentMesBase, shiftMesBase } from '../utils/cycleLabel'
import NewClientBadge from '../components/ui/NewClientBadge'
import styles from './SeguimientoPauta.module.css'

const PERIODS = [
  { value: '1_31', label: 'Clientes del 1' },
  { value: '15_14', label: 'Clientes del 15' },
]
const WEEKS = ['1', '2', '3', '4']
const CREATIVOS = [0, 1, 2]

function toNum(v) {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}
function fmtMoney(n) {
  return '$' + toNum(n).toLocaleString('es-EC', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
function normalizeUrl(v) {
  const t = (v || '').trim()
  if (!t) return ''
  return /^https?:\/\//i.test(t) ? t : `https://${t}`
}

export default function SeguimientoPautaPage() {
  const {
    loading, clientsFor, rowFor, saveRow,
    informeCols, addInformeCol, renameInformeCol, deleteInformeCol,
  } = useSeguimientoPauta()
  const [period, setPeriod] = useState(PERIODS[0].value)
  const [mes, setMes] = useState(currentMesBase())
  const [addingCol, setAddingCol] = useState(false)
  const [newColTitle, setNewColTitle] = useState('')
  const addingRef = useRef(false)

  if (loading) return <div className={styles.loading}>Cargando seguimiento de pauta...</div>

  const clients = clientsFor(period, mes)

  function weekTotal(w) {
    return clients.reduce((acc, c) => acc + toNum(rowFor(c.id, mes)?.semanas?.[w]?.valor), 0)
  }
  function rowTotal(row) {
    return WEEKS.reduce((acc, w) => acc + toNum(row?.semanas?.[w]?.valor), 0)
  }

  async function submitNewCol(e) {
    e?.preventDefault?.()
    if (addingRef.current) return
    if (!newColTitle.trim()) { setAddingCol(false); return }
    addingRef.current = true
    await addInformeCol(newColTitle)
    addingRef.current = false
    setNewColTitle('')
    setAddingCol(false)
  }

  return (
    <div className={styles.page}>
      <div className={styles.topbar}>
        <div>
          <h1 className={styles.pageTitle}>Seguimiento Pauta</h1>
          <p className={styles.pageSubtitle}>Panel de gestión de clientes: ventas semanales, creativos ganadores, vectores e informes</p>
        </div>
        <div className={styles.monthNav}>
          <button className={styles.monthNavBtn} onClick={() => setMes(m => shiftMesBase(m, -1))} aria-label="Mes anterior">‹</button>
          <span className={styles.monthNavLabel}>{cycleLabel(mes, period)}</span>
          <button className={styles.monthNavBtn} onClick={() => setMes(m => shiftMesBase(m, 1))} aria-label="Mes siguiente">›</button>
        </div>
      </div>

      <div className={styles.tabs}>
        {PERIODS.map(p => (
          <button
            key={p.value}
            className={`${styles.tab} ${period === p.value ? styles.tabActive : ''}`}
            onClick={() => setPeriod(p.value)}
          >
            {p.label}
            <span className={styles.tabCount}>{clientsFor(p.value, mes).length}</span>
          </button>
        ))}
      </div>

      {clients.length === 0 ? (
        <div className={styles.empty}>No hay clientes activos en este ciclo (se toman de la Matriz de Control).</div>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr className={styles.groupRow}>
                <th className={`${styles.stickyCol} ${styles.groupCell}`} rowSpan={2}>Cliente</th>
                <th className={`${styles.groupCell} ${styles.gVentas}`} colSpan={WEEKS.length + 1}>Registro de ventas semanales</th>
                <th className={`${styles.groupCell} ${styles.gCreativos}`} colSpan={CREATIVOS.length}>Creativos ganadores</th>
                <th className={`${styles.groupCell} ${styles.gVectores}`} colSpan={2}>Vectores y métricas</th>
                <th className={`${styles.groupCell} ${styles.gInformes}`} colSpan={informeCols.length + 1}>Informes y seguimiento operativo</th>
              </tr>
              <tr>
                {WEEKS.map(w => <th key={w} className={styles.colWeek}>Semana {w}</th>)}
                <th className={styles.colTotal}>Total ventas</th>
                {CREATIVOS.map(i => <th key={i} className={styles.colCreativo}>Creativo ganador {i + 1}</th>)}
                <th className={styles.colAvatar}>Avatar y ángulo</th>
                <th className={styles.colCosto}>Costo por resultado</th>
                {informeCols.map(col => (
                  <InformeHeader
                    key={col.id}
                    col={col}
                    onRename={t => renameInformeCol(col.id, t)}
                    onDelete={() => {
                      if (window.confirm(`¿Quitar la columna "${col.titulo}"? Se ocultarán sus links en todos los clientes.`)) deleteInformeCol(col.id)
                    }}
                  />
                ))}
                <th className={styles.colAdd}>
                  {addingCol ? (
                    <form onSubmit={submitNewCol} className={styles.addColForm}>
                      <input
                        className={styles.headerInput}
                        placeholder="Título del informe"
                        value={newColTitle}
                        onChange={e => setNewColTitle(e.target.value)}
                        onBlur={submitNewCol}
                        autoFocus
                      />
                    </form>
                  ) : (
                    <button className={styles.addColBtn} onClick={() => setAddingCol(true)} title="Añadir otra columna de informe">+ Informe</button>
                  )}
                </th>
              </tr>
            </thead>
            <tbody>
              {clients.map(client => {
                const row = rowFor(client.id, mes)
                const save = patch => saveRow(client.id, mes, patch)
                const semanas = row?.semanas || {}
                const creativos = row?.creativos || []
                const informes = row?.informes || {}
                return (
                  <tr key={client.id}>
                    <td className={`${styles.stickyCol} ${styles.clientCell}`}>
                      {client.brand_name}
                      <NewClientBadge client={client} mes={mes} />
                    </td>
                    {WEEKS.map(w => (
                      <td key={w} className={styles.colWeek}>
                        <MoneyNoteCell
                          valor={semanas[w]?.valor}
                          nota={semanas[w]?.nota}
                          onCommit={val => save({ semanas: { ...semanas, [w]: { ...(semanas[w] || {}), ...val } } })}
                        />
                      </td>
                    ))}
                    <td className={`${styles.colTotal} ${styles.totalCell}`}>{fmtMoney(rowTotal(row))}</td>
                    {CREATIVOS.map(i => (
                      <td key={i} className={styles.colCreativo}>
                        <LinkCell
                          withText
                          url={creativos[i]?.url}
                          texto={creativos[i]?.texto}
                          emptyLabel="+ Creativo"
                          onCommit={val => {
                            const next = [...creativos]
                            while (next.length <= i) next.push({})
                            next[i] = val
                            save({ creativos: next })
                          }}
                        />
                      </td>
                    ))}
                    <td className={styles.colAvatar}>
                      <TextCell value={row?.avatar_angulo || ''} placeholder="Avatar y ángulo..." onCommit={v => save({ avatar_angulo: v || null })} />
                    </td>
                    <td className={styles.colCosto}>
                      <MoneyInput value={row?.costo_resultado} onCommit={v => save({ costo_resultado: v })} />
                    </td>
                    {informeCols.map(col => (
                      <td key={col.id} className={styles.colInforme}>
                        <LinkCell
                          url={informes[col.id]}
                          emptyLabel="+ Link"
                          linkLabel="Ver informe"
                          onCommit={val => save({ informes: { ...informes, [col.id]: val.url || null } })}
                        />
                      </td>
                    ))}
                    <td className={styles.colAdd} />
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr>
                <td className={`${styles.stickyCol} ${styles.footLabel}`}>Total</td>
                {WEEKS.map(w => <td key={w} className={styles.footCell}>{fmtMoney(weekTotal(w))}</td>)}
                <td className={`${styles.footCell} ${styles.footGrand}`}>{fmtMoney(WEEKS.reduce((a, w) => a + weekTotal(w), 0))}</td>
                <td colSpan={CREATIVOS.length + 2 + informeCols.length + 1} />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  )
}

// ── Encabezado editable de una columna de informe ───────────────────────────
function InformeHeader({ col, onRename, onDelete }) {
  const [editing, setEditing] = useState(false)
  const [title, setTitle] = useState(col.titulo)
  useEffect(() => { setTitle(col.titulo) }, [col.titulo])

  function commit() {
    setEditing(false)
    if (title.trim() && title.trim() !== col.titulo) onRename(title)
    else setTitle(col.titulo)
  }

  return (
    <th className={styles.colInforme}>
      {editing ? (
        <input
          className={styles.headerInput}
          value={title}
          onChange={e => setTitle(e.target.value)}
          onBlur={commit}
          onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') { setTitle(col.titulo); setEditing(false) } }}
          autoFocus
        />
      ) : (
        <div className={styles.informeHead}>
          <span className={styles.informeTitle} onClick={() => setEditing(true)} title="Clic para cambiar el título">{col.titulo}</span>
          <button className={styles.headDel} onClick={onDelete} title="Quitar columna">✕</button>
        </div>
      )}
    </th>
  )
}

// ── Celdas ──────────────────────────────────────────────────────────────────
function MoneyInput({ value, onCommit }) {
  const [v, setV] = useState(value ?? '')
  useEffect(() => { setV(value ?? '') }, [value])
  function commit() {
    const next = v === '' || v === null ? null : Number(v)
    const prev = value === '' || value === undefined ? null : value
    if (next !== prev && !(Number.isNaN(next))) onCommit(next)
  }
  return (
    <div className={styles.moneyWrap}>
      <span className={styles.moneyPrefix}>$</span>
      <input
        type="number"
        step="any"
        min={0}
        className={styles.moneyInput}
        value={v}
        placeholder="0.00"
        onChange={e => setV(e.target.value)}
        onBlur={commit}
        onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }}
      />
    </div>
  )
}

function MoneyNoteCell({ valor, nota, onCommit }) {
  const [n, setN] = useState(nota || '')
  useEffect(() => { setN(nota || '') }, [nota])
  return (
    <div className={styles.weekCell}>
      <MoneyInput value={valor} onCommit={v => onCommit({ valor: v })} />
      <textarea
        className={styles.noteInput}
        rows={2}
        placeholder="Nota..."
        value={n}
        onChange={e => setN(e.target.value)}
        onBlur={() => { if (n !== (nota || '')) onCommit({ nota: n || null }) }}
      />
    </div>
  )
}

function TextCell({ value, placeholder, onCommit }) {
  const [v, setV] = useState(value)
  useEffect(() => { setV(value) }, [value])
  return (
    <textarea
      className={styles.textInput}
      rows={3}
      placeholder={placeholder}
      value={v}
      onChange={e => setV(e.target.value)}
      onBlur={() => { if (v !== value) onCommit(v.trim()) }}
    />
  )
}

function LinkCell({ url, texto, withText, emptyLabel, linkLabel = 'Ver enlace', onCommit }) {
  const [editing, setEditing] = useState(false)
  const [u, setU] = useState(url || '')
  const [t, setT] = useState(texto || '')

  function open() { setU(url || ''); setT(texto || ''); setEditing(true) }
  function save() {
    const cleanUrl = normalizeUrl(u)
    onCommit(withText ? { url: cleanUrl || null, texto: t.trim() || null } : { url: cleanUrl || null })
    setEditing(false)
  }
  function clear() {
    onCommit(withText ? { url: null, texto: null } : { url: null })
    setEditing(false)
  }

  if (editing) {
    return (
      <div className={styles.linkEdit}>
        {withText && (
          <input className={styles.linkInput} placeholder="Nombre" value={t} onChange={e => setT(e.target.value)} autoFocus />
        )}
        <input
          className={styles.linkInput}
          placeholder="https://..."
          value={u}
          onChange={e => setU(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setEditing(false) }}
          autoFocus={!withText}
        />
        <div className={styles.linkEditActions}>
          <button className={styles.linkSave} onClick={save}>Guardar</button>
          <button className={styles.linkCancel} onClick={() => setEditing(false)}>Cancelar</button>
          {(url || texto) && <button className={styles.linkClear} onClick={clear} title="Quitar">Quitar</button>}
        </div>
      </div>
    )
  }

  if (!url && !texto) {
    return <button className={styles.linkEmpty} onClick={open}>{emptyLabel}</button>
  }

  return (
    <div className={styles.linkView}>
      {url ? (
        <a href={url} target="_blank" rel="noopener noreferrer" className={styles.linkChip} title={url}>
          🔗 {texto || linkLabel}
        </a>
      ) : (
        <span className={styles.linkChipMuted}>{texto}</span>
      )}
      <button className={styles.linkEditBtn} onClick={open} title="Editar">✎</button>
    </div>
  )
}
