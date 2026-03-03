// ==================== GLOBAL VARIABLES ====================
let chartDrawdown = null;
let chartDiagnostic = null;
let chartResidual = null;
let currentResults = {};
let currentData = [];

// App State untuk fleksibilitas data
const appState = {
    dataType: 'drawdown',
    initialLevel: null,
    rawData: [],
    processedData: [],
    metadata: {
        projectName: '',
        projectNo: '',
        client: '',
        location: '',
        wellId: '',
        analyst: '',
        date: '',
        time: ''
    }
};

// Unit conversion factors
const unitConversions = {
    length: {
        m: 1,
        cm: 0.01,
        mm: 0.001,
        ft: 0.3048,
        inch: 0.0254,
        yard: 0.9144
    },
    time: {
        s: 1,
        min: 60,
        hr: 3600,
        day: 86400
    }
};

// Constants
const EULER_GAMMA = 0.5772156649;
const WELL_FUNCTION_MAX_ITER = 1000;
const CONFIDENCE_LEVEL = 0.95;

// Excel Import Variables
let importedData = [];

// Map Variables
let map;
let wells = [];
let mapInitialized = false;

// ==================== INITIALIZATION ====================
window.onload = function() {
    // Set default date and time
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('testDate').value = today;
    
    const now = new Date();
    const timeString = now.getHours().toString().padStart(2, '0') + ':' + 
                      now.getMinutes().toString().padStart(2, '0');
    document.getElementById('testTime').value = timeString;
    
    // Set default values
    document.getElementById('analyst').value = 'Hydrogeologist';
    document.getElementById('projectName').value = 'Pumping Test Analysis';
    document.getElementById('wellId').value = 'BW-01';
    document.getElementById('projectNo').value = 'PROJ-2024-001';
    document.getElementById('client').value = 'PT. Contoh';
    document.getElementById('location').value = 'Jakarta';
    
    // Set default data type
    document.getElementById('dataType').value = 'drawdown';
    
    // Add initial data rows
    for (let i = 0; i < 5; i++) {
        addDataRow();
    }
    
    // Load sample data
    loadSampleData();
    
    // Update method fields
    updateMethodFields();
    
    // Update aquifer fields
    updateAquiferFields();
    
    // Setup event listeners
    setupEventListeners();
    
    // Initialize map if element exists
    if (document.getElementById('map')) {
        setTimeout(initMap, 500);
    }
    
    console.log('✅ Aplikasi siap digunakan!');
};

function setupEventListeners() {
    // Listen for initial level changes
    document.getElementById('initialLevel').addEventListener('input', function() {
        if (appState.dataType === 'waterlevel') {
            refreshTableDisplay();
        }
    });
    
    // Listen for data type changes
    document.getElementById('dataType').addEventListener('change', handleDataTypeChange);
    
    // Listen for method changes
    document.getElementById('method').addEventListener('change', updateMethodFields);
    
    // Listen for aquifer type changes
    document.getElementById('aquiferType').addEventListener('change', updateAquiferFields);
    
    // Listen for unit changes
    document.getElementById('lengthUnit').addEventListener('change', handleUnitChange);
    document.getElementById('timeUnit').addEventListener('change', handleUnitChange);
    
    // Listen for barometric efficiency type
    document.getElementById('beType').addEventListener('change', updateBarometricEfficiency);
    document.getElementById('barometricEfficiency').addEventListener('input', updateBarometricEfficiency);
}

// ==================== UNIT CONVERSION FUNCTIONS ====================

// Convert value from selected unit to base unit (m or s)
function convertToBase(value, unit, type) {
    if (!value && value !== 0) return value;
    return value * unitConversions[type][unit];
}

// Convert value from base unit to selected unit
function convertFromBase(value, unit, type) {
    if (!value && value !== 0) return value;
    return value / unitConversions[type][unit];
}

// Handle unit change - update displayed values
function handleUnitChange() {
    const lengthUnit = document.getElementById('lengthUnit').value;
    const timeUnit = document.getElementById('timeUnit').value;
    
    // Update unit labels
    const transmisivityUnit = document.getElementById('transmisivityUnit');
    if (transmisivityUnit) transmisivityUnit.textContent = `m²/${timeUnit}`;
    
    const kUnit = document.getElementById('kUnit');
    if (kUnit) kUnit.textContent = `m/${timeUnit}`;
    
    const rUnit = document.getElementById('rUnit');
    if (rUnit) rUnit.textContent = lengthUnit;
    
    const scUnit = document.getElementById('scUnit');
    if (scUnit) scUnit.textContent = `m²/${timeUnit}`;
    
    // Update table headers
    updateTableStructure();
    
    // Refresh table display
    refreshTableDisplay();
    
    // Convert displayed values if results exist
    if (currentResults.T) {
        displayResults(currentResults, document.getElementById('method').value, 
                      parseFloat(document.getElementById('thickness').value));
    }
}

// ==================== BAROMETRIC EFFICIENCY FUNCTIONS ====================

// Calculate Barometric Efficiency
function calculateBarometricEfficiency(waterLevelChange, barometricChange) {
    const be = parseFloat(document.getElementById('barometricEfficiency').value) || 0.8;
    const beType = document.getElementById('beType').value;
    
    // Convert to fraction if percentage
    const beValue = beType === 'percentage' ? be / 100 : be;
    
    // Calculate response
    const response = beValue * (barometricChange || 0);
    
    return {
        efficiency: beValue * 100,
        response: response,
        correctedDrawdown: (waterLevelChange || 0) - response
    };
}

// Update barometric efficiency display
function updateBarometricEfficiency() {
    const be = parseFloat(document.getElementById('barometricEfficiency').value) || 0.8;
    const beType = document.getElementById('beType').value;
    
    const beValue = beType === 'percentage' ? be : be * 100;
    const beResult = document.getElementById('barometricEfficiencyResult');
    if (beResult) {
        beResult.textContent = beValue.toFixed(1);
    }
}

// ==================== DATA TYPE HANDLING ====================

// Handle change in data type selection
function handleDataTypeChange() {
    const dataType = document.getElementById('dataType').value;
    const initialContainer = document.getElementById('initialLevelContainer');
    const waterLevelInfo = document.getElementById('waterLevelInfo');
    
    // Update app state
    appState.dataType = dataType;
    
    // Show/hide relevant fields
    if (dataType === 'waterlevel') {
        initialContainer.style.display = 'block';
        waterLevelInfo.style.display = 'block';
    } else {
        initialContainer.style.display = 'none';
        waterLevelInfo.style.display = 'none';
        appState.initialLevel = null;
    }
    
    // Update table structure
    updateTableStructure();
    
    // Refresh display
    refreshTableDisplay();
}

// Update table structure based on data type
function updateTableStructure() {
    const tableHeader = document.getElementById('tableHeader');
    const tableBody = document.getElementById('tableBody');
    const dataType = appState.dataType;
    const lengthUnit = document.getElementById('lengthUnit').value;
    const timeUnit = document.getElementById('timeUnit').value;
    
    // Clear existing rows
    tableBody.innerHTML = '';
    
    // Update header
    if (dataType === 'waterlevel') {
        tableHeader.innerHTML = `
            <tr>
                <th>No</th>
                <th>Waktu (${timeUnit})</th>
                <th>Water Level (${lengthUnit})</th>
                <th>Drawdown (${lengthUnit})</th>
                <th>log(t)</th>
            </tr>
        `;
    } else {
        tableHeader.innerHTML = `
            <tr>
                <th>No</th>
                <th>Waktu (${timeUnit})</th>
                <th>Drawdown (${lengthUnit})</th>
                <th>t/s</th>
                <th>log(t)</th>
            </tr>
        `;
    }
    
    // Add initial empty rows
    for (let i = 0; i < 5; i++) {
        addDataRow();
    }
}

// Add a new data row
function addDataRow() {
    const tbody = document.getElementById('tableBody');
    const row = document.createElement('tr');
    const rowNum = tbody.children.length + 1;
    const dataType = appState.dataType;
    const lengthUnit = document.getElementById('lengthUnit').value;
    const timeUnit = document.getElementById('timeUnit').value;
    
    if (dataType === 'waterlevel') {
        row.innerHTML = `
            <td>${rowNum}</td>
            <td><input type="number" step="any" class="time-input" placeholder="Waktu (${timeUnit})"></td>
            <td><input type="number" step="any" class="value-input water-level-input" placeholder="Water Level (${lengthUnit})"></td>
            <td class="drawdown-display">-</td>
            <td class="log-cell">-</td>
        `;
    } else {
        row.innerHTML = `
            <td>${rowNum}</td>
            <td><input type="number" step="any" class="time-input" placeholder="Waktu (${timeUnit})"></td>
            <td><input type="number" step="any" class="value-input drawdown-input" placeholder="Drawdown (${lengthUnit})"></td>
            <td class="ratio-cell">-</td>
            <td class="log-cell">-</td>
        `;
    }
    
    tbody.appendChild(row);
    
    // Add event listeners
    row.querySelectorAll('input').forEach(input => {
        input.addEventListener('input', updateDerivedValues);
    });
}

// Update derived values (t/s, log(t), drawdown from water level)
function updateDerivedValues() {
    const rows = document.querySelectorAll('#tableBody tr');
    const dataType = appState.dataType;
    const initialLevel = parseFloat(document.getElementById('initialLevel').value);
    const lengthUnit = document.getElementById('lengthUnit').value;
    const timeUnit = document.getElementById('timeUnit').value;
    
    // Update app state
    if (dataType === 'waterlevel' && !isNaN(initialLevel)) {
        appState.initialLevel = initialLevel;
    }
    
    rows.forEach(row => {
        const time = parseFloat(row.querySelector('.time-input')?.value);
        const value = parseFloat(row.querySelector('.value-input')?.value);
        const logCell = row.querySelector('.log-cell');
        
        if (time && !isNaN(time)) {
            // Convert time to seconds for log calculation
            const timeInSeconds = convertToBase(time, timeUnit, 'time');
            logCell.textContent = Math.log10(timeInSeconds).toFixed(3);
            
            if (dataType === 'waterlevel') {
                const drawdownCell = row.querySelector('.drawdown-display');
                if (!isNaN(initialLevel) && !isNaN(value)) {
                    // Convert both to meters for calculation
                    const initialInMeters = convertToBase(initialLevel, lengthUnit, 'length');
                    const valueInMeters = convertToBase(value, lengthUnit, 'length');
                    const drawdownInMeters = initialInMeters - valueInMeters;
                    
                    // Convert back to selected unit for display
                    const drawdownInUnit = convertFromBase(drawdownInMeters, lengthUnit, 'length');
                    drawdownCell.textContent = drawdownInUnit.toFixed(3);
                    
                    // Color code based on drawdown sign
                    if (drawdownInMeters < 0) {
                        drawdownCell.style.color = '#e74c3c';
                        drawdownCell.style.fontWeight = 'bold';
                    } else {
                        drawdownCell.style.color = '#27ae60';
                        drawdownCell.style.fontWeight = 'normal';
                    }
                }
            } else {
                const ratioCell = row.querySelector('.ratio-cell');
                if (!isNaN(value)) {
                    // Convert time to seconds for ratio
                    const timeInSeconds = convertToBase(time, timeUnit, 'time');
                    const valueInMeters = convertToBase(value, lengthUnit, 'length');
                    ratioCell.textContent = (timeInSeconds / valueInMeters).toFixed(2);
                }
            }
        }
    });
}

// Refresh entire table display
function refreshTableDisplay() {
    updateDerivedValues();
}

// ==================== DATA COLLECTION ====================

