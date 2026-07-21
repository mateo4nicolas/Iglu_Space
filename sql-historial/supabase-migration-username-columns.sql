-- ============================================================
-- MIGRACIÓN: username en profiles + owner_role en kanban_columns
-- Pegar en Supabase > SQL Editor > New Query
-- ============================================================

-- 1. Agregar campo username a profiles
alter table public.profiles
  add column if not exists username text;

-- 2. Agregar campo owner_role a kanban_columns
-- 'admin' = solo admin lo ve | 'user' = solo usuario lo ve
alter table public.kanban_columns
  add column if not exists owner_role text check (owner_role in ('admin', 'user', null));

-- 3. Migrar columnas existentes: las que tienen auto_assign_to='user' → owner_role='user', resto → owner_role='admin'
update public.kanban_columns
  set owner_role = 'user'
  where auto_assign_to = 'user' and owner_role is null;

update public.kanban_columns
  set owner_role = 'admin'
  where (auto_assign_to is null or auto_assign_to = 'admin') and owner_role is null;

-- 4. Índice para búsquedas por username
create index if not exists profiles_username_idx on public.profiles(username);
