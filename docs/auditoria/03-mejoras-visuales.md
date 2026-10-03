# Mejoras Visuales y de Experiencia — Fase 4 («Patrimonio de Futrono»)

- **Proyecto**: BiblioNexo — Biblioteca Pública Municipal de Futrono N° 332 «Escritor Ramón Quichiyao Figueroa»
- **Fecha**: 3 de octubre de 2026
- **Estándar de accesibilidad**: WCAG 2.1 Nivel AA (Decreto Supremo N° 1/2015 MINSEGPRES)

---

## 1. Identidad estética «Patrimonio de Futrono»

Se verificó y consolidó la aplicación estricta de la paleta y tipografía institucional en todas las vistas:

| Elemento | Especificación | Estado |
|----------|----------------|--------|
| **Títulos (`font-serif`)** | `Newsreader` semibold (`600`), archivos `.woff2` locales | ✅ Aplicado en encabezados, modales y métricas |
| **Cuerpo y controles (`font-sans`)** | `Plus Jakarta Sans` (`400`–`800`), archivos `.woff2` locales | ✅ Aplicado en tablas, formularios y botones |
| **Fondo papel (`patrimonio-base`)** | `#F7F4EB` (claro) / `stone-950` (oscuro) | ✅ Consistente en `index.html`, `escaneo-remoto.html` y `404.html` |
| **Tarjetas (`patrimonio-card`)** | `#FFFFFF` (claro) / `stone-900` (oscuro), `rounded-2xl shadow-sm border border-stone-300 dark:border-stone-600` | ✅ Unificado en Dashboard, Reportes, Catálogo, Lectores, Préstamos, Bibliomóvil, Mesón, Administración y Mi perfil |
| **Acción primaria (`patrimonio-madera`)** | `#7A431D` (hover `#633414`) con texto blanco (contraste **7.93:1**) | ✅ Aplicado en `.btn-madera` y pestañas activas |
| **Acento institucional (`patrimonio-lago`)** | `#1B3B48` con texto blanco (contraste **11.89:1**) | ✅ Aplicado en menú lateral, filtros activos y acciones de búsqueda |
| **Estado disponible (`patrimonio-bosque`)** | `#2C4A3E` con texto blanco (contraste **9.74:1**) | ✅ Aplicado en insignias de disponibilidad, WhatsApp y gráfico de devoluciones |
| **Alertas de atraso** | `rose-700` sobre tarjeta blanca (contraste **6.29:1**) | ✅ Aplicado en préstamos vencidos, bloqueos y acciones destructivas |
| **Escáner / atención** | `amber-400` sobre fondo oscuro del menú lateral | ✅ Aplicado al ícono de Mesón y foco visible |

---

## 2. Mejoras concretas aplicadas en Fase 4

### 2.1. Navegación lateral y cabecera (`src/js/modules/ui-router.js`)
- **Corrección de contraste en hover del menú lateral**: Se reparó la clase `hover:bg-white dark:bg-stone-800/10` por `hover:bg-white/10` en los botones de navegación (`.nav-btn`), el botón de acceso a **Mi perfil** (`#perfil-btn`) y el botón de **Cerrar sesión** (`#logout-btn`), evitando que el fondo se volviera blanco sólido sobre texto blanco al pasar el ratón.
- **Esqueleto de carga (`_skeletonLoader`)**: Se alinearon las tarjetas de carga del Dashboard a `rounded-2xl` con soporte para modo oscuro (`dark:bg-stone-800`, `dark:bg-stone-700`).

### 2.2. Unificación de tarjetas y modo oscuro en el Dashboard (`src/js/vistas/dashboard.js`)
- Se reemplazaron los contenedores con `rounded-[2rem] shadow-soft-xl` por el patrón estándar `catalog-card bg-patrimonio-card dark:bg-stone-900 rounded-2xl shadow-sm border border-stone-300 dark:border-stone-600 p-5`, respetando la regla de diseño de no usar sombras grandes ni bordes distintos a `rounded-2xl`.
- Se añadieron variantes de modo oscuro a las alertas de **desajuste de rol** (`dark:bg-amber-950/40 dark:border-amber-800`) y de **reservas próximas a vencer** (`dark:bg-sky-950/40 dark:border-sky-800`), así como a los divisores de las leyendas de los gráficos (`dark:divide-stone-800`) y a los botones de accesos rápidos (`dark:text-stone-200 dark:hover:text-amber-400`).
- El gráfico de anillo **«Estado del fondo»** (`#fondo-chart`: copias *En estante* vs. *Prestados*) y el de **«Préstamos»** (`#prestamos-chart`: *Devueltos*, *Activos al día*, *Atrasados*) son visibles tanto para el rol **administrador** como para el rol **librero**, con accesos rápidos diferenciados según las tareas de cada rol.

