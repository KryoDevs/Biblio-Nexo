# Plan propuesto para el rol Bibliomóvil

**Estado:** propuesta de Fase 2 para revisión y aprobación; no implementada.
**Línea base:** rama `arena/01a100ab-biblio-nexo`, commit `c2be79062eaf0017dee0a9e0ed3c08554ddf6666`.
**Relacionado:** [Informe de auditoría de Fase 2](01-informe-inicial.md).
**No reemplaza:** `02-registro-cambios.md`, que conserva su propósito histórico.

> Este documento describe alcance, permisos y una secuencia segura de trabajo para una futura Fase 3. No crea migraciones, no cambia roles, no ejecuta SQL y no presupone que Bibliomóvil ya sea un rol operativo en Supabase. La configuración visual existente no se considera autorización.

## 1. Objetivo y principios de diseño

Incorporar, solo tras aprobación, un rol de **mínimo privilegio** para personal que opera el Bibliomóvil. El servidor debe poder demostrar quién está autorizado, para qué ruta/visita y qué datos necesita. El cliente puede mejorar la experiencia, pero no decide permisos.

Principios propuestos:

1. **Denegar por defecto:** una identidad autenticada sin perfil autorizado no recibe permisos de librero ni Bibliomóvil.
2. **Autorización en cada frontera:** RLS, funciones RPC y Edge Functions; ocultar botones o vistas no protege datos.
3. **Alcance por asignación y tiempo:** una cuenta Bibliomóvil solo opera en visitas asignadas y abiertas, no en toda la actividad histórica de la biblioteca.
4. **Datos personales mínimos:** no entregar un listado global de lectores ni correo/teléfono a una cuenta de ruta salvo que se apruebe una finalidad concreta.
5. **Integridad antes que offline:** no declarar un préstamo «registrado» hasta confirmación del servidor; los reintentos deben ser idempotentes y estar ligados a la identidad original.
6. **Compatibilidad e historial:** preservar préstamos antiguos, rutas locales y clientes existentes; cambios de esquema deben ser aditivos y migrar sin reinterpretar datos históricos.
7. **Sin secretos en navegador:** ninguna `service_role` ni credencial administrativa fuera del runtime seguro de Edge Functions.
8. **Privacidad verificable:** consentimiento, avisos, tratamiento del QR y política web deben describir el comportamiento efectivo y contar con aprobación jurídica municipal.

## 2. Qué existe hoy y qué falta

| Área | Estado que demuestra el repositorio | Brecha para un rol real |
|---|---|---|
| Rol/menú | `config.js` ya define un menú `bibliomovil` con Dashboard, Bibliomóvil, Mesón, Catálogo, Lectores y Préstamos. | Es solo presentación. `asignar_rol()` y `invitar-personal` aceptan `admin`/`librero`; las guardas SQL usan `es_personal()`, que solo exige sesión. |
| Ruta | La vista permite crear, ordenar y guardar paradas en `localStorage`. | No hay ruta asignada a una cuenta, fecha/visita en servidor ni estado de inicio/cierre. El plan depende del navegador que lo creó. |
| Catálogo móvil | Existe `es_bibliomovil` y una consulta que filtra títulos con ese flag. | El formulario de edición no expone el flag y `actualizarLibro()` no lo incluye. El flag identifica libros, no unidades cargadas al vehículo. |
| Préstamos | El RPC admite nombre/coordenadas de parada y guarda esos campos. | El flujo común de préstamo desde Catálogo/Mesón no recibe la parada seleccionada; el préstamo móvil no queda unido a una visita ni a una asignación. |
| Avisos | Hay una acción manual por nombre de parada que abre el modal de avisos. | La consulta incluye todos los préstamos activos con ese nombre, no una visita o ventana de vencimiento; el texto puede decir «mañana» sin tener fecha de visita. |
| Offline | IndexedDB replica catálogo y algunos lectores; una cola durable reintenta mutaciones. | Caché/cola no se separan por UID; logout no limpia ni bloquea la cola; falta clave de idempotencia contra respuesta ambigua. |
| Privacidad | El formulario muestra consentimiento; la política web se declara borrador. | Campos de consentimiento son nullable, la verificación es principalmente de interfaz, y la descripción de Bibliomóvil no coincide con la consulta real por parada. |

## 3. Alcance propuesto

### Incluir en una futura implementación

