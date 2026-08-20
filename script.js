const CURRENCIES = {
    'GH₵': 'Ghana Cedis (GHS)',
    '₵': 'Ghana Cedis (GHS)',
    '$': 'US Dollar (USD)',
    '€': 'Euro (EUR)',
    '£': 'British Pound (GBP)',
    '₦': 'Nigerian Naira (NGN)'
};

const STORAGE_KEYS = {
    current: 'invoiceData',
    history: 'invoiceHistory',
    prefix: 'invoicePrefix',
    deviceId: 'invoiceDeviceId',
    lastDate: 'invoiceLastDate',
    dailySeq: 'invoiceDailySeq',
    logo: 'invoiceLogo',
    businessInfo: 'invoiceBusinessInfo',
    defaultManagerSig: 'defaultManagerSignature',
    productCatalog: 'invoiceProductCatalog',
    paperSize: 'invoicePaperSize'
};

function getPaperSize() {
    const el = document.getElementById('paper-size-select');
    return el ? el.value : '10cm';
}

let currentInvoiceNumber = null;
let currentDiscountType = 'percent'; // 'percent' or 'fixed'
let currentPaymentStatus = 'PAID'; // 'PAID', 'PENDING', 'UNPAID'
let currentManagerSig = null;
let currentCustomerSig = null;

// Signature Modal State
let currentSigTarget = 'manager'; // 'manager' or 'customer'
let activeSigTab = 'draw';
let selectedTypeInkColor = '#032e22';
let selectedInkColor = '#032e22';
let isDrawing = false;
let uploadedSigDataUrl = null;
let selectedFontFamily = "'Mrs Saint Delafield', cursive";
let selectedFontScale = 1.35;
let selectedFontSlant = 0.08;
let selectedSigFormat = 'full';

// QR Sync Modal State
let qrActiveTab = 'show';
let qrMediaStream = null;
let qrScanInterval = null;

document.addEventListener('DOMContentLoaded', () => {
    const isFirstLaunch = !localStorage.getItem(STORAGE_KEYS.deviceId);
    restoreLogo();
    restoreBusinessInfo();
    updateTerminalDisplay();
    initSignaturePad();
    bindEvents();
    setCurrentDateTime();
    loadState();
    initReportsEvents();
    if (isFirstLaunch) openFirstTimeSetup();
});

function addNewItemAndFocus() {
    addItemRow('', '', '');
    const rows = document.querySelectorAll('#invoice-items tr');
    if (rows.length > 0) {
        const lastRow = rows[rows.length - 1];
        const nextDesc = lastRow.querySelector('.table-desc-input');
        if (nextDesc) {
            nextDesc.focus();
            nextDesc.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
    }
}

function bindEvents() {
    const addItemBtn = document.getElementById('add-item-btn');
    if (addItemBtn) addItemBtn.addEventListener('click', addNewItemAndFocus);
    const tableAddBtn = document.getElementById('table-add-item-btn');
    if (tableAddBtn) tableAddBtn.addEventListener('click', addNewItemAndFocus);
    document.getElementById('print-btn').addEventListener('click', printInvoice);
    document.getElementById('save-btn').addEventListener('click', saveToHistory);
    document.getElementById('new-btn').addEventListener('click', () => newInvoice(true));
    document.getElementById('export-csv-btn').addEventListener('click', exportToCSV);
    
    const exportHistBtn = document.getElementById('export-history-btn');
    if (exportHistBtn) exportHistBtn.addEventListener('click', exportToCSV);

    document.getElementById('save-file-btn').addEventListener('click', saveFullBackup);
    document.getElementById('load-file-btn').addEventListener('click', () => document.getElementById('file-input').click());
    document.getElementById('file-input').addEventListener('change', loadFromFile);

    // Smart History Merge from another device
    const mergeBtn = document.getElementById('merge-file-btn');
    if (mergeBtn) mergeBtn.addEventListener('click', () => document.getElementById('merge-file-input').click());
    const histMergeBtn = document.getElementById('history-merge-btn');
    if (histMergeBtn) histMergeBtn.addEventListener('click', () => document.getElementById('merge-file-input').click());
    const mergeInput = document.getElementById('merge-file-input');
    if (mergeInput) mergeInput.addEventListener('change', mergeFromFile);

    // Offline QR Sync
    const syncQrBtn = document.getElementById('sync-qr-btn');
    if (syncQrBtn) syncQrBtn.addEventListener('click', () => openQRModal());
    const histQrBtn = document.getElementById('history-qr-btn');
    if (histQrBtn) histQrBtn.addEventListener('click', () => openQRModal());

    document.getElementById('currency').addEventListener('change', () => {
        updateTableHeaders();
        updateDiscountTypeDisplay();
        updateTotal();
    });

    const paperSelect = document.getElementById('paper-size-select');
    if (paperSelect) {
        paperSelect.addEventListener('change', () => {
            const size = paperSelect.value;
            localStorage.setItem(STORAGE_KEYS.paperSize, size);
            updatePaperSizeLayout();
            saveState();
        });
    }
    
    document.getElementById('discount-input').addEventListener('input', updateTotal);
    document.getElementById('discount-type-btn').addEventListener('click', toggleDiscountType);
    document.getElementById('vat-input').addEventListener('input', updateTotal);
    
    document.getElementById('customer-name').addEventListener('input', saveState);
    document.getElementById('customer-phone').addEventListener('input', saveState);
    document.getElementById('cashier-input').addEventListener('input', saveState);
    
    const payMethodSelect = document.getElementById('payment-method');
    payMethodSelect.addEventListener('change', (e) => {
        const printLabel = document.getElementById('payment-method-print');
        if (printLabel) printLabel.textContent = e.target.value;
        saveState();
    });

    const statusBadge = document.getElementById('payment-status-badge');
    statusBadge.addEventListener('click', togglePaymentStatus);

    // Terminal & Numbering Setup Modal Triggers (Replaces browser prompt)
    document.getElementById('edit-prefix-btn').addEventListener('click', openTerminalModal);
    document.getElementById('invoice-number').addEventListener('click', openTerminalModal);
    const editTermBtn = document.getElementById('edit-terminal-btn');
    if (editTermBtn) editTermBtn.addEventListener('click', openTerminalModal);
    const termBadge = document.getElementById('terminal-badge');
    if (termBadge) termBadge.addEventListener('click', openTerminalModal);

    // Terminal Modal Events
    initTerminalModalEvents();

    // QR Modal Events
    initQRModalEvents();

    // Editable Business Contact Info
    ['biz-address', 'biz-phone', 'biz-email'].forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.addEventListener('input', saveBusinessInfo);
            el.addEventListener('blur', saveBusinessInfo);
        }
    });

    // Logo Area
    document.getElementById('logo-area').addEventListener('click', () => document.getElementById('logo-input').click());
    document.getElementById('logo-input').addEventListener('change', setLogo);
    
    document.getElementById('remove-logo-btn').addEventListener('click', (event) => {
        event.stopPropagation();
        if (confirm('Remove the logo?')) {
            localStorage.removeItem(STORAGE_KEYS.logo);
            displayLogo(null);
        }
    });

    // Signatures
    document.getElementById('manager-sig-slot').addEventListener('click', (e) => {
        if (e.target.id !== 'clear-manager-sig') openSignatureModal('manager');
    });
    document.getElementById('clear-manager-sig').addEventListener('click', (e) => {
        e.stopPropagation();
        setSignature('manager', null);
    });

    document.getElementById('customer-sig-slot').addEventListener('click', (e) => {
        if (e.target.id !== 'clear-customer-sig') openSignatureModal('customer');
    });
    document.getElementById('clear-customer-sig').addEventListener('click', (e) => {
        e.stopPropagation();
        setSignature('customer', null);
    });

    // Signature Modal Events
    document.getElementById('sig-modal-close').addEventListener('click', closeSignatureModal);
    document.getElementById('sig-cancel-btn').addEventListener('click', closeSignatureModal);
    document.getElementById('sig-apply-btn').addEventListener('click', applySignatureModal);

    // Tabs
    document.querySelectorAll('.sig-tab-btn').forEach(btn => {
        btn.addEventListener('click', () => switchSignatureTab(btn.dataset.tab));
    });

    // Ink colors
    document.querySelectorAll('.color-dot').forEach(dot => {
        dot.addEventListener('click', () => {
            document.querySelectorAll('.color-dot').forEach(d => d.classList.remove('active'));
            dot.classList.add('active');
            selectedInkColor = dot.dataset.color;
        });
    });

    // Clear canvas button
    document.getElementById('clear-canvas-btn').addEventListener('click', clearCanvas);

    // Upload box
    const uploadBox = document.getElementById('sig-upload-box');
    const sigFileInput = document.getElementById('sig-file-input');
    uploadBox.addEventListener('click', () => sigFileInput.click());
    sigFileInput.addEventListener('change', handleSignatureFileUpload);


    // Signature Format Chips (Full Name, I. K. Surname, Monogram, etc.)
    document.querySelectorAll('.sig-format-chip').forEach(chip => {
        chip.addEventListener('click', () => {
            document.querySelectorAll('.sig-format-chip').forEach(c => c.classList.remove('active'));
            chip.classList.add('active');
            selectedSigFormat = chip.dataset.format;
            updateAllFontPreviews();
        });
    });

    document.querySelectorAll('.font-option').forEach(opt => {
        opt.addEventListener('click', () => {
            document.querySelectorAll('.font-option').forEach(o => o.classList.remove('active'));
            opt.classList.add('active');
            selectedFontFamily = opt.dataset.font;
            selectedFontScale = parseFloat(opt.dataset.scale) || 1.0;
            selectedFontSlant = parseFloat(opt.dataset.slant) || 0.05;
            updateAllFontPreviews();
        });
    });

    // Live preview while typing
    const sigInput = document.getElementById('sig-text-input');
    if (sigInput) {
        sigInput.addEventListener('input', updateAllFontPreviews);
    }

    // Flourish selector change
    const flourishSelect = document.getElementById('sig-flourish-style');
    if (flourishSelect) {
        flourishSelect.addEventListener('change', updateAllFontPreviews);
    }

    // Type-tab ink color dots
    document.querySelectorAll('.type-color-dot').forEach(dot => {
        dot.addEventListener('click', () => {
            document.querySelectorAll('.type-color-dot').forEach(d => d.classList.remove('active'));
            dot.classList.add('active');
            selectedTypeInkColor = dot.dataset.color;
            const inkColor = selectedTypeInkColor || '#032e22';
            document.querySelectorAll('.font-preview').forEach(fp => {
                fp.style.color = inkColor;
            });
        });
    });
    
    window.addEventListener('beforeunload', saveState);

    // Print button now opens animated preview instead of printing directly
    document.getElementById('print-btn').removeEventListener('click', printInvoice);
    document.getElementById('print-btn').addEventListener('click', openPrintPreview);

    // Save as Image
    const saveImageBtn = document.getElementById('save-image-btn');
    if (saveImageBtn) saveImageBtn.addEventListener('click', saveAsImage);

    // B&W / Color toggle
    const imgModeBW = document.getElementById('img-mode-bw');
    const imgModeColor = document.getElementById('img-mode-color');
    if (imgModeBW && imgModeColor) {
        imgModeBW.addEventListener('click', () => {
            imgModeBW.classList.add('active');
            imgModeColor.classList.remove('active');
        });
        imgModeColor.addEventListener('click', () => {
            imgModeColor.classList.add('active');
            imgModeBW.classList.remove('active');
        });
    }

    // Print Preview Modal
    document.getElementById('preview-close-btn').addEventListener('click', closePrintPreview);
    document.getElementById('preview-print-btn').addEventListener('click', () => {
        closePrintPreview();
        setTimeout(printInvoice, 150);
    });
    document.getElementById('print-preview-overlay').addEventListener('click', (e) => {
        if (e.target === e.currentTarget) closePrintPreview();
    });

    // History Search & Filter
    const histSearch = document.getElementById('history-search');
    const histSearchClear = document.getElementById('history-search-clear');
    const histFilterStatus = document.getElementById('history-filter-status');
    const histFilterSort = document.getElementById('history-filter-sort');

    histSearch.addEventListener('input', () => {
        histSearchClear.hidden = !histSearch.value.trim();
        filterRenderHistory();
    });
    histSearchClear.addEventListener('click', () => {
        histSearch.value = '';
        histSearchClear.hidden = true;
        filterRenderHistory();
    });
    histFilterStatus.addEventListener('change', filterRenderHistory);
    histFilterSort.addEventListener('change', filterRenderHistory);
}

/* ==========================================================================
   Signature Canvas & Modal Logic
   ========================================================================== */

function initSignaturePad() {
    const canvas = document.getElementById('sig-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    let lastX = 0;
    let lastY = 0;

    const getPos = (e) => {
        const rect = canvas.getBoundingClientRect();
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        return {
            x: (clientX - rect.left) * (canvas.width / rect.width),
            y: (clientY - rect.top) * (canvas.height / rect.height)
        };
    };

    const startDraw = (e) => {
        e.preventDefault();
        isDrawing = true;
        const pos = getPos(e);
        lastX = pos.x;
        lastY = pos.y;
    };

    const draw = (e) => {
        if (!isDrawing) return;
        e.preventDefault();
        const pos = getPos(e);
        ctx.beginPath();
        ctx.moveTo(lastX, lastY);
        ctx.lineTo(pos.x, pos.y);
        ctx.strokeStyle = selectedInkColor;
        ctx.lineWidth = 2.5;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.stroke();
        lastX = pos.x;
        lastY = pos.y;
    };

    const stopDraw = () => { isDrawing = false; };

    canvas.addEventListener('mousedown', startDraw);
    canvas.addEventListener('mousemove', draw);
    window.addEventListener('mouseup', stopDraw);

    canvas.addEventListener('touchstart', startDraw, { passive: false });
    canvas.addEventListener('touchmove', draw, { passive: false });
    window.addEventListener('touchend', stopDraw);
}

function clearCanvas() {
    const canvas = document.getElementById('sig-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
}

function isCanvasBlank(canvas) {
    const ctx = canvas.getContext('2d');
    const pixelBuffer = new Uint32Array(
        ctx.getImageData(0, 0, canvas.width, canvas.height).data.buffer
    );
    return !pixelBuffer.some(color => color !== 0);
}

function openSignatureModal(target) {
    currentSigTarget = target;
    const modal = document.getElementById('sig-modal-overlay');
    const title = document.getElementById('sig-modal-title');
    const rememberLabel = document.getElementById('remember-sig-label');

    title.textContent = target === 'manager' ? "Manager's Signature / Stamp" : "Customer's Signature";
    rememberLabel.style.display = target === 'manager' ? 'inline-flex' : 'none';

    clearCanvas();
    uploadedSigDataUrl = null;
    document.getElementById('sig-upload-preview-wrapper').hidden = true;
    document.getElementById('sig-upload-text').hidden = false;
    document.getElementById('sig-file-input').value = '';
    
    const typeInput = document.getElementById('sig-text-input');
    typeInput.value = target === 'customer' 
        ? (document.getElementById('customer-name').value || '') 
        : (document.getElementById('cashier-input').value || '');
    updateAllFontPreviews();

    switchSignatureTab('draw');
    modal.hidden = false;
}

function closeSignatureModal() {
    document.getElementById('sig-modal-overlay').hidden = true;
}

function switchSignatureTab(tabName) {
    activeSigTab = tabName;
    document.querySelectorAll('.sig-tab-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === tabName);
    });
    document.getElementById('sig-panel-draw').hidden = (tabName !== 'draw');
    document.getElementById('sig-panel-upload').hidden = (tabName !== 'upload');
    document.getElementById('sig-panel-type').hidden = (tabName !== 'type');
}

function handleSignatureFileUpload(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
        uploadedSigDataUrl = event.target.result;
        const preview = document.getElementById('sig-upload-preview');
        preview.src = uploadedSigDataUrl;
        document.getElementById('sig-upload-preview-wrapper').hidden = false;
        document.getElementById('sig-upload-text').hidden = true;
    };
    reader.readAsDataURL(file);
}

