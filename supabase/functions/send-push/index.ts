// supabase/functions/send-push/index.ts
//
// Se dispara automáticamente vía Database Webhook cada vez que se inserta
// una fila en `public.notifications` (pendiente asignado, tarea movida,
// grabación asignada, etc.) y envía una notificación push real (llega aunque
// el navegador/PWA esté cerrado) a todos los dispositivos suscritos de ese
// usuario. Solo se envía a usuarios y supervisores (no a Admin/super admin).

import { serve } from 'https://deno.land/std@0.203.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'
import webpush from 'npm:web-push@3.6.7'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const VAPID_PUBLIC_KEY = Deno.env.get('VAPID_PUBLIC_KEY')!
const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY')!
const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT') || 'mailto:soporte@iglu.digital'

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY)

const REFERENCE_URL: Record<string, string> = {
  task: '/tareas',
  schedule_item: '/cronograma',
  recording: '/grabaciones',
}

serve(async (req) => {
  try {
    const payload = await req.json()
    const record = payload?.record
    if (!record?.user_id) return new Response('ok', { status: 200 })

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    // Solo push para usuarios y supervisores (no Admin/super admin)
    const { data: recipient } = await supabase
      .from('profiles')
      .select('is_super_admin')
      .eq('id', record.user_id)
      .single()
    if (!recipient || recipient.is_super_admin) {
      return new Response('skip: admin', { status: 200 })
    }

    const { data: subs } = await supabase
      .from('push_subscriptions')
      .select('*')
      .eq('user_id', record.user_id)
    if (!subs || subs.length === 0) return new Response('skip: sin suscripciones', { status: 200 })

    const url = REFERENCE_URL[record.reference_type] || '/dashboard'
    const payloadStr = JSON.stringify({
      title: record.title,
      body: record.body || '',
      url,
      tag: record.type,
    })

    const results = await Promise.allSettled(
      subs.map((sub: any) =>
        webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payloadStr
        ).catch(async (err: any) => {
          // Suscripción vencida/inválida -> se elimina para no reintentar
          if (err?.statusCode === 404 || err?.statusCode === 410) {
            await supabase.from('push_subscriptions').delete().eq('id', sub.id)
          }
          throw err
        })
      )
    )

    return new Response(JSON.stringify({ sent: results.length }), {
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('send-push error:', err)
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 })
  }
})
