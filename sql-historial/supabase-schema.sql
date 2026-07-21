-- ============================================
-- TEAMFLOW - SCHEMA INICIAL (Módulo 1)
-- Pega este SQL en: Supabase > SQL Editor > New Query
-- ============================================

-- 1. TABLA DE PERFILES (extiende auth.users)
create table public.profiles (
  id uuid references auth.users(id) on delete cascade primary key,
  full_name text not null,
  role text not null default 'user' check (role in ('admin', 'user')),
  department_id uuid,
  avatar_url text,
  created_at timestamptz default now()
);

-- 2. DEPARTAMENTOS
create table public.departments (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  color text default '#6366f1',
  created_at timestamptz default now()
);

-- Agregar FK de profiles a departments
alter table public.profiles
  add constraint profiles_department_fkey
  foreign key (department_id) references public.departments(id);

-- 3. TAREAS (clientes)
create table public.tasks (
  id uuid default gen_random_uuid() primary key,
  title text not null,
  description text,
  status text not null default 'pending'
    check (status in ('pending', 'in_progress', 'review', 'done')),
  assigned_to uuid references public.profiles(id),
  department_id uuid references public.departments(id),
  created_by uuid references public.profiles(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 4. ITEMS DE CRONOGRAMA (actividades del día)
create table public.schedule_items (
  id uuid default gen_random_uuid() primary key,
  title text not null,
  date date not null,
  assigned_to uuid references public.profiles(id),
  task_id uuid references public.tasks(id) on delete set null,
  is_done boolean default false,
  created_by uuid references public.profiles(id),
  created_at timestamptz default now()
);

-- 5. CHAT POR TAREA
create table public.task_messages (
  id uuid default gen_random_uuid() primary key,
  task_id uuid references public.tasks(id) on delete cascade not null,
  user_id uuid references public.profiles(id) not null,
  content text not null,
  created_at timestamptz default now()
);

-- ============================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================

alter table public.profiles enable row level security;
alter table public.departments enable row level security;
alter table public.tasks enable row level security;
alter table public.schedule_items enable row level security;
alter table public.task_messages enable row level security;

-- Perfiles: todos pueden leer, solo el propio usuario puede editar
create policy "Perfiles visibles para autenticados"
  on public.profiles for select
  to authenticated using (true);

create policy "Usuario actualiza su propio perfil"
  on public.profiles for update
  to authenticated using (auth.uid() = id);

-- Departamentos: solo lectura para todos
create policy "Departamentos visibles"
  on public.departments for select
  to authenticated using (true);

create policy "Solo admin crea departamentos"
  on public.departments for insert
  to authenticated with check (
    (select role from public.profiles where id = auth.uid()) = 'admin'
  );

-- Tareas: todos ven las suyas, admin ve todas
create policy "Usuarios ven sus tareas o si son admin"
  on public.tasks for select
  to authenticated using (
    assigned_to = auth.uid()
    or (select role from public.profiles where id = auth.uid()) = 'admin'
  );

create policy "Admin puede crear y editar tareas"
  on public.tasks for all
  to authenticated using (
    (select role from public.profiles where id = auth.uid()) = 'admin'
  );

-- Cronograma: usuarios ven las suyas, admin ve todas
create policy "Cronograma propio o admin"
  on public.schedule_items for select
  to authenticated using (
    assigned_to = auth.uid()
    or (select role from public.profiles where id = auth.uid()) = 'admin'
  );

create policy "Admin gestiona cronograma"
  on public.schedule_items for all
  to authenticated using (
    (select role from public.profiles where id = auth.uid()) = 'admin'
  );

create policy "Usuario actualiza su propio item (check)"
  on public.schedule_items for update
  to authenticated using (assigned_to = auth.uid());

-- Chat: todos los miembros del equipo pueden leer y escribir
create policy "Mensajes visibles para autenticados"
  on public.task_messages for select
  to authenticated using (true);

create policy "Usuario escribe mensajes"
  on public.task_messages for insert
  to authenticated with check (user_id = auth.uid());

-- ============================================
-- TRIGGER: auto-crear perfil al registrar usuario
-- ============================================
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, full_name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.email),
    coalesce(new.raw_user_meta_data->>'role', 'user')
  );
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ============================================
-- DATOS DE EJEMPLO
-- ============================================

-- Departamentos de ejemplo (ajusta a los tuyos)
insert into public.departments (name, color) values
  ('Diseño', '#818cf8'),
  ('Marketing', '#34d399'),
  ('Ventas', '#fbbf24'),
  ('Operaciones', '#60a5fa');
