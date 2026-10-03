#!/usr/bin/env python3
"""
Ejecuta las migraciones contra un PostgreSQL real.

Existe porque el otro banco de pruebas (probar-vistas.mjs) simula Supabase por
completo y no ejecuta una sola línea de SQL. Errores como una diferencia entre
varchar y text, una función que se llama antes de existir, o un tipo de
identificador equivocado, solo aparecen aquí.

Uso:
    pip install pgserver --break-system-packages
    python3 pruebas/probar-migraciones.py

Prueba dos escenarios de esquema, porque el tipo de las columnas depende de cómo
se crearon las tablas y eso cambia si las funciones funcionan o no:
    A) text  + bigserial  (lo que crea el editor de tablas de Supabase)
    B) varchar + serial   (lo que sale de un script escrito a mano)
"""

import glob
import os
import shutil
import sys
import tempfile

try:
    import pgserver
except ImportError:
    sys.exit("Falta pgserver. Ejecuta: pip install pgserver --break-system-packages")

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PSQL = os.path.join(os.path.dirname(pgserver.__file__), 'pginstall', 'bin', 'psql')

# Identificador del usuario que auth.uid() devolverá durante las pruebas
UID_SIMULADO = {'valor': None}
MIGRACIONES = sorted(glob.glob(os.path.join(RAIZ, 'supabase/migrations/*.sql')))

# ---------------------------------------------------------------------------
# Esquema base: lo que ya existe en el proyecto de Supabase antes de migrar
# ---------------------------------------------------------------------------

def esquema_base(tipo_texto, tipo_id, tipo_ref):
    return f"""
-- Supabase define estos roles; sin ellos fallan los GRANT de las migraciones
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon;
  end if;
end $$;

-- Lo que Supabase hace de fábrica: cualquier tabla nueva de `public` queda
-- con acceso amplio (select/insert/update/delete) para `anon` Y
-- `authenticated` desde que se crea, sin que ninguna migración tenga que
-- pedirlo — RLS es la única barrera real, nunca el GRANT (ver la nota larga
-- en verificar_politicas(), migración 010). Sin esto, las tablas que las
-- migraciones crean sin un `grant` explícito (auditoria, parametros,
-- enlaces_escaneo_remoto, respaldos_log) quedarían con CERO permisos para
-- authenticated en este Postgres de prueba, aunque en Supabase de verdad sí
-- funcionan — verificar_politicas() lo habría reportado como una falla
-- puramente local, sin ningún problema real en producción. Se declara ANTES
-- de crear ninguna tabla: solo afecta a las que se creen después.
alter default privileges in schema public grant select, insert, update, delete on tables to authenticated;
alter default privileges in schema public grant select, insert, update, delete on tables to anon;

-- Sustitutos de extensiones que Supabase trae y este PostgreSQL de prueba no
-- incluye. Imitan la firma y el comportamiento suficiente para validar el SQL;
-- en producción las reemplazan las extensiones reales.
create schema if not exists extensions;

create or replace function extensions.digest(texto text, algoritmo text)
returns bytea language sql immutable as $$ select decode(md5(texto), 'hex') $$;

-- Sustituto de gen_random_bytes: no necesita ser criptográficamente fuerte
-- aquí, solo devolver bytea del largo pedido para que crear_enlace_escaneo()
-- pueda generar un token de prueba.
create or replace function extensions.gen_random_bytes(n int)
returns bytea language sql volatile as $$
  select decode(string_agg(lpad(to_hex((random() * 255)::int), 2, '0'), ''), 'hex')
  from generate_series(1, n)
$$;

create or replace function extensions.unaccent(texto text)
returns text language sql immutable as $$
  select translate(texto, 'áàâäãéèêëíìîïóòôöõúùûüñçÁÀÂÄÃÉÈÊËÍÌÎÏÓÒÔÖÕÚÙÛÜÑÇ',
                          'aaaaaeeeeiiiiooooouuuuncAAAAAEEEEIIIIOOOOOUUUUNC') $$;

create or replace function extensions.unaccent(dic regdictionary, texto text)
returns text language sql immutable as $$ select extensions.unaccent(texto) $$;

-- Diccionario mínimo para que 'unaccent'::regdictionary resuelva
create text search dictionary unaccent (template = simple);

-- Supabase expone auth.users y auth.uid(); se replican para poder probar
create schema if not exists auth;
create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email varchar(255),
  last_sign_in_at timestamptz
);
create or replace function auth.uid() returns uuid
  language sql stable as $$ select current_setting('pruebas.uid', true)::uuid $$;

-- Tablas de la aplicación
create table public.libros (
  id {tipo_id} primary key,
  isbn {tipo_texto} unique,
  titulo {tipo_texto} not null,
  autor {tipo_texto},
  stock integer not null default 1
);

create table public.lectores (
  id {tipo_id} primary key,
  rut {tipo_texto} not null,
  nombre {tipo_texto} not null,
  email {tipo_texto},
  telefono {tipo_texto}
);

create table public.prestamos (
  id {tipo_id} primary key,
  libro_id {tipo_ref} references public.libros(id) on delete restrict,
  lector_id {tipo_ref} references public.lectores(id) on delete restrict,
  fecha_devolucion_esperada date not null,
  estado {tipo_texto} not null default 'activo'
);

create table public.usuarios (
  id uuid primary key references auth.users(id) on delete cascade,
  email {tipo_texto},
  rol {tipo_texto} not null default 'librero'
);
"""


ESCENARIOS = [
    ('A: text + bigserial (editor de Supabase)', 'text', 'bigserial', 'bigint'),
    ('B: varchar + serial (script a mano)', 'varchar(255)', 'serial', 'integer'),
]

# ---------------------------------------------------------------------------

pasadas = fallidas = 0
detalles = []


def prueba(nombre, fn):
    global pasadas, fallidas
    try:
        fn()
        print(f"    ✓ {nombre}")
        pasadas += 1
    except Exception as e:
        msg = str(e).strip().split('\n')[0][:160]
        print(f"    ✗ {nombre}\n        {msg}")
        fallidas += 1
        detalles.append((nombre, msg))


def correr(srv, sql):
    """Ejecuta SQL deteniéndose en el primer error y devolviendo su mensaje.

    Se invoca psql directamente en vez de usar el ayudante de pgserver, porque
    ese oculta el texto del error de PostgreSQL y sin él no se puede diagnosticar
    nada. ON_ERROR_STOP es indispensable: sin él psql informa el error y sigue
    con la sentencia siguiente, así que las pruebas pasaban en falso.
    """
    import subprocess
    # El identificador del usuario simulado se fija en cada llamada porque
    # cada invocación de psql abre una sesión nueva y el ámbito de set_config
    # es la sesión.
    # `do $$ ... $$` en vez de `select set_config(...)`: un bloque DO no
    # devuelve resultset. Con `select`, psql imprime su propia tabla antes de
    # la del SQL real, y eso corre el índice de línea (o el texto plano) que
    # varias pruebas usan para leer el resultado — un valor como '2' termina
    # coincidiendo por azar con algún dígito del uuid simulado.
    preludio = ""
    if UID_SIMULADO['valor']:
        preludio = f"do $$ begin perform set_config('pruebas.uid', '{UID_SIMULADO['valor']}', false); end $$;\n"
    r = subprocess.run(
        [str(PSQL), srv.get_uri(), '-v', 'ON_ERROR_STOP=1', '-q', '-f', '-'],
        input=preludio + sql, capture_output=True, text=True
    )
    if os.environ.get('DEBUG_SQL'):
        print(f"      [SQL] {sql.strip()[:90]!r} -> rc={r.returncode} err={r.stderr.strip()[:120]!r}")
    if r.returncode != 0 or 'ERROR:' in r.stderr:
        lineas = [l for l in r.stderr.split('\n') if l.strip()]
        pertinentes = [l for l in lineas if 'ERROR:' in l or 'DETALLE' in l or 'DETAIL' in l]
        raise RuntimeError(' | '.join(pertinentes[:2]) if pertinentes else (lineas[0] if lineas else 'error sin mensaje'))
    return r.stdout


