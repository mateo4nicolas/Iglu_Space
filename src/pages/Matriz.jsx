import { useState } from 'react'
import { useMatriz } from '../hooks/useMatriz'
import { useAuth } from '../context/AuthContext'
import TaskModal from '../components/tasks/TaskModal'
import { cycleLabel, currentMesBase, shiftMesBase } from '../utils/cycleLabel'
import styles from './Matriz.module.css'

const PERIODS = [
  { value: '1_31',  label: 'Ciclo 1 al 31' },
  { value: '15_14', label: 'Ciclo 15 al 14' },
]

function slugify(str) {
  return str
    .trim().toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

function textColorFor(bgHex) {
  if (!bgHex || bgHex[0] !== '#' || bgHex.length !== 7) return '#fff'
  const r = parseInt(bgHex.slice(1, 3), 16)
  const g = parseInt(bgHex.slice(3, 5), 16)
  const b = parseInt(bgHex.slice(5, 7), 16)
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  return lum > 0.62 ? '#14161b' : '#ffffff'
}

export default function MatrizPage() {
  const { isAdmin } = useAuth()
  const {
    loading,
    departments,
    matrizColumns,
    activeMatrizColumns,
    clientsByPeriod,
    taskFor,
    columnsForDept,
    updateTask,
    approveTask,
    deleteTask,
    toggleTablaProductos,
    saveMatrizColumn,
    deleteMatrizColumn,
    generarProximoMes,
  } = useMatriz()

  const [period, setPeriod] = useState(PERIODS[0].value)
  const [selectedTask, setSelectedTask] = useState(null)
  const [showColSettings, setShowColSettings] = useState(false)
  const [mesAno, setMesAno] = useState(currentMesBase())
  const [generatingId, setGeneratingId] = useState(null)

  const rows = clientsByPeriod(period)

  async function handleGenerarProximoMes(client) {
    const cicloActual = cycleLabel(mesAno, period)
    const proximoMes = shiftMesBase(mesAno, 1)
    const cicloProximo = cycleLabel(proximoMes, period)
    if (!confirm(`¿Generar las tareas del próximo ciclo para "${client.brand_name}"?\n\nCiclo actual: ${cicloActual}\nNuevo ciclo: ${cicloProximo}\n\nSe crearán automáticamente en la Vista Clientes, sin afectar las tareas actuales.`)) return
    setGeneratingId(client.id)
    const { data, error } = await generarProximoMes(client.id, mesAno)
    setGeneratingId(null)
    if (error) {
      alert('No se pudo generar el próximo mes: ' + (error.message || 'Error desconocido'))
    } else {
      alert(`Se generaron ${data ?? 0} tareas nuevas para ${client.brand_name} (${cicloProximo}).`)
    }
  }

  if (loading) return <div className={styles.loading}>Cargando matriz...</div>

  return (
    <div className={styles.page}>
      <div className={styles.topbar}>
        <div>
          <h1 className={styles.pageTitle}>Matriz de Control</h1>
          <p className={styles.pageSubtitle}>Estado en tiempo real de entregables por cliente</p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <div className={styles.monthNav}>
            <button className={styles.monthNavBtn} onClick={() => setMesAno(m => shiftMesBase(m, -1))} aria-label="Mes anterior">
              <ChevronLeftIcon />
            </button>
            <span className={styles.monthNavLabel}>{cycleLabel(mesAno, period)}</span>
            <button className={styles.monthNavBtn} onClick={() => setMesAno(m => shiftMesBase(m, 1))} aria-label="Mes siguiente">
              <ChevronRightIcon />
            </button>
          </div>
          {isAdmin && (
            <button className="btn btn-ghost" onClick={() => setShowColSettings(true)}>
              <SettingsIcon /> Columnas
            </button>
          )}
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
            <span className={styles.tabCount}>{clientsByPeriod(p.value).length}</span>
          </button>
        ))}
      </div>

      {rows.length === 0 ? (
        <div className={styles.empty}>No hay clientes activos en este ciclo</div>
      ) : activeMatrizColumns.length === 0 ? (
        <div className={styles.empty}>
          No hay columnas de entregables configuradas.
          {isAdmin && <><br /><button className="btn btn-primary" style={{ marginTop: 10 }} onClick={() => setShowColSettings(true)}>Configurar columnas</button></>}
        </div>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th className={styles.cornerCell}>Cliente</th>
                <th className={styles.colHeader} style={{ minWidth: 90 }}>Tabla de productos</th>
                {activeMatrizColumns.map(col => (
                  <th key={col.id} className={styles.colHeader}>{col.label}</th>
                ))}
                {isAdmin && <th className={styles.colHeader}>Próximo mes</th>}
              </tr>
            </thead>
            <tbody>
              {rows.map(client => (
                <tr key={client.id}>
                  <td className={styles.rowHeader}>
                    <span className={styles.clientDot}>{client.brand_name[0]?.toUpperCase()}</span>
                    {client.brand_name}
                  </td>
                  <td className={styles.cell}>
                    <div className={styles.checkboxWrap}>
                      <input
                        type="checkbox"
                        className={styles.checkboxSquare}
                        checked={!!client.tabla_productos}
                        onChange={() => toggleTablaProductos(client.id)}
                        title="Tabla de productos"
                      />
                    </div>
                  </td>
                  {activeMatrizColumns.map(col => {
                    const task = taskFor(client.id, col.value, mesAno)
                    return (
                      <MatrizCell
                        key={col.value}
                        task={task}
                        onClick={() => task && setSelectedTask(task)}
                      />
                    )
                  })}
                  {isAdmin && (
                    <td className={styles.cell}>
                      <button
                        className={styles.closeMonthBtn}
                        onClick={() => handleGenerarProximoMes(client)}
                        disabled={generatingId === client.id}
                      >
                        {generatingId === client.id ? 'Generando...' : 'Generar Próximo Mes'}
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className={styles.legend}>
        <span className={styles.legendItem}><span className={styles.legendSwatch} style={{ background: 'var(--bg-hover)', border: '1px dashed var(--border)' }} />Sin tarea</span>
        <span className={styles.legendItem}><span className={styles.legendSwatch} style={{ background: 'var(--text-muted)' }} />FIN</span>
        <span className={styles.legendItem}>Cada celda toma el color exacto del estado (columna) actual de la tarea</span>
      </div>

      {selectedTask && (
        <TaskModal
          task={selectedTask}
          columns={columnsForDept(selectedTask.department_id)}
          onClose={() => setSelectedTask(null)}
          onUpdate={async (id, data) => { await updateTask(id, data); setSelectedTask(null) }}
          onApprove={async (id, approved) => { await approveTask(id, approved); setSelectedTask(null) }}
          onDelete={async (id) => { await deleteTask(id) }}
        />
      )}

      {isAdmin && showColSettings && (
        <ColumnasMatrizModal
          columns={matrizColumns}
          departments={departments}
          onSave={saveMatrizColumn}
          onDelete={deleteMatrizColumn}
          onClose={() => setShowColSettings(false)}
        />
      )}
    </div>
  )
}

function MatrizCell({ task, onClick }) {
  if (!task || !task.column_id) {
    return (
      <td className={styles.cell}>
        {task ? (
          <button className={styles.emptyCellBtn} onClick={onClick} title={`${task.title} — Por Distribuir`}>—</button>
        ) : (
          <span className={styles.emptyCell}>—</span>
        )}
      </td>
    )
  }

  if (task.is_finished) {
    return (
      <td className={styles.cell}>
        <button className={`${styles.cellBtn} ${styles.cellFin}`} onClick={onClick} title={task.title}>
          FIN
        </button>
      </td>
    )
  }

  const bg = task.kanban_columns?.color || 'var(--bg-hover)'
  const fg = textColorFor(task.kanban_columns?.color)

  return (
    <td className={styles.cell}>
      <button className={styles.cellBtn} style={{ background: bg, color: fg }} onClick={onClick} title={task.title}>
        {task.kanban_columns?.title || 'Sin estado'}
      </button>
    </td>
  )
}

// ── Gestión de columnas dinámicas ───────────────────────────────────────────
function ColumnasMatrizModal({ columns, departments, onSave, onDelete, onClose }) {
  const [rows, setRows] = useState(columns.map(c => ({ ...c })))
  const [newLabel, setNewLabel] = useState('')
  const [newDept, setNewDept] = useState('')
  const [savingId, setSavingId] = useState(null)

  function updateRow(id, patch) {
    setRows(prev => prev.map(r => (r.id === id ? { ...r, ...patch } : r)))
  }

  async function persist(row) {
    setSavingId(row.id || 'new')
    await onSave(row)
    setSavingId(null)
  }

  async function handleAdd() {
    if (!newLabel.trim()) return
    const value = slugify(newLabel)
    if (!value) return
    setSavingId('new')
    await onSave({ label: newLabel.trim(), value, department_id: newDept || null, position: rows.length })
    setSavingId(null)
    setNewLabel('')
    setNewDept('')
  }

  async function handleDelete(id) {
    if (!confirm('¿Eliminar esta columna de la matriz? Las tareas ya creadas conservarán su entregable pero dejarán de mostrarse en la matriz.')) return
    await onDelete(id)
    setRows(prev => prev.filter(r => r.id !== id))
  }

  return (
    <div className={styles.overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className={styles.modal}>
        <div className={styles.modalHeader}>
          <h2>Columnas de la Matriz</h2>
          <button className={styles.closeBtn} onClick={onClose}><CloseIcon /></button>
        </div>
        <div className={styles.modalForm}>
          <div className={styles.colSettingsList}>
            {rows.length === 0 && <p className={styles.noClients}>Aún no hay columnas configuradas</p>}
            {rows.map(row => (
              <div key={row.id} className={styles.colSettingsRow}>
                <input
                  className={styles.input}
                  value={row.label}
                  onChange={e => updateRow(row.id, { label: e.target.value })}
                  onBlur={() => persist(rows.find(r => r.id === row.id))}
                />
                <select
                  className={styles.input}
                  value={row.department_id || ''}
                  onChange={e => {
                    const v = e.target.value || null
                    updateRow(row.id, { department_id: v })
                    persist({ ...row, department_id: v })
                  }}
                >
                  <option value="">Sin depto.</option>
                  {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
                <button
                  className={`${styles.toggleBtn} ${row.is_active ? styles.toggleBtnActive : ''}`}
                  onClick={() => { const v = !row.is_active; updateRow(row.id, { is_active: v }); persist({ ...row, is_active: v }) }}
                  disabled={savingId === row.id}
                >
                  {row.is_active ? 'Activa' : 'Inactiva'}
                </button>
                <button className={styles.iconBtn} style={{ color: 'var(--danger)' }} onClick={() => handleDelete(row.id)}>
                  <TrashIcon />
                </button>
              </div>
            ))}
          </div>

          <div className={styles.addColRow}>
            <input
              className={styles.input}
              placeholder="Nueva columna, ej. Guiones"
              value={newLabel}
              onChange={e => setNewLabel(e.target.value)}
            />
            <select className={styles.input} value={newDept} onChange={e => setNewDept(e.target.value)}>
              <option value="">Sin depto.</option>
              {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
            <button className="btn btn-primary" onClick={handleAdd} disabled={savingId === 'new' || !newLabel.trim()}>
              Añadir
            </button>
          </div>
          <p className={styles.hint}>
            Vincula una columna a un departamento para que sus tareas nuevas se creen en el tablero de ese departamento (columna inicial). Sin departamento, la tarea se crea sin estado asignado.
          </p>
        </div>
        <div className={styles.modalFooter}>
          <button className="btn btn-ghost" onClick={onClose}>Cerrar</button>
        </div>
      </div>
    </div>
  )
}

function SettingsIcon() { return <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="2.5" stroke="currentColor" strokeWidth="1.3"/><path d="M8 1v2M8 13v2M1 8h2M13 8h2M3.05 3.05l1.41 1.41M11.54 11.54l1.41 1.41M3.05 12.95l1.41-1.41M11.54 4.46l1.41-1.41" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg> }
function ChevronLeftIcon()  { return <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M10 3L5 8l5 5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg> }
function ChevronRightIcon() { return <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M6 3l5 5-5 5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg> }
function CloseIcon()    { return <svg width="15" height="15" viewBox="0 0 16 16" fill="none"><path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg> }
function TrashIcon()    { return <svg width="13" height="13" viewBox="0 0 16 16" fill="none"><path d="M2 4h12M5 4V3h6v1M6 7v5M10 7v5M3 4l1 9h8l1-9" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/></svg> }
