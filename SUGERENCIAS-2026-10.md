# Sugerencias de mejora para BiblioNexo

- **Proyecto**: BiblioNexo — Biblioteca Pública Municipal de Futrono N° 332 «Escritor Ramón Quichiyao Figueroa»
- **Fecha**: 3 de octubre de 2026
- **Para**: equipo de la biblioteca y administración municipal
- **Cómo leerlo**: 15 sugerencias ordenadas por relación entre beneficio y esfuerzo. Cada una dice
  **qué es**, **qué se gana** y **qué implica** hacerla. Las de la sección 1 se pueden empezar ya; las
  de la sección 3 son proyectos que necesitan decisiones institucionales antes que código.

Este documento es la lista que se pidió como cierre de la ronda de trabajo de octubre de 2026. El
informe técnico de esa ronda (qué se corrigió y cómo se verificó) está en
`docs/auditoria/05-catalogo-bibliomovil-perfil-2026-10-03.md`.

---

## 1. Corto plazo — se pueden hacer ya (horas de trabajo, riesgo bajo)

### S1. Aviso de vencimiento por WhatsApp en lote

**Qué es.** Desde Préstamos, seleccionar todos los lectores con préstamos que vencen esta semana y
enviarles el aviso en una sola pasada, con seguimiento de a quién se le avisó y a quién no.

**Beneficio.** Menos atrasos y menos llamadas telefónicas. Hoy el aviso se hace uno por uno desde el
Mesón, así que cuando hay 15 vencimientos se avisa a los tres primeros y el resto se enteran tarde.

**Qué implica.** Existe `showBulkNotifyModal` en `ui-base.js` y el registro de contactos de lectores;
falta el armado de la lista y el control de envíos. Hay que cuidar el límite de mensajes de WhatsApp y
no incluir datos personales más allá del nombre, el título y la fecha: **es el principal riesgo legal
de esta sugerencia**.

### S2. Toma de inventario guiada

**Qué es.** Un modo de recorrido de estanterías: se escanean los ejemplares uno por uno, la pantalla
muestra qué se esperaba encontrar y qué falta, y al final se genera un informe (CSV o PDF) con las
diferencias.

**Beneficio.** Reemplaza el conteo en papel, detecta ejemplares perdidos y descuadres de stock, y deja
un respaldo firmado del inventario anual. La función SQL `corregir_inventario` ya existe y está
probada: solo falta el flujo de pantalla.

**Qué implica.** 1–2 días. Depende de que el lector de códigos del mesón funcione también en la
tableta de terreno (ya funciona en el Mesón).

### S3. Panel «Salud del sistema» en el Dashboard

**Qué es.** Un bloque solo para administradores con: última sincronización completa, operaciones en
cola sin conexión, errores de las últimas 24 horas, reservas por vencer y estado de los respaldos.

**Beneficio.** Hoy, para saber si algo anda mal, hay que entrar a Administración → Diagnóstico y leer
la bitácora técnica. Con el panel, quien abre la mañana ve de inmediato si el sistema está al día, y
el problema se detecta **antes** de que el mesón se quede sin poder prestar.

**Qué implica.** 1 día. Los datos ya están en `respaldos_log`, la cola de sincronización y la bitácora
de errores; es trabajo de presentación, no de base de datos.

### S4. Hoja de ruta con horarios y firma

**Qué es.** Ampliar la hoja de ruta imprimible que ya existe: hora estimada por parada, kilometraje
acumulado y una línea para el nombre y la firma de quien hizo el recorrido.

**Beneficio.** La hoja impresa pasa a servir como respaldo administrativo del recorrido (rendición de
viáticos, control municipal), no solo como ayuda de terreno.

**Qué implica.** 2 horas. Se extiende lo ya implementado en `_imprimirHojaRutaBibliomovil()`.

### S5. Carné del lector con código QR

**Qué es.** Generar e imprimir el carné de cada lector con su nombre, número de socio y un código QR.

**Beneficio.** Acelera el préstamo: en vez de dictar el RUT, se escanea el carné. Reduce errores de
tipeo y filtra la identidad con más seguridad. El generador de códigos QR ya está en el proyecto
(se usa en el enlace de escaneo remoto).

