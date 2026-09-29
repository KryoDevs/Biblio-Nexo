# Registro de actividades de tratamiento

**Sistema:** BiblioNexo — Gestión de préstamos bibliotecarios
**Responsable del tratamiento:** Ilustre Municipalidad de Futrono
**Última actualización:** julio de 2026

> **Este documento requiere revisión y firma de la Dirección Jurídica municipal
> antes de tener valor de cumplimiento.** Lo que sigue describe con exactitud lo
> que el sistema hace técnicamente, para que quien corresponda pueda validarlo.
> Los campos marcados como *(por definir)* deben completarse dentro del municipio.

La Ley 21.719 entra en plena vigencia el **1 de diciembre de 2026** y exige
mantener este registro documentado. La fiscalización de la Agencia de Protección
de Datos Personales se apoya en evidencia operativa, no en declaraciones.

---

## 1. Identificación

| Campo | Contenido |
|---|---|
| Responsable | Ilustre Municipalidad de Futrono, RUT *(por definir)* |
| Unidad a cargo | Biblioteca Pública Municipal N° 332 "Escritor Ramón Quichiyao Figueroa" |
| Delegado de Protección de Datos | *(por designar — obligatorio para organismos públicos)* |
| Encargado de Ciberseguridad (Ley 21.663) | *(por designar)* |
| Contacto para ejercer derechos | *(por definir: correo y dirección de atención presencial)* |

## 2. Finalidad del tratamiento

Administrar el préstamo de material bibliográfico: identificar a quién se
entrega cada ejemplar, controlar plazos de devolución y comunicar vencimientos.

**No se realizan** perfilamientos, decisiones automatizadas con efectos
jurídicos, cesiones a terceros ni tratamientos con fines comerciales.

## 3. Categorías de titulares

- Vecinos y vecinas inscritos como lectores de la biblioteca.
- Personas menores de 18 años, con autorización de su apoderado.
- Personal municipal con acceso al sistema.

## 4. Datos tratados

### Lectores

| Dato | Finalidad | ¿Obligatorio? |
|---|---|---|
| Nombre completo | Identificar a quién se entrega el ejemplar | Sí |
| RUT | Identificador único, evita duplicados y homónimos | Sí |
| Correo electrónico | Avisos de vencimiento | Sí |
| Teléfono | Avisos de vencimiento por WhatsApp | Sí |
| Fecha y versión del consentimiento | Acreditar la autorización | Sí |
| Condición de menor y datos del apoderado | Autorización del representante legal | Solo si es menor |
| Historial de préstamos | Control de devoluciones y estadísticas de gestión | Derivado |
| Estado de bloqueo y su motivo | Gestión de sanciones por no devolución | Derivado |

**No se tratan datos sensibles** en el sentido del artículo 2 letra g) de la
Ley 21.719: no se registra salud, origen étnico, afiliación política ni
sindical, creencias, vida sexual ni datos biométricos.

> **Punto que la Dirección Jurídica debe evaluar:** el historial de lecturas de
> una persona puede revelar convicciones ideológicas o religiosas. Aunque el
> sistema no clasifica esa información como sensible, conviene analizar si el
> historial acumulado merece un tratamiento más restringido, y por cuánto tiempo
> es realmente necesario conservarlo.

### Personal

Correo institucional, rol asignado y fecha de último acceso.

## 5. Base de licitud

Consentimiento del titular, recogido en el momento de la inscripción, con
información previa sobre finalidad, responsable y derechos. Para menores de 18
años, autorización del apoderado.

El sistema registra **fecha y versión del texto** consentido, de modo que sea
posible acreditar qué se informó exactamente a cada persona.

## 6. Destinatarios y encargados

| Destinatario | Rol | Ubicación |
|---|---|---|
| Supabase | Encargado del tratamiento (base de datos y autenticación) | *(verificar región del proyecto)* |
| Google | Solo si se habilita el ingreso con cuenta Google, para personal | Internacional |

**Acción pendiente:** la Ley 21.719 exige un contrato de encargo de tratamiento
con cada proveedor. Hay que suscribir el *Data Processing Agreement* de Supabase
y verificar en qué región está alojado el proyecto, porque de ello depende si
hay transferencia internacional de datos y qué garantías se requieren.

## 7. Plazo de conservación

Cinco años sin actividad, configurable en Administración → Cumplimiento
(parámetro `retencion_prestamos_anios`). Cumplido el plazo, los datos
identificables se eliminan y queda solo el registro estadístico.

*(Plazo por validar con la Dirección Jurídica, considerando las obligaciones de
conservación documental que pesan sobre el municipio.)*