/* ==========================================================================
   Premium Autograph Generator — Realistic Canvas Rendering Engine
   ========================================================================== */

function formatSignerName(rawName, formatType) {
    if (!rawName || !rawName.trim()) return 'Autograph';
    const parts = rawName.trim().split(/\s+/);
    if (parts.length === 1) return parts[0];

    if (formatType === 'initials-surname') {
        // e.g. "Isaac Kwabena Temah" -> "I. K. Temah"
        const surname = parts[parts.length - 1];
        const initials = parts.slice(0, parts.length - 1).map(p => p[0].toUpperCase() + '.').join(' ');
        return `${initials} ${surname}`;
    } else if (formatType === 'monogram') {
        // e.g. "Isaac Kwabena Temah" -> "I. Temah"
        const firstInit = parts[0][0].toUpperCase() + '.';
        const surname = parts[parts.length - 1];
        return `${firstInit} ${surname}`;
    } else if (formatType === 'first-initial') {
        // e.g. "Isaac Kwabena Temah" -> "Isaac T."
        const firstName = parts[0];
        const lastInit = parts[parts.length - 1][0].toUpperCase() + '.';
        return `${firstName} ${lastInit}`;
    }
    // 'full'
    return rawName.trim();
}

function updateAllFontPreviews() {
    const rawVal = (document.getElementById('sig-text-input')?.value || '').trim();
    const formatted = formatSignerName(rawVal, selectedSigFormat);
    document.querySelectorAll('.font-preview').forEach(fp => {
        fp.textContent = formatted;
    });
}

function generateTypedSignatureImage(text, font, scale) {
    const canvas = document.createElement('canvas');
    canvas.width = 540;
    canvas.height = 190;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const inkColor = selectedTypeInkColor || '#032e22';
    const slant = selectedFontSlant || 0.07;
    const inkRgb = hexToRgb(inkColor);

    // Apply selected format to the name
    const formattedText = formatSignerName(text, selectedSigFormat);

    // Flourish selection
    const flourishStyle = document.getElementById('sig-flourish-style')?.value || 'paraph';

    // ---------- 1. Main Signature Text with Organic Pen Fluidity ----------
    const fontSize = Math.round(76 * (scale || 1.0));
    ctx.save();
    // Realistic forward pen tilt
    ctx.transform(1, -0.025, slant, 1, 0, 0);

    // Ink depth & bleed shadow
    ctx.shadowColor = `rgba(${inkRgb.r}, ${inkRgb.g}, ${inkRgb.b}, 0.35)`;
    ctx.shadowBlur = 1.2;
    ctx.shadowOffsetX = 0.4;
    ctx.shadowOffsetY = 0.6;

    ctx.font = `italic ${fontSize}px ${font}`;
    ctx.fillStyle = inkColor;
    ctx.textBaseline = 'alphabetic';

    const metrics = ctx.measureText(formattedText);
    const textWidth = metrics.width;
    const startX = Math.max(22, (canvas.width - textWidth) / 2 - 12);
    const baselineY = Math.round(canvas.height * 0.60);

    // Natural handwriting letter-by-letter rendering with micro-variations
    let charX = startX;
    for (let i = 0; i < formattedText.length; i++) {
        const char = formattedText[i];
        const charW = ctx.measureText(char).width;
        
        // Micro vertical drift and variable pen pressure
        const wobbleY = baselineY + Math.sin(i * 1.8 + 0.3) * 1.1;
        const opacity = 0.90 + Math.sin(i * 2.3) * 0.08;
        ctx.globalAlpha = Math.min(1.0, Math.max(0.85, opacity));

        ctx.fillText(char, charX, wobbleY);
        charX += charW;
    }
    ctx.restore();

    // ---------- 2. Initial Letter Pen Entry Hook / Loop ----------
    if (formattedText.length > 0) {
        ctx.save();
        ctx.strokeStyle = inkColor;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.lineWidth = 1.6;
        ctx.globalAlpha = 0.65;

        // Entry flourish on capital
        const entryX = startX - 8;
        const entryY = baselineY - fontSize * 0.45;
        ctx.beginPath();
        ctx.moveTo(entryX - 12, entryY + 8);
        ctx.bezierCurveTo(
            entryX - 16, entryY - 4,
            entryX - 4, entryY - 10,
            entryX + 4, entryY
        );
        ctx.stroke();
        ctx.restore();
    }

    // ---------- 3. Dynamic Flourish & Paraph Swashes ----------
    const lsX = startX - 14;
    const leX = startX + textWidth + 24;
    const lY = baselineY + 12;

    ctx.save();
    ctx.strokeStyle = inkColor;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    if (flourishStyle === 'paraph') {
        // Executive Paraph: Sweeping underline that loops back under the signature
        ctx.lineWidth = 1.9;
        ctx.globalAlpha = 0.78;
        ctx.beginPath();
        ctx.moveTo(lsX, lY);
        // Wide swooping curve
        ctx.bezierCurveTo(
            lsX + (leX - lsX) * 0.35, lY - 6,
            lsX + (leX - lsX) * 0.70, lY + 6,
            leX, lY - 2
        );
        ctx.stroke();

        // Elegant oval loopback
        ctx.lineWidth = 1.3;
        ctx.globalAlpha = 0.60;
        ctx.beginPath();
        ctx.moveTo(leX, lY - 2);
        ctx.bezierCurveTo(
            leX + 18, lY - 14,
            leX + 26, lY + 10,
            leX + 8, lY + 16
        );
        ctx.bezierCurveTo(
            leX - 12, lY + 22,
            leX - 45, lY + 14,
            leX - 60, lY + 8
        );
        ctx.stroke();

    } else if (flourishStyle === 'flick') {
        // Rapid Pen Flick & Tail
        ctx.lineWidth = 1.8;
        ctx.globalAlpha = 0.75;
        ctx.beginPath();
        ctx.moveTo(lsX + 6, lY + 2);
        ctx.bezierCurveTo(
            lsX + (leX - lsX) * 0.4, lY - 2,
            lsX + (leX - lsX) * 0.8, lY + 4,
            leX + 8, lY - 6
        );
        ctx.stroke();

        // Sharp upward energetic tail flick
        ctx.lineWidth = 1.1;
        ctx.globalAlpha = 0.45;
        ctx.beginPath();
        ctx.moveTo(leX + 8, lY - 6);
        ctx.bezierCurveTo(
            leX + 22, lY - 18,
            leX + 32, lY - 32,
            leX + 38, lY - 44
        );
        ctx.stroke();

    } else if (flourishStyle === 'double') {
        // Double Calligraphy Underline
        ctx.lineWidth = 1.5;
        ctx.globalAlpha = 0.75;
        ctx.beginPath();
        ctx.moveTo(lsX, lY - 2);
        ctx.bezierCurveTo(
            lsX + (leX - lsX) * 0.3, lY - 7,
            lsX + (leX - lsX) * 0.7, lY + 3,
            leX, lY - 3
        );
        ctx.stroke();

        // Second subtle accent line
        ctx.lineWidth = 1.0;
        ctx.globalAlpha = 0.50;
        ctx.beginPath();
        ctx.moveTo(lsX + 16, lY + 5);
        ctx.bezierCurveTo(
            lsX + (leX - lsX) * 0.4, lY + 2,
            lsX + (leX - lsX) * 0.7, lY + 9,
            leX - 10, lY + 4
        );
        ctx.stroke();

    } else if (flourishStyle === 'strike') {
        // Cross-Stroke Swash through upper text
        ctx.lineWidth = 1.4;
        ctx.globalAlpha = 0.65;
        const strikeY = baselineY - fontSize * 0.35;
        ctx.beginPath();
        ctx.moveTo(lsX - 6, strikeY + 4);
        ctx.bezierCurveTo(
            lsX + (leX - lsX) * 0.3, strikeY - 4,
            lsX + (leX - lsX) * 0.7, strikeY + 6,
            leX + 12, strikeY - 2
        );
        ctx.stroke();
    }
    ctx.restore();

    // ---------- 4. Fountain Pen Ink Bleed Texture ----------
    ctx.save();
    ctx.globalCompositeOperation = 'multiply';
    for (let k = 0; k < 45; k++) {
        const gx = startX + (Math.random() * (textWidth + 25));
        const gy = baselineY - fontSize * 0.55 + Math.random() * fontSize * 0.8;
        const gr = 0.5 + Math.random() * 1.0;
        ctx.beginPath();
        ctx.arc(gx, gy, gr, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${inkRgb.r}, ${inkRgb.g}, ${inkRgb.b}, ${0.03 + Math.random() * 0.05})`;
        ctx.fill();
    }
    ctx.restore();

    return canvas.toDataURL('image/png');
}

function hexToRgb(hex) {
    const clean = hex.replace('#', '');
    const num = parseInt(clean.length === 3
        ? clean.split('').map(c => c + c).join('')
        : clean, 16);
    return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 };
}

function applySignatureModal() {
    let finalSigDataUrl = null;

    if (activeSigTab === 'draw') {
        const canvas = document.getElementById('sig-canvas');
        if (isCanvasBlank(canvas)) {
            alert('Please draw a signature first, or choose another tab.');
            return;
        }
        finalSigDataUrl = canvas.toDataURL('image/png');
    } else if (activeSigTab === 'upload') {
        if (!uploadedSigDataUrl) {
            alert('Please upload a signature or stamp image first.');
            return;
        }
        finalSigDataUrl = uploadedSigDataUrl;
    } else if (activeSigTab === 'type') {
        const text = document.getElementById('sig-text-input').value.trim();
        if (!text) {
            alert('Please enter a name to generate a signature.');
            return;
        }
        finalSigDataUrl = generateTypedSignatureImage(text, selectedFontFamily, selectedFontScale);
    }

    if (finalSigDataUrl) {
        setSignature(currentSigTarget, finalSigDataUrl);
        
        if (currentSigTarget === 'manager' && document.getElementById('remember-sig-check').checked) {
            localStorage.setItem(STORAGE_KEYS.defaultManagerSig, finalSigDataUrl);
        }
        closeSignatureModal();
    }
}

function setSignature(target, dataUrl) {
    const isManager = (target === 'manager');
    if (isManager) currentManagerSig = dataUrl;
    else currentCustomerSig = dataUrl;

    const img = document.getElementById(isManager ? 'manager-sig-img' : 'customer-sig-img');
    const placeholder = document.getElementById(isManager ? 'manager-sig-placeholder' : 'customer-sig-placeholder');
    const clearBtn = document.getElementById(isManager ? 'clear-manager-sig' : 'clear-customer-sig');

    if (dataUrl) {
        img.src = dataUrl;
        img.hidden = false;
        placeholder.hidden = true;
        clearBtn.hidden = false;
    } else {
        img.hidden = true;
        img.src = '';
        placeholder.hidden = false;
        clearBtn.hidden = true;
        if (isManager) localStorage.removeItem(STORAGE_KEYS.defaultManagerSig);
    }
    saveState();
}

/* ==========================================================================
   Business Information Persistence
   ========================================================================== */

function saveBusinessInfo() {
    const info = {
        address: document.getElementById('biz-address').textContent.trim(),
        phone: document.getElementById('biz-phone').textContent.trim(),
        email: document.getElementById('biz-email').textContent.trim()
    };
    localStorage.setItem(STORAGE_KEYS.businessInfo, JSON.stringify(info));
}

function restoreBusinessInfo() {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEYS.businessInfo) || 'null');
    if (saved) {
        if (saved.address) document.getElementById('biz-address').textContent = saved.address;
        if (saved.phone) document.getElementById('biz-phone').textContent = saved.phone;
        if (saved.email) document.getElementById('biz-email').textContent = saved.email;
    }
}

/* ==========================================================================
   Date & Time Formatting
   ========================================================================== */

function formatDate(date) {
    const day = date.getDate();
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const month = months[date.getMonth()];
    const year = date.getFullYear();
    return `${day} ${month} ${year}`;
}

function formatTime(date) {
    let hours = date.getHours();
    const minutes = date.getMinutes();
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12;
    hours = hours ? hours : 12;
    const minutesStr = minutes < 10 ? '0' + minutes : minutes;
    return `${hours}:${minutesStr} ${ampm}`;
}

function setCurrentDateTime() {
    const now = new Date();
    const dateEl = document.getElementById('invoice-date');
    const timeEl = document.getElementById('invoice-time');
    if (dateEl) dateEl.textContent = formatDate(now);
    if (timeEl) timeEl.textContent = formatTime(now);
}

function getCurrency() {
    return document.getElementById('currency').value || 'GH₵';
}

function formatMoney(value) {
    const num = isNaN(value) ? 0 : value;
    return num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
}

/* ==========================================================================
   Daily Resetting Invoice Numbering with Unique Device/Terminal ID (Offline)
   ========================================================================== */

function getTodayKey() {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}${month}${day}`;
}

function getPrefix() {
    return localStorage.getItem(STORAGE_KEYS.prefix) || 'TEM';
}

function getDeviceId() {
    let devId = localStorage.getItem(STORAGE_KEYS.deviceId);
    if (!devId) {
        // First launch: auto-generate a unique device ID instead of a blank/duplicate
        devId = generateDeviceSuggestion();
        localStorage.setItem(STORAGE_KEYS.deviceId, devId);
    }
    return devId;
}

function detectDeviceType() {
    const ua = (navigator.userAgent || '').toLowerCase();
    const isMobile = /android|iphone|ipad|ipod|webos|blackberry|iemobile|opera mini/i.test(ua);
    if (isMobile) {
        const w = Math.min(window.screen.width || 0, window.screen.height || 0);
        return w >= 600 ? 'TAB' : 'PHONE';
    }
    return 'PC';
}

function generateDeviceSuggestion() {
    const type = detectDeviceType();
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // excludes confusing I,O,0,1
    let code = '';
    for (let i = 0; i < 3; i++) {
        code += chars[Math.floor(Math.random() * chars.length)];
    }
    return `${type}-${code}`;
}

function openFirstTimeSetup() {
    const banner = document.getElementById('terminal-firsttime-banner');
    if (banner) banner.hidden = false;
    openTerminalModal();
}

function updateTerminalDisplay() {
    const badge = document.getElementById('terminal-badge');
    if (badge) badge.textContent = getDeviceId();
}

function initTerminalModalEvents() {
    const closeBtn = document.getElementById('terminal-modal-close');
    if (closeBtn) closeBtn.addEventListener('click', closeTerminalModal);
    const cancelBtn = document.getElementById('terminal-modal-cancel');
    if (cancelBtn) cancelBtn.addEventListener('click', closeTerminalModal);
    const overlay = document.getElementById('terminal-modal-overlay');
    if (overlay) {
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) closeTerminalModal();
        });
    }
    const saveBtn = document.getElementById('terminal-modal-save');
    if (saveBtn) saveBtn.addEventListener('click', saveTerminalSettings);

    const prefixInput = document.getElementById('modal-prefix-input');
    const termInput = document.getElementById('modal-terminal-input');
    const seqInput = document.getElementById('modal-seq-input');

    if (prefixInput) prefixInput.addEventListener('input', updateModalNumberPreview);
    if (termInput) termInput.addEventListener('input', updateModalNumberPreview);
    if (seqInput) seqInput.addEventListener('input', updateModalNumberPreview);

    document.querySelectorAll('.preset-pill-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            if (termInput) {
                termInput.value = btn.dataset.val;
                updateModalNumberPreview();
            }
        });
    });
}

