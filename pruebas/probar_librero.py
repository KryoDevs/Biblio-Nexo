"""
Prueba funcional contra PostgreSQL real.

Objetivo doble:
  1. Demostrar que el fallo del rol librero existía de verdad (no era una
     sospecha al leer el código).
  2. Demostrar que la migración 008 lo corrige, sin abrir permisos de más.

Se emula el entorno de Supabase: rol `authenticated` y la variable de sesión
`request.jwt.claim.sub`, que es de donde auth.uid() saca el usuario.
"""

import os, pathlib, sys, re, psycopg

RAIZ = pathlib.Path(__file__).resolve().parent.parent

# Dos formas de conectarse, según dónde se ejecute:
#
#   · En integración continua hay un PostgreSQL de servicio y se pasa por
#     DATABASE_URL.
#   · En un equipo local se levanta uno con pgserver, que trae PostgreSQL
#     empaquetado y no requiere instalarlo aparte.
URI = os.environ.get('DATABASE_URL')
if URI:
    print(f'Base de datos: la indicada en DATABASE_URL')
else:
    # pgserver trae PostgreSQL empaquetado, pero solo para Linux y macOS.
    # En Windows hay que indicar DATABASE_URL o ejecutar dentro de WSL.
    try:
        import pgserver
    except ImportError:
        print('No encuentro pgserver ni la variable DATABASE_URL.\n'
              '  · Linux o macOS:  pip install pgserver "psycopg[binary]"\n'
              '  · Windows:        usa WSL, o apunta a un PostgreSQL existente con\n'
              '                    set DATABASE_URL=postgresql://usuario:clave@localhost:5432/basededatos')
        sys.exit(1)
    import atexit, shutil, tempfile
    if os.environ.get('PGDATOS'):
        datos = pathlib.Path(os.environ['PGDATOS'])
        datos.mkdir(parents=True, exist_ok=True)
        limpiar_datos = False
    else:
        datos = pathlib.Path(tempfile.mkdtemp(prefix='biblionexo-pruebas-'))
        limpiar_datos = True
    _srv_local = pgserver.get_server(datos)
    atexit.register(lambda: (_srv_local.cleanup(), shutil.rmtree(datos, ignore_errors=True) if limpiar_datos else None))
    URI = _srv_local.get_uri()
    print(f'Base de datos: PostgreSQL local en {datos}')


def preparar_esquema():
    """Deja la base con el esquema base y las diez migraciones aplicadas."""
    archivos = [RAIZ / 'pruebas' / '00_base_supabase.sql']
    archivos += sorted((RAIZ / 'supabase' / 'migrations').glob('*.sql'))
    for archivo in archivos:
        try:
            with psycopg.connect(URI, autocommit=True) as c, c.cursor() as cur:
                cur.execute(archivo.read_text(encoding='utf-8'))
        except Exception as e:
            print(f'  FALLO al aplicar {archivo.name}: {str(e)[-400:]}')
            sys.exit(1)
    print(f'Esquema preparado: {len(archivos)} archivos aplicados\n')


if os.environ.get('PREPARAR_ESQUEMA', '1') == '1':
    preparar_esquema()

pasadas, fallidas, omitidas = 0, 0, 0

def comprobar(desc, condicion, detalle=''):
    global pasadas, fallidas
    if condicion:
        pasadas += 1
        print(f'  OK    {desc}')
    else:
        fallidas += 1
        print(f'  FALLO {desc}' + (f' — {detalle}' if detalle else ''))

def omitir(desc):
    global omitidas
    omitidas += 1
    print(f'  OMITIDO {desc} — entorno sin America/Santiago (ver pruebas/LEEME.md)')

def sql(texto, como_usuario=None):
    """Ejecuta como superusuario, o con la identidad y permisos de un usuario."""
    try:
        with psycopg.connect(URI, autocommit=True) as c, c.cursor() as cur:
            if como_usuario:
                cur.execute("set role authenticated")
                cur.execute("select set_config('request.jwt.claim.sub', %s, false)", (como_usuario,))
            cur.execute(texto)
            try:
                return True, cur.fetchall()
            except psycopg.ProgrammingError:
                return True, []
    except Exception as e:
        return False, str(e)

def como(usuario, consulta):
    return sql(consulta, como_usuario=usuario)

def valor(consulta):
    """Un solo dato, como superusuario, sin RLS de por medio."""
    ok, r = sql(consulta)
    if not ok:
        return None
    return r[0][0] if r and r[0] else None

def texto(resultado):
    return str(resultado)

# ---------------------------------------------------------------------------
# ¿Este PostgreSQL resuelve la zona horaria America/Santiago?
# ---------------------------------------------------------------------------
# hoy_chile() usa timezone('America/Santiago', now()); la llaman prestar_libro,
# renovar_prestamo, devolver_prestamo, estado_lector y consultar_libro. El
# paquete pgserver para Windows no trae la carpeta share/postgresql/timezone
# (ver pruebas/LEEME.md, "Limitación conocida: timezone"), así que sin ella
# estas cinco funciones fallan aunque el resto del sistema esté sano.
#
# Gatillo único, antes de correr nada más. Si pasa, las cinco funciones
# corren normal más abajo y cualquier fallo suyo es FALLO real — nunca un
# try/except alrededor de las llamadas de negocio. Si falla por esta causa
# puntual, se omiten por nombre los 12 casos que dependen de esto. Si falla
# por cualquier otra causa (conexión caída, esquema a medio aplicar), NO es
# lo mismo que "sin tzdata": la suite se detiene con error en vez de omitir,
# para no confundir un entorno roto con uno incompleto.
ERROR_TIMEZONE = 'time zone "America/Santiago" not recognized'

ok, out = sql("select timezone('America/Santiago', now());")
if ok:
    TIMEZONE_OK = True
elif ERROR_TIMEZONE in texto(out):
    TIMEZONE_OK = False
    print('\n' + '!' * 66)
    print('AVISO: este PostgreSQL no resuelve America/Santiago.')
    print(f'  {texto(out)[-150:]}')
    print('  Entorno incompleto (ver pruebas/LEEME.md). prestar_libro,')
    print('  renovar_prestamo, devolver_prestamo, estado_lector y')
    print('  consultar_libro dependen de esto y se OMITEN: no pasan ni fallan.')
    print('!' * 66)
else:
    print(f'\nFALLO al comprobar el entorno: {texto(out)[-300:]}')
    print('No es la falta de America/Santiago: es otra causa. Deteniendo la suite.')
    sys.exit(1)