// Collect raw data from table (convert to base units)
function collectRawData() {
    const rows = document.querySelectorAll('#tableBody tr');
    const data = [];
    const dataType = appState.dataType;
    const lengthUnit = document.getElementById('lengthUnit').value;
    const timeUnit = document.getElementById('timeUnit').value;
    
    rows.forEach(row => {
        const time = parseFloat(row.querySelector('.time-input')?.value);
        const value = parseFloat(row.querySelector('.value-input')?.value);
        
        if (time && !isNaN(time) && value && !isNaN(value)) {
            // Convert to base units (seconds and meters)
            const timeInSeconds = convertToBase(time, timeUnit, 'time');
            const valueInMeters = convertToBase(value, lengthUnit, 'length');
            
            if (dataType === 'waterlevel') {
                data.push({
                    t: timeInSeconds,
                    waterLevel: valueInMeters,
                    originalType: 'waterlevel'
                });
            } else {
                data.push({
                    t: timeInSeconds,
                    drawdown: valueInMeters,
                    originalType: 'drawdown'
                });
            }
        }
    });
    
    return data.sort((a, b) => a.t - b.t);
}

// Get processed data (always in drawdown format, meters, seconds)
function getProcessedData() {
    const rawData = collectRawData();
    appState.rawData = rawData;
    
    if (appState.dataType === 'waterlevel') {
        const initialLevel = parseFloat(document.getElementById('initialLevel').value);
        const lengthUnit = document.getElementById('lengthUnit').value;
        
        if (isNaN(initialLevel)) {
            showValidationMessage('Initial water level harus diisi untuk konversi!', 'error');
            return null;
        }
        
        // Convert initial level to meters
        const initialInMeters = convertToBase(initialLevel, lengthUnit, 'length');
        appState.initialLevel = initialInMeters;
        
        // Convert water level to drawdown
        return rawData.map(point => ({
            t: point.t,
            s: initialInMeters - point.waterLevel,
            originalWL: point.waterLevel
        }));
    } else {
        // Already in drawdown format with meters
        return rawData.map(point => ({
            t: point.t,
            s: point.drawdown
        }));
    }
}

// Validate water level data
function validateWaterLevelData(data, initialLevel) {
    const warnings = [];
    
    if (!data || data.length === 0) return warnings;
    
    // Check if water level decreases (drawdown positive)
    data.forEach(point => {
        const drawdown = initialLevel - point.waterLevel;
        if (drawdown < 0) {
            warnings.push(`Data pada t=${point.t}s: water level naik (drawdown negatif) - periksa apakah ini data recovery?`);
        }
    });
    
    // Check for monotonic trend
    const drawdowns = data.map(p => initialLevel - p.waterLevel);
    let increasing = true;
    for (let i = 1; i < drawdowns.length; i++) {
        if (drawdowns[i] < drawdowns[i-1] - 0.01) {
            increasing = false;
            break;
        }
    }
    
    if (!increasing) {
        warnings.push('Drawdown tidak monoton naik - mungkin ada data recovery atau kesalahan pengukuran');
    }
    
    // Check for outliers
    const mean = drawdowns.reduce((a, b) => a + b, 0) / drawdowns.length;
    const std = Math.sqrt(drawdowns.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / drawdowns.length);
    
    data.forEach((point, i) => {
        const drawdown = initialLevel - point.waterLevel;
        if (Math.abs(drawdown - mean) > 3 * std) {
            warnings.push(`Data pada t=${point.t}s: potensial outlier (drawdown = ${drawdown.toFixed(3)} m)`);
        }
    });
    
    return warnings;
}

// ==================== UTILITY FUNCTIONS ====================

// Well Function W(u) - Improved exponential integral
function wellFunction(u) {
    if (u <= 0) return Infinity;
    if (u > 10) return 0;
    
    if (u < 0.01) {
        return -Math.log(u) - EULER_GAMMA + u - u*u/4 + u*u*u/18;
    }
    
    let sum = -EULER_GAMMA - Math.log(u);
    let term = u;
    let n = 1;
    
    while (Math.abs(term) > 1e-12 && n < WELL_FUNCTION_MAX_ITER) {
        sum += Math.pow(-1, n) * term / (n * n);
        term *= u / (n + 1);
        n++;
    }
    
    return sum;
}

// Modified Bessel Function K0 for Hantush method
function besselK0(x) {
    if (x <= 0) return Infinity;
    if (x < 2) {
        return -Math.log(x/2) - EULER_GAMMA + (x*x/4) * (1 - Math.log(x/2));
    } else {
        return Math.sqrt(Math.PI/(2*x)) * Math.exp(-x) * 
               (1 - 1/(8*x) + 9/(128*x*x) - 75/(1024*x*x*x));
    }
}

// Calculate R-squared
function calculateR2(data) {
    const n = data.length;
    const meanY = data.reduce((sum, d) => sum + d.y, 0) / n;
    
    const ssTot = data.reduce((sum, d) => sum + Math.pow(d.y - meanY, 2), 0);
    const ssRes = data.reduce((sum, d) => {
        const yPred = linearInterpolation(data, d.x);
        return sum + Math.pow(d.y - yPred, 2);
    }, 0);
    
    return 1 - (ssRes / ssTot);
}

// Linear interpolation helper
function linearInterpolation(data, x) {
    if (data.length < 2) return 0;
    
    for (let i = 0; i < data.length - 1; i++) {
        if (x >= data[i].x && x <= data[i+1].x) {
            const t = (x - data[i].x) / (data[i+1].x - data[i].x);
            return data[i].y + t * (data[i+1].y - data[i].y);
        }
    }
    
    if (x < data[0].x) {
        const slope = (data[1].y - data[0].y) / (data[1].x - data[0].x);
        return data[0].y + slope * (x - data[0].x);
    } else {
        const slope = (data[data.length-1].y - data[data.length-2].y) / 
                     (data[data.length-1].x - data[data.length-2].x);
        return data[data.length-1].y + slope * (x - data[data.length-1].x);
    }
}

// Validate Cooper-Jacob conditions
function validateCooperJacobConditions(data, T, S, r) {
    const messages = [];
    
    const tMin = Math.min(...data.map(d => d.t));
    const uMax = (r * r * S) / (4 * T * tMin);
    
    if (uMax > 0.05) {
        messages.push({
            type: 'warning',
            text: `Nilai u maksimum = ${uMax.toExponential(2)} > 0.05. Cooper-Jacob mungkin tidak akurat untuk data awal. Gunakan data dengan t > ${(r*r*S/(4*T*0.05)).toFixed(0)} detik.`
        });
    }
    
    const logData = data.map(d => ({x: Math.log10(d.t), y: d.s}));
    const r2 = calculateR2(logData);
    
    if (r2 < 0.95) {
        messages.push({
            type: 'warning',
            text: `Linearitas rendah (R² = ${r2.toFixed(3)}). Data mungkin tidak ideal untuk Cooper-Jacob.`
        });
    }
    
    return messages;
}

// Non-linear least squares optimization for Theis method
function optimizeTheisParameters(data, Q, r) {
    let bestParams = {T: 0.01, S: 0.001};
    let bestError = Infinity;
    
    for (let T = 0.0001; T <= 0.1; T *= 1.5) {
        for (let S = 1e-6; S <= 0.01; S *= 1.5) {
            let error = 0;
            
            data.forEach(d => {
                const u = (r * r * S) / (4 * T * d.t);
                if (u > 0) {
                    const W_u = wellFunction(u);
                    const sCalc = (Q / (4 * Math.PI * T)) * W_u;
                    error += Math.pow(d.s - sCalc, 2);
                }
            });
            
            if (error < bestError) {
                bestError = error;
                bestParams = {T, S};
            }
        }
    }
    
    bestParams = refineTheisParameters(data, Q, r, bestParams);
    
    return bestParams;
}

// Local refinement using gradient descent
function refineTheisParameters(data, Q, r, initialParams) {
    let {T, S} = initialParams;
    let error = calculateTheisError(data, Q, r, T, S);
    let learningRate = 0.1;
    let iteration = 0;
    const maxIterations = 100;
    
    while (iteration < maxIterations) {
        const deltaT = 0.001 * T;
        const deltaS = 0.001 * S;
        
        const errorT = calculateTheisError(data, Q, r, T + deltaT, S);
        const errorS = calculateTheisError(data, Q, r, T, S + deltaS);
        
        const gradT = (errorT - error) / deltaT;
        const gradS = (errorS - error) / deltaS;
        
        const newT = Math.max(T - learningRate * gradT, 1e-6);
        const newS = Math.max(S - learningRate * gradS, 1e-8);
        
        const newError = calculateTheisError(data, Q, r, newT, newS);
        
        if (newError < error) {
            T = newT;
            S = newS;
            error = newError;
            learningRate *= 1.05;
        } else {
            learningRate *= 0.5;
        }
        
        if (learningRate < 1e-10) break;
        iteration++;
    }
    
    return {T, S};
}

// Calculate error for Theis method
function calculateTheisError(data, Q, r, T, S) {
    let error = 0;
    data.forEach(d => {
        const u = (r * r * S) / (4 * T * d.t);
        if (u > 0 && u < 50) {
            const W_u = wellFunction(u);
            const sCalc = (Q / (4 * Math.PI * T)) * W_u;
            error += Math.pow(d.s - sCalc, 2);
        }
    });
    return error;
}

// Calculate confidence intervals
function calculateConfidenceIntervals(data, params, nParams) {
    const n = data.length;
    const r = parseFloat(document.getElementById('distance').value);
    const Q = parseFloat(document.getElementById('discharge').value);
    
    const residuals = data.map(d => {
        const u = (r * r * params.S) / (4 * params.T * d.t);
        const sCalc = (Q / (4 * Math.PI * params.T)) * wellFunction(u);
        return d.s - sCalc;
    });
    
    const rmse = Math.sqrt(residuals.reduce((sum, r) => sum + r*r, 0) / (n - nParams));
    const tValue = 2.0;
    
    return {
        T: params.T * (1 + tValue * rmse / Math.abs(params.T) / Math.sqrt(n)),
        S: params.S * (1 + tValue * rmse / Math.abs(params.S) / Math.sqrt(n))
    };
}

// Calculate skin factor
function calculateSkinFactor(s_skin, Q, T) {
    return (2 * Math.PI * T * s_skin) / Q;
}

// ==================== UI FUNCTIONS ====================

// Update method fields
function updateMethodFields() {
    const method = document.getElementById('method').value;
    const stepFields = document.getElementById('stepFields');
    const leakyFields = document.getElementById('leakyFields');
    const fractureFields = document.getElementById('fractureFields');
    
    if (stepFields) stepFields.style.display = method === 'step-drawdown' ? 'block' : 'none';
    if (leakyFields) leakyFields.style.display = method === 'hantush' ? 'block' : 'none';
    if (fractureFields) fractureFields.style.display = method === 'neuman' ? 'block' : 'none';
}

// Update aquifer fields
function updateAquiferFields() {
    const aquiferType = document.getElementById('aquiferType').value;
    const leakyFields = document.getElementById('leakyFields');
    const fractureFields = document.getElementById('fractureFields');
    
    if (leakyFields) leakyFields.style.display = aquiferType === 'leaky' ? 'block' : 'none';
    if (fractureFields) fractureFields.style.display = aquiferType === 'fracture' ? 'block' : 'none';
}

// Switch tabs
function switchTab(tabName) {
    document.querySelectorAll('.tab-pane').forEach(tab => {
        tab.classList.remove('active');
    });
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    
    document.getElementById(tabName + 'Tab').classList.add('active');
    event.target.classList.add('active');
    
    // Initialize map when switching to map tab
    if (tabName === 'map') {
        setTimeout(() => {
            initMap();
            if (map) {
                map.invalidateSize();
            }
        }, 100);
    }
    
    // Auto-generate report preview when switching to report tab
    if (tabName === 'report' && currentResults.T) {
        generateReportPreview();
    }
}

