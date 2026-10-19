# Revisión visual móvil — 18 de octubre de 2026

## Alcance

Corrección incremental de la interfaz, a partir de las dos capturas del teléfono.
Se conserva la identidad «Patrimonio de Futrono», los permisos por rol y la lógica
de circulación. No se cambia ninguna migración, RPC ni dato de producción.

## Ciclos de reproducción → corrección → verificación

### 1. Contenido desplazado y comprimido

**Reproducción:** en Chromium, con viewport de 393 × 740, el menú cerrado seguía
ocupando 320 px en el contenedor flex. El contenido empezaba en `x = 320` y disponía
de solo **73 px**. Una regla decorativa posterior `#sidebar { position: relative }`
pisaba el `position: fixed` móvil. Las pruebas jsdom pasaban porque no calculan
la distribución CSS.

**Corrección:** separar decoración y posición, conservar el drawer fuera del flujo
en móvil, usar `100dvh` con respaldo `100vh` y permitir que la columna principal y
el área desplazable reduzcan su tamaño. CSS y JavaScript comparten el corte de
`48rem`, sin solapamiento en 768 px.

**Resultado:** contenido en `x = 0`, ancho 393 px; también se comprueban teléfonos
más estrechos y el regreso a escritorio.

### 2. Menú, cabecera y notificaciones

- Se elimina el segundo drawer vacío y la manipulación duplicada de `display`.
- Una sola función controla apertura, cierre, overlay, bloqueo del fondo y los
  atributos de ambos botones de menú.
- Botón visible «Cerrar menú», Escape, devolución del foco y navegación por
  teclado contenida dentro del drawer. El menú cerrado es `inert`.
- El fondo queda inactivo mientras el menú está abierto. Se retira
  `touch-action: none` de `body`, que impedía desplazar también el propio menú.
- La navegación se desplaza independientemente de la cabecera y la ficha de
  usuario. Se limita el cargo largo sin desbordar, conservándolo en el título.
- Los cambios de tamaño y el cierre/reinicio de sesión limpian estados y
  escuchadores. Una actualización asíncrona del badge ya no cierra el menú.
- Las notificaciones se anclan al ancho de la cabecera, no a la campana: antes
  salían por el borde izquierdo. Las listas largas tienen scroll interno y no
  cubren la navegación inferior.
- El estado de conexión ocupa la columna de la marca, no empuja los botones y
  conserva el mensaje correcto durante la sincronización. La revisión de capturas
  añadió un ajuste final: conservar los controles de cabecera a 44 × 44 px para
  que la marca, el título y «En línea» tampoco se recorten con letra al 130 %.
- Se iguala la altura real de la barra inferior con el espacio reservado para
  contenido, avisos y acción flotante. Se conservan los márgenes de área segura.

### 3. Formularios, tarjetas, letra grande y diálogos

- El alta de libros elimina los `col-span` que creaban columnas implícitas vacías.
  Los campos de texto y acciones móviles tienen objetivos táctiles adecuados;
  las casillas ya no reciben la altura de un campo de texto.
- Las tarjetas de libros limitan sus bloques flex al ancho disponible y permiten
  títulos largos. Las acciones pueden envolver a la siguiente línea.
- Consultas de contenedor ajustan cifras, tarjetas, mesón, perfil y cabeceras al
  ancho **real del área de trabajo**, incluso con sidebar y letra al 130 %.
- Los encabezados de tarjetas y las tintas de los sellos tienen variantes oscuras
  legibles. Los sellos que solicitan `!rotate-0` cancelan también el `transform`
  original (Tailwind v4 utiliza una propiedad `rotate` independiente).
- Todos los diálogos preparados por `_prepararModal` reciben clases compartidas;
  su altura móvil deja de depender de detectar un radio concreto en el HTML.
  Tienen altura máxima dinámica, scroll interno y botones finales alcanzables.
- El viewport solicita redimensionar el contenido al abrir el teclado en
  navegadores compatibles. La pantalla de ingreso permite desplazamiento vertical con el teléfono en
  horizontal o con poca altura, en vez de recortar el formulario.
- Movimiento reducido desactiva realmente las transiciones: una duración mínima
  distinta de cero retrasaba la visibilidad heredada y hacía fallar el foco.