# ---------------------------------------------------------------------------
print('\nPreparación: dos cuentas, un libro y un lector')
# ---------------------------------------------------------------------------
ADMIN = '11111111-1111-1111-1111-111111111111'
LIBRERO = '22222222-2222-2222-2222-222222222222'

ok, out = sql(f"""
delete from public.prestamos; delete from public.lectores; delete from public.libros;
delete from public.usuarios; delete from auth.users;

insert into auth.users (id, email) values
  ('{ADMIN}', 'admin@futrono.cl'),
  ('{LIBRERO}', 'librera@futrono.cl');

insert into public.usuarios (id, email, rol) values
  ('{ADMIN}', 'admin@futrono.cl', 'admin'),
  ('{LIBRERO}', 'librera@futrono.cl', 'librero');

insert into public.libros (isbn, titulo, autor, stock, copias_totales)
  values ('9789561234567', 'Cuentos del Lago Ranco', 'Ramón Quichiyao', 3, 3);

insert into public.lectores (rut, nombre, email, telefono)
  values ('12345678-5', 'Maria Antileo', 'maria@correo.cl', '56911112222');
""")
comprobar('datos de prueba cargados', ok, texto(out)[-300:] if not ok else '')
if not ok:
    sys.exit(1)

libro_id = valor("select id from public.libros limit 1;")


# ---------------------------------------------------------------------------
print('\n1. REPRODUCCIÓN DEL FALLO — funciones como estaban antes de la 008')
# ---------------------------------------------------------------------------
# Se reinstalan prestar_libro y devolver_prestamo SIN "security definer",
# que es exactamente como venían en las migraciones 004 y 007.
# Se elimina primero la firma de 5 argumentos introducida en 027/010 para que
# durante las secciones 1-9 (que prueban el estado histórico 007 -> 008 -> 009)
# no convivan las dos firmas a la vez. En la sección 10 se reaplica la 010.
sql("""
drop function if exists public.prestar_libro(bigint, text, text, numeric, numeric);
create or replace function public.prestar_libro(p_libro_id bigint, p_lector_rut text)
returns table (prestamo_id bigint, fecha_devolucion_esperada date)
language plpgsql set search_path = public as $f$
declare v_lector_id bigint; v_stock int; v_prestamo_id bigint;
        v_hoy date := public.hoy_chile(); v_dias int := public.parametro_int('dias_prestamo', 7);
begin
  select id into v_lector_id from public.lectores where rut = p_lector_rut;
  select stock into v_stock from public.libros where id = p_libro_id for update;
  update public.libros set stock = stock - 1 where id = p_libro_id;
  insert into public.prestamos (libro_id, lector_id, fecha_prestamo, fecha_devolucion_esperada, estado)
  values (p_libro_id, v_lector_id, v_hoy, v_hoy + v_dias, 'activo') returning id into v_prestamo_id;
  return query select v_prestamo_id::bigint, (v_hoy + v_dias)::date;
end; $f$;

create or replace function public.devolver_prestamo(p_prestamo_id bigint)
returns void language plpgsql set search_path = public as $f$
declare v_libro_id bigint;
begin
  select libro_id into v_libro_id from public.prestamos where id = p_prestamo_id for update;
  update public.prestamos set estado = 'devuelto', fecha_devolucion_real = public.hoy_chile()
    where id = p_prestamo_id;
  update public.libros set stock = stock + 1 where id = v_libro_id;
end; $f$;
""")

if TIMEZONE_OK:
    ok, out = como(LIBRERO, f"select * from public.prestar_libro({libro_id}, '12345678-5');")
    comprobar('un librero NO podía prestar (error de RLS)',
              not ok and 'row-level security' in texto(out).lower(),
              f'resultado inesperado: {out[-200:]}')
else:
    omitir('un librero NO podía prestar (error de RLS)')

# Se crea un préstamo saltándose RLS, para poder probar la devolución
sql(f"""insert into public.prestamos (libro_id, lector_id, fecha_prestamo, fecha_devolucion_esperada, estado)
        select {libro_id}, id, current_date, current_date + 7, 'activo' from public.lectores limit 1;
        update public.libros set stock = 2 where id = {libro_id};""")
prestamo_id = valor("select id from public.prestamos order by id desc limit 1;")

stock_antes = valor(f"select stock from public.libros where id = {libro_id};")
ok, out = como(LIBRERO, f"select public.devolver_prestamo({prestamo_id});")
estado_despues = valor(f"select estado from public.prestamos where id = {prestamo_id};")
stock_despues = valor(f"select stock from public.libros where id = {libro_id};")

comprobar('la devolución terminaba SIN ERROR (esa era la parte peligrosa)', ok,
          f'devolvió error: {out[-200:]}')
comprobar('...pero el préstamo seguía activo en la base de datos',
          estado_despues == 'activo', f'estado = {estado_despues}')
comprobar('...y el stock no se movía',
          stock_antes == stock_despues, f'{stock_antes} -> {stock_despues}')

print('      → confirmado: el sistema informaba éxito y no guardaba nada.')


# ---------------------------------------------------------------------------
print('\n2. CORRECCIÓN — se reaplica la migración 008')
# ---------------------------------------------------------------------------
m008 = (RAIZ / 'supabase' / 'migrations' / '008_perfiles_y_permisos_librero.sql').read_text(encoding='utf-8')
ok, out = sql(m008)
comprobar('la 008 se puede volver a ejecutar sin errores (es idempotente)', ok, texto(out)[-400:] if not ok else '')

# Estado limpio
sql(f"""delete from public.prestamos;
        update public.libros set stock = 3, copias_totales = 3 where id = {libro_id};""")


# ---------------------------------------------------------------------------
print('\n3. EL LIBRERO YA PUEDE TRABAJAR')
# ---------------------------------------------------------------------------
if TIMEZONE_OK:
    ok, out = como(LIBRERO, f"select * from public.prestar_libro({libro_id}, '12345678-5');")
    comprobar('un librero puede prestar', ok, texto(out)[-250:] if not ok else '')
    stock = valor(f"select stock from public.libros where id = {libro_id};")
    comprobar('el stock bajó de 3 a 2', str(stock) == '2', f'stock = {stock}')

    prestamo_id = valor("select id from public.prestamos order by id desc limit 1;")

    ok, out = como(LIBRERO, f"select * from public.renovar_prestamo({prestamo_id});")
    comprobar('un librero puede renovar', ok, texto(out)[-250:] if not ok else '')
    renov = valor(f"select renovaciones from public.prestamos where id = {prestamo_id};")
    comprobar('la renovación quedó registrada', str(renov) == '1', f'renovaciones = {renov}')

    ok, out = como(LIBRERO, f"select public.devolver_prestamo({prestamo_id});")
    comprobar('un librero puede devolver', ok, texto(out)[-250:] if not ok else '')
    estado = valor(f"select estado from public.prestamos where id = {prestamo_id};")
    comprobar('el préstamo quedó marcado como devuelto', estado == 'devuelto', f'estado = {estado}')
