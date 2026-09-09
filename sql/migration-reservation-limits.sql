-- ============================================================================
-- OIM CR - Desk Booking | Migration: Límites de reserva y reserva por admin
-- Ejecutar en: Supabase Dashboard -> SQL Editor -> New query
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. FUNCIÓN: Verificar límite diario de reservas por usuario
--    Admin puede reservar ilimitadamente; usuario regular solo 1 por día.
-- ----------------------------------------------------------------------------
create or replace function public.check_user_daily_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    if exists (
      select 1
      from public.reservas
      where user_id = auth.uid()
        and fecha = NEW.fecha
    ) then
      raise exception 'Solo puedes reservar un escritorio por día.';
    end if;
  end if;
  return NEW;
end;
$$;

-- ----------------------------------------------------------------------------
-- 2. TRIGGER: Aplicar límite antes de cada INSERT en reservas
-- ----------------------------------------------------------------------------
drop trigger if exists enforce_daily_limit on public.reservas;

create trigger enforce_daily_limit
  before insert on public.reservas
  for each row
  execute function public.check_user_daily_limit();

-- ----------------------------------------------------------------------------
-- 3. MODIFICAR RLS: Permitir al admin insertar reservas por cualquier usuario
--    Política anterior: auth.uid() = user_id (solo uno mismo)
--    Política nueva:    auth.uid() = user_id OR is_admin()
-- ----------------------------------------------------------------------------
drop policy if exists reservas_insert_own on public.reservas;

create policy reservas_insert_own_or_admin
  on public.reservas for insert
  with check (
    auth.uid() = user_id or public.is_admin()
  );

-- ============================================================================
-- LISTO. Resumen de cambios:
--   - Usuarios regulares: máximo 1 reserva por día (validado en trigger)
--   - Admin: puede reservar ilimitadamente a nombre de cualquier usuario
--   - RLS actualizado para permitir admin insertar por otros
-- ============================================================================
