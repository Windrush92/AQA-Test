/**
 * pdf-generator.js V5
 * Generates and prints the full test report.
 * Called via: window.generateAndPrint(data, test)
 * Shared: window.buildReportHTML(data, test) — used by inline modal too
 */

window.buildReportHTML = function(data, test) {
    const d = data || {};

    const hasHotWater = Array.isArray(d.funciones) && (d.funciones.includes('Agua Caliente') || d.funciones.includes('Agua Muy Caliente'));
    const hasGas = Array.isArray(d.funciones) && (d.funciones.includes('Agua Con Gas') || d.funciones.includes('Finamente gasificada'));

    const v   = key => d[key] || '-';
    const chk = key => d[key] ? '✅ Sí' : '❌ No';

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

    // Helper to parse MM:SS
    function parseMMSS(val) {
        if (!val) return 0;
        const str = String(val).trim();
        if (str.includes(':')) {
            const parts = str.split(':');
            const mins = parseFloat(parts[0]) || 0;
            const secs = parseFloat(parts[1]) || 0;
            return mins * 60 + secs;
        }
        const num = parseFloat(str) || 0;
        if (num > 0 && num < 100 && String(val).includes('.')) return Math.round(num * 60);
        return num;
    }

    function formatMMSS(totalSeconds) {
        if (isNaN(totalSeconds) || totalSeconds === null || totalSeconds === undefined) return '00:00';
        const s = Math.round(Math.max(0, totalSeconds));
        const mins = Math.floor(s / 60);
        const secs = s % 60;
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }

    // === Dynamic LMC Header and Steps ===
    let maxTestedIdx = 9; // At least 0.5L to 5.0L (10 cols)
    ['fria', 'gas', 'caliente'].forEach(prefix => {
        Object.keys(d).forEach(k => {
            if (k.startsWith(`lmc-${prefix}-`)) {
                const idx = parseInt(k.replace(`lmc-${prefix}-`, ''), 10);
                if (!isNaN(idx) && d[k] !== undefined && String(d[k]).trim() !== '') {
                    if (idx > maxTestedIdx) maxTestedIdx = idx;
                }
            }
        });
    });

    const LMC_STEPS = Array.from({ length: maxTestedIdx + 1 }, (_, i) => ((i + 1) * 0.5).toFixed(1));
    const lmcHeader = `<tr><th style="min-width:38px">L</th>${LMC_STEPS.map(l => `<th>${l}</th>`).join('')}</tr>`;

    // === LMC row builder ===
    function lmcRow(prefix, label) {
        const cells = LMC_STEPS.map((_, i) => {
            const val = d[`lmc-${prefix}-${i}`] || '-';
            return `<td>${val}</td>`;
        }).join('');
        return `<tr><td><strong>${label}</strong></td>${cells}</tr>`;
    }

    // === Gas quality row ===
    function gasQualityRow() {
        const EMOJIS = { '0': '➖', 'Bueno': '🟢', 'Medio': '🟡', 'Malo': '🔴' };
        const cells = LMC_STEPS.map((_, i) => {
            let val = d[`gas-q-${i}`] || '0';
            if (['1','2','3','4','5'].includes(val)) {
                if (val >= '4') val = 'Bueno';
                else if (val === '3') val = 'Medio';
                else val = 'Malo';
            }
            const emoji = EMOJIS[val] || '➖';
            return `<td style="font-size:12px; text-align:center">${emoji}</td>`;
        }).join('');
        return `<tr><td><strong>🟢 Calidad</strong></td>${cells}</tr>`;
    }

    // === Cycle summary ===
    function cycleSummary(prefix) {
        const extStr = d[`extraccion-${prefix}`] || '0';
        const recStr = d[`recuperacion-${prefix}`] || '0';
        
        const extSec = parseMMSS(extStr);
        const recSec = parseMMSS(recStr);
        const totalSec = extSec + recSec;
        
        let cph = 0;
        if (totalSec > 0) {
            cph = 3600 / totalSec;
            cph = Math.ceil(cph * 1.15);
        }

        return `
        <div class="print-grid cycle-summary-box" style="margin-top:0.35rem; background:#f8fafc; padding:0.45rem 0.65rem; border-radius:6px; border-left: 3px solid var(--primary); font-size:0.8rem;">
            <div><strong>Tiempo Extracción:</strong> ${formatMMSS(extSec)} min</div>
            <div><strong>Tiempo Recuperación:</strong> ${formatMMSS(recSec)} min</div>
            <div><strong>Tiempo Total Ciclo:</strong> ${formatMMSS(totalSec)} min</div>
            <div style="font-size: 0.88rem; color: var(--primary); grid-column: 1 / -1; margin-top: 0.1rem;"><strong>Rendimiento Estimado:</strong> ${cph > 0 ? cph : '-'} Ciclos/Hora</div>
        </div>
        `;
    }

    // === Global gas stars ===
    const globalStarVal = parseInt(d['gas-calidad-val'] || 0);
    const globalStars = globalStarVal > 0 ? '★'.repeat(globalStarVal) + '☆'.repeat(5 - globalStarVal) : 'No registrada';

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
        <h2>2. Condiciones del Entorno y Funcionalidad</h2>
        <div class="print-grid">
            <div><strong>Temp. Ambiente:</strong> ${v('temp-ambiente')} ºC</div>
            <div><strong>Temp. Agua Entrada:</strong> ${v('temp-agua-entrada')} ºC</div>
            <div><strong>Presión CO2 Medida:</strong> ${v('presion-co2-medida')} Bar</div>
            <div><strong>Presión Mínimo 20 PSI:</strong> ${chk('chk-presion-20psi')}</div>
            <div><strong>Ventilación:</strong> ${chk('chk-ventilacion')}</div>
            <div><strong>Tanque / Banco:</strong> ${tanqueText}</div>
            <div><strong>Dispensa OK:</strong> ${chk('chk-dispensar')}</div>
            <div><strong>Sin pérdidas:</strong> ${chk('chk-perdidas')}</div>
        </div>
    </div>

    <div class="print-section">
        <h2>3. Tiempos de Corte de Motor y Llenado (500ml)</h2>
        <div class="print-grid">
            <div><strong>Corte Motor (Fría):</strong> ${v('tiempo-optimo-fria')} min</div>
            ${hasHotWater ? `<div><strong>Alcanzar Temp. Caliente:</strong> ${v('tiempo-optimo-caliente')} min</div>` : ''}
            ${hasGas ? `<div><strong>Corte Motor (Gas):</strong> ${v('tiempo-optimo-gas') || v('tiempo-optimo-fria')} min <small>(mismo sistema)</small></div>` : ''}
            <div><strong>Llenado Fría 500ml:</strong> ${v('tiempo-500-fria')} seg</div>
            ${hasHotWater ? `<div><strong>Llenado Caliente 500ml:</strong> ${v('tiempo-500-caliente')} seg</div>` : ''}
            ${hasGas ? `<div><strong>Llenado Con Gas 500ml:</strong> ${v('tiempo-500-gas')} seg</div>` : ''}
        </div>
    </div>

    <div class="print-section">
        <h2>4. Proceso de Sanitizado</h2>
        <div class="print-box" style="padding: 0.45rem 0.75rem; font-weight: bold; font-size: 0.9rem; border-left: 3px solid var(--success);">
            Sanitizado realizado correctamente con Peróxido de Hidrógeno 40 ml/L ✅
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

    <div class="print-section stamp-box" style="border: 2px solid ${estadoColor}; border-radius:6px; padding:0.5rem 1rem; margin-top:0.5rem; text-align:center">
        <div style="font-size:1.25rem; font-weight:800; color:${estadoColor}; letter-spacing:2px">${estadoFinal.toUpperCase()}</div>
        <div style="font-size:0.75rem;color:#64748b;margin-top:2px">Fecha de Cierre: ${completedDate}</div>
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
