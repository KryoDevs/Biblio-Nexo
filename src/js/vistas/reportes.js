// Vista Reportes. Extraído mecánicamente de js/modules/ui.js (Fase 4).
import { CONFIG } from '../config.js';
import { db } from '../modules/db.js';

import { html } from '../modules/utilidades.js';

export default {
  // Calcula el rango de fechas de un período, siempre en horario local.
  _rangoPeriodo(periodo) {
    const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);

    if (periodo === 'dia') {
      return { desde: iso(hoy), hasta: iso(hoy), titulo: 'Hoy' };
    }
    if (periodo === 'semana') {
      // Semana de lunes a domingo, como se usa habitualmente en Chile
      const diaSemana = (hoy.getDay() + 6) % 7; // 0 = lunes
      const lunes = new Date(hoy); lunes.setDate(hoy.getDate() - diaSemana);
      const domingo = new Date(lunes); domingo.setDate(lunes.getDate() + 6);
      return { desde: iso(lunes), hasta: iso(domingo), titulo: 'Esta semana' };
    }
    if (periodo === 'mes') {
      const primero = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
      const ultimo = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0);
      return { desde: iso(primero), hasta: iso(ultimo), titulo: 'Este mes' };
    }
    const enero = new Date(hoy.getFullYear(), 0, 1);
    const diciembre = new Date(hoy.getFullYear(), 11, 31);
    return { desde: iso(enero), hasta: iso(diciembre), titulo: 'Este año' };
  },

  async renderReports() {
    const container = this._container();
    if (!container) return;

    const periodo = this.reportPeriod || 'mes';
    const rango = this._rangoPeriodo(periodo);

    let reporte;
    try {
      reporte = await db.obtenerReporte(rango.desde, rango.hasta);
    } catch (err) {
      if (this.currentView !== 'reports') return;
      container.innerHTML = html`<div class="catalog-card bg-patrimonio-card dark:bg-stone-900 rounded-2xl border border-stone-300 dark:border-stone-600 p-6 text-center">
        <p class="text-sm text-stone-600 dark:text-stone-300">No se pudo generar el reporte.</p>
        <p class="text-xs text-stone-500 dark:text-stone-400 mt-1">${err.message || ''}</p>
      </div>`;
      return;
    }
    if (this.currentView !== 'reports') return;

    // La migración 004 agrega las columnas de fecha que los reportes necesitan
    if (reporte.faltaMigracion) {
      container.innerHTML = `
        <div class="catalog-card bg-patrimonio-card dark:bg-stone-900 rounded-2xl border border-stone-300 dark:border-stone-600 p-6 max-w-xl">
          <h3 class="font-serif font-semibold text-lg text-stone-900 dark:text-stone-100 mb-2">Falta un paso en la base de datos</h3>
          <p class="text-sm text-stone-600 dark:text-stone-300 mb-3">
            Los reportes necesitan saber en qué fecha se hizo cada préstamo, y esa columna todavía no existe.
          </p>
          <p class="text-sm text-stone-600 dark:text-stone-300">
            Abre el editor SQL de tu proyecto en Supabase y ejecuta el archivo
            <code class="bg-stone-100 dark:bg-stone-700 px-1.5 py-0.5 rounded text-xs font-mono">supabase/migrations/004_reportes_portadas_zona_horaria.sql</code>.
            Luego vuelve a esta pantalla.
          </p>
        </div>`;
      return;
    }

    const botonPeriodo = (clave, texto) => html`
      <button data-period="${clave}" class="report-period-btn px-3.5 py-1.5 rounded-lg text-xs font-bold border transition ${
        periodo === clave
          ? 'bg-patrimonio-lago text-white border-patrimonio-lago'
          : 'bg-white dark:bg-stone-800 text-stone-600 dark:text-stone-300 border-stone-300 dark:border-stone-600 hover:border-patrimonio-lago'
      }">${texto}</button>`;

    const tarjetas = [
      { label: 'Préstamos realizados', valor: reporte.totalPrestamos, icono: 'fa-right-left', color: 'text-patrimonio-lago' },
      { label: 'Devoluciones', valor: reporte.totalDevoluciones, icono: 'fa-rotate-left', color: 'text-patrimonio-bosque' },
      { label: 'Lectores nuevos', valor: reporte.totalNuevosLectores, icono: 'fa-user-plus', color: 'text-patrimonio-madera' },
      { label: 'Devueltos con atraso', valor: reporte.devolucionesAtrasadas, icono: 'fa-triangle-exclamation', color: 'text-rose-700' }
    ];

    const ranking = (titulo, items, vacio) => html`
      <div class="catalog-card bg-patrimonio-card dark:bg-stone-900 rounded-2xl shadow-sm border border-stone-300 dark:border-stone-600 p-5">
        <h3 class="font-serif font-semibold text-lg text-stone-900 dark:text-stone-100 mb-3">${titulo}</h3>
        ${items.length ? html`<ol class="space-y-2">${items.map((i, n) => html`
          <li class="flex items-center gap-3 text-sm">
            <span class="w-5 h-5 rounded bg-stone-100 dark:bg-stone-700 text-stone-500 dark:text-stone-400 text-[10px] font-black flex items-center justify-center shrink-0">${n + 1}</span>
            <span class="flex-1 truncate text-stone-700 dark:text-stone-300">${i.etiqueta}</span>
            <span class="font-bold text-stone-900 dark:text-stone-100 tabular-nums">${i.total}</span>
          </li>`)}</ol>`
        : html`<p class="text-sm text-stone-500 dark:text-stone-400 py-4 text-center">${vacio}</p>`}
      </div>`;

    const paradas = Array.isArray(reporte.porParada) ? reporte.porParada : [];
    const maxPrestamosParada = paradas.reduce((max, p) => Math.max(max, Number(p.total_prestamos) || 0), 1);

    const seccionParadas = html`
      <div id="reporte-paradas" class="catalog-card bg-patrimonio-card dark:bg-stone-900 rounded-2xl shadow-sm border border-stone-300 dark:border-stone-600 p-5 mt-4">
        <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-3">
          <div>
            <h3 class="font-serif font-semibold text-lg text-stone-900 dark:text-stone-100 flex items-center gap-2">
              <i aria-hidden="true" class="fas fa-map-location-dot text-patrimonio-lago dark:text-stone-300"></i>
              Préstamos por parada del Bibliomóvil
            </h3>
            <p class="text-xs text-stone-500 dark:text-stone-400">Distribución histórica acumulada por punto de atención territorial.</p>
          </div>
          <span class="text-xs font-bold text-stone-600 dark:text-stone-300 bg-stone-100 dark:bg-stone-800 px-2.5 py-1 rounded-lg self-start sm:self-auto">
            ${paradas.length} ${paradas.length === 1 ? 'parada registrada' : 'paradas registradas'}
          </span>
        </div>
        ${paradas.length ? html`
          <ol class="space-y-2.5">
            ${paradas.map((p, idx) => {
              const totalParada = Number(p.total_prestamos) || 0;
              const pct = Math.max(8, Math.round((totalParada / maxPrestamosParada) * 100));
              const tieneCoord = Number.isFinite(Number(p.lat)) && Number.isFinite(Number(p.lng)) && p.lat !== null && p.lng !== null;
              return html`
                <li class="p-3 rounded-xl border border-stone-200 dark:border-stone-700 bg-stone-50/60 dark:bg-stone-800/50">
                  <div class="flex items-center justify-between gap-3 text-sm mb-1.5">
                    <div class="flex items-center gap-2.5 min-w-0">
                      <span class="w-5 h-5 rounded bg-patrimonio-lago text-white text-[10px] font-black flex items-center justify-center shrink-0">${idx + 1}</span>
                      <span class="font-bold text-stone-800 dark:text-stone-100 truncate">${p.parada || 'Parada sin nombre'}</span>
                      ${tieneCoord ? html`<span class="text-[11px] font-mono text-stone-500 dark:text-stone-400 hidden sm:inline">(${Number(p.lat).toFixed(4)}, ${Number(p.lng).toFixed(4)})</span>` : ''}
                    </div>
                    <span class="font-bold text-stone-900 dark:text-stone-100 tabular-nums shrink-0">${totalParada} ${totalParada === 1 ? 'préstamo' : 'préstamos'}</span>
                  </div>
                  <div class="w-full h-1.5 bg-stone-200 dark:bg-stone-700 rounded-full overflow-hidden" aria-hidden="true">
                    <div class="h-full bg-patrimonio-madera rounded-full" style="width: ${pct}%"></div>
                  </div>
                </li>`;
            })}
          </ol>
        ` : html`<p class="text-sm text-stone-500 dark:text-stone-400 py-4 text-center">Sin préstamos registrados en paradas del Bibliomóvil.</p>`}
      </div>`;

    container.innerHTML = html`
      <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4 no-print">
        <div class="flex flex-wrap gap-2">
          ${botonPeriodo('dia', 'Diario')}
          ${botonPeriodo('semana', 'Semanal')}
          ${botonPeriodo('mes', 'Mensual')}
          ${botonPeriodo('anio', 'Anual')}
        </div>
        <div class="flex flex-wrap gap-2">
          <button id="backup-btn" class="btn-secundario border border-stone-300 dark:border-stone-600 bg-white dark:bg-stone-800 hover:bg-stone-50 dark:hover:bg-stone-700 text-stone-700 dark:text-stone-200 font-medium rounded-xl px-4 py-2 text-sm" title="Descarga una copia completa de libros, lectores y préstamos">
            <i aria-hidden="true" class="fas fa-database mr-1.5"></i> Respaldo completo
          </button>
          <button id="export-csv-btn" class="btn-secundario border border-stone-300 dark:border-stone-600 bg-white dark:bg-stone-800 hover:bg-stone-50 dark:hover:bg-stone-700 text-stone-700 dark:text-stone-200 font-medium rounded-xl px-4 py-2 text-sm">
            <i aria-hidden="true" class="fas fa-file-csv mr-1.5"></i> Exportar CSV
          </button>
          <button id="print-report-btn" class="btn-madera text-white font-medium rounded-xl shadow px-4 py-2 text-sm">
            <i aria-hidden="true" class="fas fa-print mr-1.5"></i> Imprimir / PDF
          </button>
        </div>
      </div>

      <div id="report-sheet">
        <!-- Encabezado: se ve principalmente al imprimir -->
        <div class="mb-5 pb-4 border-b border-stone-300 dark:border-stone-600">
          <h2 class="font-serif font-semibold text-xl text-stone-900 dark:text-stone-100">Reporte de actividad — ${rango.titulo}</h2>
          <p class="text-xs text-stone-500 dark:text-stone-400 mt-1">
            ${this._fechaLegible(rango.desde)} al ${this._fechaLegible(rango.hasta)}
            · ${CONFIG.BIBLIOTECA.nombreLargo}
          </p>
          <p class="text-[11px] text-stone-500 dark:text-stone-400 mt-0.5">Generado el ${this._fechaLegible(this._rangoPeriodo('dia').desde)}</p>
        </div>

        <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
          ${tarjetas.map(c => html`
            <div class="catalog-card bg-patrimonio-card dark:bg-stone-900 rounded-2xl shadow-sm border border-stone-300 dark:border-stone-600 p-5">
              <i aria-hidden="true" class="fas ${c.icono} ${c.color} text-xl mb-2"></i>
              <p class="font-serif font-semibold text-4xl text-stone-900 dark:text-stone-100">${c.valor}</p>
              <p class="text-xs text-stone-500 dark:text-stone-400 font-bold uppercase tracking-wide mt-1">${c.label}</p>
            </div>`)}
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div class="catalog-card bg-patrimonio-card dark:bg-stone-900 rounded-2xl shadow-sm border border-stone-300 dark:border-stone-600 p-5">
            <h3 class="font-serif font-semibold text-lg text-stone-900 dark:text-stone-100 mb-1">Movimiento del período</h3>
            <p class="text-xs text-stone-500 dark:text-stone-400 mb-4">Proporción entre lo prestado y lo devuelto.</p>
            <div class="relative h-44 mb-3">
              <canvas id="reporte-chart"></canvas>
              <div id="reporte-chart-centro" class="absolute inset-0 flex flex-col items-center justify-center pointer-events-none text-center"></div>
            </div>
            <div id="reporte-legend" class="divide-y divide-stone-100"></div>
          </div>
          ${ranking('Libros más prestados', reporte.topLibros, 'Sin préstamos en este período.')}
          ${ranking('Lectores más activos', reporte.topLectores, 'Sin actividad en este período.')}
        </div>

        ${seccionParadas}
      </div>
    `;

    container.querySelectorAll('.report-period-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this.reportPeriod = btn.dataset.period;
        this.renderReports();
      });
    });

    document.getElementById('print-report-btn').addEventListener('click', () => window.print());
    document.getElementById('export-csv-btn').addEventListener('click', () => this._exportarReporteCsv(reporte, rango));
    document.getElementById('backup-btn').addEventListener('click', async e => {
      const btn = e.currentTarget;
      const textoOriginal = btn.innerHTML;
      btn.disabled = true;
      btn.innerHTML = '<i aria-hidden="true" class="fas fa-spinner fa-spin mr-1.5"></i> Preparando…';
      try {
        const respaldo = await db.exportarTodo();
        const total = Object.values(respaldo.tablas).reduce((s, f) => s + f.length, 0);
        this._descargar(
          JSON.stringify(respaldo, null, 2),
          `respaldo-biblionexo-${this._rangoPeriodo('dia').desde}.json`,
          'application/json'
        );
        this.showToast(`Respaldo descargado: ${total} registros.`, 'success');
      } catch (err) {
        this.showToast(err.message || 'No se pudo generar el respaldo.', 'error');
      } finally {
        btn.disabled = false;
        btn.innerHTML = textoOriginal;
      }
    });

    this._renderDonut('reporte-chart', 'reporte-legend', [
      { etiqueta: 'Préstamos', valor: reporte.totalPrestamos, color: '#1B3B48' },
      { etiqueta: 'Devoluciones', valor: reporte.totalDevoluciones, color: '#2C4A3E' },
      { etiqueta: 'Lectores nuevos', valor: reporte.totalNuevosLectores, color: '#7A431D' }
    ]);
  },

  // Exporta el detalle del período a CSV, listo para abrir en Excel.
  _exportarReporteCsv(reporte, rango) {
    // Las comillas dobles se duplican y todo campo se encierra, que es como
    // el formato CSV maneja textos con comas o saltos de línea.
    // Además de encerrar y duplicar comillas, se neutralizan los caracteres con
    // los que Excel y LibreOffice inician una fórmula. Un título de libro que
    // empiece con "=" se ejecutaría al abrir el archivo — es la vía clásica de
    // inyección por CSV, y aquí los títulos los escribe cualquiera del personal.
    const celda = v => {
      let t = (v ?? '').toString();
      if (/^[=+\-@\t\r]/.test(t)) t = "'" + t;
      return `"${t.replace(/"/g, '""')}"`;
    };
    const filas = [];

    filas.push([celda('Reporte de actividad'), celda(rango.titulo)]);
    filas.push([celda('Desde'), celda(rango.desde), celda('Hasta'), celda(rango.hasta)]);
    filas.push([celda(CONFIG.BIBLIOTECA.nombreLargo)]);
    filas.push([]);

    filas.push([celda('RESUMEN')]);
    filas.push([celda('Préstamos realizados'), celda(reporte.totalPrestamos)]);
    filas.push([celda('Devoluciones'), celda(reporte.totalDevoluciones)]);
    filas.push([celda('Lectores nuevos'), celda(reporte.totalNuevosLectores)]);
    filas.push([celda('Devueltos con atraso'), celda(reporte.devolucionesAtrasadas)]);
    filas.push([]);

    filas.push([celda('DETALLE DE PRÉSTAMOS')]);
    filas.push([celda('Fecha préstamo'), celda('Libro'), celda('Autor'), celda('Lector'), celda('RUT'), celda('Devolución esperada'), celda('Estado')]);
    reporte.prestamos.forEach(p => filas.push([
      celda(p.fecha_prestamo), celda(p.libros?.titulo), celda(p.libros?.autor),
      celda(p.lectores?.nombre), celda(p.lectores?.rut),
      celda(p.fecha_devolucion_esperada), celda(p.estado)
    ]));
    filas.push([]);

    filas.push([celda('LECTORES NUEVOS')]);
    filas.push([celda('Nombre'), celda('RUT'), celda('Fecha de registro')]);
    reporte.nuevosLectores.forEach(l => filas.push([
      celda(l.nombre), celda(l.rut), celda((l.created_at || '').split('T')[0])
    ]));

    if (Array.isArray(reporte.porParada) && reporte.porParada.length > 0) {
      filas.push([]);
      filas.push([celda('PRÉSTAMOS POR PARADA DEL BIBLIOMÓVIL')]);
      filas.push([celda('Parada'), celda('Latitud'), celda('Longitud'), celda('Total préstamos')]);
      reporte.porParada.forEach(p => filas.push([
        celda(p.parada), celda(p.lat ?? ''), celda(p.lng ?? ''), celda(p.total_prestamos ?? 0)
      ]));
    }

    const csv = filas.map(f => f.join(';')).join('\r\n');
    // El BOM inicial hace que Excel reconozca los acentos correctamente
    this._descargar('\uFEFF' + csv, `reporte-biblionexo-${rango.desde}-a-${rango.hasta}.csv`, 'text/csv;charset=utf-8;');
    this.showToast('Reporte exportado.', 'success');
  }
};
