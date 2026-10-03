# BiblioNexo — Sistema Municipal de Gestión Bibliotecaria

**BiblioNexo** es el sistema web de circulación, catálogo, lectores, reportes y operación del Bibliomóvil de la **Biblioteca Pública Municipal de Futrono N° 332 «Escritor Ramón Quichiyao Figueroa»** (Región de Los Ríos, Chile).

Está diseñado para operar con conectividad rural inestable (modo PWA/offline con réplica en IndexedDB y cola de sincronización `SyncQueue`), cumplir con la normativa chilena de protección de datos personales (**Ley 21.719**), ciberseguridad (**Ley 21.663**) y accesibilidad web (**Decreto Supremo N° 1/2015 — WCAG 2.1 AA**), y complementar al catálogo nacional **Aleph 500** del Sistema Nacional de Bibliotecas Públicas (SNBP).

---

## 1. Requisitos previos

- **Node.js 22.x** y `npm` (ver `engines` en `package.json`).
- **Python 3.10+** (para los verificadores estáticos y suites de migraciones SQL).
  - Opcional para correr las pruebas contra un PostgreSQL real efímero:
    ```bash
    pip install pgserver "psycopg[binary]"
    ```
- Un proyecto en **Supabase** (PostgreSQL 16 + Auth + Row Level Security).

---

## 2. Levantar el proyecto en local (paso a paso)

```bash
# 1. Instalar dependencias exactas desde package-lock.json
npm ci

# 2. Iniciar el servidor de desarrollo de Vite
npm run dev

# 3. Construir la versión de producción en dist/ y verificar el empaquetado PWA
npm run build
npm run verify:build

# 4. Previsualizar la compilación de producción localmente
npm run preview
```

---

## 3. Configuración (`src/js/config.js`)

El cliente lee su configuración desde `src/js/config.js`:

- **`SUPABASE_URL`**: URL pública del proyecto Supabase (`https://<project-ref>.supabase.co`).
- **`SUPABASE_ANON_KEY`**: Llave pública `anon` de Supabase. Es pública por diseño; la seguridad real reside en las políticas **Row Level Security (RLS)** y en las funciones `SECURITY DEFINER` con guarda `public.es_personal()` / `public.es_admin()`. **Jamás coloques la llave `service_role` en el repositorio.**
- **`ADMIN_EMAILS`**: Respaldo visual de correos de administración (el servidor valida siempre contra la tabla `public.usuarios`).
- **`BIBLIOTECA`**: Nombre oficial, dirección (`Balmaceda 68, Futrono`), teléfono de contacto (`+56 63 248 2633`) y parámetros por defecto (`MAX_PRESTAMOS_POR_LECTOR`, `DIAS_PRESTAMO_DEFECTO`, `DIAS_AVISO_VENCIMIENTO`, `MAX_RENOVACIONES`).

---

## 4. Cómo ejecutar las migraciones de Supabase (`001`–`028`)

Las migraciones viven en `supabase/migrations/` y deben aplicarse en orden numérico.

### Opción A — Mediante Supabase CLI (recomendado)

```bash
supabase link --project-ref TU_REFERENCE_ID
supabase migration list --linked
supabase db push
```

### Opción B — Si tu base ya tenía aplicadas las migraciones hasta la `026` o la `027` anterior

Abre el **SQL Editor** de Supabase y ejecuta en este orden exacto:

1. **`supabase/migrations/010_consolidacion.sql`** — Fuente única de verdad para las 58 funciones RPC del sistema (incluyendo `prestar_libro` de 5 argumentos con soporte de coordenadas del Bibliomóvil y `estadisticas_paradas()` con control de acceso `es_personal()`).
2. **`supabase/migrations/027_prestamos_coordenadas.sql`** — Añade de forma idempotente (`ADD COLUMN IF NOT EXISTS`) las columnas `parada_nombre`, `parada_lat` y `parada_lng` a `public.prestamos`.
3. **`supabase/migrations/028_reparar_sobrecarga_prestar_libro_y_paradas.sql`** — Elimina la sobrecarga antigua `public.prestar_libro(bigint, text)` y crea el índice parcial `idx_prestamos_parada_nombre`.

Verifica después en el SQL Editor que todas las funciones estén íntegras:

```sql
select * from public.verificar_definiciones() where diagnostico <> 'Correcto';
select * from public.verificar_rls();
select * from public.verificar_circulacion();
```

El inventario completo de las migraciones `001` a `029` y el despliegue de Edge Functions (`invitar-personal`, `respaldo-automatico`, `expirar-reservas`) están detallados en [MIGRACIONES.md](MIGRACIONES.md) y [SUPABASE-PASO-A-PASO.md](SUPABASE-PASO-A-PASO.md).

---

## 5. Cómo crear usuarios de prueba (`admin`, `librero` y `bibliomovil`)

1. En el panel de Supabase, ve a **Authentication → Users → Add user → Create new user** y crea dos cuentas con correo y contraseña (por ejemplo, `admin@futrono.cl` y `librero@futrono.cl`, marcando *Auto Confirm User*).
2. Para asignar el rol **`admin`** en la base de datos, abre el **SQL Editor** de Supabase y ejecuta:

   ```sql
   insert into public.usuarios (id, email, rol, nombre, cargo)
   select id, email, 'admin', 'Administrador de Prueba', 'Dirección de Biblioteca'
   from auth.users
   where email = 'admin@futrono.cl'
   on conflict (id) do update set rol = 'admin';
   ```

