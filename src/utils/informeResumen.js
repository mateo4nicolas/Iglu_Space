// Genera el mismo tipo de resumen narrativo que traía el HTML original,
// a partir de las filas ya resueltas (con su fecha de aprobación conectada
// a la Matriz cuando aplica). Los números van marcados con **negrita** para
// que el componente que lo pinta los resalte.

function joinEs(arr) {
  const list = arr.filter(Boolean)
  if (list.length === 0) return ''
  if (list.length === 1) return list[0]
  return list.slice(0, -1).join(', ') + ' y ' + list[list.length - 1]
}

function pctOf(part, total) { return total ? Math.round((part / total) * 100) : 0 }

function fmtDMY(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString('es-EC', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

const ACTIVITY_PHRASES = {
  'Tabla productos': 'la entrega de la tabla de productos',
  'Aprobación mallas': 'la aprobación de mallas',
  'Aprobación guiones': 'la aprobación de guiones',
  'Producción': 'la producción',
}

function computeStats(rows, networks) {
  const bySeccion = {}
  rows.forEach(r => {
    if (!bySeccion[r.seccionId]) bySeccion[r.seccionId] = { label: r.seccionLabel, rows: [] }
    bySeccion[r.seccionId].rows.push(r)
  })
  const perSection = Object.values(bySeccion).map(s => {
    const registradas = s.rows.filter(r => r.codigo || r.creativo)
    const conAprob = registradas.filter(r => r.aprobacionFecha)
    return { label: s.label, total: registradas.length, conAprob: conAprob.length, pendientes: registradas.length - conAprob.length }
  })
  const totalReg = perSection.reduce((a, s) => a + s.total, 0)
  const totalPend = perSection.reduce((a, s) => a + s.pendientes, 0)

  const perNet = networks.map(net => {
    const dates = rows.map(r => r[net.field + '_fecha']).filter(Boolean).map(d => new Date(d)).filter(d => !Number.isNaN(d.getTime()))
    const min = dates.length ? new Date(Math.min(...dates)) : null
    const max = dates.length ? new Date(Math.max(...dates)) : null
    return { label: net.label, count: dates.length, min, max }
  })
  const totalPub = perNet.reduce((a, n) => a + n.count, 0)

  const withObs = rows.filter(r => r.observaciones)

  return { perSection, totalReg, totalPend, perNet, totalPub, withObs }
}

export function buildResumen({ clientName, periodLabel, rows, networks, activityRows }) {
  const stats = computeStats(rows, networks)
  const out = { estadoGeneral: [], publicacionesPorRed: [], actividad: [], observaciones: { intro: '', items: [], moreCount: 0 } }

  const totalReg = stats.totalReg
  const totalPend = stats.totalPend
  const totalAprob = totalReg - totalPend
  const seccionesTxt = stats.perSection.filter(s => s.total > 0).map(s => `**${s.total}** en ${s.label.toLowerCase()}`)

  if (totalReg === 0) {
    out.estadoGeneral.push(`Por el momento no hay piezas de contenido registradas para **${clientName}** en ${periodLabel}: la tabla está lista para empezar a llenarse a medida que se defina el plan del periodo.`)
  } else {
    out.estadoGeneral.push(`Durante ${periodLabel} se registraron **${totalReg}** ${totalReg === 1 ? 'pieza de contenido' : 'piezas de contenido'} para **${clientName}**${seccionesTxt.length ? `, distribuidas entre ${joinEs(seccionesTxt)}.` : '.'}`)

    let estadoAprobTxt
    if (totalPend === 0) {
      estadoAprobTxt = 'El flujo de aprobaciones está al día: la totalidad de las piezas registradas cuenta ya con fecha de aprobación confirmada.'
    } else if (totalAprob === 0) {
      estadoAprobTxt = `Ninguna de ellas cuenta todavía con fecha de aprobación — las **${totalPend}** siguen pendientes, por lo que conviene priorizar su revisión antes de avanzar con la programación.`
    } else {
      estadoAprobTxt = `De estas, **${totalAprob}** (${pctOf(totalAprob, totalReg)}%) ya cuentan con fecha de aprobación confirmada, mientras que **${totalPend}** ${totalPend === 1 ? 'continúa pendiente' : 'continúan pendientes'}${totalPend >= totalAprob ? ', una proporción todavía alta que vale la pena dar seguimiento antes del cierre del periodo.' : '.'}`
    }
    out.estadoGeneral.push(estadoAprobTxt)

    let estadoPubTxt
    if (stats.totalPub === 0) {
      estadoPubTxt = 'En cuanto a la programación en redes, todavía no se ha definido ninguna fecha de publicación para el contenido registrado.'
    } else if (stats.totalPub >= totalReg) {
      estadoPubTxt = `En cuanto a la programación, ya se definieron **${stats.totalPub}** fechas de publicación en total, lo que cubre la totalidad del contenido registrado.`
    } else {
      estadoPubTxt = `En cuanto a la programación, se han definido **${stats.totalPub}** fechas de publicación hasta ahora, por lo que todavía resta programar fecha para parte del contenido registrado.`
    }
    out.estadoGeneral.push(estadoPubTxt)
  }

  // Publicaciones por red
  if (stats.totalPub === 0) {
    out.publicacionesPorRed.push(`Ninguna de las redes con las que trabaja **${clientName}** (${joinEs(networks.map(n => n.label))}) tiene todavía publicaciones con fecha programada para este periodo.`)
  } else {
    const netSentences = stats.perNet.map(n => {
      if (!n.count) return `${n.label} no registra fechas programadas todavía`
      return `${n.label} tiene **${n.count}** programada${n.count === 1 ? '' : 's'}, entre el ${fmtDMY(n.min)} y el ${fmtDMY(n.max)}`
    })
    out.publicacionesPorRed.push(`La programación por red se distribuye así: ${netSentences.join('; ')}.`)

    const activos = stats.perNet.filter(n => n.count > 0)
    const lider = [...activos].sort((a, b) => b.count - a.count)[0]
    const empatados = activos.filter(n => n.count === lider.count)
    let lideresTxt
    if (empatados.length > 1) {
      lideresTxt = `${joinEs(empatados.map(n => n.label))} concentran el mayor volumen de publicaciones, con ${lider.count} cada una.`
    } else {
      lideresTxt = `${lider.label} concentra el mayor volumen de publicaciones programadas en el periodo.`
    }
    const sinRed = stats.perNet.filter(n => n.count === 0)
    out.publicacionesPorRed.push(lideresTxt + (sinRed.length ? ` ${joinEs(sinRed.map(n => n.label))} ${sinRed.length === 1 ? 'queda' : 'quedan'} sin programación por ahora.` : ''))
  }

  // Actividad
  const actSentences = activityRows.map(a => {
    const phrase = ACTIVITY_PHRASES[a.label] || a.label.toLowerCase()
    const phraseCap = phrase.charAt(0).toUpperCase() + phrase.slice(1)
    if (!a.date) return `${phraseCap} todavía no tiene fecha registrada${a.note ? ` (nota: ${a.note})` : ''}.`
    return `${phraseCap} quedó registrada para el ${fmtDMY(a.date)}${a.note ? ` — ${a.note}` : ''}.`
  })
  out.actividad.push(actSentences.join(' '))

  const actConDate = activityRows.filter(a => a.date).length
  let actCierre
  if (actConDate === activityRows.length) {
    actCierre = `En conjunto, los ${activityRows.length} hitos de producción ya cuentan con fecha registrada.`
  } else if (actConDate === 0) {
    actCierre = 'En conjunto, ninguno de los hitos de producción tiene todavía fecha registrada.'
  } else {
    actCierre = `En conjunto, ${actConDate} de los ${activityRows.length} hitos ya cuentan con fecha registrada; el resto sigue pendiente de definir.`
  }
  out.actividad.push(actCierre)

  // Observaciones
  if (stats.withObs.length) {
    out.observaciones.intro = `Se registraron observaciones puntuales en **${stats.withObs.length}** ${stats.withObs.length === 1 ? 'pieza' : 'piezas'} del periodo, que conviene tener presentes de cara al seguimiento:`
    out.observaciones.items = stats.withObs.slice(0, 6).map(r => ({ codigo: r.codigo || r.creativo || '(sin código)', texto: r.observaciones }))
    out.observaciones.moreCount = Math.max(0, stats.withObs.length - 6)
  } else {
    out.observaciones.intro = 'No se registraron observaciones puntuales sobre las piezas de este periodo.'
  }

  return out
}
