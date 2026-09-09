# OIM CR - DESK BOOKING

Sistema interno de reserva de escritorios de oficina para la **Organización Internacional para las Migraciones · OIM Costa Rica**.

**URL pública:** https://Jhxvier.github.io/OIM-CR---Desk-Booking/

---

## Funcionalidades

- **Login por código OTP**: el usuario ingresa su email institucional y recibe un código de acceso por correo.
- **Mapa de escritorios**: reservas del día organizadas por bloques de zona. Un escritorio disponible se muestra en verde; reservado, en rojo con el nombre de quien lo reservó.
- **Doble reserva bloqueada**: no se permite reservar un escritorio ya ocupado (vía interfaz + reglas RLS en la base de datos).
- **Mis reservas**: el usuario ve y cancela sus propias reservas.
- **Panel admin**: gestión de reservas, escritorios (agregar/editar/eliminar) y usuarios (permitir o quitar acceso con rol `user` o `admin`).
- **Sesión segura**: los usuarios normales cierran sesión automáticamente tras 5 minutos de inactividad (aviso antes de cerrar). Los administradores no tienen límite.
- **Responsive**: funciona en escritorio y móvil.

## Roles

| Rol | Acceso |
| --- | --- |
| `user` | App (login, mapa, reservas, mis reservas) |
| `admin` | App + `admin.html` (panel de gestión) |

El panel de administración está protegido en dos capas: redirección en el cliente y permisos RLS en la base de datos.

## Stack

- **Frontend**: HTML + CSS + JavaScript puro, Bootstrap 5 (CDN).
- **Backend / Datos**: Supabase (Auth con email OTP, PostgreSQL con Row Level Security).
- **Hosting**: GitHub Pages.

## Estructura

```
├── index.html                 # Mapa de escritorios y reservas
├── login.html                 # Acceso con email + código OTP
├── admin.html                 # Panel de administración
├── css/
│   ├── styles.css             # Estilos de la app (mapa, navbar, footer)
│   ├── login.css              # Estilos de la página de acceso
│   └── admin.css              # Estilos del panel admin
│   └── img/icon.png           # Logo de la aplicación
├── js/
│   ├── auth.js                # Flujo de login OTP
│   ├── desks.js               # Render y lógica del mapa
│   ├── session-timeout.js     # Cierre por inactividad (solo usuarios)
│   ├── admin.js               # Lógica del panel admin
│   ├── supabase.js            # Cliente Supabase (supabaseClient)
│   └── config.js              # Credenciales del proyecto
└── sql/database.sql           # Esquema, RLS y datos iniciales
```

## Configuración desde cero (para otro desarrollador)

1. Pide acceso al proyecto Supabase `desk-booking` (URL: `https://hfucnpvmqexemnikkmil.supabase.co`).
2. Configura `js/config.js` con la URL y la anon key del proyecto.
3. Ejecuta `sql/database.sql` en SQL Editor para crear tablas y permisos RLS.
4. En **Authentication → Providers**, habilita email y desactiva la confirmación de registro (SMTP configurado para envío de códigos).
5. En **Authentication → URL Configuration**: Site URL y Redirect URLs deben apuntar tanto a `https://localhost/...` (desarrollo) como a la URL de GitHub Pages (producción).
6. La anon key es pública por diseño: la seguridad queda cubierta por las políticas RLS.

## Desarrollo local

```powershell
# Sirve la carpeta con un servidor local (Live Server, python -m http.server, etc.)
python -m http.server 5500
# Abre http://127.0.0.1:5500/login.html
```
> GitHub Pages y Supabase requieren HTTPS; para desarrollo local usa `http://localhost:5500` o `127.0.0.1:5500` (ya registrados en Supabase).

## Notas

- Solo los correos que estén en la tabla `allowed_users` (rol `user` o `admin`) pueden iniciar sesión.
- Los correos tipo `@test.com` no reciben códigos: el envío valida dominio (se requiere un correo real).
- `PRUEBAS.md` (guía de pruebas funcionales) y el documento de especificación permanecen fuera del repositorio, en el equipo local.