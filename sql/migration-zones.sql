-- ============================================================================
-- OIM CR - Desk Booking | Renombrar zonas de escritorios
-- Ejecutar en: Supabase Dashboard -> SQL Editor -> New query
-- ============================================================================

update public.desks
set zona = 'Área común'
where zona = 'Proyectos';

update public.desks
set zona = 'Oficina CoM'
where zona in ('Oficina coM', 'Oficina CoM');

update public.desks
set zona = 'Sala grande'
where zona = 'Heads';

-- ============================================================================
-- LISTO. Zonas actualizadas:
--   Proyectos   -> Área común
--   Heads       -> Sala grande
--   Oficina COM -> Oficina CoM (solo C y M mayúsculas)
--   Sala RMU    -> (sin cambios)
-- ============================================================================