else:
    for desc in ('un librero puede prestar', 'el stock bajó de 3 a 2', 'un librero puede renovar',
                 'la renovación quedó registrada', 'un librero puede devolver',
                 'el préstamo quedó marcado como devuelto'):
        omitir(desc)

stock = valor(f"select stock from public.libros where id = {libro_id};")
comprobar('el stock volvió a 3', str(stock) == '3', f'stock = {stock}')

ok, out = como(LIBRERO, "select public.actualizar_contacto_lector((select id from public.lectores limit 1), 'Maria Antileo Curiqueo', 'maria@correo.cl', '56999998888');")
comprobar('un librero puede corregir el contacto de un lector', ok, texto(out)[-250:] if not ok else '')
tel = valor("select telefono from public.lectores limit 1;")
comprobar('el teléfono nuevo quedó guardado', tel == '56999998888', f'telefono = {tel}')


# ---------------------------------------------------------------------------
print('\n4. LO QUE EL LIBRERO SIGUE SIN PODER HACER')
# ---------------------------------------------------------------------------
ok, out = como(LIBRERO, f"delete from public.libros where id = {libro_id};")
sigue = valor(f"select count(*) from public.libros where id = {libro_id};")
comprobar('no puede eliminar un libro', str(sigue) == '1', 'el libro desapareció')

como(LIBRERO, f"update public.libros set titulo = 'Titulo alterado' where id = {libro_id};")
titulo = valor(f"select titulo from public.libros where id = {libro_id};")
comprobar('no puede editar el título de un libro',
          titulo == 'Cuentos del Lago Ranco', f'quedó: {titulo}')

como(LIBRERO, f"update public.lectores set rut = '99999999-9';")
rut = valor("select rut from public.lectores limit 1;")
comprobar('no puede cambiar el RUT de un lector por la vía directa',
          rut == '12345678-5', f'quedó: {rut}')

ok, out = como(LIBRERO, "select * from public.listar_personal();")
comprobar('no puede listar al personal', not ok and 'administrador' in texto(out).lower(),
          texto(out)[-200:])

ok, out = como(LIBRERO, f"select * from public.ajustar_copias({libro_id}, 99);")
comprobar('no puede ajustar los ejemplares', not ok and 'administrador' in texto(out).lower(),
          texto(out)[-200:])


# ---------------------------------------------------------------------------
print('\n5. PERFIL PROPIO — y que nadie se ascienda solo')
# ---------------------------------------------------------------------------
ok, out = como(LIBRERO, "select nombre, rol from public.mi_perfil();")
comprobar('mi_perfil() responde', ok, texto(out)[-250:] if not ok else '')
comprobar('el rol que devuelve es librero', any('librero' in str(f) for f in out))

ok, out = como(LIBRERO, "select public.actualizar_mi_perfil('Maria Antileo Huenchuman', '56912345678', 'Encargada de circulacion');")
comprobar('puede guardar su propio perfil', ok, texto(out)[-250:] if not ok else '')
nombre = valor(f"select nombre from public.usuarios where id = '{LIBRERO}';")
cargo = valor(f"select cargo from public.usuarios where id = '{LIBRERO}';")
comprobar('el nombre quedó guardado', nombre == 'Maria Antileo Huenchuman', f'quedó: {nombre}')
comprobar('el cargo quedó guardado', cargo == 'Encargada de circulacion', f'quedó: {cargo}')

# El ataque obvio: cambiarse el rol a mano desde la consola del navegador
como(LIBRERO, f"update public.usuarios set rol = 'admin' where id = '{LIBRERO}';")
rol = valor(f"select rol from public.usuarios where id = '{LIBRERO}';")
comprobar('NO puede ascenderse a admin por UPDATE directo', rol == 'librero', f'rol = {rol}')

ok, out = como(LIBRERO, f"select public.asignar_rol('{LIBRERO}', 'admin');")
rol = valor(f"select rol from public.usuarios where id = '{LIBRERO}';")
comprobar('NO puede ascenderse llamando a asignar_rol', rol == 'librero', f'rol = {rol}')

ok, out = como(LIBRERO, f"select rol from public.usuarios where id = '{ADMIN}';")
comprobar('no puede leer el perfil de otra persona (RLS lo filtra)',
          ok and len(out) == 0, f'vio {len(out) if ok else "?"} filas')


# ---------------------------------------------------------------------------
print('\n6. EL ADMINISTRADOR CONSERVA SUS PERMISOS')
# ---------------------------------------------------------------------------
if TIMEZONE_OK:
    ok, out = como(ADMIN, f"select * from public.prestar_libro({libro_id}, '12345678-5');")
    comprobar('un admin puede prestar', ok, texto(out)[-250:] if not ok else '')
else:
    omitir('un admin puede prestar')

ok, out = como(ADMIN, "select email, rol from public.listar_personal();")
comprobar('un admin puede listar al personal', ok, texto(out)[-250:] if not ok else '')
ok, personal = como(ADMIN, "select nombre from public.listar_personal();")
comprobar('la lista incluye el nombre del perfil',
          any(fila[0] and 'Maria Antileo' in fila[0] for fila in personal), texto(personal))

ok, out = como(ADMIN, f"select * from public.ajustar_copias({libro_id}, 5);")
comprobar('un admin puede ajustar los ejemplares', ok, texto(out)[-250:] if not ok else '')

ok, out = como(ADMIN, f"update public.libros set titulo = 'Cuentos del Lago Ranco' where id = {libro_id};")
comprobar('un admin puede editar un libro', ok, texto(out)[-250:] if not ok else '')


