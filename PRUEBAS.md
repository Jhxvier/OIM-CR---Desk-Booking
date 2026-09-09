# OIM CR - Desk Booking · Guía de pruebas (Fase 8)

Antes de publicar. Recargar cada página con `Ctrl+F5` y entrar desde `login.html`.

Requisito para pruebas multiusuario: un **segundo email real** (un colega o un Gmail de respaldo) añadido como `user` desde el panel de Administración. Los emails tipo `@test.com` NO sirven: Supabase valida que el dominio exista.

---

## 1 · Acceso

| Prueba                                             | Resultado esperado                                        |
| -------------------------------------------------- | --------------------------------------------------------- |
| Email **no autorizado** (p. ej. `pepe@gmail.com`)  | Muestra "Este email no está autorizado"; **no** llega OTP |
| Email autorizado vacío / formato incorrecto        | Mensaje de validación en el formulario                    |
| Código OTP **incorrecto**                          | Error "código inválido"; se puede reintentar              |
| Código OTP correcto                                | Sesión iniciada y acceso a la aplicación                  |
| 5 minutos sin actividad (usuario normal)           | Cronómetro se pone rojo → sesión cerrada y vuelve al login |

## 2 · Usuario (mapa y reservas)

| Prueba                                             | Resultado esperado                                            |
| -------------------------------------------------- | ------------------------------------------------------------- |
| Cambiar la fecha                                   | El mapa se recarga y marca los ocupados de ese día            |
| Clic en escritorio **verde** (libre)               | El panel muestra Zona / Estado y el botón **RESERVAR**        |
| Reservar                                           | Confirmación; el escritorio pasa a rojo y aparece en "Mis reservas" |
| Clic en escritorio **rojo** (ocupado)              | No se puede reservar; aparece quién lo reservó                |
| Cancelar desde "Mis reservas"                      | Pide confirmación en el modal y el escritorio vuelve a verde  |
| Vista móvil (DevTools / pantalla reducida)         | Mapa legible, filas centradas, navbar ordenado                |

## 3 · Admin (enlace "Administración" del navbar)

| Prueba                                  | Resultado esperado                                |
| --------------------------------------- | ------------------------------------------------- |
| Ver reservas de una fecha               | Tabla con quién reservó cada escritorio           |
| Cancelar reserva de otra persona        | Reserva eliminada (los demás ya no la ven)        |
| Añadir un escritorio                    | Aparece centrado en su zona dentro del mapa       |
| Desactivar / Activar un escritorio      | Deja de aparecer / vuelve a aparecer para usuarios|
| Añadir un usuario                       | Aparece en la lista de Usuarios                   |
| Cambiar rol de un usuario               | El cambio aplica de inmediato                     |
| Eliminar usuario o escritorio           | Se elimina tras la confirmación                   |

## 4 · Seguridad (lo crítico)

| Prueba                                                        | Resultado esperado                                      |
| ------------------------------------------------------------- | ------------------------------------------------------- |
| Un **usuario normal** escribe `admin.html` directamente       | Redirige a la app; aunque manipule la página, la BD rechaza todo |
| Usuario intenta borrar la reserva de otro                     | RLS lo impide                                          |
| Usuario intenta cambiar su propio rol a admin                 | RLS lo rechaza                                         |
| Dos personas reservan el mismo escritorio el mismo día        | Imposible: restricción `UNIQUE (fecha, desk_id)` en BD  |
| Usuario desactivado intenta entrar                            | "Este email no está autorizado" (no recibe código)      |

---

## Notas

- La protección del panel de administración **no depende del navegador**: el servidor (RLS de Supabase) la impone, incluso si alguien escribe la URL a mano.
- Si un usuario queda inactivo 5 minutos: aviso 60 s antes, cronómetro rojo y cierre automático de la sesión. Los administradores no tienen este límite.