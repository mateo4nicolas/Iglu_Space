-- Fix: Allow admins to delete tasks
create policy "Admin elimina tareas"
  on public.tasks for delete
  to authenticated
  using ((select role from public.profiles where id = auth.uid()) = 'admin');
