'use strict';

// ======================== CONSTANTS ========================
const LTRS = [0.5, 1.0, 1.5, 2.0, 2.5, 3.0, 3.5, 4.0, 4.5, 5.0];
const TOTAL_STEPS = 9;
const STORAGE_KEY = 'techTests_v4';
const BRANDS_KEY = 'techBrands_v4';
const MODELS_KEY = 'techModels_v4';

// ======================== STATE ========================
let currentStep = 1;
let activeTestId = null;
let currentHubTab = 'all';
let currentSearchTerm = '';
const cycleCounts = { fria: 0, gas: 0, caliente: 0 };

// ======================== STORAGE HELPERS ========================
function getAllTests() { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); }
function saveAllTests(tests) { localStorage.setItem(STORAGE_KEY, JSON.stringify(tests)); }
function getTest(id) { return getAllTests().find(t => t.id === id) || null; }
function upsertTest(test) {
    const tests = getAllTests();
    const idx = tests.findIndex(t => t.id === test.id);
    if (idx >= 0) tests[idx] = test; else tests.unshift(test);
    saveAllTests(tests);
}
function removeTest(id) { saveAllTests(getAllTests().filter(t => t.id !== id)); }
function genId() { return 'test_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6); }

// ======================== VIEW MANAGEMENT ========================
function showView(name) {
    document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
    document.getElementById(`view-${name}`).classList.remove('hidden');
}

// ======================== HUB ========================
function renderHub() {
    showView('hub');
    let tests = getAllTests();
    const grid = document.getElementById('tests-grid');
    const empty = document.getElementById('hub-empty');
    
    // Handle chart initialization when tab is selected
    if (currentHubTab === 'charts') {
        populateChartReports();
        initChart();
    }
    
    // Apply Filters
    if (currentSearchTerm) {
        tests = tests.filter(t => {
            const m = t.data?.modelo?.toLowerCase() || '';
            const tech = t.data?.tecnico?.toLowerCase() || '';
            return m.includes(currentSearchTerm) || tech.includes(currentSearchTerm);
        });
    }

    if (currentHubTab === 'progress') {
        tests = tests.filter(t => t.status === 'draft');
    } else if (currentHubTab === 'completed') {
        tests = tests.filter(t => t.status === 'completed');
    }

    // Toggle views
    document.getElementById('tab-content-tests')?.classList.toggle('hidden', currentHubTab === 'charts');
    document.getElementById('tab-content-charts')?.classList.toggle('hidden', currentHubTab !== 'charts');

    if (currentHubTab === 'charts') return;

    if (tests.length === 0) { grid.innerHTML = ''; empty.classList.remove('hidden'); updateHubStats(tests); return; }
    empty.classList.add('hidden');
    grid.innerHTML = tests.map(test => {
        const isDraft = test.status === 'draft';
        const marca = test.data?.marca || 'Sin marca';
        const modelo = test.data?.modelo || 'Sin modelo';
        const tecnico = test.data?.tecnico || '—';
        const fechaTesteo = test.data?.['fecha-testeo'] || '—';
        const fechaFin = test.completedAt ? new Date(test.completedAt).toLocaleDateString('es-AR') : null;
        const createdAt = new Date(test.createdAt).toLocaleDateString('es-AR');
        return `
        <div class="test-card ${isDraft ? 'draft' : 'completed'}">
            <div class="tc-header">
                <div class="tc-icon"><div class="status-dot ${isDraft ? 'dot-draft' : 'dot-done'}"></div></div>
                <div class="tc-title">
                    <h3 class="tc-marca">${marca}</h3>
                    <span class="tc-modelo">${modelo}</span>
                </div>
                <div class="tc-badge ${isDraft ? 'badge-draft' : 'badge-done'}">${isDraft ? 'En Progreso' : 'Finalizado'}</div>
            </div>
            
            <div class="tc-body">
                <div class="tc-detail">
                    <span class="tc-label">Técnico</span>
                    <span class="tc-value">${tecnico}</span>
                </div>
                <div class="tc-detail">
                    <span class="tc-label">Testeo</span>
                    <span class="tc-value">${fechaTesteo}</span>
                </div>
                <div class="tc-detail">
                    <span class="tc-label">${fechaFin ? 'Finalizado' : 'Creado'}</span>
                    <span class="tc-value">${fechaFin ? fechaFin : createdAt}</span>
                </div>
            </div>

            <div class="tc-footer">
                ${isDraft 
                    ? `<button class="btn btn-primary btn-sm" onclick="continueTest('${test.id}')">▶ Continuar</button>`
                    : `<button class="btn btn-outline btn-sm" onclick="viewReportHub('${test.id}')">📄 Ver Informe</button>
                       <button class="btn btn-outline btn-sm" onclick="generatePdfForTest('${test.id}')">🖨️ PDF</button>`
                }
                <button class="btn btn-danger btn-sm" onclick="confirmDelete('${test.id}')">🗑️</button>
            </div>
        </div>
        `;
    }).join('');
    updateHubStats(tests);
}

function updateHubStats(tests) {
    const total = tests.length;
    const done = tests.filter(t => t.status === 'completed').length;
    const draft = total - done;
    const el = document.getElementById('hub-stats');
    if (!el) return;
    el.innerHTML = `
        <div class="hub-stat"><span class="hub-stat-num">${total}</span><span class="hub-stat-lbl">Total</span></div>
        <div class="hub-stat"><span class="hub-stat-num" style="color:var(--success)">${done}</span><span class="hub-stat-lbl">Finalizados</span></div>
        <div class="hub-stat"><span class="hub-stat-num" style="color:var(--warning)">${draft}</span><span class="hub-stat-lbl">En progreso</span></div>
    `;
}

window.continueTest = function (id) { activeTestId = id; showCover(); };
window.viewReportHub = function (id) { openReportModal(id); };
window.generatePdfForTest = function (id) {
    const test = getTest(id);
    if (test && window.generateAndPrint) window.generateAndPrint(test.data, test);
};
window.confirmDelete = function (id) {
    if (confirm('¿Seguro que querés eliminar este testeo? Esta acción no se puede deshacer.')) {
        removeTest(id); renderHub();
    }
};

function openReportModal(id) {
    const test = getTest(id);
    if (!test) return;
    const html = window.buildReportHTML ? window.buildReportHTML(test.data, test) : '<p>Sin datos</p>';
    document.getElementById('report-modal-body').innerHTML = html;
    const marca = test.data?.marca || 'Sin marca';
    const modelo = test.data?.modelo || 'Sin modelo';
    document.getElementById('report-modal-title').textContent = `${marca} ${modelo}`;
    document.getElementById('report-overlay').classList.remove('hidden');
    document.body.style.overflow = 'hidden';
    // Wire PDF button
    document.getElementById('btn-report-pdf').onclick = () => window.generatePdfForTest(id);
}

document.getElementById('btn-report-close').addEventListener('click', closeReportModal);
document.getElementById('report-overlay').addEventListener('click', e => {
    if (e.target === document.getElementById('report-overlay')) closeReportModal();
});
function closeReportModal() {
    document.getElementById('report-overlay').classList.add('hidden');
    document.body.style.overflow = '';
}

// ======================== COVER ========================
function showCover() {
    showView('cover');
    const chk = document.getElementById('chk-cover-leido');
    const btn = document.getElementById('btn-cover-start');
    chk.checked = false;
    btn.disabled = true;
}

document.getElementById('chk-cover-leido').addEventListener('change', e => {
    document.getElementById('btn-cover-start').disabled = !e.target.checked;
});
document.getElementById('btn-cover-start').addEventListener('click', () => { startWizard(); });
document.getElementById('btn-cover-back').addEventListener('click', () => { renderHub(); });

// ======================== WIZARD ========================
function startWizard() {
    showView('wizard');
    if (!activeTestId) {
        // Create new test
        activeTestId = genId();
        upsertTest({ id: activeTestId, status: 'draft', createdAt: new Date().toISOString(), completedAt: null, currentStep: 1, data: {} });
    }
    const test = getTest(activeTestId);
    if (!test) return;

    // Reset all DOM inputs
    document.querySelectorAll('#view-wizard input[id]:not([type="hidden"]), #view-wizard textarea[id]').forEach(el => {
        if (el.type === 'checkbox') el.checked = false;
        else el.value = '';
        el.style.borderColor = '';
        el.style.background = '';
        el.style.color = '';
    });
    document.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
    document.querySelectorAll('.star-rating span, .mini-star').forEach(s => s.classList.remove('active'));

    // Reset LMC cells
    for (let i = 0; i < 10; i++) {
        ['fria', 'gas', 'caliente'].forEach(prefix => {
            const inp = document.getElementById(`lmc-${prefix}-${i}`);
            if (inp) { inp.value = ''; inp.style.background = ''; inp.style.color = ''; inp.disabled = true; inp.classList.add('lmc-seq-locked'); }
        });
        const qCell = document.querySelector(`[data-gas-q-idx="${i}"]`);
        if (qCell) {
            qCell.classList.add('lmc-seq-locked');
            const btn = qCell.querySelector('.btn-gas-q');
            if (btn) { btn.dataset.state = '0'; btn.textContent = '➖'; }
        }
        const qInp = document.getElementById(`gas-q-${i}`);
        if (qInp) qInp.value = '0';
    }

    // Reset cycles and stopwatches
    cycleCounts.fria = 0; cycleCounts.gas = 0; cycleCounts.caliente = 0;
    ['fria', 'gas', 'caliente'].forEach(p => { 
        document.getElementById(`ciclos-${p}-body`) && (document.getElementById(`ciclos-${p}-body`).innerHTML = '');
        
        // Reset stopwatches
        stopwatches[p].elapsedMs = 0;
        if (stopwatches[p].interval) {
            clearInterval(stopwatches[p].interval);
            stopwatches[p].interval = null;
        }
        updateStopwatchDisplay(p);
        
        // Reset hidden inputs for stopwatches just in case
        const extInp = document.getElementById(`extraccion-${p}`);
        if (extInp) extInp.value = '0';
        
        updateCycleDisplay(p);
    });

    // Reset conditionl displays
    document.getElementById('termostato-wrapper').style.display = 'flex';
    document.getElementById('tanque-fields').style.display = 'none';

    // Reset seq-sections
    document.querySelectorAll('.seq-section').forEach(section => {
        const seq = section.dataset.seq;
        const seqNum = parseFloat(seq);
        if (isNaN(seqNum) || seqNum > 1) section.classList.add('seq-locked');
        else section.classList.remove('seq-locked');
    });

    loadState(test);
    updateWizard();
}

function updateWizard() {
    document.querySelectorAll('.wizard-step').forEach(s => s.classList.remove('active'));
    document.getElementById(`step-${currentStep}`)?.classList.add('active');

    document.getElementById('progress-bar').style.width = `${(currentStep / TOTAL_STEPS) * 100}%`;
    document.getElementById('step-indicator').textContent = `Paso ${currentStep} de ${TOTAL_STEPS}`;

    const test = getTest(activeTestId);
    const lbl = [test?.data?.marca, test?.data?.modelo].filter(Boolean).join(' ');
    document.getElementById('header-test-label').textContent = lbl;

    // Auto-fill end date on step 9
    if (currentStep === 9) {
        const fechaFin = document.getElementById('fecha-fin-testeo');
        if (!fechaFin.value) fechaFin.value = new Date().toISOString().split('T')[0];
    }

    document.getElementById('btn-prev').disabled = currentStep === 1;
    const isLast = currentStep === TOTAL_STEPS;
    document.getElementById('btn-next').classList.toggle('hidden', isLast);
    document.getElementById('btn-finish').classList.toggle('hidden', !isLast);
    document.getElementById('btn-pdf-wizard').classList.toggle('hidden', !isLast);

    refreshSeqForStep(currentStep);
    if (currentStep === 2) refreshStep2Checklist();
    updateMachetes();
    window.scrollTo(0, 0);
}

// ======================== SEQUENTIAL CHECKLIST (Step 2) ========================
// Each checklist item in step 2 unlocks the next one when checked
const STEP2_ORDER = ['chk-peroxido', 'chk-circuito', 'chk-encendido', 'chk-retirar', 'chk-tirita'];

function refreshStep2Checklist() {
    STEP2_ORDER.forEach((id, i) => {
        const el = document.getElementById(id);
        if (!el) return;
        const label = el.closest('.checklist-item');
        if (i === 0) {
            // First item is always enabled
            el.disabled = false;
            if (label) label.style.opacity = '1'; label && (label.style.pointerEvents = 'auto');
        } else {
            const prevChecked = document.getElementById(STEP2_ORDER[i - 1])?.checked;
            el.disabled = !prevChecked;
            if (label) {
                label.style.opacity = prevChecked ? '1' : '0.32';
                label.style.pointerEvents = prevChecked ? 'auto' : 'none';
                label.style.transition = 'opacity 0.35s ease';
            }
        }
    });
}

STEP2_ORDER.forEach(id => {
    document.getElementById(id)?.addEventListener('change', () => {
        refreshStep2Checklist();
        saveState();
    });
});

function hasHotWater() {
    const chips = Array.from(document.querySelectorAll('#funciones-group .chip.active'));
    return chips.some(c => c.dataset.value === 'Agua Caliente' || c.dataset.value === 'Agua Muy Caliente');
}

function updateHotWaterVisibility() {
    const show = hasHotWater();
    const gRango = document.getElementById('grp-rango-caliente');
    const gOpt = document.getElementById('grp-optimo-caliente');
    const g500 = document.getElementById('grp-500-caliente');
    if (gRango) gRango.style.display = show ? 'flex' : 'none';
    if (gOpt) gOpt.style.display = show ? 'flex' : 'none';
    if (g500) g500.style.display = show ? 'flex' : 'none';
}

// ======================== NAVIGATION ========================
function validateCurrentStep() {
    if (currentStep === 1) {
        return GATE_CHECKS['1-1']() && GATE_CHECKS['1-2']() && GATE_CHECKS['1-3']() && GATE_CHECKS['1-4']();
    }
    if (currentStep === 2) {
        return STEP2_ORDER.every(id => document.getElementById(id)?.checked);
    }
    if (currentStep === 3) {
        return GATE_CHECKS['3-1']();
    }
    if (currentStep === 4) {
        return GATE_CHECKS['4-1']();
    }
    if (currentStep === 5) {
        const lmcOk = GATE_CHECKS['5-99']();
        const recOk = (document.getElementById('recuperacion-fria')?.value || '').trim() !== '';
        return lmcOk && recOk;
    }
    if (currentStep === 6) {
        const lmcOk = GATE_CHECKS['6-99']();
        const recOk = (document.getElementById('recuperacion-gas')?.value || '').trim() !== '';
        const calOk = parseInt(document.getElementById('gas-calidad-val')?.value || '0') > 0;
        return lmcOk && recOk && calOk;
    }
    if (currentStep === 7) {
        if (!hasHotWater()) return true;
        const lmcOk = GATE_CHECKS['7-99']();
        const recOk = (document.getElementById('recuperacion-caliente')?.value || '').trim() !== '';
        return lmcOk && recOk;
    }
    return true; // Step 8 (observaciones) is optional
}

document.getElementById('btn-next').addEventListener('click', () => {
    if (!validateCurrentStep()) {
        alert('Por favor, completá todos los campos obligatorios de este paso antes de continuar.');
        if (currentStep === 2) document.getElementById('step2-error').classList.remove('hidden');
        return;
    }
    if (currentStep === 2) {
        document.getElementById('step2-error').classList.add('hidden');
    }
    saveState();
    let next = currentStep + 1;
    if (next === 7 && !hasHotWater()) next = 8;
    currentStep = Math.min(TOTAL_STEPS, next);
    updateWizard();
});
document.getElementById('btn-prev').addEventListener('click', () => {
    saveState();
    let prev = currentStep - 1;
    if (prev === 7 && !hasHotWater()) prev = 6;
    currentStep = Math.max(1, prev);
    updateWizard();
});
document.getElementById('btn-wizard-back').addEventListener('click', () => { saveState(); renderHub(); });
document.getElementById('btn-pdf-wizard').addEventListener('click', () => {
    const test = getTest(activeTestId);
    if (test && window.generateAndPrint) window.generateAndPrint(test.data, test);
});
document.getElementById('btn-finish').addEventListener('click', finalizeTest);

function finalizeTest() {
    const estadoFinal = document.querySelector('#estado-final-group .chip.active')?.dataset.value;
    if (!estadoFinal) { alert('Seleccioná el estado final del equipo antes de finalizar.'); return; }
    if (!confirm('¿Confirmás que querés finalizar el testeo? No podrá modificarse luego.')) return;

    // Auto-set fin date if empty
    const fechaFin = document.getElementById('fecha-fin-testeo');
    if (!fechaFin.value) fechaFin.value = new Date().toISOString().split('T')[0];

    saveState();
    const test = getTest(activeTestId);
    if (test) {
        test.status = 'completed';
        test.completedAt = new Date().toISOString();
        upsertTest(test);
    }
    alert('✅ ¡Testeo finalizado y archivado exitosamente!');
    renderHub();
}

// ======================== SEQUENTIAL VALIDATION ========================
const GATE_CHECKS = {
    // Step 1: exit gates — each gate's pass unlocks the NEXT section
    '1-1': () => {
        const filled = ['tecnico', 'fecha-ingreso', 'fecha-testeo', 'marca', 'modelo'].every(id => (document.getElementById(id)?.value || '').trim() !== '');
        if (!filled) return false;
        const ingreso = document.getElementById('fecha-ingreso').value;
        const testeo  = document.getElementById('fecha-testeo').value;
        return !ingreso || !testeo || ingreso <= testeo;
    },
    '1-2': () => document.querySelectorAll('#canerias-group .chip.active').length > 0,
    '1-3': () => document.querySelectorAll('#funciones-group .chip.active').length > 0,
    '1-4': () => {
        const req = ['temp-fria-min', 'temp-fria-max', 'presion-min', 'presion-max', 'presion-co2-min', 'presion-co2-max', 'rendimiento'];
        if (hasHotWater()) req.push('temp-caliente-min', 'temp-caliente-max');
        return req.every(id => (document.getElementById(id)?.value || '').trim() !== '');
    },
    '3-1': () => ['temp-ambiente', 'temp-agua-entrada', 'presion-co2-medida'].every(id => (document.getElementById(id)?.value || '').trim() !== ''),
    '4-1': () => {
        const req = ['tiempo-optimo-fria', 'tiempo-optimo-gas'];
        if (hasHotWater()) req.push('tiempo-optimo-caliente');
        return req.every(id => (document.getElementById(id)?.value || '').trim() !== '');
    },
    // Steps 5,6,7: seq=99 acts as a SELF-GATE — unlocks when LMC is fully filled OR any cell is red (out of range logic)
    '5-99': () => {
        const allFilled = LTRS.every((_, i) => (document.getElementById(`lmc-fria-${i}`)?.value || '').trim() !== '');
        if (allFilled) return true;
        return LTRS.some((_, i) => { const v = parseFloat(document.getElementById(`lmc-fria-${i}`)?.value || ''); return shouldLockNext('fria', v); });
    },
    '6-99': () => {
        // First check if temperatures are completed (all filled OR out of bounds hit)
        const allFilled = LTRS.every((_, i) => (document.getElementById(`lmc-gas-${i}`)?.value || '').trim() !== '');
        const outOfBounds = LTRS.some((_, i) => { const v = parseFloat(document.getElementById(`lmc-gas-${i}`)?.value || ''); return shouldLockNext('gas', v); });
        if (!allFilled && !outOfBounds) return false;

        // Then ensure that for every filled temperature, the corresponding gas quality is selected (not '0')
        return LTRS.every((_, i) => {
            const tempVal = document.getElementById(`lmc-gas-${i}`)?.value || '';
            if (tempVal.trim() === '') return true; // Empty temp cell means we don't care about its quality
            const qVal = document.getElementById(`gas-q-${i}`)?.value || '0';
            return qVal !== '0';
        });
    },
    '7-99': () => {
        if (!hasHotWater()) return true;
        const allFilled = LTRS.every((_, i) => (document.getElementById(`lmc-caliente-${i}`)?.value || '').trim() !== '');
        if (allFilled) return true;
        return LTRS.some((_, i) => { const v = parseFloat(document.getElementById(`lmc-caliente-${i}`)?.value || ''); return shouldLockNext('caliente', v); });
    },
};

function refreshSeqForStep(step) {
    const sections = Array.from(document.querySelectorAll(`#step-${step} .seq-section`))
        .sort((a, b) => (parseFloat(a.dataset.seq) || 999) - (parseFloat(b.dataset.seq) || 999));
    let locked = false;
    sections.forEach((section, i) => {
        const seqNum  = parseFloat(section.dataset.seq) || 999;
        const key     = `${step}-${section.dataset.seq}`;
        const checker = GATE_CHECKS[key];

        if (locked) {
            // A previous section was locked → cascade lock
            section.classList.add('seq-locked');
        } else if (seqNum >= 99) {
            // SELF-GATE mode: this section locks/unlocks based on its own prerequisite
            if (checker && !checker()) section.classList.add('seq-locked');
            else section.classList.remove('seq-locked');
            // If it's still locked, cascade to any subsequent sections
            if (checker && !checker()) locked = true;
        } else {
            // EXIT-GATE mode: section is visible, but its gate controls the NEXT section
            section.classList.remove('seq-locked');
            if (i < sections.length - 1 && checker && !checker()) locked = true;
        }
    });
}

// ======================== LMC TABLES ========================
function buildLmcInputs(containerId, prefix, rangeType) {
    const container = document.getElementById(containerId);
    LTRS.forEach((_, idx) => {
        const wrapper = document.createElement('div');
        const inp = document.createElement('input');
        inp.type = 'number'; inp.id = `lmc-${prefix}-${idx}`; inp.step = '0.1';
        inp.dataset.prefix = prefix; inp.dataset.rangeType = rangeType; inp.dataset.idx = idx;
        inp.classList.add('lmc-input');
        if (idx > 0) { inp.disabled = true; inp.classList.add('lmc-seq-locked'); }
        inp.addEventListener('input', () => {
            validateLmcCell(inp);
            unlockNextLmc(prefix, idx);
            refreshSeqForStep(currentStep);
            saveState();
        });
        wrapper.appendChild(inp);
        container.appendChild(wrapper);
    });
}

function shouldLockNext(prefix, val) {
    if (isNaN(val)) return false;
    const rt = (prefix === 'fria' || prefix === 'gas') ? 'fria' : 'caliente';
    const min = parseFloat(document.getElementById(`temp-${rt}-min`)?.value);
    const max = parseFloat(document.getElementById(`temp-${rt}-max`)?.value);
    if (!isNaN(min) && !isNaN(max) && min < max) {
        if (prefix === 'fria' || prefix === 'gas') {
            return val > max;
        } else {
            return val < min;
        }
    }
    return false;
}

function unlockNextLmc(prefix, idx) {
    const current = document.getElementById(`lmc-${prefix}-${idx}`);
    const hasCurrent = current && current.value.trim() !== '';
    const currentVal = hasCurrent ? parseFloat(current.value) : NaN;

    if (hasCurrent) {
        // Unlock corresponding gas quality cell for CURRENT index
        if (prefix === 'gas') {
            const qCell = document.querySelector(`[data-gas-q-idx="${idx}"]`);
            if (qCell) qCell.classList.remove('lmc-seq-locked');
            const sel = document.getElementById(`gas-q-${idx}`);
            if (sel) sel.disabled = false;
        }

        const outOfRange = shouldLockNext(prefix, currentVal);

        if (!outOfRange) {
            // Unlock next temp cell
            const next = document.getElementById(`lmc-${prefix}-${idx + 1}`);
            if (next) { next.disabled = false; next.classList.remove('lmc-seq-locked'); }
        } else {
            // If out of range, lock all subsequent cells
            for (let i = idx + 1; i < 10; i++) {
                const inp = document.getElementById(`lmc-${prefix}-${i}`);
                if (inp) { inp.disabled = true; inp.classList.add('lmc-seq-locked'); inp.value = ''; inp.style.background = ''; inp.style.color = ''; }
            }
            if (prefix === 'gas') {
                for (let i = idx + 1; i < 10; i++) lockGasQuality(i);
            }
        }
    } else {
        // Lock all subsequent temp cells and clear them
        for (let i = idx + 1; i < 10; i++) {
            const inp = document.getElementById(`lmc-${prefix}-${i}`);
            if (inp) { inp.disabled = true; inp.classList.add('lmc-seq-locked'); inp.value = ''; inp.style.background = ''; inp.style.color = ''; }
        }
        // Lock current and subsequent gas quality cells
        if (prefix === 'gas') {
            for (let i = idx; i < 10; i++) lockGasQuality(i);
        }
    }
}

function lockGasQuality(idx) {
    const cell = document.querySelector(`[data-gas-q-idx="${idx}"]`);
    if (cell) {
        cell.classList.add('lmc-seq-locked');
        const sel = document.getElementById(`gas-q-${idx}`);
        if (sel) {
            sel.value = "0";
            sel.disabled = true;
        }
    }
}

function validateLmcCell(inp) {
    const val = parseFloat(inp.value);
    if (isNaN(val) || inp.value === '') { inp.style.background = ''; inp.style.color = ''; return; }
    const rt = inp.dataset.rangeType;
    const min = parseFloat(document.getElementById(rt === 'fria' ? 'temp-fria-min' : 'temp-caliente-min')?.value);
    const max = parseFloat(document.getElementById(rt === 'fria' ? 'temp-fria-max' : 'temp-caliente-max')?.value);
    if (!isNaN(min) && !isNaN(max) && min < max) {
        if (val < min || val > max) { inp.style.background = 'rgba(239,68,68,0.18)'; inp.style.color = 'var(--danger)'; }
        else { inp.style.background = 'rgba(16,185,129,0.15)'; inp.style.color = 'var(--success)'; }
    }
}

function buildGasQualityRow(containerId) {
    const container = document.getElementById(containerId);
    
    LTRS.forEach((_, idx) => {
        const cell = document.createElement('div');
        cell.classList.add('lmc-quality-cell', 'lmc-seq-locked');
        cell.setAttribute('data-gas-q-idx', idx);
        
        cell.innerHTML = `
            <select id="gas-q-${idx}" class="gas-q-select" disabled style="width: 100%; font-size: 0.8rem; border-radius: 4px; padding: 2px; text-align: center; background: transparent; border: 1px solid var(--border);">
                <option value="0">➖</option>
                <option value="Bueno">🟢 Bueno</option>
                <option value="Medio">🟡 Medio</option>
                <option value="Malo">🔴 Malo</option>
            </select>
        `;
        
        const sel = cell.querySelector('select');
        sel.addEventListener('change', () => {
            saveState();
        });
        
        container.appendChild(cell);
    });
}

// ======================== STOPWATCH LOGIC ========================
const stopwatches = {
    fria: { interval: null, startTime: 0, elapsedMs: 0 },
    gas: { interval: null, startTime: 0, elapsedMs: 0 },
    caliente: { interval: null, startTime: 0, elapsedMs: 0 }
};

function formatTime(ms) {
    const totalSec = Math.floor(ms / 1000);
    const min = Math.floor(totalSec / 60);
    const sec = totalSec % 60;
    return `${min.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
}

function updateCycleDisplay(type) {
    const extInput = document.getElementById(`extraccion-${type}`);
    const recInput = document.getElementById(`recuperacion-${type}`);
    const resultBox = document.getElementById(`cycle-result-${type}`);
    
    if (!extInput || !recInput || !resultBox) return;
    
    const ext = parseFloat(extInput.value) || 0;
    const rec = parseFloat(recInput.value) || 0;
    const total = ext + rec;
    
    if (total > 0) {
        resultBox.style.display = 'block';
        document.getElementById(`cycle-total-${type}`).textContent = formatTime(Math.round(total * 60000));
        
        let cph = 60 / total;
        cph = Math.ceil(cph * 1.15); // +15% tolerance, rounded up
        document.getElementById(`cycle-cph-${type}`).textContent = cph;
    } else {
        resultBox.style.display = 'none';
    }
}

function updateStopwatchDisplay(type) {
    const sw = stopwatches[type];
    const ms = sw.interval ? (Date.now() - sw.startTime + sw.elapsedMs) : sw.elapsedMs;
    const display = document.getElementById(`sw-display-${type}`);
    if (display) display.textContent = formatTime(ms);
    
    // Save to hidden input in minutes
    const input = document.getElementById(`extraccion-${type}`);
    if (input) {
        input.value = (ms / 60000).toFixed(2);
        updateCycleDisplay(type);
    }
}

['fria', 'gas', 'caliente'].forEach(type => {
    const btnStart = document.getElementById(`btn-sw-start-${type}`);
    const btnStop = document.getElementById(`btn-sw-stop-${type}`);
    const btnReset = document.getElementById(`btn-sw-reset-${type}`);
    
    if (btnStart) {
        btnStart.addEventListener('click', () => {
            if (stopwatches[type].interval) return;
            stopwatches[type].startTime = Date.now();
            stopwatches[type].interval = setInterval(() => updateStopwatchDisplay(type), 100);
            
            const firstCell = document.getElementById(`lmc-${type}-0`);
            if (firstCell && firstCell.disabled) {
                firstCell.disabled = false;
                firstCell.classList.remove('lmc-seq-locked');
                if (type === 'gas') {
                    const qCell = document.querySelector(`[data-gas-q-idx="0"]`);
                    if (qCell) qCell.classList.remove('lmc-seq-locked');
                    const sel = document.getElementById(`gas-q-0`);
                    if (sel) sel.disabled = false;
                }
                saveState();
            }
        });
    }
    
    if (btnStop) {
        btnStop.addEventListener('click', () => {
            if (!stopwatches[type].interval) return;
            clearInterval(stopwatches[type].interval);
            stopwatches[type].interval = null;
            stopwatches[type].elapsedMs += (Date.now() - stopwatches[type].startTime);
            updateStopwatchDisplay(type);
            saveState();
        });
    }
    
    if (btnReset) {
        btnReset.addEventListener('click', () => {
            clearInterval(stopwatches[type].interval);
            stopwatches[type].interval = null;
            stopwatches[type].elapsedMs = 0;
            updateStopwatchDisplay(type);
            saveState();
        });
    }
    
    const recInput = document.getElementById(`recuperacion-${type}`);
    if (recInput) {
        recInput.addEventListener('input', () => {
            updateCycleDisplay(type);
            saveState();
        });
    }
});

// ======================== CHIP GROUPS ========================
document.querySelectorAll('.chip-group').forEach(group => {
    group.addEventListener('click', e => {
        const chip = e.target.closest('.chip');
        if (!chip) return;
        if (group.classList.contains('single-select')) group.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
        chip.classList.toggle('active');
        if (group.id === 'funciones-group') updateHotWaterVisibility();
        refreshSeqForStep(currentStep);
        saveState();
    });
});

// ======================== STAR RATING (Global) ========================
document.querySelectorAll('.star-rating').forEach(sr => {
    sr.querySelectorAll('span').forEach(star => {
        star.addEventListener('click', e => {
            const val = parseInt(e.target.dataset.val);
            sr.querySelectorAll('span').forEach(s => s.classList.toggle('active', parseInt(s.dataset.val) <= val));
            document.getElementById(sr.dataset.id + '-val').value = val;
            saveState();
        });
    });
});

// ======================== DATE VALIDATION ========================
function validateDates() {
    const ingreso = document.getElementById('fecha-ingreso').value;
    const testeo = document.getElementById('fecha-testeo').value;
    const errEl = document.getElementById('err-fecha-ingreso');
    const ingresoInp = document.getElementById('fecha-ingreso');
    if (ingreso && testeo && ingreso > testeo) {
        errEl.classList.remove('hidden');
        ingresoInp.style.borderColor = 'var(--danger)';
    } else {
        errEl.classList.add('hidden');
        ingresoInp.style.borderColor = '';
    }
}
document.getElementById('fecha-ingreso').addEventListener('change', () => { validateDates(); refreshSeqForStep(currentStep); saveState(); });
document.getElementById('fecha-testeo').addEventListener('change', () => { validateDates(); refreshSeqForStep(currentStep); saveState(); });

// ======================== CONDITIONAL TOGGLES ========================
document.getElementById('chk-termostato-solo-frio-caliente').addEventListener('change', e => {
    document.getElementById('termostato-wrapper').style.display = e.target.checked ? 'none' : 'flex';
    saveState();
});
document.getElementById('chk-tiene-tanque').addEventListener('change', e => {
    document.getElementById('tanque-fields').style.display = e.target.checked ? 'grid' : 'none';
    saveState();
});

// ======================== TIMER ========================
let timerInterval = null;
const timerDisplay = document.getElementById('timer-display');
const btnTimer = document.getElementById('btn-start-timer');
btnTimer.addEventListener('click', () => {
    if (timerInterval) {
        clearInterval(timerInterval); timerInterval = null;
        timerDisplay.textContent = '10:00'; timerDisplay.style.color = '';
        btnTimer.textContent = 'Iniciar Reloj'; btnTimer.style.background = '';
    } else {
        let timeLeft = 600;
        btnTimer.textContent = 'Detener'; btnTimer.style.background = 'var(--danger)';
        timerInterval = setInterval(() => {
            timeLeft--;
            timerDisplay.textContent = `${String(Math.floor(timeLeft / 60)).padStart(2,'0')}:${String(timeLeft % 60).padStart(2,'0')}`;
            if (timeLeft <= 0) {
                clearInterval(timerInterval); timerInterval = null;
                timerDisplay.textContent = '¡Listo!'; timerDisplay.style.color = 'var(--success)';
                btnTimer.textContent = 'Reiniciar'; btnTimer.style.background = '';
            }
        }, 1000);
    }
});

// ======================== MACHETES ========================
function updateMachetes() {
    const fMin = document.getElementById('temp-fria-min')?.value || '--';
    const fMax = document.getElementById('temp-fria-max')?.value || '--';
    const cMin = document.getElementById('temp-caliente-min')?.value || '--';
    const cMax = document.getElementById('temp-caliente-max')?.value || '--';
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
    set('machete-fria', `${fMin} – ${fMax}`);
    set('machete-gas', `${fMin} – ${fMax}`);
    set('machete-caliente', `${cMin} – ${cMax}`);
}

// ======================== DATALISTS ========================
function loadDatalists() {
    const brands = JSON.parse(localStorage.getItem(BRANDS_KEY) || '[]');
    const models = JSON.parse(localStorage.getItem(MODELS_KEY) || '[]');
    document.getElementById('marcas-list').innerHTML = brands.map(b => `<option value="${b}">`).join('');
    document.getElementById('modelos-list').innerHTML = models.map(m => `<option value="${m}">`).join('');
}
function saveToList(key, value) {
    if (!value?.trim()) return;
    const items = JSON.parse(localStorage.getItem(key) || '[]');
    if (!items.includes(value)) { items.push(value); localStorage.setItem(key, JSON.stringify(items)); loadDatalists(); }
}
document.getElementById('marca').addEventListener('blur', e => saveToList(BRANDS_KEY, e.target.value));
document.getElementById('modelo').addEventListener('blur', e => saveToList(MODELS_KEY, e.target.value));

// ======================== SAVE STATE ========================
window.saveState = function () {
    if (!activeTestId) return;
    const test = getTest(activeTestId) || { id: activeTestId, status: 'draft', createdAt: new Date().toISOString(), completedAt: null, currentStep: 1, data: {} };
    test.currentStep = currentStep;
    const d = test.data || {};

    document.querySelectorAll('#view-wizard input[id]:not([type="hidden"]), #view-wizard textarea[id]').forEach(el => {
        if (el.type === 'checkbox') d[el.id] = el.checked;
        else d[el.id] = el.value;
    });
    document.querySelectorAll('#view-wizard input[type="hidden"][id]').forEach(el => { d[el.id] = el.value; });

    d.canerias = [...document.querySelectorAll('#canerias-group .chip.active')].map(c => c.dataset.value);
    d.funciones = [...document.querySelectorAll('#funciones-group .chip.active')].map(c => c.dataset.value);
    d.estadoFinal = document.querySelector('#estado-final-group .chip.active')?.dataset.value || '';

    ['fria', 'gas', 'caliente'].forEach(p => {
        d[`ciclos_${p}`] = [...document.querySelectorAll(`#ciclos-${p}-body tr`)].map(tr => [...tr.querySelectorAll('input')].map(i => i.value));
    });

    test.data = d;
    upsertTest(test);
};

