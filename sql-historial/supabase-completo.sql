-- ============================================
-- IGLU SPACE - SCHEMA COMPLETO ACTUALIZADO
-- Borra todo y recrea desde cero
-- Pega en Supabase > SQL Editor > New Query
-- ============================================

-- Limpiar triggers anteriores
drop trigger if exists on_auth_user_created on auth.users;
drop trigger if exists on_schedule_item_created on public.schedule_items;
drop trigger if exists on_activity_marked_done on public.schedule_items;
drop trigger if exists on_task_approval_change on public.tasks;

-- Limpiar tablas anteriores
drop table if exists public.notifications cascade;
drop table if exists public.task_messages cascade;
drop table if exists public.task_attachments cascade;
drop table if exists public.schedule_items cascade;
drop table if exists public.tasks cascade;
drop table if exists public.kanban_columns cascade;
drop table if exists public.departments cascade;
drop table if exists public.profiles cascade;

-- ============================================
-- 1. PERFILES
-- ============================================
create table public.profiles (
  id uuid references auth.users(id) on delete cascade primary key,
  full_name text not null,
  display_name text,
  role text not null default 'user' check (role in ('admin', 'user')),
  department_id uuid,
  avatar_url text,
  created_at timestamptz default now()
);

-- ============================================
-- 2. DEPARTAMENTOS
-- ============================================
create table public.departments (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  color text default '#6366f1',
  position integer default 0,
  created_at timestamptz default now()
);

alter table public.profiles
  add constraint profiles_department_fkey
  foreign key (department_id) references public.departments(id) on delete set null;

-- ============================================
-- 3. COLUMNAS KANBAN (por departamento)
-- ============================================
create table public.kanban_columns (
  id uuid default gen_random_uuid() primary key,
  department_id uuid references public.departments(id) on delete cascade not null,
  title text not null,
  color text default '#6366f1',
  position integer not null default 0,
  -- a quién va la tarea al llegar a esta columna: 'admin' | 'user' | null
  auto_assign_to text check (auto_assign_to in ('admin', 'user', null)),
  created_at timestamptz default now()
);

-- ============================================
-- 4. TAREAS (clientes) — por departamento
-- ============================================
create table public.tasks (
  id uuid default gen_random_uuid() primary key,
  title text not null,
  description text,
  links text[],                          -- array de links
  status text not null default 'pending'
    check (status in ('pending', 'in_progress', 'review', 'done')),
  column_id uuid references public.kanban_columns(id) on delete set null,
  department_id uuid references public.departments(id) on delete set null,
  assigned_to uuid references public.profiles(id) on delete set null,
  created_by uuid references public.profiles(id) on delete set null,
  approved boolean default null,
  priority text default 'normal'
    check (priority in ('low', 'normal', 'high', 'urgent')),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ============================================
-- 5. PENDIENTES (schedule / cronograma)
-- ============================================
create table public.schedule_items (
  id uuid default gen_random_uuid() primary key,
  title text not null,
  description text,                      -- info adicional del admin
  date date not null,
  assigned_to uuid[],                    -- array: se puede asignar a varias personas
  created_by uuid references public.profiles(id) on delete set null,
  is_done boolean default false,
  time_start time,
  time_end time,
  notes text,                            -- observaciones del admin
  user_observation text,                 -- observaciones del usuario
  created_at timestamptz default now()
);

-- ============================================
-- 6. CHAT DE TAREAS (con adjuntos)
-- ============================================
create table public.task_messages (
  id uuid default gen_random_uuid() primary key,
  task_id uuid references public.tasks(id) on delete cascade not null,
  user_id uuid references public.profiles(id) on delete set null,
  content text,
  attachment_url text,                   -- URL del archivo (imagen/video)
  attachment_type text                   -- 'image' | 'video' | null
    check (attachment_type in ('image', 'video', null)),
  attachment_name text,
  created_at timestamptz default now()
);

-- ============================================
-- 7. NOTIFICACIONES
-- ============================================
create table public.notifications (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  title text not null,
  body text,
  type text not null default 'info'
    check (type in ('info', 'task_assigned', 'activity_assigned', 'activity_done', 'task_approved', 'task_rejected', 'task_moved')),
  read boolean default false,
  reference_id uuid,
  reference_type text,
  created_at timestamptz default now()
);

-- ============================================
-- RLS
-- ============================================
alter table public.profiles enable row level security;
alter table public.departments enable row level security;
alter table public.kanban_columns enable row level security;
alter table public.tasks enable row level security;
alter table public.schedule_items enable row level security;
alter table public.task_messages enable row level security;
alter table public.notifications enable row level security;

-- PROFILES
create policy "Perfiles visibles" on public.profiles for select to authenticated using (true);
create policy "Usuario edita su perfil" on public.profiles for update to authenticated using (auth.uid() = id);
create policy "Admin edita cualquier perfil" on public.profiles for update to authenticated using ((select role from public.profiles where id = auth.uid()) = 'admin');

-- DEPARTMENTS
create policy "Departamentos visibles" on public.departments for select to authenticated using (true);
create policy "Admin gestiona departamentos" on public.departments for all to authenticated using ((select role from public.profiles where id = auth.uid()) = 'admin');

-- KANBAN COLUMNS
create policy "Columnas visibles" on public.kanban_columns for select to authenticated using (true);
create policy "Admin gestiona columnas" on public.kanban_columns for all to authenticated using ((select role from public.profiles where id = auth.uid()) = 'admin');

-- TASKS
create policy "Tareas visibles según departamento" on public.tasks for select to authenticated using (
  (select role from public.profiles where id = auth.uid()) = 'admin'
  or department_id in (select department_id from public.profiles where id = auth.uid())
  or assigned_to = auth.uid()
  or created_by = auth.uid()
);
create policy "Autenticados crean tareas" on public.tasks for insert to authenticated with check (created_by = auth.uid());
create policy "Admin edita tareas" on public.tasks for update to authenticated using ((select role from public.profiles where id = auth.uid()) = 'admin');
create policy "Usuario mueve sus tareas" on public.tasks for update to authenticated using (assigned_to = auth.uid());

-- SCHEDULE ITEMS (pendientes)
create policy "Admin ve todos los pendientes" on public.schedule_items for select to authenticated using (
  (select role from public.profiles where id = auth.uid()) = 'admin'
  or auth.uid() = any(assigned_to)
);
create policy "Admin crea pendientes" on public.schedule_items for insert to authenticated with check ((select role from public.profiles where id = auth.uid()) = 'admin');
create policy "Admin elimina pendientes" on public.schedule_items for delete to authenticated using ((select role from public.profiles where id = auth.uid()) = 'admin');
create policy "Update pendientes" on public.schedule_items for update to authenticated using (
  (select role from public.profiles where id = auth.uid()) = 'admin'
  or auth.uid() = any(assigned_to)
);

-- TASK MESSAGES
create policy "Mensajes visibles" on public.task_messages for select to authenticated using (true);
create policy "Usuarios envían mensajes" on public.task_messages for insert to authenticated with check (user_id = auth.uid());

-- NOTIFICATIONS
create policy "Usuario ve sus notificaciones" on public.notifications for select to authenticated using (user_id = auth.uid());
create policy "Sistema inserta notificaciones" on public.notifications for insert to authenticated with check (true);
create policy "Usuario marca leída" on public.notifications for update to authenticated using (user_id = auth.uid());

-- ============================================
-- TRIGGERS
-- ============================================

-- Auto-crear perfil al registrar
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, full_name, display_name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.email),
    coalesce(new.raw_user_meta_data->>'full_name', new.email),
    coalesce(new.raw_user_meta_data->>'role', 'user')
  );
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Notificar al asignar pendiente
create or replace function public.notify_on_schedule_insert()
returns trigger as $$
declare
  uid uuid;
