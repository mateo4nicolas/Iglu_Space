-- ============================================================
-- MIGRACIÓN v2
-- Ejecutar en Supabase > SQL Editor > New Query
-- (requiere haber corrido antes migracion-tareas-compartidas.sql y
--  migracion-clientes-mes-inicio.sql)
-- ============================================================

-- ============================================================
-- 1. TAREAS COMPARTIDAS: retener también las transferencias
-- ------------------------------------------------------------
-- Error: si un editor "enviaba" la tarea transfiriéndola a otro
-- departamento (o a otra persona), la tarea se movía de inmediato y le
-- desaparecía al otro editor. Ahora cualquier envío (columna de supervisor,
-- otro departamento u otra persona) queda retenido hasta que TODOS los
-- miembros lo hagan; recién ahí se aplica el destino del último envío.
-- Los miembros se toman de la versión ANTERIOR de la tarea, para que una
-- transferencia que cambia el responsable no altere quién debe enviar.
-- ============================================================
create or replace function public.handle_shared_task_move()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_caller       uuid := auth.uid();
  v_members      uuid[];
  v_target_owner text;
  v_is_send      boolean;
  v_dept_changed boolean;
  v_progress     jsonb;
  v_all_sent     boolean;
  v_caller_name  text;
  v_uid          uuid;
begin
  -- Tarea que no era compartida: seguir normal
  if not coalesce(old.is_shared, false) then
    if not coalesce(new.is_shared, false) then
      new.shared_progress := '{}'::jsonb;
    end if;
    return new;
  end if;

  v_dept_changed := new.department_id is distinct from old.department_id;

  -- Solo interesa cuando cambia la columna o el departamento
  if not v_dept_changed and new.column_id is not distinct from old.column_id then
    return new;
  end if;

  -- Miembros = responsable + compartidos, según la versión anterior
  select coalesce(array_agg(distinct m), '{}'::uuid[]) into v_members
  from unnest(array_append(coalesce(old.shared_with, '{}'::uuid[]), old.assigned_to)) as m
  where m is not null;

  select owner_role into v_target_owner
  from public.kanban_columns where id = new.column_id;

  -- A) Movimiento de admin/supervisor, sistema o alguien que no es miembro
  if v_caller is null or not (v_caller = any(v_members)) then
    if v_dept_changed then
      -- Salió del departamento: deja de ser compartida
      new.is_shared := false;
      new.shared_with := '{}'::uuid[];
      new.shared_progress := '{}'::jsonb;
    elsif v_target_owner = 'user' then
      -- Vuelve a columnas de editores: todos arrancan de nuevo
      new.shared_progress := '{}'::jsonb;
    end if;
    return new;
  end if;

  v_progress := coalesce(old.shared_progress, '{}'::jsonb);
  v_is_send := v_dept_changed
               or coalesce(v_target_owner, 'admin') <> 'user'
               or new.assigned_to is distinct from old.assigned_to;

  -- B) El editor se mueve entre SUS columnas del mismo departamento
  if not v_is_send then
    new.shared_progress := v_progress || jsonb_build_object(
      v_caller::text, jsonb_build_object('column_id', new.column_id, 'sent_at', null)
    );
    new.column_id := old.column_id;
    return new;
  end if;

  -- C) El editor MANDA su parte
  v_progress := v_progress || jsonb_build_object(
    v_caller::text, jsonb_build_object(
      'column_id', new.column_id,
      'department_id', new.department_id,
      'assigned_to', new.assigned_to,
      'sent_at', now()
    )
  );

  -- Su pendiente del cronograma queda cumplido para él
  update public.schedule_items si
     set done_by = array_append(coalesce(si.done_by, '{}'::uuid[]), v_caller)
   where si.task_id = old.id
     and si.date = coalesce(old.fecha_cronograma, current_date)
     and not (v_caller = any(coalesce(si.done_by, '{}'::uuid[])));

  select coalesce(bool_and(coalesce(v_progress -> m::text ->> 'sent_at', '') <> ''), false)
    into v_all_sent
  from unnest(v_members) as m;

  if not v_all_sent then
    -- Aún falta alguien: la tarea se queda donde estaba para los demás
    new.column_id     := old.column_id;
    new.department_id := old.department_id;
    new.assigned_to   := old.assigned_to;
    new.shared_with   := old.shared_with;
    new.is_shared     := true;
    new.shared_progress := v_progress;

    select coalesce(display_name, full_name) into v_caller_name
    from public.profiles where id = v_caller;

    foreach v_uid in array v_members loop
      if coalesce(v_progress -> v_uid::text ->> 'sent_at', '') = '' then
        insert into public.notifications (user_id, title, body, type, reference_id, reference_type)
        values (
          v_uid,
          'Tarea compartida: ' || old.title,
          coalesce(v_caller_name, 'Tu compañero') || ' ya mandó su parte. Falta la tuya para que llegue a su destino.',
          'task_moved',
          old.id,
          'task'
        );
      end if;
    end loop;
    return new;
  end if;

  -- Todos mandaron: se aplica el destino de este último envío
  if v_dept_changed then
    new.is_shared := false;
    new.shared_with := '{}'::uuid[];
    new.shared_progress := '{}'::jsonb;
  else
    new.shared_progress := v_progress;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_shared_task_move on public.tasks;
