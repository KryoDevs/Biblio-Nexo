// Vista Préstamos. Extraído de js/modules/ui-base.js el 22 de agosto de 2026
// (división por vista, ver pendientes-checklist.md y
// claude/plan-division-ui-base-2026-08-22.md). Sin cambios de lógica: es el
// mismo código, solo movido.
//
// Incluye tanto la lista de préstamos activos (renderLoans, showBulkNotifyModal)
// como el flujo de circulación compartido (flujoPrestamo y todo lo que cuelga de
// él), porque Mostrador y Catálogo llaman a `flujoPrestamo` para iniciar un
// préstamo — mantenerlos juntos evita partir ese flujo en dos archivos.
// `flujoReserva` (022_reservas.sql) se agregó al lado de `flujoPrestamo` por
// el mismo motivo: es casi el mismo flujo (RUT → situación del lector →
// confirmar) y comparte `_resumenLector`/`showNuevoLectorModal` con él.
//
// `showNotifyModal` (usado por el botón "Avisar" de cada fila) se quedó en
// ui-base.js — no estaba dentro del bloque marcado como "CATÁLOGO"/circulación
// en el archivo original, así que no se movió aquí. Sigue funcionando igual
// porque `Object.assign(UIManager.prototype, ...)` (js/modules/ui.js) mezcla
// los métodos de todas las vistas en el mismo prototipo: `this.foo()` no le
// importa en qué archivo se declaró `foo`.

import { html, crudo, escapeHtml } from '../modules/utilidades.js';
import { db } from '../modules/db.js';


