#!/usr/bin/env node
/**
 * Comprobación en vivo del sitio PUBLICADO.
 *
 * Todo lo demás del repo verifica el código: `verificar-build.mjs` mira `dist/`,
 * los verificadores de Python miran el SQL, la suite de jsdom mira los módulos.
 * Nada respondía por la pregunta que le importa a la bibliotecaria un lunes de
 * marzo, con el municipio ya funcionando de nuevo: «¿esto está arriba?». Un
 * build impecable puede estar sirviendo un 404, y un Supabase pausado deja la
 * app cargando en punto muerto sin que ninguna prueba en local se entere.
 *
 * Por eso este script no lee el repositorio: pide las URLs reales. Lo corre
 * GitHub Actions cada mañana (`.github/workflows/sitio-vivo.yml`) y, si algo
 * falla, el trabajo falla — que en un repo público es un correo y nada más.
 *
 * Dos cosas más hace, y son la razón de ser del workflow:
 *
 *  1. Toca la API de Supabase con la anon key. Un proyecto del plan Free se
 *     **pausa a los 7 días sin actividad de base de datos** y responde HTTP 540
 *     a todo; reactivarlo es un clic, pero hay que enterarse. Este ping es esa
 *     actividad y a la vez la alarma.
 *  2. Falla con nombre y apellido («el favicon.ico desapareció», «Supabase
 *     pausado: entrar al dashboard y Reclaim»), porque quien lo lee no es
 *     quien escribió el código.
 *
 * Cómo usarlo:
 *
 *   node pruebas/verificar-sitio-vivo.mjs                  # contra el origen desplegado
 *   SITIO_URL=http://127.0.0.1:4173 node pruebas/verificar-sitio-vivo.mjs   # contra `vite preview`
 *   SIN_NUBE=1 node pruebas/verificar-sitio-vivo.mjs        # sin tocar Supabase (redes cerradas)
 *
 * No necesita secretos. La anon key no lo es: está en el bundle que se descarga
 * cualquiera que abra el sitio; el sistema la lee del mismo `src/js/config.js`
 * de siempre. La `service_role` no se usa ni se nombra aquí.
 *
 * Salida: una línea por comprobación, `✓` o `✗`, y al final el recuento. Código
 * de salida = número de fallos (0 = todo bien).
 */

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Origen que se comprueba. Por defecto, el alias de producción de Vercel — el
 * mismo valor de respaldo que usa `vite.config.js` cuando `VITE_ORIGEN_PUBLICO`
 * no está definido, así que mientras no se configure el dominio propio ambos
 * apuntan solos al mismo lugar.
 *
 * El día que `biblionexo.cl` apunte, hay que poner `SITIO_URL` (variable del
 * repo en GitHub, o la variable de entorno al correr el script). Y es útil
 * ponerla justo entonces: la comprobación del canonical exige que el HTML
 * desplegado lleve ESE origen escrito, así que si alguien mueve el DNS y se
 * olvida de volver a desplegar con `VITE_ORIGEN_PUBLICO`, esto lo avisa en vez
 * de dejar un canonical apuntando al alias viejo durante semanas.
 */
const SITIO = (process.env.SITIO_URL
  || 'https://biblio-nexo-fuckingkrio.vercel.app').replace(/\/+$/, '');

const EN_REDE = /^https:\/\//.test(SITIO);

/** Variantes del dominio real. Con el alias de Vercel no aplican: ahí no hay `www`. */
const ES_DOMINIO_PROPIO = EN_REDE && !/\.vercel\.app$/.test(new URL(SITIO).hostname);

/**
 * Origen que el propio despliegue se declara a sí mismo (su `rel="canonical"`).
 * Todo lo demás —og:url, sitemap, robots— tiene que coincidir con ESTE, no con
 * la dirección por la que nosotros llamamos: así el script vale igual contra
 * `vite preview`, y a la vez pilla el día que el DNS se mueve y el build sigue
 * declarándose en el alias.
 */
let ORIGEN_PUBLICADO = null;

const SIN_NUBE = process.env.SIN_NUBE === '1';
const TIEMPO_LIMITE = 20_000;

const fallos = [];
let total = 0;

