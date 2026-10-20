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
        // En móvil, cerramos el menú lateral tras elegir una vista
        document.getElementById('sidebar')?.classList.remove('active');
        document.getElementById('sidebar-overlay')?.classList.add('hidden');
        document.body.classList.remove('mobile-drawer-open');
        });
      });

      this._renderMobileBottomNav();
      this._actualizarBadgeAtrasados();
    },

  // Construye la navegación inferior distinta para teléfonos: 4-5 accesos
  // primarios siempre al alcance del pulgar, sin abrir el drawer.
  _renderMobileBottomNav() {
    const nav = document.getElementById('mobile-bottom-nav');
    if (!nav) return;
    const views = CONFIG.VIEWS_BY_ROLE[this.currentUserRole] || CONFIG.VIEWS_BY_ROLE.librero;

    // Prioridad móvil: mostramos hasta 5 vistas primarias + botón menú
    // Orden de prioridad: scanner/mostrador, catalog, bibliomovil, loans, dashboard
    const ordenPrioridad = ['scanner', 'bibliomovil', 'catalog', 'loans', 'dashboard', 'users', 'reports', 'admin', 'profile'];
    const vistasOrdenadas = [...views].sort((a, b) => {
      const ia = ordenPrioridad.indexOf(a.id);
      const ib = ordenPrioridad.indexOf(b.id);
      return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
    });

    // En teléfono mostramos 4 primarias + Más (que abre el drawer)
    const primarias = vistasOrdenadas.slice(0, 4);
    const tieneMas = views.length > 4;

    const iconMobile = (id) => {
      const map = {
        dashboard: 'fa-chart-pie',
        catalog: 'fa-book',
        scanner: 'fa-barcode',
        bibliomovil: 'fa-truck',
        loans: 'fa-right-left',
        users: 'fa-users',
        reports: 'fa-file-lines',
        admin: 'fa-screwdriver-wrench',
        profile: 'fa-id-card'
      };
      return map[id] || 'fa-circle';
    };

    const shortLabel = (label) => {
      const s = {
        'Dashboard': 'Inicio',
        'Catálogo': 'Libros',
        'Mesón': 'Mesón',
        'Bibliomóvil': 'Ruta',
        'Préstamos': 'Prést.',
        'Lectores': 'Lectores',
        'Reportes': 'Reportes',
        'Administración': 'Admin',
        'Mi perfil': 'Perfil'
      };
      return s[label] || label.split(' ')[0].slice(0, 6);
    };

    nav.innerHTML = `
      ${primarias.map(v => `
        <button type="button" data-mobile-view="${v.id}" class="mobile-nav-btn" aria-label="${escapeHtml(v.label)}">
          <i aria-hidden="true" class="fas ${iconMobile(v.id)}"></i>
          <span>${escapeHtml(shortLabel(v.label))}</span>
        </button>
      `).join('')}
      ${tieneMas ? `
        <button type="button" id="mobile-menu-btn" class="mobile-nav-btn" aria-label="Más opciones" aria-expanded="false">
          <i aria-hidden="true" class="fas fa-bars"></i>
          <span>Más</span>
        </button>
      ` : ''}
    `;

    nav.querySelectorAll('[data-mobile-view]').forEach(btn => {
      btn.addEventListener('click', () => this.switchView(btn.dataset.mobileView));
    });
    document.getElementById('mobile-menu-btn')?.addEventListener('click', () => {
      const sidebar = document.getElementById('sidebar');
      const overlay = document.getElementById('sidebar-overlay');
      const menuBtn = document.getElementById('mobile-menu-btn');
      const isOpen = sidebar?.classList.contains('active');
      if (isOpen) {
        sidebar?.classList.remove('active');
        overlay?.classList.add('hidden');
        document.body.classList.remove('mobile-drawer-open');
        menuBtn?.setAttribute('aria-expanded', 'false');
      } else {
        sidebar?.classList.add('active');
        overlay?.classList.remove('hidden');
        document.body.classList.add('mobile-drawer-open');
        menuBtn?.setAttribute('aria-expanded', 'true');
      }
    });

    // Marcar activo según vista actual
    this._setActiveNavButton(this.currentView);
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
    // Sincronizar bottom nav móvil
    document.querySelectorAll('#mobile-bottom-nav .mobile-nav-btn[data-mobile-view]').forEach(btn => {
      const active = btn.dataset.mobileView === viewName;
      btn.classList.toggle('is-active', active);
      if (active) btn.setAttribute('aria-current', 'page');
      else btn.removeAttribute('aria-current');
    });
    // Título del header móvil
    const mobileTitle = document.getElementById('mobile-page-title');
    if (mobileTitle) {
      const views = CONFIG.VIEWS_BY_ROLE[this.currentUserRole] || CONFIG.VIEWS_BY_ROLE.librero;
      const viewDef = views.find(v => v.id === viewName);
      mobileTitle.textContent = viewDef?.label || 'BiblioNexo';
    }
    // Gestión del FAB de Mesón en móvil
    const fab = document.getElementById('mobile-fab-meson');
    if (fab) {
      // Visible solo en vistas de circulación/campo
      const showFab = viewName === 'scanner' || viewName === 'bibliomovil';
      fab.classList.toggle('is-visible', showFab);
      fab.classList.toggle('hidden', !showFab);
    }
  },

  _skeletonLoader(viewName) {
      if (viewName === 'catalog' || viewName === 'users' || viewName === 'loans') {
        return `
          <div class="flex flex-col gap-4 p-4 skeleton-shimmer animate-pulse">
            ${Array(4).fill(0).map(() => `
              <div class="bg-white dark:bg-stone-800 rounded-2xl p-5 flex flex-col sm:flex-row gap-4 sm:items-center border border-stone-200 dark:border-stone-700 shadow-sm">
                <div class="flex items-start gap-4 flex-1">
                  <div class="w-16 h-24 bg-stone-200 rounded-lg shrink-0"></div>
                  <div class="flex flex-col justify-center gap-2 flex-1 py-1">
                    <div class="h-5 bg-stone-200 rounded-md w-3/4"></div>
                    <div class="h-4 bg-stone-100 dark:bg-stone-700 rounded-md w-1/2"></div>
                    <div class="flex gap-2 mt-2">
                      <div class="h-5 bg-stone-100 dark:bg-stone-700 rounded-md w-16"></div>
                      <div class="h-5 bg-stone-100 dark:bg-stone-700 rounded-md w-20"></div>
                    </div>
                  </div>
                </div>
                <div class="flex flex-col items-end gap-2 shrink-0 sm:w-32 hidden sm:flex">
                   <div class="h-4 bg-stone-100 dark:bg-stone-700 rounded-md w-16"></div>
                   <div class="h-8 bg-stone-200 rounded-xl w-24"></div>
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
               <div class="h-6 bg-stone-200 rounded-md w-1/3"></div>
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
      return `<div class="flex justify-center py-20 animate-pulse"><i aria-hidden="true" class="fas fa-circle-notch fa-spin text-4xl text-patrimonio-lago"></i></div>`;
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
      bibliomovil: () => this.renderBibliomovil(),
      users: () => this.renderUsers(),
      loans: () => this.renderLoans(),
      scanner: () => this.renderScannerView(),
      admin: () => this.renderAdmin(),
      profile: () => this.renderProfile()
    };
    
    try {
        await (renderers[viewName] || renderers.dashboard)();
        // Al cambiar de vista en móvil, volver arriba (como app nativa)
        this._container()?.scrollTo?.({ top: 0, behavior: 'smooth' });
        // También hacer scroll del contenedor principal si es el que desplaza
        try { window.scrollTo({ top: 0, behavior: 'smooth' }); } catch {}
    } catch (e) {
        if (solicitud !== this._viewRenderVersion || this.currentView !== viewName) return;
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
      <div class="h-screen w-full flex bg-patrimonio-base dark:bg-stone-950 overflow-hidden transition-colors duration-500">

        <!-- Fondo oscuro para cerrar el menú lateral en móvil -->
        <div id="sidebar-overlay" class="hidden fixed inset-0 bg-patrimonio-lago/40 backdrop-blur-sm z-40 transition-opacity"></div>

        <!-- Menú lateral: identidad institucional + navegación agrupada por rol -->
        <a href="#views-container" class="skip-link">Saltar al contenido principal</a>
        <aside id="sidebar" class="momento-${this._momentoDelDia()} hidden md:flex w-72 shrink-0 text-white flex-col z-50 shadow-xl">
          <div class="tab-corner px-5 py-5 border-b border-white/10 flex items-center gap-2">
            <i aria-hidden="true" class="fas fa-book text-patrimonio-madera text-lg"></i>
            <div class="leading-none">
              <span class="font-serif font-semibold text-white text-lg block">
                Biblio<span class="text-patrimonio-madera">Nexo</span>
              </span>
              <span class="text-[9px] text-stone-500 dark:text-stone-400 font-bold uppercase tracking-widest">Futrono · Región de Los Ríos</span>
            </div>
          </div>

          <nav id="nav-menu" class="flex-1 overflow-y-auto px-3 py-5"></nav>

          <div class="border-t border-white/10 p-4 flex items-center gap-3">
            <button class="dark-mode-toggle w-9 h-9 flex items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 transition shrink-0" title="Alternar modo oscuro"><i aria-hidden="true" class="dark-mode-icon fas fa-moon"></i></button>
              <button id="perfil-btn" title="Ver y editar mi perfil"
              class="flex items-center gap-3 min-w-0 flex-1 text-left rounded-lg -m-1 p-1 hover:bg-white/10 transition">
              <span id="current-user-initial" class="w-9 h-9 rounded-full bg-patrimonio-madera flex items-center justify-center font-black text-sm shrink-0 text-white"></span>
              <span class="min-w-0 flex-1 block">
                <span id="current-user-name" class="text-xs font-bold text-white leading-none truncate block"></span>
                <span id="current-user-sub" class="text-[10px] text-stone-400 leading-none truncate block mt-0.5"></span>
                <span id="current-user-badge" class="stamp-onDark mt-1.5"></span>
              </span>
            </button>
            <button id="logout-btn" title="Cerrar sesión"
              class="w-9 h-9 rounded-lg text-stone-300 hover:bg-white/10 hover:text-white flex items-center justify-center transition shrink-0">
              <i aria-hidden="true" class="fas fa-right-from-bracket"></i>
            </button>
          </div>
        </aside>

        <!-- Sidebar móvil: mismo contenido pero como drawer -->
        <aside id="sidebar-mobile-drawer" class="md:hidden fixed inset-y-0 left-0 w-[84%] max-w-[320px] bg-patrimonio-lago text-white flex flex-col z-50 shadow-xl translate-x-[-101%] transition-transform duration-300 ease-out" aria-hidden="true" style="display:none">
        </aside>

        <!-- Columna principal -->
        <div class="flex-1 flex flex-col min-w-0">
          <!-- Header distinto para teléfonos -->
          <header id="mobile-header" class="hidden md:hidden bg-white/95 dark:bg-stone-900/95 border-b border-stone-200 dark:border-stone-800 px-3 py-2.5 flex items-center gap-2.5 sticky top-0 shrink-0">
            <button id="sidebar-toggle-btn-mobile" class="w-11 h-11 rounded-xl flex items-center justify-center bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-200 active:scale-95 transition shrink-0" aria-label="Abrir menú">
              <i aria-hidden="true" class="fas fa-bars text-[18px]"></i>
            </button>
            <div class="flex items-center gap-2 min-w-0">
              <i aria-hidden="true" class="fas fa-book text-patrimonio-madera"></i>
              <div class="leading-none min-w-0">
                <span class="font-serif font-semibold text-stone-900 dark:text-stone-100 text-[15px] block truncate">Biblio<span class="text-patrimonio-madera">Nexo</span></span>
                <span id="mobile-page-title" class="text-[10px] font-bold uppercase tracking-widest text-stone-500 dark:text-stone-400 block truncate">Dashboard</span>
              </div>
            </div>
            <div class="ml-auto flex items-center gap-2 shrink-0">
              <div class="relative">
                <button id="notificaciones-btn-mobile" class="relative w-9 h-9 rounded-xl bg-stone-100 dark:bg-stone-800 flex items-center justify-center text-stone-600 dark:text-stone-300 active:scale-95 transition" title="Notificaciones" aria-label="Notificaciones">
                  <i aria-hidden="true" class="fas fa-bell text-[14px]"></i>
                  <span id="notificaciones-badge-mobile" class="absolute -top-1 -right-1 bg-rose-600 text-white text-[9px] font-bold px-1 py-0.5 rounded-full hidden">0</span>
                </button>
                <div id="notificaciones-panel-mobile" class="absolute right-0 mt-3 w-[92vw] max-w-[360px] bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-700 rounded-2xl shadow-2xl opacity-0 invisible transition-all transform origin-top-right scale-95 z-50">
                  <div class="p-4 border-b border-stone-100 dark:border-stone-800 flex justify-between items-center bg-stone-50/50 dark:bg-stone-800/20 rounded-t-2xl">
                    <h3 class="font-bold text-stone-800 dark:text-stone-200">Notificaciones</h3>
                    <button id="notificaciones-close-mobile" class="w-8 h-8 rounded-lg flex items-center justify-center text-stone-500 hover:text-stone-700 dark:hover:text-stone-200"><i aria-hidden="true" class="fas fa-times"></i></button>
                  </div>
                  <div id="notificaciones-lista-mobile" class="max-h-80 overflow-y-auto divide-y divide-stone-100 dark:divide-stone-800/50"></div>
                </div>
              </div>
              <span id="estado-conexion-mobile" class="shrink-0 hidden sm:inline-flex"></span>
              <button class="dark-mode-toggle w-9 h-9 flex items-center justify-center rounded-xl bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-200 shrink-0" title="Alternar modo oscuro" aria-label="Alternar modo oscuro"><i aria-hidden="true" class="dark-mode-icon fas fa-moon"></i></button>
            </div>
          </header>

          <!-- Franja de título escritorio -->
          <div class="franja-titulo hidden md:flex bg-white/90 dark:bg-stone-800/95 backdrop-blur-md border-b border-stone-200 dark:border-stone-700/50 px-4 md:px-6 py-3.5 shadow-sm items-center gap-3 shrink-0">
            <span class="w-1.5 h-8 bg-patrimonio-madera rounded-sm hidden sm:block"></span>
            <div class="min-w-0">
              <p id="page-kicker" class="text-[10px] font-black uppercase tracking-widest text-stone-500 dark:text-stone-400 leading-none mb-0.5">Panel</p>
              <h2 id="page-title" class="font-serif font-semibold text-stone-800 dark:text-stone-200 text-base leading-tight">Dashboard</h2>
            </div>
            <div class="ml-auto flex items-center gap-4 relative">
              <div class="relative">
                <button id="notificaciones-btn" class="relative text-stone-500 hover:text-stone-800 dark:text-stone-400 dark:hover:text-stone-200 transition-colors" title="Centro de notificaciones">
                  <i aria-hidden="true" class="fas fa-bell text-[1.1rem]"></i>
                  <span id="notificaciones-badge" class="absolute -top-1.5 -right-1.5 bg-rose-600 shadow text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full hidden">0</span>
                </button>
                <div id="notificaciones-panel" class="absolute right-0 mt-3 w-80 bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-700 rounded-2xl shadow-2xl opacity-0 invisible transition-all transform origin-top-right scale-95 z-50">
                  <div class="p-4 border-b border-stone-100 dark:border-stone-800 flex justify-between items-center bg-stone-50/50 dark:bg-stone-800/20 rounded-t-2xl">
                    <h3 class="font-bold text-stone-800 dark:text-stone-200">Notificaciones</h3>
                    <button id="notificaciones-close" class="text-stone-500 hover:text-stone-700 dark:hover:text-stone-200"><i aria-hidden="true" class="fas fa-times"></i></button>
                  </div>
                  <div id="notificaciones-lista" class="max-h-80 overflow-y-auto divide-y divide-stone-100 dark:divide-stone-800/50"></div>
                </div>
              </div>
              <span id="estado-conexion" class="shrink-0"></span>
            </div>
          </div>

          <main id="views-container" tabindex="-1" aria-label="Contenido principal" class="view-canvas flex-1 overflow-y-auto p-3 md:p-7"></main>

          <!-- Navegación inferior distinta para teléfonos -->
          <nav id="mobile-bottom-nav" class="md:hidden" aria-label="Navegación principal móvil"></nav>

          <!-- FAB para Mesón en móvil -->
          <button id="mobile-fab-meson" class="mobile-fab-meson hidden" aria-label="Acción rápida de Mesón" title="Mesón">
            <i aria-hidden="true" class="fas fa-barcode"></i>
          </button>
        </div>
      </div>
      <div id="toast-container" role="status" aria-live="polite" aria-atomic="false" class="fixed bottom-5 right-5 z-[9999] flex flex-col gap-3 pointer-events-none"></div>
    `;

    // Clonar el drawer móvil desde el sidebar de escritorio para no duplicar HTML
    // El aside #sidebar es hidden md:flex, en móvil necesitamos un drawer visible.
    // Creamos uno nuevo copiando el contenido interno.
    const desktopSidebar = document.getElementById('sidebar');
    const mobileDrawer = document.getElementById('sidebar-mobile-drawer');
    let activeSidebar = desktopSidebar;

    // En móvil, el sidebar real es el drawer; en escritorio es el lateral
    // Para simplificar, en móvil convertimos #sidebar en drawer visible
    if (desktopSidebar) {
      // En móvil, hacerlo visible como drawer
      const mq = (typeof window.matchMedia === 'function')
        ? window.matchMedia('(max-width: 768px)')
        : { matches: false, addEventListener() {}, addListener() {} };
      const applySidebarMode = () => {
        if (mq.matches) {
          desktopSidebar.classList.remove('hidden');
          desktopSidebar.style.display = 'flex';
          activeSidebar = desktopSidebar;
          if (mobileDrawer) mobileDrawer.style.display = 'none';
        } else {
          desktopSidebar.classList.remove('active');
          desktopSidebar.classList.add('hidden', 'md:flex');
          desktopSidebar.style.display = '';
          document.body.classList.remove('mobile-drawer-open');
          document.getElementById('sidebar-overlay')?.classList.add('hidden');
          activeSidebar = desktopSidebar;
        }
      };
      applySidebarMode();
      mq.addEventListener('change', applySidebarMode);
      // Guardar referencia para toggle
      this._applySidebarMode = applySidebarMode;
    }

    document.getElementById('logout-btn').addEventListener('click', () => auth.logout());
      this._initDarkMode();
    document.getElementById('perfil-btn').addEventListener('click', () => {
      this.switchView('profile');
      document.getElementById('sidebar')?.classList.remove('active');
      document.getElementById('sidebar-overlay')?.classList.add('hidden');
      document.body.classList.remove('mobile-drawer-open');
    });

    // Notificaciones desktop
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
      document.getElementById('notificaciones-close')?.addEventListener('click', toggleNotifs);
      
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

    // Notificaciones móvil (duplicadas pero sincronizadas)
    const bellBtnM = document.getElementById('notificaciones-btn-mobile');
    const notifPanelM = document.getElementById('notificaciones-panel-mobile');
    if (bellBtnM && notifPanelM) {
      const toggleNotifsM = () => {
        const isHidden = notifPanelM.classList.contains('opacity-0');
        if (isHidden) {
          notifPanelM.classList.remove('opacity-0', 'invisible', 'scale-95');
          notifPanelM.classList.add('opacity-100', 'scale-100');
        } else {
          notifPanelM.classList.add('opacity-0', 'invisible', 'scale-95');
          notifPanelM.classList.remove('opacity-100', 'scale-100');
        }
      };
      bellBtnM.addEventListener('click', (e) => { e.stopPropagation(); toggleNotifsM(); });
      document.getElementById('notificaciones-close-mobile')?.addEventListener('click', toggleNotifsM);
      // Cerrar al tocar fuera. Igual que la versión de escritorio: el
      // manejador se guarda y se retira antes de volver a ponerlo — esta
      // versión agregaba uno nuevo (anónimo, imposible de retirar) en cada
      // renderShell(), así que se iban apilando escuchadores sobre
      // `document` apuntando a paneles ya reemplazados.
      if (this._notifMobileOutsideClickHandler) {
        document.removeEventListener('click', this._notifMobileOutsideClickHandler);
      }
      this._notifMobileOutsideClickHandler = (e) => {
        if (!notifPanelM.classList.contains('opacity-0') && !bellBtnM.contains(e.target) && !notifPanelM.contains(e.target)) {
          notifPanelM.classList.add('opacity-0', 'invisible', 'scale-95');
          notifPanelM.classList.remove('opacity-100', 'scale-100');
        }
      };
      document.addEventListener('click', this._notifMobileOutsideClickHandler);
    }

    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebar-overlay');
    const toggleMobile = document.getElementById('sidebar-toggle-btn-mobile');
    const openDrawer = () => {
      sidebar.classList.add('active');
      overlay.classList.remove('hidden');
      document.body.classList.add('mobile-drawer-open');
    };
    const closeDrawer = () => {
      sidebar.classList.remove('active');
      overlay.classList.add('hidden');
      document.body.classList.remove('mobile-drawer-open');
      document.getElementById('mobile-menu-btn')?.setAttribute('aria-expanded', 'false');
    };
    toggleMobile?.addEventListener('click', () => {
      if (sidebar.classList.contains('active')) closeDrawer();
      else openDrawer();
    });
    overlay.addEventListener('click', closeDrawer);

    // Mantener compatibilidad con el id legacy que usan algunas pruebas
    const legacyToggle = document.getElementById('sidebar-toggle-btn');
    legacyToggle?.addEventListener('click', () => {
      if (sidebar.classList.contains('active')) closeDrawer();
      else openDrawer();
    });

    // FAB móvil -> ir a Mesón
    document.getElementById('mobile-fab-meson')?.addEventListener('click', () => this.switchView('scanner'));

    registroErrores.iniciar(() => this.currentView);
    this._vigilarPortadas();

    this._detenerEstadoConexion?.();
    this._detenerEstadoConexion = estadoConexion.suscribir(estado => this._renderIndicadorConexion(estado));

    await this.cargarParametros();
    if (!this._controlInactividadActivo) this.iniciarControlDeInactividad();
    await this.updateUserInfo(user);
    this.renderNavMenu();

    await this.switchView(this._vistaInicial(this.currentUserRole));
  }
};
