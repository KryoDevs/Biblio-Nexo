# Lista de pendientes — BiblioNexo

Checklist de trabajo, no documentación permanente del proyecto (esa vive en
`PROMPT-produccion.md` y `ESTADO.md`, dentro del repo). Pensada para ir
tachando a medida que se resuelve cada cosa.

Última actualización: 29 de octubre de 2026 — revisada la restricción que
manda sobre todo lo demás: **operar con costo cero**. La cuenta completa, medida
contra el proyecto real (16 MB de base de datos sobre 500 MB de límite, 4,5 MB de
Storage sobre 1 GB, ~720 invocaciones de Edge Functions sobre 500 000), está en
`docs/despliegue/032-operar-sin-costo.md`, que además nombra las cuatro trampas
que sí pueden costar dinero o doler en marzo: la renovación anual del `.cl`, la
cláusula «uso personal, no comercial» de Vercel Hobby con sus dos planes B
gratuitos, la pausa del plan Free de Supabase a los 7 días sin actividad y el
slug del equipo dentro de la URL pública. En la misma ronda: se cerró el rojo de
CI (vite 8.3.5 + `qrcode.min.js` movido al grafo de módulos), se agregó
`pruebas/verificar-sitio-vivo.mjs` con su alarma diaria en GitHub Actions
(`npm run test:sitio`), y el respaldo automático ganó retención y un restaurador
probado contra Postgres real.

Ronda anterior — 25 de octubre de 2026 — cerradas seis de las siete
señales públicas que encontró la auditoría «veinte señales de un sitio
vibecodeado»: `canonical`, Open Graph con una imagen de 1200×630 propia (la
anterior era relativa y no la cargaba ninguna red social), `robots.txt`,
`sitemap.xml`, `llms.txt`, `<title>` distinto por vista, el `<h1>` que el área
de trabajo no tenía y el mapa de fuentes huérfano de Chart.js. Lo único que
sigue abierto de esa lista es el dominio propio, que no es código: ⚫ abajo.
Cómo regenerar la imagen, las decisiones y la forma de cambiar el origen, en
`docs/despliegue/031-senales-publicas-2026-10.md`. En la misma rama se cerraron
además las señales 8 (datos estructurados) y 14 (favicon e íconos), que estaban
en 🟡.

Ronda anterior — 22 de agosto de 2026 (sexta ronda del día): terminada la
división de `ui-base.js` que quedaba pendiente de la ronda anterior. Ver el
detalle en ✅ abajo. Ronda previa (la de la papelera):
aclaraste que la idea era más específica: no eliminar el libro entero (para
bajar de cantidad ya servía el campo "Ejemplares en total" del modal
Editar), sino poder **restaurar un libro si se eliminó por accidente**,
desde una pestaña nueva "Eliminados" en Administración. Ronda antes de esa
(la del bug de "La mujer justa"): encontrado y corregido que una llave
foránea sin documentar bloqueaba el borrado de cualquier libro con
historial de préstamos, activo o no.

---

## 🔴 Urgente — falta este paso tuyo

Sin pendientes en esta categoría — terminaste el SMTP propio hoy.

---

## 🟠 Ahora — barato y con impacto real

- [ ] **Confirmar con la biblioteca su dirección y su teléfono.** Hoy
      `src/js/config.js` → `BIBLIOTECA` tiene `'Balmaceda 99, Futrono'` y
      `'+56 63 248 1000'`, marcados en el propio archivo como «ajusta estos
      datos con los reales antes de usarlo en producción» — y `README.md`
      documentaba otros distintos (`Balmaceda 68`, `+56 63 248 2633`), que ya no
      los copia. No es cosmético: esos dos valores van **al pie de cada aviso que
      el sistema manda por WhatsApp a un vecino** (`ui-base.js` → `_textoAviso`),
      así que si están mal la biblioteca está enviando direcciones equivocadas a
      los lectores. Con los valores reales confirmados: se cambian en
      `config.js`, se agregan al JSON-LD de `index.html` y `privacidad.html`, y la
      comprobación que hoy prohíbe publicarlos en `pruebas/verificar-build.mjs` se
      reemplaza por la que exija que las dos copias coincidan.
- [ ] **Pedir la URL del catálogo de la Dibam** para el `sameAs` del JSON-LD (no
      está en ningún archivo del repo y no la hay que inventar).
