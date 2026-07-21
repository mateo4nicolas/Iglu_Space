// supabase/functions/r2-presign/index.ts
//
// Genera una URL prefirmada (PUT) para subir un archivo directamente a
// Cloudflare R2 desde el navegador, sin pasar el archivo por Supabase.
// El cliente llama a esta función, sube el archivo con fetch(PUT) a la
// uploadUrl devuelta, y luego guarda publicUrl en la fila del mensaje.

import { serve } from 'https://deno.land/std@0.203.0/http/server.ts'
import { AwsClient } from 'https://esm.sh/aws4fetch@1.0.17'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'

const R2_ACCOUNT_ID = Deno.env.get('R2_ACCOUNT_ID')!
const R2_ACCESS_KEY_ID = Deno.env.get('R2_ACCESS_KEY_ID')!
const R2_SECRET_ACCESS_KEY = Deno.env.get('R2_SECRET_ACCESS_KEY')!
const R2_BUCKET_NAME = Deno.env.get('R2_BUCKET_NAME')!
const R2_PUBLIC_URL = Deno.env.get('R2_PUBLIC_URL')! // ej: https://media.tudominio.com (sin / al final)

// Estas dos las inyecta Supabase automáticamente en cada función
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const MAX_FILE_SIZE = 500 * 1024 * 1024 // 500MB, igual que el límite del frontend
const ALLOWED_PREFIXES = ['image/', 'video/']

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    // 1. Verificar que quien llama es un usuario autenticado de Supabase
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) throw new Error('No autorizado')

    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) throw new Error('No autorizado')

    // 2. Leer y validar los datos del archivo a subir
    const { fileName, fileType, fileSize, taskId } = await req.json()
    if (!fileName || !taskId) throw new Error('fileName y taskId son obligatorios')
    if (!fileType || !ALLOWED_PREFIXES.some(p => fileType.startsWith(p))) {
      throw new Error('Solo se permiten imágenes o videos')
    }
    if (fileSize && fileSize > MAX_FILE_SIZE) {
      throw new Error('El archivo supera el límite de 500MB')
    }

    const ext = (fileName.split('.').pop() || 'bin').toLowerCase()
    const uniqueSuffix = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}`
    const key = `task-attachments/${taskId}/${uniqueSuffix}.${ext}`

    // 3. Firmar la URL de subida directa (PUT) hacia el bucket de R2
    const r2 = new AwsClient({
      accessKeyId: R2_ACCESS_KEY_ID,
      secretAccessKey: R2_SECRET_ACCESS_KEY,
      service: 's3',
      region: 'auto',
    })

    const objectUrl = `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${R2_BUCKET_NAME}/${key}`

    const signedRequest = await r2.sign(objectUrl, {
      method: 'PUT',
      headers: { 'Content-Type': fileType },
      aws: { signQuery: true },
    })

    return new Response(JSON.stringify({
      uploadUrl: signedRequest.url,
      publicUrl: `${R2_PUBLIC_URL}/${key}`,
      path: key,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
