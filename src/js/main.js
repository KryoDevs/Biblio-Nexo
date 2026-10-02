import { supabase } from './supabase-init.js';
import * as auth from './modules/auth.js';
import uiManager from './modules/ui.js';
import registroErrores from './modules/errores.js';
import { conTiempoLimite } from './modules/utilidades.js';
import persistencia from './modules/persistencia.js';
import { colaSync } from './modules/db.js';
import estadoConexion from './modules/estado-conexion.js';

// Mensaje honesto: en el cuelgue que motivó este cambio nunca sale ninguna
// petición de red (se comprobó con navigator.locks.query()), así que hablar
// de "conexión" o "servidor" culparía a la red del usuario sin motivo. Es un
// candado interno del cliente de Supabase que no se soltó a tiempo.
const MENSAJE_ARRANQUE_LENTO =
    'No se pudo iniciar la aplicación a tiempo. Recargue la página; si el problema sigue, ' +
    'cierre esta pestaña y ábrala de nuevo.';

/**
 * Descarta el dato de sesión guardado en este navegador.
 *
 * Se usa solo cuando el arranque se cuelga (ver MENSAJE_ARRANQUE_LENTO): un
 * dato de sesión dañado es la causa más probable de que la inicialización de
 * Supabase quede esperando para siempre. Recargar sin limpiar esto reproduce
 * el mismo cuelgue; limpiarlo fuerza un inicio de sesión limpio, sin perder
 * nada, porque este navegador no guarda ningún otro dato en localStorage.
 */
function limpiarSesionLocal() {
    try {
        Object.keys(localStorage)
            .filter(clave => clave.startsWith('sb-') && clave.endsWith('-auth-token'))
            .forEach(clave => localStorage.removeItem(clave));
    } catch (e) {
        // Si el navegador bloquea localStorage no hay nada que limpiar
    }
}

/**
 * Detecta si la página se abrió desde el enlace de recuperación del correo.
 * Supabase devuelve el token en el fragmento de la URL (#type=recovery&...).
 */
function esEnlaceDeRecuperacion() {
    const hash = window.location.hash || '';
    return hash.includes('type=recovery');
}

/**
 * Detecta si la página se abrió desde el enlace de "Aceptar invitación" del
 * correo que manda el Edge Function `invitar-personal`. Supabase marca este
 * enlace igual que el de recuperación, pero con `type=invite` en vez de
 * `type=recovery` (ver `js/main.js` — mismo mecanismo, mismo lugar de la URL).
 */
function esEnlaceDeInvitacion() {
    const hash = window.location.hash || '';
    return hash.includes('type=invite');
}

// El Service Worker ahora lo inyecta automáticamente vite-plugin-pwa

// Cada cuánto se repite la sincronización en segundo plano mientras la
// pestaña sigue abierta. Cinco minutos: ni tan seguido como para competir con
// el trabajo real por ancho de banda, ni tan espaciado como para que la copia
// local quede desactualizada toda una jornada.
const INTERVALO_SINCRONIZACION_MS = 5 * 60 * 1000;
let sincronizacionIniciada = false;

/**
 * Arranca la sincronización en segundo plano del almacén local (Fase 1.2 —
 * ver js/modules/persistencia.js para el detalle y las reglas de privacidad),
 * la cola de escrituras pendientes (Fase 1.3 — ver la clase SyncQueue en
 * js/modules/db.js) y el indicador de conexión (Fase 1.4 —
 * js/modules/estado-conexion.js). Se llama una vez que hay sesión iniciada —
 * antes no tiene sentido: sin sesión, RLS no deja leer ni libros ni lectores,
 * y no puede haber ninguna operación en cola todavía.
 *
 * Nunca bloquea nada: tanto `persistencia.sincronizarTodo()` como
 * `colaSync.reintentarPendientes()` ya atrapan sus propios errores y no
 * lanzan. Esto decide CUÁNDO se llaman al iniciar sesión y cada cinco
 * minutos mientras la pestaña siga abierta. El evento "online" NO se
 * duplica aquí a propósito: `colaSync` ya se suscribe a él por su cuenta
 * (ver el final de la clase SyncQueue en db.js) — así la cola se reintenta
 * sola al recuperar la conexión incluso si este módulo cambiara de forma
 * de arrancar la sesión. persistencia.sincronizarTodo() sí necesita que se
 * la llame desde aquí porque no se suscribe a nada por su cuenta.
 */