// ======================== LOAD STATE ========================
function loadState(test) {
    const d = test.data || {};
    currentStep = test.currentStep || 1;

    document.querySelectorAll('#view-wizard input[id]:not([type="hidden"]), #view-wizard textarea[id]').forEach(el => {
        if (d[el.id] === undefined) return;
        if (el.type === 'checkbox') { el.checked = !!d[el.id]; el.dispatchEvent(new Event('change')); }
        else el.value = d[el.id];
    });
    document.querySelectorAll('#view-wizard input[type="hidden"][id]').forEach(el => { if (d[el.id] !== undefined) el.value = d[el.id]; });

    if (d.canerias) document.querySelectorAll('#canerias-group .chip').forEach(c => c.classList.toggle('active', d.canerias.includes(c.dataset.value)));
    if (d.funciones) document.querySelectorAll('#funciones-group .chip').forEach(c => c.classList.toggle('active', d.funciones.includes(c.dataset.value)));
    if (d.estadoFinal) document.querySelector(`#estado-final-group .chip[data-value="${d.estadoFinal}"]`)?.classList.add('active');

    updateHotWaterVisibility();

    // Global stars
    const sv = parseInt(d['gas-calidad-val'] || 0);
    if (sv > 0) { const sr = document.querySelector('.star-rating[data-id="gas-calidad"]'); if (sr) sr.querySelectorAll('span').forEach(s => s.classList.toggle('active', parseInt(s.dataset.val) <= sv)); }

    // LMC cells sequential restore
    ['fria', 'gas', 'caliente'].forEach(prefix => {
        for (let i = 0; i < 10; i++) {
            const inp = document.getElementById(`lmc-${prefix}-${i}`);
            if (!inp) continue;
            const val = d[`lmc-${prefix}-${i}`];
            if (val !== undefined && val !== '') {
                inp.value = val; inp.disabled = false; inp.classList.remove('lmc-seq-locked');
                validateLmcCell(inp);
                // Unlock next cell
                const next = document.getElementById(`lmc-${prefix}-${i + 1}`);
                if (next) { next.disabled = false; next.classList.remove('lmc-seq-locked'); }
                // Unlock gas quality
                if (prefix === 'gas') {
                    const qCell = document.querySelector(`[data-gas-q-idx="${i}"]`);
                    if (qCell) {
                        qCell.classList.remove('lmc-seq-locked');
                        const qVal = d[`gas-q-${i}`] || '0';
                        // Keep backwards compatibility if an old state has '1'-'5' stars saved
                        const isOldStarVal = ['1','2','3','4','5'].includes(qVal);
                        let finalVal = qVal;
                        if (isOldStarVal) {
                            if (qVal >= '4') finalVal = 'Bueno';
                            else if (qVal === '3') finalVal = 'Medio';
                            else finalVal = 'Malo';
                        }
                        
                        const EMOJIS = { '0': '➖', 'Bueno': '🟢', 'Medio': '🟡', 'Malo': '🔴' };
                        const STATES = { '0': 0, 'Bueno': 1, 'Medio': 2, 'Malo': 3 };
                        
                        const btn = qCell.querySelector('.btn-gas-q');
                        if (btn && EMOJIS[finalVal]) {
                            btn.dataset.state = STATES[finalVal];
                            btn.textContent = EMOJIS[finalVal];
                            document.getElementById(`gas-q-${i}`).value = finalVal;
                        }
                    }
                }
            }
        }
    });

    // Restore stopwatches
    ['fria', 'gas', 'caliente'].forEach(prefix => {
        const extVal = d[`extraccion-${prefix}`];
        if (extVal !== undefined && extVal !== '') {
            const input = document.getElementById(`extraccion-${prefix}`);
            if (input) input.value = extVal;
            const ms = parseFloat(extVal) * 60000;
            if (!isNaN(ms)) {
                stopwatches[prefix].elapsedMs = ms;
                updateStopwatchDisplay(prefix);
            }
        }
        updateCycleDisplay(prefix);
    });

    updateMachetes();
    validateDates();
    refreshStep2Checklist();
}

