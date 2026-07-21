-- ============================================================
-- FIX v2: Transfer RLS - corregir violación de política en tasks
-- ============================================================

-- El error "new row violates" viene del WITH CHECK en la política UPDATE.
-- Necesitamos agregar WITH CHECK explícito para permitir cambiar department_id.

drop policy if exists "Usuario mueve sus tareas" on public.tasks;
drop policy if exists "Admin edita tareas" on public.tasks;
drop policy if exists "Autenticados crean tareas" on public.tasks;

-- Política unificada UPDATE: cualquier autenticado puede actualizar si:
-- 1) Es el asignado, o
-- 2) La tarea tiene allow_transfer=true y pertenece al dept del usuario
-- 3) Es admin asignado a ese dept
create policy "Usuarios y admins actualizan tareas"
  on public.tasks for update to authenticated
  using (
    assigned_to = auth.uid()
    or created_by = auth.uid()
    or (
      allow_transfer = true
      and department_id in (
        select department_id from public.profile_departments where user_id = auth.uid()
      )
    )
    or (
      (select role from public.profiles where id = auth.uid()) = 'admin'
      and department_id in (
        select department_id from public.profile_departments
        where user_id = auth.uid() and member_role = 'admin'
      )
    )
  )
  -- WITH CHECK: permite mover a CUALQUIER dept (la fila nueva puede tener distinto dept)
  with check (true);

-- Política INSERT
create policy "Autenticados crean tareas"
  on public.tasks for insert to authenticated
  with check (created_by = auth.uid());
