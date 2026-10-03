// Vista Bibliomóvil: catálogo filtrado, preparación offline y plan de paradas.
// El mapa se carga de forma diferida para que Leaflet no aumente el coste de
// arranque del resto de la aplicación.
import { db } from '../modules/db.js';
import persistencia from '../modules/persistencia.js';
import { crudo, html } from '../modules/utilidades.js';
import {
  CENTRO_INICIAL_FUTRONO,
  MAX_PARADAS_RUTA,
  cargarPlanRuta,
  distanciaEnKm,
  distanciaRectaTotal,
  guardarPlanRuta,
  leerRutaOsrm,
  normalizarPlanRuta,
  ordenarParadasPorCercania,
  puntosDeRuta,
  urlCalculoVial,
  urlGoogleMaps,
  urlOpenStreetMap
} from '../modules/bibliomovil-ruta.js';

const URL_MOSAICOS_OSM = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
const ATRIBUCION_OSM = '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors';
const CLAVE_ULTIMA_PREPARACION = 'biblionexo_ultima_preparacion_ruta';

function idParadaNuevo() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `parada-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function distanciaLegible(km) {
  return Number.isFinite(km)
    ? `${km.toLocaleString('es-CL', { maximumFractionDigits: 1 })} km`
    : '—';
}

function duracionLegible(minutos) {
  if (!Number.isFinite(minutos)) return '';
  const redondeados = Math.round(minutos);
  const horas = Math.floor(redondeados / 60);
  const min = redondeados % 60;
  if (!horas) return `${min} min`;
  return min ? `${horas} h ${min} min` : `${horas} h`;
}

function textoErrorGeolocalizacion(error) {
  if (error?.code === 1) return 'No se autorizó el acceso a la ubicación. Puedes elegir el punto de partida en el mapa.';
  if (error?.code === 2) return 'El dispositivo no pudo determinar la ubicación. Elige el punto de partida en el mapa.';
  if (error?.code === 3) return 'La ubicación tardó demasiado. Inténtalo otra vez o marca el punto en el mapa.';
  return 'No se pudo obtener la ubicación. Puedes elegir el punto de partida en el mapa.';
}

export default {
  async renderBibliomovil() {
    const container = this._container();
    if (!container) return;

    clearTimeout(this._bibliomovilSearchTimer);
    this._destruirMapaBibliomovil();
    const solicitudRender = (this._bibliomovilRenderVersion || 0) + 1;
    this._bibliomovilRenderVersion = solicitudRender;
    this._bibliomovilPlan = cargarPlanRuta();

    const porPagina = Number(this.param('filas_por_pagina')) || 25;

    // La página del catálogo y los dos conteos del resumen se piden a la vez:
    // son tres consultas independientes y encadenarlas solo agregaría espera.
    // Los conteos piden una sola fila (límite 1) y únicamente se usa su total.
    const [pagina, disponibles, agotados] = await Promise.all([
      db.obtenerLibros(
        this.bibliomovilSearch || '',
        this.bookPage,
        porPagina,
        true,
        this.bibliomovilFilter || 'todos'
      ),
      this._contarColeccionRuta('disponibles'),
      this._contarColeccionRuta('prestados')
    ]);
    const { libros, total } = pagina;
    // Se guardan para que _actualizarListaBibliomovil() pueda refrescar las
    // tarjetas de resumen sin volver a pedir el catálogo completo.
    this._bibliomovilResumen = { total, disponibles, agotados };
    // Si la respuesta llegó después de navegar a otra sección, no se inserta
    // contenido ni se inicializa un mapa en un contenedor que ya no existe.
    if (solicitudRender !== this._bibliomovilRenderVersion || this.currentView !== 'bibliomovil' || !container.isConnected) return;

    if (libros.length === 0 && this.bookPage > 0) {
      this.bookPage = Math.max(0, Math.ceil(total / porPagina) - 1);
      return this.renderBibliomovil();
    }

    container.innerHTML = html`
      <div class="space-y-6">
        <section class="bibliomovil-card bg-patrimonio-card dark:bg-stone-900 rounded-2xl shadow-sm border border-stone-300 dark:border-stone-600">
          <div class="p-5 md:p-6 flex flex-col gap-5">
            <div class="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
              <div class="min-w-0">
                <p class="text-[10px] font-black uppercase tracking-widest text-patrimonio-madera">Operación en ruta</p>
                <h2 class="font-serif font-bold text-2xl text-stone-900 dark:text-stone-100 mt-0.5 flex items-center gap-2">
                  <i aria-hidden="true" class="fas fa-truck text-patrimonio-lago dark:text-stone-200"></i> Modo Ruta — Bibliomóvil
                </h2>
                <p class="text-sm text-stone-600 dark:text-stone-300 mt-1">
                  Catálogo móvil, plan de paradas y preparación sin conexión, en un solo lugar. El catálogo de la biblioteca se administra aparte.
                </p>
                <p class="text-xs text-stone-500 dark:text-stone-400 mt-1">
                  Última preparación de datos: <span id="bibliomovil-sync-status" class="font-semibold text-stone-800 dark:text-stone-200">Desconocida</span>
                </p>
              </div>
              <div class="flex flex-wrap items-center gap-2.5 shrink-0">
                <div class="inline-flex rounded-xl border border-stone-300 dark:border-stone-700 bg-stone-100 dark:bg-stone-800 p-1" role="group" aria-label="Secciones de la vista Bibliomóvil">
                  <button type="button" class="biblio-tab-btn px-3 py-1.5 rounded-lg text-xs font-bold transition-colors bg-patrimonio-lago text-white" data-target="todos" aria-pressed="true">
                    <i aria-hidden="true" class="fas fa-layer-group mr-1"></i> Todo
                  </button>
                  <button type="button" class="biblio-tab-btn px-3 py-1.5 rounded-lg text-xs font-bold transition-colors text-stone-700 dark:text-stone-300 hover:bg-stone-200 dark:hover:bg-stone-700" data-target="tab-ruta" aria-pressed="false">
                    <i aria-hidden="true" class="fas fa-route mr-1"></i> Mapa y ruta
                  </button>
                  <button type="button" class="biblio-tab-btn px-3 py-1.5 rounded-lg text-xs font-bold transition-colors text-stone-700 dark:text-stone-300 hover:bg-stone-200 dark:hover:bg-stone-700" data-target="tab-catalogo" aria-pressed="false">
                    <i aria-hidden="true" class="fas fa-book mr-1"></i> Catálogo (<span id="bibliomovil-tab-total">${total}</span>)
                  </button>
                </div>
                <button id="btn-preparar-ruta" type="button" title="Descarga el catálogo y los datos permitidos en este equipo para poder trabajar sin internet"
                  class="bg-patrimonio-madera text-white px-5 py-2.5 rounded-xl font-bold shadow-sm hover:bg-[#5E3214] transition-all flex items-center gap-2">
                  <i aria-hidden="true" class="fas fa-cloud-arrow-down"></i> <span id="btn-preparar-ruta-texto">Preparar datos sin conexión</span>
                </button>
              </div>
            </div>

            <!-- Tarjetas de resumen: los números que se necesitan antes de
                 salir a ruta. Cada una lleva su ícono y su etiqueta, para que
                 no dependan solo del color. -->
            <div class="grid grid-cols-2 xl:grid-cols-4 gap-3">
              <div class="rounded-xl border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800/60 p-3">
                <p class="text-[10px] font-black uppercase tracking-widest text-stone-500 dark:text-stone-400 flex items-center gap-1.5">
                  <i aria-hidden="true" class="fas fa-book text-patrimonio-madera"></i> Títulos en el móvil
                </p>
                <p id="bibliomovil-kpi-titulos" class="font-serif text-2xl font-bold text-stone-900 dark:text-stone-100 mt-1 tabular-nums">${total}</p>
              </div>
              <div class="rounded-xl border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800/60 p-3">
                <p class="text-[10px] font-black uppercase tracking-widest text-stone-500 dark:text-stone-400 flex items-center gap-1.5">
                  <i aria-hidden="true" class="fas fa-circle-check text-emerald-700 dark:text-emerald-400"></i> Disponibles
                </p>
                <p id="bibliomovil-kpi-disponibles" class="font-serif text-2xl font-bold text-emerald-700 dark:text-emerald-400 mt-1 tabular-nums">${disponibles ?? '—'}</p>
              </div>
              <div class="rounded-xl border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800/60 p-3">
                <p class="text-[10px] font-black uppercase tracking-widest text-stone-500 dark:text-stone-400 flex items-center gap-1.5">
                  <i aria-hidden="true" class="fas fa-hand-holding-hand text-amber-700 dark:text-amber-400"></i> En préstamo
                </p>
                <p id="bibliomovil-kpi-prestados" class="font-serif text-2xl font-bold text-amber-700 dark:text-amber-400 mt-1 tabular-nums">${agotados ?? '—'}</p>
              </div>
              <div class="rounded-xl border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800/60 p-3">
                <p class="text-[10px] font-black uppercase tracking-widest text-stone-500 dark:text-stone-400 flex items-center gap-1.5">
                  <i aria-hidden="true" class="fas fa-route text-patrimonio-lago dark:text-stone-300"></i> Recorrido planificado
                </p>
                <p id="bibliomovil-kpi-recorrido" class="font-serif text-2xl font-bold text-stone-900 dark:text-stone-100 mt-1 tabular-nums">${puntosDeRuta(this._bibliomovilPlan).length}</p>
                <p id="bibliomovil-kpi-distancia" class="text-[11px] text-stone-500 dark:text-stone-400 mt-0.5">${this._resumenDistanciaBibliomovil()}</p>
              </div>
            </div>
          </div>
        </section>

        <div id="tab-ruta" class="biblio-tab-content space-y-6">
        <section class="bibliomovil-card bg-patrimonio-card dark:bg-stone-900 rounded-2xl shadow-sm border border-stone-300 dark:border-stone-600 overflow-hidden" aria-labelledby="bibliomovil-route-title">
          <div class="p-5 md:p-6 border-b border-stone-200 dark:border-stone-700 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div class="min-w-0">
              <h2 id="bibliomovil-route-title" class="font-serif font-bold text-xl text-stone-900 dark:text-stone-100">Mapa y recorrido</h2>
              <p class="text-sm text-stone-600 dark:text-stone-300 mt-1">Marca las paradas en el mapa, ordénalas y abre la navegación en tu aplicación de mapas.</p>
            </div>
            <button id="bibliomovil-print-route" type="button"
              class="no-print shrink-0 px-3 py-2 rounded-lg border border-stone-300 dark:border-stone-600 text-xs font-bold text-stone-700 dark:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-800 flex items-center gap-1.5">
              <i aria-hidden="true" class="fas fa-print"></i> Imprimir hoja de ruta
            </button>
          </div>
          <div class="grid grid-cols-1 xl:grid-cols-[minmax(0,1.45fr)_minmax(320px,0.85fr)] gap-5 p-4 md:p-6">
            <div class="min-w-0">
              <div id="bibliomovil-map" class="bibliomovil-map" role="application" aria-label="Mapa interactivo para seleccionar el origen y las paradas del Bibliomóvil">
                <p class="bibliomovil-map-placeholder">Cargando el mapa…</p>
              </div>
              <p id="bibliomovil-map-status" role="status" aria-live="polite" class="text-xs text-stone-600 dark:text-stone-300 mt-2">El mapa requiere conexión a internet. La lista del recorrido permanece disponible sin conexión.</p>
            </div>

            <div class="space-y-4 min-w-0">
              <div class="rounded-xl border border-stone-200 dark:border-stone-700 p-4">
                <h3 class="font-bold text-stone-900 dark:text-stone-100 flex items-center gap-2"><i aria-hidden="true" class="fas fa-flag text-patrimonio-lago"></i> Punto de partida</h3>
                <label for="bibliomovil-origin-name" class="block text-xs font-bold text-stone-600 dark:text-stone-300 mt-3 mb-1">Nombre del origen (opcional)</label>
                <input id="bibliomovil-origin-name" maxlength="100" type="text" value="${this._bibliomovilPlan.origen?.nombre || ''}" placeholder="Biblioteca Municipal o ubicación actual" class="w-full px-3 py-2 text-sm border border-stone-300 dark:border-stone-600 rounded-lg bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100">
                <div class="flex flex-wrap gap-2 mt-3">
                  <button id="bibliomovil-select-origin" type="button" class="px-3 py-2 rounded-lg border border-stone-300 dark:border-stone-600 text-xs font-bold text-stone-700 dark:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-800"><i aria-hidden="true" class="fas fa-map-pin mr-1"></i> Marcar en el mapa</button>
                  <button id="bibliomovil-geolocate" type="button" class="px-3 py-2 rounded-lg bg-patrimonio-lago text-white text-xs font-bold hover:opacity-90"><i aria-hidden="true" class="fas fa-location-crosshairs mr-1"></i> Usar mi ubicación</button>
                  <button id="bibliomovil-clear-origin" type="button" class="px-3 py-2 rounded-lg text-xs font-bold text-rose-700 dark:text-rose-300 hover:bg-rose-50 dark:hover:bg-rose-900/20" ${this._bibliomovilPlan.origen ? '' : 'hidden'}>Quitar origen</button>
                </div>
              </div>

              <div class="rounded-xl border border-stone-200 dark:border-stone-700 p-4">
                <h3 class="font-bold text-stone-900 dark:text-stone-100 flex items-center gap-2"><i aria-hidden="true" class="fas fa-location-dot text-patrimonio-madera"></i> Agregar parada</h3>
                <label for="bibliomovil-stop-name" class="block text-xs font-bold text-stone-600 dark:text-stone-300 mt-3 mb-1">Nombre o referencia</label>
                <input id="bibliomovil-stop-name" maxlength="100" type="text" placeholder="Ej.: Llifén, Nontuelá, escuela…" class="w-full px-3 py-2 text-sm border border-stone-300 dark:border-stone-600 rounded-lg bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100">
                <div class="flex flex-wrap gap-2 mt-3">
                  <button id="bibliomovil-select-stop" type="button" class="px-3 py-2 rounded-lg border border-stone-300 dark:border-stone-600 text-xs font-bold text-stone-700 dark:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-800"><i aria-hidden="true" class="fas fa-crosshairs mr-1"></i> Elegir ubicación en el mapa</button>
                  <button id="bibliomovil-add-stop" type="button" disabled class="px-3 py-2 rounded-lg bg-patrimonio-madera text-white text-xs font-bold disabled:opacity-40 disabled:cursor-not-allowed"><i aria-hidden="true" class="fas fa-plus mr-1"></i> Añadir parada</button>
                </div>
                <p class="text-xs text-stone-500 dark:text-stone-400 mt-2">Al elegir una ubicación, haz clic sobre el mapa. El punto amarillo es una selección pendiente hasta que confirmes “Añadir parada”.</p>
              </div>

              <div class="rounded-xl border border-stone-200 dark:border-stone-700 p-4">
                <div class="flex items-center justify-between gap-2">
                  <h3 class="font-bold text-stone-900 dark:text-stone-100">Orden del recorrido</h3>
                  <span id="bibliomovil-stop-count" class="text-xs font-bold text-stone-600 dark:text-stone-300">0 paradas</span>
                </div>
                <ol id="bibliomovil-route-stops" class="bibliomovil-route-stops mt-3" aria-label="Paradas ordenadas del recorrido"></ol>
                <p id="bibliomovil-route-empty" class="text-sm text-stone-500 dark:text-stone-400 mt-3">Aún no hay paradas. Marca un punto en el mapa para comenzar.</p>
                <div class="flex flex-wrap gap-2 mt-4">
                  <button id="bibliomovil-optimize-stops" type="button" class="px-3 py-2 rounded-lg border border-stone-300 dark:border-stone-600 text-xs font-bold text-stone-700 dark:text-stone-200 disabled:opacity-40" ${this._bibliomovilPlan.paradas.length < 2 ? 'disabled' : ''}><i aria-hidden="true" class="fas fa-shuffle mr-1"></i> Ordenar por cercanía</button>
                  <button id="bibliomovil-clear-route" type="button" class="px-3 py-2 rounded-lg text-xs font-bold text-rose-700 dark:text-rose-300 hover:bg-rose-50 dark:hover:bg-rose-900/20" ${this._bibliomovilPlan.paradas.length || this._bibliomovilPlan.origen ? '' : 'disabled'}>Limpiar ruta</button>
                </div>
                <p class="text-xs text-stone-500 dark:text-stone-400 mt-2">La sugerencia por cercanía usa distancia en línea recta; revisa el orden vial antes de salir.</p>
              </div>

              <p id="bibliomovil-route-status" role="status" aria-live="polite" class="rounded-lg bg-stone-100 dark:bg-stone-800 p-3 text-sm text-stone-700 dark:text-stone-200">Agrega un origen y al menos una parada, o dos paradas, para calcular el recorrido.</p>
              <button id="bibliomovil-retry-route" type="button" class="px-3 py-2 rounded-lg border border-stone-300 dark:border-stone-600 text-xs font-bold text-stone-700 dark:text-stone-200 disabled:opacity-40" ${puntosDeRuta(this._bibliomovilPlan).length < 2 ? 'disabled' : ''}><i aria-hidden="true" class="fas fa-rotate-right mr-1"></i> Recalcular recorrido vial</button>
              <div class="flex flex-wrap gap-2">
                <a id="bibliomovil-google-maps" hidden target="_blank" rel="noopener noreferrer" class="px-3 py-2 rounded-lg bg-patrimonio-lago text-white text-xs font-bold hover:opacity-90">Abrir en Google Maps</a>
                <a id="bibliomovil-osm-directions" hidden target="_blank" rel="noopener noreferrer" class="px-3 py-2 rounded-lg border border-stone-300 dark:border-stone-600 text-xs font-bold text-stone-800 dark:text-stone-100 hover:bg-stone-100 dark:hover:bg-stone-800">Abrir en OpenStreetMap</a>
              </div>
            </div>
          </div>
          <p class="mx-4 md:mx-6 mb-5 rounded-lg border border-amber-300/70 bg-amber-50 dark:bg-amber-950/30 p-3 text-xs text-amber-950 dark:text-amber-100">
            <i aria-hidden="true" class="fas fa-shield-halved mr-1"></i>
            Privacidad y precisión: el plan se guarda solo en este navegador. OpenStreetMap recibe solicitudes de mosaicos; al calcular la ruta vial, OSRM recibe únicamente las coordenadas (no los nombres ni datos de lectores). No ingreses domicilios ni información personal. Confirma siempre el recorrido: el cálculo público puede no incluir caminos locales y no funciona sin internet.
          </p>
        </section>

        <!-- Preparación sin conexión: explica qué queda guardado en el equipo
             antes de salir y para qué sirve cada cosa. Está en la pestaña de
             ruta porque es la pregunta que aparece justo antes de partir. -->
        <section class="bibliomovil-card bg-patrimonio-card dark:bg-stone-900 rounded-2xl shadow-sm border border-stone-300 dark:border-stone-600 p-5 md:p-6" aria-labelledby="bibliomovil-preparacion-title">
          <div class="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
            <div>
              <h3 id="bibliomovil-preparacion-title" class="font-serif font-bold text-lg text-stone-900 dark:text-stone-100">Preparación sin conexión</h3>
              <p class="text-sm text-stone-600 dark:text-stone-300 mt-1">
                «Preparar datos sin conexión» guarda en este equipo lo necesario para prestar y devolver en la ruta, aunque no haya señal.
              </p>
            </div>
            <span class="stamp stamp-info !rotate-0 h-fit">Solo este equipo</span>
          </div>
          <ul class="grid grid-cols-1 md:grid-cols-2 gap-2.5 mt-4 text-sm">
            <li class="flex items-start gap-2.5 rounded-lg bg-stone-50 dark:bg-stone-800/60 p-3">
              <i aria-hidden="true" class="fas fa-book text-patrimonio-madera mt-0.5"></i>
              <span class="text-stone-700 dark:text-stone-200"><span class="font-bold block">Catálogo del Bibliomóvil</span>Los ejemplares de la ruta y su disponibilidad.</span>
            </li>
            <li class="flex items-start gap-2.5 rounded-lg bg-stone-50 dark:bg-stone-800/60 p-3">
              <i aria-hidden="true" class="fas fa-right-left text-patrimonio-lago dark:text-stone-300 mt-0.5"></i>
              <span class="text-stone-700 dark:text-stone-200"><span class="font-bold block">Préstamos y reservas activas</span>Para devolver y renovar sin conexión.</span>
            </li>
            <li class="flex items-start gap-2.5 rounded-lg bg-stone-50 dark:bg-stone-800/60 p-3">
              <i aria-hidden="true" class="fas fa-users text-patrimonio-bosque mt-0.5"></i>
              <span class="text-stone-700 dark:text-stone-200"><span class="font-bold block">Lectores con préstamo activo</span>Nunca se copia la lista completa de vecinos.</span>
            </li>
            <li class="flex items-start gap-2.5 rounded-lg bg-stone-50 dark:bg-stone-800/60 p-3">
              <i aria-hidden="true" class="fas fa-key text-amber-700 dark:text-amber-400 mt-0.5"></i>
              <span class="text-stone-700 dark:text-stone-200"><span class="font-bold block">Enlaces de escaneo vigentes</span>Para el mesón sin sesión, con su vencimiento.</span>
            </li>
          </ul>
          <p class="text-xs text-stone-500 dark:text-stone-400 mt-3">
            Las altas y devoluciones hechas sin conexión quedan en una cola local y se envían solas al recuperar la señal.
            <span id="bibliomovil-preparacion-estado" class="font-semibold text-stone-700 dark:text-stone-200"></span>
          </p>
        </section>
        </div>

        <div id="tab-catalogo" class="biblio-tab-content space-y-6">
        <section class="bibliomovil-card bg-patrimonio-card dark:bg-stone-900 rounded-2xl shadow-sm border border-stone-300 dark:border-stone-600 overflow-hidden">
          <div class="p-4 md:p-5 border-b border-stone-200 dark:border-stone-700 flex flex-col gap-3">
            <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <h2 class="font-serif font-semibold text-lg text-stone-900 dark:text-stone-100">Catálogo del Bibliomóvil</h2>
                <p class="text-xs text-stone-500 dark:text-stone-400">
                  ${total} título${total === 1 ? '' : 's'} asignado${total === 1 ? '' : 's'} a la ruta. Es un catálogo aparte: no se mezcla con el de la biblioteca.
                </p>
              </div>
              <div class="relative sm:w-72">
                <i aria-hidden="true" class="fas fa-magnifying-glass absolute left-3 top-1/2 -translate-y-1/2 text-stone-500 dark:text-stone-400 text-xs"></i>
                <input id="bibliomovil-search-input" aria-label="Buscar en el catálogo del Bibliomóvil por título, autor o ISBN" type="text" placeholder="Buscar por título, autor o ISBN…" value="${this.bibliomovilSearch || ''}" class="w-full pl-8 pr-3 py-2 text-sm border border-stone-300 dark:border-stone-600 rounded-lg bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100 focus:outline-none focus:border-patrimonio-lago focus:ring-1 focus:ring-patrimonio-lago">
              </div>
            </div>
            <div class="flex flex-wrap gap-2" role="group" aria-label="Filtrar libros del Bibliomóvil por disponibilidad">
              <button type="button" class="bibliomovil-filter-btn px-4 py-2 rounded-full text-xs uppercase tracking-wider font-bold transition-all ${(!this.bibliomovilFilter || this.bibliomovilFilter === 'todos') ? 'bg-stone-800 text-white dark:bg-stone-200 dark:text-stone-900 shadow-md' : 'bg-stone-200 text-stone-700 hover:bg-stone-300 dark:bg-stone-800 dark:text-stone-200 dark:hover:bg-stone-700'}" data-filter="todos" aria-pressed="${!this.bibliomovilFilter || this.bibliomovilFilter === 'todos'}">Todos</button>
              <button type="button" class="bibliomovil-filter-btn px-4 py-2 rounded-full text-xs uppercase tracking-wider font-bold transition-all ${this.bibliomovilFilter === 'disponibles' ? 'bg-emerald-700 text-white dark:bg-emerald-500 dark:text-stone-900 shadow-md' : 'bg-stone-200 text-stone-700 hover:bg-stone-300 dark:bg-stone-800 dark:text-stone-200 dark:hover:bg-stone-700'}" data-filter="disponibles" aria-pressed="${this.bibliomovilFilter === 'disponibles'}">En estante</button>
              <button type="button" class="bibliomovil-filter-btn px-4 py-2 rounded-full text-xs uppercase tracking-wider font-bold transition-all ${this.bibliomovilFilter === 'prestados' ? 'bg-amber-700 text-white dark:bg-amber-500 dark:text-stone-900 shadow-md' : 'bg-stone-200 text-stone-700 hover:bg-stone-300 dark:bg-stone-800 dark:text-stone-200 dark:hover:bg-stone-700'}" data-filter="prestados" aria-pressed="${this.bibliomovilFilter === 'prestados'}">Agotados</button>
            </div>
          </div>
          <div id="bibliomovil-tbody" class="flex flex-col gap-4 p-4">${this._renderBookRows(libros)}</div>
          <div id="bibliomovil-pagination">${crudo(this._paginacionHtml(this.bookPage, total, porPagina, 'bibliomovil-page-btn'))}</div>
        </section>
        </div>
      </div>
    `;

    this._booksCache = libros;
    this._bindCatalogRowEvents(container);
    this._bindPaginacion(container, '.bibliomovil-page-btn', pagina => {
      this.bookPage = pagina;
      this._actualizarListaBibliomovil();
    });
    this._dibujarListaParadasBibliomovil();
    this._conectarControlesRutaBibliomovil();
    this._conectarControlesCatalogoBibliomovil(container, porPagina);
    this._actualizarIndicadorRuta();

    await this._montarMapaBibliomovil();

    const tabBtns = container.querySelectorAll('.biblio-tab-btn');
    const tabContents = container.querySelectorAll('.biblio-tab-content');
    tabBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const targetId = btn.getAttribute('data-target');
        tabBtns.forEach(b => {
          const esActivo = b === btn;
          b.setAttribute('aria-pressed', String(esActivo));
          b.classList.toggle('bg-patrimonio-lago', esActivo);
          b.classList.toggle('text-white', esActivo);
          b.classList.toggle('text-stone-700', !esActivo);
          b.classList.toggle('dark:text-stone-300', !esActivo);
        });
        tabContents.forEach(tc => {
          const mostrar = targetId === 'todos' || tc.id === targetId;
          tc.classList.toggle('hidden', !mostrar);
        });
        if ((targetId === 'todos' || targetId === 'tab-ruta') && this._bibliomovilMapState?.map) {
          setTimeout(() => this._bibliomovilMapState?.map?.invalidateSize({ pan: false }), 80);
        }
      });
    });
  },

  _obtenerPlanRutaBibliomovil() {
    if (!this._bibliomovilPlan) this._bibliomovilPlan = cargarPlanRuta();
    this._bibliomovilPlan = normalizarPlanRuta(this._bibliomovilPlan);
    return this._bibliomovilPlan;
  },

  _guardarPlanRutaBibliomovil() {
    this._bibliomovilPlan = normalizarPlanRuta(this._bibliomovilPlan);
    const guardado = guardarPlanRuta(this._bibliomovilPlan);
    if (!guardado) {
      this.showToast('El plan está disponible en esta pantalla, pero el navegador no permitió guardarlo para después.', 'error');
    }
    return guardado;
  },

  _dibujarListaParadasBibliomovil() {
    const lista = document.getElementById('bibliomovil-route-stops');
    const vacio = document.getElementById('bibliomovil-route-empty');
    const contador = document.getElementById('bibliomovil-stop-count');
    const botonLimpiar = document.getElementById('bibliomovil-clear-route');
    const botonOrdenar = document.getElementById('bibliomovil-optimize-stops');
    const botonOrigen = document.getElementById('bibliomovil-clear-origin');
    const botonElegirParada = document.getElementById('bibliomovil-select-stop');
    if (!lista) return;

    const plan = this._obtenerPlanRutaBibliomovil();
    const paradas = plan.paradas;
    if (contador) contador.textContent = `${paradas.length} ${paradas.length === 1 ? 'parada' : 'paradas'}`;
    if (vacio) vacio.hidden = paradas.length > 0;
    if (botonLimpiar) botonLimpiar.disabled = paradas.length === 0 && !plan.origen;
    if (botonOrdenar) botonOrdenar.disabled = paradas.length < 2;
    if (botonOrigen) botonOrigen.hidden = !plan.origen;
    if (botonElegirParada) botonElegirParada.disabled = paradas.length >= MAX_PARADAS_RUTA;
    // El número de puntos y la distancia del resumen cambian con la lista.
    this._actualizarResumenBibliomovil();

    lista.innerHTML = html`${paradas.map((parada, indice) => {
      // Distancia en línea recta desde el punto anterior del recorrido (el
      // origen, o la parada previa). Es orientativa y así se rotula: sirve
      // para saber si dos paradas están a 2 km o a 40, no como ruta vial.
      const anterior = indice === 0 ? plan.origen : paradas[indice - 1];
      const tramo = anterior ? distanciaEnKm(anterior, parada) : NaN;
      return html`
      <li class="bibliomovil-stop-item">
        <span class="bibliomovil-stop-number" aria-hidden="true">${indice + 1}</span>
        <span class="bibliomovil-stop-copy min-w-0">
          <span class="block font-bold text-stone-900 dark:text-stone-100 truncate">${parada.nombre}</span>
          <span class="block text-xs text-stone-500 dark:text-stone-400">${parada.lat.toFixed(5)}, ${parada.lon.toFixed(5)}</span>
          ${Number.isFinite(tramo) ? html`<span class="block text-[11px] text-stone-500 dark:text-stone-400 mt-0.5"><i aria-hidden="true" class="fas fa-arrow-right-long mr-1"></i>${distanciaLegible(tramo)} desde el punto anterior</span>` : ''}
        </span>
        <span class="flex items-center gap-1 shrink-0">
          <button type="button" data-route-action="notify" data-route-id="${parada.id}" aria-label="Avisar por WhatsApp a lectores de ${parada.nombre}" title="Avisar llegada o préstamos de ${parada.nombre}" class="bibliomovil-stop-action text-emerald-700 dark:text-emerald-400"><i aria-hidden="true" class="fab fa-whatsapp"></i></button>
          <button type="button" data-route-action="up" data-route-id="${parada.id}" aria-label="Mover ${parada.nombre} hacia arriba" ${indice === 0 ? 'disabled' : ''} class="bibliomovil-stop-action"><i aria-hidden="true" class="fas fa-arrow-up"></i></button>
          <button type="button" data-route-action="down" data-route-id="${parada.id}" aria-label="Mover ${parada.nombre} hacia abajo" ${indice === paradas.length - 1 ? 'disabled' : ''} class="bibliomovil-stop-action"><i aria-hidden="true" class="fas fa-arrow-down"></i></button>
          <button type="button" data-route-action="remove" data-route-id="${parada.id}" aria-label="Quitar ${parada.nombre} de la ruta" class="bibliomovil-stop-action bibliomovil-stop-action--remove"><i aria-hidden="true" class="fas fa-trash"></i></button>
        </span>
      </li>
    `; })}`.toString();

    lista.querySelectorAll('[data-route-action]').forEach(boton => {
      boton.addEventListener('click', () => {
        const indice = plan.paradas.findIndex(parada => parada.id === boton.dataset.routeId);
        if (indice < 0) return;
        const accion = boton.dataset.routeAction;
        if (accion === 'notify') {
          this._notificarParadaBibliomovil(plan.paradas[indice]);
          return;
        }
        if (accion === 'remove') {
          plan.paradas.splice(indice, 1);
        } else if (accion === 'up' && indice > 0) {
          [plan.paradas[indice - 1], plan.paradas[indice]] = [plan.paradas[indice], plan.paradas[indice - 1]];
        } else if (accion === 'down' && indice < plan.paradas.length - 1) {
          [plan.paradas[indice + 1], plan.paradas[indice]] = [plan.paradas[indice], plan.paradas[indice + 1]];
        }
        this._guardarPlanRutaBibliomovil();
        this._dibujarListaParadasBibliomovil();
        this._actualizarMapaRutaBibliomovil();
      });
    });
  },

  _conectarControlesCatalogoBibliomovil(container, porPagina) {
    const estilosFiltroInactivo = [
      'bg-stone-200', 'text-stone-700', 'hover:bg-stone-300',
      'dark:bg-stone-800', 'dark:text-stone-200', 'dark:hover:bg-stone-700'
    ];
    const estilosFiltroActivo = {
      todos: ['bg-stone-800', 'text-white', 'dark:bg-stone-200', 'dark:text-stone-900', 'shadow-md'],
      disponibles: ['bg-emerald-700', 'text-white', 'dark:bg-emerald-500', 'dark:text-stone-900', 'shadow-md'],
      prestados: ['bg-amber-700', 'text-white', 'dark:bg-amber-500', 'dark:text-stone-900', 'shadow-md']
    };
    const clasesVisualesFiltro = new Set([
      ...estilosFiltroInactivo,
      ...Object.values(estilosFiltroActivo).flat()
    ]);

    container.querySelectorAll('.bibliomovil-filter-btn').forEach(boton => {
      boton.addEventListener('click', () => {
        this.bibliomovilFilter = boton.dataset.filter;
        this.bookPage = 0;
        container.querySelectorAll('.bibliomovil-filter-btn').forEach(filtro => {
          const activo = filtro.dataset.filter === this.bibliomovilFilter;
          filtro.setAttribute('aria-pressed', String(activo));
          const estilo = activo ? estilosFiltroActivo[filtro.dataset.filter] : estilosFiltroInactivo;
          const clasesActivas = new Set(estilo || estilosFiltroInactivo);
          clasesVisualesFiltro.forEach(clase => filtro.classList.toggle(clase, clasesActivas.has(clase)));
        });
        this._actualizarListaBibliomovil(porPagina);
      });
    });

    const campoBusqueda = container.querySelector('#bibliomovil-search-input');
    campoBusqueda?.addEventListener('input', () => {
      this.bibliomovilSearch = campoBusqueda.value.trim();
      this.bookPage = 0;
      const solicitud = (this._bibliomovilSearchVersion || 0) + 1;
      this._bibliomovilSearchVersion = solicitud;
      clearTimeout(this._bibliomovilSearchTimer);
      this._bibliomovilSearchTimer = setTimeout(() => {
        if (solicitud === this._bibliomovilSearchVersion) this._actualizarListaBibliomovil(porPagina);
      }, 350);
    });
  },

  async _actualizarListaBibliomovil(porPagina = Number(this.param('filas_por_pagina')) || 25) {
    const solicitud = (this._bibliomovilBooksVersion || 0) + 1;
    this._bibliomovilBooksVersion = solicitud;
    const busqueda = this.bibliomovilSearch || '';
    const filtro = this.bibliomovilFilter || 'todos';
    const pagina = this.bookPage || 0;

    try {
      // Se vuelven a contar disponibles y prestados junto con la lista: si no,
      // las tarjetas de resumen quedarían con los números de la carga inicial
      // mientras la tabla ya muestra otra cosa.
      const [{ libros, total }, disponibles, agotados] = await Promise.all([
        db.obtenerLibros(busqueda, pagina, porPagina, true, filtro),
        this._contarColeccionRuta('disponibles'),
        this._contarColeccionRuta('prestados')
      ]);
      if (solicitud !== this._bibliomovilBooksVersion || this.currentView !== 'bibliomovil') return;
      if (!libros.length && pagina > 0) {
        this.bookPage = Math.max(0, Math.ceil(total / porPagina) - 1);
        return this._actualizarListaBibliomovil(porPagina);
      }

      const tbody = document.getElementById('bibliomovil-tbody');
      const paginacion = document.getElementById('bibliomovil-pagination');
      const container = this._container();
      if (!tbody || !container) return;
      this._booksCache = libros;
      this._bibliomovilResumen = { total, disponibles, agotados };
      this._actualizarResumenBibliomovil();
      tbody.innerHTML = this._renderBookRows(libros).toString();
      if (paginacion) {
        paginacion.innerHTML = this._paginacionHtml(this.bookPage, total, porPagina, 'bibliomovil-page-btn');
        this._bindPaginacion(container, '.bibliomovil-page-btn', paginaSiguiente => {
          this.bookPage = paginaSiguiente;
          this._actualizarListaBibliomovil(porPagina);
        });
      }
      this._bindCatalogRowEvents(container);
    } catch (error) {
      if (solicitud !== this._bibliomovilBooksVersion) return;
      const tbody = document.getElementById('bibliomovil-tbody');
      if (tbody) tbody.innerHTML = html`<p class="p-4 text-sm text-rose-700 dark:text-rose-300">No se pudo actualizar el catálogo: ${error?.message || 'error desconocido.'}</p>`.toString();
    }
  },

  _conectarControlesRutaBibliomovil() {
    const botonPreparar = document.getElementById('btn-preparar-ruta');
    if (botonPreparar) {
      botonPreparar.addEventListener('click', async () => {
        const textoBoton = document.getElementById('btn-preparar-ruta-texto');
        botonPreparar.disabled = true;
        if (textoBoton) textoBoton.textContent = 'Descargando datos…';
        try {
          const resumen = await persistencia.sincronizarTodo(({ mensaje }) => {
            if (textoBoton) textoBoton.textContent = mensaje;
          });
          if (!resumen?.completo) {
            const errores = resumen?.errores || [];
            const pasos = errores.map(e => e.paso).join(', ') || 'uno o más pasos';
            this.showToast(`Preparación incompleta (${pasos}). No se marcó como lista; revisa la conexión e inténtalo de nuevo.`, 'error');
            return;
          }
          try {
            localStorage.setItem(CLAVE_ULTIMA_PREPARACION, String(Date.now()));
          } catch {
            this.showToast('Los datos se sincronizaron, pero no se pudo guardar la fecha de preparación en este navegador.', 'error');
            return;
          }
          this._actualizarIndicadorRuta();
          this.showToast('¡Datos preparados! El catálogo y la información permitida están sincronizados para trabajar offline.', 'success');
        } catch (error) {
          this.showToast(`Error al preparar los datos: ${error.message || 'Inténtalo de nuevo.'}`, 'error');
        } finally {
          botonPreparar.disabled = false;
          // El mismo texto que el botón tiene al entrar: antes volvía a
          // «Preparar datos offline» y la etiqueta cambiaba sola tras cada
          // sincronización, sin que nadie hubiera tocado nada.
          if (textoBoton) textoBoton.textContent = 'Preparar datos sin conexión';
        }
      });
    }

    document.getElementById('bibliomovil-retry-route')?.addEventListener('click', () => {
      if (puntosDeRuta(this._obtenerPlanRutaBibliomovil()).length < 2) return;
      this._bibliomovilRouteCache = null;
      this._actualizarMapaRutaBibliomovil(true);
    });

    document.getElementById('bibliomovil-print-route')?.addEventListener('click', () => {
      this._imprimirHojaRutaBibliomovil();
    });

    const botonOrigen = document.getElementById('bibliomovil-select-origin');
    botonOrigen?.addEventListener('click', () => this._armarSeleccionMapaBibliomovil('origen'));

    const botonParada = document.getElementById('bibliomovil-select-stop');
    botonParada?.addEventListener('click', () => {
      if (this._obtenerPlanRutaBibliomovil().paradas.length >= MAX_PARADAS_RUTA) {
        this.showToast(`El plan admite hasta ${MAX_PARADAS_RUTA} paradas.`, 'error');
        return;
      }
      this._armarSeleccionMapaBibliomovil('parada');
    });

    const botonAgregar = document.getElementById('bibliomovil-add-stop');
    botonAgregar?.addEventListener('click', () => {
      const punto = this._bibliomovilCoordenadaPendiente;
      if (!punto) return;
      const plan = this._obtenerPlanRutaBibliomovil();
      if (plan.paradas.length >= MAX_PARADAS_RUTA) {
        this.showToast(`El plan admite hasta ${MAX_PARADAS_RUTA} paradas.`, 'error');
        return;
      }
      const nombre = document.getElementById('bibliomovil-stop-name')?.value.trim();
      plan.paradas.push({
        id: idParadaNuevo(),
        nombre: nombre || `Parada ${plan.paradas.length + 1}`,
        lat: punto.lat,
        lon: punto.lon
      });
      this._bibliomovilCoordenadaPendiente = null;
      const campoNombre = document.getElementById('bibliomovil-stop-name');
      if (campoNombre) campoNombre.value = '';
      if (botonAgregar) botonAgregar.disabled = true;
      this._guardarPlanRutaBibliomovil();
      this._dibujarListaParadasBibliomovil();
      this._actualizarMapaRutaBibliomovil();
      const estadoMapa = document.getElementById('bibliomovil-map-status');
      if (estadoMapa) estadoMapa.textContent = 'Parada guardada. Puedes elegir otra ubicación en el mapa.';
    });

    const campoOrigen = document.getElementById('bibliomovil-origin-name');
    campoOrigen?.addEventListener('change', () => {
      const plan = this._obtenerPlanRutaBibliomovil();
      if (!plan.origen) return;
      plan.origen.nombre = campoOrigen.value.trim() || 'Punto de partida';
      this._guardarPlanRutaBibliomovil();
      this._actualizarMapaRutaBibliomovil();
    });

    document.getElementById('bibliomovil-geolocate')?.addEventListener('click', event => {
      this._usarUbicacionActualBibliomovil(event.currentTarget);
    });

    document.getElementById('bibliomovil-clear-origin')?.addEventListener('click', () => {
      const plan = this._obtenerPlanRutaBibliomovil();
      plan.origen = null;
      const campo = document.getElementById('bibliomovil-origin-name');
      if (campo) campo.value = '';
      this._guardarPlanRutaBibliomovil();
      this._dibujarListaParadasBibliomovil();
      this._actualizarMapaRutaBibliomovil();
    });

    document.getElementById('bibliomovil-optimize-stops')?.addEventListener('click', () => {
      const plan = this._obtenerPlanRutaBibliomovil();
      plan.paradas = ordenarParadasPorCercania(plan.paradas, plan.origen);
      this._guardarPlanRutaBibliomovil();
      this._dibujarListaParadasBibliomovil();
      this._actualizarMapaRutaBibliomovil();
      this.showToast('Orden sugerido por cercanía. Es una estimación en línea recta; revisa la ruta vial.', 'success');
    });

    document.getElementById('bibliomovil-clear-route')?.addEventListener('click', async () => {
      const confirmar = await this.showConfirm('¿Limpiar el punto de partida y todas las paradas guardadas en este navegador?', {
        title: 'Limpiar recorrido', confirmText: 'Limpiar ruta'
      });
      if (!confirmar) return;
      this._bibliomovilPlan = { version: 1, origen: null, paradas: [] };
      this._bibliomovilCoordenadaPendiente = null;
      this._bibliomovilModoMapa = null;
      this._bibliomovilMapState?.map?.getContainer().classList.remove('bibliomovil-map--seleccionando');
      this._guardarPlanRutaBibliomovil();
      const campoOrigen = document.getElementById('bibliomovil-origin-name');
      const campoParada = document.getElementById('bibliomovil-stop-name');
      if (campoOrigen) campoOrigen.value = '';
      if (campoParada) campoParada.value = '';
      const botonAgregar = document.getElementById('bibliomovil-add-stop');
      if (botonAgregar) botonAgregar.disabled = true;
      this._dibujarListaParadasBibliomovil();
      this._actualizarMapaRutaBibliomovil();
    });
  },

  _armarSeleccionMapaBibliomovil(modo) {
    const mapa = this._bibliomovilMapState?.map;
    if (!mapa) {
      this.showToast('El mapa todavía no está disponible. Revisa la conexión e inténtalo de nuevo.', 'error');
      return;
    }
    this._bibliomovilModoMapa = modo;
    this._bibliomovilCoordenadaPendiente = null;
    const botonAgregar = document.getElementById('bibliomovil-add-stop');
    if (botonAgregar) botonAgregar.disabled = true;
    this._bibliomovilMapState.pendingMarker?.remove();
    this._bibliomovilMapState.pendingMarker = null;
    mapa.getContainer().classList.add('bibliomovil-map--seleccionando');
    const estado = document.getElementById('bibliomovil-map-status');
    if (estado) estado.textContent = modo === 'origen'
      ? 'Haz clic en el mapa para definir el punto de partida.'
      : 'Haz clic en el mapa para ubicar la nueva parada.';
  },

  async _usarUbicacionActualBibliomovil(boton) {
    if (!navigator.geolocation) {
      this.showToast('Este navegador no ofrece ubicación. Puedes marcar el origen en el mapa.', 'error');
      return;
    }
    if (boton) {
      boton.disabled = true;
      boton.setAttribute('aria-busy', 'true');
    }
    try {
      const posicion = await new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: false,
          timeout: 12000,
          maximumAge: 300000
        });
      });
      this._bibliomovilPlan = this._obtenerPlanRutaBibliomovil();
      const nombre = document.getElementById('bibliomovil-origin-name')?.value.trim();
      this._bibliomovilPlan.origen = {
        nombre: nombre || 'Ubicación actual',
        lat: posicion.coords.latitude,
        lon: posicion.coords.longitude
      };
      const campo = document.getElementById('bibliomovil-origin-name');
      if (campo && !campo.value.trim()) campo.value = 'Ubicación actual';
      this._guardarPlanRutaBibliomovil();
      this._dibujarListaParadasBibliomovil();
      this._actualizarMapaRutaBibliomovil(true);
      const estado = document.getElementById('bibliomovil-map-status');
      if (estado) estado.textContent = 'Punto de partida definido desde la ubicación autorizada en este dispositivo.';
    } catch (error) {
      const estado = document.getElementById('bibliomovil-map-status');
      if (estado) estado.textContent = textoErrorGeolocalizacion(error);
      this.showToast(textoErrorGeolocalizacion(error), 'error');
    } finally {
      if (boton) {
        boton.disabled = false;
        boton.removeAttribute('aria-busy');
        // Se conserva el texto e ícono del botón; aria-busy comunica el estado.
      }
    }
  },

  
  async _notificarParadaBibliomovil(parada) {
    this.showToast(`Buscando préstamos activos de ${parada.nombre}…`, 'info');
    try {
      const prestamos = await db.obtenerPendientesPorParada(parada.nombre);
      if (prestamos.length === 0) {
        this.showToast(`No hay préstamos activos registrados en ${parada.nombre}.`, 'info');
        return;
      }
      if (this.showBulkNotifyModal) {
        this.showBulkNotifyModal(prestamos);
      }
    } catch (err) {
      this.showToast(err.message || 'Error al buscar préstamos de la parada.', 'error');
    }
  },

  async _montarMapaBibliomovil() {
    const elemento = document.getElementById('bibliomovil-map');
    if (!elemento || this.currentView !== 'bibliomovil') return;
    try {
      // CSS y código de Leaflet se descargan solo al entrar en Bibliomóvil.
      await import('leaflet/dist/leaflet.css');
      const moduloLeaflet = await import('leaflet');
      const L = moduloLeaflet.default;
      if (this.currentView !== 'bibliomovil' || !elemento.isConnected) return;

      elemento.replaceChildren();
      const mapa = L.map(elemento, { scrollWheelZoom: false, preferCanvas: true })
        .setView([CENTRO_INICIAL_FUTRONO.lat, CENTRO_INICIAL_FUTRONO.lon], 12);
      const mosaicos = L.tileLayer(URL_MOSAICOS_OSM, {
        maxZoom: 19,
        attribution: ATRIBUCION_OSM,
        referrerPolicy: 'strict-origin-when-cross-origin'
      }).addTo(mapa);
      L.control.scale({ imperial: false }).addTo(mapa);

      const estadoMapa = document.getElementById('bibliomovil-map-status');
      mosaicos.on('load', () => {
        if (estadoMapa) estadoMapa.textContent = 'Mapa de OpenStreetMap cargado. Selecciona el origen o una parada desde los botones.';
      });
      mosaicos.on('tileerror', () => {
        if (estadoMapa) estadoMapa.textContent = 'No se pudieron cargar los mosaicos del mapa. Comprueba la conexión; el plan de paradas sigue disponible.';
      });
      mapa.on('click', evento => this._alElegirPuntoEnMapaBibliomovil(evento));

      this._bibliomovilMapState = {
        L,
        map: mapa,
        routeLine: null,
        markers: [],
        pendingMarker: null,
        routeController: null
      };
      this._actualizarMapaRutaBibliomovil(true);
      requestAnimationFrame(() => {
        if (this._bibliomovilMapState?.map === mapa) mapa.invalidateSize({ pan: false });
      });
    } catch (error) {
      console.error('No se pudo inicializar el mapa del Bibliomóvil:', error);
      const estadoMapa = document.getElementById('bibliomovil-map-status');
      if (estadoMapa) estadoMapa.textContent = 'No se pudo cargar el mapa. El plan de paradas puede seguir guardándose; vuelve a entrar cuando tengas conexión.';
      const mapa = document.getElementById('bibliomovil-map');
      if (mapa) mapa.innerHTML = html`<p class="bibliomovil-map-placeholder">El mapa no está disponible. Revisa la conexión e inténtalo de nuevo.</p>`.toString();
    }
  },

  _alElegirPuntoEnMapaBibliomovil(evento) {
    const modo = this._bibliomovilModoMapa;
    const estadoMapa = document.getElementById('bibliomovil-map-status');
    const state = this._bibliomovilMapState;
    if (!modo || !state || !evento?.latlng) return;
    const punto = { lat: evento.latlng.lat, lon: evento.latlng.lng };
    const nombre = modo === 'origen'
      ? (document.getElementById('bibliomovil-origin-name')?.value.trim() || 'Punto de partida')
      : (document.getElementById('bibliomovil-stop-name')?.value.trim() || 'Nueva parada');

    if (modo === 'origen') {
      const plan = this._obtenerPlanRutaBibliomovil();
      plan.origen = { ...punto, nombre };
      this._bibliomovilModoMapa = null;
      state.map.getContainer().classList.remove('bibliomovil-map--seleccionando');
      this._guardarPlanRutaBibliomovil();
      this._dibujarListaParadasBibliomovil();
      this._actualizarMapaRutaBibliomovil(true);
      if (estadoMapa) estadoMapa.textContent = `Origen guardado: ${nombre}.`;
      return;
    }

    this._bibliomovilCoordenadaPendiente = punto;
    const botonAgregar = document.getElementById('bibliomovil-add-stop');
    if (botonAgregar) botonAgregar.disabled = false;
    state.pendingMarker?.remove();
    state.pendingMarker = this._crearMarcadorBibliomovil(punto, '…', nombre, 'pendiente').addTo(state.map);
    this._bibliomovilModoMapa = null;
    state.map.getContainer().classList.remove('bibliomovil-map--seleccionando');
    if (estadoMapa) estadoMapa.textContent = `Punto pendiente: ${nombre} (${punto.lat.toFixed(5)}, ${punto.lon.toFixed(5)}). Confirma “Añadir parada” para guardarlo.`;
  },

  _crearMarcadorBibliomovil(punto, numero, nombre, tipo = 'parada') {
    const state = this._bibliomovilMapState;
    const icon = state.L.divIcon({
      className: `bibliomovil-marker-wrap bibliomovil-marker-wrap--${tipo}`,
      html: `<span class="bibliomovil-marker"><span>${numero}</span></span>`,
      iconSize: [34, 40],
      iconAnchor: [17, 38]
    });
    const marcador = state.L.marker([punto.lat, punto.lon], { icon, title: nombre, keyboard: true });
    const popup = document.createElement('span');
    popup.textContent = `${nombre} · ${punto.lat.toFixed(5)}, ${punto.lon.toFixed(5)}`;
    marcador.bindPopup(popup);
    return marcador;
  },

  _actualizarMapaRutaBibliomovil(calcular = true) {
    const state = this._bibliomovilMapState;
    const plan = this._obtenerPlanRutaBibliomovil();
    const puntos = puntosDeRuta(plan);
    const key = JSON.stringify(puntos.map(p => [p.lat, p.lon]));
    if (state && state.routeKey !== key) {
      state.routeController?.abort();
      state.routeController = null;
      this._bibliomovilRouteVersion = (this._bibliomovilRouteVersion || 0) + 1;
      state.routeKey = key;
    }
    const enlaces = [
      ['bibliomovil-google-maps', urlGoogleMaps(plan)],
      ['bibliomovil-osm-directions', urlOpenStreetMap(plan)]
    ];
    enlaces.forEach(([id, url]) => {
      const ancla = document.getElementById(id);
      if (!ancla) return;
      ancla.hidden = !url;
      if (url) ancla.href = url;
      else ancla.removeAttribute('href');
    });

    const botonReintentar = document.getElementById('bibliomovil-retry-route');
    if (botonReintentar) botonReintentar.disabled = puntos.length < 2 || !state;
    if (!state) {
      this._actualizarEstadoRutaBibliomovil(puntos, false);
      return;
    }

    state.routeLine?.remove();
    state.markers.forEach(marcador => marcador.remove());
    state.markers = [];
    state.pendingMarker?.remove();
    state.pendingMarker = null;

    const posiciones = [];
    if (plan.origen) {
      const marcadorOrigen = this._crearMarcadorBibliomovil(plan.origen, 'S', plan.origen.nombre, 'origen').addTo(state.map);
      state.markers.push(marcadorOrigen);
      posiciones.push([plan.origen.lat, plan.origen.lon]);
    }
    plan.paradas.forEach((parada, indice) => {
      const marcador = this._crearMarcadorBibliomovil(parada, String(indice + 1), parada.nombre).addTo(state.map);
      state.markers.push(marcador);
      posiciones.push([parada.lat, parada.lon]);
    });

    const cache = this._bibliomovilRouteCache;
    if (puntos.length >= 2 && cache?.key === key) {
      state.routeLine = state.L.polyline(cache.latLngs, {
        color: '#0f766e', weight: 5, opacity: 0.82, lineJoin: 'round'
      }).addTo(state.map);
    } else if (puntos.length >= 2) {
      state.routeLine = state.L.polyline(posiciones, {
        color: '#b45309', weight: 4, opacity: 0.75, dashArray: '8 8', lineJoin: 'round'
      }).addTo(state.map);
    }

    if (posiciones.length >= 2) {
      state.map.fitBounds(state.L.latLngBounds(posiciones), { padding: [28, 28], maxZoom: 15 });
    } else if (posiciones.length === 1) {
      state.map.setView(posiciones[0], Math.max(state.map.getZoom(), 14));
    } else {
      state.map.setView([CENTRO_INICIAL_FUTRONO.lat, CENTRO_INICIAL_FUTRONO.lon], 12);
    }

    this._actualizarEstadoRutaBibliomovil(puntos, cache?.key === key);
    if (calcular && puntos.length >= 2 && cache?.key !== key) {
      this._calcularRutaVialBibliomovil(plan, puntos, key, state);
    }
  },

  _actualizarEstadoRutaBibliomovil(puntos, calculada) {
    const estado = document.getElementById('bibliomovil-route-status');
    if (!estado) return;
    if (puntos.length < 2) {
      estado.textContent = 'Agrega un origen y al menos una parada, o dos paradas, para calcular el recorrido.';
      return;
    }
    if (calculada && this._bibliomovilRouteCache?.key === JSON.stringify(puntos.map(p => [p.lat, p.lon]))) {
      const ruta = this._bibliomovilRouteCache;
      const distancia = ruta.distanciaKm === null ? '' : ` · ${distanciaLegible(ruta.distanciaKm)}`;
      const duracion = ruta.duracionMin === null ? '' : ` · ${duracionLegible(ruta.duracionMin)}`;
      estado.textContent = `Recorrido vial orientativo (OSRM)${distancia}${duracion}. Revisa accesos y condiciones del camino antes de salir.`;
      return;
    }
    if (!navigator.onLine) {
      estado.textContent = `Sin conexión: se conserva el orden y se muestra una línea recta aproximada (${distanciaLegible(distanciaRectaTotal(puntos))}); la ruta vial requiere internet.`;
      return;
    }
    estado.textContent = 'Calculando la ruta vial… Las líneas rectas se muestran solo como referencia mientras responde el servicio.';
  },

  async _calcularRutaVialBibliomovil(plan, puntos, key, state) {
    const estado = document.getElementById('bibliomovil-route-status');
    const url = urlCalculoVial(plan);
    if (!url || !estado || this.currentView !== 'bibliomovil' || !navigator.onLine) return;

    state.routeController?.abort();
    const controller = new AbortController();
    state.routeController = controller;
    const solicitud = (this._bibliomovilRouteVersion || 0) + 1;
    this._bibliomovilRouteVersion = solicitud;
    const timeout = setTimeout(() => controller.abort(), 15000);

    try {
      const respuestaHttp = await fetch(url, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        cache: 'no-store',
        referrerPolicy: 'no-referrer',
        signal: controller.signal
      });
      if (!respuestaHttp.ok) throw new Error(`El servicio de rutas respondió ${respuestaHttp.status}.`);
      const respuesta = await respuestaHttp.json();
      const ruta = leerRutaOsrm(respuesta);
      if (!ruta) throw new Error('El servicio no encontró un recorrido vial para esos puntos.');
      if (solicitud !== this._bibliomovilRouteVersion || this.currentView !== 'bibliomovil' || state !== this._bibliomovilMapState) return;

      this._bibliomovilRouteCache = { key, ...ruta };
      state.routeLine?.remove();
      state.routeLine = state.L.polyline(ruta.latLngs, {
        color: '#0f766e', weight: 5, opacity: 0.82, lineJoin: 'round'
      }).addTo(state.map);
      const distancia = ruta.distanciaKm === null ? '' : ` · ${distanciaLegible(ruta.distanciaKm)}`;
      const duracion = ruta.duracionMin === null ? '' : ` · ${duracionLegible(ruta.duracionMin)}`;
      estado.textContent = `Recorrido vial orientativo (OSRM)${distancia}${duracion}. Revisa accesos y condiciones del camino antes de salir.`;
    } catch (error) {
      if (error?.name === 'AbortError') {
        // Los cambios de plan o de vista incrementan la versión; en esos casos
        // el aborto es intencional. Si la solicitud sigue vigente, fue un
        // timeout/interrupción y hay que salir del estado "Calculando…".
        if (solicitud === this._bibliomovilRouteVersion && this.currentView === 'bibliomovil' && state === this._bibliomovilMapState && estado) {
          const recta = distanciaLegible(distanciaRectaTotal(puntos));
          estado.textContent = `El cálculo vial se interrumpió o tardó demasiado. Se mantiene una línea recta aproximada (${recta}); puedes usar los enlaces de navegación o intentarlo otra vez.`;
        }
        return;
      }
      if (solicitud !== this._bibliomovilRouteVersion || this.currentView !== 'bibliomovil' || state !== this._bibliomovilMapState) return;
      console.warn('No se pudo calcular la ruta vial del Bibliomóvil:', error);
      this._bibliomovilRouteCache = null;
      if (state.routeLine) {
        state.routeLine.setStyle({ color: '#b45309', dashArray: '8 8', weight: 4 });
      }
      if (estado) {
        const recta = distanciaLegible(distanciaRectaTotal(puntos));
        estado.textContent = `No se pudo calcular la ruta vial. Se muestra una línea recta aproximada (${recta}); usa los enlaces de navegación o inténtalo de nuevo con conexión.`;
      }
    } finally {
      clearTimeout(timeout);
    }
  },

  _destruirMapaBibliomovil() {
    clearTimeout(this._bibliomovilSearchTimer);
    this._bibliomovilSearchVersion = (this._bibliomovilSearchVersion || 0) + 1;
    this._bibliomovilBooksVersion = (this._bibliomovilBooksVersion || 0) + 1;
    this._bibliomovilRouteVersion = (this._bibliomovilRouteVersion || 0) + 1;
    const state = this._bibliomovilMapState;
    state?.routeController?.abort();
    if (state?.map) state.map.remove();
    this._bibliomovilMapState = null;
    this._bibliomovilModoMapa = null;
    this._bibliomovilCoordenadaPendiente = null;
  },

  /**
   * Cuenta los títulos del catálogo del Bibliomóvil para un filtro de stock.
   * Pide una sola fila (límite 1) porque solo interesa el total que devuelve
   * buscar_libros() junto con la primera coincidencia. Si la consulta falla
   * (sin conexión y sin copia local, por ejemplo), devuelve null para que la
   * tarjeta muestre «—» en vez de un cero engañoso.
   */
  async _contarColeccionRuta(filtro) {
    try {
      const { total } = await db.obtenerLibros('', 0, 1, true, filtro);
      const numero = Number(total);
      return Number.isFinite(numero) ? numero : null;
    } catch {
      return null;
    }
  },

  /** Texto corto con las paradas y la distancia en línea recta del plan. */
  _resumenDistanciaBibliomovil() {
    const puntos = puntosDeRuta(this._obtenerPlanRutaBibliomovil());
    if (puntos.length < 2) return puntos.length === 1 ? '1 punto marcado' : 'Sin paradas todavía';
    return `${puntos.length} puntos · ${distanciaLegible(distanciaRectaTotal(puntos))} en línea recta`;
  },

  /** Refresca las tarjetas de resumen cuando cambia el catálogo o el plan. */
  _actualizarResumenBibliomovil(resumen = this._bibliomovilResumen) {
    const escribir = (id, valor) => {
      const nodo = document.getElementById(id);
      if (nodo && valor !== undefined && valor !== null) nodo.textContent = String(valor);
    };
    if (resumen) {
      escribir('bibliomovil-kpi-titulos', resumen.total);
      escribir('bibliomovil-tab-total', resumen.total);
      escribir('bibliomovil-kpi-disponibles', resumen.disponibles ?? '—');
      escribir('bibliomovil-kpi-prestados', resumen.agotados ?? '—');
    }
    escribir('bibliomovil-kpi-recorrido', puntosDeRuta(this._obtenerPlanRutaBibliomovil()).length);
    escribir('bibliomovil-kpi-distancia', this._resumenDistanciaBibliomovil());
  },

  /**
   * Imprime una hoja de ruta en papel.
   *
   * Se arma un contenedor aparte, fuera del marco de la aplicación, y se marca
   * el body para que el CSS de impresión oculte todo lo demás (el mapa no se
   * imprime: son mosaicos de OpenStreetMap y saldrían en blanco sin conexión).
   * Al terminar —o a los 60 s, por si el navegador no dispara `afterprint`—
   * se limpia todo para que la pantalla quede igual que antes.
   */
  _imprimirHojaRutaBibliomovil() {
    const plan = this._obtenerPlanRutaBibliomovil();
    if (!plan.origen && plan.paradas.length === 0) {
      this.showToast('Agrega al menos un punto al recorrido antes de imprimir.', 'error');
      return;
    }
    document.getElementById('hoja-ruta-bibliomovil')?.remove();

    const filas = [];
    if (plan.origen) {
      filas.push(html`<li><span class="hoja-ruta__punto">S</span><span class="hoja-ruta__datos"><strong>${plan.origen.nombre}</strong><span>Punto de partida · ${plan.origen.lat.toFixed(5)}, ${plan.origen.lon.toFixed(5)}</span></span></li>`);
    }
    plan.paradas.forEach((parada, indice) => {
      const anterior = indice === 0 ? plan.origen : plan.paradas[indice - 1];
      const tramo = anterior ? distanciaEnKm(anterior, parada) : NaN;
      filas.push(html`<li><span class="hoja-ruta__punto">${indice + 1}</span><span class="hoja-ruta__datos"><strong>${parada.nombre}</strong><span>${parada.lat.toFixed(5)}, ${parada.lon.toFixed(5)}${Number.isFinite(tramo) ? ` · ${distanciaLegible(tramo)} desde el punto anterior` : ''}</span></span></li>`);
    });

    const hoja = document.createElement('div');
    hoja.id = 'hoja-ruta-bibliomovil';
    hoja.className = 'hoja-ruta-print';
    hoja.innerHTML = html`
      <p class="hoja-ruta__institucion">Biblioteca Pública Municipal de Futrono · BiblioNexo</p>
      <h1>Hoja de ruta — Bibliomóvil</h1>
      <p class="hoja-ruta__fecha">Preparada el ${new Date().toLocaleDateString('es-CL', { day: 'numeric', month: 'long', year: 'numeric' })} · ${this._resumenDistanciaBibliomovil()}</p>
      <ol class="hoja-ruta__lista">${html`${filas}`}</ol>
      <p class="hoja-ruta__nota">
        Distancias en línea recta, orientativas. Revisa accesos y condiciones del camino antes de salir.
        Los nombres y coordenadas quedan solo en este equipo: no se envían a ningún servicio salvo el cálculo de ruta por coordenadas.
      </p>
      <div class="hoja-ruta__anotaciones"><span>Anotaciones</span></div>
    `.toString();
    document.body.appendChild(hoja);
    document.body.classList.add('imprimiendo-hoja-ruta');

    let limpiado = false;
    const limpiar = () => {
      if (limpiado) return;
      limpiado = true;
      document.body.classList.remove('imprimiendo-hoja-ruta');
      document.getElementById('hoja-ruta-bibliomovil')?.remove();
      window.removeEventListener('afterprint', limpiar);
    };
    window.addEventListener('afterprint', limpiar);
    setTimeout(limpiar, 60000);
    try {
      window.print();
    } catch {
      // Navegadores sin diálogo de impresión (o bloqueado): se limpia igual.
      limpiar();
      this.showToast('Este navegador no permite imprimir. Puedes copiar el recorrido a mano.', 'error');
    }
  },

  /** Actualiza el tiempo desde la última preparación completa de datos. */
  _actualizarIndicadorRuta() {
    const elemento = document.getElementById('bibliomovil-sync-status');
    const estadoPreparacion = document.getElementById('bibliomovil-preparacion-estado');
    const escribir = texto => {
      if (elemento) elemento.textContent = texto;
      if (estadoPreparacion) {
        estadoPreparacion.textContent = texto === 'Nunca' || texto.startsWith('No disponible') || texto.startsWith('Fecha')
          ? 'Este equipo todavía no tiene una copia preparada.'
          : `Última copia en este equipo: ${texto.toLowerCase()}.`;
      }
    };
    if (!elemento && !estadoPreparacion) return;
    let marca;
    try {
      marca = localStorage.getItem(CLAVE_ULTIMA_PREPARACION);
    } catch {
      escribir('No disponible en este navegador');
      return;
    }
    if (!marca) {
      escribir('Nunca');
      return;
    }
    const instante = Number(marca);
    if (!Number.isFinite(instante) || instante <= 0 || instante > Date.now() + 60000) {
      escribir('Fecha de preparación inválida');
      return;
    }
    const hace = Math.max(0, Math.round((Date.now() - instante) / 60000));
    if (hace < 1) escribir('Hace menos de un minuto');
    else if (hace < 60) escribir(`Hace ${hace} min`);
    else if (hace < 1440) escribir(`Hace ${Math.round(hace / 60)} h`);
    else escribir(`Hace ${Math.round(hace / 1440)} día(s)`);
  }
};