function openTerminalModal() {
    const overlay = document.getElementById('terminal-modal-overlay');
    if (!overlay) return;

    const prefixInput = document.getElementById('modal-prefix-input');
    const termInput = document.getElementById('modal-terminal-input');
    const seqInput = document.getElementById('modal-seq-input');

    if (prefixInput) prefixInput.value = getPrefix();
    if (termInput) termInput.value = getDeviceId();
    if (seqInput) seqInput.value = parseInt(localStorage.getItem(STORAGE_KEYS.dailySeq) || '1', 10) || 1;

    updateModalNumberPreview();
    overlay.hidden = false;
    if (termInput) termInput.focus();
}

function closeTerminalModal() {
    const overlay = document.getElementById('terminal-modal-overlay');
    if (overlay) overlay.hidden = true;
}

function updateModalNumberPreview() {
    const prefixInput = document.getElementById('modal-prefix-input');
    const termInput = document.getElementById('modal-terminal-input');
    const seqInput = document.getElementById('modal-seq-input');
    const preview = document.getElementById('modal-preview-number');

    const prefix = (prefixInput && prefixInput.value.trim() ? prefixInput.value.trim().toUpperCase() : 'TEM').replace(/[^A-Z0-9_-]/g, '') || 'TEM';
    const term = (termInput && termInput.value.trim() ? termInput.value.trim().toUpperCase() : 'POS1').replace(/[^A-Z0-9_-]/g, '') || 'POS1';
    const seqNum = seqInput ? parseInt(seqInput.value, 10) || 1 : 1;
    const seqFormatted = String(seqNum).padStart(3, '0');
    const today = getTodayKey();

    if (preview) {
        preview.textContent = `${prefix}-${term}-${today}-${seqFormatted}`;
    }
}

function saveTerminalSettings() {
    const prefixInput = document.getElementById('modal-prefix-input');
    const termInput = document.getElementById('modal-terminal-input');
    const seqInput = document.getElementById('modal-seq-input');

    const prefix = (prefixInput && prefixInput.value.trim() ? prefixInput.value.trim().toUpperCase() : 'TEM').replace(/[^A-Z0-9_-]/g, '') || 'TEM';
    const term = (termInput && termInput.value.trim() ? termInput.value.trim().toUpperCase() : 'POS1').replace(/[^A-Z0-9_-]/g, '') || 'POS1';
    const seqNum = seqInput ? Math.max(1, parseInt(seqInput.value, 10) || 1) : 1;

    localStorage.setItem(STORAGE_KEYS.prefix, prefix);
    localStorage.setItem(STORAGE_KEYS.deviceId, term);
    localStorage.setItem(STORAGE_KEYS.dailySeq, String(seqNum));
    localStorage.setItem(STORAGE_KEYS.lastDate, getTodayKey());

    updateTerminalDisplay();

    const today = getTodayKey();
    const seqFormatted = String(seqNum).padStart(3, '0');
    currentInvoiceNumber = `${prefix}-${term}-${today}-${seqFormatted}`;
    document.getElementById('invoice-number').textContent = currentInvoiceNumber;
    saveState();

    closeTerminalModal();
}

function getNextInvoiceNumber() {
    const today = getTodayKey();
    const lastDate = localStorage.getItem(STORAGE_KEYS.lastDate);
    let seq = 1;

    if (lastDate === today) {
        const lastSeq = parseInt(localStorage.getItem(STORAGE_KEYS.dailySeq), 10);
        seq = isNaN(lastSeq) ? 1 : lastSeq + 1;
    }

    localStorage.setItem(STORAGE_KEYS.lastDate, today);
    localStorage.setItem(STORAGE_KEYS.dailySeq, String(seq));

    const prefix = getPrefix();
    const devId = getDeviceId();
    const seqFormatted = String(seq).padStart(3, '0');
    return `${prefix}-${devId}-${today}-${seqFormatted}`;
}

function customizeTerminalId() {
    openTerminalModal();
}

function customizeInvoicePrefix() {
    openTerminalModal();
}

/* ==========================================================================
   Payment Status Stamp & Method Toggle
   ========================================================================== */

function setPaymentStatus(status) {
    currentPaymentStatus = status;
    const badge = document.getElementById('payment-status-badge');
    if (!badge) return;

    badge.className = 'status-stamp';
    if (status === 'PAID') {
        badge.classList.add('status-paid');
        badge.innerHTML = `<span class="status-icon">✔</span><span class="status-text">PAID</span>`;
    } else if (status === 'PENDING') {
        badge.classList.add('status-pending');
        badge.innerHTML = `<span class="status-icon">⏳</span><span class="status-text">PENDING</span>`;
    } else {
        badge.classList.add('status-unpaid');
        badge.innerHTML = `<span class="status-icon">✖</span><span class="status-text">UNPAID</span>`;
    }
    saveState();
}

function togglePaymentStatus() {
    if (currentPaymentStatus === 'PAID') {
        setPaymentStatus('PENDING');
    } else if (currentPaymentStatus === 'PENDING') {
        setPaymentStatus('UNPAID');
    } else {
        setPaymentStatus('PAID');
    }
}

/* ==========================================================================
   Discount Type (% vs. Fixed Amount)
   ========================================================================== */

function toggleDiscountType() {
    currentDiscountType = currentDiscountType === 'percent' ? 'fixed' : 'percent';
    updateDiscountTypeDisplay();
    updateTotal();
}

function updateDiscountTypeDisplay() {
    const btn = document.getElementById('discount-type-btn');
    if (btn) {
        btn.textContent = currentDiscountType === 'percent' ? '%' : getCurrency();
    }
}

/* ==========================================================================
   Table & Calculation Logic
   ========================================================================== */

function updateTableHeaders() {
    const curr = getCurrency();
    const thUnit = document.getElementById('th-unit-price');
    const thTotal = document.getElementById('th-total-price');
    if (thUnit) thUnit.textContent = `Unit Price (${curr})`;
    if (thTotal) thTotal.textContent = `Total (${curr})`;
}

function updateRowNumbers() {
    const rows = document.querySelectorAll('#invoice-items tr');
    rows.forEach((row, index) => {
        const numBadge = row.querySelector('.row-num-badge');
        if (numBadge) {
            numBadge.textContent = index + 1;
        }
    });
}

function getItems() {
    const items = [];
    document.querySelectorAll('#invoice-items tr').forEach(row => {
        const descInput = row.querySelector('.table-desc-input');
        const qtyInput = row.querySelector('.table-qty-input');
        const priceInput = row.querySelector('.table-price-input');
        
        if (descInput && qtyInput && priceInput) {
            const description = descInput.value.trim();
            const quantity = parseFloat(qtyInput.value);
            const price = parseFloat(priceInput.value);
            
            if (description || !isNaN(quantity) || !isNaN(price)) {
                items.push({
                    description,
                    quantity: isNaN(quantity) ? 0 : quantity,
                    price: isNaN(price) ? 0 : price
                });
            }
        }
    });
    return items;
}

function addItemRow(description = '', quantity = '', price = '') {
    const tableBody = document.getElementById('invoice-items');
    const row = document.createElement('tr');

    // 1. Row Number Column
    const numCell = document.createElement('td');
    numCell.className = 'col-num';
    const numBadge = document.createElement('span');
    numBadge.className = 'row-num-badge';
    numBadge.textContent = tableBody.children.length + 1;
    numCell.appendChild(numBadge);
    row.appendChild(numCell);

    // 2. Item Description Column
    const descCell = document.createElement('td');
    descCell.className = 'col-desc';
    const descWrapper = document.createElement('div');
    descWrapper.className = 'desc-input-wrapper';
    
    const descInput = document.createElement('input');
    descInput.type = 'text';
    descInput.className = 'table-input table-desc-input';
    descInput.placeholder = 'Add item...';
    descInput.value = description;
    descInput.addEventListener('input', () => {
        updateTotal();
        showAutocomplete(descInput, descWrapper);
    });
    descInput.addEventListener('blur', () => {
        setTimeout(() => hideAutocomplete(descWrapper), 160);
    });
    descInput.addEventListener('focus', () => {
        if (descInput.value.trim()) showAutocomplete(descInput, descWrapper);
    });
    descInput.addEventListener('keydown', (e) => {
        const dropdown = descWrapper.querySelector('.autocomplete-dropdown');
        if (!dropdown) return;
        const items = dropdown.querySelectorAll('.autocomplete-item');
        const current = dropdown.querySelector('.autocomplete-item.highlighted');
        let idx = Array.from(items).indexOf(current);
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            idx = (idx + 1) % items.length;
            items.forEach(i => i.classList.remove('highlighted'));
            items[idx] && items[idx].classList.add('highlighted');
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            idx = (idx - 1 + items.length) % items.length;
            items.forEach(i => i.classList.remove('highlighted'));
            items[idx] && items[idx].classList.add('highlighted');
        } else if (e.key === 'Enter') {
            const highlighted = dropdown.querySelector('.autocomplete-item.highlighted');
            if (highlighted) {
                e.preventDefault();
                descInput.value = highlighted.dataset.name;
                const savedPrice = highlighted.dataset.price;
                if (savedPrice) {
                    const priceInput = row.querySelector('.table-price-input');
                    if (priceInput && !priceInput.value) priceInput.value = savedPrice;
                }
                hideAutocomplete(descWrapper);
                updateTotal();
            }
        } else if (e.key === 'Escape') {
            hideAutocomplete(descWrapper);
        }
    });
    
    descWrapper.appendChild(descInput);
    descCell.appendChild(descWrapper);
    row.appendChild(descCell);

    // 3. Quantity Column
    const qtyCell = document.createElement('td');
    qtyCell.className = 'col-qty';
    const qtyInput = document.createElement('input');
    qtyInput.type = 'number';
    qtyInput.min = '0';
    qtyInput.step = 'any';
    qtyInput.className = 'table-input table-qty-input';
    qtyInput.placeholder = '0';
    qtyInput.value = quantity === '' ? '' : quantity;
    qtyInput.addEventListener('input', updateTotal);
    qtyCell.appendChild(qtyInput);
    row.appendChild(qtyCell);

    // 4. Unit Price Column
    const priceCell = document.createElement('td');
    priceCell.className = 'col-price';
    const priceInput = document.createElement('input');
    priceInput.type = 'number';
    priceInput.min = '0';
    priceInput.step = 'any';
    priceInput.className = 'table-input table-price-input';
    priceInput.placeholder = '0.00';
    priceInput.value = price === '' ? '' : price;
    priceInput.addEventListener('input', updateTotal);
    priceInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            addItemRow('', '', '');
            const rows = document.querySelectorAll('#invoice-items tr');
            const lastRow = rows[rows.length - 1];
            const nextDesc = lastRow.querySelector('.table-desc-input');
            if (nextDesc) nextDesc.focus();
        }
    });
    priceCell.appendChild(priceInput);
    row.appendChild(priceCell);

    // 5. Total Price Column
    const totalCell = document.createElement('td');
    totalCell.className = 'col-total';
    const qVal = parseFloat(quantity) || 0;
    const pVal = parseFloat(price) || 0;
    totalCell.textContent = formatMoney(qVal * pVal);
    row.appendChild(totalCell);

    // 6. Action Column (Remove Button)
    const actionCell = document.createElement('td');
    actionCell.className = 'col-action no-print';
    const removeBtn = document.createElement('button');
    removeBtn.className = 'btn-trash';
    removeBtn.title = 'Remove item';
    removeBtn.innerHTML = `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>`;
    removeBtn.addEventListener('click', () => {
        row.remove();
        updateRowNumbers();
        updateTotal();
        if (tableBody.children.length === 0) {
            addItemRow('', '', '');
        }
    });
    actionCell.appendChild(removeBtn);
    row.appendChild(actionCell);

    tableBody.appendChild(row);
    updateRowNumbers();
    updateTotal();
    saveProductToAutocomplete(description);
}

function updateTotal() {
    const currency = getCurrency();
    let subtotal = 0;

    document.querySelectorAll('#invoice-items tr').forEach(row => {
        const qtyInput = row.querySelector('.table-qty-input');
        const priceInput = row.querySelector('.table-price-input');
        const totalCell = row.querySelector('.col-total');
        
        if (qtyInput && priceInput && totalCell) {
            const quantity = parseFloat(qtyInput.value);
            const price = parseFloat(priceInput.value);
            const q = isNaN(quantity) || quantity < 0 ? 0 : quantity;
            const p = isNaN(price) || price < 0 ? 0 : price;
            const lineTotal = q * p;
            totalCell.textContent = formatMoney(lineTotal);
            subtotal += lineTotal;
        }
    });

    const discountInput = document.getElementById('discount-input');
    const vatInput = document.getElementById('vat-input');

    const rawDiscount = parseFloat(discountInput.value) || 0;
    const vatPercent = clamp(parseFloat(vatInput.value) || 0, 0, 100);

    let discountAmount = 0;
    if (currentDiscountType === 'percent') {
        const discountPercent = clamp(rawDiscount, 0, 100);
        discountAmount = subtotal * (discountPercent / 100);
    } else {
        discountAmount = Math.min(subtotal, Math.max(0, rawDiscount));
    }

    const afterDiscount = Math.max(0, subtotal - discountAmount);
    const vatAmount = afterDiscount * (vatPercent / 100);
    const grandTotal = afterDiscount + vatAmount;

    // Display formatted values
    document.getElementById('subtotal').textContent = `${currency} ${formatMoney(subtotal)}`;
    
    // Update Discount Display and Clean Print Label
    const discountLabel = document.getElementById('discount-label');
    const discountAmtEl = document.getElementById('discount-amount');
    if (discountAmtEl) {
        if (discountAmount > 0) {
            discountAmtEl.textContent = `(${currency} ${formatMoney(discountAmount)})`;
            if (discountLabel) {
                discountLabel.textContent = currentDiscountType === 'percent'
                    ? `Discount (${clamp(rawDiscount, 0, 100)}%):`
                    : `Discount:`;
            }
        } else {
            discountAmtEl.textContent = `${currency} 0.00`;
            if (discountLabel) discountLabel.textContent = 'Discount:';
        }
    }
    
    // Update VAT Display and Clean Print Label
    const vatLabel = document.getElementById('vat-label');
    const vatAmtEl = document.getElementById('vat-amount');
    if (vatAmtEl) {
        if (vatAmount > 0) {
            vatAmtEl.textContent = `${currency} ${formatMoney(vatAmount)}`;
            if (vatLabel) vatLabel.textContent = `VAT (${vatPercent}%):`;
        } else {
            vatAmtEl.textContent = `${currency} 0.00`;
            if (vatLabel) vatLabel.textContent = 'VAT:';
        }
    }
    
    document.getElementById('invoice-total').textContent = `${currency} ${formatMoney(grandTotal)}`;
    
    saveState();
}

