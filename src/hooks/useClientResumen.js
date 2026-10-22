import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'

// Enlaces actuales del cliente (lectura para todo el equipo). Se consulta en vivo,
// así las tareas existentes y nuevas siempre muestran lo último de la ficha.
export function useClientResumen(clienteId) {
  const [links, setLinks] = useState(null)

  const fetchLinks = useCallback(async () => {
    if (!clienteId) { setLinks(null); return }
    const { data } = await supabase.from('client_resumen').select('*').eq('client_id', clienteId).maybeSingle()
    setLinks(data || {})
  }, [clienteId])

  useEffect(() => {
    fetchLinks()
    if (!clienteId) return
    const channel = supabase
      .channel(`client-resumen-${clienteId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'clients', filter: `id=eq.${clienteId}` }, fetchLinks)
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [clienteId, fetchLinks])

  return links
}
