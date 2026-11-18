-- ============================================================================
-- OIM CR - Desk Booking | Días especiales (feriados obligatorios y flotantes)
-- Ejecutar en: Supabase Dashboard -> SQL Editor -> New query
-- Seguro de re-ejecutar (usa if not exists / drop policy if exists).
-- NO modifica tablas, políticas ni triggers existentes.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. TABLA: dias_especiales
--    obligatorio -> día no laborable: bloqueado, no se puede reservar.
--    flotante    -> día opcional: se puede reservar, se muestra en amarillo.
-- ----------------------------------------------------------------------------
create table if not exists public.dias_especiales (
    fecha       date primary key,
    tipo        text not null check (tipo in ('obligatorio', 'flotante')),
    descripcion text,
    creado_por  text,
    created_at  timestamptz not null default now()
);

create index if not exists dias_especiales_tipo_idx on public.dias_especiales (tipo);
create index if not exists dias_especiales_fecha_idx on public.dias_especiales (fecha);

-- ----------------------------------------------------------------------------
-- 2. SEGURIDAD: todos pueden verlos, solo admin puede agregar/quitar
-- ----------------------------------------------------------------------------
alter table public.dias_especiales enable row level security;

drop policy if exists dias_especiales_select_authenticated on public.dias_especiales;
create policy dias_especiales_select_authenticated
on public.dias_especiales for select
using (auth.role() = 'authenticated');

drop policy if exists dias_especiales_insert_admin on public.dias_especiales;
create policy dias_especiales_insert_admin
on public.dias_especiales for insert
with check (public.is_admin());

drop policy if exists dias_especiales_update_admin on public.dias_especiales;
create policy dias_especiales_update_admin
on public.dias_especiales for update
using (public.is_admin()) with check (public.is_admin());

drop policy if exists dias_especiales_delete_admin on public.dias_especiales;
create policy dias_especiales_delete_admin
on public.dias_especiales for delete
using (public.is_admin());

-- ----------------------------------------------------------------------------
-- 3. BLOQUEO EN BASE DE DATOS: nadie puede reservar en feriado obligatorio.
--    (la app también lo valida, esto es la capa de seguridad real)
-- ----------------------------------------------------------------------------
create or replace function public.check_dia_obligatorio()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (
    select 1 from public.dias_especiales
    where fecha = NEW.fecha and tipo = 'obligatorio'
  ) then
    raise exception 'No se puede reservar en un feriado obligatorio.';
  end if;
  return NEW;
end;
$$;

revoke all on function public.check_dia_obligatorio() from public;
grant execute on function public.check_dia_obligatorio() to authenticated;

drop trigger if exists enforce_dia_obligatorio on public.reservas;
create trigger enforce_dia_obligatorio
  before insert on public.reservas
  for each row execute function public.check_dia_obligatorio();

-- ----------------------------------------------------------------------------
-- 4. DATOS 2027 (según circular de IOM)
--    Se usa la fecha laborable indicada; entre paréntesis queda el día
--    "observado" cuando cae en fin de semana.
--    ON CONFLICT DO NOTHING: respeta cambios hechos desde el panel admin.
-- ----------------------------------------------------------------------------
insert into public.dias_especiales (fecha, tipo, descripcion, creado_por) values
    ('2027-01-01', 'obligatorio', 'Año Nuevo', 'migracion'),
    ('2027-03-09', 'obligatorio', 'Eid al-Fitr', 'migracion'),
    ('2027-03-25', 'obligatorio', 'Jueves Santo', 'migracion'),
    ('2027-03-26', 'obligatorio', 'Viernes Santo', 'migracion'),
    ('2027-05-17', 'obligatorio', 'Eid al-Adha', 'migracion'),
    ('2027-08-16', 'obligatorio', 'Día de la Madre', 'migracion'),
    ('2027-09-15', 'obligatorio', 'Día de la Independencia', 'migracion'),
    ('2027-12-01', 'obligatorio', 'Abolición del Ejército', 'migracion'),
    ('2027-12-24', 'obligatorio', 'Navidad', 'migracion'),
    ('2027-01-07', 'flotante', 'Navidad Ortodoxa', 'migracion'),
    ('2027-02-05', 'flotante', 'Año Nuevo Lunar', 'migracion'),
    ('2027-03-22', 'flotante', 'Nowruz', 'migracion'),
    ('2027-04-30', 'flotante', 'Viernes Santo Ortodoxo', 'migracion'),
    ('2027-05-20', 'flotante', 'Día de Vesak', 'migracion'),
    ('2027-07-26', 'flotante', 'Anexión del Partido de Nicoya', 'migracion'),
    ('2027-10-11', 'flotante', 'Yom Kipur', 'migracion'),
    ('2027-10-29', 'flotante', 'Diwali', 'migracion'),
    ('2027-11-15', 'flotante', 'Gurpurab', 'migracion')
on conflict (fecha) do nothing;

-- ============================================================================
-- LISTO. Verificación:
--   select fecha, tipo, descripcion from public.dias_especiales order by fecha;
-- ============================================================================
