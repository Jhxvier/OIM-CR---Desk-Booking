-- ============================================================================
-- OIM CR - Desk Booking | Renombrar zonas de escritorios
-- Ejecutar en: Supabase Dashboard -> SQL Editor -> New query
-- ============================================================================

update public.desks
set zona = 'Área común'
where zona = 'Proyectos';

update public.desks
set zona = 'Oficina coM'
where zona = 'Oficina CoM';

update public.desks
set zona = 'Sala grande'
where zona = 'Heads';

-- ============================================================================
-- LISTO. Zonas actualizadas:
--   Proyectos   -> Área común
--   Oficina CoM -> Oficina coM
--   Heads       -> Sala grande
--   Sala RMU    -> (sin cambios)
-- ============================================================================