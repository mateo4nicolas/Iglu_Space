import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

export function useNotifications() {
  const { profile } = useAuth()
  const [notifications, setNotifications] = useState([])
  const [unreadCount, setUnreadCount] = useState(0)

  const fetchNotifications = useCallback(async () => {
    if (!profile) return
    const { data } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', profile.id)
      .order('created_at', { ascending: false })
      .limit(40)
    setNotifications(data || [])
    setUnreadCount((data || []).filter(n => !n.read).length)
  }, [profile])

  useEffect(() => {
    fetchNotifications()

    const channel = supabase
      .channel(`notifications-${profile?.id}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'notifications',
        filter: `user_id=eq.${profile?.id}`,
      }, payload => {
        const n = payload.new
        setNotifications(prev => [n, ...prev])
        setUnreadCount(prev => prev + 1)
        showPushNotification(n.title, n.body)
        showInAppToast(n)
      })
      .subscribe()

    return () => supabase.removeChannel(channel)
  }, [profile?.id, fetchNotifications])

  async function markRead(id) {
    await supabase.from('notifications').update({ read: true }).eq('id', id)
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n))
    setUnreadCount(prev => Math.max(0, prev - 1))
  }

  async function markAllRead() {
    if (!profile) return
    await supabase.from('notifications').update({ read: true }).eq('user_id', profile.id).eq('read', false)
    setNotifications(prev => prev.map(n => ({ ...n, read: true })))
    setUnreadCount(0)
  }

  return { notifications, unreadCount, markRead, markAllRead, refetch: fetchNotifications }
}

// Push notification (browser)
export async function requestPushPermission() {
  if (!('Notification' in window)) return false
  if (Notification.permission === 'granted') return true
  const result = await Notification.requestPermission()
  return result === 'granted'
}

function showPushNotification(title, body) {
  if (typeof window === 'undefined') return
  if (!('Notification' in window)) return
  if (Notification.permission !== 'granted') return
  if (document.visibilityState === 'visible') return // solo cuando la app no está en foco
  try {
    new Notification(title, {
      body: body || '',
      icon: '/favicon.ico',
      badge: '/favicon.ico',
    })
  } catch (e) {}
}

// In-app toast (emitimos un evento custom que el componente Toast escucha)
function showInAppToast(notification) {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent('teamflow:toast', { detail: notification }))
}