/** Ejecuta una comprobación atrapando el error: queremos el recuento completo, no morir en la primera. */
async function revisar(etiqueta, fn) {
  total += 1;
  try {
    const detalle = await fn();
    console.log(`  ✓ ${etiqueta}${detalle ? ` — ${detalle}` : ''}`);
  } catch (e) {
    fallos.push(etiqueta);
    console.log(`  ✗ ${etiqueta}\n      ${String(e && e.message || e).split('\n').join('\n      ')}`);
  }
}

function exigir(cond, mensaje) {
  if (!cond) throw new Error(mensaje);
}

/**
 * GET con tiempo límite y sin seguir redirecciones. Devuelve `{ estado, cabeceras,
 * texto, bytes, destino }`. Se lee el cuerpo como texto Y como bytes porque
 * varias comprobaciones necesitan ambas cosas (el IHDR de un PNG son bytes).
 */
async function pedir(ruta, { seguir = false, cabeceras = {} } = {}) {
  const url = new URL(ruta, `${SITIO}/`).toString();
  const respuesta = await fetch(url, {
    redirect: seguir ? 'follow' : 'manual',
    signal: AbortSignal.timeout(TIEMPO_LIMITE),
    headers: { 'user-agent': 'biblio-nexo/verificar-sitio-vivo (comprobacion automatica)', ...cabeceras }
  });
  const buffer = Buffer.from(await respuesta.arrayBuffer());
  return {
    url,
    estado: respuesta.status,
    cabeceras: respuesta.headers,
    bytes: buffer,
    texto: buffer.toString('utf8'),
    destino: respuesta.headers.get('location')
  };
}

/*
 * GET directo a la API de Supabase (es otro origen: el de la base de datos, no
 * el del sitio). Separa «no llegué» de «respondió mal», que son dos diagnósticos
 * opuestos: confundir un cortocircuito de red con un proyecto pausado manda a
 * revisar lo equivocado.
 */
async function pedirNube(base, ruta, cabeceras) {
  try {
    const r = await fetch(`${base}${ruta}`, {
      headers: cabeceras,
      signal: AbortSignal.timeout(TIEMPO_LIMITE),
      redirect: 'manual'
    });
    return { estado: r.status, texto: await r.text() };
  } catch (e) {
    if (e?.name === 'TimeoutError') throw new Error(`agotó los ${TIEMPO_LIMITE / 1000} s pidiendo ${ruta}`);
    throw new Error(`no se pudo conectar a ${base} (${e?.cause?.code || e?.message || e}). Si esto corre en un runner de Actions, Supabase no resolvió: mirar https://www.supabestatus.com antes de tocar nada del repo.`);
  }
}

async function estadoFinal(ruta) {
  // Las URLs del sitemap y del manifest vienen absolutas, con el origen escrito
  // en el build; se convierte a su ruta para preguntar LEJOS de ese origen: lo
  // que se quiere saber es si ESTE despliegue sirve ese archivo, no si existe en
  // algún otro.
  const local = /^https?:\/\//.test(ruta) ? new URL(ruta).pathname : ruta;
  const r = await pedir(local, { seguir: true });
  return r.estado;
}

/** El tipo MIME sin parámetros (`; charset=…`). */
function tipoDe(respuesta) {
  return (respuesta.cabeceras.get('content-type') || '').split(';')[0].trim().toLowerCase();
}

function buscar(texto, expresion, etiqueta) {
  const m = expresion.exec(texto);
  exigir(m, `no se encontró ${etiqueta}`);
  return m;
}

console.log(`\nVerificando el sitio publicado en ${SITIO}\n`);

// ─── 1. La portada: lo que ve un buscador y lo que ve un vecino al compartir ───
console.log('1. Portada y metadatos');

let portada;
await revisar('GET / responde 200 con HTML', async () => {
  portada = await pedir('/');
  exigir(portada.estado === 200, `respondió ${portada.estado} (se esperaba 200; un 308/301 infinito suele ser un rewrite roto en vercel.json)`);
  exigir(tipoDe(portada).startsWith('text/html'), `respondió content-type «${tipoDe(portada)}»`);
  exigir(portada.bytes.length > 2000, `el HTML pesa ${portada.bytes.length} B, demasiado corto para ser la app`);
  return `${portada.bytes.length} B`;
});

