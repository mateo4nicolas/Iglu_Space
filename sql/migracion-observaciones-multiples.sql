-- ============================================================
-- MIGRACIÓN: Varias observaciones por pendiente del Cronograma
-- Ejecutar en Supabase > SQL Editor > New Query
-- ============================================================
-- schedule_items.observations = [{ id, user_id, text, created_at, edited_at }]
-- Se agregan/editan/borran con funciones (no se pisan entre usuario y admin).
-- ============================================================

alter table public.schedule_items
  add column if not exists observations jsonb not null default '[]'::jsonb;

-- Pasar la observación única que ya existía a la lista (autor: el asignado si es uno solo)
update public.schedule_items
   set observations = jsonb_build_array(jsonb_build_object(
         'id', gen_random_uuid()::text,
         'user_id', case when coalesce(array_length(assigned_to, 1), 0) = 1 then assigned_to[1]::text else null end,
         'text', user_observation,
         'created_at', coalesce(created_at, now()),
         'edited_at', null
       ))
 where coalesce(trim(user_observation), '') <> ''
   and observations = '[]'::jsonb;

-- Permiso: asignado al pendiente, quien lo creó, o admin/supervisor
create or replace function public.can_observe_schedule_item(p_item public.schedule_items)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select coalesce(auth.uid() = any(coalesce(p_item.assigned_to, '{}'::uuid[])), false)
      or coalesce(p_item.created_by = auth.uid(), false)
      or exists (
        select 1 from public.profiles
        where id = auth.uid() and (role = 'admin' or coalesce(is_super_admin, false))
      )
$$;

create or replace function public.add_schedule_observation(p_item_id uuid, p_text text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_item public.schedule_items;
  v_obs jsonb;
begin
  if coalesce(trim(p_text), '') = '' then
    raise exception 'La observación está vacía';
  end if;
  select * into v_item from public.schedule_items where id = p_item_id for update;
  if not found then raise exception 'Pendiente no encontrado'; end if;
  if not coalesce(public.can_observe_schedule_item(v_item), false) then
    raise exception 'Sin permisos para comentar este pendiente';
  end if;

  v_obs := jsonb_build_object(
    'id', gen_random_uuid()::text,
    'user_id', auth.uid()::text,
    'text', trim(p_text),
    'created_at', now(),
    'edited_at', null
  );
  update public.schedule_items
     set observations = coalesce(observations, '[]'::jsonb) || jsonb_build_array(v_obs),
         user_observation = trim(p_text)   -- compatibilidad: última observación
   where id = p_item_id;
  return v_obs;
end;
$$;

create or replace function public.update_schedule_observation(p_item_id uuid, p_obs_id text, p_text text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_item public.schedule_items;
begin
  if coalesce(trim(p_text), '') = '' then
    raise exception 'La observación está vacía';
  end if;
  select * into v_item from public.schedule_items where id = p_item_id for update;
  if not found then raise exception 'Pendiente no encontrado'; end if;

  if not exists (
    select 1 from jsonb_array_elements(coalesce(v_item.observations, '[]'::jsonb)) o
    where o->>'id' = p_obs_id and o->>'user_id' = auth.uid()::text
  ) then
    raise exception 'Solo puedes editar tus propias observaciones';
  end if;

  update public.schedule_items
     set observations = (
       select coalesce(jsonb_agg(
         case when o->>'id' = p_obs_id
              then o || jsonb_build_object('text', trim(p_text), 'edited_at', now())
              else o end
         order by ord), '[]'::jsonb)
       from jsonb_array_elements(coalesce(observations, '[]'::jsonb)) with ordinality as t(o, ord)
     )
   where id = p_item_id;
end;
$$;

create or replace function public.delete_schedule_observation(p_item_id uuid, p_obs_id text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_item public.schedule_items;
  v_is_admin boolean;
begin
  select * into v_item from public.schedule_items where id = p_item_id for update;
  if not found then raise exception 'Pendiente no encontrado'; end if;

  select (role = 'admin' or coalesce(is_super_admin, false)) into v_is_admin
  from public.profiles where id = auth.uid();

  if not coalesce(v_is_admin, false) and not exists (
    select 1 from jsonb_array_elements(coalesce(v_item.observations, '[]'::jsonb)) o
    where o->>'id' = p_obs_id and o->>'user_id' = auth.uid()::text
  ) then
    raise exception 'Solo puedes borrar tus propias observaciones';
  end if;

  update public.schedule_items
     set observations = (
       select coalesce(jsonb_agg(o order by ord), '[]'::jsonb)
       from jsonb_array_elements(coalesce(observations, '[]'::jsonb)) with ordinality as t(o, ord)
       where o->>'id' <> p_obs_id
     )
   where id = p_item_id;
end;
$$;

grant execute on function public.add_schedule_observation(uuid, text) to authenticated;
grant execute on function public.update_schedule_observation(uuid, text, text) to authenticated;
grant execute on function public.delete_schedule_observation(uuid, text) to authenticated;
