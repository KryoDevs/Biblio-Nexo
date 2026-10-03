# Separación de catálogos, auditoría de errores, rediseño de Mi perfil y mejora del Bibliomóvil

- **Proyecto**: BiblioNexo — Biblioteca Pública Municipal de Futrono N° 332 «Escritor Ramón Quichiyao Figueroa»
- **Fecha**: 3 de octubre de 2026
- **Rama**: `arena/01a103f7-biblio-nexo`
- **Alcance**: catálogo de la biblioteca, catálogo del Bibliomóvil, vista Bibliomóvil, vista Mi perfil, capa de datos `js/modules/db/`, `js/modules/persistencia.js`, migraciones SQL y suites de prueba.
- **Estado de las pruebas al cerrar**: 28/28 Vitest · 112 interfaz · 118 vistas · 13 escaneo remoto · 43 persistencia · 48 cola offline · 18 estado de conexión · 13 pares de contraste AA · 220/220 migraciones PostgreSQL · 130/130 librero PostgreSQL · build + verificación de PWA OK.

Este documento es el **informe de la auditoría**: qué estaba mal, por qué, cómo se corrigió y cómo se
comprobó. La **lista de sugerencias con sus beneficios** se entrega aparte, en
`SUGERENCIAS-2026-10.md` (raíz del repositorio), porque está pensada para leerse con la biblioteca y
la Municipalidad; el §7 resume cómo se reparte.

---

## 1. Resumen ejecutivo

Se hicieron cinco trabajos, en este orden:

1. **Los catálogos quedaron separados de verdad**: el catálogo de la biblioteca (sede) y el del
   Bibliomóvil (ruta) ya no comparten títulos. Cada uno tiene su propia colección
   (`libros.es_bibliomovil`), su propio encabezado y su propia forma de administrarse, y hay un
   botón para mover un ejemplar de una colección a la otra (solo administradores).
2. **Auditoría de errores y bugs**: 11 hallazgos corregidos, uno de ellos hacía desaparecer libros
   del catálogo sin ningún aviso, y otro mostraba «falta ejecutar la migración» cuando el problema
   real era la conexión del mesón.
3. **Errores visuales**: 4 clases de Tailwind mal formadas que dejaban fondos sin pintar en modo
   oscuro (y un verificador nuevo para que no vuelvan), más los estados vacíos, las insignias de
   colección y los textos de contraseña.
4. **Mi perfil, rediseñado por completo**: encabezado de identidad, datos editables, contraseña con
   requisitos visibles en vivo, preferencias (tamaño de letra y modo oscuro), actividad de la
   cuenta, accesos rápidos y sesión.
5. **Bibliomóvil, enriquecido**: cabecera con resumen operativo (títulos, disponibles, en préstamo,
   recorrido y distancia), tarjeta de «Preparación sin conexión» que explica qué se guarda en el
   equipo, distancia entre paradas, estados vacíos que enseñan qué hacer y una **hoja de ruta
   imprimible** para llevar en papel.

Ninguna regla de negocio cambió: el servidor sigue siendo la autoridad (stock con `FOR UPDATE`,
límites, bloqueos, reservas), el rol sigue sin poder cambiarse a sí mismo y el correo sigue siendo
de solo lectura.

---

## 2. Separación del catálogo del Bibliomóvil y del catálogo de la biblioteca

### 2.1. El problema

La columna `libros.es_bibliomovil` existía desde la migración 026, pero la interfaz pedía siempre
`p_es_bibliomovil = null` (todas). Resultado: **las dos vistas mostraban los mismos títulos**, el
personal de ruta no podía saber si un ejemplar estaba en el camión o en el estante de la sede, y
en la sede se prestaban ejemplares que físicamente estaban en la ruta.

Además, `es_bibliomovil` admitía `NULL` (las filas anteriores a la 026 quedaron así) y
`buscar_libros()` comparaba con `=`, que con `NULL` da `NULL`: un libro sin marcar **no aparecía en
ninguna de las dos colecciones** en cuanto se filtrara por colección, sin ningún error en pantalla.

