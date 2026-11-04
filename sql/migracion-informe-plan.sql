-- ============================================================
-- MIGRACIÓN: Plan contratado en el Informe de Contenidos
-- Ejecutar en Supabase > SQL Editor > New Query
-- ============================================================
alter table public.cronograma_config
  add column if not exists plan_nombre text;