function validateInputs() {
    let valid = true;
    let hasValidRow = false;

    document.querySelectorAll('#invoice-items tr').forEach(row => {
        const descInput = row.querySelector('.table-desc-input');
        const qtyInput = row.querySelector('.table-qty-input');
        const priceInput = row.querySelector('.table-price-input');

        if (descInput && qtyInput && priceInput) {
            const desc = descInput.value.trim();
            const qtyStr = qtyInput.value.trim();
            const priceStr = priceInput.value.trim();

            if (desc || qtyStr || priceStr) {
                const numericQty = parseFloat(qtyStr);
                const numericPrice = parseFloat(priceStr);

                if (!desc) {
                    descInput.classList.add('invalid');
                    valid = false;
                } else {
                    descInput.classList.remove('invalid');
                }

                if (qtyStr === '' || isNaN(numericQty) || numericQty < 0) {
                    qtyInput.classList.add('invalid');
                    valid = false;
                } else {
                    qtyInput.classList.remove('invalid');
                }

                if (priceStr === '' || isNaN(numericPrice) || numericPrice < 0) {
                    priceInput.classList.add('invalid');
                    valid = false;
                } else {
                    priceInput.classList.remove('invalid');
                }

                if (desc && !isNaN(numericQty) && !isNaN(numericPrice) && numericQty >= 0 && numericPrice >= 0) {
                    hasValidRow = true;
                }
            } else {
                descInput.classList.remove('invalid');
                qtyInput.classList.remove('invalid');
                priceInput.classList.remove('invalid');
            }
        }
    });

    if (!hasValidRow) {
        alert('Please enter at least one item with valid description, quantity, and price.');
        return false;
    }

    if (!valid) {
        alert('Please correct invalid fields before proceeding.');
        return false;
    }

    return true;
}

function saveState() {
    const paySelect = document.getElementById('payment-method');
    const state = {
        invoiceNumber: currentInvoiceNumber || document.getElementById('invoice-number').textContent,
        currency: getCurrency(),
        customerName: document.getElementById('customer-name').value,
        customerPhone: document.getElementById('customer-phone').value,
        cashier: document.getElementById('cashier-input').value,
        paymentMethod: paySelect ? paySelect.value : 'Cash',
        paymentStatus: currentPaymentStatus,
        managerSignature: currentManagerSig,
        customerSignature: currentCustomerSig,
        discountType: currentDiscountType,
        discount: parseFloat(document.getElementById('discount-input').value) || 0,
        vat: parseFloat(document.getElementById('vat-input').value) || 0,
        paperSize: getPaperSize(),
        items: getItems()
    };
    localStorage.setItem(STORAGE_KEYS.current, JSON.stringify(state));
}

function loadState() {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEYS.current) || 'null');
    if (saved && saved.items) {
        currentInvoiceNumber = saved.invoiceNumber || getNextInvoiceNumber();
        document.getElementById('invoice-number').textContent = currentInvoiceNumber;
        document.getElementById('currency').value = saved.currency || 'GH₵';
        document.getElementById('customer-name').value = saved.customerName || '';
        document.getElementById('customer-phone').value = saved.customerPhone || '';
        document.getElementById('cashier-input').value = saved.cashier || '';
        
        if (saved.paymentMethod) {
            document.getElementById('payment-method').value = saved.paymentMethod;
            document.getElementById('payment-method-print').textContent = saved.paymentMethod;
        }
        setPaymentStatus(saved.paymentStatus || 'PAID');

        const defaultManagerSig = localStorage.getItem(STORAGE_KEYS.defaultManagerSig);
        setSignature('manager', saved.managerSignature || defaultManagerSig || null);
        setSignature('customer', saved.customerSignature || null);

        currentDiscountType = saved.discountType || 'percent';
        updateDiscountTypeDisplay();
        document.getElementById('discount-input').value = saved.discount !== undefined ? saved.discount : 0;
        document.getElementById('vat-input').value = saved.vat !== undefined ? saved.vat : 0;
        
        const savedPaper = (saved && saved.paperSize) || localStorage.getItem(STORAGE_KEYS.paperSize) || '10cm';
        const paperSelect = document.getElementById('paper-size-select');
        if (paperSelect) paperSelect.value = savedPaper;
        updatePaperSizeLayout();

        document.getElementById('invoice-items').innerHTML = '';
        if (saved.items.length === 0) {
            addItemRow('', '', '');
        } else {
            saved.items.forEach(item => addItemRow(item.description, item.quantity, item.price));
        }
    } else {
        newInvoice(false);
    }
    updateTableHeaders();
    renderHistory();
    updateTotal();
}

function updatePaperSizeLayout() {
    const size = getPaperSize();
    const screenInvoice = document.getElementById('invoice');
    if (!screenInvoice) return;
    if (size === '10cm') {
        screenInvoice.classList.add('paper-10cm');
    } else {
        screenInvoice.classList.remove('paper-10cm');
    }
}

function newInvoice(confirmPrompt) {
    if (confirmPrompt && !confirm('Start a new invoice? Unsaved changes to the current one will be lost.')) return;
    document.getElementById('invoice-items').innerHTML = '';
    currentInvoiceNumber = getNextInvoiceNumber();
    document.getElementById('invoice-number').textContent = currentInvoiceNumber;
    document.getElementById('customer-name').value = '';
    document.getElementById('customer-phone').value = '';
    document.getElementById('cashier-input').value = '';
    
    document.getElementById('payment-method').value = 'Cash';
    document.getElementById('payment-method-print').textContent = 'Cash';
    setPaymentStatus('PAID');

    // Restore remembered default manager signature, clear customer signature
    const defaultManagerSig = localStorage.getItem(STORAGE_KEYS.defaultManagerSig);
    setSignature('manager', defaultManagerSig || null);
    setSignature('customer', null);

    currentDiscountType = 'percent';
    updateDiscountTypeDisplay();
    document.getElementById('discount-input').value = 0;
    document.getElementById('vat-input').value = 0;
    
    addItemRow('', '', '');
    setCurrentDateTime();
    updateTableHeaders();
    updateTotal();
    
    if (confirmPrompt) alert(`New invoice #${currentInvoiceNumber} created.`);
}

/* ==========================================================================
   History Management & Saving
   ========================================================================== */

function saveToHistory(silent = false) {
    if (!validateInputs()) return false;
    const history = JSON.parse(localStorage.getItem(STORAGE_KEYS.history) || '[]');
    const items = getItems();
    
    // Auto-save items to product autocomplete catalog
    items.forEach(i => saveProductToAutocomplete(i.description, i.price));

    let subtotal = 0;
    items.forEach(i => { subtotal += i.quantity * i.price; });
    
    const rawDiscount = parseFloat(document.getElementById('discount-input').value) || 0;
    const vatPercent = clamp(parseFloat(document.getElementById('vat-input').value) || 0, 0, 100);
    
    let discountAmount = 0;
    if (currentDiscountType === 'percent') {
        discountAmount = subtotal * (clamp(rawDiscount, 0, 100) / 100);
    } else {
        discountAmount = Math.min(subtotal, Math.max(0, rawDiscount));
    }
    
    const afterDiscount = Math.max(0, subtotal - discountAmount);
    const total = afterDiscount * (1 + vatPercent / 100);

    const invNum = currentInvoiceNumber || document.getElementById('invoice-number').textContent;
    const existingIndex = history.findIndex(h => h.invoiceNumber === invNum);

    const entry = {
        id: existingIndex >= 0 ? history[existingIndex].id : Date.now(),
        savedAt: new Date().toLocaleString(),
        invoiceNumber: invNum,
        currency: getCurrency(),
        customerName: document.getElementById('customer-name').value,
        customerPhone: document.getElementById('customer-phone').value,
        cashier: document.getElementById('cashier-input').value,
        paymentMethod: document.getElementById('payment-method').value,
        paymentStatus: currentPaymentStatus,
        managerSignature: currentManagerSig,
        customerSignature: currentCustomerSig,
        discountType: currentDiscountType,
        discount: rawDiscount,
        discountAmount: discountAmount,
        vat: vatPercent,
        paperSize: getPaperSize(),
        subtotal: subtotal,
        items: items,
        total: total
    };
    
    if (existingIndex >= 0) {
        history[existingIndex] = entry;
    } else {
        history.unshift(entry);
    }

    localStorage.setItem(STORAGE_KEYS.history, JSON.stringify(history));
    filterRenderHistory();
    if (!silent) {
        alert(`Invoice #${entry.invoiceNumber} saved to history.`);
    }
    return true;
}

function renderHistory(filteredItems) {
    const list = document.getElementById('history-list');
    if (!list) return;
    list.innerHTML = '';
    const history = filteredItems !== undefined
        ? filteredItems
        : JSON.parse(localStorage.getItem(STORAGE_KEYS.history) || '[]');

    // Update stats
    const statsEl = document.getElementById('history-stats');
    if (statsEl) {
        const allHistory = JSON.parse(localStorage.getItem(STORAGE_KEYS.history) || '[]');
        const totalRevenue = allHistory.reduce((s, h) => s + (h.total || 0), 0);
        const todayKey = getTodayKey();
        const todayCount = allHistory.filter(h => (h.savedAt || '').includes(new Date().toLocaleDateString())).length;
        statsEl.innerHTML = `<span class="stat-pill">${allHistory.length} invoice${allHistory.length !== 1 ? 's' : ''}</span><span class="stat-pill revenue">${allHistory[0] ? allHistory[0].currency : 'GH₵'} ${formatMoney(totalRevenue)} total</span><span class="stat-pill today">${todayCount} today</span>`;
    }

    if (history.length === 0) {
        list.innerHTML = '<li class="empty">No invoices match your search.</li>';
        return;
    }

    history.forEach(item => {
        const li = document.createElement('li');
        const info = document.createElement('div');
        info.className = 'history-info';
        const custInfo = item.customerName ? ` — ${item.customerName}` : '';
        const statusClass = (item.paymentStatus || 'PAID').toLowerCase();
        info.innerHTML = `
            <div class="history-main-line">
                <span class="history-inv-num">#${item.invoiceNumber}</span>
                <span class="hist-status-badge hist-status-${statusClass}">${item.paymentStatus || 'PAID'}</span>
                ${item.customerName ? `<span class="hist-customer">${item.customerName}</span>` : ''}
            </div>
            <div class="history-sub-line">
                <span class="hist-date">${item.savedAt}</span>
                <span class="hist-amount">${item.currency} ${formatMoney(item.total)}</span>
                ${item.cashier ? `<span class="hist-cashier">Cashier: ${item.cashier}</span>` : ''}
            </div>
        `;
        li.appendChild(info);

        const actions = document.createElement('div');
        actions.className = 'history-actions';

        const previewBtn = document.createElement('button');
        previewBtn.className = 'history-btn preview';
        previewBtn.textContent = 'Preview';
        previewBtn.addEventListener('click', () => previewHistoryItem(item));
        
        const printBtn = document.createElement('button');
        printBtn.className = 'history-btn print';
        printBtn.textContent = 'Print';
        printBtn.addEventListener('click', () => printHistoryItem(item));

        const qrBtn = document.createElement('button');
        qrBtn.className = 'history-btn qr';
        qrBtn.textContent = 'QR';
        qrBtn.title = 'Show QR code to beam this invoice to another device offline';
        qrBtn.addEventListener('click', () => openQRModal(item));

        const payBtn = document.createElement('button');
        payBtn.className = 'history-btn pay';
        payBtn.textContent = 'Mark Paid';
        payBtn.title = 'Mark this invoice as PAID in one tap (updates the sales report)';
        payBtn.addEventListener('click', () => markHistoryPaid(item.id));
        if ((item.paymentStatus || 'PAID') === 'PAID') payBtn.hidden = true;

        const loadBtn = document.createElement('button');
        loadBtn.className = 'history-btn load';
        loadBtn.textContent = 'Load';
        loadBtn.addEventListener('click', () => loadFromHistory(item.id));

        const delBtn = document.createElement('button');
        delBtn.className = 'history-btn delete';
        delBtn.textContent = 'Delete';
        delBtn.addEventListener('click', () => deleteFromHistory(item.id));

        actions.appendChild(previewBtn);
        actions.appendChild(printBtn);
        actions.appendChild(qrBtn);
        actions.appendChild(payBtn);
        actions.appendChild(loadBtn);
        actions.appendChild(delBtn);
        li.appendChild(actions);
        list.appendChild(li);
    });

    renderReports();
}

function filterRenderHistory() {
    const searchVal = (document.getElementById('history-search').value || '').toLowerCase().trim();
    const statusVal = document.getElementById('history-filter-status').value;
    const sortVal = document.getElementById('history-filter-sort').value;

    let history = JSON.parse(localStorage.getItem(STORAGE_KEYS.history) || '[]');

    // Filter by search query
    if (searchVal) {
        history = history.filter(h => {
            const name = (h.customerName || '').toLowerCase();
            const invNum = (h.invoiceNumber || '').toLowerCase();
            const amount = formatMoney(h.total || 0);
            return name.includes(searchVal) || invNum.includes(searchVal) || amount.includes(searchVal);
        });
    }

    // Filter by status
    if (statusVal) {
        history = history.filter(h => (h.paymentStatus || 'PAID') === statusVal);
    }

    // Sort
    if (sortVal === 'oldest') {
        history = history.slice().reverse();
    } else if (sortVal === 'highest') {
        history = history.slice().sort((a, b) => (b.total || 0) - (a.total || 0));
    } else if (sortVal === 'lowest') {
        history = history.slice().sort((a, b) => (a.total || 0) - (b.total || 0));
    }
    // 'newest' is default (already in order)

    renderHistory(history);
}

/* ==========================================================================
   Sales Reports / Dashboard
   ========================================================================== */

let currentReportPeriod = 'today';

function getReportHistory() {
    return JSON.parse(localStorage.getItem(STORAGE_KEYS.history) || '[]');
}

function reportPeriodStart(period) {
    const now = new Date();
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    if (period === 'today') return d;
    if (period === 'week') {
        const sinceMonday = d.getDay() === 0 ? 6 : d.getDay() - 1;
        d.setDate(d.getDate() - sinceMonday);
        return d;
    }
    if (period === 'month') return new Date(now.getFullYear(), now.getMonth(), 1);
    return null; // 'all'
}

function parseSavedAt(savedAt) {
    if (!savedAt) return null;
    const t = new Date(savedAt);
    return isNaN(t.getTime()) ? null : t;
}

function buildReportData(period) {
    const start = reportPeriodStart(period);
    const history = getReportHistory().filter(h => {
        if (!start) return true;
        const t = parseSavedAt(h.savedAt);
        return t && t >= start;
    });

    const currency = (history[0] && history[0].currency) || getCurrency() || 'GH₵';
    const data = {
        currency,
        totalSales: 0,
        invoiceCount: history.length,
        itemsSold: 0,
        status: {},
        statusCount: {},
        items: {},
        customers: {},
        daily: {}
    };

    history.forEach(h => {
        const total = h.total || 0;
        data.totalSales += total;
        const st = h.paymentStatus || 'PAID';
        data.status[st] = (data.status[st] || 0) + total;
        data.statusCount[st] = (data.statusCount[st] || 0) + 1;

        (h.items || []).forEach(it => {
            const qty = it.quantity || 0;
            data.itemsSold += qty;
            const rev = (it.price || 0) * qty;
            const name = (it.description || '').trim() || 'Item';
            if (!data.items[name]) data.items[name] = { qty: 0, revenue: 0 };
            data.items[name].qty += qty;
            data.items[name].revenue += rev;
        });

        const cust = (h.customerName || '').trim() || 'Walk-in Customer';
        if (!data.customers[cust]) data.customers[cust] = { count: 0, revenue: 0 };
        data.customers[cust].count += 1;
        data.customers[cust].revenue += total;

        const t = parseSavedAt(h.savedAt);
        if (t) {
            const key = t.toLocaleDateString();
            if (!data.daily[key]) data.daily[key] = { count: 0, revenue: 0 };
            data.daily[key].count += 1;
            data.daily[key].revenue += total;
        }
    });

    data.topItems = Object.entries(data.items).sort((a, b) => b[1].revenue - a[1].revenue).slice(0, 5);
    data.topCustomers = Object.entries(data.customers).sort((a, b) => b[1].revenue - a[1].revenue).slice(0, 5);
    data.dailyList = Object.entries(data.daily).sort((a, b) => (a[0] < b[0] ? -1 : 1)).slice(-7);
    data.maxDailyRevenue = Math.max(1, ...data.dailyList.map(([, v]) => v.revenue));
    return data;
}

