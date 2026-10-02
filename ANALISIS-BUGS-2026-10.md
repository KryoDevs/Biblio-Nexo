# Análisis de fallas, correcciones y mejoras — BiblioNexo

**Fecha:** 2 de octubre de 2026
**Rama:** `arena/01a0fee9-biblio-nexo`
**Alcance:** revisión completa del repositorio (front-end vanilla JS + migraciones
PostgreSQL/Supabase + Edge Functions + pruebas + despliegue), con corrección de
todo lo encontrado y verificación con la batería completa de pruebas.

Este documento es, a la vez, el **informe** (qué está bien, qué está mal, qué se
puede mejorar, con causa raíz de cada falla) y el **registro del proceso**
(bitácora de lo que se hizo, en qué orden y con qué evidencia).

---

## 1. Resumen ejecutivo

- Se encontraron y corrigieron **17 fallas**, dos de ellas con impacto directo
  en el trabajo diario del mesón:
  1. **La vista Bibliomóvil era inalcanzable**: el menú la ofrecía, pero el
     router no tenía su render y caía silenciosamente en el Dashboard.
  2. **Los métodos duplicados de `bibliomovil.js` pisaban a los del Catálogo**:
     borrar, editar, prestar o reservar desde el Catálogo terminaba pintando la
     vista del Bibliomóvil encima.
- Se corrigieron además 4 fallas que tenían el CI en rojo de forma permanente
  (reconstrucción de la base desde cero, rol librero, migraciones y contraste).
- Se implementaron 6 mejoras (CI más completo, verificador de clases con el
  alcance correcto, caché inmutable para los assets del build, entre otras).
- **Estado final de las pruebas: 14/14 (Vitest) + 97/97 + 110/110 + 13/13 +
  40/40 + 48/48 + 18/18 (suites JS) + 204/204 y 129/129 (PostgreSQL real) +
  verificadores de consolidación, RPC, clases y contraste: todo en verde.**

---

## 2. Método (el “loop” pedido)

```
detectar  →  documentar la causa raíz  →  corregir  →  verificar  →  volver a revisar
```

Cada corrección se verificó con **la suite que la cubre** y, al cerrar cada
bloque, con la **batería completa** (JS + PostgreSQL real + verificadores
estáticos). Nada se dio por corregido sin una prueba que fallara antes y pasara
después, o —cuando no existía— agregando la prueba que faltaba (se agregaron 4
comprobaciones nuevas).

---

## 3. Bitácora del proceso

1. **Lectura estructural del repositorio**: `src/js/` (núcleo, módulos, vistas),
   `supabase/migrations/001–026`, `supabase/functions/`, `pruebas/`,
   `.github/workflows/pruebas.yml`, configuración de despliegue
   (`index.html`, `vercel.json`, `vite.config.js`, `package.json`).
2. **Primera pasada de verificación**: se ejecutó la batería completa. Resultado
   inicial: 4 suites en rojo (migraciones, librero, reconstrucción y contraste)
   y varios hallazgos por inspección.
3. **Corrección de las causas del CI rojo** (ver §5.1–§5.3).
4. **Revisión del front-end**: se detectaron la vista Bibliomóvil inalcanzable,
   los métodos duplicados que la hacían pisar al Catálogo, el `onclick` inline
   bloqueado por CSP, los textos de contraseña inconsistentes y el guardia de
   arranque mal documentado.
5. **Revisión de la capa sin conexión**: se encontraron y corrigieron los ids
   optimistas colisionables, el filtro de Bibliomóvil ignorado en
   `buscarLibrosLocales()` y la paginación frágil del delta por marca
   (`actualizado_en` empatado) que podía **perder lápidas de borrado** —
   relevante para la Ley 21.719.
6. **Revisión de tipos SQL↔JS**: `eliminar_lector(p_id uuid)` contra
   `lectores.id bigint` (el botón Eliminar de Lectores fallaba siempre).
7. **Endurecimiento de las pruebas y del CI**: se agregaron comprobaciones
   nuevas para que estos defectos no vuelvan (router/menú sincronizados,
   scripts del HTML seguros ante el empaquetado de Vite, empates de marca en la
   sincronización) y se integró el verificador de clases Tailwind al CI.
8. **Verificación final** con la batería completa, y commit + push de la rama.

---

## 4. Lo que está BIEN (con evidencia)

