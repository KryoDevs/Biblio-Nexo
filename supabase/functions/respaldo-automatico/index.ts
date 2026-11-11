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
//   2. Lee el contenido completo de las tablas del negocio.
//   3. Sube un JSON con fecha en el nombre al bucket de Storage "respaldos".
//   4. Registra el resultado (éxito o falla) en public.respaldos_log — la
//      única escritora de esa tabla, porque usa la service_role key que el
//      runtime de Edge Functions inyecta solo, nunca a mano ni de un secreto
//      pedido a quien use la app.
//
// La service_role key sale EXCLUSIVAMENTE de Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),
// la variable que Supabase inyecta automáticamente en el runtime — nunca se
// pide, nunca se hardcodea, nunca se expone al cliente.

import { createClient } from "jsr:@supabase/supabase-js@2";

/*
 * Retención de los respaldos en Storage. Este número es la única cosa que
 * impide que el bucket «respaldos» crezca para siempre: el plan Free de Supabase
 * trae 1 GB de Storage y aquí se sube un JSON completo de todas las tablas cada
 * día. Sin retención, el límite se alcanza solo —y el día que se alcanza deja de
 * subir respaldos, que es exactamente el modo de falla que nadie quiere
 * descubrir cuando necesita recuperar (falla el respaldo, no la app).
 *
 * Cuánto pesa cada archivo depende del tamaño real de la base de datos de cada
 * municipio, así que el umbral se mide, no se adivina:
 *
 *   select count(*) files, round(sum(bytes)/1048576.0, 1) mb
 *   from public.respaldos_log where ok;
 *
 * Con eso en la mano se ajusta DIAS_CONSERVAR (o la frecuencia del cron de la
 * migración 018) para que el total quede holgado bajo ~500 MB, que deja margen
 * para el resto del Storage.
 */
const DIAS_CONSERVAR = 30;

/*
 * Segundo límite, y es el que importa cuando el catálogo crece: el total del
 * bucket. Con los datos de prueba medidos en el proyecto (base de 16 MB, JSON de
 * unas 70 KB por corrida, 62 archivos en tres meses = 4,5 MB) 30 días no ocupan
 * nada. Pero el tamaño del JSON sigue al catálogo, no a los días: un municipio
 * con 40 000 títulos y historial de años genera respaldos de decenas de
 * megabytes cada noche y 30 días de eso ya se comen el gigabyte. Por eso se
 * conserva también un tope duro de bytes y se eliminan los más viejos hasta
 * entrar en él, la regla de los días sola no basta.
 */
const LIMITE_TOTAL_BYTES = 300 * 1024 * 1024;

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

