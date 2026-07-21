-- ============================================================
-- FIX: Usuario puede transferir tarea a cualquier dept destino
-- aunque no forme parte de ese dept
-- ============================================================

-- Ver columnas de depts destino configurados en la tarea (sin pertenecer al dept)
drop policy if exists "Columnas visibles" on public.kanban_columns;
drop policy if exists "Columnas visibles transfer" on public.kanban_columns;
create policy "Columnas visibles"
  on public.kanban_columns for select to authenticated
  using (
    -- columnas de tus propios depts
    department_id in (
      select department_id from public.profile_departments where user_id = auth.uid()
    )
    -- columnas de depts destino en tareas transferibles asignadas/creadas por ti
    or department_id in (
      select unnest(coalesce(transfer_to_dept_ids, '{}'))
      from public.tasks
      where allow_transfer = true
        and (assigned_to = auth.uid() or created_by = auth.uid())
    )
    -- admin puede ver columnas de sus depts asignados
    or (
      (select role from public.profiles where id = auth.uid()) = 'admin'
      and department_id in (
        select department_id from public.profile_departments
        where user_id = auth.uid() and member_role = 'admin'
      )
    )
  );

-- Ver perfiles de depts destino (para el selector de usuario en la transferencia)
drop policy if exists "Perfiles visibles" on public.profiles;
create policy "Perfiles visibles"
  on public.profiles for select to authenticated
  using (true);

-- Ver profile_departments de depts destino (para mostrar miembros del dept destino)
drop policy if exists "PD visible a todos" on public.profile_departments;
create policy "PD visible a todos"
  on public.profile_departments for select to authenticated
  using (true);

-- Tareas: usuario puede ver depts destino al hacer transferencia
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

-- Tareas: usuario puede actualizar (transferir) si es asignado o creador y allow_transfer=true
drop policy if exists "Usuario mueve sus tareas" on public.tasks;
create policy "Usuario mueve sus tareas"
  on public.tasks for update to authenticated
  using (
    assigned_to = auth.uid()
    or (allow_transfer = true and created_by = auth.uid())
  );