### 4. Regresión automatizada

Primera ronda de `npm run test:visual`: **49 casos**, sobre el HTML, JS y CSS del
build real, con Chromium. La segunda ronda amplía el total a **75**. Incluye:

- 320, 360, 393, 412, 640, 767, 768, 769, 1024 y 1440 px.
- Temas claro y oscuro; letra normal y ampliada al 130 %.
- Las nueve vistas y los roles administrador, librero y bibliomóvil.
- Menú con ambos accesos, cierre por botón/fondo/Escape, foco, navegación,
  actualización de notificaciones, cambios de tamaño y remontaje de sesión.
- Desplazamiento con eventos táctiles reales enviados al navegador.
- Listas largas de notificaciones, cinco tipos de diálogo, controles finales,
  avisos sobre la barra inferior y contraste de encabezados, acciones y estados
  oscuros.
- Reducción del viewport para simular el espacio disponible con teclado.
- Áreas seguras simuladas de 24 px arriba y 34 px abajo, aplicadas a la misma hoja
  compilada. Esto verifica geometría, no el comportamiento del sistema operativo.

Los datos son ficticios, se sustituye el cliente de datos **solo en el navegador
de prueba** y se bloquean peticiones a otros orígenes. No se incorporan cuentas de
prueba, credenciales ni vías alternativas de acceso a la aplicación publicada.

## Segunda ronda: omisiones y casos límite

Se volvió a ejecutar la base de 49 casos antes de ampliar la revisión. Después
se agregaron **26 regresiones** en `pruebas/visual/casos-limite.pw.js`, se
reprodujeron los fallos y se repitió el ciclo de corrección y comprobación. La
última ejecución incluye los 75 casos juntos, no solo los nuevos.

### Hallazgos y correcciones

| Omisión | Corrección comprobada |
|---|---|
| El selector de lector al prestar no utilizaba el ciclo de vida compartido y quedaba parcialmente fuera de teléfonos bajos. | Ahora utiliza el mismo gestor de diálogos, tiene scroll interior, foco inicial, Escape, fondo inactivo y devolución del foco. |
| Escape cerraba simultáneamente el aviso individual y su lista de avisos. | Solo responde el diálogo superior; el padre recupera el foco sin habilitar todavía el fondo. El cierre es idempotente y se limpia al cambiar de sesión. |
| Los errores quedaban detrás de los diálogos. | Los avisos se muestran por encima, mantienen su región accesible y envuelven mensajes largos. Se comprueba también con hit-testing, no solo con `z-index`. |
| El texto escrito heredaba tinta oscura sobre campos oscuros: contraste **1:1**. | Se define el color oscuro del texto base y se corrigen el selector, consentimiento y enlace de recuperación. Se prueba claro → oscuro → claro en catálogo, lectores, perfil y mesón. |
| Los avisos de éxito tenían contraste **2,54:1**. | Se usa el verde bosque existente, sin introducir otra paleta. Éxito, error e información superan 4,5:1 en los avisos probados. |
| A 768/1024 px, la barra lateral y la letra al 130 % dejaban campos estrechos aun sin overflow. | Las rejillas se adaptan al ancho útil. Se prueban campos de libros, lectores, apoderado —activando la opción de menor— y perfil con ancho mínimo útil. |
| Nombres, correos y leyendas se truncaban. | Las tarjetas de lectores y leyendas pueden envolver su contenido; los gráficos pasan a una columna cuando no hay espacio real. |
| Recuperación de contraseña y aceptación de invitaciones se recortaban con poca altura. | Comparten la pantalla de acceso desplazable. Se alcanzan los primeros campos y el botón final. |
| Un identificador largo desbordaba una confirmación en pantallas anchas y bajas. | Todos los diálogos, también por encima del corte móvil, limitan su altura y permiten envolver texto sin espacios. Se comprueban 844 × 360 y 1024 × 360. |
| Una navegación antigua desplazaba al inicio la vista nueva. | El scroll final comprueba que la navegación siga vigente y respeta movimiento reducido. |
| Las respuestas llegadas fuera de orden restauraban búsquedas, filtros o períodos antiguos. | Se comprueba la vigencia antes de aplicar resultados en selector de lectores, catálogo, lista de lectores, préstamos y reportes. Cerrar el selector invalida también su temporizador y sus respuestas pendientes. No se altera el protocolo ni se cancelan peticiones del backend. |
| La impresión conservaba navegación móvil, alturas fijas y colores oscuros. | Las reglas de impresión quedan después de las de pantalla: ocultan el marco, liberan alturas/overflow, usan papel blanco y tinta legible y desactivan animaciones de entrada sin ocultar las tarjetas. |
| El PDF real mostró el centro del gráfico desplazado y etiquetas oscuras. | El canvas conserva proporción y centrado al imprimir; los indicadores usan fondos claros. Se revisaron las dos páginas de un PDF A4 generado desde el tema oscuro con letra al 130 %, incluido su contenido final. |

