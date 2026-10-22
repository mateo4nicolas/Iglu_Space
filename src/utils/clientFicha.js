// Enlaces del cliente: se muestran en la Tabla de resumen y en cada tarea
export const RESUMEN_LINKS = [
  { key: 'link_brief', label: 'Brief estrategia' },
  { key: 'link_tabla_productos', label: 'Tabla de productos' },
  { key: 'link_recursos', label: 'Recursos' },
  { key: 'link_malla', label: 'Malla' },
  { key: 'link_diseno', label: 'Diseño' },
  { key: 'link_guiones', label: 'Guion' },
  { key: 'link_produccion', label: 'Producción' },
  { key: 'link_videos', label: 'Videos' },
]

// Etiquetas del formulario de ficha
export const FICHA_LINK_LABELS = {
  link_brief: 'Link de estrategia (Brief)',
  link_tabla_productos: 'Link Tabla de productos',
  link_recursos: 'Link Recursos',
  link_malla: 'Link Malla',
  link_diseno: 'Link Diseño',
  link_guiones: 'Link Guiones',
  link_produccion: 'Link Producción',
  link_videos: 'Link Videos',
}

export const FICHA_TEXT_FIELDS = [
  { key: 'representante', label: 'Representante' },
  { key: 'quien_aprueba', label: 'Quién aprueba' },
  { key: 'tipo_plan', label: 'Tipo de plan' },
]

export const FICHA_DATE_FIELD = { key: 'fecha_publicacion', label: 'Fecha de publicación' }

// Columna INVERSIÓN: Fee | Ads | Retorno
export const FICHA_INVERSION_FIELDS = [
  { key: 'inversion_fee', label: 'Fee' },
  { key: 'inversion_ads', label: 'Ads' },
  { key: 'inversion_retorno', label: 'Retorno' },
]

export function fmtNumber(n) {
  if (n === null || n === undefined || n === '') return null
  return Number(n).toLocaleString('es-EC', { maximumFractionDigits: 2 })
}

export const FICHA_NUM_FIELDS = [
  { key: 'num_vectores', label: '# Vectores' },
  { key: 'num_posts', label: '# Post' },
  { key: 'num_videos', label: '# Videos' },
]

export function normalizeUrl(value) {
  const v = (value || '').trim()
  if (!v) return null
  return /^https?:\/\//i.test(v) ? v : `https://${v}`
}
