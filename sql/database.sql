-- ============================================================================
-- OIM CR - Desk Booking | Fase 2: Base de datos + Seguridad (RLS)
-- Ejecutar completo en: Supabase Dashboard -> SQL Editor -> New query
-- Proyecto: https://hfucnpvmqexemnikkmil.supabase.co
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. TABLA: allowed_users (lista de personas autorizadas)
--    email  -> palabra clave: identifica a la persona
--    nombre -> nombre visible en la app
--    rol    -> 'user' o 'admin'
--    activo -> false desactiva a la persona sin borrar su historial
-- ----------------------------------------------------------------------------
create table if not exists public.allowed_users (
    email  text primary key,
    nombre text not null,
    rol    text not null default 'user'
           check (rol in ('user', 'admin')),
    activo boolean not null default true,
    created_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- 2. TABLA: desks (escritorios y su posicion en el mapa)
--    pos_x / pos_y -> coordenadas en pixeles dentro del mapa
--    activo -> false lo oculta para los usuarios normales
-- ----------------------------------------------------------------------------
create table if not exists public.desks (
    id uuid primary key default gen_random_uuid(),
    nombre text not null unique,
    zona   text not null,
    pos_x  integer not null,
    pos_y  integer not null,
    activo boolean not null default true,
    created_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- 3. TABLA: reservas
--    Regla fundamental: un escritorio = una reserva por dia.
--    Lo garantiza la restriccion UNIQUE (fecha, desk_id).
-- ----------------------------------------------------------------------------
create table if not exists public.reservas (
    id         uuid primary key default gen_random_uuid(),
    fecha      date not null,
    desk_id    uuid not null references public.desks(id) on delete cascade,
    user_id    uuid not null references auth.users(id) on delete cascade,
    user_email text not null,
    user_nombre text not null default '',
    created_at timestamptz not null default now(),
    constraint reservas_unicas_por_dia unique (fecha, desk_id)
);

create index if not exists reservas_fecha_idx on public.reservas (fecha);

-- ============================================================================
-- 4. FUNCIONES DE SEGURIDAD
-- ============================================================================
-- Devuelve true si el usuario conectado es admin activo.
-- SECURITY DEFINER: se ejecuta como el dueno (postgres) y pasa por encima
-- de RLS, evitando recursiones infinitas en las politicas.
create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
    select coalesce((
        select (rol = 'admin' and activo = true)
        from public.allowed_users
        where email = auth.jwt() ->> 'email'
    ), false);
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated;

-- Comprueba (antes del login) si un email esta autorizado y activo.
-- Es la unica informacion que se expone antes de autenticarse.
create or replace function public.check_email_authorized(target_email text)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
    select exists (
        select 1
        from public.allowed_users
        where email = lower(trim(target_email))
          and activo = true
    );
$$;

revoke all on function public.check_email_authorized(text) from public;
grant execute on function public.check_email_authorized(text) to anon, authenticated;

-- ============================================================================
-- 5. ACTIVAR ROW LEVEL SECURITY
-- ============================================================================
alter table public.allowed_users enable row level security;
alter table public.desks enable row level security;
alter table public.reservas enable row level security;

-- ============================================================================
-- 6. POLITICAS DE ACCESO
-- ============================================================================
-- --- allowed_users -----------------------------------------------------------
-- select: su propia fila (por email del token) o cualquier fila si es admin
create policy allowed_users_select_own_or_admin
on public.allowed_users for select
using (email = auth.jwt() ->> 'email' or public.is_admin());

-- insert / update / delete: solo admin
create policy allowed_users_insert_admin
on public.allowed_users for insert
with check (public.is_admin());

create policy allowed_users_update_admin
on public.allowed_users for update
using (public.is_admin()) with check (public.is_admin());

create policy allowed_users_delete_admin
on public.allowed_users for delete
using (public.is_admin());

-- --- desks -------------------------------------------------------------------
-- select: cualquier usuario autenticado (necesita ver el mapa)
create policy desks_select_authenticated
on public.desks for select
using (auth.role() = 'authenticated');

-- insert / update / delete: solo admin
create policy desks_insert_admin
on public.desks for insert
with check (public.is_admin());

create policy desks_update_admin
on public.desks for update
using (public.is_admin()) with check (public.is_admin());

create policy desks_delete_admin
on public.desks for delete
using (public.is_admin());

-- --- reservas ----------------------------------------------------------------
-- select: cualquier usuario autenticado (ve el estado del mapa y quien reservo)
create policy reservas_select_authenticated
on public.reservas for select
using (auth.role() = 'authenticated');

-- insert: solo puede crear reservas consigo mismo como usuario
create policy reservas_insert_own
on public.reservas for insert
with check (auth.uid() = user_id);

-- delete: puede cancelar las suyas; el admin puede cancelar cualquier
create policy reservas_delete_own_or_admin
on public.reservas for delete
using (user_id = auth.uid() or public.is_admin());

-- Sin politica de update: nadie (ni siquiera admin) modifica una reserva.
-- Para cambiar una reserva se cancela y se crea de nuevo.

-- ----------------------------------------------------------------------------
-- 3b. TABLA: auditoria (historial de reservas y cambios)
--     Cada INSERT / DELETE sobre reservas deja una fila con fecha y hora reales.
-- ----------------------------------------------------------------------------
create table if not exists public.auditoria (
    id            bigint generated always as identity primary key,
    accion        text not null check (accion in ('INSERT', 'DELETE', 'UPDATE')),
    reserva_id    uuid,
    fecha_reserva date,
    desk_id       uuid,
    desk_nombre   text,
    zona          text,
    usuario_id         uuid,
    usuario_email      text,
    usuario_nombre     text,
    accionado_por_id   uuid,
    accionado_por_email text,
    creado_en          timestamptz not null default now()
);

create index if not exists auditoria_creado_en_idx on public.auditoria (creado_en desc);
create index if not exists auditoria_usuario_idx on public.auditoria (usuario_email);
create index if not exists auditoria_fecha_idx on public.auditoria (fecha_reserva);

-- Funcion trigger: escribe la fila de auditoria usando datos de reservas/desks.
create or replace function public.registrar_auditoria()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    v_nombre text;
begin
    if (TG_OP = 'DELETE') then
        v_nombre := coalesce(to_jsonb(OLD) ->> 'user_nombre', '');
        insert into public.auditoria (
            accion, reserva_id, fecha_reserva, desk_id, desk_nombre, zona,
            usuario_id, usuario_email, usuario_nombre,
            accionado_por_id, accionado_por_email, creado_en
        )
        select
            'DELETE', OLD.id, OLD.fecha, OLD.desk_id, d.nombre, d.zona,
            OLD.user_id, OLD.user_email, v_nombre,
            auth.uid(), auth.jwt() ->> 'email', now()
        from public.desks d
        where d.id = OLD.desk_id;
        return OLD;
    else
        v_nombre := coalesce(to_jsonb(NEW) ->> 'user_nombre', '');
        insert into public.auditoria (
            accion, reserva_id, fecha_reserva, desk_id, desk_nombre, zona,
            usuario_id, usuario_email, usuario_nombre,
            accionado_por_id, accionado_por_email, creado_en
        )
        select
            TG_OP, NEW.id, NEW.fecha, NEW.desk_id, d.nombre, d.zona,
            NEW.user_id, NEW.user_email, v_nombre,
            auth.uid(), auth.jwt() ->> 'email', now()
        from public.desks d
        where d.id = NEW.desk_id;
        return NEW;
    end if;
end;
$$;

drop trigger if exists reservas_auditoria on public.reservas;
create trigger reservas_auditoria
after insert or delete on public.reservas
for each row execute function public.registrar_auditoria();

-- --- auditoria ---------------------------------------------------------------
alter table public.auditoria enable row level security;

-- select: cualquier usuario autenticado puede consultar el historial
drop policy if exists auditoria_select_authenticated on public.auditoria;
create policy auditoria_select_authenticated
on public.auditoria for select
using (auth.role() = 'authenticated');

-- nadie puede modificar/borrar el historial (ni siquiera admin)
revoke all on function public.registrar_auditoria() from public;
grant execute on function public.registrar_auditoria() to authenticated;

-- ============================================================================
-- 7. DATOS DE PRUEBA (se sustituiran por los reales al final)
-- ============================================================================
insert into public.allowed_users (email, nombre, rol) values
    ('leivahenry5@gmail.com', 'Henry', 'admin'),
    ('admin@test.com',        'Tu',    'admin'),
    ('juan@test.com',         'Juan',  'user'),
    ('maria@test.com',        'Maria', 'user')
on conflict (email) do nothing;

insert into public.desks (nombre, zona, pos_x, pos_y) values
    ('D2',   'Área común',  200, 100),
    ('D3',   'Área común',  300, 100),
    ('D4',   'Área común',  400, 100),
    ('D5',   'Área común',  500, 100),
    ('D6',   'Área común',  600, 100),
    ('D8',   'Área común',  200, 220),
    ('D9',   'Área común',  300, 220),
    ('D10',  'Área común',  400, 220),
    ('D11',  'Área común',  500, 220),
    ('D12',  'Área común',  600, 220),
    ('D13',  'Área común',  700, 220),
    ('D14',  'Área común',  800, 220),
    ('OP',   'Oficina CoM', 450, 360),
    ('P1',   'Sala grande', 380, 500),
    ('P2',   'Sala grande', 480, 500),
    ('RMU1', 'Sala RMU',    200, 640),
    ('RMU2', 'Sala RMU',    300, 640),
    ('RMU3', 'Sala RMU',    400, 640),
    ('RMU5', 'Sala RMU',    500, 640),
    ('RMU6', 'Sala RMU',    600, 640),
    ('RMU7', 'Sala RMU',    700, 640)
on conflict (nombre) do nothing;

-- ============================================================================
-- 8. DIAS ESPECIALES (feriados obligatorios y dias flotantes)
--    Obligatorio = bloqueado; flotante = se puede reservar, se ve amarillo.
--    (Mismo contenido que sql/migration-special-days.sql)
-- ============================================================================

create table if not exists public.dias_especiales (
    fecha       date primary key,
    tipo        text not null check (tipo in ('obligatorio', 'flotante')),
    descripcion text,
    creado_por  text,
    created_at  timestamptz not null default now()
);

create index if not exists dias_especiales_tipo_idx on public.dias_especiales (tipo);
create index if not exists dias_especiales_fecha_idx on public.dias_especiales (fecha);

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
-- Ventana de reservas por mes (hora Costa Rica):
--   dia 1-24  -> solo mes actual
--   dia 25+   -> mes actual y mes siguiente
-- ----------------------------------------------------------------------------
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
-- LISTO. Comprueba en el dashboard: Tabla Editor -> public.allowed_users,
-- public.desks, public.reservas, public.dias_especiales.
-- ============================================================================