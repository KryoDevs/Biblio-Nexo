import { escapeHtml } from './utilidades.js';
import registroErrores from './errores.js';

export default {
    /**
     * Aviso en pantalla. Los de tipo 'error' se registran además en la bitácora:
     * son justo los que la persona del mesón ve, cierra y nadie más se entera.
     */
    showToast(message, type = 'success') {
        if (type === 'error') {
            registroErrores.registrar(message, { origen: 'operacion', accion: this.currentView || null });
        }
        const container = document.getElementById('toast-container');
        if (!container) return;

        const toast = document.createElement('div');
        const bgColor = type === 'success' ? 'bg-[#10b981]' : type === 'error' ? 'bg-[#e11d48]' : 'bg-[#1B3B48]';
        const icon = type === 'success' ? 'fa-check-circle' : type === 'error' ? 'fa-exclamation-triangle' : 'fa-info-circle';

        toast.className = `${bgColor} toast-enter text-white px-5 py-4 rounded-2xl shadow-lg border border-white/10 font-bold flex items-center gap-3 transform transition-all duration-300 translate-y-10 scale-95 opacity-0 z-50 text-sm pointer-events-auto`;
        toast.innerHTML = `<i aria-hidden="true" class="fas ${icon} text-lg"></i> <span>${escapeHtml(message)}</span>`;

        container.appendChild(toast);
        setTimeout(() => toast.classList.remove('translate-y-10', 'scale-95', 'opacity-0'), 10);
        setTimeout(() => {
            toast.classList.add('translate-y-10', 'scale-95', 'opacity-0');
            setTimeout(() => toast.remove(), 300);
        }, 3500);
    },

    // Modal de confirmación propio (reemplaza confirm() nativo)
    showConfirm(message, { title = 'Confirmar acción', confirmText = 'Confirmar', danger = true } = {}) {
        return new Promise(resolve => {
            const overlay = document.createElement('div');
            overlay.className = 'fixed inset-0 bg-patrimonio-lago/40 backdrop-blur-md z-[10000] transition-opacity duration-300 flex items-center justify-center p-4';
            overlay.innerHTML = `
                <div class="ui-dialog bg-patrimonio-card dark:bg-stone-900 border border-stone-300 dark:border-stone-600 rounded-2xl max-w-sm w-full p-6 shadow-sm transform transition-all space-y-4">
                    <h3 class="font-serif text-lg font-bold text-stone-900 dark:text-stone-100">${escapeHtml(title)}</h3>
                    <p class="text-stone-600 dark:text-stone-300 text-sm">${escapeHtml(message)}</p>
                    <div class="flex justify-end gap-3 pt-2">
                        <button data-action="cancel" class="px-4 py-2 rounded-xl text-sm font-medium text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800">Cancelar</button>
                        <button data-action="confirm" class="${danger ? 'bg-rose-700 hover:bg-rose-800' : 'bg-patrimonio-madera hover:bg-[#633414]'} text-white px-4 py-2 rounded-xl text-sm font-medium">${escapeHtml(confirmText)}</button>
                    </div>
                </div>
            `;
            document.body.appendChild(overlay);
            let resultado = false;
            const cerrarModal = this._prepararModal(overlay, { alCerrar: () => resolve(resultado) });
            const close = (r) => { resultado = r; cerrarModal(); };
            overlay.querySelector('[data-action="cancel"]').addEventListener('click', () => close(false));
            overlay.querySelector('[data-action="confirm"]').addEventListener('click', () => close(true));
            overlay.addEventListener('click', e => { if (e.target === overlay) close(false); });
        });
    },

    // Modal de entrada de texto propio (reemplaza prompt() nativo)
    showPrompt(message, { title = 'Ingresar dato', placeholder = '', confirmText = 'Aceptar' } = {}) {
        return new Promise(resolve => {
            const overlay = document.createElement('div');
            overlay.className = 'fixed inset-0 bg-patrimonio-lago/40 backdrop-blur-md z-[10000] transition-opacity duration-300 flex items-center justify-center p-4';
            overlay.innerHTML = `
                <div class="ui-dialog bg-patrimonio-card dark:bg-stone-900 border border-stone-300 dark:border-stone-600 rounded-2xl max-w-sm w-full p-6 shadow-sm transform transition-all space-y-4">
                    <h3 class="font-serif text-lg font-bold text-stone-900 dark:text-stone-100">${escapeHtml(title)}</h3>
                    <p class="text-stone-600 dark:text-stone-300 text-sm">${escapeHtml(message)}</p>
                    <input id="modal-prompt-input" aria-label="Valor solicitado" type="text" placeholder="${escapeHtml(placeholder)}"
                        class="w-full px-3 py-2.5 border border-stone-300 dark:border-stone-600 rounded-md bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100 text-sm focus:outline-none focus:border-patrimonio-lago focus:ring-1 focus:ring-patrimonio-lago" />
                    <div class="flex justify-end gap-3 pt-2">
                        <button data-action="cancel" class="px-4 py-2 rounded-xl text-sm font-medium text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800">Cancelar</button>
                        <button data-action="confirm" class="bg-patrimonio-madera hover:bg-[#633414] text-white px-4 py-2 rounded-xl text-sm font-medium">${escapeHtml(confirmText)}</button>
                    </div>
                </div>
            `;
            document.body.appendChild(overlay);
            const input = overlay.querySelector('#modal-prompt-input');
            let resultado = null;
            const cerrarModal = this._prepararModal(overlay, { alCerrar: () => resolve(resultado) });
            const close = (r) => { resultado = r; cerrarModal(); };
            overlay.querySelector('[data-action="cancel"]').addEventListener('click', () => close(null));
            overlay.querySelector('[data-action="confirm"]').addEventListener('click', () => close(input.value.trim() || null));
            input.addEventListener('keydown', e => {
                if (e.key === 'Enter') close(input.value.trim() || null);
            });
            overlay.addEventListener('click', e => { if (e.target === overlay) close(null); });
            // Fokus automático para UX
            setTimeout(() => input.focus(), 50);
        });
    },

    /**
     * Trampa de foco y manejo de Escape para modales (accesibilidad WCAG).
     *
     * Devuelve la función de cierre, que se debe usar en vez de overlay.remove().
     */
    _prepararModal(overlay, { titulo, alCerrar } = {}) {
        const focoAnterior = document.activeElement;
        const caja = overlay.firstElementChild;

        // Semántica de diálogo
        overlay.setAttribute('role', 'dialog');
        overlay.setAttribute('aria-modal', 'true');

        // Se asocia el título para que el lector de pantalla lo anuncie al abrir
        const encabezado = caja?.querySelector('h1, h2, h3');
        if (encabezado) {
            if (!encabezado.id) {
                encabezado.id = `modal-titulo-${Math.random().toString(36).slice(2, 9)}`;
            }
            overlay.setAttribute('aria-labelledby', encabezado.id);
        } else if (titulo) {
            overlay.setAttribute('aria-label', titulo);
        }

        const enfocables = () => [...overlay.querySelectorAll(
            'button:not([disabled]), [href], input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])'
        )].filter(el => el.offsetParent !== null || el === document.activeElement);

        const alTeclear = e => {
            if (e.key === 'Escape') {
                e.preventDefault();
                cerrar();
                return;
            }
            if (e.key !== 'Tab') return;

            // Trampa de foco: al llegar al último elemento, Tab vuelve al primero
            const lista = enfocables();
            if (lista.length === 0) return;
            const primero = lista[0];
            const ultimo = lista[lista.length - 1];

            if (e.shiftKey && document.activeElement === primero) {
                e.preventDefault();
                ultimo.focus();
            } else if (!e.shiftKey && document.activeElement === ultimo) {
                e.preventDefault();
                primero.focus();
            }
        };

        const cerrar = () => {
            document.removeEventListener('keydown', alTeclear, true);
            overlay.remove();
            // Se devuelve el foco a donde estaba, si ese elemento sigue en la página
            if (focoAnterior && document.body.contains(focoAnterior)) {
                focoAnterior.focus();
            }
            alCerrar?.();
        };

        document.addEventListener('keydown', alTeclear, true);
        return cerrar;
    }
,

  showNotifyModal(prestamo) {
    const mensaje = this._textoAviso(prestamo);
    const estado = this._estadoPrestamo(prestamo.fecha_devolucion_esperada);
    const lector = prestamo.lectores || {};
    const telefono = this.formatPhone(lector.telefono);
    const email = lector.email;
    const asunto = estado.clave === 'vencido'
      ? 'Devolución pendiente en la Biblioteca Municipal de Futrono'
      : 'Recordatorio de devolución — Biblioteca Municipal de Futrono';

    const overlay = document.createElement('div');
    overlay.className = 'fixed inset-0 bg-patrimonio-lago/40 backdrop-blur-md z-[10000] transition-opacity duration-300 flex items-center justify-center p-4';
    overlay.innerHTML = `
      <div class="bg-patrimonio-card dark:bg-stone-900/95 backdrop-blur-xl border border-white/20 dark:border-stone-700/50 rounded-[2rem] max-w-lg w-full p-8 shadow-soft-xl shadow-patrimonio-lago/20 transform transition-all space-y-4">
        <div>
          <h3 class="font-serif text-lg font-bold text-stone-900 dark:text-stone-100">Avisar a ${escapeHtml(lector.nombre || 'el lector')}</h3>
          <p class="text-xs text-stone-500 dark:text-stone-400 mt-0.5">${escapeHtml(estado.etiqueta)} · ${escapeHtml(prestamo.libros?.titulo || '')}</p>
        </div>

        <div>
          <label class="text-[11px] font-black uppercase tracking-wide text-stone-600 dark:text-stone-300 mb-1 block">Mensaje</label>
          <textarea id="notify-message" aria-label="Texto del aviso al lector" rows="7" class="w-full px-3 py-2.5 border border-stone-300 dark:border-stone-600 rounded-md bg-white dark:bg-stone-800 text-sm text-stone-800 dark:text-stone-200 focus:outline-none focus:border-patrimonio-lago focus:ring-1 focus:ring-patrimonio-lago">${escapeHtml(mensaje)}</textarea>
          <p class="text-[11px] text-stone-500 dark:text-stone-400 mt-1">Puedes editarlo antes de enviarlo.</p>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1">
          <button data-action="whatsapp" ${telefono.length < 11 ? 'disabled' : ''}
            class="btn-secundario flex items-center justify-center gap-2 bg-patrimonio-bosque hover:bg-[#22392F] disabled:opacity-40 disabled:cursor-not-allowed text-white px-3 py-2.5 rounded-xl text-sm font-medium">
            <i aria-hidden="true" class="fa-brands fa-whatsapp"></i> WhatsApp
          </button>
          <button data-action="email" ${!email ? 'disabled' : ''}
            class="btn-secundario flex items-center justify-center gap-2 bg-patrimonio-lago hover:bg-[#14303c] disabled:opacity-40 disabled:cursor-not-allowed text-white px-3 py-2.5 rounded-xl text-sm font-medium">
            <i aria-hidden="true" class="fas fa-envelope"></i> Correo
          </button>
          <button data-action="copy"
            class="btn-secundario flex items-center justify-center gap-2 border border-stone-300 dark:border-stone-600 hover:bg-stone-50 dark:hover:bg-stone-800 text-stone-700 dark:text-stone-200 px-3 py-2.5 rounded-xl text-sm font-medium">
            <i aria-hidden="true" class="fas fa-copy"></i> Copiar
          </button>
        </div>
        ${(telefono.length < 11 || !email) ? `<p class="text-[11px] text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-md px-3 py-2">Este lector no tiene ${!email ? 'correo' : ''}${(!email && telefono.length < 11) ? ' ni ' : ''}${telefono.length < 11 ? 'teléfono' : ''} registrado. Complétalo en la vista Lectores para poder avisarle.</p>` : ''}

        <div class="flex justify-end pt-1">
          <button data-action="close" class="px-4 py-2 rounded-xl text-sm font-medium text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800">Cerrar</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    const textarea = overlay.querySelector('#notify-message');
    const cerrar = this._prepararModal(overlay);

    overlay.querySelector('[data-action="close"]').addEventListener('click', cerrar);
    overlay.addEventListener('click', e => { if (e.target === overlay) cerrar(); });

    overlay.querySelector('[data-action="whatsapp"]').addEventListener('click', () => {
      window.open(`https://wa.me/${telefono}?text=${encodeURIComponent(textarea.value)}`, '_blank', 'noopener');
      cerrar();
    });

    overlay.querySelector('[data-action="email"]').addEventListener('click', () => {
      window.location.href = `mailto:${email}?subject=${encodeURIComponent(asunto)}&body=${encodeURIComponent(textarea.value)}`;
      cerrar();
    });

    overlay.querySelector('[data-action="copy"]').addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(textarea.value);
        this.showToast('Mensaje copiado.', 'success');
      } catch {
        textarea.select(); // respaldo si el navegador bloquea el portapapeles moderno
        try {
          if (document.execCommand('copy')) {
            this.showToast('Mensaje copiado.', 'success');
            return;
          }
        } catch (e) {
          // Si también falla, no hace nada y deja el texto seleccionado
        }
        this.showToast('Selecciona y copia el mensaje manualmente.', 'error');
      }
    });
  },

  showNotifyReservaModal(reserva, libro, lector) {
    const fecha = this._fechaLegible ? this._fechaLegible(reserva.vence_apartado_en) : (reserva.vence_apartado_en || 'próximamente');
    const mensaje = `Estimado/a ${lector.nombre || 'lector/a'},\n\nEl libro "${libro?.titulo || ''}" que reservaste ya está disponible para ti en la Biblioteca Pública Municipal de Futrono.\n\nTienes plazo hasta el ${fecha} para retirarlo en el mesón. ¡Te esperamos!`;

    const telefono = this.formatPhone(lector.telefono);
    const email = lector.email;
    const asunto = 'Tu reserva está lista — Biblioteca Municipal de Futrono';

    const overlay = document.createElement('div');
    overlay.className = 'fixed inset-0 bg-patrimonio-lago/40 backdrop-blur-md z-[10000] transition-opacity duration-300 flex items-center justify-center p-4';
    overlay.innerHTML = `
      <div class="bg-patrimonio-card dark:bg-stone-900/95 backdrop-blur-xl border border-white/20 dark:border-stone-700/50 rounded-[2rem] max-w-lg w-full p-8 shadow-soft-xl shadow-patrimonio-lago/20 transform transition-all space-y-4">
        <div>
          <h3 class="font-serif text-lg font-bold text-stone-900 dark:text-stone-100">Avisar a ${escapeHtml(lector.nombre || 'el lector')}</h3>
          <p class="text-xs text-stone-500 dark:text-stone-400 mt-0.5">Reserva disponible · ${escapeHtml(libro?.titulo || '')}</p>
        </div>

        <div>
          <label class="text-[11px] font-black uppercase tracking-wide text-stone-600 dark:text-stone-300 mb-1 block">Mensaje</label>
          <textarea id="notify-reserva-message" aria-label="Texto del aviso al lector" rows="7"
            class="w-full px-3 py-2.5 border border-stone-300 dark:border-stone-600 rounded-md bg-white dark:bg-stone-800 text-sm text-stone-800 dark:text-stone-200 focus:outline-none focus:border-patrimonio-lago focus:ring-1 focus:ring-patrimonio-lago">${escapeHtml(mensaje)}</textarea>
          <p class="text-[11px] text-stone-500 dark:text-stone-400 mt-1">Puedes editarlo antes de enviarlo.</p>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1">
          <button data-action="whatsapp" ${telefono.length < 11 ? 'disabled' : ''}
            class="btn-secundario flex items-center justify-center gap-2 bg-patrimonio-bosque hover:bg-[#22392F] disabled:opacity-40 disabled:cursor-not-allowed text-white px-3 py-2.5 rounded-xl text-sm font-medium">
            <i aria-hidden="true" class="fa-brands fa-whatsapp"></i> WhatsApp
          </button>
          <button data-action="email" ${!email ? 'disabled' : ''}
            class="btn-secundario flex items-center justify-center gap-2 bg-patrimonio-lago hover:bg-[#14303c] disabled:opacity-40 disabled:cursor-not-allowed text-white px-3 py-2.5 rounded-xl text-sm font-medium">
            <i aria-hidden="true" class="fas fa-envelope"></i> Correo
          </button>
          <button data-action="copy"
            class="btn-secundario flex items-center justify-center gap-2 border border-stone-300 dark:border-stone-600 hover:bg-stone-50 dark:hover:bg-stone-800 text-stone-700 dark:text-stone-200 px-3 py-2.5 rounded-xl text-sm font-medium">
            <i aria-hidden="true" class="fas fa-copy"></i> Copiar
          </button>
        </div>
        ${(telefono.length < 11 || !email) ? `<p class="text-[11px] text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-md px-3 py-2">Este lector no tiene ${!email ? 'correo' : ''}${(!email && telefono.length < 11) ? ' ni ' : ''}${telefono.length < 11 ? 'teléfono' : ''} registrado. Complétalo en la vista Lectores para poder avisarle.</p>` : ''}

        <div class="flex justify-end pt-1">
          <button data-action="close" class="px-4 py-2 rounded-xl text-sm font-medium text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800">Cerrar</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    const textarea = overlay.querySelector('#notify-reserva-message');
    const cerrar = this._prepararModal(overlay);

    overlay.querySelector('[data-action="close"]').addEventListener('click', cerrar);
    overlay.addEventListener('click', e => { if (e.target === overlay) cerrar(); });

    overlay.querySelector('[data-action="whatsapp"]').addEventListener('click', () => {
      window.open(`https://wa.me/${telefono}?text=${encodeURIComponent(textarea.value)}`, '_blank', 'noopener');
      cerrar();
    });

    overlay.querySelector('[data-action="email"]').addEventListener('click', () => {
      window.location.href = `mailto:${email}?subject=${encodeURIComponent(asunto)}&body=${encodeURIComponent(textarea.value)}`;
      cerrar();
    });

    overlay.querySelector('[data-action="copy"]').addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(textarea.value);
        this.showToast('Mensaje copiado.', 'success');
      } catch {
        textarea.select();
        try {
          if (document.execCommand('copy')) {
            this.showToast('Mensaje copiado.', 'success');
            return;
          }
        } catch (e) {
          // Ignorar error de fallback
        }
        this.showToast('Selecciona y copia el mensaje manualmente.', 'error');
      }
    });
  }
};