- [ ] **Desplegar la retención del respaldo.** `supabase/functions/respaldo-automatico/index.ts`
      ahora borra sus propios JSON viejos (30 días o 300 MB, lo que ocurra
      primero) y anota el resultado en `respaldos_log.mensaje`. El código está en
      el repo; la nube sigue corriendo la versión sin retención. Falta:
      `supabase functions deploy respaldo-automatico` y, al día siguiente,
      `select ok, archivo, bytes, mensaje from public.respaldos_log order by id desc limit 3;`.
      Sin esto, el día que el catálogo sea grande el bucket `respaldos` se llena
      contra el límite de 1 GB del plan Free y lo que deja de funcionar es la
      copia de seguridad, no la app — o sea: falla justo cuando alguien la necesita.
- [ ] **Correr el simulacro de restauración una vez.** Hay 62 respaldos en el
      bucket y nadie restauró ninguno: `SUPABASE-PASO-A-PASO.md` tiene esa casilla
      sin marcar desde hace meses. Ya existe la herramienta
      (`node pruebas/restaurar-respaldo.mjs respaldo-….json`) y ya hay una prueba
      que la verifica contra Postgres real en CI
      (`pruebas/probar-restauracion.py`), pero la prueba verifica el *mecanismo*:
      el simulacro contra un respaldo real, en un segundo proyecto gratuito, lo
      tiene que hacer una persona. Los siete pasos están en
      `docs/despliegue/032-operar-sin-costo.md`.
- [ ] Las tres cosas de la ronda anterior (los dos bugs de Tailwind, la versión
      de Node en CI y `verificar_politicas()`) quedaron resueltas, ver ✅ abajo.

---

## 🟡 Después — más esfuerzo, sigue siendo importante

- [ ] **Fase 2: integración con Aleph 500** — el siguiente bloque de trabajo
      real, cuando decidas empezarlo (`PROMPT-produccion.md` §7).
- [ ] **`purpose: "maskable"` en los íconos del manifest.** Faltó un diseño nuevo,
      no un comando: el ícono actual lleva el letrero grabado en el canto del
      libro y el recorte circular de Android se lo come. Lo decide quien manda el
      ícono.
- [ ] **Consola abierta en la URL publicada** — señal 19. El build, las 34
      pruebas y el borrado del mapa huérfano de Chart.js están verdes, pero
      nadie ha mirado la consola del navegador en producción. Hay que hacerlo
      una vez, con sesión iniciada y en el teléfono.
---

## ⚫ No es código, pero bloquea el cierre del proyecto

- [ ] **Apuntar el DNS de `biblionexo.cl`** (señal 1 de la auditoría de octubre
      de 2026). Avanzado el 25/10: el dominio ya estaba registrado y en la cuenta
      de Vercel pero **colgando del proyecto**; ahora `biblionexo.cl` es dominio
      de producción de `biblio-nexo` y `www.biblionexo.cl` redirige a la punta con
      308. Falta, en el administrador de dominio de NIC Chile (Vercel no lleva la
      zona): un `A` para `@` → `216.198.79.1` (+`64.29.17.1` si admite dos) y un
      `CNAME` `www` → `8ae70475b6de47fa.vercel-dns-017.com`. Al verificar que
      resuelve, definir `VITE_ORIGEN_PUBLICO=https://biblionexo.cl` en las
      variables de entorno de **Production** y desplegar: con eso el `canonical`,
      la imagen para compartir, el `sitemap.xml` y el `robots.txt` cambian de
      dominio solos. No al revés: definida la variable antes de que el DNS
      responda, el `canonical` apuntaría a un dominio que todavía no abre
      (detalle y tabla de registros en
      `docs/despliegue/031-senales-publicas-2026-10.md`).
      Dos cosas que esta ronda aclaró y que cambian la decisión:
        · **el `.cl` se paga todos los años**. Es el único costo recurrente que
          puede tener este sistema, y no sale de este repositorio: lo decide el
          presupuesto municipal. Si no se presupuesta, la vía realmente gratis es
          quedarse en el alias de Vercel, que ya funciona con HTTPS.
        · y por eso, **si algún día se deja de pagar la renovación hay que borrar
          `VITE_ORIGEN_PUBLICO` y volver a desplegar**, más `SITIO_URL` en
          Settings → Secrets and variables → Actions → Variables para que la
          alarma diaria (`Sitio vivo`) deje de pedir un origen que ya no existe.
          Si se queda, canonical/sitemap/og:image seguirán citando un dominio
          muerto mientras la app funciona perfectamente: nadie lo va a notar
          desde el mesón.
- [ ] Designar Delegado de Protección de Datos y Encargado de
      Ciberseguridad, y firmar el encargo de tratamiento — **antes del 1 de
      diciembre de 2026** (Ley 21.719).
