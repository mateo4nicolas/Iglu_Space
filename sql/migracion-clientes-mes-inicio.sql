-- ============================================================
-- MIGRACIÓN: Clientes visibles solo desde el ciclo en que se añadieron
-- Ejecutar en Supabase > SQL Editor > New Query
-- ============================================================
--
-- clients.mes_inicio / cobro_lista_clientes.mes_inicio = mes base (YYYY-MM)
-- del ciclo en que se creó el cliente. En los meses anteriores el cliente
-- no aparece (Matriz, Vista Clientes, Cronograma de Contenidos, Cobro).
--   - Ciclo 1_31 : el mes de creación.
--   - Ciclo 15_14: si se creó del 15 en adelante, ese mes; antes del 15, el anterior.
-- "Gestionar clientes del mes" en la Matriz sigue pudiendo activarlo a mano
-- en un mes anterior si hiciera falta.
-- ============================================================

-- 1. Función: mes base del ciclo para una fecha
create or replace function public.mes_base_ciclo(p_fecha timestamptz, p_periodo text)
returns text
language sql
immutable
as $$
  select case
    when p_periodo = '15_14'
         and extract(day from (p_fecha at time zone 'America/Guayaquil')) < 15
      then to_char((p_fecha at time zone 'America/Guayaquil') - interval '1 month', 'YYYY-MM')
    else to_char(p_fecha at time zone 'America/Guayaquil', 'YYYY-MM')
  end
$$;

-- ── Clientes de la plataforma (Matriz / Vista Clientes / Cronograma) ──────────
alter table public.clients
  add column if not exists mes_inicio text;

-- Backfill: el más antiguo entre el ciclo de creación, la primera tarea del
-- cliente y el primer registro de visibilidad (para no esconder historial real).
update public.clients c
   set mes_inicio = least(
         public.mes_base_ciclo(coalesce(c.created_at, now()), c.billing_period),
         (select min(t.mes_tarea) from public.tasks t where t.cliente_id = c.id),
         (select min(v.mes) from public.matriz_client_visibility v where v.cliente_id = c.id)
       )
 where c.mes_inicio is null;

create or replace function public.set_client_mes_inicio()
returns trigger
language plpgsql
as $$
begin
  if new.mes_inicio is null then
    new.mes_inicio := public.mes_base_ciclo(coalesce(new.created_at, now()), new.billing_period);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_client_mes_inicio on public.clients;
create trigger trg_client_mes_inicio
  before insert on public.clients
  for each row execute function public.set_client_mes_inicio();

-- ── Lista propia de Cobro Clientes (ciclo 15 a 14) ────────────────────────────
alter table public.cobro_lista_clientes
  add column if not exists mes_inicio text;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'cobro_lista_clientes' and column_name = 'created_at'
  ) then
    execute $q$
      update public.cobro_lista_clientes l
         set mes_inicio = least(
               public.mes_base_ciclo(coalesce(l.created_at, now()), '15_14'),
               (select min(r.mes) from public.cobro_clientes r where r.cliente_id = l.id)
             )
       where l.mes_inicio is null
    $q$;
  else
    update public.cobro_lista_clientes l
       set mes_inicio = (select min(r.mes) from public.cobro_clientes r where r.cliente_id = l.id)
     where l.mes_inicio is null;
  end if;
end $$;

create or replace function public.set_cobro_cliente_mes_inicio()
returns trigger
language plpgsql
as $$
begin
  if new.mes_inicio is null then
    new.mes_inicio := public.mes_base_ciclo(now(), '15_14');
  end if;
  return new;
end;
$$;

drop trigger if exists trg_cobro_cliente_mes_inicio on public.cobro_lista_clientes;
create trigger trg_cobro_cliente_mes_inicio
  before insert on public.cobro_lista_clientes
  for each row execute function public.set_cobro_cliente_mes_inicio();