// Load sample data
function loadSampleData() {
    const dataType = document.getElementById('dataType').value;
    const tbody = document.getElementById('tableBody');
    tbody.innerHTML = '';
    
    if (dataType === 'waterlevel') {
        // Sample water level data (initial = 25.5 m)
        const sampleWL = [
            {t: 60, wl: 25.18},
            {t: 120, wl: 24.96},
            {t: 240, wl: 24.72},
            {t: 480, wl: 24.45},
            {t: 900, wl: 24.18},
            {t: 1800, wl: 23.86},
            {t: 2700, wl: 23.65},
            {t: 3600, wl: 23.48},
            {t: 5400, wl: 23.25},
            {t: 7200, wl: 23.08}
        ];
        
        sampleWL.forEach((data, idx) => {
            const row = document.createElement('tr');
            const drawdown = (25.5 - data.wl).toFixed(3);
            row.innerHTML = `
                <td>${idx + 1}</td>
                <td><input type="number" step="any" class="time-input" value="${data.t}"></td>
                <td><input type="number" step="any" class="value-input water-level-input" value="${data.wl}"></td>
                <td class="drawdown-display" style="color: #27ae60;">${drawdown}</td>
                <td class="log-cell">${Math.log10(data.t).toFixed(3)}</td>
            `;
            tbody.appendChild(row);
        });
        
        document.getElementById('initialLevel').value = '25.5';
        appState.initialLevel = 25.5;
    } else {
        // Sample drawdown data
        const sampleData = [
            {t: 60, s: 0.32},
            {t: 120, s: 0.54},
            {t: 240, s: 0.78},
            {t: 480, s: 1.05},
            {t: 900, s: 1.32},
            {t: 1800, s: 1.64},
            {t: 2700, s: 1.85},
            {t: 3600, s: 2.02},
            {t: 5400, s: 2.25},
            {t: 7200, s: 2.42}
        ];
        
        sampleData.forEach((data, idx) => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${idx + 1}</td>
                <td><input type="number" step="any" class="time-input" value="${data.t}"></td>
                <td><input type="number" step="any" class="value-input drawdown-input" value="${data.s}"></td>
                <td class="ratio-cell">${(data.t / data.s).toFixed(2)}</td>
                <td class="log-cell">${Math.log10(data.t).toFixed(3)}</td>
            `;
            tbody.appendChild(row);
        });
    }
    
    // Set default values
    document.getElementById('discharge').value = '0.015';
    document.getElementById('distance').value = '25';
    document.getElementById('thickness').value = '35';
    document.getElementById('wellRadius').value = '0.2';
    document.getElementById('casingRadius').value = '0.1';
    document.getElementById('screenLength').value = '10';
    document.getElementById('barometricEfficiency').value = '0.8';
}

// Clear all data
function clearData() {
    document.getElementById('tableBody').innerHTML = '';
    addDataRow();
    
    // Reset app state
    appState.rawData = [];
    appState.processedData = [];
    appState.initialLevel = null;
    document.getElementById('initialLevel').value = '';
    
    // Clear result displays
    document.getElementById('transmisivity').textContent = '-';
    document.getElementById('storativity').textContent = '-';
    document.getElementById('hydraulicConductivity').textContent = '-';
    document.getElementById('radiusInfluence').textContent = '-';
    document.getElementById('specificCapacity').textContent = '-';
    document.getElementById('skinFactor').textContent = '-';
    document.getElementById('barometricEfficiencyResult').textContent = '-';
    
    document.getElementById('T_ci').textContent = '';
    document.getElementById('S_ci').textContent = '';
    
    document.getElementById('hydrogeologicalInterpretation').innerHTML = 
        '<p>Masukkan data dan klik "Hitung Parameter" untuk interpretasi komprehensif.</p>';
    document.getElementById('recommendations').innerHTML = '';
    document.getElementById('validationMessages').style.display = 'none';
    
    // Reset report container
    const reportContainer = document.getElementById('reportContainer');
    if (reportContainer) {
        reportContainer.innerHTML = `
            <div class="report-placeholder">
                <p>Klik tombol "Preview Laporan" untuk generate laporan</p>
            </div>
        `;
    }
    
    // Destroy charts
    if (chartDrawdown) chartDrawdown.destroy();
    if (chartDiagnostic) chartDiagnostic.destroy();
    if (chartResidual) chartResidual.destroy();
}

// Show validation messages
function showValidationMessages(messages) {
    const container = document.getElementById('validationMessages');
    let html = '';
    
    messages.forEach(msg => {
        const className = msg.type === 'warning' ? 'validation-warning' : 'validation-error';
        html += `<div class="${className}">⚠️ ${msg.text}</div>`;
    });
    
    container.innerHTML = html;
    container.style.display = 'block';
}

// Show single validation message
function showValidationMessage(text, type) {
    const container = document.getElementById('validationMessages');
    const className = type === 'warning' ? 'validation-warning' : 'validation-error';
    
    container.innerHTML = `<div class="${className}">${type === 'error' ? '❌' : '⚠️'} ${text}</div>`;
    container.style.display = 'block';
    
    // Auto hide after 5 seconds
    setTimeout(() => {
        container.style.display = 'none';
    }, 5000);
}

// ==================== CALCULATION FUNCTIONS ====================

// Main calculation function
function calculate() {
    const method = document.getElementById('method').value;
    const Q = parseFloat(document.getElementById('discharge').value);
    const r = parseFloat(document.getElementById('distance').value);
    const b = parseFloat(document.getElementById('thickness').value) || 30;
    const rw = parseFloat(document.getElementById('wellRadius').value) || 0.15;
    
    if (!Q || !r) {
        showValidationMessage('Mohon lengkapi data debit dan jarak observasi!', 'error');
        return;
    }
    
    // Get processed data (always in drawdown format with base units)
    const processedData = getProcessedData();
    
    if (!processedData || processedData.length < 3) {
        showValidationMessage('Minimal 3 data points diperlukan!', 'error');
        return;
    }
    
    currentData = processedData;
    
    // Validate water level data if applicable
    if (appState.dataType === 'waterlevel') {
        const warnings = validateWaterLevelData(appState.rawData, appState.initialLevel);
        if (warnings.length > 0) {
            showValidationMessages(warnings.map(w => ({type: 'warning', text: w})));
        }
    }
    
    let results = {};
    let validationMessages = [];
    
    try {
        switch (method) {
            case 'cooper-jacob':
                results = calculateCooperJacob(processedData, Q, r, b);
                validationMessages = validateCooperJacobConditions(processedData, results.T, results.S, r);
                break;
                
            case 'theis':
                results = calculateTheis(processedData, Q, r, b);
                break;
                
            case 'recovery':
                results = calculateRecovery(processedData, Q, r, b);
                break;
                
            case 'step-drawdown':
                results = calculateStepDrawdown(processedData, Q, rw);
                break;
                
            case 'hantush':
                results = calculateHantush(processedData, Q, r, b);
                break;
                
            case 'neuman':
                results = calculateNeuman(processedData, Q, r, b);
                break;
        }
        
        // Calculate barometric efficiency
        updateBarometricEfficiency();
        
        if (results.T && results.S && typeof results.S === 'number') {
            const ci = calculateConfidenceIntervals(processedData, results, 2);
            document.getElementById('T_ci').textContent = 
                `95% CI: ±${((ci.T - results.T) / results.T * 100).toFixed(1)}%`;
            document.getElementById('S_ci').textContent = 
                `95% CI: ±${((ci.S - results.S) / results.S * 100).toFixed(1)}%`;
        }
        
        currentResults = results;
        displayResults(results, method, b);
        
        if (validationMessages.length > 0) {
            showValidationMessages(validationMessages);
        }
        
        plotCharts(processedData, results, method, Q, r);
        performQualityChecks(processedData, results, method);
        
        // Reset report container
        const reportContainer = document.getElementById('reportContainer');
        if (reportContainer) {
            reportContainer.innerHTML = `
                <div class="report-placeholder">
                    <p>Klik tombol "Preview Laporan" untuk generate laporan</p>
                </div>
            `;
        }
        
        showValidationMessage('Perhitungan berhasil!', 'warning');
        
    } catch (error) {
        showValidationMessage('Error dalam perhitungan: ' + error.message, 'error');
        console.error(error);
    }
}

// Cooper-Jacob Method
function calculateCooperJacob(data, Q, r, b) {
    const logData = data.map(d => ({
        x: Math.log10(d.t),
        y: d.s
    }));
    
    const n = logData.length;
    let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
    
    logData.forEach(d => {
        sumX += d.x;
        sumY += d.y;
        sumXY += d.x * d.y;
        sumX2 += d.x * d.x;
    });
    
    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;
    
    const T = (2.303 * Q) / (4 * Math.PI * Math.abs(slope));
    const t0 = Math.pow(10, -intercept / slope);
    const S = (2.246 * T * t0) / (r * r);
    
    const K = T / b;
    const tMax = Math.max(...data.map(d => d.t));
    const R = 1.5 * Math.sqrt((T * tMax) / S);
    const sStable = data[data.length - 1].s;
    const specificCapacity = Q / sStable;
    
    const sInitial = data[0].s;
    const sTheor = (Q / (4 * Math.PI * T)) * wellFunction((r * r * S) / (4 * T * data[0].t));
    const skinFactor = (2 * Math.PI * T * (sInitial - sTheor)) / Q;
    
    return {
        T, S, K, R, specificCapacity, skinFactor,
        slope, intercept, t0,
        method: 'Cooper-Jacob'
    };
}

// Theis Method
function calculateTheis(data, Q, r, b) {
    const params = optimizeTheisParameters(data, Q, r);
    
    const T = params.T;
    const S = params.S;
    const K = T / b;
    const tMax = Math.max(...data.map(d => d.t));
    const R = 1.5 * Math.sqrt((T * tMax) / S);
    const sStable = data[data.length - 1].s;
    const specificCapacity = Q / sStable;
    
    const theoretical = data.map(d => {
        const u = (r * r * S) / (4 * T * d.t);
        const W_u = wellFunction(u);
        return (Q / (4 * Math.PI * T)) * W_u;
    });
    
    const residuals = data.map((d, i) => d.s - theoretical[i]);
    const rmse = Math.sqrt(residuals.reduce((sum, r) => sum + r*r, 0) / data.length);
    
    return {
        T, S, K, R, specificCapacity,
        theoretical, residuals, rmse,
        method: 'Theis'
    };
}

// Recovery Test Method
function calculateRecovery(data, Q, r, b) {
    const recoveryData = data.map((d, i) => ({
        x: Math.log10((d.t + 1) / 1),
        y: d.s
    }));
    
    const n = recoveryData.length;
    let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
    
    recoveryData.forEach(d => {
        sumX += d.x;
        sumY += d.y;
        sumXY += d.x * d.y;
        sumX2 += d.x * d.x;
    });
    
    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    const T = (2.303 * Q) / (4 * Math.PI * Math.abs(slope));
    const K = T / b;
    const S = 'N/A';
    
    return {
        T, S, K,
        recoverySlope: slope,
        method: 'Recovery'
    };
}

// Step Drawdown Method
function calculateStepDrawdown(data, Q, rw) {
    const stepDuration = 1800;
    const steps = {};
    
    data.forEach(d => {
        const stepNum = Math.floor(d.t / stepDuration) + 1;
        if (!steps[stepNum]) {
            steps[stepNum] = {
                times: [],
                drawdowns: []
            };
        }
        steps[stepNum].times.push(d.t);
        steps[stepNum].drawdowns.push(d.s);
    });
    
    const stepData = [];
    let stepQ = Q;
    
    Object.keys(steps).sort().forEach(stepNum => {
        const step = steps[stepNum];
        const avgDrawdown = step.drawdowns.reduce((a, b) => a + b, 0) / step.drawdowns.length;
        stepData.push({
            step: parseInt(stepNum),
            Q: stepQ,
            s: avgDrawdown
        });
        stepQ += 0.005;
    });
    
    const n = stepData.length;
    let sumQ = 0, sumQ2 = 0, sumS = 0, sumSQ = 0;
    
    stepData.forEach(d => {
        sumQ += d.Q;
        sumQ2 += d.Q * d.Q;
        sumS += d.s;
        sumSQ += d.s * d.Q;
    });
    
    const det = n * sumQ2 - sumQ * sumQ;
    const B = (sumS * sumQ2 - sumQ * sumSQ) / det;
    const C = (n * sumSQ - sumQ * sumS) / det;
    
    const totalDrawdown = B * Q + C * Q * Q;
    const aquiferLoss = B * Q;
    const efficiency = (aquiferLoss / totalDrawdown) * 100;
    const skinFactor = (2 * Math.PI * B * Q) / Q;
    
    return {
        B, C, n: 2,
        efficiency,
        skinFactor,
        stepData,
        method: 'Step Drawdown'
    };
}

// Hantush Method for Leaky Aquifer
function calculateHantush(data, Q, r, b) {
    const Kv = parseFloat(document.getElementById('verticalK').value) || 1e-7;
    const bPrime = parseFloat(document.getElementById('thicknessLeaky').value) || 5;
    
    let bestT = 0.01;
    let bestB = Math.sqrt((bestT * bPrime) / Kv);
    let bestError = Infinity;
    
    for (let testT = 0.0001; testT <= 0.1; testT *= 1.5) {
        for (let testB = 10; testB <= 1000; testB *= 1.5) {
            let error = 0;
            
            data.forEach(d => {
                const u = (r * r) / (4 * testT * d.t);
                const rB = r / testB;
                const W_u_rB = wellFunction(u) * Math.exp(-rB);
                const sCalc = (Q / (4 * Math.PI * testT)) * W_u_rB;
                error += Math.pow(d.s - sCalc, 2);
            });
            
            if (error < bestError) {
                bestError = error;
                bestT = testT;
                bestB = testB;
            }
        }
    }
    
    const K = bestT / b;
    const S = 0.001;
    const specificCapacity = Q / data[data.length - 1].s;
    
    return {
        T: bestT,
        S,
        K,
        leakageFactor: bestB,
        verticalK: Kv,
        specificCapacity,
        method: 'Hantush'
    };
}

// Neuman Method for Unconfined Aquifer
function calculateNeuman(data, Q, r, b) {
    const earlyData = data.slice(0, Math.floor(data.length / 3));
    const lateData = data.slice(-Math.floor(data.length / 3));
    
    const earlyResults = calculateCooperJacob(earlyData, Q, r, b);
    const lateResults = calculateCooperJacob(lateData, Q, r, b);
    
    const T = earlyResults.T;
    const S = earlyResults.S;
    const Sy = lateResults.S;
    const delayIndex = data[Math.floor(data.length / 2)].t;
    
    return {
        T,
        S,
        Sy,
        delayIndex,
        K: T / b,
        specificCapacity: Q / data[data.length - 1].s,
        method: 'Neuman'
    };
}

// Display results with unit conversion
function displayResults(results, method, b) {
    const lengthUnit = document.getElementById('lengthUnit').value;
    const timeUnit = document.getElementById('timeUnit').value;
    
    // Convert values to selected units for display
    const T_display = results.T ? convertFromBase(results.T, timeUnit, 'time') * convertFromBase(1, lengthUnit, 'length') : null;
    const K_display = results.K ? convertFromBase(results.K, timeUnit, 'time') * convertFromBase(1, lengthUnit, 'length') : null;
    const R_display = results.R ? convertFromBase(results.R, lengthUnit, 'length') : null;
    const SC_display = results.specificCapacity ? convertFromBase(results.specificCapacity, timeUnit, 'time') * convertFromBase(1, lengthUnit, 'length') : null;
    
    document.getElementById('transmisivity').textContent = 
        T_display ? T_display.toExponential(3) : '-';
    document.getElementById('storativity').textContent = 
        results.S ? (typeof results.S === 'number' ? results.S.toExponential(3) : results.S) : '-';
    document.getElementById('hydraulicConductivity').textContent = 
        K_display ? K_display.toExponential(3) : '-';
    document.getElementById('radiusInfluence').textContent = 
        R_display ? R_display.toFixed(1) : '-';
    document.getElementById('specificCapacity').textContent = 
        SC_display ? SC_display.toExponential(3) : '-';
    document.getElementById('skinFactor').textContent = 
        results.skinFactor ? results.skinFactor.toFixed(2) : '0.00';
    
    document.getElementById('stepResults').style.display = 
        method === 'step-drawdown' ? 'block' : 'none';
    document.getElementById('leakyResults').style.display = 
        method === 'hantush' ? 'block' : 'none';
    document.getElementById('fractureResults').style.display = 
        method === 'neuman' ? 'block' : 'none';
    
    if (method === 'step-drawdown' && results.stepData) {
        const tbody = document.querySelector('#stepTable tbody');
        tbody.innerHTML = '';
        results.stepData.forEach(step => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${step.step}</td>
                <td>${step.Q.toFixed(3)}</td>
                <td>${step.s.toFixed(2)}</td>
                <td>${results.B.toExponential(3)}</td>
                <td>${results.C.toExponential(3)}</td>
                <td>${results.n}</td>
            `;
            tbody.appendChild(row);
        });
    }
    
    if (method === 'hantush') {
        document.getElementById('leakageFactor').textContent = 
            results.leakageFactor ? results.leakageFactor.toFixed(1) : '-';
        document.getElementById('verticalHydraulicConductivity').textContent = 
            results.verticalK ? results.verticalK.toExponential(3) : '-';
    }
    
    generateInterpretation(results, method, b);
}

