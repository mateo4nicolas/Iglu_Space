-- ============================================
-- FIX RLS para schedule_items con array assigned_to
-- Corre esto en Supabase SQL Editor
-- ============================================

-- Drop old policies
drop policy if exists "Admin ve todos los pendientes" on public.schedule_items;
drop policy if exists "Admin crea pendientes" on public.schedule_items;
drop policy if exists "Admin elimina pendientes" on public.schedule_items;
drop policy if exists "Update pendientes" on public.schedule_items;

-- Recreate with correct array operator
create policy "Ver pendientes"
  on public.schedule_items for select
  to authenticated
  using (
    (select role from public.profiles where id = auth.uid()) = 'admin'
    or auth.uid() = any(assigned_to)
  );

create policy "Admin crea pendientes"
  on public.schedule_items for insert
  to authenticated
  with check (
    (select role from public.profiles where id = auth.uid()) = 'admin'
  );

create policy "Admin elimina pendientes"
  on public.schedule_items for delete
  to authenticated
  using (
    (select role from public.profiles where id = auth.uid()) = 'admin'
  );

create policy "Actualizar pendientes"
  on public.schedule_items for update
  to authenticated
  using (
    (select role from public.profiles where id = auth.uid()) = 'admin'
    or auth.uid() = any(assigned_to)
  );

select 'RLS fix aplicado correctamente' as resultado;
