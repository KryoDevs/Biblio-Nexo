// Vista Mi perfil. Extraído mecánicamente de js/modules/ui.js (Fase 4).
// Incluye el control de tamaño de letra (Fase 4, mantenibilidad/accesibilidad).
//
// Rediseño (3 de octubre de 2026). Antes eran cuatro tarjetas apiladas sin
// jerarquía: quién eres quedaba repartido entre un avatar pequeño, un
// formulario y una lista de fechas. Ahora la página responde primero «quién
// soy y qué rol tengo» (encabezado), después «qué puedo editar» (datos y
// contraseña) y deja a un costado lo que se consulta de vez en cuando
// (actividad, preferencias, sesión). Se conservan los ids que usan las
// pruebas (`perfil-form`, `perfil-nombre`, `perfil-cargo`, `perfil-telefono`,
// `password-form`, `perfil-logout-btn`) y ninguna regla de negocio cambió:
// el rol y el correo siguen siendo de solo lectura y la contraseña se sigue
// pidiendo con la actual.
import * as auth from '../modules/auth.js';
import { db } from '../modules/db.js';

import { CONFIG } from '../config.js';
import { html, crudo } from '../modules/utilidades.js';
import { CLAVE_ESCALA_FUENTE } from '../modules/ui-base.js';