- Un perfil `bibliomovil` persistido y asignado explícitamente por administración.
- Permisos RLS/RPC distintos de los de `librero`, comprobados en el servidor.
- Entidades persistentes para rutas, paradas estables, visitas programadas y asignaciones.
- Relación entre una operación de circulación, su visita/parada y, si se aprueba, el inventario que viaja en el vehículo.
- Lectura offline mínima, aislamiento por usuario y un procedimiento seguro para operaciones pendientes.
- Avisos de lectores acotados a la visita y a una ventana temporal aprobada.
- Pruebas negativas por rol, migración compatible, despliegue de ensayo y actualización documental/legal aprobada.

### No incluir sin una decisión adicional

- Seguimiento GPS continuo de trabajadores o lectores.
- Domicilios particulares o geocodificación inversa de personas.
- Envío automático de mensajes a lectores.
- Acceso de Bibliomóvil a administración, nómina de personal, exportaciones, auditoría completa o datos globales de lectores.
- Conversión automática de los antiguos valores de `parada_nombre` en visitas nuevas.
- Eliminación o purga de operaciones offline pendientes al cambiar de cuenta.
- Uso de `service_role` en código de navegador.

La optimización vial puede seguir siendo una ayuda de navegación independiente; no sustituye la autorización ni el registro de una visita.

## 4. Matriz objetivo de permisos (propuesta, no vigente)

La matriz siguiente es una recomendación conservadora. Los permisos actuales de `librero` se mantienen salvo aprobación explícita de un cambio separado. Las celdas de Bibliomóvil requieren confirmación del usuario.

| Capacidad | `admin` | `librero` | `bibliomovil` (propuesto) | Sin perfil / `anon` |
|---|---|---|---|---|
| Iniciar sesión y ver el propio perfil | Sí | Sí | Sí | Sin acceso a datos operativos; `anon` solo a las RPC públicas que se aprueben expresamente. |
| Crear/asignar/cambiar perfiles y roles | Sí, con controles para evitar perder el último admin | No | No | No; no puede autoprovisionarse como personal. |
| Ver catálogo general | Sí | Según permisos actuales | Solo catálogo marcado/cargado para Bibliomóvil y la visita autorizada | No a catálogo privado, salvo decisión separada sobre catálogo público. |
| Ver/editar lectores globales | Sí | Según permisos actuales | No | No. |
| Identificar a un lector al prestar | Sí | Según flujo actual | Solo dentro de una visita activa y mediante una consulta RPC acotada; campos mínimos a confirmar | No. |
| Ver correo/teléfono y contactar | Sí | Según permisos actuales | No por defecto. Habilitar solo si se justifica, se limita y el texto de consentimiento/política lo cubre | No. |
| Registrar préstamo | Sí, según reglas vigentes | Sí, según reglas vigentes | Solo para la visita/parada asignada, con stock móvil disponible y reglas de circulación revalidadas por servidor | No. |
| Registrar devolución/renovación | Sí | Sí | Propuesta: permitir la devolución de un ejemplar recibido en una visita autorizada; renovar solo si se aprueba y bajo las mismas reglas de servidor | No. |
| Ajustar stock global, eliminar/restaurar libros o lectores | Administración | Solo lo permitido hoy | No. Movimientos de carga/descarga móvil, si se aprueban, deben ser RPC propios y auditados | No. |
| Ver y editar rutas/visitas | Gestionar, asignar y cerrar | No por defecto | Solo ver/operar las visitas asignadas; no reasignarse ni modificar la fecha histórica | No. |
| Avisos de parada | Visión global según privilegios actuales | Visión global según privilegios actuales | Solo lectores/préstamos pertinentes a su visita y ventana de aviso; contacto separado del listado | No. |
| Reportes | Globales | Los que muestra la interfaz actual | Solo agregados de visitas asignadas, sin ficha histórica global | No. |
| Personal, políticas, registros de error, auditoría, respaldos, exportación y anonimización | Según controles actuales de administración | No | No | No. |
| RPC de escaneo remoto sin sesión | No depende del rol; solo por token | Puede generar/revocar según reglas actuales | No debe implicar permisos de lector por ser rol móvil | Token limitado, si se mantiene; sin token no expone datos personales. |

**Nota de autorización:** hoy la interfaz de Bibliomóvil incluye Lectores y Préstamos, pero la matriz objetivo los reduce a consultas acotadas. Si el trabajo requiere otra capacidad, debe añadirse como permiso explícito en servidor y como caso de prueba, no heredarse de `es_personal()`.

## 5. Cambios de datos, RLS y RPC que habría que diseñar