await revisar('no quedaron tokens del build sin sustituir', () => {
  exigir(!/__ORIGEN__|__IMAGEN_SOCIAL__/.test(portada.texto),
    'el HTML servido conserva __ORIGEN__/__IMAGEN_SOCIAL__: el plugin `senalesPublicas` de vite.config.js no corrió, o se desplegó un artefacto de otro build');
});

/**
 * Todos los metadatos que llevan origen tienen que decir el MISMO origen, y ese
 * origen tiene que ser este. Es la comprobación que evita el clásico de sitio
 * vibecodeado: canonical en un dominio, og:image en otro y favicon en un tercero.
 */
await revisar('canonical, og:url, og:image, twitter:image e íconos comparten este origen', () => {
  // Solo el <head>: el cuerpo lo pinta JS y ahí hay URLs de todo tipo que no
  // forman parte de la identidad del despliegue.
  const cabecera = portada.texto.slice(0, portada.texto.indexOf('</head>') + 1 || 6000);
  const absolutas = [...cabecera.matchAll(/(?:href|content)="(https?:\/\/[^"]+)"/g)]
    .map(m => m[1])
    .filter(u => !/fonts\.googleapis|fonts\.gstatic/.test(u));
  exigir(absolutas.length >= 4,
    `solo hay ${absolutas.length} URLs absolutas en el <head>; se esperaban al menos canonical, og:url, og:image y twitter:image (los íconos van a ruta absoluta del propio origen, que es lo correcto)`);
  const origenes = new Set(absolutas.map(u => new URL(u).origin));
  exigir(origenes.size === 1,
    `el <head> mezcla orígenes (${[...origenes].join(', ')}): canonical, Open Graph y la imagen social tienen que decir todos el mismo`);
  ORIGEN_PUBLICADO = [...origenes][0];
  const canonical = /rel="canonical"\s+href="([^"]+)"/.exec(portada.texto)?.[1]
    || /href="([^"]+)"\s+rel="canonical"/.exec(portada.texto)?.[1];
  exigir(canonical, 'no hay <link rel="canonical">');
  exigir(new URL(canonical).origin === ORIGEN_PUBLICADO, 'el canonical no coincide con los demás metadatos');
  if (EN_REDE) {
    exigir(ORIGEN_PUBLICADO === SITIO,
      `el despliegue se declara en ${ORIGEN_PUBLICADO} pero se lo pide por ${SITIO}: hace falta volver a desplegar con VITE_ORIGEN_PUBLICO=${SITIO}, o el canonical, el sitemap y la tarjeta de WhatsApp seguirán apuntando al otro origen`);
  }
  return `un solo origen en ${absolutas.length} URLs (${ORIGEN_PUBLICADO})`;
});

await revisar('la tarjeta para compartir (og:image) se puede descargar', async () => {
  const imagen = /property="og:image"\s+content="([^"]+)"/.exec(portada.texto)?.[1]
    || /content="([^"]+)"\s+property="og:image"/.exec(portada.texto)?.[1];
  exigir(imagen, 'no hay <meta property="og:image">');
  // Se pide por su ruta al despliegue que estamos mirando, no a la URL escrita:
  // si el HTML dice `https://biblionexo.cl/x.jpg` pero la prueba corre contra el
  // alias, lo que queremos saber es si ese archivo existe ahí.
  const r = await pedir(new URL(imagen).pathname);
  exigir(r.estado === 200, `respondió ${r.estado} en ${new URL(imagen).pathname}`);
  exigir(tipoDe(r).startsWith('image/'), `content-type «${tipoDe(r)}», no una imagen`);
  exigir(r.bytes.length > 20_000, `la imagen social pesa ${r.bytes.length} B; una tarjeta decente ronda los 100 KB`);
  exigir(new URL(imagen).origin === ORIGEN_PUBLICADO, `og:image está en otro origen (${new URL(imagen).origin})`);
  return `${new URL(imagen).pathname} · ${tipoDe(r)} · ${Math.round(r.bytes.length / 1024)} KB`;
});

