import { currentMesBase, currentCycleMesBase } from '../../utils/cycleLabel'

// Un cliente es "nuevo" solo en su primer ciclo (el de mes_inicio).
// Si no se pasa mes, se usa el ciclo en curso según su periodo de facturación.
export function isNewClient(client, mes) {
  if (!client?.mes_inicio) return false
  const ref = mes || (client.billing_period === '15_14' ? currentCycleMesBase() : currentMesBase())
  return client.mes_inicio === ref
}

export default function NewClientBadge({ client, mes, style }) {
  if (!isNewClient(client, mes)) return null
  return (
    <span
      title="Cliente nuevo: este es su primer periodo"
      style={{
        display: 'inline-block',
        marginLeft: 6,
        padding: '1px 6px',
        borderRadius: 999,
        fontSize: 9,
        fontWeight: 700,
        letterSpacing: '0.04em',
        lineHeight: '14px',
        verticalAlign: 'middle',
        textTransform: 'uppercase',
        color: 'var(--success)',
        background: 'var(--success-dim, rgba(16,185,129,0.14))',
        border: '1px solid var(--success)',
        whiteSpace: 'nowrap',
        flex: 'none',
        ...style,
      }}
    >
      Nuevo
    </span>
  )
}
