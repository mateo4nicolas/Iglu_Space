// supabase/functions/admin-create-user/index.ts
//
// Permite a un Administrador o Supervisor crear un nuevo usuario desde la
// pestaña de Equipo, usando la Auth Admin API con auto-confirmación (sin
// enviar ningún correo de verificación). El perfil (public.profiles) se
// crea solo por el trigger on_auth_user_created ya existente, con role
// 'user' por defecto — el flujo de cambio de rol en Equipo sigue igual.

import { serve } from 'https://deno.land/std@0.203.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    // 1. Verificar que quien llama está autenticado
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) throw new Error('No autorizado')

    const callerClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: { user: caller }, error: callerError } = await callerClient.auth.getUser()
    if (callerError || !caller) throw new Error('No autorizado')

    // 2. Verificar que quien llama es admin o supervisor (profiles.role='admin' o is_super_admin)
    const { data: callerProfile, error: profileError } = await callerClient
      .from('profiles')
      .select('role, is_super_admin')
      .eq('id', caller.id)
      .single()
    if (profileError || !callerProfile) throw new Error('No autorizado')
    const callerIsAdmin = callerProfile.role === 'admin' || callerProfile.is_super_admin === true
    if (!callerIsAdmin) throw new Error('Solo un administrador o supervisor puede crear usuarios')

    // 3. Validar datos de entrada
    const { email, password, full_name } = await req.json()
    if (!email || !String(email).trim()) throw new Error('El email es obligatorio')
    if (!password || String(password).length < 6) throw new Error('La contraseña debe tener al menos 6 caracteres')

    // 4. Crear el usuario con la Auth Admin API, autoconfirmado (sin email de verificación)
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email: String(email).trim(),
      password: String(password),
      email_confirm: true, // Auto confirm user — habilitado de inmediato, sin correo
      user_metadata: {
        full_name: (full_name && String(full_name).trim()) || String(email).trim(),
        role: 'user', // rol por defecto; se cambia luego desde la pestaña Equipo
      },
    })
    if (createError) throw new Error(createError.message)

    return new Response(JSON.stringify({ user: { id: created.user.id, email: created.user.email } }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
