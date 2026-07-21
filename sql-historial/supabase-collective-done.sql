-- ============================================================
-- MIGRACIÓN: Validación colectiva de pendientes
-- Ejecutar en Supabase > SQL Editor > New Query
-- ============================================================

-- 1. Agregar campo done_by (array de uids que ya marcaron como hecho)
alter table public.schedule_items
  add column if not exists done_by uuid[] default '{}';

-- 2. Migrar datos existentes: si is_done=true y assigned_to tiene gente, marcar todos como done
update public.schedule_items
  set done_by = assigned_to
  where is_done = true and assigned_to is not null and array_length(assigned_to, 1) > 0;

-- 3. Función que recalcula is_done automáticamente
create or replace function public.recalc_schedule_done()
returns trigger language plpgsql as $$
begin
  -- is_done = true solo si TODOS los asignados han marcado (done_by contiene a todos en assigned_to)
  if new.assigned_to is not null and array_length(new.assigned_to, 1) > 0 then
    new.is_done := (
      select bool_and(uid = any(new.done_by))
      from unnest(new.assigned_to) as uid
    );
  else
    -- Sin asignados: comportamiento normal (toggle directo)
    new.is_done := new.is_done;
  end if;
  return new;
end;
$$;

-- 4. Trigger on update
drop trigger if exists trg_recalc_schedule_done on public.schedule_items;
create trigger trg_recalc_schedule_done
  before update on public.schedule_items
  for each row execute function public.recalc_schedule_done();

-- 5. Política RLS para que usuarios puedan actualizar done_by de sus items
-- (ya existe policy de update para assigned users, pero aseguramos que cubra done_by)
-- Si la política actual ya es amplia, no se necesita cambio.
-- Actualizamos la política de update para users si existe una restrictiva:
drop policy if exists "Asignado actualiza done" on public.schedule_items;
create policy "Asignado actualiza done"
  on public.schedule_items for update
  to authenticated
  using (auth.uid() = any(assigned_to) or (select role from public.profiles where id = auth.uid()) = 'admin');