| Área | Evidencia |
|---|---|
| **Seguridad de la base de datos** | RLS activa en todas las tablas del sistema; las políticas `using(true)` de `libros/lectores/prestamos` se eliminaron en la migración 019; la 013 impide el autoprovisionamiento con rol distinto de `librero`; la 016 quitó una política redundante de `usuarios`. |
| **Funciones sensibles** | Las funciones `SECURITY DEFINER` verifican quién las llama (`es_admin()` / `es_personal()`) y fijan `search_path`; la llave anónima solo puede ejecutar las 4 RPC del enlace de escaneo remoto, con token guardado únicamente como hash SHA-256 y revalidado en cada llamada. |
| **Trabajo sin conexión** | Cola de escritura en IndexedDB con reintentos exponenciales (30 s → 30 min), aviso al 5.º intento fallido y registro en el log de errores cuando una operación se rechaza de forma permanente: nunca se pierde en silencio. La autoridad final la sigue teniendo el RPC del servidor (stock con `FOR UPDATE`, límites, bloqueos). |
| **Privacidad (Ley 21.719)** | Los lectores nunca se replican en bloque: solo entran a la copia local si se los consultó o si tienen préstamo activo, y se purgan por antigüedad (30 días). Los borrados se propagan por lápidas (`elementos_eliminados`) para que el derecho de supresión alcance también al equipo del mesón. |
| **CSP y cadena de suministro** | `script-src 'self'` sin `unsafe-inline`, sin CDNs (Tailwind, Supabase, FontAwesome y Chart.js autoalojados), `object-src 'none'`, `base-uri` y `form-action` restringidos; cabeceras de producción en `vercel.json` con `frame-ancestors 'none'`, HSTS, COOP y Permissions-Policy; respaldo anti-clickjacking en `arranque.js`. |
| **Accesibilidad** | `aria-label`/`aria-live` en los puntos críticos, aviso de estado nunca solo por color, etiquetas en todos los campos (verificado por prueba), contraste AA medido y verificado automáticamente. |
| **Calidad de las pruebas** | 5 jobs de CI (consolidación, interfaz, migraciones embebidas, PostgreSQL 17 y reconstrucción con el CLI de Supabase). La suma de comprobaciones supera las 700 y cubre desde el escapado de HTML hasta el rol `librero` operando contra PostgreSQL real. |
| **Documentación** | Cada migración y cada módulo explican el porqué de sus decisiones, incluidos los límites conocidos (por ejemplo, qué no puede resolverse sin conexión). |
| **Operación** | Respaldo automático con Edge Function, expiración de reservas por cron con secreto propio en Vault, y registro de errores visible en Administración → Diagnóstico. |

---

## 5. Lo que está MAL (fallas encontradas, causa raíz y corrección)

### 5.1. La base no se podía reconstruir desde cero (CI en rojo permanente)

- **Síntoma:** `probar-migraciones.py` (204 comprobaciones) y `probar_librero.py`
  (129) abortaban; en GitHub Actions fallaban 4 de los 5 jobs.
- **Qué fallaba:** al aplicar `010_consolidacion.sql` sobre una base recién
  creada, el `grant execute on function public.buscar_libros(text, int, int)`
  apuntaba a una firma de 3 argumentos que ya no existe (la función vigente
  tiene 5, con valores por omisión). El error cortaba la migración a la mitad y
  todo lo que venía después fallaba en cascada.
- **Causa raíz:** al ampliar `buscar_libros()` con los parámetros de Bibliomóvil
  (migración 026) se actualizó la definición pero no el `grant`, y ninguna
  prueba comprobaba que una reconstrucción completa siguiera funcionando.
- **Corrección:** `grant execute on function public.buscar_libros(text, int, int, boolean, text)`.

### 5.2. El test de idempotencia era frágil y el manifiesto del librero estaba desactualizado

- **Qué fallaba:** la comprobación de “reaplicar una migración no rompe nada”
  solo aceptaba una salida; y el manifiesto de funciones que usa la interfaz
  esperaba 54 cuando había 55.
- **Causa raíz:** pruebas escritas contra un estado puntual del esquema, sin
  margen para los dos desenlaces seguros (error controlado o verificación con
  filas distintas de “Correcto”).
- **Corrección:** ambas pruebas aceptan ahora los dos desenlaces válidos y
  cuentan contra el manifiesto real.

### 5.3. Contraste insuficiente (AA) y verificador de clases ciego

