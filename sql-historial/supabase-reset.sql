-- ============================================
-- PASO 1: LIMPIAR TODO (corre esto primero)
-- ============================================

-- Eliminar triggers
drop trigger if exists on_auth_user_created on auth.users;
drop trigger if exists on_schedule_item_created on public.schedule_items;
drop trigger if exists on_activity_marked_done on public.schedule_items;
drop trigger if exists on_task_approval_change on public.tasks;
drop trigger if exists on_task_column_change on public.tasks;

-- Eliminar funciones
drop function if exists public.handle_new_user() cascade;
drop function if exists public.notify_on_schedule_insert() cascade;
drop function if exists public.notify_on_activity_done() cascade;
drop function if exists public.notify_on_task_approval() cascade;
drop function if exists public.notify_on_task_move() cascade;

-- Eliminar tablas (en orden por dependencias)
drop table if exists public.notifications cascade;
drop table if exists public.task_messages cascade;
drop table if exists public.task_attachments cascade;
drop table if exists public.schedule_items cascade;
drop table if exists public.tasks cascade;
drop table if exists public.kanban_columns cascade;
drop table if exists public.profiles cascade;
drop table if exists public.departments cascade;

-- Eliminar storage bucket si existe
delete from storage.objects where bucket_id = 'task-attachments';
delete from storage.buckets where id = 'task-attachments';

select 'Limpieza completa. Ahora corre el archivo supabase-completo.sql' as mensaje;
