#!/usr/bin/env node
/**
 * Convierte un `respaldo-*.json` del bucket `respaldos` en un SQL de restauración.
 *
 * ## Por qué existe
 * El plan Free de Supabase no trae respaldos administrados (ni PITR): la única
 * copia del catálogo son los JSON que `respaldo-automatico` sube cada noche. Este
 * proyecto tenía 62 de esos archivos en el bucket y `SUPABASE-PASO-A-PASO.md`
 * tenía la casilla «Existe un respaldo y alguien probó restaurarlo» sin marcar
 * desde hace meses. No está sin marcar por descuido: restaurar un JSON de diez
 * tablas a mano, con las claves foráneas en orden, con apóstrofes en los títulos
 * y con `id` de identidad, es la clase de cosa que se hace mal a las tres de la
 * mañana — y un respaldo que nunca se restauró es una esperanza, no un respaldo.
 *
 * Este script hace la parte mecánica y deja que una persona haga el simulacro
 * (veinte minutos contra un proyecto de pruebas vacío): `pruebas/probar-restauracion.py`
 * lo prueba de punta a punta contra un PostgreSQL real, y
 * `docs/despliegue/032-operar-sin-costo.md` cuenta cómo correr el simulacro.
 *
 * ## Por qué emite plpgsql y no INSERTs con literales
 * Porque un `insert ... values ('titulo con ''comillas''', ...)` generado a mano
 * es una promesa frágil: un `timestamptz`, un `uuid`, un `numeric` o un jsonb mal
 * escapado se descubren en el peor momento. El bloque `do $$ … $$` que escribe
 * este archivo mete el JSON tal cual, y deja que Postgres haga el trabajo que
 * Postgres hace mejor:
 *
 *   · `jsonb_populate_record(null::public.libros, j)` — el tipado de cada
 *     columna lo decide el propio esquema de destino, no una regla de escape;
 *   · lee `pg_attribute` para saber si la tabla usa
 *     `generated always as identity` y, solo entonces, añade
 *     `overriding system value` (sin eso, la restauración falla con «cannot
 *     insert a non-DEFAULT value into column "id"» — exactamente el error que
 *     hace inservible un respaldo; ver `pruebas/00_base_supabase.sql`);
 *   · `setval` de cada secuencia al final: restaurar ids explícitos y no
 *     corregir la secuencia deja el siguiente `insert` de la app chocando contra
 *     una clave primaria duplicada, que es el bug clásico de toda restauración.
 *
 * ## Qué NO hace
 * No abre conexión a ninguna base de datos, no borra nada, no decide el momento.
 * No puede romper nada: solo lee un archivo y escribe otro.
 *
 * ## Uso
 *   node pruebas/restaurar-respaldo.mjs respaldo-2026-10-29T04-00-00-000Z.json
 *   node pruebas/restaurar-respaldo.mjs respaldo.json -- salida.sql
 *   node pruebas/restaurar-respaldo.mjs --generar-muestra
 */

import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Orden de inserción: los padres antes que los hijos. `prestamos` mira a
 * `libros`, `lectores` y `usuarios`; `reservas` mira a `libros` y `lectores`;
 * `elementos_eliminados` puede mirar a varias. Las bitácoras (`auditoria`,
 * `errores`) no reciben claves foráneas de nadie, así que van al final.
 */
export const ORDEN_INSERCION = [
  'parametros',
  'usuarios',
  'libros',
  'lectores',
  'prestamos',
  'reservas',
  'enlaces_escaneo_remoto',
  'elementos_eliminados',
  'auditoria',
  'errores'
];

/** Las diez tablas que `respaldo-automatico` jura respaldar (TABLAS_A_RESPALDAR). */
export const ESPERADAS = ORDEN_INSERCION;

/**
 * Arma el SQL. Separado del `main` para que `probar-restauracion.py` lo pueda
 * generar sobre un JSON fabricado y ejecutarlo contra Postgres de verdad.
 */