### 2.2. La solución

| Pieza | Qué se hizo |
|---|---|
| `supabase/migrations/030_separacion_catalogo_bibliomovil.sql` | Normaliza los `NULL` a `false` (sede), deja la columna `not null` con `default false`, documenta la columna e indexa `(es_bibliomovil, titulo)`. |
| `supabase/migrations/010_consolidacion.sql` → `buscar_libros()` | Compara con `coalesce(l.es_bibliomovil, false) = p_es_bibliomovil`, para que un libro sin marcar cuente como de sede **también en bases donde la 030 aún no se aplicó**. |
| `src/js/modules/db/libros.js` | Documenta la semántica de las tres colecciones (`false` sede, `true` ruta, `null` todas) y el respaldo PostgREST usa `or(es_bibliomovil.is.null, es_bibliomovil.is.false)`. Se agrega `cambiarColeccionLibro(id, esBibliomovil)`. |
| `src/js/modules/db.js` + `persistencia.js` | El alta guarda la colección elegida, también en la copia local sin conexión (`guardarLibroLocalOptimista`) y en el filtro offline (`filtrarLibrosLocales`). |
| `src/js/vistas/catalogo.js` | El rol de ruta ve el catálogo del Bibliomóvil; el resto ve el de la biblioteca. Títulos, subtítulos, insignia de colección, botón «Al Bibliomóvil / A la sede» (admin), casilla en el alta y selector «Colección» en el modal de edición. |
| `src/js/vistas/bibliomovil.js` | El catálogo de la vista de ruta pide la colección `true` y explica en su encabezado que es un catálogo aparte. |

### 2.3. Cómo se usa

- **Dar de alta un ejemplar de ruta**: en Catálogo → «Agregar libro» → marcar *«Este ejemplar es del
  Bibliomóvil»*.
- **Mover un ejemplar ya cargado**: Catálogo → botón **«Al Bibliomóvil»** (o **«A la sede»**) en la
  fila del libro. Solo administradores, porque editar libros está restringido por RLS a `es_admin()`.
- **Cambiar la colección al editar**: modal «Editar libro» → campo **Colección**.
- Ambas vistas muestran una **insignia «Bibliomóvil»** en el ejemplar, con ícono y texto (no solo
  color, por accesibilidad).

### 2.4. Despliegue (importante)

1. Aplicar `supabase/migrations/030_separacion_catalogo_bibliomovil.sql` (y volver a ejecutar
   `010_consolidacion.sql`, como siempre que se toca una función consolidada).
2. Publicar el front-end.

**Si el front-end se publica antes que la migración no se rompe nada**: `buscar_libros()` (la versión
de la 010 con `coalesce`) y el respaldo PostgREST tratan los `NULL` como sede. Los libros ya marcados
como del Bibliomóvil siguen en la ruta; los demás quedan en la sede.

---

## 3. Auditoría: errores y bugs encontrados y corregidos

Cada hallazgo se reproduce con una prueba antes de darlo por cerrado. La columna «Cubierto por» dice
qué suite impide que vuelva.