function renderReports() {
    const section = document.getElementById('reports');
    if (!section) return;
    const data = buildReportData(currentReportPeriod);
    const isEmpty = data.invoiceCount === 0;

    const emptyEl = document.getElementById('report-empty');
    if (emptyEl) emptyEl.hidden = !isEmpty;
    document.querySelectorAll('#reports .report-summary-grid, #reports .report-detail-grid').forEach(el => {
        el.style.display = isEmpty ? 'none' : '';
    });

    const money = v => `${data.currency} ${formatMoney(v)}`;

    document.getElementById('report-total-sales').textContent = money(data.totalSales);
    document.getElementById('report-total-sales-sub').textContent = `${data.invoiceCount} invoice${data.invoiceCount !== 1 ? 's' : ''}`;
    document.getElementById('report-invoice-count').textContent = data.invoiceCount;
    document.getElementById('report-invoice-count-sub').textContent = `${money(data.totalSales)} combined`;
    document.getElementById('report-items-sold').textContent = data.itemsSold;
    document.getElementById('report-unpaid-total').textContent = money(data.status.UNPAID || 0);
    const pending = data.status.PENDING || 0;
    document.getElementById('report-unpaid-sub').textContent = pending > 0 ? `+ ${money(pending)} pending` : 'All settled';

    // Payment status breakdown
    const statusEl = document.getElementById('report-status-breakdown');
    const statusDefs = [
        { key: 'PAID', label: 'Paid', cls: 'paid' },
        { key: 'PENDING', label: 'Pending', cls: 'pending' },
        { key: 'UNPAID', label: 'Unpaid', cls: 'unpaid' }
    ];
    statusEl.innerHTML = statusDefs.map(s => {
        const amt = data.status[s.key] || 0;
        const cnt = data.statusCount[s.key] || 0;
        const pct = data.totalSales > 0 ? Math.round((amt / data.totalSales) * 100) : 0;
        return `
            <div class="report-status-row">
                <span class="report-status-name"><span class="dot dot-${s.cls}"></span>${s.label}</span>
                <span class="report-status-bar"><span class="report-status-fill fill-${s.cls}" style="width:${pct}%"></span></span>
                <span class="report-status-amt">${money(amt)} <em>(${cnt})</em></span>
            </div>`;
    }).join('');

    // Daily sales breakdown
    const dailyEl = document.getElementById('report-daily-breakdown');
    if (data.dailyList.length === 0) {
        dailyEl.innerHTML = '<div class="report-mini-empty">No sales in this period.</div>';
    } else {
        dailyEl.innerHTML = data.dailyList.map(([day, v]) => `
            <div class="report-day-row">
                <span class="report-day-label">${day}</span>
                <span class="report-day-bar"><span class="report-day-fill" style="width:${Math.round((v.revenue / data.maxDailyRevenue) * 100)}%"></span></span>
                <span class="report-day-amt">${money(v.revenue)}</span>
            </div>`).join('');
    }

    // Top products
    const itemsEl = document.getElementById('report-top-items');
    if (data.topItems.length === 0) {
        itemsEl.innerHTML = '<div class="report-mini-empty">No products sold in this period.</div>';
    } else {
        itemsEl.innerHTML = '<div class="report-table-head"><span>Product</span><span>Qty</span><span>Revenue</span></div>' +
            data.topItems.map(([name, v]) => `
            <div class="report-table-row">
                <span class="report-table-name" title="${name.replace(/"/g, '&quot;')}">${name}</span>
                <span class="report-table-qty">${v.qty}</span>
                <span class="report-table-amt">${money(v.revenue)}</span>
            </div>`).join('');
    }

    // Top customers
    const custEl = document.getElementById('report-top-customers');
    if (data.topCustomers.length === 0) {
        custEl.innerHTML = '<div class="report-mini-empty">No customers recorded in this period.</div>';
    } else {
        custEl.innerHTML = '<div class="report-table-head"><span>Customer</span><span>Invoices</span><span>Total</span></div>' +
            data.topCustomers.map(([name, v]) => `
            <div class="report-table-row">
                <span class="report-table-name" title="${name.replace(/"/g, '&quot;')}">${name}</span>
                <span class="report-table-qty">${v.count}</span>
                <span class="report-table-amt">${money(v.revenue)}</span>
            </div>`).join('');
    }
}

function exportReportCSV() {
    const start = reportPeriodStart(currentReportPeriod);
    const history = getReportHistory().filter(h => {
        if (!start) return true;
        const t = parseSavedAt(h.savedAt);
        return t && t >= start;
    });
    if (history.length === 0) {
        alert('No invoices in this report period to export.');
        return;
    }

    const headers = [
        'Invoice No', 'Date & Time', 'Customer Name', 'Customer Phone',
        'Cashier', 'Payment Method', 'Payment Status', 'Currency',
        'Subtotal', 'Discount Applied', 'VAT %', 'Grand Total',
        'Item Count', 'Items Summary'
    ];
    const escapeCSV = (str) => {
        const val = (str === null || str === undefined) ? '' : String(str);
        return `"${val.replace(/"/g, '""')}"`;
    };
    const csvLines = [headers.join(',')];

    history.forEach(row => {
        const itemsSummary = (row.items || [])
            .map(i => `${i.description} (Qty: ${i.quantity}, Price: ${i.price})`)
            .join('; ');
        const discountDisplay = row.discountType === 'percent'
            ? `${row.discount}%`
            : `${row.currency} ${formatMoney(row.discount)}`;
        const line = [
            escapeCSV(row.invoiceNumber),
            escapeCSV(row.savedAt),
            escapeCSV(row.customerName),
            escapeCSV(row.customerPhone),
            escapeCSV(row.cashier),
            escapeCSV(row.paymentMethod || 'Cash'),
            escapeCSV(row.paymentStatus || 'PAID'),
            escapeCSV(row.currency),
            escapeCSV(formatMoney(row.subtotal || 0)),
            escapeCSV(discountDisplay),
            escapeCSV(`${row.vat || 0}%`),
            escapeCSV(formatMoney(row.total || 0)),
            escapeCSV((row.items || []).length),
            escapeCSV(itemsSummary)
        ];
        csvLines.push(line.join(','));
    });

    const csvContent = '\uFEFF' + csvLines.join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `TEMAH_Report_${currentReportPeriod}_${getTodayKey()}.csv`;
    document.body.appendChild(a);
    a.click();
    URL.revokeObjectURL(url);
    a.remove();
}

function initReportsEvents() {
    const periodWrap = document.getElementById('reports-period');
    if (!periodWrap) return;
    periodWrap.querySelectorAll('.report-period-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            periodWrap.querySelectorAll('.report-period-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentReportPeriod = btn.dataset.period;
            renderReports();
        });
    });
    const exportBtn = document.getElementById('export-report-btn');
    if (exportBtn) exportBtn.addEventListener('click', exportReportCSV);
    renderReports();
}

function loadFromHistory(id) {
    if (!confirm('Load this saved invoice? It will replace the current one.')) return;
    const history = JSON.parse(localStorage.getItem(STORAGE_KEYS.history) || '[]');
    const item = history.find(h => h.id === id);
    if (!item) return;

    document.getElementById('invoice-items').innerHTML = '';
    currentInvoiceNumber = item.invoiceNumber;
    document.getElementById('invoice-number').textContent = item.invoiceNumber;
    document.getElementById('currency').value = item.currency || 'GH₵';
    document.getElementById('customer-name').value = item.customerName || '';
    document.getElementById('customer-phone').value = item.customerPhone || '';
    document.getElementById('cashier-input').value = item.cashier || '';
    
    if (item.paymentMethod) {
        document.getElementById('payment-method').value = item.paymentMethod;
        document.getElementById('payment-method-print').textContent = item.paymentMethod;
    }
    setPaymentStatus(item.paymentStatus || 'PAID');

    setSignature('manager', item.managerSignature || null);
    setSignature('customer', item.customerSignature || null);

    currentDiscountType = item.discountType || 'percent';
    updateDiscountTypeDisplay();
    document.getElementById('discount-input').value = item.discount || 0;
    document.getElementById('vat-input').value = item.vat !== undefined ? item.vat : 0;
    
    if (item.items.length === 0) {
        addItemRow('', '', '');
    } else {
        item.items.forEach(i => addItemRow(i.description, i.quantity, i.price));
    }
    
    updateTableHeaders();
    updateTotal();
    alert(`Loaded invoice #${item.invoiceNumber}.`);
}

function deleteFromHistory(id) {
    if (!confirm('Delete this saved invoice?')) return;
    const history = JSON.parse(localStorage.getItem(STORAGE_KEYS.history) || '[]');
    localStorage.setItem(STORAGE_KEYS.history, JSON.stringify(history.filter(h => h.id !== id)));
    renderHistory();
}

function markHistoryPaid(id) {
    const history = JSON.parse(localStorage.getItem(STORAGE_KEYS.history) || '[]');
    const item = history.find(h => h.id === id);
    if (!item) return;
    if ((item.paymentStatus || 'PAID') === 'PAID') {
        renderHistory();
        return;
    }
    item.paymentStatus = 'PAID';
    localStorage.setItem(STORAGE_KEYS.history, JSON.stringify(history));
    if (currentInvoiceNumber === item.invoiceNumber && currentPaymentStatus !== 'PAID') {
        setPaymentStatus('PAID');
    }
    renderHistory();
    alert(`Invoice #${item.invoiceNumber} marked as PAID.`);
}

/* ==========================================================================
   Export to CSV / Excel for Accounting
   ========================================================================== */

function exportToCSV() {
    const history = JSON.parse(localStorage.getItem(STORAGE_KEYS.history) || '[]');
    
    let rowsToExport = [];
    if (history.length > 0) {
        rowsToExport = history;
    } else {
        const currentItems = getItems();
        if (currentItems.length === 0) {
            alert('There are no saved invoices or items to export.');
            return;
        }
        let subtotal = 0;
        currentItems.forEach(i => { subtotal += i.quantity * i.price; });
        const rawDiscount = parseFloat(document.getElementById('discount-input').value) || 0;
        const vatPercent = clamp(parseFloat(document.getElementById('vat-input').value) || 0, 0, 100);
        let discountAmount = currentDiscountType === 'percent' ? subtotal * (rawDiscount / 100) : rawDiscount;
        const total = (subtotal - discountAmount) * (1 + vatPercent / 100);

        rowsToExport = [{
            invoiceNumber: currentInvoiceNumber || document.getElementById('invoice-number').textContent,
            savedAt: new Date().toLocaleString(),
            customerName: document.getElementById('customer-name').value,
            customerPhone: document.getElementById('customer-phone').value,
            cashier: document.getElementById('cashier-input').value,
            paymentMethod: document.getElementById('payment-method').value,
            paymentStatus: currentPaymentStatus,
            currency: getCurrency(),
            subtotal: subtotal,
            discount: rawDiscount,
            discountType: currentDiscountType,
            vat: vatPercent,
            total: total,
            items: currentItems
        }];
    }

    const headers = [
        'Invoice No',
        'Date & Time',
        'Customer Name',
        'Customer Phone',
        'Cashier',
        'Payment Method',
        'Payment Status',
        'Currency',
        'Subtotal',
        'Discount Applied',
        'VAT %',
        'Grand Total',
        'Item Count',
        'Items Summary'
    ];

    const escapeCSV = (str) => {
        const val = (str === null || str === undefined) ? '' : String(str);
        return `"${val.replace(/"/g, '""')}"`;
    };

    const csvLines = [headers.join(',')];

    rowsToExport.forEach(row => {
        const itemsSummary = (row.items || [])
            .map(i => `${i.description} (Qty: ${i.quantity}, Price: ${i.price})`)
            .join('; ');

        const discountDisplay = row.discountType === 'percent' 
            ? `${row.discount}%` 
            : `${row.currency} ${formatMoney(row.discount)}`;

        const line = [
            escapeCSV(row.invoiceNumber),
            escapeCSV(row.savedAt),
            escapeCSV(row.customerName),
            escapeCSV(row.customerPhone),
            escapeCSV(row.cashier),
            escapeCSV(row.paymentMethod || 'Cash'),
            escapeCSV(row.paymentStatus || 'PAID'),
            escapeCSV(row.currency),
            escapeCSV(formatMoney(row.subtotal || 0)),
            escapeCSV(discountDisplay),
            escapeCSV(`${row.vat || 0}%`),
            escapeCSV(formatMoney(row.total || 0)),
            escapeCSV((row.items || []).length),
            escapeCSV(itemsSummary)
        ];
        csvLines.push(line.join(','));
    });

    const csvContent = '\uFEFF' + csvLines.join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `TEMAH_Invoices_${getTodayKey()}.csv`;
    document.body.appendChild(a);
    a.click();
    URL.revokeObjectURL(url);
    a.remove();
}

/* ==========================================================================
   Print & PDF Generation
   ========================================================================== */

function printHistoryItem(item) {
    const hiddenPrint = document.createElement('div');
    hiddenPrint.className = 'hidden-print';
    hiddenPrint.innerHTML = buildInvoiceHTML(item);

    const paperSize = item.paperSize || getPaperSize();
    if (paperSize === '10cm') {
        document.body.classList.add('paper-10cm-mode');
        let styleTag = document.getElementById('dynamic-page-size');
        if (!styleTag) {
            styleTag = document.createElement('style');
            styleTag.id = 'dynamic-page-size';
            document.head.appendChild(styleTag);
        }
        styleTag.textContent = '@page { size: 100mm auto !important; margin: 2mm 3mm !important; }';
    } else {
        document.body.classList.remove('paper-10cm-mode');
        let styleTag = document.getElementById('dynamic-page-size');
        if (styleTag) styleTag.textContent = '@page { size: auto !important; margin: 8mm !important; }';
    }

    document.body.appendChild(hiddenPrint);
    const screenInvoice = document.getElementById('invoice');
    screenInvoice.classList.add('history-print-mode');
    const originalTitle = document.title;
    document.title = `Invoice_${item.invoiceNumber}_Temah`;

    const cleanupPrintLayer = () => {
        hiddenPrint.remove();
        screenInvoice.classList.remove('history-print-mode');
        document.body.classList.remove('paper-10cm-mode');
        document.title = originalTitle;
    };
    window.addEventListener('afterprint', cleanupPrintLayer, { once: true });
    window.print();
}

function renderLogoHTML() {
    const dataUrl = localStorage.getItem(STORAGE_KEYS.logo);
    if (dataUrl) {
        return `<img id="logo-img" alt="Company Logo" src="${dataUrl}">`;
    }
    return '';
}

function renderWatermarkHTML() {
    const dataUrl = localStorage.getItem(STORAGE_KEYS.logo);
    if (dataUrl) {
        return `<div class="invoice-watermark"><img alt="" src="${dataUrl}"></div>`;
    }
    return '';
}

