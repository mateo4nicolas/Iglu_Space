// Informe ejecutivo del Informe de Contenidos.
//
// Interpreta los datos del cronograma de un cliente (piezas, aprobaciones,
// fechas por red, hitos de preproducción y observaciones) y arma un informe
// argumentado por secciones: resumen ejecutivo con KPIs, cumplimiento del
// plan, secuencia y lógica de embudo, flujo de aprobación, presencia por red,
// hallazgos, recomendaciones y conclusión.
//
// Devuelve una lista de bloques que el componente pinta (y que el PDF reparte
// en hojas sin cortar párrafos):
//   { type: 'h', text } · { type: 'p', text } · { type: 'kpis', items: [{ value, label }] }
//   { type: 'ul', items: [{ lead, text }] } · { type: 'ol', items: [{ lead, text }] }
//   { type: 'note', text }
// Los textos usan **negrita** para resaltar.

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
const DAY = 86400000

// ── Fechas ──────────────────────────────────────────────────────────────────
export function toDayKey(v) {
  if (!v) return null
  const s = String(v)
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  const d = new Date(s)
  if (Number.isNaN(d.getTime())) return null
  const p2 = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`
}
function keyToUTC(k) {
  const [y, m, d] = k.split('-').map(Number)
  return Date.UTC(y, m - 1, d)
}
function diffDays(a, b) { return Math.round((keyToUTC(b) - keyToUTC(a)) / DAY) }
function addDays(k, n) {
  const d = new Date(keyToUTC(k) + n * DAY)
  const p2 = x => String(x).padStart(2, '0')
  return `${d.getUTCFullYear()}-${p2(d.getUTCMonth() + 1)}-${p2(d.getUTCDate())}`
}
function dd(k) { const [, m, d] = k.split('-'); return `${d}/${m}` }
function dmy(k) { const [y, m, d] = k.split('-'); return `${d}/${m}/${y}` }
function dayMonth(k) { const [, m, d] = k.split('-').map(Number); return `${d} de ${MESES[m - 1]}` }
function rangeTxt(a, b) {
  const [, ma, da] = a.split('-').map(Number)
  const [, mb, db] = b.split('-').map(Number)
  if (a === b) return `el ${da} de ${MESES[ma - 1]}`
  return ma === mb ? `del ${da} al ${db} de ${MESES[mb - 1]}` : `del ${da} de ${MESES[ma - 1]} al ${db} de ${MESES[mb - 1]}`
}
function betweenTxt(a, b) {
  const [, ma, da] = a.split('-').map(Number)
  const [, mb, db] = b.split('-').map(Number)
  if (a === b) return `el ${da} de ${MESES[ma - 1]}`
  return ma === mb ? `entre el ${da} y el ${db} de ${MESES[mb - 1]}` : `entre el ${da} de ${MESES[ma - 1]} y el ${db} de ${MESES[mb - 1]}`
}

export function periodBounds(mes, period) {
  const [y, m] = mes.split('-').map(Number)
  const p2 = x => String(x).padStart(2, '0')
  if (period === '15_14') {
    const next = new Date(Date.UTC(y, m, 1))
    return { start: `${y}-${p2(m)}-15`, end: `${next.getUTCFullYear()}-${p2(next.getUTCMonth() + 1)}-14` }
  }
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate()
  return { start: `${y}-${p2(m)}-01`, end: `${y}-${p2(m)}-${p2(last)}` }
}

// ── Utilidades de texto ─────────────────────────────────────────────────────
function num(n, dec = 1) {
  return Number(n).toLocaleString('es-EC', { minimumFractionDigits: 0, maximumFractionDigits: dec })
}
function joinEs(arr) {
  const l = arr.filter(Boolean)
  if (l.length <= 1) return l[0] || ''
  return l.slice(0, -1).join(', ') + ' y ' + l[l.length - 1]
}
function plural(n, s, p) { return n === 1 ? s : (p || s + 's') }
function cap(s) {
  if (!s) return s
  const i = s.startsWith('**') ? 2 : 0
  return s.slice(0, i) + s.charAt(i).toUpperCase() + s.slice(i + 1)
}
function pct(a, b) { return b ? Math.round((a / b) * 100) : 0 }
function formatoTxt(posts, videos, otras) {
  return joinEs([
    posts ? `${posts} ${plural(posts, 'post')}` : null,
    videos ? `${videos} ${plural(videos, 'video')}` : null,
    otras ? `${otras} ${plural(otras, 'pieza')} adicional${otras === 1 ? '' : 'es'}` : null,
  ])
}

export function inferTipo(row) {
  if (row.tipo === 'post' || row.tipo === 'video') return row.tipo
  const t = `${row.creativo || ''} ${row.codigo || ''}`
  if (/video|reel/i.test(t)) return 'video'
  if (/post|dise[ñn]o|carrusel|carousel|imagen|historia|story/i.test(t)) return 'post'
  return 'otro'
}
function etiqueta(row) { return row.codigo || row.creativo || `${row.seccionShort || row.seccionLabel} ${row.tipo || ''}`.trim() }
function shortCode(row) {
  const sec = row.seccionId === 'fria' ? 'CF' : row.seccionId === 'caliente' ? 'CC' : (row.seccionShort || '')
  if (row.creativo) return `${sec} ${row.creativo}`.trim()
  return etiqueta(row)
}

// ── Análisis ────────────────────────────────────────────────────────────────
function analyze(input) {
  const { rows: rawRows, networks, sections, mes, period, today } = input
  const todayKey = toDayKey(today || new Date())
  const bounds = periodBounds(mes, period)

  const rows = rawRows
    .map(r => {
      const pubs = {}
      networks.forEach(n => { const k = toDayKey(r.pubs?.[n.id]); if (k) pubs[n.id] = k })
      const pubKeys = Object.values(pubs).sort()
      const firstPub = pubKeys[0] || null
      const aprob = toDayKey(r.aprobacion)
      const obs = (r.observaciones || '').trim()
      const obsCumple = !!obs && /cumple/i.test(obs) && !/no\s+cumple|incumpl/i.test(obs)
      return {
        ...r,
        tipo: inferTipo(r),
        pubs, firstPub, aprob, obs, obsCumple,
        publicada: !!firstPub && firstPub <= todayKey,
        programada: !!firstPub && firstPub > todayKey,
        margin: aprob && firstPub ? diffDays(aprob, firstPub) : null,
      }
    })
    .filter(r => r.codigo || r.creativo || r.firstPub || r.aprob || (r.enlaces || []).length)

  const total = rows.length
  const posts = rows.filter(r => r.tipo === 'post').length
  const videos = rows.filter(r => r.tipo === 'video').length
  const otras = total - posts - videos
  const publicadas = rows.filter(r => r.publicada)
  const programadas = rows.filter(r => r.programada)
  const sinFecha = rows.filter(r => !r.firstPub)
  const aprobadas = rows.filter(r => r.aprob)
  const sinAprob = rows.filter(r => !r.aprob)
  const aprobPrevia = rows.filter(r => r.aprob && r.firstPub && r.margin >= 0)
  const antesDeAprobar = rows.filter(r => r.margin !== null && r.margin < 0)
  const margins = rows.filter(r => r.margin !== null && r.margin >= 0).map(r => r.margin)
  const avgMargin = margins.length ? margins.reduce((a, b) => a + b, 0) / margins.length : null
  const ajustadas = rows.filter(r => r.margin !== null && r.margin >= 0 && r.margin <= 1)
  const conDrive = rows.filter(r => (r.enlaces || []).length > 0)
  const totalPubs = rows.reduce((a, r) => a + Object.keys(r.pubs).length, 0)
  const conCumple = rows.filter(r => r.obsCumple)
  const incidencias = rows.filter(r => r.obs && !r.obsCumple)

  // Observación de cumplimiento más frecuente (para citarla)
  const obsFreq = {}
  conCumple.forEach(r => { obsFreq[r.obs] = (obsFreq[r.obs] || 0) + 1 })
  const obsTop = Object.entries(obsFreq).sort((a, b) => b[1] - a[1])[0]?.[0] || null

  // Por sección
  const perSec = sections.map(sec => {
    const rs = rows.filter(r => r.seccionId === sec.id)
    const fechas = rs.map(r => r.firstPub).filter(Boolean).sort()
    const ms = rs.filter(r => r.margin !== null && r.margin >= 0).map(r => r.margin)
    const ordenadas = [...rs].filter(r => r.firstPub).sort((a, b) => (a.firstPub < b.firstPub ? -1 : 1))
    // Video que "abre" el bloque: uno entre las dos primeras salidas
    const primera = ordenadas.slice(0, 2).find(r => r.tipo === 'video') || ordenadas[0] || null
    return {
      ...sec,
      rows: rs,
      total: rs.length,
      posts: rs.filter(r => r.tipo === 'post').length,
      videos: rs.filter(r => r.tipo === 'video').length,
      otras: rs.filter(r => r.tipo === 'otro').length,
      first: fechas[0] || null,
      last: fechas[fechas.length - 1] || null,
      count: fechas.length,
      avgGap: fechas.length > 1 ? diffDays(fechas[0], fechas[fechas.length - 1]) / (fechas.length - 1) : null,
      avgMargin: ms.length ? ms.reduce((a, b) => a + b, 0) / ms.length : null,
      opener: primera,
    }
  }).filter(s => s.total > 0)

  // Por red
  const perNet = networks.map(n => {
    const rs = rows.filter(r => r.pubs[n.id])
    const conLink = rs.filter(r => (r.posteos?.[n.id] || '').trim())
    return { ...n, count: rs.length, conLink: conLink.length }
  })
  const activeNets = perNet.filter(n => n.count > 0)
  const simetrica = activeNets.length > 1 &&
    rows.every(r => { const ks = activeNets.map(n => r.pubs[n.id] || null); return ks.every(k => k === ks[0]) })

  // Calendario (fecha de primera salida de cada pieza)
  const pubDays = [...new Set(rows.map(r => r.firstPub).filter(Boolean))].sort()
  const perDay = {}
  rows.forEach(r => { if (r.firstPub) perDay[r.firstPub] = (perDay[r.firstPub] || 0) + 1 })
  const diasDobles = Object.entries(perDay).filter(([, c]) => c > 1).map(([k]) => k).sort()

  const gaps = []
  const inPeriod = pubDays.filter(k => k >= bounds.start && k <= bounds.end)
  if (inPeriod.length) {
    const lead = diffDays(bounds.start, inPeriod[0])
    if (lead >= 4) gaps.push({ from: bounds.start, to: addDays(inPeriod[0], -1), days: lead, kind: 'inicio' })
    for (let i = 1; i < inPeriod.length; i++) {
      const hueco = diffDays(inPeriod[i - 1], inPeriod[i]) - 1
      if (hueco >= 4) gaps.push({ from: addDays(inPeriod[i - 1], 1), to: addDays(inPeriod[i], -1), days: hueco, kind: 'medio' })
    }
    const tail = diffDays(inPeriod[inPeriod.length - 1], bounds.end)
    if (tail >= 4) gaps.push({ from: addDays(inPeriod[inPeriod.length - 1], 1), to: bounds.end, days: tail, kind: 'cierre' })
  }

  // Semanas del periodo (bloques de 7 días desde el inicio; la última absorbe el resto)
  const periodLen = diffDays(bounds.start, bounds.end) + 1
  const nWeeks = 4
  const weeks = Array.from({ length: nWeeks }, () => 0)
  rows.forEach(r => {
    if (!r.firstPub || r.firstPub < bounds.start || r.firstPub > bounds.end) return
    const w = Math.min(nWeeks - 1, Math.floor(diffDays(bounds.start, r.firstPub) / 7))
    weeks[w] += 1
  })
  const weeksIrregular = inPeriod.length >= 4 && Math.max(...weeks) - Math.min(...weeks) >= 2

  // Aprobaciones
  const aprobDays = [...new Set(aprobadas.map(r => r.aprob))].sort()

  // Hitos de preproducción
  const activity = (input.activity || []).map(a => ({ ...a, key2: toDayKey(a.date) }))
  const actConFecha = activity.filter(a => a.key2)
  const firstPubAll = pubDays[0] || null

  const fria = perSec.find(s => s.id === 'fria')
  const caliente = perSec.find(s => s.id === 'caliente')

  return {
    todayKey, bounds, periodLen, rows, total, posts, videos, otras, publicadas, programadas, sinFecha,
    aprobadas, sinAprob, aprobPrevia, antesDeAprobar, avgMargin, ajustadas, conDrive, totalPubs,
    conCumple, incidencias, obsTop, perSec, perNet, activeNets, simetrica, pubDays, diasDobles, gaps,
    weeks, weeksIrregular, aprobDays, activity, actConFecha, firstPubAll, fria, caliente,
    periodoCerrado: todayKey > bounds.end,
  }
}

// ── Informe ─────────────────────────────────────────────────────────────────
export function buildInformeEjecutivo(input) {
  const a = analyze(input)
  const { clientName, periodLabel, mode, isFirstMonth, mes, period } = input
  const blocks = []
  const H = text => blocks.push({ type: 'h', text })
  const P = text => blocks.push({ type: 'p', text })

  const redes = joinEs((a.activeNets.length ? a.activeNets : input.networks).map(n => n.label))
  const [y, m] = mes.split('-').map(Number)
  const nextLabel = period === '15_14' ? 'el próximo ciclo' : MESES[m % 12]
  const nextTitle = period === '15_14' ? 'EL PRÓXIMO CICLO' : MESES[m % 12].toUpperCase()
  const periodoTxt = period === '15_14' ? 'el ciclo' : 'el mes'
  const completo = a.total > 0 && a.publicadas.length === a.total && a.sinAprob.length === 0
  const sinIncidencias = a.incidencias.length === 0 && a.antesDeAprobar.length === 0
  const etapas = mode !== 'semanas' && a.fria && a.caliente

  // ── Sin datos ──
  if (a.total === 0) {
    H('1. RESUMEN EJECUTIVO')
    P(`Para **${clientName}** todavía no hay piezas registradas en el cronograma de ${periodLabel}. El informe se completará automáticamente a medida que se carguen las piezas, sus aprobaciones y sus fechas de publicación por red.`)
    blocks.push({ type: 'note', text: 'Nota: este informe interpreta la información registrada en el cronograma de la plataforma operativa interna de IGLU hasta la fecha de descarga.' })
    return { blocks, stats: a }
  }

  // ── 1. Resumen ejecutivo ──
  H('1. RESUMEN EJECUTIVO')
  const apertura = isFirstMonth
    ? `${cap(periodLabel)} fue el **primer mes de operación** de ${clientName} con IGLÜ`
    : `Durante ${periodLabel}, ${clientName}`
  let p1
  if (completo) {
    p1 = `${apertura} y cerró con el **plan contratado cumplido en su totalidad**: las ${a.total} piezas previstas (${formatoTxt(a.posts, a.videos, a.otras)}) se produjeron, se aprobaron y se publicaron en ${redes} dentro del periodo${sinIncidencias ? ', sin reprogramaciones ni piezas pendientes' : ''}.`
  } else {
    const partes = [
      `**${a.publicadas.length} de ${a.total} piezas publicadas** (${pct(a.publicadas.length, a.total)}%)`,
      a.programadas.length ? `${a.programadas.length} ${plural(a.programadas.length, 'programada')} para los próximos días` : null,
      a.sinFecha.length ? `${a.sinFecha.length} todavía sin fecha de publicación` : null,
    ]
    p1 = `${apertura}${isFirstMonth ? ' y' : ''} ${a.periodoCerrado ? 'cerró' : 'avanza'} con ${joinEs(partes)}, sobre un total de ${a.total} piezas registradas (${formatoTxt(a.posts, a.videos, a.otras)}).`
    if (a.sinAprob.length) p1 += ` Además, ${a.sinAprob.length} ${plural(a.sinAprob.length, 'pieza sigue', 'piezas siguen')} sin aprobación registrada, que es hoy el principal cuello de botella del flujo.`
  }
  const fortalezas = []
  if (etapas && a.fria.last && a.caliente.first && a.fria.last <= a.caliente.first) fortalezas.push('un calendario alineado al embudo (frío → caliente)')
  if (a.aprobDays.length && a.aprobDays.length <= Math.max(2, Math.ceil(a.aprobadas.length / 3))) fortalezas.push('aprobaciones agrupadas que no frenaron la salida del contenido')
  if (a.conDrive.length === a.total && a.activeNets.every(n => n.conLink === n.count)) fortalezas.push('trazabilidad completa de cada pieza, desde Drive hasta el enlace público en cada red')
  if (fortalezas.length) {
    p1 += ` Más allá del volumen, ${periodoTxt} dejó instalada la base operativa de la cuenta: ${joinEs(fortalezas)}.`
  } else if (!completo) {
    p1 += ' La prioridad es cerrar las piezas abiertas y ordenar el calendario para que el contenido acompañe de forma constante a la pauta.'
  }
  P(p1)

  blocks.push({
    type: 'kpis',
    items: [
      { value: `${a.publicadas.length} / ${a.total}`, label: completo ? 'piezas del plan entregadas y publicadas' : 'piezas publicadas a la fecha' },
      { value: String(a.totalPubs), label: `publicaciones en total en ${redes}` },
      { value: `${pct(a.aprobPrevia.length, a.total)}%`, label: 'piezas con aprobación previa y fecha cumplida' },
      { value: a.avgMargin !== null ? `${num(a.avgMargin)} ${a.avgMargin === 1 ? 'día' : 'días'}` : '—', label: 'margen promedio entre aprobación y publicación' },
    ],
  })

  // ── 2. Cumplimiento del plan ──
  H('2. CUMPLIMIENTO DEL PLAN')
  const planTxt = input.planNombre ? `El plan ${input.planNombre}` : 'El plan contratado'
  const vecTxt = mode !== 'semanas' && input.vectors ? ` ${input.vectors} ${plural(input.vectors, 'vector creativo', 'vectores creativos')} con` : ''
  const secBreak = a.perSec.map(s => `**${s.total} ${plural(s.total, 'pieza')} de ${s.label.toLowerCase()}** (${formatoTxt(s.posts, s.videos, s.otras)})`)
  let p2 = `${planTxt} contempla${vecTxt} ${formatoTxt(a.posts, a.videos, a.otras)}. Lo registrado en el cronograma se distribuye en ${joinEs(secBreak)}.`
  if (etapas) {
    if (a.fria.total === a.caliente.total) {
      p2 += ` El reparto 50/50 entre etapas no es casual; permite que la marca${isFirstMonth ? ', nueva en el canal,' : ''} primero se presente y eduque a su audiencia y luego empuje la decisión de compra con el mismo peso de contenido.`
    } else if (a.fria.total > a.caliente.total) {
      p2 += ` El mayor peso en conversión fría (${pct(a.fria.total, a.fria.total + a.caliente.total)}%) prioriza alcance y descubrimiento; es una buena base, siempre que el bloque caliente tenga la presión suficiente para convertir ese interés en ventas.`
    } else {
      p2 += ` El énfasis en conversión caliente (${pct(a.caliente.total, a.fria.total + a.caliente.total)}%) prioriza el cierre de venta; funciona cuando la audiencia ya conoce la marca${isFirstMonth ? ', algo que en un primer mes todavía no está garantizado' : ''}, por lo que conviene vigilar que el contenido frío alimente el embudo con suficiente público nuevo.`
    }
  }
  if (a.conCumple.length) {
    p2 += ` ${a.conCumple.length === a.total ? `Las ${a.total} piezas tienen` : `${a.conCumple.length} de las ${a.total} piezas tienen`} la observación **“${a.obsTop.replace(/\.$/, '')}”**, de modo que el indicador de cumplimiento ${a.conCumple.length === a.total ? 'del periodo es del 100%' : `se ubica en ${pct(a.conCumple.length, a.total)}%`}.`
  }
  P(p2)

  if (a.videos > 0 && a.posts > 0) {
    const vSec = a.perSec.filter(s => s.videos > 0)
    let p2b = `En cuanto al formato, los ${a.videos} ${plural(a.videos, 'video')} — el contenido de mayor atención y costo de producción — se ${vSec.length > 1 ? `repartieron entre ${joinEs(vSec.map(s => `${s.label.toLowerCase()} (${s.videos})`))}` : `concentraron en ${vSec[0].label.toLowerCase()}`}, mientras que los ${a.posts} ${plural(a.posts, 'post')} sostuvieron la frecuencia de publicación.`
    if (vSec.length > 1) p2b += ' Tener video en cada etapa asegura que tanto la presentación de la marca como el empuje de venta cuenten con el formato de mayor impacto.'
    else p2b += ' Llevar al menos un video a cada etapa del embudo ayudaría a que ninguna dependa solo de formatos estáticos.'
    P(p2b)
  }
  if (a.incidencias.length) {
    blocks.push({
      type: 'ul',
      items: a.incidencias.slice(0, 4).map(r => ({ lead: etiqueta(r) + '.', text: r.obs })),
    })
    if (a.incidencias.length > 4) P(`… y ${a.incidencias.length - 4} ${plural(a.incidencias.length - 4, 'observación', 'observaciones')} más, detalladas en la tabla.`)
  }

  // ── 3. Secuencia de publicación ──
  const secConFechas = a.perSec.filter(s => s.count > 0)
  if (secConFechas.length) {
    H(etapas ? '3. SECUENCIA DE PUBLICACIÓN Y LÓGICA DE EMBUDO' : '3. SECUENCIA DE PUBLICACIÓN')
    const partes = secConFechas.map(s => {
      const ritmo = s.avgGap !== null ? `, con una pieza cada ${num(s.avgGap)} ${s.avgGap === 1 ? 'día' : 'días'} en promedio` : ''
      return `**${rangeTxt(s.first, s.last)}** salió el contenido de ${s.label.toLowerCase()}${ritmo}`
    })
    let p3 = etapas && a.fria.last && a.caliente.first && a.fria.last < a.caliente.first
      ? `El calendario se ejecutó en ${secConFechas.length === 2 ? 'dos' : secConFechas.length} bloques claramente diferenciados. ${cap(partes.join('; '))}.`
      : `${cap(partes.join('; '))}.`
    p3 += a.diasDobles.length === 0
      ? ' Ningún día concentró dos piezas, lo que evita que una publicación le reste alcance orgánico a la otra.'
      : ` ${a.diasDobles.length === 1 ? 'Un día concentró' : `${a.diasDobles.length} días concentraron`} dos o más piezas (${a.diasDobles.slice(0, 4).map(dd).join(', ')}): en esos casos las publicaciones compiten entre sí por alcance orgánico.`
    P(p3)

    if (etapas && a.fria.first && a.caliente.first) {
      let p3b
      if (a.fria.last <= a.caliente.first) {
        p3b = `Esta secuencia es correcta${isFirstMonth ? ' para una cuenta que recién arranca' : ''}: el público que interactuó con el contenido frío llega al bloque caliente ya expuesto a la marca y, por tanto, más receptivo a los mensajes de oferta y llamada a la acción.`
      } else if (a.caliente.first < a.fria.first) {
        p3b = `El bloque caliente arrancó antes que el frío (${dd(a.caliente.first)} frente a ${dd(a.fria.first)}): se pidió la compra antes de presentar la marca, lo que reduce la efectividad de los mensajes de oferta. Conviene invertir el orden en ${nextLabel}.`
      } else {
        p3b = `Los dos bloques se superpusieron ${betweenTxt(a.caliente.first, a.fria.last)}: durante esos días el público recibió a la vez mensajes de presentación y de compra. Separar las etapas permite que el contenido frío prepare mejor el terreno para el caliente.`
      }
      const openers = [a.fria, a.caliente].filter(s => s.opener && s.opener.tipo === 'video')
      if (openers.length === 2) {
        p3b += ` Además, los videos se ubicaron en puntos estratégicos: uno abrió el bloque frío (${dd(a.fria.opener.firstPub)}) y otro abrió el bloque caliente (${dd(a.caliente.opener.firstPub)}), de modo que cada etapa del embudo inició con el formato de mayor impacto.`
      } else if (openers.length === 1) {
        p3b += ` El bloque de ${openers[0].label.toLowerCase()} arrancó con un video (${dd(openers[0].opener.firstPub)}); replicar esa apertura en la otra etapa reforzaría el arranque de cada fase del embudo.`
      }
      P(p3b)
    }
  }

  // ── 4. Flujo de aprobación ──
  const nSec = secConFechas.length ? 4 : 3
  H(`${nSec}. FLUJO DE APROBACIÓN Y TIEMPOS DE OPERACIÓN`)
  if (a.activity.length) {
    let p4a
    if (a.actConFecha.length === 0) {
      p4a = `Ninguno de los hitos de preproducción (${joinEs(a.activity.map(x => x.label.toLowerCase()))}) tiene fecha registrada en el cronograma, por lo que no es posible verificar si el contenido se preparó con la anticipación necesaria.`
    } else {
      const byDate = {}
      a.actConFecha.forEach(x => { (byDate[x.key2] = byDate[x.key2] || []).push(x.label.toLowerCase()) })
      const hitos = Object.entries(byDate).sort(([x], [z]) => (x < z ? -1 : 1)).map(([k, labels]) => `${joinEs(labels)} el **${dmy(k)}**`)
      const todosAntes = a.firstPubAll && a.actConFecha.every(x => x.key2 <= a.firstPubAll)
      const n = a.actConFecha.length
      p4a = `${n === a.activity.length ? (n === 4 ? 'Los cuatro hitos' : `Los ${n} hitos`) : `${n} de los ${a.activity.length} hitos`} de preproducción quedaron registrados${todosAntes ? ' antes de la primera publicación' : ''}: ${joinEs(hitos)}.`
      if (a.firstPubAll && todosAntes) {
        const desdeInicio = diffDays(a.bounds.start, a.firstPubAll)
        p4a += ` Esto permitió publicar desde el ${dayMonth(a.firstPubAll)}${desdeInicio <= 2 ? `, apenas ${desdeInicio === 0 ? 'el mismo día del' : desdeInicio === 1 ? 'al día siguiente del' : 'dos días después del'} inicio del periodo` : ''}.`
      }
      const faltan = a.activity.filter(x => !x.key2)
      if (faltan.length) p4a += ` Queda pendiente registrar ${joinEs(faltan.map(x => x.label.toLowerCase()))}, para poder medir la anticipación completa del proceso.`
    }
    P(p4a)
  }

  if (a.aprobadas.length) {
    const agrupadas = a.aprobDays.length <= Math.max(2, Math.ceil(a.aprobadas.length / 3))
    let p4b = agrupadas
      ? `Las aprobaciones de piezas finales se agruparon en solo ${a.aprobDays.length} ${plural(a.aprobDays.length, 'fecha')} (${a.aprobDays.slice(0, 6).map(dd).join(', ')}${a.aprobDays.length > 6 ? '…' : ''}), lo que reduce la carga de revisión del cliente y acelera los tiempos.`
      : `Las aprobaciones se dieron en ${a.aprobDays.length} fechas distintas, prácticamente pieza por pieza, lo que multiplica las rondas de revisión con el cliente; agruparlas por bloque haría el flujo más ágil.`
    if (a.avgMargin !== null) {
      const porSec = a.perSec.filter(s => s.avgMargin !== null)
      p4b += ` El margen promedio entre aprobación y publicación fue de **${num(a.avgMargin)} días**${porSec.length > 1 ? ` (${porSec.map(s => `${num(s.avgMargin)} días en ${s.label.toLowerCase()}`).join(' y ')})` : ''}.`
    }
    if (a.ajustadas.length) {
      p4b += ` Sin embargo, **${a.ajustadas.length} ${plural(a.ajustadas.length, 'pieza se publicó', 'piezas se publicaron')} con un día o menos de margen** tras su aprobación (${a.ajustadas.slice(0, 5).map(shortCode).join(', ')}${a.ajustadas.length > 5 ? '…' : ''}). Se cumplió en tiempo, pero ese margen no deja espacio para correcciones de última hora: si el cliente pide un ajuste, la fecha de salida se compromete.`
    }
    if (a.antesDeAprobar.length) {
      p4b += ` Hay ${a.antesDeAprobar.length} ${plural(a.antesDeAprobar.length, 'pieza publicada', 'piezas publicadas')} antes de su fecha de aprobación (${a.antesDeAprobar.slice(0, 4).map(shortCode).join(', ')}): conviene confirmar si es un error de registro o si salieron sin visto bueno del cliente.`
    }
    P(p4b)
  }
  if (a.sinAprob.length) {
    P(`${a.sinAprob.length === a.total ? 'Ninguna pieza tiene' : `${a.sinAprob.length} ${plural(a.sinAprob.length, 'pieza no tiene', 'piezas no tienen')}`} todavía fecha de aprobación registrada${a.sinAprob.length < a.total ? ` (${a.sinAprob.slice(0, 5).map(shortCode).join(', ')}${a.sinAprob.length > 5 ? '…' : ''})` : ''}. Sin ese dato no se puede asegurar que el contenido salió con el visto bueno del cliente, por lo que es prioritario completarlo.`)
  }

  // ── 5. Presencia por red ──
  H(`${nSec + 1}. PRESENCIA POR RED`)
  if (!a.activeNets.length) {
    P(`Todavía no hay fechas de publicación registradas en ${joinEs(input.networks.map(n => n.label))}.`)
  } else {
    let p5
    if (a.simetrica) {
      const n0 = a.activeNets[0].count
      const linksOk = a.activeNets.every(n => n.conLink === n.count)
      p5 = `La programación fue **simétrica en ${redes}**: ${n0} ${plural(n0, 'publicación', 'publicaciones')} en cada red, en las mismas fechas${linksOk ? ', con enlace público registrado por pieza' : ''}. Esto asegura un mensaje coherente sin importar el canal y permite comparar el rendimiento de cada pieza entre redes.`
    } else {
      p5 = `La programación por red se distribuyó así: ${joinEs(a.perNet.map(n => `${n.label} con ${n.count} ${plural(n.count, 'publicación', 'publicaciones')}`))}.`
      const lider = [...a.activeNets].sort((x, z) => z.count - x.count)[0]
      if (a.activeNets.length > 1 && a.activeNets.some(n => n.count !== lider.count)) {
        p5 += ` ${lider.label} concentra el mayor volumen; equilibrar la presencia entre redes da un mensaje más consistente y facilita comparar resultados.`
      } else if (a.activeNets.length > 1) {
        p5 += ' El volumen es igual entre redes, aunque no todas las piezas salieron en las mismas fechas en cada canal.'
      }
    }
    const sinRed = a.perNet.filter(n => n.count === 0)
    if (sinRed.length) p5 += ` ${joinEs(sinRed.map(n => n.label))} ${sinRed.length === 1 ? 'no registra' : 'no registran'} publicaciones en el periodo.`
    const faltanLinks = a.activeNets.reduce((acc, n) => acc + (n.count - n.conLink), 0)
    if (faltanLinks > 0 && !a.simetrica) p5 += ` Faltan ${faltanLinks} ${plural(faltanLinks, 'enlace')} de publicación por registrar, necesarios para verificar cada salida.`
    else if (faltanLinks > 0) p5 += ` Aun así, faltan ${faltanLinks} ${plural(faltanLinks, 'enlace')} de publicación por registrar.`
    P(p5)
  }

  // ── 6. Hallazgos ──
  const hallazgos = []
  const recs = []
  const medios = a.gaps.filter(g => g.kind !== 'cierre')
  const cierre = a.gaps.find(g => g.kind === 'cierre')
  if (a.gaps.length && (a.periodoCerrado || medios.length)) {
    const g = a.gaps.filter(x => a.periodoCerrado || x.kind !== 'cierre')
    let t = `${cap(joinEs(g.map(x => `${betweenTxt(x.from, x.to)} (${x.days} días)`)))} no hubo publicaciones.`
    if (cierre && a.periodoCerrado) t += ` El cierre del periodo es ${g.length > 1 && cierre.days >= Math.max(...g.map(x => x.days)) ? 'el tramo más largo' : 'un tramo'} sin contenido orgánico, justo cuando el público está más cerca de decidir.`
    hallazgos.push({ lead: 'Vacíos de presencia.', text: t })
    if (cierre && a.periodoCerrado) {
      recs.push({ lead: `Extender el calendario hasta el último día ${period === '15_14' ? 'del ciclo' : 'del mes'}`, text: `, cubriendo el tramo final con al menos 2 piezas${etapas ? ' de conversión caliente orientadas a cierre de venta' : ''}.` })
    }
    if (medios.length) recs.push({ lead: 'Cubrir los vacíos intermedios del calendario', text: ', de modo que no pasen más de 3 días seguidos sin publicación.' })
  } else if (cierre && !a.periodoCerrado) {
    hallazgos.push({ lead: 'Tramo final sin programar.', text: `Desde el ${dayMonth(cierre.from)} hasta el cierre del periodo todavía no hay publicaciones programadas.` })
    recs.push({ lead: 'Programar el tramo final del periodo', text: ' con las piezas que aún no tienen fecha, priorizando contenido de cierre de venta.' })
  }
  if (a.weeksIrregular) {
    const desc = a.weeks.map((c, i) => ({ c, i }))
    const max = Math.max(...a.weeks)
    const min = Math.min(...a.weeks)
    const ORD = ['la primera', 'la segunda', 'la tercera', 'la cuarta']
    const altas = desc.filter(x => x.c === max).map(x => ORD[x.i])
    const bajas = desc.filter(x => x.c === min).map(x => ORD[x.i])
    hallazgos.push({ lead: 'Distribución semanal irregular.', text: `${cap(joinEs(altas))} semana ${altas.length > 1 ? 'recibieron' : 'recibió'} ${max} ${plural(max, 'pieza')}${altas.length > 1 ? ' cada una' : ''}, mientras que ${joinEs(bajas)} ${min === 0 ? (bajas.length > 1 ? 'no recibieron ninguna' : 'no recibió ninguna') : `solo ${min}`}. Una cadencia más pareja sostiene mejor el alcance orgánico y acompaña de forma más estable a las campañas pagadas.` })
    const porSemana = Math.max(1, Math.round(a.total / 4))
    recs.push({ lead: 'Repartir el contenido de forma pareja', text: `, con alrededor de ${porSemana} ${plural(porSemana, 'pieza')} por semana.` })
  }
  if (a.ajustadas.length) {
    hallazgos.push({ lead: 'Margen de aprobación ajustado.', text: `Las piezas con un día o menos entre aprobación y publicación son el punto más frágil del flujo.` })
    const secAj = [...new Set(a.ajustadas.map(r => r.seccionLabel))]
    recs.push({ lead: 'Fijar un margen mínimo de 3 días', text: ` entre la aprobación de cada pieza y su publicación${secAj.length === 1 ? `, adelantando la ronda de aprobación del bloque de ${secAj[0].toLowerCase()}` : ''}.` })
  }
  if (a.diasDobles.length) {
    hallazgos.push({ lead: 'Publicaciones el mismo día.', text: `${a.diasDobles.length} ${plural(a.diasDobles.length, 'día concentró', 'días concentraron')} más de una pieza, lo que divide el alcance orgánico.` })
  }
  if (a.sinAprob.length || a.sinFecha.length) {
    hallazgos.push({ lead: 'Piezas abiertas.', text: joinEs([
      a.sinAprob.length ? `${a.sinAprob.length} sin aprobación registrada` : null,
      a.sinFecha.length ? `${a.sinFecha.length} sin fecha de publicación` : null,
    ]) + '.' })
    recs.push({ lead: 'Cerrar las piezas abiertas', text: ` (aprobación y fecha de publicación) antes de iniciar ${nextLabel}, para no arrastrar pendientes.` })
  }
  if (a.antesDeAprobar.length) {
    hallazgos.push({ lead: 'Publicación antes de la aprobación.', text: `${a.antesDeAprobar.length} ${plural(a.antesDeAprobar.length, 'pieza figura', 'piezas figuran')} publicadas antes de su fecha de aprobación.` })
  }
  const faltanLinks = a.activeNets.reduce((acc, n) => acc + (n.count - n.conLink), 0)
  if (faltanLinks > 0 || a.conDrive.length < a.total) {
    hallazgos.push({ lead: 'Trazabilidad incompleta.', text: joinEs([
      a.conDrive.length < a.total ? `${a.total - a.conDrive.length} ${plural(a.total - a.conDrive.length, 'pieza')} sin enlace al archivo` : null,
      faltanLinks ? `${faltanLinks} ${plural(faltanLinks, 'publicación')} sin enlace público` : null,
    ]) + '; sin esos enlaces no se puede verificar cada entrega.' })
    recs.push({ lead: 'Registrar todos los enlaces', text: ' (archivo y publicación por red) al momento de publicar cada pieza.' })
  }
  if (a.incidencias.length) {
    hallazgos.push({ lead: 'Observaciones a atender.', text: `${a.incidencias.length} ${plural(a.incidencias.length, 'pieza tiene', 'piezas tienen')} observaciones distintas al cumplimiento, detalladas en la tabla.` })
  }
  recs.push({ lead: 'Cruzar este cronograma con el informe de pauta', text: ' (documento anexo) para identificar qué piezas generaron más conversaciones y replicar su ángulo en la siguiente tanda.' })

  H(`${nSec + 2}. HALLAZGOS Y OPORTUNIDADES DE MEJORA`)
  if (hallazgos.length) {
    const n = hallazgos.length
    const nTxt = ['', 'un punto', 'dos espacios', 'tres espacios', 'cuatro espacios', 'cinco espacios', 'seis espacios'][n] || `${n} espacios`
    P(completo
      ? `${cap(periodoTxt)} cumple, pero la lectura del calendario muestra ${nTxt} que conviene corregir para ${nextLabel}:`
      : `La lectura del cronograma muestra ${nTxt} a trabajar:`)
    blocks.push({ type: 'ul', items: hallazgos })
  } else {
    P(`No se detectaron desviaciones relevantes en el calendario: la cadencia fue constante, las aprobaciones llegaron con margen y cada publicación quedó registrada. El siguiente paso es usar los resultados de pauta para afinar qué contenidos repetir.`)
  }

  // ── 7. Recomendaciones ──
  H(`${nSec + 3}. RECOMENDACIONES PARA ${nextTitle}`)
  // Máximo 4: las más relevantes + el cruce con pauta al final
  const recsFinal = recs.length > 4 ? [...recs.slice(0, 3), recs[recs.length - 1]] : recs
  blocks.push({ type: 'ol', items: recsFinal })

  // ── Conclusión ──
  H('CONCLUSIÓN')
  const retos = []
  if (a.gaps.length) retos.push('llenar los espacios del calendario')
  if (a.ajustadas.length) retos.push('ganar margen en las aprobaciones')
  if (a.weeksIrregular) retos.push('emparejar la cadencia semanal')
  retos.push('usar los resultados de pauta para que cada nueva pieza venda mejor que la anterior')
  if (completo) {
    P(`${clientName} cerró ${isFirstMonth ? 'su primer mes' : periodLabel} con el 100% del plan entregado, publicado y verificable${etapas && a.fria.last <= a.caliente.first ? ', y con una estructura de contenido alineada al embudo de venta' : ''}. El reto de ${nextLabel} ya no es cumplir, sino **optimizar**: ${joinEs(retos)}.`)
  } else {
    P(`${clientName} ${a.periodoCerrado ? 'cerró' : 'lleva'} ${periodLabel} con el **${pct(a.publicadas.length, a.total)}% del plan publicado**. El foco inmediato es completar las piezas abiertas y, a partir de ahí, ${joinEs(retos)}.`)
  }

  blocks.push({ type: 'note', text: 'Nota: este informe interpreta la información registrada en el cronograma de la plataforma operativa interna de IGLU hasta la fecha de descarga. El detalle completo de cada pieza se presenta en la tabla de la página siguiente.' })

  return { blocks, stats: a }
}

// Texto por defecto de la "Nota importante" de la tabla, cuando no se escribió una
export function notaAutomatica(stats, periodLabel) {
  if (!stats || !stats.total) return ''
  const completo = stats.publicadas.length === stats.total && stats.sinAprob.length === 0
  const lineas = [
    completo
      ? 'El contenido del cliente cumple con fechas de entrega, aprobación y programación.'
      : `El contenido del cliente registra ${stats.publicadas.length} de ${stats.total} piezas publicadas a la fecha.`,
    `En ${periodLabel.toLowerCase()}, se ${stats.publicadas.length === 1 ? 'ha' : 'han'} entregado ${formatoTxt(
      stats.publicadas.filter(r => r.tipo === 'post').length,
      stats.publicadas.filter(r => r.tipo === 'video').length,
      stats.publicadas.filter(r => r.tipo === 'otro').length,
    ) || '0 piezas'} correspondientes al plan contratado por el cliente.`,
    'Informe de pauta y resultados en documento anexo.',
  ]
  return lineas.join('\n')
}