# ---------------------------------------------------------------------------
print('\n7. AUTODIAGNÓSTICOS QUE VE EL ADMINISTRADOR EN PANTALLA')
# ---------------------------------------------------------------------------
ok, filas = como(ADMIN, "select tabla, diagnostico from public.verificar_rls();")
malas = [f for f in filas if f[1] != 'Correcto']
comprobar('verificar_rls() no reporta ninguna tabla en problemas', ok and not malas, texto(malas))
# 11, no 8: desde la migración 015 (Fase 1.2, lápidas de eliminación) se sumó
# "elementos_eliminados", en una ronda anterior (verificar_politicas(), 22 de
# agosto de 2026) se corrigió que "enlaces_escaneo_remoto" (014) y
# "respaldos_log" (018) llevaban dos migraciones sin vigilarse, y en esta
# ronda (022_reservas.sql) se sumó "reservas" — ver el comentario junto a la
# definición de verificar_rls() en la 010.
comprobar('verificar_rls() revisa las 11 tablas con datos', len(filas) == 11, f'revisó {len(filas)}')

ok, filas = como(ADMIN, "select funcion, es_definer from public.verificar_circulacion();")
rotas = [f[0] for f in filas if not f[1]]
comprobar('verificar_circulacion() da todas las funciones correctas', ok and not rotas, texto(rotas))
comprobar('verificar_circulacion() revisa las 9 funciones esperadas', len(filas) == 9, f'revisó {len(filas)}')


# ---------------------------------------------------------------------------
print('\n8. LA BITÁCORA SIGUE REGISTRANDO QUIÉN HIZO QUÉ')
# ---------------------------------------------------------------------------
n = valor("select count(*) from public.auditoria;")
comprobar('hay movimientos registrados en la auditoría', n > 0, f'hay {n}')
correos = valor("select distinct usuario_email from public.auditoria where usuario_email is not null;")
comprobar('la auditoría identifica al librero, no solo a un usuario anónimo',
          'librera@futrono.cl' in correos, correos[-200:])



# ===========================================================================
# BLOQUE AÑADIDO EN LA VERSIÓN 12 — registro de errores (migración 009)
# ===========================================================================
print('\n9. REGISTRO DE ERRORES')

m009 = (RAIZ / 'supabase' / 'migrations' / '009_registro_de_errores.sql').read_text(encoding='utf-8')
ok, out = sql(m009)
comprobar('la migración 009 se ejecuta sin errores', ok, texto(out)[-500:] if not ok else '')
ok, out = sql(m009)
comprobar('y se puede volver a ejecutar (es idempotente)', ok, texto(out)[-500:] if not ok else '')

sql("delete from public.errores;")

ok, out = como(LIBRERO, "select public.registrar_error('Fallo de prueba', 'operacion', 'traza', 'scanner', 'prestar', 'Chrome');")
comprobar('un librero puede registrar un fallo', ok, texto(out)[-250:] if not ok else '')
comprobar('quedó una fila', valor("select count(*) from public.errores;") == 1)
comprobar('se guardó quién tenía la sesión',
          valor("select usuario_email from public.errores limit 1;") == 'librera@futrono.cl')

# El mismo fallo repetido no debe multiplicar filas
for _ in range(4):
    como(LIBRERO, "select public.registrar_error('Fallo de prueba', 'operacion', 'traza', 'scanner', 'prestar', 'Chrome');")
comprobar('un fallo repetido NO crea filas nuevas', valor("select count(*) from public.errores;") == 1)
comprobar('...sino que suma repeticiones', valor("select repeticiones from public.errores limit 1;") == 5)

# Sin sesión no se registra: si no, la llave anónima permitiría llenar la tabla
ok, out = sql("set role anon; select public.registrar_error('Basura desde fuera');")
comprobar('sin sesión iniciada no se registra nada', valor("select count(*) from public.errores;") == 1)

ok, out = como(LIBRERO, "select * from public.listar_errores(10, false);")
comprobar('un librero NO puede leer el registro', not ok and 'administrador' in texto(out).lower(),
          texto(out)[-200:])

ok, out = como(LIBRERO, "select * from public.errores;")
comprobar('un librero tampoco lo ve por consulta directa (RLS)', ok and len(out) == 0,
          f'vio {len(out) if ok else "?"} filas')

ok, out = como(ADMIN, "select mensaje, repeticiones from public.listar_errores(10, false);")
comprobar('un admin sí puede leerlo', ok and len(out) == 1, texto(out)[-200:])

ok, out = como(ADMIN, "select sin_revisar, total from public.resumen_errores();")
comprobar('el resumen cuenta los no revisados', ok and out and out[0][0] == 1, texto(out))

como(ADMIN, "select public.marcar_error_visto(null);")
ok, out = como(ADMIN, "select sin_revisar from public.resumen_errores();")
comprobar('marcar como revisados funciona', out and out[0][0] == 0, texto(out))

sql("update public.errores set ocurrido_en = now() - interval '200 days';")
ok, out = como(ADMIN, "select public.purgar_errores(90);")
comprobar('la purga borra lo antiguo', ok and out and out[0][0] == 1, texto(out))
comprobar('la tabla queda vacía', valor("select count(*) from public.errores;") == 0)

ok, filas = como(ADMIN, "select tabla, diagnostico from public.verificar_rls();")
comprobar('verificar_rls() ahora cubre también la tabla de errores',
          any(f[0] == 'errores' for f in filas) and all(f[1] == 'Correcto' for f in filas),
          texto(filas))

# ===========================================================================
# CONSOLIDACIÓN (migración 010)
# ===========================================================================
print('\n10. CONSOLIDACIÓN DE FUNCIONES')

