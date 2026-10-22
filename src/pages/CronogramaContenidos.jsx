import { useState, useRef, useEffect, Fragment } from 'react'
import { useAuth } from '../context/AuthContext'
import {
  useCronogramaContenidos, STAGE_DEFS, WEEK_DEFS, NETWORK_DEFS, ACTIVITY_FIELDS,
} from '../hooks/useCronogramaContenidos'
import { buildResumen } from '../utils/informeResumen'
import { cycleLabel, currentMesBase, shiftMesBase } from '../utils/cycleLabel'
import styles from './CronogramaContenidos.module.css'

const PERIODS = [
  { value: '1_31', label: 'Ciclo 1 al 31' },
  { value: '15_14', label: 'Ciclo 15 al 14' },
]

const SEC_CLASS = { fria: 'secFria', caliente: 'secCaliente', extra: 'secExtra', s1: 'secS1', s2: 'secS2', s3: 'secS3', s4: 'secS4' }
const SEC_COLOR = { fria: '#2F6D9E', caliente: '#B24B2C', extra: '#6E52B5', s1: '#2F8F6E', s2: '#C99A2E', s3: '#C15B87', s4: '#5B63C4' }
const NET_HEAD = { fb: styles.hdFb, ig: styles.hdIg, tt: styles.hdTt }
const NET_HEAD_SOFT = { fb: styles.hdFbSoft, ig: styles.hdIgSoft, tt: styles.hdTtSoft }
const AUTO_APROB_SECTIONS = ['fria', 'caliente'] // conectadas en vivo a la Matriz