// Generate hydrogeological interpretation
function generateInterpretation(results, method, b) {
    let interpretation = '';
    let recommendations = '';
    const aquiferType = document.getElementById('aquiferType').value;
    
    if (results.T) {
        let productivity = '';
        if (results.T < 1e-4) productivity = 'Sangat Rendah';
        else if (results.T < 1e-3) productivity = 'Rendah';
        else if (results.T < 1e-2) productivity = 'Sedang';
        else if (results.T < 1e-1) productivity = 'Tinggi';
        else productivity = 'Sangat Tinggi';
        
        let aquiferTypeText = '';
        switch(aquiferType) {
            case 'confined':
                aquiferTypeText = 'Akuifer Tertekan (Confined)';
                break;
            case 'unconfined':
                aquiferTypeText = 'Akuifer Tidak Tertekan (Unconfined)';
                break;
            case 'leaky':
                aquiferTypeText = 'Akuifer Bocor (Leaky)';
                break;
            case 'fracture':
                aquiferTypeText = 'Akuifer Rekahan (Fractured)';
                break;
            default:
                aquiferTypeText = 'Tidak Diketahui';
        }
        
        let wellEfficiency = '';
        if (results.skinFactor > 0) {
            wellEfficiency = 'Sumur mengalami skin positif (kerusakan formasi)';
        } else if (results.skinFactor < 0) {
            wellEfficiency = 'Sumur mengalami skin negatif (stimulasi)';
        } else {
            wellEfficiency = 'Kondisi sumur ideal';
        }
        
        // Get barometric efficiency
        const be = parseFloat(document.getElementById('barometricEfficiency').value) || 0.8;
        const beType = document.getElementById('beType').value;
        const beValue = beType === 'percentage' ? be : be * 100;
        
        interpretation = `
            <p><strong>Klasifikasi Akuifer:</strong></p>
            <ul>
                <li>Produktivitas: ${productivity} (T = ${results.T.toExponential(3)} m²/s)</li>
                <li>Jenis: ${aquiferTypeText}</li>
                <li>Konduktivitas Hidraulik: ${results.K ? results.K.toExponential(3) + ' m/s' : '-'}</li>
                <li>Barometric Efficiency: ${beValue.toFixed(1)}%</li>
            </ul>
            
            <p><strong>Karakteristik Sumur:</strong></p>
            <ul>
                <li>Kapasitas Spesifik: ${results.specificCapacity ? results.specificCapacity.toExponential(3) + ' m²/s' : '-'}</li>
                <li>Skin Factor: ${results.skinFactor ? results.skinFactor.toFixed(2) : '0.00'} (${wellEfficiency})</li>
                <li>Radius of Influence: ${results.R ? results.R.toFixed(0) + ' m' : '-'}</li>
            </ul>
        `;
        
        if (results.T < 1e-3) {
            recommendations = `
                <p><strong>⚠️ Rekomendasi:</strong></p>
                <ul>
                    <li>Produktivitas rendah, pertimbangkan pengembangan dengan kapasitas terbatas</li>
                    <li>Jarak antar sumur minimal ${results.R ? Math.round(results.R * 1.5) : 200} m</li>
                    <li>Pertimbangkan aquifer storage and recovery (ASR) jika memungkinkan</li>
                </ul>
            `;
        } else if (results.T < 1e-2) {
            recommendations = `
                <p><strong>📋 Rekomendasi:</strong></p>
                <ul>
                    <li>Cocok untuk kebutuhan domestik dan irigasi skala kecil</li>
                    <li>Jarak antar sumur: ${results.R ? Math.round(results.R) : 150} - ${results.R ? Math.round(results.R * 1.5) : 250} m</li>
                    <li>Monitoring drawdown secara berkala diperlukan</li>
                </ul>
            `;
        } else {
            recommendations = `
                <p><strong>✅ Rekomendasi:</strong></p>
                <ul>
                    <li>Potensial untuk pengembangan air tanah skala besar</li>
                    <li>Jarak antar sumur: ${results.R ? Math.round(results.R) : 300} - ${results.R ? Math.round(results.R * 2) : 500} m</li>
                    <li>Disarankan studi dampak lingkungan sebelum eksploitasi besar</li>
                </ul>
            `;
        }
    } else if (results.B) {
        interpretation = `
            <p><strong>Step Drawdown Analysis:</strong></p>
            <ul>
                <li>Aquifer Loss Coefficient (B): ${results.B.toExponential(3)} s/m²</li>
                <li>Well Loss Coefficient (C): ${results.C.toExponential(3)} s²/m⁵</li>
                <li>Efisiensi Sumur: ${results.efficiency.toFixed(1)}%</li>
            </ul>
            
            <p><strong>Interpretasi Well Loss:</strong></p>
            <ul>
                <li>${results.C < 1 ? 'Well loss rendah - kondisi sumur baik' : 
                         results.C < 10 ? 'Well loss sedang - perlu pemeliharaan' : 
                         'Well loss tinggi - sumur perlu rehabilitasi'}</li>
                <li>${results.efficiency > 70 ? 'Efisiensi baik (>70%)' : 
                         results.efficiency > 50 ? 'Efisiensi sedang (50-70%)' : 
                         'Efisiensi rendah (<50%) - rehabilitasi diperlukan'}</li>
            </ul>
        `;
    }
    
    document.getElementById('hydrogeologicalInterpretation').innerHTML = interpretation;
    document.getElementById('recommendations').innerHTML = recommendations;
}

