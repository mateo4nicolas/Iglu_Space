// Genera el PDF del Informe de Contenidos:
//   1) Informe ejecutivo en hojas A4 verticales con la plantilla de fondo.
//      Los bloques (párrafos, KPIs, viñetas) se reparten entre hojas sin
//      partirse; un título nunca queda solo al final de una hoja.
//   2) Tabla completa en hoja A4 horizontal, sin fondo, ajustada al ancho
//      (si no entra, se reduce para caber en una sola hoja; si es muy larga,
//      continúa en otra hoja repitiendo el encabezado). Enlaces clicables.

const A4 = { w: 595.28, h: 841.89 }
const PAGE_PX = { w: 780, h: 1102 } // 1055 x 1491 (proporción de la plantilla)

function collectLinks(el) {
  const box = el.getBoundingClientRect()
  return Array.from(el.querySelectorAll('a[data-pdf-link]')).map(a => {
    const r = a.getBoundingClientRect()
    return { url: a.getAttribute('data-pdf-link'), x: r.left - box.left, y: r.top - box.top, w: r.width, h: r.height }
  }).filter(l => l.w > 0 && l.h > 0)
}

export async function generarInformePdf({ contentEl, tableEl, pageClass, pageContentClass, compactClass, fileName }) {
  const [{ default: html2canvas }, jspdfMod] = await Promise.all([import('html2canvas'), import('jspdf')])
  const jsPDF = jspdfMod.jsPDF || jspdfMod.default
  try { await document.fonts?.ready } catch { /* noop */ }

  const capture = (el, w, h) => html2canvas(el, {
    scale: 2, useCORS: true, backgroundColor: '#ffffff', logging: false,
    width: w, height: h, windowWidth: w, windowHeight: h,
  })
  const doc = new jsPDF({ unit: 'pt', format: 'a4', orientation: 'portrait' })

  // ── 1. Informe ejecutivo ──
  const host = document.createElement('div')
  host.style.cssText = 'position:absolute;left:-100000px;top:0;'
  document.body.appendChild(host)
  try {
    // Reparte los bloques en hojas; si no entra en 2 hojas, reintenta en versión compacta
    function paginate(extraClass) {
      host.innerHTML = ''
      const pages = []
      const newPage = () => {
        const page = document.createElement('div')
        page.className = pageClass
        const inner = document.createElement('div')
        inner.className = `${contentEl.className} ${pageContentClass} ${extraClass || ''}`
        page.appendChild(inner)
        host.appendChild(page)
        pages.push(page)
        return inner
      }
      let inner = newPage()
      for (const block of Array.from(contentEl.children)) {
        const clone = block.cloneNode(true)
        inner.appendChild(clone)
        if (inner.scrollHeight > inner.clientHeight + 1 && inner.children.length > 1) {
          inner.removeChild(clone)
          const carry = []
          while (inner.children.length > 1 && inner.lastElementChild?.getAttribute('data-block') === 'h') {
            carry.unshift(inner.removeChild(inner.lastElementChild))
          }
          inner = newPage()
          carry.forEach(c => inner.appendChild(c))
          inner.appendChild(clone)
        }
      }
      return pages
    }
    let pages = paginate('')
    if (pages.length > 2 && compactClass) pages = paginate(compactClass)
    for (let i = 0; i < pages.length; i++) {
      if (i > 0) doc.addPage([A4.w, A4.h], 'portrait')
      const canvas = await capture(pages[i], PAGE_PX.w, PAGE_PX.h)
      doc.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, A4.w, A4.h)
    }
  } finally {
    host.remove()
  }

  // ── 2. Tabla completa (horizontal, sin fondo) ──
  if (tableEl) {
    doc.addPage([A4.w, A4.h], 'landscape')
    const pageW = A4.h, pageH = A4.w, M = 22
    const availW = pageW - 2 * M, availH = pageH - 2 * M
    const fullW = Math.max(tableEl.scrollWidth, tableEl.offsetWidth)
    const fullH = Math.max(tableEl.scrollHeight, tableEl.offsetHeight)
    let k = availW / fullW // pt por px

    if (fullH * k <= availH || availH / (fullH * k) >= 0.72) {
      // Cabe en una hoja (reduciendo un poco si hace falta)
      if (fullH * k > availH) k = availH / fullH
      const canvas = await capture(tableEl, fullW, fullH)
      const x = M + (availW - fullW * k) / 2
      doc.addImage(canvas.toDataURL('image/jpeg', 0.95), 'JPEG', x, M, fullW * k, fullH * k)
      collectLinks(tableEl).forEach(l => {
        try { doc.link(x + l.x * k, M + l.y * k, l.w * k, l.h * k, { url: l.url }) } catch { /* noop */ }
      })
    } else {
      // Muy larga: continúa en más hojas, sin partir secciones y repitiendo el encabezado
      let cursorY = M
      const theadEl = tableEl.querySelector('thead')
      let headCanvas = null, headH = 0

      async function place(el, { repeatHead } = {}) {
        const w = fullW
        const h = Math.max(el.scrollHeight, el.offsetHeight)
        const links = collectLinks(el)
        const canvas = await capture(el, w, h)
        if (cursorY > M && cursorY + h * k > M + availH) {
          doc.addPage([A4.w, A4.h], 'landscape')
          cursorY = M
          if (repeatHead && headCanvas) {
            doc.addImage(headCanvas.toDataURL('image/jpeg', 0.95), 'JPEG', M, cursorY, availW, headH * k)
            cursorY += headH * k
          }
        }
        doc.addImage(canvas.toDataURL('image/jpeg', 0.95), 'JPEG', M, cursorY, availW, h * k)
        links.forEach(l => {
          try { doc.link(M + l.x * k, cursorY + l.y * k, l.w * k, l.h * k, { url: l.url }) } catch { /* noop */ }
        })
        cursorY += h * k
        return canvas
      }

      const headBlock = tableEl.querySelector('[data-pdf-block="head"]')
      if (headBlock) await place(headBlock)
      if (theadEl) {
        headH = Math.max(theadEl.scrollHeight, theadEl.offsetHeight)
        headCanvas = await place(theadEl)
      }
      for (const tb of Array.from(tableEl.querySelectorAll('tbody[data-pdf-section]'))) {
        await place(tb, { repeatHead: true })
      }
      const noteEl = tableEl.querySelector('[data-pdf-block="note"]')
      if (noteEl) await place(noteEl)
    }
  }

  doc.save(fileName)
}