| # | Sev. | Qué fallaba | Causa raíz | Corrección | Cubierto por |
|---|---|---|---|---|---|
| B1 | **Alta** | El catálogo de la biblioteca y el del Bibliomóvil mostraban los mismos títulos. | `renderCatalog()` pedía `p_es_bibliomovil = null` desde que se agregó la columna (026). | Cada vista pide su colección. | `probar-vistas.mjs` → «cada catálogo pide su propia colección» |
| B2 | **Alta** | Un libro sin marcar (`es_bibliomovil` en `NULL`) desaparecía de **las dos** colecciones al separarlas. | `l.es_bibliomovil = false` en SQL y `!==` en la copia local: `NULL` no es `false` en ninguno de los dos. | `coalesce(..., false)` en `buscar_libros()`, `or(...is.null, ...is.false)` en el respaldo y `?? false` en `filtrarLibrosLocales()`. La 030 elimina el `NULL` de la base. | `bibliomovil-ruta.test.js`, `persistencia.test.js`, `probar-migraciones.py` |
| B3 | **Alta** | La copia local sin conexión no guardaba la colección al crear un libro: el alta hecha en la ruta nacía como ejemplar de sede. | `guardarLibroLocalOptimista()` no copiaba `es_bibliomovil`; `agregarLibro()` tampoco lo enviaba al servidor. | Ambos lo incluyen. | `probar-persistencia.mjs` + revisión |
| B4 | **Media** | La búsqueda del catálogo podía dejar en pantalla resultados viejos. | Decremento de 350 ms sin control de versión: si la consulta de «gar» tardaba más que la de «garcía», la primera pisaba a la segunda. | `_catalogSearchVersion`: cada pulsación invalida las respuestas anteriores. | `probar-vistas.mjs` (render con consultas simuladas) |
| B5 | **Media** | Si no había conexión, Mi perfil decía «falta ejecutar la migración 008». | `miPerfil()` devuelve `null` solo cuando el RPC no existe, pero la vista trataba igual un `null` y una excepción. | Se distingue el error de red: tarjeta «No se pudo cargar tu perfil» con botón **Reintentar**. | `probar-interfaz.mjs` + revisión |
| B6 | **Media** | La vista previa de la contraseña pedía menos de lo que el validador exige (solo «mínimo 12 caracteres»). | `validarPassword()` exige además mayúscula y número desde hace varias rondas; el texto de Mi perfil no se actualizó. | Texto completo + lista de requisitos que se marca en vivo mientras se escribe. | `probar-interfaz.mjs`, `ui-base.test.js` |
| B7 | **Media** | La prueba unitaria de `filtrarLibrosLocales()` no probaba la función real. | Reimplementaba los filtros dentro del test (`aplicarFiltros`) y los comparaba consigo misma; además usaba el campo `ejemplares_disponibles`, que **no existe** en la copia local (`stock`). | La prueba importa y ejercita la función real, con los cuatro casos que importan (colecciones, `NULL`, disponibilidad, acentos). | `vitest` → `persistencia.test.js` (6 pruebas) |
| B8 | **Baja** | Cuatro clases de Tailwind mal formadas (`dark:bg-stone-800/50/60`, `/50/70`) no pintaban nada. | Doble modificador de opacidad: Tailwind no genera la clase y **no avisa**. | Se corrigieron las 4 y `verificar_clases_tailwind.py` ahora revisa **todo** `src/` y detecta el patrón. | `verificar_clases_tailwind.py` |
| B9 | **Baja** | El botón «Preparar datos sin conexión» cambiaba de texto solo tras sincronizar. | El `finally` restauraba la etiqueta antigua («Preparar datos offline»). | Un solo texto en los dos lugares. | revisión |
| B10 | **Baja** | `_filtrarLibros()` era código muerto: una tercera versión (nunca ejecutada) de la regla de disponibilidad. | Resto de la refactorización del catálogo paginado. | Se eliminó y se dejó escrito por qué. | revisión de código |
| B11 | **Baja** | `probar-migraciones.py` no comprobaba la separación de colecciones ni el `not null`. | La columna se agregó en la 026 sin pruebas de la regla que la usa. | Dos comprobaciones nuevas en PostgreSQL real (columna y `buscar_libros`). | `probar-migraciones.py` (220 comprobaciones) |

### 3.1. Cambio de semántica que conviene tener presente

`bibliomovil-ruta.test.js` fijaba la semántica anterior: «un libro con `es_bibliomovil` en `NULL` no
pertenece a ninguna colección». **Se actualizó a propósito**, junto con el SQL, para que `NULL` cuente
como sede en las dos vías (servidor y copia sin conexión). El motivo: al separar los catálogos, esa
semántica hacía invisible un libro en toda la aplicación, sin ningún error. La prueba sigue vigilando
lo que le toca —que la copia offline y el servidor devuelvan lo mismo—, ahora con esa regla.
Está anotado con su explicación en el propio test por si alguien la lee en el futuro.

