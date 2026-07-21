-- ============================================================
-- MIGRACIÓN v2: Transfer con depts específicos + cascada
-- Ejecutar en Supabase > SQL Editor > New Query
-- ============================================================

-- Agregar campo para departamentos destino permitidos
alter table public.tasks
  add column if not exists transfer_to_dept_ids uuid[] default '{}';

-- allow_transfer ya existe de migración anterior
alter table public.tasks
  add column if not exists allow_transfer boolean default false;
