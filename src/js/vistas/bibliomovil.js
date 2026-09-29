import { supabase } from '../supabase-init.js';
import { db } from '../modules/db.js';
import persistencia from '../modules/persistencia.js';

// Vista Catálogo. Extraído de js/modules/ui-base.js el 22 de agosto de 2026
// (división por vista, ver pendientes-checklist.md y
// claude/plan-division-ui-base-2026-08-22.md). El bloque venía marcado
// internamente como "CATÁLOGO" en ui-base.js, pero eso ya no aplicaba desde
// que la vista Administración se movió a js/vistas/admin.js en una ronda
// anterior — el marcador quedó apuntando a algo que ya no estaba ahí. Sin
// cambios de lógica: es el mismo código, solo movido.
//
// `_bindPaginacion` se queda en ui-base.js (la usan Catálogo, Lectores y
// Préstamos por igual, junto a `_paginacionHtml`). `promptCreateLoan` llama
// a `flujoPrestamo`, que vive en js/vistas/prestamos.js — sigue funcionando
// igual porque `Object.assign(UIManager.prototype, ...)` (js/modules/ui.js)
// mezcla los métodos de todas las vistas en el mismo prototipo: `this.foo()`
// no le importa en qué archivo se declaró `foo`.

import { html, crudo } from '../modules/utilidades.js';

