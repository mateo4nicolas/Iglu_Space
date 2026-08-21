import { useState, useEffect } from 'react'
import { usePushNotifications, pushSupported, isIOSDevice, isStandalonePWA } from '../../hooks/usePushNotifications'
import styles from './PushNotificationBanner.module.css'

const DISMISS_KEY = 'teamflow-push-banner-dismissed-until'

export default function PushNotificationBanner() {
  const { eligible, permission, subscribing, subscribe } = usePushNotifications()
  const [dismissed, setDismissed] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const until = Number(localStorage.getItem(DISMISS_KEY) || 0)
    if (until && Date.now() < until) setDismissed(true)
  }, [])

  function dismiss() {
    localStorage.setItem(DISMISS_KEY, String(Date.now() + 1000 * 60 * 60 * 24 * 3)) // 3 días
    setDismissed(true)
  }

  if (!eligible || dismissed) return null
  if (permission === 'granted') return null
  if (permission === 'denied') return null // el usuario ya lo bloqueó desde el navegador

  const iOS = isIOSDevice()
  const standalone = isStandalonePWA()

  // iPhone: las notificaciones push solo funcionan si la web está agregada a
  // la pantalla de inicio (PWA). Si todavía no lo está, se le explica cómo.
  if (iOS && !standalone) {
    return (
      <div className={styles.banner}>
        <BellIcon />
        <div className={styles.text}>
          <strong>Activa las notificaciones en tu iPhone:</strong> toca el botón Compartir
          <ShareIcon /> en Safari y elige "Agregar a pantalla de inicio". Luego abre la app
          desde ese ícono para activarlas.
        </div>
        <button className={styles.dismiss} onClick={dismiss} title="Cerrar"><CloseIcon /></button>
      </div>
    )
  }

  if (!pushSupported()) return null

  return (
    <div className={styles.banner}>
      <BellIcon />
      <div className={styles.text}>
        <strong>Activa las notificaciones</strong> para enterarte al instante de tareas y grabaciones asignadas.
      </div>
      {error && <span className={styles.error}>{error}</span>}
      <button
        className={styles.activateBtn}
        disabled={subscribing}
        onClick={async () => {
          setError('')
          const { error } = await subscribe()
          if (error) setError('No se pudo activar')
          else dismiss()
        }}
      >
        {subscribing ? 'Activando...' : 'Activar'}
      </button>
      <button className={styles.dismiss} onClick={dismiss} title="Cerrar"><CloseIcon /></button>
    </div>
  )
}

function BellIcon() { return <svg width="18" height="18" viewBox="0 0 20 20" fill="none" style={{ flexShrink: 0 }}><path d="M10 2a5 5 0 00-5 5v2.7c0 .5-.2 1-.5 1.4L3 13.5c-.5.7 0 1.5.8 1.5h12.4c.8 0 1.3-.8.8-1.5l-1.5-2.4c-.3-.4-.5-.9-.5-1.4V7a5 5 0 00-5-5z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/><path d="M7.5 17a2.5 2.5 0 005 0" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg> }
function ShareIcon()  { return <svg width="13" height="13" viewBox="0 0 20 20" fill="none" style={{ display: 'inline', verticalAlign: 'middle', margin: '0 3px' }}><path d="M10 13V3M6.5 6.5L10 3l3.5 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/><path d="M4 9v6.5A1.5 1.5 0 005.5 17h9a1.5 1.5 0 001.5-1.5V9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg> }
function CloseIcon()  { return <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg> }
