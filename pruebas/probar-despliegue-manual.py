#!/usr/bin/env python3
"""Comprueba que los bloques SQL de la guía de despliegue manual funcionan.

Existe por un motivo concreto: la guía `docs/despliegue/030-separacion-catalogos-sql-editor.md`
está pensada para copiar y pegar en el editor SQL de Supabase, sin CLI y sin
revisión de nadie. Si el documento y las migraciones se separan (alguien corrige
una cosa y olvida la otra), el error se descubre en producción.

Este script lee los bloques **del propio documento**, no de las migraciones, y
los aplica a un PostgreSQL real que primero se deja en el estado anterior a esta
ronda:

  1. Esquema base + migraciones 001–029 (todo menos la 030).
  2. Se vuelve a la versión antigua de `buscar_libros()`, la que comparaba con
     `l.es_bibliomovil = p_es_bibliomovil` (la que hay hoy en la base).
  3. Se comprueba que el bug se reproduce: un libro con la columna en NULL no
     aparece en ninguna de las dos colecciones.
  4. Se aplican los bloques del documento, en orden, y se validan las consultas
     de verificación del Paso 5.
  5. Se reaplican los bloques: pegar dos veces no debe romper nada.

Uso (igual que probar-migraciones.py):
    python3 pruebas/probar-despliegue-manual.py
"""

import glob
import os
import sys
import tempfile

try:
    import pgserver
except ImportError:
    sys.exit("Falta pgserver. Ejecuta: pip install pgserver --break-system-packages")

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(RAIZ, 'pruebas'))

# probar-migraciones.py es un script, no un módulo: se carga a mano para
# reutilizar el esquema base, los escenarios y el ejecutor de SQL (que sabe
# leer los errores de PostgreSQL, cosa que el ayudante de pgserver oculta).
import importlib.util as _ilu  # noqa: E402

_espec = _ilu.spec_from_file_location('pm', os.path.join(RAIZ, 'pruebas/probar-migraciones.py'))
pm = _ilu.module_from_spec(_espec)
_espec.loader.exec_module(pm)

DOC = os.path.join(RAIZ, 'docs/despliegue/030-separacion-catalogos-sql-editor.md')

pasadas = 0
fallidas = 0


def prueba(nombre, fn):
    global pasadas, fallidas
    try:
        fn()
        print(f"    ✓ {nombre}")
        pasadas += 1
    except Exception as e:  # noqa: BLE001
        print(f"    ✗ {nombre}\n        {str(e).strip().splitlines()[0][:220]}")
        fallidas += 1


def extraer_bloque(documento, titulo):
    """Primer bloque ```sql ... ``` que sigue al título indicado."""
    i = documento.index(titulo)
    j = documento.index('```sql', i) + len('```sql')
    k = documento.index('```', j)
    return documento[j:k].strip()


def fila(salida):
    """Campos de la única fila devuelta por psql.

    Se busca la línea de guiones que psql imprime entre el encabezado y los
    datos, y se devuelve la línea siguiente: leer «la primera línea con pipes»
    devolvía el encabezado (`sede | movil | total`), que se compara igual que un
    valor y hace pasar la prueba por el texto equivocado.
    """
    lineas = salida.split('\n')
    for i, linea in enumerate(lineas):
        limpia = linea.strip()
        if limpia and '-' in limpia and set(limpia) <= set('-+ '):
            for siguiente in lineas[i + 1:]:
                if siguiente.strip() and not siguiente.strip().startswith('('):
                    return [c.strip() for c in siguiente.split('|')]
            return []
    return []


# Versión anterior de la función: la que compara sin `coalesce`. Es la que hay
# hoy en la base de la biblioteca, y la que hace visible el bug.
BUSCAR_LIBROS_ANTIGUA = """
create or replace function public.buscar_libros(
  p_busqueda text default '', p_limite int default 50, p_desplazamiento int default 0,
  p_es_bibliomovil boolean default null, p_filtro_stock text default 'todos')
returns table (
  id bigint, isbn text, titulo text, autor text, genero text, ubicacion text,
  portada_url text, copias_totales int, stock int, dias_prestamo_override int,
  es_bibliomovil boolean, total_coincidencias bigint)
language sql stable set search_path = public
as $$
  with filtrados as (
    select l.* from public.libros l
    where (p_busqueda is null or p_busqueda = ''
       or public.sin_acentos(l.titulo) like '%' || public.sin_acentos(p_busqueda) || '%'
       or public.sin_acentos(l.autor)  like '%' || public.sin_acentos(p_busqueda) || '%'
       or l.isbn like '%' || p_busqueda || '%')
      and (p_es_bibliomovil is null
           or l.es_bibliomovil = p_es_bibliomovil)
      and (p_filtro_stock = 'todos' or
          (p_filtro_stock = 'disponibles' and l.stock > 0) or
          (p_filtro_stock = 'prestados' and l.stock = 0))
  )
  select f.id::bigint, f.isbn::text, f.titulo::text, f.autor::text, f.genero::text,
         f.ubicacion::text, f.portada_url::text, f.copias_totales::int, f.stock::int,
         f.dias_prestamo_override::int, f.es_bibliomovil::boolean,
         (select count(*) from filtrados)::bigint
  from filtrados f order by f.titulo limit p_limite offset p_desplazamiento;
$$;"""


