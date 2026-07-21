-- ============================================================
-- MÓDULO: Log Diario de Actividades
-- Ejecutar en Supabase > SQL Editor > New Query
-- ============================================================

-- 1. Tabla de departamentos del log (separados de los kanban departments)
create table if not exists public.log_departments (
  id         uuid default gen_random_uuid() primary key,
  name       text not null,
  color      text default '#6366f1',
  position   int  default 0,
  created_at timestamptz default now()
);

-- 2. Miembros por departamento del log
create table if not exists public.log_department_members (
  id       uuid default gen_random_uuid() primary key,
  dept_id  uuid references public.log_departments(id) on delete cascade not null,
  user_id  uuid references public.profiles(id) on delete cascade not null,
  unique(dept_id, user_id)
);

-- 3. Entradas diarias
create table if not exists public.log_entries (
  id         uuid default gen_random_uuid() primary key,
  dept_id    uuid references public.log_departments(id) on delete cascade not null,
  user_id    uuid references public.profiles(id) on delete cascade not null,
  date       date not null,
  week_start date not null,
  text       text default '',
  updated_at timestamptz default now(),
  unique(dept_id, user_id, date)
);

-- Índices
create index if not exists log_entries_date_idx on public.log_entries(date);
create index if not exists log_entries_week_idx on public.log_entries(week_start);
create index if not exists log_entries_user_idx on public.log_entries(user_id);

-- 4. RLS
alter table public.log_departments enable row level security;
alter table public.log_department_members enable row level security;
alter table public.log_entries enable row level security;

-- log_departments: todos ven, solo admin gestiona
create policy "Log depts visibles" on public.log_departments for select to authenticated using (true);
create policy "Admin gestiona log depts" on public.log_departments for all to authenticated
  using ((select role from public.profiles where id = auth.uid()) = 'admin');

-- log_department_members: todos ven, solo admin gestiona
create policy "Log members visibles" on public.log_department_members for select to authenticated using (true);
create policy "Admin gestiona log members" on public.log_department_members for all to authenticated
  using ((select role from public.profiles where id = auth.uid()) = 'admin');

-- log_entries: todos ven, usuarios insertan/actualizan solo las suyas, admin todo
create policy "Log entries visibles" on public.log_entries for select to authenticated using (true);
create policy "Usuario crea su entry" on public.log_entries for insert to authenticated
  with check (user_id = auth.uid());
create policy "Usuario actualiza su entry" on public.log_entries for update to authenticated
  using (user_id = auth.uid());
create policy "Admin gestiona log entries" on public.log_entries for all to authenticated
  using ((select role from public.profiles where id = auth.uid()) = 'admin');

-- También agregar política de delete para tareas si no existe
do $$
begin
  if not exists (
    select 1 from pg_policies where tablename = 'tasks' and policyname = 'Admin elimina tareas'
  ) then
    execute 'create policy "Admin elimina tareas" on public.tasks for delete to authenticated
      using ((select role from public.profiles where id = auth.uid()) = ''admin'')';
  end if;
end$$;
