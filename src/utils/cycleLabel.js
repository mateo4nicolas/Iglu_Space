// src/utils/cycleLabel.js
//
// Da formato a un "mes base" (YYYY-MM) según el ciclo de facturación del
// cliente:
//   - periodo "1_31"  -> "Julio 2026"
//   - periodo "15_14" -> "15 Jul - 14 Ago 2026"
//
// El mes base guardado en BD (tasks.mes_tarea, clients relacionados, etc.)
// siempre es el mes de INICIO del ciclo, sin importar el periodo.

const MONTH_ABBR = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
const MONTH_FULL = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]

/**
 * @param {string} mesBase - "YYYY-MM", mes de inicio del ciclo
 * @param {'1_31'|'15_14'|null|undefined} periodo
 * @returns {string|null}
 */
export function cycleLabel(mesBase, periodo) {
  if (!mesBase) return null
  const [y, m] = mesBase.split('-').map(Number)
  if (!y || !m) return mesBase

  if (periodo === '15_14') {
    const startAbbr = MONTH_ABBR[m - 1]
    const endDate = new Date(y, m, 1) // mes siguiente (Date normaliza diciembre -> enero del año siguiente)
    const endAbbr = MONTH_ABBR[endDate.getMonth()]
    const endYear = endDate.getFullYear()
    return `15 ${startAbbr} - 14 ${endAbbr}${endYear !== y ? ` ${endYear}` : ''}`
  }

  return `${MONTH_FULL[m - 1]} ${y}`
}

/** Igual que cycleLabel pero siempre en minúscula tipo "julio de 2026" / "15 jul - 14 ago 2026", para texto corrido. */
export function cycleLabelLower(mesBase, periodo) {
  const label = cycleLabel(mesBase, periodo)
  if (!label) return label
  if (periodo === '15_14') return label.toLowerCase()
  const [monthName, year] = label.split(' ')
  return `${monthName.toLowerCase()} de ${year}`
}

/** Devuelve el mes base (YYYY-MM) actual. */
export function currentMesBase(date = new Date()) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  return `${y}-${m}`
}

/** Suma/resta meses a un mes base (YYYY-MM). */
export function shiftMesBase(mesBase, delta) {
  const [y, m] = mesBase.split('-').map(Number)
  const d = new Date(y, m - 1 + delta, 1)
  return currentMesBase(d)
}
