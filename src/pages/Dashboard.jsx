import { useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { useSchedule } from '../hooks/useSchedule'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import styles from './Dashboard.module.css'

export default function Dashboard() {
  const { profile, isAdmin } = useAuth()
  const today = new Date()
  const {
    items,
    myItems,
    itemsByUser,
    loading: schedLoading,
    toggleDone,
    updateObservation,
    isDoneByUser,
    isDoneByAll,
  } = useSchedule(today)

  const [stats, setStats] = useState({ pending: 0, inProgress: 0, done: 0 })
  const [showObsFor, setShowObsFor] = useState(null)
  const [obsText, setObsText] = useState('')

  const dateLabel = format(today, "EEEE d 'de' MMMM", { locale: es })
  const displayName = profile?.username || profile?.display_name || profile?.full_name || ''

  useEffect(() => {
    if (!profile) return
    fetchStats()
  }, [profile])

  async function fetchStats() {
    const { data } = await supabase.from('tasks').select('status').eq('approved', true)
    if (data) {
      setStats({
        pending: data.filter(t => t.status === 'pending').length,
        inProgress: data.filter(t => t.status === 'in_progress').length,
        done: data.filter(t => t.status === 'done').length,
      })
    }
  }

  function openObs(item) {
    setShowObsFor(item.id)
    setObsText(item.user_observation || '')
  }

  async function saveObs(id) {
    await updateObservation(id, obsText)
    setShowObsFor(null)
  }

  const todayItems = isAdmin ? myItems : items

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <p className={styles.date}>{dateLabel}</p>
          <h1 className={styles.title}>Hola, {displayName.split(' ')[0]} 👋</h1>
        </div>
        {isAdmin && (
          <span className="badge badge-admin" style={{ fontSize: 12 }}>Vista Admin</span>
        )}
      </div>

      {isAdmin ? (
        <div className={styles.statsGrid}>
          <StatCard label="Tareas activas" value={stats.pending + stats.inProgress} color="info" />
          <StatCard label="Mis pendientes hoy" value={todayItems.filter(i => !isDoneByAll(i)).length} color="warning" />
          <StatCard label="Completados hoy" value={todayItems.filter(i => isDoneByAll(i)).length} color="success" />
        </div>
      ) : (
        <div className={styles.statsGrid}>
          <StatCard label="Pendientes hoy" value={items.filter(i => !isDoneByUser(i, profile?.id)).length} color="warning" />
          <StatCard label="Completados hoy" value={items.filter(i => isDoneByUser(i, profile?.id)).length} color="success" />
          <StatCard label="Total hoy" value={items.length} color="info" />
        </div>
      )}

      <div className={styles.section}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>Mis pendientes de hoy</h2>
          <span className={styles.sectionCount}>{todayItems.length}</span>
        </div>

        {schedLoading ? (
          <p className={styles.empty}>Cargando...</p>
        ) : todayItems.length === 0 ? (
          <div className={styles.emptyState}><p>No hay pendientes para hoy</p></div>
        ) : (
          <div className={styles.itemList}>
            {todayItems.map(item => {
              const myDone = isDoneByUser(item, profile?.id)
              const allDone = isDoneByAll(item)
              const multiAssign = (item.assigned_to || []).length > 1
              return (
                <div key={item.id} className={`${styles.item} ${allDone ? styles.itemDone : ''}`}>
                  <button
                    className={`${styles.checkbox} ${myDone ? styles.checked : ''}`}
                    onClick={() => toggleDone(item.id, item.done_by)}
                  >
                    {myDone && <CheckIcon />}
                  </button>
                  <div className={styles.itemContent}>
                    <span className={styles.itemTitle}>{item.title}</span>
                    {item.notes && <p className={styles.itemNotes}>{item.notes}</p>}
                    {item.time_start && (
                      <span className={styles.itemTime}>
                        {item.time_start.slice(0, 5)}{item.time_end ? ` – ${item.time_end.slice(0, 5)}` : ''}
                      </span>
                    )}
                    {/* Multi-assign progress */}
                    {multiAssign && (
                      <div className={styles.assigneeChecks}>
                        {item.assignees?.map(a => (
                          <span
                            key={a.id}
                            className={`${styles.assigneeTag} ${(item.done_by || []).includes(a.id) ? styles.assigneeDone : ''}`}
                            title={(item.done_by || []).includes(a.id) ? `${a.username || a.display_name || a.full_name} ✓` : `${a.username || a.display_name || a.full_name} pendiente`}
                          >
                            {(a.username || a.display_name || a.full_name)[0].toUpperCase()}
                            {(item.done_by || []).includes(a.id) && ' ✓'}
                          </span>
                        ))}
                      </div>
                    )}
                    {showObsFor === item.id ? (
                      <div className={styles.obsBox}>
                        <textarea className={styles.obsInput} placeholder="Escribe tu observación..." value={obsText} onChange={e => setObsText(e.target.value)} rows={2} />
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button className="btn btn-primary" style={{ fontSize: 12, padding: '5px 12px' }} onClick={() => saveObs(item.id)}>Guardar</button>
                          <button className="btn btn-ghost" style={{ fontSize: 12, padding: '5px 12px' }} onClick={() => setShowObsFor(null)}>Cancelar</button>
                        </div>
                      </div>
                    ) : (
                      <div className={styles.obsRow}>
                        {item.user_observation && <p className={styles.obsPreview}>📝 {item.user_observation}</p>}
                        {!isAdmin && (
                          <button className={styles.obsBtn} onClick={() => openObs(item)}>
                            {item.user_observation ? 'Editar observación' : '+ Añadir observación'}
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                  {allDone
                    ? <span className="badge badge-success">Listo</span>
                    : myDone
                    ? <span className="badge badge-info" style={{ fontSize: 11 }}>Tu parte ✓</span>
                    : <span className="badge badge-warning">Pendiente</span>}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {isAdmin && !schedLoading && Object.keys(itemsByUser).length > 0 && (
        <div className={styles.section} style={{ marginTop: 28 }}>
          <div className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>Pendientes del equipo hoy</h2>
            <span className={styles.sectionCount}>{items.length}</span>
          </div>
          <div className={styles.itemList}>
            {Object.entries(itemsByUser).map(([uid, { assignee, items: uItems }]) => (
              <div key={uid} className={styles.teamBlock}>
                <div className={styles.teamBlockHeader}>
                  <div className={styles.teamAvatar}>
                    {(assignee?.username || assignee?.display_name || assignee?.full_name || '?')[0].toUpperCase()}
                  </div>
                  <span className={styles.teamName}>
                    {assignee?.username || assignee?.display_name || assignee?.full_name || 'Sin nombre'}
                  </span>
                  <span className={styles.sectionCount}>
                    {uItems.filter(i => isDoneByUser(i, uid)).length}/{uItems.length}
                  </span>
                </div>
                <div className={styles.teamItems}>
                  {uItems.map(item => {
                    const userDone = isDoneByUser(item, uid)
                    const allDone = isDoneByAll(item)
                    return (
                      <div key={item.id} className={`${styles.teamItem} ${allDone ? styles.itemDone : ''}`}>
                        <span className={`${styles.miniCheck} ${userDone ? styles.miniChecked : ''}`}>
                          {userDone && <CheckIcon />}
                        </span>
                        <span className={styles.itemTitle}>{item.title}</span>
                        {item.user_observation && <span style={{ marginLeft: 'auto', fontSize: 11 }}>📝</span>}
                        {allDone
                          ? <span className="badge badge-success" style={{ fontSize: 10 }}>Listo</span>
                          : userDone
                          ? <span className="badge badge-info" style={{ fontSize: 10 }}>Su parte ✓</span>
                          : <span className="badge badge-warning" style={{ fontSize: 10 }}>Pendiente</span>}
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function StatCard({ label, value, color }) {
  const map = {
    warning: { bg: 'var(--warning-dim)', text: 'var(--warning)' },
    info:    { bg: 'var(--info-dim)',    text: 'var(--info)' },
    success: { bg: 'var(--success-dim)', text: 'var(--success)' },
  }
  const c = map[color]
  return (
    <div className={styles.statCard} style={{ background: c.bg }}>
      <span className={styles.statValue} style={{ color: c.text }}>{value}</span>
      <span className={styles.statLabel}>{label}</span>
    </div>
  )
}

function CheckIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
      <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
