import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = window.atob(base64)
  const outputArray = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; i++) outputArray[i] = rawData.charCodeAt(i)
  return outputArray
}

export function isIOSDevice() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream
}

export function isStandalonePWA() {
  return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true
}

export function pushSupported() {
  return 'serviceWorker' in navigator && 'PushManager' in window && !!VAPID_PUBLIC_KEY
}

export function usePushNotifications() {
  const { profile, isSuperAdmin } = useAuth()
  const [permission, setPermission] = useState(typeof Notification !== 'undefined' ? Notification.permission : 'default')
  const [subscribing, setSubscribing] = useState(false)
  const [subscribed, setSubscribed] = useState(false)
  const [checkingSub, setCheckingSub] = useState(true)

  // Solo usuarios y supervisores (no Admin/super admin)
  const eligible = !!profile && !isSuperAdmin

  const refreshPermission = useCallback(() => {
    if (typeof Notification !== 'undefined') setPermission(Notification.permission)
  }, [])

  const refreshSubscribed = useCallback(async () => {
    if (!pushSupported()) { setCheckingSub(false); return }
    try {
      const registration = await navigator.serviceWorker.getRegistration()
      const sub = registration ? await registration.pushManager.getSubscription() : null
      setSubscribed(!!sub)
    } catch (err) {
      setSubscribed(false)
    } finally {
      setCheckingSub(false)
    }
  }, [])

  useEffect(() => {
    refreshPermission()
    refreshSubscribed()
  }, [refreshPermission, refreshSubscribed])

  async function subscribe() {
    if (!eligible || !pushSupported() || !profile) return { error: new Error('No disponible') }
    setSubscribing(true)
    try {
      const result = await Notification.requestPermission()
      setPermission(result)
      if (result !== 'granted') return { error: new Error('Permiso denegado') }

      const registration = await navigator.serviceWorker.ready
      let sub = await registration.pushManager.getSubscription()
      if (!sub) {
        sub = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
        })
      }

      const json = sub.toJSON()
      const { error } = await supabase.from('push_subscriptions').upsert({
        user_id: profile.id,
        endpoint: json.endpoint,
        p256dh: json.keys?.p256dh,
        auth: json.keys?.auth,
        user_agent: navigator.userAgent,
      }, { onConflict: 'endpoint' })

      if (error) return { error }
      setSubscribed(true)
      return { error: null }
    } catch (err) {
      console.error('subscribe push error:', err)
      return { error: err }
    } finally {
      setSubscribing(false)
    }
  }

  async function unsubscribe() {
    if (!pushSupported()) return { error: new Error('No disponible') }
    setSubscribing(true)
    try {
      const registration = await navigator.serviceWorker.getRegistration()
      const sub = registration ? await registration.pushManager.getSubscription() : null
      if (sub) {
        const endpoint = sub.endpoint
        await sub.unsubscribe()
        await supabase.from('push_subscriptions').delete().eq('endpoint', endpoint)
      }
      setSubscribed(false)
      return { error: null }
    } catch (err) {
      console.error('unsubscribe push error:', err)
      return { error: err }
    } finally {
      setSubscribing(false)
    }
  }

  // Inserta una notificación de prueba para el usuario actual: recorre TODA
  // la cadena real (trigger → webhook → send-push → navegador), igual que
  // una notificación real de una tarea o un pendiente.
  async function testPush() {
    if (!profile) return { error: new Error('No hay sesión') }
    const { error } = await supabase.from('notifications').insert({
      user_id: profile.id,
      title: 'Notificación de prueba',
      body: 'Si ves esto, las notificaciones push están funcionando 🎉',
      type: 'info',
    })
    return { error }
  }

  // Re-suscripción silenciosa: si ya se otorgó el permiso antes (misma
  // sesión/dispositivo), no hace falta volver a pedirlo ni mostrar el banner.
  useEffect(() => {
    if (!eligible || !pushSupported()) return
    if (Notification.permission !== 'granted') return
    subscribe()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eligible, profile?.id])

  return { eligible, permission, subscribing, subscribed, checkingSub, subscribe, unsubscribe, testPush, refreshPermission, refreshSubscribed }
}
