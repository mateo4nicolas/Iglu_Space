import { useClientResumen } from '../../hooks/useClientResumen'
import { RESUMEN_LINKS } from '../../utils/clientFicha'
import styles from './ClientResumenLinks.module.css'

export default function ClientResumenLinks({ clienteId }) {
  const links = useClientResumen(clienteId)
  if (!clienteId || links === null) return null

  return (
    <div className={styles.wrap}>
      <p className={styles.title}>Enlaces del cliente</p>
      <div className={styles.grid}>
        {RESUMEN_LINKS.map(({ key, label }) =>
          links[key] ? (
            <a key={key} href={links[key]} target="_blank" rel="noopener noreferrer" className={styles.chip}>
              {label} ↗
            </a>
          ) : (
            <span key={key} className={`${styles.chip} ${styles.chipEmpty}`}>{label}</span>
          )
        )}
      </div>
    </div>
  )
}
