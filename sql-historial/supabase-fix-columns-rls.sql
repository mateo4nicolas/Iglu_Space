-- FIX: Usuarios pueden ver columnas de cualquier dept destino en transferencias
drop policy if exists "Columnas visibles" on public.kanban_columns;
drop policy if exists "Columnas visibles transfer" on public.kanban_columns;

create policy "Columnas visibles"
  on public.kanban_columns for select to authenticated
  using (true);
