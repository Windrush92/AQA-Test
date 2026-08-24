/**
 * pdf-generator.js V4
 * Generates and prints the full test report.
 * Called via: window.generateAndPrint(data, test)
 * Shared: window.buildReportHTML(data, test) — used by inline modal too
 */

window.buildReportHTML = function(data, test) {
    const d = data || {};
    const LTRS = [0.5, 1.0, 1.5, 2.0, 2.5, 3.0, 3.5, 4.0, 4.5, 5.0];

    const hasHotWater = Array.isArray(d.funciones) && (d.funciones.includes('Agua Caliente') || d.funciones.includes('Agua Muy Caliente'));

    const v   = key => d[key] || '-';
    const chk = key => d[key] ? '✅ Sí' : '❌ No';
    const arr = key => (d[key] && d[key].length) ? d[key].join(', ') : '-';

    const termostatoText = d['chk-termostato-solo-frio-caliente']
        ? 'Solo Frío / Caliente'
        : `${v('termostato-nivel-min')} – ${v('termostato-nivel-max')} (Nivel)`;

    const tanqueText = d['chk-tiene-tanque']
        ? `${v('capacidad-tanque')} L — Llenado: ${v('tiempo-llenado-tanque')} min`
        : 'No tiene';

    const completedDate = test?.completedAt
        ? new Date(test.completedAt).toLocaleDateString('es-AR')
        : '-';
    const estadoFinal = d.estadoFinal || 'NO DEFINIDO';
    const estadoColor = estadoFinal === 'Aprobado' ? '#059669' : '#dc2626';

    // === LMC row builder ===
    function lmcRow(prefix, label) {
        const cells = LTRS.map((_, i) => {
            const val = d[`lmc-${prefix}-${i}`] || '-';
            return `<td>${val}</td>`;
        }).join('');
        return `<tr><td><strong>${label}</strong></td>${cells}</tr>`;
    }

    // === Gas quality row ===
    function gasQualityRow() {
        const EMOJIS = { '0': '➖', 'Bueno': '🟢', 'Medio': '🟡', 'Malo': '🔴' };
        const cells = LTRS.map((_, i) => {
            let val = d[`gas-q-${i}`] || '0';
            // backwards compatibility with old stars
            if (['1','2','3','4','5'].includes(val)) {
                if (val >= '4') val = 'Bueno';
                else if (val === '3') val = 'Medio';
                else val = 'Malo';
            }
            const emoji = EMOJIS[val] || '➖';
            return `<td style="font-size:14px; text-align:center">${emoji}</td>`;
        }).join('');
        return `<tr><td><strong>🟢 Calidad</strong></td>${cells}</tr>`;
    }

    // === Cycle summary ===
    function cycleSummary(prefix) {
        const ext = parseFloat(d[`extraccion-${prefix}`]) || 0;
        const rec = parseFloat(d[`recuperacion-${prefix}`]) || 0;
        const total = ext + rec;
        let cph = 0;
        if (total > 0) {
            cph = 60 / total;
            cph = Math.ceil(cph * 1.15);
        }
        
        const formatMMSS = (dec) => {
            if (!dec || dec <= 0) return '-';
            const s = Math.round(dec * 60);
            return `${Math.floor(s/60).toString().padStart(2,'0')}:${(s%60).toString().padStart(2,'0')}`;
        };

        return `
        <div class="print-grid cycle-summary-box" style="margin-top:0.4rem; background:#f8fafc; padding:0.5rem 0.75rem; border-radius:6px; border-left: 3px solid var(--primary); font-size:0.8rem;">
            <div><strong>Tiempo Extracción:</strong> ${formatMMSS(ext)} min</div>
            <div><strong>Tiempo Recuperación:</strong> ${formatMMSS(rec)} min</div>
            <div><strong>Tiempo Total Ciclo:</strong> ${formatMMSS(total)} min</div>
            <div style="font-size: 0.9rem; color: var(--primary); grid-column: 1 / -1; margin-top: 0.15rem;"><strong>Rendimiento:</strong> ${cph > 0 ? cph : '-'} Ciclos/Hora</div>
        </div>
        `;
    }

    // === Global gas stars ===
    const globalStarVal = parseInt(d['gas-calidad-val'] || 0);
    const globalStars = globalStarVal > 0 ? '★'.repeat(globalStarVal) + '☆'.repeat(5 - globalStarVal) : 'No registrada';

    const lmcHeader = `<tr><th style="min-width:44px">L</th><th>0.5</th><th>1.0</th><th>1.5</th><th>2.0</th><th>2.5</th><th>3.0</th><th>3.5</th><th>4.0</th><th>4.5</th><th>5.0</th></tr>`;

    const html = `
    <div class="print-header">
        <h1>Reporte Técnico de Equipo</h1>
        <div style="display:flex;gap:1.5rem;flex-wrap:wrap;margin-top:0.35rem;font-size:0.85rem">
            <span><strong>Técnico:</strong> ${v('tecnico')}</span>
            <span><strong>Fecha de Testeo:</strong> ${v('fecha-testeo')}</span>
            <span><strong>Fecha de Fin:</strong> ${completedDate}</span>
            <span style="font-size:0.95rem;font-weight:700;color:${estadoColor}">Estado: ${estadoFinal.toUpperCase()}</span>
        </div>
    </div>

    <div class="print-section">
        <h2>1. Información del Equipo</h2>
        <div class="print-grid">
            <div><strong>Marca:</strong> ${v('marca')}</div>
            <div><strong>Modelo:</strong> ${v('modelo')}</div>
            <div><strong>Fecha de Ingreso:</strong> ${v('fecha-ingreso')}</div>
            <div><strong>Cañerías:</strong> ${(d.canerias || []).join(', ') || '-'}</div>
            <div><strong>Funciones:</strong> ${(d.funciones || []).join(', ') || '-'}</div>
            <div><strong>Rendimiento:</strong> ${v('rendimiento')} L/h</div>
            <div><strong>Rango Fría:</strong> ${v('temp-fria-min')} – ${v('temp-fria-max')} ºC</div>
            ${hasHotWater ? `<div><strong>Rango Caliente:</strong> ${v('temp-caliente-min')} – ${v('temp-caliente-max')} ºC</div>` : ''}
            <div><strong>Rango Presión Agua:</strong> ${v('presion-min')} – ${v('presion-max')} PSI</div>
            <div><strong>Rango CO2:</strong> ${v('presion-co2-min')} – ${v('presion-co2-max')} Bar</div>
            <div><strong>Termostato:</strong> ${termostatoText}</div>
        </div>
        ${d['condiciones-particulares'] ? `<div class="print-box" style="margin-top:0.4rem; padding:0.4rem 0.6rem"><strong>Condiciones Particulares:</strong><br>${d['condiciones-particulares']}</div>` : ''}
    </div>

    <div class="print-section">
        <h2>2. Sanitizado</h2>
        <div class="print-box" style="padding: 0.5rem 0.75rem; font-weight: bold; font-size: 0.95rem; border-left: 3px solid var(--success);">
            Sanitizado realizado correctamente ✅
        </div>
    </div>

    <div class="print-section">
        <h2>3. Condiciones y Funcionalidades</h2>
        <div class="print-grid">
            <div><strong>Temp. Ambiente:</strong> ${v('temp-ambiente')} ºC</div>
            <div><strong>Temp. Agua Entrada:</strong> ${v('temp-agua-entrada')} ºC</div>
            <div><strong>Presión CO2 Medida:</strong> ${v('presion-co2-medida')} Bar</div>
            <div><strong>Presión 20PSI~:</strong> ${chk('chk-presion-20psi')}</div>
            <div><strong>Ventilación:</strong> ${chk('chk-ventilacion')}</div>
            <div><strong>Tanque / Banco:</strong> ${tanqueText}</div>
            <div><strong>Dispensa OK:</strong> ${chk('chk-dispensar')}</div>
            <div><strong>Sin pérdidas:</strong> ${chk('chk-perdidas')}</div>
        </div>
    </div>

    <div class="print-section">
        <h2>4. Tiempos Óptimos (500ml) — Referencia: 20 PSI ~</h2>
        <div class="print-grid">
            <div><strong>Alcanzar temp. Fría:</strong> ${v('tiempo-optimo-fria')} min</div>
            ${hasHotWater ? `<div><strong>Alcanzar temp. Caliente:</strong> ${v('tiempo-optimo-caliente')} min</div>` : ''}
            <div><strong>Alcanzar gasificación:</strong> ${v('tiempo-optimo-gas')} min</div>
            <div><strong>Llenado Fría 500ml:</strong> ${v('tiempo-500-fria')} s</div>
            ${hasHotWater ? `<div><strong>Llenado Caliente 500ml:</strong> ${v('tiempo-500-caliente')} s</div>` : ''}
            <div><strong>Llenado Con Gas 500ml:</strong> ${v('tiempo-500-gas')} s</div>
        </div>
    </div>

    <div class="print-section" style="page-break-before:always">
        <h2>5.1 LMC — Agua Fría &nbsp;<small style="font-weight:400;font-size:0.85rem">Rango: ${v('temp-fria-min')} – ${v('temp-fria-max')} ºC</small></h2>
        <table class="print-table"><thead>${lmcHeader}</thead><tbody>${lmcRow('fria','ºC')}</tbody></table>
        ${cycleSummary('fria')}
    </div>

    <div class="print-section">
        <h2>5.2 LMC — Agua con Gas &nbsp;<small style="font-weight:400;font-size:0.85rem">Ref. Rango Fría: ${v('temp-fria-min')} – ${v('temp-fria-max')} ºC</small></h2>
        <table class="print-table"><thead>${lmcHeader}</thead><tbody>${lmcRow('gas','ºC')}${gasQualityRow()}</tbody></table>
        <p style="font-size:0.8rem;margin:0.35rem 0"><strong>Calidad Global:</strong> <span style="color:#d97706;font-size:0.9rem">${globalStars}</span> (${globalStarVal}/5)</p>
        ${cycleSummary('gas')}
    </div>

    ${hasHotWater ? `
    <div class="print-section">
        <h2>5.3 LMC — Agua Caliente &nbsp;<small style="font-weight:400;font-size:0.85rem">Rango: ${v('temp-caliente-min')} – ${v('temp-caliente-max')} ºC</small></h2>
        <table class="print-table"><thead>${lmcHeader}</thead><tbody>${lmcRow('caliente','ºC')}</tbody></table>
        ${cycleSummary('caliente')}
    </div>
    ` : ''}

    <div class="print-section">
        <h2>6. Observaciones</h2>
        <div class="print-box" style="padding:0.4rem 0.6rem; min-height: 28px;">${d.observaciones || 'Sin observaciones registradas.'}</div>
    </div>

    <div class="print-section stamp-box" style="border: 2px solid ${estadoColor}; border-radius:6px; padding:0.6rem 1rem; margin-top:0.6rem; text-align:center">
        <div style="font-size:1.3rem; font-weight:800; color:${estadoColor}; letter-spacing:2px">${estadoFinal.toUpperCase()}</div>
        <div style="font-size:0.78rem;color:#64748b;margin-top:2px">Fecha de Cierre: ${completedDate}</div>
    </div>
    `;
    
    return html;
};

window.generateAndPrint = function (data, test) {
    const html = window.buildReportHTML(data, test);
    const container = document.getElementById('print-report');
    container.innerHTML = html;
    window.print();
};
