-- ============================================================
-- MIGRACIÓN: Admin vista restringida por dept (v2 - definitiva)
-- Ejecutar en Supabase > SQL Editor > New Query
-- ============================================================

-- Asegurar que member_role existe (por si no se ejecutó migración anterior)
alter table public.profile_departments
  add column if not exists member_role text default 'user'
  check (member_role in ('admin', 'user'));

-- Actualizar política RLS de tasks:
-- Admin con depts asignados solo ve tareas de esos depts
-- Admin sin depts asignados no ve nada (debe ser asignado)
drop policy if exists "Tareas visibles según departamento" on public.tasks;
create policy "Tareas visibles según departamento"
  on public.tasks for select to authenticated
  using (
    department_id in (
      select department_id from public.profile_departments where user_id = auth.uid()
    )
    or assigned_to = auth.uid()
    or created_by = auth.uid()
  );

-- Admin solo puede editar tareas en sus depts asignados
drop policy if exists "Admin edita tareas" on public.tasks;
create policy "Admin edita tareas"
  on public.tasks for update to authenticated
  using (
    (select role from public.profiles where id = auth.uid()) = 'admin'
    and department_id in (
      select department_id from public.profile_departments
      where user_id = auth.uid() and member_role = 'admin'
    )
  );

-- Admin puede eliminar tareas solo en sus depts
drop policy if exists "Admin elimina tareas" on public.tasks;
create policy "Admin elimina tareas"
  on public.tasks for delete to authenticated
  using (
    (select role from public.profiles where id = auth.uid()) = 'admin'
    and department_id in (
      select department_id from public.profile_departments
      where user_id = auth.uid() and member_role = 'admin'
    )
  );

-- kanban_columns: admin solo ve columnas de sus depts
drop policy if exists "Columnas visibles" on public.kanban_columns;
create policy "Columnas visibles"
  on public.kanban_columns for select to authenticated
  using (
    department_id in (
      select department_id from public.profile_departments where user_id = auth.uid()
    )
  );
