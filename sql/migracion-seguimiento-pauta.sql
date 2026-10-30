-- ============================================================
-- MIGRACIÓN: Seguimiento Pauta
-- Ejecutar en Supabase > SQL Editor > New Query
-- ============================================================

-- 1. Datos por cliente y mes
create table if not exists public.seguimiento_pauta (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clients(id) on delete cascade,
  mes text not null check (mes ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  semanas jsonb not null default '{}'::jsonb,     -- {"1": {"valor": 120, "nota": "..."}, ...}
  creativos jsonb not null default '[]'::jsonb,   -- [{"url": "...", "texto": "..."}, x3]
  avatar_angulo text,
  costo_resultado numeric,
  informes jsonb not null default '{}'::jsonb,    -- {"<id columna>": "https://..."}
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (cliente_id, mes)
);

-- 2. Columnas de informes (se pueden añadir, renombrar y quitar)
create table if not exists public.seguimiento_pauta_informes (
  id uuid primary key default gen_random_uuid(),
  titulo text not null,
  position integer not null default 0,
  created_at timestamptz not null default now()
);

insert into public.seguimiento_pauta_informes (titulo, position)
select 'Seg. Mensual', 0
where not exists (select 1 from public.seguimiento_pauta_informes);

-- 3. Permisos: admin/supervisor, o quien tenga acceso a la pestaña (Equipo)
create or replace function public.can_seguimiento_pauta()
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and (role = 'admin' or coalesce(is_super_admin, false))
  ) or exists (
    select 1 from public.page_access
    where user_id = auth.uid() and page = 'seguimiento_pauta'
  )
$$;

alter table public.seguimiento_pauta enable row level security;
alter table public.seguimiento_pauta_informes enable row level security;

drop policy if exists "Seguimiento pauta acceso" on public.seguimiento_pauta;
create policy "Seguimiento pauta acceso" on public.seguimiento_pauta
  for all to authenticated
  using (public.can_seguimiento_pauta())
  with check (public.can_seguimiento_pauta());

drop policy if exists "Seguimiento pauta informes acceso" on public.seguimiento_pauta_informes;
create policy "Seguimiento pauta informes acceso" on public.seguimiento_pauta_informes
  for all to authenticated
  using (public.can_seguimiento_pauta())
  with check (public.can_seguimiento_pauta());

-- 4. Tiempo real (si ya estaba agregado, se ignora)
do $$
begin
  begin
    alter publication supabase_realtime add table public.seguimiento_pauta;
  exception when others then null;
  end;
  begin
    alter publication supabase_realtime add table public.seguimiento_pauta_informes;
  exception when others then null;
  end;
end $$;
