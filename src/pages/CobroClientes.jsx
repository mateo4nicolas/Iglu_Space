import { useState, useRef, useEffect } from 'react'
import { useCobroClientes, PAUTA_METODOS } from '../hooks/useCobroClientes'
import { cycleLabel, currentMesBase, shiftMesBase } from '../utils/cycleLabel'
import styles from './CobroClientes.module.css'

// El cobro se sigue en un solo ciclo (15 a 14 de cada mes) para todos los
// clientes, sin distinguir su billing_period de servicio.
const COBRO_PERIOD = '15_14'

function fmtMoney(n) {
  return (Number(n) || 0).toLocaleString('es-EC', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
}
function toDateInputValue(iso) {
  if (!iso) return ''
  return String(iso).slice(0, 10)
}

// Buffer local: nunca pierde lo que la persona está escribiendo aunque llegue
// una actualización en vivo mientras tanto.
function BufferedField({ value, onCommit, className, placeholder, type = 'text', debounceMs = 550 }) {
  const [val, setVal] = useState(value ?? '')
  const editingRef = useRef(false)
  const timerRef = useRef(null)
  const lastRemoteRef = useRef(value ?? '')

  useEffect(() => {
    if (!editingRef.current && value !== lastRemoteRef.current) {
      lastRemoteRef.current = value ?? ''
      setVal(value ?? '')
    } else {
      lastRemoteRef.current = value ?? ''
    }
  }, [value])

  function handleChange(e) {
    const v = e.target.value
    editingRef.current = true
    setVal(v)
    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => { editingRef.current = false; onCommit(v) }, debounceMs)
  }
  function handleBlur() {
    clearTimeout(timerRef.current)
    editingRef.current = false
    onCommit(val)
  }

  return <input type={type} className={className} placeholder={placeholder} value={val} onChange={handleChange} onBlur={handleBlur} />
}

export default function CobroClientesPage() {
  const {
    loading, allActiveClients, rowFor, saveRow, meta, saveMeta, totalAgenciaMes, pctForMes,
  } = useCobroClientes()

  const [mesAno, setMesAno] = useState(currentMesBase())
  const [editingMeta, setEditingMeta] = useState(false)
  const [metaDraft, setMetaDraft] = useState(meta)

  useEffect(() => { setMetaDraft(meta) }, [meta])

  if (loading) return <div className={styles.loading}>Cargando cobro de clientes...</div>

  const visibleClients = allActiveClients(mesAno)
  const pct = pctForMes(mesAno)
  const missing = Math.max(0, meta - totalAgenciaMes(mesAno))

  function handleSaveMeta() {
    const n = Number(metaDraft)
    if (!Number.isFinite(n) || n <= 0) return
    saveMeta(n)
    setEditingMeta(false)
  }

  return (
    <div className={styles.page}>
      <div className={styles.topbar}>
        <div>
          <h1 className={styles.pageTitle}>Cobro Clientes</h1>
          <p className={styles.pageSubtitle}>Seguimiento de pagos por cliente del 15 al 14 de cada mes, conectado con Matriz de Control</p>
        </div>
        <div className={styles.monthNav}>
          <button className={styles.monthNavBtn} onClick={() => setMesAno(m => shiftMesBase(m, -1))} aria-label="Mes anterior"><ChevronLeftIcon /></button>
          <span className={styles.monthNavLabel}>{cycleLabel(mesAno, COBRO_PERIOD)}</span>
          <button className={styles.monthNavBtn} onClick={() => setMesAno(m => shiftMesBase(m, 1))} aria-label="Mes siguiente"><ChevronRightIcon /></button>
        </div>
      </div>

      <div className={styles.metaCard}>
        <div className={styles.metaTop}>
          <div className={styles.metaAmounts}>
            <span className={styles.metaCollected}>{fmtMoney(totalAgenciaMes(mesAno))}</span>
            <span className={styles.metaGoal}>de {fmtMoney(meta)} de meta</span>
            <button className={styles.editMetaBtn} onClick={() => setEditingMeta(v => !v)} title="Editar meta"><GearIcon /></button>
          </div>
          <div className={styles.metaRight}>
            <span>{pct}%</span>
            <span>·</span>
            <span>Falta <span className={styles.metaMissing}>{fmtMoney(missing)}</span></span>
          </div>
        </div>
        <div className={styles.metaBarTrack}>
          <div className={`${styles.metaBarFill} ${pct >= 100 ? styles.metaBarFillDone : ''}`} style={{ width: `${Math.min(100, pct)}%` }} />
        </div>
        {editingMeta && (
          <div className={styles.metaEditRow}>
            <input type="number" min={0} className={styles.metaEditInput} value={metaDraft} onChange={e => setMetaDraft(e.target.value)} />
            <button className="btn btn-primary" style={{ fontSize: 12 }} onClick={handleSaveMeta}>Guardar meta</button>
            <button className="btn btn-ghost" style={{ fontSize: 12 }} onClick={() => setEditingMeta(false)}>Cancelar</button>
          </div>
        )}
      </div>

      {visibleClients.length === 0 ? (
        <div className={styles.empty}>No hay clientes activos en este ciclo (revisa "Pausar cliente" en Matriz de Control)</div>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Cliente</th>
                <th>Fecha de pago</th>
                <th className={styles.amountCell}>Pago de agencia</th>
                <th className={styles.amountCell}>Pago de pauta</th>
                <th>Pauta</th>
              </tr>
            </thead>
            <tbody>
              {visibleClients.map(c => (
                <ClientRow key={c.id} client={c} mes={mesAno} rowFor={rowFor} saveRow={saveRow} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function ClientRow({ client, mes, rowFor, saveRow }) {
  const row = rowFor(client.id, mes) || {}
  return (
    <tr>
      <td className={styles.clientCell}>{client.brand_name}</td>
      <td>
        <input
          type="date"
          className={styles.dateInput}
          value={toDateInputValue(row.fecha_pago)}
          onChange={e => saveRow(client.id, mes, { fecha_pago: e.target.value || null })}
        />
      </td>
      <td className={styles.amountCell}>
        <BufferedField
          type="number"
          className={styles.cellInput}
          placeholder="$0"
          value={row.pago_agencia ?? ''}
          onCommit={v => saveRow(client.id, mes, { pago_agencia: v === '' ? null : Number(v) })}
        />
      </td>
      <td className={styles.amountCell}>
        <BufferedField
          type="number"
          className={styles.cellInput}
          placeholder="$0"
          value={row.pago_pauta ?? ''}
          onCommit={v => saveRow(client.id, mes, { pago_pauta: v === '' ? null : Number(v) })}
        />
      </td>
      <td>
        <select
          className={styles.select}
          value={row.pauta_metodo || ''}
          onChange={e => saveRow(client.id, mes, { pauta_metodo: e.target.value || null })}
        >
          <option value="">— No aplica —</option>
          {PAUTA_METODOS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </td>
    </tr>
  )
}

function ChevronLeftIcon() { return <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M10 3L5 8l5 5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg> }
function ChevronRightIcon() { return <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M6 3l5 5-5 5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg> }
function GearIcon() { return <svg width="13" height="13" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="2.5" stroke="currentColor" strokeWidth="1.3" /><path d="M8 1v2M8 13v2M1 8h2M13 8h2M3.05 3.05l1.41 1.41M11.54 11.54l1.41 1.41M3.05 12.95l1.41-1.41M11.54 4.46l1.41-1.41" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" /></svg> }
