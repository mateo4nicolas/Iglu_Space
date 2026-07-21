import { useState, useRef, useEffect } from 'react'
import { useNotifications, requestPushPermission } from '../../hooks/useNotifications'
import { formatDistanceToNow } from 'date-fns'
import { es } from 'date-fns/locale'
import styles from './NotificationBell.module.css'

const TYPE_CONFIG = {
  activity_assigned: { icon: '📅', label: 'Actividad asignada' },
  activity_done:     { icon: '✅', label: 'Actividad completada' },
  task_assigned:     { icon: '📋', label: 'Tarea asignada' },
  task_approved:     { icon: '🎉', label: 'Tarea aprobada' },
  task_rejected:     { icon: '❌', label: 'Tarea rechazada' },
  info:              { icon: '💬', label: 'Notificación' },
}

export default function NotificationBell() {
  const { notifications, unreadCount, markRead, markAllRead } = useNotifications()
  const [open, setOpen] = useState(false)
  const [pushEnabled, setPushEnabled] = useState(
    typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted'
  )
  const ref = useRef(null)

  useEffect(() => {
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  async function enablePush() {
    const ok = await requestPushPermission()
    setPushEnabled(ok)
  }

  return (
    <div className={styles.wrapper} ref={ref}>
      <button className={styles.bell} onClick={() => setOpen(p => !p)}>
        <BellIcon />
        {unreadCount > 0 && (
          <span className={styles.badge}>{unreadCount > 9 ? '9+' : unreadCount}</span>
        )}
      </button>

      {open && (
        <div className={styles.dropdown}>
          <div className={styles.dropHeader}>
            <span className={styles.dropTitle}>Notificaciones</span>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              {!pushEnabled && (
                <button className={styles.pushBtn} onClick={enablePush} title="Activar notificaciones del navegador">
                  <PushIcon /> Activar push
                </button>
              )}
              {unreadCount > 0 && (
                <button className={styles.readAll} onClick={markAllRead}>
                  Marcar todo leído
                </button>
              )}
            </div>
          </div>

          <div className={styles.list}>
            {notifications.length === 0 ? (
              <div className={styles.empty}>Sin notificaciones por ahora</div>
            ) : (
              notifications.map(n => {
                const cfg = TYPE_CONFIG[n.type] || TYPE_CONFIG.info
                return (
                  <div
                    key={n.id}
                    className={`${styles.item} ${!n.read ? styles.unread : ''}`}
                    onClick={() => markRead(n.id)}
                  >
                    <span className={styles.nIcon}>{cfg.icon}</span>
                    <div className={styles.nContent}>
                      <p className={styles.nTitle}>{n.title}</p>
                      {n.body && <p className={styles.nBody}>{n.body}</p>}
                      <p className={styles.nTime}>
                        {formatDistanceToNow(new Date(n.created_at), { addSuffix: true, locale: es })}
                      </p>
                    </div>
                    {!n.read && <span className={styles.dot} />}
                  </div>
                )
              })
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function BellIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 20 20" fill="none">
      <path d="M10 2a6 6 0 00-6 6v3l-1.5 2.5h15L16 11V8a6 6 0 00-6-6z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/>
      <path d="M8.5 17a1.5 1.5 0 003 0" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
    </svg>
  )
}
function PushIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.3"/>
      <path d="M8 5v4M8 11v.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
    </svg>
  )
}
