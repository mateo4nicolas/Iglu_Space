-- FIX: Permitir a usuarios ejecutar la transferencia de tarea
-- El problema: la política UPDATE requiere que el user sea assigned_to o creator,
-- pero la tarea puede estar asignada a otra persona.
-- Solución: permitir update cuando allow_transfer=true y el user pertenece al dept de origen.

drop policy if exists "Usuario mueve sus tareas" on public.tasks;

create policy "Usuario mueve sus tareas"
  on public.tasks for update to authenticated
  using (
    -- Es el asignado
    assigned_to = auth.uid()
    -- O tiene transferencia activa y pertenece al dept de origen
    or (
      allow_transfer = true
      and department_id in (
        select department_id from public.profile_departments where user_id = auth.uid()
      )
    )
    -- O es admin de ese dept
    or (
      (select role from public.profiles where id = auth.uid()) = 'admin'
      and department_id in (
        select department_id from public.profile_departments
        where user_id = auth.uid() and member_role = 'admin'
      )
    )
  );

-- Asegurar que el user pueda ver la tarea después de transferencia (en el dept destino)
-- ya cubierto por assigned_to / created_by en policy SELECT, pero agregar dept destino:
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
