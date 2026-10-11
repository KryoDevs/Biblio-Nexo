import estadoConexion from './estado-conexion.js';
import { escapeHtml } from './utilidades.js';
import { CONFIG } from '../config.js';
import * as auth from './auth.js';
import registroErrores from './errores.js';

export default {
  renderNavMenu() {
    const nav = document.getElementById('nav-menu');
    if (!nav) return;

    const views = CONFIG.VIEWS_BY_ROLE[this.currentUserRole] || CONFIG.VIEWS_BY_ROLE.librero;

    // Agrupamos manteniendo el orden de aparición de cada sección
    const sections = [];
    views.forEach(v => {
      const section = v.section || 'General';
      let group = sections.find(s => s.name === section);
      if (!group) {
        group = { name: section, items: [] };
        sections.push(group);
      }
      group.items.push(v);
    });

    nav.innerHTML = sections.map(group => `
      <div class="mb-5">
        <p class="px-3 mb-1.5 text-[10px] font-black uppercase tracking-widest text-stone-500 dark:text-stone-400">${escapeHtml(group.name)}</p>
        <div class="space-y-0.5">
          ${group.items.map(v => `
            <button
              type="button"
              data-view="${v.id}"
              class="nav-btn w-full px-3 py-2.5 rounded-xl text-sm font-bold flex items-center gap-3 transition text-stone-300 hover:bg-white/10 hover:text-white"
            >
              <i aria-hidden="true" class="fas ${v.icon} w-4 text-center ${v.id === 'scanner' || v.id === 'bibliomovil' ? 'text-amber-400' : ''}"></i>
              <span>${escapeHtml(v.label)}</span>
            </button>
          `).join('')}
        </div>
      </div>
    `).join('');

    nav.querySelectorAll('.nav-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this.switchView(btn.dataset.view);
        // En tablet y teléfono, cerramos el cajón tras elegir una vista
        this._cerrarMenuLateral();
        });
      });

      this._renderBarraInferior();
      this._actualizarBadgeAtrasados();
    },

  /**
   * Barra de accesos rápidos de la parte baja de la pantalla (solo tablet y
   * teléfono: en escritorio el CSS no la muestra). Se arma con las mismas
   * vistas que el menú lateral —CONFIG.VIEWS_BY_ROLE— así que un rol nunca ve
   * un acceso a una sección que no le corresponde: si la vista no está en su
   * menú, tampoco aparece acá.
   *
   * El orden de preferencia vive en CONFIG.VISTAS_RAPIDAS; debe contener los
   * identificadores de tareas diarias, no de administración.
   */
  _renderBarraInferior() {
    const barra = document.getElementById('barra-inferior');
    if (!barra) return;

    const vistas = CONFIG.VIEWS_BY_ROLE[this.currentUserRole] || CONFIG.VIEWS_BY_ROLE.librero;
    const preferidas = (CONFIG.VISTAS_RAPIDAS || {})[this.currentUserRole] || [];
    const rapidas = preferidas
      .map(id => vistas.find(v => v.id === id))
      .filter(Boolean)
      .slice(0, 4);

    // Con una sola sección disponible (o ninguna) la barra no aporta nada: el
    // cajón completo queda más claro.
    if (rapidas.length < 2) {
      barra.innerHTML = '';
      return;
    }

    barra.innerHTML = rapidas.map(v => `
      <button type="button" class="barra-inferior__item" data-view="${escapeHtml(v.id)}">
        <i aria-hidden="true" class="fas ${escapeHtml(v.icon)}"></i>
        <span class="truncate max-w-full">${escapeHtml(v.label)}</span>
      </button>
    `).join('') + `
      <button type="button" class="barra-inferior__item" data-accion="mas" aria-label="Ver todas las secciones">
        <i aria-hidden="true" class="fas fa-ellipsis"></i>
        <span class="truncate max-w-full">Más</span>
      </button>`;

    barra.querySelectorAll('[data-view]').forEach(btn => {
      btn.addEventListener('click', () => this.switchView(btn.dataset.view));
    });
    barra.querySelector('[data-accion="mas"]')?.addEventListener('click', () => this._abrirMenuLateral());

    this._setActiveNavButton(this.currentView);
  },

  /** Abre el cajón lateral (tablet y teléfono). */
  _abrirMenuLateral() {
    document.getElementById('sidebar')?.classList.add('active');
    document.getElementById('sidebar-overlay')?.classList.remove('hidden');
    this._sincronizarMenuAbierto();
  },

  /** Cierra el cajón lateral. Es idempotente: llamarlo cerrado no hace nada. */
  _cerrarMenuLateral() {
    document.getElementById('sidebar')?.classList.remove('active');
    document.getElementById('sidebar-overlay')?.classList.add('hidden');
    this._sincronizarMenuAbierto();
  },

  /**
   * Con el cajón abierto, la página de atrás no se desplaza (body.menu-abierto
   * en css/styles.css) y el botón de la franja de título queda anunciado como
   * abierto para los lectores de pantalla.
   */
  _sincronizarMenuAbierto() {
    const abierto = !!document.getElementById('sidebar')?.classList.contains('active');
    document.body.classList.toggle('menu-abierto', abierto);
    const boton = document.getElementById('sidebar-toggle-btn');
    if (boton) boton.setAttribute('aria-expanded', abierto ? 'true' : 'false');
    document.getElementById('sidebar-cerrar')?.setAttribute('tabindex', abierto ? '0' : '-1');
  },

  /**
   * Color de la franja del navegador (barra de estado en Android, barra de
   * direcciones) en teléfonos.
   *
   * index.html declara dos colores, uno claro y otro oscuro sujeto a la
   * preferencia del sistema. Eso alcanza mientras la persona no elija un tema;
   * en cuanto lo hace (la clase "dark" deja de seguir al sistema), el color de
   * la barra tiene que seguir al tema elegido y no al del teléfono — quien
   * activa el modo oscuro con el teléfono en claro seguía viendo una franja
   * color madera sobre una pantalla negra. Por eso, con una preferencia
   * guardada, la etiqueta que depende del sistema se desactiva (media="not
   * all") y manda la nuestra.
   */
  _sincronizarColorDeBarra() {
    const meta = document.getElementById('meta-color-tema');
    const metaDelSistema = document.querySelector('meta[name="theme-color"][media]');
    const esOscuro = document.documentElement.classList.contains('dark');
    if (meta) meta.setAttribute('content', esOscuro ? '#0c0a09' : '#7A431D');

    let hayPreferencia = false;
    try { hayPreferencia = localStorage.getItem('theme') === 'dark' || localStorage.getItem('theme') === 'light'; } catch (e) { /* navegador sin almacenamiento */ }
    if (metaDelSistema) metaDelSistema.setAttribute('media', hayPreferencia ? 'not all' : '(prefers-color-scheme: dark)');
  },

  _setActiveNavButton(viewName) {
    document.querySelectorAll('#nav-menu .nav-btn').forEach(btn => {
      const active = btn.dataset.view === viewName;
      btn.classList.toggle('bg-patrimonio-madera', active);
      btn.classList.toggle('is-active', active);
      btn.classList.toggle('text-white', active);
      btn.classList.toggle('text-stone-300', !active);
      if (active) btn.setAttribute('aria-current', 'page');
      else btn.removeAttribute('aria-current');
    });

    // La barra de accesos rápidos del teléfono marca la misma sección. No
    // lleva aria-current (no es un índice de secciones, son atajos), pero sí
    // el estado visual, para que se vea dónde está parada la persona.
    document.querySelectorAll('#barra-inferior [data-view]').forEach(btn => {
      if (btn.dataset.view === viewName) btn.setAttribute('aria-current', 'page');
      else btn.removeAttribute('aria-current');
    });

    // El botón "Más" marca el cajón completo, no una sección: se apaga cuando
    // la sección actual ya está en la barra.
    const botonMas = document.querySelector('#barra-inferior [data-accion="mas"]');
    if (botonMas) {
      const enLaBarra = [...document.querySelectorAll('#barra-inferior [data-view]')]
        .some(b => b.dataset.view === viewName);
      if (enLaBarra) botonMas.removeAttribute('aria-current');
      else botonMas.setAttribute('aria-current', 'page');
    }
  },

  _skeletonLoader(viewName) {
      if (viewName === 'catalog' || viewName === 'users' || viewName === 'loans') {
        return `
          <div class="flex flex-col gap-4 p-4 skeleton-shimmer animate-pulse">
            ${Array(4).fill(0).map(() => `
              <div class="bg-white dark:bg-stone-800 rounded-2xl p-5 flex flex-col sm:flex-row gap-4 sm:items-center border border-stone-200 dark:border-stone-700 shadow-sm">
                <div class="flex items-start gap-4 flex-1">
                  <div class="w-16 h-24 bg-stone-200 rounded-lg shrink-0 dark:bg-stone-700"></div>
                  <div class="flex flex-col justify-center gap-2 flex-1 py-1">
                    <div class="h-5 bg-stone-200 rounded-md w-3/4 dark:bg-stone-700"></div>
                    <div class="h-4 bg-stone-100 dark:bg-stone-700 rounded-md w-1/2"></div>
                    <div class="flex gap-2 mt-2">
                      <div class="h-5 bg-stone-100 dark:bg-stone-700 rounded-md w-16"></div>
                      <div class="h-5 bg-stone-100 dark:bg-stone-700 rounded-md w-20"></div>
                    </div>
                  </div>
                </div>
                <div class="flex flex-col items-end gap-2 shrink-0 sm:w-32 hidden sm:flex">
                   <div class="h-4 bg-stone-100 dark:bg-stone-700 rounded-md w-16"></div>
                   <div class="h-8 bg-stone-200 rounded-xl w-24 dark:bg-stone-700"></div>
                </div>
              </div>
            `).join('')}
          </div>
        `;
      }
      if (viewName === 'dashboard') {
        return `
          <div class="skeleton-shimmer animate-pulse p-4">
            <div class="mb-5 space-y-2">
               <div class="h-6 bg-stone-200 rounded-md w-1/3 dark:bg-stone-700"></div>
               <div class="h-4 bg-stone-100 dark:bg-stone-700 rounded-md w-1/4"></div>
            </div>
            <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              ${Array(4).fill(0).map(() => `
                <div class="bg-white dark:bg-stone-800 rounded-2xl border border-stone-200 dark:border-stone-700 p-5 shadow-sm">
                  <div class="h-6 w-6 bg-stone-200 dark:bg-stone-700 rounded-full mb-3"></div>
                  <div class="h-10 bg-stone-200 dark:bg-stone-700 rounded-md w-1/2 mb-2"></div>
                  <div class="h-4 bg-stone-100 dark:bg-stone-700 rounded-md w-3/4"></div>
                </div>
              `).join('')}
            </div>
          </div>
        `;
      }
      return `<div class="flex justify-center py-20 animate-pulse"><i aria-hidden="true" class="fas fa-circle-notch fa-spin text-4xl text-patrimonio-lago dark:text-sky-300"></i></div>`;
    },

  _container() {
    return document.getElementById('views-container');
  },

  async switchView(viewName) {
    const solicitud = (this._viewRenderVersion || 0) + 1;
    this._viewRenderVersion = solicitud;
    const vistaAnterior = this.currentView;
    if (vistaAnterior === 'bibliomovil' && viewName !== 'bibliomovil') {
      this._destruirMapaBibliomovil?.();
    }
    this.currentView = viewName;
    this._setActiveNavButton(viewName);

    // Al cambiar de sección se cierra el cajón (si venía de un atajo, de un
    // aviso o del botón "Más") y el área de trabajo vuelve arriba. Sin esto,
    // en un teléfono se entraba a la sección nueva a mitad de camino: la
    // posición de scroll del contenedor era la de la sección anterior.
    this._cerrarMenuLateral();
    const areaDeTrabajo = this._container();
    if (areaDeTrabajo) areaDeTrabajo.scrollTop = 0;
    
    // El título de la franja superior sale de la misma definición que el menú, para que nunca queden desincronizados
    const views = CONFIG.VIEWS_BY_ROLE[this.currentUserRole] || CONFIG.VIEWS_BY_ROLE.librero;
    const viewDef = views.find(v => v.id === viewName);

    const title = document.getElementById('page-title');
    const kicker = document.getElementById('page-kicker');
    if (title) title.textContent = viewDef?.label || 'Dashboard';
    if (kicker) kicker.textContent = viewDef?.section || '';

    // Loader mientras busca en BD
    const container = this._container();
      if(container) container.innerHTML = this._skeletonLoader(viewName);

    const renderers = {
      dashboard: () => this.renderDashboard(),
      reports: () => this.renderReports(),
      catalog: () => this.renderCatalog(),
      // Sin esta línea, el menú ofrecía "Bibliomóvil" (CONFIG.VIEWS_BY_ROLE)
      // pero switchView no encontraba su render y caía en el Dashboard: la
      // vista completa del Modo Ruta era inalcanzable.
      bibliomovil: () => this.renderBibliomovil(),
      users: () => this.renderUsers(),
      loans: () => this.renderLoans(),
      scanner: () => this.renderScannerView(),
      admin: () => this.renderAdmin(),
      profile: () => this.renderProfile()
    };
    
    try {
        await (renderers[viewName] || renderers.dashboard)();
    } catch (e) {
        // Una consulta lenta de una vista anterior no debe reemplazar el
        // contenido de la sección a la que el usuario ya navegó.
        if (solicitud !== this._viewRenderVersion || this.currentView !== viewName) return;
        // Se muestra la causa real: "Error cargando vista" no le sirve a nadie
        // del mesón para saber si es la conexión, un permiso o una migración.
        console.error(`Fallo al cargar la vista "${viewName}":`, e);
        registroErrores.registrarOperacion(`cargar la vista ${viewName}`, e);
        if (container) container.innerHTML = `
          <div class="catalog-card bg-patrimonio-card dark:bg-stone-900/95 backdrop-blur-xl rounded-[2rem] border border-rose-300/50 p-8 max-w-lg shadow-soft-xl">
            <p class="font-serif font-semibold text-lg text-stone-900 dark:text-stone-100 mb-1">No se pudo cargar esta sección</p>
            <p class="text-sm text-stone-600 dark:text-stone-300">${escapeHtml(e?.message || 'Error desconocido.')}</p>
            <button id="retry-view-btn" class="btn-madera mt-4 text-white rounded-xl px-4 py-2 text-sm font-medium">
              <i aria-hidden="true" class="fas fa-rotate-right mr-1.5"></i> Reintentar
            </button>
          </div>`;
        document.getElementById('retry-view-btn')?.addEventListener('click', () => this.switchView(viewName));
    }
  },

  _momentoDelDia() {
    const h = new Date().getHours();
    if (h >= 5 && h < 9) return 'amanecer';
    if (h >= 9 && h < 18) return 'dia';
    if (h >= 18 && h < 20) return 'atardecer';
    return 'noche';
  },

  _vistaInicial(rol) {
    const vistasDelRol = CONFIG.VIEWS_BY_ROLE[rol] || CONFIG.VIEWS_BY_ROLE.librero;
    const vistaPedida = new URLSearchParams(window.location.search).get('vista');
    return vistasDelRol.some(v => v.id === vistaPedida) ? vistaPedida : vistasDelRol[0].id;
  },

  async renderShell(user) {
    document.body.innerHTML = `
      <div class="pantalla-completa w-full flex bg-patrimonio-base dark:bg-stone-950 overflow-hidden transition-colors duration-500">

        <!-- Fondo oscuro para cerrar el menú lateral en tablet y teléfono -->
        <div id="sidebar-overlay" class="hidden fixed inset-0 bg-patrimonio-lago/40 backdrop-blur-sm z-40 transition-opacity"></div>

        <!-- Menú lateral: identidad institucional + navegación agrupada por rol -->
        <a href="#views-container" class="skip-link">Saltar al contenido principal</a>
        <aside id="sidebar" class="momento-${this._momentoDelDia()} w-72 shrink-0 text-white flex flex-col z-50 shadow-xl">
          <div class="tab-corner px-5 py-5 border-b border-white/10 flex items-center gap-2">
            <i aria-hidden="true" class="fas fa-book text-patrimonio-madera text-lg"></i>
            <div class="leading-none min-w-0 flex-1">
              <span class="font-serif font-semibold text-white text-lg block">
                Biblio<span class="text-patrimonio-madera">Nexo</span>
              </span>
              <span class="text-[9px] text-stone-500 dark:text-stone-400 font-bold uppercase tracking-widest">Futrono · Región de Los Ríos</span>
            </div>
            <!-- Solo en tablet y teléfono: cierra el cajón. Un botón de cerrar
                 explícito, además de tocar fuera o deslizar, porque el cajón
                 ocupa el 86% del ancho y a veces el borde de afuera queda
                 debajo del pulgar. -->
            <button id="sidebar-cerrar" type="button" aria-label="Cerrar el menú"
              class="boton-icono lg:hidden -mr-1 w-9 h-9 rounded-lg text-stone-300 hover:bg-white/10 hover:text-white transition shrink-0">
              <i aria-hidden="true" class="fas fa-xmark"></i>
            </button>
          </div>

          <nav id="nav-menu" class="flex-1 overflow-y-auto px-3 py-5"></nav>

          <!-- Ficha de usuario: como la tarjeta de un socio de biblioteca.
               Ahora es un botón, porque es el lugar donde uno espera pinchar
               para ver y editar sus propios datos. -->
          <div class="border-t border-white/10 p-4 flex items-center gap-3">
            <button class="dark-mode-toggle boton-icono w-9 h-9 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 transition shrink-0" title="Alternar modo oscuro" aria-label="Alternar modo oscuro" aria-pressed="false"><i aria-hidden="true" class="dark-mode-icon fas fa-moon"></i></button>
              <button id="perfil-btn" title="Ver y editar mi perfil"
              class="flex items-center gap-3 min-w-0 flex-1 text-left rounded-lg -m-1 p-1 hover:bg-white/10 transition">
              <span id="current-user-initial" class="w-9 h-9 rounded-full bg-patrimonio-madera flex items-center justify-center font-black text-sm shrink-0 text-white"></span>
              <span class="min-w-0 flex-1 block">
                <span id="current-user-name" class="text-xs font-bold text-white leading-none truncate block"></span>
                <span id="current-user-sub" class="text-[10px] text-stone-400 leading-none truncate block mt-0.5"></span>
                <span id="current-user-badge" class="stamp-onDark mt-1.5"></span>
              </span>
            </button>
            <button id="logout-btn" title="Cerrar sesión" aria-label="Cerrar sesión"
              class="boton-icono w-9 h-9 rounded-lg text-stone-300 hover:bg-white/10 hover:text-white flex items-center justify-center transition shrink-0">
              <i aria-hidden="true" class="fas fa-right-from-bracket"></i>
            </button>
          </div>
        </aside>

        <!-- Columna principal -->
        <div class="flex-1 flex flex-col min-w-0">
          <!-- Franja de título: como la etiqueta de un cajón de fichero.
               En tablet y teléfono el botón del menú aparece hasta 1024px
               (lg), el mismo ancho en el que el menú lateral se convierte en
               cajón — ver el bloque de #sidebar en css/styles.css. Antes el
               botón desaparecía a los 768px y el menú también: en un iPad en
               vertical (768px exactos) no había forma de navegar. -->
          <div class="franja-titulo bg-white/90 dark:bg-stone-800/95 backdrop-blur-md border-b border-stone-200 dark:border-stone-700/50 px-3 sm:px-4 md:px-6 py-3 flex shadow-sm items-center gap-2 sm:gap-3 shrink-0">
            <button id="sidebar-toggle-btn" class="boton-icono lg:hidden w-9 h-9 -ml-1 rounded-xl items-center justify-center text-stone-500 dark:text-stone-400 hover:text-stone-800 dark:hover:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-700 transition shrink-0"
              aria-label="Abrir el menú" aria-controls="sidebar" aria-expanded="false">
              <i aria-hidden="true" class="fas fa-bars"></i>
            </button>
            <span class="w-1.5 h-8 bg-patrimonio-madera rounded-sm hidden sm:block"></span>
            <div class="min-w-0">
              <p id="page-kicker" class="text-[10px] font-black uppercase tracking-widest text-stone-500 dark:text-stone-400 leading-none mb-0.5">Panel</p>
              <h2 id="page-title" class="font-serif font-semibold text-stone-800 dark:text-stone-200 text-base leading-tight truncate">Dashboard</h2>
            </div>
            <div class="ml-auto flex items-center gap-2 sm:gap-4 relative">
              
              <!-- Campana de notificaciones -->
              <div class="relative">
                <button id="notificaciones-btn" class="boton-icono w-9 h-9 -mr-1 relative text-stone-500 hover:text-stone-800 dark:text-stone-400 dark:hover:text-stone-200 transition-colors" title="Centro de notificaciones" aria-label="Centro de notificaciones" aria-expanded="false">
                  <i aria-hidden="true" class="fas fa-bell text-[1.1rem]"></i>
                  <span id="notificaciones-badge" class="absolute -top-0.5 right-0 bg-rose-600 shadow text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full hidden">0</span>
                </button>

                <!-- Panel de notificaciones. En un teléfono de 360px, el ancho
                     fijo de 320px más el margen se salía de la pantalla: se
                     limita al ancho disponible. -->
                <div id="notificaciones-panel" class="absolute right-0 mt-3 w-80 max-w-[calc(100vw-2rem)] bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-700 rounded-2xl shadow-2xl opacity-0 invisible transition-all transform origin-top-right scale-95 z-50">
                  <div class="p-4 border-b border-stone-100 dark:border-stone-800 flex justify-between items-center bg-stone-50/50 dark:bg-stone-800/20 rounded-t-2xl">
                    <h3 class="font-bold text-stone-800 dark:text-stone-200">Notificaciones</h3>
                    <button id="notificaciones-close" class="text-stone-500 hover:text-stone-700 dark:hover:text-stone-200 dark:text-stone-400"><i aria-hidden="true" class="fas fa-times"></i></button>
                  </div>
                  <div id="notificaciones-lista" class="max-h-80 overflow-y-auto divide-y divide-stone-100 dark:divide-stone-800/50">
                    <!-- Dinámico -->
                  </div>
                </div>
              </div>

              <span id="estado-conexion" class="shrink-0"></span>
            </div>
          </div>

          <main id="views-container" tabindex="-1" aria-label="Contenido principal" class="view-canvas flex-1 overflow-y-auto p-4 md:p-7"></main>
        </div>

        <!-- Barra de accesos rápidos: solo teléfono y tablet (lg:hidden en
             css/styles.css, #barra-inferior). El contenido lo dibuja
             renderNavMenu() a partir de CONFIG.VISTAS_RAPIDAS, y se arma con
             las mismas secciones que el menú lateral para el rol de turno. -->
        <nav id="barra-inferior" class="barra-inferior" aria-label="Accesos rápidos"></nav>
      </div>
      <div id="toast-container" role="status" aria-live="polite" aria-atomic="false" class="fixed bottom-5 right-5 z-[9999] flex flex-col gap-3 pointer-events-none"></div>
    `;

    document.getElementById('logout-btn').addEventListener('click', () => auth.logout());
      this._initDarkMode();
    document.getElementById('perfil-btn').addEventListener('click', () => this.switchView('profile'));

    const bellBtn = document.getElementById('notificaciones-btn');
    const notifPanel = document.getElementById('notificaciones-panel');
    if (bellBtn && notifPanel) {
      const toggleNotifs = () => {
        const isHidden = notifPanel.classList.contains('opacity-0');
        if (isHidden) {
          notifPanel.classList.remove('opacity-0', 'invisible', 'scale-95');
          notifPanel.classList.add('opacity-100', 'scale-100');
        } else {
          notifPanel.classList.add('opacity-0', 'invisible', 'scale-95');
          notifPanel.classList.remove('opacity-100', 'scale-100');
        }
      };
      bellBtn.addEventListener('click', toggleNotifs);
      document.getElementById('notificaciones-close').addEventListener('click', toggleNotifs);
      
      if (this._notifOutsideClickHandler) {
        document.removeEventListener('click', this._notifOutsideClickHandler);
      }
      this._notifOutsideClickHandler = (e) => {
        if (!notifPanel.classList.contains('opacity-0') && !bellBtn.contains(e.target) && !notifPanel.contains(e.target)) {
          toggleNotifs();
        }
      };
      document.addEventListener('click', this._notifOutsideClickHandler);
    }

    // ---------------------------------------------------------------------
    // Menú lateral: cajón en tablet y teléfono (ver css/styles.css)
    // ---------------------------------------------------------------------
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebar-overlay');

    document.getElementById('sidebar-toggle-btn').addEventListener('click', () => {
      sidebar.classList.toggle('active');
      overlay.classList.toggle('hidden');
      this._sincronizarMenuAbierto();
    });
    overlay.addEventListener('click', () => this._cerrarMenuLateral());
    document.getElementById('sidebar-cerrar')?.addEventListener('click', () => this._cerrarMenuLateral());

    // Escape cierra el cajón. Es la misma tecla que cierra los modales: en un
    // teclado de tablet con funda no hay otra forma de salir sin tocar la
    // pantalla, y en un lector de pantalla es el gesto que la gente espera.
    this._escapeMenuLateral = (e) => {
      if (e.key === 'Escape' && sidebar.classList.contains('active')) this._cerrarMenuLateral();
    };
    document.addEventListener('keydown', this._escapeMenuLateral);

    // Al pasar a pantalla ancha (girar la tablet, agrandar la ventana) el menú
    // vuelve a su lugar fijo: si quedara "active" sin el fondo oscuro, el
    // cajón seguiría tapando la mitad de la pantalla.
    //
    // matchMedia se comprueba antes de usarla: no existe en navegadores muy
    // antiguos ni en el DOM simulado de las pruebas, y ahí la aplicación debe
    // seguir arrancando igual — solo se pierde el reacomodo automático.
    if (this._consultaAnchoMenu?.removeEventListener) {
      this._consultaAnchoMenu.removeEventListener('change', this._alCambiarAnchoMenu);
    }
    this._consultaAnchoMenu = typeof window.matchMedia === 'function' ? window.matchMedia('(min-width: 1024px)') : null;
    this._alCambiarAnchoMenu = (e) => { if (e.matches) this._cerrarMenuLateral(); };
    if (this._consultaAnchoMenu?.addEventListener) {
      this._consultaAnchoMenu.addEventListener('change', this._alCambiarAnchoMenu);
    } else if (this._consultaAnchoMenu?.addListener) {
      this._consultaAnchoMenu.addListener(this._alCambiarAnchoMenu); // Safari ≤ 13
    }

    // El color de la barra del navegador debe seguir al tema elegido, no solo
    // al del sistema operativo (ver index.html y _aplicarTema).
    this._sincronizarColorDeBarra();

    // El registro de errores necesita saber en qué vista está la persona, para
    // que el informe diga "Mesón" y no una URL.
    registroErrores.iniciar(() => this.currentView);
    this._vigilarPortadas();

    // Indicador de conexión (Fase 1.4): se des-suscribe primero por si
    // renderShell se está corriendo de nuevo (cerrar sesión y volver a
    // entrar sin recargar la página) — si no, cada vuelta dejaría un
    // escuchador de más, todos escribiendo sobre el mismo elemento actual.
    this._detenerEstadoConexion?.();
    this._detenerEstadoConexion = estadoConexion.suscribir(estado => this._renderIndicadorConexion(estado));

    await this.cargarParametros();
    if (!this._controlInactividadActivo) this.iniciarControlDeInactividad();
    await this.updateUserInfo(user);
    this.renderNavMenu();

    await this.switchView(this._vistaInicial(this.currentUserRole));
  }
};