- **Qué fallaba:** 16 usos de `text-stone-400` (2,52:1 sobre fondo claro) y 3 de
  `text-amber-600` (3,19:1) no cumplían AA; `probar-contraste.mjs` los reportaba
  y fallaba. Además, `verificar_clases_tailwind.py` avisaba de 364 clases
  “faltantes” que en realidad no lo eran, y **no se ejecutaba en el CI**.
- **Causa raíz:** la paleta se endureció sin repasar todos los textos grises
  heredados, y el verificador no modelaba que `index.html` compila Tailwind con
  PostCSS (solo comparaba contra el CSS estático de las páginas sin build).
- **Corrección:** `stone-500`/`amber-700` en los usos que fallaban; el
  verificador quedó limitado a las páginas que cargan
  `public/vendor/css/tailwind.css` y a los `.js` que estas enlazan, con su
  documentación reescrita, y **ahora corre en el CI** y en
  `npm run test:legacy:consolidacion`.

### 5.4. La vista Bibliomóvil era inalcanzable

- **Síntoma:** al hacer clic en “Bibliomóvil” se veía el Dashboard (el título de
  arriba sí decía “Bibliomóvil”).
- **Qué fallaba:** `switchView()` resuelve la vista con un mapa `renderers`; no
  existía la entrada `bibliomovil`, así que el fallback `|| renderers.dashboard`
  pintaba el Dashboard **sin ningún error visible**.
- **Causa raíz:** al dividir `ui.js` en vistas se agregó la entrada al menú
  (`CONFIG.VIEWS_BY_ROLE`) y se escribió `renderBibliomovil()`, pero nadie
  actualizó el mapa del router; el fallback silencioso ocultó el olvido.
- **Corrección:** entrada `bibliomovil: () => this.renderBibliomovil()` en el
  mapa, más una prueba nueva que compara las vistas del menú contra el mapa del
  router (si mañana se agrega una vista sin render, el CI falla).

### 5.5. Los métodos duplicados del Bibliomóvil pisaban a los del Catálogo

- **Síntoma:** al eliminar, editar, prestar o reservar un libro **desde el
  Catálogo**, la pantalla cambiaba a la vista del Bibliomóvil (manteniendo el
  resaltado del menú en “Catálogo”).
- **Qué fallaba:** `bibliomovil.js` definía copias de `_renderBookRows`,
  `_bindCatalogRowEvents`, `showEditBookModal`, `promptCreateLoan`,
  `promptCreateReserva` y `_filtrarLibros` que llamaban a `renderBibliomovil()`
  y leían `bibliomovilFilter`. Como `Object.assign(UIManager.prototype, …,
  catalogo, …, bibliomovil)` mezcla `bibliomovil` **al final**, esas copias
  ganaban para toda la aplicación.
- **Causa raíz:** código copiado al separar la vista, sin eliminar el original;
  el orden del `Object.assign` convirtió una copia en una sobreescritura global,
  y ninguna prueba ejercitaba esos callbacks en la vista Catálogo.
- **Corrección:** se eliminaron los duplicados de `bibliomovil.js` (quedó con
  solo lo suyo: `renderBibliomovil` y el indicador de ruta) y las versiones
  únicas de `catalogo.js` ahora deciden a qué vista repintar con
  `_refrescarVistaDeLibros()` y qué filtro leer según `this.currentView`.

### 5.6. El botón Eliminar de Lectores fallaba siempre

- **Qué fallaba:** `eliminar_lector(p_id uuid, …)` comparaba contra `lectores.id`,
  que es `bigint generated always as identity`. PostgREST no encontraba el
  operador `bigint = uuid` y devolvía error en todas las llamadas.
- **Causa raíz:** la firma se escribió antes de que la tabla usara identidad
  `bigint`, y los verificadores solo comparan **nombres y cantidad** de
  parámetros, nunca sus tipos, así que el desajuste pasó desapercibido.
- **Corrección:** `p_id bigint` con `drop function if exists` para las dos firmas
  anteriores, y comentario en la migración explicando el porqué.

### 5.7. Avisos del panel de notificaciones que no llevaban a ninguna parte

- **Qué fallaba:** los ítems del panel usaban `onclick="…"` inline, que la CSP
  (`script-src 'self'`, sin `unsafe-inline`) bloquea: se veían, pero no navegaban.