ok, filas = como(ADMIN, "select nombre, estado, diagnostico from public.verificar_definiciones();")
malas = [f for f in filas if f[1] != 'Correcto']
comprobar('verificar_definiciones() responde', ok, texto(filas)[-200:] if not ok else '')
# 53, no 41: 44 fue manifiesto_tablas_protegidas(), manifiesto_politicas() y
# verificar_politicas() (RLS/grants, mismo patrón que este autodiagnóstico).
# 45 sumó eliminar_libro() (020_permitir_eliminar_libro_con_historial.sql).
# 47 sumó listar_libros_eliminados() y restaurar_libro() (021_papelera_libros.sql).
# 53 sumó las seis de reservas: promover_siguiente_reserva(), reservar_libro(),
# cancelar_reserva(), retirar_reserva(), listar_reservas() y
# expirar_reservas_vencidas() (022_reservas.sql).
# 54 sumó consultar_libro_remoto() (Fase 2 de escaneo/mesón, 22 de agosto de
# 2026, sección ESCANEO REMOTO SIN SESIÓN de 010_consolidacion.sql).
# El conteo nació en 41 y fue creciendo con cada migración que sumó funciones
# al manifiesto (010 solo): 44 con las tres de RLS/grants, 45 con
# eliminar_libro(), 47 con la papelera, 53 con las seis de reservas, 54 con
# consultar_libro_remoto() y 55 al día de hoy. Fijar el número exacto otra vez
# solo pospone el próximo desajuste: lo que importa es que ninguna función de
# las que usa la interfaz quede fuera, y que el manifiesto no se encoja. El
# conteo exacto contra las funciones declaradas lo verifica
# pruebas/verificar_consolidacion.py.
FUNCIONES_QUE_USA_LA_INTERFAZ = {
    'estado_lector', 'buscar_libros', 'consultar_libro', 'prestar_libro',
    'devolver_prestamo', 'renovar_prestamo', 'reservar_libro', 'cancelar_reserva',
    'retirar_reserva', 'listar_reservas', 'eliminar_libro', 'restaurar_libro',
    'listar_libros_eliminados', 'eliminar_lector', 'anonimizar_lector',
    'exportar_datos_lector', 'bloquear_lector', 'listar_personal', 'eliminar_personal',
    'asignar_rol', 'mi_perfil', 'actualizar_mi_perfil', 'verificar_rls',
    'registrar_error', 'listar_errores', 'resumen_errores',
    'marcar_error_visto', 'purgar_errores', 'crear_enlace_escaneo',
    'validar_enlace_escaneo', 'consultar_libro_remoto', 'agregar_libro_remoto',
    'deshacer_libro_remoto', 'listar_enlaces_escaneo', 'revocar_enlace_escaneo',
    'estadisticas_paradas',
}
nombres_manifiesto = {f[0] for f in filas}
faltan = sorted(FUNCIONES_QUE_USA_LA_INTERFAZ - nombres_manifiesto)
comprobar('el manifiesto cubre las funciones que usa la interfaz',
          not faltan, f'faltan: {faltan}')
comprobar('el manifiesto no se encogió (55 al 2026-10-02)',
          len(filas) >= 55, f'cubre {len(filas)}')
comprobar('ninguna función está fuera de norma', not malas, texto(malas)[:300])

# La prueba de fuego: ¿detecta la deriva que causó el fallo del librero?
sql("""create or replace function public.devolver_prestamo(p_prestamo_id bigint)
returns void language plpgsql set search_path = public as $f$
begin update public.prestamos set estado='devuelto' where id=p_prestamo_id; end; $f$;""")
ok, filas = como(ADMIN, "select nombre, estado from public.verificar_definiciones() where estado <> 'Correcto';")
comprobar('detecta cuando una función pierde el security definer',
          any(f[0] == 'devolver_prestamo' and f[1] == 'SIN DEFINER' for f in filas), texto(filas))

# Una función redefinida con otra firma NO reemplaza: PostgreSQL crea una segunda
sql("""create or replace function public.prestar_libro(a bigint, b text, c int)
returns void language plpgsql security definer as $f$ begin end; $f$;""")
ok, filas = como(ADMIN, "select nombre, estado from public.verificar_definiciones() where estado <> 'Correcto';")
comprobar('detecta una función duplicada por firma',
          any(f[0] == 'prestar_libro' and f[1] == 'DUPLICADA' for f in filas), texto(filas))

sql("drop function if exists public.prestar_libro(bigint, text, int);")
ok, err = sql((RAIZ / 'supabase' / 'migrations' / '010_consolidacion.sql').read_text(encoding='utf-8'))
comprobar('reejecutar la 010 repara la deriva', ok, texto(err)[-300:] if not ok else '')
ok, filas = como(ADMIN, "select nombre, estado from public.verificar_definiciones() where estado <> 'Correcto';")
comprobar('tras reparar no queda nada fuera de norma', not filas, texto(filas))

# Los disparadores de auditoría deben quedar conectados, no duplicados.
# Se filtra por nombre a propósito: desde la 011, `libros` y `lectores` llevan
# además los disparadores de sincronización, así que contar todos daría 5.
ok, filas = sql("""select tgname from pg_trigger t join pg_class c on c.oid = t.tgrelid
where c.relname in ('libros','lectores','prestamos') and not t.tgisinternal
  and t.tgname like 'auditoria_%';""")
comprobar('los 3 disparadores de auditoría siguen conectados', len(filas) == 3, texto(filas))

# Y los de la 011 tienen que ser BEFORE. Si alguien los recrea como AFTER, la
# asignación `new.actualizado_en := now()` deja de tener efecto: la columna se
# queda con su valor por omisión y la fila nunca vuelve a aparecer en
# `where actualizado_en > $1`. Invisible para la sincronización, sin error.
# tgtype & 2 es el bit de BEFORE en pg_trigger.
ok, filas = sql("""select tgname from pg_trigger t join pg_class c on c.oid = t.tgrelid
where c.relname in ('libros','lectores') and not t.tgisinternal
  and t.tgname like 'marca_%' and (t.tgtype & 2) = 2;""")
comprobar('los 2 disparadores de sincronización existen y son BEFORE',
          len(filas) == 2, texto(filas))

# Y el librero debe poder seguir trabajando después de todo esto
sql("delete from public.prestamos;")
sql(f"update public.libros set stock = 3, copias_totales = 3 where id = {libro_id};")
if TIMEZONE_OK:
    ok, out = como(LIBRERO, f"select * from public.prestar_libro({libro_id}, '12345678-5');")
    comprobar('el librero sigue pudiendo prestar tras la consolidación', ok, texto(out)[-250:] if not ok else '')
    pid = valor("select id from public.prestamos order by id desc limit 1;")
    ok, out = como(LIBRERO, f"select public.devolver_prestamo({pid});")
    comprobar('y devolver', ok, texto(out)[-250:] if not ok else '')
else:
    omitir('el librero sigue pudiendo prestar tras la consolidación')
    omitir('y devolver')
comprobar('con el stock de vuelta en 3',
          str(valor(f"select stock from public.libros where id = {libro_id};")) == '3')


# ===========================================================================
# ELIMINAR_LIBRO() CON HISTORIAL — migración 020
# ===========================================================================
# El bug real que motivó esto: "La mujer justa" (0 préstamos activos, 1
# devuelto) no se podía eliminar, y el mensaje decía "revise si tiene
# préstamos activos" — falso, no había ninguno. La llave foránea de
# `prestamos.libro_id` rechazaba el borrado por CUALQUIER historial, activo
# o no. Estas dos comprobaciones son el caso que sí debe seguir bloqueado
# (préstamo activo) y el caso que antes fallaba mal y ahora debe funcionar
# (historial ya cerrado, con el título archivado).
print('\n10 bis. ELIMINAR_LIBRO() CON HISTORIAL (migración 020)')