export default {
  // Bibliomóvil overrides
  async renderBibliomovil() {
    const container = this._container();
    if (!container) return;

    const porPagina = this.param('filas_por_pagina');
        // Fase 3 offline: delegar filtrado a db.libros
    const { libros, total } = await db.obtenerLibros(
      this.bibliomovilSearch || '', 
      this.bookPage, 
      porPagina, 
      true, // esBibliomovil = true
      this.bibliomovilFilter || 'todos'
    );
    // Si el usuario ya cambió de vista mientras esperábamos la respuesta, no pintamos nada
    if (this.currentView !== 'bibliomovil') return;

    // Si se borró el último elemento de la última página, se retrocede una
    if (libros.length === 0 && this.bookPage > 0) {
      this.bookPage = Math.max(0, Math.ceil(total / porPagina) - 1);
      return this.renderBibliomovil();
    }

    container.innerHTML = html`
      <div class="bibliomovil-card bg-patrimonio-card dark:bg-stone-900 rounded-2xl shadow-sm border border-stone-300 dark:border-stone-600 mb-6">
        <div class="p-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h2 class="font-serif font-bold text-xl text-stone-900 dark:text-stone-100 flex items-center gap-2">
              <i aria-hidden="true" class="fas fa-truck text-patrimonio-lago"></i> Modo Ruta
            </h2>
            <p class="text-sm text-stone-500 dark:text-stone-400 mt-1">
              Última preparación: <span id="bibliomovil-sync-status" class="font-semibold text-stone-700 dark:text-stone-300">Desconocida</span>
            </p>
          </div>
          <button id="btn-preparar-ruta" class="bg-patrimonio-madera text-white px-5 py-2.5 rounded-xl font-bold shadow-md hover:bg-[#5E3214] transition-all flex items-center gap-2">
            <i aria-hidden="true" class="fas fa-cloud-arrow-down"></i> <span id="btn-preparar-ruta-texto">Preparar ruta de hoy</span>
          </button>
        </div>
      </div>
      <div class="bibliomovil-card bg-patrimonio-card dark:bg-stone-900 rounded-2xl shadow-sm border border-stone-300 dark:border-stone-600 overflow-x-auto">
        <div class="bibliomovil-card-header flex flex-col gap-3">
        <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <h3 class="font-serif font-semibold text-lg text-stone-900 dark:text-stone-100">Catálogo de libros</h3>
          <div class="relative sm:w-64">
            <i aria-hidden="true" class="fas fa-magnifying-glass absolute left-3 top-1/2 -translate-y-1/2 text-stone-500 dark:text-stone-400 text-xs"></i>
            <input id="bibliomovil-search-input" aria-label="Buscar en el catálogo por título, autor o ISBN" type="text" placeholder="Buscar por título, autor o ISBN..." value="${this.bibliomovilSearch || ''}"
              class="w-full pl-8 pr-3 py-2 text-sm border border-stone-300 dark:border-stone-600 rounded-md bg-white dark:bg-stone-800 focus:outline-none focus:border-patrimonio-lago focus:ring-1 focus:ring-patrimonio-lago" />
          </div>
        </div>
        <div class="flex flex-wrap gap-2 mt-1">
          <button class="bibliomovil-filter-btn px-4 py-2 rounded-full text-xs uppercase tracking-wider font-bold transition-all ${(!this.bibliomovilFilter || this.bibliomovilFilter === 'todos') ? 'bg-stone-800 text-white dark:bg-stone-200 dark:text-stone-900 shadow-md scale-105' : 'bg-stone-200 text-stone-600 hover:bg-stone-300 dark:bg-stone-800 dark:text-stone-300 dark:hover:bg-stone-700'}" data-filter="todos">Todos</button>
          <button class="bibliomovil-filter-btn px-4 py-2 rounded-full text-xs uppercase tracking-wider font-bold transition-all ${this.bibliomovilFilter === 'disponibles' ? 'bg-emerald-600 text-white dark:bg-emerald-500 dark:text-stone-900 shadow-md scale-105' : 'bg-stone-200 text-stone-600 hover:bg-stone-300 dark:bg-stone-800 dark:text-stone-300 dark:hover:bg-stone-700'}" data-filter="disponibles">En estante</button>
          <button class="bibliomovil-filter-btn px-4 py-2 rounded-full text-xs uppercase tracking-wider font-bold transition-all ${this.bibliomovilFilter === 'prestados' ? 'bg-amber-600 text-white dark:bg-amber-500 dark:text-stone-900 shadow-md scale-105' : 'bg-stone-200 text-stone-600 hover:bg-stone-300 dark:bg-stone-800 dark:text-stone-300 dark:hover:bg-stone-700'}" data-filter="prestados">Agotados</button>
        </div>
      </div>
        <div id="bibliomovil-tbody" class="flex flex-col gap-4 p-4">${this._renderBookRows(libros)}</div>
        <div id="bibliomovil-pagination">${crudo(this._paginacionHtml(this.bookPage, total, porPagina, 'bibliomovil-page-btn'))}</div>
      </div>
    `;

    this._booksCache = libros;

    this._bindCatalogRowEvents(container);
    this._bindPaginacion(container, '.bibliomovil-page-btn', p => { this.bookPage = p; this.renderBibliomovil(); });

    container.querySelectorAll('.bibliomovil-filter-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this.bibliomovilFilter = btn.dataset.filter;
        this.bookPage = 0;
        this.renderBibliomovil();
      });
    });

    // Buscador con debounce: espera 350ms sin escribir antes de consultar la BD.
    // Al buscar se vuelve a la primera página, porque el total de resultados cambió.
    const searchInput = document.getElementById('bibliomovil-search-input');
    searchInput.addEventListener('input', () => {
      clearTimeout(this._bibliomovilSearchTimer);
      this._bibliomovilSearchTimer = setTimeout(async () => {
        this.bibliomovilSearch = searchInput.value.trim();
        this.bookPage = 0;
        let queryRes = supabase.from('libros').select('*', { count: 'exact' }).ilike('ubicacion', '%bibliom%').order('titulo', { ascending: true }).range(0, porPagina - 1);
if (this.bibliomovilSearch) queryRes = queryRes.or(`titulo.ilike.%${this.bibliomovilSearch}%,autor.ilike.%${this.bibliomovilSearch}%`);
const { data: resData, count: resCount } = await queryRes;
const resultados = resData || [];
const totalNuevo = resCount || 0;
        const tbody = document.getElementById('bibliomovil-tbody');
        if (this.currentView !== 'bibliomovil' || !tbody) return;
        this._booksCache = resultados;
        // _renderBookRows siempre devuelve HtmlSeguro — llamar .toString() es suficiente
        tbody.innerHTML = this._renderBookRows(this._filtrarLibros(resultados)).toString();
        const paginacion = document.getElementById('bibliomovil-pagination');
        if (paginacion) {
          paginacion.innerHTML = this._paginacionHtml(0, totalNuevo, porPagina, 'bibliomovil-page-btn');
          this._bindPaginacion(container, '.bibliomovil-page-btn', p => { this.bookPage = p; this.renderBibliomovil(); });
        }
        this._bindCatalogRowEvents(container);
      }, 350);
    });

    // Indicador de última preparación de ruta
    this._actualizarIndicadorRuta();

    // Botón "Preparar ruta de hoy"
    const btnPreparar = document.getElementById('btn-preparar-ruta');
    if (btnPreparar) {
      btnPreparar.addEventListener('click', async () => {
        const textoBtn = document.getElementById('btn-preparar-ruta-texto');
        btnPreparar.disabled = true;
        const actualizar = ({ mensaje }) => {
          if (textoBtn) textoBtn.textContent = mensaje;
        };
        actualizar({ mensaje: 'Iniciando descarga...' });
        try {
          await persistencia.sincronizarTodo(actualizar);
          localStorage.setItem('biblionexo_ultima_preparacion_ruta', Date.now());
          this._actualizarIndicadorRuta();
          this.showToast('¡Ruta preparada! Los datos están listos para trabajar sin conexión.', 'success');
        } catch (err) {
          this.showToast('Error al preparar la ruta: ' + (err.message || 'Inténtalo de nuevo.'), 'error');
        } finally {
          btnPreparar.disabled = false;
          if (textoBtn) textoBtn.textContent = 'Preparar ruta de hoy';
        }
      });
    }
  },

  /** Actualiza el texto "Última preparación: ..." en la tarjeta Modo Ruta. */
  _actualizarIndicadorRuta() {
    const el = document.getElementById('bibliomovil-sync-status');
    if (!el) return;
    const ts = localStorage.getItem('biblionexo_ultima_preparacion_ruta');
    if (!ts) { el.textContent = 'Nunca'; return; }
    const hace = Math.round((Date.now() - Number(ts)) / 60000);
    if (hace < 1)        el.textContent = 'Hace menos de un minuto';
    else if (hace < 60)  el.textContent = `Hace ${hace} min`;
    else if (hace < 1440) el.textContent = `Hace ${Math.round(hace / 60)} h`;
    else                 el.textContent = `Hace ${Math.round(hace / 1440)} día(s)`;
  },

  // HTML de las filas del catálogo. Separado de renderBibliomovil para poder
  // refrescar solo el <tbody> cuando se busca, sin recrear todo el formulario.
  
  _filtrarLibros(libros) {
    const f = this.bibliomovilFilter || 'todos';
    if (f === 'disponibles') return libros.filter(b => b.stock > 0);
    if (f === 'prestados') return libros.filter(b => b.stock === 0);
    return libros;
  },

  _renderBookRows(books) {
    if (!books.length) {
      return html`<div class="px-4 py-6 text-center text-stone-500 dark:text-stone-400">Sin libros que coincidan con la búsqueda.</div>`;
    }
    return html`${books.map((b, i) => html`
      <div class="bg-white dark:bg-stone-800 rounded-2xl p-4 shadow-sm border border-stone-200 dark:border-stone-700 flex flex-col md:flex-row gap-4 items-start md:items-center animate-fade-up" style="animation-delay: ${i * 0.05}s">
        
        <div class="flex items-start gap-4 flex-1 min-w-0">
          ${crudo(this._portadaHtml(b))}
          <div class="min-w-0">
            <h3 class="font-bold text-stone-900 dark:text-stone-100 text-lg truncate">${b.titulo}</h3>
            <p class="text-sm text-stone-500 dark:text-stone-400 truncate">${b.autor}</p>
            <div class="text-xs text-stone-400 dark:text-stone-500 mt-1 mb-2 font-mono">${b.isbn}</div>
            ${(b.genero || b.ubicacion) ? html`
              <div class="flex flex-wrap gap-2">
                ${b.genero ? html`<span class="stamp stamp-info !rotate-0 !text-[10px] !py-0.5 !px-2"><i aria-hidden="true" class="fas fa-tag mr-1"></i> ${b.genero}</span>` : ''}
                ${b.ubicacion ? html`<span class="stamp stamp-success !rotate-0 !text-[10px] !py-0.5 !px-2"><i aria-hidden="true" class="fas fa-location-dot mr-1"></i> ${b.ubicacion}</span>` : ''}
              </div>` : ''}
          </div>
        </div>

        <div class="flex flex-col md:items-end gap-3 shrink-0">
          <div class="text-center md:text-right">
            <span class="text-[10px] font-bold uppercase tracking-widest text-stone-400 block mb-0.5">Disponibles</span>
            <span class="${b.stock === 0 ? 'text-rose-600' : b.stock <= 1 ? 'text-amber-600' : 'text-emerald-600'} font-black text-xl">${b.stock}</span>
            <span class="text-stone-400 dark:text-stone-500 text-sm">/ ${b.copias_totales ?? b.stock}</span>
          </div>
          
          <div class="flex flex-wrap gap-2 justify-end">
            ${b.stock > 0
              ? html`<button class="loan-book-btn bg-patrimonio-madera text-white px-5 py-2.5 rounded-full text-sm font-semibold shadow-md hover:bg-[#5E3214] transition-all hover:scale-105 active:scale-95" data-id="${b.id}"><i aria-hidden="true" class="fas fa-hand-holding-hand mr-1"></i> Prestar</button>`
              : html`<button class="reserve-book-btn btn-secundario px-4 py-2 rounded-xl text-xs font-bold text-patrimonio-lago border border-stone-300 dark:border-stone-600 hover:bg-stone-50 dark:hover:bg-stone-700 transition" data-id="${b.id}"><i aria-hidden="true" class="fas fa-bookmark mr-1"></i> Reservar</button>`}
            
            ${this.currentUserRole === 'admin' ? html`
              <button class="edit-book-btn px-3 py-2 rounded-xl text-xs font-bold text-stone-500 hover:text-patrimonio-madera hover:bg-stone-100 dark:hover:bg-stone-700 transition" data-id="${b.id}"><i aria-hidden="true" class="fas fa-pen"></i></button>
              <button class="delete-book-btn px-3 py-2 rounded-xl text-xs font-bold text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/30 transition" data-id="${b.id}"><i aria-hidden="true" class="fas fa-trash"></i></button>` : ''}
          </div>
        </div>

      </div>
    `)}`;
  },

  // Vuelve a enganchar los botones de Prestar/Reservar/Eliminar del catálogo. Se
  // llama tanto al renderizar la vista completa como al refrescar el <tbody> tras
  // una búsqueda.
  _bindCatalogRowEvents(container) {
    container.querySelectorAll('.delete-book-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const ok = await this.showConfirm('¿Eliminar este libro? Esta acción no se puede deshacer.', { title: 'Eliminar libro', confirmText: 'Eliminar' });
        if (!ok) return;
        try {
          await db.eliminarLibro(btn.dataset.id);
          this.showToast('Libro eliminado.', 'success');
          this.renderBibliomovil();
        } catch (err) {
          this.showToast(err.message || 'No se pudo eliminar.', 'error');
        }
      });
    });

    container.querySelectorAll('.loan-book-btn').forEach(btn => {
      btn.addEventListener('click', () => this.promptCreateLoan(btn.dataset.id));
    });

    container.querySelectorAll('.reserve-book-btn').forEach(btn => {
      btn.addEventListener('click', () => this.promptCreateReserva(btn.dataset.id));
    });

    container.querySelectorAll('.edit-book-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const libro = (this._booksCache || []).find(b => String(b.id) === String(btn.dataset.id));
        if (libro) this.showEditBookModal(libro);
      });
    });
  },

  /**
   * Editar un libro. Antes no existía: corregir una errata en el título
   * obligaba a eliminar el libro y volver a crearlo, lo que borraba su
   * historial de préstamos.
   */
  showEditBookModal(libro) {
    const overlay = document.createElement('div');
    overlay.className = 'fixed inset-0 bg-patrimonio-lago/50 backdrop-blur-sm z-[10000] flex items-center justify-center p-4';
    const campo = (id, etiqueta, valor, extra = '') => html`
      <div>
        <label for="${id}" class="text-[11px] font-black uppercase tracking-wide text-stone-600 dark:text-stone-300 mb-1 block">${etiqueta}</label>
        <input id="${id}" value="${valor ?? ''}" ${crudo(extra)}
          class="w-full px-3 py-2 border border-stone-300 dark:border-stone-600 rounded-md bg-white dark:bg-stone-800 text-sm focus:outline-none focus:border-patrimonio-lago focus:ring-1 focus:ring-patrimonio-lago" />
      </div>`;

    overlay.innerHTML = html`
      <div class="bg-patrimonio-card dark:bg-stone-900 border border-stone-300 dark:border-stone-600 rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4 max-h-[85vh] overflow-y-auto">
        <h3 class="font-serif text-lg font-bold text-stone-900 dark:text-stone-100">Editar libro</h3>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          ${campo('edit-book-title', 'Título', libro.titulo)}
          ${campo('edit-book-author', 'Autor', libro.autor)}
          ${campo('edit-book-isbn', 'ISBN', libro.isbn)}
          ${campo('edit-book-qty', 'Ejemplares en total', libro.copias_totales ?? libro.stock, 'type="number" min="0"')}
          ${campo('edit-book-genre', 'Género', libro.genero)}
          ${campo('edit-book-location', 'Ubicación', libro.ubicacion)}
        </div>
        <p class="text-[11px] text-stone-500 dark:text-stone-400 -mt-1">
          Escribe cuántos ejemplares tiene la biblioteca en total. El sistema calcula solo cuántos están
          disponibles según los préstamos activos${(libro.copias_totales ?? libro.stock) - (libro.stock ?? 0) > 0
            ? html` (ahora hay ${(libro.copias_totales ?? libro.stock) - (libro.stock ?? 0)} prestado(s))` : ''}.
        </p>
        <div>
          ${campo('edit-book-plazo', 'Plazo de préstamo propio (días, opcional)', libro.dias_prestamo_override, 'type="number" min="0" placeholder="Usa el plazo general"')}
          <p class="text-[11px] text-stone-500 dark:text-stone-400 mt-1">
            Déjalo vacío para usar el plazo general del sistema. Escribe <span class="font-mono">0</span> para
            material de referencia que no circula (no se puede prestar). Cualquier otro número reemplaza el
            plazo general solo para este libro.
          </p>
        </div>
        ${campo('edit-book-cover', 'URL de portada (opcional)', libro.portada_url, 'placeholder="https://..."')}
        <p class="text-[11px] text-stone-500 dark:text-stone-400">Usa este campo para las obras locales y patrimoniales, que no aparecen en catálogos internacionales.</p>
        <div class="flex justify-end gap-3 pt-1">
          <button data-action="cancel" class="px-4 py-2 rounded-xl text-sm font-medium text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:bg-stone-700">Cancelar</button>
          <button data-action="save" class="btn-madera text-white px-5 py-2 rounded-xl text-sm font-medium">Guardar cambios</button>
        </div>
      </div>`.toString();
    document.body.appendChild(overlay);

    const cerrar = this._prepararModal(overlay);
    overlay.querySelector('[data-action="cancel"]').addEventListener('click', cerrar);
    overlay.addEventListener('click', e => { if (e.target === overlay) cerrar(); });

    overlay.querySelector('[data-action="save"]').addEventListener('click', async e => {
      // validateBookForm(true) lee justamente estos ids edit-book-*
      if (!this.validateBookForm(true)) return;
      const btn = e.currentTarget;
      btn.disabled = true;
      try {
        // Los datos descriptivos se actualizan directamente...
        const plazoTexto = document.getElementById('edit-book-plazo').value.trim();
        await db.actualizarLibro(libro.id, {
          titulo: document.getElementById('edit-book-title').value.trim(),
          autor: document.getElementById('edit-book-author').value.trim(),
          isbn: document.getElementById('edit-book-isbn').value.trim(),
          genero: document.getElementById('edit-book-genre').value.trim(),
          ubicacion: document.getElementById('edit-book-location').value.trim(),
          portada_url: document.getElementById('edit-book-cover').value.trim(),
          // Vacío = null = usa el plazo general (dias_prestamo).
          diasPrestamoOverride: plazoTexto === '' ? null : Number(plazoTexto)
        });

        // ...pero el número de ejemplares pasa por ajustar_copias, que recalcula
        // las disponibles descontando los préstamos activos. Escribir el stock
        // directamente era lo que corrompía el inventario.
        const totalNuevo = Number(document.getElementById('edit-book-qty').value || 0);
        if (totalNuevo !== (libro.copias_totales ?? libro.stock)) {
          await db.ajustarCopias(libro.id, totalNuevo);
        }

        cerrar();
        this.showToast('Libro actualizado.', 'success');
        this.renderBibliomovil();
      } catch (err) {
        this.showToast(err.message || 'No se pudo guardar.', 'error');
        btn.disabled = false;
      }
    });
  },

  /**
   * Prestar desde el Catálogo.
   *
   * Antes había dos caminos distintos para lo mismo: desde el Mesón se
   * consultaba la situación del lector y se mostraba ANTES de confirmar, y
   * desde el Catálogo simplemente se intentaba y se mostraba el error. Eso
   * significaba que la misma persona, haciendo lo mismo, obtenía una respuesta
   * distinta según por dónde hubiera entrado — y desde el Catálogo no había
   * forma de registrar a un lector nuevo sin abandonar lo que estaba haciendo.
   *
   * Ahora los dos usan el mismo flujo.
   */
  async promptCreateLoan(bookId) {
    await this.flujoPrestamo(bookId, () => {
      if (this.currentView === 'catalog') this.renderBibliomovil();
    });
  },

  /**
   * Reservar desde el Catálogo (022_reservas.sql). Solo aparece cuando no
   * hay ejemplares disponibles (b.stock === 0, ver _renderBookRows) — con
   * stock disponible corresponde prestar, no reservar; reservar_libro()
   * también lo rechazaría del lado del servidor.
   */
  async promptCreateReserva(bookId) {
    await this.flujoReserva(bookId, () => {
      if (this.currentView === 'catalog') this.renderBibliomovil();
    });
  }
};
