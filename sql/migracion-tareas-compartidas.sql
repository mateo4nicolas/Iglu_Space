-- ============================================================
-- MIGRACIÓN: Tareas compartidas (ej. dos videógrafos en una misma tarea)
-- Ejecutar en Supabase > SQL Editor > New Query
-- ============================================================
--
-- Cómo funciona:
--  * Una tarea compartida es UNA sola fila en tasks.
--    Miembros = assigned_to (responsable) + shared_with (los demás editores).
--  * Cada editor tiene su propia posición dentro de las columnas de usuario,
--    guardada en shared_progress: { "<uid>": { "column_id": ..., "sent_at": ... } }
--  * Cuando un editor la "manda" (la mueve a una columna de supervisor):
--      - se registra su entrega y desaparece de SUS columnas,
--      - la tarea NO llega al supervisor mientras falte algún miembro,
--      - cuando el último miembro la manda, la tarea pasa a la columna de
--        supervisor (y se dispara la notificación normal de "Tarea movida").
--  * Si el admin/supervisor devuelve la tarea a una columna de usuario,
--    todos los miembros vuelven a empezar (se limpia el progreso).
-- ============================================================

-- 1. Columnas nuevas
alter table public.tasks
  add column if not exists is_shared boolean not null default false,
  add column if not exists shared_with uuid[] not null default '{}'::uuid[],
  add column if not exists shared_progress jsonb not null default '{}'::jsonb;

create index if not exists tasks_shared_with_idx on public.tasks using gin (shared_with);

-- 2. Trigger que intercepta los movimientos de tareas compartidas
create or replace function public.handle_shared_task_move()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_caller       uuid := auth.uid();
  v_is_admin     boolean := false;
  v_members      uuid[];
  v_target_owner text;
  v_progress     jsonb;
  v_all_sent     boolean;
  v_caller_name  text;
  v_uid          uuid;
begin
  -- Tarea no compartida: limpiar progreso y seguir normal
  if not coalesce(new.is_shared, false) then
    new.shared_progress := '{}'::jsonb;
    return new;
  end if;

  -- Solo interesa cuando cambia la columna
  if new.column_id is null or new.column_id is not distinct from old.column_id then
    return new;
  end if;

  -- Miembros = responsable + compartidos (sin nulos ni duplicados)
  select coalesce(array_agg(distinct m), '{}'::uuid[]) into v_members
  from unnest(array_append(coalesce(new.shared_with, '{}'::uuid[]), new.assigned_to)) as m
  where m is not null;

  select owner_role into v_target_owner
  from public.kanban_columns where id = new.column_id;

  select (role = 'admin' or coalesce(is_super_admin, false)) into v_is_admin
  from public.profiles where id = v_caller;
  v_is_admin := coalesce(v_is_admin, false);

  -- A) Movimiento hecho por admin/supervisor, sistema o alguien que no es miembro
  if v_caller is null or v_is_admin or not (v_caller = any(v_members)) then
    if v_target_owner = 'user' then
      -- Entra / vuelve a columnas de editores: todos arrancan de nuevo
      new.shared_progress := '{}'::jsonb;
    end if;
    return new;
  end if;

  v_progress := coalesce(new.shared_progress, '{}'::jsonb);

  -- B) El editor se mueve entre SUS columnas: solo cambia su posición
  if v_target_owner = 'user' then
    new.shared_progress := v_progress || jsonb_build_object(
      v_caller::text, jsonb_build_object('column_id', new.column_id, 'sent_at', null)
    );
    new.column_id := old.column_id;
    return new;
  end if;

  -- C) El editor MANDA su parte (columna de supervisor)
  v_progress := v_progress || jsonb_build_object(
    v_caller::text, jsonb_build_object('column_id', new.column_id, 'sent_at', now())
  );
  new.shared_progress := v_progress;

  -- Su pendiente del cronograma queda cumplido para él
  update public.schedule_items si
     set done_by = array_append(coalesce(si.done_by, '{}'::uuid[]), v_caller)
   where si.task_id = new.id
     and si.date = coalesce(new.fecha_cronograma, current_date)
     and not (v_caller = any(coalesce(si.done_by, '{}'::uuid[])));

  select coalesce(bool_and(coalesce(v_progress -> m::text ->> 'sent_at', '') <> ''), false)
    into v_all_sent
  from unnest(v_members) as m;

  if not v_all_sent then
    -- Aún falta alguien: la tarea NO llega al supervisor
    new.column_id := old.column_id;

    select coalesce(display_name, full_name) into v_caller_name
    from public.profiles where id = v_caller;

    foreach v_uid in array v_members loop
      if coalesce(v_progress -> v_uid::text ->> 'sent_at', '') = '' then
        insert into public.notifications (user_id, title, body, type, reference_id, reference_type)
        values (
          v_uid,
          'Tarea compartida: ' || new.title,
          coalesce(v_caller_name, 'Tu compañero') || ' ya mandó su parte. Falta la tuya para que llegue a revisión.',
          'task_moved',
          new.id,
          'task'
        );
      end if;
    end loop;
  end if;

  -- Si todos mandaron, column_id queda en la columna de supervisor elegida
  return new;
end;
$$;

drop trigger if exists trg_shared_task_move on public.tasks;
create trigger trg_shared_task_move
  before update on public.tasks
  for each row execute function public.handle_shared_task_move();

-- 3. RLS: los editores compartidos pueden ver y mover la tarea
--    (políticas permisivas adicionales; no tocan las existentes)
drop policy if exists "Compartidas visibles para miembros" on public.tasks;
create policy "Compartidas visibles para miembros"
  on public.tasks for select
  to authenticated
  using (auth.uid() = any(shared_with));

drop policy if exists "Compartidas editables por miembros" on public.tasks;
create policy "Compartidas editables por miembros"
  on public.tasks for update
  to authenticated
  using (auth.uid() = any(shared_with))
  with check (true);