function iniciarSincronizacionEnSegundoPlano() {
    if (sincronizacionIniciada) return;
    sincronizacionIniciada = true;

    estadoConexion.iniciar();
    persistencia.sincronizarTodo();
    colaSync.reintentarPendientes();
    setInterval(() => {
        persistencia.sincronizarTodo();
        colaSync.reintentarPendientes();
    }, INTERVALO_SINCRONIZACION_MS);
    window.addEventListener('online', () => persistencia.sincronizarTodo());
}

document.addEventListener('DOMContentLoaded', async () => {
    // Se activa antes que cualquier otra cosa, incluso antes del try: un
    // cuelgue o error durante el propio arranque —como el candado de
    // sesión— antes no quedaba registrado en Administración → Diagnóstico
    // porque el registro solo se activaba después de iniciar sesión.
    registroErrores.iniciar(() => 'arranque');

    try {
        if (!supabase) {
            throw new Error('No se pudo inicializar la conexión con Supabase (CDN no disponible).');
        }

        // El enlace del correo trae el token en la URL. Se muestra la pantalla de
        // contraseña nueva antes de cualquier otra cosa, porque en ese momento ya
        // existe una sesión válida y sin esto el usuario entraría directo al panel
        // sin haber cambiado nada.
        if (esEnlaceDeRecuperacion()) {
            uiManager.renderNuevaPassword();
            window.__appBooted = true;
            return;
        }

        // Igual razón que la recuperación de contraseña, pero para quien recién
        // acepta una invitación (Administración → Personal): la cuenta existe en
        // Supabase Auth desde que se mandó la invitación, pero sin contraseña ni
        // nombre — sin esto, entraría directo al panel con el perfil en blanco.
        if (esEnlaceDeInvitacion()) {
            uiManager.renderCompletarInvitacion();
            window.__appBooted = true;
            return;
        }

        // Google y el enlace de correo devuelven la sesión después de que la
        // página cargó, así que hay que escuchar el cambio y no solo consultar
        // una vez al inicio.
        //
        // BUG-02: Mutex ligero con Promise para evitar doble renderShell.
        // Tanto alCambiarSesion(SIGNED_IN) como getSession() pueden detectar
        // una sesión activa al mismo tiempo (dentro de la misma microtask
        // queue). Una guardia booleana simple no es suficiente: ambas rutas
        // podrían leer sesionRenderizada=false antes de que la primera lo ponga
        // en true. Con este mutex, la segunda ruta espera a que la primera
        // termine antes de decidir si hay que renderizar.
        let renderPromise = null;
        const renderUnaVez = async (usuario) => {
            if (renderPromise) { await renderPromise; return; }
            renderPromise = uiManager.renderShell(usuario);
            try {
                await renderPromise;
                iniciarSincronizacionEnSegundoPlano();
            } catch (e) {
                // Si el primer intento falla (una red que se cae justo al
                // entrar), el mutex no puede quedar guardando una promesa
                // rechazada: se libera para que el siguiente SIGNED_IN —o el
                // botón de reintentar— pueda volver a intentarlo.
                renderPromise = null;
                throw e;
            }
        };

        auth.alCambiarSesion(async (evento, sesion) => {
            if (evento === 'PASSWORD_RECOVERY') {
                uiManager.renderNuevaPassword();
                return;
            }
            if (evento === 'SIGNED_IN' && sesion && !uiManager.sesionRenderizada) {
                uiManager.sesionRenderizada = true;
                await renderUnaVez(sesion.user);
            }
            if (evento === 'SIGNED_OUT') {
                uiManager.sesionRenderizada = false;
                renderPromise = null; // Resetear el mutex al cerrar sesión
                uiManager.renderLogin();
            }
        });

        const { data: { session }, error } = await conTiempoLimite(
            supabase.auth.getSession(),
            8000,
            MENSAJE_ARRANQUE_LENTO
        );
        if (error) throw error;

        if (session) {
            uiManager.sesionRenderizada = true;
            await renderUnaVez(session.user);
        } else {
            uiManager.renderLogin();
        }
        window.__appBooted = true;

    } catch (err) {
        window.__appBooted = true; // evita que el timeout de respaldo pise este mensaje más específico
        registroErrores.registrarOperacion('arranque', err);

        if (err?.message === MENSAJE_ARRANQUE_LENTO) {
            limpiarSesionLocal();
        }

        if (window.__showCriticalError) {
            window.__showCriticalError(err.message || 'Fallo crítico en el inicio. Verifique su conexión a internet.');
        } else {
            document.body.innerHTML = '<div class="p-10 text-center text-red-600 font-bold">Fallo crítico en el inicio. Verifique la consola de red.</div>';
        }
    }
});