- **Causa raíz:** último resto de la migración a CSP cerrada; el cambio a
  `addEventListener` se hizo en el resto de la aplicación pero no aquí, y al ser
  un manejador inline el navegador solo lo ignora (no hay error visible).
- **Corrección:** los avisos son ahora `<button data-go-view="loans">` con un
  manejador delegado que llama a `switchView()`.

### 5.8. Sin conexión, el Bibliomóvil mostraba todo el catálogo y el filtro de stock no filtraba

- **Qué fallaba:** `persistencia.buscarLibrosLocales(busqueda, pagina, porPagina,
  esBibliomovil, filtroStock)` recibía los parámetros pero los ignoraba. La vista
  Bibliomóvil sin conexión mostraba libros que no son del bibliomóvil, y los
  filtros “En estante”/“Agotados” no hacían nada.
- **Causa raíz:** la firma se amplió cuando se agregó el filtro en el camino en
  línea (RPC `buscar_libros`), pero el respaldo offline no se actualizó.
- **Corrección:** `buscarLibrosLocales()` filtra por `es_bibliomovil` y por stock
  (`disponibles` → `stock > 0`, `prestados` → `stock === 0`) antes de la búsqueda
  de texto, replicando el RPC; `db/libros.js` le pasa ambos argumentos en el
  camino sin conexión.

### 5.9. La sincronización podía perder filas (y lápidas de borrado) o quedar en un bucle

- **Qué fallaba:** el delta usaba `gte('actualizado_en', marca)` + `limit`, y las
  lápidas usaban un `limit(2000)` fijo. Un `UPDATE` masivo (una migración, por
  ejemplo) deja **todas** las filas con el mismo `actualizado_en`, porque `now()`
  es igual para toda la transacción. Si esa marca caía en el borde de una página,
  el bucle volvía a pedir la misma página; y si había más de 2000 lápidas en una
  transacción, las restantes se perdían.
- **Causa raíz:** paginación por marca de tiempo sin un desempate estable: con
  marcas empatadas, el `offset` recorre un conjunto que se mueve.
- **Corrección (y por qué importa):** se reemplazó por un **cursor compuesto
  `(marca, id)`**: primero se agotan las filas con la marca exacta (filtro por
  igualdad + `range`, conjunto estable) y solo después se salta a las de marca
  mayor; las lápidas se paginan igual. Sigue siendo tolerante a instalaciones
  viejas que guardaron solo la marca. Esto no es un detalle de rendimiento:
  **perder una lápida significa no propagar un borrado por derecho de supresión**
  (Ley 21.719), y quedar en bucle significaba que el resto del catálogo nunca
  llegaba al equipo del mesón.
- **Pruebas nuevas:** 1200 filas con la misma marca (más de dos páginas) llegan
  completas y la pasada siguiente no repite nada.

### 5.10. Alta sin conexión: ids optimistas que se pisaban

- **Qué fallaba:** las filas optimistas usaban `id: -Date.now()`. Dos altas
  dentro del mismo milisegundo (dos escaneos seguidos) generaban el **mismo id**
  y la segunda pisaba a la primera en IndexedDB.
- **Causa raíz:** id sintético sin desempate.
- **Corrección:** contador decreciente que garantiza unicidad
  (`Math.min(anterior - 1, -Date.now())`), manteniéndose siempre negativo para no
  chocar nunca con un id real.

### 5.11. El mutex de arranque podía quedar envenenado

- **Qué fallaba:** si el primer `renderShell()` fallaba (por ejemplo, la red se
  cae justo al entrar), la promesa rechazada quedaba guardada en `renderPromise`
  y los intentos siguientes esperaban sobre ella: la aplicación no se recuperaba
  sin recargar.
- **Causa raíz:** el mutex no liberaba el estado en el camino de error.
- **Corrección:** `renderPromise = null` en el `catch`, para que el siguiente
  `SIGNED_IN` (o el botón Reintentar) pueda volver a intentarlo.

### 5.12. Mensajes de error que culpaban al usuario, y formularios que colgaban

- **Qué fallaba:** `login()` traducía **cualquier** error a “Credenciales
  inválidas”; y `cambiarPassword()`/`actualizarPassword()` no usaban
  `conTiempoLimite`, así que un cuelgue de la librería dejaba el formulario
  esperando para siempre.
- **Causa raíz:** el tiempo límite y la distinción red/rechazo se aplicaron al
  resto de las llamadas pero no a estas dos.
