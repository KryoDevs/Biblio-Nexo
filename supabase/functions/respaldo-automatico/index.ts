// Edge Function: respaldo-automatico
//
// Reemplaza el "botón de respaldo de Supabase" que hasta ahora había que
// apretar a mano (ver pendientes-checklist.md). La dispara pg_cron todos los
// días (migración 018_respaldo_automatico.sql, tarea
// "respaldo-automatico-diario"), pero también puede invocarse manualmente
// para probarla — en ambos casos exige el secreto compartido en el header
// `x-cron-secret`.
//
// Qué hace:
//   1. Verifica el secreto (guardado en Vault, NUNCA la service_role key)
//      contra el que mandó quien llama.
//   2. Lee el contenido completo de las tablas del negocio, PAGINANDO: sin
//      `.range()`, PostgREST corta la respuesta en su máximo de filas (1000
//      por omisión) SIN avisar — el mismo truncamiento silencioso que el
//      front-end ya corrigió en traerTodasLasFilas() (db/compartido.js) y
//      que aquí habría dejado respaldos incompletos marcados como "ok" en
//      cuanto libros/lectores/prestamos superaran las 1000 filas.
//   3. Sube un JSON con fecha en el nombre al bucket de Storage "respaldos".
//   4. Borra los respaldos con más de DIAS_RETENCION días (antes se
//      acumulaban para siempre: un archivo diario, sin límite, en un
//      bucket con datos personales de lectores — más copias y más antiguas
//      de las que la Ley 21.719 justifica conservar).
//   5. Registra el resultado (éxito o falla) en public.respaldos_log — la
//      única escritora de esa tabla, porque usa la service_role key que el
//      runtime de Edge Functions inyecta solo, nunca a mano ni de un secreto
//      pedido a quien use la app.
//
// La service_role key sale EXCLUSIVAMENTE de Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),
// la variable que Supabase inyecta automáticamente en el runtime — nunca se
// pide, nunca se hardcodea, nunca se expone al cliente.

import { createClient } from "jsr:@supabase/supabase-js@2";

const TABLAS_A_RESPALDAR = [
  "usuarios",
  "libros",
  "lectores",
  "prestamos",
  "reservas",
  "parametros",
  "auditoria",
  "errores",
  "enlaces_escaneo_remoto",
  "elementos_eliminados",
];

// Filas por página al leer cada tabla (el tope por consulta de PostgREST).
const FILAS_POR_PAGINA = 1000;

// Columna(s) de orden estable para paginar sin repetir ni saltar filas: sin
// un ORDER BY, Postgres no garantiza el mismo orden entre una página y la
// siguiente si la tabla cambia mientras tanto. Casi todas las tablas tienen
// `id`; las excepciones son `parametros` (PK `clave`) y
// `elementos_eliminados` (PK compuesta `tabla` + `id`).
const ORDEN_POR_TABLA: Record<string, string[]> = {
  parametros: ["clave"],
  elementos_eliminados: ["tabla", "id"],
};

// Respaldos más antiguos que esto se borran del bucket en cada corrida.
const DIAS_RETENCION = 30;

function json(cuerpo: unknown, estado: number): Response {
  return new Response(JSON.stringify(cuerpo), {
    status: estado,
    headers: { "Content-Type": "application/json" },
  });
}

type ClienteSupabase = ReturnType<typeof createClient>;

/**
 * Trae TODAS las filas de una tabla, de a FILAS_POR_PAGINA. Un bloque
 * incompleto (menos filas que la página pedida) es la señal de que no queda
 * nada más. Mismo patrón que traerTodasLasFilas() en el front-end
 * (src/js/modules/db/compartido.js).
 */
async function traerTablaCompleta(
  supabase: ClienteSupabase,
  tabla: string,
): Promise<unknown[]> {
  const orden = ORDEN_POR_TABLA[tabla] ?? ["id"];
  const filas: unknown[] = [];
  for (let desde = 0; ; desde += FILAS_POR_PAGINA) {
    let consulta = supabase.from(tabla).select("*");
    for (const columna of orden) {
      consulta = consulta.order(columna, { ascending: true });
    }
    const { data, error } = await consulta.range(
      desde,
      desde + FILAS_POR_PAGINA - 1,
    );
    if (error) throw new Error(`Tabla ${tabla}: ${error.message}`);
    filas.push(...(data ?? []));
    if (!data || data.length < FILAS_POR_PAGINA) break;
  }
  return filas;
}

