// Vista Mi perfil. Extraído mecánicamente de js/modules/ui.js (Fase 4).
// Incluye el control de tamaño de letra (Fase 4, mantenibilidad/accesibilidad).
import * as auth from '../modules/auth.js';
import { db } from '../modules/db.js';

import { CONFIG } from '../config.js';
import { html, crudo } from '../modules/utilidades.js';
import { CLAVE_ESCALA_FUENTE } from '../modules/ui-base.js';

// Tres pasos nada más: alcanza para adultos mayores sin que el diseño se rompa
// en pantallas angostas, y es fácil de recorrer con dos botones.
const ESCALAS_FUENTE = [
  { valor: '1', etiqueta: 'Normal' },
  { valor: '1.15', etiqueta: 'Grande' },
  { valor: '1.3', etiqueta: 'Muy grande' }
];

function indiceEscalaActual() {
  let guardada = '1';
  try {
    guardada = localStorage.getItem(CLAVE_ESCALA_FUENTE) || '1';
  } catch (e) {
    // Si el navegador bloquea localStorage, se queda en el tamaño normal
  }
  const indice = ESCALAS_FUENTE.findIndex(e => e.valor === guardada);
  return indice === -1 ? 0 : indice;
}

function aplicarEscalaFuente(indice) {
  const escala = ESCALAS_FUENTE[indice];
  document.documentElement.style.setProperty('--escala-fuente', escala.valor);
  try {
    localStorage.setItem(CLAVE_ESCALA_FUENTE, escala.valor);
  } catch (e) {
    // Preferencia no guardada, pero el tamaño igual se aplica en esta sesión
  }
}

