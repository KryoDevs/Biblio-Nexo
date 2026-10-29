#!/usr/bin/env python3
"""
Prueba de punta a punta de `pruebas/restaurar-respaldo.mjs` contra PostgreSQL real.

Existe porque la casilla «Existe un respaldo y alguien probó restaurarlo» de
`SUPABASE-PASO-A-PASO.md` llevaba meses sin marcar, y la razón era concreta: no
había forma de probarlo. Un `insert` generado a mano puede verse bien en el
`cat` y fallar en la tercera tabla por una columna de identidad, un `timestamptz`
mal escapado o una secuencia que nobody movió; eso solo se descubre ejecutándolo
contra un Postgres de verdad.

Qué hace, en orden:

  1. Arranca un Postgres embebido (pgserver, el mismo de `probar-migraciones.py`)
     con el esquema base y TODAS las migraciones del repo.
  2. Mete una fila por tabla, con valores según el tipo de cada columna —leídos
     de `information_schema`, no adivinados—, para que la prueba no dependa de
     que alguien recuerde el esquema.
  3. Fabrica un JSON con la forma EXACTA de `respaldo-automatico`
     ({generado_en, tablas:{…}}), usando `json_agg(t)` de cada tabla.
  4. Llama al script del repo (no reimplementa nada) para producir `restauracion.sql`.
  5. `truncate … restart identity` — o sea, borra los datos y reinicia las
     secuencias, el peor escenario: la base quedó vacía con las secuencias en 1.
  6. Aplica el SQL y comprueba tres cosas, cada una contra un fallo real:
       · el contenido de cada tabla vuelve a ser idéntico (md5 de las filas);
       · la restauración no necesito tocar una sola coma del SQL generado;
       · el `setval` funcionó: alta un libro nuevo sin decir el `id`, y si la
         secuencia no se corrigió esto es un «duplicate key value».
  7. Y la parte de defensa: un respaldo incompleto tiene que ser un error claro,
     no una restauración a medias.

Uso:
    pip install pgserver --break-system-packages
    python3 pruebas/probar-restauracion.py
"""

import importlib.util
import json
import os
import shutil
import subprocess
import sys
import tempfile

try:
    import pgserver
except ImportError:
    sys.exit("Falta pgserver. Ejecuta: pip install pgserver --break-system-packages")

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PSQL = os.path.join(os.path.dirname(pgserver.__file__), 'pginstall', 'bin', 'psql')
NODO = shutil.which('node') or 'node'
GENERADOR = os.path.join(RAIZ, 'pruebas', 'restaurar-respaldo.mjs')

TABLAS = [
    'parametros', 'usuarios', 'libros', 'lectores', 'prestamos', 'reservas',
    'enlaces_escaneo_remoto', 'elementos_eliminados', 'auditoria', 'errores'
]

# El arnés de pruebas de `probar-migraciones.py` se reutiliza en vez de
# duplicarlo: si el esquema base o la forma de invocar psql cambia, cambia en un
# solo lugar y las dos pruebas se enteran.
_espec = importlib.util.spec_from_file_location(
    'migraciones', os.path.join(RAIZ, 'pruebas', 'probar-migraciones.py'))
migraciones = importlib.util.module_from_spec(_espec)
_espec.loader.exec_module(migraciones)

fallidas = []


def prueba(nombre, fn):
    try:
        fn()
        print(f"  ✓ {nombre}")
    except Exception as e:  # noqa: BLE001 - una prueba que revienta debe seguir contando las demás
        fallidas.append((nombre, str(e).split('\n')[0][:400]))
        print(f"  ✗ {nombre}\n      {str(e).splitlines()[0][:300] if str(e).strip() else e}")


def correr(srv, sql):
    """Ejecuta SQL sin resultado que leer (DDL, DML, migraciones)."""
    return migraciones.correr(srv, sql)


