-- ============================================================
-- MIGRACIÓN: Tablas editables por admin (Contenido Extra e Informe de Contenidos)
-- Ejecutar en Supabase > SQL Editor > New Query
-- ============================================================
-- tabla_layout guarda, por tabla:
--   labels      -> títulos renombrados  { "col_codigo": "CÓDIGO PIEZA", ... }
--   hidden      -> columnas ocultas     [ "col_duracion", ... ]
--   custom_cols -> columnas propias     [ { "id", "label", "tipo", "grupo" }, ... ]
-- Los valores de las columnas propias se guardan en la columna "extra" de cada fila.
-- ============================================================

create table if not exists public.tabla_layout (
  tabla text primary key,
  labels jsonb not null default '{}'::jsonb,
  hidden text[] not null default '{}'::text[],
  custom_cols jsonb not null default '[]'::jsonb,
  updated_by uuid,
  updated_at timestamptz not null default now()
);

insert into public.tabla_layout (tabla) values ('contenido_extra'), ('informe_contenidos')
on conflict (tabla) do nothing;

alter table public.contenido_extra add column if not exists extra jsonb not null default '{}'::jsonb;
alter table public.cronograma_filas add column if not exists extra jsonb not null default '{}'::jsonb;

-- Permisos: todos ven el diseño; solo admin/supervisor lo cambia
create or replace function public.is_admin_user()
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and (role = 'admin' or coalesce(is_super_admin, false))
  )
$$;

alter table public.tabla_layout enable row level security;

drop policy if exists "Tabla layout ver" on public.tabla_layout;
drop policy if exists "Tabla layout crear" on public.tabla_layout;
drop policy if exists "Tabla layout editar" on public.tabla_layout;

create policy "Tabla layout ver" on public.tabla_layout
  for select to authenticated using (true);
create policy "Tabla layout crear" on public.tabla_layout
  for insert to authenticated with check (public.is_admin_user());
create policy "Tabla layout editar" on public.tabla_layout
  for update to authenticated using (public.is_admin_user()) with check (public.is_admin_user());

do $$
begin
  begin
    alter publication supabase_realtime add table public.tabla_layout;
  exception when others then null;
  end;
end $$;