No se propone ejecutar ni escribir SQL en esta fase. El diseño detallado debe cerrarse después de revisar el historial remoto autorizado y aprobar la matriz.

### 5.1 Identidad y asignación de roles

- Revisar restricciones/valores aceptados por `usuarios.rol` y agregar `bibliomovil` mediante cambio compatible, si corresponde.
- Actualizar la asignación administrativa y `supabase/functions/invitar-personal` para aceptar el nuevo rol solo desde una solicitud autorizada por admin. Mantener `service_role` exclusivamente dentro de Edge Function y en secreto del runtime.
- Reemplazar la autoprovisión que convierte perfil ausente en `librero` por un flujo explícito de invitación/aprobación. Una cuenta autenticada sin fila debe quedar sin permisos operativos.
- Diseñar el bootstrap del primer admin y la recuperación administrativa para no abrir una vía de autoasignación.
- Decidir si cada persona tiene un único rol o si puede acumular funciones/capacidades; el esquema actual presenta un único `rol` por perfil.

### 5.2 Modelo de rutas, paradas y visitas

Modelo conceptual para evaluar:

- **Ruta:** plantilla reutilizable, nombre y estado; no necesita direcciones residenciales.
- **Parada:** identidad estable y coordenadas de un punto operativo autorizado.
- **Ruta–parada:** orden y datos operativos de la plantilla.
- **Visita/recorrido:** instancia con fecha, ruta, estado (`programada`, `abierta`, `cerrada`, `cancelada`) y persona o equipo asignado.
- **Parada de visita:** parada concreta de esa salida, orden, horario previsto y estado/horas reales si la operación los necesita.
- **Asignación:** referencia al usuario autenticado; si puede operar una cuadrilla, definir si se admite más de un usuario por visita.
- **Préstamo:** FK nullable a la parada/visita concreta, manteniendo `parada_nombre`, `parada_lat` y `parada_lng` para el historial existente. No hacer backfill inventando fechas.

**Inventario a bordo pendiente de decisión.** `es_bibliomovil` es un indicador de título; no representa cuántos ejemplares están cargados en el vehículo. Si se requiere control de existencias móvil, evaluar una tabla de movimientos/cargas por libro y visita con restricciones transaccionales, en vez de reutilizar `libros.stock` como si fuera stock del vehículo.

### 5.3 RPC y fronteras de acceso

Diseñar RPC explícitas para el trabajo móvil, por ejemplo:

- `listar_visitas_asignadas()` y `obtener_detalle_visita(visita_id)`: solo visitas del usuario actual o de su equipo autorizado.
- `abrir_visita()` / `cerrar_visita()`: comprobar asignación, rol y transición de estado en servidor.
- `listar_catalogo_bibliomovil(visita_id, filtros, paginación)`: limitar títulos/unidades disponibles para esa visita.
- `consultar_lector_movil(visita_id, identificador)`: devolver solo el estado y los campos aprobados, no una búsqueda global ni el contacto por defecto.
- `prestar_libro_movil(visita_id, parada_visita_id, libro_id, lector_id, operation_id)`: revalidar rol, asignación, visita abierta, parada, libro/inventario, bloqueo del lector, límites y stock; registrar relación y auditoría dentro de la transacción.
- `devolver_prestamo_movil(...)` y, si se aprueba, `renovar_prestamo_movil(...)`: limitar la operación a una visita válida sin relajar las reglas existentes.
- `obtener_avisos_visita(visita_id, parada_visita_id, desde/hasta, paginación)`: filtrar por fecha de visita y vencimiento, sin truncar silenciosamente a 500.
- RPC de inventario móvil únicamente si la operación física (carga/devolución al depósito) queda definida.

Las funciones que usen `SECURITY DEFINER` deben tener guardas internas por usuario/rol/asignación, parámetros mínimos, objetos calificados y `search_path` revisado; después deben probarse con llamadas directas, no solo desde la interfaz. RLS debe impedir leer las tablas de lectores/préstamos por una ruta más amplia que las RPC aprobadas.

### 5.4 Idempotencia y compatibilidad de RPC

- Crear una clave aleatoria de operación por mutación (`operation_id`) y hacer que la base la reconozca dentro de la misma transacción. Repetir la misma clave devuelve el mismo resultado; una clave distinta representa una operación diferente.
- No confiar en el ID local de IndexedDB como protección del servidor: hoy no se envía a los RPC.
- Evitar sobrecargas ambiguas de PostgreSQL/PostgREST, especialmente combinaciones de parámetros opcionales. Preferir una RPC móvil con nombre/firma explícitos o una versión deliberada, y probar llamadas viejas/nuevas.
- Mantener las RPC actuales para el Mesón durante la transición; retirar una firma solo después de inventariar clientes y desplegar la nueva versión.