- [ ] Cifrado de disco y bloqueo de sesión en el equipo del mesón — urgente
      desde la Fase 1.2, sin resolver todavía. Ver `CUMPLIMIENTO-LEGAL.md` §9 bis.

---

## ✅ Ya verificado en esta ronda (referencia, no acción)

- [x] **El rojo de CI (`npm audit`) estaba en lo de arriba y se cerró.** El
      bloqueo real no era la vulnerabilidad sino el arreglo: Vite 8.3 no respeta
      `/* @vite-ignore */` en un `import()` de ruta absoluta, y así estaba
      `src/js/modules/qr.js` para cargar `public/vendor/js/qrcode.min.js`. Como el
      archivo vendorizado ya era un módulo ES de verdad (`export default`), lo
      correcto dejó de ser el truco: se movió a `src/js/vendor/qrcode.min.js` y se
      importa por ruta relativa (`import('../vendor/qrcode.min.js')`), con lo que
      entra al grafo de módulos, Vite lo code-split como chunk perezoso con hash
      y la bifurcación especial para Node desapareció. Verificado: `npm audit
      --audit-level=high` sale 0 (quedan 4 avisos **low** de desarrollo, todos por
      `vite-plugin-pwa → workbox-build → @rollup/plugin-node-resolve → deepmerge`;
      el fix que ofrece npm es degradar el plugin del PWA a 0.2.1, así que se
      aceptan y quedan escritos), el chunk `qrcode.min-*.js` se sirve como
      `text/javascript`, `verify:build`, `npm test` 34/34, `npm run test:legacy`
      (112 + 13 + 43 + 48 + 18 comprobaciones) y `test:legacy:contraste` en verde.
      Las otras dos librerías vendorizadas (`html5-qrcode`, Chart.js) siguen en
      `public/vendor/` a propósito: son UMD que cuelgan un global, otro mecanismo.
- [x] **El sitio publicado tiene alarma diaria, sin secretos ni costo.** Nuevo
      trabajo `.github/workflows/sitio-vivo.yml` (cron 12:17 UTC = 09:17 Chile, y
      ejecutable a mano con un origen cualquiera) que corre
      `pruebas/verificar-sitio-vivo.mjs`: 16 comprobaciones contra el despliegue
      real — canonical/OG en un solo origen, imagen social descargable, ICO con
      sus 5 tamaños, IHDR de los PNG leído de los bytes, `robots.txt`↔`sitemap.xml`
      de acuerdo, `noindex` del escaneo remoto, `sw.js` con su precache, 404
      propio, y una consulta real a Supabase para cazar el HTTP 540 del proyecto
      pausado. La anon key se lee de `src/js/config.js` (es pública por diseño), no
      hay secretos en el workflow. Corrido contra `vite preview`: 16/16; corrido
      contra un `dist/` sabotajeado (favicon truncado, `sw.js` y `llms.txt`
      borrados): 5 fallos detectados y salida 5. También se puede correr a mano:
      `npm run test:sitio`.

- [x] **Señales 8 y 14 de la auditoría, cerradas en la misma rama.** Datos
      estructurados: `@graph` con `Library`/`GovernmentOrganization` +
      `WebApplication` en `index.html`, y en `/privacidad.html` una
      `PrivacyPolicy` que referencia los mismos `@id` absolutos en vez de
      repetir la ficha. Sin dirección ni teléfono adentro, a propósito, mientras
      los de `config.js` sean de ejemplo (arriba en 🟠); una prueba lo impide.
      Que un `<script type="application/ld+json">` no choque con el CSP
      `script-src 'self'` es por algo que conviene tener claro: no es un script
      ejecutable sino un bloque de datos, el navegador no lo corre nunca.
      Íconos: `/favicon.ico` nuevo (16/24/32/48/64 en 34 KB), los PNG cuantizados
      a 256 colores (572 KB → 153 KB el de 512, 70 KB → 26 KB el de 192, RMSE
      2 %, verificado mirando el cielo y el agua a cuatro aumentos), y **todas**
      las rutas de ícono absolutas — relativas daban 404 en la propia página 404
      cuando la URL mal escrita tenía subcarpetas. Cuatro comprobaciones nuevas:
      `sizes` contra el IHDR real del PNG, cabecera y número de tallas del `.ico`,
      JSON-LD que parsea, y referencias `@id` que resuelven a la portada. La
      imagen para compartir se regeneró desde el ícono nuevo
      (`python3 pruebas/generar-imagen-social.py`).