sql("""
insert into public.libros (isbn, titulo, autor, stock, copias_totales)
  values ('ELB-ACTIVO', 'Libro Con Préstamo Activo', 'Autora Activa', 1, 1);
insert into public.libros (isbn, titulo, autor, stock, copias_totales)
  values ('ELB-DEVUELTO', 'Libro Con Historial Devuelto', 'Autora Devuelta', 2, 2);
""")
libro_activo_id = valor("select id from public.libros where isbn = 'ELB-ACTIVO';")
libro_devuelto_id = valor("select id from public.libros where isbn = 'ELB-DEVUELTO';")
lector_id_prueba = valor("select id from public.lectores limit 1;")

sql(f"""
insert into public.prestamos (libro_id, lector_id, fecha_prestamo, fecha_devolucion_esperada, estado)
  values ({libro_activo_id}, {lector_id_prueba}, current_date, current_date + 7, 'activo');
insert into public.prestamos (libro_id, lector_id, fecha_prestamo, fecha_devolucion_esperada, fecha_devolucion_real, estado)
  values ({libro_devuelto_id}, {lector_id_prueba}, current_date - 10, current_date - 3, current_date - 3, 'devuelto');
""")

ok, out = como(LIBRERO, f"select public.eliminar_libro({libro_devuelto_id});")
comprobar('un librero NO puede eliminar un libro (solo un administrador)',
          not ok and 'administrador' in texto(out).lower(), texto(out)[-200:])
comprobar('...y el libro sigue en el catálogo',
          valor(f"select count(*) from public.libros where id = {libro_devuelto_id};") == 1)

ok, out = como(ADMIN, f"select public.eliminar_libro({libro_activo_id});")
comprobar('un admin NO puede eliminar un libro con un préstamo activo',
          not ok and 'préstamo' in texto(out).lower() and 'activo' in texto(out).lower(),
          texto(out)[-200:])
comprobar('...y el libro sigue en el catálogo',
          valor(f"select count(*) from public.libros where id = {libro_activo_id};") == 1)

ok, out = como(ADMIN, f"select public.eliminar_libro({libro_devuelto_id});")
comprobar('un admin SÍ puede eliminar un libro con historial ya devuelto (el bug reportado)',
          ok, texto(out)[-200:] if not ok else '')
comprobar('...el libro ya no está en el catálogo',
          valor(f"select count(*) from public.libros where id = {libro_devuelto_id};") == 0)
comprobar('...el préstamo cerrado sigue existiendo, con el título y autor archivados',
          valor("select count(*) from public.prestamos where libro_titulo_archivado = 'Libro Con Historial Devuelto' and libro_autor_archivado = 'Autora Devuelta';") == 1)
comprobar('...y libro_id quedó en null en ese préstamo (la llave foránea, no un borrado en cascada)',
          valor("select count(*) from public.prestamos where libro_titulo_archivado = 'Libro Con Historial Devuelto' and libro_id is null;") == 1)
comprobar('...la lápida de eliminación también quedó puesta (015)',
          valor(f"select count(*) from public.elementos_eliminados where tabla = 'libros' and id = {libro_devuelto_id};") == 1)


# ===========================================================================
# RESTAURAR_LIBRO() Y LISTAR_LIBROS_ELIMINADOS() — migración 021
# ===========================================================================
# El pedido que siguió al de arriba: poder deshacer un eliminar_libro() hecho
# sin querer, desde una pestaña "Eliminados" en Administración. No hace falta
# ninguna tabla de respaldo propia — se lee la foto que ya guarda `auditoria`
# de cada borrado (registrar_auditoria(), migración 005).
print('\n10 ter. RESTAURAR_LIBRO() Y LISTAR_LIBROS_ELIMINADOS() (migración 021)')

ok, out = como(LIBRERO, "select * from public.listar_libros_eliminados();")
comprobar('un librero NO puede ver la papelera (solo un administrador)',
          not ok and 'administrador' in texto(out).lower(), texto(out)[-200:])

ok, papelera = como(ADMIN, "select libro_id, titulo, autor, copias_totales from public.listar_libros_eliminados();")
en_papelera = [f for f in papelera if str(f[0]) == str(libro_devuelto_id)] if ok else []
comprobar('el libro eliminado aparece en la papelera del administrador',
          ok and len(en_papelera) == 1, texto(out)[-200:] if not ok else texto(papelera)[-300:])
if en_papelera:
    comprobar('...con el título, autor y ejemplares de antes de eliminarse',
              en_papelera[0][1] == 'Libro Con Historial Devuelto' and en_papelera[0][2] == 'Autora Devuelta'
              and en_papelera[0][3] == 2, texto(en_papelera[0]))

ok, out = como(LIBRERO, f"select public.restaurar_libro({libro_devuelto_id});")
comprobar('un librero NO puede restaurar un libro (solo un administrador)',
          not ok and 'administrador' in texto(out).lower(), texto(out)[-200:])
comprobar('...y el libro sigue sin estar en el catálogo',
          valor(f"select count(*) from public.libros where id = {libro_devuelto_id};") == 0)

ok, out = como(ADMIN, f"select public.restaurar_libro({libro_devuelto_id});")
comprobar('un admin SÍ puede restaurar el libro eliminado', ok, texto(out)[-200:] if not ok else '')
comprobar('...el libro volvió al catálogo con el mismo id, título, autor e ISBN',
          valor(f"select titulo from public.libros where id = {libro_devuelto_id};") == 'Libro Con Historial Devuelto'
          and valor(f"select autor from public.libros where id = {libro_devuelto_id};") == 'Autora Devuelta'
          and valor(f"select isbn from public.libros where id = {libro_devuelto_id};") == 'ELB-DEVUELTO')
comprobar('...con los mismos ejemplares de antes de eliminarse',
          valor(f"select copias_totales from public.libros where id = {libro_devuelto_id};") == 2
          and valor(f"select stock from public.libros where id = {libro_devuelto_id};") == 2)
comprobar('...el préstamo cerrado quedó reenganchado al libro restaurado',
          valor(f"select count(*) from public.prestamos where libro_id = {libro_devuelto_id} and libro_titulo_archivado is null and libro_autor_archivado is null;") == 1)

ok, papelera2 = como(ADMIN, "select libro_id from public.listar_libros_eliminados();")
comprobar('el libro restaurado ya no aparece en la papelera',
          ok and str(libro_devuelto_id) not in [str(f[0]) for f in papelera2], texto(papelera2)[-200:])