function parseDay(v) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(v))
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(v)
}
// Valor para <input type="date">: fecha manual tal cual; fecha automática (con hora) en día local
function toLocalDateInput(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const p2 = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`
}
function fmtDate(iso) {
  if (!iso) return null
  const d = parseDay(iso)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleDateString('es-EC', { day: '2-digit', month: '2-digit', year: 'numeric' })
}
function fmtDateTime(iso) {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleString('es-EC', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}
function toDateInputValue(iso) {
  if (!iso) return ''
  return String(iso).slice(0, 10)
}

// Convierte "texto con **negrita**" en nodos React con <strong>.
function renderBold(text) {
  if (!text) return null
  const parts = String(text).split(/(\*\*[^*]+\*\*)/g)
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) return <strong key={i}>{part.slice(2, -2)}</strong>
    return <Fragment key={i}>{part}</Fragment>
  })
}

// ── Campo de texto con buffer local: nunca pierde lo que la persona está
// escribiendo aunque llegue una actualización en vivo mientras tanto. ──
function BufferedField({ value, onCommit, className, placeholder, as = 'input', debounceMs = 550, ...rest }) {
  const [val, setVal] = useState(value || '')
  const editingRef = useRef(false)
  const timerRef = useRef(null)
  const lastRemoteRef = useRef(value || '')

  useEffect(() => {
    if (!editingRef.current && value !== lastRemoteRef.current) {
      lastRemoteRef.current = value || ''
      setVal(value || '')
    } else {
      lastRemoteRef.current = value || ''
    }
  }, [value])

  function handleChange(e) {
    const v = e.target.value
    editingRef.current = true
    setVal(v)
    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => { editingRef.current = false; onCommit(v) }, debounceMs)
  }

  function handleBlur() {
    clearTimeout(timerRef.current)
    editingRef.current = false
    onCommit(val)
  }

  const Comp = as
  return (
    <Comp
      className={className}
      placeholder={placeholder}
      value={val}
      onChange={handleChange}
      onBlur={handleBlur}
      {...rest}
    />
  )
}

export default function CronogramaContenidosPage() {
  const { hasPageAccess } = useAuth()
  // Admin siempre; otra persona solo si un admin le dio el permiso de Estructura (en Equipo)
  const canEditStructure = hasPageAccess('cronograma_estructura')
  const {
    loading, clientsByPeriod, getConfig, saveConfig, sectionsForClient, networksForClient,
    hasVectorColumn, rowsFor, allRowsFor, addRow, ensureSeeded, updateRow, deleteRow,
    actividadFecha, actividadNota, saveActividadNota, aprobacionFilaFecha,
  } = useCronogramaContenidos()

  const [period, setPeriod] = useState(PERIODS[0].value)
  const [mesAno, setMesAno] = useState(currentMesBase())
  const [selectedClientId, setSelectedClientId] = useState(null)
  const [showConfig, setShowConfig] = useState(false)
  const [showResumen, setShowResumen] = useState(false)

  if (loading) return <div className={styles.loading}>Cargando informe de contenidos...</div>

  const clients = clientsByPeriod(period, mesAno)
  const activeClient = clients.find(c => c.id === selectedClientId) || clients[0] || null

  return (
    <div className={styles.page}>
      <div className={styles.topbar}>
        <div>
          <h1 className={styles.pageTitle}>Informe de Contenidos</h1>
          <p className={styles.pageSubtitle}>Planificación de piezas creativas por cliente y periodo</p>
        </div>
        <div className={styles.monthNav}>
          <button className={styles.monthNavBtn} onClick={() => setMesAno(m => shiftMesBase(m, -1))} aria-label="Periodo anterior"><ChevronLeftIcon /></button>
          <span className={styles.monthNavLabel}>{cycleLabel(mesAno, period)}</span>
          <button className={styles.monthNavBtn} onClick={() => setMesAno(m => shiftMesBase(m, 1))} aria-label="Periodo siguiente"><ChevronRightIcon /></button>
        </div>
      </div>

      <div className={styles.tabs}>
        {PERIODS.map(p => (
          <button
            key={p.value}
            className={`${styles.tab} ${period === p.value ? styles.tabActive : ''}`}
            onClick={() => { setPeriod(p.value); setSelectedClientId(null) }}
          >
            {p.label}
            <span className={styles.tabCount}>{clientsByPeriod(p.value, mesAno).length}</span>
          </button>
        ))}
      </div>

      {clients.length === 0 ? (
        <div className={styles.empty}>No hay clientes activos para este ciclo en este mes (revisa "Pausar cliente" en Matriz de Control)</div>
      ) : (
        <>
          <div className={styles.clientPills}>
            {clients.map(c => (
              <button
                key={c.id}
                className={`${styles.clientPill} ${activeClient?.id === c.id ? styles.clientPillActive : ''}`}
                onClick={() => { setSelectedClientId(c.id); setShowResumen(false) }}
              >
                {c.brand_name}
              </button>
            ))}
          </div>

          {activeClient && (
            <ClientPanel
              key={activeClient.id + '|' + mesAno}
              client={activeClient}
              mes={mesAno}
              period={period}
              periodLabel={cycleLabel(mesAno, period)}
              canEditStructure={canEditStructure}
              config={getConfig(activeClient.id)}
              sections={sectionsForClient(activeClient.id)}
              networks={networksForClient(activeClient.id)}
              hasVector={hasVectorColumn(activeClient.id)}
              rowsFor={rowsFor}
              allRowsFor={allRowsFor}
              addRow={addRow}
              ensureSeeded={ensureSeeded}
              updateRow={updateRow}
              deleteRow={deleteRow}
              actividadFecha={actividadFecha}
              actividadNota={actividadNota}
              saveActividadNota={saveActividadNota}
              aprobacionFilaFecha={aprobacionFilaFecha}
              saveConfig={saveConfig}
              onOpenConfig={() => setShowConfig(true)}
              showConfig={showConfig}
              onCloseConfig={() => setShowConfig(false)}
              showResumen={showResumen}
              onToggleResumen={() => setShowResumen(v => !v)}
            />
          )}
        </>
      )}
    </div>
  )
}

const GRUPO_FACTURACION = {
  '1_31': 'Clientes 1-31 · Ciclo de mes calendario',
  '15_14': 'Clientes 15-14 · Ciclo quincenal',
}

function ClientPanel({
  client, mes, period, periodLabel, canEditStructure, config, sections, networks, hasVector,
  rowsFor, allRowsFor, addRow, ensureSeeded, updateRow, deleteRow, actividadFecha, actividadNota, saveActividadNota,
  aprobacionFilaFecha, saveConfig, onOpenConfig, showConfig, onCloseConfig, showResumen, onToggleResumen,
}) {
  const panelRef = useRef(null)
  const resumenRef = useRef(null)
  const tableScrollRef = useRef(null)
  const activityBlockRef = useRef(null)
  const noteBoxRef = useRef(null)
  const [downloading, setDownloading] = useState(false)

  // Siembra automática de filas según vectores/estructura configurada (una vez por sección vacía)
  useEffect(() => {
    sections.forEach(sec => {
      ensureSeeded(client.id, mes, sec.id, config.mode, config.vectors)
    })
  }, [client.id, mes, config.mode, config.vectors, sections.map(s => s.id).join(',')]) // eslint-disable-line react-hooks/exhaustive-deps

  const resumenData = buildResumen({
    clientName: client.brand_name,
    periodLabel,
    rows: buildResumenRows(client.id, mes, sections, networks, allRowsFor, aprobacionFilaFecha),
    networks,
    activityRows: ACTIVITY_FIELDS.map(f => ({
      label: f.label,
      date: actividadFecha(client.id, mes, f.key),
      note: actividadNota(client.id, mes, f.key)?.nota || '',
    })),
  })

  async function handleDownload() {
    if (!panelRef.current || downloading) return
    setDownloading(true)

    // Mientras se genera el PDF, se quita el recorte por scroll (alto y ancho)
    // del contenedor de la tabla para que la captura incluya TODO.
    const scrollEl = tableScrollRef.current
    const prevStyle = scrollEl ? { maxHeight: scrollEl.style.maxHeight, overflow: scrollEl.style.overflow } : null
    if (scrollEl) { scrollEl.style.maxHeight = 'none'; scrollEl.style.overflow = 'visible' }

    try {
      const [{ default: html2canvas }, jspdfMod] = await Promise.all([import('html2canvas'), import('jspdf')])
      const jsPDF = jspdfMod.jsPDF || jspdfMod.default
      const A4 = { w: 595.28, h: 841.89 }
      const doc = new jsPDF({ unit: 'pt', format: 'a4', orientation: 'portrait' })

      async function capture(el, widthOverride) {
        const w = widthOverride || Math.max(el.scrollWidth, el.offsetWidth)
        const h = Math.max(el.scrollHeight, el.offsetHeight)
        return html2canvas(el, { scale: 2, useCORS: true, backgroundColor: '#ffffff', width: w, height: h, windowWidth: w, windowHeight: h })
      }

      // Página 1: resumen interpretativo (una hoja tipo carta, se reparte hacia
      // abajo si el contenido no cabe entero, nunca se corta el ancho).
      if (resumenRef.current) {
        const canvas = await capture(resumenRef.current)
        const ptPerPx = A4.w / canvas.width
        const chunkPx = A4.h / ptPerPx
        let y = 0, first = true
        while (y < canvas.height - 0.5) {
          const sliceH = Math.min(chunkPx, canvas.height - y)
          const slice = document.createElement('canvas')
          slice.width = canvas.width; slice.height = Math.round(sliceH)
          slice.getContext('2d').drawImage(canvas, 0, y, canvas.width, sliceH, 0, 0, canvas.width, sliceH)
          if (!first) doc.addPage([A4.w, A4.h], 'portrait')
          first = false
          doc.addImage(slice.toDataURL('image/jpeg', 0.95), 'JPEG', 0, 0, A4.w, sliceH * ptPerPx)
          y += sliceH
        }
      }

      // Páginas de la tabla: horizontal (más ancho disponible), fila por fila,
      // así ninguna fila queda partida entre dos páginas. El encabezado de la
      // tabla se repite arriba de cada página nueva.
      const pageW = A4.h, pageH = A4.w
      doc.addPage([A4.w, A4.h], 'landscape')
      let cursorY = 0
      let tablePtPerPx = null
      let headerCanvas = null

      function placeBlock(canvas, ptPerPx, { repeatHeader } = {}) {
        const hPt = canvas.height * ptPerPx
        if (cursorY > 0 && cursorY + hPt > pageH) {
          doc.addPage([A4.w, A4.h], 'landscape')
          cursorY = 0
          if (repeatHeader && headerCanvas) placeBlock(headerCanvas, tablePtPerPx)
        }
        doc.addImage(canvas.toDataURL('image/jpeg', 0.95), 'JPEG', 0, cursorY, pageW, hPt)
        cursorY += hPt
      }

      if (activityBlockRef.current) {
        const canvas = await capture(activityBlockRef.current)
        placeBlock(canvas, pageW / canvas.width)
      }

      const tableEl = tableScrollRef.current?.querySelector('table')
      if (tableEl) {
        const fullW = Math.max(tableEl.scrollWidth, tableEl.offsetWidth)
        const theadEl = tableEl.querySelector('thead')
        if (theadEl) {
          headerCanvas = await capture(theadEl, fullW)
          tablePtPerPx = pageW / headerCanvas.width
          placeBlock(headerCanvas, tablePtPerPx)
        }
        const sectionEls = Array.from(tableEl.querySelectorAll('tbody[data-pdf-section]'))
        for (const sectionEl of sectionEls) {
          // Oculta temporalmente la fila de "Añadir fila" (no debe salir en el informe)
          const skipRows = Array.from(sectionEl.querySelectorAll('[data-pdf-skip]'))
          const prevDisplay = skipRows.map(r => r.style.display)
          skipRows.forEach(r => { r.style.display = 'none' })
          const sectionCanvas = await capture(sectionEl, fullW)
          skipRows.forEach((r, i) => { r.style.display = prevDisplay[i] })
          placeBlock(sectionCanvas, tablePtPerPx || pageW / sectionCanvas.width, { repeatHeader: true })
        }
      }

      if (noteBoxRef.current) {
        const canvas = await capture(noteBoxRef.current)
        placeBlock(canvas, pageW / canvas.width)
      }

      const base = `Informe_${client.brand_name}_${periodLabel}`.replace(/[^\w-]+/g, '_')
      doc.save(`${base}.pdf`)
    } catch (err) {
      console.error(err)
      alert('No se pudo generar el informe. Revisa la consola para más detalle.')
    } finally {
      if (scrollEl && prevStyle) { scrollEl.style.maxHeight = prevStyle.maxHeight; scrollEl.style.overflow = prevStyle.overflow }
      setDownloading(false)
    }
  }

  return (
    <div className={styles.panel}>
      <div className={styles.panelHead}>
        <h3>{client.brand_name}</h3>
        <div className={styles.panelHeadRight}>
          <div className={styles.legend}>
            {sections.map(sec => (
              <span key={sec.id} className={styles.legendItem}>
                <span className={styles.legendDot} style={{ background: SEC_COLOR[sec.id] || '#8a93a8' }} />
                {sec.label}
              </span>
            ))}
          </div>
          {canEditStructure && (
            <button className="btn btn-ghost" style={{ fontSize: 12 }} onClick={onOpenConfig}>
              <GearIcon /> Estructura
            </button>
          )}
          <button className={`btn btn-ghost ${styles.resumenToggle}`} style={{ fontSize: 12 }} onClick={onToggleResumen}>
            <NoteIcon /> {showResumen ? 'Ocultar resumen' : 'Ver resumen'}
          </button>
          <button className={`btn btn-ghost ${styles.downloadBtn}`} style={{ fontSize: 12 }} onClick={handleDownload} disabled={downloading}>
            <DownloadIcon /> {downloading ? 'Generando...' : 'Descargar informe'}
          </button>
        </div>
      </div>

      {/* Resumen: visible en pantalla si se activa, y siempre capturado para el PDF (fuera de vista si está oculto) */}
      <div ref={resumenRef} style={!showResumen ? { position: 'absolute', left: -99999, top: 0, width: 780 } : undefined}>
        <ResumenView client={client} period={period} periodLabel={periodLabel} data={resumenData} />
      </div>

      <div ref={panelRef}>
        <div ref={activityBlockRef}>
          <ActivityBlock
            client={client}
            mes={mes}
            periodLabel={periodLabel}
            actividadFecha={actividadFecha}
            actividadNota={actividadNota}
            saveActividadNota={saveActividadNota}
          />
        </div>

        <div className={styles.tableScroll} ref={tableScrollRef}>
          {sections.length === 0 ? (
            <div className={styles.empty}>Este cliente no tiene etapas o semanas configuradas. Usa "Estructura" para elegirlas.</div>
          ) : (
            <table className={styles.table}>
              <TableHead hasVector={hasVector} networks={networks} />
              {sections.map(sec => (
                <tbody key={sec.id} data-pdf-section={sec.id}>
                  <SectionRows
                    section={sec}
                    clientId={client.id}
                    mes={mes}
                    config={config}
                    hasVector={hasVector}
                    networks={networks}
                    rowsFor={rowsFor}
                    addRow={addRow}
                    updateRow={updateRow}
                    deleteRow={deleteRow}
                    aprobacionFilaFecha={aprobacionFilaFecha}
                    totalCols={1 + (hasVector ? 1 : 0) + 4 + networks.length * 2 + 1 + 1}
                  />
                </tbody>
              ))}
            </table>
          )}
        </div>

        <div className={styles.noteBox} ref={noteBoxRef}>
          <div className={styles.noteLabel}>Nota importante</div>
          <ClientNote client={client} config={config} saveConfig={saveConfig} />
        </div>
      </div>

      {canEditStructure && showConfig && (
        <ConfigModal client={client} config={config} onSave={saveConfig} onClose={onCloseConfig} />
      )}
    </div>
  )
}

// Arma las filas "resueltas" (con la fecha de aprobación ya conectada a la Matriz
// cuando corresponde) para alimentar el resumen interpretativo.
function buildResumenRows(clientId, mes, sections, networks, allRowsFor, aprobacionFilaFecha) {
  const all = allRowsFor(clientId, mes)
  const bySeccion = {}
  sections.forEach(sec => { bySeccion[sec.id] = all.filter(r => r.seccion === sec.id).sort((a, b) => (a.position || 0) - (b.position || 0)) })

  const out = []
  sections.forEach(sec => {
    const rows = bySeccion[sec.id] || []
    const countByTipo = {}
    rows.forEach(r => {
      const idx = r.tipo ? (countByTipo[r.tipo] = (countByTipo[r.tipo] ?? -1) + 1) : null
      const manualAprob = r.aprobacion_fecha ? String(r.aprobacion_fecha).slice(0, 10) : null
      const aprobacionFecha = manualAprob || (AUTO_APROB_SECTIONS.includes(sec.id) && r.tipo
        ? aprobacionFilaFecha(clientId, mes, sec.id, r.tipo, idx)
        : null)
      out.push({
        seccionId: sec.id,
        seccionLabel: sec.label,
        codigo: r.codigo,
        creativo: r.creativo,
        aprobacionFecha,
        fb_fecha: r.fb_fecha, ig_fecha: r.ig_fecha, tt_fecha: r.tt_fecha,
        observaciones: r.observaciones,
      })
    })
  })
  return out
}

function ResumenView({ client, period, periodLabel, data }) {
  const now = new Date()
  const genDate = now.toLocaleDateString('es-EC', { day: '2-digit', month: '2-digit', year: 'numeric' })
  const grupoTxt = GRUPO_FACTURACION[period] || ''
  return (
    <div className={styles.resumenOuter}>
      <div className={styles.resumenPage}>
        <div className={styles.resumenContent}>
          <div className={styles.resumenTitle}>Informe de contenidos y programación</div>
          <div className={styles.resumenMeta}>
            <div><strong>Cliente:</strong> {client.brand_name}</div>
            <div><strong>Periodo analizado:</strong> {periodLabel}</div>
            {grupoTxt && <div><strong>Grupo de facturación:</strong> {grupoTxt}</div>}
            <div><strong>Generado:</strong> {genDate}</div>
          </div>
          <div className={styles.resumenIntro}>Este resumen interpreta, a modo de informe, la información cargada hasta ahora en el cronograma de <strong>{client.brand_name}</strong> para el periodo <strong>{periodLabel}</strong>.</div>

          <div className={styles.resumenH2}>Estado general</div>
          {data.estadoGeneral.map((p, i) => <div key={i} className={styles.resumenP}>{renderBold(p)}</div>)}

          <div className={styles.resumenH2}>Publicaciones por red</div>
          {data.publicacionesPorRed.map((p, i) => <div key={i} className={styles.resumenP}>{renderBold(p)}</div>)}

          <div className={styles.resumenH2}>Actividad</div>
          {data.actividad.map((p, i) => <div key={i} className={styles.resumenP}>{renderBold(p)}</div>)}

          <div className={styles.resumenH2}>Observaciones</div>
          <div className={styles.resumenP}>{renderBold(data.observaciones.intro)}</div>
          {data.observaciones.items.length > 0 && (
            <ul className={styles.resumenUl}>
              {data.observaciones.items.map((it, i) => <li key={i}><strong>{it.codigo}</strong> — {it.texto}</li>)}
            </ul>
          )}
          {data.observaciones.moreCount > 0 && (
            <div className={styles.resumenMore}>… y {data.observaciones.moreCount} observación(es) más. Ver detalle en la tabla adjunta.</div>
          )}

          <div className={styles.resumenFooter}>Nota: este resumen interpreta únicamente la información cargada hasta el momento de la descarga. Actualízalo conforme se registren nuevos datos en el cronograma.</div>
        </div>
      </div>
    </div>
  )
}

function ClientNote({ client, config, saveConfig }) {
  return (
    <BufferedField
      as="textarea"
      className={styles.noteBody}
      rows={2}
      placeholder="Escribe aquí una nota importante para este cliente (opcional)."
      value={config.nota_general || ''}
      onCommit={v => saveConfig(client.id, { nota_general: v })}
    />
  )
}

function ActivityBlock({ client, mes, periodLabel, actividadFecha, actividadNota, saveActividadNota }) {
  return (
    <div className={styles.infoBlock}>
      <div className={styles.infoTitleBar}>INFORME: CONTENIDOS Y PROGRAMACIÓN</div>
      <div className={styles.idGrid}>
        <div className={styles.cellLabel}>CLIENTE:</div>
        <div className={styles.cellValue}>{client.brand_name}</div>
        <div className={styles.cellLabel}>PERIODO:</div>
        <div className={styles.cellValue}>{periodLabel}</div>
      </div>
      <div className={`${styles.infoTitleBar} ${styles.sub}`}>ACTIVIDAD</div>
      <div className={styles.activityGrid}>
        {ACTIVITY_FIELDS.map(f => (
          <ActivityRow
            key={f.key}
            client={client}
            mes={mes}
            campo={f.key}
            label={f.label}
            fecha={actividadFecha(client.id, mes, f.key)}
            nota={actividadNota(client.id, mes, f.key)}
            saveActividadNota={saveActividadNota}
          />
        ))}
      </div>
    </div>
  )
}

function ActivityRow({ client, mes, campo, label, fecha, nota, saveActividadNota }) {
  const manual = campo === 'produccion'
  return (
    <>
      <div className={styles.cellLabel}>{label.toUpperCase()}</div>
      <div className={styles.cellValue}>
        {manual ? (
          <input
            type="date"
            className={styles.activityDateInput}
            value={toDateInputValue(fecha)}
            onChange={e => saveActividadNota(client.id, mes, campo, { fecha_manual: e.target.value || null })}
          />
        ) : fmtDate(fecha) ? (
          fmtDate(fecha)
        ) : (
          <span className={styles.activityDateEmpty}>Sin marcar</span>
        )}
      </div>
      <div className={styles.cellValue}>
        <BufferedField
          className={styles.activityNoteInput}
          placeholder="nota u observación"
          value={nota?.nota || ''}
          onCommit={v => saveActividadNota(client.id, mes, campo, { nota: v })}
        />
      </div>
    </>
  )
}

function TableHead({ hasVector, networks }) {
  return (
    <thead>
      <tr>
        <th className={styles.hdTeal} rowSpan={3} style={{ width: 30 }}></th>
        {hasVector && <th className={styles.hdTeal} rowSpan={3}>Vector</th>}
        <th className={styles.hdCoral} colSpan={4}>Creativo</th>
        {networks.length > 0 && <th className={styles.hdTeal} colSpan={networks.length * 2}>Programación</th>}
        <th className={styles.hdTeal} rowSpan={3}>Observaciones</th>
        <th className={styles.hdTeal} rowSpan={3} style={{ width: 30 }}></th>
      </tr>
      <tr>
        <th className={styles.hdCoralSoft} rowSpan={2}># Creativo</th>
        <th className={styles.hdCoralSoft} rowSpan={2}>Código</th>
        <th className={styles.hdCoralSoft} rowSpan={2}>Enlace(s)</th>
        <th className={styles.hdCoralSoft} rowSpan={2}>Aprobación</th>
        {networks.map(n => <th key={n.id} className={NET_HEAD[n.id] || styles.hdTeal} colSpan={2}>{n.label}</th>)}
      </tr>
      <tr>
        {networks.map(n => (
          <Fragment key={n.id}>
            <th className={NET_HEAD_SOFT[n.id] || styles.hdTeal}>Fecha</th>
            <th className={NET_HEAD_SOFT[n.id] || styles.hdTeal}>Posteo</th>
          </Fragment>
        ))}
      </tr>
    </thead>
  )
}

function SectionRows({ section, clientId, mes, config, hasVector, networks, rowsFor, addRow, updateRow, deleteRow, aprobacionFilaFecha, totalCols }) {
  const rows = rowsFor(clientId, mes, section.id)
  const secClass = styles[SEC_CLASS[section.id]] || ''
  const autoAprob = AUTO_APROB_SECTIONS.includes(section.id)

  // índice de cada fila entre las de su mismo tipo (post/video), en orden de aparición
  const countByTipo = {}
  const rowsWithIdx = rows.map(r => {
    const idx = r.tipo ? (countByTipo[r.tipo] = (countByTipo[r.tipo] ?? -1) + 1) : null
    return { ...r, __idxEnTipo: idx }
  })

  return (
    <>
      {rows.length === 0 ? (
        <tr className={secClass}>
          <td className={styles.etapaCell}><div className={styles.etapaBand}>{section.short}</div></td>
          <td colSpan={totalCols - 1} style={{ padding: '10px 14px', color: 'var(--text-muted)', fontSize: 12.5 }}>Sin filas todavía</td>
        </tr>
      ) : rowsWithIdx.map((row, idx) => {
        const aprobFecha = autoAprob && row.tipo ? aprobacionFilaFecha(clientId, mes, section.id, row.tipo, row.__idxEnTipo) : null
        return (
          <tr key={row.id} className={secClass}>
            {idx === 0 && (
              <td className={styles.etapaCell} rowSpan={rows.length} title={section.label}>
                <div className={styles.etapaBand}>{section.short}</div>
              </td>
            )}
            {hasVector && (
              <td className={`${styles.cellEditable} ${styles.colVector}`}>
                <BufferedField className={styles.cellInput} value={row.vector || ''} placeholder="vector" onCommit={v => updateRow(row.id, { vector: v })} />
              </td>
            )}
            <td className={`${styles.cellEditable} ${styles.colCreativo}`}>
              <BufferedField className={styles.cellInput} value={row.creativo || ''} placeholder="# creativo" onCommit={v => updateRow(row.id, { creativo: v })} />
            </td>
            <td className={`${styles.cellEditable} ${styles.colCodigo}`}>
              <BufferedField className={styles.cellInput} value={row.codigo || ''} placeholder="código" onCommit={v => updateRow(row.id, { codigo: v })} />
            </td>
            <td className={styles.linksCell}>
              <LinksEditor value={row.enlaces || []} onCommit={v => updateRow(row.id, { enlaces: v })} />
            </td>
            <td className={styles.aprobRO}>
              <input
                type="date"
                className={styles.dateInput}
                style={{ padding: 0 }}
                value={row.aprobacion_fecha ? String(row.aprobacion_fecha).slice(0, 10) : toLocalDateInput(aprobFecha)}
                onChange={e => updateRow(row.id, { aprobacion_fecha: e.target.value || null })}
              />
            </td>
            {networks.map(n => (
              <Fragment key={n.id}>
                <td className={styles.dateCol}>
                  <input type="date" className={styles.dateInput} value={toDateInputValue(row[n.field + '_fecha'])} onChange={e => updateRow(row.id, { [n.field + '_fecha']: e.target.value || null })} />
                </td>
                <td className={styles.cellEditable}>
                  <BufferedField as="textarea" rows={1} className={styles.cellTextarea} value={row[n.field + '_posteo'] || ''} placeholder="posteo" onCommit={v => updateRow(row.id, { [n.field + '_posteo']: v })} />
                </td>
              </Fragment>
            ))}
            <td className={`${styles.cellEditable} ${styles.colObs}`}>
              <BufferedField as="textarea" rows={1} className={styles.cellTextarea} value={row.observaciones || ''} placeholder="observaciones" onCommit={v => updateRow(row.id, { observaciones: v })} />
            </td>
            <td className={styles.actionsCell}>
              <button className={styles.rowDel} title="Quitar fila" onClick={() => deleteRow(row.id)}><TrashIcon /></button>
            </td>
          </tr>
        )
      })}
      <tr className={styles.addRowRow} data-pdf-skip="true">
        <td colSpan={totalCols}>
          <button className={styles.addRowBtn} onClick={() => addRow(clientId, mes, section.id, AUTO_APROB_SECTIONS.includes(section.id) ? 'post' : null)}>
            <PlusIcon /> Añadir fila · {section.label}
          </button>
        </td>
      </tr>
    </>
  )
}

// Lista de enlaces reales (clicables), con opción de añadir varios
function LinksEditor({ value, onCommit }) {
  const [draft, setDraft] = useState('')

  function addLink() {
    const v = draft.trim()
    if (!v) return
    const withProtocol = /^https?:\/\//i.test(v) ? v : `https://${v}`
    onCommit([...(value || []), withProtocol])
    setDraft('')
  }
  function removeLink(i) {
    onCommit(value.filter((_, idx) => idx !== i))
  }

  return (
    <div>
      {value && value.length > 0 && (
        <div className={styles.linksList}>
          {value.map((url, i) => (
            <div key={i} className={styles.linkChip}>
              <a href={url} target="_blank" rel="noopener noreferrer" title={url}>{url.replace(/^https?:\/\//, '')}</a>
              <button className={styles.linkChipRemove} onClick={() => removeLink(i)} title="Quitar enlace">✕</button>
            </div>
          ))}
        </div>
      )}
      <div className={styles.linkAddRow}>
        <input
          className={styles.linkAddInput}
          placeholder="pegar enlace"
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addLink() } }}
        />
        <button className={styles.linkAddBtn} onClick={addLink}>+</button>
      </div>
    </div>
  )
}