export default {
  async renderLoans() {
    const container = this._container();
    if (!container) return;

    const filtro = this.loanFilter || 'todos';
    const porPagina = this.param('filas_por_pagina');
    const diasAviso = this.param('dias_aviso_previo');

    // El filtrado y los conteos los hace la base de datos: contarlos aquí sobre
    // una lista truncada daba números falsos.
    const { prestamos: visibles, total, conteos } =
      await db.obtenerPrestamos(filtro, this.loanPage, porPagina, diasAviso);
    if (this.currentView !== 'loans') return;

    // Si se devolvió el último de la página final, se retrocede una
    if (visibles.length === 0 && this.loanPage > 0) {
      this.loanPage = Math.max(0, Math.ceil(total / porPagina) - 1);
      return this.renderLoans();
    }

    // Se guardan para que los botones de aviso puedan recuperar el préstamo por id
    this._loansCache = visibles;
    if(this._actualizarBadgeAtrasados) this._actualizarBadgeAtrasados();
    const pendientes = conteos.vencidos + conteos.porVencer;

    const chip = (clave, texto, cantidad, color) => html`
      <button data-filter="${clave}" class="loan-filter-btn px-3 py-1.5 rounded-lg text-xs font-bold border transition ${
        filtro === clave
          ? 'bg-patrimonio-lago text-white border-patrimonio-lago'
          : 'bg-white dark:bg-stone-800 text-stone-600 dark:text-stone-300 border-stone-300 dark:border-stone-600 hover:border-patrimonio-lago'
      }">
        ${texto} <span class="${filtro === clave ? 'text-white/70' : color}">${cantidad}</span>
      </button>`;

    container.innerHTML = html`
      <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
        <div class="flex flex-wrap gap-2">
          ${chip('todos', 'Todos', conteos.todos, 'text-stone-500 dark:text-stone-400')}
          ${chip('vencidos', 'Atrasados', conteos.vencidos, 'text-rose-700')}
          ${chip('porVencer', 'Por vencer', conteos.porVencer, 'text-amber-700')}
        </div>
        <button id="notify-all-btn" ${pendientes === 0 ? 'disabled' : ''}
          class="btn-madera text-white font-medium rounded-xl shadow px-4 py-2.5 text-sm disabled:opacity-40 disabled:cursor-not-allowed">
          <i aria-hidden="true" class="fas fa-bell mr-1.5"></i> Avisar a los pendientes (${pendientes})
        </button>
      </div>

      <div class="catalog-card bg-patrimonio-card dark:bg-stone-900 rounded-2xl shadow-sm border border-stone-300 dark:border-stone-600 overflow-x-auto">
        <div class="catalog-card-header flex items-center justify-between gap-3">
          <h3 class="font-serif font-semibold text-lg text-stone-900 dark:text-stone-100">Préstamos activos</h3>
          <span class="text-[11px] text-stone-500 dark:text-stone-400"><i aria-hidden="true" class="fas fa-circle-info mr-1"></i>Máx. ${this.param('max_prestamos_por_lector')} por lector</span>
        </div>
        <div class="flex flex-col gap-4 p-4">
            <div id="prestamos-tbody" class="flex flex-col gap-4">
            ${visibles.length ? visibles.map((l, i) => {
              const estado = this._estadoPrestamo(l.fecha_devolucion_esperada);
              // Las mismas reglas que aplica renovar_prestamo() en la base
              // (010_consolidacion.sql): un préstamo atrasado no se renueva y
              // el máximo de renovaciones es un parámetro del sistema. Antes
              // se leía `estado.renovable`, un campo que _estadoPrestamo()
              // nunca devolvió: el botón Renovar no se dibujaba jamás.
              const puedeRenovar = estado.clave !== 'vencido'
                && Number(l.renovaciones || 0) < this.param('max_renovaciones');
              const sinContacto = !l.lectores?.email && this.formatPhone(l.lectores?.telefono).length < 11;
              const colorFecha = estado.clave === 'vencido' ? 'text-rose-700 font-bold'
                : estado.clave === 'porVencer' ? 'text-amber-700 font-bold' : 'text-stone-600 dark:text-stone-300';
              return html`
              <div class="bg-white dark:bg-stone-900 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between border border-stone-200 dark:border-stone-700 shadow-sm hover:shadow-md transition gap-4 animate-fade-up" style="animation-delay: ${i * 0.05}s">
                  <div class="flex flex-col sm:flex-row gap-4 sm:items-center flex-1">
                    <div class="flex-1">
                      <div class="font-bold text-lg text-stone-800 dark:text-stone-200 leading-tight mb-1">${l.libros?.titulo}</div>
                      <div class="text-sm text-stone-500 dark:text-stone-400 font-medium"><i aria-hidden="true" class="fas fa-user mr-1.5 text-stone-500"></i>${l.lectores?.nombre} <span class="text-xs font-mono ml-1 text-stone-500">(${l.lectores?.rut || 'Sin RUT'})</span></div>
                    </div>
                    <div class="flex flex-col sm:items-end gap-1 shrink-0">
                      <div class="text-sm font-bold ${colorFecha}">${this._fechaLegible(l.fecha_devolucion_esperada)}</div>
                      <div class="text-[10px] uppercase tracking-widest font-bold px-2 py-0.5 rounded bg-stone-100 dark:bg-stone-800 ${colorFecha}">${estado.etiqueta}</div>
                    </div>
                  </div>
                  <div class="flex items-center gap-2 border-t sm:border-t-0 sm:border-l border-stone-100 dark:border-stone-800 pt-3 sm:pt-0 sm:pl-4 shrink-0">
                    ${sinContacto
                      ? html`<button class="btn-secundario w-8 h-8 flex items-center justify-center rounded bg-stone-100 dark:bg-stone-800 text-stone-500 cursor-not-allowed" disabled title="Lector sin correo ni teléfono"><i aria-hidden="true" class="fas fa-bell-slash"></i></button>`
                      : html`<button class="notify-loan-btn btn-secundario w-8 h-8 flex items-center justify-center rounded bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-500 hover:bg-amber-100 dark:hover:bg-amber-900/50 transition" data-id="${l.id}" title="Avisar al lector"><i aria-hidden="true" class="fas fa-bell"></i></button>`
                    }
                    ${puedeRenovar
                      ? html`<button class="renew-loan-btn btn-secundario w-8 h-8 flex items-center justify-center rounded bg-patrimonio-lago/10 text-patrimonio-lago dark:text-patrimonio-lago hover:bg-patrimonio-lago/20 transition" data-id="${l.id}" title="Renovar préstamo"><i aria-hidden="true" class="fas fa-rotate-right"></i></button>`
                      : ''}
                    <button class="return-loan-btn text-xs bg-patrimonio-madera text-white px-4 py-1.5 rounded-lg hover:bg-[#a67c52] transition font-bold" data-id="${l.id}">Devuelto</button>
                  </div>
                </div>
            `; }) : html`<div class="px-4 py-8 text-center text-stone-500 dark:text-stone-400">${
              filtro === 'vencidos' ? 'No hay préstamos atrasados.'
              : filtro === 'porVencer' ? 'No hay préstamos por vencer.'
              : 'No hay préstamos activos.'}</div>`}
        </div>
        <div id="loans-pagination">${crudo(this._paginacionHtml(this.loanPage, total, porPagina, 'loan-page-btn'))}</div>
        </div>
      </div>
    `.toString();

    this._bindPaginacion(container, '.loan-page-btn', p => { this.loanPage = p; this.renderLoans(); });

    container.querySelectorAll('.loan-filter-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this.loanFilter = btn.dataset.filter;
        this.loanPage = 0; // el total cambió, la página actual puede no existir
        this.renderLoans();
      });
    });

    container.querySelectorAll('.notify-loan-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const prestamo = this._loansCache.find(l => String(l.id) === String(btn.dataset.id));
        if (prestamo) this.showNotifyModal(prestamo);
      });
    });

    document.getElementById('notify-all-btn').addEventListener('click', async e => {
      const btn = e.currentTarget;
      btn.disabled = true;
      try {
        // Se pide la lista completa: la página visible es solo una parte
        const pendientesTodos = await db.obtenerPendientesDeAviso(diasAviso);
        this.showBulkNotifyModal(pendientesTodos);
      } catch (err) {
        this.showToast(err.message || 'No se pudo cargar la lista de avisos.', 'error');
      } finally {
        btn.disabled = false;
      }
    });

    container.querySelectorAll('.renew-loan-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        btn.disabled = true;
        try {
          const r = await db.renovarPrestamo(btn.dataset.id);
          // Fase 1.3: sin conexión, db.js encola la operación en vez de
          // lanzar — no hay "nueva fecha" que mostrar todavía, solo el
          // aviso de que quedó pendiente.
          if (r?.encolado) {
            this.showToast(r.mensaje, 'info');
          } else {
            const nueva = r?.nueva_fecha ? this._fechaLegible(r.nueva_fecha) : 'la nueva fecha';
            this.showToast(`Préstamo renovado hasta el ${nueva}.`, 'success');
          }
          this.renderLoans();
        } catch (err) {
          this.showToast(err.message || 'No se pudo renovar.', 'error');
          btn.disabled = false;
        }
      });
    });

    container.querySelectorAll('.return-loan-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        try {
          const r = await db.devolverPrestamo(btn.dataset.id);
          if (r?.encolado) {
            this.showToast(r.mensaje, 'info');
          } else {
            this.showToast('Préstamo devuelto.', 'success');
          }
          this.renderLoans();
        } catch (err) {
          this.showToast(err.message || 'No se pudo registrar la devolución.', 'error');
        }
      });
    });
  },

    showBulkNotifyModal(prestamos) {
    const overlay = document.createElement('div');
    overlay.className = 'fixed inset-0 bg-patrimonio-lago/50 backdrop-blur-sm z-[10000] flex items-center justify-center p-4';
    overlay.innerHTML = html`
      <div class="bg-patrimonio-card dark:bg-stone-900 border border-stone-300 dark:border-stone-600 rounded-2xl max-w-lg w-full shadow-2xl flex flex-col max-h-[80vh]">
        <div class="p-6 pb-4">
          <h3 class="font-serif text-lg font-bold text-stone-900 dark:text-stone-100">Avisos pendientes</h3>
          <p class="text-xs text-stone-500 dark:text-stone-400 mt-0.5">${prestamos.length} ${prestamos.length === 1 ? 'lector' : 'lectores'} con devoluciones atrasadas o próximas. Envía los avisos uno por uno.</p>
        </div>
        <div class="overflow-y-auto px-6 divide-y divide-stone-200 border-t border-stone-200 dark:border-stone-700">
          ${prestamos.map(l => {
            const estado = this._estadoPrestamo(l.fecha_devolucion_esperada);
            return html`
            <div class="py-3 flex items-center justify-between gap-3">
              <div class="min-w-0">
                <p class="font-bold text-stone-800 dark:text-stone-200 text-sm truncate">${l.lectores?.nombre}</p>
                <p class="text-xs text-stone-500 dark:text-stone-400 truncate">${l.libros?.titulo}</p>
                <p class="text-[11px] font-bold ${estado.clave === 'vencido' ? 'text-rose-700' : 'text-amber-700'}">${estado.etiqueta}</p>
              </div>
              <button data-notify-id="${l.id}" class="btn-secundario shrink-0 bg-patrimonio-madera text-white px-3 py-1.5 rounded-lg text-xs font-bold">
                <i aria-hidden="true" class="fas fa-bell mr-1"></i> Avisar
              </button>
            </div>`;
          })}
        </div>
        <div class="p-6 pt-4 flex justify-end border-t border-stone-200 dark:border-stone-700">
          <button data-action="close" class="px-4 py-2 rounded-xl text-sm font-medium text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:bg-stone-700">Cerrar</button>
        </div>
      </div>
    `.toString();
    document.body.appendChild(overlay);

    const cerrar = this._prepararModal(overlay);
    overlay.querySelector('[data-action="close"]').addEventListener('click', cerrar);
    overlay.addEventListener('click', e => { if (e.target === overlay) cerrar(); });

    overlay.querySelectorAll('[data-notify-id]').forEach(btn => {
      btn.addEventListener('click', () => {
        const prestamo = prestamos.find(l => String(l.id) === String(btn.dataset.notifyId));
        if (prestamo) this.showNotifyModal(prestamo);
      });
    });
  },

  // UX10: Búsqueda de lector por nombre (reemplaza al viejo prompt de RUT)
  async _seleccionarLectorModal(titulo) {
    return new Promise(resolve => {
      const overlay = document.createElement('div');
      overlay.className = 'fixed inset-0 bg-patrimonio-lago/50 backdrop-blur-sm z-[10000] flex items-center justify-center p-4';
      overlay.innerHTML = `
        <div class="bg-patrimonio-card dark:bg-stone-900 border border-stone-300 dark:border-stone-600 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
          <h3 class="font-serif text-lg font-bold text-stone-900 dark:text-stone-100">${escapeHtml(titulo)}</h3>
          <p class="text-xs text-stone-500 dark:text-stone-400">Busca al lector por nombre o RUT. O escribe un RUT nuevo para registrarlo.</p>
          <div class="relative">
            <i aria-hidden="true" class="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-stone-500 dark:text-stone-400"></i>
            <input id="lector-search-input" autocomplete="off" class="w-full pl-9 pr-3 py-2.5 border border-stone-300 dark:border-stone-600 rounded-lg focus:ring-1 focus:ring-patrimonio-lago focus:border-patrimonio-lago text-sm" placeholder="Ej: María Pérez o 12345678-5">
          </div>
          <div id="lector-search-results" class="max-h-48 overflow-y-auto space-y-1 mt-2"></div>
          <div class="flex justify-end gap-2 pt-2 border-t border-stone-200 dark:border-stone-700 mt-4">
            <button id="lector-search-cancel" class="px-4 py-2 rounded-xl text-sm font-medium text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:bg-stone-700">Cancelar</button>
            <button id="lector-search-confirm" class="btn-madera text-white px-5 py-2 rounded-xl text-sm font-medium" disabled>Continuar</button>
          </div>
        </div>
      `;
      document.body.appendChild(overlay);

      const input = overlay.querySelector('#lector-search-input');
      const resultsContainer = overlay.querySelector('#lector-search-results');
      const confirmBtn = overlay.querySelector('#lector-search-confirm');
      
      let timer;
      let selectedRut = null;

      const close = () => {
        overlay.remove();
        resolve(null);
      };

      const select = (rut, nombre) => {
        selectedRut = rut;
        input.value = rut; // Mostrar solo el RUT en el input
        resultsContainer.innerHTML = `
          <div class="bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-emerald-800 text-sm">
            <i aria-hidden="true" class="fas fa-check-circle mr-1.5"></i> ${escapeHtml(nombre)}
          </div>`;
        confirmBtn.disabled = false;
        confirmBtn.focus();
      };

      overlay.querySelector('#lector-search-cancel').addEventListener('click', close);
      overlay.addEventListener('click', e => { if (e.target === overlay) close(); });

      confirmBtn.addEventListener('click', () => {
        const rutToReturn = selectedRut || input.value.trim();
        overlay.remove();
        resolve(rutToReturn);
      });

      input.addEventListener('input', () => {
        // UX11: Auto-formateo básico de RUT mientras escribe (solo si parece un RUT sin letras)
        let val = input.value;
        if (/^[0-9kK\-\.]+$/.test(val)) {
           const limpio = val.replace(/[.\-\s]/g, '').toUpperCase();
           if (limpio.length > 1) {
             input.value = `${limpio.slice(0, -1)}-${limpio.slice(-1)}`;
           }
        }

        confirmBtn.disabled = !input.value.trim();
        selectedRut = null;
        clearTimeout(timer);
        const q = input.value.trim();
        if (q.length < 2) {
          resultsContainer.innerHTML = '';
          return;
        }
        timer = setTimeout(async () => {
          resultsContainer.innerHTML = '<p class="text-xs text-stone-500 dark:text-stone-400 p-2"><i aria-hidden="true" class="fas fa-spinner fa-spin mr-1"></i> Buscando...</p>';
          try {
            const res = await db.obtenerLectores(q, 0, 5);
            if (res.lectores.length === 0) {
              resultsContainer.innerHTML = '<p class="text-xs text-stone-500 dark:text-stone-400 p-2">Ningún lector coincide. Escriba el RUT completo para registrarlo como nuevo.</p>';
            } else {
              resultsContainer.innerHTML = res.lectores.map(l => `
                <button type="button" data-rut="${l.rut}" data-nombre="${escapeHtml(l.nombre)}" class="w-full text-left px-3 py-2 rounded-lg border border-transparent hover:bg-stone-50 dark:bg-stone-800/50 hover:border-stone-200 dark:border-stone-700 focus:bg-stone-50 dark:bg-stone-800/50 focus:border-stone-200 dark:border-stone-700 focus:outline-none transition-colors">
                  <p class="text-sm font-medium text-stone-800 dark:text-stone-200">${escapeHtml(l.nombre)}</p>
                  <p class="text-[11px] font-mono text-stone-500 dark:text-stone-400">${l.rut}</p>
                </button>
              `).join('');
              
              resultsContainer.querySelectorAll('button').forEach(btn => {
                btn.addEventListener('click', () => select(btn.dataset.rut, btn.dataset.nombre));
              });
            }
          } catch(err) {
            resultsContainer.innerHTML = '<p class="text-xs text-rose-500 p-2">Error al buscar.</p>';
          }
        }, 350);
      });

      input.addEventListener('keydown', e => {
        if (e.key === 'Enter' && !confirmBtn.disabled) {
          confirmBtn.click();
        }
      });

      // UX1: Auto focus
      setTimeout(() => input.focus(), 100);
    });
  },

  /**
   * Flujo de préstamo desde el mesón: se pide el RUT (o se busca por nombre),
   * se consulta la situación del lector y se muestra ANTES de confirmar. Así la persona del mesón sabe
   * si está bloqueado, si debe libros, o si no está registrado todavía.
   */
  async flujoPrestamo(libroId, alTerminar) {
    const rut = await this._seleccionarLectorModal('Prestar libro');
    if (!rut) return;
    if (!this.isValidRut(rut)) {
      this.showToast('El RUT no es válido. Revisa el dígito verificador.', 'error');
      return;
    }

    let estado;
    try {
      estado = await db.estadoLector(this.formatRut(rut));
    } catch (err) {
      this.showToast(err.message || 'No se pudo consultar el lector.', 'error');
      return;
    }

    this.showConfirmarPrestamoModal(libroId, this.formatRut(rut), estado, alTerminar);
  },

  /**
   * Muestra la situación del lector y, según el caso, ofrece prestar,
   * registrarlo como lector nuevo, o explica por qué no se puede prestar.
   */
  showConfirmarPrestamoModal(libroId, rut, estado, alTerminar, ubicacion = null) {
    const overlay = document.createElement('div');
    overlay.className = 'fixed inset-0 bg-patrimonio-lago/50 backdrop-blur-sm z-[10000] flex items-center justify-center p-4';

    let cuerpo, acciones;

    if (!estado.existe) {
      // Lector nuevo
      cuerpo = html`
        <div class="bg-patrimonio-lago/5 border border-patrimonio-lago/20 rounded-xl p-4 text-center">
          <i aria-hidden="true" class="fas fa-user-plus text-2xl text-patrimonio-lago mb-2"></i>
          <p class="font-bold text-stone-800 dark:text-stone-200">Lector nuevo</p>
          <p class="text-sm text-stone-600 dark:text-stone-300 mt-1">El RUT <span class="font-mono font-bold">${rut}</span> no está registrado.</p>
          <p class="text-xs text-stone-500 dark:text-stone-400 mt-2">Regístralo para poder prestarle libros.</p>
        </div>`;
      acciones = html`
        <button data-action="cancel" class="px-4 py-2 rounded-xl text-sm font-medium text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:bg-stone-700">Cancelar</button>
        <button data-action="registrar" class="btn-madera text-white px-5 py-2 rounded-xl text-sm font-medium">Registrar lector</button>`;
    } else if (!estado.puede_prestar) {
      // Impedido
      cuerpo = html`
        <div class="bg-rose-50 border border-rose-200 rounded-xl p-4">
          <p class="font-bold text-rose-800 mb-1"><i aria-hidden="true" class="fas fa-ban mr-1.5"></i>No se puede prestar</p>
          <p class="text-sm text-rose-700">${estado.motivo_rechazo || 'El lector está impedido de pedir libros.'}</p>
        </div>
        ${this._resumenLector(estado)}`;
      acciones = html`
        <button data-action="cancel" class="px-4 py-2 rounded-xl text-sm font-medium text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:bg-stone-700">Cerrar</button>
        <button data-action="ver-prestamos" class="btn-secundario border border-stone-300 dark:border-stone-600 bg-white dark:bg-stone-800 text-stone-700 px-4 py-2 rounded-xl text-sm font-medium">Ver sus préstamos</button>`;
    } else {
      // Todo en orden
      cuerpo = html`
        <div class="bg-emerald-50 border border-emerald-200 rounded-xl p-4">
          <p class="font-bold text-emerald-800"><i aria-hidden="true" class="fas fa-circle-check mr-1.5"></i>${estado.nombre}</p>
          <p class="text-sm text-emerald-700 mt-0.5">Puede llevar este libro.</p>
        </div>
        ${this._resumenLector(estado)}`;
      acciones = html`
        <button data-action="cancel" class="px-4 py-2 rounded-xl text-sm font-medium text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:bg-stone-700">Cancelar</button>
        <button data-action="prestar" class="btn-madera text-white px-5 py-2 rounded-xl text-sm font-medium">Confirmar préstamo</button>`;
    }

    overlay.innerHTML = html`
      <div class="bg-patrimonio-card dark:bg-stone-900 border border-stone-300 dark:border-stone-600 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
        <h3 class="font-serif text-lg font-bold text-stone-900 dark:text-stone-100">Situación del lector</h3>
        ${cuerpo}
        <div class="flex justify-end gap-3 pt-1 flex-wrap">${acciones}</div>
      </div>`.toString();
    document.body.appendChild(overlay);

    const cerrar = this._prepararModal(overlay);
    overlay.querySelector('[data-action="cancel"]').addEventListener('click', cerrar);
    overlay.addEventListener('click', e => { if (e.target === overlay) cerrar(); });

    overlay.querySelector('[data-action="prestar"]')?.addEventListener('click', async e => {
      const btn = e.currentTarget;
      btn.disabled = true;
      try {
        const r = await db.registrarPrestamo(libroId, rut, ubicacion);
        cerrar();
        // Fase 1.3: sin conexión, db.js encoló el préstamo en vez de
        // lanzar — se avisa que quedó pendiente, no que ya se completó
        // (deliberadamente sin un badge visual de "sin conexión" aparte;
        // el aviso mismo ya deja claro que no fue el flujo normal).
        if (r?.encolado) {
          this.showToast(r.mensaje, 'info');
        } else {
          this.showToast('Préstamo registrado.', 'success');
        }
        alTerminar?.();
      } catch (err) {
        this.showToast(err.message || 'No se pudo registrar el préstamo.', 'error');
        btn.disabled = false;
      }
    });

    overlay.querySelector('[data-action="registrar"]')?.addEventListener('click', () => {
      cerrar();
      this.showNuevoLectorModal(rut, async () => {
        // Tras registrarlo, se reintenta el préstamo con su situación ya actualizada
        const nuevoEstado = await db.estadoLector(rut);
        this.showConfirmarPrestamoModal(libroId, rut, nuevoEstado, alTerminar, ubicacion);
      });
    });

    overlay.querySelector('[data-action="ver-prestamos"]')?.addEventListener('click', () => {
      cerrar();
      this.loanFilter = 'vencidos';
      this.switchView('loans');
    });
  },

  // Resumen numérico de la situación de un lector
  _resumenLector(estado) {
    const dato = (etiqueta, valor, color = 'text-stone-900 dark:text-stone-100') => html`
      <div class="text-center">
        <p class="font-serif font-bold text-2xl ${color}">${valor}</p>
        <p class="text-[10px] uppercase tracking-widest text-stone-500 dark:text-stone-400 mt-0.5">${etiqueta}</p>
      </div>`;
    return html`
      <div class="grid grid-cols-3 gap-2 border border-stone-200 dark:border-stone-700 rounded-xl py-3">
        ${dato('Activos', estado.prestamos_activos ?? 0)}
        ${dato('Atrasados', estado.prestamos_atrasados ?? 0, (estado.prestamos_atrasados ?? 0) > 0 ? 'text-rose-700' : 'text-stone-900 dark:text-stone-100')}
        ${dato('Máximo', this.param('max_prestamos_por_lector'))}
      </div>
      ${estado.email || estado.telefono ? html`
        <p class="text-[11px] text-stone-500 dark:text-stone-400 text-center">
          ${estado.email ? estado.email : ''}${estado.email && estado.telefono ? ' · ' : ''}${estado.telefono ? estado.telefono : ''}
        </p>` : ''}`;
  },

  /** Registro rápido de lector desde el mesón, con el RUT ya cargado. */
  showNuevoLectorModal(rut, alGuardar) {
    const overlay = document.createElement('div');
    overlay.className = 'fixed inset-0 bg-patrimonio-lago/50 backdrop-blur-sm z-[10000] flex items-center justify-center p-4';
    overlay.innerHTML = html`
      <div class="bg-patrimonio-card dark:bg-stone-900 border border-stone-300 dark:border-stone-600 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
        <div>
          <h3 class="font-serif text-lg font-bold text-stone-900 dark:text-stone-100">Registrar lector nuevo</h3>
          <p class="text-xs text-stone-500 dark:text-stone-400 mt-0.5">Todos los datos son obligatorios.</p>
        </div>
        <div class="space-y-3">
          <div>
            <label for="new-user-id" class="text-[11px] font-black uppercase tracking-wide text-stone-600 dark:text-stone-300 mb-1 block">RUT</label>
            <input id="new-user-id" value="${rut}" readonly
              class="w-full px-3 py-2 border border-stone-300 dark:border-stone-600 rounded-md bg-stone-50 dark:bg-stone-800/50 text-sm font-mono text-stone-600 dark:text-stone-300" />
          </div>
          <div>
            <label for="new-user-name" class="text-[11px] font-black uppercase tracking-wide text-stone-600 dark:text-stone-300 mb-1 block">Nombre completo</label>
            <input id="new-user-name" placeholder="María Antileo Huenchumán"
              class="w-full px-3 py-2 border border-stone-300 dark:border-stone-600 rounded-md bg-white dark:bg-stone-800 text-sm focus:outline-none focus:border-patrimonio-lago focus:ring-1 focus:ring-patrimonio-lago" />
          </div>
          <div>
            <label for="new-user-phone" class="text-[11px] font-black uppercase tracking-wide text-stone-600 dark:text-stone-300 mb-1 block">Teléfono</label>
            <input id="new-user-phone" type="tel" placeholder="9 1234 5678"
              class="w-full px-3 py-2 border border-stone-300 dark:border-stone-600 rounded-md bg-white dark:bg-stone-800 text-sm focus:outline-none focus:border-patrimonio-lago focus:ring-1 focus:ring-patrimonio-lago" />
          </div>
          <div>
            <label for="new-user-email" class="text-[11px] font-black uppercase tracking-wide text-stone-600 dark:text-stone-300 mb-1 block">Correo</label>
            <input id="new-user-email" type="email" placeholder="nombre@correo.cl"
              class="w-full px-3 py-2 border border-stone-300 dark:border-stone-600 rounded-md bg-white dark:bg-stone-800 text-sm focus:outline-none focus:border-patrimonio-lago focus:ring-1 focus:ring-patrimonio-lago" />
          </div>
        </div>
        ${crudo(this._bloqueConsentimiento('new'))}
        <div class="flex justify-end gap-3 pt-1">
          <button data-action="cancel" class="px-4 py-2 rounded-xl text-sm font-medium text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:bg-stone-700">Cancelar</button>
          <button data-action="save" class="btn-madera text-white px-5 py-2 rounded-xl text-sm font-medium">Registrar y continuar</button>
        </div>
      </div>`.toString();
    document.body.appendChild(overlay);

    const cerrar = this._prepararModal(overlay);
    overlay.querySelector('[data-action="cancel"]').addEventListener('click', cerrar);
    this._bindConsentimiento('new');
    setTimeout(() => document.getElementById('new-user-name')?.focus(), 20);

    overlay.querySelector('[data-action="save"]').addEventListener('click', async e => {
      if (!this.validateUserForm(false)) return;
      const btn = e.currentTarget;
      btn.disabled = true;
      try {
        const consent = this._datosConsentimiento('new');
        if (!consent) { btn.disabled = false; return; }
        const r = await db.agregarLector({
          rut: this.formatRut(document.getElementById('new-user-id').value),
          nombre: document.getElementById('new-user-name').value.trim(),
          email: document.getElementById('new-user-email').value.trim().toLowerCase(),
          telefono: this.formatPhone(document.getElementById('new-user-phone').value),
          ...consent
        });
        cerrar();
        // Fase 1.3 (ampliación): si esto quedó encolado (sin conexión), el
        // préstamo que sigue en alGuardar() también va a encolarse —
        // funciona porque la cola procesa en el mismo orden en que se
        // encoló (ver SyncQueue.reintentarPendientes en db.js) y
        // registrarPrestamo() identifica al lector por RUT, no por el id
        // que le asignaría el servidor. No hace falta esperar a que el
        // alta se sincronice de verdad para continuar.
        this.showToast(r?.encolado ? r.mensaje : 'Lector registrado.', r?.encolado ? 'info' : 'success');
        await alGuardar?.();
      } catch (err) {
        this.showToast(err.message || 'No se pudo registrar el lector.', 'error');
        btn.disabled = false;
      }
    });
  },

  /**
   * Flujo de reserva desde el Catálogo (022_reservas.sql): mismo patrón que
   * flujoPrestamo — se pide el RUT y se muestra la situación del lector
   * ANTES de confirmar — porque reservar_libro() exige lo mismo que
   * prestar_libro() (no estar bloqueado, ni atrasado, ni en el máximo de
   * préstamos): alguien a quien no se le prestaría tampoco debería poder
   * ponerse en la fila de espera.
   */
  async flujoReserva(libroId, alTerminar) {
    const rut = await this._seleccionarLectorModal('Reservar libro');
    if (!rut) return;
    if (!this.isValidRut(rut)) {
      this.showToast('El RUT no es válido. Revisa el dígito verificador.', 'error');
      return;
    }

    let estado;
    try {
      estado = await db.estadoLector(this.formatRut(rut));
    } catch (err) {
      this.showToast(err.message || 'No se pudo consultar el lector.', 'error');
      return;
    }

    this.showConfirmarReservaModal(libroId, this.formatRut(rut), estado, alTerminar);
  },

  /**
   * Muestra la situación del lector y, según el caso, ofrece reservar,
   * registrarlo como lector nuevo, o explica por qué no se puede reservar.
   * Casi idéntico a showConfirmarPrestamoModal — la diferencia es la acción
   * final (reservar_libro en vez de prestar_libro) y el mensaje de éxito,
   * que incluye la posición en la fila de espera.
   */
  showConfirmarReservaModal(libroId, rut, estado, alTerminar) {
    const overlay = document.createElement('div');
    overlay.className = 'fixed inset-0 bg-patrimonio-lago/50 backdrop-blur-sm z-[10000] flex items-center justify-center p-4';

    let cuerpo, acciones;

    if (!estado.existe) {
      cuerpo = html`
        <div class="bg-patrimonio-lago/5 border border-patrimonio-lago/20 rounded-xl p-4 text-center">
          <i aria-hidden="true" class="fas fa-user-plus text-2xl text-patrimonio-lago mb-2"></i>
          <p class="font-bold text-stone-800 dark:text-stone-200">Lector nuevo</p>
          <p class="text-sm text-stone-600 dark:text-stone-300 mt-1">El RUT <span class="font-mono font-bold">${rut}</span> no está registrado.</p>
          <p class="text-xs text-stone-500 dark:text-stone-400 mt-2">Regístralo para poder reservarle un libro.</p>
        </div>`;
      acciones = html`
        <button data-action="cancel" class="px-4 py-2 rounded-xl text-sm font-medium text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:bg-stone-700">Cancelar</button>
        <button data-action="registrar" class="btn-madera text-white px-5 py-2 rounded-xl text-sm font-medium">Registrar lector</button>`;
    } else if (!estado.puede_prestar) {
      cuerpo = html`
        <div class="bg-rose-50 border border-rose-200 rounded-xl p-4">
          <p class="font-bold text-rose-800 mb-1"><i aria-hidden="true" class="fas fa-ban mr-1.5"></i>No se puede reservar</p>
          <p class="text-sm text-rose-700">${estado.motivo_rechazo || 'El lector está impedido de pedir libros.'}</p>
        </div>
        ${this._resumenLector(estado)}`;
      acciones = html`
        <button data-action="cancel" class="px-4 py-2 rounded-xl text-sm font-medium text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:bg-stone-700">Cerrar</button>
        <button data-action="ver-prestamos" class="btn-secundario border border-stone-300 dark:border-stone-600 bg-white dark:bg-stone-800 text-stone-700 px-4 py-2 rounded-xl text-sm font-medium">Ver sus préstamos</button>`;
    } else {
      cuerpo = html`
        <div class="bg-emerald-50 border border-emerald-200 rounded-xl p-4">
          <p class="font-bold text-emerald-800"><i aria-hidden="true" class="fas fa-circle-check mr-1.5"></i>${estado.nombre}</p>
          <p class="text-sm text-emerald-700 mt-0.5">Se puede poner en la fila de espera de este libro.</p>
        </div>
        ${this._resumenLector(estado)}`;
      acciones = html`
        <button data-action="cancel" class="px-4 py-2 rounded-xl text-sm font-medium text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:bg-stone-700">Cancelar</button>
        <button data-action="reservar" class="btn-madera text-white px-5 py-2 rounded-xl text-sm font-medium">Confirmar reserva</button>`;
    }

    overlay.innerHTML = html`
      <div class="bg-patrimonio-card dark:bg-stone-900 border border-stone-300 dark:border-stone-600 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
        <h3 class="font-serif text-lg font-bold text-stone-900 dark:text-stone-100">Situación del lector</h3>
        ${cuerpo}
        <div class="flex justify-end gap-3 pt-1 flex-wrap">${acciones}</div>
      </div>`.toString();
    document.body.appendChild(overlay);

    const cerrar = this._prepararModal(overlay);
    overlay.querySelector('[data-action="cancel"]').addEventListener('click', cerrar);
    overlay.addEventListener('click', e => { if (e.target === overlay) cerrar(); });

    overlay.querySelector('[data-action="reservar"]')?.addEventListener('click', async e => {
      const btn = e.currentTarget;
      btn.disabled = true;
      try {
        const r = await db.reservarLibro(libroId, rut);
        cerrar();
        // Fase 1.3: sin conexión, db.js encoló la reserva en vez de lanzar.
        if (r?.encolado) {
          this.showToast(r.mensaje, 'info');
        } else {
          const posicion = r?.posicion_en_fila;
          this.showToast(posicion ? `Reserva registrada: posición ${posicion} en la fila de espera.` : 'Reserva registrada.', 'success');
        }
        alTerminar?.();
      } catch (err) {
        this.showToast(err.message || 'No se pudo registrar la reserva.', 'error');
        btn.disabled = false;
      }
    });

    overlay.querySelector('[data-action="registrar"]')?.addEventListener('click', () => {
      cerrar();
      this.showNuevoLectorModal(rut, async () => {
        const nuevoEstado = await db.estadoLector(rut);
        this.showConfirmarReservaModal(libroId, rut, nuevoEstado, alTerminar);
      });
    });

    overlay.querySelector('[data-action="ver-prestamos"]')?.addEventListener('click', () => {
      cerrar();
      this.loanFilter = 'vencidos';
      this.switchView('loans');
    });
  },

  /** Consulta rápida de la situación de un lector por su RUT. */
  async showLectorModal(rut) {
    try {
      const estado = await db.estadoLector(rut);
      const overlay = document.createElement('div');
      overlay.className = 'fixed inset-0 bg-patrimonio-lago/50 backdrop-blur-sm z-[10000] flex items-center justify-center p-4';
      overlay.innerHTML = html`
        <div class="bg-patrimonio-card dark:bg-stone-900 border border-stone-300 dark:border-stone-600 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
          <div>
            <h3 class="font-serif text-lg font-bold text-stone-900 dark:text-stone-100">${estado.nombre || 'Lector'}</h3>
            <p class="text-xs font-mono text-stone-500 dark:text-stone-400">${estado.rut || rut}</p>
          </div>
          ${!estado.puede_prestar ? html`
            <div class="bg-rose-50 border border-rose-200 rounded-xl p-3">
              <p class="text-sm text-rose-700"><i aria-hidden="true" class="fas fa-ban mr-1.5"></i>${estado.motivo_rechazo || ''}</p>
            </div>` : html`
            <div class="bg-emerald-50 border border-emerald-200 rounded-xl p-3">
              <p class="text-sm text-emerald-700"><i aria-hidden="true" class="fas fa-circle-check mr-1.5"></i>Puede pedir libros prestados.</p>
            </div>`}
          ${this._resumenLector(estado)}
          <div class="flex justify-end pt-1">
            <button data-action="close" class="px-4 py-2 rounded-xl text-sm font-medium text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:bg-stone-700">Cerrar</button>
          </div>
        </div>`.toString();
      document.body.appendChild(overlay);
      const cerrar = this._prepararModal(overlay);
      overlay.querySelector('[data-action="close"]').addEventListener('click', cerrar);
      overlay.addEventListener('click', e => { if (e.target === overlay) cerrar(); });
    } catch (err) {
      this.showToast(err.message || 'No se pudo consultar el lector.', 'error');
    }
  }
};