- [x] **Señales públicas del sitio** (auditoría de octubre de 2026, señales
      5, 7, 10, 11, 12, 13, 15 y 18). Canonical y Open Graph absolutos en
      `/` y `/privacidad.html`, con `og:image:alt`, dimensiones y
      `twitter:card`; imagen para compartir nueva (1200×630, JPG de 132 KB
      compuesta desde el ícono de la app). `robots.txt`, `sitemap.xml` y
      `llms.txt` generados en el build desde `vite.config.js`, con una sola
      constante de origen (`VITE_ORIGEN_PUBLICO`) para las siete cosas a la vez
      y sin bloquear ni a las IA ni los `.css`/`.js`. `document.title` cambia
      con la vista (`_tituloDocumento` en `ui-router.js`) y la franja de título
      pasó de `<h2>` a `<h1>`. Se borró el `sourceMappingURL` que
      `vendor/js/chart.umd.js` anunciaba sin `.map` que señalar.
      `404.html` y `escaneo-remoto.html` quedaron sin canonical a propósito —
      las dos con `noindex`, y la segunda con un token de un solo uso en la
      URL; los comentarios de cada archivo lo dicen para que nadie lo «mejore»
      después. Nueve comprobaciones nuevas en `pruebas/verificar-build.mjs` y
      seis en `src/js/modules/__tests__/ui-router.test.js`: `npm run build`,
      `npm run verify:build`, `npm test` (34/34), `npm run test:legacy`
      (112 + 118 + 13 + 43 + 48 + 18) y las tres verificaciones de Python,
      todas en verde.
