#!/usr/bin/env python3
"""
Compone `public/compartir/biblionexo-social.jpg`, la imagen que ven WhatsApp,
Slack, X y los buscadores al compartir el enlace de BiblioNexo (1200×630).

Se regenera con:

    python3 pruebas/generar-imagen-social.py

y hay que volver a correrla cuando cambie `public/icono-512x512.png`, que es de
donde sale el dibujo: ninguna prueba del proyecto compara el ícono con esta
imagen, así que un ícono nuevo seguido de un JPG viejo es un desajuste que solo
se ve a ojo.

Unidades:

  · DejaVu en vez de Newsreader y Plus Jakarta Sans (las tipografías del
    sistema): vienen en `.woff2`, un formato que ImageMagick no sabe leer, y
    compilarlas a `.ttf` para generar un JPG no vale una dependencia nueva.
    El resultado es legible y del mismo aire serif/sans que la interfaz.
  · Ninguna dependencia de Python: llama a `convert` e `identify` de
    ImageMagick, como `probar-contraste.mjs` llama a lo suyo. Si `convert` no
    está en el PATH, esta herramienta no corre — y no pasa nada más, porque es
    un utilidad de mantención, no parte del build.
  · Los rótulos se generan como imágenes separadas y se apilan, en vez de
    dibujarse con coordenadas sueltas sobre el lienzo: así el alto real de cada
    texto (que en DejaVu no es el tamaño de punto) no hay que adivinarlo, y la
    columna entera se puede centrar en vertical con un solo número.
  · JPG y no PNG: 104 KB en vez de ~500 KB, y `globPatterns` del service worker
    (`{js,css,html,ico,png,svg,woff,woff2,ttf}`) no incluye `jpg`, de modo que
    esta imagen no viaja en el *precache* que se baja al instalar la PWA.
"""
import os
import shutil
import subprocess
import sys
import tempfile

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ICONO = os.path.join(RAIZ, 'public', 'icono-512x512.png')
DESTINO = os.path.join(RAIZ, 'public', 'compartir', 'biblionexo-social.jpg')

TRU = '/usr/share/fonts/truetype/dejavu'
SERIF = os.path.join(TRU, 'DejaVuSerif-Bold.ttf')
SANS = os.path.join(TRU, 'DejaVuSans.ttf')
SANS_BOLD = os.path.join(TRU, 'DejaVuSans-Bold.ttf')

# Paleta del sistema (src/assets/css/styles.css): lago de Futrono de fondo,
# madera de raulí en el acento, crema patrimonial en el titular.
FONDO_ALTO, FONDO_BAJO = '#12303A', '#2C4A3E'
CREMA, MADERA, ARENA, BOSQUE_CLARO = '#F7F4EB', '#C98A4B', '#C8A96A', '#9FB0AE'

ANCHO = 1200
ALTO = 630
ANCHO_COLUMNAS = 640      # el ancho que ocupa el bloque de texto
ANCHO_MAX_TEXTO = 620
MARGEN_IZQUIERDA = 80
SEPARACION = 26

TEXTOS = [
    ('kicker', SANS_BOLD, 22, 3, ARENA,
     'BIBLIOTECA MUNICIPAL DE FUTRONO · N° 332'),
    ('titulo', SERIF, 104, 0, CREMA, 'BiblioNexo'),
    ('regla', None, 0, 0, None, None),
    ('descripción', SANS, 31, 0, '#E7E1D4',
     'Préstamos, catálogo, reservas\ny Bibliomóvil, en un solo sistema'),
    ('pie', SANS, 21, 0, BOSQUE_CLARO,
     'Uso interno del personal · no es un catálogo público'),
]


def ejecutar(*argumentos):
    resultado = subprocess.run(['convert', *argumentos], capture_output=True, text=True)
    if resultado.returncode:
        sys.exit(f'convert falló: {resultado.stderr.strip()}')


def medir(archivo, campo):
    return int(subprocess.run(['identify', '-format', campo, archivo],
                              capture_output=True, text=True).stdout)


def rotulo(trabajo, nombre, fuente, punto, kerning, relleno, texto):
    """Dibuja un texto en su propia imagen transparente, achicando el cuerpo
    hasta que quepa en ANCHO_MAX_TEXTO (por eso el titular no se sale del
    bloque cuando alguien cambia el nombre del sistema)."""
    archivo = os.path.join(trabajo, f'{nombre}.png')
    while punto > 12:
        ejecutar('-background', 'none', '-font', fuente, '-pointsize', str(punto),
                 '-kerning', str(kerning), '-fill', relleno, f'label:{texto}', archivo)
        if medir(archivo, '%w') <= ANCHO_MAX_TEXTO:
            break
        punto -= 2
    # Se fuerza el ancho de la columna para que el apilado alinee a la
    # izquierda en vez de centrar cada rótulo según su propio ancho.
    ejecutar(archivo, '-gravity', 'West', '-background', 'none',
             '-extent', f'{ANCHO_COLUMNAS}x{medir(archivo, "%h")}', archivo)
    return archivo