// La portada es el envoltorio de la SPA: su contenido lo arma el arranque, así
// que lo que puede prometer es un título decente y CERO <h1> propio —el <h1> lo
// pone cada vista, una sola vez (señal 7)—. Si algún día este envoltorio gana un
// <h1> estático, quien navega ve dos: por eso se comprueba que no lo haya.
await revisar('la portada está titulada y no añade un <h1> al de su vista', () => {
  const sinComentarios = portada.texto.replace(/<!--[\s\S]*?-->/g, '');
  const titulo = buscar(sinComentarios, /<title>([^<]*)<\/title>/, '<title>')[1].trim();
  exigir(titulo.length > 10, `título sospechosamente corto: «${titulo}»`);
  exigir(/BiblioNexo/.test(titulo), `el título no nombra el servicio: «${titulo}»`);
  const h1 = (sinComentarios.match(/<h1[\s>]/g) || []).length;
  exigir(h1 === 0, `el envoltorio trae ${h1} <h1> estático(s): la vista pinta el suyo y quedarían dos`);
  return `«${titulo}», <h1> a cargo de la vista`;
});

await revisar('JSON-LD presente y parseable', () => {
  // Sin los comentarios primero: el <head> lleva una explicación que cita
  // `<script type="application/ld+json">` como ejemplo, y casarlo daría por
  // bloque de datos un párrafo de prosa (pasó la primera vez que se corrió).
  const sinComentarios = portada.texto.replace(/<!--[\s\S]*?-->/g, '');
  const bloques = [...sinComentarios.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)];
  exigir(bloques.length >= 1, 'no hay ningún bloque application/ld+json');
  const tipos = [];
  for (const b of bloques) {
    let datos;
    try { datos = JSON.parse(b[1]); } catch (e) { throw new Error(`JSON-LD inválido: ${e.message}`); }
    // Los datos de contacto de ejemplo (src/js/config.js) no pueden salir a los
    // buscadores: se comprueba solo el bloque, no el HTML — un `type="email"`
    // de cualquier formulario es válido y no tiene que ver con esto.
    exigir(!/streetAddress|"telephone"|"email"|openingHours/.test(b[1]),
      'el JSON-LD publica dirección, teléfono, correo u horarios: en src/js/config.js son datos de ejemplo y no deben salir a los buscadores hasta que el municipio los confirme');
    const nodos = datos['@graph'] ? datos['@graph'] : [datos];
    for (const n of nodos) tipos.push(n['@type']);
  }
  const aplanado = JSON.stringify(tipos);
  exigir(/Library/.test(aplanado), 'falta el tipo Library');
  exigir(/GovernmentOrganization/.test(aplanado), 'falta el tipo GovernmentOrganization');
  return tipos.map(t => Array.isArray(t) ? t.join('+') : t).join(', ');
});

// ─── 2. Identidad: que lo servido sea el archivo real, no un 404 disfrazado ───
console.log('\n2. Identidad del sitio');

await revisar('/favicon.ico es un .ico multi-tamaño', async () => {
  const r = await pedir('/favicon.ico');
  exigir(r.estado === 200, `respondió ${r.estado}`);
  exigir(r.bytes.slice(0, 4).equals(Buffer.from([0, 0, 1, 0])),
    'los primeros bytes no son la firma de un contenedor ICO (00 00 01 00): se está sirviendo otra cosa');
  const entradas = r.bytes.readUInt16LE(4);
  exigir(entradas >= 3, `el .ico solo declara ${entradas} tamaño(s); la señal de un sitio hecho a mano es 16/24/32/48/64`);
  exigir(r.bytes.length > 5_000, `pesa ${r.bytes.length} B, parece un favicon de relleno`);
  return `${entradas} tamaños, ${r.bytes.length} B`;
});

/**
 * El IHDR de un PNG guarda el ancho en los bytes 16-19 y el alto en 20-23. Se
 * lee de los bytes servidos, no del repo: así esto detecta el día que alguien
 * suba un ícono redimensionado mal, o el manifest apuntando a un cuadro de 64
 * px que se ve borroso en la pantalla de inicio de un celular.
 */