/**
 * Borra del bucket los respaldos con más de DIAS_RETENCION días y devuelve
 * cuántos borró. Es best-effort a propósito: si el listado o el borrado
 * fallan, se devuelve 0 y la corrida del respaldo sigue contando como
 * exitosa (el JSON nuevo ya quedó subido) — la limpieza se reintenta sola
 * mañana. Solo se tocan archivos con el prefijo `respaldo-` que esta misma
 * función crea, nunca cualquier otra cosa que hubiera en el bucket.
 */
async function purgarRespaldosAntiguos(
  supabase: ClienteSupabase,
  ahora: Date,
): Promise<number> {
  try {
    const limite = ahora.getTime() - DIAS_RETENCION * 24 * 60 * 60 * 1000;
    const antiguos: string[] = [];
    // El listado también pagina (su límite por omisión es 100 archivos).
    for (let desplazamiento = 0; ; desplazamiento += 100) {
      const { data, error } = await supabase.storage
        .from("respaldos")
        .list("", { limit: 100, offset: desplazamiento });
      if (error || !data || data.length === 0) break;
      for (const archivo of data) {
        if (!archivo.name.startsWith("respaldo-")) continue;
        const creada = archivo.created_at ? Date.parse(archivo.created_at) : NaN;
        if (!Number.isNaN(creada) && creada < limite) antiguos.push(archivo.name);
      }
      if (data.length < 100) break;
    }
    if (antiguos.length === 0) return 0;
    const { error: errBorrado } = await supabase.storage
      .from("respaldos")
      .remove(antiguos);
    return errBorrado ? 0 : antiguos.length;
  } catch {
    return 0;
  }
}

Deno.serve(async (req: Request) => {
  const url = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase: ClienteSupabase = createClient(url, serviceKey);

  // ── Autenticación: secreto compartido guardado en Vault ──────────────────
  // No es la service_role key. Es un secreto propio, generado al azar en la
  // migración 018, exclusivo para que pg_cron pruebe su identidad aquí.
  //
  // El esquema `vault` no está expuesto por PostgREST (por diseño, para que
  // nadie lo lea por la API REST), así que la comparación pasa por
  // `public.verificar_secreto_cron()`, una función SECURITY DEFINER sin
  // permisos de ejecución para `authenticated`/`anon` — solo el service_role
  // (este mismo Edge Function) puede llamarla.
  const secretoRecibido = req.headers.get("x-cron-secret") ?? "";
  const { data: coincide, error: errSecreto } = await supabase.rpc("verificar_secreto_cron", {
    p_secreto: secretoRecibido,
  });

  if (errSecreto || coincide !== true) {
    return json({ error: "No autorizado." }, 401);
  }

  const inicio = new Date();

  try {
    const respaldo: Record<string, unknown> = {};
    // Conteo por tabla, incluido en el propio archivo: al restaurar, permite
    // comprobar de un vistazo que ninguna tabla quedó truncada (si el
    // arreglo trajera menos filas que su conteo, el archivo está dañado o
    // incompleto — mejor saberlo ahí que descubrirlo a mitad de camino).
    const filasPorTabla: Record<string, number> = {};
    for (const tabla of TABLAS_A_RESPALDAR) {
      const filas = await traerTablaCompleta(supabase, tabla);
      respaldo[tabla] = filas;
      filasPorTabla[tabla] = filas.length;
    }

    const contenido = JSON.stringify({
      generado_en: inicio.toISOString(),
      filas_por_tabla: filasPorTabla,
      tablas: respaldo,
    });

    const nombreArchivo = `respaldo-${inicio.toISOString().replace(/[:.]/g, "-")}.json`;
    const bytes = new TextEncoder().encode(contenido);

    const { error: errSubida } = await supabase.storage
      .from("respaldos")
      .upload(nombreArchivo, bytes, { contentType: "application/json" });
    if (errSubida) throw new Error(`Subida a Storage: ${errSubida.message}`);

    // Recién con el respaldo nuevo a salvo se purgan los antiguos: si algo
    // de arriba falla, no se borra ninguna copia previa.
    const purgados = await purgarRespaldosAntiguos(supabase, inicio);

    await supabase.from("respaldos_log").insert({
      ok: true,
      archivo: nombreArchivo,
      bytes: bytes.length,
      mensaje: purgados > 0 ? `Se borraron ${purgados} respaldo(s) con más de ${DIAS_RETENCION} días.` : null,
    });

    return json({ ok: true, archivo: nombreArchivo, bytes: bytes.length, filas_por_tabla: filasPorTabla, purgados }, 200);
  } catch (err) {
    const mensaje = err instanceof Error ? err.message : String(err);
    await supabase.from("respaldos_log").insert({
      ok: false,
      archivo: null,
      bytes: null,
      mensaje,
    });
    return json({ ok: false, error: mensaje }, 500);
  }
});
