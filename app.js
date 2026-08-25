'use strict';

// ======================== CONSTANTS ========================
const LTRS = [0.5, 1.0, 1.5, 2.0, 2.5, 3.0, 3.5, 4.0, 4.5, 5.0];
const TOTAL_STEPS = 9;
const STORAGE_KEY = 'techTests_v4';
const BRANDS_KEY = 'techBrands_v4';
const MODELS_KEY = 'techModels_v4';
const DELETED_KEY = 'techDeleted_v4';

// ======================== STATE ========================
let currentStep = 1;
let activeTestId = null;
let currentHubTab = 'all';
let currentSearchTerm = '';
const cycleCounts = { fria: 0, gas: 0, caliente: 0 };

// ======================== SUPABASE CLOUD SYNC ========================
const SUPABASE_URL = 'https://oegmogywntxaplndapmm.supabase.co';
const SUPABASE_KEY = 'sb_publishable_JlzKH7tXvskL3qOPKbc34A_yhAGbr0u';
let supabaseClient = null;

function getSupabase() {
    if (!supabaseClient && window.supabase && typeof window.supabase.createClient === 'function') {
        supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
    }
    return supabaseClient;
}

// ======================== CUSTOM DIALOGS (Alert & Confirm) ========================
function showCustomDialog({ title = 'AQA-Test', message, type = 'alert', confirmText = 'Aceptar', cancelText = 'Cancelar', isDanger = false }) {
    return new Promise((resolve) => {
        const overlay = document.getElementById('custom-dialog-overlay');
        const titleEl = document.getElementById('custom-dialog-title');
        const bodyEl = document.getElementById('custom-dialog-body');
        const btnCancel = document.getElementById('custom-dialog-btn-cancel');
        const btnConfirm = document.getElementById('custom-dialog-btn-confirm');

        if (!overlay || !titleEl || !bodyEl || !btnConfirm || !btnCancel) {
            if (type === 'confirm') resolve(window.confirm(message));
            else { window.alert(message); resolve(true); }
            return;
        }

        titleEl.textContent = title;
        bodyEl.textContent = message;
        
        btnConfirm.textContent = confirmText;
        btnConfirm.className = `btn ${isDanger ? 'btn-danger' : 'btn-primary'}`;
        
        if (type === 'confirm') {
            btnCancel.textContent = cancelText;
            btnCancel.classList.remove('hidden');
        } else {
            btnCancel.classList.add('hidden');
        }

        const cleanup = (result) => {
            overlay.classList.add('hidden');
            btnConfirm.onclick = null;
            btnCancel.onclick = null;
            resolve(result);
        };

        btnConfirm.onclick = () => cleanup(true);
        btnCancel.onclick = () => cleanup(false);

        overlay.classList.remove('hidden');
    });
}

function customAlert(message, title = 'AQA-Test') {
    return showCustomDialog({ title, message, type: 'alert' });
}

function customConfirm(message, title = 'AQA-Test', options = {}) {
    return showCustomDialog({ title, message, type: 'confirm', ...options });
}

// ======================== STORAGE HELPERS ========================
function getDeletedIds() {
    return new Set(JSON.parse(localStorage.getItem(DELETED_KEY) || '[]'));
}
function markIdDeleted(id) {
    const ids = getDeletedIds();
    ids.add(id);
    localStorage.setItem(DELETED_KEY, JSON.stringify(Array.from(ids)));
}

function getAllTests() { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); }
function saveAllTests(tests) { localStorage.setItem(STORAGE_KEY, JSON.stringify(tests)); }
function getTest(id) { return getAllTests().find(t => t.id === id) || null; }

function upsertTest(test) {
    const deletedSet = getDeletedIds();
    if (deletedSet.has(test.id)) {
        deletedSet.delete(test.id);
        localStorage.setItem(DELETED_KEY, JSON.stringify(Array.from(deletedSet)));
    }

    const tests = getAllTests();
    const idx = tests.findIndex(t => t.id === test.id);
    if (idx >= 0) tests[idx] = test; else tests.unshift(test);
    saveAllTests(tests);

    const sb = getSupabase();
    if (sb) {
        sb.from('tests').upsert({
            id: test.id,
            status: test.status,
            created_at: test.createdAt,
            completed_at: test.completedAt,
            current_step: test.currentStep,
            data: test.data,
            updated_at: new Date().toISOString()
        }).then(({ error }) => {
            if (error) console.warn('Supabase upsert error:', error);
        });
    }
}