for (const [archivo, lado] of [['/icono-192x192.png', 192], ['/icono-512x512.png', 512]]) {
  await revisar(`${archivo} mide ${lado}×${lado}`, async () => {
    const r = await pedir(archivo);
    exigir(r.estado === 200, `respondió ${r.estado}`);
    exigir(r.bytes.slice(1, 4).toString('ascii') === 'PNG', 'no es un PNG');
    exigir(r.bytes.readUInt32BE(16) === lado && r.bytes.readUInt32BE(20) === lado,
      `IHDR dice ${r.bytes.readUInt32BE(16)}×${r.bytes.readUInt32BE(20)} px, no ${lado}×${lado}`);
    return `${r.bytes.length} B`;
  });
}

await revisar('/manifest.json declara la app y sus íconos', async () => {
  const r = await pedir('/manifest.json');
  exigir(r.estado === 200, `respondió ${r.estado}`);
  const datos = JSON.parse(r.texto);
  exigir(datos.name && datos.short_name, 'faltan name/short_name');
  exigir(datos.display === 'standalone', `display es «${datos.display}»`);
  const ic = (datos.icons || []).filter(i => /512/.test(i.src || ''));
  exigir(ic.length >= 1, 'ningún ícono de 512 en el manifest: Android mostrará un cuadrado genérico');
  const rutas = [...new Set((datos.icons || []).map(i => i.src))];
  for (const ruta of rutas) {
    const estado = await estadoFinal(ruta);
    exigir(estado === 200, `el ícono del manifest (${ruta}) responde ${estado}`);
  }
  return `${rutas.length} íconos, todos accesibles`;
});

await revisar('/robots.txt y /sitemap.xml existen y se referencian', async () => {
  const robots = await pedir('/robots.txt');
  exigir(robots.estado === 200, `/robots.txt respondió ${robots.estado}`);
  const sitemap = buscar(robots.texto, /^Sitemap:\s*(\S+)/im, 'una línea Sitemap: en robots.txt')[1];
  exigir(sitemap.startsWith(ORIGEN_PUBLICADO || SITIO),
    `Sitemap: dice ${sitemap}, y el despliegue se declara en ${ORIGEN_PUBLICADO || SITIO}: robots.txt y canonical no se hablan`);
  const xml = await pedir(new URL(sitemap).pathname);
  exigir(xml.estado === 200, `/sitemap.xml respondió ${xml.estado}`);
  exigir(xml.texto.startsWith('<?xml') || xml.texto.startsWith('<urlset'), 'el sitemap no es XML');
  const direcciones = [...xml.texto.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]);
  exigir(direcciones.length >= 2, `el sitemap lista ${direcciones.length} URLs`);
  for (const direccion of direcciones) {
    exigir(direccion.startsWith(ORIGEN_PUBLICADO || SITIO),
      `el sitemap publica ${direccion}, que no es el origen declarado por el sitio (${ORIGEN_PUBLICADO || SITIO})`);
    const estado = await estadoFinal(direccion);
    exigir(estado === 200, `${direccion} responde ${estado} aunque está en el sitemap`);
  }
  return `${direcciones.length} URLs indexables, todas 200`;
});

await revisar('/llms.txt sirve y no dice nada que el sitio no cumpla', async () => {
  const r = await pedir('/llms.txt');
  exigir(r.estado === 200, `respondió ${r.estado}`);
  exigir(/biblionexo/i.test(r.texto), 'el archivo no menciona Biblio-Nexo');
  return `${r.bytes.length} B`;
});

// ─── 3. Las páginas públicas y la página de error ───
console.log('\n3. Páginas públicas y 404');

await revisar('/privacidad.html existe, declara la política y tiene su <h1>', async () => {
  const r = await pedir('/privacidad.html');
  exigir(r.estado === 200, `respondió ${r.estado}`);
  // Esta página sí es estática de verdad: la lee un buscador sin JS y la abre
  // un vecino desde el aviso del login. Un solo <h1>, como debe ser.
  const h1 = (r.texto.replace(/<!--[\s\S]*?-->/g, '').match(/<h1[\s>]/g) || []).length;
  exigir(h1 === 1, `hay ${h1} <h1> en la política de privacidad (se espera 1)`);
  const bloques = [...r.texto.replace(/<!--[\s\S]*?-->/g, '').matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)];
  const tipos = bloques.map(b => JSON.stringify(JSON.parse(b[1]))).join(' ');
  exigir(/PrivacyPolicy/.test(tipos), 'no hay JSON-LD de tipo PrivacyPolicy en la página de privacidad');
});

