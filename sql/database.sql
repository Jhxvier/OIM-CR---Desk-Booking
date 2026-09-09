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
    ('OP',   'Oficina coM', 450, 360),
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
-- LISTO. Comprueba en el dashboard: Tabla Editor -> public.allowed_users,
-- public.desks, public.reservas.
-- ============================================================================