function printInvoice() {
    if (!validateInputs()) return;

    // 1. Automatically save to history
    saveToHistory(true);

    const invNum = document.getElementById('invoice-number').textContent || '00001';
    const originalTitle = document.title;
    document.title = `Invoice_${invNum}_Temah`;

    const paperSize = getPaperSize();
    if (paperSize === '10cm') {
        document.body.classList.add('paper-10cm-mode');
        let styleTag = document.getElementById('dynamic-page-size');
        if (!styleTag) {
            styleTag = document.createElement('style');
            styleTag.id = 'dynamic-page-size';
            document.head.appendChild(styleTag);
        }
        styleTag.textContent = '@page { size: 100mm auto !important; margin: 2mm 3mm !important; }';
    } else {
        document.body.classList.remove('paper-10cm-mode');
        let styleTag = document.getElementById('dynamic-page-size');
        if (styleTag) styleTag.textContent = '@page { size: auto !important; margin: 8mm !important; }';
    }

    // 2. Clear and prepare next invoice after print
    const afterPrintHandler = () => {
        window.removeEventListener('afterprint', afterPrintHandler);
        document.title = originalTitle;
        document.body.classList.remove('paper-10cm-mode');
        // Automatically start fresh new invoice for the next customer
        newInvoice(false);
    };
    window.addEventListener('afterprint', afterPrintHandler);

    window.print();
    setTimeout(() => { 
        document.title = originalTitle;
        document.body.classList.remove('paper-10cm-mode');
    }, 1000);
}

async function saveAsImage() {
    if (!validateInputs()) return;

    const btn = document.getElementById('save-image-btn');
    const origText = btn ? btn.innerHTML : '';
    if (btn) {
        btn.innerHTML = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg> Capturing...`;
        btn.disabled = true;
    }

    // The invoice element
    const invoiceEl = document.querySelector('.invoice');
    if (!invoiceEl) {
        if (btn) { btn.innerHTML = origText; btn.disabled = false; }
        alert('Could not find the invoice to capture.');
        return;
    }

    // Temporarily force A4 mode for the capture
    const paperSize = getPaperSize();
    const wasSmall = document.body.classList.contains('paper-10cm-mode');

    // A4 at 150dpi for sharp mobile viewing — width 794px (~A4 pixel width)
    const A4_W = 794;
    const scale = A4_W / invoiceEl.offsetWidth;

    try {
        if (!window.html2canvas) throw new Error('html2canvas not loaded');

        const canvas = await html2canvas(invoiceEl, {
            scale: Math.max(scale, 2),   // at least 2x for crispness
            useCORS: true,
            allowTaint: true,
            backgroundColor: '#ffffff',
            logging: false,
            onclone: (doc) => {
                // ── Hide toolbar / interactive UI elements ──────────────
                doc.querySelectorAll('.no-print').forEach(el => el.style.display = 'none');
                doc.querySelectorAll('.calc-input-group, .percent-sign, .discount-toggle-btn').forEach(el => {
                    el.style.display = 'none';
                });
                doc.querySelectorAll('.summary-line.calc-row').forEach(el => {
                    el.style.display = 'flex';
                });

                // ── Fix html2canvas input rendering: replace all inputs
                //    with styled divs so text doesn't sink or disappear ──
                doc.querySelectorAll('input, textarea, select').forEach(input => {
                    const computed = window.getComputedStyle(input);
                    const div = doc.createElement('div');

                    // Copy the visible value text
                    if (input.tagName === 'SELECT') {
                        div.textContent = input.options[input.selectedIndex]?.text || '';
                    } else {
                        div.textContent = input.value || input.placeholder || '';
                        if (!input.value && input.placeholder) {
                            div.style.color = '#9ca3af'; // placeholder grey
                        }
                    }

                    // Mirror dimensions and typography exactly
                    div.style.display = 'flex';
                    div.style.alignItems = 'center';
                    div.style.width = computed.width;
                    div.style.minWidth = computed.minWidth;
                    div.style.height = computed.height;
                    div.style.minHeight = computed.minHeight;
                    div.style.padding = computed.padding;
                    div.style.margin = computed.margin;
                    div.style.border = computed.border;
                    div.style.borderRadius = computed.borderRadius;
                    div.style.background = computed.background || '#f8fafc';
                    div.style.fontFamily = computed.fontFamily;
                    div.style.fontSize = computed.fontSize;
                    div.style.fontWeight = computed.fontWeight;
                    div.style.color = div.style.color || computed.color;
                    div.style.lineHeight = 'normal';
                    div.style.boxSizing = 'border-box';
                    div.style.overflow = 'hidden';
                    div.style.whiteSpace = 'nowrap';
                    div.style.textOverflow = 'ellipsis';

                    input.parentNode.replaceChild(div, input);
                });
            }
        });

        // ── B&W or Color based on user toggle ────────────────────────────
        const isBW = document.getElementById('img-mode-bw')?.classList.contains('active') !== false
            && !document.getElementById('img-mode-color')?.classList.contains('active');

        let finalCanvas = canvas;
        if (isBW) {
            const bwCanvas = document.createElement('canvas');
            bwCanvas.width = canvas.width;
            bwCanvas.height = canvas.height;
            const bwCtx = bwCanvas.getContext('2d');
            bwCtx.drawImage(canvas, 0, 0);
            const imgData = bwCtx.getImageData(0, 0, bwCanvas.width, bwCanvas.height);
            const data = imgData.data;
            for (let i = 0; i < data.length; i += 4) {
                const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
                data[i] = data[i + 1] = data[i + 2] = gray;
            }
            bwCtx.putImageData(imgData, 0, 0);
            finalCanvas = bwCanvas;
        }
        // ─────────────────────────────────────────────────────────────────

        // Convert to PNG blob and trigger download
        finalCanvas.toBlob((blob) => {
            if (!blob) {
                alert('Failed to generate image. Please try again.');
                return;
            }
            const invNum = document.getElementById('invoice-number').textContent || 'Invoice';
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `Invoice_${invNum}_TEMAH.png`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }, 'image/png');
    } catch (err) {
        console.error('Save as Image failed:', err);
        alert('Could not save image. Make sure html2canvas is loaded (you may need an internet connection the first time).');
    } finally {
        if (btn) { btn.innerHTML = origText; btn.disabled = false; }
    }
}

/* ==========================================================================
   JSON File Save & Load
   ========================================================================== */

/* ==========================================================================
   Full History JSON Backup, Smart Merge & Load
   ========================================================================== */

function getCurrentInvoiceData() {
    let subtotal = 0;
    const items = getItems();
    items.forEach(i => { subtotal += i.quantity * i.price; });
    const rawDiscount = parseFloat(document.getElementById('discount-input').value) || 0;
    const vatPercent = clamp(parseFloat(document.getElementById('vat-input').value) || 0, 0, 100);
    let discountAmount = currentDiscountType === 'percent' ? subtotal * (clamp(rawDiscount, 0, 100) / 100) : Math.min(subtotal, Math.max(0, rawDiscount));
    const afterDiscount = Math.max(0, subtotal - discountAmount);
    const total = afterDiscount * (1 + vatPercent / 100);

    return {
        id: Date.now(),
        savedAt: new Date().toLocaleString(),
        invoiceNumber: currentInvoiceNumber || document.getElementById('invoice-number').textContent,
        currency: getCurrency(),
        customerName: document.getElementById('customer-name').value,
        customerPhone: document.getElementById('customer-phone').value,
        cashier: document.getElementById('cashier-input').value,
        paymentMethod: document.getElementById('payment-method').value,
        paymentStatus: currentPaymentStatus,
        managerSignature: currentManagerSig,
        customerSignature: currentCustomerSig,
        discountType: currentDiscountType,
        discount: rawDiscount,
        discountAmount: discountAmount,
        vat: vatPercent,
        paperSize: getPaperSize(),
        subtotal: subtotal,
        items: items,
        total: total
    };
}

function saveFullBackup() {
    const history = JSON.parse(localStorage.getItem(STORAGE_KEYS.history) || '[]');
    const current = getCurrentInvoiceData();
    const backup = {
        app: 'TEMAH_INVOICE',
        version: '2.0',
        exportedAt: new Date().toISOString(),
        deviceId: getDeviceId(),
        history: history,
        currentInvoice: current
    };

    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `TEMAH_Backup_${getDeviceId()}_${getTodayKey()}.json`;
    document.body.appendChild(a);
    a.click();
    URL.revokeObjectURL(url);
    a.remove();
}

function saveToFile() {
    saveFullBackup();
}

function mergeFromFile(event) {
    const file = event.target.files[0];
    event.target.value = '';
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const data = JSON.parse(e.target.result);
            let importedInvoices = [];
            if (Array.isArray(data)) {
                importedInvoices = data;
            } else if (data.history && Array.isArray(data.history)) {
                importedInvoices = data.history;
                if (data.currentInvoice && data.currentInvoice.items && data.currentInvoice.items.length > 0) {
                    importedInvoices.push(data.currentInvoice);
                }
            } else if (data.items && Array.isArray(data.items)) {
                importedInvoices = [data];
            } else {
                throw new Error('Unrecognized backup file format.');
            }

            mergeHistoryInvoices(importedInvoices);
        } catch (err) {
            alert('Could not merge file: ' + err.message);
        }
    };
    reader.readAsText(file);
}

function mergeHistoryInvoices(importedInvoices) {
    if (!importedInvoices || !importedInvoices.length) {
        alert('No invoice records found to merge.');
        return;
    }

    const currentHistory = JSON.parse(localStorage.getItem(STORAGE_KEYS.history) || '[]');
    let addedCount = 0;
    let updatedCount = 0;

    importedInvoices.forEach(imported => {
        if (!imported.invoiceNumber && !imported.total) return;
        const existingIdx = currentHistory.findIndex(h => 
            (h.invoiceNumber && imported.invoiceNumber && h.invoiceNumber === imported.invoiceNumber) ||
            (h.id && imported.id && h.id === imported.id)
        );

        if (existingIdx >= 0) {
            currentHistory[existingIdx] = Object.assign({}, currentHistory[existingIdx], imported);
            updatedCount++;
        } else {
            if (!imported.id) imported.id = Date.now() + Math.floor(Math.random() * 100000);
            currentHistory.unshift(imported);
            addedCount++;
        }
    });

    localStorage.setItem(STORAGE_KEYS.history, JSON.stringify(currentHistory));
    filterRenderHistory();
    alert(`History Merge Complete!\n\n✔ Added: ${addedCount} new invoice(s)\n✔ Updated: ${updatedCount} existing invoice(s)\n\nTotal Invoices in History: ${currentHistory.length}`);
}

function loadFromFile(event) {
    const file = event.target.files[0];
    event.target.value = '';
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const data = JSON.parse(e.target.result);
            const state = data.currentInvoice || (data.items ? data : null);
            if (!state || !state.items || !Array.isArray(state.items)) {
                if (data.history && Array.isArray(data.history) && data.history.length > 0) {
                    mergeHistoryInvoices(data.history);
                    return;
                }
                throw new Error('Invalid file format.');
            }
            document.getElementById('invoice-items').innerHTML = '';
            currentInvoiceNumber = state.invoiceNumber;
            document.getElementById('invoice-number').textContent = state.invoiceNumber;
            document.getElementById('currency').value = state.currency || 'GH₵';
            document.getElementById('customer-name').value = state.customerName || '';
            document.getElementById('customer-phone').value = state.customerPhone || '';
            document.getElementById('cashier-input').value = state.cashier || '';
            
            if (state.paymentMethod) {
                document.getElementById('payment-method').value = state.paymentMethod;
                document.getElementById('payment-method-print').textContent = state.paymentMethod;
            }
            setPaymentStatus(state.paymentStatus || 'PAID');

            setSignature('manager', state.managerSignature || null);
            setSignature('customer', state.customerSignature || null);

            currentDiscountType = state.discountType || 'percent';
            updateDiscountTypeDisplay();
            document.getElementById('discount-input').value = state.discount || 0;
            document.getElementById('vat-input').value = state.vat !== undefined ? state.vat : 0;
            
            if (state.items.length === 0) {
                addItemRow('', '', '');
            } else {
                state.items.forEach(i => addItemRow(i.description, i.quantity, i.price));
            }
            updateTableHeaders();
            updateTotal();
            alert(`Invoice #${state.invoiceNumber} loaded from file.`);
        } catch (err) {
            alert(`Could not load file: ${err.message}`);
        }
    };
    reader.readAsText(file);
}

/* ==========================================================================
   Logo Management
   ========================================================================== */

function setLogo(event) {
    const file = event.target.files[0];
    event.target.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
        localStorage.setItem(STORAGE_KEYS.logo, e.target.result);
        displayLogo(e.target.result);
    };
    reader.readAsDataURL(file);
}

function displayLogo(dataUrl) {
    const img = document.getElementById('logo-img');
    const watermarkImg = document.getElementById('watermark-img');
    const placeholder = document.getElementById('logo-placeholder');
    const removeBtn = document.getElementById('remove-logo-btn');

    if (dataUrl) {
        img.src = dataUrl;
        img.hidden = false;
        if (watermarkImg) {
            watermarkImg.src = dataUrl;
            watermarkImg.hidden = false;
        }
        placeholder.hidden = true;
        removeBtn.hidden = false;
    } else {
        img.hidden = true;
        if (watermarkImg) {
            watermarkImg.hidden = true;
            watermarkImg.src = '';
        }
        placeholder.hidden = false;
        removeBtn.hidden = true;
    }
}

function restoreLogo() {
    displayLogo(localStorage.getItem(STORAGE_KEYS.logo));
}

/* ==========================================================================
   Unified Invoice HTML Builder (Pixel-Perfect Preview & Print)
   ========================================================================== */

function getCurrentInvoiceData() {
    const items = getItems();
    let subtotal = 0;
    items.forEach(i => { subtotal += i.quantity * i.price; });
    const rawDiscount = parseFloat(document.getElementById('discount-input').value) || 0;
    const vatPercent = clamp(parseFloat(document.getElementById('vat-input').value) || 0, 0, 100);
    let discountAmount = currentDiscountType === 'fixed' ? Math.min(subtotal, rawDiscount) : subtotal * (rawDiscount / 100);
    const afterDiscount = Math.max(0, subtotal - discountAmount);
    const vatAmount = afterDiscount * (vatPercent / 100);
    const total = afterDiscount + vatAmount;

    return {
        invoiceNumber: currentInvoiceNumber || document.getElementById('invoice-number').textContent,
        savedAt: `${document.getElementById('invoice-date').textContent} ${document.getElementById('invoice-time').textContent}`,
        customerName: document.getElementById('customer-name').value,
        customerPhone: document.getElementById('customer-phone').value,
        cashier: document.getElementById('cashier-input').value,
        paymentMethod: document.getElementById('payment-method').value,
        paymentStatus: currentPaymentStatus,
        currency: getCurrency(),
        managerSignature: currentManagerSig,
        customerSignature: currentCustomerSig,
        discount: rawDiscount,
        discountType: currentDiscountType,
        discountAmount: discountAmount,
        vat: vatPercent,
        vatAmount: vatAmount,
        paperSize: getPaperSize(),
        subtotal: subtotal,
        total: total,
        items: items
    };
}

