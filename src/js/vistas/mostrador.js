// Vista Mostrador (mesón de circulación). Extraído de js/modules/ui-base.js
// el 22 de agosto de 2026 (división por vista, ver pendientes-checklist.md y
// claude/plan-division-ui-base-2026-08-22.md) sin cambios de lógica en ese
// momento — el mismo código, solo movido. Ese mismo día, más tarde, sí
// cambió de lógica: la Fase 2 de claude/reservas-whatsapp-meson-2026-08-22.md
// le quitó la cámara (ver renderScannerView), le agregó la fila de espera a
// la ficha de circulación (_fichaCirculacion) y la conectó a Supabase
// Realtime para enterarse en vivo de lo que se escanea desde el celular
// (showQrRemotoModal).
//
// Se llama "mostrador.js" y no "escaner.js" o "scanner.js" para no chocar con
// js/modules/scanner.js (el wrapper de la librería de escaneo de códigos,
// que ya NO usa esta vista — lo sigue usando escaneo-remoto.js, la página
// del enlace sin sesión, donde SÍ vive la cámara).
//
// Sigue funcionando igual porque `Object.assign(UIManager.prototype, ...)`
// (js/modules/ui.js) mezcla los métodos de todas las vistas en el mismo
// prototipo: `this.foo()` no le importa en qué archivo se declaró `foo`
// (por ejemplo, `flujoPrestamo` y `showLectorModal`, que viven en
// js/vistas/prestamos.js).

import { escapeHtml, canalEscaneo } from '../modules/utilidades.js';
import { db } from '../modules/db.js';

import { buscarPorIsbnExterno } from '../modules/libros-externos.js';
import { generarSvgQr } from '../modules/qr.js';