### 3.2. Revisado y encontrado correcto

Merece la pena dejarlo dicho, porque son los puntos donde suele estar el peligro:

- **La colección sobrevive a la edición de un libro**: `actualizarLibro()` solo manda `es_bibliomovil`
  si viene en los cambios (spread condicional), así que corregir un título no mueve el ejemplar de
  colección.
- **La sincronización offline propaga la colección**: `sincronizarLibros()` trae `*` desde la marca de
  tiempo, y mover un ejemplar actualiza `actualizado_en`, así que el cambio llega al equipo de ruta.
- **Permisos**: insertar libros es de cualquier personal (`libros insercion personal`), editar y borrar
  es de administrador; el botón de mover colección respeta esa regla.
- **XSS**: todos los textos que vienen de la base pasan por `html\`...\`` (escapado) o por `crudo()`
  con contenido ya escapado; la prueba de `escapeHtml` sigue pasando.
- **Sin manejadores en atributos HTML** (`onclick=`), como exige la CSP.

---

## 4. Errores visuales

1. **Fondos que no se pintaban en modo oscuro** (B8). Cuatro clases con doble opacidad
   (`dark:bg-stone-800/50/60` y `/50/70`) en la paginación del catálogo, el bloque de consentimiento,
   un pie de tabla de Administración y un panel del Mesón. En claro no se notaba; en oscuro quedaban
   sin fondo. Corregidas, y el verificador de clases ahora las detecta en cualquier archivo de `src/`.
2. **No se distinguía un ejemplar de ruta**: ahora lleva la insignia **Bibliomóvil** (ícono + texto) en
   la fila del libro; el color acompaña, no informa por sí solo.
3. **Estados vacíos inútiles**: «Sin libros que coincidan con la búsqueda» aparecía también cuando la
   colección estaba simplemente vacía. Ahora hay dos mensajes distintos, y el del Bibliomóvil explica
   cómo asignar ejemplares.
4. **Texto de contraseña incompleto** (B6): decía 12 caracteres y no mencionaba mayúscula ni número.
5. **Mi perfil sin jerarquía**: cuatro tarjetas apiladas donde «quién eres» se repartía entre un avatar
   pequeño, un formulario y una lista de fechas. Ver §5.
6. **Bibliomóvil sin contexto operativo**: no había forma de saber cuántos títulos tenía el móvil, si
   alcanzaban los disponibles, ni qué se estaba llevando el equipo al preparar datos. Ver §6.

---

## 5. Rediseño de Mi perfil

### 5.1. Antes

Columna izquierda con una tarjeta de identificación (avatar de 80 px, nombre, rol y tres fechas) y, a
la derecha, cuatro tarjetas iguales apiladas: datos, contraseña, tamaño de letra y sesión. Todo con el
mismo peso visual, sin decir qué es lo importante ni qué se edita.

### 5.2. Ahora

1. **Encabezado de identidad** (ancho completo): inicial en un bloque color madera, nombre en serif,
   correo, sello del rol, cargo, último acceso y una tarjeta de **antigüedad** («N días en el
   sistema»).
2. **Columna principal** (2/3):
   - **Mis datos**: nombre, cargo, teléfono, correo (solo lectura) y rol (solo lectura) con la
     explicación de por qué nadie puede cambiarse el rol a sí mismo.
   - **Contraseña**: los tres campos, la lista de requisitos que se marca en vivo, y la explicación
     de por qué se pide la contraseña actual.
3. **Columna lateral** (1/3):
   - **Actividad de la cuenta**: último acceso, alta y última actualización del perfil.
   - **Preferencias**: tamaño de letra (Normal / Grande / Muy grande, con vista previa real porque la
     escala se aplica a toda la app) y **modo oscuro** con un interruptor accesible (`role="switch"`).
   - **Accesos rápidos**: hasta cuatro vistas del rol, para seguir trabajando sin volver al menú.
   - **Sesión**: por qué se cierra sola a los 20 minutos y el botón para cerrarla ahora.

### 5.3. Lo que **no** cambió (a propósito)