ok, out = como(ADMIN, f"select public.restaurar_libro({libro_devuelto_id});")
comprobar('restaurar un libro que ya está en el catálogo da un error claro, no lo duplica',
          not ok and 'catálogo' in texto(out).lower(), texto(out)[-200:])
comprobar('...y sigue habiendo un solo libro con ese id',
          valor(f"select count(*) from public.libros where id = {libro_devuelto_id};") == 1)

sql(f"delete from public.prestamos where libro_id = {libro_activo_id} or libro_id = {libro_devuelto_id};")
sql(f"delete from public.libros where id = {libro_activo_id} or id = {libro_devuelto_id};")


# ===========================================================================
# LA LLAVE ANÓNIMA — lo que puede hacer alguien sin iniciar sesión
# ===========================================================================
# La llave anónima de Supabase es PÚBLICA por diseño: va escrita en config.js,
# que se sirve al navegador. Cualquiera la lee con F12 y puede llamar a la API.
#
# Estas comprobaciones existen porque en la versión 13 se descubrió que
# `estado_lector` y `consultar_libro` eran alcanzables sin sesión y devolvían
# nombre, RUT, correo y teléfono del lector. Los RUT chilenos son enumerables,
# así que era la lista de contactos de la biblioteca al descubierto.
print('\n11. LA LLAVE ANÓNIMA NO DEBE ALCANZAR DATOS PERSONALES')

def como_anonimo(consulta):
    """Ejecuta con el rol anon, que es el que usa la llave pública."""
    try:
        with psycopg.connect(URI, autocommit=True) as c, c.cursor() as cur:
            cur.execute("set role anon")
            cur.execute(consulta)
            try:
                return True, cur.fetchall()
            except psycopg.ProgrammingError:
                return True, []
    except Exception as e:
        return False, str(e)

# Datos con los que probar
sql("delete from public.prestamos;")
sql(f"update public.libros set stock = 3, copias_totales = 3, isbn = '9789561234567' where id = {libro_id};")
sql(f"""insert into public.prestamos (libro_id, lector_id, fecha_prestamo, fecha_devolucion_esperada, estado)
        select {libro_id}, id, current_date, current_date + 7, 'activo' from public.lectores limit 1;""")

def no_expone(descripcion, consulta, dato_sensible):
    """Correcto si se bloquea, o si se ejecuta sin devolver el dato sensible."""
    ok, r = como_anonimo(consulta)
    if not ok:
        comprobar(descripcion + ' (bloqueado)', True)
        return
    filtrado = dato_sensible.lower() in texto(r).lower()
    comprobar(descripcion, not filtrado,
              f'EXPUSO datos personales: {texto(r)[:120]}')

no_expone('estado_lector no expone al lector por su RUT',
          "select * from public.estado_lector('12345678-5')", 'Antileo')
no_expone('consultar_libro no expone a quien tiene el libro',
          "select * from public.consultar_libro('9789561234567')", 'Antileo')
no_expone('la tabla lectores no es legible',
          "select rut, nombre, email, telefono from public.lectores", 'Antileo')
no_expone('la tabla prestamos no es legible',
          "select * from public.prestamos", 'activo')
no_expone('buscar_libros no devuelve el catálogo',
          "select * from public.buscar_libros('Lago', 10, 0)", 'Lago')

# Escritura y funciones de gestión
for desc, consulta in [
    ('no puede registrar un préstamo', f"select * from public.prestar_libro({libro_id}, '12345678-5')"),
    ('no puede devolver un préstamo',  "select public.devolver_prestamo(1)"),
    ('no puede ajustar ejemplares',    f"select * from public.ajustar_copias({libro_id}, 99)"),
    ('no puede bloquear lectores',     "select public.bloquear_lector(1, true, 'x')"),
    ('no puede listar al personal',    "select * from public.listar_personal()"),
    ('no puede cambiar roles',         "select public.asignar_rol('00000000-0000-0000-0000-000000000000','admin')"),
    ('no puede eliminar al personal',  "select public.eliminar_personal('00000000-0000-0000-0000-000000000000')"),
    ('no puede exportar datos',        "select * from public.exportar_datos_lector('12345678-5')"),
    ('no puede anonimizar un lector',  "select public.anonimizar_lector('12345678-5')"),
    ('no puede leer los errores',      "select * from public.listar_errores(5, false)"),
    ('no puede leer la auditoría',     "select * from public.auditoria"),
    ('no puede leer las estadísticas de paradas', "select * from public.estadisticas_paradas()"),
]:
    ok, r = como_anonimo(consulta)
    comprobar('el anónimo ' + desc, not ok, f'se ejecutó y devolvió: {texto(r)[:100]}')

# `parametros` es la única tabla protegida donde el anónimo SÍ puede leer
# directo, a propósito: la política "parametros lectura" (migración 007) usa
# `using (true)` sin restringir el rol — son valores de configuración
# globales (máximo de préstamos, días de plazo, etc.), no datos personales.
# Solo la escritura exige es_admin() ("parametros escritura admin").
ok, r = como_anonimo("select clave from public.parametros")
comprobar('el anónimo SÍ puede leer los parámetros (config pública, a propósito)',
          ok and len(r) > 0, f'ok={ok}, filas={texto(r)[:150]}')
ok, out = como_anonimo("update public.parametros set valor = '999' where clave = 'dias_prestamo'")
comprobar('...pero no puede escribirlos', not ok, texto(out)[-150:] if not ok else '')

# El autodiagnóstico revela el estado de la protección: es reconocimiento útil
for desc, consulta in [
    ('el estado de las políticas RLS',      "select * from public.verificar_rls()"),
    ('el estado de la circulación',         "select * from public.verificar_circulacion()"),
    ('las definiciones de las funciones',   "select * from public.verificar_definiciones()"),
]:
    ok, r = como_anonimo(consulta)
    comprobar(f'el anónimo no puede consultar {desc}', not ok, f'devolvió {len(r) if ok else 0} filas')

# registrar_error debe existir para el personal, pero no servir de buzón de spam
antes = valor("select count(*) from public.errores;")
como_anonimo("select public.registrar_error('spam desde fuera')")
comprobar('el anónimo no puede llenar el registro de errores',
          valor("select count(*) from public.errores;") == antes)

# Escaneo remoto: el anónimo SÍ debe poder llamar a las dos funciones del
# enlace (ese es el punto: el celular que escanea nunca inicia sesión), pero
# nunca gestionar enlaces, ni leer la tabla directo, ni escribir con un token
# inventado.
for desc, consulta in [
    ('no puede generar un enlace de escaneo', "select * from public.crear_enlace_escaneo(4)"),
    ('no puede listar los enlaces de escaneo', "select * from public.listar_enlaces_escaneo()"),
    ('no puede revocar un enlace de escaneo', "select public.revocar_enlace_escaneo(1)"),
]:
    ok, r = como_anonimo(consulta)
    comprobar('el anónimo ' + desc, not ok, f'se ejecutó y devolvió: {texto(r)[:100]}')