export default {
  /**
   * Sin cámara desde el 22 de agosto de 2026 (Fase 2 de
   * claude/reservas-whatsapp-meson-2026-08-22.md): todo el escaneo con
   * cámara se mudó al celular, por el botón "Escanear desde el celular"
   * (showQrRemotoModal) — esta vista, aparte de ese botón, ahora solo ofrece
   * escribir el código a mano. El módulo de la cámara (scanner.js) sigue
   * existiendo y en uso: lo importa escaneo-remoto.js, la página que abre
   * ese enlace.
   */
  renderScannerView() {
    const container = this._container();
    if (!container) return;

    container.innerHTML = `
      <div class="flex flex-col md:flex-row gap-6 w-full h-full max-w-7xl mx-auto items-start">
        <!-- Panel Izquierdo: El Escáner y Búsqueda -->
        <div class="flex-1 w-full flex flex-col gap-6 sticky top-0">
           <div class="bg-patrimonio-card dark:bg-stone-900 rounded-3xl shadow-soft-xl border border-stone-200 dark:border-stone-700 p-8 flex flex-col items-center justify-center text-center relative overflow-hidden">
               <div class="absolute -top-24 -right-24 w-64 h-64 bg-patrimonio-lago/5 rounded-full blur-3xl pointer-events-none"></div>

               <h3 class="font-serif font-bold text-3xl text-stone-900 dark:text-stone-100 mb-2">Mesón de Circulación</h3>
               <p class="text-sm text-stone-500 dark:text-stone-400 mb-8 max-w-sm">Escanee un libro o ingrese el código manualmente para registrar préstamos y devoluciones.</p>
               
               <div class="w-full max-w-md flex flex-col gap-4">
                  <div class="relative">
                    <i aria-hidden="true" class="fas fa-barcode absolute left-5 top-1/2 -translate-y-1/2 text-xl text-stone-500"></i>
                    <input id="manual-scan-input" aria-label="Escribir el código del libro" placeholder="Ingrese el ISBN..." class="w-full pl-12 pr-4 py-4 bg-white dark:bg-stone-800 border-2 border-stone-200 dark:border-stone-700 rounded-2xl text-lg font-bold text-stone-800 dark:text-stone-200 placeholder-stone-400 focus:border-patrimonio-lago focus:ring-4 focus:ring-patrimonio-lago/10 transition-all shadow-sm outline-none" autocomplete="off" />
                  </div>
                  
                  <button id="manual-scan-btn" class="w-full bg-patrimonio-lago hover:bg-[#14303c] text-white font-bold rounded-2xl shadow-lg shadow-patrimonio-lago/20 px-6 py-4 text-base transition-all active:scale-95 flex items-center justify-center gap-2">
                    <i aria-hidden="true" class="fas fa-search"></i> Buscar Libro
                  </button>
               </div>

               <div class="mt-8 pt-6 border-t border-stone-100 w-full flex flex-wrap items-center justify-between gap-4">
                  <label class="flex items-center gap-3 cursor-pointer group" title="Si está activo, al escanear un libro prestado se devuelve inmediatamente.">
                    <div class="relative">
                      <input type="checkbox" id="fast-return-toggle" class="sr-only toggle-switch-input">
                      <div class="block bg-stone-200 w-12 h-7 rounded-full transition-colors duration-300 ease-in-out toggle-switch-bg group-hover:bg-stone-300">
                         <div class="absolute left-1 top-1 bg-white dark:bg-stone-800 w-5 h-5 rounded-full transition-transform duration-300 ease-in-out shadow-sm toggle-switch-knob flex items-center justify-center">
                         </div>
                      </div>
                    </div>
                    <div class="flex flex-col text-left">
                       <span class="text-sm font-bold text-stone-800 dark:text-stone-200 leading-none">Devolución rápida</span>
                       <span class="text-[10px] text-stone-500 dark:text-stone-400 uppercase tracking-wider font-bold mt-1">Escaneo continuo</span>
                    </div>
                  </label>

                  <button id="qr-remoto-btn" type="button" class="bg-white dark:bg-stone-800 border-2 border-stone-200 dark:border-stone-700 text-stone-700 px-4 py-2.5 rounded-xl text-sm font-bold flex items-center gap-2 hover:bg-stone-50 dark:bg-stone-800/50 transition-all active:scale-95 shadow-sm">
                     <i aria-hidden="true" class="fas fa-mobile-screen-button text-patrimonio-lago"></i>
                     <span class="hidden sm:inline">Usar celular</span>
                  </button>
               </div>
           </div>
        </div>

        <!-- Panel Derecho: Resultados (scan-result) -->
        <div class="flex-[1.5] w-full bg-patrimonio-card dark:bg-stone-900 rounded-3xl shadow-soft-xl border border-stone-200 dark:border-stone-700 overflow-hidden flex flex-col relative min-h-[500px]">
           <div id="scan-result" class="flex-1 flex flex-col p-6 overflow-y-auto">
              <div class="m-auto text-center py-12 text-stone-500">
                <div class="w-24 h-24 mx-auto bg-stone-50 dark:bg-stone-800/50 rounded-full flex items-center justify-center mb-4 border border-stone-100 shadow-inner">
                  <i aria-hidden="true" class="fas fa-book-open text-4xl text-stone-300"></i>
                </div>
                <p class="text-base font-bold text-stone-500 dark:text-stone-400">Esperando escaneo...</p>
                <p class="text-sm mt-1">El resultado aparecerá aquí.</p>
              </div>
           </div>
        </div>
      </div>
    `;

    const showResult = async (code) => {
      const resultEl = document.getElementById('scan-result');
      if (!resultEl) return;
      // Se recuerda el último código mostrado para que un aviso en vivo del
      // escaneo remoto (ver _manejarEscaneoRemoto) sepa si debe refrescar
      // esta misma ficha o solo avisar con un toast — ver showQrRemotoModal.
      this._ultimoCodigoEscaneado = code;

      resultEl.innerHTML = '<div class="flex items-center gap-2 text-sm text-stone-500 dark:text-stone-400"><i aria-hidden="true" class="fas fa-spinner fa-spin text-patrimonio-lago"></i> Consultando…</div>';

      try {
        const resultado = await db.consultarLibro(code);
        if (!resultado) {
          await this._formularioAltaRapida(resultEl, code);
          return;
        }
        const fastReturnToggle = document.getElementById('fast-return-toggle');
          if (fastReturnToggle && fastReturnToggle.checked) {
              const prestamoActivo = resultado.prestamos.find(p => !p.fecha_devolucion_real);
              if (prestamoActivo) {
                  try {
                      await db.devolverPrestamo(prestamoActivo.id);
                      this.showToast('Devolución rápida exitosa.', 'success');
                      resultEl.innerHTML = `<div class="m-auto text-center py-12 text-stone-500 dark:text-stone-400">
                          <div class="w-24 h-24 mx-auto bg-emerald-50 rounded-full flex items-center justify-center mb-4 border border-emerald-100 shadow-inner">
                             <i aria-hidden="true" class="fas fa-check text-4xl text-emerald-500"></i>
                          </div>
                          <p class="text-xl font-bold text-emerald-700">¡Libro devuelto!</p>
                          <p class="text-sm mt-1">Puede escanear el siguiente.</p>
                      </div>`;
                      return;
                  } catch (e) {
                      this.showToast(e.message || 'Error en devolución rápida', 'error');
                  }
              } else {
                  this.showToast('Este libro no tiene préstamos activos.', 'warning');
              }
          }

          const reservas = await db.listarReservas(resultado.libro?.id).catch(() => null);
        resultEl.innerHTML = this._fichaCirculacion(resultado, reservas);
        this._bindFichaCirculacion(resultEl, resultado, code);
      } catch (err) {
        resultEl.innerHTML = `<p class="text-rose-700 font-bold text-sm">${escapeHtml(err.message || 'Error al consultar la base de datos.')}</p>`;
      }
    };
    this._mostrarResultadoEscaneo = showResult;

    document.getElementById('qr-remoto-btn').addEventListener('click', () => this.showQrRemotoModal());

    const buscarManual = () => {
      const input = document.getElementById('manual-scan-input');
      const code = input.value.trim();
      if (code) {
        showResult(code);
        input.value = ''; // UX2: Limpiar para el siguiente escaneo
        input.focus(); // UX1: Mantener el foco
      }
    };
    document.getElementById('manual-scan-btn').addEventListener('click', buscarManual);
    document.getElementById('manual-scan-input').addEventListener('keydown', e => {
      if (e.key === 'Enter') buscarManual();
    });

    // UX1: Auto-focus al cargar la vista
    setTimeout(() => {
      document.getElementById('manual-scan-input')?.focus();
    }, 100);
  },

  /**
   * Alta rápida desde el escáner: el código no está en el catálogo, así que
   * se ofrece agregarlo ahí mismo en vez de mandar a la persona a la vista
   * Catálogo a escribir de nuevo el ISBN que ya se acaba de leer.
   *
   * Título y autor se intentan completar solos con Open Library — es solo
   * una ayuda para no escribirlos a mano: la persona los ve en pantalla y
   * los puede corregir antes de guardar, así que un dato importado mal
   * nunca llega al catálogo sin que alguien lo revise primero.
   */
  async _formularioAltaRapida(resultEl, code) {
    const campo = (id, etiqueta, valor, extra = '') => `
      <div>
        <label for="${id}" class="text-[11px] font-black uppercase tracking-wide text-stone-600 dark:text-stone-300 mb-1 block">${etiqueta}</label>
        <input id="${id}" value="${escapeHtml(valor ?? '')}" ${extra}
          class="w-full px-3 py-2 border border-stone-300 dark:border-stone-600 rounded-md bg-white dark:bg-stone-800 text-sm focus:outline-none focus:border-patrimonio-lago focus:ring-1 focus:ring-patrimonio-lago" />
      </div>`;

    resultEl.innerHTML = `
      <div class="border border-stone-300 dark:border-stone-600 rounded-xl p-4">
        <p class="text-sm text-stone-600 dark:text-stone-300 mb-1">
          Ningún libro registrado con el código <span class="font-mono font-bold">${escapeHtml(code)}</span>.
        </p>
        <p class="text-xs text-stone-500 dark:text-stone-400 mb-3">Complete los datos y agréguelo al catálogo.</p>
        <p id="scan-new-book-buscando" class="text-xs text-stone-500 dark:text-stone-400 mb-3">
          <i aria-hidden="true" class="fas fa-spinner fa-spin"></i> Buscando título y autor en Open Library…
        </p>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          ${campo('scan-new-book-isbn', 'ISBN', code, 'readonly')}
          ${campo('scan-new-book-qty', 'Ejemplares', 1, 'type="number" min="1"')}
          ${campo('scan-new-book-title', 'Título', '')}
          ${campo('scan-new-book-author', 'Autor', '')}
          ${campo('scan-new-book-genre', 'Género (opcional)', '')}
          ${campo('scan-new-book-location', 'Ubicación (opcional)', '')}
        </div>
        <div class="flex justify-end gap-3 pt-3">
          <button id="scan-new-book-btn" class="btn-madera text-white px-5 py-2 rounded-xl text-sm font-medium">
            <i aria-hidden="true" class="fas fa-plus mr-1"></i> Agregar al catálogo
          </button>
        </div>
      </div>`;

    document.getElementById('scan-new-book-btn').addEventListener('click', async e => {
      if (!this.validateBookForm('scan-new-book')) return;
      const btn = e.currentTarget;
      btn.disabled = true;
      try {
        const r = await db.agregarLibro({
          isbn: document.getElementById('scan-new-book-isbn').value.trim(),
          titulo: document.getElementById('scan-new-book-title').value.trim(),
          autor: document.getElementById('scan-new-book-author').value.trim(),
          genero: document.getElementById('scan-new-book-genre').value.trim(),
          ubicacion: document.getElementById('scan-new-book-location').value.trim(),
          stock: Number(document.getElementById('scan-new-book-qty').value || 1)
        });
        // Fase 1.3 (ampliación): ver el mismo comentario en catalogo.js.
        this.showToast(r?.encolado ? r.mensaje : 'Libro agregado al catálogo.', r?.encolado ? 'info' : 'success');
        resultEl.innerHTML = '';
      } catch (err) {
        this.showToast(err.message || 'No se pudo agregar el libro.', 'error');
        btn.disabled = false;
      }
    });

    // Se completa DESPUÉS de pintar el formulario: la persona ya puede
    // empezar a escribir mientras se espera la respuesta externa, y si
    // Open Library no responde a tiempo, el formulario queda intacto para
    // llenarlo a mano — nunca bloquea el alta.
    const datos = await buscarPorIsbnExterno(code);
    const avisoBuscando = document.getElementById('scan-new-book-buscando');
    if (datos) {
      if (avisoBuscando) avisoBuscando.remove();
      const tituloInput = document.getElementById('scan-new-book-title');
      const autorInput = document.getElementById('scan-new-book-author');
      // No se pisa lo que la persona ya haya escrito mientras se esperaba.
      if (tituloInput && !tituloInput.value.trim() && datos.titulo) tituloInput.value = datos.titulo;
      if (autorInput && !autorInput.value.trim() && datos.autor) autorInput.value = datos.autor;
    } else {
      // UX5: Feedback cuando Open Library no encuentra el libro
      if (avisoBuscando) avisoBuscando.innerHTML = '<i aria-hidden="true" class="fas fa-info-circle mr-1 text-stone-500 dark:text-stone-400"></i> No se encontraron datos automáticos. Llene los campos manualmente.';
    }
  },

  /**
   * Código QR de escaneo remoto SIN sesión: manda a escaneo-remoto.html, una
   * página aparte del sistema principal, con un token de un solo objetivo en
   * la URL (?token=...). Quien lo abra puede agregar o reponer libros al
   * catálogo — nada más — sin iniciar sesión ni tener cuenta.
   *
   * Es justo lo contrario de la versión anterior de este modal, que mandaba
   * a "?vista=scanner" y exigía iniciar sesión igual: eso servía para el
   * propio personal, no para prestarle el celular a alguien sin cuenta (un
   * voluntario, un proveedor que trae libros nuevos).
   *
   * El token se genera en el momento (crear_enlace_escaneo, ver
   * 010_consolidacion.sql) y se muestra UNA sola vez, aquí: desde ese
   * instante la base solo guarda su huella, no el token en sí. Por eso el
   * enlace vence solo y se puede revocar de inmediato con el botón de abajo
   * — es lo más parecido a "no se filtra la dirección" que se puede ofrecer
   * sin dejar de ser un enlace: técnicamente nada impide que alguien lo
   * reenvíe o lo capture en una foto, así que la defensa real es que deja de
   * servir apenas se revoca o vence.
   */
  async showQrRemotoModal() {
    const overlay = document.createElement('div');
    overlay.className = 'fixed inset-0 bg-patrimonio-lago/50 backdrop-blur-sm z-[10000] flex items-center justify-center p-4';

    overlay.innerHTML = `
      <div class="bg-patrimonio-card dark:bg-stone-900 border border-stone-300 dark:border-stone-600 rounded-2xl max-w-sm w-full p-6 shadow-2xl space-y-4 text-center">
        <h3 class="font-serif text-lg font-bold text-stone-900 dark:text-stone-100">Escanear desde el celular</h3>
        <p class="text-xs text-stone-600 dark:text-stone-300">
          Quien escanee este código NO necesita iniciar sesión. Si el libro es nuevo lo agrega al
          catálogo; si ya existe, solo muestra quién lo tiene — nada más — y el enlace deja de
          servir cuando vence o lo revoca. Cada escaneo remoto se avisa aquí, en vivo.
        </p>
        <label for="qr-remoto-horas" class="text-[11px] font-black uppercase tracking-wide text-stone-600 dark:text-stone-300 block">Vigente por</label>
        <select id="qr-remoto-horas" class="w-full px-3 py-2 border border-stone-300 dark:border-stone-600 rounded-md bg-white dark:bg-stone-800 text-sm">
          <option value="1">1 hora</option>
          <option value="4" selected>4 horas</option>
          <option value="8">8 horas (una jornada)</option>
          <option value="24">24 horas (máximo)</option>
        </select>
        <div id="qr-remoto-cuerpo">
          <div class="flex items-center justify-center py-2 min-h-[180px]">
            <i aria-hidden="true" class="fas fa-spinner fa-spin text-2xl text-patrimonio-lago"></i>
            <span class="sr-only">Generando el enlace…</span>
          </div>
        </div>
        <button data-action="cerrar" class="btn-secundario border border-stone-300 dark:border-stone-600 bg-white dark:bg-stone-800 text-stone-700 px-4 py-2 rounded-xl text-sm font-bold w-full">Cerrar</button>
      </div>`;
    document.body.appendChild(overlay);

    // Enlace vigente en este momento, para poder revocarlo con el botón de
    // abajo sin tener que ir hasta Administración → Enlaces remotos.
    let enlaceActual = null;

    // Canal de Realtime Broadcast de ESTE enlace (ver canalEscaneo() en
    // utilidades.js): mientras esta ventana está abierta, el mesón se entera
    // en vivo de cada código que se escanea desde el celular, sin que nadie
    // toque nada — ni siquiera hace falta tener la vista Escanear abierta,
    // aparece igual como aviso (showToast). Se abre un canal nuevo por cada
    // enlace (el nombre depende del token) y se cierra el anterior primero:
    // nunca debe quedar más de un canal escuchando por esta ventana.
    let canalRealtime = null;
    let modalCerrado = false; // BUG-10: Evita que el canal quede suscrito si el modal se cerró antes

    const desuscribirCanal = async () => {
      if (canalRealtime) { await db.detenerEscucha(canalRealtime); }
      canalRealtime = null;
    };

    // `alCerrar` (no envolver el `cerrar` devuelto) porque _prepararModal
    // también cierra el modal con la tecla Escape, con su propio `cerrar`
    // interno — envolver solo el valor de retorno se lo saltaría y el canal
    // quedaría abierto de más.
    const cerrar = this._prepararModal(overlay, { 
      alCerrar: () => {
        modalCerrado = true;
        desuscribirCanal();
      }
    });
    
    overlay.querySelector('[data-action="cerrar"]').addEventListener('click', cerrar);
    overlay.addEventListener('click', e => { if (e.target === overlay) cerrar(); });
    
    const suscribirCanal = async (token) => {
      desuscribirCanal();
      if (modalCerrado) return;
      try {
        const nombre = await canalEscaneo(token);
        // BUG-10: Si el usuario cerró el modal mientras se resolvía canalEscaneo(), 
        // no suscribimos el canal.
        if (modalCerrado) return; 

        canalRealtime = await db.escucharEscaneos(nombre, ({ payload }) => {
            this.showToast(`Escaneo remoto: ${payload?.titulo || payload?.isbn || 'libro'}`, 'info');
            if (payload?.isbn && payload.isbn === this._ultimoCodigoEscaneado && document.getElementById('scan-result')) {
              this._mostrarResultadoEscaneo?.(payload.isbn);
            }
          });
      } catch (e) {
        // best-effort: sin aviso en vivo, el escaneo remoto sigue
        // funcionando igual — solo no se refleja solo en esta ventana.
      }
    };

    const generar = async () => {
      const cuerpo = document.getElementById('qr-remoto-cuerpo');
      if (!cuerpo) return;
      cuerpo.innerHTML = `<div class="flex items-center justify-center py-2 min-h-[180px]">
        <i aria-hidden="true" class="fas fa-spinner fa-spin text-2xl text-patrimonio-lago"></i>
        <span class="sr-only">Generando el enlace…</span></div>`;

      // Si ya había un enlace vigente (por ejemplo, se cambió la duración),
      // se revoca antes de generar el siguiente: no debe quedar más de un
      // enlace válido abierto por esta ventana a la vez.
      desuscribirCanal();
      if (enlaceActual) {
        try { await db.revocarEnlaceEscaneo(enlaceActual.id); } catch (e) { /* best-effort */ }
        enlaceActual = null;
      }

      const horas = Number(document.getElementById('qr-remoto-horas')?.value || 4);
      try {
        enlaceActual = await db.crearEnlaceEscaneo(horas);
        if (!enlaceActual) throw new Error('El sistema no devolvió el enlace.');
      } catch (err) {
        cuerpo.innerHTML = `<p class="text-xs text-rose-700 py-6">${escapeHtml(err.message || 'No se pudo generar el enlace.')}</p>`;
        return;
      }
      suscribirCanal(enlaceActual.token);

      const url = `${window.location.origin}${window.location.pathname.replace(/index\.html$/, '')}escaneo-remoto.html?token=${encodeURIComponent(enlaceActual.token)}`;
      cuerpo.innerHTML = `
        <div id="qr-remoto-imagen" class="flex items-center justify-center py-2 min-h-[180px]">
          <i aria-hidden="true" class="fas fa-spinner fa-spin text-2xl text-patrimonio-lago"></i>
          <span class="sr-only">Dibujando el código QR…</span>
        </div>
        <p class="text-[11px] font-mono text-stone-500 dark:text-stone-400 break-all">${escapeHtml(url)}</p>
        <p class="text-[11px] text-stone-500 dark:text-stone-400">Vence el ${escapeHtml(this._fechaHoraLegible(enlaceActual.expira_en))}.</p>
        <button data-action="revocar" class="text-rose-700 hover:text-rose-800 text-xs font-bold underline mt-1">
          <i aria-hidden="true" class="fas fa-ban mr-1"></i>Revocar este enlace ahora
        </button>`;

      try {
        const svg = await generarSvgQr(url);
        const contenedor = document.getElementById('qr-remoto-imagen');
        if (contenedor) contenedor.innerHTML = svg;
      } catch (e) {
        const contenedor = document.getElementById('qr-remoto-imagen');
        if (contenedor) contenedor.innerHTML = '<p class="text-xs text-rose-700">No se pudo generar el código QR. Puede copiar la dirección de más abajo.</p>';
      }

      cuerpo.querySelector('[data-action="revocar"]')?.addEventListener('click', async btn_e => {
        const boton = btn_e.currentTarget;
        boton.disabled = true;
        try {
          await db.revocarEnlaceEscaneo(enlaceActual.id);
          enlaceActual = null;
          desuscribirCanal();
          this.showToast('Enlace revocado. Ya no sirve para agregar libros.', 'success');
          cuerpo.innerHTML = '<p class="text-xs text-stone-500 dark:text-stone-400 py-6">Este enlace fue revocado. Genere uno nuevo si lo necesita.</p>';
        } catch (err) {
          this.showToast(err.message || 'No se pudo revocar el enlace.', 'error');
          boton.disabled = false;
        }
      });
    };

    document.getElementById('qr-remoto-horas').addEventListener('change', generar);
    generar();
  },

  /**
   * Ficha de circulación: lo que ve la persona del mesón al escanear un código.
   * Muestra el libro, cuántos ejemplares hay libres, y por cada préstamo activo
   * quién lo tiene, con qué RUT, cuándo vence y en qué situación está esa
   * persona (al día, con atrasos, o bloqueada).
   */
  _fichaCirculacion({ libro, prestamos }, reservas) {
    const disponibles = libro.stock ?? 0;
    const hayDisponibles = disponibles > 0;
    // reservas llega de db.listarReservas(libro.id): null si la migración
    // 022 no está aplicada (se omite la sección entera, sin romper la
    // ficha), [] si nadie espera este libro.
    const vigentes = (reservas || []).filter(r => r.estado === 'activa' || r.estado === 'apartada');

    const filaReserva = r => `
      <div class="border-t border-stone-200 dark:border-stone-700 pt-3 mt-3">
        <div class="flex items-start justify-between gap-3 flex-wrap">
          <div class="min-w-0">
            <p class="text-[10px] font-black uppercase tracking-widest text-stone-500 dark:text-stone-400 mb-0.5">
              ${r.estado === 'apartada' ? 'Apartado para' : `En fila (posición ${escapeHtml(String(r.posicion_en_fila ?? '?'))})`}
            </p>
            <p class="font-bold text-stone-800 dark:text-stone-200">${escapeHtml(r.lector_nombre || 'Lector desconocido')}</p>
            <p class="text-xs font-mono text-stone-500 dark:text-stone-400">${escapeHtml(r.lector_rut || '—')}</p>
          </div>
          ${r.estado === 'apartada'
            ? `<span class="stamp stamp-info !rotate-0 shrink-0"><i aria-hidden="true" class="fas fa-box-archive"></i> Apartado</span>`
            : `<span class="stamp !rotate-0 shrink-0"><i aria-hidden="true" class="fas fa-user-clock"></i> En fila</span>`}
        </div>
      
        ${r.estado === 'apartada' ? `
          <div class="flex flex-wrap gap-2 mt-3">
            <button data-entregar-reserva="${escapeHtml(String(r.id))}" class="btn-secundario bg-patrimonio-bosque text-white px-3 py-1.5 rounded-lg text-xs font-bold">
              <i aria-hidden="true" class="fas fa-hand-holding-hand mr-1"></i> Entregar libro
            </button>
            <button data-avisar-reserva="${escapeHtml(String(r.id))}" data-rut="${escapeHtml(r.lector_rut)}" data-vence="${escapeHtml(r.vence_apartado_en)}" class="btn-secundario border border-stone-300 dark:border-stone-600 bg-white dark:bg-stone-800 text-stone-700 px-3 py-1.5 rounded-lg text-xs font-bold">
              <i aria-hidden="true" class="fab fa-whatsapp mr-1 text-green-600"></i> Avisar lector
            </button>
          </div>
        ` : ''}
      </div>`;
    const filaPrestamo = p => {
      const estado = this._estadoPrestamo(p.fecha_devolucion_esperada);
      const lector = p.lector || {};
      // El lector queda impedido de pedir más si está bloqueado a mano o tiene atrasos
      const impedido = lector.bloqueado_manual || (lector.atrasados ?? 0) > 0;
      const atrasados = Number(lector.atrasados ?? 0);
      const insignia = lector.bloqueado_manual
        ? '<span class="stamp stamp-danger !rotate-0"><i aria-hidden="true" class="fas fa-ban"></i> Bloqueado</span>'
        : atrasados > 0
          ? `<span class="stamp stamp-danger !rotate-0"><i aria-hidden="true" class="fas fa-triangle-exclamation"></i> Debe ${atrasados} libro${atrasados === 1 ? '' : 's'}</span>`
          : '<span class="stamp stamp-success !rotate-0"><i aria-hidden="true" class="fas fa-check"></i> Al día</span>';

      return `
        <div class="border-t border-stone-200 dark:border-stone-700 pt-3 mt-3">
          <div class="flex items-start justify-between gap-3 flex-wrap">
            <div class="min-w-0">
              <p class="text-[10px] font-black uppercase tracking-widest text-stone-500 dark:text-stone-400 mb-0.5">En poder de</p>
              <p class="font-bold text-stone-800 dark:text-stone-200">${escapeHtml(lector.nombre || 'Lector desconocido')}</p>
              <p class="text-xs font-mono text-stone-500 dark:text-stone-400">${escapeHtml(lector.rut || '—')}</p>
              <div class="mt-1.5">${insignia}</div>
            </div>
            <div class="text-right shrink-0">
              <p class="text-[10px] font-black uppercase tracking-widest text-stone-500 dark:text-stone-400 mb-0.5">Devolución</p>
              <p class="text-sm ${estado.clave === 'vencido' ? 'text-rose-700 font-bold' : estado.clave === 'porVencer' ? 'text-amber-700 font-bold' : 'text-stone-700'}">
                ${this._fechaLegible(p.fecha_devolucion_esperada)}
              </p>
              <p class="text-[11px] ${estado.clave === 'vencido' ? 'text-rose-700' : estado.clave === 'porVencer' ? 'text-amber-700' : 'text-stone-500 dark:text-stone-400'}">${escapeHtml(estado.etiqueta)}</p>
            </div>
          </div>
          <div class="flex flex-wrap gap-2 mt-3">
            <button data-devolver="${escapeHtml(String(p.id))}" class="btn-secundario bg-patrimonio-bosque text-white px-3 py-1.5 rounded-lg text-xs font-bold">
              <i aria-hidden="true" class="fas fa-rotate-left mr-1"></i> Registrar devolución
            </button>
            ${estado.clave !== 'alDia' ? `
              <button data-avisar="${escapeHtml(String(p.id))}" class="btn-secundario bg-patrimonio-madera text-white px-3 py-1.5 rounded-lg text-xs font-bold">
                <i aria-hidden="true" class="fas fa-bell mr-1"></i> Avisar
              </button>` : ''}
            ${estado.clave !== 'vencido' && (p.renovaciones ?? 0) < this.param('max_renovaciones') ? `
              <button data-renovar="${escapeHtml(String(p.id))}" class="btn-secundario border border-stone-300 dark:border-stone-600 bg-white dark:bg-stone-800 text-stone-700 px-3 py-1.5 rounded-lg text-xs font-bold">
                <i aria-hidden="true" class="fas fa-clock-rotate-left mr-1"></i> Renovar
              </button>` : ''}
            ${impedido ? `
              <button data-ver-lector="${escapeHtml(lector.rut || '')}" class="btn-secundario border border-rose-200 bg-rose-50 text-rose-700 px-3 py-1.5 rounded-lg text-xs font-bold">
                <i aria-hidden="true" class="fas fa-user-large mr-1"></i> Ver situación
              </button>` : ''}
          </div>
        </div>`;
    };

    return `
      <div class="border border-stone-300 dark:border-stone-600 rounded-xl overflow-hidden">
        <div class="p-4 bg-stone-50 dark:bg-stone-800/50/70 flex items-start gap-3">
          ${this._portadaHtml(libro)}
          <div class="min-w-0 flex-1">
            <p class="font-serif font-semibold text-stone-900 dark:text-stone-100 leading-tight">${escapeHtml(libro.titulo)}</p>
            <p class="text-sm text-stone-500 dark:text-stone-400">${escapeHtml(libro.autor)}</p>
            <p class="text-[11px] font-mono text-stone-500 dark:text-stone-400 mt-0.5">${escapeHtml(libro.isbn || 'sin ISBN')}</p>
            <div class="flex flex-wrap gap-1.5 mt-2">
              <span class="stamp ${hayDisponibles ? 'stamp-success' : 'stamp-danger'} !rotate-0">
                <i aria-hidden="true" class="fas ${hayDisponibles ? 'fa-check' : 'fa-xmark'}"></i>
                ${Number(disponibles)} de ${Number(libro.copias_totales ?? disponibles)} disponible${disponibles === 1 ? '' : 's'}
              </span>
              ${libro.ubicacion ? `<span class="stamp stamp-info !rotate-0"><i aria-hidden="true" class="fas fa-location-dot"></i> ${escapeHtml(libro.ubicacion)}</span>` : ''}
            </div>
          </div>
        </div>

        <div class="p-4">
          ${prestamos.length === 0
            ? '<p class="text-xs text-stone-500 dark:text-stone-400"><i aria-hidden="true" class="fas fa-circle-info mr-1"></i>Sin préstamos activos. Todos los ejemplares están en la biblioteca.</p>'
            : `<p class="text-[10px] font-black uppercase tracking-widest text-stone-500 dark:text-stone-400">${prestamos.length} préstamo${prestamos.length === 1 ? '' : 's'} activo${prestamos.length === 1 ? '' : 's'}</p>
               ${prestamos.map(filaPrestamo).join('')}`}

          ${vigentes.length > 0 ? `
            <p class="text-[10px] font-black uppercase tracking-widest text-stone-500 dark:text-stone-400 mt-4">${vigentes.length} reserva${vigentes.length === 1 ? '' : 's'} vigente${vigentes.length === 1 ? '' : 's'}</p>
            ${vigentes.map(filaReserva).join('')}` : ''}

          <div class="border-t border-stone-200 dark:border-stone-700 pt-4 mt-4">
            ${hayDisponibles
              ? `<button data-prestar-libro="${escapeHtml(String(libro.id))}" class="btn-madera w-full text-white font-medium rounded-xl shadow py-2.5 text-sm">
                  <i aria-hidden="true" class="fas fa-right-left mr-1.5"></i> Prestar este libro
                 </button>`
              : `<button data-reservar-libro="${escapeHtml(String(libro.id))}" class="btn-secundario bg-patrimonio-madera text-white font-medium rounded-xl shadow py-2.5 text-sm w-full">
                  <i aria-hidden="true" class="fas fa-clock mr-1.5"></i> Reservar este libro
                 </button>`
            }
          </div>
        </div>
      </div>`;
  },

  _bindFichaCirculacion(resultEl, resultado, código) {
    const recargar = () => this._mostrarResultadoEscaneo?.(código);

    resultEl.querySelectorAll('[data-entregar-reserva]').forEach(btn => {
      btn.addEventListener('click', async () => {
        btn.disabled = true;
        try {
          await db.retirarReserva(btn.dataset.entregarReserva);
          this.showToast('Reserva entregada. Se ha registrado el préstamo.', 'success');
          recargar();
        } catch (err) {
          this.showToast(err.message || 'Error al entregar la reserva.', 'error');
          btn.disabled = false;
        }
      });
    });

    resultEl.querySelectorAll('[data-avisar-reserva]').forEach(btn => {
      btn.addEventListener('click', async () => {
        btn.disabled = true;
        try {
          // estadoLector devuelve objeto plano (nombre, email, telefono, etc.),
          // no un objeto anidado { lector: {...} }. Se mapea al formato que espera showNotifyReservaModal.
          const datos = await db.estadoLector(btn.dataset.rut);
          const lector = { nombre: datos.nombre, email: datos.email, telefono: datos.telefono };
          if (typeof this.showNotifyReservaModal === 'function') {
            this.showNotifyReservaModal(
              { vence_apartado_en: btn.dataset.vence },
              resultado.libro,
              lector
            );
          } else {
            this.showToast('El módulo de notificaciones no está disponible.', 'error');
          }
        } catch (err) {
          this.showToast(err.message || 'Error al obtener datos del lector.', 'error');
        } finally {
          btn.disabled = false;
        }
      });
    });

    resultEl.querySelectorAll('[data-reservar-libro]').forEach(btn => {
      btn.addEventListener('click', () => this.flujoReserva(btn.dataset.reservarLibro, recargar));
    });

    resultEl.querySelectorAll('[data-devolver]').forEach(btn => {
      btn.addEventListener('click', async () => {
        btn.disabled = true;
        try {
          const r = await db.devolverPrestamo(btn.dataset.devolver);
          if (r?.encolado) {
            this.showToast(r.mensaje, 'info');
          } else {
            this.showToast('Devolución registrada.', 'success');
          }
          recargar();
        } catch (err) {
          this.showToast(err.message || 'No se pudo registrar la devolución.', 'error');
          btn.disabled = false;
        }
      });
    });

    resultEl.querySelectorAll('[data-renovar]').forEach(btn => {
      btn.addEventListener('click', async () => {
        btn.disabled = true;
        try {
          const r = await db.renovarPrestamo(btn.dataset.renovar);
          if (r?.encolado) {
            this.showToast(r.mensaje, 'info');
          } else {
            this.showToast(`Renovado hasta el ${this._fechaLegible(r?.nueva_fecha)}.`, 'success');
          }
          recargar();
        } catch (err) {
          this.showToast(err.message || 'No se pudo renovar.', 'error');
          btn.disabled = false;
        }
      });
    });

    resultEl.querySelectorAll('[data-avisar]').forEach(btn => {
      btn.addEventListener('click', () => {
        const p = resultado.prestamos.find(x => String(x.id) === String(btn.dataset.avisar));
        if (!p) return;
        // showNotifyModal espera la forma que devuelve obtenerPrestamos
        this.showNotifyModal({
          id: p.id,
          fecha_devolucion_esperada: p.fecha_devolucion_esperada,
          libros: resultado.libro,
          lectores: p.lector
        });
      });
    });

    resultEl.querySelectorAll('[data-ver-lector]').forEach(btn => {
      btn.addEventListener('click', () => this.showLectorModal(btn.dataset.verLector));
    });

    resultEl.querySelectorAll('[data-prestar-libro]').forEach(btn => {
      btn.addEventListener('click', () => this.flujoPrestamo(btn.dataset.prestarLibro, recargar));
    });
  }
};