function removeTest(id) {
    markIdDeleted(id);
    const remaining = getAllTests().filter(t => t.id !== id);
    saveAllTests(remaining);
    renderHub(false);

    const sb = getSupabase();
    if (sb) {
        // Update status to 'deleted' and try hard delete
        sb.from('tests').update({ status: 'deleted', updated_at: new Date().toISOString() }).eq('id', id).then(() => {
            sb.from('tests').delete().eq('id', id).then(({ error }) => {
                if (error) console.warn('Supabase delete error:', error);
            });
        });
    }
}

async function syncTestsFromCloud() {
    const sb = getSupabase();
    if (!sb) return;
    try {
        const { data, error } = await sb
            .from('tests')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) {
            console.warn('Error fetching tests from Supabase:', error);
            return;
        }

        if (data && Array.isArray(data)) {
            const deletedSet = getDeletedIds();
            const mapped = data
                .filter(row => row.status !== 'deleted' && !deletedSet.has(row.id))
                .map(row => ({
                    id: row.id,
                    status: row.status,
                    createdAt: row.created_at,
                    completedAt: row.completed_at,
                    currentStep: row.current_step,
                    data: row.data || {}
                }));

            // Only update local storage and re-render if data has actually changed
            const currentLocalStr = localStorage.getItem(STORAGE_KEY) || '[]';
            const newCloudStr = JSON.stringify(mapped);
            if (currentLocalStr !== newCloudStr) {
                saveAllTests(mapped);
                const hubView = document.getElementById('view-hub');
                if (hubView && !hubView.classList.contains('hidden')) {
                    renderHub(false);
                }
            }
        }
    } catch (e) {
        console.warn('Cloud sync error:', e);
    }
}

function initCloudSync() {
    const sb = getSupabase();
    if (sb) {
        syncTestsFromCloud();
        try {
            sb.channel('realtime-tests')
                .on('postgres_changes', { event: '*', schema: 'public', table: 'tests' }, () => {
                    syncTestsFromCloud();
                })
                .subscribe();
        } catch (e) {
            console.warn('Realtime subscription error:', e);
        }
    }
}

