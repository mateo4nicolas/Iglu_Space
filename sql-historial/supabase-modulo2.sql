-- ============================================
-- TEAMFLOW - MÓDULO 2: Kanban + Chat
-- Pega en Supabase > SQL Editor > New Query
-- ============================================

-- 1. COLUMNAS DEL KANBAN (personalizables)
create table public.kanban_columns (
  id uuid default gen_random_uuid() primary key,
  title text not null,
  color text default '#6366f1',
  position integer not null default 0,
  created_at timestamptz default now()
);

-- Insertar columnas por defecto (puedes editarlas desde la app)
insert into public.kanban_columns (title, color, position) values
  ('Pendiente',   '#fbbf24', 0),
  ('En progreso', '#60a5fa', 1),
  ('En revisión', '#a78bfa', 2),
  ('Completado',  '#34d399', 3);

-- 2. Agregar columna_id y aprobación a tasks
alter table public.tasks
  add column if not exists column_id uuid references public.kanban_columns(id),
  add column if not exists approved boolean default null,
  add column if not exists priority text default 'normal'
    check (priority in ('low', 'normal', 'high', 'urgent'));

-- Poner todas las tareas existentes en la primera columna
update public.tasks
  set column_id = (select id from public.kanban_columns order by position limit 1)
  where column_id is null;

-- 3. ARCHIVOS ADJUNTOS en tareas
create table public.task_attachments (
  id uuid default gen_random_uuid() primary key,
  task_id uuid references public.tasks(id) on delete cascade not null,
  name text not null,
  url text not null,
  uploaded_by uuid references public.profiles(id),
  created_at timestamptz default now()
);

-- ============================================
-- RLS para nuevas tablas
-- ============================================

alter table public.kanban_columns enable row level security;
alter table public.task_attachments enable row level security;

-- Columnas: todos leen, solo admin edita
create policy "Columnas visibles para autenticados"
  on public.kanban_columns for select
  to authenticated using (true);

create policy "Solo admin gestiona columnas"
  on public.kanban_columns for all
  to authenticated using (
    (select role from public.profiles where id = auth.uid()) = 'admin'
  );

-- Adjuntos: autenticados leen y crean
create policy "Adjuntos visibles"
  on public.task_attachments for select
  to authenticated using (true);

create policy "Usuarios suben adjuntos"
  on public.task_attachments for insert
  to authenticated with check (uploaded_by = auth.uid());

-- Actualizar policy de tasks para que usuarios también puedan crear (pendiente aprobación)
drop policy if exists "Admin puede crear y editar tareas" on public.tasks;

create policy "Autenticados crean tareas (requieren aprobación)"
  on public.tasks for insert
  to authenticated
  with check (created_by = auth.uid());

create policy "Admin edita cualquier tarea"
  on public.tasks for update
  to authenticated
  using (
    (select role from public.profiles where id = auth.uid()) = 'admin'
  );

create policy "Usuario mueve sus propias tareas"
  on public.tasks for update
  to authenticated
  using (assigned_to = auth.uid());

-- Habilitar realtime en mensajes y tareas
alter publication supabase_realtime add table public.task_messages;
alter publication supabase_realtime add table public.tasks;