- [x] **División de `ui-base.js` terminada** — bajó de 3035 a 1626 líneas.
      Las cuatro vistas que se solapaban con `js/vistas/` (CATÁLOGO
      internamente, más lo que en realidad eran tres vistas separadas:
      Lectores, Préstamos y Mesón) se movieron a archivos nuevos, siguiendo
      el mismo patrón que ya usaban `admin.js`/`dashboard.js`/`perfil.js`/
      `reportes.js` — cada uno exporta un objeto plano de métodos que
      `js/modules/ui.js` mezcla sobre `UIManager.prototype` con
      `Object.assign(...)`, así que `this.metodo()` sigue funcionando igual
      sin importar en qué archivo quedó definido cada método. Nuevos:
      `js/vistas/catalogo.js` (287 líneas), `js/vistas/lectores.js` (233),
      `js/vistas/prestamos.js` (482, incluye el flujo de préstamo
      compartido que usan tanto Catálogo como Mesón) y `js/vistas/mostrador.js`
      (474, llamado así — no `scanner.js` — para no chocar con
      `js/modules/scanner.js`, el wrapper de la cámara que importa). Lo que
      quedó en `ui-base.js` es justo lo transversal: constructor,
      validaciones, widgets genéricos (incluida `_bindPaginacion`, que
      comparten las tres vistas de tabla), navegación y pantallas de
      login/autenticación. `sw.js` actualizado con los 4 archivos nuevos en
      `PRECACHE_URLS` y `CACHE_VERSION` de `v9` a `v10`. Las 8 suites de
      pruebas JS y los 3 verificadores de Python, todos en verde (230
      comprobaciones JS entre `probar-vistas.mjs` y `probar-interfaz.mjs`
      nada más).
      De paso, corregidos dos verificadores que habían quedado ciegos por
      la división anterior de `ui.js` (la de `db.js`, ronda de hace dos
      días la dejó como puro ensamblador de 17 líneas sin código real que
      revisar): `pruebas/probar-contraste.mjs` comparaba clases de color
      contra `js/modules/ui.js` en vez de `ui-base.js` + `js/vistas/*.js`,
      así que llevaba tiempo dando "sin regresiones" sin revisar nada de
      verdad — al corregirlo aparecieron **3 usos reales de
      `text-stone-400` sobre fondo claro** (2.52:1, bajo el mínimo 4.5:1 de
      WCAG AA): dos en la pestaña "Enlaces remotos" de Administración y uno
      en "Eliminados" (la papelera de la ronda anterior) — los tres
      cambiados a `text-stone-500` (4.80:1, cumple). También se encontró
      que la excepción de esa misma verificación para `glass-panel` estaba
      mal desde siempre (ese panel es vidrio CLARO, `rgba(255,255,255,0.86)`
      — no oscuro), lo que dejaba pasar un cuarto caso real en la pantalla
      de completar invitación ("Cargo (opcional)"), también corregido a
      `text-stone-500`; se cambió esa excepción por una más precisa
      (`current-user-sub`, el único caso legítimo de `stone-400` en el
      menú lateral oscuro que la verificación por línea no alcanzaba a ver
      de otra forma). Y `pruebas/probar-interfaz.mjs` buscaba los cinco
      `r?.encolado` (que distinguen "se guardó" de "quedó pendiente sin
      conexión") solo en `ui-base.js`, donde ya no viven más que dos —
      ahora junta `ui-base.js` con todo `js/vistas/` para esa comprobación
      puntual.
- [x] **Papelera de libros: restaurar uno eliminado por accidente, desde
      Administración → Eliminados.** Aclaraste el pedido real de la ronda
      anterior: no hacía falta un botón para quitar una sola copia (ya
      existía — "Editar libro" → "Ejemplares en total", que baja la
      cantidad con `ajustar_copias`, sin tocar el historial), y el borrado
      completo de un libro (`eliminar_libro()`, ronda anterior) solo debía
      poder deshacerse cuando fue un libro entero eliminado por error — no
      una reducción de cantidad. Implementado sin ninguna tabla nueva de
      respaldo: `registrar_auditoria()` (migración 005) ya guardaba una
      foto completa de cada libro justo antes de borrarlo, en
      `auditoria.datos_antes` — dos funciones nuevas
      (`listar_libros_eliminados()` y `restaurar_libro()`,
      `010_consolidacion.sql`, migración `021_papelera_libros.sql` que solo
      agrega un índice de apoyo) leen esa foto para reconstruir el libro
      con el mismo id, y reenganchan automáticamente el préstamo cerrado
      que esa eliminación había archivado (usando que dentro de una misma
      transacción `now()` da siempre el mismo valor en Postgres, para
      cruzar con precisión qué préstamos tocó esa eliminación en concreto).
      Pestaña nueva "Eliminados" en Administración, con una tabla de libros
      pendientes de restaurar y un botón "Restaurar" en cada uno. 12
      comprobaciones nuevas en `pruebas/probar_librero.py` (128/128 en
      total). Aplicado y verificado en vivo contra producción.
- [x] **Bug reportado: no dejaba eliminar una copia de un libro con
      historial ya devuelto — corregido y en producción.** Reportaste que
      "La mujer justa" (0 préstamos activos, 1 ya devuelto) rechazaba el
      borrado con "Revise si el libro tiene préstamos activos" — mensaje
      falso. Causa real: `prestamos.libro_id` tenía una llave foránea hacia
      `libros(id)` con `ON DELETE RESTRICT` **en producción**, sin declarar
      así en ningún archivo del repo (la misma clase de deriva ya
      encontrada antes con una política RLS de `usuarios`) — bloqueaba el
      borrado si el libro tenía CUALQUIER préstamo, activo o no, y
      `db.eliminarLibro()` convertía cualquier error del `delete` directo
      en el mismo mensaje genérico. Elegiste la solución de fondo, no solo
      corregir el mensaje: **permitir eliminar un libro si no tiene
      préstamos activos**, archivando título y autor en cada préstamo ya
      cerrado antes de borrar, para que los reportes de períodos pasados no
      queden con una fila vacía. Implementado como RPC nuevo
      `eliminar_libro()` (`010_consolidacion.sql`, con el guardia de
      administrador y el mensaje correcto en cada caso), columnas
      `libro_titulo_archivado`/`libro_autor_archivado` en `prestamos` y la
      llave foránea cambiada a `ON DELETE SET NULL`
      (`020_permitir_eliminar_libro_con_historial.sql`), `js/modules/db/libros.js`
      actualizado para llamar al RPC en vez de un `delete` directo, y
      `js/modules/db/reportes.js` actualizado para rearmar el título/autor
      de un libro ya eliminado a partir de lo archivado (con cuidado de no
      juntar dos libros eliminados distintos bajo la misma clave en el
      ranking de más prestados). 9 comprobaciones nuevas en
      `pruebas/probar_librero.py` (116/116 en total), aplicado y verificado
      en vivo contra producción (la llave foránea quedó confirmada con
      `pg_get_constraintdef` como `ON DELETE SET NULL`, y `eliminar_libro`
      existe con `SECURITY DEFINER`). Ya puedes volver a intentar eliminar
      "La mujer justa" (o cualquier libro con solo historial devuelto)
      desde el panel.
- [x] **Script de verificación estática de clases de Tailwind no
      compiladas** (`pruebas/verificar_clases_tailwind.py`, mismo espíritu
      que `verificar_llamadas_rpc.py`: sin build step, sin navegador —
      compara toda clase usada en `class="..."`, `className=`, y
      `classList.add/remove/toggle(...)` en el JS y el HTML contra las
      clases que de verdad existen en `vendor/css/*.css` y `css/*.css`).
      Ya enganchado a `.github/workflows/pruebas.yml` como un paso más del
      job `consolidacion`. **Al construirlo y correrlo por primera vez
      encontró 26 clases de Tailwind más que se usaban en el código pero
      nunca se habían compilado** — además de las dos ya corregidas antes
      hoy (`mx-auto`, `hover:bg-rose-100`). Ninguna daba error: simplemente
      no hacían nada, silenciosamente, en `perfil.js`, `ui-base.js`,
      `admin.js`, `dashboard.js` y `escaneo-remoto.html`. Se agregaron a
      mano a `vendor/css/tailwind.css`, con los valores tomados de las
      reglas de Tailwind v3 por defecto (confirmado que el tema no está
      personalizado, comparando contra reglas ya compiladas equivalentes).
      El checker corrió limpio después. Clases usadas para
      delegación de eventos en JS (nunca aparecen literalmente en un CSS,
      por diseño — `admin-tab-btn`, `delete-book-btn`, etc.) quedaron en
      una lista de excepciones documentada dentro del script, no
      ignoradas a ciegas.
- [x] **`js/modules/db.js` dividido por dominio.** Bajó de 1242 a 535
      líneas; el resto se movió, sin cambiar ni una línea de lógica, a 12
      archivos nuevos bajo `js/modules/db/` (uno por dominio: libros,
      lectores, préstamos, administración, personal, perfil, diagnóstico,
      errores del servidor, enlaces de escaneo, respaldos, cumplimiento
      Ley 21.719, reportes) más un `compartido.js` con lo común
      (`supabase`, `conTiempoLimite`, `hoyEnChile`, etc.). Lo que se quedó
      en `db.js` no es arbitrario: `pruebas/probar-interfaz.mjs` revisa el
      texto literal de ese archivo con ~14 expresiones regulares (busca
      `class SyncQueue`, la cola de sincronización sin conexión, y los
      métodos de circulación con su llamada a `colaSync.encolar(...)` a
      pocas líneas de distancia) — todo eso se dejó físicamente en
      `db.js` a propósito, para que esas comprobaciones sigan pasando sin
      tocarlas. La superficie pública no cambió un carácter: los 7
      archivos que hacen `import { db }`, `import { hoyEnChile }` o
      `import { colaSync }` siguen funcionando igual. `sw.js` actualizado
      con los 13 archivos nuevos en `PRECACHE_URLS` (si no, la app sin
      conexión fallaría al pedir un archivo que nunca se precargó) y
      `CACHE_VERSION` subida de `v7` a `v8`. Las 6 suites de pruebas JS y
      los 3 verificadores de Python, todos en verde.
- [x] **CI en rojo tras subir el commit — dos causas, ambas corregidas.**
      Al revisar por qué fallaban "Consolidación de funciones" y "Base de
      datos (PostgreSQL 17)" aparecieron dos cosas más, ninguna relacionada
      con las políticas RLS de arriba: (1) las tres funciones nuevas de
      `verificar_politicas()` no se habían agregado a `manifiesto_funciones()`
      (el catálogo que vigila `verificar_definiciones()`) — corregido, y de
      paso reveló (2) **`deshacer_libro_remoto()` no existía en producción**,
      aunque sí está en los archivos de migración: el botón "Deshacer" del
      escaneo remoto llevaba quién sabe cuánto tiempo roto en la base real,
      sin que nada lo hubiera avisado hasta que `verificar_definiciones()`
      lo empezó a vigilar con el manifiesto ya al día. No tiene relación con
      el hallazgo de las políticas de acceso total — es un caso separado de
      "el archivo dice una cosa, la base de datos vivía con otra". Ya
      restaurada en producción y confirmada con `verificar_definiciones()`
      (44 funciones, 0 fuera de norma). Dos comprobaciones más que estaban
      mal escritas (esperaban que el anónimo no pudiera leer `parametros` ni
      la tabla de enlaces directo, cuando en realidad la primera es pública
      a propósito desde la migración 007, y la segunda vuelve vacía por RLS
      en vez de dar error) también corregidas — las descubrió el mismo
      arreglo de fidelidad del arnés de pruebas de más arriba.
- [x] **Hallazgo de seguridad — tres políticas RLS de acceso total en
      `libros`, `lectores` y `prestamos`, encontradas y corregidas hoy.**
      Al construir `verificar_politicas()` (ver el ítem siguiente) y
      comparar `pg_policies` de producción contra lo que debía haber,
      aparecieron tres políticas — `"Acceso autenticado libros"`,
      `"Acceso autenticado lectores"`, `"Acceso autenticado prestamos"` —
      que ningún archivo de migración local creaba. Las tres daban acceso
      total (`cmd=ALL`, sin ninguna condición) a **cualquier usuario
      autenticado**, no solo administradores: cualquier `librero` con
      sesión iniciada podía leer, modificar o **borrar** cualquier libro,
      lector o préstamo directamente contra la base de datos (no desde la
      pantalla — la interfaz nunca ofreció ese botón — pero sí con una
      llamada directa a la API). Postgres combina las políticas RLS entre
      sí con OR, así que estas tres anulaban en la práctica a las
      políticas más estrechas que sí exigían ser administrador. Es la
      misma clase de deriva que la política redundante de `usuarios`
      resuelta el 16 de agosto (probablemente creada desde el panel de
      Supabase, sin quedar en ningún archivo ni documentada en ninguna
      sesión) pero mucho más grave por el alcance. No hay señales en
      `auditoria` de que se haya explotado. **Corregido**: las tres
      políticas se eliminaron en producción (migración
      `019_eliminar_politicas_acceso_total.sql`), confirmado en vivo con
      `pg_policies` (bajaron de 5 a 4 políticas en cada una de las tres
      tablas) y con `verificar_politicas()` reportando todo en verde.
- [x] **`verificar_politicas()`** — el chequeo que faltaba, mismo patrón
      que `verificar_definiciones()` para funciones: compara las políticas
      RLS y los permisos (`grant`) de producción contra un manifiesto
      esperado, y avisa si algo falta, cambió o sobra sin haber pasado por
      una migración. Es exactamente lo que habría encontrado la política
      de `usuarios` del 16 de agosto, y lo que encontró hoy el hallazgo de
      arriba. De paso corrigió un descuido menor en `verificar_rls()`, que
      llevaba dos migraciones sin vigilar `enlaces_escaneo_remoto` ni
      `respaldos_log`. `pruebas/probar-migraciones.py` en 148/148,
      aplicado y verificado en vivo contra producción.
- [x] **Dos bugs cosméticos de Tailwind corregidos** — `mx-auto` en los
      círculos numerados de `escaneo-remoto.js` y `hover:bg-rose-100` en
      el botón de cerrar sesión de `perfil.js`. Las clases se usaban en el
      código pero nunca se habían usado antes en ningún otro archivo, así
      que no estaban en `vendor/css/tailwind.css` (que es estático, no se
      recompila solo) — no daban error, simplemente no hacían nada.
      Agregadas a mano al CSS compilado.
- [x] **Versión de Node en CI subida de 20 a 24** — GitHub venía avisando
      que `actions/setup-node@v4` con Node 20 está deprecado.
- [x] **SMTP propio terminado** — confirmado por ti. Ya no falta nada
      para invitar a cualquier persona real por correo.
- [x] **Registro obligatorio al aceptar la invitación** — probado en
      producción con una invitación real: pide nombre completo, cargo
      (opcional) y contraseña (mínimo 8 caracteres, con mayúscula y número,
      con verificación de que ambas coincidan) antes de dejar entrar al
      panel. Confirmado por el usuario.
- [x] **Plantilla del correo de invitación personalizada** (Parte 1 de
      `supabase/plantilla-invitacion-email.md`) — pegada en Authentication →
      Email Templates del Dashboard de Supabase. Ya no trae la marca de
      Supabase. Queda pendiente la Parte 2 (SMTP propio), ver 🔴 arriba.
- [x] **Repositorio actualizado** — el usuario confirmó que subió el commit
      con todos los archivos de esta ronda (migraciones 016 a 018, la
      edición a la 010, los dos Edge Functions, la plantilla del correo,
      `db.js`/`ui-base.js`/`admin.js`/`main.js`, `sw.js` en `v7`,
      `PROMPT-produccion.md`, `ESTADO.md`, este archivo). No confirmado
      todavía si la CI de GitHub Actions corrió en verde sobre ese commit —
      vale la pena revisarlo en algún momento, sin urgencia.
- [x] **Plazo de préstamo por libro** (`dias_prestamo_override` en `libros`,
      migración 017 + edición de `prestar_libro`/`renovar_prestamo`/
      `buscar_libros` en la 010). Probado en vivo contra producción, en una
      transacción con rollback (no dejó datos de prueba): un libro con
      override en 0 rechaza el préstamo ("es de referencia y no circula");
      un libro con override en 3 días presta y renueva por 3 días, no por
      los 7 del parámetro global. `pruebas/probar-migraciones.py` (142/142),
      `verificar_consolidacion.py` y `verificar_llamadas_rpc.py`, en verde.
- [x] **Respaldo automático real** (`pg_cron` + `pg_net` + Edge Function
      `respaldo-automatico`, migración 018). Corre todos los días a las
      07:00 UTC, sube un JSON con todas las tablas del negocio al bucket
      privado `respaldos` y deja constancia en `public.respaldos_log`
      (visible en Administración → Cumplimiento). Probado en vivo end-to-end
      con `net.http_post` real: subió un respaldo de verdad (22 KB) y quedó
      registrado. El ítem "asignar quién aprieta el botón" ya no aplica —
      no hay botón que apretar.
- [x] **Invitación de personal por correo** (Edge Function
      `invitar-personal`, sin cambios de esquema). Reemplaza el flujo de
      entrar al panel de Supabase: un administrador escribe correo y rol en
      Administración → Personal, la persona recibe la invitación y queda con
      el rol ya asignado al aceptar. Verifica el rol de quien invita contra
      `mi_perfil()` (RLS real, no un campo que mande el cliente); usa la
      service_role key solo del lado del Edge Function, nunca pedida ni
      manejada por esta sesión.
- [x] CI #33 en verde — Fases 1.2, 1.3 y 1.4 subidas y confirmadas.
- [x] CI #32 en verde — ítems 11, 12 y 13 ("pulido, no urgente").
- [x] Fase 1 completa (1.1 a 1.4): funcionamiento sin conexión.
- [x] Hueco de seguridad en `deshacer_libro_remoto()` corregido y probado
      (136 comprobaciones en `probar-migraciones.py`, dos escenarios de
      esquema).
- [x] Commit `82d2f6a` (corrección de seguridad) subido y en verde en la CI
      — run #34, 46 segundos. Confirmado.
- [x] Commit `0a6abdc` (Fases 1.2-1.4) subido y en verde en la CI — run #33.
- [x] Commit de los ítems 11, 12 y 13 subido y en verde en la CI — run #32
      (falló una vez por caché de módulos, corregido y confirmado en el
      reintento).
- [x] `probar-vistas.mjs`, `probar-migraciones.py` y
      `probar-escaneo-remoto.mjs` enganchadas a
      `.github/workflows/pruebas.yml` — corren solas en cada envío desde
      hoy. Probadas en verde en este equipo antes de subir (falta la
      confirmación en la CI real, ver 🔴 arriba).
- [x] Prueba intermitente encontrada y corregida en `probar-vistas.mjs`:
      calculaba "hoy" con la fecha UTC del runner en vez de la de Chile, y
      dos comprobaciones fallaban solas varias horas al día. Se encontró
      justo al intentar enganchar la suite a CI.
- [x] `pruebas/verificar_llamadas_rpc.py` — chequeo nuevo, sin base de
      datos, que cruza cada llamada RPC del JS contra la firma vigente en
      las migraciones. Probado a propósito contra el error real que ya se
      cometió una vez (los parámetros de más en `deshacer_libro_remoto`) —
      lo detecta.
- [x] `CACHE_VERSION` subido a `v4` en `sw.js` (la corrección de seguridad
      de ayer cambió una firma de RPC sin subir el número de versión).
- [x] CI alineada a `postgres:17` en `base-de-datos` y `reconstruccion`
      (producción corre 17.6.1) — confirmado en verde, run #36.
- [x] Commit `ecbde20` (el `.github/workflows/pruebas.yml` que había quedado
      afuera del commit anterior por la protección de escritura en `.github`)
      subido a mano y confirmado: los 5 jobs corren, todos en verde —
      `consolidacion` (7s), `interfaz` (19s), `migraciones` (10s, nuevo),
      `base-de-datos` en PostgreSQL 17 (32s), `reconstruccion` en
      PostgreSQL 17 (49s). Run #36, 53 segundos en total.
- [x] `migration repair` de 012, 013 y 014 — verificado en vivo contra
      producción: ya estaban registradas, no hacía falta ningún repair. Se
      resolvió en algún momento entre el 6 de agosto y hoy, sin quedar
      anotado en ninguna sesión.
- [x] Política RLS redundante `"Lectura de roles propia"` en `usuarios` —
      eliminada. Confirmado en vivo que era subconjunto exacto de "usuarios
      ve su perfil" antes de tocarla, y confirmado después que `pg_policies`
      bajó de 5 a 4 filas. Migración 016 aplicada directo a producción con
      permiso explícito (ver 🔴 arriba para subir el archivo al repo).

## 🔵 Pendiente de verificación manual (no bloquea nada, pero nadie lo hizo)

- [ ] Confirmar en un celular real que el ícono nuevo (512×512) se ve bien —
      nadie lo verificó todavía fuera de la vista previa.
- [ ] Probar en producción, con un enlace real, escanear un libro nuevo y
      uno existente, y usar "Deshacer" en ambos — solo se probó simulado.