## 8. Derechos del titular

| Derecho | Cómo se ejerce | Dónde está implementado |
|---|---|---|
| Acceso | Solicitud en el mesón | Administración → Cumplimiento → Entregar sus datos |
| Rectificación | Solicitud en el mesón | Usuarios → Editar |
| Cancelación | Solicitud en el mesón | Administración → Cumplimiento → Suprimir datos |
| Oposición | Solicitud escrita | Procedimiento manual *(por definir)* |
| Portabilidad | Solicitud en el mesón | La exportación entrega JSON estructurado |

La supresión **anonimiza** en lugar de borrar la fila: desaparecen nombre, RUT y
contacto, y permanece el hecho estadístico sin vínculo con ninguna persona. Así
conviven el derecho de supresión y el deber de conservar constancia de la
gestión municipal.

**Pendiente:** definir el procedimiento formal de recepción y respuesta de
solicitudes, con plazos. La ley fija plazos de respuesta que el municipio debe
poder cumplir y acreditar.

## 9. Medidas de seguridad

**Implementadas en el sistema:**

- Autenticación por cuenta individual; no hay cuentas compartidas.
- Control de acceso por rol, aplicado en la base de datos mediante RLS.
- Registro de auditoría automático por *triggers*: toda creación, modificación
  y eliminación queda con autor y fecha, incluso si se escribe directamente en
  la base de datos.
- Escape de HTML en todo dato mostrado en pantalla.
- Filtros de búsqueda saneados contra inyección.
- Cifrado en tránsito mediante HTTPS.
- Respaldo descargable bajo demanda.
- Herramienta de verificación de RLS en Administración → Cumplimiento.

**Pendientes de la organización, no del código:**

- Verificar que las políticas RLS estén efectivamente definidas. Sin ellas, el
  control de acceso por rol es solo apariencia.
- Definir la periodicidad de los respaldos y dónde se custodian.
- Procedimiento de notificación de brechas: la Ley 21.719 exige avisar a la
  Agencia y a los afectados, y la Ley 21.663 impone alerta temprana en 3 horas
  e informe inicial en 72 al CSIRT Nacional. Sin un procedimiento escrito y un
  responsable designado, esos plazos no se cumplen.
- Evaluación de impacto en privacidad, si la autoridad la estima exigible.
- Capacitación del personal de la biblioteca sobre el manejo de datos.

## 9 bis. Riesgo abierto: la copia local del equipo del mesón (Fase 1)

**Estado:** identificado el 30 de julio de 2026, al diseñar el trabajo sin
conexión. **No corregido.** La funcionalidad que lo produce todavía no existe;
esto se escribe para que no se construya sin resolverlo.

Para que la biblioteca pueda atender cuando se cae internet —que es lo habitual
en Futrono— el equipo del mesón necesita una copia local de parte del padrón de
lectores, guardada en el navegador (IndexedDB) del computador de la biblioteca.

Eso abre dos problemas que hay que resolver **dentro** de la Fase 1, no después:

**1. El derecho de supresión no llega a la copia local.**

Los lectores se borran de verdad: existe un botón Eliminar para el
administrador, y la política `lectores borrado admin` de la migración 008 lo
permite. La supresión anonimizadora descrita en la sección 8 convive con ese
borrado directo, no lo reemplaza.

Una sincronización basada en marcas temporales (migración 011) transmite altas y
modificaciones, pero **no puede transmitir un borrado**: la fila desapareció y
no queda nada que traiga la fecha. Si una persona ejerce su derecho de supresión
y el administrador borra su ficha, su nombre, RUT, correo y teléfono siguen en
el disco del equipo del mesón indefinidamente.

El municipio habría respondido la solicitud y seguiría tratando el dato.

*Corrección comprometida:* tabla de lápidas en el servidor que registre id y
hora de cada borrado, y purga en el almacén local que elimine a todo lector que
ya no esté en el servidor. Ambas cosas antes de que la copia local se use con
datos reales.

**2. Datos personales en un disco que no controla el sistema.**

La copia local queda sin cifrar en el perfil del navegador del equipo del mesón,
un computador de uso compartido en un edificio municipal. Decisiones tomadas
para acotarlo, que deben respetarse al implementar:

- El service worker **no** cachea ninguna respuesta de Supabase. Los datos
  personales van solo al almacén local, donde se controla qué entra y por
  cuánto tiempo.
- **No se replica el padrón completo.** Solo los lectores con préstamo activo y
  los consultados recientemente, con purga automática por antigüedad.