export default {
  /**
   * Datos de la persona que está usando el sistema.
   *
   * Existe por una razón práctica y otra de cumplimiento. La práctica: en un
   * mesón que comparten varias personas, la bitácora de auditoría registra
   * quién hizo cada cosa, y hasta ahora "quién" era una dirección de correo.
   * La de cumplimiento: quien trata datos personales de vecinos debe poder
   * cambiar su propia contraseña sin pedírselo a un administrador.
   *
   * El rol se muestra pero no se edita: subir de privilegio no puede ser una
   * decisión de quien se beneficia de ella.
   */
  async renderProfile() {
    const container = this._container();
    if (!container) return;

    let perfil = null;
    try {
      perfil = await db.miPerfil();
    } catch (e) {
      console.warn('Perfil no disponible:', e.message);
    }
    if (this.currentView !== 'profile') return;

    if (!perfil) {
      container.innerHTML = this._avisoMigracion('008', '008_perfiles_y_permisos_librero.sql');
      return;
    }

    this._perfil = perfil;
    const roleInfo = CONFIG.ROLE_LABELS[perfil.rol] || CONFIG.ROLE_LABELS.librero;
    const inicial = (perfil.nombre || perfil.email || '?').trim().charAt(0).toUpperCase();

    const fechaHora = iso => {
      if (!iso) return 'Nunca';
      return new Date(iso).toLocaleString('es-CL', {
        day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit'
      });
    };

    const campo = (id, etiqueta, valor, extra = '', ayuda = '') => html`
      <div>
        <label for="${id}" class="text-[11px] font-black uppercase tracking-wide text-stone-600 dark:text-stone-300 mb-1 block">${etiqueta}</label>
        <input id="${id}" value="${valor ?? ''}" ${crudo(extra)}
          class="w-full px-3 py-2 border border-stone-300 dark:border-stone-600 rounded-md bg-white dark:bg-stone-800 text-sm focus:outline-none focus:border-patrimonio-lago focus:ring-1 focus:ring-patrimonio-lago" />
        ${ayuda ? html`<p class="text-[11px] text-stone-500 dark:text-stone-400 mt-1">${ayuda}</p>` : ''}
      </div>`;

    container.innerHTML = html`
      <div class="grid grid-cols-1 lg:grid-cols-3 gap-4 max-w-5xl">

        <!-- Tarjeta de identificación -->
        <div class="catalog-card bg-patrimonio-card dark:bg-stone-900 rounded-2xl shadow-sm border border-stone-300 dark:border-stone-600 p-6 text-center h-fit">
          <div class="w-20 h-20 rounded-full bg-patrimonio-madera text-white font-serif font-bold text-3xl flex items-center justify-center mx-auto mb-3">${inicial}</div>
          <p class="font-serif font-semibold text-lg text-stone-900 dark:text-stone-100 leading-tight">${perfil.nombre || 'Sin nombre registrado'}</p>
          <p class="text-xs text-stone-500 dark:text-stone-400 mt-0.5 break-all">${perfil.email || ''}</p>
          <div class="mt-3">
            <span class="stamp ${roleInfo.stamp || 'stamp-info'} !rotate-0">
              <i aria-hidden="true" class="fas ${roleInfo.icon || 'fa-user'}"></i> ${roleInfo.title}
            </span>
          </div>
          ${perfil.cargo ? html`<p class="text-xs text-stone-600 dark:text-stone-300 mt-2">${perfil.cargo}</p>` : ''}

          <div class="border-t border-stone-200 dark:border-stone-700 mt-5 pt-4 space-y-2.5 text-left">
            <div>
              <p class="text-[10px] font-black uppercase tracking-widest text-stone-500 dark:text-stone-400">Último acceso</p>
              <p class="text-xs text-stone-700 dark:text-stone-300">${fechaHora(perfil.ultimo_acceso)}</p>
            </div>
            <div>
              <p class="text-[10px] font-black uppercase tracking-widest text-stone-500 dark:text-stone-400">Cuenta creada</p>
              <p class="text-xs text-stone-700 dark:text-stone-300">${fechaHora(perfil.creado_en)}</p>
            </div>
            ${perfil.actualizado_en ? html`
              <div>
                <p class="text-[10px] font-black uppercase tracking-widest text-stone-500 dark:text-stone-400">Perfil actualizado</p>
                <p class="text-xs text-stone-700 dark:text-stone-300">${fechaHora(perfil.actualizado_en)}</p>
              </div>` : ''}
          </div>
        </div>

        <!-- Datos editables y contraseña -->
        <div class="lg:col-span-2 space-y-4">

          <div class="catalog-card bg-patrimonio-card dark:bg-stone-900 rounded-2xl shadow-sm border border-stone-300 dark:border-stone-600">
            <div class="catalog-card-header">
              <h3 class="font-serif font-semibold text-lg text-stone-900 dark:text-stone-100">Mis datos</h3>
            </div>
            <form id="perfil-form" class="p-5 space-y-4">
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                ${campo('perfil-nombre', 'Nombre completo', perfil.nombre, 'required placeholder="María Antileo Huenchumán"')}
                ${campo('perfil-cargo', 'Cargo', perfil.cargo, 'placeholder="Encargada de biblioteca"', 'Aparece junto a tu nombre en el menú.')}
                ${campo('perfil-telefono', 'Teléfono de contacto', perfil.telefono, 'type="tel" placeholder="9 1234 5678"', 'Uso interno. No se muestra a los lectores.')}
                <div>
                  <label class="text-[11px] font-black uppercase tracking-wide text-stone-600 dark:text-stone-300 mb-1 block">Correo</label>
                  <input value="${perfil.email || ''}" readonly
                    class="w-full px-3 py-2 border border-stone-300 dark:border-stone-600 rounded-md bg-stone-50 dark:bg-stone-800/50 text-sm text-stone-500 dark:text-stone-400" />
                  <p class="text-[11px] text-stone-500 dark:text-stone-400 mt-1">Es la identidad de tu cuenta. Solo puede cambiarla un administrador desde Supabase.</p>
                </div>
              </div>
              <div>
                <label class="text-[11px] font-black uppercase tracking-wide text-stone-600 dark:text-stone-300 mb-1 block">Rol</label>
                <input value="${roleInfo.title}" readonly
                  class="w-full px-3 py-2 border border-stone-300 dark:border-stone-600 rounded-md bg-stone-50 dark:bg-stone-800/50 text-sm text-stone-500 dark:text-stone-400" />
                <p class="text-[11px] text-stone-500 dark:text-stone-400 mt-1">
                  Solo un administrador puede cambiar roles, desde Administración → Personal.
                  Tampoco puede hacerlo desde aquí quien tenga el rol: sería concederse permisos a sí mismo.
                </p>
              </div>
              <div class="flex justify-end">
                <button type="submit" class="btn-madera text-white px-6 py-2.5 rounded-xl text-sm font-medium shadow">Guardar cambios</button>
              </div>
            </form>
          </div>

          <div class="catalog-card bg-patrimonio-card dark:bg-stone-900 rounded-2xl shadow-sm border border-stone-300 dark:border-stone-600">
            <div class="catalog-card-header">
              <h3 class="font-serif font-semibold text-lg text-stone-900 dark:text-stone-100">Cambiar contraseña</h3>
            </div>
            <form id="password-form" class="p-5 space-y-4">
              <p class="text-xs text-stone-500 dark:text-stone-400">
                Se pide la contraseña actual a propósito: el computador del mesón queda desatendido, y sin ese
                paso cualquiera podría apropiarse de la cuenta abierta.
              </p>
              <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
                ${campo('pass-actual', 'Contraseña actual', '', 'type="password" autocomplete="current-password" required')}
                ${campo('pass-nueva', 'Contraseña nueva', '', 'type="password" autocomplete="new-password" required minlength="12"')}
                ${campo('pass-repetir', 'Repetir la nueva', '', 'type="password" autocomplete="new-password" required minlength="12"')}
              </div>
              <p class="text-[11px] text-stone-500 dark:text-stone-400">
                Mínimo 12 caracteres. Es un sistema del Estado que trata datos personales de vecinos.
              </p>
              <div class="flex justify-end">
                <button type="submit" class="bg-patrimonio-lago hover:bg-[#14303c] text-white px-6 py-2.5 rounded-xl text-sm font-medium shadow transition-colors">Cambiar contraseña</button>
              </div>
            </form>
          </div>

          <div class="catalog-card bg-patrimonio-card dark:bg-stone-900 rounded-2xl shadow-sm border border-stone-300 dark:border-stone-600 p-5">
            <h3 class="font-serif font-semibold text-lg text-stone-900 dark:text-stone-100 mb-1">Tamaño de letra</h3>
            <p class="text-xs text-stone-500 dark:text-stone-400 mb-3">
              Agranda el texto de toda la aplicación. Queda guardado en este equipo.
            </p>
            <div class="flex items-center gap-3 max-w-xs">
              <button id="fuente-menos-btn" type="button" aria-label="Reducir tamaño de letra"
                class="w-11 h-11 shrink-0 rounded-xl border border-stone-300 dark:border-stone-600 bg-white dark:bg-stone-800 hover:border-patrimonio-lago text-stone-700 font-serif font-bold text-sm disabled:opacity-40 disabled:cursor-not-allowed">A-</button>
              <span id="fuente-nivel-texto" class="text-sm text-stone-600 dark:text-stone-300 font-bold flex-1 text-center"></span>
              <button id="fuente-mas-btn" type="button" aria-label="Aumentar tamaño de letra"
                class="w-11 h-11 shrink-0 rounded-xl border border-stone-300 dark:border-stone-600 bg-white dark:bg-stone-800 hover:border-patrimonio-lago text-stone-700 font-serif font-bold text-lg disabled:opacity-40 disabled:cursor-not-allowed">A+</button>
            </div>
          </div>

          <div class="catalog-card bg-patrimonio-card dark:bg-stone-900 rounded-2xl shadow-sm border border-stone-300 dark:border-stone-600 p-5">
            <h3 class="font-serif font-semibold text-lg text-stone-900 dark:text-stone-100 mb-1">Sesión</h3>
            <p class="text-xs text-stone-500 dark:text-stone-400 mb-3">
              La sesión se cierra sola tras 20 minutos sin actividad. También puedes cerrarla ahora.
            </p>
            <button id="perfil-logout-btn" class="border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 px-4 py-2 rounded-xl text-sm font-bold transition">
              <i aria-hidden="true" class="fas fa-right-from-bracket mr-1.5"></i> Cerrar sesión
            </button>
          </div>

        </div>
      </div>
    `;

    // --- Guardar los datos del perfil ---
    document.getElementById('perfil-form').addEventListener('submit', async e => {
      e.preventDefault();
      const boton = e.target.querySelector('button[type="submit"]');
      const nombre = document.getElementById('perfil-nombre').value.trim();
      const telefonoBruto = document.getElementById('perfil-telefono').value.trim();

      if (!nombre) {
        this.showToast('Escribe tu nombre completo.', 'error');
        return;
      }
      if (nombre.split(/\s+/).length < 2) {
        this.showToast('Escribe tu nombre y al menos un apellido.', 'error');
        return;
      }
      // El teléfono es opcional, pero si se escribe algo debe ser válido
      if (telefonoBruto && this.formatPhone(telefonoBruto).length < 11) {
        this.showToast('El teléfono debe tener 9 dígitos, por ejemplo 9 1234 5678.', 'error');
        return;
      }

      boton.disabled = true;
      try {
        await db.actualizarMiPerfil({
          nombre,
          telefono: telefonoBruto ? this.formatPhone(telefonoBruto) : null,
          cargo: document.getElementById('perfil-cargo').value.trim() || null
        });
        this.showToast('Perfil actualizado.', 'success');
        // Se refresca la ficha del menú lateral para que el cambio se vea de inmediato
        await this.updateUserInfo({ id: perfil.usuario_id, email: perfil.email });
        this.renderProfile();
      } catch (err) {
        this.showToast(err.message || 'No se pudo guardar el perfil.', 'error');
        boton.disabled = false;
      }
    });

    // --- Cambiar la contraseña ---
    document.getElementById('password-form').addEventListener('submit', async e => {
      e.preventDefault();
      const boton = e.target.querySelector('button[type="submit"]');
      const actual = document.getElementById('pass-actual').value;
      const nueva = document.getElementById('pass-nueva').value;
      const repetir = document.getElementById('pass-repetir').value;

      const errorPass = this.validarPassword(nueva);
      if (errorPass) {
        this.showToast(errorPass, 'error');
        return;
      }
      if (nueva !== repetir) {
        this.showToast('Las dos contraseñas nuevas no coinciden.', 'error');
        return;
      }
      if (nueva === actual) {
        this.showToast('La contraseña nueva debe ser distinta de la actual.', 'error');
        return;
      }

      boton.disabled = true;
      try {
        await auth.cambiarPassword(actual, nueva);
        e.target.reset();
        this.showToast('Contraseña cambiada correctamente.', 'success');
      } catch (err) {
        this.showToast(err.message || 'No se pudo cambiar la contraseña.', 'error');
      } finally {
        boton.disabled = false;
      }
    });

    document.getElementById('perfil-logout-btn').addEventListener('click', async () => {
      const ok = await this.showConfirm('¿Cerrar la sesión en este equipo?', {
        title: 'Cerrar sesión', confirmText: 'Cerrar sesión'
      });
      if (ok) auth.logout();
    });

    // --- Tamaño de letra ---
    let indiceFuente = indiceEscalaActual();
    const nivelTexto = document.getElementById('fuente-nivel-texto');
    const actualizarNivelTexto = () => {
      if (nivelTexto) nivelTexto.textContent = ESCALAS_FUENTE[indiceFuente].etiqueta;
      document.getElementById('fuente-menos-btn').disabled = indiceFuente === 0;
      document.getElementById('fuente-mas-btn').disabled = indiceFuente === ESCALAS_FUENTE.length - 1;
    };
    actualizarNivelTexto();

    document.getElementById('fuente-menos-btn').addEventListener('click', () => {
      indiceFuente = Math.max(0, indiceFuente - 1);
      aplicarEscalaFuente(indiceFuente);
      actualizarNivelTexto();
    });
    document.getElementById('fuente-mas-btn').addEventListener('click', () => {
      indiceFuente = Math.min(ESCALAS_FUENTE.length - 1, indiceFuente + 1);
      aplicarEscalaFuente(indiceFuente);
      actualizarNivelTexto();
    });
  }
};
