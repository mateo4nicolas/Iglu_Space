import { Component } from 'react'

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null, info: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, info) {
    console.error('App crashed:', error, info)
    this.setState({ info })
  }

  handleReload = () => {
    try {
      window.localStorage.removeItem('teamflow-auth-v1')
    } catch (e) {}
    window.location.reload()
  }

  render() {
    if (this.state.hasError) {
      const message = this.state.error?.message || String(this.state.error) || 'Error desconocido'
      const stack = this.state.error?.stack || ''
      const componentStack = this.state.info?.componentStack || ''

      return (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          minHeight: '100dvh',
          padding: 20,
          textAlign: 'center',
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
          background: '#f8f9fb',
          color: '#0f1117',
          boxSizing: 'border-box',
          overflowY: 'auto',
        }}>
          <div style={{ marginTop: 60 }}>
            <p style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>
              Algo salió mal
            </p>
            <p style={{ fontSize: 13, color: '#4b5263', marginBottom: 16, maxWidth: 320 }}>
              Hubo un problema al cargar la aplicación. Envía una foto de este mensaje:
            </p>
          </div>

          <div style={{
            background: '#fff0f0',
            border: '1px solid #f3b8b8',
            borderRadius: 10,
            padding: 14,
            textAlign: 'left',
            width: '100%',
            maxWidth: 480,
            marginBottom: 16,
          }}>
            <p style={{ fontSize: 12.5, fontWeight: 700, color: '#b91c1c', marginBottom: 6 }}>
              {message}
            </p>
            {stack && (
              <pre style={{
                fontSize: 10.5,
                color: '#7f1d1d',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                margin: 0,
                fontFamily: 'monospace',
                maxHeight: 220,
                overflowY: 'auto',
              }}>
                {stack}
              </pre>
            )}
            {componentStack && (
              <pre style={{
                fontSize: 10,
                color: '#9a3412',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                marginTop: 8,
                fontFamily: 'monospace',
                maxHeight: 150,
                overflowY: 'auto',
              }}>
                {componentStack}
              </pre>
            )}
          </div>

          <button
            onClick={this.handleReload}
            style={{
              background: '#5b5fcf',
              color: '#fff',
              border: 'none',
              padding: '10px 24px',
              borderRadius: 10,
              fontSize: 14,
              fontWeight: 500,
              cursor: 'pointer',
              marginBottom: 40,
            }}
          >
            Recargar
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