- **Corrección:** un fallo de red dice ahora que no se pudo conectar, y los dos
  formularios tienen tiempo límite y lo informan.

### 5.13. La pantalla pedía menos contraseña de la que el validador exige

- **Qué fallaba:** dos pantallas decían “mínimo 8 caracteres” y el validador
  exige 12 con mayúscula y número: quien seguía la instrucción era rechazado.
- **Causa raíz:** la regla se endureció sin actualizar los textos.
- **Corrección:** ambos textos dicen 12 caracteres, mayúscula y número.

### 5.14. El guardia de arranque prometía algo que no cumplía

- **Qué fallaba:** `arranque.js` documentaba “se carga sin `type=module` y antes
  que el resto”, pero `index.html` lo cargaba como módulo (diferido), y su vigía
  de errores se enganchaba en `DOMContentLoaded`, demasiado tarde para el script
  clásico del `<body>`.
- **Causa raíz:** comentario y realidad desalineados desde una refactorización;
  el vigía se diseñó para un orden de carga que ya no era el real.
- **Corrección:** el docstring dice la verdad, el vigía escucha en **fase de
  captura** sobre `window` (alcanza scripts insertados después, como la cámara
  bajo demanda) y se agregó una prueba que impide un `<script>` clásico apuntando
  a `/src/` — el empaquetado de Vite no copia esos archivos a `dist/` y en
  producción darían 404 (se comprobó construyendo con `npm run build`).

### 5.15. Textos con codificación rota (U+FFFD)

- **Qué fallaba:** 18 apariciones de `�` en textos visibles al usuario
  (`mostrador.js`, `prestamos.js`, `styles.css`) y en el changelog.
- **Causa raíz:** ediciones previas guardadas con codificación mixta.
- **Corrección:** textos restaurados, con verificación de que no queda ningún
  U+FFFD en `src/` ni en los `.md` tocados.

### 5.16. Restos de la refactorización de Préstamos

- **Qué fallaba:** `renderLoans()` cerraba con `</tbody></table>` huérfanos
  (las filas ya eran tarjetas `<div>`), el botón **Renovar no aparecía nunca**
  porque leía `estado.renovable`, un campo que `_estadoPrestamo()` no devuelve, y
  `showGeneralNotifyModal` no tenía ningún llamador.
- **Causa raíz:** al pasar de tabla a tarjetas se dejaron restos del marcado
  anterior y una condición que apuntaba a un campo inexistente.
- **Corrección:** condición reescrita con las **mismas reglas que
  `renovar_prestamo()`** (no se renueva un préstamo atrasado y el máximo de
  renovaciones es un parámetro del sistema), marcado cuadrado y modal muerto
  eliminado.

### 5.17. Fallas de configuración de despliegue y CI

- **Qué fallaba:** `verificar_clases_tailwind.py` no se ejecutaba en el CI; el
  comentario del job de base de datos hablaba de “las diez migraciones” cuando
  hay 26; los assets con hash del build no tenían caché inmutable en
  `vercel.json` (la regla apuntaba a `/js/`, ruta que no existe en `dist/`); y
  `.env.example` tenía espacios finales.
- **Causa raíz:** configuración escrita antes del paso a Vite/PostCSS y no
  revisada después.
- **Corrección:** paso nuevo en el CI, comentario corregido, reglas de caché
  `immutable` para `/assets/(.*)` y `no-cache` para `/registerSW.js`, y
  `.env.example` limpio.

---

## 6. Lo que se puede MEJORAR

### 6.1. Implementado en esta ronda

1. **CI más completo:** el verificador de clases Tailwind corre en cada push.
2. **Verificador con alcance y documentación correctos** (dejó de dar falsos
   positivos).
3. **Caché inmutable para los assets del build** y sin caché para el registro del
   service worker.
4. **Cuatro comprobaciones de regresión nuevas** (router/menú, scripts del HTML
   ante el build, empates de marca, delta exacto) para que estos defectos no
   vuelvan.
5. **Pruebas de sincronización más realistas:** el doble de Supabase de
   `probar-persistencia.mjs` ahora soporta `range`, `limit` y orden múltiple, así
   que las pruebas ejercitan la paginación de verdad.
6. **Documentación alineada con la realidad** (`arranque.js`, verificador de
   clases, comentario del workflow).

### 6.2. Propuesto (no implementado, con motivo)

