-- ============================================
-- TEAMFLOW - MÓDULO 4: Equipo
-- Pega en Supabase > SQL Editor > New Query
-- ============================================

-- Permitir que admin actualice cualquier perfil (rol, departamento)
create policy "Admin actualiza cualquier perfil"
  on public.profiles for update
  to authenticated
  using (
    (select role from public.profiles where id = auth.uid()) = 'admin'
  );

-- Permitir que admin elimine usuarios de profiles
create policy "Admin elimina perfiles"
  on public.profiles for delete
  to authenticated
  using (
    (select role from public.profiles where id = auth.uid()) = 'admin'
  );

-- Permitir actualizar y eliminar departamentos
create policy "Admin actualiza departamentos"
  on public.departments for update
  to authenticated
  using (
    (select role from public.profiles where id = auth.uid()) = 'admin'
  );

create policy "Admin elimina departamentos"
  on public.departments for delete
  to authenticated
  using (
    (select role from public.profiles where id = auth.uid()) = 'admin'
  );
