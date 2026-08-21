import { useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import NotificationBell from '../ui/NotificationBell'
import styles from './Sidebar.module.css'

const adminNav = [
  { to: '/dashboard',     icon: HomeIcon,     label: 'Inicio' },
  { to: '/cronograma',    icon: CalendarIcon,  label: 'Cronograma' },
  { to: '/departamentos', icon: DeptIcon,      label: 'Departamentos' },
  { to: '/log-diario',    icon: LogIcon,       label: 'Log Diario' },
  { to: '/grabaciones',   icon: VideoIcon,     label: 'Grabaciones' },
  { to: '/clientes',      icon: ClientsIcon,   label: 'Clientes' },
  { to: '/matriz',        icon: MatrizIcon,    label: 'Matriz de Control' },
  { to: '/contenido-extra', icon: ExtraIcon,   label: 'Contenido Extra' },
  { to: '/agenda-gestion', icon: AgendaIcon,   label: 'Agenda de Gestión' },
  { to: '/equipo',        icon: TeamIcon,      label: 'Equipo' },
  { to: '/admin',         icon: AdminIcon,     label: 'Admin', divider: true },
  { to: '/configuracion', icon: SettingsIcon,  label: 'Configuración' },
]

const userNav = [
  { to: '/dashboard',     icon: HomeIcon,     label: 'Inicio' },
  { to: '/cronograma',    icon: CalendarIcon,  label: 'Cronograma' },
  { to: '/departamentos', icon: DeptIcon,      label: 'Departamentos' },
  { to: '/log-diario',    icon: LogIcon,       label: 'Log Diario' },
  { to: '/grabaciones',   icon: VideoIcon,     label: 'Grabaciones' },
  { to: '/matriz',        icon: MatrizIcon,    label: 'Matriz de Control' },
  { to: '/contenido-extra', icon: ExtraIcon,   label: 'Contenido Extra' },
  { to: '/configuracion', icon: SettingsIcon,  label: 'Configuración', divider: true },
]

export default function Sidebar() {
  const { profile, isAdmin, isSuperAdmin, signOut } = useAuth()
  const navigate = useNavigate()
  const navItems = isAdmin ? adminNav : userNav
  const displayName = profile?.username || profile?.display_name || profile?.full_name || 'Usuario'
  const [open, setOpen] = useState(false)

  async function handleSignOut() {
    await signOut()
    navigate('/login')
  }

  function close() { setOpen(false) }

  return (
    <>
      <button className={styles.hamburger} onClick={() => setOpen(o => !o)} aria-label="Menú">
        {open ? <CloseIcon /> : <MenuIcon />}
      </button>
      <div className={`${styles.overlay} ${open ? styles.open : ''}`} onClick={close} />
      <aside className={`${styles.sidebar} ${open ? styles.open : ''}`}>
        <div className={styles.logo}>
          <div className={styles.logoIcon}>
            <svg width="16" height="16" viewBox="0 0 20 20" fill="none">
              <path d="M10 2L3 7v11h5v-5h4v5h5V7L10 2z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"/>
            </svg>
          </div>
          <span className={styles.logoText}>Iglu Space</span>
        </div>

        <nav className={styles.nav}>
          {navItems.map(item => (
            <div key={item.to}>
              {item.divider && <div className={styles.divider} />}
              <NavLink
                to={item.to}
                end={item.to === '/dashboard'}
                className={({ isActive }) => `${styles.navItem} ${isActive ? styles.active : ''}`}
                onClick={close}
              >
                <item.icon />
                <span>{item.label}</span>
              </NavLink>
            </div>
          ))}
        </nav>

        <div className={styles.bottom}>
          <div className={styles.user}>
            <div className={styles.avatar}>{displayName[0]?.toUpperCase()}</div>
            <div className={styles.userInfo}>
              <span className={styles.userName}>{displayName}</span>
              <span className={`badge ${isSuperAdmin ? 'badge-admin' : isAdmin ? 'badge-info' : 'badge-user'}`} style={{ fontSize: 10 }}>
                {isSuperAdmin ? 'Admin' : isAdmin ? 'Supervisor' : 'Usuario'}
              </span>
            </div>
          </div>
          <NotificationBell />
          <button className={styles.signOut} onClick={handleSignOut} title="Cerrar sesión">
            <LogoutIcon />
          </button>
        </div>
      </aside>
    </>
  )
}

function HomeIcon()     { return <svg width="15" height="15" viewBox="0 0 20 20" fill="none"><path d="M3 9.5L10 3l7 6.5V17a1 1 0 01-1 1H4a1 1 0 01-1-1V9.5z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/><path d="M8 18v-6h4v6" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/></svg> }
function CalendarIcon() { return <svg width="15" height="15" viewBox="0 0 20 20" fill="none"><rect x="3" y="4" width="14" height="13" rx="2" stroke="currentColor" strokeWidth="1.5"/><path d="M3 8h14M7 2v4M13 2v4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg> }
function DeptIcon()     { return <svg width="15" height="15" viewBox="0 0 20 20" fill="none"><rect x="2" y="2" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.5"/><rect x="11" y="2" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.5"/><rect x="2" y="11" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.5"/><rect x="11" y="11" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.5"/></svg> }
function LogIcon()      { return <svg width="15" height="15" viewBox="0 0 20 20" fill="none"><rect x="3" y="2" width="14" height="16" rx="2" stroke="currentColor" strokeWidth="1.5"/><path d="M6 6h8M6 10h8M6 14h5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg> }
function VideoIcon()    { return <svg width="15" height="15" viewBox="0 0 20 20" fill="none"><rect x="2" y="5" width="11" height="10" rx="2" stroke="currentColor" strokeWidth="1.5"/><path d="M13 9l4.5-3v8L13 11" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/></svg> }
function TeamIcon()     { return <svg width="15" height="15" viewBox="0 0 20 20" fill="none"><circle cx="8" cy="7" r="3" stroke="currentColor" strokeWidth="1.5"/><path d="M2 17c0-3.314 2.686-5 6-5s6 1.686 6 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/><circle cx="15" cy="7" r="2" stroke="currentColor" strokeWidth="1.5"/><path d="M17 14c1.5.5 3 1.5 3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg> }
function ClientsIcon()  { return <svg width="15" height="15" viewBox="0 0 20 20" fill="none"><rect x="3" y="3" width="14" height="14" rx="2" stroke="currentColor" strokeWidth="1.5"/><path d="M7 8h6M7 11h6M7 14h3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg> }
function MatrizIcon()   { return <svg width="15" height="15" viewBox="0 0 20 20" fill="none"><rect x="2.5" y="2.5" width="15" height="15" rx="1.5" stroke="currentColor" strokeWidth="1.5"/><path d="M2.5 8h15M2.5 13h15M8 2.5v15M13 2.5v15" stroke="currentColor" strokeWidth="1.2"/></svg> }
function AgendaIcon()   { return <svg width="15" height="15" viewBox="0 0 20 20" fill="none"><rect x="3" y="4" width="14" height="13" rx="2" stroke="currentColor" strokeWidth="1.5"/><path d="M3 8h14M7 2v4M13 2v4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/><path d="M6.5 11h2M6.5 13.5h4M11.5 11h2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg> }
function ExtraIcon()    { return <svg width="15" height="15" viewBox="0 0 20 20" fill="none"><rect x="2.5" y="4" width="15" height="12" rx="2" stroke="currentColor" strokeWidth="1.5"/><path d="M6.5 8h7M6.5 11.5h4.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/><path d="M10 1.5v2.2M10 16.3v2.2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg> }
function AdminIcon()    { return <svg width="15" height="15" viewBox="0 0 20 20" fill="none"><path d="M10 2l1.5 4.5H16l-3.5 2.5 1.5 4.5L10 11l-4 2.5 1.5-4.5L4 6.5h4.5L10 2z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/></svg> }
function SettingsIcon() { return <svg width="15" height="15" viewBox="0 0 20 20" fill="none"><circle cx="10" cy="10" r="2.6" stroke="currentColor" strokeWidth="1.5"/><path d="M10 2.5v2M10 15.5v2M17.5 10h-2M4.5 10h-2M15.1 4.9l-1.4 1.4M6.3 13.7l-1.4 1.4M15.1 15.1l-1.4-1.4M6.3 6.3L4.9 4.9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg> }
function LogoutIcon()   { return <svg width="14" height="14" viewBox="0 0 20 20" fill="none"><path d="M13 3h4v14h-4M9 14l4-4-4-4M13 10H3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg> }
function MenuIcon()     { return <svg width="18" height="18" viewBox="0 0 20 20" fill="none"><path d="M2 5h16M2 10h16M2 15h16" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></svg> }
function CloseIcon()    { return <svg width="18" height="18" viewBox="0 0 20 20" fill="none"><path d="M4 4l12 12M16 4L4 16" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></svg> }