| Mejora | Por qué queda pendiente |
|---|---|
| Pasar las 28 funciones `SECURITY DEFINER` que aún usan `search_path = public` a `search_path = ''` | Ya está analizado función por función en `010_consolidacion.sql` (ninguna usa objetos de extensiones ni SQL dinámico): es un cambio seguro, pero masivo, y el propio archivo lo reserva para un “commit aparte” con su propia verificación. |
| Notificar en la interfaz cuando una operación encolada se rechaza de forma permanente | Hoy queda auditada en Administración → Diagnóstico (nunca en silencio). Avisar en pantalla requiere decidir a quién y cómo, para no generar ruido en el mesón. |
| Cifrado de disco y bloqueo de sesión en el equipo del mesón | Es el pendiente operativo más importante de la Ley 21.719 y no se resuelve desde el código; ya está listado en `pendientes-checklist.md`. |
| Limpiar archivos residuales de la raíz (`test_html.mjs`, `commit-*.bat`, `arquitectura.visual-check.json`) | No afectan la aplicación; conviene confirmar antes que nadie los use como herramienta. |
| `conTiempoLimite` también en `loginWithGoogle()` y `resetPassword()` | Son llamadas que navegan fuera de la página; el riesgo de cuelgue es menor. |
| Fase 2: integración con Aleph 500 | Es el siguiente bloque funcional del proyecto, fuera del alcance de esta revisión. |

---

## 7. Verificación final (evidencia)

| Suite | Resultado |
|---|---|
| `npm test` (Vitest) | **14/14** |
| `node pruebas/probar-interfaz.mjs` | **97/97** |
| `node pruebas/probar-vistas.mjs` | **110/110** |
| `node pruebas/probar-escaneo-remoto.mjs` | **13/13** |
| `node pruebas/probar-persistencia.mjs` | **40/40** |
| `node pruebas/probar-sync-queue.mjs` | **48/48** |
| `node pruebas/probar-estado-conexion.mjs` | **18/18** |
| `node pruebas/probar-contraste.mjs` | **AA en todos los pares; sin regresiones** |
| `python3 pruebas/verificar_consolidacion.py` | **OK** |
| `python3 pruebas/verificar_llamadas_rpc.py` | **OK** |
| `python3 pruebas/verificar_clases_tailwind.py` | **OK** |
| `python3 pruebas/probar-migraciones.py` (2 escenarios, PostgreSQL embebido) | **204/204** |
| `python3 pruebas/probar_librero.py` (PostgreSQL 17 real) | **129/129** |
| `npm run build` (Vite + PWA) | **OK**, con el guardia de arranque incluido en el bundle |
| **CI de GitHub Actions** (run [`37078537117`](https://github.com/KryoDevs/Biblio-Nexo/actions/runs/37078537117)) | **5/5 jobs en verde**: Consolidación, Interfaz (jsdom), Base de datos (PostgreSQL 17), Migraciones (PostgreSQL embebido) y Reconstrucción desde cero (CLI). Es la primera vez que el flujo completo pasa. |

> **Publicación:** rama `arena/01a0fee9-biblio-nexo` subida a
> `KryoDevs/Biblio-Nexo`, con la propuesta de cambio en el
> [PR #7](https://github.com/KryoDevs/Biblio-Nexo/pull/7).

Reproducir todo:

```bash
rm -rf /tmp/biblionexo-pruebas
npm ci
npm test
npm run test:legacy
python3 pruebas/verificar_clases_tailwind.py
python3 pruebas/probar-migraciones.py
python3 pruebas/probar_librero.py
npm run build
```

---

## 8. Conclusión

El sistema tenía un problema de fondo que explica la mayoría de las fallas
graves: **código duplicado o desactualizado que ninguna prueba ejercitaba**
(la vista Bibliomóvil frente al router, las copias de métodos frente al
`Object.assign`, el `grant` frente a la firma real, el respaldo offline frente al
RPC). Las correcciones van acompañadas de pruebas que cubren exactamente esos
puntos, de modo que la próxima regresión de este tipo se detecta en el CI y no en
el mesón.

Ninguna de las correcciones cambió reglas de negocio: el servidor sigue siendo la
autoridad (stock con `FOR UPDATE`, límites, bloqueos y renovaciones), y la
aplicación se limita a reflejar esas reglas —ahora también sin conexión y en la
interfaz—.