- El catálogo de libros sí se replica entero: no contiene datos personales.

*Pendiente de la organización:* cifrado de disco en el equipo del mesón y
bloqueo de sesión del sistema operativo. Sin eso, cualquiera con acceso físico
al computador de la biblioteca alcanza la copia local.

## 10. Incidentes

La herramienta Administración → Cumplimiento → Evidencia para reporte extrae la
actividad de un rango de fechas en formato adjuntable a un reporte oficial.

El **procedimiento** de escalamiento, los responsables y los canales de
notificación deben documentarse aparte. La herramienta entrega la evidencia; no
reemplaza el protocolo.

---

## Historial de versiones del consentimiento

| Versión | Vigencia | Texto |
|---|---|---|
| `2026-07-v1` | Desde julio de 2026 | Ver `UIManager.CONSENTIMIENTO` en `js/modules/ui.js` |

Al modificar el texto hay que **subir el número de versión**, para que quede
registro de qué se informó a cada titular en cada momento.

---

## Corrección de exposición de datos personales (versión 14)

**Fecha de detección:** 27 de julio de 2026, en auditoría interna.
**Estado:** corregido y con prueba automática permanente.

### Qué se encontró

Dos funciones de consulta eran alcanzables **sin iniciar sesión**, usando la
llave anónima de Supabase:

| Función | Datos que devolvía |
|---|---|
| `estado_lector(rut)` | nombre, RUT, correo, teléfono, préstamos activos, morosidad, estado de bloqueo |
| `consultar_libro(codigo)` | los mismos datos, de quien tuviera el libro prestado |

La llave anónima es pública por diseño: va escrita en `config.js`, que se sirve
al navegador y se lee con F12.

### Por qué era grave

Los RUT chilenos son enumerables: ocho dígitos más verificador. Cualquiera podía
recorrerlos y construir la lista completa de personas inscritas en la biblioteca,
con su contacto y su historial de morosidad. Eso es un tratamiento no autorizado
de datos personales en el sentido de la Ley 21.719, y los datos de morosidad
tienen carácter especialmente sensible en cuanto permiten inferir conducta.

No hay evidencia de que se haya explotado. El sistema aún no está en producción
con datos reales de vecinos, lo que sitúa el hallazgo antes de que existiera
riesgo efectivo para titulares.

### Causa

Ambas funciones se declararon `SECURITY DEFINER` en la migración 007. Esa
cláusula hace que la función corra con los permisos de su dueño y **esquive las
políticas RLS**. Es necesario para operar, pero convierte a la función en la
única barrera, y a ninguna de las dos se le puso comprobación interna.

Contribuyó un segundo factor: PostgreSQL otorga `EXECUTE` a `PUBLIC` en cada
función nueva. Las migraciones hacían `grant execute ... to authenticated`, lo
que aparentaba restringir, pero no quitaba el permiso implícito que heredaba el
rol anónimo.

### Corrección aplicada

1. Comprobación interna de acceso en `estado_lector`, `consultar_libro`,
   `parametro_int` y las tres funciones de autodiagnóstico.
2. Revocación explícita de `EXECUTE` a `PUBLIC` y a `anon` sobre las 33
   funciones del manifiesto, con reotorgamiento solo a `authenticated`.

### Prevención

Tres comprobaciones automáticas que corren en cada envío al repositorio:

- `pruebas/verificar_consolidacion.py` exige que toda función `SECURITY DEFINER`
  tenga comprobación interna. Las excepciones deben declararse por escrito con su
  motivo.
- `pruebas/probar_librero.py`, bloque 11: intenta 24 accesos con el rol anónimo
  y falla si alguno devuelve datos.
- El flujo de CI repite el intento sobre una base reconstruida desde cero.
\n## 5. Tareas Pendientes: Hardware y Normativa Local\n\nDe cara al pleno cumplimiento de la **Ley 21.719 (diciembre de 2026)**, el equipo de TI y el departamento legal de la Municipalidad deben cumplir con las siguientes directrices locales en el equipo físico (PC del mesón):\n\n1. **Cifrado de Disco (BitLocker)**: El disco duro del computador que corre Biblio-Nexo en el mostrador debe estar cifrado de fábrica o mediante BitLocker. Esto evita extracciones de información si el equipo es robado.\n2. **Nombramiento del DPO (Delegado de Protección de Datos)**: La Municipalidad debe asignar formalmente un DPO ante la nueva Agencia de Protección de Datos Personales, quien será responsable de canalizar cualquier petición ARCO y de mantener este documento actualizado.\n