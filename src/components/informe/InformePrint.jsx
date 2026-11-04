import { forwardRef, Fragment } from 'react'
import { linkLabels } from '../../utils/linkLabels'
import styles from './InformePrint.module.css'

// "texto con **negrita**" → nodos con <strong>
function renderBold(text) {
  if (!text) return null
  return String(text).split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith('**') && part.endsWith('**')
      ? <strong key={i}>{part.slice(2, -2)}</strong>
      : <Fragment key={i}>{part}</Fragment>
  )
}

function fmtDMY(v) {
  if (!v) return ''
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(v))
  if (m) return `${m[3]}/${m[2]}/${m[1]}`
  const d = new Date(v)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString('es-EC', { day: '2-digit', month: '2-digit', year: 'numeric' })
}
function isUrl(v) { return /^https?:\/\//i.test((v || '').trim()) }

// ── Informe ejecutivo ───────────────────────────────────────────────────────
// Cada hijo directo del contenido lleva data-block: el PDF los reparte en
// hojas sin partir ningún párrafo.
export const InformeContent = forwardRef(function InformeContent({ header, blocks }, ref) {
  return (
    <div ref={ref} className={styles.content}>
      <div data-block="title" className={styles.title}>Informe de contenidos y programación</div>
      <div data-block="meta" className={styles.meta}>
        <div><strong>Cliente:</strong> {header.client}</div>
        <div><strong>Periodo analizado:</strong> {header.periodLabel}</div>
        {header.grupoTxt && <div><strong>Grupo de facturación:</strong> {header.grupoTxt}</div>}
        {header.planTxt && <div><strong>Plan contratado:</strong> {header.planTxt}</div>}
      </div>
      {blocks.map((b, i) => {
        if (b.type === 'h') return <div key={i} data-block="h" className={styles.h}>{b.text}</div>
        if (b.type === 'p') return <p key={i} data-block="p" className={styles.p}>{renderBold(b.text)}</p>
        if (b.type === 'note') return <p key={i} data-block="note" className={styles.note}>{renderBold(b.text)}</p>
        if (b.type === 'kpis') {
          return (
            <div key={i} data-block="kpis" className={styles.kpis}>
              {b.items.map((k, j) => (
                <div key={j} className={styles.kpi}>
                  <div className={styles.kpiValue}>{k.value}</div>
                  <div className={styles.kpiLabel}>{k.label}</div>
                </div>
              ))}
            </div>
          )
        }
        if (b.type === 'ul' || b.type === 'ol') {
          // Cada ítem es un bloque propio para poder pasar a la hoja siguiente
          return b.items.map((it, j) => (
            <div key={`${i}-${j}`} data-block="li" className={b.type === 'ul' ? styles.ul : styles.ol}>
              <div className={styles.li}>
                {b.type === 'ol' && <span className={styles.olNum}>{j + 1}.</span>}
                <strong>{it.lead}</strong>{it.text.startsWith(',') || it.text.startsWith(' ') ? '' : ' '}{renderBold(it.text)}
              </div>
            </div>
          ))
        }
        return null
      })}
    </div>
  )
})

export function InformeScreen({ header, blocks }) {
  return (
    <div className={styles.screenWrap}>
      <div className={styles.screenPage}>
        <InformeContent header={header} blocks={blocks} />
      </div>
    </div>
  )
}

export const pdfPageClass = styles.pdfPage
export const pdfPageContentClass = styles.pdfPageContent
export const pdfCompactClass = styles.compact

// ── Tabla completa para la hoja horizontal ─────────────────────────────────
const SEC_COLOR = { fria: '#2F6D9E', caliente: '#B24B2C', extra: '#6E52B5', s1: '#2F8F6E', s2: '#C99A2E', s3: '#C15B87', s4: '#5B63C4' }
const SEC_BG = { fria: '#E7F1F8', caliente: '#FBEAE3', extra: '#EFEAF8', s1: '#E6F3EE', s2: '#F8F0DD', s3: '#F7E6EE', s4: '#E9EAF8' }

export const PrintTable = forwardRef(function PrintTable({ client, periodLabel, activity, sections, rowsBySection, networks, hasVector, nota }, ref) {
  const nNet = networks.length
  // Anchos relativos de columna (se ajustan al ancho total)
  const cols = [
    { w: 3.5 }, // banda etapa
    ...(hasVector ? [{ w: 7 }] : []),
    { w: 7 }, { w: 15 }, { w: 7 }, { w: 8 },
    ...networks.flatMap(() => [{ w: 8 }, { w: 7.5 }]),
    { w: 17 },
  ]
  const totalW = cols.reduce((a, c) => a + c.w, 0)

  return (
    <div ref={ref} className={styles.printWrap}>
      <div data-pdf-block="head">
        <div className={styles.bar}>INFORME: CONTENIDOS Y PROGRAMACIÓN</div>
        <div className={styles.idGrid}>
          <div className={styles.idLabel}>CLIENTE:</div>
          <div>{client}</div>
          <div className={styles.idLabel}>PERIODO:</div>
          <div>{periodLabel}</div>
        </div>
        <div className={styles.gap} />
        <div className={`${styles.bar} ${styles.barSub}`}>ACTIVIDAD</div>
        <div className={styles.actGrid}>
          {activity.map(a => (
            <div key={a.label} className={styles.actCell}>
              <div className={styles.actHead}>{a.label}</div>
              <div className={styles.actVal}>{fmtDMY(a.date) || '—'}</div>
            </div>
          ))}
        </div>
      </div>

      <table className={styles.pt}>
        <colgroup>
          {cols.map((c, i) => <col key={i} style={{ width: `${(c.w / totalW) * 100}%` }} />)}
        </colgroup>
        <thead>
          <tr>
            <th className={styles.thTeal} rowSpan={3} />
            {hasVector && <th className={styles.thTeal} rowSpan={3}>Vector</th>}
            <th className={styles.thCoral} colSpan={4}>Creativo</th>
            {nNet > 0 && <th className={styles.thTeal} colSpan={nNet * 2}>Programación</th>}
            <th className={styles.thTeal} rowSpan={3}>Observaciones</th>
          </tr>
          <tr>
            <th className={styles.thCoralSoft} rowSpan={2}># Creativo</th>
            <th className={styles.thCoralSoft} rowSpan={2}>Código</th>
            <th className={styles.thCoralSoft} rowSpan={2}>Enlace(s)</th>
            <th className={styles.thCoralSoft} rowSpan={2}>Aprobación</th>
            {networks.map(n => <th key={n.id} className={styles.thNet} colSpan={2}>{n.label}</th>)}
          </tr>
          <tr>
            {networks.map(n => (
              <Fragment key={n.id}>
                <th className={styles.thNetSoft}>Fecha</th>
                <th className={styles.thNetSoft}>Posteo</th>
              </Fragment>
            ))}
          </tr>
        </thead>
        {sections.map(sec => {
          const rows = rowsBySection[sec.id] || []
          if (!rows.length) return null
          const bg = SEC_BG[sec.id] || '#ffffff'
          return (
            <tbody key={sec.id} data-pdf-section={sec.id}>
              {rows.map((r, idx) => {
                const labels = linkLabels(r.enlaces || [])
                return (
                  <tr key={r.id || idx} style={{ background: bg }}>
                    {idx === 0 && (
                      <td className={styles.band} rowSpan={rows.length} style={{ background: SEC_COLOR[sec.id] || '#134650' }}>
                        <span className={styles.bandText}>{sec.short}</span>
                      </td>
                    )}
                    {hasVector && <td>{r.vector}</td>}
                    <td>{r.creativo}</td>
                    <td className={styles.bold}>{r.codigo}</td>
                    <td>
                      {(r.enlaces || []).map((u, i) => (
                        <div key={i}><a href={u} data-pdf-link={u} className={styles.plink}>{labels[i]}</a></div>
                      ))}
                    </td>
                    <td>{fmtDMY(r.aprobacion)}</td>
                    {networks.map(n => {
                      const posteo = (r.posteos?.[n.id] || '').trim()
                      return (
                        <Fragment key={n.id}>
                          <td>{fmtDMY(r.pubs?.[n.id])}</td>
                          <td>
                            {isUrl(posteo)
                              ? <a href={posteo} data-pdf-link={posteo} className={styles.plink}>{r.tipo === 'video' ? 'Ver reel' : 'Ver post'}</a>
                              : posteo}
                          </td>
                        </Fragment>
                      )
                    })}
                    <td className={styles.obsCell}>{r.observaciones}</td>
                  </tr>
                )
              })}
            </tbody>
          )
        })}
      </table>

      {nota && (
        <div data-pdf-block="note" className={styles.noteRow}>
          <div className={styles.noteHead}>Nota importante</div>
          <div className={styles.noteText}>{nota}</div>
        </div>
      )}
    </div>
  )
})