3. Para asignar el rol **`librero`**, ejecuta:

   ```sql
   insert into public.usuarios (id, email, rol, nombre, cargo)
   select id, email, 'librero', 'Encargado de Mesón', 'Atención de Mesón y sede'
   from auth.users
   where email = 'librero@futrono.cl'
   on conflict (id) do update set rol = 'librero';
   ```

4. Para asignar el rol **`bibliomovil`** (operación en ruta: mapa, mesón de parada, catálogo móvil, lectores y préstamos; sin Administración ni Reportes), crea `ruta@futrono.cl` y ejecuta:

   ```sql
   insert into public.usuarios (id, email, rol, nombre, cargo)
   select id, email, 'bibliomovil', 'Encargado de Ruta', 'Bibliomóvil'
   from auth.users
   where email = 'ruta@futrono.cl'
   on conflict (id) do update set rol = 'bibliomovil';
   ```

5. Una vez dentro con la cuenta `admin`, puedes gestionar o invitar más personal —incluido el rol Bibliomóvil— desde **Administración → Personal**.

---

## 6. Despliegue en Vercel

El archivo `vercel.json` ya incluye las reglas de compilación y las cabeceras de seguridad (`Content-Security-Policy`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, `X-Frame-Options` y `Cache-Control`):

1. Conecta el repositorio de GitHub en **Vercel**.
2. Configuración del proyecto en Vercel:
   - **Framework Preset**: `Vite`
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`
3. En Supabase → **Authentication → URL Configuration**, configura el *Site URL* con el dominio HTTPS de Vercel (`https://tu-proyecto.vercel.app`) y agrégalo a *Redirect URLs*.

---

## 7. Suite de pruebas automatizadas

```bash
# Pruebas unitarias con Vitest (23 tests)
npm test

# Verificadores estáticos + pruebas de interfaz, vistas, escaneo remoto y modo offline
npm run test:legacy

# Verificación de contraste WCAG 2.1 AA (13 pares de color + guardia anti-regresión)
npm run test:legacy:contraste

# Pruebas contra PostgreSQL real (requiere pgserver y psycopg)
python3 pruebas/probar-migraciones.py
python3 pruebas/probar_librero.py
```

---

## 8. Estructura real del proyecto

```text
Biblio-Nexo/
├── index.html                  # Entrada principal de la SPA (con CSP estricta)
├── escaneo-remoto.html         # Entrada sin sesión por token QR temporal para celular
├── privacidad.html             # Política de privacidad y derechos ARCO (Ley 21.719)
├── 404.html                    # Página de ruta no encontrada
├── vite.config.js              # Configuración de Vite 6 + vite-plugin-pwa (Workbox)
├── vercel.json                 # Cabeceras HTTP de seguridad y caché para Vercel
├── package.json                # Scripts de construcción y pruebas
├── public/
│   ├── icons/                  # Iconos PWA (192x192, 512x512, maskable)
│   └── vendor/                 # Tipografías locales (.woff2), FontAwesome y hojas CSS base
├── src/
│   ├── assets/css/styles.css   # Sistema de diseño «Patrimonio de Futrono» + impresión
│   └── js/
│       ├── arranque.js         # Vigía de errores tempranos antes de montar módulos
│       ├── config.js           # Configuración institucional, roles y conexión a Supabase
│       ├── main.js             # Punto de entrada: sesión, sincronización y arranque de UI
│       ├── escaneo-remoto-app.js # Lógica de la vista independiente de escaneo remoto
│       ├── modules/
│       │   ├── auth.js         # Autenticación con Supabase Auth
│       │   ├── db.js           # Fachada de datos, respaldo offline y cola SyncQueue
│       │   ├── db/             # Módulos por dominio (libros, lectores, préstamos, reportes, etc.)
│       │   ├── persistencia.js # Réplica local en IndexedDB y sincronización delta
│       │   ├── estado-conexion.js # Indicador reactivo En línea / Sin conexión / Sincronizando
│       │   ├── scanner.js      # Lector de códigos de barras y cámara (html5-qrcode diferido)
│       │   ├── ui.js           # Ensamblador de UIManager (combina base, router, modales y vistas)
│       │   ├── ui-base.js      # Widgets compartidos (paginación, consentimiento, gráficos, reloj)
│       │   ├── ui-router.js    # Shell principal, menú lateral por rol y cambio de vistas
│       │   └── ui-modales.js   # Diálogos accesibles (showConfirm, showPrompt, avisos)
│       └── vistas/             # Vistas de la aplicación:
│           ├── dashboard.js    # Resumen, gráficos de anillo y accesos rápidos por rol
│           ├── mostrador.js    # Mesón de circulación, escaneo y devolución rápida
│           ├── catalogo.js     # Catálogo paginado, filtros, reservas y alta de libros
│           ├── lectores.js     # Gestión de lectores, consentimiento informado y apoderados
│           ├── prestamos.js    # Préstamos activos/vencidos, renovaciones y avisos masivos
│           ├── bibliomovil.js  # Mapa Leaflet/OSRM de recorrido, avisos por parada y catálogo móvil
│           ├── reportes.js     # Reportes por período, préstamos por parada, CSV y respaldo JSON
│           ├── admin.js        # Inventario, papelera, bloqueados, personal, enlaces, auditoría y Ley 21.719
│           └── perfil.js       # Edición de perfil propio y cambio de contraseña
├── supabase/
│   ├── config.toml             # Configuración del CLI de Supabase
│   ├── functions/              # Edge Functions (invitar-personal, respaldo-automatico, expirar-reservas)
│   └── migrations/             # Migraciones SQL numeradas (001 a 028)
├── pruebas/                    # Suites de prueba en Node.js (.mjs) y Python (.py)
└── docs/auditoria/             # Informes de auditoría, registro de cambios y resumen final
```