### 5.5 Permisos de tablas y pruebas de políticas

- Aplicar RLS y grants coherentes en toda tabla nueva; las tablas de ruta/visita no deben quedar visibles por privilegios por defecto.
- En tablas personales, evitar acceso de fila completa a Bibliomóvil. Si la app necesita una búsqueda, usar una RPC que reduzca campos y alcance.
- Comprobar políticas según rol, comando, `USING`, `WITH CHECK`, `TO`, permisos de tabla y `EXECUTE`. El verificador actual no compara las expresiones de política.
- Agregar una función de verificación o pruebas que prueben rechazo de forma directa con identidades separadas, incluyendo un usuario autenticado sin perfil.

### 5.6 Regla de migraciones y despliegue

- El repositorio llega a la migración local 028, pero **no se verificó cuál es la última migración aplicada en producción**. No se debe asumir que 029 (u otro número) está libre hasta revisar el historial real.
- `MIGRACIONES.md`/los verificadores describen `010_consolidacion.sql` como fuente central de funciones RPC; al mismo tiempo, la instrucción del usuario es no editar migraciones ya aplicadas. Antes de implementar se debe resolver explícitamente esa convivencia: si una migración que habría que cambiar ya está aplicada, preservar el archivo y crear una migración nueva compatible, actualizando las reglas/verificadores del repositorio para mantener una única definición vigente.
- No editar migraciones aplicadas, no borrar columnas ni datos históricos y no ejecutar SQL remoto en esta fase. El plan de despliegue debe identificar cada migración nueva y el paso manual autorizado para aplicarla.
- Secuencia recomendada, después de la aprobación: comparar estado remoto en solo lectura → respaldar/ensayar → aplicar migración aditiva en proyecto de prueba → desplegar cliente compatible → comprobar matriz RLS/RPC → ventana de producción autorizada → validar con dos cuentas distintas y registrar resultado.

## 6. Flujo offline propuesto

La operación de escritura sin conexión debe seguir pendiente de aprobación hasta que identidad, idempotencia y resolución de conflictos estén implementadas.

1. **Inicio de sesión:** leer perfil, rol y asignaciones de ruta. Si no hay perfil activo, no sincronizar ni abrir vistas operativas.
2. **Preparación antes de salir:** descargar la visita asignada, catálogo/inventario necesario y solo los datos personales mínimos que se aprueben. Guardar fecha/hora de sincronización para señalar datos desactualizados.
3. **Registro local:** cada mutación lleva `operation_id`, UID propietario, visita/parada, tipo y estado. La interfaz la presenta como **pendiente**, nunca como confirmada. No guardar datos extra en la descripción de la cola.
4. **Reconexión:** enviar solo con la misma identidad propietaria. El servidor vuelve a validar permisos, visita, lector, disponibilidad y reglas en la transacción; la clave idempotente impide duplicados si la respuesta se pierde.
5. **Conflicto:** stock agotado, asignación revocada, visita cerrada o lector no habilitado quedan visibles como conflicto para resolución humana; no descartar ni repetir indefinidamente como si fuera un problema de red.
6. **Cambio de cuenta/logout:** detener los reintentos antes de cerrar sesión. No transferir la cola a otra cuenta ni borrarla sin decisión. Mantenerla aislada para la identidad original y permitir resolución segura; separar o limpiar la caché personal visible a la nueva sesión.
7. **Privacidad de dispositivo:** definir si los equipos son individuales o compartidos, bloqueo de pantalla y políticas de navegador/sistema. IndexedDB es almacenamiento local del origen, no una base cifrada por usuario.

**Alternativa de lanzamiento seguro:** si la clave idempotente o la comprobación de asignación no están listas, Bibliomóvil puede ofrecer consulta offline pero debe exigir conexión para confirmar préstamos/devoluciones. No etiquetar como «offline completo» un flujo que no pueda garantizar atribución y recuperación.

## 7. Pruebas requeridas antes de aceptar la implementación

