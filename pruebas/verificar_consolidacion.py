#!/usr/bin/env python3
"""
Vigila la regla de la consolidación.

Desde la migración 010, cada función del sistema tiene una sola definición viva.
La costumbre anterior era declararla de nuevo en cada archivo que la tocaba, y
eso fue exactamente lo que dejó al librero sin poder prestar libros: la 007
reinstaló `prestar_libro` sin `security definer`, revirtiendo lo que la 001 había
hecho bien, y nadie tenía la fotografía completa para notarlo.

Esta comprobación lee los archivos, no la base de datos, así que atrapa el
problema en el envío al repositorio — antes de que llegue a producción.

Ejecutar:  python3 pruebas/verificar_consolidacion.py
Devuelve 0 si todo está en orden, 1 si hay algo que corregir.
"""

import re
import sys
from pathlib import Path

# En Windows, la consola suele usar cp1252, que no tiene los caracteres de
# dibujo de línea (─) que usa este script para separar secciones. Sin esto,
# el script podía terminar TODAS las comprobaciones en orden y aun así morir
# con UnicodeEncodeError al imprimir el cierre, devolviendo código 1 como si
# algo hubiera fallado. reconfigure() no existe en Python < 3.7; la guarda
# evita romper ahí.
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

RAIZ = Path(__file__).resolve().parent.parent
MIGRACIONES = RAIZ / 'supabase' / 'migrations'
CONSOLIDACION = '010_consolidacion.sql'

VERDE, ROJO, AMARILLO, FIN = '\033[32m', '\033[31m', '\033[33m', '\033[0m'


def funciones_en(texto):
    """Nombres de funciones declaradas en un archivo SQL."""
    return {
        nombre.lower()
        for nombre in re.findall(r'create\s+or\s+replace\s+function\s+public\.(\w+)', texto, re.I)
    }


