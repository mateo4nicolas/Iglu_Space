import { useState, useRef, useEffect, Fragment } from 'react'
import { useAuth } from '../context/AuthContext'
import {
  useCronogramaContenidos, STAGE_DEFS, WEEK_DEFS, NETWORK_DEFS, ACTIVITY_FIELDS,
} from '../hooks/useCronogramaContenidos'
import { buildInformeEjecutivo, notaAutomatica, inferTipo } from '../utils/informeEjecutivo'
import { generarInformePdf } from '../utils/informePdf'
import { useTablaLayout } from '../hooks/useTablaLayout'
import TablaLayoutModal from '../components/tablas/TablaLayoutModal'
import CustomCell from '../components/tablas/CustomCell'
import { linkLabels } from '../utils/linkLabels'
import { InformeScreen, InformeContent, PrintTable, pdfPageClass, pdfPageContentClass, pdfCompactClass } from '../components/informe/InformePrint'
import { cycleLabel, currentMesBase, shiftMesBase } from '../utils/cycleLabel'
import NewClientBadge from '../components/ui/NewClientBadge'
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

// ── Títulos editables de la tabla (admin) ───────────────────────────────────
const TL_DEFAULTS = {
  title_bar: 'INFORME: CONTENIDOS Y PROGRAMACIÓN',
  title_actividad: 'ACTIVIDAD',
  group_creativo: 'Creativo',
  group_programacion: 'Programación',
  col_vector: 'Vector',
  col_creativo: '# Creativo',
  col_codigo: 'Código',
  col_enlaces: 'Enlace(s)',
  col_aprobacion: 'Aprobación',
  sub_fecha: 'Fecha',
  sub_posteo: 'Posteo',
  col_observaciones: 'Observaciones',
  nota_label: 'Nota importante',
  ...Object.fromEntries(ACTIVITY_FIELDS.map(f => [`act_${f.key}`, f.label])),
  ...Object.fromEntries(NETWORK_DEFS.map(n => [`net_${n.id}`, n.label])),
  ...Object.fromEntries([...STAGE_DEFS, ...WEEK_DEFS.filter(w => w.id !== 'extra')].flatMap(s => [[`sec_${s.id}`, s.label], [`sec_${s.id}_short`, s.short]])),
}
const TL_HIDEABLE = ['col_vector', 'col_creativo', 'col_codigo', 'col_enlaces', 'col_aprobacion', 'sub_posteo', 'col_observaciones']
const tlItem = key => ({ key, default: TL_DEFAULTS[key], hideable: TL_HIDEABLE.includes(key) })
const TL_SECTIONS = [
  { title: 'Encabezados', items: ['title_bar', 'title_actividad', 'group_creativo', 'group_programacion', 'nota_label'].map(tlItem) },
  { title: 'Columnas (título y si se ve)', items: ['col_vector', 'col_creativo', 'col_codigo', 'col_enlaces', 'col_aprobacion', 'sub_fecha', 'sub_posteo', 'col_observaciones'].map(tlItem) },
  { title: 'Actividad', items: ACTIVITY_FIELDS.map(f => tlItem(`act_${f.key}`)) },
  { title: 'Redes', items: NETWORK_DEFS.map(n => tlItem(`net_${n.id}`)) },
  { title: 'Etapas y semanas (nombre · banda lateral)', items: [...STAGE_DEFS, ...WEEK_DEFS.filter(w => w.id !== 'extra')].flatMap(s => [tlItem(`sec_${s.id}`), tlItem(`sec_${s.id}_short`)]) },
]
const TL_CUSTOM_GROUPS = [
  { value: 'creativo', label: 'En: Creativo' },
  { value: 'final', label: 'Antes de Observaciones' },
]

// Objeto de "layout" que se pasa a la tabla (pantalla y PDF)
function buildTableLayout(tl) {
  const t = key => tl.labelFor(key, TL_DEFAULTS[key])
  return {
    t,
    show: key => !tl.isHidden(key),
    customCreativo: tl.customIn('creativo').filter(c => !tl.isHidden(c.id)),
    customFinal: tl.customIn('final').filter(c => !tl.isHidden(c.id)),
  }
}

