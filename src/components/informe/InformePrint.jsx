import { forwardRef, Fragment } from 'react'
import { linkLabels } from '../../utils/linkLabels'
import { customValueText } from '../tablas/CustomCell'
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

const DEFAULT_LAYOUT = {
  t: k => ({
    title_bar: 'INFORME: CONTENIDOS Y PROGRAMACIÓN', title_actividad: 'ACTIVIDAD', group_creativo: 'Creativo',
    group_programacion: 'Programación', col_vector: 'Vector', col_creativo: '# Creativo', col_codigo: 'Código',
    col_enlaces: 'Enlace(s)', col_aprobacion: 'Aprobación', sub_fecha: 'Fecha', sub_posteo: 'Posteo',
    col_observaciones: 'Observaciones', nota_label: 'Nota importante',
  }[k] || k),
  show: () => true,
  customCreativo: [],
  customFinal: [],
}

export const PrintTable = forwardRef(function PrintTable({ client, periodLabel, activity, sections, rowsBySection, networks, hasVector, nota, layout }, ref) {
  const L = layout || DEFAULT_LAYOUT
  const nNet = networks.length
  const showVec = hasVector && L.show('col_vector')
  const creCols = ['col_creativo', 'col_codigo', 'col_enlaces', 'col_aprobacion'].filter(L.show)
  const CRE_W = { col_creativo: 7, col_codigo: 15, col_enlaces: 7, col_aprobacion: 8 }
  const showPosteo = L.show('sub_posteo')
  const showObs = L.show('col_observaciones')
  // Anchos relativos de columna (se ajustan al ancho total)
  const cols = [
    { w: 3.5 }, // banda etapa
    ...(showVec ? [{ w: 7 }] : []),
    ...creCols.map(k => ({ w: CRE_W[k] })),
    ...L.customCreativo.map(() => ({ w: 9 })),
    ...networks.flatMap(() => (showPosteo ? [{ w: 8 }, { w: 7.5 }] : [{ w: 8 }])),
    ...L.customFinal.map(() => ({ w: 10 })),
    ...(showObs ? [{ w: 17 }] : []),
  ]
  const totalW = cols.reduce((a, c) => a + c.w, 0)

  return (
    <div ref={ref} className={styles.printWrap}>
      <div data-pdf-block="head">
        <div className={styles.bar}>{L.t('title_bar')}</div>
        <div className={styles.idGrid}>
          <div className={styles.idLabel}>CLIENTE:</div>
          <div>{client}</div>
          <div className={styles.idLabel}>PERIODO:</div>
          <div>{periodLabel}</div>
        </div>
        <div className={styles.gap} />
        <div className={`${styles.bar} ${styles.barSub}`}>{L.t('title_actividad')}</div>
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
            {showVec && <th className={styles.thTeal} rowSpan={3}>{L.t('col_vector')}</th>}
            {creCols.length + L.customCreativo.length > 0 && <th className={styles.thCoral} colSpan={creCols.length + L.customCreativo.length}>{L.t('group_creativo')}</th>}
            {nNet > 0 && <th className={styles.thTeal} colSpan={nNet * (showPosteo ? 2 : 1)}>{L.t('group_programacion')}</th>}
            {L.customFinal.map(c => <th key={c.id} className={styles.thTeal} rowSpan={3}>{c.label}</th>)}
            {showObs && <th className={styles.thTeal} rowSpan={3}>{L.t('col_observaciones')}</th>}
          </tr>
          <tr>
            {creCols.map(k => <th key={k} className={styles.thCoralSoft} rowSpan={2}>{L.t(k)}</th>)}
            {L.customCreativo.map(c => <th key={c.id} className={styles.thCoralSoft} rowSpan={2}>{c.label}</th>)}
            {networks.map(n => <th key={n.id} className={styles.thNet} colSpan={showPosteo ? 2 : 1}>{n.label}</th>)}
          </tr>
          <tr>
            {networks.map(n => (
              <Fragment key={n.id}>
                <th className={styles.thNetSoft}>{L.t('sub_fecha')}</th>
                {showPosteo && <th className={styles.thNetSoft}>{L.t('sub_posteo')}</th>}
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
                    {showVec && <td>{r.vector}</td>}
                    {L.show('col_creativo') && <td>{r.creativo}</td>}
                    {L.show('col_codigo') && <td className={styles.bold}>{r.codigo}</td>}
                    {L.show('col_enlaces') && (
                      <td>
                        {(r.enlaces || []).map((u, i) => (
                          <div key={i}><a href={u} data-pdf-link={u} className={styles.plink}>{labels[i]}</a></div>
                        ))}
                      </td>
                    )}
                    {L.show('col_aprobacion') && <td>{fmtDMY(r.aprobacion)}</td>}
                    {L.customCreativo.map(c => <td key={c.id}><CustomPrint c={c} v={r.extra?.[c.id]} /></td>)}
                    {networks.map(n => {
                      const posteo = (r.posteos?.[n.id] || '').trim()
                      return (
                        <Fragment key={n.id}>
                          <td>{fmtDMY(r.pubs?.[n.id])}</td>
                          {showPosteo && (
                            <td>
                              {isUrl(posteo)
                                ? <a href={posteo} data-pdf-link={posteo} className={styles.plink}>{r.tipo === 'video' ? 'Ver reel' : 'Ver post'}</a>
                                : posteo}
                            </td>
                          )}
                        </Fragment>
                      )
                    })}
                    {L.customFinal.map(c => <td key={c.id}><CustomPrint c={c} v={r.extra?.[c.id]} /></td>)}
                    {showObs && <td className={styles.obsCell}>{r.observaciones}</td>}
                  </tr>
                )
              })}
            </tbody>
          )
        })}
      </table>

      {nota && (
        <div data-pdf-block="note" className={styles.noteRow}>
          <div className={styles.noteHead}>{L.t('nota_label')}</div>
          <div className={styles.noteText}>{nota}</div>
        </div>
      )}
    </div>
  )
})

function CustomPrint({ c, v }) {
  if (c.tipo === 'link' && isUrl(v)) return <a href={v} data-pdf-link={v} className={styles.plink}>Ver</a>
  if (c.tipo === 'check') return v ? '✓' : ''
  return customValueText(c.tipo, v)
}
