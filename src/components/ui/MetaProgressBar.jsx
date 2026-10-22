import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { cycleLabel, currentCycleMesBase } from '../../utils/cycleLabel'

// Barra discreta con el % de avance hacia la meta de cobro del periodo en curso (15 a 14).
// No expone montos: usa la función get_cobro_progress_pct (RPC), que
// cualquier usuario autenticado puede llamar sin tener acceso a la
// tabla cobro_clientes.
export default function MetaProgressBar({ style }) {
  const [pct, setPct] = useState(null)
  const mes = currentCycleMesBase()
  const periodo = cycleLabel(mes, '15_14')

  useEffect(() => {
    let active = true
    supabase.rpc('get_cobro_progress_pct', { p_mes: mes }).then(({ data, error }) => {
      if (active && !error) setPct(Number(data) || 0)
    })
    return () => { active = false }
  }, [mes])

  if (pct === null) return null

  return (
    <div
      title={`Meta de cobro ${periodo}: ${pct}% alcanzado`}
      style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 7, fontSize: 11.5, color: 'var(--text-muted)', ...style }}
    >
      <span>Meta de cobro <strong style={{ color: 'var(--text-secondary)' }}>{periodo}</strong>: <strong style={{ color: 'var(--text-secondary)' }}>{pct}%</strong></span>
      <div style={{ width: 76, height: 5, borderRadius: 99, background: 'var(--bg-hover)', overflow: 'hidden', flex: 'none' }}>
        <div style={{ width: `${Math.min(100, Math.max(0, pct))}%`, height: '100%', background: pct >= 100 ? 'var(--success)' : 'var(--accent)', borderRadius: 99 }} />
      </div>
    </div>
  )
}
