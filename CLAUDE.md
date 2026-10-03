# BiblioNexo — Instrucciones para Claude Code

Sistema Municipal de Gestión Bibliotecaria de Futrono, Chile.

**Lee `PROMPT-produccion.md` completo antes de tocar nada.** Este archivo es solo
el resumen que evita los errores más caros.

---

## Idioma

Todo en español: código, comentarios, mensajes de commit y mensajes al usuario
final. Las personas que operan el sistema no son técnicas y no hablan inglés.

---

## Stack (no asumas otro)

- HTML5 SPA, JavaScript vanilla con ES Modules empaquetados con **Vite** + **Tailwind CSS v4 (PostCSS)** + **Workbox PWA** (`vite-plugin-pwa`).
- Código fuente en `src/js/` (`main.js`, `config.js`, `modules/`, `modules/db/`, `vistas/`) y estilos en `src/assets/css/styles.css`.
- Recursos estáticos autohospedados en `public/vendor/` (tipografías `.woff2`, FontAwesome, iconos). **No hay CDN de scripts ni fuentes.**
- Backend: Supabase (Postgres 16 + Auth + RLS + Edge Functions). **No hay Firebase.**
- Despliegue: Vercel (`vercel.json` genera `dist/` con `npm run build`).

---

## Cinco errores que rompen el sistema

### 1. No pongas `SECURITY INVOKER` en las funciones de circulación

`prestar_libro`, `devolver_prestamo`, `renovar_prestamo`, `ajustar_copias` y
`corregir_inventario` son **`SECURITY DEFINER`** con control de acceso interno.

Con `SECURITY INVOKER`, las políticas RLS bloquean la escritura y el rol librero
no puede prestar ni devolver. El `UPDATE` afecta cero filas **sin lanzar error**:
la pantalla dice «Devolución registrada» y la base de datos no cambia.

Ocurrió de verdad. Ver `MIGRACIONES.md`.

### 2. Toda función `SECURITY DEFINER` necesita control de acceso interno

`SECURITY DEFINER` esquiva RLS, así que la función queda como única barrera. Y la
llave `anon` de Supabase es pública: va en `js/config.js`, servido al navegador.

Sin `if not public.es_personal() then raise exception ...`, cualquiera puede
llamar la función sin sesión. Pasó con `estado_lector`: se podían enumerar RUT y
recolectar nombre, correo y teléfono de cada lector.

`pruebas/verificar_consolidacion.py` falla si aparece una sin guarda.

### 3. Las funciones SQL se editan en `010_consolidacion.sql`

Nunca agregues otro archivo que redefina una función existente. Antes había 51
definiciones para 33 funciones repartidas en nueve archivos, y ahí se escondió el
error del punto 1.

Para **esquema** (tablas, columnas, índices) sí se agrega `011_...`, `012_...`

### 4. Sin manejadores en atributos HTML

La CSP es `script-src 'self'` **sin `unsafe-inline`**. Nada de `onclick=`,
`onerror=`, `onload=`. Todo con `addEventListener`. Hay una prueba que lo verifica.

### 5. Sin monitoreo de terceros

No integres Sentry ni equivalentes. Un informe de error arrastra datos personales
de vecinos, y enviarlos a otra empresa es una transferencia que habría que
declarar bajo la Ley 21.719. Ya existe una bitácora propia: migración 009,
`js/modules/errores.js`, panel en Administración → Diagnóstico.

---

## Ejecuta las pruebas antes y después de cada cambio

    npm test                                     → 23 pruebas unitarias (Vitest)
    npm run test:legacy                          → consolidación, RPC, Tailwind, interfaz, vistas, offline
    npm run test:legacy:contraste                → 13 pares de contraste WCAG 2.1 AA
    npm run build && npm run verify:build        → empaquetado Vite + verificación de manifest/recursos
    python3 pruebas/verificar_consolidacion.py   → regla de la consolidación (58 funciones)
    python3 pruebas/verificar_llamadas_rpc.py    → correspondencia entre llamadas JS y firmas SQL
    python3 pruebas/probar-migraciones.py        → 212 comprobaciones sobre PostgreSQL real
    python3 pruebas/probar_librero.py            → 130 comprobaciones de circulación y RLS en PostgreSQL real

Las dos últimas necesitan `pip install pgserver "psycopg[binary]"` la primera vez.

Si una prueba falla por un cambio tuyo, arréglalo. Si crees que la prueba está
mal, dilo y espera confirmación: **no la modifiques para que pase.**

---

## Sistema de diseño

Identidad "Patrimonio de Futrono". Ya está en `src/assets/css/styles.css`. Respétalo, no lo
"mejores". Valores exactos:

    patrimonio-base    = #F7F4EB
    patrimonio-card    = #FFFFFF
    patrimonio-madera  = #7A431D    (hover: #633414)
    patrimonio-lago    = #1B3B48
    patrimonio-bosque  = #2C4A3E

- Serif Newsreader para títulos y cifras; sans Plus Jakarta Sans para el resto
- Grises: familia **stone**. Nunca `gray` ni `slate`.
- Prohibido: sombras grandes, gradientes, bordes 100% cuadrados

---

## Forma de trabajar

1. **Un commit por tarea**, mensaje descriptivo en español.
2. **Al terminar cada fase, detente y reporta.** No encadenes fases.
3. **Bug fuera del alcance actual: documéntalo, no lo arregles.**
4. **No inventes el contenido de archivos que no hayas leído.**
5. **Nunca escribas credenciales en el repositorio.** La llave `anon` de
   `js/config.js` sí va: es pública por diseño.

---

## Contexto que cambia las decisiones

- **Conectividad inestable.** Zona rural del sur de Chile. Que el sistema
  funcione sin internet es el trabajo más valioso que queda.
- **Una o dos personas no técnicas** operan el sistema. Ningún mensaje de error
  puede tener jerga.
- **Datos personales de vecinos, incluidos menores.** Ley 21.719 rige desde el
  1 de diciembre de 2026.
- **La biblioteca ya usa Aleph 500**, el catálogo del Sistema Nacional de
  Bibliotecas Públicas. BiblioNexo **no lo reemplaza: lo complementa.** Aleph es
  la fuente autoritativa; BiblioNexo consume, no manda.

---

## Documentos que debes leer

- `PROMPT-produccion.md` — plan de trabajo por fases
- `MIGRACIONES.md` — cómo se aplican las migraciones y por qué
- `CUMPLIMIENTO-LEGAL.md` — obligaciones legales e incidentes registrados
- `pruebas/LEEME.md` — qué cubre cada suite