- El rol y el correo siguen siendo de solo lectura, y la pantalla sigue sin ofrecer ninguna forma de
  cambiarse privilegios.
- El guardado del perfil sigue enviando solo `nombre`, `telefono` y `cargo` (sin id ni rol), como
  exige la prueba de «no se asciende a uno mismo».
- El botón de modo oscuro **reutiliza el alternador del menú lateral** (dispara un clic sobre
  `.dark-mode-toggle`), para que los dos íconos nunca digan cosas distintas.
- Se conservan los identificadores que usan las pruebas (`perfil-form`, `perfil-nombre`,
  `perfil-cargo`, `perfil-telefono`, `password-form`, `perfil-logout-btn`).

---

## 6. Mejoras del Bibliomóvil

| Mejora | Para qué sirve |
|---|---|
| **Cabecera operativa** con títulos, disponibles, en préstamo, puntos del recorrido y distancia en línea recta. | Antes había que entrar al catálogo y contar a mano para saber si el móvil alcanzaba para la salida. |
| **Etiqueta «Operación en ruta»** y subtítulo que aclara que el catálogo de la biblioteca se administra aparte. | Evita la confusión entre las dos colecciones. |
| **Tarjeta «Preparación sin conexión»** con los cuatro bloques que descarga (catálogo del móvil, préstamos y reservas, lectores con préstamo activo, enlaces de escaneo) y el estado de la última copia. | Es la duda real antes de salir: «¿qué queda guardado y hasta cuándo sirve?». |
| **Distancia desde el punto anterior** en cada parada de la lista. | Permite detectar un plan absurdo (dos paradas a 40 km) sin mirar el mapa. |
| **Hoja de ruta imprimible** (botón «Imprimir hoja de ruta»): hoja con membrete institucional, numeración, coordenadas, distancias, nota de precisión y espacio para anotar a mano. | En terreno hay zonas sin señal y el papel no se queda sin batería. El CSS de impresión oculta el resto de la aplicación; el mapa no se imprime (son mosaicos remotos). |
| **Estados vacíos que enseñan** («El Bibliomóvil todavía no tiene títulos asignados… usá el botón *Al Bibliomóvil*»). | Convierte un callejón sin salida en una instrucción. |
| **Contadores que se refrescan** al buscar, filtrar o paginar (además del catálogo, disponibles y prestados). | Los números de la cabecera no se quedan viejos mientras se trabaja. |
| **Insignia de colección** en cada ejemplar del catálogo. | Se ve de un vistazo que ese título circula en la ruta. |

Todo lo demás se conservó: mapa Leaflet bajo demanda, geolocalización solo tras pulsar el botón,
cálculo OSRM con cancelación y reintento, aviso de privacidad, reordenamiento de paradas, aviso por
WhatsApp a los lectores de una parada y la destrucción del mapa al salir de la vista.

---

## 7. Sugerencias con sus beneficios

La lista completa —15 sugerencias, ordenadas por relación entre beneficio y esfuerzo, cada una con qué
es, qué se gana y qué implica— está en **`SUGERENCIAS-2026-10.md`**, en la raíz del repositorio, porque
es la que se entrega a la biblioteca y a la Municipalidad y conviene que se lea aparte del informe
técnico.

Resumen por horizonte:

| Horizonte | Sugerencias | Idea |
|---|---|---|
| **Corto plazo** (horas, riesgo bajo) | S1–S5 | Aviso de vencimientos por WhatsApp en lote, toma de inventario guiada, panel «Salud del sistema», hoja de ruta con horarios y firma, carné del lector con QR. |
| **Mediano plazo** (semanas) | S6–S11 | Historial del lector al circular, mapas sin conexión en caché, estadísticas por parada con evolución, resolución visible de conflictos offline, paradas sin ratón, aviso automático de reserva disponible. |
| **Largo plazo** (proyectos) | S12–S15 | Integración con Aleph 500, pruebas end-to-end en navegador real, auditoría de accesibilidad externa, multi-sede. |

