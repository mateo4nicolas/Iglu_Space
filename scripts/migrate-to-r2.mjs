// scripts/migrate-to-r2.mjs
//
// Migra los archivos ya existentes en Supabase Storage (bucket
// "task-attachments") hacia Cloudflare R2, y actualiza la columna
// attachment_url en task_messages para que apunte a la nueva URL de R2.
//
// Este script corre en tu máquina local con Node.js, NUNCA en el navegador,
// así que aquí sí es seguro usar la Secret Key de R2 y el Service Role Key
// de Supabase (ambos dan acceso total, no deben ir a un repositorio público
// ni al frontend).
//
// USO:
//   1) npm install @supabase/supabase-js @aws-sdk/client-s3
//   2) Completa las 8 variables de abajo (o pásalas por variables de entorno)
//   3) node scripts/migrate-to-r2.mjs
//   4) Revisa el resumen final. Si dice 0 errores, puedes borrar el bucket
//      viejo en Supabase Storage con confianza.

import { createClient } from '@supabase/supabase-js'
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'

// ── Configuración ────────────────────────────────────────────────────────
// Rellena estos valores directamente O expórtalos como variables de entorno
// antes de correr el script (recomendado: no dejes las claves escritas
// aquí si vas a subir este archivo a git).

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://aqulnrxevadlffrtqycc.supabase.co'
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY // Project Settings > API > service_role (secreta) — NUNCA hardcodear, solo variable de entorno

const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID || 'e4c6ea1507066e0c8b0ba03169ff7008'
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID // Cloudflare > R2 > Manage API Tokens
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY // NUNCA hardcodear, solo variable de entorno
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME || 'iglu-media-tasks'
const R2_PUBLIC_URL = process.env.R2_PUBLIC_URL || 'https://pub-d2aa7869262d4c5b81f69834bb9ba10d.r2.dev'

const OLD_STORAGE_BUCKET = 'task-attachments'
// Prefijo público que usan las URLs viejas de Supabase Storage para este bucket
const OLD_URL_MARKER = `/storage/v1/object/public/${OLD_STORAGE_BUCKET}/`

// ── Clientes ─────────────────────────────────────────────────────────────
if (!SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Falta SUPABASE_SERVICE_ROLE_KEY (Project Settings > API > service_role).')
  process.exit(1)
}
if (!R2_SECRET_ACCESS_KEY) {
  console.error('Falta R2_SECRET_ACCESS_KEY.')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

const r2 = new S3Client({
  region: 'auto',
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
  },
})

// ── Migración ────────────────────────────────────────────────────────────
async function main() {
  console.log('Buscando mensajes con archivos en Supabase Storage...')

  const { data: rows, error } = await supabase
    .from('task_messages')
    .select('id, attachment_url, attachment_type')
    .not('attachment_url', 'is', null)
    .like('attachment_url', `%${OLD_URL_MARKER}%`)

  if (error) {
    console.error('Error consultando task_messages:', error.message)
    process.exit(1)
  }

  console.log(`Encontrados ${rows.length} archivos para migrar.\n`)

  let ok = 0
  let failed = 0

  for (const [i, row] of rows.entries()) {
    const marker = row.attachment_url.indexOf(OLD_URL_MARKER)
    const path = decodeURIComponent(row.attachment_url.slice(marker + OLD_URL_MARKER.length))
    const label = `[${i + 1}/${rows.length}] ${path}`

    try {
      // 1. Descargar el archivo desde Supabase Storage
      const { data: blob, error: downloadError } = await supabase
        .storage.from(OLD_STORAGE_BUCKET)
        .download(path)
      if (downloadError) throw downloadError

      const arrayBuffer = await blob.arrayBuffer()
      const buffer = Buffer.from(arrayBuffer)

      // 2. Subirlo a R2, bajo la misma ruta relativa
      const key = `task-attachments/${path}`
      await r2.send(new PutObjectCommand({
        Bucket: R2_BUCKET_NAME,
        Key: key,
        Body: buffer,
        ContentType: blob.type || (row.attachment_type === 'video' ? 'video/mp4' : 'image/jpeg'),
      }))

      // 3. Actualizar la URL en la base de datos
      const newUrl = `${R2_PUBLIC_URL}/${key}`
      const { error: updateError } = await supabase
        .from('task_messages')
        .update({ attachment_url: newUrl })
        .eq('id', row.id)
      if (updateError) throw updateError

      console.log(`${label} -> migrado OK`)
      ok++
    } catch (err) {
      console.error(`${label} -> ERROR: ${err.message}`)
      failed++
    }
  }

  console.log('\n── Resumen ──────────────────────────')
  console.log(`Migrados correctamente: ${ok}`)
  console.log(`Con error:              ${failed}`)
  console.log('──────────────────────────────────────')

  if (failed === 0) {
    console.log('\nTodo salió bien. Ahora puedes borrar los archivos viejos')
    console.log('del bucket "task-attachments" en Supabase Storage para liberar espacio.')
  } else {
    console.log('\nHubo errores. Revisa los mensajes de arriba antes de borrar nada del bucket viejo.')
  }
}

main()