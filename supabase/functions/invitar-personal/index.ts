// Edge Function: invitar-personal
//
// Reemplaza el flujo actual ("las cuentas se crean en Supabase, en
// Authentication → Users") por una invitación desde la propia app: la
// administradora escribe el correo y el rol, esta función manda la
// invitación por correo y deja el rol ya asignado para cuando la persona
// acepte e inicie sesión por primera vez.
//
// Requiere que quien llama sea, ella misma, una administradora con sesión
// iniciada: el runtime de Edge Functions ya valida que el JWT sea legítimo
// (verify_jwt = true al desplegar), y este código además comprueba el rol
// real contra `mi_perfil()`, respetando RLS con la propia sesión de quien
// llama — nunca confía en un campo "rol" que mandara el cliente.
//
// La service_role key sale EXCLUSIVAMENTE de
// Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'), la variable que Supabase
// inyecta automáticamente en el runtime — nunca se pide, nunca se
// hardcodea, nunca se expone al cliente. Se usa solo para las dos acciones
// que en efecto requieren privilegios de administración: invitar por correo
// y asignar el rol inicial.

import { createClient } from "jsr:@supabase/supabase-js@2";

// El navegador manda un preflight OPTIONS antes de cualquier POST con
// Authorization/Content-Type a un origen distinto (la app corre en Vercel,
// el Edge Function en Supabase). Sin estos encabezados en TODAS las
// respuestas — incluida la del preflight — el navegador bloquea la llamada
// antes de que llegue nunca al código de abajo, y supabase-js lo reporta
// como "Failed to send a request to the Edge Function": no es un error de
// la función, es que la petición ni siquiera salió.
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(cuerpo: unknown, estado: number): Response {
  return new Response(JSON.stringify(cuerpo), {
    status: estado,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json({ error: "Método no permitido." }, 405);
  }

  const url = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const authHeader = req.headers.get("Authorization") ?? "";

  // ── Verificar que quien llama es, de verdad, administradora ──────────────
  // Cliente con la sesión de quien llama (no el service role): mi_perfil()
  // corre bajo RLS normal y toma el usuario de auth.uid(), no de nada que
  // mande el body — así nadie puede pedir el rol de otra persona.
  const supabaseComoUsuario = createClient(url, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: perfilData, error: errPerfil } = await supabaseComoUsuario.rpc("mi_perfil");
  const miPerfil = Array.isArray(perfilData) ? perfilData[0] : perfilData;

  if (errPerfil || !miPerfil || miPerfil.rol !== "admin") {
    return json({ error: "Solo un administrador puede invitar personal nuevo." }, 403);
  }

  // ── Leer y validar el cuerpo ───────────────────────────────────────────
  let cuerpo: { email?: string; rol?: string };
  try {
    cuerpo = await req.json();
  } catch {
    return json({ error: "Cuerpo de la solicitud inválido." }, 400);
  }

  const email = String(cuerpo?.email ?? "").trim().toLowerCase();
  const rol = String(cuerpo?.rol ?? "").trim();

  if (!email || !email.includes("@")) {
    return json({ error: "El correo no es válido." }, 400);
  }
  if (rol !== "admin" && rol !== "librero" && rol !== "bibliomovil") {
    return json({ error: "El rol debe ser admin, librero o bibliomovil." }, 400);
  }

  // ── Invitar y asignar el rol, con privilegios de administración ─────────
  const supabaseAdmin = createClient(url, serviceKey);

  const { data: invitado, error: errInvite } = await supabaseAdmin.auth.admin.inviteUserByEmail(email);
  if (errInvite || !invitado?.user) {
    return json({ error: `No se pudo enviar la invitación: ${errInvite?.message ?? "error desconocido"}.` }, 400);
  }

  const { error: errRol } = await supabaseAdmin
    .from("usuarios")
    .upsert({ id: invitado.user.id, email, rol }, { onConflict: "id" });

  if (errRol) {
    // La invitación ya salió — no dejar a la administradora sin saber que el
    // rol quedó pendiente de asignarse a mano.
    return json({
      ok: false,
      invitacion_enviada: true,
      error: `Se envió la invitación a ${email}, pero no se pudo asignar el rol automáticamente: ${errRol.message}. Asígnalo desde la lista de Personal una vez que la persona inicie sesión.`,
    }, 500);
  }

  return json({ ok: true, usuario_id: invitado.user.id, email, rol }, 200);
});