Además, se probaron seis vistas sin datos en ambos temas, ausencia de errores de
página/desbordes/valores inválidos, cancelación de búsquedas pendientes y la
impresión independiente de la hoja de ruta del Bibliomóvil, incluido su evento
`afterprint` y la recuperación de la pantalla. No se modificó el contenido ni la
versión del consentimiento legal, los permisos, SQL, autenticación o reglas de
circulación.

### Cómo se evitan falsos positivos

- Las consultas lentas se controlan con barreras en el cliente ficticio: se deja
  pendiente una respuesta, se completa la nueva y finalmente se libera la vieja.
  No se usan pausas arbitrarias para decidir qué consulta gana.
- Se conservan las 49 comprobaciones anteriores y se comparten utilidades en
  `apoyo.js`; no se reducen sus umbrales.
- El contraste se calcula con los colores computados del navegador sobre
  superficies opacas. Esto no certifica todos los componentes ni composiciones
  con transparencias o fotografías.
- Además de las aserciones se inspeccionaron capturas de campos oscuros,
  selector horizontal, identidad completa del lector, gráficos y el PDF real.
  Las capturas, PDF y scripts auxiliares permanecen fuera de Git.

## Resultado local de la comprobación

- Chromium: **75/75** casos correctos (49 anteriores + 26 nuevos).
- Vitest: **28/28** pruebas, en seis archivos.
- Verificadores heredados de consolidación/RPC/Tailwind, interfaz, escaneo y modo
  offline: correctos.
- Contraste heredado: los trece pares cumplen AA; las comprobaciones nuevas en
  Chromium también validan encabezados, acciones, estados, texto escrito, avisos
  y etiquetas impresas en los escenarios seleccionados.
- Build de producción y verificación PWA: correctos.
- `npm audit --audit-level=high`: cero vulnerabilidades reportadas.
- Los datos/sesiones ficticios no están presentes en `dist/`.

No equivale a un despliegue ni a una ejecución remota de GitHub Actions.

## Cómo repetir la revisión

```bash
npm ci
npx playwright install --with-deps chromium
npm run build
npm run verify:build
npm run test:visual
npm test
npm run test:legacy
npm run test:legacy:contraste
```

En un entorno con Chromium preinstalado se admite
`PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/ruta/al/chromium`.
La suite arranca un preview local de `dist/` y conserva capturas/trazas de fallos
en `.arena/pruebas-visuales/`, fuera de Git. También queda incorporada al trabajo
`interfaz` de GitHub Actions, después de construir y verificar el build.

## Límites de la comprobación

- Se comprueba Chromium con tamaños y entrada táctil emulados, no un teléfono
  físico ni Safari. Conviene confirmar en el dispositivo original tras desplegar,
  especialmente teclado, barras del navegador y áreas seguras del sistema.
- El recuadro flotante con avatares no se reprodujo. No se confirmó su origen;
  podría ser una superposición externa. No se afirma que esté corregido.
- La impresión revisada es la de Chromium, no una prueba en impresora física.
  Tampoco se afirma cobertura exhaustiva de Administración o de accesibilidad.
- Esta revisión no despliega producción ni prueba operaciones contra una base
  remota. Las pruebas existentes de interfaz, modo offline y verificadores
  estáticos se mantienen sin rebajar sus comprobaciones.
