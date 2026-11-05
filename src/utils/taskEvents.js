// Aviso global de "las tareas cambiaron": cada tablero (Departamentos,
// Vista Clientes, Matriz, Cronograma) tiene su propio hook con su propia copia
// de las tareas. Al guardar en uno, los demás se refrescan al instante sin
// depender de que Supabase Realtime esté habilitado para la tabla tasks.
import { useEffect, useRef } from 'react'

const EVENT = 'iglu:tasks-changed'

export function notifyTasksChanged() {
  try { window.dispatchEvent(new Event(EVENT)) } catch { /* noop */ }
}

export function useTasksChanged(callback) {
  const cbRef = useRef(callback)
  cbRef.current = callback
  useEffect(() => {
    const handler = () => cbRef.current?.()
    window.addEventListener(EVENT, handler)
    return () => window.removeEventListener(EVENT, handler)
  }, [])
}
