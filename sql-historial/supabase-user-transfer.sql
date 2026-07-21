-- ============================================================
-- MIGRACIÓN: Permitir a usuarios transferir tareas habilitadas
-- Ejecutar en Supabase > SQL Editor > New Query
-- ============================================================

-- Actualizar política update de tasks para permitir que usuarios
-- transfieran tareas cuando allow_transfer = true y son el asignado
drop policy if exists "Usuario mueve sus tareas" on public.tasks;
create policy "Usuario mueve sus tareas"
  on public.tasks for update to authenticated
  using (
    assigned_to = auth.uid()
    or (allow_transfer = true and created_by = auth.uid())
  );

-- Permitir a usuarios ver columnas del dept destino cuando la tarea es transferible
-- (ya cubierto por la política general si el user está en ese dept)
-- Agregar política para ver columnas de depts destino en transferencias:
drop policy if exists "Columnas visibles transfer" on public.kanban_columns;
create policy "Columnas visibles transfer"
  on public.kanban_columns for select to authenticated
  using (
    department_id in (
      select department_id from public.profile_departments where user_id = auth.uid()
    )
    -- también puede ver columnas de depts destino en tareas transferibles que le asignan
    or department_id in (
      select unnest(transfer_to_dept_ids) from public.tasks
      where allow_transfer = true and (assigned_to = auth.uid() or created_by = auth.uid())
    )
  );