create trigger trg_shared_task_move
  before update on public.tasks
  for each row execute function public.handle_shared_task_move();


-- ============================================================
-- 2. CLIENTES NUEVOS DE NOVIEMBRE 2026
-- ------------------------------------------------------------
-- Ciclo 1 al 31 : BLUE SKY, HOJA NEGRA, TECNODENTAL      -> 2026-11 (Noviembre)
-- Ciclo 15 al 14: ALMACÉN VACA, ALMACENES LA VICTORIA    -> 2026-11 (15 Nov - 14 Dic)
-- Si ya tenían tareas en meses anteriores, se les deja visibles desde ese
-- mes (para no esconder historial); la etiqueta NUEVO sale en noviembre.
-- ============================================================
create temp table _nuevos_nov as
select c.id, c.brand_name, c.billing_period,
       (select min(t.mes_tarea) from public.tasks t where t.cliente_id = c.id) as primer_mes_tareas
from public.clients c
where upper(trim(translate(c.brand_name, 'áéíóúÁÉÍÓÚ', 'aeiouAEIOU'))) in
      ('BLUE SKY', 'HOJA NEGRA', 'TECNODENTAL', 'ALMACEN VACA', 'ALMACENES LA VICTORIA');

update public.clients c
   set mes_inicio = '2026-11'
  from _nuevos_nov n
 where c.id = n.id;

insert into public.matriz_client_visibility (cliente_id, mes, active)
select n.id, n.primer_mes_tareas, true
from _nuevos_nov n
where n.primer_mes_tareas is not null and n.primer_mes_tareas < '2026-11'
on conflict (cliente_id, mes) do update set active = true;

-- Cobro Clientes (ciclo de cobro 15 a 14): primer cobro de cada uno
update public.cobro_lista_clientes l
   set mes_inicio = case
         when upper(trim(translate(l.nombre, 'áéíóúÁÉÍÓÚ', 'aeiouAEIOU'))) in ('ALMACEN VACA', 'ALMACENES LA VICTORIA')
           then '2026-11'   -- 15 Nov - 14 Dic
         else '2026-10'     -- 15 Oct - 14 Nov (incluye el 1 de noviembre)
       end
 where upper(trim(translate(l.nombre, 'áéíóúÁÉÍÓÚ', 'aeiouAEIOU'))) in
       ('BLUE SKY', 'HOJA NEGRA', 'TECNODENTAL', 'ALMACEN VACA', 'ALMACENES LA VICTORIA');

-- Verificación: deben salir los 5 clientes con mes_inicio 2026-11
select brand_name, billing_period, mes_inicio from public.clients
where id in (select id from _nuevos_nov)
order by billing_period, brand_name;