### 2.3. Modales accesibles y modo oscuro (`src/js/modules/ui-modales.js`, `src/js/vistas/prestamos.js`, `src/js/vistas/catalogo.js`, `src/js/vistas/lectores.js`)
- Se incorporó soporte completo de modo oscuro y bordes `rounded-2xl` en `showConfirm()` y `showPrompt()`, que reemplazan cualquier uso de `confirm()` o `prompt()` nativos del navegador.
- Todos los modales (`showConfirm`, `showPrompt`, `showEditBookModal`, `showEditUserModal`, `showNotifyModal`, `showNotifyReservaModal`, `showNuevoLectorModal`, `showBulkNotifyModal`, `showQrRemotoModal`) mantienen trampa de foco (`Tab` / `Shift+Tab`), cierre con `Escape`, atributos `role="dialog"`, `aria-modal="true"` y `aria-labelledby`.
- Se corrigieron los botones secundarios de cierre/cancelación en modales (`hover:bg-stone-100 dark:hover:bg-stone-800` en lugar de `dark:bg-stone-700` fijo) y los avisos de estado del lector en `showConfirmarPrestamoModal` y `showConfirmarReservaModal`.

### 2.4. Vista Bibliomóvil y Vista Reportes (`src/js/vistas/bibliomovil.js`, `src/js/vistas/reportes.js`)
- **Bibliomóvil**: Se habilitó la barra de navegación rápida entre secciones (**Todo**, **Mapa y ruta**, **Catálogo**), haciendo accesible el catálogo de libros en ruta con sus filtros de disponibilidad (**Todos**, **En estante**, **Agotados**) y añadiendo en cada parada del recorrido el botón **«Avisar a lectores con préstamos en esta parada»** (`fa-whatsapp`).
- **Reportes**: Se incorporó la tarjeta **«Préstamos por parada del Bibliomóvil»** (`#reporte-paradas`) con barras de proporción en color `patrimonio-madera`, coordenadas geográficas e inclusión automática en la exportación CSV.

### 2.5. Tabla semántica de Lectores (`src/js/vistas/lectores.js`)
- Se restauró la estructura `<table>` + `<thead>` + `<tbody id="users-tbody">` en la vista **Lectores**, garantizando la alineación de columnas (**Nombre**, **RUT**, **Contacto**, **Acciones**), la accesibilidad para lectores de pantalla (`<th scope="col">`) y el refresco instantáneo al buscar o cambiar de página.

---

## 3. Verificación automatizada de contraste WCAG 2.1 AA

Resultado de `node pruebas/probar-contraste.mjs`:

```text
CONTRASTE WCAG 2.1 AA
==============================================================
✓ Texto principal sobre papel            10.81:1  (min 4.5)
✓ Texto principal sobre tarjeta          11.89:1  (min 4.5)
✓ Texto secundario (stone-600)           7.63:1  (min 4.5)
✓ Texto auxiliar (stone-500)             4.80:1  (min 4.5)
✓ Texto tenue sobre panel oscuro         4.72:1  (min 4.5)
✓ Enlace/acento madera sobre tarjeta     7.93:1  (min 4.5)
✓ Botón madera: blanco sobre madera      7.93:1  (min 4.5)
✓ Botón madera hover                     10.34:1  (min 4.5)
✓ Botón lago: blanco sobre lago          11.89:1  (min 4.5)
✓ Botón bosque: blanco sobre bosque      9.74:1  (min 4.5)
✓ Alerta atraso (rose-700)               6.29:1  (min 4.5)
✓ Alerta por vencer (amber-700)          5.02:1  (min 4.5)
✓ Foco sobre panel oscuro                6.51:1  (min 3)
==============================================================
Todos cumplen AA
Sin regresiones de color en el código
```
