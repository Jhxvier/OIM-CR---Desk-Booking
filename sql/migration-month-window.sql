-- ============================================================================
-- OIM CR - Desk Booking | Ventana de reservas por mes
-- Ejecutar en: Supabase Dashboard -> SQL Editor -> New query
-- Seguro de re-ejecutar.
--
-- Regla:
--   - Del 1 al 24 de cada mes: solo se puede reservar en el MES ACTUAL.
--   - Del 25 en adelante: se habilita tambien el MES SIGUIENTE.
--   - El mes actual NUNCA se cierra; los dias pasados se siguen viendo en gris.
--   - Hora de Costa Rica (America/Costa_Rica), no UTC.
-- ============================================================================

create or replace function public.check_mes_reserva_abierto()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    v_hoy     date;
    v_inicio  date;
    v_fin     date;
begin
    v_hoy := (now() at time zone 'America/Costa_Rica')::date;
    v_inicio := date_trunc('month', v_hoy)::date;

    -- Si ya es dia 25 o mas, el limite es el ultimo dia del mes siguiente.
    if extract(day from v_hoy) >= 25 then
        v_fin := (date_trunc('month', v_hoy) + interval '2 months' - interval '1 day')::date;
    else
        v_fin := (date_trunc('month', v_hoy) + interval '1 month' - interval '1 day')::date;
    end if;

    if NEW.fecha < v_inicio or NEW.fecha > v_fin then
        raise exception 'Reservas solo están abiertas para el mes actual. A partir del día 25 se habilita el mes siguiente.';
    end if;

    return NEW;
end;
$$;

revoke all on function public.check_mes_reserva_abierto() from public;
grant execute on function public.check_mes_reserva_abierto() to authenticated;

drop trigger if exists enforce_mes_reserva on public.reservas;
create trigger enforce_mes_reserva
  before insert or update on public.reservas
  for each row execute function public.check_mes_reserva_abierto();

-- ============================================================================
-- LISTO. Verificacion rapida:
--   select now() at time zone 'America/Costa_Rica' as hoy_cr;
-- ============================================================================