begin
  if new.assigned_to is not null then
    foreach uid in array new.assigned_to loop
      insert into public.notifications (user_id, title, body, type, reference_id, reference_type)
      values (uid, 'Nuevo pendiente asignado', new.title, 'activity_assigned', new.id, 'schedule_item');
    end loop;
  end if;
  return new;
end;
$$ language plpgsql security definer;

create trigger on_schedule_item_created
  after insert on public.schedule_items
  for each row execute procedure public.notify_on_schedule_insert();

-- Notificar al admin cuando marcan done
create or replace function public.notify_on_activity_done()
returns trigger as $$
declare
  admin_record record;
  worker_name text;
begin
  if new.is_done = true and old.is_done = false then
    select coalesce(display_name, full_name) into worker_name from public.profiles where id = any(new.assigned_to) limit 1;
    for admin_record in (select id from public.profiles where role = 'admin') loop
      insert into public.notifications (user_id, title, body, type, reference_id, reference_type)
      values (admin_record.id, 'Pendiente completado', worker_name || ' completó: ' || new.title, 'activity_done', new.id, 'schedule_item');
    end loop;
  end if;
  return new;
end;
$$ language plpgsql security definer;

create trigger on_activity_marked_done
  after update on public.schedule_items
  for each row execute procedure public.notify_on_activity_done();

-- Notificar al mover tarea de columna
create or replace function public.notify_on_task_move()
returns trigger as $$
declare
  admin_record record;
  col_title text;
  mover_name text;
begin
  if new.column_id is distinct from old.column_id and new.column_id is not null then
    select title into col_title from public.kanban_columns where id = new.column_id;
    select coalesce(display_name, full_name) into mover_name from public.profiles where id = auth.uid();
    -- notificar a admins
    for admin_record in (select id from public.profiles where role = 'admin') loop
      insert into public.notifications (user_id, title, body, type, reference_id, reference_type)
      values (admin_record.id, 'Tarea movida: ' || new.title, 'Movida a "' || col_title || '" por ' || mover_name, 'task_moved', new.id, 'task');
    end loop;
    -- notificar al asignado si no es admin
    if new.assigned_to is not null then
      insert into public.notifications (user_id, title, body, type, reference_id, reference_type)
      values (new.assigned_to, 'Tarea actualizada: ' || new.title, 'Estado: ' || col_title, 'task_moved', new.id, 'task');
    end if;
  end if;
  return new;
end;
$$ language plpgsql security definer;

create trigger on_task_column_change
  after update on public.tasks
  for each row execute procedure public.notify_on_task_move();

-- ============================================
-- STORAGE para adjuntos de chat
-- ============================================
insert into storage.buckets (id, name, public) values ('task-attachments', 'task-attachments', true)
on conflict do nothing;

create policy "Autenticados suben adjuntos"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'task-attachments');

create policy "Adjuntos públicos"
  on storage.objects for select to public
  using (bucket_id = 'task-attachments');

-- ============================================
-- REALTIME
-- ============================================
alter publication supabase_realtime add table public.task_messages;
alter publication supabase_realtime add table public.tasks;
alter publication supabase_realtime add table public.notifications;
alter publication supabase_realtime add table public.schedule_items;

-- ============================================
-- DATOS DE EJEMPLO
-- ============================================
insert into public.departments (name, color, position) values
  ('Diseño',      '#818cf8', 0),
  ('Marketing',   '#34d399', 1),
  ('Audiovisual', '#fbbf24', 2),
  ('Operaciones', '#60a5fa', 3);