function buildInvoiceHTML(item) {
    const subtotal = item.subtotal !== undefined ? item.subtotal : (item.items || []).reduce((s, i) => s + (i.quantity * i.price), 0);
    const rawDiscount = item.discount || 0;
    const discountAmount = item.discountAmount !== undefined ? item.discountAmount : (item.discountType === 'fixed' ? Math.min(subtotal, rawDiscount) : subtotal * (rawDiscount / 100));
    const afterDiscount = Math.max(0, subtotal - discountAmount);
    const vatPercent = item.vat !== undefined ? item.vat : 0;
    const vatAmount = item.vatAmount !== undefined ? item.vatAmount : afterDiscount * (vatPercent / 100);
    const total = item.total !== undefined ? item.total : (afterDiscount + vatAmount);
    const curr = item.currency || getCurrency();
    const paperSize = item.paperSize || getPaperSize();
    const is10cm = (paperSize === '10cm');

    const bizInfo = JSON.parse(localStorage.getItem(STORAGE_KEYS.businessInfo) || '{}');
    const bizAddress = bizInfo.address || 'Abeka Main St., Abeka - Accra';
    const bizPhone = bizInfo.phone || '+233 24 463 1680';
    const bizEmail = bizInfo.email || 'temahfingerofgod@gmail.com';
    const logoDataUrl = localStorage.getItem(STORAGE_KEYS.logo);

    const dateStr = item.savedAt || `${formatDate(new Date())} ${formatTime(new Date())}`;

    return `
        <div class="invoice ${is10cm ? 'paper-10cm' : ''}">
            <div class="top-dots-pattern"></div>
            <div class="invoice-header">
                <div class="logo-area-wrapper">
                    <div class="logo-area">
                        ${logoDataUrl ? `<img id="logo-img" alt="Company Logo" src="${logoDataUrl}">` : ''}
                    </div>
                </div>
                <div class="business-info">
                    <h1 class="brand-title">TEMAH</h1>
                    <h2 class="brand-subtitle">FINGER OF GOD</h2>
                    <div class="brand-pill">
                        <span>QUALITY</span>
                        <span class="dot">•</span>
                        <span>TRUST</span>
                        <span class="dot">•</span>
                        <span>AFFORDABLE</span>
                    </div>
                    <div class="contact-details">
                        <p class="contact-item"><span>📍 ${bizAddress}</span></p>
                        <p class="contact-item"><span>📞 ${bizPhone}</span></p>
                        <p class="contact-item"><span>✉ ${bizEmail}</span></p>
                    </div>
                    <p class="tagline-cursive">Thank you for shopping with us!</p>
                </div>
                <div class="invoice-badge-wrapper">
                    <div class="invoice-official-badge">
                        <div class="badge-icon-circle">
                            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 002 1.61h9.72a2 2 0 002-1.61L23 6H6"/></svg>
                        </div>
                        <div class="badge-text-group">
                            <h3 class="badge-heading">INVOICE</h3>
                            <span class="badge-subheading">— OFFICIAL RECEIPT —</span>
                        </div>
                    </div>
                </div>
            </div>

            <div class="cards-grid">
                <div class="info-card customer-card">
                    <div class="card-header-tab">
                        <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>
                        <span>Customer (Optional)</span>
                    </div>
                    <div class="card-body">
                        <div class="form-row"><label>Customer Name:</label><span style="font-weight:700; color:#0f172a;">${item.customerName || 'N/A'}</span></div>
                        <div class="form-row"><label>Phone:</label><span style="font-weight:700; color:#0f172a;">${item.customerPhone || 'N/A'}</span></div>
                    </div>
                </div>
                <div class="info-card invoice-details-card">
                    <div class="card-header-tab">
                        <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M19 3h-1V1h-2v2H8V1H6v2H5c-1.11 0-1.99.9-1.99 2L3 19c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V8h14v11zM7 10h5v5H7z"/></svg>
                        <span>Invoice Details</span>
                    </div>
                    <div class="card-body">
                        <div class="meta-row"><span class="meta-label">Invoice No:</span><span class="meta-value" style="font-family:var(--font-heading); font-size:14px; font-weight:800; color:#032e22;">${item.invoiceNumber}</span></div>
                        <div class="meta-row"><span class="meta-label">Date & Time:</span><span class="meta-value">${dateStr}</span></div>
                        <div class="meta-row"><span class="meta-label">Cashier:</span><span class="meta-value">${item.cashier || '........................'}</span></div>
                        <div class="meta-row payment-status-row">
                            <div class="payment-method-group"><span class="meta-label">Payment:</span><span style="font-weight:700;">${item.paymentMethod || 'Cash'}</span></div>
                            <div class="status-stamp status-${(item.paymentStatus || 'PAID').toLowerCase()}">${item.paymentStatus === 'PAID' ? '✔ PAID' : item.paymentStatus === 'PENDING' ? '⏳ PENDING' : '✖ UNPAID'}</div>
                        </div>
                    </div>
                </div>
            </div>

            <div class="table-container">
                ${logoDataUrl ? `<div class="invoice-watermark"><img alt="" src="${logoDataUrl}"></div>` : ''}
                <table class="invoice-table">
                    <thead>
                        <tr>
                            <th class="col-num">#</th>
                            <th class="col-desc">Item Description</th>
                            <th class="col-qty">Qty</th>
                            <th class="col-price">Unit Price (${curr})</th>
                            <th class="col-total">Total (${curr})</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${(item.items || []).map((i, idx) => `
                            <tr>
                                <td class="col-num">${idx + 1}</td>
                                <td class="col-desc" style="font-weight:600;">${i.description || '—'}</td>
                                <td class="col-qty" style="font-weight:700;">${i.quantity}</td>
                                <td class="col-price" style="font-weight:700;">${formatMoney(i.price)}</td>
                                <td class="col-total">${formatMoney(i.quantity * i.price)}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>

            <div class="bottom-section">
                <div class="notes-box">
                    <div class="notes-header">
                        <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H5.17L4 17.17V4h16v12z"/><path d="M12 6h2v5h-2zm0 6h2v2h-2z"/></svg>
                        <strong>Note:</strong>
                    </div>
                    <ul class="notes-list">
                        <li><svg class="check-icon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg><span>Goods sold are non-refundable.</span></li>
                        <li><svg class="check-icon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg><span>Please keep this invoice for any exchange.</span></li>
                        <li><svg class="check-icon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg><span>We appreciate your business!</span></li>
                    </ul>
                </div>
                <div class="thank-you-center">
                    <div class="thank-you-text">Thank You!</div>
                    <svg class="smiley-smile" viewBox="0 0 50 20" width="45" height="18">
                        <path d="M 5,5 Q 25,22 45,5" fill="none" stroke="#111" stroke-width="2.5" stroke-linecap="round"/>
                        <circle cx="12" cy="4" r="1.5" fill="#111"/>
                        <circle cx="38" cy="4" r="1.5" fill="#111"/>
                    </svg>
                </div>
                <div class="summary-box">
                    <div class="summary-line"><span class="sum-label">Subtotal:</span><span class="sum-value">${curr} ${formatMoney(subtotal)}</span></div>
                    <div class="summary-line"><span class="sum-label">Discount:</span><span class="sum-value">${item.discountType === 'fixed' ? `${curr} ${formatMoney(rawDiscount)}` : `${rawDiscount}%`} (${curr} ${formatMoney(discountAmount)})</span></div>
                    <div class="summary-line"><span class="sum-label">VAT (${vatPercent}%):</span><span class="sum-value">${curr} ${formatMoney(vatAmount)}</span></div>
                    <div class="grand-total-banner">
                        <span class="grand-label">GRAND TOTAL:</span>
                        <div class="grand-badge">${curr} ${formatMoney(total)}</div>
                    </div>
                </div>
            </div>

            <div class="signatures-wrapper">
                <div class="signature-block">
                    <span class="sig-title">Manager's Signature</span>
                    <div class="sig-slot">${item.managerSignature ? `<img class="sig-img" alt="" src="${item.managerSignature}">` : ''}</div>
                    <div class="sig-underline"></div>
                </div>
                <div class="signature-block right">
                    <span class="sig-title">Customer's Signature</span>
                    <div class="sig-slot">${item.customerSignature ? `<img class="sig-img" alt="" src="${item.customerSignature}">` : ''}</div>
                    <div class="sig-underline"></div>
                </div>
            </div>

            <div class="bottom-banner-wave">
                <div class="banner-gold-line left"></div>
                <div class="banner-slogan">“ YOUR TRUST MAKES US GROW ”</div>
                <div class="banner-gold-line right"></div>
            </div>
        </div>
    `;
}

function openPrintPreview() {
    const overlay = document.getElementById('print-preview-overlay');
    const paper = document.getElementById('print-preview-paper');

    paper.innerHTML = buildInvoiceHTML(getCurrentInvoiceData());

    overlay.hidden = false;
    requestAnimationFrame(() => {
        overlay.classList.add('visible');
    });
}

function closePrintPreview() {
    const overlay = document.getElementById('print-preview-overlay');
    overlay.classList.remove('visible');
    setTimeout(() => {
        overlay.hidden = true;
    }, 320);
}

function previewHistoryItem(item) {
    const overlay = document.getElementById('print-preview-overlay');
    const paper = document.getElementById('print-preview-paper');

    paper.innerHTML = buildInvoiceHTML(item);

    overlay.hidden = false;
    requestAnimationFrame(() => {
        overlay.classList.add('visible');
    });
}

/* ==========================================================================
   Product Autocomplete — Save & Suggest Frequently Used Items
   ========================================================================== */

function getProductCatalog() {
    return JSON.parse(localStorage.getItem(STORAGE_KEYS.productCatalog) || '[]');
}

function saveProductToAutocomplete(name, price) {
    if (!name || !name.trim()) return;
    const catalog = getProductCatalog();
    const existing = catalog.find(p => p.name.toLowerCase() === name.toLowerCase().trim());
    if (existing) {
        // Update usage count and optionally price
        existing.count = (existing.count || 0) + 1;
        if (price) existing.price = price;
    } else {
        catalog.push({ name: name.trim(), price: price || '', count: 1 });
    }
    // Keep top 100 most used products
    catalog.sort((a, b) => (b.count || 0) - (a.count || 0));
    if (catalog.length > 100) catalog.length = 100;
    localStorage.setItem(STORAGE_KEYS.productCatalog, JSON.stringify(catalog));
}

function showAutocomplete(input, wrapper) {
    hideAutocomplete(wrapper);
    const query = input.value.toLowerCase().trim();
    if (!query || query.length < 1) return;

    const catalog = getProductCatalog();
    const matches = catalog.filter(p => p.name.toLowerCase().includes(query)).slice(0, 8);
    if (matches.length === 0) return;

    const dropdown = document.createElement('div');
    dropdown.className = 'autocomplete-dropdown';

    matches.forEach((product, idx) => {
        const item = document.createElement('div');
        item.className = 'autocomplete-item';
        item.dataset.name = product.name;
        item.dataset.price = product.price || '';
        
        // Highlight matched part
        const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
        const highlightedName = product.name.replace(regex, '<mark>$1</mark>');
        
        item.innerHTML = `
            <span class="ac-name">${highlightedName}</span>
            ${product.price ? `<span class="ac-price">${getCurrency()} ${formatMoney(parseFloat(product.price))}</span>` : ''}
        `;
        item.addEventListener('mousedown', (e) => {
            e.preventDefault();
            input.value = product.name;
            const priceInput = wrapper.closest('tr') ? wrapper.closest('tr').querySelector('.table-price-input') : null;
            if (priceInput && product.price && !priceInput.value) {
                priceInput.value = product.price;
            }
            hideAutocomplete(wrapper);
            updateTotal();
            input.focus();
        });
        dropdown.appendChild(item);
    });

    wrapper.style.position = 'relative';
    wrapper.appendChild(dropdown);
}

function hideAutocomplete(wrapper) {
    const existing = wrapper.querySelector('.autocomplete-dropdown');
    if (existing) existing.remove();
}

/* ==========================================================================
   Offline QR Code Engine & Multi-Device Sync (100% Offline)
   ========================================================================== */

let currentQRInvoice = null;

function compressInvoiceForQR(inv) {
    const minObj = {
        n: inv.invoiceNumber,
        d: inv.savedAt || document.getElementById('invoice-date').textContent,
        c: inv.customerName || '',
        p: inv.customerPhone || '',
        k: inv.cashier || '',
        m: inv.paymentMethod || 'Cash',
        s: inv.paymentStatus || 'PAID',
        cur: inv.currency || 'GH₵',
        dt: inv.discountType === 'fixed' ? 'f' : 'p',
        dc: inv.discount || 0,
        v: inv.vat || 0,
        t: inv.total || 0,
        i: (inv.items || []).map(i => [i.description || '', i.quantity || 1, i.price || 0])
    };
    return 'TEM:' + btoa(unescape(encodeURIComponent(JSON.stringify(minObj))));
}

function decompressInvoiceFromQR(codeStr) {
    if (!codeStr) throw new Error('Empty QR data.');
    let trimmed = codeStr.trim();
    if (trimmed.startsWith('TEM:')) {
        const base64 = trimmed.substring(4);
        const jsonStr = decodeURIComponent(escape(atob(base64)));
        const m = JSON.parse(jsonStr);
        return {
            id: Date.now() + Math.floor(Math.random() * 10000),
            savedAt: m.d || new Date().toLocaleString(),
            invoiceNumber: m.n,
            customerName: m.c || '',
            customerPhone: m.p || '',
            cashier: m.k || '',
            paymentMethod: m.m || 'Cash',
            paymentStatus: m.s || 'PAID',
            currency: m.cur || 'GH₵',
            discountType: m.dt === 'f' ? 'fixed' : 'percent',
            discount: m.dc || 0,
            vat: m.v || 0,
            total: m.t || 0,
            items: (m.i || []).map(row => ({
                description: row[0],
                quantity: row[1],
                price: row[2]
            }))
        };
    } else {
        // Fallback standard JSON
        return JSON.parse(trimmed);
    }
}

function initQRModalEvents() {
    const closeBtn = document.getElementById('qr-modal-close');
    if (closeBtn) closeBtn.addEventListener('click', closeQRModal);

    const overlay = document.getElementById('qr-modal-overlay');
    if (overlay) {
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) closeQRModal();
        });
    }

    document.querySelectorAll('.qr-tab-btn').forEach(btn => {
        btn.addEventListener('click', () => switchQRTab(btn.dataset.tab));
    });

    const copyBtn = document.getElementById('qr-copy-code-btn');
    if (copyBtn) {
        copyBtn.addEventListener('click', () => {
            if (!currentQRInvoice) currentQRInvoice = getCurrentInvoiceData();
            const code = compressInvoiceForQR(currentQRInvoice);
            if (navigator.clipboard) {
                navigator.clipboard.writeText(code).then(() => {
                    alert('✔ Data Code copied to clipboard!\nYou can paste this code on another device to import the invoice.');
                }).catch(() => {
                    prompt('Copy this data code:', code);
                });
            } else {
                prompt('Copy this data code:', code);
            }
        });
    }

    const shareBtn = document.getElementById('qr-share-native-btn');
    if (shareBtn) {
        shareBtn.addEventListener('click', () => {
            if (!currentQRInvoice) currentQRInvoice = getCurrentInvoiceData();
            const code = compressInvoiceForQR(currentQRInvoice);
            if (navigator.share) {
                navigator.share({
                    title: `Invoice #${currentQRInvoice.invoiceNumber}`,
                    text: `Invoice #${currentQRInvoice.invoiceNumber} Data Code for TEMAH:\n\n${code}`
                }).catch(() => {});
            } else {
                alert('Native sharing is not supported on this browser. Use "Copy Data Code" instead.');
            }
        });
    }

    const startCamBtn = document.getElementById('start-camera-btn');
    if (startCamBtn) startCamBtn.addEventListener('click', startCameraQRScan);

    const stopCamBtn = document.getElementById('stop-camera-btn');
    if (stopCamBtn) stopCamBtn.addEventListener('click', stopCameraQRScan);

    const imgInput = document.getElementById('qr-image-input');
    if (imgInput) imgInput.addEventListener('change', handleQRImageUpload);

    const importPasteBtn = document.getElementById('qr-import-pasted-btn');
    if (importPasteBtn) importPasteBtn.addEventListener('click', importPastedQRData);
}

