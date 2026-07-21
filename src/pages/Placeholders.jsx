import styles from './Placeholder.module.css'

export function TareasPage() {
  return <Placeholder icon="✅" title="Tareas" description="Módulo 2 — Tablero Kanban con clientes y estados" />
}

export function CronogramaPage() {
  return <Placeholder icon="📅" title="Cronograma" description="Módulo 3 — Actividades del día por persona y departamento" />
}

export function EquipoPage() {
  return <Placeholder icon="👥" title="Equipo" description="Módulo 4 — Gestión de usuarios y departamentos" />
}

export function AdminPage() {
  return <Placeholder icon="⭐" title="Admin" description="Módulo 5 — Panel de control avanzado para gerentes" />
}

function Placeholder({ icon, title, description }) {
  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <span className={styles.icon}>{icon}</span>
        <h2 className={styles.title}>{title}</h2>
        <p className={styles.desc}>{description}</p>
        <span className={styles.tag}>Próximamente</span>
      </div>
    </div>
  )
}