function ConfigModal({ client, config, onSave, onClose }) {
  const [draft, setDraft] = useState({ ...config })
  const [saving, setSaving] = useState(false)

  function toggleIn(key, id) {
    setDraft(d => ({ ...d, [key]: d[key].includes(id) ? d[key].filter(x => x !== id) : [...d[key], id] }))
  }

  async function handleSave() {
    setSaving(true)
    await onSave(client.id, draft)
    setSaving(false)
    onClose()
  }

  return (
    <div className={styles.overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className={styles.modal}>
        <div className={styles.modalHeader}>
          <h2>Estructura de la tabla — {client.brand_name}</h2>
          <button className={styles.closeBtn} onClick={onClose}><CloseIcon /></button>
        </div>
        <div className={styles.modalForm}>
          <div>
            <div className={styles.fieldLabel}>Tipo de tabla</div>
            <div className={styles.modeSwitch}>
              <button className={`${styles.modeBtn} ${draft.mode === 'etapas' ? styles.modeBtnActive : ''}`} onClick={() => setDraft(d => ({ ...d, mode: 'etapas' }))}>Por etapas</button>
              <button className={`${styles.modeBtn} ${draft.mode === 'semanas' ? styles.modeBtnActive : ''}`} onClick={() => setDraft(d => ({ ...d, mode: 'semanas' }))}>Por semanas</button>
            </div>
          </div>

          {draft.mode === 'etapas' ? (
            <>
              <div>
                <div className={styles.fieldLabel}>Etapas a incluir</div>
                {STAGE_DEFS.map(s => (
                  <label key={s.id} className={styles.checkRow}>
                    <input type="checkbox" checked={draft.stages.includes(s.id)} onChange={() => toggleIn('stages', s.id)} />
                    {s.label}
                  </label>
                ))}
              </div>
              <div>
                <div className={styles.fieldLabel}>Número de vectores</div>
                <div className={styles.modeSwitch}>
                  {[1, 2, 3].map(v => (
                    <button key={v} className={`${styles.modeBtn} ${draft.vectors === v ? styles.modeBtnActive : ''}`} onClick={() => setDraft(d => ({ ...d, vectors: v }))}>{v}</button>
                  ))}
                </div>
                <div className={styles.hint}>{draft.vectors} vector(es) → Fría y Caliente arrancan con {draft.vectors * 2} post + {draft.vectors * 2} video cada una (Aprobación conectada a Diseño/Video CF y CC en la Matriz), y 2 filas en Extras. Luego puedes añadir o quitar filas manualmente.</div>
              </div>
            </>
          ) : (
            <div>
              <div className={styles.fieldLabel}>Semanas a incluir</div>
              {WEEK_DEFS.map(w => (
                <label key={w.id} className={styles.checkRow}>
                  <input type="checkbox" checked={draft.weeks.includes(w.id)} onChange={() => toggleIn('weeks', w.id)} />
                  {w.label}
                </label>
              ))}
              <div className={styles.hint}>Cada semana seleccionada inicia con 3 filas (editable después, Aprobación manual). Esta modalidad no incluye la columna Vector.</div>
            </div>
          )}

          <div>
            <div className={styles.fieldLabel}>Redes en las que se publica</div>
            {NETWORK_DEFS.map(n => (
              <label key={n.id} className={styles.checkRow}>
                <input type="checkbox" checked={draft.networks.includes(n.id)} onChange={() => toggleIn('networks', n.id)} />
                {n.label}
              </label>
            ))}
            <div className={styles.hint}>Según lo que elijas se crean las columnas de fecha y posteo en Programación, solo para esas redes.</div>
          </div>
        </div>
        <div className={styles.modalFooter}>
          <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>{saving ? 'Guardando...' : 'Guardar cambios'}</button>
        </div>
      </div>
    </div>
  )
}

function ChevronLeftIcon() { return <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M10 3L5 8l5 5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg> }
function ChevronRightIcon() { return <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M6 3l5 5-5 5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg> }
function GearIcon() { return <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="2.5" stroke="currentColor" strokeWidth="1.3" /><path d="M8 1v2M8 13v2M1 8h2M13 8h2M3.05 3.05l1.41 1.41M11.54 11.54l1.41 1.41M3.05 12.95l1.41-1.41M11.54 4.46l1.41-1.41" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" /></svg> }
function NoteIcon() { return <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><rect x="3" y="2" width="10" height="12" rx="1.5" stroke="currentColor" strokeWidth="1.4" /><path d="M5.5 5.5h5M5.5 8h5M5.5 10.5h3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" /></svg> }
function DownloadIcon() { return <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M8 2.5v8.2M4.7 7.7L8 11l3.3-3.3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /><path d="M3 12.5v1.2a1 1 0 001 1h8a1 1 0 001-1v-1.2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg> }
function TrashIcon() { return <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M2 4h12M5 4V3h6v1M6 7v5M10 7v5M3 4l1 9h8l1-9" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" /></svg> }
function PlusIcon() { return <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M8 2v12M2 8h12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg> }
function CloseIcon() { return <svg width="15" height="15" viewBox="0 0 16 16" fill="none"><path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg> }