// Tres pasos nada más: alcanza para adultos mayores sin que el diseño se rompa
// en pantallas angostas, y es fácil de recorrer con dos botones. El 100 %, el
// 115 % y el 130 % se muestran como vista previa en la propia tarjeta.
const ESCALAS_FUENTE = [
  { valor: '1', etiqueta: 'Normal', porcentaje: '100 %' },
  { valor: '1.15', etiqueta: 'Grande', porcentaje: '115 %' },
  { valor: '1.3', etiqueta: 'Muy grande', porcentaje: '130 %' }
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

function fechaHoraLegible(iso) {
  if (!iso) return 'Sin registro';
  const fecha = new Date(iso);
  if (Number.isNaN(fecha.getTime())) return 'Sin registro';
  return fecha.toLocaleString('es-CL', {
    day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit'
  });
}

/** Días completos transcurridos desde una fecha ISO, o null si no sirve. */
function diasDesde(iso) {
  if (!iso) return null;
  const fecha = new Date(iso);
  if (Number.isNaN(fecha.getTime())) return null;
  return Math.max(0, Math.floor((Date.now() - fecha.getTime()) / 86400000));
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
    let errorPerfil = null;
    try {
      perfil = await db.miPerfil();
    } catch (e) {
      // Se distingue «no hay migración 008» de «no se pudo consultar». Antes
      // cualquier fallo —incluida la falta de internet— caía en el aviso de
      // «falta ejecutar la migración», que manda a revisar Supabase cuando el
      // problema real era la conexión del mesón.
      errorPerfil = e;
      console.warn('Perfil no disponible:', e.message);
    }
    if (this.currentView !== 'profile') return;

    if (!perfil) {
      if (errorPerfil) {
        container.innerHTML = html`
          <div class="catalog-card bg-patrimonio-card dark:bg-stone-900 rounded-2xl shadow-sm border border-rose-300/70 dark:border-rose-900/60 p-6 max-w-xl">
            <h2 class="font-serif font-semibold text-lg text-stone-900 dark:text-stone-100 mb-1">No se pudo cargar tu perfil</h2>
            <p class="text-sm text-stone-600 dark:text-stone-300">${errorPerfil.message || 'La consulta no llegó al servidor.'}</p>
            <p class="text-xs text-stone-500 dark:text-stone-400 mt-2">Revisa la conexión e inténtalo otra vez. Tus datos no se modificaron.</p>
            <button id="perfil-reintentar-btn" class="btn-madera mt-4 text-white rounded-xl px-4 py-2 text-sm font-medium">
              <i aria-hidden="true" class="fas fa-rotate-right mr-1.5"></i> Reintentar
            </button>
          </div>`;
        document.getElementById('perfil-reintentar-btn')?.addEventListener('click', () => this.renderProfile());
        return;
      }
      container.innerHTML = this._avisoMigracion('008', '008_perfiles_y_permisos_librero.sql');
      return;
    }

    this._perfil = perfil;
    const roleInfo = CONFIG.ROLE_LABELS[perfil.rol] || CONFIG.ROLE_LABELS.librero;
    const nombreMostrado = (perfil.nombre || '').trim() || 'Sin nombre registrado';
    const inicial = (perfil.nombre || perfil.email || '?').trim().charAt(0).toUpperCase();
    const correo = perfil.email || '';
    const diasAlta = diasDesde(perfil.creado_en);

    const campo = (id, etiqueta, valor, extra = '', ayuda = '') => html`
      <div>
        <label for="${id}" class="text-[11px] font-black uppercase tracking-wide text-stone-600 dark:text-stone-300 mb-1 block">${etiqueta}</label>
        <input id="${id}" value="${valor ?? ''}" ${crudo(extra)}
          class="w-full px-3 py-2 border border-stone-300 dark:border-stone-600 rounded-md bg-white dark:bg-stone-800 text-sm text-stone-900 dark:text-stone-100 focus:outline-none focus:border-patrimonio-lago focus:ring-1 focus:ring-patrimonio-lago" />
        ${ayuda ? html`<p class="text-[11px] text-stone-500 dark:text-stone-400 mt-1">${ayuda}</p>` : ''}
      </div>`;

    // Accesos rápidos: las mismas vistas que ya ofrece el menú lateral, para
    // quien entra a revisar su ficha y sigue trabajando sin volver al menú.
    const vistasDelRol = (CONFIG.VIEWS_BY_ROLE[this.currentUserRole] || CONFIG.VIEWS_BY_ROLE.librero);
    const atajos = vistasDelRol.filter(v => v.id !== 'profile').slice(0, 4);

    container.innerHTML = html`
      <div class="space-y-5 max-w-6xl">

        <!-- Encabezado: quién eres y con qué rol -->
        <section class="catalog-card bg-patrimonio-card dark:bg-stone-900 rounded-2xl shadow-sm border border-stone-300 dark:border-stone-600 p-5 md:p-6">
          <div class="flex flex-col md:flex-row md:items-center gap-5">
            <div class="w-20 h-20 md:w-24 md:h-24 rounded-2xl bg-patrimonio-madera text-white font-serif font-bold text-3xl md:text-4xl flex items-center justify-center mx-auto md:mx-0 shrink-0 shadow-sm"
              role="img" aria-label="Inicial de ${nombreMostrado}">${inicial}</div>

            <div class="min-w-0 flex-1 text-center md:text-left">
              <p class="text-[10px] font-black uppercase tracking-widest text-stone-500 dark:text-stone-400">Mi perfil</p>
              <h2 class="font-serif font-bold text-2xl text-stone-900 dark:text-stone-100 leading-tight mt-0.5">${nombreMostrado}</h2>
              <p class="text-sm text-stone-600 dark:text-stone-300 break-all">${correo}</p>
              <div class="flex flex-wrap items-center gap-2 mt-3 justify-center md:justify-start">
                <span class="stamp ${roleInfo.stamp || 'stamp-info'} !rotate-0">
                  <i aria-hidden="true" class="fas ${roleInfo.icon || 'fa-user'}"></i> ${roleInfo.title}
                </span>
                ${perfil.cargo ? html`<span class="stamp stamp-info !rotate-0"><i aria-hidden="true" class="fas fa-briefcase"></i> ${perfil.cargo}</span>` : ''}
                <span class="text-xs text-stone-500 dark:text-stone-400">
                  <i aria-hidden="true" class="fas fa-clock mr-1"></i>Último acceso: ${fechaHoraLegible(perfil.ultimo_acceso)}
                </span>
              </div>
            </div>

            <div class="shrink-0 rounded-xl border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800/60 px-4 py-3 text-center md:text-right">
              <p class="text-[10px] font-black uppercase tracking-widest text-stone-500 dark:text-stone-400">Antigüedad</p>
              <p class="font-serif text-2xl font-bold text-stone-900 dark:text-stone-100 tabular-nums">
                ${diasAlta === null ? '—' : diasAlta}
              </p>
              <p class="text-[11px] text-stone-500 dark:text-stone-400">día${diasAlta === 1 ? '' : 's'} en el sistema</p>
            </div>
          </div>
        </section>

        <div class="grid grid-cols-1 lg:grid-cols-3 gap-4">

          <!-- Columna principal: lo que se edita -->
          <div class="lg:col-span-2 space-y-4">

            <section class="catalog-card bg-patrimonio-card dark:bg-stone-900 rounded-2xl shadow-sm border border-stone-300 dark:border-stone-600" aria-labelledby="perfil-datos-title">
              <div class="catalog-card-header">
                <h3 id="perfil-datos-title" class="font-serif font-semibold text-lg text-stone-900 dark:text-stone-100 flex items-center gap-2">
                  <i aria-hidden="true" class="fas fa-id-badge text-patrimonio-madera"></i> Mis datos
                </h3>
              </div>
              <form id="perfil-form" class="p-5 space-y-4">
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  ${campo('perfil-nombre', 'Nombre completo', perfil.nombre, 'required autocomplete="name" placeholder="María Antileo Huenchumán"')}
                  ${campo('perfil-cargo', 'Cargo', perfil.cargo, 'autocomplete="organization-title" placeholder="Encargada de biblioteca"', 'Aparece junto a tu nombre en el menú.')}
                  ${campo('perfil-telefono', 'Teléfono de contacto', perfil.telefono, 'type="tel" inputmode="tel" autocomplete="tel" placeholder="9 1234 5678"', 'Uso interno. No se muestra a los lectores.')}
                  <div>
                    <label for="perfil-email" class="text-[11px] font-black uppercase tracking-wide text-stone-600 dark:text-stone-300 mb-1 block">Correo</label>
                    <input id="perfil-email" value="${correo}" readonly
                      class="w-full px-3 py-2 border border-stone-300 dark:border-stone-600 rounded-md bg-stone-50 dark:bg-stone-800/50 text-sm text-stone-500 dark:text-stone-400" />
                    <p class="text-[11px] text-stone-500 dark:text-stone-400 mt-1">Es la identidad de tu cuenta. Solo puede cambiarla un administrador desde Supabase.</p>
                  </div>
                </div>
                <div>
                  <label for="perfil-rol" class="text-[11px] font-black uppercase tracking-wide text-stone-600 dark:text-stone-300 mb-1 block">Rol</label>
                  <input id="perfil-rol" value="${roleInfo.title}" readonly
                    class="w-full px-3 py-2 border border-stone-300 dark:border-stone-600 rounded-md bg-stone-50 dark:bg-stone-800/50 text-sm text-stone-500 dark:text-stone-400" />
                  <p class="text-[11px] text-stone-500 dark:text-stone-400 mt-1">
                    Solo un administrador puede cambiar roles, desde Administración → Personal.
                    Tampoco puede hacerlo desde aquí quien tenga el rol: sería concederse permisos a sí mismo.
                  </p>
                </div>
                <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pt-1">
                  <p class="text-[11px] text-stone-500 dark:text-stone-400">
                    <i aria-hidden="true" class="fas fa-circle-info mr-1"></i>
                    Estos datos identifican quién registra cada préstamo en la bitácora.
                  </p>
                  <button type="submit" class="btn-madera text-white px-6 py-2.5 rounded-xl text-sm font-medium shadow">
                    <i aria-hidden="true" class="fas fa-floppy-disk mr-1.5"></i> Guardar cambios
                  </button>
                </div>
              </form>
            </section>

            <section class="catalog-card bg-patrimonio-card dark:bg-stone-900 rounded-2xl shadow-sm border border-stone-300 dark:border-stone-600" aria-labelledby="perfil-clave-title">
              <div class="catalog-card-header">
                <h3 id="perfil-clave-title" class="font-serif font-semibold text-lg text-stone-900 dark:text-stone-100 flex items-center gap-2">
                  <i aria-hidden="true" class="fas fa-key text-patrimonio-lago dark:text-stone-200"></i> Contraseña
                </h3>
              </div>
              <form id="password-form" class="p-5 space-y-4">
                <p class="text-xs text-stone-500 dark:text-stone-400">
                  Se pide la contraseña actual a propósito: el computador del mesón queda desatendido, y sin ese
                  paso cualquiera podría apropiarse de la cuenta abierta.
                </p>
                <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  ${campo('pass-actual', 'Contraseña actual', '', 'type="password" autocomplete="current-password" required')}
                  ${campo('pass-nueva', 'Contraseña nueva', '', 'type="password" autocomplete="new-password" required minlength="12" aria-describedby="pass-requisitos"')}
                  ${campo('pass-repetir', 'Repetir la nueva', '', 'type="password" autocomplete="new-password" required minlength="12"')}
                </div>
                <ul id="pass-requisitos" class="grid grid-cols-1 sm:grid-cols-3 gap-2 text-[11px]" aria-live="polite">
                  <li id="req-largo" class="flex items-center gap-2 text-stone-500 dark:text-stone-400">
                    <i aria-hidden="true" class="fas fa-circle-check w-3.5"></i> Al menos 12 caracteres
                  </li>
                  <li id="req-mayuscula" class="flex items-center gap-2 text-stone-500 dark:text-stone-400">
                    <i aria-hidden="true" class="fas fa-circle-check w-3.5"></i> Una letra mayúscula
                  </li>
                  <li id="req-numero" class="flex items-center gap-2 text-stone-500 dark:text-stone-400">
                    <i aria-hidden="true" class="fas fa-circle-check w-3.5"></i> Un número
                  </li>
                </ul>
                <p class="text-[11px] text-stone-500 dark:text-stone-400">
                  Es un sistema del Estado que trata datos personales de vecinos: por eso el mínimo es 12 caracteres,
                  con mayúscula y número, y no se acepta una contraseña igual a la anterior.
                </p>
                <div class="flex justify-end">
                  <button type="submit" class="bg-patrimonio-lago hover:bg-[#14303c] text-white px-6 py-2.5 rounded-xl text-sm font-medium shadow transition-colors">
                    <i aria-hidden="true" class="fas fa-shield-halved mr-1.5"></i> Cambiar contraseña
                  </button>
                </div>
              </form>
            </section>
          </div>

          <!-- Columna lateral: consulta y preferencias -->
          <div class="space-y-4">

            <section class="catalog-card bg-patrimonio-card dark:bg-stone-900 rounded-2xl shadow-sm border border-stone-300 dark:border-stone-600 p-5" aria-labelledby="perfil-actividad-title">
              <h3 id="perfil-actividad-title" class="font-serif font-semibold text-lg text-stone-900 dark:text-stone-100 mb-3 flex items-center gap-2">
                <i aria-hidden="true" class="fas fa-timeline text-patrimonio-bosque"></i> Actividad de la cuenta
              </h3>
              <dl class="space-y-2.5 text-sm">
                <div class="flex items-start justify-between gap-3">
                  <dt class="text-stone-500 dark:text-stone-400">Último acceso</dt>
                  <dd class="text-right text-stone-700 dark:text-stone-200 font-semibold">${fechaHoraLegible(perfil.ultimo_acceso)}</dd>
                </div>
                <div class="flex items-start justify-between gap-3">
                  <dt class="text-stone-500 dark:text-stone-400">Cuenta creada</dt>
                  <dd class="text-right text-stone-700 dark:text-stone-200 font-semibold">${fechaHoraLegible(perfil.creado_en)}</dd>
                </div>
                ${perfil.actualizado_en ? html`
                  <div class="flex items-start justify-between gap-3">
                    <dt class="text-stone-500 dark:text-stone-400">Perfil actualizado</dt>
                    <dd class="text-right text-stone-700 dark:text-stone-200 font-semibold">${fechaHoraLegible(perfil.actualizado_en)}</dd>
                  </div>` : ''}
              </dl>
            </section>

            <section class="catalog-card bg-patrimonio-card dark:bg-stone-900 rounded-2xl shadow-sm border border-stone-300 dark:border-stone-600 p-5" aria-labelledby="perfil-preferencias-title">
              <h3 id="perfil-preferencias-title" class="font-serif font-semibold text-lg text-stone-900 dark:text-stone-100 mb-3 flex items-center gap-2">
                <i aria-hidden="true" class="fas fa-palette text-patrimonio-madera"></i> Preferencias
              </h3>

              <p class="text-[11px] font-black uppercase tracking-wide text-stone-600 dark:text-stone-300 mb-1">Tamaño de letra</p>
              <p class="text-xs text-stone-500 dark:text-stone-400 mb-2">Agranda el texto de toda la aplicación. Queda guardado en este equipo.</p>
              <div class="flex items-center gap-2">
                <button id="fuente-menos-btn" type="button" aria-label="Reducir tamaño de letra"
                  class="w-11 h-11 shrink-0 rounded-xl border border-stone-300 dark:border-stone-600 bg-white dark:bg-stone-800 hover:border-patrimonio-lago text-stone-700 dark:text-stone-200 font-serif font-bold text-sm disabled:opacity-40 disabled:cursor-not-allowed">A-</button>
                <span id="fuente-nivel-texto" class="text-sm text-stone-600 dark:text-stone-300 font-bold flex-1 text-center"></span>
                <button id="fuente-mas-btn" type="button" aria-label="Aumentar tamaño de letra"
                  class="w-11 h-11 shrink-0 rounded-xl border border-stone-300 dark:border-stone-600 bg-white dark:bg-stone-800 hover:border-patrimonio-lago text-stone-700 dark:text-stone-200 font-serif font-bold text-lg disabled:opacity-40 disabled:cursor-not-allowed">A+</button>
              </div>
              <p id="fuente-vista-previa" class="mt-3 rounded-lg border border-dashed border-stone-300 dark:border-stone-600 px-3 py-2 text-stone-700 dark:text-stone-200">
                Este mismo texto es la vista previa: el cambio se aplica en toda la aplicación apenas lo eliges.
              </p>

              <hr class="my-4 border-stone-200 dark:border-stone-700" />

              <div class="flex items-start justify-between gap-3">
                <div>
                  <p class="text-sm font-bold text-stone-800 dark:text-stone-100">Modo oscuro</p>
                  <p class="text-xs text-stone-500 dark:text-stone-400">Útil en la ruta cuando se trabaja de noche.</p>
                </div>
                <button id="perfil-tema-btn" type="button" role="switch" aria-checked="false" aria-label="Activar o desactivar el modo oscuro"
                  class="w-12 h-7 rounded-full border border-stone-300 dark:border-stone-600 bg-stone-200 dark:bg-patrimonio-lago relative transition-colors shrink-0">
                  <span id="perfil-tema-bola" class="absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-transform">
                    <i aria-hidden="true" id="perfil-tema-icono" class="fas fa-moon text-[10px] text-stone-500 w-full h-full flex items-center justify-center"></i>
                  </span>
                </button>
              </div>
            </section>

            ${atajos.length ? html`
            <section class="catalog-card bg-patrimonio-card dark:bg-stone-900 rounded-2xl shadow-sm border border-stone-300 dark:border-stone-600 p-5" aria-labelledby="perfil-atajos-title">
              <h3 id="perfil-atajos-title" class="font-serif font-semibold text-lg text-stone-900 dark:text-stone-100 mb-3 flex items-center gap-2">
                <i aria-hidden="true" class="fas fa-bolt text-amber-700 dark:text-amber-400"></i> Accesos rápidos
              </h3>
              <div class="grid grid-cols-2 gap-2">
                ${atajos.map(v => html`
                  <button type="button" data-view="${v.id}"
                    class="perfil-atajo-btn flex flex-col items-center gap-1.5 rounded-xl border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800/60 px-2 py-3 text-xs font-bold text-stone-700 dark:text-stone-200 hover:border-patrimonio-lago hover:bg-white dark:hover:bg-stone-800 transition">
                    <i aria-hidden="true" class="fas ${v.icon} text-patrimonio-lago dark:text-stone-300"></i>
                    ${v.label}
                  </button>`)}
              </div>
            </section>` : ''}

            <section class="catalog-card bg-patrimonio-card dark:bg-stone-900 rounded-2xl shadow-sm border border-stone-300 dark:border-stone-600 p-5" aria-labelledby="perfil-sesion-title">
              <h3 id="perfil-sesion-title" class="font-serif font-semibold text-lg text-stone-900 dark:text-stone-100 mb-1 flex items-center gap-2">
                <i aria-hidden="true" class="fas fa-right-from-bracket text-rose-700 dark:text-rose-300"></i> Sesión
              </h3>
              <p class="text-xs text-stone-500 dark:text-stone-400 mb-3">
                La sesión se cierra sola tras 20 minutos sin actividad, porque el computador del mesón queda a la vista de quien pase.
                También puedes cerrarla ahora: el próximo turno tendrá que identificarse.
              </p>
              <button id="perfil-logout-btn" class="w-full border border-rose-200 dark:border-rose-900/60 bg-rose-50 dark:bg-rose-950/30 hover:bg-rose-100 dark:hover:bg-rose-900/40 text-rose-700 dark:text-rose-200 px-4 py-2 rounded-xl text-sm font-bold transition">
                <i aria-hidden="true" class="fas fa-right-from-bracket mr-1.5"></i> Cerrar sesión
              </button>
            </section>

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
    const listaRequisitos = {
      largo: document.getElementById('req-largo'),
      mayuscula: document.getElementById('req-mayuscula'),
      numero: document.getElementById('req-numero')
    };
    const marcarRequisito = (nodo, cumple) => {
      if (!nodo) return;
      nodo.classList.toggle('text-emerald-700', cumple);
      nodo.classList.toggle('dark:text-emerald-400', cumple);
      nodo.classList.toggle('font-semibold', cumple);
      nodo.classList.toggle('text-stone-500', !cumple);
      nodo.classList.toggle('dark:text-stone-400', !cumple);
      nodo.querySelector('i')?.classList.toggle('fa-circle-check', cumple);
      nodo.querySelector('i')?.classList.toggle('fa-circle', !cumple);
    };
    const revisarRequisitos = () => {
      const nueva = document.getElementById('pass-nueva');
      const valor = nueva ? nueva.value : '';
      marcarRequisito(listaRequisitos.largo, valor.length >= 12);
      marcarRequisito(listaRequisitos.mayuscula, /[A-Z]/.test(valor));
      marcarRequisito(listaRequisitos.numero, /[0-9]/.test(valor));
    };
    document.getElementById('pass-nueva').addEventListener('input', revisarRequisitos);
    revisarRequisitos();

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
        revisarRequisitos();
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

    // --- Accesos rápidos ---
    container.querySelectorAll('.perfil-atajo-btn').forEach(btn => {
      btn.addEventListener('click', () => this.switchView(btn.dataset.view));
    });

    // --- Tamaño de letra ---
    let indiceFuente = indiceEscalaActual();
    const nivelTexto = document.getElementById('fuente-nivel-texto');
    const vistaPrevia = document.getElementById('fuente-vista-previa');
    const actualizarNivelTexto = () => {
      const escala = ESCALAS_FUENTE[indiceFuente];
      if (nivelTexto) nivelTexto.textContent = `${escala.etiqueta} · ${escala.porcentaje}`;
      // No se le pone un tamaño propio a la vista previa: toda la aplicación
      // usa unidades rem y el tamaño raíz ya cambió al aplicar la escala, así
      // que este texto se ve exactamente igual que el resto de las pantallas.
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

    // --- Modo oscuro ---
    const botonTema = document.getElementById('perfil-tema-btn');
    const bolaTema = document.getElementById('perfil-tema-bola');
    const iconoTema = document.getElementById('perfil-tema-icono');
    const actualizarEstadoTema = () => {
      const oscuro = document.documentElement.classList.contains('dark');
      if (botonTema) {
        botonTema.setAttribute('aria-checked', String(oscuro));
        botonTema.classList.toggle('bg-patrimonio-lago', oscuro);
        botonTema.classList.toggle('bg-stone-200', !oscuro);
      }
      // La bolita conserva `left-0.5` siempre y se mueve con translate: quitar
      // y poner `left` hacía que en modo oscuro quedara en una posición
      // indeterminada según el ancho del botón.
      if (bolaTema) bolaTema.classList.toggle('translate-x-5', oscuro);
      if (iconoTema) {
        iconoTema.classList.toggle('fa-moon', !oscuro);
        iconoTema.classList.toggle('fa-sun', oscuro);
      }
    };
    actualizarEstadoTema();
    botonTema?.addEventListener('click', () => {
      // Se reutiliza el alternador del menú lateral (ui-base) para que el ícono
      // de la barra lateral y esta preferencia nunca digan cosas distintas.
      const alternadorGlobal = document.querySelector('.dark-mode-toggle');
      if (alternadorGlobal) {
        alternadorGlobal.click();
      } else {
        const oscuro = document.documentElement.classList.toggle('dark');
        try { localStorage.setItem('theme', oscuro ? 'dark' : 'light'); } catch (e) { /* preferencia no guardada */ }
      }
      actualizarEstadoTema();
    });
  }
};