// ======================== GLOBAL INPUT WATCHER ========================
document.getElementById('view-wizard').addEventListener('input', () => { refreshSeqForStep(currentStep); saveState(); });

// ======================== HUB BUTTONS ========================
document.getElementById('btn-new-test').addEventListener('click', () => { activeTestId = null; showCover(); });
document.getElementById('btn-new-test-empty').addEventListener('click', () => { activeTestId = null; showCover(); });

// ======================== INITIALIZATION ========================
function init() {
    // Theme toggle
    const savedTheme = localStorage.getItem('techTestTheme') || 'light';
    const themeBtn = document.getElementById('btn-theme-toggle');

    const applyTheme = (theme) => {
        if (theme === 'dark') {
            document.documentElement.setAttribute('data-theme', 'dark');
            themeBtn.innerHTML = '☀️';
            themeBtn.title = 'Modo Claro';
        } else {
            document.documentElement.removeAttribute('data-theme');
            themeBtn.innerHTML = '🌙';
            themeBtn.title = 'Modo Oscuro';
        }
    };

    applyTheme(savedTheme);

    themeBtn.addEventListener('click', () => {
        const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
        const newTheme = isDark ? 'light' : 'dark';
        localStorage.setItem('techTestTheme', newTheme);
        applyTheme(newTheme);
    });

    buildLmcInputs('lmc-fria-inputs', 'fria', 'fria');
    buildLmcInputs('lmc-gas-inputs', 'gas', 'fria');
    buildLmcInputs('lmc-caliente-inputs', 'caliente', 'caliente');
    buildGasQualityRow('lmc-gas-quality-row');
    loadDatalists();
    setupHubListeners();
    renderHub();
}

