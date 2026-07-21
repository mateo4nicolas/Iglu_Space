-- ============================================
-- TEAMFLOW - MÓDULO 3: Cronograma + Notificaciones
-- Pega en Supabase > SQL Editor > New Query
-- ============================================

-- 1. TABLA DE NOTIFICACIONES
create table public.notifications (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  title text not null,
  body text,
  type text not null default 'info'
    check (type in ('info', 'task_assigned', 'activity_assigned', 'activity_done', 'task_approved', 'task_rejected')),
  read boolean default false,
  reference_id uuid,       -- id de la tarea o actividad relacionada
  reference_type text,     -- 'task' | 'schedule_item'
  created_at timestamptz default now()
);

-- 2. Agregar campo de hora a schedule_items
alter table public.schedule_items
  add column if not exists time_start time,
  add column if not exists time_end time,
  add column if not exists notes text;

-- ============================================
-- RLS notificaciones
-- ============================================
alter table public.notifications enable row level security;

create policy "Usuario ve sus propias notificaciones"
  on public.notifications for select
  to authenticated using (user_id = auth.uid());

create policy "Sistema inserta notificaciones"
  on public.notifications for insert
  to authenticated with check (true);

create policy "Usuario marca como leída"
  on public.notifications for update
  to authenticated using (user_id = auth.uid());

-- ============================================
-- FUNCIÓN: crear notificación al asignar actividad
-- ============================================
create or replace function public.notify_on_schedule_insert()
returns trigger as $$
begin
  if new.assigned_to is not null then
    insert into public.notifications (user_id, title, body, type, reference_id, reference_type)
    values (
      new.assigned_to,
      'Nueva actividad asignada',
      new.title,
      'activity_assigned',
      new.id,
      'schedule_item'
    );
  end if;
  return new;
end;
$$ language plpgsql security definer;

create trigger on_schedule_item_created
  after insert on public.schedule_items
  for each row execute procedure public.notify_on_schedule_insert();

-- ============================================
-- FUNCIÓN: notificar al admin cuando marcan done
-- ============================================
create or replace function public.notify_on_activity_done()
returns trigger as $$
declare
  admin_record record;
  worker_name text;
begin
  if new.is_done = true and old.is_done = false then
    select full_name into worker_name from public.profiles where id = new.assigned_to;

    for admin_record in (select id from public.profiles where role = 'admin') loop
      insert into public.notifications (user_id, title, body, type, reference_id, reference_type)
      values (
        admin_record.id,
        'Actividad completada',
        worker_name || ' completó: ' || new.title,
        'activity_done',
        new.id,
        'schedule_item'
      );
    end loop;
  end if;
  return new;
end;
$$ language plpgsql security definer;

create trigger on_activity_marked_done
  after update on public.schedule_items
  for each row execute procedure public.notify_on_activity_done();

-- ============================================
-- FUNCIÓN: notificar al usuario cuando aprueban/rechazan tarea
-- ============================================
create or replace function public.notify_on_task_approval()
returns trigger as $$
begin
  if new.approved is distinct from old.approved and new.approved is not null then
    if new.created_by is not null then
      insert into public.notifications (user_id, title, body, type, reference_id, reference_type)
      values (
        new.created_by,
        case when new.approved then 'Tarea aprobada' else 'Tarea rechazada' end,
        new.title,
        case when new.approved then 'task_approved' else 'task_rejected' end,
        new.id,
        'task'
      );
    end if;
  end if;
  return new;
end;
$$ language plpgsql security definer;

create trigger on_task_approval_change
  after update on public.tasks
  for each row execute procedure public.notify_on_task_approval();

-- Habilitar realtime en notificaciones
alter publication supabase_realtime add table public.notifications;
alter publication supabase_realtime add table public.schedule_items;