// Perform quality checks
function performQualityChecks(data, results, method) {
    const qualityDiv = document.getElementById('qualityChecks');
    let html = '<h3>Data Quality Assessment</h3>';
    
    const times = data.map(d => d.t);
    const logTimeSpan = Math.log10(Math.max(...times)) - Math.log10(Math.min(...times));
    
    html += '<table class="data-table">';
    html += '<tr><th>Parameter</th><th>Nilai</th><th>Kriteria</th><th>Status</th></tr>';
    
    html += '<tr>';
    html += '<td>Time Span (log cycles)</td>';
    html += `<td>${logTimeSpan.toFixed(2)}</td>`;
    html += '<td>>1.5 log cycles</td>';
    html += `<td style="color: ${logTimeSpan > 1.5 ? 'green' : 'orange'}">${logTimeSpan > 1.5 ? '✓' : '⚠️'}</td>`;
    html += '</tr>';
    
    html += '<tr>';
    html += '<td>Jumlah Data</td>';
    html += `<td>${data.length}</td>`;
    html += '<td>>=8</td>';
    html += `<td style="color: ${data.length >= 8 ? 'green' : 'orange'}">${data.length >= 8 ? '✓' : '⚠️'}</td>`;
    html += '</tr>';
    
    if (results.slope) {
        const logData = data.map(d => ({x: Math.log10(d.t), y: d.s}));
        const r2 = calculateR2(logData);
        html += '<tr>';
        html += '<td>R² (Linearitas)</td>';
        html += `<td>${r2.toFixed(3)}</td>`;
        html += '<td>>0.95</td>';
        html += `<td style="color: ${r2 > 0.95 ? 'green' : 'orange'}">${r2 > 0.95 ? '✓' : '⚠️'}</td>`;
        html += '</tr>';
    }
    
    if (results.residuals) {
        html += '<tr>';
        html += '<td>RMSE</td>';
        html += `<td>${results.rmse.toExponential(3)}</td>`;
        html += '<td>Minimal</td>';
        html += `<td>${results.rmse < 0.1 ? '✓' : '⚠️'}</td>`;
        html += '</tr>';
    }
    
    html += '</table>';
    
    html += '<div class="parameter-notes">';
    if (logTimeSpan < 1.5) {
        html += '<p>⚠️ Perpanjang durasi test untuk mendapatkan lebih dari 1.5 log cycle</p>';
    }
    if (data.length < 8) {
        html += '<p>⚠️ Tambah frekuensi pengukuran, minimal 8 titik data</p>';
    }
    html += '</div>';
    
    qualityDiv.innerHTML = html;
}

