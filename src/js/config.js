export const CONFIG = {
  // Se leen desde las variables de entorno inyectadas por Vite (.env local o Vercel).
  // Se mantiene el valor original como fallback final para no romper la app en producción
  // si aún no se han configurado las variables en el panel de Vercel.
  SUPABASE_URL: import.meta.env?.VITE_SUPABASE_URL || 'https://vcngmgzxjoorjhcgqzpk.supabase.co',
  SUPABASE_ANON_KEY: import.meta.env?.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZjbmdtZ3p4am9vcmpoY2dxenBrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ1Mjk5MTcsImV4cCI6MjEwMDEwNTkxN30.FXiGK15kyT82jrKNIb4nodWWtW6I-s_YMV9rGZYfAxY',

  ADMIN_EMAILS: [],

  // Máximo de préstamos activos simultáneos por lector. El chequeo real y
  // definitivo vive en la función RPC prestar_libro (Postgres), este valor
  // es solo para mostrar el mismo número en la interfaz.
  MAX_PRESTAMOS_POR_LECTOR: 3,

  // Un préstamo se marca "por vencer" cuando le quedan estos días o menos.
  DIAS_AVISO_PREVIO: 3,

  // Máximo de renovaciones por préstamo. El chequeo real vive en la función
  // RPC renovar_prestamo (Postgres); este valor solo se usa en pantalla.
  MAX_RENOVACIONES: 2,

  // Filas por página en catálogo y lectores.
  FILAS_POR_PAGINA: 25,

  // Datos que se incluyen al final de los avisos enviados a los lectores.
  BIBLIOTECA: {
    nombre: 'Biblioteca Pública Municipal de Futrono',
    nombreLargo: 'Biblioteca Pública Municipal N° 332 “Escritor Ramón Quichiyao Figueroa”',
    // Ajusta estos datos con los reales de la biblioteca antes de usarlo en producción
    direccion: 'Balmaceda 99, Futrono',
    telefono: '+56 63 248 1000'
  },

  // Cada vista pertenece a una "section" para agrupar el menú lateral
  // por rol: Panel (resumen), Gestión (administración de datos) y
  // Operación (trabajo diario de mesón/escáner).
  VIEWS_BY_ROLE: {
    admin: [
      { id: 'dashboard', label: 'Dashboard', icon: 'fa-chart-pie', section: 'Panel' },
      { id: 'reports', label: 'Reportes', icon: 'fa-file-lines', section: 'Panel' },
      { id: 'catalog', label: 'Catálogo', icon: 'fa-book', section: 'Gestión' },
      { id: 'users', label: 'Lectores', icon: 'fa-users', section: 'Gestión' },
      { id: 'loans', label: 'Préstamos', icon: 'fa-right-left', section: 'Gestión' },
      { id: 'scanner', label: 'Mesón', icon: 'fa-barcode', section: 'Operación' },
      { id: 'bibliomovil', label: 'Bibliomóvil', icon: 'fa-truck', section: 'Operación' },
      { id: 'admin', label: 'Administración', icon: 'fa-screwdriver-wrench', section: 'Sistema' },
      { id: 'profile', label: 'Mi perfil', icon: 'fa-id-card', section: 'Sistema' }
    ],

    // El librero SÍ ve Lectores. Sin esa vista no podía registrar a nadie fuera
    // del mesón, ni completar un teléfono faltante — y el propio sistema le
    // pedía hacerlo cuando intentaba enviar un aviso. Lo que no puede es
    // eliminar lectores ni cambiar un RUT; eso sigue siendo de administración.
    librero: [
      { id: 'dashboard', label: 'Dashboard', icon: 'fa-chart-pie', section: 'Panel' },
      { id: 'reports', label: 'Reportes', icon: 'fa-file-lines', section: 'Panel' },
      { id: 'scanner', label: 'Mesón', icon: 'fa-barcode', section: 'Operación' },
      { id: 'catalog', label: 'Catálogo', icon: 'fa-book', section: 'Operación' },
      { id: 'bibliomovil', label: 'Bibliomóvil', icon: 'fa-truck', section: 'Operación' },
      { id: 'loans', label: 'Préstamos', icon: 'fa-right-left', section: 'Operación' },
      { id: 'users', label: 'Lectores', icon: 'fa-users', section: 'Operación' },
      { id: 'profile', label: 'Mi perfil', icon: 'fa-id-card', section: 'Sistema' }
    ]
  },

  // Textos de bienvenida y accesos rápidos que cambian según el rol,
  // usados en el Dashboard para que no se sienta genérico.
  ROLE_LABELS: {
    admin: { title: 'Administrador', welcome: 'Panel de control general de la biblioteca.' },
    librero: { title: 'Librero', welcome: 'Resumen de tu turno y trabajo diario.' }
  }
};

export default CONFIG;