| Nivel | Casos mínimos |
|---|---|
| Unitarias de rol/interfaz | Cada rol ve solo sus vistas; una ruta o parámetro URL no elude permisos; la vista de Bibliomóvil maneja visita sin asignar, caducada y sin conexión. |
| SQL/RLS con PostgreSQL | `admin`, `librero`, `bibliomovil` asignado, `bibliomovil` no asignado, usuario autenticado sin perfil y `anon`. Probar SELECT/INSERT/UPDATE/DELETE directos y llamadas a cada RPC. Verificar rechazos y que no se filtren lectores, teléfono/correo, préstamos globales ni funciones administrativas. |
| Integridad de circulación | Préstamo válido en parada asignada; parada ajena; visita cerrada; libro no móvil/no cargado; lector bloqueado, límite excedido y stock concurrente; devolución/renovación permitidas y rechazadas. |
| Idempotencia | Repetir una clave tras éxito devuelve el mismo préstamo; otra clave crea una operación distinta; simular timeout/corte después del commit y reintentar sin duplicar stock/préstamo. |
| Offline/privacidad | Dos cuentas en el mismo navegador; logout con cola pendiente; reingreso con otra cuenta; reinicio del navegador; reconexión; conflicto de stock; datos de una cuenta nunca aparecen ni se envían con otra. |
| Avisos | Solo visita/parada y rango autorizado; fecha real en el texto; préstamos fuera de rango excluidos; más de 500 resultados con paginación completa; contacto ausente o no autorizado; no abrir enlace externo sin acción de personal. |
| QR anónimo | Sin token, inválido, vencido y revocado no entregan datos; token válido solo revela los campos que se aprobaron; pruebas de alcance y revocación. |
| Migración/contrato | Aplicar todas las migraciones desde cero y desde una base compatible; volver a ejecutar solo lo declarado idempotente; llamadas RPC antiguas/nuevas sin firma ambigua; historial de préstamos antiguo intacto. |
| Regresión y experiencia | `npm test`, `npm run test:legacy`, `npm run test:legacy:contraste`, `npm run build`, `npm run verify:build`; accesibilidad de teclado/lectores de pantalla y pruebas manuales en móvil/tablet. |
| Ensayo remoto | Solo después de aprobación: proyecto Supabase de prueba, usuarios separados, RLS real, Auth/Edge/Realtime y CSP; luego verificación de producción en ventana autorizada. |

Las pruebas locales actuales pasan, pero todavía no cubren el rol Bibliomóvil ni el caso de respuesta perdida tras un commit. Esas brechas se agregan antes de liberar el rol.

## 8. Criterios de aceptación propuestos

- **AC-01 — Alta autorizada:** solo admin puede invitar/asignar `bibliomovil`; el usuario no puede autoprovisionarse como `librero` ni elevar su rol.
- **AC-02 — Denegación por defecto:** cuenta sin perfil, rol inválido o asignación revocada no lee datos ni opera RPC de personal.
- **AC-03 — Mínimo privilegio:** Bibliomóvil no lista lectores ni préstamos globales y no llama con éxito a administración, exportación, cambios de rol, eliminación o diagnóstico de admin, incluso invocando API directamente.
- **AC-04 — Asignación de visita:** la cuenta ve y opera solo visitas asignadas y abiertas; una visita ajena, cancelada o cerrada se rechaza en servidor.
- **AC-05 — Trazabilidad:** cada préstamo móvil confirmado conserva la relación exacta a visita/parada; no se atribuyen automáticamente registros históricos de texto libre.
- **AC-06 — Inventario coherente:** el modelo aprobado distingue catálogo, stock central y stock a bordo si así se requiere; dos operaciones concurrentes no dejan stock negativo ni exceden préstamos permitidos.
- **AC-07 — Offline seguro:** toda mutación tiene propietario y clave idempotente; reintentar tras éxito/timeout no crea efectos dobles ni la ejecuta con otra cuenta.
- **AC-08 — Aviso correcto:** el lector se selecciona por visita y rango; el mensaje usa fecha confirmada, no promete «mañana» por el mero nombre de una parada; los resultados no se truncan sin indicación.
- **AC-09 — Privacidad aprobada:** campos personales, consentimiento, uso de WhatsApp/correo y excepción QR concuerdan entre UI, servidor y política aprobada por responsables municipales.
- **AC-10 — Compatibilidad:** migraciones aditivas; datos antiguos preservados; cliente Mesón existente funciona durante la transición; sin firmas RPC ambiguas.
- **AC-11 — Calidad:** pruebas por roles/RLS/RPC, offline, regresión, compilación, contraste y accesibilidad pasan; hallazgos no cubiertos quedan documentados.
- **AC-12 — Despliegue comprobado:** historial y esquema reales contrastados antes de aplicar cambios; cada migración remota queda autorizada y registrada; una prueba posterior con cuentas separadas confirma los permisos reales.