Y, aparte del código, cuatro pendientes operativos que son los de mayor riesgo real: cifrado del disco
y bloqueo de sesión del equipo del mesón, prueba de restauración de respaldos, revisión jurídica de los
servicios de mapas y capacitación del segundo turno.

---

## 8. Verificación

| Suite | Resultado |
|---|---|
| `npm test` (Vitest) | **28/28** en 6 archivos |
| `node pruebas/probar-interfaz.mjs` | **112/112** |
| `node pruebas/probar-vistas.mjs` | **118/118** |
| `node pruebas/probar-escaneo-remoto.mjs` | **13/13** |
| `node pruebas/probar-persistencia.mjs` | **43/43** |
| `node pruebas/probar-sync-queue.mjs` | **48/48** |
| `node pruebas/probar-estado-conexion.mjs` | **18/18** |
| `node pruebas/probar-contraste.mjs` | **13 pares AA**, sin regresiones |
| `python3 pruebas/verificar_consolidacion.py` | **OK** (61 funciones, ninguna redefinida fuera de la 010) |
| `python3 pruebas/verificar_llamadas_rpc.py` | **OK** (47 llamadas JS ↔ firmas SQL) |
| `python3 pruebas/verificar_clases_tailwind.py` | **OK**, con la comprobación nueva de clases mal formadas |
| `python3 pruebas/probar-migraciones.py` (PostgreSQL embebido) | **220/220** |
| `python3 pruebas/probar_librero.py` (PostgreSQL 17 real) | **130/130** |
| `npm run build` + `npm run verify:build` | **OK** (manifest único, íconos y recursos locales presentes) |

### Revisión visual sin cuenta de Supabase

`pruebas/generar-vista-previa.mjs` arma una página con las vistas Catálogo (sede), Bibliomóvil,
Catálogo del Bibliomóvil y Mi perfil con datos de ejemplo, usando el CSS ya compilado por el build.
Sirve para revisar el diseño (y el modo oscuro) sin credenciales ni base de datos:

```bash
npm run build
node pruebas/generar-vista-previa.mjs
npx serve dist        # abrir /preview/
```

---

## 9. Archivos tocados

**Base de datos**

- `supabase/migrations/030_separacion_catalogo_bibliomovil.sql` (nueva)
- `supabase/migrations/010_consolidacion.sql` (`buscar_libros`: `coalesce` + documentación)

**Aplicación**

- `src/js/vistas/catalogo.js` (colecciones, insignia, botón de mover, carrera de búsqueda, estados
  vacíos, código muerto fuera)
- `src/js/vistas/bibliomovil.js` (cabecera, resumen, preparación sin conexión, distancias, hoja de
  ruta, estados vacíos)
- `src/js/vistas/perfil.js` (rediseño completo)
- `src/js/modules/db/libros.js`, `db.js`, `db/perfil.js` (colecciones y documentación)
- `src/js/modules/persistencia.js` (colección en la copia local y semántica de `NULL`)
- `src/js/modules/ui-base.js`, `vistas/admin.js`, `vistas/mostrador.js` (clases mal formadas)
- `src/assets/css/styles.css` (sello de colección, hoja de ruta imprimible)

**Documentación**

- `SUGERENCIAS-2026-10.md` (lista de sugerencias con beneficios, para la biblioteca y la Municipalidad)
- `CHANGELOG.md` (versión 1.3.0), `pruebas/LEEME.md` (verificaciones nuevas y vista previa)

**Pruebas**

- `pruebas/probar-vistas.mjs` (colecciones por rol, botón de mover, vacíos explicados)
- `pruebas/probar-migraciones.py` (columna y separación en PostgreSQL real)
- `pruebas/verificar_clases_tailwind.py` (detector de clases mal formadas)
- `src/js/modules/__tests__/persistencia.test.js` (prueba real, 6 casos)
- `src/js/modules/__tests__/bibliomovil-ruta.test.js` (semántica `NULL` = sede)
- `pruebas/generar-vista-previa.mjs` (nueva herramienta de revisión visual)
