-- ============================================================
-- MIGRACIÓN: Admins con vista restringida por departamento
-- Ejecutar en Supabase > SQL Editor > New Query
-- ============================================================

-- 1. Agregar campo role a profile_departments
--    'admin' = este usuario administra este dept
--    'user'  = usuario normal en este dept
alter table public.profile_departments
  add column if not exists member_role text default 'user'
  check (member_role in ('admin', 'user'));

-- 2. Migrar admins existentes: los que tienen role='admin' en profiles
--    y ya están en profile_departments → marcarlos como member_role='admin'
update public.profile_departments pd
  set member_role = 'admin'
  from public.profiles p
  where pd.user_id = p.id and p.role = 'admin';

-- 3. Actualizar política RLS de tareas para respetar asignación de dept
drop policy if exists "Tareas visibles según departamento" on public.tasks;
create policy "Tareas visibles según departamento"
  on public.tasks for select to authenticated
  using (
    -- superadmin sin restricción (sin dept asignado = ve todo)
    (
      (select role from public.profiles where id = auth.uid()) = 'admin'
      and not exists (
        select 1 from public.profile_departments where user_id = auth.uid()
      )
    )
    -- admin/user con dept asignado: solo sus depts
    or department_id in (
      select department_id from public.profile_departments where user_id = auth.uid()
    )
    or assigned_to = auth.uid()
    or created_by = auth.uid()
  );

-- 4. Política para que solo admins de ese dept puedan editar columnas
drop policy if exists "Admin edita tareas" on public.tasks;
create policy "Admin edita tareas"
  on public.tasks for update to authenticated
  using (
    -- superadmin sin dept restriction
    (
      (select role from public.profiles where id = auth.uid()) = 'admin'
      and not exists (select 1 from public.profile_departments where user_id = auth.uid())
    )
    -- admin asignado al dept de la tarea
    or (
      (select role from public.profiles where id = auth.uid()) = 'admin'
      and department_id in (
        select department_id from public.profile_departments
        where user_id = auth.uid() and member_role = 'admin'
      )
    )
  );