## 9. Decisiones pendientes del usuario y responsables municipales

| Decisión | Recomendación inicial para aprobar/modificar |
|---|---|
| ¿`bibliomovil` será un rol independiente o una combinación de capacidades de `librero`? | Rol independiente de mínimo privilegio; cualquier doble función debe ser explícita y verificable en servidor. |
| ¿Se permite autenticación Google/autoregistro a personas no invitadas? | No conceder acceso operativo por iniciar sesión; solo cuentas con perfil creado/aprobado. Verificar el proveedor remoto antes de decidir el flujo de alta. |
| ¿Qué puede ver del lector el equipo móvil? | Por defecto, ninguna lista global ni correo/teléfono; resolver identificación y estado con una RPC acotada. Confirmar si hace falta mostrar nombre, RUT u otro dato y justificarlo. |
| ¿Puede el rol registrar lectores nuevos o funcionar con ese alta sin conexión? | Mantenerlo fuera del primer alcance salvo aprobación; exige consentimiento y validaciones del servidor/offline. |
| ¿Qué operaciones se permiten en ruta: préstamo, devolución, renovación, reserva, ajuste de stock? | Préstamo y devolución en visita asignada como mínimo a evaluar; aprobar cada operación por separado. Reservas/stock requieren reglas propias. |
| ¿Las rutas son plantillas recurrentes, salidas de un día o ambas? ¿Puede haber más de una persona por visita? | Separar plantilla de visita fechada y permitir varias asignaciones solo si la operación lo necesita. |
| ¿`es_bibliomovil` basta o hay que llevar unidades a bordo? | Si se controla disponibilidad real por vehículo, usar inventario/movimientos por visita; el flag por título no basta. |
| ¿Se permiten escrituras sin conexión? | No habilitar confirmación offline hasta probar idempotencia, propiedad de cola y resolución de conflictos. En una primera entrega, permitir consulta offline y escritura en línea. |
| ¿Se mantiene el acceso anónimo QR a nombre/RUT de quien tiene el libro? | Tratarlo como decisión separada; mantener solo si el propósito, alcance y comunicación al titular se aprueban y limitan. |
| ¿Qué préstamos reciben aviso desde una parada? | Solo préstamos de visita y ventana temporal explícitas; definir quién autoriza el contacto y qué texto/canal se usa. |
| ¿Cómo se tratarán `parada_nombre` y coordenadas históricas? | Preservarlas como historial sin inferir fecha/visita. No borrar ni asignar retroactivamente. |
| ¿Cuál es la historia real de migraciones y la ventana de cambio? | Obtenerla en solo lectura con autorización antes de preparar migración; no asumir producción al día con 028 ni ejecutar instrucciones del resumen histórico. |
| ¿Quién aprueba consentimiento y política de privacidad? | Dirección/asesoría jurídica municipal antes de desplegar nuevas finalidades o datos visibles. |

## 10. Secuencia de Fase 3 sugerida (no iniciada)

1. **Aprobación de alcance:** resolver las decisiones de la sección 9 y confirmar los criterios de aceptación.
2. **Inventario autorizado:** revisar migraciones/roles/configuración remota en solo lectura; acordar la estrategia de migración sin modificar archivos ya aplicados.
3. **Autorización:** corregir primero provisión de cuentas, funciones de rol y matriz SQL; agregar pruebas negativas.
4. **Modelo operativo:** definir rutas, visitas, paradas, asignación e inventario; introducir relaciones compatibles y RPC específicas.
5. **Cliente y offline:** limitar las vistas, persistir el contexto de visita, aislar cache/cola y añadir idempotencia; mantener modo online-only para escrituras si algún control falta.
6. **Avisos y privacidad:** corregir filtrado/fechas, texto y datos expuestos; revisión jurídica y documental.
7. **Ensayo y aceptación:** ejecutar pruebas completas localmente y en proyecto de prueba; desplegar producción únicamente con aprobación expresa, migraciones identificadas y verificación posterior.

**Cierre:** el plan queda listo para revisión. La siguiente acción es recibir aprobación y respuestas a las decisiones pendientes. Hasta entonces no se implementa el rol, no se crean migraciones y no se consulta ni modifica Supabase remoto.