export default function CronogramaContenidosPage() {
  const { hasPageAccess, isAdmin } = useAuth()
  const tl = useTablaLayout('informe_contenidos')
  const tableLayout = buildTableLayout(tl)
  const [showLayout, setShowLayout] = useState(false)
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
                <NewClientBadge client={c} mes={mesAno} />
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
              sections={sectionsForClient(activeClient.id).map(s => ({ ...s, label: tableLayout.t(`sec_${s.id}`) || s.label, short: tableLayout.t(`sec_${s.id}_short`) || s.short }))}
              networks={networksForClient(activeClient.id).map(n => ({ ...n, label: tableLayout.t(`net_${n.id}`) || n.label }))}
              tableLayout={tableLayout}
              onOpenLayout={isAdmin ? () => setShowLayout(true) : null}
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
          {showLayout && (
            <TablaLayoutModal
              title="Editar tabla · Informe de Contenidos"
              sections={TL_SECTIONS}
              customGroups={TL_CUSTOM_GROUPS}
              layout={tl.layout}
              onSave={tl.saveLayout}
              onClose={() => setShowLayout(false)}
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
  tableLayout: L, onOpenLayout,
}) {
  const panelRef = useRef(null)
  const informeContentRef = useRef(null)
  const printTableRef = useRef(null)
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

  // ── Informe ejecutivo + tabla para el PDF ──
  const informeRows = buildInformeRows(client.id, mes, sections, networks, allRowsFor, aprobacionFilaFecha)
  const activityData = ACTIVITY_FIELDS.map(f => ({
    key: f.key,
    label: L.t(`act_${f.key}`),
    date: actividadFecha(client.id, mes, f.key),
    note: actividadNota(client.id, mes, f.key)?.nota || '',
  }))
  const informe = buildInformeEjecutivo({
    clientName: client.brand_name,
    periodLabel,
    mes,
    period,
    mode: config.mode,
    vectors: config.vectors,
    planNombre: (config.plan_nombre || '').trim(),
    isFirstMonth: !!client.mes_inicio && client.mes_inicio === mes,
    networks,
    sections,
    rows: informeRows,
    activity: activityData,
  })
  const conteo = { posts: 0, videos: 0, otras: 0 }
  informe.stats.rows?.forEach(r => { if (r.tipo === 'post') conteo.posts++; else if (r.tipo === 'video') conteo.videos++; else conteo.otras++ })
  const planTxt = [
    (config.plan_nombre || '').trim() || null,
    config.mode !== 'semanas' && config.vectors ? `${config.vectors} ${config.vectors === 1 ? 'vector creativo' : 'vectores creativos'}` : null,
  ].filter(Boolean).join(' · ') + (informe.stats.total
    ? ` (${[conteo.posts && `${conteo.posts} ${conteo.posts === 1 ? 'post' : 'posts'}`, conteo.videos && `${conteo.videos} ${conteo.videos === 1 ? 'video' : 'videos'}`, conteo.otras && `${conteo.otras} ${conteo.otras === 1 ? 'pieza adicional' : 'piezas adicionales'}`].filter(Boolean).join(' + ')})`
    : '')
  const informeHeader = {
    client: client.brand_name,
    periodLabel,
    grupoTxt: GRUPO_FACTURACION[period] || '',
    planTxt: planTxt.trim(),
  }
  const printRowsBySection = {}
  sections.forEach(sec => { printRowsBySection[sec.id] = informeRows.filter(r => r.seccionId === sec.id && r.__registrada) })
  const notaTabla = (config.nota_general || '').trim() || notaAutomatica(informe.stats, periodLabel)

  async function handleDownload() {
    if (!informeContentRef.current || downloading) return
    setDownloading(true)
    try {
      const base = `InformeContenidos_${client.brand_name}_${periodLabel}`.replace(/[^\w-]+/g, '_').replace(/_+/g, '_')
      await generarInformePdf({
        contentEl: informeContentRef.current,
        tableEl: printTableRef.current,
        pageClass: pdfPageClass,
        pageContentClass: pdfPageContentClass,
        compactClass: pdfCompactClass,
        fileName: `${base}.pdf`,
      })
    } catch (err) {
      console.error(err)
      alert('No se pudo generar el informe. Revisa la consola para más detalle.')
    } finally {
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
          {onOpenLayout && (
            <button className="btn btn-ghost" style={{ fontSize: 12 }} onClick={onOpenLayout}>
              ✏️ Editar tabla
            </button>
          )}
          <button className={`btn btn-ghost ${styles.resumenToggle}`} style={{ fontSize: 12 }} onClick={onToggleResumen}>
            <NoteIcon /> {showResumen ? 'Ocultar informe' : 'Ver informe'}
          </button>
          <button className={`btn btn-ghost ${styles.downloadBtn}`} style={{ fontSize: 12 }} onClick={handleDownload} disabled={downloading}>
            <DownloadIcon /> {downloading ? 'Generando...' : 'Descargar informe'}
          </button>
        </div>
      </div>

      {/* Informe ejecutivo en pantalla (si se activa) */}
      {showResumen && <InformeScreen header={informeHeader} blocks={informe.blocks} />}

      {/* Fuente para el PDF: contenido del informe y tabla limpia, fuera de vista */}
      <div aria-hidden="true" style={{ position: 'absolute', left: -100000, top: 0, width: 660 }}>
        <InformeContent ref={informeContentRef} header={informeHeader} blocks={informe.blocks} />
      </div>
      <div aria-hidden="true" style={{ position: 'absolute', left: -100000, top: 0 }}>
        <PrintTable
          ref={printTableRef}
          client={client.brand_name}
          periodLabel={periodLabel}
          activity={activityData}
          sections={sections}
          rowsBySection={printRowsBySection}
          networks={networks}
          hasVector={hasVector}
          nota={notaTabla}
          layout={L}
        />
      </div>

      <div ref={panelRef}>
        <div ref={activityBlockRef}>
          <ActivityBlock
            L={L}
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
              <TableHead hasVector={hasVector} networks={networks} L={L} />
              {sections.map(sec => (
                <tbody key={sec.id} data-pdf-section={sec.id}>
                  <SectionRows
                    section={sec}
                    clientId={client.id}
                    mes={mes}
                    config={config}
                    hasVector={hasVector}
                    networks={networks}
                    L={L}
                    rowsFor={rowsFor}
                    addRow={addRow}
                    updateRow={updateRow}
                    deleteRow={deleteRow}
                    aprobacionFilaFecha={aprobacionFilaFecha}
                    totalCols={tableColCount(hasVector, networks, L) + 1}
                  />
                </tbody>
              ))}
            </table>
          )}
        </div>

        <div className={styles.noteBox} ref={noteBoxRef}>
          <div className={styles.noteLabel}>{L.t('nota_label')}</div>
          <ClientNote client={client} config={config} saveConfig={saveConfig} />
        </div>
      </div>

      {canEditStructure && showConfig && (
        <ConfigModal client={client} config={config} onSave={saveConfig} onClose={onCloseConfig} />
      )}
    </div>
  )
}