export function construirSQL({ datos, origen = 'respaldo.json' }) {
  const tablas = datos?.tablas;
  if (!tablas) {
    throw new Error('el JSON no tiene la clave `tablas`: no es un respaldo de `respaldo-automatico` (que escribe {generado_en, tablas:{…}})');
  }
  const nombres = Object.keys(tablas);
  const faltantes = ESPERADAS.filter(t => !nombres.includes(t));
  const avisos = [];
  const identificador = /^[a-z_][a-z0-9_]*$/;
  const sospechosos = nombres.filter(t => !identificador.test(t));
  if (sospechosos.length) avisos.push(`se ignoran claves que no son nombres de tabla válidos: ${sospechosos.join(', ')}`);
  const extras = nombres.filter(t => !ESPERADAS.includes(t) && identificador.test(t));
  if (faltantes.length) {
    throw new Error(`el respaldo no trae ${faltantes.join(', ')}: está incompleto. Antes de seguir, ver en public.respaldos_log si la corrida de esa noche falló.`);
  }

  const conteos = {};
  for (const t of nombres) {
    const filas = tablas[t];
    if (!Array.isArray(filas)) throw new Error(`${t} no es un arreglo de filas`);
    if (filas.length > 0 && !filas.every(f => f && typeof f === 'object' && !Array.isArray(f))) {
      throw new Error(`${t}: hay filas que no son objetos`);
    }
    conteos[t] = filas.length;
    if (filas.length > 0 && Object.keys(filas[0]).length === 0) {
      avisos.push(`${t}: las filas no traen ninguna columna (¿respaldo truncado?)`);
    }
  }
  const orden = [...ESPERADAS, ...extras].filter(t => nombres.includes(t) && identificador.test(t));
  const total = orden.reduce((n, t) => n + conteos[t], 0);

  // El payload va dollar-quoted, sin escapar: el JSON entra literal. Si por lo
  // que fuera el contenido contuviera el delimitador, se busca uno libre —que un
  // título de libro incluya `$biblionexo_datos$` es imposible, pero la alternativa
  // a comprobarlo es corromper el respaldo en silencio.
  let etiqueta = 'biblionexo_datos';
  const payload = JSON.stringify(tablas);
  while (payload.includes(`$${etiqueta}$`)) etiqueta = `biblionexo_datos_${Math.random().toString(36).slice(2, 8)}`;

  const sql = [];
  sql.push(`-- Restauración generada por pruebas/restaurar-respaldo.mjs`);
  sql.push(`-- Origen:            ${origen}`);
  sql.push(`-- Respaldado el:     ${datos.generado_en ?? 'sin fecha en el archivo'}`);
  sql.push(`-- Contenido:         ${total} fila(s) en ${orden.length} tablas (${orden.map(t => `${t}:${conteos[t]}`).join(', ')})`);
  sql.push(`--`);
  sql.push(`-- Correr SOLO contra una base vacía, con las migraciones de`);
  sql.push(`-- supabase/migrations ya aplicadas. Todo va dentro de una transacción:`);
  sql.push(`-- si una fila falla, no queda una restauración a medias.`);
  sql.push(`--`);
  sql.push(`--   psql "$CADENA_DE_CONEXION" -v ON_ERROR_STOP=1 -f restauracion.sql`);
  sql.push(`--`);
  if (avisos.length) sql.push(`-- AVISOS del generador:`), avisos.forEach(a => sql.push(`--   · ${a}`));
  if (extras.length) sql.push(`-- Notas: este respaldo trae tablas que el respaldo estándar no lista: ${extras.join(', ')}; se intentará insertarlas igual, al final.`);
  sql.push(`begin;`);
  sql.push(`do $biblionexo_restauracion$`);
  sql.push(`declare`);
  sql.push(`  v_tablas jsonb := $${etiqueta}$${payload}$${etiqueta}$::jsonb;`);
  sql.push(`  v_orden text[] := array[${orden.map(t => `'${t}'`).join(', ')}];`);
  sql.push(`  v_tabla text;`);
  sql.push(`  v_filas jsonb;`);
  sql.push(`  v_destino text[];`);
  sql.push(`  v_origen text[];`);
  sql.push(`  v_faltan text[];`);
  sql.push(`  v_sobran text[];`);
  sql.push(`  v_identidad boolean;`);
  sql.push(`  v_filas_insertadas bigint;
  v_columna text;`);
  sql.push(`  v_total bigint := 0;`);
  sql.push(`begin`);
  // `foreach ... in array` — el `in` no es opcional (probado: sin él es
  // «syntax error at or near "array"», y pasa en el primer intento).
  sql.push(`  -- Desactivar los disparadores de USUARIO de las tablas que se llenan, y`);
  sql.push(`  -- volver a activarlos al final. No es un detalle de rendimiento: el`);
  sql.push(`  -- disparador de auditoría escribe en public.auditoria —la misma tabla que`);
  sql.push(`  -- se está restaurando— con la secuencia recién reiniciada, así que cada fila`);
  sql.push(`  -- restaurada dispara un insert cuya clave choca con la restaurada. Probado:`);
  sql.push(`  -- «duplicate key value violates unique constraint \"auditoria_pkey\"». Con los`);
  sql.push(`  -- disparadores de usuario fuera, la restauración además no deja rastro propio,`);
  sql.push(`  -- que es lo correcto: restaurar no es una operación de una persona del mesón.`);
  sql.push(`  -- «disable trigger user» deja intactas las restricciones de clave foránea (son`);
  sql.push(`  -- disparadores internos), así que el orden de inserción sigue importando.`);
  sql.push(`  foreach v_tabla in array v_orden loop`);
  sql.push(`    execute format('alter table public.%I disable trigger user', v_tabla);`);
  sql.push(`    if not exists (select 1 from information_schema.tables`);
  sql.push(`                     where table_schema = 'public' and table_name = v_tabla) then`);
  sql.push(`      -- Si la base de destino no tiene la tabla, algo está mal: o no se`);
  sql.push(`      -- aplicaron las migraciones, o se apunta a otro proyecto. Seguir sin`);
  sql.push(`      -- esa tabla daría un catálogo incompleto que parece restaurado.`);
  sql.push(`      raise exception 'la base de destino no tiene public.%: aplicar primero las migraciones de supabase/migrations', v_tabla;`);
  sql.push(`    end if;`);
  sql.push(``);
  sql.push(`    v_filas := coalesce(v_tablas -> v_tabla, '[]'::jsonb);`);
  sql.push(`    if jsonb_array_length(v_filas) = 0 then`);
  sql.push(`      raise notice '  · %: 0 fila(s)', v_tabla;`);
  sql.push(`      continue;`);
  sql.push(`    end if;`);
  sql.push(``);
  sql.push(`    select coalesce(array_agg(a.attname order by a.attnum), '{}') into v_destino`);
  sql.push(`      from pg_attribute a`);
  sql.push(`      join pg_class c on c.oid = a.attrelid`);
  sql.push(`      join pg_namespace n on n.oid = c.relnamespace`);
  sql.push(`     where n.nspname = 'public' and c.relname = v_tabla`);
  sql.push(`       and a.attnum > 0 and not a.attisdropped;`);
  sql.push(``);
  sql.push(`    select coalesce(array_agg(k), '{}') into v_origen`);
  sql.push(`      from (select distinct jsonb_object_keys(f) k`);
  sql.push(`            from jsonb_array_elements(v_filas) f) s;`);
  sql.push(``);
  sql.push(`    -- Columnas del destino que el respaldo no conoce: se restauran solas`);
  sql.push(`    -- si son anulables o tienen valor por defecto, y si son «not null» sin`);
  sql.push(`    -- default hay que decirlo antes de intentar nada — el error de Postgres`);
  sql.push(`    -- aquí sería un «null value in column … violates not-null» sin contexto.`);
  sql.push(`    select coalesce(array_agg(x), '{}') into v_faltan`);
  sql.push(`      from (select c.column_name x`);
  sql.push(`            from information_schema.columns c`);
  sql.push(`           where c.table_schema = 'public' and c.table_name = v_tabla`);
  sql.push(`             and c.is_nullable = 'NO' and c.column_default is null`);
  sql.push(`             and c.column_name <> all (v_origen)) q;`);
  sql.push(`    if array_length(v_faltan, 1) > 0 then`);
  sql.push(`      raise exception 'public.%: el respaldo no trae % y la(s) columna(s) no admiten nulo — este respaldo es de un esquema anterior', v_tabla, array_to_string(v_faltan, ', ');`);
  sql.push(`    end if;`);
  sql.push(``);
  sql.push(`    select coalesce(array_agg(x), '{}') into v_sobran`);
  sql.push(`      from (select unnest(v_origen) x except select unnest(v_destino)) q;`);
  sql.push(`    if array_length(v_sobran, 1) > 0 then`);
  sql.push(`      raise notice '  ! %: se descartan % columna(s) que ya no existen en el destino: %',`);
  sql.push(`        v_tabla, array_length(v_sobran, 1), array_to_string(v_sobran, ', ');`);
  sql.push(`    end if;`);
  sql.push(``);
  sql.push(`    select bool_or(a.attidentity <> '') into v_identidad`);
  sql.push(`      from pg_attribute a`);
  sql.push(`      join pg_class c on c.oid = a.attrelid`);
  sql.push(`      join pg_namespace n on n.oid = c.relnamespace`);
  sql.push(`     where n.nspname = 'public' and c.relname = v_tabla`);
  sql.push(`       and a.attnum > 0 and not a.attisdropped;`);
  sql.push(``);
  sql.push(`    -- jsonb_populate_record ignora las claves que el destino no tiene y`);
  sql.push(`    -- deja nulo lo que falta; «overriding system value» solo hace falta (y`);
  sql.push(`    -- solo es válido legalmente) cuando hay columnas de identidad.`);
  sql.push(`    execute format(`);
  sql.push(`      'insert into public.%I %s'||`);
  sql.push(`      ' select (x).* from (select jsonb_populate_record(null::public.%I, j) x from jsonb_array_elements($1) j) r',`);
  sql.push(`      v_tabla,`);
  sql.push(`      case when v_identidad then 'overriding system value' else '' end,`);
  sql.push(`      v_tabla)`);
  sql.push(`      using v_filas;`);
  sql.push(`    get diagnostics v_filas_insertadas = row_count;`);
  sql.push(`    v_total := v_total + v_filas_insertadas;`);
  sql.push(``);
  sql.push(`    -- Secuencias: se restauran ids explícitos, así que hay que decirle a la`);
  sql.push(`    -- secuencia que siga después del máximo. Sin esto la app revienta contra`);
  sql.push(`    -- la clave primaria la primera vez que alguien alta un libro.`);
  sql.push(`    for v_columna in`);
  sql.push(`      select a.attname`);
  sql.push(`        from pg_attribute a`);
  sql.push(`        join pg_class c on c.oid = a.attrelid`);
  sql.push(`        join pg_namespace n on n.oid = c.relnamespace`);
  sql.push(`       where n.nspname = 'public' and c.relname = v_tabla`);
  sql.push(`         and a.attnum > 0 and not a.attisdropped`);
  sql.push(`         and (a.attidentity <> '' or pg_get_serial_sequence('public.'||c.relname, a.attname) is not null)`);
  sql.push(`    loop`);
  sql.push(`      execute format(`);
  sql.push(`        'select setval(pg_get_serial_sequence(''public.%I'', ''%I''), (select max("%I") from public.%I))',`);
  sql.push(`        v_tabla, v_columna, v_columna, v_tabla);`);
  sql.push(`    end loop;`);
  sql.push(``);
  sql.push(`    raise notice '  · %: % fila(s)', v_tabla, v_filas_insertadas;`);
  sql.push(`  end loop;`);
  sql.push(`  foreach v_tabla in array v_orden loop`);
  sql.push(`    execute format('alter table public.%I enable trigger user', v_tabla);`);
  sql.push(`  end loop;`);
  sql.push(`  raise notice 'restauración aplicada: % fila(s) en % tabla(s), disparadores de usuario reactivados', v_total, array_length(v_orden, 1);`);
  sql.push(`end`);
  sql.push(`$biblionexo_restauracion$;`);
  sql.push(`commit;`);
  sql.push(``);
  sql.push(`-- Comprobación a ojo, después de commitear (los conteos son los del respaldo):`);
  for (const t of orden) {
    sql.push(`--   select '${t}' as tabla, count(*) as filas, ${conteos[t]} as esperado from public.${t};`);
  }
  sql.push(``);
  sql.push(`-- Y la prueba de que las secuencias quedaron bien: alta algo nuevo por la`);
  sql.push(`-- app (o un insert sin id explícito) y comprueba que no choca con una clave`);
  sql.push(`-- primaria existente. Eso es lo que «setval» de arriba protege.`);
  return sql.join('\n') + '\n';
}