function openQRModal(invoiceToShare) {
    currentQRInvoice = invoiceToShare || getCurrentInvoiceData();
    const overlay = document.getElementById('qr-modal-overlay');
    if (!overlay) return;

    overlay.hidden = false;
    switchQRTab('show');

    // Update label
    const label = document.getElementById('qr-code-label');
    if (label) {
        label.textContent = `Invoice #${currentQRInvoice.invoiceNumber || 'NEW'} — ${currentQRInvoice.currency || 'GH₵'} ${formatMoney(currentQRInvoice.total || 0)}`;
    }

    // Render Canvas QR code
    const canvas = document.getElementById('qr-code-canvas');
    if (canvas) {
        const qrString = compressInvoiceForQR(currentQRInvoice);
        generateQRCodeCanvas(qrString, canvas, 240);
    }
}

function closeQRModal() {
    stopCameraQRScan();
    const overlay = document.getElementById('qr-modal-overlay');
    if (overlay) overlay.hidden = true;
}

function switchQRTab(tabName) {
    qrActiveTab = tabName;
    document.querySelectorAll('.qr-tab-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === tabName);
    });
    ['show', 'scan', 'code'].forEach(tab => {
        const panel = document.getElementById(`qr-panel-${tab}`);
        if (panel) panel.hidden = tab !== tabName;
    });

    if (tabName !== 'scan') {
        stopCameraQRScan();
    }
}

function startCameraQRScan() {
    const video = document.getElementById('qr-video');
    const status = document.getElementById('qr-scan-status');
    const startBtn = document.getElementById('start-camera-btn');
    const stopBtn = document.getElementById('stop-camera-btn');

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        if (status) status.textContent = 'Camera not supported in this browser. Please use "Scan from Photo" or "Paste Data Code".';
        return;
    }

    if (status) status.textContent = 'Requesting camera access...';

    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
        .then(stream => {
            qrMediaStream = stream;
            video.srcObject = stream;
            video.setAttribute('playsinline', true);
            video.play();

            if (startBtn) startBtn.hidden = true;
            if (stopBtn) stopBtn.hidden = false;
            if (status) status.textContent = 'Camera active. Point at an invoice QR code...';

            startQRScanLoop();
        })
        .catch(err => {
            console.error('Camera error:', err);
            if (status) status.textContent = 'Could not access camera (' + err.message + '). Try "Scan from Photo" or "Paste Data Code".';
        });
}

function stopCameraQRScan() {
    if (qrScanInterval) {
        cancelAnimationFrame(qrScanInterval);
        clearInterval(qrScanInterval);
        qrScanInterval = null;
    }
    if (qrMediaStream) {
        qrMediaStream.getTracks().forEach(track => track.stop());
        qrMediaStream = null;
    }
    const video = document.getElementById('qr-video');
    if (video) video.srcObject = null;

    const startBtn = document.getElementById('start-camera-btn');
    const stopBtn = document.getElementById('stop-camera-btn');
    if (startBtn) startBtn.hidden = false;
    if (stopBtn) stopBtn.hidden = true;
}

function startQRScanLoop() {
    const video = document.getElementById('qr-video');
    const status = document.getElementById('qr-scan-status');
    const scanCanvas = document.createElement('canvas');
    const scanCtx = scanCanvas.getContext('2d', { willReadFrequently: true });

    function scanFrame() {
        if (!qrMediaStream || !video || video.paused || video.ended) {
            return;
        }

        if (video.readyState >= video.HAVE_CURRENT_DATA && video.videoWidth > 0) {
            scanCanvas.width = video.videoWidth;
            scanCanvas.height = video.videoHeight;
            scanCtx.drawImage(video, 0, 0, scanCanvas.width, scanCanvas.height);
            const imageData = scanCtx.getImageData(0, 0, scanCanvas.width, scanCanvas.height);

            // 1. Try with jsQR (Universal offline pure JS QR engine)
            if (typeof jsQR !== 'undefined') {
                const code = jsQR(imageData.data, imageData.width, imageData.height, {
                    inversionAttempts: "dontInvert"
                });
                if (code && code.data && code.data.trim()) {
                    stopCameraQRScan();
                    processScannedQR(code.data.trim());
                    return;
                }
            }

            // 2. Fallback to BarcodeDetector if available
            if ('BarcodeDetector' in window) {
                try {
                    const detector = new BarcodeDetector({ formats: ['qr_code'] });
                    detector.detect(scanCanvas).then(barcodes => {
                        if (barcodes.length > 0) {
                            stopCameraQRScan();
                            processScannedQR(barcodes[0].rawValue);
                        }
                    }).catch(() => {});
                } catch (e) {}
            }
        }

        qrScanInterval = requestAnimationFrame(scanFrame);
    }

    qrScanInterval = requestAnimationFrame(scanFrame);
}

function handleQRImageUpload(event) {
    const file = event.target.files[0];
    event.target.value = '';
    if (!file) return;

    const status = document.getElementById('qr-scan-status');
    if (status) status.textContent = 'Scanning image for QR code...';

    const img = new Image();
    img.onload = async () => {
        const c = document.createElement('canvas');
        const cx = c.getContext('2d', { willReadFrequently: true });
        c.width = img.naturalWidth || img.width;
        c.height = img.naturalHeight || img.height;
        cx.drawImage(img, 0, 0, c.width, c.height);
        const imgData = cx.getImageData(0, 0, c.width, c.height);

        // 1. Try jsQR
        if (typeof jsQR !== 'undefined') {
            const code = jsQR(imgData.data, imgData.width, imgData.height, {
                inversionAttempts: "attemptBoth"
            });
            if (code && code.data && code.data.trim()) {
                processScannedQR(code.data.trim());
                return;
            }
        }

        // 2. Try BarcodeDetector
        if ('BarcodeDetector' in window) {
            try {
                const detector = new BarcodeDetector({ formats: ['qr_code'] });
                const barcodes = await detector.detect(img);
                if (barcodes.length > 0) {
                    processScannedQR(barcodes[0].rawValue);
                    return;
                }
            } catch (e) {}
        }

        if (status) status.textContent = 'Could not detect a QR code in the image. Please try pasting the data code instead.';
    };
    img.src = URL.createObjectURL(file);
}

function importPastedQRData() {
    const textarea = document.getElementById('qr-paste-textarea');
    if (!textarea || !textarea.value.trim()) {
        alert('Please paste the invoice data code first.');
        return;
    }
    processScannedQR(textarea.value.trim());
}

function processScannedQR(qrText) {
    try {
        const importedInvoice = decompressInvoiceFromQR(qrText);
        if (!importedInvoice || !importedInvoice.invoiceNumber) {
            throw new Error('Invalid invoice data structure.');
        }

        mergeHistoryInvoices([importedInvoice]);
        closeQRModal();
    } catch (err) {
        alert('Could not decode QR invoice: ' + err.message);
    }
}

/* ==========================================================================
   Self-Contained Canvas QR Code Generator (Pure JavaScript, 100% Offline)
   ========================================================================== */

function generateQRCodeCanvas(text, canvas, size = 240) {
    const qr = createQRCodeMatrix(text);
    const moduleCount = qr.length;
    const ctx = canvas.getContext('2d');
    
    canvas.width = size;
    canvas.height = size;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, size, size);

    const margin = 16;
    const cellSize = (size - margin * 2) / moduleCount;

    ctx.fillStyle = '#032e22';
    for (let r = 0; r < moduleCount; r++) {
        for (let c = 0; c < moduleCount; c++) {
            if (qr[r][c]) {
                ctx.fillRect(
                    Math.round(margin + c * cellSize),
                    Math.round(margin + r * cellSize),
                    Math.ceil(cellSize),
                    Math.ceil(cellSize)
                );
            }
        }
    }
}

/**
 * Minimalist, robust Byte-Mode QR matrix generator
 */
function createQRCodeMatrix(text) {
    // UTF-8 bytes
    const utf8Bytes = [];
    for (let i = 0; i < text.length; i++) {
        let code = text.charCodeAt(i);
        if (code < 128) {
            utf8Bytes.push(code);
        } else if (code < 2048) {
            utf8Bytes.push((code >> 6) | 192, (code & 63) | 128);
        } else {
            utf8Bytes.push((code >> 12) | 224, ((code >> 6) & 63) | 128, (code & 63) | 128);
        }
    }

    // Capacity table for ECC Level L: Version -> max byte capacity
    const capacities = [0, 17, 32, 53, 78, 106, 134, 154, 192, 230, 271, 321, 367, 425, 458, 520];
    let version = 1;
    for (let v = 1; v < capacities.length; v++) {
        if (utf8Bytes.length <= capacities[v]) {
            version = v;
            break;
        }
    }
    if (version >= capacities.length) version = 14;

    const moduleCount = version * 4 + 17;
    const matrix = Array.from({ length: moduleCount }, () => Array(moduleCount).fill(null));
    const isReserved = Array.from({ length: moduleCount }, () => Array(moduleCount).fill(false));

    // 1. Finder patterns
    function addFinder(row, col) {
        for (let r = -1; r <= 7; r++) {
            for (let c = -1; c <= 7; c++) {
                const mr = row + r;
                const mc = col + c;
                if (mr >= 0 && mr < moduleCount && mc >= 0 && mc < moduleCount) {
                    isReserved[mr][mc] = true;
                    if (r >= 0 && r <= 6 && c >= 0 && c <= 6) {
                        matrix[mr][mc] = (r === 0 || r === 6 || c === 0 || c === 6 || (r >= 2 && r <= 4 && c >= 2 && c <= 4));
                    } else {
                        matrix[mr][mc] = false;
                    }
                }
            }
        }
    }
    addFinder(0, 0);
    addFinder(0, moduleCount - 7);
    addFinder(moduleCount - 7, 0);

    // 2. Alignment patterns (version >= 2)
    const alignCoordsTable = [
        [], [], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34],
        [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50],
        [6, 30, 54], [6, 32, 58], [6, 34, 62], [6, 26, 46, 66]
    ];
    const coords = alignCoordsTable[version] || [];
    for (let i = 0; i < coords.length; i++) {
        for (let j = 0; j < coords.length; j++) {
            const ar = coords[i];
            const ac = coords[j];
            if (isReserved[ar][ac]) continue;
            for (let r = -2; r <= 2; r++) {
                for (let c = -2; c <= 2; c++) {
                    matrix[ar + r][ac + c] = (Math.abs(r) === 2 || Math.abs(c) === 2 || (r === 0 && c === 0));
                    isReserved[ar + r][ac + c] = true;
                }
            }
        }
    }

    // 3. Timing patterns
    for (let i = 8; i < moduleCount - 8; i++) {
        if (!isReserved[6][i]) {
            matrix[6][i] = (i % 2 === 0);
            isReserved[6][i] = true;
        }
        if (!isReserved[i][6]) {
            matrix[i][6] = (i % 2 === 0);
            isReserved[i][6] = true;
        }
    }

    // 4. Dark module & format info reservations
    isReserved[moduleCount - 8][8] = true;
    matrix[moduleCount - 8][8] = true;

    for (let i = 0; i < 9; i++) {
        if (i < moduleCount) isReserved[8][i] = isReserved[i][8] = true;
        if (moduleCount - 1 - i >= 0) isReserved[8][moduleCount - 1 - i] = isReserved[moduleCount - 1 - i][8] = true;
    }

    // 5. Data Bitstream & Reed-Solomon Codewords
    const bitStream = [];
    const pushBits = (val, count) => {
        for (let b = count - 1; b >= 0; b--) {
            bitStream.push((val >> b) & 1);
        }
    };

    // Mode 0100 (Byte mode)
    pushBits(4, 4);
    pushBits(utf8Bytes.length, version < 10 ? 8 : 16);
    utf8Bytes.forEach(byte => pushBits(byte, 8));

    // Total data capacity in bits for Level L
    const totalDataBytesTable = [0, 19, 34, 55, 80, 108, 136, 156, 194, 232, 274, 324, 370, 428, 461, 523];
    const totalDataBytes = totalDataBytesTable[version] || 19;
    const totalDataBits = totalDataBytes * 8;

    // Terminator
    pushBits(0, Math.min(4, totalDataBits - bitStream.length));
    while (bitStream.length % 8 !== 0) bitStream.push(0);

    // Padding bytes (0xEC, 0x11)
    const pad = [0xEC, 0x11];
    let padIdx = 0;
    while (bitStream.length < totalDataBits) {
        pushBits(pad[padIdx % 2], 8);
        padIdx++;
    }

    // Convert bitstream to data bytes
    const dataBytes = [];
    for (let i = 0; i < bitStream.length; i += 8) {
        let b = 0;
        for (let bit = 0; bit < 8; bit++) {
            b = (b << 1) | bitStream[i + bit];
        }
        dataBytes.push(b);
    }

    // Reed-Solomon Error Correction Code
    const ecCountTable = [0, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18, 20, 24, 26, 30];
    const ecCount = ecCountTable[version] || 7;
    const ecBytes = calculateReedSolomon(dataBytes, ecCount);
    const allCodewords = dataBytes.concat(ecBytes);

    // 6. Place Data Modules Zig-Zag
    let bitIndex = 0;
    const allBits = [];
    allCodewords.forEach(cw => {
        for (let b = 7; b >= 0; b--) allBits.push((cw >> b) & 1);
    });

    let right = moduleCount - 1;
    let upward = true;
    while (right > 0) {
        if (right === 6) right--; // Skip vertical timing pattern
        const rows = upward
            ? Array.from({ length: moduleCount }, (_, i) => moduleCount - 1 - i)
            : Array.from({ length: moduleCount }, (_, i) => i);

        for (let r of rows) {
            for (let c of [right, right - 1]) {
                if (!isReserved[r][c]) {
                    const bit = bitIndex < allBits.length ? allBits[bitIndex++] : 0;
                    // Apply Mask 0: (row + col) % 2 === 0
                    const mask = (r + c) % 2 === 0;
                    matrix[r][c] = (bit ^ (mask ? 1 : 0)) === 1;
                }
            }
        }
        upward = !upward;
        right -= 2;
    }

    // 7. Write Format Information (ECC Level L, Mask 0: 0x77C4)
    const formatBits = [1, 1, 1, 0, 1, 1, 1, 1, 1, 0, 0, 0, 1, 0, 0];
    for (let i = 0; i < 6; i++) matrix[8][i] = formatBits[i] === 1;
    matrix[8][7] = formatBits[6] === 1;
    matrix[8][8] = formatBits[7] === 1;
    matrix[7][8] = formatBits[8] === 1;
    for (let i = 9; i < 15; i++) matrix[14 - i][8] = formatBits[i] === 1;

    for (let i = 0; i < 8; i++) matrix[moduleCount - 1 - i][8] = formatBits[i] === 1;
    for (let i = 8; i < 15; i++) matrix[8][moduleCount - 15 + i] = formatBits[i] === 1;

    return matrix;
}

function calculateReedSolomon(data, ecCount) {
    // Galois Field GF(256) tables
    const exp = new Array(512);
    const log = new Array(256);
    let x = 1;
    for (let i = 0; i < 255; i++) {
        exp[i] = x;
        log[x] = i;
        x <<= 1;
        if (x & 256) x ^= 0x11D;
    }
    for (let i = 255; i < 512; i++) exp[i] = exp[i - 255];

    let gen = [1];
    for (let i = 0; i < ecCount; i++) {
        const next = new Array(gen.length + 1).fill(0);
        for (let j = 0; j < gen.length; j++) {
            next[j] ^= gen[j];
            const factor = exp[(log[gen[j]] + i) % 255];
            next[j + 1] ^= factor;
        }
        gen = next;
    }

    const res = new Array(ecCount).fill(0);
    for (let i = 0; i < data.length; i++) {
        const factor = data[i] ^ res[0];
        res.shift();
        res.push(0);
        if (factor !== 0) {
            for (let j = 0; j < ecCount; j++) {
                res[j] ^= exp[(log[gen[j + 1]] + log[factor]) % 255];
            }
        }
    }
    return res;
}