// Plot charts
function plotCharts(data, results, method, Q, r) {
    const ctxDrawdown = document.getElementById('drawdownChart').getContext('2d');
    const ctxDiagnostic = document.getElementById('diagnosticChart').getContext('2d');
    const ctxResidual = document.getElementById('residualChart').getContext('2d');
    
    if (chartDrawdown) chartDrawdown.destroy();
    if (chartDiagnostic) chartDiagnostic.destroy();
    if (chartResidual) chartResidual.destroy();
    
    const times = data.map(d => d.t);
    
    let theoretical = [];
    if (results.theoretical) {
        theoretical = results.theoretical;
    } else if (results.T && results.S) {
        theoretical = data.map(d => {
            const u = (r * r * results.S) / (4 * results.T * d.t);
            const W_u = wellFunction(u);
            return (Q / (4 * Math.PI * results.T)) * W_u;
        });
    }
    
    chartDrawdown = new Chart(ctxDrawdown, {
        type: 'scatter',
        data: {
            datasets: [{
                label: 'Data Lapangan',
                data: data.map(d => ({x: d.t, y: d.s})),
                backgroundColor: '#3498db',
                pointRadius: 6,
                pointHoverRadius: 8
            }, {
                label: 'Kurva Teoretis',
                data: times.map((t, i) => ({x: t, y: theoretical[i]})),
                type: 'line',
                borderColor: '#e74c3c',
                borderWidth: 2,
                pointRadius: 0,
                fill: false
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                title: {
                    display: true,
                    text: 'Drawdown vs Time (Log-Log)'
                },
                legend: {
                    position: 'top'
                }
            },
            scales: {
                x: {
                    type: 'logarithmic',
                    title: {
                        display: true,
                        text: 'Waktu (detik)'
                    }
                },
                y: {
                    type: 'logarithmic',
                    title: {
                        display: true,
                        text: 'Drawdown (meter)'
                    }
                }
            }
        }
    });
    
    chartDiagnostic = new Chart(ctxDiagnostic, {
        type: 'scatter',
        data: {
            datasets: [{
                label: 'Data Lapangan',
                data: data.map(d => ({x: Math.log10(d.t), y: d.s})),
                backgroundColor: '#2ecc71',
                pointRadius: 6,
                pointHoverRadius: 8
            }, {
                label: 'Regresi Linear',
                data: times.map(t => ({
                    x: Math.log10(t),
                    y: results.slope ? results.slope * Math.log10(t) + results.intercept : 0
                })),
                type: 'line',
                borderColor: '#f39c12',
                borderWidth: 2,
                pointRadius: 0,
                fill: false,
                borderDash: [5, 5]
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                title: {
                    display: true,
                    text: 'Diagnostic Plot (Semi-Log)'
                }
            },
            scales: {
                x: {
                    title: {
                        display: true,
                        text: 'log(Waktu)'
                    }
                },
                y: {
                    title: {
                        display: true,
                        text: 'Drawdown (meter)'
                    }
                }
            }
        }
    });
    
    if (theoretical.length > 0) {
        const residuals = data.map((d, i) => d.s - theoretical[i]);
        
        chartResidual = new Chart(ctxResidual, {
            type: 'bar',
            data: {
                labels: times.map(t => t.toFixed(0)),
                datasets: [{
                    label: 'Residual',
                    data: residuals,
                    backgroundColor: residuals.map(r => r >= 0 ? '#3498db' : '#e74c3c'),
                    borderColor: '#2c3e50',
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    title: {
                        display: true,
                        text: 'Residual Plot'
                    }
                },
                scales: {
                    x: {
                        title: {
                            display: true,
                            text: 'Waktu (detik)'
                        }
                    },
                    y: {
                        title: {
                            display: true,
                            text: 'Residual (m)'
                        }
                    }
                }
            }
        });
    }
}

// ==================== EXCEL IMPORT/EXPORT FUNCTIONS ====================

// Open import modal
function openImportModal() {
    document.getElementById('importModal').style.display = 'block';
    document.getElementById('previewArea').style.display = 'none';
    document.getElementById('importBtn').disabled = true;
}

// Close import modal
function closeImportModal() {
    document.getElementById('importModal').style.display = 'none';
    document.getElementById('fileInput').value = '';
    importedData = [];
}

// Download sample Excel template
function downloadSampleExcel() {
    const dataType = appState.dataType;
    const wb = XLSX.utils.book_new();
    
    if (dataType === 'waterlevel') {
        // Water level template
        const sampleData = [
            ['Waktu (detik)', 'Water Level (m)', 'Keterangan'],
            [60, 25.18, 'Data awal'],
            [120, 24.96, ''],
            [240, 24.72, ''],
            [480, 24.45, ''],
            [900, 24.18, ''],
            [1800, 23.86, ''],
            [2700, 23.65, ''],
            [3600, 23.48, ''],
            [5400, 23.25, ''],
            [7200, 23.08, 'Akhir test']
        ];
        
        const ws = XLSX.utils.aoa_to_sheet(sampleData);
        ws['!cols'] = [{wch: 15}, {wch: 15}, {wch: 20}];
        XLSX.utils.book_append_sheet(wb, ws, 'Water Level Data');
        
        // Add instructions sheet
        const instructions = [
            ['PETUNJUK PENGGUNAAN WATER LEVEL DATA'],
            [''],
            ['1. Kolom A: Waktu dalam detik'],
            ['2. Kolom B: Water level dalam meter (depth below reference)'],
            ['3. Kolom C: Keterangan (opsional)'],
            [''],
            ['Setelah import, masukkan Initial Water Level di panel input'],
            ['Rumus konversi: Drawdown = Initial Level - Water Level']
        ];
        
        const ws2 = XLSX.utils.aoa_to_sheet(instructions);
        XLSX.utils.book_append_sheet(wb, ws2, 'Instructions');
        
    } else {
        // Drawdown template
        const sampleData = [
            ['Waktu (detik)', 'Drawdown (m)', 'Keterangan'],
            [60, 0.32, 'Data awal'],
            [120, 0.54, ''],
            [240, 0.78, ''],
            [480, 1.05, ''],
            [900, 1.32, ''],
            [1800, 1.64, ''],
            [2700, 1.85, ''],
            [3600, 2.02, ''],
            [5400, 2.25, ''],
            [7200, 2.42, 'Akhir test']
        ];
        
        const ws = XLSX.utils.aoa_to_sheet(sampleData);
        ws['!cols'] = [{wch: 15}, {wch: 15}, {wch: 20}];
        XLSX.utils.book_append_sheet(wb, ws, 'Drawdown Data');
    }
    
    XLSX.writeFile(wb, `pumping_test_template_${dataType}.xlsx`);
}

// Handle file selection
function handleFileSelect(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    document.getElementById('progressBar').style.display = 'block';
    document.getElementById('progressFill').style.width = '30%';
    
    const reader = new FileReader();
    
    reader.onload = function(e) {
        document.getElementById('progressFill').style.width = '60%';
        
        try {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, {type: 'array'});
            
            const firstSheet = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[firstSheet];
            
            const jsonData = XLSX.utils.sheet_to_json(worksheet, {header: 1});
            
            document.getElementById('progressFill').style.width = '90%';
            
            processImportedData(jsonData);
            
        } catch (error) {
            alert('Error membaca file: ' + error.message);
            closeImportModal();
        }
    };
    
    reader.readAsArrayBuffer(file);
}

// Process imported data
function processImportedData(data) {
    if (data.length < 2) {
        alert('File tidak memiliki data yang cukup');
        return;
    }
    
    const skipHeader = document.getElementById('skipHeader').checked;
    const startRow = skipHeader ? 1 : 0;
    
    importedData = [];
    
    // Detect data type from header or values
    const firstRow = data[startRow] || [];
    const secondRow = data[startRow + 1] || [];
    
    let detectedType = appState.dataType; // default to current
    
    // Try to detect from header
    if (skipHeader) {
        const header = data[0] || [];
        const headerStr = header.join(' ').toLowerCase();
        if (headerStr.includes('water level') || headerStr.includes('wl') || headerStr.includes('muka air')) {
            detectedType = 'waterlevel';
        } else if (headerStr.includes('drawdown') || headerStr.includes('s')) {
            detectedType = 'drawdown';
        }
    }
    
    // Process based on detected type
    for (let i = startRow; i < data.length; i++) {
        const row = data[i];
        if (row.length < 2) continue;
        
        const time = parseFloat(row[0]);
        const value = parseFloat(row[1]);
        
        if (!isNaN(time) && !isNaN(value) && time > 0) {
            if (detectedType === 'waterlevel' && value > 0) {
                importedData.push({
                    t: time,
                    waterLevel: value,
                    note: row[2] || ''
                });
            } else if (value >= 0) {
                importedData.push({
                    t: time,
                    drawdown: value,
                    note: row[2] || ''
                });
            }
        }
    }
    
    // Update UI based on detected type
    if (detectedType !== appState.dataType) {
        if (confirm(`Data terdeteksi sebagai ${detectedType === 'waterlevel' ? 'Water Level' : 'Drawdown'}. Ubah tipe data input?`)) {
            document.getElementById('dataType').value = detectedType;
            handleDataTypeChange();
        }
    }
    
    showPreview(importedData, detectedType);
    
    document.getElementById('progressFill').style.width = '100%';
    setTimeout(() => {
        document.getElementById('progressBar').style.display = 'none';
        document.getElementById('progressFill').style.width = '0%';
    }, 500);
}

// Show preview of imported data
function showPreview(data, dataType) {
    if (data.length === 0) {
        alert('Tidak ada data valid ditemukan');
        return;
    }
    
    let html = '<table>';
    if (dataType === 'waterlevel') {
        html += '<tr><th>No</th><th>Waktu (s)</th><th>Water Level (m)</th><th>Keterangan</th></tr>';
    } else {
        html += '<tr><th>No</th><th>Waktu (s)</th><th>Drawdown (m)</th><th>Keterangan</th></tr>';
    }
    
    const previewData = data.slice(0, 10);
    
    previewData.forEach((item, index) => {
        if (dataType === 'waterlevel') {
            html += `<tr>
                <td>${index + 1}</td>
                <td>${item.t}</td>
                <td>${item.waterLevel.toFixed(3)}</td>
                <td>${item.note || '-'}</td>
            </tr>`;
        } else {
            html += `<tr>
                <td>${index + 1}</td>
                <td>${item.t}</td>
                <td>${item.drawdown.toFixed(3)}</td>
                <td>${item.note || '-'}</td>
            </tr>`;
        }
    });
    
    if (data.length > 10) {
        html += `<tr><td colspan="4" style="text-align: center;">... dan ${data.length - 10} data lainnya</td></tr>`;
    }
    
    html += '</table>';
    
    document.getElementById('previewTable').innerHTML = html;
    document.getElementById('previewArea').style.display = 'block';
    document.getElementById('importBtn').disabled = false;
}

// Import data to main table
function importData() {
    if (importedData.length === 0) {
        alert('Tidak ada data untuk diimport');
        return;
    }
    
    const validate = document.getElementById('validateData').checked;
    const dataType = appState.dataType;
    const lengthUnit = document.getElementById('lengthUnit').value;
    const timeUnit = document.getElementById('timeUnit').value;
    
    // Convert imported data to appropriate format
    let dataToImport = [];
    if (dataType === 'waterlevel') {
        dataToImport = importedData.map(item => ({
            t: item.t,
            val: item.waterLevel || item.drawdown
        }));
    } else {
        dataToImport = importedData.map(item => ({
            t: item.t,
            val: item.drawdown || (25.5 - item.waterLevel)
        }));
    }
    
    if (validate) {
        const validationErrors = validateImportedData(dataToImport, dataType);
        if (validationErrors.length > 0) {
            let errorMsg = 'Data tidak valid:\n';
            validationErrors.forEach(err => {
                errorMsg += `- ${err}\n`;
            });
            if (!confirm(errorMsg + '\nTetap import data?')) {
                return;
            }
        }
    }
    
    const overwrite = document.getElementById('overwriteData').checked;
    
    if (overwrite) {
        document.getElementById('tableBody').innerHTML = '';
    }
    
    dataToImport.forEach(item => {
        addDataRowWithValues(item.t, item.val);
    });
    
    updateDerivedValues();
    showValidationMessage(`Berhasil mengimport ${dataToImport.length} data points`, 'warning');
    closeImportModal();
}

// Add data row with values
function addDataRowWithValues(time, value) {
    const tbody = document.getElementById('tableBody');
    const row = document.createElement('tr');
    const rowNum = tbody.children.length + 1;
    const dataType = appState.dataType;
    const lengthUnit = document.getElementById('lengthUnit').value;
    const timeUnit = document.getElementById('timeUnit').value;
    
    if (dataType === 'waterlevel') {
        const initialLevel = parseFloat(document.getElementById('initialLevel').value) || 25.5;
        const drawdown = initialLevel - value;
        row.innerHTML = `
            <td>${rowNum}</td>
            <td><input type="number" step="any" class="time-input" value="${time}"></td>
            <td><input type="number" step="any" class="value-input water-level-input" value="${value.toFixed(3)}"></td>
            <td class="drawdown-display" style="color: #27ae60;">${drawdown.toFixed(3)}</td>
            <td class="log-cell">${Math.log10(time).toFixed(3)}</td>
        `;
    } else {
        row.innerHTML = `
            <td>${rowNum}</td>
            <td><input type="number" step="any" class="time-input" value="${time}"></td>
            <td><input type="number" step="any" class="value-input drawdown-input" value="${value.toFixed(3)}"></td>
            <td class="ratio-cell">${(time / value).toFixed(2)}</td>
            <td class="log-cell">${Math.log10(time).toFixed(3)}</td>
        `;
    }
    
    tbody.appendChild(row);
    
    row.querySelectorAll('input').forEach(input => {
        input.addEventListener('input', updateDerivedValues);
    });
}

// Validate imported data
function validateImportedData(data, dataType) {
    const errors = [];
    
    const negativeTime = data.filter(d => d.t <= 0);
    if (negativeTime.length > 0) {
        errors.push(`${negativeTime.length} data dengan waktu <= 0`);
    }
    
    const negativeValue = data.filter(d => d.val < 0);
    if (negativeValue.length > 0) {
        errors.push(`${negativeValue.length} data dengan nilai negatif`);
    }
    
    const values = data.map(d => d.val);
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const std = Math.sqrt(values.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / values.length);
    
    const outliers = data.filter(d => Math.abs(d.val - mean) > 3 * std);
    if (outliers.length > 0) {
        errors.push(`${outliers.length} data potensial outliers (>3σ)`);
    }
    
    for (let i = 1; i < data.length; i++) {
        if (data[i].t <= data[i-1].t) {
            errors.push(`Data tidak terurut berdasarkan waktu (baris ${i+1})`);
            break;
        }
    }
    
    return errors;
}

// Export data to Excel
function exportToExcel() {
    const rows = document.querySelectorAll('#tableBody tr');
    const dataType = appState.dataType;
    const lengthUnit = document.getElementById('lengthUnit').value;
    const timeUnit = document.getElementById('timeUnit').value;
    
    let exportData = [];
    if (dataType === 'waterlevel') {
        exportData = [[`Waktu (${timeUnit})`, `Water Level (${lengthUnit})`, `Drawdown (${lengthUnit})`, 'log(t)']];
    } else {
        exportData = [[`Waktu (${timeUnit})`, `Drawdown (${lengthUnit})`, 't/s', 'log(t)']];
    }
    
    rows.forEach(row => {
        const time = row.querySelector('.time-input')?.value;
        const value = row.querySelector('.value-input')?.value;
        
        if (time && value) {
            if (dataType === 'waterlevel') {
                const drawdownCell = row.querySelector('.drawdown-display');
                const drawdown = drawdownCell ? drawdownCell.textContent : '-';
                const logT = row.querySelector('.log-cell')?.textContent || '-';
                exportData.push([time, value, drawdown, logT]);
            } else {
                const ratio = row.querySelector('.ratio-cell')?.textContent || '-';
                const logT = row.querySelector('.log-cell')?.textContent || '-';
                exportData.push([time, value, ratio, logT]);
            }
        }
    });
    
    if (exportData.length < 2) {
        alert('Tidak ada data untuk diexport');
        return;
    }
    
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(exportData);
    
    ws['!cols'] = [
        {wch: 15},
        {wch: 15},
        {wch: 15},
        {wch: 12}
    ];
    
    XLSX.utils.book_append_sheet(wb, ws, 'Pumping Test Data');
    
    if (currentResults.T) {
        const resultsData = [
            ['Parameter', 'Nilai', 'Unit'],
            ['Metode', currentResults.method || '-', '-'],
            ['Transmisivitas (T)', currentResults.T ? convertFromBase(currentResults.T, timeUnit, 'time') * convertFromBase(1, lengthUnit, 'length') + '' : '-', `m²/${timeUnit}`],
            ['Storativitas (S)', currentResults.S ? (typeof currentResults.S === 'number' ? currentResults.S.toExponential(3) : currentResults.S) : '-', '-'],
            ['Konduktivitas K', currentResults.K ? convertFromBase(currentResults.K, timeUnit, 'time') * convertFromBase(1, lengthUnit, 'length') + '' : '-', `m/${timeUnit}`],
            ['Radius of Influence', currentResults.R ? convertFromBase(currentResults.R, lengthUnit, 'length').toFixed(1) : '-', lengthUnit],
            ['Kapasitas Spesifik', currentResults.specificCapacity ? convertFromBase(currentResults.specificCapacity, timeUnit, 'time') * convertFromBase(1, lengthUnit, 'length') + '' : '-', `m²/${timeUnit}`],
            ['Skin Factor', currentResults.skinFactor ? currentResults.skinFactor.toFixed(2) : '0', '-']
        ];
        
        const ws2 = XLSX.utils.aoa_to_sheet(resultsData);
        XLSX.utils.book_append_sheet(wb, ws2, 'Hasil Analisis');
    }
    
    const timestamp = new Date().toISOString().slice(0,19).replace(/:/g, '-');
    XLSX.writeFile(wb, `pumping_test_data_${dataType}_${timestamp}.xlsx`);
}

// ==================== REPORT GENERATION FUNCTIONS ====================

// Generate report preview in HTML with all project information
function generateReportPreview() {
    if (!currentResults.T) {
        showValidationMessage('Hitung parameter terlebih dahulu sebelum membuat laporan!', 'warning');
        return;
    }
    
    const reportContainer = document.getElementById('reportContainer');
    const projectName = document.getElementById('projectName').value || '-';
    const projectNo = document.getElementById('projectNo').value || '-';
    const client = document.getElementById('client').value || '-';
    const location = document.getElementById('location').value || '-';
    const wellId = document.getElementById('wellId').value || '-';
    const analyst = document.getElementById('analyst').value || '-';
    const testDate = document.getElementById('testDate').value || '-';
    const testTime = document.getElementById('testTime').value || '-';
    const method = document.getElementById('method').value;
    const aquiferType = document.getElementById('aquiferType').value;
    const lengthUnit = document.getElementById('lengthUnit').value;
    const timeUnit = document.getElementById('timeUnit').value;
    
    const Q = parseFloat(document.getElementById('discharge').value) || 0;
    const r = parseFloat(document.getElementById('distance').value) || 0;
    const b = parseFloat(document.getElementById('thickness').value) || 0;
    const rw = parseFloat(document.getElementById('wellRadius').value) || 0;
    const wellDepth = parseFloat(document.getElementById('wellDepth').value) || 0;
    const casingRadius = parseFloat(document.getElementById('casingRadius').value) || 0;
    const screenLength = parseFloat(document.getElementById('screenLength').value) || 0;
    
    // Format method name for display
    const methodNames = {
        'cooper-jacob': 'Cooper-Jacob (Late Time)',
        'theis': 'Theis (Curve Matching)',
        'recovery': 'Recovery Test',
        'step-drawdown': 'Step Drawdown Test',
        'hantush': 'Hantush (Leaky Aquifer)',
        'neuman': 'Neuman (Unconfined)'
    };
    
    const aquiferNames = {
        'unknown': 'Unknown',
        'confined': 'Confined (Tertekan)',
        'unconfined': 'Unconfined (Tidak Tertekan)',
        'leaky': 'Leaky (Bocor)',
        'fracture': 'Fracture (Rekahan)'
    };
    
    // Get interpretation text
    const interpretation = document.getElementById('hydrogeologicalInterpretation').innerHTML;
    const recommendations = document.getElementById('recommendations').innerHTML;
    
    // Get data statistics
    const data = currentData || [];
    const dataPoints = data.length;
    const duration = data.length > 0 ? convertFromBase(Math.max(...data.map(d => d.t)), timeUnit, 'time') : 0;
    const maxDrawdown = data.length > 0 ? convertFromBase(Math.max(...data.map(d => d.s)), lengthUnit, 'length') : 0;
    
    // Format date
    const formattedDate = testDate !== '-' ? new Date(testDate).toLocaleDateString('id-ID', {
        day: 'numeric',
        month: 'long',
        year: 'numeric'
    }) : '-';
    
    // Get barometric efficiency
    const be = parseFloat(document.getElementById('barometricEfficiency').value) || 0.8;
    const beType = document.getElementById('beType').value;
    const beValue = beType === 'percentage' ? be : be * 100;
    
    // Generate wells table HTML
    let wellsTableHTML = '<table class="report-table" style="width:100%; border-collapse:collapse;">';
    wellsTableHTML += '<tr style="background:#3498db; color:white;"><th>Nama</th><th>Tipe</th><th>Easting</th><th>Northing</th><th>Zone</th><th>Kedalaman</th><th>Drawdown</th></tr>';
    
    if (wells.length > 0) {
        wells.forEach(well => {
            wellsTableHTML += `<tr>
                <td>${well.name}</td>
                <td>${well.type}</td>
                <td>${well.easting}</td>
                <td>${well.northing}</td>
                <td>${well.zone}S</td>
                <td>${well.depth ? well.depth + ' m' : '-'}</td>
                <td style="color:#e74c3c; font-weight:bold;">${well.drawdown ? well.drawdown.toFixed(2) + ' m' : '-'}</td>
            </tr>`;
        });
    } else {
        wellsTableHTML += '<tr><td colspan="7" style="text-align:center;">Tidak ada data sumur</td></tr>';
    }
    wellsTableHTML += '</table>';
    
    // Build report HTML
    const reportHTML = `
        <div class="report-header">
            <div class="report-title">LAPORAN ANALISIS PUMPING TEST</div>
            <div class="report-subtitle">Hydrogeological Pumping Test Analysis Report</div>
        </div>
        
        <div class="report-section">
            <div class="report-section-title">A. INFORMASI PROYEK</div>
            <table class="report-table">
                <tr><td>Nama Proyek</td><td>${projectName}</td></tr>
                <tr><td>Nomor Proyek</td><td>${projectNo}</td></tr>
                <tr><td>Klien</td><td>${client}</td></tr>
                <tr><td>Lokasi</td><td>${location}</td></tr>
            </table>
        </div>
        
        <div class="report-section">
            <div class="report-section-title">B. INFORMASI SUMUR</div>
            <table class="report-table">
                <tr><td>Well ID / Nama</td><td>${wellId}</td></tr>
                <tr><td>Analis</td><td>${analyst}</td></tr>
                <tr><td>Tanggal Pengujian</td><td>${formattedDate} ${testTime}</td></tr>
                <tr><td>Jari-jari Sumur (rw)</td><td>${rw} m</td></tr>
                <tr><td>Kedalaman Sumur</td><td>${wellDepth} m</td></tr>
                <tr><td>Jari-jari Casing</td><td>${casingRadius} m</td></tr>
                <tr><td>Panjang Screen</td><td>${screenLength} m</td></tr>
            </table>
        </div>
        
        <div class="report-section">
            <div class="report-section-title">C. PARAMETER PENGUJIAN</div>
            <table class="report-table">
                <tr><td>Metode Analisis</td><td>${methodNames[method] || method}</td></tr>
                <tr><td>Jenis Akuifer</td><td>${aquiferNames[aquiferType] || aquiferType}</td></tr>
                <tr><td>Debit Pompa (Q)</td><td>${Q.toFixed(3)} m³/s</td></tr>
                <tr><td>Jarak Observasi (r)</td><td>${r.toFixed(1)} m</td></tr>
                <tr><td>Tebal Akuifer (b)</td><td>${b.toFixed(1)} m</td></tr>
                <tr><td>Barometric Efficiency (BE)</td><td>${beValue.toFixed(1)}%</td></tr>
                <tr><td>Jumlah Data Points</td><td>${dataPoints}</td></tr>
                <tr><td>Durasi Pengujian</td><td>${duration.toFixed(1)} ${timeUnit}</td></tr>
                <tr><td>Drawdown Maksimum</td><td>${maxDrawdown.toFixed(2)} ${lengthUnit}</td></tr>
            </table>
        </div>
        
        <div class="report-section">
            <div class="report-section-title">D. HASIL ANALISIS PARAMETER AKUIFER</div>
            <table class="report-table">
                <tr><td>Transmisivitas (T)</td><td>${currentResults.T ? convertFromBase(currentResults.T, timeUnit, 'time') * convertFromBase(1, lengthUnit, 'length') + ' ' + lengthUnit + '²/' + timeUnit : '-'}</td></tr>
                <tr><td>Storativitas (S)</td><td>${currentResults.S ? (typeof currentResults.S === 'number' ? currentResults.S.toExponential(3) : currentResults.S) : '-'}</td></tr>
                <tr><td>Konduktivitas Hidraulik (K)</td><td>${currentResults.K ? convertFromBase(currentResults.K, timeUnit, 'time') * convertFromBase(1, lengthUnit, 'length') + ' ' + lengthUnit + '/' + timeUnit : '-'}</td></tr>
                <tr><td>Radius of Influence (R)</td><td>${currentResults.R ? convertFromBase(currentResults.R, lengthUnit, 'length').toFixed(0) + ' ' + lengthUnit : '-'}</td></tr>
                <tr><td>Kapasitas Spesifik</td><td>${currentResults.specificCapacity ? convertFromBase(currentResults.specificCapacity, timeUnit, 'time') * convertFromBase(1, lengthUnit, 'length') + ' ' + lengthUnit + '²/' + timeUnit : '-'}</td></tr>
                <tr><td>Skin Factor</td><td>${currentResults.skinFactor ? currentResults.skinFactor.toFixed(2) : '0.00'}</td></tr>
            </table>
        </div>
        
        <div class="report-section">
            <div class="report-section-title">E. LOKASI DAN INFORMASI SUMUR</div>
            <div id="map-placeholder" style="width:100%; height:300px; background:#f5f5f5; border-radius:8px; margin-bottom:20px; display:flex; align-items:center; justify-content:center; color:#7f8c8d;">
                <p>🔄 Peta akan dirender saat download PDF...</p>
            </div>
            <h4 style="margin-top:20px; margin-bottom:10px;">Daftar Sumur:</h4>
            ${wellsTableHTML}
        </div>
        
        <div class="report-section">
            <div class="report-section-title">F. INTERPRETASI HIDROGEOLOGI</div>
            <div style="padding: 10px; background: #f8f9fa; border-radius: 5px;">
                ${interpretation}
            </div>
        </div>
        
        <div class="report-section">
            <div class="report-section-title">G. REKOMENDASI</div>
            <div style="padding: 10px; background: #d4edda; border-radius: 5px;">
                ${recommendations || '<p>Tidak ada rekomendasi khusus.</p>'}
            </div>
        </div>
        
        <div class="report-signature">
            <div>
                <div>Analis,</div>
                <div class="report-signature-line">${analyst}</div>
            </div>
            <div>
                <div>Mengetahui,</div>
                <div class="report-signature-line">(Kepala Laboratorium)</div>
            </div>
        </div>
        
        <div class="report-footer">
            <p>Laporan ini dihasilkan secara otomatis oleh HydroGeolysis Pro v2.0 pada ${new Date().toLocaleDateString('id-ID')}</p>
            <p>Validated by Senior Hydrogeologist</p>
        </div>
    `;
    
    reportContainer.innerHTML = reportHTML;
    showValidationMessage('Preview laporan berhasil digenerate!', 'warning');
}

// Download PDF Report with map screenshot
async function downloadPDF() {
    if (!currentResults.T) {
        showValidationMessage('Hitung parameter terlebih dahulu sebelum mendownload PDF!', 'error');
        return;
    }
    
    showValidationMessage('Menyiapkan PDF...', 'warning');
    
    try {
        // Generate preview first
        generateReportPreview();
        
        // Create a temporary map container
        const tempMapDiv = document.createElement('div');
        tempMapDiv.id = 'temp-report-map';
        tempMapDiv.style.width = '600px';
        tempMapDiv.style.height = '300px';
        tempMapDiv.style.position = 'absolute';
        tempMapDiv.style.left = '-9999px';
        tempMapDiv.style.top = '-9999px';
        document.body.appendChild(tempMapDiv);
        
        // Initialize temporary map
        const tempMap = L.map('temp-report-map').setView([-2.5, 118.0], 5);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap contributors'
        }).addTo(tempMap);
        
        // Add wells to temporary map
        if (wells.length > 0) {
            wells.forEach(well => {
                const latLng = utmToLatLng(well.easting, well.northing, well.zone);
                if (latLng) {
                    const colors = {
                        pumping: '#e74c3c',
                        observation: '#3498db',
                        piezometer: '#f39c12'
                    };
                    
                    L.circleMarker([latLng.lat, latLng.lng], {
                        radius: 8,
                        color: colors[well.type] || '#95a5a6',
                        weight: 2,
                        opacity: 1,
                        fillColor: colors[well.type] || '#95a5a6',
                        fillOpacity: 0.8
                    }).addTo(tempMap).bindPopup(well.name);
                }
            });
            
            // Fit bounds
            const bounds = L.latLngBounds([]);
            wells.forEach(well => {
                if (well.latLng) {
                    bounds.extend([well.latLng.lat, well.latLng.lng]);
                }
            });
            if (bounds.isValid()) {
                tempMap.fitBounds(bounds, { padding: [50, 50] });
            }
        }
        
        // Wait for map tiles to load
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Capture map as canvas
        const mapCanvas = await html2canvas(tempMapDiv, {
            scale: 2,
            backgroundColor: '#ffffff',
            logging: false,
            allowTaint: true,
            useCORS: true
        });
        
        // Remove temporary map
        document.body.removeChild(tempMapDiv);
        
        // Get the report container
        const reportContainer = document.getElementById('reportContainer');
        
        // Replace placeholder with actual map image
        const mapPlaceholder = reportContainer.querySelector('#map-placeholder');
        if (mapPlaceholder) {
            const mapImg = document.createElement('img');
            mapImg.src = mapCanvas.toDataURL('image/png');
            mapImg.style.width = '100%';
            mapImg.style.height = 'auto';
            mapImg.style.borderRadius = '8px';
            mapImg.style.border = '1px solid #e0e0e0';
            mapPlaceholder.parentNode.replaceChild(mapImg, mapPlaceholder);
        }
        
        // Capture full report
        const reportCanvas = await html2canvas(reportContainer, {
            scale: 2,
            backgroundColor: '#ffffff',
            logging: false,
            allowTaint: true,
            useCORS: true
        });
        
        // Create PDF
        const { jsPDF } = window.jspdf;
        const pdf = new jsPDF({
            orientation: 'portrait',
            unit: 'mm',
            format: 'a4'
        });
        
        const imgData = reportCanvas.toDataURL('image/png');
        const imgWidth = 210; // A4 width in mm
        const imgHeight = (reportCanvas.height * imgWidth) / reportCanvas.width;
        
        // Handle multi-page if needed
        let heightLeft = imgHeight;
        let position = 0;
        
        pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
        heightLeft -= pdf.internal.pageSize.height;
        
        while (heightLeft > 0) {
            position = heightLeft - imgHeight;
            pdf.addPage();
            pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
            heightLeft -= pdf.internal.pageSize.height;
        }
        
        // Get project name for filename
        const projectName = document.getElementById('projectName').value || 'Pumping_Test';
        const timestamp = new Date().toISOString().slice(0,10);
        
        // Save PDF
        pdf.save(`Laporan_Pumping_Test_${projectName}_${timestamp}.pdf`);
        
        // Restore preview
        generateReportPreview();
        
        showValidationMessage('PDF berhasil didownload!', 'warning');
        
    } catch (error) {
        console.error('Error generating PDF:', error);
        showValidationMessage('Error generating PDF: ' + error.message, 'error');
    }
}