let performanceChartInstance = null;

function initChart() {
    const ctx = document.getElementById('performanceChart');
    if (!ctx) return;
    if (performanceChartInstance) return;
    
    performanceChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: ['0.5L', '1.0L', '1.5L', '2.0L', '2.5L', '3.0L', '3.5L', '4.0L', '4.5L', '5.0L'],
            datasets: []
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: { beginAtZero: true }
            }
        }
    });
}

function populateChartReports() {
    const select = document.getElementById('chart-select-report');
    if (!select) return;
    const tests = getAllTests().filter(t => t.status === 'completed');
    select.innerHTML = '<option value="">-- Elegir Testeo --</option>' + tests.map(t => {
        const marca = t.data?.marca || 'Sin marca';
        const modelo = t.data?.modelo || 'Sin modelo';
        const date = t.completedAt ? new Date(t.completedAt).toLocaleDateString('es-AR') : '';
        return `<option value="${t.id}">${marca} ${modelo} (${date})</option>`;
    }).join('');
}

function populateChartMetrics(reportId) {
    const metricSelect = document.getElementById('chart-select-metric');
    if (!metricSelect) return;
    metricSelect.innerHTML = '<option value="">-- Elegir Métrica --</option>';
    if (!reportId) {
        metricSelect.disabled = true;
        return;
    }
    
    const test = getTest(reportId);
    if (!test || !test.data) return;
    
    metricSelect.disabled = false;
    
    if (test.data['lmc-fria-0']) metricSelect.innerHTML += '<option value="lmc-fria">LMC - Agua Fría</option>';
    if (test.data['lmc-gas-0']) metricSelect.innerHTML += '<option value="lmc-gas">LMC - Agua con Gas</option>';
    if (test.data['lmc-caliente-0']) metricSelect.innerHTML += '<option value="lmc-caliente">LMC - Agua Caliente</option>';
    

}