// Filas "resueltas" del cronograma (aprobación conectada a la Matriz cuando
// corresponde) para el informe ejecutivo y la tabla del PDF.
function buildInformeRows(clientId, mes, sections, networks, allRowsFor, aprobacionFilaFecha) {
  const all = allRowsFor(clientId, mes)
  const out = []
  sections.forEach(sec => {
    const rows = all.filter(r => r.seccion === sec.id).sort((a, b) => (a.position || 0) - (b.position || 0))
    const countByTipo = {}
    rows.forEach(r => {
      const idx = r.tipo ? (countByTipo[r.tipo] = (countByTipo[r.tipo] ?? -1) + 1) : null
      const manualAprob = r.aprobacion_fecha ? String(r.aprobacion_fecha).slice(0, 10) : null
      const aprobacion = manualAprob || (AUTO_APROB_SECTIONS.includes(sec.id) && r.tipo
        ? aprobacionFilaFecha(clientId, mes, sec.id, r.tipo, idx)
        : null)
      const pubs = {}
      const posteos = {}
      networks.forEach(n => {
        pubs[n.id] = r[n.field + '_fecha'] || null
        posteos[n.id] = r[n.field + '_posteo'] || ''
      })
      const tipo = inferTipo(r)
      out.push({
        id: r.id,
        seccionId: sec.id,
        seccionLabel: sec.label,
        seccionShort: sec.short,
        vector: r.vector,
        tipo,
        creativo: r.creativo,
        codigo: r.codigo,
        enlaces: r.enlaces || [],
        aprobacion,
        pubs,
        posteos,
        observaciones: r.observaciones,
        extra: r.extra || {},
        __registrada: !!(r.codigo || r.creativo || aprobacion || (r.enlaces || []).length || Object.values(pubs).some(Boolean) || r.observaciones),
      })
    })
  })
  return out
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

function ActivityBlock({ L, client, mes, periodLabel, actividadFecha, actividadNota, saveActividadNota }) {
  return (
    <div className={styles.infoBlock}>
      <div className={styles.infoTitleBar}>{L.t('title_bar')}</div>
      <div className={styles.idGrid}>
        <div className={styles.cellLabel}>CLIENTE:</div>
        <div className={styles.cellValue}>{client.brand_name}</div>
        <div className={styles.cellLabel}>PERIODO:</div>
        <div className={styles.cellValue}>{periodLabel}</div>
      </div>
      <div className={`${styles.infoTitleBar} ${styles.sub}`}>{L.t('title_actividad')}</div>
      <div className={styles.activityGrid}>
        {ACTIVITY_FIELDS.map(f => (
          <ActivityRow
            key={f.key}
            client={client}
            mes={mes}
            campo={f.key}
            label={L.t(`act_${f.key}`)}
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

// Número de columnas de datos (sin la columna de acciones)
function tableColCount(hasVector, networks, L) {
  const vec = hasVector && L.show('col_vector') ? 1 : 0
  const cre = ['col_creativo', 'col_codigo', 'col_enlaces', 'col_aprobacion'].filter(L.show).length + L.customCreativo.length
  const net = networks.length * (L.show('sub_posteo') ? 2 : 1)
  return 1 + vec + cre + net + L.customFinal.length + (L.show('col_observaciones') ? 1 : 0)
}

function TableHead({ hasVector, networks, L }) {
  const creCols = ['col_creativo', 'col_codigo', 'col_enlaces', 'col_aprobacion'].filter(L.show)
  const creSpan = creCols.length + L.customCreativo.length
  const showPosteo = L.show('sub_posteo')
  return (
    <thead>
      <tr>
        <th className={styles.hdTeal} rowSpan={3} style={{ width: 30 }}></th>
        {hasVector && L.show('col_vector') && <th className={styles.hdTeal} rowSpan={3}>{L.t('col_vector')}</th>}
        {creSpan > 0 && <th className={styles.hdCoral} colSpan={creSpan}>{L.t('group_creativo')}</th>}
        {networks.length > 0 && <th className={styles.hdTeal} colSpan={networks.length * (showPosteo ? 2 : 1)}>{L.t('group_programacion')}</th>}
        {L.customFinal.map(c => <th key={c.id} className={styles.hdTeal} rowSpan={3}>{c.label}</th>)}
        {L.show('col_observaciones') && <th className={styles.hdTeal} rowSpan={3}>{L.t('col_observaciones')}</th>}
        <th className={styles.hdTeal} rowSpan={3} style={{ width: 30 }}></th>
      </tr>
      <tr>
        {creCols.map(k => <th key={k} className={styles.hdCoralSoft} rowSpan={2}>{L.t(k)}</th>)}
        {L.customCreativo.map(c => <th key={c.id} className={styles.hdCoralSoft} rowSpan={2}>{c.label}</th>)}
        {networks.map(n => <th key={n.id} className={NET_HEAD[n.id] || styles.hdTeal} colSpan={showPosteo ? 2 : 1}>{n.label}</th>)}
      </tr>
      <tr>
        {networks.map(n => (
          <Fragment key={n.id}>
            <th className={NET_HEAD_SOFT[n.id] || styles.hdTeal}>{L.t('sub_fecha')}</th>
            {showPosteo && <th className={NET_HEAD_SOFT[n.id] || styles.hdTeal}>{L.t('sub_posteo')}</th>}
          </Fragment>
        ))}
      </tr>
    </thead>
  )
}

function SectionRows({ section, clientId, mes, config, hasVector, networks, L, rowsFor, addRow, updateRow, deleteRow, aprobacionFilaFecha, totalCols }) {
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
            {hasVector && L.show('col_vector') && (
              <td className={`${styles.cellEditable} ${styles.colVector}`}>
                <BufferedField className={styles.cellInput} value={row.vector || ''} placeholder="vector" onCommit={v => updateRow(row.id, { vector: v })} />
              </td>
            )}
            {L.show('col_creativo') && (
              <td className={`${styles.cellEditable} ${styles.colCreativo}`}>
                <BufferedField className={styles.cellInput} value={row.creativo || ''} placeholder="# creativo" onCommit={v => updateRow(row.id, { creativo: v })} />
              </td>
            )}
            {L.show('col_codigo') && (
              <td className={`${styles.cellEditable} ${styles.colCodigo}`}>
                <BufferedField className={styles.cellInput} value={row.codigo || ''} placeholder="código" onCommit={v => updateRow(row.id, { codigo: v })} />
              </td>
            )}
            {L.show('col_enlaces') && (
              <td className={styles.linksCell}>
                <LinksEditor value={row.enlaces || []} onCommit={v => updateRow(row.id, { enlaces: v })} />
              </td>
            )}
            {L.show('col_aprobacion') && <td className={styles.aprobRO}>
              <input
                type="date"
                className={styles.dateInput}
                style={{ padding: 0 }}
                value={row.aprobacion_fecha ? String(row.aprobacion_fecha).slice(0, 10) : toLocalDateInput(aprobFecha)}
                onChange={e => updateRow(row.id, { aprobacion_fecha: e.target.value || null })}
              />
            </td>}
            {L.customCreativo.map(c => (
              <td key={c.id} className={styles.cellEditable}>
                <CustomCell tipo={c.tipo} value={row.extra?.[c.id]} inputClassName={styles.cellInput} onCommit={v => updateRow(row.id, { extra: { ...(row.extra || {}), [c.id]: v } })} />
              </td>
            ))}
            {networks.map(n => (
              <Fragment key={n.id}>
                <td className={styles.dateCol}>
                  <input type="date" className={styles.dateInput} value={toDateInputValue(row[n.field + '_fecha'])} onChange={e => updateRow(row.id, { [n.field + '_fecha']: e.target.value || null })} />
                </td>
                {L.show('sub_posteo') && (
                  <td className={styles.cellEditable}>
                    <BufferedField as="textarea" rows={1} className={styles.cellTextarea} value={row[n.field + '_posteo'] || ''} placeholder="posteo" onCommit={v => updateRow(row.id, { [n.field + '_posteo']: v })} />
                  </td>
                )}
              </Fragment>
            ))}
            {L.customFinal.map(c => (
              <td key={c.id} className={styles.cellEditable}>
                <CustomCell tipo={c.tipo} value={row.extra?.[c.id]} inputClassName={styles.cellInput} onCommit={v => updateRow(row.id, { extra: { ...(row.extra || {}), [c.id]: v } })} />
              </td>
            ))}
            {L.show('col_observaciones') && (
              <td className={`${styles.cellEditable} ${styles.colObs}`}>
                <BufferedField as="textarea" rows={1} className={styles.cellTextarea} value={row.observaciones || ''} placeholder="observaciones" onCommit={v => updateRow(row.id, { observaciones: v })} />
              </td>
            )}
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
          {(() => { const labels = linkLabels(value); return value.map((url, i) => (
            <div key={i} className={styles.linkChip}>
              <a href={url} target="_blank" rel="noopener noreferrer" title={url} data-pdf-link={url} className={styles.linkTag}>🔗 {labels[i]}</a>
              <button className={styles.linkChipRemove} onClick={() => removeLink(i)} title="Quitar enlace" data-pdf-hide="true">✕</button>
            </div>
          )) })()}
        </div>
      )}
      <div className={styles.linkAddRow} data-pdf-hide="true">
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
            <div className={styles.fieldLabel}>Plan contratado (aparece en el informe)</div>
            <input
              className={styles.planInput}
              placeholder="Ej. IGLÜ Steps"
              value={draft.plan_nombre || ''}
              onChange={e => setDraft(d => ({ ...d, plan_nombre: e.target.value }))}
            />
          </div>

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