async function main() {
  const argv = process.argv.slice(2);
  if (argv.includes('--generar-muestra')) {
    const muestra = {
      generado_en: new Date().toISOString(),
      tablas: Object.fromEntries(ESPERADAS.map(t => [t,
        t === 'libros' ? [{ id: 1, isbn: null, titulo: "El 'ajustador' de libros", autor: 'Nadie', stock: 2 }]
          : t === 'usuarios' ? [{ id: '00000000-0000-0000-0000-000000000001', email: 'a@b.cl', rol: 'admin' }]
            : []]))
    };
    const destino = resolve(RAIZ, 'pruebas', 'muestra-respaldo.json');
    await writeFile(destino, JSON.stringify(muestra, null, 2));
    console.log(`muestra escrita en ${destino}`);
    return 0;
  }

  const origen = argv[0];
  if (!origen) {
    console.error('falta el archivo: node pruebas/restaurar-respaldo.mjs respaldo-….json [-- salida.sql]');
    return 2;
  }
  const destino = argv[1] === '--' ? argv[2] : resolve('restauracion.sql');
  const datos = JSON.parse(await readFile(resolve(origen), 'utf8'));
  const sql = construirSQL({ datos, origen });
  await writeFile(destino, sql);
  const conteo = Object.entries(datos.tablas || {}).map(([t, f]) => `${t}:${(f || []).length}`).join(' ');
  console.log(`\nSQL escrito en ${destino} (${(sql.length / 1024).toFixed(1)} KB) — ${conteo}`);
  console.log(`Nada se ejecutó: este script no abre conexión a ninguna base de datos.`);
  console.log(`Correr contra una base vacía:  psql "$CADENA" -v ON_ERROR_STOP=1 -f ${destino}`);
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  try {
    process.exit(await main());
  } catch (e) {
    console.error(`\n✗ ${e.message}`);
    process.exit(1);
  }
}