function setupHubListeners() {
    document.querySelectorAll('.hub-tab').forEach(tab => {
        tab.addEventListener('click', (e) => {
            document.querySelectorAll('.hub-tab').forEach(t => {
                t.classList.remove('active');
                t.style.color = 'var(--text-muted)';
            });
            const target = e.currentTarget;
            target.classList.add('active');
            target.style.color = 'var(--primary)';
            currentHubTab = target.dataset.tab;
            renderHub();
        });
    });

    document.getElementById('hub-search-input')?.addEventListener('input', (e) => {
        currentSearchTerm = e.target.value.toLowerCase();
        renderHub();
    });

    document.getElementById('chart-select-report')?.addEventListener('change', (e) => {
        populateChartMetrics(e.target.value);
    });

    const chartColors = [
        { bg: 'rgba(37, 99, 235, 0.5)', border: 'rgb(37, 99, 235)' },
        { bg: 'rgba(16, 185, 129, 0.5)', border: 'rgb(16, 185, 129)' },
        { bg: 'rgba(245, 158, 11, 0.5)', border: 'rgb(245, 158, 11)' },
        { bg: 'rgba(239, 68, 68, 0.5)', border: 'rgb(239, 68, 68)' },
        { bg: 'rgba(139, 92, 246, 0.5)', border: 'rgb(139, 92, 246)' }
    ];

    document.getElementById('btn-generate-chart')?.addEventListener('click', () => {
        if (!performanceChartInstance) initChart();
        
        const reportSelect = document.getElementById('chart-select-report');
        const metricSelect = document.getElementById('chart-select-metric');
        const reportId = reportSelect.value;
        const metric = metricSelect.value;
        
        if (!reportId || !metric) {
            alert('Por favor, seleccioná un testeo y una métrica.');
            return;
        }
        
        const test = getTest(reportId);
        if(!test || !test.data) return;
        
        const labels = ['0.5L', '1.0L', '1.5L', '2.0L', '2.5L', '3.0L', '3.5L', '4.0L', '4.5L', '5.0L'];
        let measuredData = [];
        let datasetLabel = '';
        
        if (metric.startsWith('lmc-')) {
            const type = metric.replace('lmc-', '');
            measuredData = labels.map((_, i) => parseFloat(test.data[`lmc-${type}-${i}`]) || 0);
            datasetLabel = `LMC ${type.charAt(0).toUpperCase() + type.slice(1)}`;
        }
        
        const reportName = `${test.data.marca || 'S/M'} ${test.data.modelo || 'S/M'}`;
        const finalLabel = `${reportName} - ${datasetLabel}`;
        
        const color = chartColors[performanceChartInstance.data.datasets.length % chartColors.length];
        
        performanceChartInstance.data.datasets.push({
            label: finalLabel,
            data: measuredData,
            backgroundColor: color.bg,
            borderColor: color.border,
            borderWidth: 2,
            type: 'line',
            tension: 0.1,
            fill: false
        });

        performanceChartInstance.update();
    });

    document.getElementById('btn-clear-chart')?.addEventListener('click', () => {
        if (!performanceChartInstance) return;
        if(confirm('¿Seguro que querés limpiar el gráfico completo?')) {
            performanceChartInstance.data.datasets = [];
            performanceChartInstance.update();
        }
    });

    document.getElementById('btn-export-chart')?.addEventListener('click', () => {
        if (!performanceChartInstance) return;
        const url = performanceChartInstance.toBase64Image();
        const a = document.createElement('a');
        a.href = url;
        a.download = 'grafico-rendimiento.png';
        a.click();
    });
}

document.addEventListener('DOMContentLoaded', init);