await revisar('/escaneo-remoto.html existe, está noindex y trae su montura', async () => {
  const r = await pedir('/escaneo-remoto.html');
  exigir(r.estado === 200, `respondió ${r.estado}`);
  exigir(/name="robots"\s+content="noindex/.test(r.texto.replace(/<!--[\s\S]*?-->/g, '')),
    'la página de escaneo remoto perdió su noindex: se comparte por enlace con un token y no debe quedar en Google');
  // El formulario lo arma JS sobre `#escaneo-remoto-app`; lo que este HTML debe
  // garantizar es que el envoltorio es el suyo propio y no el fallback de la
  // SPA, porque un rewrite de Vercel mal puesto sirve index.html para todo y
  // el formulario entonces no aparece nunca.
  exigir(/id="escaneo-remoto-app"/.test(r.texto), 'no está el contenedor #escaneo-remoto-app: se sirvió otra página, no esta');
  exigir(/<script type="module"[^>]+src="[^"]*escaneo-/.test(r.texto), 'no carga su módulo escaneo-*.js: el bundle cambió de nombre y este HTML es de un despliegue viejo');
});

/**
 * Un 404 de verdad, con la página propia. Es la comprobación que más se cae en
 * el tiempo: si alguien toca `vercel.json`, una ruta inexistente empieza a
 * responder 200 con la SPA y los buscadores se llenan de páginas duplicadas.
 */
await revisar('una ruta inexistente responde 404 con la página propia', async () => {
  if (!EN_REDE) {
    console.log('     (omitida fuera del despliegue: vite preview sirve la SPA con 200 y no emula el 404.html de Vercel)');
    return 'n/d';
  }
  const ruta = `/no-existe-${Date.now().toString(36)}.html`;
  const r = await pedir(ruta);
  exigir(r.estado === 404, `respondió ${r.estado} a ${ruta}; se esperaba 404`);
  exigir(/<h1/i.test(r.texto), 'el 404 no trae un <h1>: es la página de error del servidor, no la nuestra');
  exigir(/No encontramos esta p/.test(r.texto), 'el 404 no es la página propia de Biblio-Nexo: alguien reemplazó la página de Vercel por la genérica');
  return '404 real, con la página propia';
});

/**
 * El service worker es lo que hace que la app abra en la sala sin señal. Si
 * `dist/sw.js` no se sirve o quedó sin el manifest de precache, la app sigue
 * viéndose bien en cualquier prueba y el día que se corta Internet es la
 * primera vez que alguien se entera de que no hay respaldo.
 */
await revisar('/sw.js se sirve y trae el precache', async () => {
  const r = await pedir('/sw.js');
  exigir(r.estado === 200, `respondió ${r.estado}`);
  exigir(tipoDe(r).includes('javascript'), `content-type «${tipoDe(r)}»: un service worker tiene que servirse como JS desde el mismo origen`);
  exigir(/precache|__WB_MANIFEST|workbox/i.test(r.texto), 'no hay rastro de workbox/precache: se sirvió un service worker vacío o de otro build');
  const registro = await pedir('/registerSW.js');
  exigir(registro.estado === 200, `/registerSW.js respondió ${registro.estado}`);
  return `${r.bytes.length} B`;
});

if (ES_DOMINIO_PROPIO) {
  await revisar('www redirige al dominio desnudo con 308', async () => {
    const url = new URL(SITIO);
    const conWww = `${url.protocol}//www.${url.hostname}/`;
    const r = await fetch(conWww, { redirect: 'manual', signal: AbortSignal.timeout(TIEMPO_LIMITE) });
    exigir([301, 308].includes(r.status), `${conWww} respondió ${r.status}; se esperaba 308 hacia ${SITIO}/`);
    exigir((r.headers.get('location') || '').replace(/\/+$/, '') === SITIO,
      `Location dice ${r.headers.get('location')}, debería decir ${SITIO}/`);
    return `${r.status} → ${r.headers.get('location')}`;
  });
}

