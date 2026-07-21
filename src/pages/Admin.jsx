import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { format, subDays } from 'date-fns'
import { es } from 'date-fns/locale'
import styles from './Admin.module.css'

export default function AdminPage() {
  const { profile } = useAuth()
  const [stats, setStats] = useState({ users: 0, tasks: 0, pending: 0, doneToday: 0 })
  const [pendingApproval, setPendingApproval] = useState([])
  const [recentTasks, setRecentTasks] = useState([])
  const [log, setLog] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { fetchAll() }, [])

  async function fetchAll() {
    const todayStr = format(new Date(), 'yyyy-MM-dd')
    const weekAgo = subDays(new Date(), 7).toISOString()
    const [{ count: uc }, { count: tc }, { count: pc }, { count: dc }, { data: pd }, { data: rt }, { data: lg }] = await Promise.all([
      supabase.from('profiles').select('*', { count: 'exact', head: true }),
      supabase.from('tasks').select('*', { count: 'exact', head: true }).eq('approved', true),
      supabase.from('tasks').select('*', { count: 'exact', head: true }).is('approved', null),
      supabase.from('schedule_items').select('*', { count: 'exact', head: true }).eq('date', todayStr).eq('is_done', true),
      supabase.from('tasks').select('*, profiles!tasks_created_by_fkey(full_name, display_name)').is('approved', null).order('created_at', { ascending: false }),
      supabase.from('tasks').select('*, kanban_columns(title,color), profiles!tasks_assigned_to_fkey(full_name, display_name)').eq('approved', true).order('updated_at', { ascending: false }).limit(6),
      supabase.from('notifications').select('*, profiles!notifications_user_id_fkey(full_name, display_name)').gte('created_at', weekAgo).order('created_at', { ascending: false }).limit(20),
    ])
    setStats({ users: uc || 0, tasks: tc || 0, pending: pc || 0, doneToday: dc || 0 })
    setPendingApproval(pd || [])
    setRecentTasks(rt || [])
    setLog(lg || [])
    setLoading(false)
  }

  async function approve(id, approved) {
    const firstCol = approved ? (await supabase.from('kanban_columns').select('id').order('position').limit(1).single()).data?.id : null
    await supabase.from('tasks').update({ approved, column_id: firstCol }).eq('id', id)
    fetchAll()
  }

  if (loading) return <div className={styles.loading}>Cargando...</div>

  return (
    <div className={styles.page}>
      <div className={styles.topbar}>
        <h1 className={styles.pageTitle}>Panel Admin</h1>
        <span className={styles.greeting}>{profile?.display_name || profile?.full_name}</span>
      </div>

      <div className={styles.statsGrid}>
        <StatCard icon="👥" label="Usuarios" value={stats.users} color="accent" />
        <StatCard icon="📋" label="Tareas activas" value={stats.tasks} color="info" />
        <StatCard icon="⏳" label="Por aprobar" value={stats.pending} color="warning" />
        <StatCard icon="✅" label="Completados hoy" value={stats.doneToday} color="success" />
      </div>

      <div className={styles.grid}>
        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <h2 className={styles.cardTitle}>Tareas por aprobar</h2>
            {stats.pending > 0 && <span className="badge badge-warning">{stats.pending}</span>}
          </div>
          {pendingApproval.length === 0 ? <p className={styles.empty}>Todo al día ✓</p> : (
            <div className={styles.list}>
              {pendingApproval.map(t => (
                <div key={t.id} className={styles.approvalItem}>
                  <div>
                    <p className={styles.itemTitle}>{t.title}</p>
                    <p className={styles.itemSub}>por {t.profiles?.display_name || t.profiles?.full_name || '—'}</p>
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                    <button className={styles.approveBtn} onClick={() => approve(t.id, true)}>Aprobar</button>
                    <button className={styles.rejectBtn} onClick={() => approve(t.id, false)}>Rechazar</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className={styles.card}>
          <div className={styles.cardHeader}><h2 className={styles.cardTitle}>Tareas recientes</h2></div>
          {recentTasks.length === 0 ? <p className={styles.empty}>Sin tareas aún</p> : (
            <div className={styles.list}>
              {recentTasks.map(t => (
                <div key={t.id} className={styles.taskItem}>
                  <div className={styles.taskDot} style={{ background: t.kanban_columns?.color || 'var(--border)' }} />
                  <div>
                    <p className={styles.itemTitle}>{t.title}</p>
                    <p className={styles.itemSub}>{t.kanban_columns?.title} · {t.profiles?.display_name || t.profiles?.full_name || 'Sin asignar'}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className={`${styles.card} ${styles.cardFull}`}>
          <div className={styles.cardHeader}>
            <h2 className={styles.cardTitle}>Actividad del equipo</h2>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Últimos 7 días</span>
          </div>
          {log.length === 0 ? <p className={styles.empty}>Sin actividad reciente</p> : (
            <div className={styles.logList}>
              {log.map(n => (
                <div key={n.id} className={styles.logItem}>
                  <span className={styles.logIcon}>{typeIcon(n.type)}</span>
                  <div className={styles.logInfo}>
                    <span className={styles.logUser}>{n.profiles?.display_name || n.profiles?.full_name || 'Sistema'}</span>
                    <span className={styles.logBody}>{n.body || n.title}</span>
                  </div>
                  <span className={styles.logTime}>{format(new Date(n.created_at), "d MMM, HH:mm", { locale: es })}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function StatCard({ icon, label, value, color }) {
  const map = { accent: { bg: 'var(--accent-dim)', text: 'var(--accent)' }, info: { bg: 'var(--info-dim)', text: 'var(--info)' }, warning: { bg: 'var(--warning-dim)', text: 'var(--warning)' }, success: { bg: 'var(--success-dim)', text: 'var(--success)' } }
  const c = map[color]
  return (
    <div className={styles.statCard} style={{ background: c.bg }}>
      <span className={styles.statIcon}>{icon}</span>
      <span className={styles.statValue} style={{ color: c.text }}>{value}</span>
      <span className={styles.statLabel}>{label}</span>
    </div>
  )
}

function typeIcon(type) {
  return { activity_assigned: '📅', activity_done: '✅', task_assigned: '📋', task_approved: '🎉', task_rejected: '❌', task_moved: '↗️', info: '💬' }[type] || '🔔'
}