def apilar(capas, trabajo):
    """Une los rótulos de arriba abajo con SEPARACION píxeles entre cada uno."""
    con_brecha = []
    for indice, capa in enumerate(capas):
        if indice:
            ejecutar(capa, '-background', 'none', '-splice', f'0x{SEPARACION}',
                     '-gravity', 'South', capa)
        con_brecha.append(capa)
    columna = os.path.join(trabajo, 'columna.png')
    ejecutar(*con_brecha, '-append', columna)
    return columna


def bloque_del_icono(trabajo):
    """El ícono de la aplicación, con las esquinas redondeadas que ya tiene,
    una sombra suave y un anillo claro para que se lea sobre el fondo verde."""
    lado = 330
    radio = 40
    margen = 35
    lienzo = lado + 2 * margen
    original = os.path.join(trabajo, 'icono.png')
    recortado = os.path.join(trabajo, 'icono-recortado.png')
    sombra = os.path.join(trabajo, 'sombra.png')
    bloque = os.path.join(trabajo, 'icono-bloque.png')

    ejecutar(ICONO, '-resize', f'{lado}x{lado}', original)
    ejecutar(original, '(', '-size', f'{lado}x{lado}', 'xc:black', '-fill', 'white',
             '-draw', f'roundrectangle 0,0,{lado - 1},{lado - 1},{radio},{radio}', ')',
             '-compose', 'CopyOpacity', '-composite', recortado)
    ejecutar('-size', f'{lado}x{lado}', 'xc:none', '-fill', 'white',
             '-draw', f'roundrectangle 0,0,{lado - 1},{lado - 1},{radio},{radio}',
             '-blur', '0x16', '-channel', 'RGB', '-evaluate', 'multiply', '0', '+channel', sombra)
    ejecutar('-size', f'{lienzo}x{lienzo}', 'xc:none',
             sombra, '-geometry', f'+{margen + 12}+{margen + 18}', '-composite',
             recortado, '-geometry', f'+{margen}+{margen}', '-composite',
             '(', '-size', f'{lado}x{lado}', 'xc:none', '-stroke', f'{CREMA}55',
             '-strokewidth', '3', '-fill', 'none',
             '-draw', f'roundrectangle 1,1,{lado - 2},{lado - 2},{radio - 1},{radio - 1}', ')',
             '-geometry', f'+{margen}+{margen}', '-composite', bloque)
    return bloque, lienzo


def main():
    if not shutil.which('convert'):
        sys.exit('ImageMagick (`convert`) no está instalado en esta máquina; '
                 'esta imagen no se regenera sola, hay que tenerlo a mano.')
    if not os.path.exists(ICONO):
        sys.exit(f'No se encuentra el ícono de origen: {ICONO}')

    trabajo = tempfile.mkdtemp(prefix='biblionexo-social-')
    try:
        capas = []
        for nombre, fuente, punto, kerning, relleno, texto in TEXTOS:
            if nombre == 'regla':
                regla = os.path.join(trabajo, 'regla.png')
                ejecutar('-size', f'{ANCHO_COLUMNAS}x6', 'xc:none', '-fill', MADERA,
                         '-draw', 'rectangle 0,0 170,6', regla)
                capas.append(regla)
            else:
                capas.append(rotulo(trabajo, nombre, fuente, punto, kerning, relleno, texto))

        columna = apilar(capas, trabajo)
        alto_columna = medir(columna, '%h')
        bloque, lienzo = bloque_del_icono(trabajo)

        lienzo_base = os.path.join(trabajo, 'base.png')
        resultado = os.path.join(trabajo, 'card.png')
        ejecutar('-size', f'{ANCHO}x{ALTO}', f'gradient:{FONDO_ALTO}-{FONDO_BAJO}', lienzo_base)
        # Todo con gravedad Noroeste para que los desfases sean coordenadas del
        # lienzo, no de un centro que cambia con el tamaño del texto.
        ejecutar('-gravity', 'NorthWest', lienzo_base,
                 bloque, '-geometry', f'+{ANCHO - lienzo - 45}+{(ALTO - lienzo) // 2 - 20}', '-composite',
                 columna, '-geometry', f'+{MARGEN_IZQUIERDA}+{(ALTO - alto_columna) // 2}', '-composite',
                 resultado)

        os.makedirs(os.path.dirname(DESTINO), exist_ok=True)
        ejecutar(resultado, '-quality', '90', '-strip', DESTINO)
    finally:
        shutil.rmtree(trabajo, ignore_errors=True)

    peso = os.path.getsize(DESTINO) // 1024
    print(f'{os.path.relpath(DESTINO, RAIZ)} · {ANCHO}×{ALTO} · {peso} KB')
    if peso > 300:
        print('AVISO: por encima de 300 KB. Las redes sociales recortan y '
              'recomprimen, pero una imagen social gorda se nota en WhatsApp.')


if __name__ == '__main__':
    main()
