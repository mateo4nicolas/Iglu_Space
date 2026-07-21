-- ============================================================
-- FIX DEFINITIVO: Función SECURITY DEFINER para transferir tareas
-- Bypasa RLS completamente para la operación de transferencia
-- Ejecutar en Supabase > SQL Editor > New Query
-- ============================================================

create or replace function public.transfer_task(
  p_task_id    uuid,
  p_dept_id    uuid,
  p_column_id  uuid,
  p_user_id    uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_task record;
  v_caller_id uuid := auth.uid();
begin
  -- Obtener la tarea
  select * into v_task from public.tasks where id = p_task_id;

  if not found then
    raise exception 'Tarea no encontrada';
  end if;

  -- Validar que el caller tiene permiso: es asignado, creador, o admin del dept origen
  if v_task.assigned_to <> v_caller_id
    and v_task.created_by <> v_caller_id
    and not (
      v_task.allow_transfer = true
      and exists (
        select 1 from public.profile_departments
        where user_id = v_caller_id and department_id = v_task.department_id
      )
    )
    and not (
      (select role from public.profiles where id = v_caller_id) = 'admin'
      and exists (
        select 1 from public.profile_departments
        where user_id = v_caller_id and department_id = v_task.department_id and member_role = 'admin'
      )
    )
  then
    raise exception 'Sin permisos para transferir esta tarea';
  end if;

  -- Validar que allow_transfer está activo
  if v_task.allow_transfer = false and (select role from public.profiles where id = v_caller_id) <> 'admin' then
    raise exception 'Transferencia no habilitada para esta tarea';
  end if;

  -- Ejecutar la transferencia (sin restricción de RLS por SECURITY DEFINER)
  update public.tasks
    set department_id = p_dept_id,
        column_id     = p_column_id,
        assigned_to   = coalesce(p_user_id, assigned_to),
        updated_at    = now()
    where id = p_task_id;
end;
$$;

-- Dar permisos de ejecución a usuarios autenticados
grant execute on function public.transfer_task(uuid, uuid, uuid, uuid) to authenticated;
