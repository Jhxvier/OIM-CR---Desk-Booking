-- ============================================================================
-- OIM CR - Desk Booking | Alinear reservas hechas por admin "en nombre de"
-- Ejecutar en: Supabase Dashboard -> SQL Editor -> New query
-- Seguro de re-ejecutar. No modifica tablas existentes.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Obtener el id real de auth.users de un correo (solo admins).
--    Necesario para que la reserva pertenezca al beneficiario y este pueda
--    cancelarla desde "Mis reservas" (la RLS compara user_id = auth.uid()).
-- ----------------------------------------------------------------------------
create or replace function public.get_auth_id_by_email(target_email text)
returns uuid
language sql
security definer
set search_path = public
stable
as $$
    select case when public.is_admin() then (
        select u.id
        from auth.users u
        where lower(u.email) = lower(trim(target_email))
        limit 1
    ) else null end;
$$;

revoke all on function public.get_auth_id_by_email(text) from public;
grant execute on function public.get_auth_id_by_email(text) to authenticated;

-- ----------------------------------------------------------------------------
-- 2. Límite de 1 reserva por día POR CORREO, incluyendo las que un admin
--    crea a nombre de otra persona. Distintas personas el mismo día sí pueden.
-- ----------------------------------------------------------------------------
create or replace function public.check_user_daily_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (
    select 1
    from public.reservas
    where lower(user_email) = lower(NEW.user_email)
      and fecha = NEW.fecha
  ) then
    raise exception 'Solo se permite una reserva por día por persona.';
  end if;
  return NEW;
end;
$$;

revoke all on function public.check_user_daily_limit() from public;
grant execute on function public.check_user_daily_limit() to authenticated;

drop trigger if exists enforce_daily_limit on public.reservas;
create trigger enforce_daily_limit
  before insert on public.reservas
  for each row execute function public.check_user_daily_limit();

-- ============================================================================
-- LISTO. El dueño de la reserva es siempre el beneficiario (su ID real de
-- auth.users). Si nunca ha ingresado a la app, no se puede reservar a su nombre.
-- ============================================================================