def consultar(srv, sql):
    """Consulta de una sola fila, en crudo.

    `correr()` invoca psql con `-q`, que imprime cabecera y contadores: para leer
    un JSON o un número hace falta `-tA` (solo la tupla, sin alinear). Sin esto el
    `json.loads` recibía ' json_agg / ----------' y la prueba moría antes de
    empezar — el error más tonto y más fácil de commitear de esta familia.
    """
    r = subprocess.run(
        [str(PSQL), srv.get_uri(), '-tA', '-v', 'ON_ERROR_STOP=1', '-q', '-f', '-'],
        input=sql, capture_output=True, text=True)
    if r.returncode != 0:
        lineas = [l for l in r.stderr.splitlines() if l.strip()]
        raise RuntimeError(' | '.join([l for l in lineas if 'ERROR' in l][:2])
                           or (lineas[0] if lineas else 'error sin mensaje'))
    return r.stdout.strip()


def valor_para(tipo, nombre):
    """Un valor plausible según el tipo declarado en information_schema."""
    t = tipo.lower()
    if 'serial' in t or 'identity' in t:
        return None            # que lo ponga la base
    if nombre.endswith('_id') or 'uuid' in t:
        return "gen_random_uuid()" if 'uuid' in t else "1"
    if 'bool' in t:
        return "true"
    if 'json' in t:
        return "'{}'::jsonb"
    if 'int' in t or 'numeric' in t or 'decimal' in t:
        return "1"
    if 'timestamptz' in t or 'timestamp' in t:
        return "now()"
    if 'date' in t:
        return "current_date"
    if 'interval' in t:
        return "interval '1 day'"
    if 'text' in t or 'char' in t:
        # Con apóstrofe dentro a propósito: la restauración tiene que sobrevivir
        # a "El 'ajustador' de libros", que es justamente donde se rompen los
        # generadores de SQL que escapan a mano.
        return "'prueba''con apóstrofe'"
    if 'bytea' in t:
        return "'\\x00'::bytea"
    return "null"


def meter_datos(srv):
    """Una fila por tabla, construida desde el propio diccionario de datos."""
    # `in (...)` en vez de `= any('{…}')`: un array literal de texto metido a mano
    # dentro de un string de Python es una fuente de comillas mal puestas que solo se
    # descubre cuando la prueba ya corre contra Postgres (aquí pasó).
    bruto = consultar(srv, """
      select json_agg(row_to_json(q)) from (
        select table_name, column_name, data_type, is_nullable, column_default
        from information_schema.columns
        where table_schema='public'
          and table_name in ('parametros','usuarios','libros','lectores','prestamos','reservas','enlaces_escaneo_remoto','elementos_eliminados','auditoria','errores')
        order by table_name, ordinal_position
      ) q;
    """)
    columnas = json.loads(bruto) if bruto else []

    por_tabla = {}
    for c in columnas:
        por_tabla.setdefault(c['table_name'], []).append(c)

    insertadas = 0
    for tabla, cols in por_tabla.items():
        partes = []
        for c in cols:
            v = valor_para(c['data_type'], c['column_name'])
            if v is None:
                continue
            partes.append(f'"{c["column_name"]}"')
        if not partes:
            continue
        valores = [valor_para(c['data_type'], c['column_name'])
                   for c in cols if valor_para(c['data_type'], c['column_name']) is not None]
        # `on conflict do nothing` porque hay columnas únicas (el isbn, el rut, la
        # clave de parametros): si la fila de prueba choca, la tabla se queda sin
        # datos de prueba y la prueba sigue valiendo igual para las demás.
        try:
            correr(srv, f"insert into public.{tabla} ({', '.join(partes)}) "
                        f"values ({', '.join(valores)}) on conflict do nothing;")
            insertadas += 1
        except Exception as e:  # noqa: BLE001
            print(f"      (sin datos de prueba en {tabla}: {str(e).splitlines()[0][:90]})")
    return insertadas


def resumen_tablas(srv):
    """md5 del contenido completo de cada tabla, para comparar antes y después."""
    casos = ' union all '.join(
        f"select '{t}' as t, coalesce(md5(string_agg(x::text, '|' order by x::text)),'-') as suma, count(*) as n from public.{t} x"
        for t in TABLAS)
    salida = consultar(srv, f"select json_agg(row_to_json(q)) from (({casos})) q;")
    datos = json.loads(salida)
    return {d['t']: (d['suma'], int(d['n'])) for d in datos}