**Qué implica.** 1 día. Hay que definir con la biblioteca qué datos van impresos: **el carné no debería
llevar más de lo que la persona ya muestra en su cédula de identidad**.

---

## 2. Mediano plazo — necesitan coordinación (semanas)

### S6. Historial del lector en la pantalla de circulación

**Qué es.** Al prestar o devolver, ver en la misma pantalla los préstamos previos, los atrasos y los
bloqueos de esa persona.

**Beneficio.** Permite decidir con contexto («devolvió tarde tres veces») sin cambiar de pantalla ni
interrumpir la fila del mesón.

**Qué implica.** 3–4 días. Es información sensible de vecinos: debe verse **solo** con sesión de
personal autenticado y no debe quedar en el historial del navegador. Revisar con la encargada qué
campos son realmente necesarios.

### S7. Mapas sin conexión en caché

**Qué es.** Guardar los mosaicos del mapa de la zona rural en el equipo, y conservar el último
recorrido calculado, para que el mapa siga funcionando donde no hay señal.

**Beneficio.** El mapa deja de depender de la señal justo en los caminos donde más falta hace. Es la
mejora más pedida desde terreno.

**Qué implica.** 1 semana. Hay que resolver el peso (los paquetes de mosaicos pueden superar lo que un
celular debe descargar) y la licencia de uso de OpenStreetMap: **consultar con Jurídica**.

### S8. Estadísticas por parada con evolución mensual

**Qué es.** Extender el informe actual (que ya agrupa por parada) con la comparación mes a mes y la
exportación a CSV para planillas.

**Beneficio.** Permite justificar la ruta con datos ante la Municipalidad: qué paradas crecen, cuáles
dejan de usarse y dónde conviene agregar una salida.

**Qué implica.** 3–5 días. La función `estadisticas_paradas()` ya entrega el corte por parada; falta
la serie temporal y la exportación.

### S9. Resolución de conflictos sin conexión, visible

**Qué es.** Cuando dos equipos trabajan sin señal y hacen operaciones que se contradicen (el mismo
ejemplar prestado dos veces), al sincronizar el sistema hoy rechaza la operación imposible con un
mensaje técnico. La sugerencia es mostrar **qué pasó**, con las dos versiones, y pedir una decisión.

**Beneficio.** Con una sola persona en terreno el problema casi no existe; con dos equipos, sin esta
pantalla nadie entiende por qué «desapareció» una operación. Es la base para poder crecer en personal
de ruta sin perder el control del stock.

**Qué implica.** 1–2 semanas. Es el trabajo más delicado de la lista: toca la cola de sincronización y
hay que probarlo con escenarios de verdad, no solo automatizados.

### S10. Definir paradas sin ratón

**Qué es.** Campos accesibles de latitud y longitud, y búsqueda por nombre de lugar, para agregar una
parada sin hacer clic sobre el mapa.

**Beneficio.** Hoy elegir una coordenada exige puntero: quien no puede usar el ratón (o lo hace con
dificultad) queda fuera del flujo principal. Además permite escribir coordenadas tomadas de otra
fuente con precisión.

**Qué implica.** 3–4 días. Es también un requisito de accesibilidad del Decreto Supremo N° 1/2015.

### S11. Aviso automático de reserva disponible

**Qué es.** Cuando un ejemplar reservado se devuelve, avisar por WhatsApp al lector que lo espera, con
la fecha en que expira la reserva.

**Beneficio.** Menos reservas que expiran sin que el lector se entere nunca. Hoy el aviso es manual y
la reserva se vence sola.

**Qué implica.** 2–3 días. Requiere una plantilla de mensaje aprobada y un control de frecuencia para
no mandar avisos repetidos.

---

## 3. Largo plazo — proyectos, requieren decisión institucional

### S12. Integración con Aleph 500

**Qué es.** Importar los registros bibliográficos del catálogo nacional (formato MARC) y exportar la
circulación del día hacia Aleph.

**Beneficio.** Deja de haber dos catálogos que se contradicen. BiblioNexo se ocupa de lo que Aleph no
hace bien (circulación, offline, terreno) y Aleph sigue siendo la fuente autoritativa del registro
bibliográfico. Es la Fase 2 del proyecto y ya hay documentación técnica iniciada en
`ALEPH500_SIP2.md`.

