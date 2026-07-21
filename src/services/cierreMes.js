import { supabase } from '../lib/supabase'

/**
 * Ejecuta el cierre de mes para un cliente específico:
 * congela el estado actual de sus tareas en `historial_matriz`
 * y resetea esas tareas a su estado inicial para el nuevo periodo.
 * No afecta tareas de otros clientes.
 *
 * @param {string} clienteId - id del cliente a cerrar
 * @param {string} mesAno - periodo auditado, ej: "2026-07"
 * @returns {Promise<{ data: number|null, error: Error|null }>} data = nº de tareas congeladas/reseteadas
 */
export async function handleCierreMesCliente(clienteId, mesAno) {
  if (!clienteId) {
    return { data: null, error: new Error('clienteId es obligatorio') }
  }
  if (!mesAno) {
    return { data: null, error: new Error('mesAno es obligatorio') }
  }

  const { data, error } = await supabase.rpc('handle_cierre_mes_cliente', {
    p_cliente_id: clienteId,
    p_mes_ano: mesAno,
  })

  if (error) {
    console.error('handleCierreMesCliente error:', error)
    return { data: null, error }
  }

  return { data, error: null }
}

/** Devuelve el periodo actual en formato "YYYY-MM". */
export function currentMesAno(date = new Date()) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  return `${y}-${m}`
}

/** Trae el historial de cierres de un cliente (o de todos si no se pasa clienteId). */
export async function fetchHistorialMatriz({ clienteId, mesAno } = {}) {
  let query = supabase
    .from('historial_matriz')
    .select('*, clients(id, brand_name, billing_period)')
    .order('created_at', { ascending: false })

  if (clienteId) query = query.eq('cliente_id', clienteId)
  if (mesAno) query = query.eq('mes_ano', mesAno)

  const { data, error } = await query
  if (error) console.error('fetchHistorialMatriz error:', error)
  return { data: data || [], error }
}
