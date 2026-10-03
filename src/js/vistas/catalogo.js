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
import { db } from '../modules/db.js';


export default {
  async renderCatalog() {
    const container = this._container();
    if (!container) return;

    const porPagina = this.param('filas_por_pagina');
    const { libros, total } = await db.obtenerLibros(this.catalogSearch || '', this.bookPage, porPagina, null, this.catalogFilter || 'todos');
    // Si el usuario ya cambió de vista mientras esperábamos la respuesta, no pintamos nada
    if (this.currentView !== 'catalog') return;

    // Si se borró el último elemento de la última página, se retrocede una
    if (libros.length === 0 && this.bookPage > 0) {
      this.bookPage = Math.max(0, Math.ceil(total / porPagina) - 1);
      return this.renderCatalog();
    }

    container.innerHTML = html`
      ${this.currentUserRole !== 'bibliomovil' ? html`
      <div class="catalog-card bg-patrimonio-card dark:bg-stone-900 rounded-2xl shadow-sm border border-stone-300 dark:border-stone-600 mb-6">
        <div class="catalog-card-header">
          <h3 class="font-serif font-semibold text-lg text-stone-900 dark:text-stone-100">Agregar libro</h3>
        </div>
        <form id="add-book-form" class="grid grid-cols-2 md:grid-cols-6 gap-3 p-5 items-end">
          <div class="col-span-2 md:col-span-1">
            <label for="new-book-isbn" class="text-[11px] font-black uppercase tracking-wide text-stone-600 dark:text-stone-300 mb-1 block">ISBN</label>
            <input id="new-book-isbn" aria-label="ISBN del libro" placeholder="978..." class="w-full px-3 py-2 border border-stone-300 dark:border-stone-600 rounded-md bg-white dark:bg-stone-800 focus:border-patrimonio-lago focus:ring-1 focus:ring-patrimonio-lago text-sm" />
          </div>
          <div class="col-span-2">
            <label for="new-book-title" class="text-[11px] font-black uppercase tracking-wide text-stone-600 dark:text-stone-300 mb-1 block">Título</label>
            <input id="new-book-title" aria-label="Título del libro" placeholder="Cien años de soledad" class="w-full px-3 py-2 border border-stone-300 dark:border-stone-600 rounded-md bg-white dark:bg-stone-800 focus:border-patrimonio-lago focus:ring-1 focus:ring-patrimonio-lago text-sm" />
          </div>
          <div class="col-span-2">
            <label for="new-book-author" class="text-[11px] font-black uppercase tracking-wide text-stone-600 dark:text-stone-300 mb-1 block">Autor</label>
            <input id="new-book-author" aria-label="Autor del libro" placeholder="Gabriel García Márquez" class="w-full px-3 py-2 border border-stone-300 dark:border-stone-600 rounded-md bg-white dark:bg-stone-800 focus:border-patrimonio-lago focus:ring-1 focus:ring-patrimonio-lago text-sm" />
          </div>
          <div>
            <label for="new-book-genre" class="text-[11px] font-black uppercase tracking-wide text-stone-600 dark:text-stone-300 mb-1 block">Género</label>
            <input id="new-book-genre" aria-label="Género del libro" placeholder="Opcional" class="w-full px-3 py-2 border border-stone-300 dark:border-stone-600 rounded-md bg-white dark:bg-stone-800 focus:border-patrimonio-lago focus:ring-1 focus:ring-patrimonio-lago text-sm" />
          </div>
          <div>
            <label for="new-book-location" class="text-[11px] font-black uppercase tracking-wide text-stone-600 dark:text-stone-300 mb-1 block">Ubicación</label>
            <input id="new-book-location" aria-label="Ubicación en la biblioteca" placeholder="Estante 3" class="w-full px-3 py-2 border border-stone-300 dark:border-stone-600 rounded-md bg-white dark:bg-stone-800 focus:border-patrimonio-lago focus:ring-1 focus:ring-patrimonio-lago text-sm" />
          </div>
          <div>
            <label for="new-book-qty" class="text-[11px] font-black uppercase tracking-wide text-stone-600 dark:text-stone-300 mb-1 block">Ejemplares</label>
            <input id="new-book-qty" aria-label="Cantidad de ejemplares" type="number" min="1" value="1" placeholder="1" class="w-full px-3 py-2 border border-stone-300 dark:border-stone-600 rounded-md bg-white dark:bg-stone-800 focus:border-patrimonio-lago focus:ring-1 focus:ring-patrimonio-lago text-sm" />
          </div>
          <button id="add-book-submit-btn" type="submit" class="btn-madera col-span-2 md:col-span-1 text-white font-sans font-medium rounded-xl shadow py-2 text-sm w-full h-[38px] flex items-center justify-center">Agregar</button>
        </form>
      </div>` : ''}
      <div class="catalog-card bg-patrimonio-card dark:bg-stone-900 rounded-2xl shadow-sm border border-stone-300 dark:border-stone-600 overflow-x-auto">
        <div class="catalog-card-header flex flex-col gap-3">
        <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <h3 class="font-serif font-semibold text-lg text-stone-900 dark:text-stone-100">Catálogo de libros</h3>
          <div class="relative sm:w-64">
            <i aria-hidden="true" class="fas fa-magnifying-glass absolute left-3 top-1/2 -translate-y-1/2 text-stone-500 dark:text-stone-400 text-xs"></i>
            <input id="catalog-search-input" aria-label="Buscar en el catálogo por título, autor o ISBN" type="text" placeholder="Buscar por título, autor o ISBN..." value="${this.catalogSearch || ''}"
              class="w-full pl-8 pr-3 py-2 text-sm border border-stone-300 dark:border-stone-600 rounded-md bg-white dark:bg-stone-800 focus:outline-none focus:border-patrimonio-lago focus:ring-1 focus:ring-patrimonio-lago" />
          </div>
        </div>
        <div class="flex flex-wrap gap-2 mt-1">
          <button class="catalog-filter-btn px-4 py-2 rounded-full text-xs uppercase tracking-wider font-bold transition-all ${(!this.catalogFilter || this.catalogFilter === 'todos') ? 'bg-stone-800 text-white dark:bg-stone-200 dark:text-stone-900 shadow-md scale-105' : 'bg-stone-200 text-stone-600 hover:bg-stone-300 dark:bg-stone-800 dark:text-stone-300 dark:hover:bg-stone-700'}" data-filter="todos">Todos</button>
          <button class="catalog-filter-btn px-4 py-2 rounded-full text-xs uppercase tracking-wider font-bold transition-all ${this.catalogFilter === 'disponibles' ? 'bg-emerald-600 text-white dark:bg-emerald-500 dark:text-stone-900 shadow-md scale-105' : 'bg-stone-200 text-stone-600 hover:bg-stone-300 dark:bg-stone-800 dark:text-stone-300 dark:hover:bg-stone-700'}" data-filter="disponibles">En estante</button>
          <button class="catalog-filter-btn px-4 py-2 rounded-full text-xs uppercase tracking-wider font-bold transition-all ${this.catalogFilter === 'prestados' ? 'bg-amber-600 text-white dark:bg-amber-500 dark:text-stone-900 shadow-md scale-105' : 'bg-stone-200 text-stone-600 hover:bg-stone-300 dark:bg-stone-800 dark:text-stone-300 dark:hover:bg-stone-700'}" data-filter="prestados">Agotados</button>
        </div>
      </div>
        <div id="catalog-tbody" class="flex flex-col gap-4 p-4">${this._renderBookRows(libros)}</div>
        <div id="catalog-pagination">${crudo(this._paginacionHtml(this.bookPage, total, porPagina, 'catalog-page-btn'))}</div>
      </div>
    `;

    this._booksCache = libros;

    document.getElementById('add-book-form')?.addEventListener('submit', async e => {
      e.preventDefault();
      if (!this.validateBookForm(false)) return;
      
      const submitBtn = document.getElementById('add-book-submit-btn');
      const originalText = submitBtn.innerHTML;
      submitBtn.disabled = true;
      submitBtn.innerHTML = '<i aria-hidden="true" class="fas fa-spinner fa-spin mr-1"></i> Guardando...';
      
      try {
        const r = await db.agregarLibro({
          isbn: document.getElementById('new-book-isbn').value.trim(),
          titulo: document.getElementById('new-book-title').value.trim(),
          autor: document.getElementById('new-book-author').value.trim(),
          genero: document.getElementById('new-book-genre').value.trim(),
          ubicacion: document.getElementById('new-book-location').value.trim(),
          stock: Number(document.getElementById('new-book-qty').value || 1)
        });
        // Fase 1.3 (ampliación): sin conexión, db.js encola el alta en vez
        // de lanzar — el libro ya aparece en el catálogo local (guardado
        // optimista), pero conviene que la persona sepa que todavía no
        // llegó al servidor.
        this.showToast(r?.encolado ? r.mensaje : 'Libro agregado.', r?.encolado ? 'info' : 'success');
        this.renderCatalog();
      } catch (err) {
        this.showToast(err.message || 'No se pudo agregar el libro.', 'error');
      } finally {
        // En caso de éxito, renderCatalog recarga todo el DOM, por lo que reestablecer el botón
        // solo es visible en caso de error, pero es buena práctica.
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.innerHTML = originalText;
        }
      }
    });

    this._bindCatalogRowEvents(container);
    this._bindPaginacion(container, '.catalog-page-btn', p => { this.bookPage = p; this.renderCatalog(); });

    container.querySelectorAll('.catalog-filter-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this.catalogFilter = btn.dataset.filter;
        this.bookPage = 0;
        this.renderCatalog();
      });
    });

    // Buscador con debounce: espera 350ms sin escribir antes de consultar la BD.
    // Al buscar se vuelve a la primera página, porque el total de resultados cambió.
    const searchInput = document.getElementById('catalog-search-input');
    searchInput.addEventListener('input', () => {
      clearTimeout(this._catalogSearchTimer);
      this._catalogSearchTimer = setTimeout(async () => {
        this.catalogSearch = searchInput.value.trim();
        this.bookPage = 0;
        const { libros: resultados, total: totalNuevo } = await db.obtenerLibros(this.catalogSearch, 0, porPagina, null, this.catalogFilter || 'todos');
        const tbody = document.getElementById('catalog-tbody');
        if (this.currentView !== 'catalog' || !tbody) return;
        this._booksCache = resultados;
        // _renderBookRows siempre devuelve HtmlSeguro — llamar .toString() es suficiente
        tbody.innerHTML = this._renderBookRows(resultados).toString();
        const paginacion = document.getElementById('catalog-pagination');
        if (paginacion) {
          paginacion.innerHTML = this._paginacionHtml(0, totalNuevo, porPagina, 'catalog-page-btn');
          this._bindPaginacion(container, '.catalog-page-btn', p => { this.bookPage = p; this.renderCatalog(); });
        }
        this._bindCatalogRowEvents(container);
      }, 350);
    });
  },

  /** Repinta la vista de libros en la que está el usuario (Catálogo o
   *  Bibliomóvil). Antes existían copias de estos métodos en bibliomovil.js y,
   *  como ese archivo se mezcla al final en ui.js, sus copias ganaban para
   *  TODA la app: borrar o editar un libro desde el Catálogo terminaba
   *  pintando la vista del Bibliomóvil. Una sola implementación compartida. */
  _refrescarVistaDeLibros() {
    if (this.currentView === 'bibliomovil') this.renderBibliomovil();
    else this.renderCatalog();
  },

  // HTML de las filas del catálogo. Separado de renderCatalog para poder
  // refrescar solo el <tbody> cuando se busca, sin recrear todo el formulario.
  
  _filtrarLibros(libros) {
    // Este método sirve al Catálogo y al Bibliomóvil (ver _refrescarVistaDeLibros).
    const f = (this.currentView === 'bibliomovil' ? this.bibliomovilFilter : this.catalogFilter) || 'todos';
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
            <div class="text-xs text-stone-500 dark:text-stone-400 mt-1 mb-2 font-mono">${b.isbn}</div>
            ${(b.genero || b.ubicacion) ? html`
              <div class="flex flex-wrap gap-2">
                ${b.genero ? html`<span class="stamp stamp-info !rotate-0 !text-[10px] !py-0.5 !px-2"><i aria-hidden="true" class="fas fa-tag mr-1"></i> ${b.genero}</span>` : ''}
                ${b.ubicacion ? html`<span class="stamp stamp-success !rotate-0 !text-[10px] !py-0.5 !px-2"><i aria-hidden="true" class="fas fa-location-dot mr-1"></i> ${b.ubicacion}</span>` : ''}
              </div>` : ''}
          </div>
        </div>

        <div class="flex flex-col md:items-end gap-3 shrink-0">
          <div class="text-center md:text-right">
            <span class="text-[10px] font-bold uppercase tracking-widest text-stone-500 block mb-0.5">Disponibles</span>
            <span class="${b.stock === 0 ? 'text-rose-600' : b.stock <= 1 ? 'text-amber-700' : 'text-emerald-600'} font-black text-xl">${b.stock}</span>
            <span class="text-stone-500 dark:text-stone-400 text-sm">/ ${b.copias_totales ?? b.stock}</span>
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
          this._refrescarVistaDeLibros();
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
          <button data-action="cancel" class="px-4 py-2 rounded-xl text-sm font-medium text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800">Cancelar</button>
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
        this._refrescarVistaDeLibros();
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
      this._refrescarVistaDeLibros();
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
      this._refrescarVistaDeLibros();
    });
  }
};
