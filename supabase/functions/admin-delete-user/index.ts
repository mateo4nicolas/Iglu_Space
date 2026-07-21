// supabase/functions/admin-delete-user/index.ts
//
// Permite a un Administrador o Supervisor eliminar un usuario desde la
// pestaña de Equipo, usando la Auth Admin API. Al borrar el usuario de
// auth.users, public.profiles se borra en cascada automáticamente.

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

    // 2. Verificar que quien llama es admin o supervisor
    const { data: callerProfile, error: profileError } = await callerClient
      .from('profiles')
      .select('role, is_super_admin')
      .eq('id', caller.id)
      .single()
    if (profileError || !callerProfile) throw new Error('No autorizado')
    const callerIsAdmin = callerProfile.role === 'admin' || callerProfile.is_super_admin === true
    if (!callerIsAdmin) throw new Error('Solo un administrador o supervisor puede eliminar usuarios')

    // 3. Validar entrada
    const { user_id } = await req.json()
    if (!user_id) throw new Error('Falta el ID del usuario a eliminar')
    if (user_id === caller.id) throw new Error('No puedes eliminar tu propia cuenta')

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    // 4. Protección: no permitir borrar a otro Admin (is_super_admin) a menos
    //    que quien borra también sea Admin. Un Supervisor no puede borrar Admins.
    const { data: targetProfile } = await admin
      .from('profiles')
      .select('is_super_admin')
      .eq('id', user_id)
      .single()
    if (targetProfile?.is_super_admin && !callerProfile.is_super_admin) {
      throw new Error('Solo un Administrador puede eliminar a otro Administrador')
    }

    // 5. Eliminar el usuario (borra también su perfil por cascada)
    const { error: deleteError } = await admin.auth.admin.deleteUser(user_id)
    if (deleteError) throw new Error(deleteError.message)

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