// ==================== MAP FUNCTIONS ====================

// Initialize map
function initMap() {
    if (mapInitialized) return;
    
    // Default center: Indonesia
    map = L.map('map').setView([-2.5, 118.0], 5);
    
    // Add tile layer (OpenStreetMap)
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors',
        maxZoom: 19
    }).addTo(map);
    
    // Add scale bar
    L.control.scale({ imperial: false, metric: true }).addTo(map);
    
    mapInitialized = true;
    
    // Load sample wells
    loadSampleWells();
}

// Load sample wells for demonstration
function loadSampleWells() {
    const sampleWells = [
        {
            id: 1,
            name: 'PW-01',
            easting: 789123,
            northing: 945678,
            zone: 50,
            type: 'pumping',
            depth: 85,
            drawdown: 2.45
        },
        {
            id: 2,
            name: 'OW-01',
            easting: 789223,
            northing: 945778,
            zone: 50,
            type: 'observation',
            depth: 82,
            drawdown: 1.82
        },
        {
            id: 3,
            name: 'OW-02',
            easting: 789023,
            northing: 945878,
            zone: 50,
            type: 'observation',
            depth: 83,
            drawdown: 1.25
        },
        {
            id: 4,
            name: 'PZ-01',
            easting: 789323,
            northing: 945978,
            zone: 50,
            type: 'piezometer',
            depth: 45,
            drawdown: 0.85
        }
    ];
    
    wells = sampleWells;
    wells.forEach(well => addWellToMap(well));
    updateWellsList();
    fitMapToBounds();
}