def main():
    print(f"\nGuía revisada: {os.path.relpath(DOC, RAIZ)}")

    documento = open(DOC, encoding='utf-8').read()
    bloque_columna = extraer_bloque(documento, '## Paso 2')
    bloque_funcion = extraer_bloque(documento, '## Paso 3')
    bloque_recarga = extraer_bloque(documento, '## Paso 4')

    print("\n  Bloques del documento:")
    prueba('el Paso 2 pega la migración de la columna (normalizada a NOT NULL)',
           lambda: None if 'alter column es_bibliomovil set not null' in bloque_columna
           else (_ for _ in ()).throw(AssertionError('el bloque no normaliza la columna')))
    prueba('el Paso 3 pega la función vigente, con coalesce',
           lambda: None if 'coalesce(l.es_bibliomovil, false)' in bloque_funcion
           else (_ for _ in ()).throw(AssertionError('el bloque no trae el coalesce')))

    escenario = pm.ESCENARIOS[0]
    srv = pgserver.get_server(tempfile.mkdtemp())

    def correr(sql):
        return pm.correr(srv, sql)

    try:
        correr(pm.esquema_base(*escenario[1:]))
        previas = [m for m in sorted(glob.glob(os.path.join(RAIZ, 'supabase/migrations/*.sql')))
                   if '030_' not in os.path.basename(m)]
        for ruta in previas:
            if '003_' in os.path.basename(ruta):
                correr("insert into auth.users (email) values "
                       "('nicolasd.carrillo@gmail.com') on conflict do nothing;")
            correr(open(ruta, encoding='utf-8').read())
        print(f"\n  Base preparada: {len(previas)} migraciones aplicadas (001–029), sin la 030.")

        correr(BUSCAR_LIBROS_ANTIGUA)
        correr("""
        insert into public.libros (isbn, titulo, autor, stock, copias_totales, es_bibliomovil)
        values ('1','A - Subterra','Lillo',1,1,false),
               ('2','B - Cuentos de la ruta','Vecinos',1,1,true),
               ('3','C - Libro viejo','Anónimo',1,1,null);
        """)

        antes = fila(correr("select (select count(*) from public.buscar_libros('',100,0,false,'todos')) sede,"
                            " (select count(*) from public.buscar_libros('',100,0,true,'todos')) movil,"
                            " (select count(*) from public.libros) total,"
                            " (select count(*) from public.libros where es_bibliomovil is null) en_null;"))
        print(f"  Antes de aplicar: sede={antes[0]} móvil={antes[1]} total={antes[2]} sin_marcar={antes[3]}")
        prueba('el bug se reproduce: el libro sin marcar no sale en ninguna colección',
               lambda: None if [antes[0], antes[1], antes[2]] == ['1', '1', '3']
               else (_ for _ in ()).throw(AssertionError(f'sede/móvil/total = {antes[:3]}')))

        print("\n  Aplicando los bloques, uno por uno:")
        prueba('Paso 2 aplica sin error', lambda: correr(bloque_columna))
        prueba('Paso 3 aplica sin error', lambda: correr(bloque_funcion))
        prueba('Paso 4 aplica sin error', lambda: correr(bloque_recarga))

        ver1 = fila(correr("""select is_nullable, column_default,
         (select count(*) from public.libros where es_bibliomovil is null) as filas_en_null
         from information_schema.columns
         where table_schema='public' and table_name='libros' and column_name='es_bibliomovil';"""))
        print(f"\n  Verificación del Paso 5: is_nullable={ver1[0]} default={ver1[1]} filas_en_null={ver1[2]}")
        prueba('la columna queda NOT NULL, con default false y sin filas en NULL',
               lambda: None if ver1[:3] == ['NO', 'false', '0'] else (_ for _ in ()).throw(AssertionError(f'{ver1}')))

        ver3 = fila(correr("""select (select count(*) from public.buscar_libros('',100000,0,false,'todos')) sede,
         (select count(*) from public.buscar_libros('',100000,0,true,'todos')) movil,
         (select count(*) from public.buscar_libros('',100000,0,null,'todos')) todas,
         (select count(*) from public.libros) total;"""))
        print(f"  Reparto: sede={ver3[0]} móvil={ver3[1]} todas={ver3[2]} total={ver3[3]}")
        prueba('el libro sin marcar aparece en la sede (sede = 2)',
               lambda: None if ver3[0] == '2' else (_ for _ in ()).throw(AssertionError(str(ver3))))
        prueba('sede + móvil = total, y coincide con «todas»',
               lambda: None if int(ver3[0]) + int(ver3[1]) == int(ver3[3]) == int(ver3[2])
               else (_ for _ in ()).throw(AssertionError(str(ver3))))

        print("\n  Pegar los bloques una segunda vez (a nadie se le escapa dos veces):")
        prueba('el Paso 2 se puede reaplicar', lambda: correr(bloque_columna))
        prueba('el Paso 3 se puede reaplicar', lambda: correr(bloque_funcion))
        prueba('el catálogo sigue completo después de reaplicar',
               lambda: None if fila(correr("select count(*) from public.buscar_libros('',100,0,false,'todos');"))[0] == '2'
               else (_ for _ in ()).throw(AssertionError('el catálogo de sede quedó vacío')))
    finally:
        srv.cleanup()

    print("\n" + "=" * 68)
    print(f"  Pasadas: {pasadas}    Fallidas: {fallidas}")
    print("=" * 68 + "\n")
    return 1 if fallidas else 0


if __name__ == '__main__':
    sys.exit(main())