function json(cuerpo: unknown, estado: number): Response {
  return new Response(JSON.stringify(cuerpo), {
    status: estado,
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * Borra los respaldos más antiguos que `DIAS_CONSERVAR`. Devuelve un resumen para
 * la bitácora; si la lista o la borrada fallan, devuelve el motivo y no lanza:
 * callers arriba trata esto como información, no como error.
 */
async function purgar(
  supabase: ReturnType<typeof createClient>,
  desde: Date,
): Promise<string> {
  // `metadata.size` viene del `list()` de Storage; el tipo público de
  // FileObject no siempre lo declara, así que se lee por esta vía en vez de
  // tocar `o.metadata?.size` en cada uso: si el tipo de la librería cambia, el
  // error aparece aquí y no en tres líneas distintas.
  const tamanoDe = (o: unknown): number | undefined =>
    (o as { metadata?: { size?: number } } | null)?.metadata?.size;
  const corte = new Date(desde.getTime() - DIAS_CONSERVAR * 86_400_000);
  try {
    const { data: objetos, error: errLista } = await supabase.storage
      .from("respaldos")
      .list("", { limit: 1000 });
    if (errLista) return `retención no aplicada: ${errLista.message}`;
    const nuestros = (objetos ?? [])
      .filter((o) => typeof o.name === "string" && o.name.startsWith("respaldo-"))
      .sort((a, b) => String(a.created_at ?? "").localeCompare(String(b.created_at ?? "")));

    // 1) Por edad.
    let aBorrar = nuestros
      .filter((o) => o.created_at && new Date(o.created_at) < corte)
      .map((o) => o.name);
    const porEdad = aBorrar.length;

    // 2) Por total, del más viejo al más nuevo, parando en cuanto se entra en el
    //    tope. Se suma lo que dice `metadata.size`; si la respuesta del Storage
    //    consultado no trajera ese campo (la forma del payload no es un contrato
    //    estable), esta regla se declara inaplicable y sigue la de los días — no
    //    se inventa un tamaño, porque con un tamaño inventado se borra a ciegas.
    const conTamano = nuestros.filter((o) => typeof tamanoDe(o) === "number");
    let porTamano = 0;
    if (conTamano.length === nuestros.length && nuestros.length > 0) {
      let total = nuestros.reduce((n, o) => n + (tamanoDe(o) ?? 0), 0);
      for (const o of nuestros) {
        if (total <= LIMITE_TOTAL_BYTES) break;
        if (aBorrar.includes(o.name)) {
          total -= tamanoDe(o) ?? 0;
          continue;
        }
        aBorrar.push(o.name);
        total -= tamanoDe(o) ?? 0;
        porTamano += 1;
      }
    } else if (nuestros.length > 0) {
      porTamano = -1; // marca «no pude medir el total»
    }

    if (aBorrar.length === 0) {
      const nota = porTamano === -1 ? ", el total no se pudo medir (sin metadata.size)" : "";
      return `retención: nada anterior a ${corte.toISOString().slice(0, 10)}${nota}`;
    }
    const { error: errBorrado } = await supabase.storage.from("respaldos").remove(aBorrar);
    if (errBorrado) return `retención falló al borrar ${aBorrar.length} archivos: ${errBorrado.message}`;
    const partes = [];
    if (porEdad > 0) partes.push(`${porEdad} por antigüedad (antes de ${corte.toISOString().slice(0, 10)})`);
    if (porTamano > 0) partes.push(`${porTamano} por el tope de ${Math.round(LIMITE_TOTAL_BYTES / 1048576)} MB`);
    if (porTamano === -1) partes.push("el tope de bytes no se pudo evaluar, falta metadata.size");
    return `retención: ${aBorrar.length} archivo(s) eliminados — ${partes.join(", ") || "motivo no registrado"}`;
  } catch (err) {
    return `retención no aplicada: ${err instanceof Error ? err.message : String(err)}`;
  }
}

Deno.serve(async (req: Request) => {
  const url = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(url, serviceKey);

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
    for (const tabla of TABLAS_A_RESPALDAR) {
      const { data, error } = await supabase.from(tabla).select("*");
      if (error) throw new Error(`Tabla ${tabla}: ${error.message}`);
      respaldo[tabla] = data;
    }

    const contenido = JSON.stringify({
      generado_en: inicio.toISOString(),
      tablas: respaldo,
    });

    const nombreArchivo = `respaldo-${inicio.toISOString().replace(/[:.]/g, "-")}.json`;
    const bytes = new TextEncoder().encode(contenido);

    const { error: errSubida } = await supabase.storage
      .from("respaldos")
      .upload(nombreArchivo, bytes, { contentType: "application/json" });
    if (errSubida) throw new Error(`Subida a Storage: ${errSubida.message}`);

    // La purga va DESPUÉS de subir y antes de anotar, con su propio try/catch
    // dentro: si algo sale mal ahí, el respaldo de hoy ya está en Storage y el
    // registro se escribe igual, con la nota de lo que pasó. Una retención que
    // falla tiene que ser ruido en la bitácora, nunca un respaldo perdido. Y
    // nunca borra el archivo recién subido: se compara contra `created_at` del
    // propio Storage, no contra el nombre del archivo —la fecha del nombre lleva
    // los dos puntos cambiados por guiones, y reconstruir ese string para
    // comparar sería una forma creativa de borrar lo que no había que borrar—.
    const retencion = await purgar(supabase, inicio);

    await supabase.from("respaldos_log").insert({
      ok: true,
      archivo: nombreArchivo,
      bytes: bytes.length,
      mensaje: retencion,
    });

    return json({ ok: true, archivo: nombreArchivo, bytes: bytes.length, retencion }, 200);
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
