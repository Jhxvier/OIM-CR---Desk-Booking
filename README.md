# OIM CR - DESK BOOKING

Sistema interno de reserva de escritorios de oficina para la **Organización Internacional para las Migraciones · OIM Costa Rica**.

**URL pública:** https://Jhxvier.github.io/OIM-CR---Desk-Booking/

---

## Funcionalidades

### Reservas

- **Login por código OTP**: el usuario ingresa su email institucional y recibe un código de acceso por correo.
- **Cuadrícula semanal**: se elige **Mes + Semana** y se seleccionan uno o varios días y escritorios en la tabla.
  - La **Semana 1** comienza el **primer lunes del mes** (lunes a viernes).
  - Hay 4 semanas, y una **Semana 5** solo cuando la última semana cruza al mes siguiente.
  - Los días pasados se muestran en gris y no se pueden reservar; las semanas anteriores se pueden consultar en modo solo lectura.
- **Ventana de reservas por mes**:
  - Del **día 1 al 24** solo se puede reservar en el **mes actual**.
  - A partir del **día 25** se habilita también el **mes siguiente** (el actual nunca se cierra).
  - El aviso y el límite se recalculan automáticamente a medianoche (hora de Costa Rica), con respaldo cada minuto y al volver a la pestaña.
  - La regla se aplica también en la base de datos mediante un trigger.
- **Días especiales**:
  - **Feriados obligatorios**: se muestran en rojo rayado, no se pueden seleccionar y están bloqueados también en la BD.
  - **Días flotantes**: se muestran en amarillo y se pueden reservar normalmente.
  - Ambos se gestionan desde el panel admin (alta individual, carga masiva y borrado).
- **Límite de 1 reserva por día por correo**: aplica también a las reservas creadas por un admin a nombre de otra persona. Personas distintas pueden reservar el mismo día.
- **Mis reservas**: muestra solo las reservas de la semana visible. En semanas pasadas no aparece el botón Cancelar.
- **LIMPIAR**: quita la selección azul y cancela las reservas propias de la semana visible, previa confirmación.

### Panel de administración

- **Pestaña Reservas**:
  - Consulta por fecha qué escritorio reservó cada persona y cancela reservas para liberar el espacio (por ejemplo, si alguien no asistió).
  - Columna **"Realizada por"**: indica si la reserva la hizo la misma persona o si un administrador la creó **en nombre de** alguien (se toma de la auditoría).
  - Botón **+ RESERVAR A NOMBRE DE**: modal con selector **Mes → Semana → Día**, con feriados rojos y flotantes amarillos; la lista de escritorios muestra solo los disponibles para el día elegido.
  - Si el beneficiario **nunca ha ingresado a la app**, no se crea la reserva y se explica el motivo.
- **Auditoría**:
  - Una fila por reserva con estado **Reserva** o **Cancelada** y columna **Historial** (ej. *"Reservó el 15/11… · Canceló el 17/11…"*).
  - Filtros por usuario, estado, fecha, mes y semana.
  - Exportación a **Excel** y **PDF** respetando los filtros, e incluyendo "Realizado por".
  - Si la tabla está vacía, se reconstruye el historial desde `reservas`.
- **Escritorios y usuarios**: agregar/editar/eliminar/activar escritorios (Grupo y Posición controlan el orden). En Usuarios hay búsqueda por nombre o email, filtro por rol y edición de nombre, email, rol y estado.

### Seguridad

- **Doble reserva bloqueada**: no se permite reservar un escritorio ya ocupado (interfaz + RLS).
- **Sesión segura**: los usuarios normales cierran sesión tras **10 minutos** de inactividad (con aviso previo). Los administradores no tienen límite.
- El panel admin está protegido en dos capas: redirección en el cliente y permisos RLS en la base de datos.
- La anon key es pública por diseño; la seguridad depende de las políticas RLS.

## Roles

| Rol | Acceso |
| --- | --- |
| `user` | App (login, cuadrícula, reservas, mis reservas) |
| `admin` | App + `admin.html` (panel de gestión) |

## Stack

- **Frontend**: HTML + CSS + JavaScript puro, Bootstrap 5 (CDN).
- **Backend / Datos**: Supabase (Auth con email OTP, PostgreSQL con Row Level Security).
- **Hosting**: GitHub Pages.

## Estructura

```
├── index.html                 # Cuadrícula semanal y reservas
├── login.html                 # Acceso con email + código OTP
├── admin.html                 # Panel de administración
├── css/
│   ├── styles.css             # Estilos de la app
│   ├── login.css              # Estilos de la página de acceso
│   ├── admin.css              # Estilos del panel admin
│   └── img/icon.png           # Logo de la aplicación
├── js/
│   ├── app.js                 # Cuadrícula, feriados, límites y mis reservas
│   ├── auth.js                # Flujo de login OTP
│   ├── session-timeout.js     # Cierre por inactividad (solo usuarios)
│   ├── admin.js               # Lógica del panel admin
│   ├── supabase.js            # Cliente Supabase (supabaseClient)
│   └── config.js              # Credenciales del proyecto
└── sql/
    ├── database.sql                       # Esquema, RLS y datos iniciales
    ├── migration-special-days.sql         # Feriados y días flotantes 2027
    ├── migration-reservation-limits.sql   # Límite diario por correo
    ├── migration-admin-reservations.sql   # ID del beneficiario y límite por admin
    └── migration-month-window.sql         # Ventana de reservas por mes
```

## Configuración desde cero (para otro desarrollador)

1. Pide acceso al proyecto Supabase `desk-booking` (URL: `https://hfucnpvmqexemnikkmil.supabase.co`).
2. Configura `js/config.js` con la URL y la anon key del proyecto.
3. Ejecuta `sql/database.sql` en SQL Editor para crear tablas y permisos RLS.
4. Ejecuta las migraciones de `sql/` en este orden:
   1. `migration-special-days.sql`
   2. `migration-reservation-limits.sql`
   3. `migration-admin-reservations.sql`
   4. `migration-month-window.sql`
5. En **Authentication → Providers**, habilita email y desactiva la confirmación de registro (SMTP configurado para envío de códigos desde `ictcostaricasupport@gmail.com`).
6. En **Authentication → URL Configuration**: Site URL y Redirect URLs deben apuntar tanto a `http://127.0.0.1:5500` (desarrollo) como a la URL de GitHub Pages (producción).
7. La anon key es pública por diseño: la seguridad queda cubierta por las políticas RLS.

## Desarrollo local

```powershell
# Sirve la carpeta con un servidor local (Live Server, python -m http.server, etc.)
python -m http.server 5500
# Abre http://127.0.0.1:5500/index.html
```

> GitHub Pages y Supabase requieren HTTPS; para desarrollo local usa `http://localhost:5500` o `127.0.0.1:5500` (ya registrados en Supabase).

## Notas

- Solo los correos que estén en la tabla `allowed_users` (rol `user` o `admin`) pueden iniciar sesión.
- Los usuarios se dan de alta en `auth.users` recién cuando ingresan por primera vez con su OTP; por eso no se puede reservar a nombre de alguien que nunca ha entrado.
- Los correos tipo `@test.com` no reciben códigos: el envío valida dominio (se requiere un correo real).
- El aviso de apertura del mes siguiente se envía manualmente; la app solo controla la ventana de fechas permitidas.
- La presentación, el correo de bienvenida, las capturas y los documentos de prueba se mantienen fuera del repositorio (ver `.gitignore`).