def volcar_respaldo(srv, destino):
    tablas = {}
    for t in TABLAS:
        cruda = consultar(srv, f"select coalesce(json_agg(x), '[]'::json)::text from public.{t} x;")
        tablas[t] = json.loads(cruda)
    with open(destino, 'w', encoding='utf-8') as f:
        json.dump({'generado_en': '2026-10-29T04:00:00.000Z', 'tablas': tablas}, f, ensure_ascii=False)
    return sum(len(v) for v in tablas.values())


def main():
    if not os.path.exists(GENERADOR):
        sys.exit(f"falta el generador: {GENERADOR}")
    dir_datos = tempfile.mkdtemp(prefix='probar-restauracion-')
    srv = None
    try:
        print("\n" + "=" * 68)
        print("RESTAURACIÓN DE UN RESPALDO — prueba de punta a punta")
        print("=" * 68)
        srv = pgserver.get_server(dir_datos)

        print("\n  Esquema base y migraciones:")
        # Se toman los tipos del escenario A de `probar-migraciones.py` en vez de
        # copiarlos aquí: es EL esquema que ese archivo ya garantiza que funciona,
        # y si algún día cambia, esta prueba cambia con él (copiados, habrían
        # quedado mudamente desincronizados).
        correr(srv, migraciones.esquema_base(*migraciones.ESCENARIOS[0][1:]))
        for ruta in migraciones.MIGRACIONES:
            with open(ruta, encoding='utf-8') as f:
                sql = f.read()
            if '003_' in os.path.basename(ruta):
                correr(srv, "insert into auth.users (email) values ('nicolasd.carrillo@gmail.com') on conflict do nothing;")
            prueba(f"aplica {os.path.basename(ruta)}", lambda s=sql: correr(srv, s))

        print("\n  Datos de prueba:")
        con_datos = []

        def meter():
            con_datos.append(meter_datos(srv))
        prueba("meter una fila por tabla", meter)
        antes = resumen_tablas(srv)
        total_antes = sum(n for _, n in antes.values())
        if total_antes == 0:
            fallidas.append(('hay filas de prueba', 'el catálogo de prueba quedó vacío: nada que restaurar'))
            print("  ✗ el catálogo de prueba quedó vacío")
        else:
            rellenas = sum(1 for _, n in antes.values() if n)
            print(f"  ✓ {total_antes} fila(s) de prueba en {rellenas} tabla(s)")

        respaldo = os.path.join(dir_datos, 'respaldo.json')
        prueba("fabricar el JSON con la forma de respaldo-automatico", lambda: volcar_respaldo(srv, respaldo))

        salida = os.path.join(dir_datos, 'restauracion.sql')
        r = subprocess.run([NODO, GENERADOR, respaldo, '--', salida], capture_output=True, text=True)
        prueba("el generador produce el SQL sin quejarse",
               lambda: (_ for _ in ()).throw(RuntimeError(r.stderr.strip()[:200])) if r.returncode else None)

        print("\n  Se borra todo (y se reinician las secuencias, el peor caso):")
        prueba("truncate … restart identity cascade",
               lambda: correr(srv, "truncate table " + ', '.join(f"public.{t}" for t in TABLAS) + " restart identity cascade;"))
        despues_del_vacio = resumen_tablas(srv)
        prueba("de verdad quedó vacío",
               lambda: None if sum(n for _, n in despues_del_vacio.values()) == 0 else (_ for _ in ()).throw(AssertionError('quedaron filas')))

        print("\n  Se restaura con el SQL generado:")
        r = subprocess.run([str(PSQL), srv.get_uri(), '-v', 'ON_ERROR_STOP=1', '-f', salida],
                           capture_output=True, text=True)
        salida_ps = (r.stdout or '') + (r.stderr or '')
        prueba("psql aplica la restauración sin errores",
               lambda: (_ for _ in ()).throw(RuntimeError(' | '.join(
                   [l for l in salida_ps.splitlines() if 'ERROR' in l][:2]) or salida_ps[:200])) if r.returncode else None)

        despues = resumen_tablas(srv)
        for t in TABLAS:
            prueba(f"{t}: vuelve a tener las mismas filas ({despues[t][1]})",
                   lambda a=antes[t], b=despues[t]: None if a == b else (_ for _ in ()).throw(AssertionError(f'{a} ≠ {b}')))

        print("\n  Después de restaurar:")
        def alta_sin_id():
            correr(srv, "insert into public.libros (titulo, autor, stock) values ('El libro posterior', 'Nadie', 1);")
            id_nuevo = consultar(srv, "select coalesce(max(id),0) from public.libros;")
            return int(id_nuevo) if id_nuevo.isdigit() else None
        def alta_ok():
            if not alta_sin_id():
                raise AssertionError('el id generado no es un entero positivo (o el alta chocó contra una clave existente)')
        prueba("se puede alta un libro NUEVO sin chocar con la clave primaria (el setval funciona)", alta_ok)
        prueba("el aviso de cada tabla apareció en la salida (quién restauró qué)",
               lambda: None if 'fila(s)' in salida_ps else (_ for _ in ()).throw(AssertionError('psql no imprimió los RAISE NOTICE')))

        print("\n  Identidad (generated always as identity), el otro modo de crear el id:")
        # `pruebas/00_base_supabase.sql` crea las tablas con
        #     id bigint generated always as identity
        # y el editor de tablas de Supabase las crea con `bigserial`. La
        # diferencia importa SOLO al restaurar: contra una columna de identidad,
        # un insert con el id explícito falla con «cannot insert a non-DEFAULT
        # value into column "id"» si el SQL no dice «overriding system value». El
        # restpositor decide eso leyendo pg_attribute; aquí se comprueba que lo
        # decide bien, y que además la secuencia queda alineada (sin eso, el
        # primer alta posterior choca contra una clave ya restaurada).
        #
        # Se arma una base APARTE, mínima y con identidad nativa, en vez de
        # convertir la del escenario principal con `alter table … add generated
        # always as identity`: probado, convertir deja la secuencia en un estado
        # que no es el de ninguna base real y la prueba acusaría un problema que
        # no existe. Las tablas que las migraciones no crean aquí se agregan a
        # mano — lo que se está probando es el manejo de la columna de identidad,
        # no el esquema de negocio completo.
        def probar_identidad():
            dir2 = tempfile.mkdtemp(prefix='restauracion-identidad-')
            srv2 = pgserver.get_server(dir2)
            try:
                correr(srv2, migraciones.esquema_base('text', 'bigint generated always as identity', 'bigint'))
                faltan = [t for t in TABLAS if t not in ('libros', 'lectores', 'prestamos', 'usuarios')]
                for t in faltan:
                    # La columna extra se llama `nota`, no `x`: `volcar_respaldo`
                    # agenda la tabla como `from public.{t} x`, y si una columna se
                    # llama igual que el alias, `json_agg(x)` agrega la COLUMNA (a un
                    # Postgres la columna le gana al alias) y el respaldo sale como
                    # `["bitácora"]` en vez de `[{"id":1,"nota":"bitácora"}]`. El
                    # generador lo rechaza —es la validación de este mismo archivo— y
                    # así quedó documentado de dónde sale.
                    correr(srv2, f"create table public.{t} (id bigint generated always as identity primary key, nota text);")
                # El apóstrofe va doblado, como en SQL: escaparlo a la manera de Python (\',
                #        # que produce el backslash literal) daría SQL inválido — el bug que se
                #        # quiere atrapar es justamente que un título con comillas sobreviva.
                correr(srv2, "insert into public.libros (titulo, autor, stock) "
                              "values ('El ''ajustador'' de libros', 'Nadie', 3), ('otro', 'a', 1);")
                correr(srv2, "insert into public.lectores (rut, nombre) values ('11111111-1', 'Vecina');")
                correr(srv2, "insert into public.auditoria (nota) values ('bitácora');")
                Identity_antes = resumen_tablas(srv2)
                assert sum(n for _, n in Identity_antes.values()) >= 4, 'no hay datos de prueba en la base de identidad'
                ruta_json = os.path.join(dir2, 'respaldo.json')
                volcar_respaldo(srv2, ruta_json)
                ruta_sql = os.path.join(dir2, 'restauracion.sql')
                r = subprocess.run([NODO, GENERADOR, ruta_json, '--', ruta_sql], capture_output=True, text=True)
                assert r.returncode == 0, r.stderr.strip()[:200]
                correr(srv2, "truncate table " + ', '.join(f"public.{t}" for t in TABLAS) + " restart identity cascade;")
                r = subprocess.run([str(PSQL), srv2.get_uri(), '-v', 'ON_ERROR_STOP=1', '-f', ruta_sql],
                                   capture_output=True, text=True)
                if r.returncode != 0:
                    err = ' | '.join([l for l in ((r.stdout or '') + (r.stderr or '')).splitlines() if 'ERROR' in l][:2])
                    raise RuntimeError(err or (r.stdout + r.stderr)[-200:])
                if resumen_tablas(srv2) != Identity_antes:
                    raise AssertionError('bajo identidad las filas no volvieron idénticas')
                # Y la prueba de fondo: la secuencia tiene que estar alineada, si no,
                # el primer alta de la app después de la restauración choca.
                id_antes = int(consultar(srv2, "select coalesce(max(id),0) from public.libros;"))
                correr(srv2, "insert into public.libros (titulo, autor, stock) values ('alta posterior', 'Nadie', 1);")
                id_nuevo = int(consultar(srv2, "select max(id) from public.libros;"))
                if id_nuevo != id_antes + 1:
                    raise AssertionError(f'la secuencia no quedó alineada: máximo {id_antes}, el alta salió con {id_nuevo}')
            finally:
                try:
                    srv2.stop()
                except Exception:  # noqa: BLE001
                    pass
                shutil.rmtree(dir2, ignore_errors=True)
        prueba("restaurar sobre identidad nativa: datos idénticos y secuencia alineada", probar_identidad)

        print("\n  Y las defensas:")
        def respaldo_incompleto():
            malo = os.path.join(dir_datos, 'malo.json')
            with open(malo, 'w', encoding='utf-8') as f:
                json.dump({'generado_en': 'x', 'tablas': {'libros': []}}, f)
            r = subprocess.run([NODO, GENERADOR, malo, '--', os.path.join(dir_datos, 'x.sql')],
                               capture_output=True, text=True)
            if r.returncode == 0:
                raise AssertionError('un respaldo sin las 10 tablas NO debería generar SQL')
            if 'incompleto' not in (r.stderr + r.stdout):
                raise AssertionError('y además debería decir por qué: ' + (r.stderr or '')[:120])
        prueba("un respaldo incompleto se rechaza con nombre y motivo", respaldo_incompleto)

        def no_es_un_respaldo():
            malo = os.path.join(dir_datos, 'otracosa.json')
            with open(malo, 'w', encoding='utf-8') as f:
                json.dump({'hola': 'mundo'}, f)
            r = subprocess.run([NODO, GENERADOR, malo, '--', os.path.join(dir_datos, 'y.sql')],
                               capture_output=True, text=True)
            if r.returncode == 0 or 'tablas' not in (r.stderr + r.stdout):
                raise AssertionError('un JSON cualquiera debería rechazarse explicando qué esperaba')
        prueba("un JSON que no es un respaldo se rechaza", no_es_un_respaldo)

    finally:
        if srv is not None:
            try:
                srv.stop()
            except Exception:  # noqa: BLE001
                pass
        shutil.rmtree(dir_datos, ignore_errors=True)

    print("\n" + "─" * 68)
    if fallidas:
        print(f"{len(fallidas)} comprobacion(es) con fallo:")
        for n, m in fallidas:
            print(f"  · {n}: {m}")
        return 1
    print("El respaldo se restaura, los datos vuelven idénticos y las secuencias quedan bien.")
    return 0


if __name__ == '__main__':
    sys.exit(main())