**Qué implica.** Semanas de trabajo y coordinación con quien administra Aleph. No es una tarea de
programación suelta.

### S13. Pruebas end-to-end en navegador real

**Qué es.** Una suite que abra la aplicación en un navegador de verdad, contra una base de datos de
pruebas (staging), y recorra los flujos reales: préstamo, devolución, ruta, sin conexión.

**Beneficio.** Las pruebas actuales (más de 700 comprobaciones) corren en un navegador simulado y no
pueden probar el mapa, la geolocalización, la cámara ni el Service Worker. Esta suite atraparía esos
errores antes de publicar, y ya hay pruebas automatizadas en cada envío de código.

**Qué implica.** 1–2 semanas de armado inicial y, después, minutos por corrida. Necesita un proyecto
Supabase de pruebas (gratuito alcanza).

### S14. Auditoría de accesibilidad externa y prueba con lectores reales

**Qué es.** Revisión con lector de pantalla y teclado, y una jornada de prueba con personas mayores y
con discapacidad visual usando la aplicación.

**Beneficio.** Convierte el cumplimiento normativo en algo verificable, y descubre problemas de uso
que ninguna prueba automática detecta. El público de la biblioteca incluye personas mayores: su
experiencia real es la mejor prueba de que el tamaño de letra y el contraste funcionan.

**Qué implica.** Depende de terceros (municipio, organizaciones de la zona). Bajo costo de código,
alto valor de aprendizaje.

### S15. Multi-sede

**Qué es.** Si el municipio suma otra biblioteca, separar catálogo, personal y estadísticas por sede.

**Beneficio.** Evita una migración dolorosa más adelante: hoy el sistema asume una sola biblioteca.

**Qué implica.** Alto costo de diseño y de pruebas. Solo tiene sentido si la necesidad está
confirmada; **no conviene adelantarlo «por si acaso»**, porque complica el uso diario de una sola sede.

---

## 4. Pendientes operativos que no son código (pero son los más urgentes)

Ninguna de estas es una sugerencia de programación, y aun así son las que más riesgo real tienen:

| Pendiente | Por qué importa |
|---|---|
| **Cifrado del disco y bloqueo de sesión del equipo del mesón** | La aplicación cierra la sesión a los 20 minutos, pero los datos quedan en el disco del computador. Es el incumplimiento más importante frente a la Ley 21.719 y se resuelve en la configuración del equipo. |
| **Probar una restauración de respaldo** | Hoy se verifica que el respaldo se genera, no que se pueda restaurar. Un respaldo que no se ha probado no es un respaldo. Una vez al año alcanza. |
| **Revisión jurídica de textos públicos y servicios de mapas** | Los términos de uso de OpenStreetMap y del servicio público de rutas (OSRM) deben quedar revisados por la Municipalidad antes de usarlos en producción. |
| **Capacitación del segundo turno** | El sistema está pensado para dos personas no técnicas; conviene dejar registro de quién sabe hacer el cierre diario, la preparación offline y el respaldo. |

---

## 5. Lo que se hizo en esta ronda (para no volver a sugerirlo)

Ya está implementado y probado, así que no aparece como sugerencia:

- **Catálogos separados**: biblioteca (sede) y Bibliomóvil (ruta) son colecciones distintas, con
  insignia, alta diferenciada y botón para mover ejemplares.
- **Mi perfil rediseñado**: encabezado de identidad, datos, contraseña con requisitos en vivo,
  preferencias (tamaño de letra y modo oscuro), actividad, accesos rápidos y sesión.
- **Bibliomóvil enriquecido**: resumen operativo, preparación sin conexión explicada, distancia entre
  paradas, estados vacíos útiles y hoja de ruta imprimible.
- **Errores corregidos**: 11 hallazgos de la auditoría (libro invisible por colección `NULL`, copia
  local que perdía la colección, carrera de búsqueda, mensaje de error equivocado en Mi perfil, cuatro
  clases de Tailwind que no pintaban) y las pruebas que evitan que vuelvan.

El detalle técnico, con causa raíz de cada fallo y la verificación de cada arreglo, está en
`docs/auditoria/05-catalogo-bibliomovil-perfil-2026-10-03.md`.