def main():
    if not MIGRACIONES.is_dir():
        print(f'{ROJO}No encuentro {MIGRACIONES}{FIN}')
        return 1

    archivos = sorted(MIGRACIONES.glob('*.sql'))
    consolidacion = MIGRACIONES / CONSOLIDACION

    if not consolidacion.exists():
        print(f'{ROJO}Falta {CONSOLIDACION}. Es la única definición viva de las funciones.{FIN}')
        return 1

    texto_consolidado = consolidacion.read_text(encoding='utf-8')
    consolidadas = funciones_en(texto_consolidado)
    problemas = []

    print(f'Consolidación: {len(consolidadas)} funciones declaradas en {CONSOLIDACION}\n')

    # --- 1. Ninguna migración POSTERIOR debe redefinir ni declarar funciones RPC ---
    #     Únicas excepciones documentadas: el disparador de lápidas (015) y los
    #     dos puentes internos de pg_cron hacia vault.decrypted_secrets (018 y 023),
    #     ninguno expuesto como RPC a la aplicación.
    EXCEPCIONES_POSTERIORES = {
        'registrar_eliminacion',
        'verificar_secreto_cron',
        'verificar_secreto_cron_reservas',
    }
    posteriores = [a for a in archivos if a.name > CONSOLIDACION]
    for archivo in posteriores:
        declaradas = funciones_en(archivo.read_text(encoding='utf-8'))
        redefinidas = declaradas & consolidadas
        if redefinidas:
            problemas.append(
                f'{archivo.name} redefine {len(redefinidas)} función(es) que ya están en '
                f'{CONSOLIDACION}: {", ".join(sorted(redefinidas))}.\n'
                f'      Corrección: borra esas definiciones del archivo y edita '
                f'{CONSOLIDACION} en su lugar.'
            )
        nuevas_fuera = declaradas - consolidadas - EXCEPCIONES_POSTERIORES
        if nuevas_fuera:
            problemas.append(
                f'{archivo.name} declara {len(nuevas_fuera)} función(es) nueva(s) fuera de '
                f'{CONSOLIDACION}: {", ".join(sorted(nuevas_fuera))}.\n'
                f'      Corrección: mueve la definición a {CONSOLIDACION} y regístrala en '
                f'manifiesto_funciones().'
            )

    if posteriores:
        print(f'  {len(posteriores)} migración(es) posterior(es) a la consolidación, revisadas')
    else:
        print('  no hay migraciones posteriores a la consolidación')

    # --- 2. El manifiesto debe cubrir todas las funciones declaradas ---
    #     Si una función se agrega al archivo pero no al manifiesto,
    #     verificar_definiciones() no la vigila y la deriva pasa inadvertida.
    bloque = re.search(r'manifiesto_funciones\(\).*?\$manifiesto\$(.*?)\$manifiesto\$',
                       texto_consolidado, re.S)
    if not bloque:
        problemas.append('No encuentro manifiesto_funciones() en la consolidación.')
    else:
        en_manifiesto = set(re.findall(r"\('(\w+)',", bloque.group(1)))
        # Las dos funciones de verificación no se vigilan a sí mismas
        propias = {'manifiesto_funciones', 'verificar_definiciones'}
        sin_vigilar = consolidadas - en_manifiesto - propias
        fantasmas = en_manifiesto - consolidadas

        print(f'  {len(en_manifiesto)} funciones en el manifiesto')

        if sin_vigilar:
            problemas.append(
                f'{len(sin_vigilar)} función(es) declarada(s) pero fuera del manifiesto: '
                f'{", ".join(sorted(sin_vigilar))}.\n'
                f'      verificar_definiciones() no las vigila, así que una pérdida de '
                f'security definer pasaría inadvertida.\n'
                f'      Corrección: agrégalas a manifiesto_funciones().'
            )
        if fantasmas:
            problemas.append(
                f'{len(fantasmas)} función(es) en el manifiesto que ya no se declara(n): '
                f'{", ".join(sorted(fantasmas))}.\n'
                f'      verificar_definiciones() las reportará como FALTA para siempre.\n'
                f'      Corrección: quítalas del manifiesto.'
            )

    # --- 3. Las funciones que escriben deben ser security definer ---
    #     Es la comprobación que habría atajado el fallo del librero en el momento.
    DEBEN_SER_DEFINER = {
        'prestar_libro', 'devolver_prestamo', 'renovar_prestamo',
        'ajustar_copias', 'corregir_inventario', 'bloquear_lector',
        'actualizar_contacto_lector', 'actualizar_mi_perfil', 'asegurar_perfil',
        'asignar_rol', 'eliminar_personal', 'anonimizar_lector', 'purgar_datos_antiguos',
        'registrar_error', 'marcar_error_visto', 'purgar_errores',
        'crear_enlace_escaneo', 'agregar_libro_remoto', 'revocar_enlace_escaneo',
    }
    for nombre in sorted(DEBEN_SER_DEFINER):
        m = re.search(
            r'create or replace function public\.' + nombre + r'\b(.*?)(\$\w*\$)',
            texto_consolidado, re.S)
        if not m:
            problemas.append(f'{nombre} escribe en la base de datos pero no está en la consolidación.')
        elif 'security definer' not in m.group(1):
            problemas.append(
                f'{ROJO}CRÍTICO{FIN}: {nombre} escribe en la base de datos y NO es security definer.\n'
                f'      Las políticas RLS bloquearán la escritura. Peor aún, los UPDATE\n'
                f'      fallarán en silencio: cero filas afectadas y ningún error.\n'
                f'      Es el fallo que dejó al librero sin poder devolver libros.'
            )
    print(f'  {len(DEBEN_SER_DEFINER)} funciones de escritura, comprobado su security definer')

    # --- 4. Toda función SECURITY DEFINER debe comprobar quién la llama ---
    #
    #     SECURITY DEFINER esquiva las políticas RLS: la función corre con los
    #     permisos de su dueño, no del que llama. Eso es necesario para que un
    #     librero pueda descontar stock, pero significa que la función queda como
    #     única barrera.
    #
    #     Y la llave anónima de Supabase es PÚBLICA por diseño: va escrita en
    #     config.js, que se sirve al navegador. Cualquiera la lee con F12.
    #
    #     Sin guarda interna, `estado_lector` permitía probar RUT uno por uno y
    #     recolectar nombre, correo, teléfono y morosidad de cada lector. Los RUT
    #     chilenos son enumerables. Era la lista de contactos al descubierto.
    SIN_GUARDA_JUSTIFICADO = {
        # Funciones de disparador: no se llaman desde la aplicación
        'registrar_auditoria',
        # El manifiesto solo devuelve nombres de funciones, no datos
        'manifiesto_funciones',
        # es_admin y es_personal SON la guarda; no pueden guardarse a sí mismas
        'es_admin', 'es_personal',
        # Escaneo remoto: a propósito, las llama un celular SIN sesión (ese es
        # el punto del enlace). Su guarda no es es_admin()/es_personal() sino
        # el token de un solo objetivo, que cada una valida por su cuenta
        # contra su huella SHA-256 en enlaces_escaneo_remoto — ver 010,
        # sección «ESCANEO REMOTO SIN SESIÓN». `consultar_libro_remoto`
        # (22 de agosto de 2026) además LEE y devuelve nombre/RUT de quien
        # tiene el libro prestado o reservado sin exigir sesión — decisión
        # explícita de quien administra el sistema (ver el punto 4 del mismo
        # comentario en 010), no un descuido de esta comprobación.
        'validar_enlace_escaneo', 'consultar_libro_remoto', 'agregar_libro_remoto', 'deshacer_libro_remoto',
        # Reservas (022_reservas.sql, sección RESERVAS de 010): ninguna de
        # estas dos es un RPC que la aplicación llame con sesión de usuario.
        # `expirar_reservas_vencidas` la invoca el Edge Function
        # `expirar-reservas` con la service_role key (auth.uid() es NULL en
        # ese contexto, así que exigir es_personal() bloquearía la llamada
        # legítima) — su guarda es que NO se concede EXECUTE a
        # `authenticated`/`anon` (revoke explícito en 010), igual que
        # `verificar_secreto_cron()` en 018. `promover_siguiente_reserva` es
        # un ayudante interno, no un RPC público — mismo motivo, mismo
        # revoke — pensado para que solo lo llame otra función SECURITY
        # DEFINER dentro de la misma transacción (devolver_prestamo,
        # cancelar_reserva, expirar_reservas_vencidas).
        'expirar_reservas_vencidas', 'promover_siguiente_reserva',
    }
    bloques = re.split(r'(?=create\s+or\s+replace\s+function\s+public\.)', texto_consolidado, flags=re.I)
    definer_sin_guarda = []
    n_definer = 0
    for bloque in bloques[1:]:
        nombre = re.search(r'create\s+or\s+replace\s+function\s+public\.(\w+)', bloque, re.I).group(1).lower()
        cabecera = bloque[:bloque.find('$')].lower()
        if 'security definer' not in cabecera:
            continue
        n_definer += 1
        if nombre in SIN_GUARDA_JUSTIFICADO:
            continue
        tiene_guarda = re.search(
            r'es_admin\(\)|es_personal\(\)|auth\.uid\(\) is null|auth\.uid\(\) is not null',
            bloque)
        if not tiene_guarda:
            definer_sin_guarda.append(nombre)

    print(f'  {n_definer} funciones SECURITY DEFINER, comprobado su control de acceso interno')

    if definer_sin_guarda:
        problemas.append(
            f'{ROJO}FUGA DE DATOS{FIN}: {len(definer_sin_guarda)} función(es) SECURITY DEFINER '
            f'sin control de acceso interno: {", ".join(sorted(definer_sin_guarda))}.\n'
            f'      SECURITY DEFINER esquiva las políticas RLS, así que la función es la\n'
            f'      única barrera. Y la llave anónima es pública: va en config.js.\n'
            f'      Corrección: agrega al inicio de la función\n'
            f'        if not public.es_personal() then raise exception \'...\'; end if;\n'
            f'      (o es_admin() si corresponde). Si de verdad debe ser pública, agrégala\n'
            f'      a SIN_GUARDA_JUSTIFICADO en esta comprobación, con el motivo escrito.'
        )

    # --- 5. Aviso informativo sobre el historial ---
    historicas = [a for a in archivos if a.name < CONSOLIDACION]
    repetidas = {}
    for archivo in historicas:
        for f in funciones_en(archivo.read_text(encoding='utf-8')):
            repetidas.setdefault(f, []).append(archivo.name[:3])
    multiples = {k: v for k, v in repetidas.items() if len(v) > 1}
    if multiples:
        peor = max(multiples.items(), key=lambda x: len(x[1]))
        print(f'\n  {AMARILLO}Nota histórica{FIN}: en las migraciones 001-009 hay '
              f'{len(multiples)} funciones con definiciones repetidas '
              f'(la peor: {peor[0]}, {len(peor[1])} veces).')
        print('  Se conservan como historia. La consolidación es la que manda.')

    # --- Resultado ---
    print()
    if problemas:
        print(f'{ROJO}{"─" * 66}{FIN}')
        print(f'{ROJO}{len(problemas)} problema(s) que rompen la regla de la consolidación:{FIN}\n')
        for i, p in enumerate(problemas, 1):
            print(f'  {i}. {p}\n')
        print(f'  Lee MIGRACIONES.md, sección "La regla nueva sobre las funciones".')
        return 1

    print(f'{VERDE}{"─" * 66}{FIN}')
    print(f'{VERDE}La consolidación está intacta.{FIN}')
    print('  · ninguna migración posterior redefine funciones consolidadas')
    print('  · el manifiesto cubre todas las funciones declaradas')
    print('  · todas las funciones de escritura son security definer')
    print('  · todas las funciones definer comprueban quién las llama')
    return 0


if __name__ == '__main__':
    sys.exit(main())
