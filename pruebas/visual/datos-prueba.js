/**
 * Datos ficticios para revisar la UI real, sin sesión ni peticiones a Supabase.
 * Playwright sustituye /vendor/js/supabase.js SOLO dentro de su navegador.
 * Este archivo no se importa desde la aplicación ni se incluye en dist/.
 */
export function instalarDatosPrueba({ rol = 'admin', sesion = true, vacio = false, agotados = false } = {}) {
  const perfil = {
    usuario_id: '11111111-1111-4111-8111-111111111111',
    email: 'personal.pruebas@biblionexo.test',
    nombre: 'María Antileo Huenchumán',
    cargo: 'Encargada de circulación y biblioteca municipal',
    telefono: '56912345678',
    rol,
    creado_en: '2026-01-01T12:00:00Z',
    ultimo_acceso: '2026-10-18T12:00:00Z'
  };
  const usuario = { id: perfil.usuario_id, email: perfil.email };
  const libros = [
    { id: 1, titulo: 'Subterra', autor: 'Baldomero Lillo', isbn: '9789561117442', genero: 'Cuento', ubicacion: 'Sala 1', stock: 3, copias_totales: 4, es_bibliomovil: false },
    { id: 2, titulo: 'Historia de las bibliotecas y comunidades de la Región de Los Ríos', autor: 'Autor de prueba', isbn: null, genero: 'Historia local', ubicacion: 'Patrimonio', stock: 1, copias_totales: 2, es_bibliomovil: false },
    { id: 3, titulo: 'Cuentos del Lago Ranco', autor: 'Autor de prueba', isbn: null, genero: 'Cuento', ubicacion: 'Ruta', stock: 2, copias_totales: 2, es_bibliomovil: true },
    { id: 4, titulo: 'La Odisea', autor: 'Homero', isbn: null, genero: 'Clásicos', ubicacion: 'Sala 2', stock: 1, copias_totales: 1, es_bibliomovil: false }
  ];
  const lectores = [
    { id: 1, nombre: 'Lector de Prueba Uno', rut: '11111111-1', email: 'lector.uno@biblionexo.test', telefono: '56911111111', created_at: '2026-10-01T12:00:00Z' },
    { id: 2, nombre: 'Lector de Prueba con Nombre y Apellidos Extensos', rut: '22222222-2', email: 'lector.con.correo.extenso@biblionexo.test', telefono: '56922222222', created_at: '2026-10-01T12:00:00Z' }
  ];
  const prestamos = lectores.map((lector, i) => ({
    id: i + 1, lector_id: lector.id, libro_id: libros[i].id,
    lectores: lector, libros: libros[i], estado: 'activo', renovaciones: 0,
    fecha_prestamo: '2026-10-01', fecha_devolucion_esperada: i ? '2099-12-31' : '2026-10-05',
    fecha_devolucion_real: null, parada_nombre: null
  }));
  if (agotados) libros[3].stock = 0;
  if (vacio) { libros.length = 0; lectores.length = 0; prestamos.length = 0; }

  // Barreras controladas por las pruebas: respuestas fuera de orden, sin
  // sleeps ni cambios al cliente que se publica en producción.
  const control = window.__controlPruebasUI = { pausas: new Set(), pendientes: [] };
  const responder = (canal, resultado) => control.pausas.has(canal)
    ? new Promise(resolve => control.pendientes.push({ canal, resolver: () => resolve(resultado) }))
    : Promise.resolve(resultado);

  const tablas = {
    libros, lectores, prestamos,
    parametros: [
      { clave: 'filas_por_pagina', valor: '25' },
      { clave: 'max_prestamos_por_lector', valor: '3' },
      { clave: 'dias_prestamo', valor: '7' }
    ]
  };

  function consulta(tabla) {
    let filas = [...(tablas[tabla] || [])];
    let inicio = 0, fin = Infinity;
    const q = {
      select() { return q; },
      eq(campo, valor) { filas = filas.filter(f => f[campo] === valor); return q; },
      is(campo, valor) { return q.eq(campo, valor); },
      in(campo, valores) { filas = filas.filter(f => valores.includes(f[campo])); return q; },
      gt(campo, valor) { filas = filas.filter(f => f[campo] > valor); return q; },
      gte(campo, valor) { filas = filas.filter(f => f[campo] >= valor); return q; },
      lt(campo, valor) { filas = filas.filter(f => f[campo] != null && f[campo] < valor); return q; },
      lte(campo, valor) { filas = filas.filter(f => f[campo] != null && f[campo] <= valor); return q; },
      or(expresion) {
        const filtros = expresion.split(',').map(f => /^(\w+)\.ilike\.%(.*)%$/.exec(f));
        if (filtros.every(Boolean)) filas = filas.filter(f => filtros.some(([, campo, valor]) => String(f[campo] || '').toLowerCase().includes(valor.toLowerCase())));
        return q;
      },
      order() { return q; },
      range(desde, hasta) { inicio = desde; fin = hasta + 1; return q; },
      limit(limite) { fin = limite; return q; },
      single() { return Promise.resolve({ data: filas[0] || null, error: null }); },
      maybeSingle() { return q.single(); },
      then(resolve, reject) {
        return responder(`tabla:${tabla}`, { data: filas.slice(inicio, fin), count: filas.length, error: null }).then(resolve, reject);
      }
    };
    return q;
  }

  const suscriptores = [];
  // logout() recarga la página: el doble conserva el cierre, igual que Auth.
  const haySesion = () => sesion && sessionStorage.getItem('prueba-sesion-cerrada') !== 'true';
  window.supabase = {
    createClient: () => ({
      from: consulta,
      rpc: async (nombre, args = {}) => {
        if (nombre === 'mi_perfil') return { data: [perfil], error: null };
        if (nombre === 'buscar_libros') {
          const filtrados = libros.filter(l => (args.p_es_bibliomovil == null || l.es_bibliomovil === args.p_es_bibliomovil)
            && (args.p_filtro_stock !== 'disponibles' || l.stock > 0)
            && (args.p_filtro_stock !== 'prestados' || l.stock === 0)
            && (!args.p_busqueda || l.titulo.toLowerCase().includes(args.p_busqueda.toLowerCase())));
          const desde = args.p_desplazamiento || 0;
          return responder('rpc:buscar_libros', { data: filtrados.slice(desde, desde + (args.p_limite || 25)).map(l => ({ ...l, total_coincidencias: filtrados.length })), error: null });
        }
        return { data: [], error: null };
      },
      auth: {
        getSession: async () => ({ data: { session: haySesion() ? { user: usuario } : null }, error: null }),
        getUser: async () => ({ data: { user: haySesion() ? usuario : null }, error: null }),
        onAuthStateChange: callback => {
          suscriptores.push(callback);
          return { data: { subscription: { unsubscribe() {} } } };
        },
        signOut: async () => {
          sessionStorage.setItem('prueba-sesion-cerrada', 'true');
          suscriptores.forEach(callback => callback('SIGNED_OUT', null));
          return { error: null };
        }
      }
    })
  };
}
