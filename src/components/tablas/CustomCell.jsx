import { useState, useEffect } from 'react'

// Celda editable de una columna propia según su tipo.
// Guarda al salir del campo (texto/número/link) o al cambiar (fecha/check).
export default function CustomCell({ tipo, value, onCommit, inputClassName, checkClassName, readOnly }) {
  const [v, setV] = useState(value ?? '')
  useEffect(() => { setV(value ?? '') }, [value])

  if (tipo === 'check') {
    return (
      <div style={{ display: 'flex', justifyContent: 'center' }}>
        <input type="checkbox" className={checkClassName} checked={!!value} disabled={readOnly} onChange={e => onCommit(e.target.checked)} />
      </div>
    )
  }
  if (tipo === 'fecha') {
    return (
      <input type="date" className={inputClassName} value={value || ''} disabled={readOnly} onChange={e => onCommit(e.target.value || null)} />
    )
  }
  if (tipo === 'link') {
    const url = (value || '').trim()
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        {url && /^https?:\/\//i.test(url) && (
          <a href={url} target="_blank" rel="noopener noreferrer" title={url} data-pdf-link={url} style={{ fontSize: 12, fontWeight: 600, color: 'var(--accent)', whiteSpace: 'nowrap' }}>🔗 Ver</a>
        )}
        <input
          className={inputClassName}
          value={v}
          placeholder="Pegar link"
          disabled={readOnly}
          onChange={e => setV(e.target.value)}
          onBlur={() => {
            const t = v.trim()
            const clean = t && !/^https?:\/\//i.test(t) ? `https://${t}` : t
            if (clean !== (value || '')) onCommit(clean || null)
          }}
        />
      </div>
    )
  }
  return (
    <input
      type={tipo === 'numero' ? 'number' : 'text'}
      step={tipo === 'numero' ? 'any' : undefined}
      className={inputClassName}
      value={v}
      disabled={readOnly}
      onChange={e => setV(e.target.value)}
      onBlur={() => {
        const next = tipo === 'numero' ? (v === '' ? null : Number(v)) : (v.trim() || null)
        if (next !== (value ?? null)) onCommit(next)
      }}
    />
  )
}

// Texto plano del valor (Excel / PDF)
export function customValueText(tipo, value) {
  if (value === null || value === undefined || value === '') return ''
  if (tipo === 'check') return value ? 'Sí' : ''
  if (tipo === 'fecha') {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value))
    return m ? `${m[3]}/${m[2]}/${m[1]}` : String(value)
  }
  return String(value)
}