function genId() { return 'test_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6); }

// ======================== VIEW MANAGEMENT ========================
function showView(name) {
    document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
    document.getElementById(`view-${name}`).classList.remove('hidden');
}

// ======================== HUB ========================
function renderHub(fetchCloud = true) {
    showView('hub');
    if (fetchCloud) syncTestsFromCloud();
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
window.confirmDelete = async function (id) {
    const ok = await customConfirm('¿Seguro que querés eliminar este testeo? Esta acción no se puede deshacer.', 'AQA-Test', {
        confirmText: 'Eliminar',
        cancelText: 'Cancelar',
        isDanger: true
    });
    if (ok) {
        removeTest(id);
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

    // Render LMC Hero Cards
    renderLmcHero('fria');
    renderLmcHero('gas');
    renderLmcHero('caliente');

    // Reset all DOM inputs
    document.querySelectorAll('#view-wizard input[id]:not([type="hidden"]), #view-wizard textarea[id], #view-wizard select[id]').forEach(el => {
        if (el.type === 'checkbox') el.checked = false;
        else if (el.tagName === 'SELECT') el.value = el.options[0]?.value || '0';
        else el.value = '';
        el.style.borderColor = '';
        el.style.background = '';
        el.style.color = '';
    });
    document.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
    document.querySelectorAll('.star-rating span').forEach(s => s.classList.remove('active'));
    const hidGasStars = document.getElementById('gas-calidad-val');
    if (hidGasStars) hidGasStars.value = '0';

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
        
        const extInp = document.getElementById(`extraccion-${p}`);
        if (extInp) extInp.value = '00:00';
        
        updateCycleDisplay(p);
    });

    // Reset conditional displays
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
    if (currentStep === 4) refreshStep4Checklist();
    updateMachetes();
    updateGasDisclaimer();
    window.scrollTo(0, 0);
}

// ======================== TIME HELPERS (MM:SS) ========================
function formatMMSS(totalSeconds) {
    if (isNaN(totalSeconds) || totalSeconds === null || totalSeconds === undefined) return '00:00';
    const s = Math.round(Math.max(0, totalSeconds));
    const mins = Math.floor(s / 60);
    const secs = s % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

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

function setupTimeInputMasks() {
    document.querySelectorAll('.time-input').forEach(input => {
        input.addEventListener('blur', () => {
            let val = input.value.trim();
            if (!val) return;
            if (/^\d{1,2}$/.test(val)) {
                const n = parseInt(val, 10);
                if (input.id.includes('500')) {
                    input.value = `00:${n.toString().padStart(2, '0')}`;
                } else {
                    input.value = `${n.toString().padStart(2, '0')}:00`;
                }
            } else if (/^\d{1,2}:\d{1,2}$/.test(val)) {
                const [m, s] = val.split(':').map(x => parseInt(x, 10));
                input.value = `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
            }
            if (input.id.startsWith('recuperacion-')) {
                const type = input.id.replace('recuperacion-', '');
                updateCycleDisplay(type);
            }
            if (input.id === 'tiempo-optimo-fria') {
                const gasInput = document.getElementById('tiempo-optimo-gas');
                if (gasInput && !gasInput.value) {
                    gasInput.value = input.value;
                }
            }
            saveState();
        });
    });
}

function updateGasDisclaimer() {
    const chips = Array.from(document.querySelectorAll('#funciones-group .chip.active'));
    const hasGas = chips.some(c => c.dataset.value === 'Agua Con Gas' || c.dataset.value === 'Finamente gasificada');
    const disclaimer = document.getElementById('disclaimer-gas-corte');
    if (disclaimer) disclaimer.style.display = hasGas ? 'block' : 'none';
}

// ======================== SEQUENTIAL CHECKLIST (Step 4) ========================
// Each checklist item in step 4 unlocks the next one when checked
const STEP4_ORDER = ['chk-peroxido', 'chk-circuito', 'chk-encendido', 'chk-retirar', 'chk-tirita'];

function refreshStep4Checklist() {
    STEP4_ORDER.forEach((id, i) => {
        const el = document.getElementById(id);
        if (!el) return;
        const label = el.closest('.checklist-item');
        if (i === 0) {
            el.disabled = false;
            if (label) { label.style.opacity = '1'; label.style.pointerEvents = 'auto'; }
        } else {
            const prevChecked = document.getElementById(STEP4_ORDER[i - 1])?.checked;
            el.disabled = !prevChecked;
            if (label) {
                label.style.opacity = prevChecked ? '1' : '0.32';
                label.style.pointerEvents = prevChecked ? 'auto' : 'none';
                label.style.transition = 'opacity 0.35s ease';
            }
        }
    });
}

STEP4_ORDER.forEach(id => {
    document.getElementById(id)?.addEventListener('change', () => {
        refreshStep4Checklist();
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
        return GATE_CHECKS['2-1']() && GATE_CHECKS['2-2']();
    }
    if (currentStep === 3) {
        return GATE_CHECKS['3-1']() && GATE_CHECKS['3-2']();
    }
    if (currentStep === 4) {
        return STEP4_ORDER.every(id => document.getElementById(id)?.checked);
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

document.getElementById('btn-next').addEventListener('click', async () => {
    if (!validateCurrentStep()) {
        await customAlert('Por favor, completá todos los campos obligatorios de este paso antes de continuar.');
        if (currentStep === 4) document.getElementById('step4-error')?.classList.remove('hidden');
        return;
    }
    if (currentStep === 4) {
        document.getElementById('step4-error')?.classList.add('hidden');
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

async function finalizeTest() {
    const estadoFinal = document.querySelector('#estado-final-group .chip.active')?.dataset.value;
    if (!estadoFinal) {
        await customAlert('Seleccioná el estado final del equipo antes de finalizar.');
        return;
    }
    const ok = await customConfirm('¿Confirmás que querés finalizar el testeo? No podrá modificarse luego.', 'AQA-Test', {
        confirmText: 'Finalizar',
        cancelText: 'Cancelar'
    });
    if (!ok) return;

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
    await customAlert('✅ ¡Testeo finalizado y archivado exitosamente!');
    renderHub();
}

// ======================== SEQUENTIAL VALIDATION ========================
const GATE_CHECKS = {
    // Step 1: Datos Generales
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
        const req = ['temp-fria-min', 'temp-fria-max', 'presion-min', 'presion-max', 'presion-co2-min', 'presion-co2-max', 'rendimiento', 'litros-continuos-proveedor'];
        if (hasHotWater()) req.push('temp-caliente-min', 'temp-caliente-max');
        return req.every(id => (document.getElementById(id)?.value || '').trim() !== '');
    },

    // Step 2: Condiciones y Funcionalidades
    '2-1': () => ['temp-ambiente', 'temp-agua-entrada', 'presion-co2-medida'].every(id => (document.getElementById(id)?.value || '').trim() !== ''),
    '2-2': () => {
        const p20 = document.getElementById('chk-presion-20psi')?.checked;
        const vent = document.getElementById('chk-ventilacion')?.checked;
        const disp = document.getElementById('chk-dispensar')?.checked;
        const perd = document.getElementById('chk-perdidas')?.checked;
        const hasTank = document.getElementById('chk-tiene-tanque')?.checked;
        let tankOk = true;
        if (hasTank) {
            const cap = (document.getElementById('capacidad-tanque')?.value || '').trim();
            const tLlenado = (document.getElementById('tiempo-llenado-tanque')?.value || '').trim();
            tankOk = cap !== '' && tLlenado !== '';
        }
        return p20 && vent && disp && perd && tankOk;
    },

    // Step 3: Tiempos de Corte y 500ml
    '3-1': () => {
        const req = ['tiempo-optimo-fria'];
        if (hasHotWater()) req.push('tiempo-optimo-caliente');
        const chips = Array.from(document.querySelectorAll('#funciones-group .chip.active'));
        if (chips.some(c => c.dataset.value === 'Agua Con Gas' || c.dataset.value === 'Finamente gasificada')) {
            req.push('tiempo-optimo-gas');
        }
        return req.every(id => (document.getElementById(id)?.value || '').trim() !== '');
    },
    '3-2': () => {
        const req = ['tiempo-500-fria'];
        if (hasHotWater()) req.push('tiempo-500-caliente');
        const chips = Array.from(document.querySelectorAll('#funciones-group .chip.active'));
        if (chips.some(c => c.dataset.value === 'Agua Con Gas' || c.dataset.value === 'Finamente gasificada')) {
            req.push('tiempo-500-gas');
        }
        return req.every(id => (document.getElementById(id)?.value || '').trim() !== '');
    },

    // Step 4: Sanitizado
    '4-1': () => STEP4_ORDER.every(id => document.getElementById(id)?.checked),

    // Steps 5,6,7: LMC
    '5-99': () => getLmcEntries('fria').length > 0,
    '6-99': () => getLmcEntries('gas').length > 0,
    '7-99': () => !hasHotWater() || getLmcEntries('caliente').length > 0
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
            section.classList.add('seq-locked');
        } else if (seqNum >= 99) {
            if (checker && !checker()) section.classList.add('seq-locked');
            else section.classList.remove('seq-locked');
            if (checker && !checker()) locked = true;
        } else {
            section.classList.remove('seq-locked');
            if (i < sections.length - 1 && checker && !checker()) locked = true;
        }
    });
}

// ======================== LMC HERO QUICK-ENTRY CONTROLLER ========================
let currentGasQuality = 'Bueno';

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

function getLmcEntries(prefix) {
    const test = getTest(activeTestId);
    const d = test?.data || {};
    const entries = [];
    let i = 0;
    while (true) {
        const val = d[`lmc-${prefix}-${i}`];
        if (val === undefined || String(val).trim() === '') break;
        const temp = parseFloat(val);
        const quality = (prefix === 'gas') ? (d[`gas-q-${i}`] || 'Bueno') : null;
        const inRange = !shouldLockNext(prefix, temp);
        entries.push({ idx: i, liters: ((i + 1) * 0.5).toFixed(1), temp: temp.toFixed(1), quality, inRange });
        i++;
    }
    return entries;
}

function renderLmcHero(prefix) {
    const entries = getLmcEntries(prefix);
    const count = entries.length;
    const nextLiters = ((count + 1) * 0.5).toFixed(1);
    const totalLiters = (count * 0.5).toFixed(1);

    // Update Badges & Labels
    const curLitEl = document.getElementById(`lmc-current-liters-${prefix}`);
    if (curLitEl) curLitEl.textContent = `${nextLiters} L`;

    const inputLbl = document.getElementById(`lmc-input-label-${prefix}`);
    if (inputLbl) inputLbl.textContent = `${nextLiters} L`;

    if (prefix === 'gas') {
        const qLbl = document.getElementById('lmc-quality-label-gas');
        if (qLbl) qLbl.textContent = `${nextLiters} L`;
    }

    const totRegEl = document.getElementById(`lmc-total-registered-${prefix}`);
    if (totRegEl) totRegEl.textContent = `${totalLiters} L`;

    const countEl = document.getElementById(`lmc-count-${prefix}`);
    if (countEl) countEl.textContent = count;

    // Render History Feed Chips
    const feedContainer = document.getElementById(`lmc-feed-${prefix}`);
    const btnUndo = document.getElementById(`btn-undo-lmc-${prefix}`);

    if (feedContainer) {
        if (entries.length === 0) {
            feedContainer.innerHTML = '<span class="feed-empty">Aún no se registraron extracciones.</span>';
            if (btnUndo) btnUndo.style.display = 'none';
        } else {
            if (btnUndo) btnUndo.style.display = 'inline-block';
            feedContainer.innerHTML = entries.map(e => {
                const qIcon = e.quality === 'Bueno' ? ' 🟢' : (e.quality === 'Medio' ? ' 🟡' : (e.quality === 'Malo' ? ' 🔴' : ''));
                const statusCls = e.inRange ? 'in-range' : 'out-range';
                return `<span class="lmc-feed-item ${statusCls}"><strong>${e.liters}L:</strong> ${e.temp}ºC${qIcon}</span>`;
            }).join('');
            feedContainer.scrollTop = feedContainer.scrollHeight;
        }
    }

    updateObtainedLiters(prefix);
    refreshSeqForStep(currentStep);
}

function registerLmcEntry(prefix) {
    const inp = document.getElementById(`lmc-input-${prefix}`);
    if (!inp || inp.value.trim() === '') {
        inp?.focus();
        return;
    }
    const tempVal = parseFloat(inp.value);
    if (isNaN(tempVal)) {
        inp.focus();
        return;
    }

    if (!activeTestId) return;
    const test = getTest(activeTestId);
    if (!test) return;
    test.data = test.data || {};

    const entries = getLmcEntries(prefix);
    const nextIdx = entries.length;

    test.data[`lmc-${prefix}-${nextIdx}`] = tempVal.toFixed(1);
    if (prefix === 'gas') {
        test.data[`gas-q-${nextIdx}`] = currentGasQuality;
    }

    upsertTest(test);

    // Provide user feedback
    const feedback = document.getElementById(`lmc-feedback-${prefix}`);
    const inRange = !shouldLockNext(prefix, tempVal);
    const literTxt = ((nextIdx + 1) * 0.5).toFixed(1);

    if (feedback) {
        if (inRange) {
            feedback.className = 'lmc-feedback-msg in-range';
            feedback.textContent = `✅ ${literTxt} L registrado (${tempVal.toFixed(1)} ºC) — Dentro de rango`;
        } else {
            feedback.className = 'lmc-feedback-msg out-range';
            feedback.textContent = `⚠️ ${literTxt} L registrado (${tempVal.toFixed(1)} ºC) — Fuera del rango de temperatura`;
        }
        setTimeout(() => {
            if (feedback.textContent.includes(literTxt)) feedback.textContent = '';
        }, 3500);
    }

    inp.value = '';
    renderLmcHero(prefix);
    saveState();
    inp.focus();
}

function undoLastLmcEntry(prefix) {
    if (!activeTestId) return;
    const test = getTest(activeTestId);
    if (!test || !test.data) return;
    const entries = getLmcEntries(prefix);
    if (entries.length === 0) return;

    const lastIdx = entries.length - 1;
    delete test.data[`lmc-${prefix}-${lastIdx}`];
    if (prefix === 'gas') {
        delete test.data[`gas-q-${lastIdx}`];
    }

    upsertTest(test);

    const feedback = document.getElementById(`lmc-feedback-${prefix}`);
    if (feedback) {
        feedback.className = 'lmc-feedback-msg';
        feedback.textContent = `⌫ Se eliminó la toma de ${((lastIdx + 1) * 0.5).toFixed(1)} L`;
        setTimeout(() => { feedback.textContent = ''; }, 3000);
    }

    renderLmcHero(prefix);
    saveState();
    const inp = document.getElementById(`lmc-input-${prefix}`);
    inp?.focus();
}

function updateObtainedLiters(prefix) {
    const entries = getLmcEntries(prefix);
    let count = 0;
    for (let i = 0; i < entries.length; i++) {
        count++;
        if (!entries[i].inRange) break;
    }
    const liters = (count * 0.5).toFixed(1);
    const el = document.getElementById(`lmc-obtenido-${prefix}`);
    if (el) el.textContent = liters;
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
    
    const extSec = parseMMSS(extInput.value);
    const recSec = parseMMSS(recInput.value);
    const totalSec = extSec + recSec;
    
    if (totalSec > 0) {
        resultBox.style.display = 'block';
        const totalEl = document.getElementById(`cycle-total-${type}`);
        if (totalEl) totalEl.textContent = formatMMSS(totalSec);
        
        let cph = 3600 / totalSec;
        cph = Math.ceil(cph * 1.15); // +15% tolerance, rounded up
        const cphEl = document.getElementById(`cycle-cph-${type}`);
        if (cphEl) cphEl.textContent = cph;
    } else {
        resultBox.style.display = 'none';
    }
}

function updateStopwatchDisplay(type) {
    const sw = stopwatches[type];
    const ms = sw.interval ? (Date.now() - sw.startTime + sw.elapsedMs) : sw.elapsedMs;
    const display = document.getElementById(`sw-display-${type}`);
    if (display) display.textContent = formatMMSS(Math.floor(ms / 1000));
    
    // Save to hidden input in MM:SS
    const input = document.getElementById(`extraccion-${type}`);
    if (input) {
        input.value = formatMMSS(Math.floor(ms / 1000));
        updateCycleDisplay(type);
    }
}

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
    const lProv = document.getElementById('litros-continuos-proveedor')?.value || '--';

    const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
    set('machete-fria', `${fMin} – ${fMax}`);
    set('machete-gas', `${fMin} – ${fMax}`);
    set('machete-caliente', `${cMin} – ${cMax}`);

    set('machete-litros-fria', lProv);
    set('machete-litros-gas', lProv);
    set('machete-litros-caliente', lProv);

    updateObtainedLiters('fria');
    updateObtainedLiters('gas');
    updateObtainedLiters('caliente');
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

    document.querySelectorAll('#view-wizard input[id]:not([type="hidden"]), #view-wizard textarea[id], #view-wizard select[id]').forEach(el => {
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

    document.querySelectorAll('#view-wizard input[id]:not([type="hidden"]), #view-wizard textarea[id], #view-wizard select[id]').forEach(el => {
        if (d[el.id] === undefined) return;
        if (el.type === 'checkbox') { el.checked = !!d[el.id]; el.dispatchEvent(new Event('change')); }
        else el.value = d[el.id];
    });
    document.querySelectorAll('#view-wizard input[type="hidden"][id]').forEach(el => { if (d[el.id] !== undefined) el.value = d[el.id]; });

    if (d.canerias) document.querySelectorAll('#canerias-group .chip').forEach(c => c.classList.toggle('active', d.canerias.includes(c.dataset.value)));
    if (d.funciones) document.querySelectorAll('#funciones-group .chip').forEach(c => c.classList.toggle('active', d.funciones.includes(c.dataset.value)));
    if (d.estadoFinal) document.querySelector(`#estado-final-group .chip[data-value="${d.estadoFinal}"]`)?.classList.add('active');

    updateHotWaterVisibility();
    updateGasDisclaimer();

    // Global stars
    const sv = parseInt(d['gas-calidad-val'] || 0);
    if (sv > 0) { const sr = document.querySelector('.star-rating[data-id="gas-calidad"]'); if (sr) sr.querySelectorAll('span').forEach(s => s.classList.toggle('active', parseInt(s.dataset.val) <= sv)); }

    // Dynamic LMC cells sequential restore
    // Restore LMC Hero Cards
    renderLmcHero('fria');
    renderLmcHero('gas');
    renderLmcHero('caliente');

    // Restore stopwatches
    ['fria', 'gas', 'caliente'].forEach(prefix => {
        const extVal = d[`extraccion-${prefix}`];
        if (extVal !== undefined && extVal !== '') {
            const input = document.getElementById(`extraccion-${prefix}`);
            if (input) input.value = extVal;
            const totalSec = parseMMSS(extVal);
            stopwatches[prefix].elapsedMs = totalSec * 1000;
            updateStopwatchDisplay(prefix);
        }
        updateCycleDisplay(prefix);
    });

    updateMachetes();
    validateDates();
    refreshStep4Checklist();
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

    // Setup LMC Hero quick-entry event listeners
    ['fria', 'gas', 'caliente'].forEach(prefix => {
        const inp = document.getElementById(`lmc-input-${prefix}`);
        const btn = document.getElementById(`btn-submit-lmc-${prefix}`);
        const btnUndo = document.getElementById(`btn-undo-lmc-${prefix}`);

        inp?.addEventListener('keydown', e => {
            if (e.key === 'Enter') {
                e.preventDefault();
                registerLmcEntry(prefix);
            }
        });
        btn?.addEventListener('click', () => registerLmcEntry(prefix));
        btnUndo?.addEventListener('click', () => undoLastLmcEntry(prefix));
    });

    // Gas Quality Pills
    document.querySelectorAll('#gas-quality-pills .quality-pill').forEach(pill => {
        pill.addEventListener('click', () => {
            document.querySelectorAll('#gas-quality-pills .quality-pill').forEach(p => p.classList.remove('active'));
            pill.classList.add('active');
            currentGasQuality = pill.dataset.quality || 'Bueno';
            document.getElementById('lmc-input-gas')?.focus();
        });
    });

    setupTimeInputMasks();
    loadDatalists();
    setupHubListeners();
    renderHub();
    initCloudSync();
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

    document.getElementById('btn-generate-chart')?.addEventListener('click', async () => {
        if (!performanceChartInstance) initChart();
        
        const reportSelect = document.getElementById('chart-select-report');
        const metricSelect = document.getElementById('chart-select-metric');
        const reportId = reportSelect.value;
        const metric = metricSelect.value;
        
        if (!reportId || !metric) {
            await customAlert('Por favor, seleccioná un testeo y una métrica.');
            return;
        }
        
        const test = getTest(reportId);
        if(!test || !test.data) return;
        
        let maxIdx = 9;
        if (metric.startsWith('lmc-')) {
            const type = metric.replace('lmc-', '');
            Object.keys(test.data).forEach(k => {
                if (k.startsWith(`lmc-${type}-`)) {
                    const idx = parseInt(k.replace(`lmc-${type}-`, ''), 10);
                    if (!isNaN(idx) && test.data[k] !== undefined && String(test.data[k]).trim() !== '') {
                        if (idx > maxIdx) maxIdx = idx;
                    }
                }
            });
        }
        
        const labels = Array.from({ length: maxIdx + 1 }, (_, i) => `${((i + 1) * 0.5).toFixed(1)}L`);
        if (labels.length > (performanceChartInstance.data.labels?.length || 0)) {
            performanceChartInstance.data.labels = labels;
        }

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

    document.getElementById('btn-clear-chart')?.addEventListener('click', async () => {
        if (!performanceChartInstance) return;
        const ok = await customConfirm('¿Seguro que querés limpiar el gráfico completo?', 'AQA-Test', {
            confirmText: 'Limpiar',
            cancelText: 'Cancelar',
            isDanger: true
        });
        if (ok) {
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
