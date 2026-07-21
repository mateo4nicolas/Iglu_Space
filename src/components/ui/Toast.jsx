import { useEffect, useState } from 'react'
import styles from './Toast.module.css'

const TYPE_CONFIG = {
  activity_assigned: { icon: '📅', color: 'var(--info)' },
  activity_done:     { icon: '✅', color: 'var(--success)' },
  task_assigned:     { icon: '📋', color: 'var(--accent-light)' },
  task_approved:     { icon: '🎉', color: 'var(--success)' },
  task_rejected:     { icon: '❌', color: 'var(--danger)' },
  info:              { icon: '💬', color: 'var(--text-secondary)' },
}

export default function ToastContainer() {
  const [toasts, setToasts] = useState([])

  useEffect(() => {
    function handleToast(e) {
      const n = e.detail
      const id = Date.now()
      setToasts(prev => [...prev, { ...n, toastId: id }])
      setTimeout(() => {
        setToasts(prev => prev.filter(t => t.toastId !== id))
      }, 4500)
    }
    window.addEventListener('teamflow:toast', handleToast)
    return () => window.removeEventListener('teamflow:toast', handleToast)
  }, [])

  function dismiss(toastId) {
    setToasts(prev => prev.filter(t => t.toastId !== toastId))
  }

  if (toasts.length === 0) return null

  return (
    <div className={styles.container}>
      {toasts.map(toast => {
        const cfg = TYPE_CONFIG[toast.type] || TYPE_CONFIG.info
        return (
          <div key={toast.toastId} className={styles.toast}>
            <span className={styles.icon}>{cfg.icon}</span>
            <div className={styles.content}>
              <p className={styles.title} style={{ color: cfg.color }}>{toast.title}</p>
              {toast.body && <p className={styles.body}>{toast.body}</p>}
            </div>
            <button className={styles.close} onClick={() => dismiss(toast.toastId)}>
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path d="M2 2l8 8M10 2L2 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
            </button>
            <div className={styles.progressBar} />
          </div>
        )
      })}
    </div>
  )
}
