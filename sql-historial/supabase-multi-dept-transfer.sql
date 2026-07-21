-- ============================================================
-- MIGRACIÓN: Multi-departamento + Transferencia de tareas
-- Ejecutar en Supabase > SQL Editor > New Query
-- ============================================================

-- 1. Tabla junction para que un usuario pertenezca a varios departamentos
create table if not exists public.profile_departments (
  id            uuid default gen_random_uuid() primary key,
  user_id       uuid references public.profiles(id) on delete cascade not null,
  department_id uuid references public.departments(id) on delete cascade not null,
  unique(user_id, department_id)
);
create index if not exists pd_user_idx on public.profile_departments(user_id);
create index if not exists pd_dept_idx on public.profile_departments(department_id);

-- RLS
alter table public.profile_departments enable row level security;
create policy "PD visible a todos" on public.profile_departments for select to authenticated using (true);
create policy "Admin gestiona PD" on public.profile_departments for all to authenticated
  using ((select role from public.profiles where id = auth.uid()) = 'admin');

-- 2. Migrar datos existentes: copiar department_id actual a la tabla junction
insert into public.profile_departments (user_id, department_id)
  select id, department_id from public.profiles
  where department_id is not null
on conflict do nothing;

-- 3. Agregar campo allow_transfer a tasks
alter table public.tasks
  add column if not exists allow_transfer boolean default false;

-- 4. Actualizar política RLS de tasks para incluir todos los departamentos del usuario
drop policy if exists "Tareas visibles según departamento" on public.tasks;
create policy "Tareas visibles según departamento"
  on public.tasks for select to authenticated
  using (
    (select role from public.profiles where id = auth.uid()) = 'admin'
    or department_id in (
      select department_id from public.profile_departments where user_id = auth.uid()
    )
    or assigned_to = auth.uid()
  );