// Convert UTM to LatLng
function utmToLatLng(easting, northing, zone) {
    try {
        // UTM projection string for South hemisphere
        const utm = `+proj=utm +zone=${zone} +south +ellps=WGS84 +datum=WGS84 +units=m +no_defs`;
        const wgs84 = '+proj=longlat +ellps=WGS84 +datum=WGS84 +no_defs';
        
        const [lng, lat] = proj4(utm, wgs84, [easting, northing]);
        return { lat, lng };
    } catch (error) {
        console.error('Error converting coordinates:', error);
        showValidationMessage('Error konversi koordinat: ' + error.message, 'error');
        return null;
    }
}

// Get marker icon based on well type and drawdown
function getWellIcon(well) {
    const colors = {
        pumping: '#e74c3c',
        observation: '#3498db',
        piezometer: '#f39c12'
    };
    
    // Size based on drawdown (if available)
    const drawdown = well.drawdown || 0;
    const size = Math.min(40, Math.max(25, 25 + drawdown * 3));
    
    return L.divIcon({
        html: `<div style="
            background: ${colors[well.type] || '#95a5a6'};
            width: ${size}px;
            height: ${size}px;
            border-radius: 50%;
            border: 3px solid white;
            box-shadow: 0 2px 10px rgba(0,0,0,0.3);
            display: flex;
            align-items: center;
            justify-content: center;
            color: white;
            font-weight: bold;
            font-size: ${size > 30 ? '12px' : '10px'};
            transition: all 0.3s;
        ">${drawdown ? drawdown.toFixed(1) : ''}</div>`,
        className: 'custom-marker',
        iconSize: [size, size],
        popupAnchor: [0, -size/2]
    });
}

// Add well to map
function addWellToMap(well) {
    if (!map) initMap();
    
    const latLng = utmToLatLng(well.easting, well.northing, well.zone);
    if (!latLng) return null;
    
    // Store latLng in well object for later use
    well.latLng = latLng;
    
    // Create popup content
    const popupContent = `
        <div style="min-width: 200px;">
            <b style="font-size: 16px; color: #2c3e50;">${well.name}</b><br>
            <hr style="margin: 5px 0;">
            <table style="width: 100%; border-collapse: collapse;">
                <tr><td style="padding: 3px 0;">Tipe:</td><td style="font-weight: bold;">${well.type}</td></tr>
                <tr><td style="padding: 3px 0;">Easting:</td><td>${well.easting} m</td></tr>
                <tr><td style="padding: 3px 0;">Northing:</td><td>${well.northing} m</td></tr>
                <tr><td style="padding: 3px 0;">Zone:</td><td>UTM ${well.zone}S</td></tr>
                <tr><td style="padding: 3px 0;">Kedalaman:</td><td>${well.depth || '-'} m</td></tr>
                <tr><td style="padding: 3px 0;">Drawdown:</td><td style="color: #e74c3c; font-weight: bold;">${well.drawdown ? well.drawdown.toFixed(2) + ' m' : '-'}</td></tr>
            </table>
            <hr style="margin: 5px 0;">
            <div style="display: flex; gap: 5px; justify-content: flex-end;">
                <button onclick="zoomToWell(${well.id})" style="padding: 3px 8px; background: #3498db; color: white; border: none; border-radius: 3px; cursor: pointer;">🔍 Zoom</button>
                <button onclick="deleteWell(${well.id})" style="padding: 3px 8px; background: #e74c3c; color: white; border: none; border-radius: 3px; cursor: pointer;">🗑️ Hapus</button>
            </div>
        </div>
    `;
    
    // Create marker
    const marker = L.marker([latLng.lat, latLng.lng], {
        icon: getWellIcon(well),
        riseOnHover: true
    }).addTo(map);
    
    marker.bindPopup(popupContent);
    
    // Store marker reference
    well.marker = marker;
    
    return marker;
}

// Add new well from form
function addWellLocation() {
    const easting = parseFloat(document.getElementById('easting').value);
    const northing = parseFloat(document.getElementById('northing').value);
    const zone = document.getElementById('utmZone').value;
    const type = document.getElementById('wellType').value;
    const name = document.getElementById('wellName').value || `Well-${wells.length + 1}`;
    const depth = parseFloat(document.getElementById('wellDepth').value) || 0;
    
    if (!easting || !northing) {
        showValidationMessage('Masukkan koordinat easting dan northing!', 'error');
        return;
    }
    
    // Validate coordinates range
    if (easting < 100000 || easting > 1000000 || northing < 8000000 || northing > 10000000) {
        if (!confirm('Koordinat di luar rentang normal UTM untuk Indonesia. Tetap lanjutkan?')) {
            return;
        }
    }
    
    const well = {
        id: Date.now(),
        name: name,
        easting: easting,
        northing: northing,
        zone: parseInt(zone),
        type: type,
        depth: depth,
        drawdown: currentResults?.T ? currentResults.specificCapacity : null
    };
    
    wells.push(well);
    addWellToMap(well);
    updateWellsList();
    
    // Zoom to new well
    const latLng = utmToLatLng(easting, northing, zone);
    if (latLng) {
        map.setView([latLng.lat, latLng.lng], 15);
    }
    
    // Clear form
    document.getElementById('easting').value = '';
    document.getElementById('northing').value = '';
    document.getElementById('wellName').value = '';
    document.getElementById('wellDepth').value = '';
    
    showValidationMessage(`Sumur ${name} berhasil ditambahkan!`, 'warning');
}

// Update wells list in table
function updateWellsList() {
    const tbody = document.getElementById('wellsBody');
    if (!tbody) return;
    
    tbody.innerHTML = '';
    
    wells.forEach(well => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td><strong>${well.name}</strong></td>
            <td>${well.easting.toLocaleString()}</td>
            <td>${well.northing.toLocaleString()}</td>
            <td>${well.zone}S</td>
            <td>${well.type}</td>
            <td>${well.depth ? well.depth + ' m' : '-'}</td>
            <td style="color: ${well.drawdown ? '#e74c3c' : '#7f8c8d'}; font-weight: bold;">
                ${well.drawdown ? well.drawdown.toFixed(2) + ' m' : '-'}
            </td>
            <td>
                <button onclick="zoomToWell(${well.id})" class="btn-small">🔍</button>
                <button onclick="deleteWell(${well.id})" class="btn-small btn-danger">🗑️</button>
            </td>
        `;
        tbody.appendChild(row);
    });
}

// Zoom to specific well
function zoomToWell(wellId) {
    const well = wells.find(w => w.id === wellId);
    if (!well || !well.latLng) return;
    
    map.setView([well.latLng.lat, well.latLng.lng], 18);
    if (well.marker) {
        well.marker.openPopup();
    }
}

// Delete well
function deleteWell(wellId) {
    if (!confirm('Hapus sumur ini dari peta?')) return;
    
    const index = wells.findIndex(w => w.id === wellId);
    if (index > -1) {
        if (wells[index].marker) {
            map.removeLayer(wells[index].marker);
        }
        wells.splice(index, 1);
        updateWellsList();
        showValidationMessage('Sumur berhasil dihapus', 'warning');
    }
}

// Clear all wells
function clearAllWells() {
    if (!confirm('Hapus semua sumur dari peta?')) return;
    
    if (map) {
        wells.forEach(well => {
            if (well.marker) {
                map.removeLayer(well.marker);
            }
        });
    }
    
    wells = [];
    updateWellsList();
    
    if (map) {
        map.setView([-2.5, 118.0], 5);
    }
    
    showValidationMessage('Semua sumur telah dihapus', 'warning');
}

// Fit map to show all wells
function fitMapToBounds() {
    if (!map) return;
    
    if (wells.length === 0) {
        map.setView([-2.5, 118.0], 5);
        return;
    }
    
    const bounds = L.latLngBounds([]);
    wells.forEach(well => {
        if (well.latLng) {
            bounds.extend([well.latLng.lat, well.latLng.lng]);
        }
    });
    
    if (bounds.isValid()) {
        map.fitBounds(bounds, { padding: [50, 50] });
    }
}

// Export to KML (Google Earth)
function exportToKML() {
    if (wells.length === 0) {
        showValidationMessage('Tidak ada sumur untuk diexport!', 'error');
        return;
    }
    
    let kml = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
<Document>
    <name>Pumping Test Wells</name>
    <description>Exported from HydroGeolysis Pro</description>
    
    <Style id="pumpingWell">
        <IconStyle>
            <color>ff0000ff</color>
            <scale>1.2</scale>
            <Icon>
                <href>http://maps.google.com/mapfiles/kml/paddle/red-circle.png</href>
            </Icon>
        </IconStyle>
    </Style>
    
    <Style id="observationWell">
        <IconStyle>
            <color>ffff0000</color>
            <scale>1.0</scale>
            <Icon>
                <href>http://maps.google.com/mapfiles/kml/paddle/blue-circle.png</href>
            </Icon>
        </IconStyle>
    </Style>
    
    <Style id="piezometer">
        <IconStyle>
            <color>ff00aaff</color>
            <scale>0.8</scale>
            <Icon>
                <href>http://maps.google.com/mapfiles/kml/paddle/ylw-circle.png</href>
            </Icon>
        </IconStyle>
    </Style>`;
    
    wells.forEach(well => {
        const latLng = utmToLatLng(well.easting, well.northing, well.zone);
        if (!latLng) return;
        
        const styleUrl = well.type === 'pumping' ? 'pumpingWell' : 
                        well.type === 'observation' ? 'observationWell' : 'piezometer';
        
        kml += `
    <Placemark>
        <name>${well.name}</name>
        <description>
            <![CDATA[
                <b>${well.name}</b><br>
                Type: ${well.type}<br>
                Easting: ${well.easting} m<br>
                Northing: ${well.northing} m<br>
                Zone: UTM ${well.zone}S<br>
                Depth: ${well.depth || '-'} m<br>
                Drawdown: ${well.drawdown ? well.drawdown.toFixed(2) + ' m' : '-'}
            ]]>
        </description>
        <styleUrl>#${styleUrl}</styleUrl>
        <Point>
            <coordinates>${latLng.lng},${latLng.lat},0</coordinates>
        </Point>
    </Placemark>`;
    });
    
    kml += `\n</Document>\n</kml>`;
    
    // Download KML file
    const blob = new Blob([kml], { type: 'application/vnd.google-earth.kml+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pumping_test_wells_${new Date().toISOString().slice(0,10)}.kml`;
    a.click();
    
    showValidationMessage(`Berhasil export ${wells.length} sumur ke KML`, 'warning');
}

// ==================== CLOSE MODAL FUNCTION ====================
window.onclick = function(event) {
    const modal = document.getElementById('importModal');
    if (event.target == modal) {
        closeImportModal();
    }
};