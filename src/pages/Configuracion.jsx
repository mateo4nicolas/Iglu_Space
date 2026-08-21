import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import { useTheme } from '../context/ThemeContext'
import { usePushNotifications, isIOSDevice, isStandalonePWA, pushSupported } from '../hooks/usePushNotifications'
import { supabase } from '../lib/supabase'
import styles from './Configuracion.module.css'

const ROLE_LABEL = { admin: 'Supervisor', user: 'Usuario' }

export default function ConfiguracionPage() {
  const { user, profile, isSuperAdmin } = useAuth()
  const { theme, toggleTheme } = useTheme()
  const {
    eligible, permission, subscribing, subscribed, checkingSub,
    subscribe, unsubscribe, testPush,
  } = usePushNotifications()

  const [departments, setDepartments] = useState([])
  const [newPassword, setNewPassword] = useState('')
  const [repeatPassword, setRepeatPassword] = useState('')
  const [savingPassword, setSavingPassword] = useState(false)
  const [passwordMsg, setPasswordMsg] = useState(null) // { type: 'ok' | 'error', text }
  const [pushMsg, setPushMsg] = useState(null)

  useEffect(() => {
    let cancelled = false
    async function loadDepartments() {
      if (!profile) return
      const { data } = await supabase.from('departments').select('id, name')
      if (!cancelled) setDepartments(data || [])
    }
    loadDepartments()
    return () => { cancelled = true }
  }, [profile])

  const roleLabel = isSuperAdmin ? 'Admin' : ROLE_LABEL[profile?.role] || profile?.role

  async function handleChangePassword() {
    setPasswordMsg(null)
    if (newPassword.length < 10) {
      setPasswordMsg({ type: 'error', text: 'La contraseña debe tener al menos 10 caracteres.' })
      return
    }
    if (newPassword !== repeatPassword) {
      setPasswordMsg({ type: 'error', text: 'Las contraseñas no coinciden.' })
      return
    }
    setSavingPassword(true)
    const { error } = await supabase.auth.updateUser({ password: newPassword })
    setSavingPassword(false)
    if (error) {
      setPasswordMsg({ type: 'error', text: error.message || 'No se pudo cambiar la contraseña.' })
    } else {
      setPasswordMsg({ type: 'ok', text: 'Contraseña actualizada.' })
      setNewPassword('')
      setRepeatPassword('')
    }
  }

  async function handleActivar() {
    setPushMsg(null)
    const { error } = await subscribe()
    setPushMsg(error ? { type: 'error', text: error.message || 'No se pudo activar' } : { type: 'ok', text: 'Notificaciones activadas' })
  }

  async function handleDesactivar() {
    setPushMsg(null)
    const { error } = await unsubscribe()
    setPushMsg(error ? { type: 'error', text: 'No se pudo desactivar' } : { type: 'ok', text: 'Notificaciones desactivadas en este dispositivo' })
  }

  async function handleProbar() {
    setPushMsg(null)
    const { error } = await testPush()
    setPushMsg(error
      ? { type: 'error', text: 'No se pudo enviar la prueba' }
      : { type: 'ok', text: 'Prueba enviada — debería llegarte en unos segundos' })
  }

  const iOS = isIOSDevice()
  const standalone = isStandalonePWA()
  const supported = pushSupported()

  let statusLabel = 'Sin activar'
  let statusClass = styles.statusOff
  if (checkingSub) { statusLabel = 'Verificando...'; statusClass = styles.statusChecking }
  else if (subscribed && permission === 'granted') { statusLabel = 'Activado'; statusClass = styles.statusOn }
  else if (permission === 'denied') { statusLabel = 'Bloqueado en el navegador'; statusClass = styles.statusOff }

  return (
    <div className={styles.page}>
      <h1 className={styles.pageTitle}>Configuración</h1>
      <p className={styles.pageSubtitle}>Todo lo tuyo en un solo sitio.</p>

      {/* Mi cuenta */}
      <section className={styles.card}>
        <h2 className={styles.cardTitle}>Mi cuenta</h2>
        <div className={styles.infoGrid}>
          <div>
            <span className={styles.infoLabel}>Nombre</span>
            <span className={styles.infoValue}>{profile?.display_name || profile?.full_name || '—'}</span>
          </div>
          <div>
            <span className={styles.infoLabel}>Correo</span>
            <span className={styles.infoValue}>{user?.email || '—'}</span>
          </div>
          <div>
            <span className={styles.infoLabel}>Perfil</span>
            <span className={styles.infoValue}>{roleLabel || '—'}</span>
          </div>
          <div>
            <span className={styles.infoLabel}>Departamento</span>
            <span className={styles.infoValue}>
              {departments.find(d => d.id === profile?.department_id)?.name || 'Sin asignar'}
            </span>
          </div>
        </div>

        <div className={styles.divider} />

        <h3 className={styles.subTitle}>Cambiar mi contraseña</h3>
        <p className={styles.hint}>Mínimo 10 caracteres. Al cambiarla seguirás con la sesión abierta aquí.</p>
        <div className={styles.passwordRow}>
          <input
            type="password"
            className={styles.input}
            placeholder="Contraseña nueva"
            value={newPassword}
            onChange={e => setNewPassword(e.target.value)}
          />
          <input
            type="password"
            className={styles.input}
            placeholder="Repetirla"
            value={repeatPassword}
            onChange={e => setRepeatPassword(e.target.value)}
          />
          <button className="btn btn-primary" onClick={handleChangePassword} disabled={savingPassword}>
            {savingPassword ? 'Guardando...' : 'Guardar'}
          </button>
        </div>
        {passwordMsg && (
          <p className={passwordMsg.type === 'ok' ? styles.msgOk : styles.msgError}>{passwordMsg.text}</p>
        )}
      </section>

      {/* Apariencia */}
      <section className={styles.card}>
        <h2 className={styles.cardTitle}>Apariencia</h2>
        <div className={styles.rowBetween}>
          <div>
            <h3 className={styles.subTitle}>{theme === 'dark' ? 'Modo oscuro' : 'Modo claro'}</h3>
            <p className={styles.hint}>Se aplica a todas las pantallas de la app, no solo a esta.</p>
          </div>
          <button className="btn btn-ghost" onClick={toggleTheme}>
            Cambiar a {theme === 'dark' ? 'claro' : 'oscuro'}
          </button>
        </div>
      </section>

      {/* Notificaciones */}
      <section className={styles.card}>
        <h2 className={styles.cardTitle}>Avisos en este dispositivo</h2>
        <div className={styles.rowBetween}>
          <div>
            <h3 className={styles.subTitle}>Estado</h3>
            <p className={styles.hint}>
              {!eligible ? 'Los Admin no reciben avisos push.'
                : !supported ? 'Tu navegador no soporta notificaciones push.'
                : iOS && !standalone ? 'En iPhone: agrega la app a tu pantalla de inicio primero (Compartir → Agregar a pantalla de inicio).'
                : subscribed ? 'Este aparato está registrado para recibir avisos.'
                : 'Este aparato aún no está registrado para recibir avisos.'}
            </p>
          </div>
          <span className={`${styles.statusBadge} ${statusClass}`}>{statusLabel}</span>
        </div>

        {eligible && supported && !(iOS && !standalone) && (
          <>
            <div className={styles.btnRow}>
              <button className="btn btn-primary" onClick={handleActivar} disabled={subscribing || subscribed}>
                🔔 Activar
              </button>
              <button className="btn btn-ghost" onClick={handleProbar} disabled={subscribing || !subscribed}>
                📩 Probar
              </button>
              <button className="btn btn-danger" onClick={handleDesactivar} disabled={subscribing || !subscribed}>
                🔕 Desactivar
              </button>
            </div>
            {pushMsg && (
              <p className={pushMsg.type === 'ok' ? styles.msgOk : styles.msgError}>{pushMsg.text}</p>
            )}
          </>
        )}
      </section>
    </div>
  )
}