def main():
    global fallidas
    print(f"\nMigraciones encontradas: {len(MIGRACIONES)}")
    for m in MIGRACIONES:
        print(f"  · {os.path.basename(m)}")

    for etiqueta, t_texto, t_id, t_ref in ESCENARIOS:
        print(f"\n{'=' * 68}\nESCENARIO {etiqueta}\n{'=' * 68}")
        UID_SIMULADO['valor'] = None  # cada escenario usa su propia base
        dir_datos = tempfile.mkdtemp()
        srv = None
        try:
            srv = pgserver.get_server(dir_datos)
            correr(srv, esquema_base(t_texto, t_id, t_ref))

            # --- Cada migración debe aplicarse sin error, en orden ---
            print("\n  Aplicando migraciones:")
            for ruta in MIGRACIONES:
                nombre = os.path.basename(ruta)
                with open(ruta, encoding='utf-8') as f:
                    sql = f.read()
                # La 003 inserta el admin desde auth.users; se crea uno de prueba
                if '003_' in nombre:
                    correr(srv, "insert into auth.users (email) values ('nicolasd.carrillo@gmail.com') on conflict do nothing;")
                prueba(f"aplica {nombre}", lambda s=sql: correr(srv, s))

            # --- Idempotencia ---
            # Solo se exige de la ÚLTIMA migración. Reaplicar una anterior no es
            # seguro: 005, 006 y 007 redefinen las mismas funciones, así que
            # volver a ejecutar 005 después de 010 revierte correcciones
            # (renovar_prestamo() vuelve a quedar sin `security definer`).
            #
            # Antes de que la 010 se aplicara completa, esto terminaba en un
            # error de PostgreSQL (cambio de tipo de retorno) y el error era la
            # salida segura. Ahora la 010 sí se aplica entera, la firma de la
            # versión vieja encaja y PostgreSQL la reemplaza en SILENCIO: la
            # única defensa que queda es que `verificar_definiciones()` —lo que
            # ve Administración → Diagnóstico— lo delate. Eso es lo que se
            # comprueba aquí, en vez de exigir un error que ya no ocurre.
            print("\n  Idempotencia:")
            ultima = MIGRACIONES[-1]
            with open(ultima, encoding='utf-8') as f:
                sql_ultima = f.read()
            prueba(f"reaplicar {os.path.basename(ultima)} es seguro",
                   lambda: correr(srv, sql_ultima))

            def reaplicar_anterior_no_pasa_inadvertida():
                with open(MIGRACIONES[4], encoding='utf-8') as f:  # 005
                    sql = f.read()
                try:
                    correr(srv, sql)
                except Exception:
                    return  # aborta con error: también es una salida segura
                # Se aplicó sin error: el desajuste tiene que ser detectable.
                uid_admin = correr(
                    srv, "select id from auth.users where email = 'nicolasd.carrillo@gmail.com';"
                ).split('\n')[2].strip()
                UID_SIMULADO['valor'] = uid_admin
                try:
                    r = correr(
                        srv,
                        "select nombre, estado, diagnostico from public.verificar_definiciones() where estado <> 'Correcto';"
                    )
                finally:
                    UID_SIMULADO['valor'] = None
                filas = [f for f in r.split('\n')[2:] if f.strip() and not f.strip().startswith('(')]
                assert filas, ('la 005 se reaplicó sin error y verificar_definiciones() '
                               'no detectó ningún desajuste')
            prueba("reaplicar una migración anterior no pasa inadvertida",
                   reaplicar_anterior_no_pasa_inadvertida)

            # psql (sin BEGIN/COMMIT explícito en el script) confirma cada
            # sentencia por separado: la 005 alcanza a redefinir varias
            # funciones —entre ellas renovar_prestamo(), SIN `security
            # definer`, tal como estaba en ese archivo— ANTES de llegar a la
            # sentencia que por fin la hace fallar. El error detiene el
            # script, pero no deshace lo que ya se ejecutó: la base queda con
            # esa versión vieja instalada. Es exactamente el escenario que
            # `verificar_definiciones()` existe para detectar, y el remedio
            # documentado en su propio mensaje es "Vuelve a ejecutar la 010" —
            # se comprueba aquí que de verdad restaura todo.
            def reaplicar_010_repara():
                with open(MIGRACIONES[9], encoding='utf-8') as f:  # 010_consolidacion.sql
                    sql = f.read()
                assert '010_consolidacion' in MIGRACIONES[9]
                correr(srv, sql)
            prueba("reaplicar la 010 repara lo que dejó a medias la migración anterior",
                   reaplicar_010_repara)

            # --- Datos de prueba ---
            print("\n  Cargando datos:")
            def cargar():
                correr(srv, """
                  insert into public.libros (isbn, titulo, autor, stock, copias_totales)
                  values ('9789561117', 'Subterra', 'Baldomero Lillo', 3, 3),
                         ('9788437604947', 'La Araucana', 'Alonso de Ercilla', 1, 1);
                  insert into public.lectores (rut, nombre, email, telefono)
                  values ('12345678-5', 'María Antileo', 'maria@correo.cl', '56912345678'),
                         ('11111111-1', 'Pedro Huenchumán', 'pedro@correo.cl', '56987654321');
                """)
            prueba("inserta libros y lectores", cargar)

            # --- Sesiones simuladas para el resto de la corrida ---
            # Las funciones de circulación (008/010) exigen es_personal(): sin
            # una sesión activa, todas fallan con "Debes iniciar sesión", que es
            # el comportamiento correcto de la aplicación, no un defecto. Se crea
            # un librero de prueba y queda como sesión por defecto de aquí en
            # adelante; el admin de la 003 (nicolasd.carrillo@gmail.com) ya
            # existe y se usa solo puntualmente, donde una función exige
            # es_admin() en vez de es_personal().
            uid_librero = correr(
                srv, "insert into auth.users (email) values ('librera-prueba@futrono.cl') returning id;"
            ).split('\n')[2].strip()
            correr(srv, f"""
              insert into public.usuarios (id, email, rol)
              values ('{uid_librero}', 'librera-prueba@futrono.cl', 'librero');
            """)
            uid_admin = correr(
                srv, "select id from auth.users where email = 'nicolasd.carrillo@gmail.com';"
            ).split('\n')[2].strip()

            def como(uid):
                UID_SIMULADO['valor'] = uid

            como(uid_librero)

            # --- Las funciones RPC deben ejecutarse y devolver la forma correcta ---
            print("\n  Funciones de consulta:")
            prueba("hoy_chile() devuelve una fecha",
                   lambda: correr(srv, "select public.hoy_chile();"))
            prueba("buscar_libros() sin filtro",
                   lambda: correr(srv, "select * from public.buscar_libros('', 10, 0);"))
            prueba("buscar_libros() ignora acentos",
                   lambda: correr(srv, "select * from public.buscar_libros('araucana', 10, 0);"))
            prueba("estado_lector() con RUT existente",
                   lambda: correr(srv, "select * from public.estado_lector('12345678-5');"))
            prueba("estado_lector() con RUT inexistente",
                   lambda: correr(srv, "select * from public.estado_lector('99999999-9');"))
            prueba("consultar_libro() por ISBN",
                   lambda: correr(srv, "select * from public.consultar_libro('9789561117');"))
            prueba("revisar_inventario()",
                   lambda: correr(srv, "select * from public.revisar_inventario();"))
            def verificar_rls_como_admin():
                # Exige es_admin(): la sesión de librero no alcanza aquí.
                como(uid_admin)
                try:
                    correr(srv, "select * from public.verificar_rls();")
                finally:
                    como(uid_librero)
            prueba("verificar_rls()", verificar_rls_como_admin)

            def verificar_politicas_sin_fallas():
                # Exige es_admin(), igual que verificar_rls() arriba. La
                # comprobación real: el manifiesto (lo que el proyecto declaró
                # que debía existir) tiene que coincidir con lo instalado —
                # ninguna fila debería salir con estado distinto de 'Correcto'.
                como(uid_admin)
                try:
                    r = correr(srv, "select categoria, tabla, item, estado, diagnostico from public.verificar_politicas() where estado <> 'Correcto';")
                    filas = r.split('\n')[2:]
                    filas = [f for f in filas if f.strip() and not f.strip().startswith('(')]
                    assert not filas, f"verificar_politicas() encontró desajustes: {filas}"
                finally:
                    como(uid_librero)
            prueba("verificar_politicas() sin desajustes contra el manifiesto", verificar_politicas_sin_fallas)

            def verificar_definiciones_sin_fallas():
                # Mismo espíritu que verificar_politicas_sin_fallas() arriba,
                # pero del lado de las funciones: ninguna debería salir
                # distinta de 'Correcto' contra manifiesto_funciones().
                como(uid_admin)
                try:
                    r = correr(srv, "select nombre, estado, diagnostico from public.verificar_definiciones() where estado <> 'Correcto';")
                    filas = r.split('\n')[2:]
                    filas = [f for f in filas if f.strip() and not f.strip().startswith('(')]
                    assert not filas, f"verificar_definiciones() encontró desajustes: {filas}"
                finally:
                    como(uid_librero)
            prueba("verificar_definiciones() sin desajustes contra el manifiesto", verificar_definiciones_sin_fallas)

            prueba("parametro_int() lee de la tabla",
                   lambda: correr(srv, "select public.parametro_int('max_prestamos_por_lector', 0);"))

            # --- Préstamos: el flujo completo ---
            print("\n  Flujo de préstamo:")
            prueba("prestar_libro() registra el préstamo",
                   lambda: correr(srv, "select * from public.prestar_libro(1, '12345678-5');"))

            def stock_bajo():
                r = correr(srv, "select stock from public.libros where id = 1;")
                assert '2' in r, f"el stock debió bajar a 2, se leyó: {r}"
            prueba("el stock baja al prestar", stock_bajo)

            prueba("renovar_prestamo() extiende el plazo",
                   lambda: correr(srv, "select * from public.renovar_prestamo(1);"))
            prueba("devolver_prestamo() registra la devolución",
                   lambda: correr(srv, "select public.devolver_prestamo(1);"))

            def stock_restaurado():
                r = correr(srv, "select stock from public.libros where id = 1;")
                assert '3' in r, f"el stock debió volver a 3, se leyó: {r}"
            prueba("el stock se restaura al devolver", stock_restaurado)

            # --- Reglas de negocio: deben RECHAZAR ---
            print("\n  Reglas que deben rechazar:")

            def debe_fallar(sql, texto_esperado=None):
                try:
                    correr(srv, sql)
                except Exception as e:
                    if texto_esperado and texto_esperado.lower() not in str(e).lower():
                        raise AssertionError(f"falló, pero por otro motivo: {str(e)[:120]}")
                    return
                raise AssertionError("la operación fue aceptada y debía rechazarse")

            prueba("no presta con RUT inexistente",
                   lambda: debe_fallar("select * from public.prestar_libro(1, '99999999-9');", "no encontrado"))

            def sin_stock():
                correr(srv, "select * from public.prestar_libro(2, '12345678-5');")
                debe_fallar("select * from public.prestar_libro(2, '11111111-1');", "disponible")
            prueba("no presta sin ejemplares disponibles", sin_stock)

            def limite_prestamos():
                correr(srv, "update public.parametros set valor = '1' where clave = 'max_prestamos_por_lector';")
                debe_fallar("select * from public.prestar_libro(1, '12345678-5');", "máximo")
                correr(srv, "update public.parametros set valor = '3' where clave = 'max_prestamos_por_lector';")
            prueba("respeta el límite de préstamos por lector", limite_prestamos)

            def bloqueo_por_atraso():
                # Se atrasa el préstamo activo de María y se intenta prestarle otro
                correr(srv, """update public.prestamos
                               set fecha_devolucion_esperada = public.hoy_chile() - 5
                               where lector_id = 1 and estado = 'activo';""")
                debe_fallar("select * from public.prestar_libro(1, '12345678-5');", "atrasada")
            prueba("bloquea al lector con libros atrasados", bloqueo_por_atraso)

            prueba("no renueva un préstamo atrasado",
                   lambda: debe_fallar(
                       "select * from public.renovar_prestamo((select id from public.prestamos where estado='activo' and lector_id=1 limit 1));",
                       "atrasado"))

            def copias_menores_que_prestadas():
                # ajustar_copias() exige es_admin(): la sesión de librero no
                # alcanza aquí tampoco.
                como(uid_admin)
                try:
                    debe_fallar("select * from public.ajustar_copias(2, 0);", "prestado")
                finally:
                    como(uid_librero)
            prueba("no deja menos ejemplares que los prestados", copias_menores_que_prestadas)

            # --- Reservas: fila de espera cuando no hay ejemplares (022) ---
            # Estado de partida: libro 2 (La Araucana) con stock=0, copias=1,
            # un préstamo activo de María (lector 1), atrasado desde la
            # prueba anterior. Libro 1 (Subterra) con stock=3, sin préstamos
            # activos (el suyo ya se devolvió más arriba).
            print("\n  Reservas:")

            def reserva_exitosa():
                r = correr(srv, "select reserva_id, posicion_en_fila from public.reservar_libro(2, '11111111-1');")
                assert '1' in r, f"la posición debía ser 1, se leyó: {r}"
            prueba("reservar_libro() encola cuando no hay stock", reserva_exitosa)

            # Se usa a Pedro, no a María: María ya está atrasada en el libro 2
            # (prueba "bloquea al lector con libros atrasados", más arriba) y
            # reservar_libro() —igual que prestar_libro()— revisa eso antes
            # que el stock, así que con ella la prueba fallaría por el
            # motivo equivocado.
            prueba("reservar_libro() rechaza un libro con stock disponible",
                   lambda: debe_fallar("select * from public.reservar_libro(1, '11111111-1');", "disponibles"))

            prueba("reservar_libro() rechaza una reserva duplicada del mismo lector",
                   lambda: debe_fallar("select * from public.reservar_libro(2, '11111111-1');", "ya tiene"))

            def cancelar_activa():
                rid = correr(srv, "select id from public.reservas where libro_id = 2 and lector_id = 2 and estado = 'activa';").split('\n')[2].strip()
                correr(srv, f"select public.cancelar_reserva({rid});")
                r = correr(srv, "select stock from public.libros where id = 2;")
                assert '0' in r, f"cancelar una reserva 'activa' no debía tocar el stock, se leyó: {r}"
            prueba("cancelar_reserva() en estado 'activa' no toca el stock", cancelar_activa)

            prueba("reservar_libro() vuelve a aceptar tras la cancelación",
                   lambda: correr(srv, "select * from public.reservar_libro(2, '11111111-1');"))

            def devolucion_aparta():
                pid = correr(srv, "select id from public.prestamos where libro_id = 2 and estado = 'activo';").split('\n')[2].strip()
                correr(srv, f"select public.devolver_prestamo({pid});")
                r_stock = correr(srv, "select stock from public.libros where id = 2;")
                assert '0' in r_stock, f"con alguien esperando, el stock NO debía subir, se leyó: {r_stock}"
                r_estado = correr(srv, "select estado, vence_apartado_en is not null from public.reservas where libro_id = 2 and lector_id = 2;")
                assert 'apartada' in r_estado and 't' in r_estado, f"la reserva debía pasar a 'apartada' con plazo, se leyó: {r_estado}"
            prueba("devolver_prestamo() aparta el ejemplar para quien espera, en vez de subir el stock", devolucion_aparta)

            def ajustar_copias_respeta_apartados():
                como(uid_admin)
                try:
                    debe_fallar("select * from public.ajustar_copias(2, 0);", "apartado")
                finally:
                    como(uid_librero)
            prueba("ajustar_copias() no deja bajar de lo apartado por una reserva", ajustar_copias_respeta_apartados)

            def corregir_inventario_respeta_apartados():
                como(uid_admin)
                try:
                    correr(srv, "select * from public.corregir_inventario(2);")
                    r = correr(srv, "select stock from public.libros where id = 2;")
                    assert '0' in r, f"corregir_inventario() no debía liberar un ejemplar apartado, se leyó: {r}"
                finally:
                    como(uid_librero)
            prueba("corregir_inventario() no libera un ejemplar apartado", corregir_inventario_respeta_apartados)

            def revisar_inventario_sin_falso_positivo():
                r = correr(srv, "select libro_id from public.revisar_inventario() where libro_id = 2;")
                filas = [f for f in r.split('\n')[2:] if f.strip() and not f.strip().startswith('(')]
                assert not filas, f"un ejemplar apartado no es una discrepancia de inventario: {filas}"
            prueba("revisar_inventario() no marca un ejemplar apartado como discrepancia", revisar_inventario_sin_falso_positivo)

            def eliminar_libro_bloqueado_por_reserva():
                como(uid_admin)
                try:
                    debe_fallar("select public.eliminar_libro(2);", "reserva")
                finally:
                    como(uid_librero)
            prueba("eliminar_libro() rechaza un libro con una reserva vigente", eliminar_libro_bloqueado_por_reserva)

            def retiro_convierte_en_prestamo():
                rid = correr(srv, "select id from public.reservas where libro_id = 2 and lector_id = 2 and estado = 'apartada';").split('\n')[2].strip()
                correr(srv, f"select * from public.retirar_reserva({rid});")
                r_stock = correr(srv, "select stock from public.libros where id = 2;")
                assert '0' in r_stock, f"retirar_reserva() no debía tocar el stock, se leyó: {r_stock}"
                r_prestamo = correr(srv, "select count(*) from public.prestamos where libro_id = 2 and lector_id = 2 and estado = 'activo';")
                assert '1' in r_prestamo, f"debía quedar un préstamo activo para quien retiró, se leyó: {r_prestamo}"
            prueba("retirar_reserva() convierte el apartado en préstamo sin tocar el stock", retiro_convierte_en_prestamo)

            prueba("cancelar_reserva() rechaza una reserva ya cumplida",
                   lambda: debe_fallar(
                       "select public.cancelar_reserva((select id from public.reservas where libro_id = 2 and lector_id = 2 and estado = 'cumplida'));",
                       "vigente"))

            prueba("retirar_reserva() rechaza una reserva que no está apartada",
                   lambda: debe_fallar(
                       "select * from public.retirar_reserva((select id from public.reservas where libro_id = 2 and lector_id = 2 and estado = 'cumplida'));",
                       "apartado"))

            def expiracion_libera_sin_espera():
                # Se crea a mano una reserva 'apartada' ya vencida sobre el
                # libro 1 (Subterra), para probar expirar_reservas_vencidas()
                # sin depender de otro flujo. Esa función corre sin sesión de
                # usuario (la invoca el Edge Function con la service_role key,
                # ver 010_consolidacion.sql), así que se llama con como(None).
                correr(srv, """
                  update public.libros set stock = stock - 1 where id = 1;
                  insert into public.reservas (libro_id, lector_id, estado, apartada_en, vence_apartado_en)
                  values (1, 2, 'apartada', now() - interval '3 days', now() - interval '1 day');
                """)
                como(None)
                try:
                    r = correr(srv, "select public.expirar_reservas_vencidas();")
                finally:
                    como(uid_librero)
                assert '1' in r, f"debía reportar 1 reserva expirada, se leyó: {r}"
                r_estado = correr(srv, "select estado from public.reservas where libro_id = 1 and lector_id = 2 order by id desc limit 1;")
                assert 'expirada' in r_estado, f"la reserva debía quedar 'expirada', se leyó: {r_estado}"
                r_stock = correr(srv, "select stock from public.libros where id = 1;")
                assert '3' in r_stock, f"sin nadie más esperando, el stock debía volver a subir, se leyó: {r_stock}"
            prueba("expirar_reservas_vencidas() libera el ejemplar cuando nadie más espera", expiracion_libera_sin_espera)

            # --- Personal: listar, asignar rol, eliminar ---
            print("\n  Personal:")

            def crear_cuenta_personal(correo):
                uid = correr(
                    srv, f"insert into auth.users (email) values ('{correo}') returning id;"
                ).split('\n')[2].strip()
                return uid

            def listar_personal_como_admin():
                como(uid_admin)
                try:
                    correr(srv, "select * from public.listar_personal();")
                finally:
                    como(uid_librero)
            prueba("listar_personal() responde para un administrador", listar_personal_como_admin)

            def eliminar_personal_rechaza_a_librero():
                # es_admin() debe bloquear a quien no lo es, sin importar a quién
                # intente eliminar.
                debe_fallar(f"select public.eliminar_personal('{uid_librero}');", "administrador")
            prueba("eliminar_personal() rechaza a quien no es administrador", eliminar_personal_rechaza_a_librero)

            def eliminar_personal_rechaza_autoeliminacion():
                como(uid_admin)
                try:
                    debe_fallar(f"select public.eliminar_personal('{uid_admin}');", "propia cuenta")
                finally:
                    como(uid_librero)
            prueba("eliminar_personal() no deja que un administrador se elimine a sí mismo",
                   eliminar_personal_rechaza_autoeliminacion)

            def eliminar_personal_borra_cuenta():
                uid_baja = crear_cuenta_personal('personal-de-baja@futrono.cl')
                correr(srv, f"""
                  insert into public.usuarios (id, email, rol)
                  values ('{uid_baja}', 'personal-de-baja@futrono.cl', 'librero');
                """)
                como(uid_admin)
                try:
                    correr(srv, f"select public.eliminar_personal('{uid_baja}');")
                finally:
                    como(uid_librero)
                r = correr(srv, f"select count(*) from auth.users where id = '{uid_baja}';")
                assert '0' in r.split('\n')[2], f"la cuenta debió desaparecer de auth.users, se leyó: {r}"
                r = correr(srv, f"select count(*) from public.usuarios where id = '{uid_baja}';")
                assert '0' in r.split('\n')[2], f"la cuenta debió desaparecer de usuarios, se leyó: {r}"
            prueba("eliminar_personal() borra el perfil y la cuenta de acceso", eliminar_personal_borra_cuenta)

            # --- Escaneo remoto sin sesión ---
            print("\n  Escaneo remoto sin sesión:")

            def crea_enlace_y_devuelve_token():
                como(uid_librero)
                r = correr(srv, "select token from public.crear_enlace_escaneo(4);")
                return r.split('\n')[2].strip()

            def anon():
                UID_SIMULADO['valor'] = None

            def valida_enlace_recien_creado():
                token = crea_enlace_y_devuelve_token()
                anon()
                try:
                    r = correr(srv, f"select valido from public.validar_enlace_escaneo('{token}');")
                    assert 't' in r.split('\n')[2], f"un enlace recién creado debió ser válido, se leyó: {r}"
                finally:
                    como(uid_librero)
            prueba("validar_enlace_escaneo() acepta un enlace recién creado", valida_enlace_recien_creado)

            def valida_token_inventado():
                r = correr(srv, "select valido from public.validar_enlace_escaneo('token-que-no-existe');")
                assert 'f' in r.split('\n')[2], f"un token inventado no debió validar, se leyó: {r}"
            prueba("validar_enlace_escaneo() rechaza un token inventado", valida_token_inventado)

            def agrega_libro_nuevo_por_enlace():
                token = crea_enlace_y_devuelve_token()
                anon()
                try:
                    r = correr(srv, f"""
                      select estado from public.agregar_libro_remoto(
                        '{token}', 'REMOTO-1', 'Libro agregado remoto', 'Autor Remoto', null, null, 2);
                    """)
                    assert 'creado' in r.split('\n')[2], f"debió crear el libro, se leyó: {r}"
                finally:
                    como(uid_librero)
                r = correr(srv, "select stock, copias_totales from public.libros where isbn = 'REMOTO-1';")
                assert '2' in r.split('\n')[2], f"el libro nuevo debió quedar con 2 ejemplares, se leyó: {r}"
            prueba("agregar_libro_remoto() crea un libro nuevo con un enlace válido", agrega_libro_nuevo_por_enlace)

            def agregar_libro_remoto_sin_titulo_pide_info():
                token = crea_enlace_y_devuelve_token()
                anon()
                try:
                    r = correr(srv, f"select estado from public.agregar_libro_remoto('{token}', 'ISBN-SIN-TITULO');")
                    assert 'falta_info' in r.split('\n')[2], f"debió pedir los datos, se leyó: {r}"
                finally:
                    como(uid_librero)
                r = correr(srv, "select count(*) from public.libros where isbn = 'ISBN-SIN-TITULO';")
                assert '0' in r.split('\n')[2], "no debió crear nada mientras faltan los datos"
            prueba("agregar_libro_remoto() pide los datos si el ISBN es nuevo y no llegó título",
                   agregar_libro_remoto_sin_titulo_pide_info)

            def agregar_libro_remoto_ya_no_repone_en_silencio():
                # Hasta el 22 de agosto de 2026 esta llamada sumaba 5 al
                # stock ('incrementado'). Ahora debe limitarse a avisar que
                # el libro ya existe, sin escribir nada — ver el punto 3 de
                # «ESCANEO REMOTO SIN SESIÓN» en 010_consolidacion.sql.
                token = crea_enlace_y_devuelve_token()
                anon()
                try:
                    r = correr(srv, f"""
                      select estado from public.agregar_libro_remoto('{token}', '9789561117', null, null, null, null, 5);
                    """)
                    assert 'existe' in r.split('\n')[2], f"debió avisar que ya existe, se leyó: {r}"
                finally:
                    como(uid_librero)
                r = correr(srv, "select stock, copias_totales from public.libros where isbn = '9789561117';")
                linea = r.split('\n')[2]
                assert '3' in linea, f"el stock NO debió cambiar (seguía en 3), se leyó: {r}"
            prueba("agregar_libro_remoto() ya no repone ejemplares de un libro que ya existe",
                   agregar_libro_remoto_ya_no_repone_en_silencio)

            def consultar_libro_remoto_libro_sin_nadie():
                # Subterra (9789561117 / libro 1) no tiene préstamo ni reserva
                # VIGENTE en este punto: su único préstamo ya se devolvió
                # (línea ~371) y su única reserva ya quedó 'expirada' —no
                # 'activa'/'apartada'— en expiracion_libera_sin_espera() más
                # arriba, así que no debe aparecer en la consulta.
                token = crea_enlace_y_devuelve_token()
                anon()
                try:
                    r = correr(srv, f"select encontrado, titulo, tipo, stock from public.consultar_libro_remoto('{token}', '9789561117');")
                    linea = r.split('\n')[2]
                    assert linea.strip().startswith('t'), f"debió encontrar el libro, se leyó: {r}"
                    assert 'Subterra' in r, f"debió traer el título, se leyó: {r}"
                finally:
                    como(uid_librero)
            prueba("consultar_libro_remoto() dice tipo vacío cuando nadie tiene el libro",
                   consultar_libro_remoto_libro_sin_nadie)

            def consultar_libro_remoto_codigo_inexistente():
                token = crea_enlace_y_devuelve_token()
                anon()
                try:
                    r = correr(srv, f"select encontrado, isbn from public.consultar_libro_remoto('{token}', 'NO-EXISTE-EN-CATALOGO');")
                    linea = r.split('\n')[2]
                    assert linea.strip().startswith('f'), f"no debió encontrar nada, se leyó: {r}"
                    assert 'NO-EXISTE-EN-CATALOGO' in r, f"debió devolver el código buscado, se leyó: {r}"
                finally:
                    como(uid_librero)
            prueba("consultar_libro_remoto() dice encontrado=false si el código no está en el catálogo",
                   consultar_libro_remoto_codigo_inexistente)

            def consultar_libro_remoto_rechaza_token_invalido():
                anon()
                try:
                    debe_fallar(
                        "select * from public.consultar_libro_remoto('token-inventado', '9789561117');",
                        "no es válido")
                finally:
                    como(uid_librero)
            prueba("consultar_libro_remoto() rechaza un token inventado",
                   consultar_libro_remoto_rechaza_token_invalido)

            def consultar_libro_remoto_muestra_prestamo():
                # Mismo patrón que deshacer_creado_no_borra_si_ya_hay_prestamo:
                # libro propio + lector propio + préstamo insertado a mano.
                como(uid_librero)
                r = correr(srv, f"""
                  select libro_id from public.agregar_libro_remoto(
                    '{crea_enlace_y_devuelve_token()}', 'CONSULTA-PRESTADO', 'Libro Prestado Consulta', 'Autor', null, null, 1);
                """)
                libro_id = r.split('\n')[2].strip()
                correr(srv, """
                  insert into public.lectores (rut, nombre, email, telefono)
                  values ('33333333-6', 'Lector Consulta Remota', 'consulta@y.cl', '+56933333333');
                """)
                correr(srv, f"""
                  insert into public.prestamos (libro_id, lector_id, fecha_devolucion_esperada, estado)
                  values ({libro_id}, (select id from public.lectores where rut = '33333333-6'), current_date + 7, 'activo');
                """)
                token = crea_enlace_y_devuelve_token()
                anon()
                try:
                    r = correr(srv, f"select tipo, persona_nombre, persona_rut from public.consultar_libro_remoto('{token}', 'CONSULTA-PRESTADO');")
                    assert 'prestamo' in r, f"debió mostrar tipo=prestamo, se leyó: {r}"
                    assert 'Lector Consulta Remota' in r, f"debió traer el nombre del lector, se leyó: {r}"
                    assert '33333333-6' in r, f"debió traer el RUT del lector, se leyó: {r}"
                finally:
                    como(uid_librero)
            prueba("consultar_libro_remoto() muestra nombre y RUT de quien tiene el préstamo activo",
                   consultar_libro_remoto_muestra_prestamo)

            def consultar_libro_remoto_muestra_reserva():
                como(uid_librero)
                correr(srv, """
                  insert into public.libros (isbn, titulo, autor, stock, copias_totales)
                  values ('CONSULTA-RESERVADO', 'Libro Reservado Consulta', 'Autor', 0, 1);
                  insert into public.lectores (rut, nombre, email, telefono)
                  values ('44444444-7', 'Lector Reserva Remota', 'reserva@y.cl', '+56944444444');
                """)
                libro_id = correr(srv, "select id from public.libros where isbn = 'CONSULTA-RESERVADO';").split('\n')[2].strip()
                correr(srv, f"select * from public.reservar_libro({libro_id}, '44444444-7');")
                token = crea_enlace_y_devuelve_token()
                anon()
                try:
                    r = correr(srv, f"select tipo, reserva_estado, persona_nombre, persona_rut from public.consultar_libro_remoto('{token}', 'CONSULTA-RESERVADO');")
                    # La cabecera de la columna "reserva_estado" ya contiene la
                    # palabra "reserva", así que ese chequeo se hace solo sobre
                    # la fila de datos (línea 2), no sobre todo `r`.
                    linea = r.split('\n')[2]
                    assert 'reserva' in linea, f"debió mostrar tipo=reserva, se leyó: {r}"
                    assert 'activa' in linea, f"debió traer el estado de la reserva, se leyó: {r}"
                    assert 'Lector Reserva Remota' in r, f"debió traer el nombre del lector, se leyó: {r}"
                    assert '44444444-7' in r, f"debió traer el RUT del lector, se leyó: {r}"
                finally:
                    como(uid_librero)
            prueba("consultar_libro_remoto() muestra nombre y RUT de quien tiene la reserva vigente",
                   consultar_libro_remoto_muestra_reserva)

            def agregar_libro_remoto_rechaza_token_invalido():
                anon()
                try:
                    debe_fallar(
                        "select * from public.agregar_libro_remoto('token-inventado', '000', 'X', 'Y');",
                        "no es válido")
                finally:
                    como(uid_librero)
            prueba("agregar_libro_remoto() rechaza un token inventado", agregar_libro_remoto_rechaza_token_invalido)

            def deshacer_creado_elimina_el_libro():
                token = crea_enlace_y_devuelve_token()
                anon()
                try:
                    r = correr(srv, f"""
                      select libro_id from public.agregar_libro_remoto(
                        '{token}', 'DESHACER-CREADO', 'Libro Para Deshacer', 'Autor X', null, null, 1);
                    """)
                    libro_id = r.split('\n')[2].strip()
                    r = correr(srv, f"select deshecho from public.deshacer_libro_remoto('{token}', {libro_id});")
                    assert 't' in r.split('\n')[2], f"debió deshacerse, se leyó: {r}"
                finally:
                    como(uid_librero)
                r = correr(srv, "select count(*) from public.libros where isbn = 'DESHACER-CREADO';")
                assert '0' in r.split('\n')[2], f"el libro debió eliminarse del catálogo, se leyó: {r}"
            prueba("deshacer_libro_remoto() elimina un libro recién creado ('creado')", deshacer_creado_elimina_el_libro)

            def simular_incrementado_legado(isbn, stock_base, cantidad):
                """Reconstruye a mano un movimiento 'incrementado' de los que
                agregar_libro_remoto ya no genera desde el 22 de agosto de
                2026 (ver el punto 3 de «ESCANEO REMOTO SIN SESIÓN»). Antes
                estos tres deshacer_libro_remoto_*() lo producían llamando a
                agregar_libro_remoto con un ISBN ya existente; ahora esa
                llamada no escribe nada, así que el escenario histórico que
                deshacer_libro_remoto sigue teniendo que saber revertir se
                arma directamente en auditoria, tal como habría quedado
                ANTES del cambio. Devuelve (token, libro_id)."""
                como(uid_librero)
                correr(srv, f"""
                  insert into public.libros (isbn, titulo, autor, stock, copias_totales)
                  values ('{isbn}', 'Base', 'Autor', {stock_base}, {stock_base});
                """)
                token = crea_enlace_y_devuelve_token()
                enlace_id = correr(srv, "select id from public.enlaces_escaneo_remoto order by id desc limit 1;").split('\n')[2].strip()
                libro_id = correr(srv, f"select id from public.libros where isbn = '{isbn}';").split('\n')[2].strip()
                import re
                if not re.match(r'^[a-zA-Z0-9_]+$', str(libro_id)):
                    raise ValueError("Invalid input")
                if not re.match(r'^[a-zA-Z0-9_]+$', str(enlace_id)):
                    raise ValueError("Invalid input")
                nuevo_total = stock_base + cantidad
                correr(srv, f"""
                  update public.libros set stock = {nuevo_total}, copias_totales = {nuevo_total} where id = {libro_id};
                  insert into public.auditoria (tabla, registro_id, accion, datos_despues)
                  values ('libros', {libro_id}, 'UPDATE',
                    jsonb_build_object('operacion', 'escaneo_remoto', 'enlace_id', {enlace_id},
                                        'ejemplares_agregados', {cantidad}, 'copias_totales', {nuevo_total}));
                """)
                return token, libro_id

            def deshacer_incrementado_resta_lo_agregado():
                token, libro_id = simular_incrementado_legado('DESHACER-INCR', 2, 3)
                r = correr(srv, "select stock, copias_totales from public.libros where isbn = 'DESHACER-INCR';")
                assert '5' in r.split('\n')[2], f"debió quedar en 5 (base 2 + 3), se leyó: {r}"
                anon()
                try:
                    r = correr(srv, f"select deshecho from public.deshacer_libro_remoto('{token}', {libro_id});")
                    assert 't' in r.split('\n')[2], f"debió deshacerse, se leyó: {r}"
                finally:
                    como(uid_librero)
                r = correr(srv, "select stock, copias_totales from public.libros where isbn = 'DESHACER-INCR';")
                assert '2' in r.split('\n')[2], f"stock y copias_totales debieron volver a 2, se leyó: {r}"
            prueba("deshacer_libro_remoto() resta exactamente lo agregado en un 'incrementado' (histórico)",
                   deshacer_incrementado_resta_lo_agregado)

            def deshacer_no_resta_mas_de_lo_disponible():
                token, libro_id = simular_incrementado_legado('DESHACER-PARCIAL', 0, 2)
                # Simula que, entre agregar y deshacer, ya se prestaron los 2
                # ejemplares recién sumados: no debe quedar nada por restar.
                correr(srv, f"update public.libros set stock = 0 where id = {libro_id};")
                anon()
                try:
                    r = correr(srv, f"select deshecho, motivo from public.deshacer_libro_remoto('{token}', {libro_id});")
                    linea = r.split('\n')[2]
                    assert ' f ' in linea or linea.strip().startswith('f'), \
                        f"no debió poder deshacer con 0 de stock disponible, se leyó: {r}"
                    assert 'prestado' in r.lower(), f"no explicó el motivo, se leyó: {r}"
                finally:
                    como(uid_librero)
                r = correr(srv, f"select stock, copias_totales from public.libros where id = {libro_id};")
                linea = r.split('\n')[2]
                assert '0' in linea and '2' in linea, f"no debió tocar el inventario, se leyó: {r}"
            prueba("deshacer_libro_remoto() no resta ejemplares que ya se prestaron",
                   deshacer_no_resta_mas_de_lo_disponible)

            def deshacer_creado_no_borra_si_ya_hay_prestamo():
                token = crea_enlace_y_devuelve_token()
                anon()
                try:
                    r = correr(srv, f"""
                      select libro_id from public.agregar_libro_remoto(
                        '{token}', 'DESHACER-PRESTADO', 'Libro Prestado', 'Autor', null, null, 1);
                    """)
                    libro_id = r.split('\n')[2].strip()
                finally:
                    como(uid_librero)
                correr(srv, """
                  insert into public.lectores (rut, nombre, email, telefono)
                  values ('22222222-5', 'Lector Para Prestamo Remoto', 'y@y.cl', '+56922222222');
                """)
                r = correr(srv, "select id from public.lectores where rut = '22222222-5';")
                lector_id = r.split('\n')[2].strip()
                correr(srv, f"""
                  insert into public.prestamos (libro_id, lector_id, fecha_devolucion_esperada, estado)
                  values ({libro_id}, {lector_id}, current_date + 7, 'activo');
                """)
                anon()
                try:
                    r = correr(srv, f"select deshecho, motivo from public.deshacer_libro_remoto('{token}', {libro_id});")
                    linea = r.split('\n')[2]
                    assert ' f ' in linea or linea.strip().startswith('f'), \
                        f"no debió poder borrar un libro con préstamo, se leyó: {r}"
                    assert 'préstamo' in r.lower() or 'prestamo' in r.lower(), f"no explicó el motivo, se leyó: {r}"
                finally:
                    como(uid_librero)
                r = correr(srv, f"select count(*) from public.libros where id = {libro_id};")
                assert '1' in r.split('\n')[2], f"el libro no debió eliminarse, se leyó: {r}"
            prueba("deshacer_libro_remoto() no elimina un libro que ya tiene un préstamo",
                   deshacer_creado_no_borra_si_ya_hay_prestamo)

            def deshacer_rechaza_un_enlace_que_no_hizo_esa_accion():
                # El hueco de seguridad de la primera versión: CUALQUIER
                # enlace vigente podía deshacer CUALQUIER libro del catálogo,
                # no solo los que su propio enlace había tocado. Un segundo
                # enlace, válido, intenta deshacer lo que hizo el primero.
                token_a = crea_enlace_y_devuelve_token()
                anon()
                try:
                    r = correr(srv, f"""
                      select libro_id from public.agregar_libro_remoto(
                        '{token_a}', 'DESHACER-AJENO', 'Libro De Otro Enlace', 'Autor', null, null, 1);
                    """)
                    libro_id = r.split('\n')[2].strip()
                finally:
                    como(uid_librero)
                token_b = crea_enlace_y_devuelve_token()
                anon()
                try:
                    r = correr(srv, f"select deshecho, motivo from public.deshacer_libro_remoto('{token_b}', {libro_id});")
                    linea = r.split('\n')[2]
                    assert ' f ' in linea or linea.strip().startswith('f'), \
                        f"un enlace no debió poder deshacer lo que hizo otro, se leyó: {r}"
                    assert 'no fue el que' in r.lower(), f"no explicó el motivo, se leyó: {r}"
                finally:
                    como(uid_librero)
                r = correr(srv, "select count(*) from public.libros where isbn = 'DESHACER-AJENO';")
                assert '1' in r.split('\n')[2], f"el libro no debió tocarse, se leyó: {r}"
            prueba("deshacer_libro_remoto() rechaza un enlace que no fue el que hizo esa acción",
                   deshacer_rechaza_un_enlace_que_no_hizo_esa_accion)

            def deshacer_rechaza_deshacer_dos_veces():
                token = crea_enlace_y_devuelve_token()
                anon()
                try:
                    r = correr(srv, f"""
                      select libro_id from public.agregar_libro_remoto(
                        '{token}', 'DESHACER-DOBLE', 'Libro Deshecho Dos Veces', 'Autor', null, null, 1);
                    """)
                    libro_id = r.split('\n')[2].strip()
                    r = correr(srv, f"select deshecho from public.deshacer_libro_remoto('{token}', {libro_id});")
                    assert 't' in r.split('\n')[2], f"el primer deshacer debió funcionar, se leyó: {r}"
                    # El libro ya no existe (era 'creado'), así que un segundo
                    # intento debe fallar por "ya no está en el catálogo" —
                    # ambos motivos son válidos, lo que importa es que no
                    # vuelva a decir deshecho=true.
                    r = correr(srv, f"select deshecho, motivo from public.deshacer_libro_remoto('{token}', {libro_id});")
                    linea = r.split('\n')[2]
                    assert ' f ' in linea or linea.strip().startswith('f'), \
                        f"no debió poder deshacer dos veces, se leyó: {r}"
                finally:
                    como(uid_librero)
            prueba("deshacer_libro_remoto() no deja deshacer la misma acción dos veces ('creado')",
                   deshacer_rechaza_deshacer_dos_veces)

            def deshacer_incrementado_rechaza_deshacer_dos_veces():
                token, libro_id = simular_incrementado_legado('DESHACER-DOBLE-INCR', 1, 2)
                anon()
                try:
                    r = correr(srv, f"select deshecho from public.deshacer_libro_remoto('{token}', {libro_id});")
                    assert 't' in r.split('\n')[2], f"el primer deshacer debió funcionar, se leyó: {r}"
                    r = correr(srv, f"select deshecho, motivo from public.deshacer_libro_remoto('{token}', {libro_id});")
                    linea = r.split('\n')[2]
                    assert ' f ' in linea or linea.strip().startswith('f'), \
                        f"no debió poder deshacer dos veces, se leyó: {r}"
                    assert 'ya se había deshecho' in r.lower(), f"no explicó el motivo, se leyó: {r}"
                finally:
                    como(uid_librero)
                r = correr(srv, f"select stock, copias_totales from public.libros where isbn = 'DESHACER-DOBLE-INCR';")
                linea = r.split('\n')[2]
                assert '1' in linea, f"el segundo intento no debió tocar el inventario, se leyó: {r}"
            prueba("deshacer_libro_remoto() no deja deshacer la misma acción dos veces ('incrementado', histórico)",
                   deshacer_incrementado_rechaza_deshacer_dos_veces)

            def deshacer_libro_remoto_rechaza_token_invalido():
                anon()
                try:
                    debe_fallar(
                        "select * from public.deshacer_libro_remoto('token-inventado', 1);",
                        "no es válido")
                finally:
                    como(uid_librero)
            prueba("deshacer_libro_remoto() rechaza un token inventado", deshacer_libro_remoto_rechaza_token_invalido)

            def revoca_enlace_propio():
                token = crea_enlace_y_devuelve_token()
                r = correr(srv, "select id from public.enlaces_escaneo_remoto order by id desc limit 1;")
                enlace_id = r.split('\n')[2].strip()
                correr(srv, f"select public.revocar_enlace_escaneo({enlace_id});")
                anon()
                try:
                    r = correr(srv, f"select valido from public.validar_enlace_escaneo('{token}');")
                    assert 'f' in r.split('\n')[2], f"un enlace revocado no debió seguir siendo válido, se leyó: {r}"
                finally:
                    como(uid_librero)
            prueba("revocar_enlace_escaneo() invalida el enlace de inmediato", revoca_enlace_propio)

            def listar_enlaces_rechaza_a_librero():
                debe_fallar("select * from public.listar_enlaces_escaneo();", "administrador")
            prueba("listar_enlaces_escaneo() rechaza a quien no es administrador", listar_enlaces_rechaza_a_librero)

            def listar_enlaces_como_admin():
                como(uid_admin)
                try:
                    correr(srv, "select * from public.listar_enlaces_escaneo();")
                finally:
                    como(uid_librero)
            prueba("listar_enlaces_escaneo() responde para un administrador", listar_enlaces_como_admin)

            # --- Auditoría ---
            print("\n  Auditoría:")
            def auditoria_registra():
                correr(srv, "insert into public.libros (isbn, titulo, autor, stock, copias_totales) values ('AUD-1','Prueba','X',1,1);")
                r = correr(srv, "select count(*) from public.auditoria where tabla='libros';")
                # Antes se probaba con `'0' not in texto`, que da un falso negativo
                # apenas el conteo llega a un número de dos cifras que contenga un
                # 0 (10, 20, 100...) — justo lo que empezó a pasar al sumarse las
                # pruebas del escaneo remoto. Se compara el número, no el texto.
                conteo = int(r.split('\n')[2].strip()) if len(r.split('\n')) > 2 else 0
                assert conteo > 0, f"no registró, se leyó: {r}"
            prueba("el trigger registra los movimientos", auditoria_registra)

            def auditoria_no_bloquea():
                # Se rompe la tabla de auditoría a propósito. La inserción debe
                # completarse igual: la bitácora nunca debe impedir la operación.
                # Todo va en una sola sesión porque el renombrado y la inserción
                # deben ocurrir juntos.
                correr(srv, """
                  alter table public.auditoria rename to auditoria_oculta;
                  insert into public.libros (isbn, titulo, autor, stock, copias_totales)
                  values ('AUD-2','Prueba sin bitacora','Y',1,1);
                  alter table public.auditoria_oculta rename to auditoria;
                """)
                r = correr(srv, "select count(*) from public.libros where isbn = 'AUD-2';")
                assert '1' in r, "la inserción se revirtió: la auditoría bloqueó la operación"
            prueba("si la auditoría falla, la operación NO se bloquea", auditoria_no_bloquea)

            # --- Lápidas de eliminación (migración 015, requisito de la Fase 1.2) ---
            print("\n  Lápidas de eliminación (Fase 1.2):")

            def lapida_de_lector():
                # Lector y libro desechables, para no tocar los datos que usan
                # las demás pruebas (el lector_id=1 de "anonimiza()", más abajo).
                correr(srv, """
                  insert into public.lectores (rut, nombre, email, telefono)
                  values ('11111111-9', 'Desechable Para Prueba', 'x@x.cl', '+56911111111');
                """)
                r = correr(srv, "select id from public.lectores where rut = '11111111-9';")
                lector_id = r.split('\n')[2].strip()
                correr(srv, f"delete from public.lectores where id = {lector_id};")
                r = correr(srv, f"select eliminado_en from public.elementos_eliminados where tabla = 'lectores' and id = {lector_id};")
                assert len(r.split('\n')) > 2 and r.split('\n')[2].strip(), \
                    f"no quedó lápida del lector {lector_id}, se leyó: {r}"
            prueba("borrar un lector deja lápida en elementos_eliminados", lapida_de_lector)

            def lapida_de_libro():
                correr(srv, """
                  insert into public.libros (isbn, titulo, autor, stock, copias_totales)
                  values ('LAP-1', 'Desechable Para Prueba', 'X', 1, 1);
                """)
                r = correr(srv, "select id from public.libros where isbn = 'LAP-1';")
                libro_id = r.split('\n')[2].strip()
                correr(srv, f"delete from public.libros where id = {libro_id};")
                r = correr(srv, f"select eliminado_en from public.elementos_eliminados where tabla = 'libros' and id = {libro_id};")
                assert len(r.split('\n')) > 2 and r.split('\n')[2].strip(), \
                    f"no quedó lápida del libro {libro_id}, se leyó: {r}"
            prueba("borrar un libro deja lápida en elementos_eliminados", lapida_de_libro)

            # No se prueba aquí "un anónimo no ve ninguna lápida": este arnés
            # de pruebas se conecta siempre con el mismo rol de Postgres (ver
            # correr(), más arriba) y solo simula auth.uid() con una variable
            # de sesión — nunca cambia de ROLE de verdad, así que una lectura
            # cruda de la tabla no ejercita la RLS por rol tal como la vería
            # PostgREST en producción. Lo que SÍ se puede probar aquí, y es lo
            # que importa, es que elementos_eliminados quedó protegida: se
            # reutiliza verificar_rls() (función de administración ya
            # existente, ver arriba) para confirmar que la tabla nueva tiene
            # RLS activo y con política, igual que las demás.
            def verificar_rls_incluye_elementos_eliminados():
                como(uid_admin)
                try:
                    r = correr(srv, "select tabla, rls_activo, politicas, diagnostico from public.verificar_rls() where tabla = 'elementos_eliminados';")
                    assert 'elementos_eliminados' in r, f"verificar_rls() no reportó la tabla nueva, se leyó: {r}"
                    assert 'Correcto' in r, f"elementos_eliminados no quedó con RLS + política correctas, se leyó: {r}"
                finally:
                    como(uid_librero)
            prueba("verificar_rls() confirma que elementos_eliminados quedó protegida", verificar_rls_incluye_elementos_eliminados)

            def verificar_rls_incluye_tablas_nuevas():
                # enlaces_escaneo_remoto (014) y respaldos_log (018) llevaban
                # dos migraciones sin sumarse a la lista fija de verificar_rls()
                # — se detectó al construir verificar_politicas() y se corrigió
                # en la misma edición de la 010. enlaces_escaneo_remoto tiene
                # RLS activo con CERO políticas a propósito (solo se accede vía
                # funciones security definer), así que ahí NO debe decir
                # 'CRÍTICO' pese a no tener ninguna política.
                como(uid_admin)
                try:
                    r = correr(srv, "select tabla, rls_activo, politicas, diagnostico from public.verificar_rls() where tabla in ('enlaces_escaneo_remoto', 'respaldos_log');")
                    assert 'enlaces_escaneo_remoto' in r, f"verificar_rls() no reportó enlaces_escaneo_remoto, se leyó: {r}"
                    assert 'respaldos_log' in r, f"verificar_rls() no reportó respaldos_log, se leyó: {r}"
                    assert 'CRÍTICO' not in r, f"verificar_rls() marcó CRÍTICO alguna de las dos tablas nuevas, se leyó: {r}"
                finally:
                    como(uid_librero)
            prueba("verificar_rls() incluye enlaces_escaneo_remoto y respaldos_log", verificar_rls_incluye_tablas_nuevas)

            # --- Derechos del titular ---
            print("\n  Cumplimiento (Ley 21.719):")
            # Se reutiliza el admin de la 003 (nicolasd.carrillo@gmail.com):
            # ya tiene rol 'admin' en public.usuarios desde que se aplicó esa
            # migración, así que es_admin() lo reconoce sin más.
            como(uid_admin)

            prueba("exportar_datos_lector() entrega el historial",
                   lambda: correr(srv, "select public.exportar_datos_lector('12345678-5');"))

            def anonimiza():
                # Primero se devuelven sus préstamos activos
                correr(srv, """select public.devolver_prestamo(id) from public.prestamos
                               where lector_id = 1 and estado = 'activo';""")
                correr(srv, "select public.anonimizar_lector(1, 'prueba');")
                r = correr(srv, "select rut from public.lectores where id = 1;")
                assert 'ANON-' in r, f"el RUT debió quedar anonimizado, se leyó: {r}"
            prueba("anonimizar_lector() borra los datos personales", anonimiza)

            def no_anonimiza_con_prestamos():
                # Se le presta un libro al lector 2 para que tenga un préstamo
                # activo: antes esta prueba pasaba por accidente, porque nunca
                # había llegado a tener uno.
                correr(srv, "select * from public.prestar_libro(1, '11111111-1');")
                debe_fallar("select public.anonimizar_lector(2, 'prueba');", "activo")
            prueba("no anonimiza a alguien con préstamos activos", no_anonimiza_con_prestamos)

            prueba("evidencia_incidente() genera el informe",
                   lambda: correr(srv, "select public.evidencia_incidente(now() - interval '1 day', now());"))

            # --- Bibliomóvil: préstamos geolocalizados y estadísticas de paradas (027/028) ---
            print("\n  Bibliomóvil y estadísticas de paradas:")
            como(uid_librero)

            def prestamo_con_parada_y_estadisticas():
                correr(srv, "select * from public.prestar_libro(1, '11111111-1', 'Llifén', -40.198, -72.259);")
                r = correr(srv, "select parada, round(lat, 3), round(lng, 3), total_prestamos from public.estadisticas_paradas();")
                assert 'Llifén' in r and '-40.198' in r and '-72.259' in r, (
                    f"estadisticas_paradas() no devolvió la parada registrada: {r}"
                )
            prueba("prestar_libro() guarda parada/coordenadas y estadisticas_paradas() las agrupa",
                   prestamo_con_parada_y_estadisticas)

            def estadisticas_paradas_rechaza_anon():
                anon()
                try:
                    debe_fallar("select * from public.estadisticas_paradas();", "iniciar sesión")
                finally:
                    como(uid_librero)
            prueba("estadisticas_paradas() rechaza llamadas sin sesión", estadisticas_paradas_rechaza_anon)

        finally:
            if srv:
                srv.cleanup()
            shutil.rmtree(dir_datos, ignore_errors=True)

    print(f"\n{'=' * 68}")
    print(f"  Pasadas: {pasadas}    Fallidas: {fallidas}")
    if detalles:
        print(f"\n  Fallas:")
        for n, m in detalles:
            print(f"   · {n}\n     {m}")
    print('=' * 68 + '\n')
    return 1 if fallidas else 0


if __name__ == '__main__':
    sys.exit(main())