# `enlaces_escaneo_remoto` tiene RLS activo y CERO políticas a propósito (ver
# el comentario junto a manifiesto_politicas() en la 010): con RLS activo y
# ninguna política, Postgres no da "permiso denegado" — deja pasar la
# consulta y filtra TODAS las filas, así que el resultado correcto es una
# lista vacía, no un error. Antes esta comprobación pedía `not ok` (que la
# consulta fallara) y solo pasaba en local por una brecha ya corregida en
# `pruebas/00_base_supabase.sql`: el arnés no le daba a `anon` el SELECT de
# fábrica que sí tiene en producción, así que la consulta fallaba por falta
# de GRANT, no por RLS. Con el arnés ya fiel a producción, lo que hay que
# comprobar es que vuelve vacía.
ok, r = como_anonimo("select * from public.enlaces_escaneo_remoto")
comprobar('el anónimo no ve ninguna fila de enlaces_escaneo_remoto (RLS sin políticas)',
          ok and len(r) == 0, f'ok={ok}, filas={texto(r)[:150]}')

ok, r = como_anonimo("select valido, motivo from public.validar_enlace_escaneo('token-inventado')")
comprobar('el anónimo SÍ puede llamar a validar_enlace_escaneo, pero un token inventado no es válido',
          ok and r and r[0][0] is False, texto(r))

ok, r = como_anonimo(
    "select * from public.agregar_libro_remoto('token-inventado', '000-inventado', 'X', 'Y')")
comprobar('el anónimo no puede agregar un libro con un token inventado',
          not ok, f'se ejecutó y devolvió: {texto(r)[:100]}')
comprobar('...y ese ISBN inventado no quedó en el catálogo',
          valor("select count(*) from public.libros where isbn = '000-inventado';") == 0)

ok, r = como_anonimo(
    "select * from public.deshacer_libro_remoto('token-inventado', 1)")
comprobar('el anónimo no puede deshacer un escaneo con un token inventado',
          not ok, f'se ejecutó y devolvió: {texto(r)[:100]}')

# Y lo que sí debe seguir funcionando para el personal
if TIMEZONE_OK:
    ok, out = como(LIBRERO, "select nombre from public.estado_lector('12345678-5');")
    comprobar('un librero SÍ puede consultar un lector', ok and out, texto(out)[-150:])
    ok, out = como(LIBRERO, "select titulo from public.consultar_libro('9789561234567');")
    comprobar('un librero SÍ puede consultar un libro', ok and out, texto(out)[-150:])
else:
    omitir('un librero SÍ puede consultar un lector')
    omitir('un librero SÍ puede consultar un libro')
ok, out = como(ADMIN, "select count(*) from public.verificar_definiciones();")
comprobar('un admin SÍ puede ver el autodiagnóstico', ok and out and out[0][0] >= 55,
          texto(out)[-150:])


# ===========================================================================
# BLOQUE AÑADIDO PARA LA FASE 1.2 — lápidas de eliminación (migración 015)
# ===========================================================================
# Esta es la única suite del proyecto que cambia de ROL de Postgres de
# verdad (set role authenticated / anon), así que es la única que puede
# probar la RLS de "elementos_eliminados" tal como la vería PostgREST en
# producción — no solo que un admin pueda borrar, sino que un anónimo
# de verdad no vea nada, fila por fila.
print('\n12. LÁPIDAS DE ELIMINACIÓN (Fase 1.2, requisito de CUMPLIMIENTO-LEGAL.md § 9 bis)')

sql("""
insert into public.lectores (rut, nombre, email, telefono)
  values ('55555555-6', 'Lector Desechable', 'desechable@correo.cl', '56900000000');
insert into public.libros (isbn, titulo, autor, stock, copias_totales)
  values ('LAP-PRUEBA', 'Libro Desechable', 'X', 1, 1);
""")
lector_desechable_id = valor("select id from public.lectores where rut = '55555555-6';")
libro_desechable_id = valor("select id from public.libros where isbn = 'LAP-PRUEBA';")

ok, out = como(ADMIN, f"delete from public.lectores where id = {lector_desechable_id};")
comprobar('un admin puede borrar un lector (como siempre)', ok, texto(out)[-200:] if not ok else '')
ok, out = como(ADMIN, f"delete from public.libros where id = {libro_desechable_id};")
comprobar('un admin puede borrar un libro (como siempre)', ok, texto(out)[-200:] if not ok else '')

comprobar('el borrado del lector dejó una lápida en elementos_eliminados',
          valor(f"select count(*) from public.elementos_eliminados where tabla = 'lectores' and id = {lector_desechable_id};") == 1)
comprobar('el borrado del libro dejó una lápida en elementos_eliminados',
          valor(f"select count(*) from public.elementos_eliminados where tabla = 'libros' and id = {libro_desechable_id};") == 1)

# La RLS real, con roles reales — no la simulación de probar-migraciones.py
ok, r = como_anonimo("select * from public.elementos_eliminados")
comprobar('el anónimo no ve ninguna lápida (bloqueado, o la consulta vuelve vacía)',
          (not ok) or len(r) == 0, f'ok={ok}, filas={texto(r)[:150]}')

if TIMEZONE_OK:
    ok, r = como(LIBRERO, "select tabla, id from public.elementos_eliminados")
    comprobar('un librero (personal) sí ve las lápidas',
              ok and len(r) >= 2, f'ok={ok}, filas={texto(r)[:150]}')
else:
    omitir('un librero (personal) sí ve las lápidas')

ok, r = como(ADMIN, "select tabla, rls_activo, politicas, diagnostico from public.verificar_rls() where tabla = 'elementos_eliminados';")
comprobar('verificar_rls() confirma que elementos_eliminados quedó protegida (RLS activo + política + Correcto)',
          ok and len(r) == 1 and r[0][1] is True and r[0][2] >= 1 and r[0][3] == 'Correcto',
          texto(r))


print('\n' + '─' * 62)
resumen = f'{pasadas} comprobaciones correctas, {fallidas} con fallo'
if omitidas:
    resumen += f', {omitidas} omitidas (America/Santiago no disponible)'
print(resumen)
sys.exit(1 if fallidas else 0)
