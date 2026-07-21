-- ============================================
-- MODULO: GRABACIONES (Videografo)
-- ============================================

drop table if exists public.recordings cascade;

create table public.recordings (
  id uuid default gen_random_uuid() primary key,
  date date not null,
  time_start time,
  time_end time,
  assigned_to uuid[] not null default '{}',          -- videografo(s) asignados
  client_name text,                                    -- cliente
  model_name text,                                     -- modelo
  model_phone text,                                     -- numero de telefono del modelo
  admin_notes text,                                      -- observaciones del admin
  links text,                                            -- links (ubicacion, guiones, etc.)
  user_notes text,                                       -- observaciones del videografo
  videos_uploaded boolean default false,                 -- si subio los videos
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.recordings enable row level security;

-- Todos los usuarios autenticados pueden VER todas las grabaciones
create policy "Todos ven grabaciones" on public.recordings
  for select to authenticated using (true);

-- Solo admin puede crear grabaciones
create policy "Admin crea grabaciones" on public.recordings
  for insert to authenticated with check (
    (select role from public.profiles where id = auth.uid()) = 'admin'
  );

-- Solo admin puede borrar grabaciones
create policy "Admin elimina grabaciones" on public.recordings
  for delete to authenticated using (
    (select role from public.profiles where id = auth.uid()) = 'admin'
  );

-- Update: admin puede editar todo. El videografo asignado solo puede editar
-- user_notes / videos_uploaded (se valida también en el cliente).
create policy "Admin o asignado actualiza grabaciones" on public.recordings
  for update to authenticated using (
    (select role from public.profiles where id = auth.uid()) = 'admin'
    or auth.uid() = any(assigned_to)
  );

-- Trigger para updated_at
create or replace function public.set_recordings_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists on_recordings_updated on public.recordings;
create trigger on_recordings_updated
  before update on public.recordings
  for each row execute function public.set_recordings_updated_at();

-- Realtime
alter publication supabase_realtime add table public.recordings;
