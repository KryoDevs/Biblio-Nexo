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
  // Vista Bibliomóvil (Modo Ruta). Los métodos compartidos con el Catálogo
  // (_renderBookRows, _bindCatalogRowEvents, showEditBookModal, prestar,
  // reservar, filtros) viven una sola vez en catalogo.js y se mezclan sobre
  // el mismo prototipo — antes había copias acá que los pisaban (ver
  // Object.assign en ui.js y el comentario de _refrescarVistaDeLibros).
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
        const { libros: resultados, total: totalNuevo } = await db.obtenerLibros(this.bibliomovilSearch, 0, porPagina, true, this.bibliomovilFilter || 'todos');
        const tbody = document.getElementById('bibliomovil-tbody');
        if (this.currentView !== 'bibliomovil' || !tbody) return;
        this._booksCache = resultados;
        // _renderBookRows siempre devuelve HtmlSeguro — llamar .toString() es suficiente
        tbody.innerHTML = this._renderBookRows(resultados).toString();
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

};
