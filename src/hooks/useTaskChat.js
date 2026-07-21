import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

export function useTaskChat(taskId) {
  const { profile } = useAuth()
  const [messages, setMessages] = useState([])
  const [loading, setLoading] = useState(true)

  const fetchMessages = useCallback(async () => {
    if (!taskId) return
    const { data } = await supabase
      .from('task_messages')
      .select('*, profiles(id, full_name, display_name)')
      .eq('task_id', taskId)
      .order('created_at', { ascending: true })
    setMessages(data || [])
    setLoading(false)
  }, [taskId])

  useEffect(() => {
    fetchMessages()
    const channel = supabase.channel(`chat-${taskId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'task_messages', filter: `task_id=eq.${taskId}` }, payload => {
        supabase.from('task_messages').select('*, profiles(id, full_name, display_name)').eq('id', payload.new.id).single()
          .then(({ data }) => { if (data) setMessages(prev => (prev.some(m => m.id === data.id) ? prev : [...prev, data])) })
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'task_messages', filter: `task_id=eq.${taskId}` }, payload => {
        supabase.from('task_messages').select('*, profiles(id, full_name, display_name)').eq('id', payload.new.id).single()
          .then(({ data }) => { if (data) setMessages(prev => prev.map(m => (m.id === data.id ? data : m))) })
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'task_messages', filter: `task_id=eq.${taskId}` }, payload => {
        setMessages(prev => prev.filter(m => m.id !== payload.old.id))
      })
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [taskId, fetchMessages])

  async function sendMessage(content) {
    if (!content?.trim() || !profile) return
    await supabase.from('task_messages').insert({ task_id: taskId, user_id: profile.id, content: content.trim() })
  }

  async function editMessage(messageId, content) {
    if (!content?.trim() || !messageId) return { error: new Error('Contenido inválido') }
    const { error } = await supabase
      .from('task_messages')
      .update({ content: content.trim(), edited_at: new Date().toISOString() })
      .eq('id', messageId)
    if (!error) {
      // Actualización optimista por si el evento realtime tarda en llegar
      setMessages(prev => prev.map(m => (m.id === messageId ? { ...m, content: content.trim(), edited_at: new Date().toISOString() } : m)))
    }
    return { error: error || null }
  }

  async function deleteMessage(messageId) {
    if (!messageId) return { error: new Error('Mensaje inválido') }
    const { error } = await supabase.from('task_messages').delete().eq('id', messageId)
    if (!error) {
      // Actualización optimista por si el evento realtime tarda en llegar
      setMessages(prev => prev.filter(m => m.id !== messageId))
    }
    return { error: error || null }
  }

  async function sendFile(file) {
    if (!file || !profile) return { error: new Error('Archivo o usuario inválido') }

    // 1. Pedir a la Edge Function una URL prefirmada de subida hacia R2
    const { data: signed, error: signError } = await supabase.functions.invoke('r2-presign', {
      body: { fileName: file.name, fileType: file.type, fileSize: file.size, taskId },
    })
    if (signError || !signed?.uploadUrl) {
      return { error: signError || new Error('No se pudo preparar la subida') }
    }

    // 2. Subir el archivo directamente a R2 (no pasa por Supabase)
    let uploadRes
    try {
      uploadRes = await fetch(signed.uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': file.type || 'application/octet-stream' },
        body: file,
      })
    } catch (err) {
      return { error: err }
    }
    if (!uploadRes.ok) {
      return { error: new Error(`Error subiendo el archivo a R2 (${uploadRes.status})`) }
    }

    // 3. Guardar el mensaje con la URL pública de R2
    const isVideo = file.type.startsWith('video/')
    const { error } = await supabase.from('task_messages').insert({
      task_id: taskId,
      user_id: profile.id,
      content: null,
      attachment_url: signed.publicUrl,
      attachment_type: isVideo ? 'video' : 'image',
      attachment_name: file.name,
    })
    return { error: error || null }
  }

  // Sube varios archivos con concurrencia limitada (evita saturar el ancho de
  // banda cuando hay varios videos/fotos pesados a la vez, lo que en la práctica
  // termina siendo más rápido y estable que subir todo en paralelo sin límite).
  async function sendFiles(files, onProgress, concurrency = 3) {
    const list = Array.from(files || [])
    let cursor = 0
    async function worker() {
      while (cursor < list.length) {
        const file = list[cursor++]
        const { error } = await sendFile(file)
        onProgress?.(file, error ? 'error' : 'done', error)
      }
    }
    const workers = Array.from({ length: Math.min(concurrency, list.length) }, worker)
    await Promise.all(workers)
  }

  return { messages, loading, sendMessage, sendFile, sendFiles, editMessage, deleteMessage }
}
