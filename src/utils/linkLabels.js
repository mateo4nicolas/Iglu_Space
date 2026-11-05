// Etiqueta corta según la plataforma de un enlace (Instagram 1, Drive, TikTok…).
// El URL completo queda en el tooltip y como hipervínculo.
const LINK_PLATFORMS = [
  [/instagram\.com/i, 'Instagram'],
  [/tiktok\.com/i, 'TikTok'],
  [/(facebook\.com|fb\.watch|fb\.com)/i, 'Facebook'],
  [/(youtube\.com|youtu\.be)/i, 'YouTube'],
  [/(drive|docs)\.google\.com/i, 'Drive'],
  [/canva\.(com|link)/i, 'Canva'],
  [/(linkedin\.com|lnkd\.in)/i, 'LinkedIn'],
  [/(twitter\.com|x\.com)/i, 'X'],
  [/(wa\.me|whatsapp\.com)/i, 'WhatsApp'],
  [/(dropbox\.com)/i, 'Dropbox'],
  [/(figma\.com)/i, 'Figma'],
]
export function linkLabels(urls) {
  const base = (urls || []).map(u => (LINK_PLATFORMS.find(([re]) => re.test(u)) || [null, 'Enlace'])[1])
  const totals = base.reduce((acc, l) => ({ ...acc, [l]: (acc[l] || 0) + 1 }), {})
  const seen = {}
  return base.map(l => {
    seen[l] = (seen[l] || 0) + 1
    return totals[l] > 1 ? `${l} ${seen[l]}` : l
  })
}