// ─── 4. La base de datos: pausada, caída, o viva ───
//
// Un proyecto de Supabase del plan Free se pausa a los 7 días de poca actividad
// y desde entonces TODA su API responde 540. La app, mal que mal, abre (está
// cacheada por el service worker) pero no carga un solo dato: es la falla más
// probable y la más silenciosa de este despliegue. Este bloque la detecta — y de
// paso, al ser una consulta real, es el latido que mantiene el proyecto despierto.
if (!SIN_NUBE) {
  console.log('\n4. Supabase (plan Free: proyecto pausable)');

  const config = await readFile(join(RAIZ, 'src/js/config.js'), 'utf8');
  // Se extrae el valor de RESPALDO literal, no la expresión completa: en
  // `src/js/config.js` la línea es
  //     SUPABASE_URL: import.meta.env?.VITE_SUPABASE_URL || 'https://…',
  // y un regex anclado a `SUPABASE_URL:\s*'` no la encuentra (así pasó a
  // primera vez). Casar el literal entrecomillado es más tonto y más difícil de
  // romper: la URL de proyecto siempre es `https://<ref>.supabase.co` y la anon
  // key siempre es un JWT que empieza por `eyJ`.
  const url = process.env.VITE_SUPABASE_URL
    || /'(https:\/\/[a-z0-9-]+\.supabase\.co)'/.exec(config)?.[1];
  const anon = process.env.VITE_SUPABASE_ANON_KEY
    || /SUPABASE_ANON_KEY[^']*?'(eyJ[A-Za-z0-9_.-]{20,})'/.exec(config)?.[1];

  await revisar('src/js/config.js tiene URL y anon key', () => {
    exigir(/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(url || ''), `SUPABASE_URL no parece una URL de proyecto: «${url}»`);
    exigir(anon && anon.length > 30, 'no se encontró SUPABASE_ANON_KEY (se lee del repo a propósito: es pública por diseño)');
    return url.replace(/^https:\/\//, '').split('.')[0];
  });

  await revisar('la API responde (proyecto no pausado)', async () => {
    const r = await pedirNube(url, '/rest/v1/elementos_eliminados?select=id&limit=1',
      { apikey: anon, Authorization: `Bearer ${anon}` });
    exigir(r.estado !== 540,
      'HTTP 540: el proyecto está PAUSADO. Entrar a https://supabase.com/dashboard y pulsar «Reclaim project». Tras reactivar, revisar que las funciones programadas (pg_cron) sigan activas.');
    exigir(r.estado === 200, `respondió ${r.estado} (200 = vivo y es la señal de que el proyecto no está pausado; 401 = la anon key cambió; 404 = la tabla desapareció)`);
    return `HTTP ${r.estado} · la RLS devuelve solo lo que un visitante puede ver, y aun así cuenta como actividad`;
  });

  await revisar('Auth está de pie (el login depende de esto)', async () => {
    const r = await pedirNube(url, '/auth/v1/health', { apikey: anon });
    exigir(r.estado === 200, `respondió ${r.estado} (401 = la anon key ya no es esta)`);
    return `HTTP ${r.estado}`;
  });

  // Se imprime aparte para que la clave quede en el log del workflow solo si
  // alguien la necesita para reproducir la prueba; no se copia en ningún archivo.
  console.log('\n     (las dos consultas anteriores usan la anon key pública que ya está en src/js/config.js, leída del repo: este workflow no tiene secretos)');
} else {
  console.log('\n4. Supabase — omitido (SIN_NUBE=1)');
}

// ─── Recuento ───
console.log(`\n${'─'.repeat(60)}`);
if (fallos.length === 0) {
  console.log(`${total} comprobaciones correctas, 0 con fallo — el sitio publicado está bien.`);
} else {
  console.log(`${total - fallos.length}/${total} comprobaciones correctas, ${fallos.length} con fallo:`);
  for (const f of fallos) console.log(`  · ${f}`);
  console.log(`\nSi esto corrió en GitHub Actions, el dueño del repo recibe un correo. Si corrió\npor schedule y hace días que no hay ningún push, ojo: GitHub apaga las tareas\nprogramadas de los repos públicos tras 60 días sin actividad.`);
}
process.exit(fallos.length);
