import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import ErrorBoundary from './ErrorBoundary.jsx'
import './index.css'

function showFatalError(message, stack) {
  var rootEl = document.getElementById('root')
  if (!rootEl) return
  var safeMsg = String(message || 'Error desconocido')
  var safeStack = String(stack || '')
  rootEl.innerHTML =
    '<div style="display:flex;flex-direction:column;align-items:center;min-height:100vh;padding:20px;text-align:center;font-family:-apple-system,sans-serif;box-sizing:border-box;overflow-y:auto;">' +
    '<div style="margin-top:60px;">' +
    '<p style="font-size:16px;font-weight:600;margin-bottom:8px;">No se pudo cargar la app</p>' +
    '<p style="font-size:13px;color:#666;margin-bottom:16px;max-width:320px;">Env&iacute;a una foto de este mensaje:</p>' +
    '</div>' +
    '<div style="background:#fff0f0;border:1px solid #f3b8b8;border-radius:10px;padding:14px;text-align:left;width:100%;max-width:480px;margin-bottom:16px;box-sizing:border-box;">' +
    '<p style="font-size:12.5px;font-weight:700;color:#b91c1c;margin:0 0 6px;word-break:break-word;">' + safeMsg + '</p>' +
    '<pre style="font-size:10.5px;color:#7f1d1d;white-space:pre-wrap;word-break:break-word;margin:0;font-family:monospace;max-height:220px;overflow-y:auto;">' + safeStack + '</pre>' +
    '</div>' +
    '<button onclick="window.location.reload()" style="background:#5b5fcf;color:#fff;border:none;padding:10px 24px;border-radius:10px;font-size:14px;margin-bottom:40px;">Recargar</button>' +
    '</div>'
}

// Catch any error that happens before/outside React (module load crashes, etc.)
window.addEventListener('error', function (event) {
  console.error('Global error:', event.error || event.message)
  if (!document.getElementById('root')?.hasChildNodes() || document.getElementById('boot-fallback')) {
    showFatalError(event.message, event.error?.stack)
  }
})
window.addEventListener('unhandledrejection', function (event) {
  console.error('Unhandled rejection:', event.reason)
})

try {
  // Registrar el Service Worker (requerido para notificaciones push, incluso
  // con la app agregada a la pantalla de inicio en iPhone).
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('/sw.js').catch(function (err) {
        console.error('SW registration error:', err)
      })
    })
  }

  // Polyfill: Array.prototype.at (missing on some older Android WebViews)
  if (!Array.prototype.at) {
    Array.prototype.at = function (n) {
      n = Math.trunc(n) || 0
      if (n < 0) n += this.length
      if (n < 0 || n >= this.length) return undefined
      return this[n]
    }
  }

  // Polyfill: structuredClone (missing on Safari < 15.4, older Android browsers)
  if (typeof globalThis.structuredClone !== 'function') {
    globalThis.structuredClone = function (obj) {
      return JSON.parse(JSON.stringify(obj))
    }
  }

  var rootEl = document.getElementById('root')
  if (rootEl) {
    ReactDOM.createRoot(rootEl).render(
      React.createElement(
        React.StrictMode,
        null,
        React.createElement(
          ErrorBoundary,
          null,
          React.createElement(App, null)
        )
      )
    )
  }
} catch (err) {
  console.error('Mount error:', err)
  showFatalError(err?.message, err?.stack)
}
