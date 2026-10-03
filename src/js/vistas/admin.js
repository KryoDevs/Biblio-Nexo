// Vista Administración. Extraído mecánicamente de js/modules/ui.js (Fase 4).
import { html, crudo } from '../modules/utilidades.js';
import { db } from '../modules/db.js';
import { ROLES_VALIDOS, infoRol } from '../config.js';


export default {
  async renderAdmin() {
    const container = this._container();
    if (!container) return;

    if (this.currentUserRole !== 'admin') {
      container.innerHTML = `<div class="catalog-card bg-patrimonio-card dark:bg-stone-900 rounded-2xl border border-stone-300 dark:border-stone-600 p-6 max-w-md">
        <p class="text-sm text-stone-600 dark:text-stone-300"><i aria-hidden="true" class="fas fa-lock mr-1.5"></i>Esta sección es solo para administradores.</p>
      </div>`;
      return;
    }

    const pestana = this.adminTab || 'inventario';
    const boton = (clave, texto, icono) => html`
      <button data-admin-tab="${clave}" class="admin-tab-btn px-3.5 py-1.5 rounded-lg text-xs font-bold border transition ${
        pestana === clave ? 'bg-patrimonio-lago text-white border-patrimonio-lago'
                          : 'bg-white dark:bg-stone-800 text-stone-600 dark:text-stone-300 border-stone-300 dark:border-stone-600 hover:border-patrimonio-lago'
      }"><i aria-hidden="true" class="fas ${icono} mr-1"></i>${texto}</button>`;

    container.innerHTML = html`
      <div class="flex flex-wrap gap-2 mb-4">
        ${boton('inventario', 'Inventario', 'fa-boxes-stacked')}
        ${boton('reservas', 'Reservas', 'fa-clock')}
        ${boton('bloqueados', 'Bloqueados', 'fa-user-lock')}
        ${boton('personal', 'Personal', 'fa-user-shield')}
        ${boton('enlaces', 'Enlaces remotos', 'fa-qrcode')}
        ${boton('eliminados', 'Eliminados', 'fa-trash-can-arrow-up')}
        ${boton('auditoria', 'Auditoría', 'fa-clipboard-list')}
        ${boton('cumplimiento', 'Cumplimiento', 'fa-scale-balanced')}
        ${boton('diagnostico', 'Diagnóstico', 'fa-heart-pulse')}
      </div>
      <div id="admin-panel"><div class="flex justify-center py-16"><i aria-hidden="true" class="fas fa-circle-notch fa-spin text-3xl text-patrimonio-lago"></i></div></div>
    `;

    container.querySelectorAll('.admin-tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this.adminTab = btn.dataset.adminTab;
        this.renderAdmin();
      });
    });

    const panel = document.getElementById('admin-panel');
    const pintores = {
      inventario: () => this._adminInventario(panel),
      reservas: () => this._adminReservas(panel),
      bloqueados: () => this._adminBloqueados(panel),
      personal: () => this._adminPersonal(panel),
      enlaces: () => this._adminEnlacesEscaneo(panel),
      eliminados: () => this._adminEliminados(panel),
      auditoria: () => this._adminAuditoria(panel),
      cumplimiento: () => this._adminCumplimiento(panel),
      diagnostico: () => this._adminDiagnostico(panel)
    };
    try {
      await (pintores[pestana] || pintores.inventario)();
    } catch (err) {
      panel.innerHTML = html`<div class="catalog-card bg-patrimonio-card dark:bg-stone-900 rounded-2xl border border-stone-300 dark:border-stone-600 p-6">
        <p class="text-sm text-stone-600 dark:text-stone-300">${err.message || 'No se pudo cargar la sección.'}</p></div>`;
    }
  },

  /** Detecta y corrige libros cuyo inventario no cuadra. */
  async _adminInventario(panel) {
    const filas = await db.revisarInventario();
    if (filas === null) {
      panel.innerHTML = this._avisoMigracion('006', '006_bloqueo_inventario_admin.sql');
      return;
    }

    if (filas.length === 0) {
      panel.innerHTML = `
        <div class="catalog-card bg-patrimonio-card dark:bg-stone-900 rounded-2xl shadow-sm border border-stone-300 dark:border-stone-600 p-6 text-center">
          <i aria-hidden="true" class="fas fa-circle-check text-3xl text-patrimonio-bosque mb-3"></i>
          <p class="font-serif font-semibold text-lg text-stone-900 dark:text-stone-100">El inventario cuadra</p>
          <p class="text-sm text-stone-500 dark:text-stone-400 mt-1">En todos los libros, los ejemplares disponibles más los prestados coinciden con el total registrado.</p>
        </div>`;
      return;
    }

    panel.innerHTML = html`
      <div class="catalog-card bg-patrimonio-card dark:bg-stone-900 rounded-2xl shadow-sm border border-stone-300 dark:border-stone-600 overflow-x-auto">
        <div class="catalog-card-header">
          <h3 class="font-serif font-semibold text-lg text-stone-900 dark:text-stone-100">${filas.length} libro${filas.length === 1 ? '' : 's'} con inventario descuadrado</h3>
          <p class="text-xs text-stone-500 dark:text-stone-400 mt-0.5">Los ejemplares disponibles más los prestados no coinciden con el total. Corregir recalcula las disponibles a partir de los préstamos reales.</p>
        </div>
        <table class="w-full text-sm">
          <thead class="bg-stone-50 dark:bg-stone-800/50 text-stone-500 dark:text-stone-400 uppercase text-[10px] font-black">
            <tr>
              <th class="text-left px-4 py-3">Libro</th>
              <th class="text-center px-4 py-3">Total</th>
              <th class="text-center px-4 py-3">Disponibles</th>
              <th class="text-center px-4 py-3">Prestados</th>
              <th class="text-center px-4 py-3">Diferencia</th>
              <th class="text-right px-4 py-3">Acción</th>
            </tr>
          </thead>
          <tbody>
            ${filas.map(f => html`
              <tr class="border-t border-stone-200 dark:border-stone-700">
                <td class="px-4 py-3">
                  <div class="font-bold text-stone-800 dark:text-stone-200">${f.titulo}</div>
                  <div class="text-[11px] font-mono text-stone-500 dark:text-stone-400">${f.isbn || 'sin ISBN'}</div>
                </td>
                <td class="px-4 py-3 text-center tabular-nums">${f.copias_totales}</td>
                <td class="px-4 py-3 text-center tabular-nums ${f.stock < 0 ? 'text-rose-700 font-bold' : ''}">${f.stock}</td>
                <td class="px-4 py-3 text-center tabular-nums">${f.prestados}</td>
                <td class="px-4 py-3 text-center"><span class="stamp stamp-danger !rotate-0">${f.diferencia > 0 ? '+' : ''}${f.diferencia}</span></td>
                <td class="px-4 py-3 text-right">
                  <button class="fix-inv-btn btn-secundario bg-patrimonio-madera text-white px-3 py-1.5 rounded-lg text-xs font-bold" data-id="${f.libro_id}">Corregir</button>
                </td>
              </tr>`)}
          </tbody>
        </table>
      </div>`;

    panel.querySelectorAll('.fix-inv-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        btn.disabled = true;
        try {
          const r = await db.corregirInventario(btn.dataset.id);
          this.showToast(`Corregido: ${r.copias_totales} ejemplares, ${r.stock} disponibles.`, 'success');
          this.renderAdmin();
        } catch (err) {
          this.showToast(err.message || 'No se pudo corregir.', 'error');
          btn.disabled = false;
        }
      });
    });
  },

  /**
   * Fila de espera de reservas (022_reservas.sql): quién está esperando cada
   * título, y —para quien ya tiene un ejemplar apartado— hasta cuándo tiene
   * plazo para retirarlo. Solo trae las vigentes ('activa'/'apartada'); una
   * reserva cumplida, cancelada o expirada ya no necesita que el personal
   * haga nada con ella.
   */
  async _adminReservas(panel) {
    const filas = await db.listarReservas();
    if (filas === null) {
      panel.innerHTML = this._avisoMigracion('022', '022_reservas.sql');
      return;
    }

    if (filas.length === 0) {
      panel.innerHTML = html`
        <div class="catalog-card bg-patrimonio-card dark:bg-stone-900 rounded-2xl shadow-sm border border-stone-300 dark:border-stone-600 p-6 text-center">
          <i aria-hidden="true" class="fas fa-circle-check text-3xl text-patrimonio-bosque mb-3"></i>
          <p class="font-serif font-semibold text-lg text-stone-900 dark:text-stone-100">No hay reservas pendientes</p>
          <p class="text-sm text-stone-500 dark:text-stone-400 mt-1">Nadie está esperando un libro en este momento.</p>
        </div>`;
      return;
    }

    panel.innerHTML = html`
      <div class="catalog-card bg-patrimonio-card dark:bg-stone-900 rounded-2xl shadow-sm border border-stone-300 dark:border-stone-600 overflow-x-auto">
        <div class="catalog-card-header">
          <h3 class="font-serif font-semibold text-lg text-stone-900 dark:text-stone-100">${filas.length} reserva${filas.length === 1 ? '' : 's'} vigente${filas.length === 1 ? '' : 's'}</h3>
          <p class="text-xs text-stone-500 dark:text-stone-400 mt-0.5">
            "Apartado" significa que el ejemplar ya está separado, físicamente en la biblioteca, esperando que lo
            retiren antes del plazo. "En fila" todavía no tiene un ejemplar propio: espera a que se devuelva uno.
          </p>
        </div>
        <table class="w-full text-sm">
          <thead class="bg-stone-50 dark:bg-stone-800/50 text-stone-500 dark:text-stone-400 uppercase text-[10px] font-black">
            <tr>
              <th class="text-left px-4 py-3">Libro</th>
              <th class="text-left px-4 py-3">Lector</th>
              <th class="text-center px-4 py-3">Situación</th>
              <th class="text-right px-4 py-3">Acción</th>
            </tr>
          </thead>
          <tbody>
            ${filas.map(f => html`
              <tr class="border-t border-stone-200 dark:border-stone-700">
                <td class="px-4 py-3">
                  <div class="font-bold text-stone-800 dark:text-stone-200">${f.libro_titulo || 'Sin título'}</div>
                  <div class="text-[11px] font-mono text-stone-500 dark:text-stone-400">${f.libro_isbn || 'sin ISBN'}</div>
                </td>
                <td class="px-4 py-3">
                  <div class="text-stone-800 dark:text-stone-200">${f.lector_nombre}</div>
                  <div class="text-[11px] font-mono text-stone-500 dark:text-stone-400">${f.lector_rut}</div>
                </td>
                <td class="px-4 py-3 text-center">
                  ${f.estado === 'apartada' ? html`
                    <span class="stamp stamp-success !rotate-0">Apartado</span>
                    <div class="text-[11px] text-stone-500 dark:text-stone-400 mt-1">Retirar antes del ${this._fechaHoraLegible(f.vence_apartado_en)}</div>`
                  : html`
                    <span class="stamp stamp-info !rotate-0">En fila</span>
                    <div class="text-[11px] text-stone-500 dark:text-stone-400 mt-1">Posición ${f.posicion_en_fila}</div>`}
                </td>
                <td class="px-4 py-3 text-right whitespace-nowrap space-x-2">
                  ${f.estado === 'apartada' ? html`
                    <button class="retirar-reserva-btn btn-secundario bg-patrimonio-bosque text-white px-3 py-1.5 rounded-lg text-xs font-bold" data-id="${f.reserva_id}">Retirar</button>` : ''}
                  <button class="cancelar-reserva-btn text-rose-700 font-bold" data-id="${f.reserva_id}">Cancelar</button>
                </td>
              </tr>`)}
          </tbody>
        </table>
      </div>`;

    panel.querySelectorAll('.retirar-reserva-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const ok = await this.showConfirm(
          '¿Confirmar que la persona retiró el ejemplar apartado? Esto registra un préstamo a su nombre.',
          { title: 'Retirar reserva', confirmText: 'Confirmar retiro', danger: false }
        );
        if (!ok) return;
        btn.disabled = true;
        try {
          await db.retirarReserva(btn.dataset.id);
          this.showToast('Retiro registrado: el préstamo ya quedó a nombre del lector.', 'success');
          this.renderAdmin();
        } catch (err) {
          this.showToast(err.message || 'No se pudo registrar el retiro.', 'error');
          btn.disabled = false;
        }
      });
    });

    panel.querySelectorAll('.cancelar-reserva-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const ok = await this.showConfirm(
          '¿Cancelar esta reserva? Si ya tenía un ejemplar apartado, pasa a quien sigue en la fila o vuelve a estar disponible para cualquiera.',
          { title: 'Cancelar reserva', confirmText: 'Cancelar reserva' }
        );
        if (!ok) return;
        btn.disabled = true;
        try {
          await db.cancelarReserva(btn.dataset.id);
          this.showToast('Reserva cancelada.', 'success');
          this.renderAdmin();
        } catch (err) {
          this.showToast(err.message || 'No se pudo cancelar la reserva.', 'error');
          btn.disabled = false;
        }
      });
    });
  },

  /** Lectores bloqueados manualmente, con opción de levantar la sanción. */
  async _adminBloqueados(panel) {
    const filas = await db.obtenerBloqueados();
    if (filas === null) {
      panel.innerHTML = this._avisoMigracion('006', '006_bloqueo_inventario_admin.sql');
      return;
    }

    panel.innerHTML = html`
      <div class="catalog-card bg-patrimonio-card dark:bg-stone-900 rounded-2xl shadow-sm border border-stone-300 dark:border-stone-600 overflow-x-auto">
        <div class="catalog-card-header">
          <h3 class="font-serif font-semibold text-lg text-stone-900 dark:text-stone-100">Lectores bloqueados</h3>
          <p class="text-xs text-stone-500 dark:text-stone-400 mt-0.5">Solo bloqueos administrativos. Los lectores con libros atrasados quedan suspendidos automáticamente y se liberan al devolver, sin aparecer en esta lista.</p>
        </div>
        ${filas.length === 0
          ? html`<p class="px-4 py-8 text-center text-sm text-stone-500 dark:text-stone-400">Ningún lector tiene bloqueo administrativo.</p>`
          : html`<table class="w-full text-sm">
              <thead class="bg-stone-50 dark:bg-stone-800/50 text-stone-500 dark:text-stone-400 uppercase text-[10px] font-black">
                <tr>
                  <th class="text-left px-4 py-3">Lector</th>
                  <th class="text-left px-4 py-3">Motivo</th>
                  <th class="text-left px-4 py-3">Desde</th>
                  <th class="text-right px-4 py-3">Acción</th>
                </tr>
              </thead>
              <tbody>
                ${filas.map(l => html`
                  <tr class="border-t border-stone-200 dark:border-stone-700">
                    <td class="px-4 py-3">
                      <div class="font-bold text-stone-800 dark:text-stone-200">${l.nombre}</div>
                      <div class="text-[11px] font-mono text-stone-500 dark:text-stone-400">${l.rut}</div>
                    </td>
                    <td class="px-4 py-3 text-stone-600 dark:text-stone-300">${l.motivo_bloqueo || '—'}</td>
                    <td class="px-4 py-3 text-stone-500 dark:text-stone-400 text-xs">${l.bloqueado_en ? this._fechaLegible(l.bloqueado_en.split('T')[0]) : '—'}</td>
                    <td class="px-4 py-3 text-right">
                      <button class="unblock-btn btn-secundario bg-patrimonio-bosque text-white px-3 py-1.5 rounded-lg text-xs font-bold" data-id="${l.id}">Desbloquear</button>
                    </td>
                  </tr>`)}
              </tbody>
            </table>`}
      </div>

      <div class="catalog-card bg-patrimonio-card dark:bg-stone-900 rounded-2xl shadow-sm border border-stone-300 dark:border-stone-600 mt-4 p-5 max-w-lg">
        <h3 class="font-serif font-semibold text-lg text-stone-900 dark:text-stone-100 mb-3">Bloquear un lector</h3>
        <div class="space-y-3">
          <div>
            <label for="block-rut" class="text-[11px] font-black uppercase tracking-wide text-stone-600 dark:text-stone-300 mb-1 block">RUT</label>
            <input id="block-rut" placeholder="12345678-5" class="w-full px-3 py-2 border border-stone-300 dark:border-stone-600 rounded-md bg-white dark:bg-stone-800 text-sm font-mono focus:outline-none focus:border-patrimonio-lago focus:ring-1 focus:ring-patrimonio-lago" />
          </div>
          <div>
            <label for="block-reason" class="text-[11px] font-black uppercase tracking-wide text-stone-600 dark:text-stone-300 mb-1 block">Motivo</label>
            <input id="block-reason" placeholder="Pérdida de ejemplar sin reposición" class="w-full px-3 py-2 border border-stone-300 dark:border-stone-600 rounded-md bg-white dark:bg-stone-800 text-sm focus:outline-none focus:border-patrimonio-lago focus:ring-1 focus:ring-patrimonio-lago" />
          </div>
          <button id="block-btn" class="btn-madera text-white font-medium rounded-xl shadow px-4 py-2.5 text-sm w-full">Bloquear lector</button>
        </div>
      </div>`;

    panel.querySelectorAll('.unblock-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const ok = await this.showConfirm('¿Levantar el bloqueo de este lector?', { title: 'Desbloquear', confirmText: 'Desbloquear', danger: false });
        if (!ok) return;
        try {
          await db.bloquearLector(btn.dataset.id, false);
          this.showToast('Lector desbloqueado.', 'success');
          this.renderAdmin();
        } catch (err) {
          this.showToast(err.message || 'No se pudo desbloquear.', 'error');
        }
      });
    });

    document.getElementById('block-btn').addEventListener('click', async e => {
      const rut = document.getElementById('block-rut').value.trim();
      const motivo = document.getElementById('block-reason').value.trim();
      if (!this.isValidRut(rut)) {
        this.showToast('El RUT no es válido. Revisa el dígito verificador.', 'error');
        return;
      }
      if (!motivo) {
        this.showToast('Escribe el motivo del bloqueo.', 'error');
        return;
      }
      const btn = e.currentTarget;
      btn.disabled = true;
      try {
        const estado = await db.estadoLector(this.formatRut(rut));
        if (!estado.existe) {
          this.showToast('Ese RUT no está registrado.', 'error');
          btn.disabled = false;
          return;
        }
        await db.bloquearLector(estado.lector_id, true, motivo);
        this.showToast(`${estado.nombre} quedó bloqueado.`, 'success');
        this.renderAdmin();
      } catch (err) {
        this.showToast(err.message || 'No se pudo bloquear.', 'error');
        btn.disabled = false;
      }
    });
  },

  /** Personal con acceso y sus roles. */
  async _adminPersonal(panel) {
    const filas = await db.listarPersonal();
    if (filas === null) {
      panel.innerHTML = this._avisoMigracion('006', '006_bloqueo_inventario_admin.sql');
      return;
    }

    panel.innerHTML = html`
      <div class="catalog-card bg-patrimonio-card dark:bg-stone-900 rounded-2xl shadow-sm border border-stone-300 dark:border-stone-600 overflow-x-auto">
        <div class="catalog-card-header">
          <h3 class="font-serif font-semibold text-lg text-stone-900 dark:text-stone-100">Personal con acceso</h3>
          <p class="text-xs text-stone-500 dark:text-stone-400 mt-0.5">Invita cuentas nuevas más abajo y asigna el rol de cada una aquí. El nombre y el cargo los completa cada persona en su propio perfil.</p>
        </div>
        <table class="w-full text-sm">
          <thead class="bg-stone-50 dark:bg-stone-800/50 text-stone-500 dark:text-stone-400 uppercase text-[10px] font-black">
            <tr>
              <th class="text-left px-4 py-3">Persona</th>
              <th class="text-left px-4 py-3">Rol</th>
              <th class="text-left px-4 py-3">Último acceso</th>
              <th class="text-right px-4 py-3">Cambiar a</th>
              <th class="text-right px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            ${filas.map(u => html`
              <tr class="border-t border-stone-200 dark:border-stone-700">
                <td class="px-4 py-3">
                  <div class="font-bold text-stone-800 dark:text-stone-200">${u.nombre || 'Sin nombre en su perfil'}</div>
                  <div class="text-xs text-stone-500 dark:text-stone-400">${u.email}</div>
                  ${u.cargo ? html`<div class="text-[11px] text-stone-500 dark:text-stone-400 italic">${u.cargo}</div>` : ''}
                </td>
                <td class="px-4 py-3">
                  <span class="stamp ${infoRol(u.rol).stamp} !rotate-0">
                    <i aria-hidden="true" class="fas ${infoRol(u.rol).icon}"></i> ${infoRol(u.rol).title}
                  </span>
                </td>
                <td class="px-4 py-3 text-stone-500 dark:text-stone-400 text-xs">${u.ultimo_acceso ? this._fechaLegible(u.ultimo_acceso.split('T')[0]) : 'Nunca'}</td>
                <td class="px-4 py-3 text-right">
                  <label class="sr-only" for="role-select-${u.usuario_id}">Cambiar rol de ${u.nombre || u.email}</label>
                  <select id="role-select-${u.usuario_id}" class="role-select role-btn w-full max-w-[11rem] px-2 py-1.5 rounded-lg border border-stone-300 dark:border-stone-600 bg-white dark:bg-stone-800 text-stone-700 dark:text-stone-200 text-xs font-bold"
                    data-id="${u.usuario_id}" data-current="${u.rol}">
                    <option value="librero" ${u.rol === 'librero' ? 'selected' : ''}>Librero</option>
                    <option value="bibliomovil" ${u.rol === 'bibliomovil' ? 'selected' : ''}>Bibliomóvil</option>
                    <option value="admin" ${u.rol === 'admin' ? 'selected' : ''}>Administrador</option>
                  </select>
                </td>
                <td class="px-4 py-3 text-right">
                  <button class="delete-personal-btn text-rose-700 hover:text-rose-800 p-1.5" title="Eliminar cuenta"
                    data-id="${u.usuario_id}" data-email="${u.email}">
                    <i aria-hidden="true" class="fas fa-trash"></i>
                  </button>
                </td>
              </tr>`)}
          </tbody>
        </table>
      </div>

      <div class="catalog-card bg-patrimonio-card dark:bg-stone-900 rounded-2xl shadow-sm border border-stone-300 dark:border-stone-600 mt-4 p-5 max-w-lg">
        <h3 class="font-serif font-semibold text-lg text-stone-900 dark:text-stone-100 mb-1">Invitar personal nuevo</h3>
        <p class="text-xs text-stone-500 dark:text-stone-400 mb-3">
          Manda una invitación por correo con el rol ya asignado. La persona la acepta, crea su contraseña y
          queda con acceso de inmediato — sin pasar por el panel de Supabase.
        </p>
        <div class="space-y-3">
          <div>
            <label for="invite-email" class="text-[11px] font-black uppercase tracking-wide text-stone-600 dark:text-stone-300 mb-1 block">Correo</label>
            <input id="invite-email" type="email" placeholder="nombre@ejemplo.cl" class="w-full px-3 py-2 border border-stone-300 dark:border-stone-600 rounded-md bg-white dark:bg-stone-800 text-sm focus:outline-none focus:border-patrimonio-lago focus:ring-1 focus:ring-patrimonio-lago" />
          </div>
          <div>
            <label for="invite-rol" class="text-[11px] font-black uppercase tracking-wide text-stone-600 dark:text-stone-300 mb-1 block">Rol</label>
            <select id="invite-rol" class="w-full px-3 py-2 border border-stone-300 dark:border-stone-600 rounded-md bg-white dark:bg-stone-800 text-sm focus:outline-none focus:border-patrimonio-lago focus:ring-1 focus:ring-patrimonio-lago">
              <option value="librero">Librero — mesón y sede</option>
              <option value="bibliomovil">Bibliomóvil — operación en ruta</option>
              <option value="admin">Administrador — gestión completa</option>
            </select>
          </div>
          <button id="invite-btn" class="btn-madera text-white font-medium rounded-xl shadow px-4 py-2.5 text-sm w-full">
            <i aria-hidden="true" class="fas fa-paper-plane mr-1.5"></i> Enviar invitación
          </button>
        </div>
      </div>`;

    document.getElementById('invite-btn').addEventListener('click', async e => {
      const email = document.getElementById('invite-email').value.trim();
      const rol = document.getElementById('invite-rol').value;
      // BUG-08: Se usa isValidEmail (regex) en vez de includes('@'), que
      // aceptaba strings inválidos como '@', 'a@' o '@dominio'.
      if (!email || !this.isValidEmail(email)) {
        this.showToast('Escribe un correo válido.', 'error');
        return;
      }
      if (!ROLES_VALIDOS.includes(rol)) {
        this.showToast('Elige un rol válido.', 'error');
        return;
      }
      const btn = e.currentTarget;
      btn.disabled = true;
      try {
        await db.invitarPersonal(email, rol);
        this.showToast(`Invitación enviada a ${email}.`, 'success');
        document.getElementById('invite-email').value = '';
        this.renderAdmin();
      } catch (err) {
        this.showToast(err.message || 'No se pudo enviar la invitación.', 'error');
        btn.disabled = false;
      }
    });

    panel.querySelectorAll('.role-select').forEach(sel => {
      sel.addEventListener('change', async () => {
        const nuevoRol = sel.value;
        const actual = sel.dataset.current;
        if (nuevoRol === actual) return;
        const etiqueta = infoRol(nuevoRol).title;
        const ok = await this.showConfirm(
          `¿Cambiar el rol de esta cuenta a ${etiqueta}?`,
          { title: 'Cambiar rol', confirmText: 'Cambiar', danger: nuevoRol === 'admin' }
        );
        if (!ok) {
          sel.value = actual;
          return;
        }
        try {
          await db.asignarRol(sel.dataset.id, nuevoRol);
          this.showToast(`Rol actualizado a ${etiqueta}.`, 'success');
          this.renderAdmin();
        } catch (err) {
          sel.value = actual;
          this.showToast(err.message || 'No se pudo cambiar el rol.', 'error');
        }
      });
    });

    panel.querySelectorAll('.delete-personal-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const ok = await this.showConfirm(
          `¿Eliminar por completo la cuenta de ${btn.dataset.email}? Pierde acceso al sistema de inmediato y no puede deshacerse.`,
          { title: 'Eliminar cuenta', confirmText: 'Eliminar' }
        );
        if (!ok) return;
        btn.disabled = true;
        try {
          await db.eliminarPersonal(btn.dataset.id);
          this.showToast('Cuenta eliminada.', 'success');
          this.renderAdmin();
        } catch (err) {
          this.showToast(err.message || 'No se pudo eliminar la cuenta.', 'error');
          btn.disabled = false;
        }
      });
    });
  },

  /**
   * Enlaces de escaneo remoto sin sesión (ver ui-base.js, showQrRemotoModal,
   * y 010_consolidacion.sql, sección «ESCANEO REMOTO SIN SESIÓN»). Cualquiera
   * del personal puede generar uno desde Mesón; aquí un administrador ve
   * todos los que existen y puede revocar cualquiera, no solo los propios.
   */
  async _adminEnlacesEscaneo(panel) {
    const filas = await db.listarEnlacesEscaneo();
    if (filas === null) {
      panel.innerHTML = this._avisoMigracion('014', '014_enlaces_escaneo_remoto.sql');
      return;
    }

    if (filas.length === 0) {
      panel.innerHTML = html`
        <div class="catalog-card bg-patrimonio-card dark:bg-stone-900 rounded-2xl shadow-sm border border-stone-300 dark:border-stone-600 p-6 max-w-lg">
          <h3 class="font-serif font-semibold text-lg text-stone-900 dark:text-stone-100 mb-1">Enlaces de escaneo remoto</h3>
          <p class="text-sm text-stone-600 dark:text-stone-300">Nadie ha generado un enlace todavía. Se crean desde Mesón, con el botón
            «Escanear desde el celular».</p>
        </div>`;
      return;
    }

    panel.innerHTML = html`
      <div class="catalog-card bg-patrimonio-card dark:bg-stone-900 rounded-2xl shadow-sm border border-stone-300 dark:border-stone-600 overflow-x-auto">
        <div class="catalog-card-header">
          <h3 class="font-serif font-semibold text-lg text-stone-900 dark:text-stone-100">Enlaces de escaneo remoto</h3>
          <p class="text-xs text-stone-500 dark:text-stone-400 mt-0.5">
            Cada uno permite agregar o reponer libros sin iniciar sesión, hasta que vence o se revoca. Se generan
            desde Mesón, con el botón «Escanear desde el celular». Los últimos 200, del más nuevo al más antiguo.
          </p>
        </div>
        <table class="w-full text-sm">
          <thead class="bg-stone-50 dark:bg-stone-800/50 text-stone-500 dark:text-stone-400 uppercase text-[10px] font-black">
            <tr>
              <th class="text-left px-4 py-3">Generado por</th>
              <th class="text-left px-4 py-3">Vence</th>
              <th class="text-left px-4 py-3">Estado</th>
              <th class="text-left px-4 py-3">Usos</th>
              <th class="text-right px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            ${filas.map(e => html`
              <tr class="border-t border-stone-200 dark:border-stone-700">
                <td class="px-4 py-3">
                  <div class="text-xs text-stone-500 dark:text-stone-400">${e.creado_por_email || 'Cuenta eliminada'}</div>
                  <div class="text-[11px] text-stone-500 dark:text-stone-400">${this._fechaHoraLegible(e.creado_en)}</div>
                </td>
                <td class="px-4 py-3 text-stone-600 dark:text-stone-300 text-xs">${this._fechaHoraLegible(e.expira_en)}</td>
                <td class="px-4 py-3">
                  ${e.vigente
                    ? '<span class="stamp stamp-success !rotate-0"><i aria-hidden="true" class="fas fa-check"></i> Vigente</span>'
                    : e.revocado
                      ? '<span class="stamp stamp-danger !rotate-0"><i aria-hidden="true" class="fas fa-ban"></i> Revocado</span>'
                      : '<span class="stamp !rotate-0 bg-stone-200 text-stone-600 dark:text-stone-300"><i aria-hidden="true" class="fas fa-clock"></i> Vencido</span>'}
                </td>
                <td class="px-4 py-3 text-stone-600 dark:text-stone-300 text-xs">
                  ${e.usos}${e.ultimo_uso_en ? html`<div class="text-[11px] text-stone-500 dark:text-stone-400">último: ${this._fechaHoraLegible(e.ultimo_uso_en)}</div>` : ''}
                </td>
                <td class="px-4 py-3 text-right">
                  ${e.vigente ? html`
                    <button class="revocar-enlace-btn text-rose-700 hover:text-rose-800 p-1.5" title="Revocar enlace"
                      data-id="${e.id}">
                      <i aria-hidden="true" class="fas fa-ban"></i>
                    </button>` : ''}
                </td>
              </tr>`)}
          </tbody>
        </table>
      </div>`;

    panel.querySelectorAll('.revocar-enlace-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const ok = await this.showConfirm(
          '¿Revocar este enlace? Deja de servir de inmediato, aunque alguien lo tenga guardado.',
          { title: 'Revocar enlace', confirmText: 'Revocar' }
        );
        if (!ok) return;
        btn.disabled = true;
        try {
          await db.revocarEnlaceEscaneo(btn.dataset.id);
          this.showToast('Enlace revocado.', 'success');
          this.renderAdmin();
        } catch (err) {
          this.showToast(err.message || 'No se pudo revocar el enlace.', 'error');
          btn.disabled = false;
        }
      });
    });
  },

  /**
   * Papelera de libros (migración 021, `eliminar_libro()` de la 020): libros
   * eliminados del catálogo que todavía se pueden restaurar. Lee la foto que
   * ya guarda `auditoria` de cada borrado — no hay ninguna tabla nueva.
   */
  async _adminEliminados(panel) {
    const filas = await db.listarLibrosEliminados();
    if (filas === null) {
      panel.innerHTML = this._avisoMigracion('021', '021_papelera_libros.sql');
      return;
    }

    if (filas.length === 0) {
      panel.innerHTML = html`
        <div class="catalog-card bg-patrimonio-card dark:bg-stone-900 rounded-2xl shadow-sm border border-stone-300 dark:border-stone-600 p-6 max-w-lg">
          <h3 class="font-serif font-semibold text-lg text-stone-900 dark:text-stone-100 mb-1">Libros eliminados</h3>
          <p class="text-sm text-stone-600 dark:text-stone-300">Ningún libro eliminado del catálogo está pendiente de restaurar.</p>
        </div>`;
      return;
    }

    panel.innerHTML = html`
      <div class="catalog-card bg-patrimonio-card dark:bg-stone-900 rounded-2xl shadow-sm border border-stone-300 dark:border-stone-600 overflow-x-auto">
        <div class="catalog-card-header">
          <h3 class="font-serif font-semibold text-lg text-stone-900 dark:text-stone-100">Libros eliminados</h3>
          <p class="text-xs text-stone-500 dark:text-stone-400 mt-0.5">
            Se pueden restaurar tal como quedaron justo antes de eliminarse — título, autor, ejemplares y todo su
            historial de préstamos, reenganchado.
          </p>
        </div>
        <table class="w-full text-sm">
          <thead class="bg-stone-50 dark:bg-stone-800/50 text-stone-500 dark:text-stone-400 uppercase text-[10px] font-black">
            <tr>
              <th class="text-left px-4 py-3">Libro</th>
              <th class="text-center px-4 py-3">Ejemplares</th>
              <th class="text-left px-4 py-3">Eliminado</th>
              <th class="text-right px-4 py-3">Acción</th>
            </tr>
          </thead>
          <tbody>
            ${filas.map(f => html`
              <tr class="border-t border-stone-200 dark:border-stone-700">
                <td class="px-4 py-3">
                  <div class="font-bold text-stone-800 dark:text-stone-200">${f.titulo || 'Sin título'}</div>
                  <div class="text-xs text-stone-500 dark:text-stone-400">${f.autor || ''}</div>
                  <div class="text-[11px] font-mono text-stone-500 dark:text-stone-400">${f.isbn || 'sin ISBN'}</div>
                </td>
                <td class="px-4 py-3 text-center tabular-nums">${f.copias_totales ?? '—'}</td>
                <td class="px-4 py-3 text-stone-500 dark:text-stone-400 text-xs">
                  ${this._fechaHoraLegible(f.eliminado_en)}
                  ${f.eliminado_por ? html`<div class="text-[11px] text-stone-500 dark:text-stone-400">${f.eliminado_por}</div>` : ''}
                </td>
                <td class="px-4 py-3 text-right">
                  <button class="restore-book-btn btn-secundario bg-patrimonio-bosque text-white px-3 py-1.5 rounded-lg text-xs font-bold" data-id="${f.libro_id}">Restaurar</button>
                </td>
              </tr>`)}
          </tbody>
        </table>
      </div>`;

    panel.querySelectorAll('.restore-book-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const ok = await this.showConfirm(
          '¿Restaurar este libro? Vuelve al catálogo con sus ejemplares y su historial de préstamos.',
          { title: 'Restaurar libro', confirmText: 'Restaurar', danger: false }
        );
        if (!ok) return;
        btn.disabled = true;
        try {
          await db.restaurarLibro(btn.dataset.id);
          this.showToast('Libro restaurado.', 'success');
          this.renderAdmin();
        } catch (err) {
          this.showToast(err.message || 'No se pudo restaurar.', 'error');
          btn.disabled = false;
        }
      });
    });
  },

  /** Bitácora de movimientos registrada por los triggers. */
  async _adminAuditoria(panel) {
    const filas = await db.obtenerAuditoria(100);
    if (filas === null) {
      panel.innerHTML = this._avisoMigracion('005', '005_renovaciones_auditoria_busqueda.sql');
      return;
    }

    // Los tres valores conocidos ya son HTML de confianza (marcado a mano);
    // el respaldo escapa por si alguna vez aparece un valor inesperado.
    const accion = a => crudo(({
      INSERT: '<span class="stamp stamp-success !rotate-0"><i aria-hidden="true" class="fas fa-plus"></i> Creó</span>',
      UPDATE: '<span class="stamp stamp-info !rotate-0"><i aria-hidden="true" class="fas fa-pen"></i> Modificó</span>',
      DELETE: '<span class="stamp stamp-danger !rotate-0"><i aria-hidden="true" class="fas fa-trash"></i> Eliminó</span>'
    })[a] || String(a ?? ''));

    panel.innerHTML = html`
      <div class="catalog-card bg-patrimonio-card dark:bg-stone-900 rounded-2xl shadow-sm border border-stone-300 dark:border-stone-600 overflow-x-auto">
        <div class="catalog-card-header">
          <h3 class="font-serif font-semibold text-lg text-stone-900 dark:text-stone-100">Últimos movimientos</h3>
          <p class="text-xs text-stone-500 dark:text-stone-400 mt-0.5">Se registra automáticamente en la base de datos, incluso si alguien escribe directo en las tablas.</p>
        </div>
        ${filas.length === 0
          ? html`<p class="px-4 py-8 text-center text-sm text-stone-500 dark:text-stone-400">Todavía no hay movimientos registrados.</p>`
          : html`<table class="w-full text-sm">
              <thead class="bg-stone-50 dark:bg-stone-800/50 text-stone-500 dark:text-stone-400 uppercase text-[10px] font-black">
                <tr>
                  <th class="text-left px-4 py-3">Cuándo</th>
                  <th class="text-left px-4 py-3">Quién</th>
                  <th class="text-left px-4 py-3">Qué hizo</th>
                  <th class="text-left px-4 py-3">Dónde</th>
                </tr>
              </thead>
              <tbody>
                ${filas.map(f => html`
                  <tr class="border-t border-stone-200 dark:border-stone-700">
                    <td class="px-4 py-3 text-stone-500 dark:text-stone-400 text-xs whitespace-nowrap">
                      ${new Date(f.created_at).toLocaleString('es-CL', { timeZone: 'America/Santiago', dateStyle: 'short', timeStyle: 'short' })}
                    </td>
                    <td class="px-4 py-3 text-stone-700 text-xs">${f.usuario_email || 'sistema'}</td>
                    <td class="px-4 py-3">${accion(f.accion)}</td>
                    <td class="px-4 py-3 text-stone-500 dark:text-stone-400 text-xs">${f.tabla} <span class="text-stone-300">#${f.registro_id || '?'}</span></td>
                  </tr>`)}
              </tbody>
            </table>`}
      </div>`;
  },

  /**
   * Cumplimiento legal: derechos del titular (Ley 21.719), verificación de
   * seguridad y evidencia para reporte de incidentes (Ley 21.663).
   */
  async _adminCumplimiento(panel) {
    const [rls, parametros, circulacion, respaldos] = await Promise.all([
      db.verificarRls(), db.obtenerParametros(), db.verificarCirculacion(), db.obtenerRespaldos(5)
    ]);

    if (rls === null || parametros === null) {
      panel.innerHTML = this._avisoMigracion('007', '007_correcciones_y_cumplimiento_legal.sql');
      return;
    }

    const problemas = rls.filter(r => r.diagnostico !== 'Correcto');
    const rotas = (circulacion || []).filter(f => !f.es_definer);
    const ultimoRespaldo = respaldos[0] || null;

    panel.innerHTML = html`
      <div class="space-y-4">

        <!-- Respaldo automático -->
        <div class="catalog-card bg-patrimonio-card dark:bg-stone-900 rounded-2xl shadow-sm border ${ultimoRespaldo && !ultimoRespaldo.ok ? 'border-rose-300' : 'border-stone-300 dark:border-stone-600'} overflow-hidden">
          <div class="catalog-card-header">
            <h3 class="font-serif font-semibold text-lg text-stone-900 dark:text-stone-100">Respaldo automático</h3>
            <p class="text-xs text-stone-500 dark:text-stone-400 mt-0.5">
              Una tarea programada (pg_cron) corre todos los días a las 03:00-04:00, hora de Chile, y sube una
              copia completa de los datos a un almacenamiento privado, sin que nadie tenga que apretar un botón.
            </p>
          </div>
          ${respaldos.length === 0 ? html`
            <p class="px-4 py-6 text-center text-sm text-stone-500 dark:text-stone-400">
              Todavía no hay ninguna corrida registrada. Si la migración
              <code class="bg-stone-100 dark:bg-stone-700 px-1.5 py-0.5 rounded text-xs font-mono">018_respaldo_automatico.sql</code>
              recién se aplicó, la primera corrida real llega en la próxima ventana programada.
            </p>` : html`
            <div class="px-4 py-3 border-b border-stone-200 dark:border-stone-700 ${ultimoRespaldo.ok ? 'bg-patrimonio-bosque/5' : 'bg-rose-50'}">
              <p class="text-sm font-bold ${ultimoRespaldo.ok ? 'text-patrimonio-bosque' : 'text-rose-800'}">
                <i aria-hidden="true" class="fas ${ultimoRespaldo.ok ? 'fa-circle-check' : 'fa-triangle-exclamation'} mr-1.5"></i>
                Último respaldo: ${ultimoRespaldo.ok ? 'correcto' : 'falló'}, ${this._fechaLegible(ultimoRespaldo.ejecutado_en.split('T')[0])}
              </p>
              ${!ultimoRespaldo.ok && ultimoRespaldo.mensaje ? html`<p class="text-xs text-rose-700 mt-1">${ultimoRespaldo.mensaje}</p>` : ''}
            </div>
            <table class="w-full text-sm">
              <thead class="bg-stone-50 dark:bg-stone-800/50 text-stone-500 dark:text-stone-400 uppercase text-[10px] font-black">
                <tr>
                  <th class="text-left px-4 py-3">Fecha</th>
                  <th class="text-center px-4 py-3">Estado</th>
                  <th class="text-right px-4 py-3">Tamaño</th>
                </tr>
              </thead>
              <tbody>
                ${respaldos.map(r => html`
                  <tr class="border-t border-stone-200 dark:border-stone-700">
                    <td class="px-4 py-3 text-stone-600 dark:text-stone-300 text-xs">${new Date(r.ejecutado_en).toLocaleString('es-CL')}</td>
                    <td class="px-4 py-3 text-center">${r.ok
                      ? crudo('<i aria-hidden="true" class="fas fa-circle-check text-patrimonio-bosque"></i>')
                      : crudo('<i aria-hidden="true" class="fas fa-circle-xmark text-rose-700"></i>')}</td>
                    <td class="px-4 py-3 text-right text-stone-500 dark:text-stone-400 text-xs tabular-nums">${r.bytes ? `${(r.bytes / 1024).toFixed(1)} KB` : '—'}</td>
                  </tr>`)}
              </tbody>
            </table>`}
        </div>

        <!-- Seguridad de acceso a los datos -->
        <div class="catalog-card bg-patrimonio-card dark:bg-stone-900 rounded-2xl shadow-sm border ${problemas.length ? 'border-rose-300' : 'border-stone-300 dark:border-stone-600'} shadow-sm overflow-hidden">
          <div class="catalog-card-header">
            <h3 class="font-serif font-semibold text-lg text-stone-900 dark:text-stone-100">Protección de las tablas</h3>
            <p class="text-xs text-stone-500 dark:text-stone-400 mt-0.5">Sin RLS, cualquiera con la clave pública puede leer y escribir desde la consola del navegador. Ocultar botones no protege nada.</p>
          </div>
          ${problemas.length ? html`
            <div class="bg-rose-50 border-b border-rose-200 px-4 py-3">
              <p class="text-sm font-bold text-rose-800"><i aria-hidden="true" class="fas fa-triangle-exclamation mr-1.5"></i>${problemas.length} tabla${problemas.length === 1 ? '' : 's'} sin protección adecuada</p>
            </div>` : ''}
          <table class="w-full text-sm">
            <thead class="bg-stone-50 dark:bg-stone-800/50 text-stone-500 dark:text-stone-400 uppercase text-[10px] font-black">
              <tr>
                <th class="text-left px-4 py-3">Tabla</th>
                <th class="text-center px-4 py-3">RLS</th>
                <th class="text-center px-4 py-3">Políticas</th>
                <th class="text-left px-4 py-3">Diagnóstico</th>
              </tr>
            </thead>
            <tbody>
              ${rls.map(r => html`
                <tr class="border-t border-stone-200 dark:border-stone-700">
                  <td class="px-4 py-3 font-mono text-stone-700">${r.tabla}</td>
                  <td class="px-4 py-3 text-center">${r.rls_activo
                    ? crudo('<i aria-hidden="true" class="fas fa-circle-check text-patrimonio-bosque"></i>')
                    : crudo('<i aria-hidden="true" class="fas fa-circle-xmark text-rose-700"></i>')}</td>
                  <td class="px-4 py-3 text-center tabular-nums">${r.politicas}</td>
                  <td class="px-4 py-3 text-xs ${r.diagnostico === 'Correcto' ? 'text-stone-500 dark:text-stone-400' : 'text-rose-700 font-bold'}">${r.diagnostico}</td>
                </tr>`)}
            </tbody>
          </table>
        </div>

        <!-- Circulación: comprueba que el personal pueda de verdad trabajar -->
        ${circulacion === null ? html`
          <div class="catalog-card bg-patrimonio-card dark:bg-stone-900 rounded-2xl shadow-sm border border-amber-300 p-5">
            <h3 class="font-serif font-semibold text-lg text-stone-900 dark:text-stone-100 mb-1">Funciones de circulación</h3>
            <p class="text-sm text-stone-600 dark:text-stone-300">
              Falta ejecutar la migración <code class="bg-stone-100 dark:bg-stone-700 px-1.5 py-0.5 rounded text-xs font-mono">008_perfiles_y_permisos_librero.sql</code>.
              Hasta entonces no se puede comprobar si el personal con rol librero puede prestar y devolver libros.
            </p>
          </div>` : html`
          <div class="catalog-card bg-patrimonio-card dark:bg-stone-900 rounded-2xl shadow-sm border ${rotas.length ? 'border-rose-300' : 'border-stone-300 dark:border-stone-600'} overflow-hidden">
            <div class="catalog-card-header">
              <h3 class="font-serif font-semibold text-lg text-stone-900 dark:text-stone-100">Funciones de circulación</h3>
              <p class="text-xs text-stone-500 dark:text-stone-400 mt-0.5">
                Las funciones que escriben deben declararse SECURITY DEFINER. Si no, las mismas políticas RLS
                que protegen las tablas bloquean la escritura, y un préstamo o una devolución pueden fallar
                <span class="font-bold">sin mostrar ningún error</span>: la pantalla dice que se guardó y la base de datos no cambia.
              </p>
            </div>
            ${rotas.length ? html`
              <div class="bg-rose-50 border-b border-rose-200 px-4 py-3">
                <p class="text-sm font-bold text-rose-800"><i aria-hidden="true" class="fas fa-triangle-exclamation mr-1.5"></i>${rotas.length} función${rotas.length === 1 ? '' : 'es'} en riesgo: el rol librero no podrá operar</p>
              </div>` : ''}
            <table class="w-full text-sm">
              <thead class="bg-stone-50 dark:bg-stone-800/50 text-stone-500 dark:text-stone-400 uppercase text-[10px] font-black">
                <tr>
                  <th class="text-left px-4 py-3">Función</th>
                  <th class="text-center px-4 py-3">Definer</th>
                  <th class="text-left px-4 py-3">Diagnóstico</th>
                </tr>
              </thead>
              <tbody>
                ${circulacion.map(f => html`
                  <tr class="border-t border-stone-200 dark:border-stone-700">
                    <td class="px-4 py-3 font-mono text-stone-700">${f.funcion}</td>
                    <td class="px-4 py-3 text-center">${f.es_definer
                      ? crudo('<i aria-hidden="true" class="fas fa-circle-check text-patrimonio-bosque"></i>')
                      : crudo('<i aria-hidden="true" class="fas fa-circle-xmark text-rose-700"></i>')}</td>
                    <td class="px-4 py-3 text-xs ${f.es_definer ? 'text-stone-500 dark:text-stone-400' : 'text-rose-700 font-bold'}">${f.diagnostico}</td>
                  </tr>`)}
              </tbody>
            </table>
          </div>`}

        <!-- Derechos del titular -->
        <div class="catalog-card bg-patrimonio-card dark:bg-stone-900 rounded-2xl shadow-sm border border-stone-300 dark:border-stone-600 p-5">
          <h3 class="font-serif font-semibold text-lg text-stone-900 dark:text-stone-100">Derechos del titular</h3>
          <p class="text-xs text-stone-500 dark:text-stone-400 mt-0.5 mb-4">
            La Ley 21.719 rige desde el 1 de diciembre de 2026. Un lector puede pedir acceder a sus datos,
            recibirlos en formato reutilizable o solicitar su eliminación. Deja constancia de cada solicitud.
          </p>
          <div class="space-y-3 max-w-md">
            <div>
              <label for="arco-rut" class="text-[11px] font-black uppercase tracking-wide text-stone-600 dark:text-stone-300 mb-1 block">RUT del solicitante</label>
              <input id="arco-rut" placeholder="12345678-5" class="w-full px-3 py-2 border border-stone-300 dark:border-stone-600 rounded-md bg-white dark:bg-stone-800 text-sm font-mono focus:outline-none focus:border-patrimonio-lago" />
            </div>
            <div class="flex flex-wrap gap-2">
              <button id="arco-export-btn" class="btn-secundario border border-stone-300 dark:border-stone-600 bg-white dark:bg-stone-800 text-stone-700 px-4 py-2 rounded-xl text-sm font-medium">
                <i aria-hidden="true" class="fas fa-download mr-1.5"></i> Entregar sus datos
              </button>
              <button id="arco-delete-btn" class="btn-secundario bg-rose-700 hover:bg-rose-800 text-white px-4 py-2 rounded-xl text-sm font-medium">
                <i aria-hidden="true" class="fas fa-user-slash mr-1.5"></i> Suprimir datos
              </button>
            </div>
            <p class="text-[11px] text-stone-500 dark:text-stone-400">
              La supresión borra nombre, RUT y contacto, y conserva el registro estadístico del préstamo sin
              vincularlo a una persona. Es la forma de cumplir el derecho de supresión sin perder la constancia
              de gestión que exige la Ley 20.285 de Transparencia.
            </p>
          </div>
        </div>

        <!-- Conservación -->
        <div class="catalog-card bg-patrimonio-card dark:bg-stone-900 rounded-2xl shadow-sm border border-stone-300 dark:border-stone-600 p-5">
          <h3 class="font-serif font-semibold text-lg text-stone-900 dark:text-stone-100">Plazo de conservación</h3>
          <p class="text-xs text-stone-500 dark:text-stone-400 mt-0.5 mb-4">
            No se pueden conservar datos identificables más tiempo del necesario para la finalidad declarada.
            Esta acción anonimiza a los lectores sin actividad en el plazo configurado.
          </p>
          <button id="purge-btn" class="btn-secundario border border-stone-300 dark:border-stone-600 bg-white dark:bg-stone-800 text-stone-700 px-4 py-2 rounded-xl text-sm font-medium">
            <i aria-hidden="true" class="fas fa-broom mr-1.5"></i> Ejecutar purga por antigüedad
          </button>
        </div>

        <!-- Evidencia de incidentes -->
        <div class="catalog-card bg-patrimonio-card dark:bg-stone-900 rounded-2xl shadow-sm border border-stone-300 dark:border-stone-600 p-5">
          <h3 class="font-serif font-semibold text-lg text-stone-900 dark:text-stone-100">Evidencia para reporte de incidente</h3>
          <p class="text-xs text-stone-500 dark:text-stone-400 mt-0.5 mb-4">
            La Ley 21.663 obliga a las municipalidades a dar alerta temprana en 3 horas e informe inicial en 72.
            Esto extrae la actividad del período para adjuntar al reporte al CSIRT Nacional.
          </p>
          <div class="flex flex-wrap gap-2 items-end">
            <div>
              <label for="ev-desde" class="text-[11px] font-black uppercase tracking-wide text-stone-600 dark:text-stone-300 mb-1 block">Desde</label>
              <input id="ev-desde" type="date" class="px-3 py-2 border border-stone-300 dark:border-stone-600 rounded-md bg-white dark:bg-stone-800 text-sm" />
            </div>
            <div>
              <label for="ev-hasta" class="text-[11px] font-black uppercase tracking-wide text-stone-600 dark:text-stone-300 mb-1 block">Hasta</label>
              <input id="ev-hasta" type="date" class="px-3 py-2 border border-stone-300 dark:border-stone-600 rounded-md bg-white dark:bg-stone-800 text-sm" />
            </div>
            <button id="ev-btn" class="btn-madera text-white px-4 py-2 rounded-xl text-sm font-medium">
              <i aria-hidden="true" class="fas fa-file-shield mr-1.5"></i> Extraer evidencia
            </button>
          </div>
        </div>

        <!-- Parámetros -->
        <div class="catalog-card bg-patrimonio-card dark:bg-stone-900 rounded-2xl shadow-sm border border-stone-300 dark:border-stone-600 overflow-hidden">
          <div class="catalog-card-header">
            <h3 class="font-serif font-semibold text-lg text-stone-900 dark:text-stone-100">Parámetros del sistema</h3>
            <p class="text-xs text-stone-500 dark:text-stone-400 mt-0.5">Definidos en la base de datos. La interfaz los lee de aquí, así que no pueden quedar desincronizados.</p>
          </div>
          <table class="w-full text-sm">
            <tbody>
              ${parametros.map(p => html`
                <tr class="border-t border-stone-200 dark:border-stone-700">
                  <td class="px-4 py-3">
                    <div class="font-mono text-xs text-stone-700">${p.clave}</div>
                    <div class="text-[11px] text-stone-500 dark:text-stone-400">${p.descripcion || ''}</div>
                  </td>
                  <td class="px-4 py-3 w-32">
                    <input class="param-input w-full px-2 py-1.5 border border-stone-300 dark:border-stone-600 rounded-md bg-white dark:bg-stone-800 text-sm tabular-nums"
                      data-clave="${p.clave}" value="${p.valor}" />
                  </td>
                </tr>`)}
            </tbody>
          </table>
          <div class="px-4 py-3 border-t border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800/60 flex justify-end">
            <button id="save-params-btn" class="btn-madera text-white px-4 py-2 rounded-xl text-sm font-medium">Guardar parámetros</button>
          </div>
        </div>
      </div>`;

    // --- Derechos del titular ---
    document.getElementById('arco-export-btn').addEventListener('click', async e => {
      const rut = document.getElementById('arco-rut').value.trim();
      if (!this.isValidRut(rut)) return this.showToast('El RUT no es válido.', 'error');
      const btn = e.currentTarget;
      btn.disabled = true;
      try {
        const datos = await db.exportarDatosLector(this.formatRut(rut));
        this._descargar(JSON.stringify(datos, null, 2),
          `datos-personales-${this.formatRut(rut)}.json`, 'application/json');
        this.showToast('Datos entregados. Guarda constancia de la solicitud.', 'success');
      } catch (err) {
        this.showToast(err.message || 'No se pudo exportar.', 'error');
      } finally {
        btn.disabled = false;
      }
    });

    document.getElementById('arco-delete-btn').addEventListener('click', async () => {
      const rut = document.getElementById('arco-rut').value.trim();
      if (!this.isValidRut(rut)) return this.showToast('El RUT no es válido.', 'error');

      const estado = await db.estadoLector(this.formatRut(rut));
      if (!estado.existe) return this.showToast('Ese RUT no está registrado.', 'error');

      const ok = await this.showConfirm(
        `Se borrarán el nombre, RUT y contacto de ${estado.nombre}. El historial se conservará sin vincularlo a ninguna persona. Esta acción no se puede deshacer.`,
        { title: 'Suprimir datos personales', confirmText: 'Suprimir' }
      );
      if (!ok) return;

      const motivo = await this.showPrompt('Deja constancia del motivo (queda en la auditoría):', {
        title: 'Motivo de la supresión', placeholder: 'Solicitud del titular del 26/07/2026', confirmText: 'Confirmar'
      });
      if (!motivo) return;
      if (motivo.trim().length < 10) {
        return this.showToast('El motivo debe tener al menos 10 caracteres para la auditoría.', 'error');
      }

      try {
        await db.anonimizarLector(estado.lector_id, motivo);
        this.showToast('Datos personales suprimidos.', 'success');
        this.renderAdmin();
      } catch (err) {
        this.showToast(err.message || 'No se pudo suprimir.', 'error');
      }
    });

    // --- Purga por antigüedad ---
    document.getElementById('purge-btn').addEventListener('click', async e => {
      const ok = await this.showConfirm(
        'Se anonimizarán todos los lectores sin actividad en el plazo configurado. No se puede deshacer.',
        { title: 'Purga por antigüedad', confirmText: 'Ejecutar' }
      );
      if (!ok) return;
      const btn = e.currentTarget;
      btn.disabled = true;
      try {
        const total = await db.purgarDatosAntiguos();
        this.showToast(total === 0 ? 'No había titulares que superaran el plazo.' : `${total} titular(es) anonimizado(s).`, 'success');
      } catch (err) {
        this.showToast(err.message || 'No se pudo ejecutar la purga.', 'error');
      } finally {
        btn.disabled = false;
      }
    });

    // --- Evidencia de incidentes ---
    const hoy = this._rangoPeriodo('dia').desde;
    document.getElementById('ev-hasta').value = hoy;
    document.getElementById('ev-desde').value = hoy;

    document.getElementById('ev-btn').addEventListener('click', async e => {
      const desde = document.getElementById('ev-desde').value;
      const hasta = document.getElementById('ev-hasta').value;
      if (!desde || !hasta) return this.showToast('Elige el rango de fechas.', 'error');
      const btn = e.currentTarget;
      btn.disabled = true;
      try {
        const ev = await db.evidenciaIncidente(`${desde}T00:00:00`, `${hasta}T23:59:59`);
        this._descargar(JSON.stringify(ev, null, 2), `evidencia-incidente-${desde}-a-${hasta}.json`, 'application/json');
        this.showToast('Evidencia extraída.', 'success');
      } catch (err) {
        this.showToast(err.message || 'No se pudo extraer la evidencia.', 'error');
      } finally {
        btn.disabled = false;
      }
    });

    // --- Parámetros ---
    document.getElementById('save-params-btn').addEventListener('click', async e => {
      const btn = e.currentTarget;
      btn.disabled = true;
      try {
        for (const input of panel.querySelectorAll('.param-input')) {
          await db.actualizarParametro(input.dataset.clave, input.value.trim());
        }
        // Se recargan para que toda la interfaz refleje los valores nuevos
        await this.cargarParametros();
        this.showToast('Parámetros guardados.', 'success');
      } catch (err) {
        this.showToast(err.message || 'No se pudieron guardar.', 'error');
      } finally {
        btn.disabled = false;
      }
    });
  },

  /**
   * Diagnóstico: qué se ha roto y cuándo.
   *
   * Hasta ahora, un fallo en el mesón se lo llevaba el viento. La persona veía
   * un aviso rojo, lo cerraba, y nadie más se enteraba. Aquí quedan todos, con
   * cuántas veces se repitió cada uno — que es el dato que distingue un
   * tropiezo aislado de algo que lleva semanas molestando a todo el mundo.
   */
  async _adminDiagnostico(panel) {
    const [resumen, errores, definiciones] = await Promise.all([
      db.resumenErrores(),
      db.listarErrores(100, false),
      db.verificarDefiniciones()
    ]);

    if (resumen === null || errores === null) {
      panel.innerHTML = this._avisoMigracion('009', '009_registro_de_errores.sql');
      return;
    }

    const fechaHora = iso => iso
      ? new Date(iso).toLocaleString('es-CL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
      : '—';

    const tarjeta = (etiqueta, valor, color = 'text-stone-900 dark:text-stone-100') => html`
      <div class="catalog-card bg-patrimonio-card dark:bg-stone-900 rounded-2xl shadow-sm border border-stone-300 dark:border-stone-600 p-5">
        <p class="font-serif font-semibold text-4xl ${color}">${valor}</p>
        <p class="text-xs text-stone-500 dark:text-stone-400 font-bold uppercase tracking-wide mt-1">${etiqueta}</p>
      </div>`;

    // Deriva de funciones: lo que habría delatado el fallo del librero al momento
    const derivas = (definiciones || []).filter(d => d.estado !== 'Correcto');

    panel.innerHTML = html`
      <div class="space-y-4">

        ${definiciones === null ? html`
          <div class="catalog-card bg-patrimonio-card dark:bg-stone-900 rounded-2xl shadow-sm border border-amber-300 p-5">
            <h3 class="font-serif font-semibold text-lg text-stone-900 dark:text-stone-100 mb-1">Definiciones de funciones</h3>
            <p class="text-sm text-stone-600 dark:text-stone-300">
              Falta ejecutar la migración <code class="bg-stone-100 dark:bg-stone-700 px-1.5 py-0.5 rounded text-xs font-mono">010_consolidacion.sql</code>.
              Sin ella no se puede comprobar si alguna función quedó fuera de norma.
            </p>
          </div>` : derivas.length ? html`
          <div class="catalog-card bg-patrimonio-card dark:bg-stone-900 rounded-2xl shadow-sm border border-rose-300 overflow-hidden">
            <div class="bg-rose-50 border-b border-rose-200 px-4 py-3">
              <p class="text-sm font-bold text-rose-800">
                <i aria-hidden="true" class="fas fa-triangle-exclamation mr-1.5"></i>${derivas.length} función${derivas.length === 1 ? '' : 'es'} fuera de norma
              </p>
              <p class="text-xs text-rose-700 mt-1">
                Alguien redefinió una función fuera de la migración 010. Vuelve a ejecutarla para repararlo.
              </p>
            </div>
            <div class="divide-y divide-stone-200">
              ${derivas.map(d => html`
                <div class="px-4 py-3">
                  <p class="text-sm font-bold text-stone-800 dark:text-stone-200 font-mono">${d.nombre}
                    <span class="stamp stamp-danger !rotate-0 !text-[9px] !py-0.5 !px-1.5 ml-1">${d.estado}</span>
                  </p>
                  <p class="text-xs text-stone-600 dark:text-stone-300 mt-1">${d.diagnostico}</p>
                </div>`)}
            </div>
          </div>` : html`
          <div class="catalog-card bg-patrimonio-card dark:bg-stone-900 rounded-2xl shadow-sm border border-stone-300 dark:border-stone-600 px-4 py-3 flex items-center gap-3">
            <i aria-hidden="true" class="fas fa-circle-check text-patrimonio-bosque text-lg"></i>
            <div>
              <p class="text-sm font-bold text-stone-800 dark:text-stone-200">Las ${definiciones.length} funciones coinciden con la migración 010</p>
              <p class="text-xs text-stone-500 dark:text-stone-400">Ninguna perdió su nivel de acceso ni quedó duplicada.</p>
            </div>
          </div>`}

        <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
          ${tarjeta('Sin revisar', resumen.sin_revisar ?? 0, (resumen.sin_revisar ?? 0) > 0 ? 'text-rose-700' : 'text-stone-900 dark:text-stone-100')}
          ${tarjeta('Últimas 24 horas', resumen.ultimas_24h ?? 0, (resumen.ultimas_24h ?? 0) > 0 ? 'text-amber-700' : 'text-stone-900 dark:text-stone-100')}
          ${tarjeta('Total registrado', resumen.total ?? 0)}
          <div class="catalog-card bg-patrimonio-card dark:bg-stone-900 rounded-2xl shadow-sm border border-stone-300 dark:border-stone-600 p-5">
            <p class="font-serif font-semibold text-lg text-stone-900 dark:text-stone-100 leading-tight">${fechaHora(resumen.mas_reciente)}</p>
            <p class="text-xs text-stone-500 dark:text-stone-400 font-bold uppercase tracking-wide mt-1">Más reciente</p>
          </div>
        </div>

        ${(resumen.total ?? 0) === 0 ? html`
          <div class="catalog-card bg-patrimonio-card dark:bg-stone-900 rounded-2xl shadow-sm border border-stone-300 dark:border-stone-600 p-8 text-center">
            <i aria-hidden="true" class="fas fa-circle-check text-3xl text-patrimonio-bosque mb-3"></i>
            <p class="font-serif font-semibold text-lg text-stone-900 dark:text-stone-100">Sin fallos registrados</p>
            <p class="text-xs text-stone-500 dark:text-stone-400 mt-1 max-w-md mx-auto">
              Desde que se activó el registro no se ha capturado ningún error. Si acabas de ejecutar la
              migración 009, esto es lo esperable: la bitácora empieza vacía.
            </p>
          </div>` : html`
          <div class="catalog-card bg-patrimonio-card dark:bg-stone-900 rounded-2xl shadow-sm border border-stone-300 dark:border-stone-600 overflow-hidden">
            <div class="catalog-card-header flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <h3 class="font-serif font-semibold text-lg text-stone-900 dark:text-stone-100">Últimos fallos</h3>
                <p class="text-xs text-stone-500 dark:text-stone-400 mt-0.5">
                  Nada de esto sale del proyecto: se guarda en tu propia base de datos. Los RUT, correos y
                  teléfonos se reemplazan antes de registrar.
                </p>
              </div>
              <div class="flex gap-2 shrink-0">
                <button id="marcar-todos-btn" class="btn-secundario border border-stone-300 dark:border-stone-600 bg-white dark:bg-stone-800 text-stone-700 px-3 py-1.5 rounded-lg text-xs font-bold">
                  <i aria-hidden="true" class="fas fa-check-double mr-1"></i> Marcar revisados
                </button>
                <button id="purgar-errores-btn" class="btn-secundario border border-rose-200 bg-rose-50 text-rose-700 px-3 py-1.5 rounded-lg text-xs font-bold">
                  <i aria-hidden="true" class="fas fa-broom mr-1"></i> Purgar antiguos
                </button>
              </div>
            </div>
            <div class="divide-y divide-stone-200 max-h-[32rem] overflow-y-auto">
              ${errores.map(e => html`
                <div class="px-4 py-3 ${e.visto ? 'opacity-60' : ''}">
                  <div class="flex items-start justify-between gap-3 flex-wrap">
                    <div class="min-w-0 flex-1">
                      <p class="text-sm font-bold text-stone-800 dark:text-stone-200 break-words">${e.mensaje}</p>
                      <div class="flex flex-wrap items-center gap-1.5 mt-1.5">
                        <span class="stamp ${e.origen === 'js' ? 'stamp-danger' : 'stamp-info'} !rotate-0 !text-[9px] !py-0.5 !px-1.5">
                          ${e.origen === 'js' ? 'fallo del navegador' : 'operación'}
                        </span>
                        ${e.vista ? html`<span class="stamp stamp-success !rotate-0 !text-[9px] !py-0.5 !px-1.5"><i aria-hidden="true" class="fas fa-window-maximize"></i> ${e.vista}</span>` : ''}
                        ${e.repeticiones > 1 ? html`<span class="stamp stamp-danger !rotate-0 !text-[9px] !py-0.5 !px-1.5"><i aria-hidden="true" class="fas fa-repeat"></i> ${e.repeticiones} veces</span>` : ''}
                      </div>
                      <p class="text-[11px] text-stone-500 dark:text-stone-400 mt-1.5">
                        ${fechaHora(e.ocurrido_en)}
                        ${e.usuario_email ? ' · ' + e.usuario_email : ''}
                        ${e.navegador ? ' · ' + e.navegador : ''}
                      </p>
                      ${e.detalle ? html`
                        <details class="mt-1.5">
                          <summary class="text-[11px] text-patrimonio-lago cursor-pointer font-bold">Ver detalle técnico</summary>
                          <pre class="mt-1 bg-stone-50 dark:bg-stone-800/50 border border-stone-200 dark:border-stone-700 rounded-lg p-2 text-[10px] font-mono overflow-x-auto whitespace-pre-wrap text-stone-600 dark:text-stone-300">${e.detalle}</pre>
                        </details>` : ''}
                    </div>
                    ${!e.visto ? html`
                      <button data-visto="${e.id}" class="btn-secundario shrink-0 border border-stone-300 dark:border-stone-600 bg-white dark:bg-stone-800 text-stone-600 dark:text-stone-300 px-2.5 py-1 rounded-lg text-[11px] font-bold" title="Marcar como revisado">
                        <i aria-hidden="true" class="fas fa-check"></i>
                      </button>` : ''}
                  </div>
                </div>`)}
            </div>
          </div>`}

        <div class="catalog-card bg-patrimonio-card dark:bg-stone-900 rounded-2xl shadow-sm border border-stone-300 dark:border-stone-600 p-5">
          <h3 class="font-serif font-semibold text-lg text-stone-900 dark:text-stone-100 mb-1">Qué se registra y qué no</h3>
          <p class="text-xs text-stone-600 dark:text-stone-300 leading-relaxed">
            Se guarda el mensaje del fallo, la vista donde ocurrió, el correo de quien tenía la sesión y el
            navegador. <span class="font-bold">No</span> se guarda el contenido de la pantalla ni ningún dato de
            un lector: los RUT, correos y teléfonos que pudieran aparecer en un mensaje se reemplazan antes de
            enviarlo. Nada se transmite a un servicio externo, para no abrir una transferencia de datos
            personales que habría que declarar bajo la Ley 21.719.
          </p>
        </div>

      </div>`;

    panel.querySelectorAll('[data-visto]').forEach(btn => {
      btn.addEventListener('click', async () => {
        btn.disabled = true;
        try {
          await db.marcarErrorVisto(Number(btn.dataset.visto));
          this.renderAdmin();
        } catch (err) {
          this.showToast(err.message || 'No se pudo marcar.', 'error');
          btn.disabled = false;
        }
      });
    });

    document.getElementById('marcar-todos-btn')?.addEventListener('click', async () => {
      try {
        await db.marcarErrorVisto(null);
        this.showToast('Todos marcados como revisados.', 'success');
        this.renderAdmin();
      } catch (err) {
        this.showToast(err.message || 'No se pudo marcar.', 'error');
      }
    });

    document.getElementById('purgar-errores-btn')?.addEventListener('click', async () => {
      const ok = await this.showConfirm(
        'Se borrarán los fallos de más de 90 días. El registro técnico no tiene por qué conservarse indefinidamente.',
        { title: 'Purgar registro', confirmText: 'Purgar' }
      );
      if (!ok) return;
      try {
        const n = await db.purgarErrores(90);
        this.showToast(`${n} registro${n === 1 ? '' : 's'} eliminado${n === 1 ? '' : 's'}.`, 'success');
        this.renderAdmin();
      } catch (err) {
        this.showToast(err.message || 'No se pudo purgar.', 'error');
      }
    });
  }
};
