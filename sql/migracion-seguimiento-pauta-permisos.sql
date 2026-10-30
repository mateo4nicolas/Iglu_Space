-- ============================================================
-- MIGRACIÓN: Seguimiento Pauta — todos ven, solo el departamento de Pauta edita
-- Ejecutar en Supabase > SQL Editor > New Query
-- (requiere haber corrido migracion-seguimiento-pauta.sql)
-- ============================================================
-- "Departamento de Pauta" = cualquier departamento cuyo nombre contenga "pauta"
-- (sin importar mayúsculas). Edita quien esté asignado a ese departamento.
-- ============================================================

create or replace function public.can_edit_seguimiento_pauta()
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (
    select 1
    from public.profile_departments pd
    join public.departments d on d.id = pd.department_id
    where pd.user_id = auth.uid()
      and d.name ilike '%pauta%'
  )
$$;

grant execute on function public.can_edit_seguimiento_pauta() to authenticated;

-- Datos
drop policy if exists "Seguimiento pauta acceso" on public.seguimiento_pauta;
drop policy if exists "Seguimiento pauta ver" on public.seguimiento_pauta;
drop policy if exists "Seguimiento pauta crear" on public.seguimiento_pauta;
drop policy if exists "Seguimiento pauta editar" on public.seguimiento_pauta;
drop policy if exists "Seguimiento pauta borrar" on public.seguimiento_pauta;

create policy "Seguimiento pauta ver" on public.seguimiento_pauta
  for select to authenticated using (true);
create policy "Seguimiento pauta crear" on public.seguimiento_pauta
  for insert to authenticated with check (public.can_edit_seguimiento_pauta());
create policy "Seguimiento pauta editar" on public.seguimiento_pauta
  for update to authenticated
  using (public.can_edit_seguimiento_pauta())
  with check (public.can_edit_seguimiento_pauta());
create policy "Seguimiento pauta borrar" on public.seguimiento_pauta
  for delete to authenticated using (public.can_edit_seguimiento_pauta());

-- Columnas de informes
drop policy if exists "Seguimiento pauta informes acceso" on public.seguimiento_pauta_informes;
drop policy if exists "Seguimiento pauta informes ver" on public.seguimiento_pauta_informes;
drop policy if exists "Seguimiento pauta informes crear" on public.seguimiento_pauta_informes;
drop policy if exists "Seguimiento pauta informes editar" on public.seguimiento_pauta_informes;
drop policy if exists "Seguimiento pauta informes borrar" on public.seguimiento_pauta_informes;

create policy "Seguimiento pauta informes ver" on public.seguimiento_pauta_informes
  for select to authenticated using (true);
create policy "Seguimiento pauta informes crear" on public.seguimiento_pauta_informes
  for insert to authenticated with check (public.can_edit_seguimiento_pauta());
create policy "Seguimiento pauta informes editar" on public.seguimiento_pauta_informes
  for update to authenticated
  using (public.can_edit_seguimiento_pauta())
  with check (public.can_edit_seguimiento_pauta());
create policy "Seguimiento pauta informes borrar" on public.seguimiento_pauta_informes
  for delete to authenticated using (public.can_edit_seguimiento_pauta());

-- Verificación: departamentos que cuentan como "Pauta" y sus miembros
select d.name as departamento, coalesce(p.display_name, p.full_name, p.username) as miembro
from public.departments d
left join public.profile_departments pd on pd.department_id = d.id
left join public.profiles p on p.id = pd.user_id
where d.name ilike '%pauta%'
order by d.name, miembro;
