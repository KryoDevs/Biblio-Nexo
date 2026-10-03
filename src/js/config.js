export const CONFIG = {
  // Se leen desde las variables de entorno inyectadas por Vite (.env local o Vercel).
  // Se mantiene el valor original como fallback final para no romper la app en producciÃ³n
  // si aÃºn no se han configurado las variables en el panel de Vercel.
  SUPABASE_URL: import.meta.env?.VITE_SUPABASE_URL || 'https://vcngmgzxjoorjhcgqzpk.supabase.co',
  SUPABASE_ANON_KEY: import.meta.env?.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZjbmdtZ3p4am9vcmpoY2dxenBrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ1Mjk5MTcsImV4cCI6MjEwMDEwNTkxN30.FXiGK15kyT82jrKNIb4nodWWtW6I-s_YMV9rGZYfAxY',

  ADMIN_EMAILS: [],

  // MÃ¡ximo de prÃ©stamos activos simultÃ¡neos por lector. El chequeo real y
  // definitivo vive en la funciÃ³n RPC prestar_libro (Postgres), este valor
  // es solo para mostrar el mismo nÃºmero en la interfaz.
  MAX_PRESTAMOS_POR_LECTOR: 3,

  // Un prÃ©stamo se marca "por vencer" cuando le quedan estos dÃ­as o menos.
  DIAS_AVISO_PREVIO: 3,

  // MÃ¡ximo de renovaciones por prÃ©stamo. El chequeo real vive en la funciÃ³n
  // RPC renovar_prestamo (Postgres); este valor solo se usa en pantalla.
  MAX_RENOVACIONES: 2,

  // Filas por pÃ¡gina en catÃ¡logo y lectores.
  FILAS_POR_PAGINA: 25,

  // Datos que se incluyen al final de los avisos enviados a los lectores.
  BIBLIOTECA: {
    nombre: 'Biblioteca PÃºblica Municipal de Futrono',
    nombreLargo: 'Biblioteca PÃºblica Municipal NÂ° 332 â€œEscritor RamÃ³n Quichiyao Figueroaâ€',
    // Ajusta estos datos con los reales de la biblioteca antes de usarlo en producciÃ³n
    direccion: 'Balmaceda 99, Futrono',
    telefono: '+56 63 248 1000'
  },

  // Cada vista pertenece a una "section" para agrupar el menÃº lateral
  // por rol: Panel (resumen), GestiÃ³n (administraciÃ³n de datos) y
  // OperaciÃ³n (trabajo diario de mesÃ³n/escÃ¡ner).
  VIEWS_BY_ROLE: {
    admin: [
      { id: 'dashboard', label: 'Dashboard', icon: 'fa-chart-pie', section: 'Panel' },
      { id: 'reports', label: 'Reportes', icon: 'fa-file-lines', section: 'Panel' },
      { id: 'catalog', label: 'CatÃ¡logo', icon: 'fa-book', section: 'GestiÃ³n' },
      { id: 'users', label: 'Lectores', icon: 'fa-users', section: 'GestiÃ³n' },
      { id: 'loans', label: 'PrÃ©stamos', icon: 'fa-right-left', section: 'GestiÃ³n' },
      { id: 'scanner', label: 'MesÃ³n', icon: 'fa-barcode', section: 'OperaciÃ³n' },
      { id: 'bibliomovil', label: 'BibliomÃ³vil', icon: 'fa-truck', section: 'OperaciÃ³n' },
      { id: 'admin', label: 'AdministraciÃ³n', icon: 'fa-screwdriver-wrench', section: 'Sistema' },
      { id: 'profile', label: 'Mi perfil', icon: 'fa-id-card', section: 'Sistema' }
    ],

    // El librero SÃ ve Lectores. Sin esa vista no podÃ­a registrar a nadie fuera
    // del mesÃ³n, ni completar un telÃ©fono faltante â€” y el propio sistema le
    // pedÃ­a hacerlo cuando intentaba enviar un aviso. Lo que no puede es
    // eliminar lectores ni cambiar un RUT; eso sigue siendo de administraciÃ³n.
    bibliomovil: [
      { id: 'dashboard', label: 'Dashboard', icon: 'fa-chart-pie', section: 'Panel' },
      { id: 'bibliomovil', label: 'Bibliomóvil', icon: 'fa-truck', section: 'Operación' },
      { id: 'scanner', label: 'Mesón', icon: 'fa-barcode', section: 'Operación' },
      { id: 'catalog', label: 'Catálogo', icon: 'fa-book', section: 'Operación' },
      { id: 'users', label: 'Lectores', icon: 'fa-users', section: 'Operación' },
      { id: 'loans', label: 'Préstamos', icon: 'fa-right-left', section: 'Operación' },
      { id: 'profile', label: 'Mi perfil', icon: 'fa-id-card', section: 'Sistema' }
    ],

    librero: [
      { id: 'dashboard', label: 'Dashboard', icon: 'fa-chart-pie', section: 'Panel' },
      { id: 'reports', label: 'Reportes', icon: 'fa-file-lines', section: 'Panel' },
      { id: 'scanner', label: 'MesÃ³n', icon: 'fa-barcode', section: 'OperaciÃ³n' },
      { id: 'catalog', label: 'CatÃ¡logo', icon: 'fa-book', section: 'OperaciÃ³n' },
      { id: 'bibliomovil', label: 'BibliomÃ³vil', icon: 'fa-truck', section: 'OperaciÃ³n' },
      { id: 'loans', label: 'PrÃ©stamos', icon: 'fa-right-left', section: 'OperaciÃ³n' },
      { id: 'users', label: 'Lectores', icon: 'fa-users', section: 'OperaciÃ³n' },
      { id: 'profile', label: 'Mi perfil', icon: 'fa-id-card', section: 'Sistema' }
    ]
  },

  // Textos de bienvenida y accesos rÃ¡pidos que cambian segÃºn el rol,
  // usados en el Dashboard para que no se sienta genÃ©rico.
  ROLE_LABELS: {
    admin: { title: 'Administrador', welcome: 'Panel de control general de la biblioteca.' },
    librero: { title: 'Librero', welcome: 'Resumen de tu turno y trabajo diario.' },
    bibliomovil: { title: 'Bibliomóvil', welcome: 'Panel de gestión para la ruta del Bibliomóvil.' }
  }
};

export default CONFIG;

