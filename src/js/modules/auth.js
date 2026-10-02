import { supabase } from '../supabase-init.js';
import { CONFIG } from '../config.js';
import { conTiempoLimite } from './utilidades.js';

export async function login(email, password) {
    // Con tiempo límite igual que el resto de las llamadas a Supabase: sin
    // esto, un cuelgue de la librería (ver supabase-init.js) dejaba el botón
    // de ingresar esperando para siempre, sin ningún aviso.
    const { data, error } = await conTiempoLimite(
        supabase.auth.signInWithPassword({ email, password }),
        15000,
        'El inicio de sesión tardó demasiado en responder. Intente nuevamente; si el problema persiste, recargue la página.'
    );
    if (error) {
        // Un fallo de red o de CORS no son credenciales inválidas: decirle
        // "acceso denegado" a quien escribió bien su clave lo manda a
        // revisar algo que no es. Se distinguen por el nombre que les pone
        // gotrue y por el texto del error.
        const texto = `${error.name || ''} ${error.message || ''}`;
        const esDeRed = /fetch|network|retryable|failed to fetch|load failed|timeout/i.test(texto);
        if (esDeRed) {
            throw new Error('No se pudo conectar con el servidor. Revisa la conexión e inténtalo de nuevo.');
        }
        throw new Error('Credenciales inválidas. Acceso denegado.');
    }
    return data;
}

// Requiere habilitar el proveedor "Google" en Supabase > Authentication > Providers.
export async function loginWithGoogle() {
    const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: window.location.origin }
    });
    if (error) throw new Error('No se pudo iniciar sesión con Google.');
}

export async function resetPassword(email) {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin
    });
    if (error) throw new Error('No se pudo enviar el correo de recuperación.');
}

/**
 * Fija la contraseña nueva. Solo funciona cuando hay una sesión de
 * recuperación activa, es decir, justo después de abrir el enlace del correo.
 */
export async function actualizarPassword(nuevaPassword) {
    const { error } = await conTiempoLimite(
        supabase.auth.updateUser({ password: nuevaPassword }),
        15000,
        'El cambio de contraseña tardó demasiado en responder. Inténtalo de nuevo.'
    );
    if (error) {
        if (/session/i.test(error.message)) {
            throw new Error('El enlace expiró. Solicita uno nuevo desde la pantalla de ingreso.');
        }
        throw new Error(error.message || 'No se pudo cambiar la contraseña.');
    }
}

/**
 * Cambia la contraseña desde dentro del sistema, con la sesión ya abierta.
 *
 * Se exige la contraseña actual y se verifica de verdad, reautenticando contra
 * el servidor. Sin ese paso, cualquiera que encuentre un computador del mesón
 * con la sesión abierta podría cambiar la clave y quedarse con la cuenta.
 * Supabase no lo pide por su cuenta: hay que hacerlo aquí.
 */
export async function cambiarPassword(passwordActual, passwordNueva) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.email) {
        throw new Error('No hay una sesión válida. Vuelve a iniciar sesión.');
    }

    // Reautenticación: si la contraseña actual no calza, esto falla.
    // Con tiempo límite igual que login(): sin él, una red colgada dejaba el
    // formulario esperando para siempre sin ningún aviso.
    const { error: errorVerificacion } = await conTiempoLimite(
        supabase.auth.signInWithPassword({
            email: user.email,
            password: passwordActual
        }),
        15000,
        'La verificación tardó demasiado en responder. Inténtalo de nuevo.'
    );
    if (errorVerificacion) {
        const texto = `${errorVerificacion.name || ''} ${errorVerificacion.message || ''}`;
        if (/fetch|network|retryable|timeout/i.test(texto)) {
            throw new Error('No se pudo conectar con el servidor. Revisa la conexión e inténtalo de nuevo.');
        }
        throw new Error('La contraseña actual no es correcta.');
    }

    const { error } = await conTiempoLimite(
        supabase.auth.updateUser({ password: passwordNueva }),
        15000,
        'El cambio de contraseña tardó demasiado en responder. Inténtalo de nuevo.'
    );
    if (error) {
        throw new Error(error.message || 'No se pudo cambiar la contraseña.');
    }
}

/** Usuario de la sesión actual, o null. */
export async function usuarioActual() {
    const { data: { user } } = await supabase.auth.getUser();
    return user || null;
}

/**
 * Avisa cuando cambia el estado de la sesión.
 *
 * Es lo que permite que funcionen los dos flujos que salen de la aplicación y
 * vuelven: el retorno de Google y el enlace de recuperación del correo. En
 * ambos casos la sesión aparece después de que la página ya cargó, así que
 * consultarla una sola vez al inicio no alcanza.
 */
export function alCambiarSesion(callback) {
    return supabase.auth.onAuthStateChange((evento, sesion) => callback(evento, sesion));
}

export async function logout() {
    await supabase.auth.signOut();
    window.location.reload();
}

/**
 * Determina el rol del usuario.
 *
 * Orden de prioridad:
 *   1. La fila del usuario en la tabla `usuarios` (fuente de verdad).
 *   2. Si no existe esa fila, se revisa CONFIG.ADMIN_EMAILS como respaldo,
 *      para que el administrador no quede bloqueado como "librero" antes
 *      de haber creado su fila.
 *   3. En cualquier otro caso, el rol de menor privilegio.
 *
 * IMPORTANTE: esto decide únicamente QUÉ SE MUESTRA en pantalla. No es una
 * medida de seguridad — cualquiera puede editar este archivo en su navegador.
 * Quien realmente impide acciones no autorizadas son las políticas RLS de
 * Supabase, que deben validar el rol del lado del servidor.
 */
/**
 * ¿Este correo está declarado como administrador en config.js?
 *
 * Es un respaldo para que el administrador no quede atrapado como librero
 * cuando su fila en la tabla `usuarios` todavía no dice 'admin'. Sin esto hay
 * un punto muerto: para asignar el rol admin hace falta ser admin, así que si
 * no hay ninguno todavía, nadie puede crear el primero.
 *
 * IMPORTANTE: solo cambia LO QUE SE VE. Cualquiera puede editar config.js en
 * su navegador. Quien decide de verdad son las políticas RLS, que leen la
 * tabla `usuarios` del lado del servidor.
 */
export function esAdminPorCorreo(email) {
    if (!email) return false;
    return CONFIG.ADMIN_EMAILS.includes(email.toLowerCase().trim());
}

export async function getUserRole(user) {
    // Acepta tanto el objeto `user` completo como un id suelto (retrocompatible)
    const userId = typeof user === 'string' ? user : user?.id;
    const email = typeof user === 'string' ? null : user?.email;

    try {
        const { data, error } = await supabase
            .from('usuarios')
            .select('rol')
            .eq('id', userId)
            .maybeSingle(); // maybeSingle no lanza error cuando no hay fila

        if (error) {
            console.warn('No se pudo leer el rol desde la tabla usuarios:', error.message);
        }

        if (data?.rol) return data.rol;

        // Respaldo: correo declarado como administrador en config.js
        if (email && CONFIG.ADMIN_EMAILS.includes(email.toLowerCase().trim())) {
            console.warn(
                `El usuario ${email} no tiene fila en la tabla "usuarios". ` +
                'Se le asignó el rol admin por CONFIG.ADMIN_EMAILS. ' +
                'Crea su fila en la tabla para que el rol quede respaldado por RLS.'
            );
            return 'admin';
        }

        return 'librero';
    } catch (e) {
        console.error('Error inesperado al obtener el rol:', e);
        return 'librero';
    }
}
