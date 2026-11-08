/**
 * Mining Plant Control Center - Client Application Logic
 */

const MASTER_UNITS = window.MASTER_UNITS || {};
const ALL_MASTER_UNITS = window.ALL_MASTER_UNITS || [];

let localAccounts = [
  { nrp: '10001', name: 'Super Admin Base Control', email: 'admin.ss6@amm-mining.com', jabatan: 'Admin Plant', password: 'plantss6admin' },
  { nrp: '10002', name: 'Budi Santoso', email: 'budi.santoso@amm-mining.com', jabatan: 'Dispatcher SS6', password: 'dispatcher123' },
  { nrp: '10003', name: 'Ahmad Fauzi', email: 'ahmad.fauzi@amm-mining.com', jabatan: 'Maintenance Planner', password: 'plannerss6' }
];

// ============================================================
// WEB PREFERENCES / SETTINGS (persisted in localStorage)
// ============================================================
let webSettings = (function () {
  try {
    const saved = localStorage.getItem('plant_web_settings');
    return saved ? JSON.parse(saved) : {};
  } catch (e) { return {}; }
})();

function saveWebSettingsToStorage() {
  localStorage.setItem('plant_web_settings', JSON.stringify(webSettings));
}

let _autoRefreshTimer = null;

function applyWebSettings() {
  // Auto-refresh
  if (_autoRefreshTimer) { clearInterval(_autoRefreshTimer); _autoRefreshTimer = null; }
  const refreshSec = parseInt(webSettings.autoRefresh || '0', 10);
  if (refreshSec > 0) {
    _autoRefreshTimer = setInterval(() => loadData(), refreshSec * 1000);
  }

  // Table density
  const density = webSettings.tableDensity || 'normal';
  if (density === 'compact') {
    document.body.classList.add('table-compact');
  } else {
    document.body.classList.remove('table-compact');
  }

  // OLED theme
  const contrast = webSettings.themeContrast || 'normal';
  if (contrast === 'oled') {
    document.body.classList.add('theme-oled');
  } else {
    document.body.classList.remove('theme-oled');
  }
}



let appState = {
  data: [],
  filteredData: [],
  activeTab: 'operator',
  scriptUrl: localStorage.getItem('plant_gas_url') || '',
  tgToken: localStorage.getItem('plant_tg_token') || '',
  tgChatId: localStorage.getItem('plant_tg_chat_id') || '',
  tgEnabled: localStorage.getItem('plant_tg_enabled') !== 'false',
  waToken: localStorage.getItem('plant_wa_token') || '',
  waTarget: localStorage.getItem('plant_wa_target') || '',
  waEnabled: localStorage.getItem('plant_wa_enabled') === 'true',
  waGroupOperator: localStorage.getItem('plant_wa_group_operator') || '',
  isConnected: false,
  isLoading: false,
  currentUser: null,
  filterStatus: 'ALL',
  searchQuery: '',
  selectedForRFU: null,

  // Dashboard Riwayat Breakdown State (856 Fleet)
  historySearchQuery: '',
  historySelectedCategory: 'ALL',
  historySelectedStatus: 'ALL',
  selectedUnitForDossier: null,
  catalogCurrentPage: 1,
  catalogPageSize: 25,
  chartDamage: null,
  chartTopUnits: null
};

document.addEventListener('DOMContentLoaded', () => {
  initClock();
  initAuthSession();
  initFormTimes();
  populateCodeUnitsDatalist();
  populateHistoryQuickSelect();
  loadData();
  setupEventListeners();

  const savedAccs = localStorage.getItem('plant_custom_accounts');
  if (savedAccs) {
    try {
      const parsed = JSON.parse(savedAccs);
      localAccounts = [...localAccounts, ...parsed];
    } catch (e) { }
  }

  if (appState.currentUser) switchTab('control');
  else switchTab('control'); // Tab control bisa dilihat tanpa login (read-only)
});

function initClock() {
  function updateTime() {
    const now = new Date();
    const timeElem = document.getElementById('liveClock');
    const dateElem = document.getElementById('liveDate');
    if (timeElem) timeElem.textContent = now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) + ' WITA';
    if (dateElem) dateElem.textContent = now.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' });
  }
  updateTime();
  setInterval(updateTime, 1000);

  // Aging BD realtime — update detik demi detik
  setInterval(() => {
    updateRealtimeAging();
  }, 1000); // setiap 1 detik live update

  // Auto sync tabel & dossier setiap 30 detik
  setInterval(() => {
    if (appState.activeTab === 'control') {
      applyFilters();
    }
    if (appState.activeTab === 'history' && appState.selectedUnitForDossier) {
      renderUnitDossier(appState.selectedUnitForDossier);
    }
  }, 30000);
}

function initAuthSession() {
  const savedUser = localStorage.getItem('plant_auth_user');
  if (savedUser) { try { appState.currentUser = JSON.parse(savedUser); } catch (e) { appState.currentUser = null; } }
  updateAuthUI();
}

function updateAuthUI() {
  const userProfile = document.getElementById('userProfileBar');
  const btnOpenLogin = document.getElementById('btnOpenLogin');
  const userNameElem = document.getElementById('userNameDisplay');
  const userRoleElem = document.getElementById('userRoleDisplay');
  const loginRequiredCard = document.getElementById('loginRequiredCard');

  if (appState.currentUser) {
    if (userProfile) userProfile.classList.remove('hidden');
    if (btnOpenLogin) btnOpenLogin.classList.add('hidden');
    if (userNameElem) userNameElem.textContent = `${appState.currentUser.name} (NRP ${appState.currentUser.nrp})`;
    if (userRoleElem) userRoleElem.textContent = appState.currentUser.jabatan || 'BASE CONTROL';
    if (loginRequiredCard) loginRequiredCard.classList.add('hidden');
  } else {
    if (userProfile) userProfile.classList.add('hidden');
    if (btnOpenLogin) btnOpenLogin.classList.remove('hidden');
    if (loginRequiredCard) loginRequiredCard.classList.add('hidden'); // selalu sembunyikan — data tampil tanpa login
  }
  // Render ulang tabel agar tombol edit/RFU/Cancel menyesuaikan status login
  renderTable();
}

function initFormTimes() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const dateStr = `${yyyy}-${mm}-${dd}`;
  const hh = String(now.getHours()).padStart(2, '0');
  const min = String(now.getMinutes()).padStart(2, '0');
  const timeStr = `${hh}:${min}`;

  if (document.getElementById('opDateBD')) document.getElementById('opDateBD').value = dateStr;
  if (document.getElementById('opTimeBD')) document.getElementById('opTimeBD').value = timeStr;
  if (document.getElementById('mechDateBD')) document.getElementById('mechDateBD').value = dateStr;
  if (document.getElementById('mechTimeBD')) document.getElementById('mechTimeBD').value = timeStr;
}

async function loadData() {
  setLoading(true);
  if (appState.scriptUrl) {
    try {
      updateConnectionStatus('connecting', 'Sinkronisasi Spreadsheet...');
      const response = await fetch(`${appState.scriptUrl}?action=getData`, { method: 'GET', redirect: 'follow' });
      const result = await response.json();
      if (result.status === 'success') {
        appState.data = result.data || [];
        saveLocalData();
        appState.isConnected = true;
        updateConnectionStatus('connected', 'Terhubung ke Google Sheets');
      } else {
        throw new Error(result.message || 'Gagal mengambil data');
      }
    } catch (err) {
      console.warn('Gagal koneksi ke GAS, menggunakan data lokal:', err);
      appState.isConnected = false;
      updateConnectionStatus('demo', 'Mode Demo Lokal (Cek Script URL)');
      loadLocalOrDemoData();
    }
  } else {
    updateConnectionStatus('demo', 'Mode Demo Lokal (Belum Konek API)');
    loadLocalOrDemoData();
  }
  setLoading(false);
  applyFilters();
  updateKPIs();
  renderHistoryStats();
  renderSpreadsheetView();
}

function loadLocalOrDemoData() {
  const local = localStorage.getItem('plant_local_bd_data');
  if (local) {
    try { appState.data = JSON.parse(local); } catch (e) { appState.data = []; }
  }
  if (!appState.data || appState.data.length === 0) {
    if (window.INITIAL_BREAKDOWN_DATA && window.INITIAL_BREAKDOWN_DATA.length > 0) {
      appState.data = [...window.INITIAL_BREAKDOWN_DATA];
      saveLocalData();
    } else {
      appState.data = [];
    }
  }
}

function saveLocalData() {
  localStorage.setItem('plant_local_bd_data', JSON.stringify(appState.data));
}

function switchTab(tabName) {
  appState.activeTab = tabName;
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.classList.remove('bg-red-600', 'text-white', 'font-bold', 'bg-amber-500', 'text-slate-900', 'shadow-md');
    btn.classList.add('text-slate-700', 'bg-white', 'border', 'border-slate-200');
  });
  const activeBtn = document.getElementById(`tabBtn-${tabName}`);
  if (activeBtn) {
    activeBtn.classList.remove('text-slate-700', 'bg-white', 'border', 'border-slate-200');
    activeBtn.classList.add('bg-red-600', 'text-white', 'font-bold', 'shadow-md');
  }
  document.querySelectorAll('.tab-pane').forEach(pane => pane.classList.add('hidden'));
  const targetPane = document.getElementById(`tabPane-${tabName}`);
  if (targetPane) targetPane.classList.remove('hidden');
  if (tabName === 'control') { applyFilters(); updateKPIs(); }
  if (tabName === 'history') { renderHistoryDashboard(); }
  if (tabName === 'sheets') { renderSpreadsheetView(); }
}

function setupEventListeners() {
  document.getElementById('tabBtn-operator')?.addEventListener('click', () => switchTab('operator'));
  document.getElementById('tabBtn-mechanic')?.addEventListener('click', () => switchTab('mechanic'));
  document.getElementById('tabBtn-control')?.addEventListener('click', () => switchTab('control'));
  document.getElementById('tabBtn-history')?.addEventListener('click', () => switchTab('history'));
  document.getElementById('tabBtn-sheets')?.addEventListener('click', () => switchTab('sheets'));

  const handleUnitInputChange = (inputElemId, modelElemId, hintBtnId, countSpanId) => {
    const input = document.getElementById(inputElemId);
    if (!input) return;
    const unit = input.value.trim().toUpperCase();
    if (MASTER_UNITS[unit]) {
      const modelElem = document.getElementById(modelElemId);
      if (modelElem) modelElem.value = MASTER_UNITS[unit];
    }
    const hintBtn = document.getElementById(hintBtnId);
    const countSpan = document.getElementById(countSpanId);
    if (hintBtn && countSpan) {
      if (unit && MASTER_UNITS[unit]) {
        const count = appState.data.filter(i => (i['CODE UNIT AMM'] || '').toUpperCase() === unit).length;
        countSpan.textContent = count > 0 ? `Lihat Riwayat (${count} BD)` : 'Lihat Info Unit';
        hintBtn.classList.remove('hidden');
      } else {
        hintBtn.classList.add('hidden');
      }
    }
  };

  document.getElementById('opCodeUnit')?.addEventListener('input', () => {
    handleUnitInputChange('opCodeUnit', 'opModelUnit', 'btnOpCheckHistory', 'opHistoryCountText');
  });
  document.getElementById('opCodeUnit')?.addEventListener('change', () => {
    handleUnitInputChange('opCodeUnit', 'opModelUnit', 'btnOpCheckHistory', 'opHistoryCountText');
  });

  document.getElementById('mechCodeUnit')?.addEventListener('input', () => {
    handleUnitInputChange('mechCodeUnit', 'mechModelUnit', 'btnMechCheckHistory', 'mechHistoryCountText');
  });
  document.getElementById('mechCodeUnit')?.addEventListener('change', () => {
    handleUnitInputChange('mechCodeUnit', 'mechModelUnit', 'btnMechCheckHistory', 'mechHistoryCountText');
  });

  // History Dashboard Listeners — Search Tunggal
  document.getElementById('historySearchInput')?.addEventListener('input', (e) => {
    const val = e.target.value.trim();
    appState.historySearchQuery = val.toLowerCase();
    appState.catalogCurrentPage = 1;
    const clearBtn = document.getElementById('btnClearHistorySearch');
    if (clearBtn) {
      if (val) clearBtn.classList.remove('hidden');
      else clearBtn.classList.add('hidden');
    }
    renderFleetCatalogTable();
  });

  // Tekan Enter → langsung buka dossier unit jika code valid
  document.getElementById('historySearchInput')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const val = e.target.value.trim().toUpperCase();
      if (!val) return;
      // Cek exact match di datalist / master units
      const found = window.ALL_MASTER_UNITS
        ? window.ALL_MASTER_UNITS.find(u => u.code.toUpperCase() === val)
        : null;
      if (found) {
        selectUnitForHistory(found.code);
      } else {
        // Coba buka apapun yang diketik (mungkin ada di data)
        selectUnitForHistory(val);
      }
    }
  });

  // Tombol "Buka" di sebelah search
  document.getElementById('btnOpenUnitFromSearch')?.addEventListener('click', () => {
    const input = document.getElementById('historySearchInput');
    const val = (input?.value || '').trim().toUpperCase();
    if (!val) {
      Swal.fire({ toast: true, position: 'top-end', icon: 'info', title: 'Ketik kode unit terlebih dahulu', timer: 2000, showConfirmButton: false });
      return;
    }
    selectUnitForHistory(val);
  });

  document.getElementById('btnClearHistorySearch')?.addEventListener('click', () => {
    const input = document.getElementById('historySearchInput');
    if (input) input.value = '';
    appState.historySearchQuery = '';
    document.getElementById('btnClearHistorySearch')?.classList.add('hidden');
    appState.catalogCurrentPage = 1;
    renderFleetCatalogTable();
  });

  document.getElementById('historyQuickUnitSelect')?.addEventListener('change', (e) => {
    const val = e.target.value;
    if (val) selectUnitForHistory(val);
  });

  document.getElementById('btnResetSelectedUnit')?.addEventListener('click', () => {
    clearSelectedUnitDossier();
  });

  document.querySelectorAll('.history-cat-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.history-cat-btn').forEach(b => {
        b.classList.remove('bg-amber-500/20', 'text-amber-300', 'border-amber-500/50', 'font-semibold');
        b.classList.add('bg-slate-950', 'text-slate-300', 'border-slate-800', 'font-medium');
      });
      btn.classList.remove('bg-slate-950', 'text-slate-300', 'border-slate-800', 'font-medium');
      btn.classList.add('bg-amber-500/20', 'text-amber-300', 'border-amber-500/50', 'font-semibold');
      appState.historySelectedCategory = btn.dataset.cat || 'ALL';
      appState.catalogCurrentPage = 1;
      renderFleetCatalogTable();
    });
  });

  document.querySelectorAll('.history-status-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.history-status-btn').forEach(b => {
        b.classList.remove('bg-amber-500/20', 'text-amber-300', 'border-amber-500/30', 'font-semibold');
        b.classList.add('text-slate-400', 'border-transparent');
      });
      btn.classList.remove('text-slate-400', 'border-transparent');
      btn.classList.add('bg-amber-500/20', 'text-amber-300', 'border-amber-500/30', 'font-semibold');
      appState.historySelectedStatus = btn.dataset.status || 'ALL';
      appState.catalogCurrentPage = 1;
      renderFleetCatalogTable();
    });
  });

  document.getElementById('catalogPageSize')?.addEventListener('change', (e) => {
    appState.catalogPageSize = e.target.value === 'all' ? 9999 : parseInt(e.target.value, 10);
    appState.catalogCurrentPage = 1;
    renderFleetCatalogTable();
  });

  document.getElementById('btnOpenQuickAddHistory')?.addEventListener('click', openQuickAddHistoryModal);
  document.getElementById('formQuickAddHistory')?.addEventListener('submit', handleQuickAddHistorySubmit);
  document.getElementById('quickAddCodeUnit')?.addEventListener('input', (e) => {
    const val = e.target.value.trim().toUpperCase();
    if (MASTER_UNITS[val]) {
      document.getElementById('quickAddModelUnit').value = MASTER_UNITS[val];
    }
  });

  // Attach submit listeners after DOM is ready
  document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('formOperator')?.addEventListener('submit', handleOperatorSubmit);
    document.getElementById('formMechanic')?.addEventListener('submit', handleMechanicSubmit);
  });
  document.getElementById('formMechanic')?.addEventListener('submit', handleMechanicSubmit);

  document.getElementById('btnOpenLogin')?.addEventListener('click', openLoginModal);
  document.getElementById('btnPromptLogin')?.addEventListener('click', openLoginModal);
  document.getElementById('btnCloseLogin')?.addEventListener('click', closeLoginModal);
  document.getElementById('formLogin')?.addEventListener('submit', handleLogin);
  document.getElementById('btnLogout')?.addEventListener('click', handleLogout);

  document.getElementById('btnOpenRegister')?.addEventListener('click', openRegisterModal);
  document.getElementById('btnCloseRegister')?.addEventListener('click', closeRegisterModal);
  document.getElementById('btnBackToLogin')?.addEventListener('click', () => {
    closeRegisterModal();
    openLoginModal();
  });
  document.getElementById('formRegister')?.addEventListener('submit', handleRegisterSubmit);
  document.getElementById('formChangePassword')?.addEventListener('submit', handleChangePassword);

  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.filter-btn').forEach(b => {
        b.classList.remove('bg-red-600', 'text-white', 'border-red-600', 'shadow-sm', 'bg-amber-500/20', 'text-amber-400', 'border-amber-500/50');
        b.classList.add('bg-white', 'text-slate-700', 'border-slate-200');
      });
      btn.classList.remove('bg-white', 'text-slate-700', 'border-slate-200');
      btn.classList.add('bg-red-600', 'text-white', 'border-red-600', 'shadow-sm', 'font-bold');
      appState.filterStatus = btn.dataset.status;
      applyFilters();
    });
  });

  document.getElementById('searchTable')?.addEventListener('input', (e) => {
    appState.searchQuery = e.target.value.toLowerCase();
    applyFilters();
  });

  document.getElementById('btnRefresh')?.addEventListener('click', () => {
    loadData();
    Swal.fire({ toast: true, position: 'top-end', icon: 'info', title: 'Data diperbarui...', timer: 1500, showConfirmButton: false });
  });

  document.getElementById('btnCloseRFUModal')?.addEventListener('click', closeRFUModal);
  document.getElementById('formRFU')?.addEventListener('submit', handleRFUSubmit);

  document.getElementById('btnOpenSettings')?.addEventListener('click', openSettingsModal);
  document.getElementById('btnCloseSettings')?.addEventListener('click', closeSettingsModal);
  document.getElementById('btnSaveSettings')?.addEventListener('click', saveSettings);

  document.getElementById('btnTestTelegram')?.addEventListener('click', handleTestTelegram);
  document.getElementById('btnTestWA')?.addEventListener('click', handleTestWA);
  document.getElementById('btnTestWAGrupOperator')?.addEventListener('click', handleTestWAGrupOperator);
}

function extractPhoneFromText(str) {
  if (!str) return '';
  const match = String(str).match(/(?:WA:|\b)(08\d{8,12}|628\d{8,12}|\+628\d{8,12})/i);
  return match ? match[1] : '';
}

function formatIndonesianPhone(phone) {
  if (!phone) return '';
  let cleaned = String(phone).replace(/[^0-9]/g, '');
  if (cleaned.startsWith('0')) {
    cleaned = '62' + cleaned.slice(1);
  } else if (cleaned.startsWith('8')) {
    cleaned = '628' + cleaned.slice(1);
  }
  return cleaned;
}

async function handleOperatorSubmit(e) {
  e.preventDefault();

  const namaOperator = document.getElementById('opNama').value.trim();
  const opPhone = (document.getElementById('opPhone')?.value || '').trim();
  const codeUnit = document.getElementById('opCodeUnit').value.trim().toUpperCase();
  const modelUnit = document.getElementById('opModelUnit').value.trim();
  const posisi = document.getElementById('opPosisi').value.trim();
  const hmDown = document.getElementById('opHmDown').value.trim();
  const dateBD = document.getElementById('opDateBD').value;
  const timeBD = document.getElementById('opTimeBD').value;
  const damage = document.getElementById('opDamageCategory').value;
  const trouble = document.getElementById('opTrouble').value.trim();

  const now = new Date();
  const yyyymmdd = now.toISOString().slice(0, 10).replace(/-/g, '');
  const rand = Math.floor(100 + Math.random() * 900);
  const generatedId = `BD-${yyyymmdd}-${rand}`;

  const payload = {
    'INPUTING BY': namaOperator,
    'NO HP OPERATOR': opPhone,
    'OPERATOR PHONE': opPhone,
    'SS6': 'SS6',
    'STATUS': 'BREAKDOWN',
    'ID': generatedId,
    'CODE UNIT AMM': codeUnit,
    'MODEL UNIT': modelUnit || (MASTER_UNITS[codeUnit] || '-'),
    'POSISI UNIT': posisi,
    'HM DOWN': hmDown,
    'HM RFU': '',
    'DATE BD': dateBD,
    'AGING BD': '0 Menit',
    'TYPE BD': 'UNSCHEDULED BREAKDOWN',
    'STATUS DELAY': 'WAITING MECHANIC / NO DELAY',
    'TIME BD': timeBD,
    'TIME RFU': '',
    'DURATION': '',
    'TROUBLE DESCRIPTION': trouble,
    'DAMAGE': damage,
    'TINDAKAN / DO': ''
  };

  await submitBreakdownData(payload, `Laporan unit ${codeUnit} tersimpan & notifikasi otomatis terkirim!`);
  document.getElementById('formOperator').reset();
  initFormTimes();
}

async function handleMechanicSubmit(e) {
  e.preventDefault();

  const namaMekanik = document.getElementById('mechNama').value.trim();
  const mechOpPhone = (document.getElementById('mechOpPhone')?.value || '').trim();
  const codeUnit = document.getElementById('mechCodeUnit').value.trim().toUpperCase();
  const modelUnit = document.getElementById('mechModelUnit').value.trim();
  const posisi = document.getElementById('mechPosisi').value.trim();
  const hmDown = document.getElementById('mechHmDown').value.trim();
  const dateBD = document.getElementById('mechDateBD').value;
  const timeBD = document.getElementById('mechTimeBD').value;
  const statusUnit = (document.getElementById('mechStatus')?.value || 'BREAKDOWN');
  const typeBD = document.getElementById('mechTypeBD').value;
  const statusDelay = document.getElementById('mechStatusDelay').value;
  const damage = document.getElementById('mechDamageCategory').value;
  const trouble = document.getElementById('mechTrouble').value.trim();

  const now = new Date();
  const yyyymmdd = now.toISOString().slice(0, 10).replace(/-/g, '');
  const rand = Math.floor(100 + Math.random() * 900);
  const generatedId = `BD-${yyyymmdd}-${rand}`;

  const payload = {
    'INPUTING BY': mechOpPhone ? `${namaMekanik} (Mekanik) | WA Op: ${mechOpPhone}` : `${namaMekanik} (Mekanik)`,
    'NO HP OPERATOR': mechOpPhone,
    'OPERATOR PHONE': mechOpPhone,
    'SS6': 'SS6',
    'STATUS': statusUnit,
    'ID': generatedId,
    'CODE UNIT AMM': codeUnit,
    'MODEL UNIT': modelUnit || (MASTER_UNITS[codeUnit] || '-'),
    'POSISI UNIT': posisi,
    'HM DOWN': hmDown,
    'HM RFU': '',
    'DATE BD': dateBD,
    'AGING BD': '0 Menit',
    'TYPE BD': typeBD,
    'STATUS DELAY': statusDelay,
    'TIME BD': timeBD,
    'TIME RFU': '',
    'DURATION': '',
    'TROUBLE DESCRIPTION': trouble,
    'DAMAGE': damage,
    'TINDAKAN / DO': ''
  };

  await submitBreakdownData(payload, `Laporan teknis unit ${codeUnit} tersimpan & notifikasi broadcast terkirim!`);
  document.getElementById('formMechanic').reset();
  initFormTimes();
}

// ============================================================
// HELPER BROADCAST REAL-TIME TERPUSAT
// Mengirimkan notifikasi ke Grup Operator & Grup Mekanik via Fonnte & Telegram
// ============================================================
async function sendFonnteMessage(target, message) {
  if (!target || !appState.waToken || !appState.waEnabled) return false;
  try {
    const res = await fetch('https://api.fonnte.com/send', {
      method: 'POST',
      headers: {
        'Authorization': appState.waToken,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        target: target,
        message: message,
        countryCode: '62'
      })
    });
    const d = await res.json();
    console.log(`[Fonnte Broadcast ke ${target}]:`, d);
    return d.status === true || d.status === 'true' || d.status === 'success';
  } catch (err) {
    console.warn(`[Fonnte Error ke ${target}]:`, err);
    return false;
  }
}

async function sendTelegramMessage(text) {
  if (!appState.tgEnabled || !appState.tgToken || !appState.tgChatId) return false;
  try {
    await fetch(`https://api.telegram.org/bot${appState.tgToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: appState.tgChatId, text: text, parse_mode: 'Markdown' })
    });
    return true;
  } catch (e) {
    console.warn('Gagal kirim Telegram:', e);
    return false;
  }
}

async function broadcastToPlantGroups({ operatorMsg, mechanicMsg, telegramMsg }) {
  if (appState.waEnabled && appState.waToken) {
    // 1. Kirim real-time ke Grup Operator
    if (appState.waGroupOperator && operatorMsg) {
      sendFonnteMessage(appState.waGroupOperator, operatorMsg);
    }
    // 2. Kirim real-time ke Grup Mekanik
    if (appState.waTarget && mechanicMsg) {
      sendFonnteMessage(appState.waTarget, mechanicMsg);
    }
  }

  // 3. Kirim ke Telegram Grup Mekanik/Plant
  if (appState.tgEnabled && appState.tgToken && appState.tgChatId && (telegramMsg || mechanicMsg)) {
    sendTelegramMessage(telegramMsg || mechanicMsg);
  }
}

async function submitBreakdownData(payload, successMessage) {
  setLoading(true);

  if (appState.scriptUrl) {
    try {
      await fetch(appState.scriptUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action: 'create', data: payload }),
        redirect: 'follow'
      });
    } catch (err) {
      console.warn('Gagal POST ke GAS:', err);
    }
  }

  // Real-time broadcast pelaporan breakdown ke Grup Operator & Grup Mekanik
  const opBroadcastMsg =
    `🚨 *LAPORAN BREAKDOWN FLEET - PLANT SS6* 🚨\n\n` +
    `📢 *Pemberitahuan Seluruh Operator:*\n` +
    `Unit berikut mengalami breakdown dan saat ini sedang dalam penanganan tim mekanik:\n\n` +
    `🚜 *Unit*         : *${payload['CODE UNIT AMM']}* (${payload['MODEL UNIT'] || '-'})\n` +
    `📍 *Posisi*       : ${payload['POSISI UNIT'] || '-'}\n` +
    `⏱️ *HM Down*      : ${payload['HM DOWN'] || '-'}\n` +
    `🕒 *Waktu Lapor*  : ${payload['DATE BD']} ${payload['TIME BD']} WITA\n` +
    `⚙️ *Komponen*     : ${payload['DAMAGE'] || '-'}\n` +
    `👷 *Pelapor*      : ${payload['INPUTING BY'] || 'Operator'}\n` +
    `📝 *Gejala/Kerusakan*:\n"${payload['TROUBLE DESCRIPTION'] || '-'}"\n` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `ℹ️ Notifikasi disiarkan otomatis ke Grup Operator agar shift berikutnya mengetahui kondisi unit ini.\n` +
    `Tetap utamakan *KESELAMATAN KERJA (K3)*! ⛑️ Salam Tangguh! 🚧`;

  const mechBroadcastMsg =
    `⚠️ *BREAKDOWN FLEET BARU - PLANT SERVICE SS6* ⚠️\n\n` +
    `🚜 *Unit*         : *${payload['CODE UNIT AMM']}* (${payload['MODEL UNIT'] || '-'})\n` +
    `📍 *Posisi*       : ${payload['POSISI UNIT'] || '-'}\n` +
    `⏱️ *HM Down*      : ${payload['HM DOWN'] || '-'}\n` +
    `🕒 *Waktu BD*     : ${payload['DATE BD']} ${payload['TIME BD']} WITA\n` +
    `⚙️ *Damage*       : ${payload['DAMAGE'] || '-'}\n` +
    `🔧 *Status*       : ${payload['STATUS'] || 'BREAKDOWN'} (${payload['STATUS DELAY'] || 'NO DELAY'})\n` +
    `👷 *Pelapor*      : ${payload['INPUTING BY'] || 'Anonim'}\n` +
    `📝 *Trouble Teknis*:\n"${payload['TROUBLE DESCRIPTION'] || '-'}"\n` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `Mekanik bertugas harap segera koordinasi dan tindakan penanganan lapangan.\n` +
    `Salam Tangguh! 🚧`;

  broadcastToPlantGroups({
    operatorMsg: opBroadcastMsg,
    mechanicMsg: mechBroadcastMsg
  });

  appState.data.unshift(payload);
  saveLocalData();
  setLoading(false);

  Swal.fire({
    icon: 'success',
    title: 'Laporan Terkirim!',
    html: `<p class="text-xs text-slate-300">${successMessage}</p>`,
    background: '#1e293b',
    color: '#f8fafc',
    confirmButtonColor: '#f59e0b'
  });

  applyFilters();
  updateKPIs();
  if (typeof renderSpreadsheetView === 'function') renderSpreadsheetView();
}

function calculateAging(dateStr, timeStr) {
  if (!dateStr) return '-';
  try {
    const start = new Date(`${dateStr}T${timeStr || '00:00'}:00`);
    const now = new Date();
    const diffMs = now - start;
    if (isNaN(diffMs) || diffMs < 0) return '0 Detik';
    const hours = diffMs / (1000 * 60 * 60);
    return formatAgingTextJS(hours, diffMs);
  } catch (e) {
    return '-';
  }
}

function formatAgingTextJS(hours, diffMs) {
  if (hours <= 0 && (!diffMs || diffMs <= 0)) return '0 Detik';
  
  if (diffMs !== undefined && diffMs < 60000) {
    const secs = Math.max(1, Math.floor(diffMs / 1000));
    return `${secs} Detik`;
  }

  const totalMins = Math.floor(hours * 60);
  if (totalMins < 60) {
    const secs = diffMs !== undefined ? Math.floor((diffMs % 60000) / 1000) : 0;
    return `${totalMins} Menit ${secs} Detik`;
  }

  const days = Math.floor(hours / 24);
  const remHours = Math.floor(hours % 24);
  const remMins = Math.floor((hours * 60) % 60);
  const secs = diffMs !== undefined ? Math.floor((diffMs % 60000) / 1000) : 0;

  let parts = [];
  if (days > 0) parts.push(`${days} Hari`);
  if (remHours > 0) parts.push(`${remHours} Jam`);
  if (remMins > 0) parts.push(`${remMins} Menit`);
  if (days === 0 && secs > 0) parts.push(`${secs} Detik`);
  return parts.join(' ') || `${totalMins} Menit`;
}

function updateRealtimeAging() {
  document.querySelectorAll('[data-live-aging="true"]').forEach(el => {
    const dateStr = el.getAttribute('data-date');
    const timeStr = el.getAttribute('data-time');
    if (dateStr) {
      const textSpan = el.querySelector('.aging-text');
      if (textSpan) {
        textSpan.textContent = calculateAging(dateStr, timeStr);
      }
    }
  });
}

// ============================================================
// HELPER STATUS & PEWARNAAN SISTEM
// ============================================================
// HELPER STATUS & PEWARNAAN SISTEM PT ANTAREJA MAHADA MAKMUR
// 3 STATUS UTAMA:
// 1. BREAKDOWN (Dalam Perbaikan di Pit - Kuning / Oranye AMM)
// 2. READY / RFU (Selesai & Siap Operasi - Hijau)
// 3. CANCEL (Batal / Tidak Jadi Servis - Merah AMM)
// ============================================================
function getStatusMeta(status) {
  const s = (status || "").toUpperCase().trim();
  if (s === "READY" || s === "RFU") {
    return {
      key: "READY",
      label: "READY / RFU",
      group: "ready",
      color: "emerald",
      rowBg: "row-status-ready",
      badge: `<span class="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-300 shadow-sm"><span class="w-1.5 h-1.5 rounded-full bg-emerald-600"></span> READY (RFU)</span>`,
      isDone: true
    };
  } else if (s === "CANCEL") {
    return {
      key: "CANCEL",
      label: "CANCEL",
      group: "cancel",
      color: "rose",
      rowBg: "row-status-cancel",
      badge: `<span class="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-rose-100 text-rose-800 border border-rose-300 shadow-sm"><span class="w-1.5 h-1.5 rounded-full bg-rose-600"></span> CANCEL</span>`,
      isDone: true
    };
  } else {
    // Status Breakdown (dalam proses perbaikan)
    return {
      key: "BREAKDOWN",
      label: "BREAKDOWN",
      group: "breakdown",
      color: "amber",
      rowBg: "row-status-process",
      badge: `<span class="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-300 shadow-sm pulse-active"><span class="w-1.5 h-1.5 rounded-full bg-amber-600"></span> BREAKDOWN</span>`,
      isDone: false
    };
  }
}

function applyFilters() {
  let list = [...appState.data];

  if (appState.filterStatus && appState.filterStatus !== "ALL") {
    const f = appState.filterStatus.toUpperCase();
    if (f === "BREAKDOWN" || f === "PROCESS") {
      // 1. Status Breakdown (Semua unit yang masih dalam perbaikan)
      list = list.filter(item => {
        const s = (item["STATUS"] || "").toUpperCase();
        return s !== "READY" && s !== "RFU" && s !== "CANCEL";
      });
    } else if (f === "READY" || f === "RFU") {
      // 2. Status Ready (RFU)
      list = list.filter(item => {
        const s = (item["STATUS"] || "").toUpperCase();
        return s === "READY" || s === "RFU";
      });
    } else if (f === "CANCEL") {
      // 3. Status Cancel (Batal Servis)
      list = list.filter(item => (item["STATUS"] || "").toUpperCase() === "CANCEL");
    } else {
      list = list.filter(item => (item["STATUS"] || "").toUpperCase() === f);
    }
  }

  if (appState.searchQuery) {
    const q = appState.searchQuery.toLowerCase();
    list = list.filter(item => {
      return (
        (item["CODE UNIT AMM"] || "").toLowerCase().includes(q) ||
        (item["MODEL UNIT"] || "").toLowerCase().includes(q) ||
        (item["ID"] || "").toLowerCase().includes(q) ||
        (item["POSISI UNIT"] || "").toLowerCase().includes(q) ||
        (item["INPUTING BY"] || "").toLowerCase().includes(q) ||
        (item["STATUS"] || "").toLowerCase().includes(q) ||
        (item["TROUBLE DESCRIPTION"] || "").toLowerCase().includes(q) ||
        (item["DAMAGE"] || "").toLowerCase().includes(q) ||
        (item["TINDAKAN / DO"] || item["DESCRIPTION RFU"] || item["DO DESCRIPTION"] || "").toLowerCase().includes(q)
      );
    });
  }

  appState.filteredData = list;
  renderTable(list);
}

function renderTable(dataList) {
  const tbody = document.getElementById("tableBody");
  const emptyState = document.getElementById("tableEmpty");
  if (!tbody) return;

  tbody.innerHTML = "";

  if (!dataList || dataList.length === 0) {
    if (emptyState) emptyState.classList.remove("hidden");
    return;
  }

  if (emptyState) emptyState.classList.add("hidden");

  dataList.forEach((row, index) => {
    const tr = document.createElement("tr");
    const meta = getStatusMeta(row["STATUS"]);
    tr.className = `border-b border-slate-800/80 transition-colors text-xs lg:text-sm ${meta.rowBg}`;

    const isDelay = row["STATUS DELAY"] && !row["STATUS DELAY"].toUpperCase().includes("NO DELAY") && !meta.isDone;

    // Status Cell (Dropdown bila login & belum selesai, badge bila selesai)
    let statusCell;
    if (appState.currentUser && !meta.isDone) {
      statusCell = `
        <select onchange="handleStatusChange(\x27${row["ID"]}\x27, this.value)"
          class="bg-white border border-amber-400 text-amber-800 font-bold text-xs px-2.5 py-1 rounded-lg focus:outline-none focus:border-red-600 cursor-pointer shadow-sm">
          <option value="BREAKDOWN" ${meta.key === "BREAKDOWN" ? "selected" : ""}>&#128993; BREAKDOWN</option>
          <option value="READY">&#128994; READY (RFU)</option>
          <option value="CANCEL">&#128308; CANCEL</option>
        </select>
      `;
    } else {
      statusCell = meta.badge;
    }

    const liveAging = meta.key === "CANCEL"
      ? "0 Jam (Batal/Ready)"
      : (meta.isDone ? (row["DURATION"] || row["AGING BD"] || "-") : calculateAging(row["DATE BD"], row["TIME BD"]));
    const tindakanDO = row["TINDAKAN / DO"] || row["DESCRIPTION RFU"] || row["DO DESCRIPTION"] || "-";

    // Kolom Konfirmasi (RFU / Cancel / Badge Selesai) — hanya tampil saat login
    let konfirmasiCell = "";
    if (!meta.isDone) {
      if (appState.currentUser) {
        konfirmasiCell = `
        <div class="flex items-center justify-center gap-1.5">
          <button onclick="handleRFUAction(\x27${row["ID"]}\x27)"
            class="px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold shadow-md transition flex items-center gap-1"
            title="Konfirmasi unit selesai diperbaiki (RFU/Ready)">
            <i class="fa-solid fa-circle-check"></i> RFU-kan
          </button>
          <button onclick="handleCancelAction(\x27${row["ID"]}\x27)"
            class="px-2 py-1.5 bg-rose-600 hover:bg-rose-500 text-white rounded-lg text-xs font-bold shadow-md transition flex items-center gap-1"
            title="Batalkan servis (Cancel/Auto Selesai)">
            <i class="fa-solid fa-ban"></i> Cancel
          </button>
        </div>
      `;
      } else {
        konfirmasiCell = `
        <span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-700 border border-amber-300">
          <i class="fa-solid fa-lock text-[10px]"></i> Login untuk Edit
        </span>
      `;
      }
    } else if (meta.key === "READY") {
      konfirmasiCell = `
        <span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/20 text-emerald-400 border border-emerald-500/40">
          <i class="fa-solid fa-check-double text-[10px]"></i> Selesai (READY)
        </span>
      `;
    } else {
      konfirmasiCell = `
        <span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-500/20 text-rose-400 border border-rose-500/40">
          <i class="fa-solid fa-ban text-[10px]"></i> Selesai (CANCEL)
        </span>
      `;
    }

    tr.innerHTML = `
      <td class="p-3 font-mono">
        <button type="button" onclick="openDetailTiketModal(\x27${row["ID"]}\x27)" title="Lihat detail lengkap tiket" class="text-slate-500 hover:text-red-600 hover:underline font-mono text-xs">
          ${row["ID"] || `ID-${index + 1}`}
        </button>
      </td>
      <td class="p-3 font-bold font-mono text-base">
        <button type="button" onclick="selectUnitForHistory(\x27${row["CODE UNIT AMM"]}\x27)" title="Klik untuk lihat riwayat breakdown unit ${row["CODE UNIT AMM"]}" class="text-amber-700 hover:text-red-700 hover:underline flex items-center gap-1.5 transition text-left font-black">
          <i class="fa-solid fa-clock-rotate-left text-xs text-amber-600/70"></i>
          <span>${row["CODE UNIT AMM"]}</span>
        </button>
      </td>
      <td class="p-3 text-slate-700 font-medium">${row["MODEL UNIT"] || "-"}</td>
      <td class="p-3">${statusCell}</td>
      <td class="p-3 text-slate-800 font-medium"><i class="fa-solid fa-location-dot text-red-500 mr-1"></i>${row["POSISI UNIT"] || "-"}</td>
      <td class="p-3 font-mono text-slate-800 font-semibold">${row["HM DOWN"] || "-"}</td>
      <td class="p-3 text-slate-700 whitespace-nowrap"><div class="font-semibold">${row["DATE BD"] || "-"}</div><div class="text-xs text-slate-500 font-mono">${row["TIME BD"] || ""}</div></td>
      <td class="p-3 font-bold ${meta.key === "READY" ? "text-emerald-700" : (meta.key === "CANCEL" ? "text-red-700" : "text-amber-700 font-mono")}"
          data-live-aging="${!meta.isDone}"
          data-date="${row["DATE BD"] || ""}"
          data-time="${row["TIME BD"] || ""}">
        <i class="fa-regular fa-clock text-xs mr-1"></i><span class="aging-text">${liveAging}</span>
      </td>
      <td class="p-3 text-slate-700">
        <span class="text-xs px-2 py-0.5 rounded ${isDelay ? "bg-amber-100 text-amber-800 border border-amber-300 font-bold" : "text-slate-500"}">
          ${row["STATUS DELAY"] || "NO DELAY"}
        </span>
      </td>
      <td class="p-3 max-w-xs truncate" title="${row["TROUBLE DESCRIPTION"] || ""}">
        <div class="font-semibold text-slate-900 truncate text-xs">${row["TROUBLE DESCRIPTION"] || "-"}</div>
        <div class="text-[10px] text-slate-500 flex items-center gap-1.5 truncate">
          <span class="truncate"><i class="fa-solid fa-user-pen text-[9px] mr-1"></i>${row["INPUTING BY"] || "Anonim"}</span>
        </div>
      </td>
      <td class="p-3"><span class="text-xs font-bold bg-slate-800 text-white px-2 py-0.5 rounded border border-slate-600">${row["DAMAGE"] || "-"}</span></td>
      <td class="p-3 max-w-xs">
        <div class="font-semibold text-slate-800 text-xs truncate" title="${tindakanDO}">${tindakanDO}</div>
      </td>
      <td class="p-3 text-center whitespace-nowrap">
        ${konfirmasiCell}
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function updateKPIs() {
  const inProcess = appState.data.filter(i => {
    const s = (i["STATUS"] || "").toUpperCase();
    return s !== "READY" && s !== "RFU" && s !== "CANCEL";
  });
  const readyUnits = appState.data.filter(i => {
    const s = (i["STATUS"] || "").toUpperCase();
    return s === "READY" || s === "RFU";
  });
  const cancelUnits = appState.data.filter(i => (i["STATUS"] || "").toUpperCase() === "CANCEL");

  if (document.getElementById("kpiActiveBD")) document.getElementById("kpiActiveBD").textContent = inProcess.length;
  if (document.getElementById("kpiRFU")) document.getElementById("kpiRFU").textContent = readyUnits.length;
  if (document.getElementById("kpiCancel")) document.getElementById("kpiCancel").textContent = cancelUnits.length;
  if (document.getElementById("kpiTotalFleet")) document.getElementById("kpiTotalFleet").textContent = appState.data.length;
}

window.handleStatusChange = function (id, newStatus) {
  if (!appState.currentUser) {
    Swal.fire({
      icon: "warning",
      title: "Akses Dibatasi",
      text: "Harus login sebagai Base Control untuk mengubah status tiket.",
      background: "#1e293b",
      color: "#f8fafc"
    });
    applyFilters();
    return;
  }

  if (newStatus === "READY" || newStatus === "RFU") {
    handleRFUAction(id);
    return;
  }

  if (newStatus === "CANCEL") {
    handleCancelAction(id);
    return;
  }

  const item = appState.data.find(i => String(i["ID"]) === String(id));
  if (!item) return;

  item["STATUS"] = newStatus;
  saveLocalData();

  if (appState.scriptUrl) {
    fetch(appState.scriptUrl, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({
        action: "updateStatus",
        data: { "ID": item["ID"], "STATUS": newStatus }
      })
    }).catch(e => console.warn("Sync status to GAS error:", e));
  }

  applyFilters();
  updateKPIs();
  if (typeof renderSpreadsheetView === "function") renderSpreadsheetView();
};

window.handleCancelAction = async function (id) {
  if (!appState.currentUser) {
    Swal.fire({
      icon: "warning",
      title: "Akses Dibatasi",
      text: "Hanya petugas Base Control terdaftar yang dapat membatalkan (Cancel) laporan breakdown.",
      showCancelButton: true,
      confirmButtonText: "Login Sekarang",
      cancelButtonText: "Batal",
      background: "#1e293b",
      color: "#f8fafc",
      confirmButtonColor: "#f59e0b"
    }).then((res) => {
      if (res.isConfirmed) openLoginModal();
    });
    return;
  }

  const item = appState.data.find(i => String(i["ID"]) === String(id));
  if (!item) return;

  const now = new Date();
  const timeCancel = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  const codeUnit = item["CODE UNIT AMM"] || "-";
  const modelUnit = item["MODEL UNIT"] || "-";

  const { value: formValues } = await Swal.fire({
    title: `<span class="text-rose-400 flex items-center justify-center gap-2"><i class="fa-solid fa-ban"></i> Batalkan Servis (CANCEL)</span>`,
    html: `
      <div class="text-left space-y-3 text-xs">
        <div class="p-3 bg-slate-950 border border-slate-800 rounded-xl">
          <div class="font-bold text-amber-400 text-sm font-mono">${codeUnit} - ${modelUnit}</div>
          <div class="text-slate-400 mt-0.5">Laporan BD: ${item["DATE BD"] || "-"} ${item["TIME BD"] || ""} (HM: ${item["HM DOWN"] || "-"})</div>
          <div class="text-slate-300 mt-1 italic font-sans text-[11px]">&ldquo;${item["TROUBLE DESCRIPTION"] || "-"}&rdquo;</div>
        </div>

        <div>
          <label class="block text-slate-300 font-semibold mb-1">Alasan Pembatalan (CANCEL) <span class="text-rose-500">*</span></label>
          <textarea id="swalCancelReason" rows="3" class="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-xs text-white focus:outline-none focus:border-rose-500 resize-none" placeholder="Contoh: Salah lapor nomor lambung / Unit dites ulang dan bisa operasi normal / Tidak jadi servis..."></textarea>
        </div>

        <div class="p-2.5 bg-rose-950/30 border border-rose-900/50 rounded-xl space-y-1.5">
          <label class="flex items-center gap-2 cursor-pointer select-none">
            <input type="checkbox" id="swalSendCancelWA" checked class="w-4 h-4 accent-rose-500 rounded">
            <span class="text-rose-300 font-semibold">Siarkan Notifikasi Cancel ke Grup WA Operator</span>
          </label>
          <p class="text-[10px] text-slate-400 leading-tight">
            Unit akan langsung dinyatakan <strong class="text-white">Auto-Selesai (Closed)</strong> dan grup operator akan diberitahu bahwa unit batal servis/siap digunakan.
          </p>
        </div>
      </div>
    `,
    background: "#1e293b",
    color: "#f8fafc",
    showCancelButton: true,
    confirmButtonColor: "#e11d48",
    cancelButtonColor: "#475569",
    confirmButtonText: `<i class="fa-solid fa-ban mr-1"></i> Ya, Batalkan (Auto Selesai)`,
    cancelButtonText: "Kembali",
    preConfirm: () => {
      const reason = (document.getElementById("swalCancelReason")?.value || "").trim();
      const sendWA = document.getElementById("swalSendCancelWA")?.checked;
      if (!reason) {
        Swal.showValidationMessage("Alasan pembatalan wajib diisi!");
        return false;
      }
      return { reason, sendWA };
    }
  });

  if (!formValues) return;

  setLoading(true);

  const start = new Date(`${item["DATE BD"]}T${item["TIME BD"] || "00:00"}:00`);
  let end = new Date(`${item["DATE BD"]}T${timeCancel}:00`);
  if (end < start) end.setDate(end.getDate() + 1);
  const diffHours = Math.max(0, (end - start) / (1000 * 60 * 60));
  const durationText = formatAgingTextJS(diffHours);

  item["STATUS"] = "CANCEL";
  item["TIME RFU"] = timeCancel;
  item["DURATION"] = "0 Jam (Batal/Ready)";
  item["AGING BD"] = "0 Jam";
  item["TINDAKAN / DO"] = `DIBATALKAN (CANCEL - TIDAK JADI BD): ${formValues.reason}`;
  item["DESCRIPTION RFU"] = `DIBATALKAN (CANCEL - TIDAK JADI BD): ${formValues.reason}`;

  saveLocalData();

  // Broadcast real-time saat cancel ke KEDUA Grup (Operator & Mekanik)
  const cancelMsgOperator =
    `🔴 *UNIT BREAKDOWN DIBATALKAN (CANCEL) - PLANT SS6* 🔴\n\n` +
    `📢 *Pemberitahuan Seluruh Operator:*\n` +
    `Laporan breakdown unit berikut telah *DIBATALKAN (CANCEL)* dan ditutup otomatis:\n\n` +
    `🚜 *Unit*         : *${item["CODE UNIT AMM"]}* (${item["MODEL UNIT"] || "-"})\n` +
    `📍 *Posisi*       : ${item["POSISI UNIT"] || "-"}\n` +
    `🕒 *Waktu Cancel* : ${timeCancel} WITA\n` +
    `⏳ *Waktu Lapor*  : ${item["TIME BD"] || "-"} WITA (${durationText})\n` +
    `📝 *Alasan*       : ${formValues.reason}\n` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `Unit dinyatakan *TIDAK JADI SERVIS* dan dapat beroperasi normal kembali atau diparkir sesuai arahan pengawas.\n` +
    `Tetap utamakan *KESELAMATAN KERJA (K3)*! ⛑️ Salam Tangguh! 🚧`;

  const cancelMsgMechanic =
    `🔴 *PEMBATALAN PERBAIKAN UNIT (CANCEL) - PLANT SERVICE* 🔴\n\n` +
    `Laporan breakdown unit berikut telah *DIBATALKAN (CANCEL)*:\n\n` +
    `🚜 *Unit*         : *${item["CODE UNIT AMM"]}* (${item["MODEL UNIT"] || "-"})\n` +
    `📍 *Posisi*       : ${item["POSISI UNIT"] || "-"}\n` +
    `🕒 *Waktu Cancel* : ${timeCancel} WITA\n` +
    `⏳ *Durasi Tiket* : ${durationText}\n` +
    `📝 *Alasan Cancel*: ${formValues.reason}\n` +
    `👷 *Dibatalkan Oleh*: ${appState.currentUser ? appState.currentUser.name : "Base Control"}\n` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `Mekanik tidak perlu melanjutkan tindakan servis pada unit ini. Tiket telah ditutup otomatis.\n` +
    `Salam Tangguh! 🚧`;

  if (formValues.sendWA) {
    broadcastToPlantGroups({
      operatorMsg: cancelMsgOperator,
      mechanicMsg: cancelMsgMechanic
    });
  }

  if (appState.scriptUrl) {
    try {
      await fetch(appState.scriptUrl, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({
          action: "updateStatus",
          data: {
            "ID": item["ID"],
            "STATUS": "CANCEL",
            "TIME RFU": timeCancel,
            "DURATION": durationText,
            "TINDAKAN / DO": `DIBATALKAN (CANCEL): ${formValues.reason}`
          }
        }),
        redirect: "follow"
      });
    } catch (err) {
      console.warn("Error sync cancel to GAS:", err);
    }
  }

  setLoading(false);

  Swal.fire({
    icon: "success",
    title: "Breakdown Dibatalkan (CANCEL)",
    html: `
      <p class="text-xs text-slate-300">Unit <strong>${item["CODE UNIT AMM"]}</strong> telah di-cancel dan auto selesai.</p>
      <div class="mt-2.5 p-2 bg-rose-950/40 border border-rose-900/60 rounded-lg text-rose-300 text-[11px] flex items-center justify-center gap-1.5">
        <i class="fa-solid fa-check-circle text-rose-400"></i> Status Tiket: CANCEL (Closed)
      </div>
    `,
    background: "#1e293b",
    color: "#f8fafc",
    confirmButtonColor: "#e11d48",
    confirmButtonText: "Selesai"
  });

  applyFilters();
  updateKPIs();
  if (typeof renderSpreadsheetView === "function") renderSpreadsheetView();
};
window.openProfileModal = openProfileModal;
window.closeProfileModal = closeProfileModal;
window.handleRFUAction = function (id) {
  if (!appState.currentUser) {
    Swal.fire({
      icon: 'warning',
      title: 'Akses Dibatasi',
      text: 'Hanya petugas Base Control terdaftar yang dapat mengonfirmasi RFU.',
      showCancelButton: true,
      confirmButtonText: 'Login Sekarang',
      cancelButtonText: 'Batal',
      background: '#1e293b',
      color: '#f8fafc',
      confirmButtonColor: '#f59e0b'
    }).then((res) => {
      if (res.isConfirmed) openLoginModal();
    });
    return;
  }

  const item = appState.data.find(i => i['ID'] === id);
  if (!item) return;

  appState.selectedForRFU = item;
  document.getElementById('rfuUnitCode').textContent = `${item['CODE UNIT AMM']} - ${item['MODEL UNIT']}`;
  document.getElementById('rfuBDInfo').textContent = `BD: ${item['DATE BD']} ${item['TIME BD']} (HM: ${item['HM DOWN']})`;
  document.getElementById('rfuHM').value = item['HM DOWN'];
  if (document.getElementById('rfuDoDescription')) document.getElementById('rfuDoDescription').value = item['TINDAKAN / DO'] || item['DESCRIPTION RFU'] || '';

  // Extract operator name and phone
  const inputingBy = item['INPUTING BY'] || '';
  let opName = '-';
  let opPhone = item['NO HP OPERATOR'] || item['OPERATOR PHONE'] || extractPhoneFromText(inputingBy);

  if (inputingBy.includes('|')) {
    opName = inputingBy.split('|')[0].trim();
  } else if (inputingBy) {
    opName = inputingBy.replace(/\(Operator.*\)|\(Mekanik.*\)|\(Driver.*\)/gi, '').trim();
  }

  const opNameEl = document.getElementById('rfuOperatorName');
  if (opNameEl) opNameEl.textContent = opName || 'Operator Unit';

  // Update tampilan status grup WA operator di modal RFU
  const groupTarget = appState.waGroupOperator || '';
  const groupDisplay = document.getElementById('rfuGroupTargetDisplay');
  const groupBadge = document.getElementById('rfuGroupStatusBadge');
  const chkSend = document.getElementById('rfuSendWaToOperator');

  if (groupDisplay) {
    groupDisplay.textContent = groupTarget || 'Belum dikonfigurasi — atur di Pengaturan Notifikasi';
  }
  if (groupBadge) {
    if (groupTarget && appState.waToken) {
      groupBadge.textContent = 'Siap Kirim';
      groupBadge.className = 'text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-700 font-semibold whitespace-nowrap';
    } else if (groupTarget && !appState.waToken) {
      groupBadge.textContent = 'Token Kosong';
      groupBadge.className = 'text-[10px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-700 font-semibold whitespace-nowrap';
    } else {
      groupBadge.textContent = 'Belum Dikonfigurasi';
      groupBadge.className = 'text-[10px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 font-semibold whitespace-nowrap';
    }
  }
  if (chkSend) {
    // Auto-cek jika grup sudah dikonfigurasi
    chkSend.checked = Boolean(groupTarget && appState.waToken);
  }

  const now = new Date();
  document.getElementById('rfuTime').value = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  document.getElementById('modalRFU')?.classList.remove('hidden');
};

function closeRFUModal() {
  document.getElementById('modalRFU')?.classList.add('hidden');
  appState.selectedForRFU = null;
}

async function handleRFUSubmit(e) {
  e.preventDefault();
  if (!appState.selectedForRFU) return;

  const item = appState.selectedForRFU;
  const hmRFU = document.getElementById('rfuHM').value;
  const timeRFU = document.getElementById('rfuTime').value;
  const doDescription = (document.getElementById('rfuDoDescription')?.value || '').trim();

  const operatorPhoneInput = (document.getElementById('rfuOperatorPhone')?.value || '').trim();
  const shouldSendWa = document.getElementById('rfuSendWaToOperator')?.checked;
  // Grup WA operator diambil dari settings, bukan dari input individu
  const waGroupTarget = appState.waGroupOperator || '';

  setLoading(true);

  const start = new Date(`${item['DATE BD']}T${item['TIME BD'] || '00:00'}:00`);
  let end = new Date(`${item['DATE BD']}T${timeRFU}:00`);
  if (end < start) end.setDate(end.getDate() + 1);
  const diffHours = Math.max(0, (end - start) / (1000 * 60 * 60));
  const durationText = formatAgingTextJS(diffHours);

  item['STATUS'] = 'READY';
  item['HM RFU'] = hmRFU;
  item['TIME RFU'] = timeRFU;
  item['TINDAKAN / DO'] = doDescription;
  item['DESCRIPTION RFU'] = doDescription;
  item['DURATION'] = durationText;
  item['AGING BD'] = durationText;

  saveLocalData();

  const opName = (document.getElementById('rfuOperatorName')?.textContent || 'Operator').replace('-', '').trim() || 'Rekan Operator';

  // Broadcast RFU ke KEDUA Grup: Grup Operator & Grup Mekanik
  const opRfuMsg =
    `🟢 *UNIT READY FOR USE (RFU) - PLANT SS6* 🟢\n\n` +
    `📢 *Pemberitahuan untuk Seluruh Operator Shift:*\n` +
    `Unit berikut telah selesai diperbaiki dan *SIAP BEROPERASI KEMBALI* di pit:\n\n` +
    `🚜 *Unit*         : *${item['CODE UNIT AMM']}* (${item['MODEL UNIT'] || '-'})` + '\n' +
    `👷 *Operator*     : ${opName}` + '\n' +
    `📍 *Posisi*       : ${item['POSISI UNIT'] || '-'}` + '\n' +
    `⏱️ *HM RFU*       : ${hmRFU}` + '\n' +
    `🕒 *Jam RFU*      : ${timeRFU} WITA` + '\n' +
    `⏳ *Durasi BD*    : ${durationText}` + '\n' +
    (doDescription ? `🔧 *Tindakan/DO* : ${doDescription}\n` : '') + '━━━━━━━━━━━━━━━━━━━━\n' +
    `ℹ️ Informasi ini disiarkan ke Grup Operator agar shift berikutnya mengetahui unit sudah ready.\n` +
    `Harap lakukan *P2H* sebelum unit bergerak. Utamakan *KESELAMATAN KERJA (K3)*! ⛑️ Salam Tangguh! 🚧`;

  const mechRfuMsg =
    `🟢 *UNIT RFU (READY FOR USE) - PLANT SERVICE SS6* 🟢\n\n` +
    `Unit telah dinyatakan *RFU / SELESAI PERBAIKAN*:\n\n` +
    `🚜 *Unit*         : *${item['CODE UNIT AMM']}* (${item['MODEL UNIT'] || '-'})` + '\n' +
    `📍 *Posisi*       : ${item['POSISI UNIT'] || '-'}` + '\n' +
    `⏱️ *HM RFU*       : ${hmRFU}` + '\n' +
    `🕒 *Waktu RFU*    : ${timeRFU} WITA` + '\n' +
    `⏳ *Total Downtime*: ${durationText}` + '\n' +
    `🔧 *Tindakan/DO*  : ${doDescription || '-'}` + '\n' +
    '━━━━━━━━━━━━━━━━━━━━\n' +
    `Tiket perbaikan ditutup. Unit siap dialokasikan kembali ke operasional tambang.\n` +
    `Salam Tangguh! 🚧`;

  if (shouldSendWa) {
    broadcastToPlantGroups({
      operatorMsg: opRfuMsg,
      mechanicMsg: mechRfuMsg
    });
  }

  if (appState.scriptUrl) {
    try {
      await fetch(appState.scriptUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({
          action: 'updateRFU',
          data: {
            'ID': item['ID'],
            'STATUS': 'READY',
            'HM RFU': hmRFU,
            'TIME RFU': timeRFU,
            'DO DESCRIPTION': doDescription,
            'TINDAKAN / DO': doDescription,
            'operatorName': opName,
            'waGroupOperator': waGroupTarget,
            'sendWaToGrupOperator': shouldSendWa && Boolean(waGroupTarget),
            'waToken': appState.waToken,
            'waTarget': appState.waTarget,
            'tgToken': appState.tgToken,
            'tgChatId': appState.tgChatId
          }
        }),
        redirect: 'follow'
      });
    } catch (err) {
      console.warn('Error updating RFU to GAS:', err);
    }
  }

  setLoading(false);
  closeRFUModal();

  // Tampilkan konfirmasi broadcast
  let waBroadcastHtml = '';
  if (shouldSendWa && waGroupTarget && appState.waToken) {
    waBroadcastHtml = `
      <div class="mt-3 p-3 bg-emerald-950/70 border border-emerald-800 rounded-xl text-left space-y-1.5">
        <div class="flex items-center gap-1.5 text-emerald-400 font-bold text-xs">
          <i class="fa-brands fa-whatsapp text-sm"></i>
          <span>Broadcast Grup WA Operator Terkirim</span>
        </div>
        <p class="text-[11px] text-slate-300">Pesan RFU otomatis telah dikirimkan ke <strong class="text-emerald-300">Grup WA Operator</strong> (${waGroupTarget}).</p>
        <p class="text-[10px] text-slate-500">Semua operator di grup, termasuk shift pengganti, akan menerima notifikasi unit siap beroperasi.</p>
      </div>
    `;
  } else if (shouldSendWa && !waGroupTarget) {
    waBroadcastHtml = `
      <div class="mt-3 p-2.5 bg-amber-950/50 border border-amber-800/60 rounded-xl text-left">
        <p class="text-[11px] text-amber-300"><i class="fa-solid fa-triangle-exclamation mr-1"></i>Grup WA Operator belum dikonfigurasi. Atur di <strong>Pengaturan Notifikasi</strong>.</p>
      </div>
    `;
  }

  Swal.fire({
    icon: 'success',
    title: 'Unit Ready For Use (RFU)!',
    html: `
      <p class="text-xs text-slate-300">Unit <strong>${item['CODE UNIT AMM']}</strong> siap operasi kembali (Downtime: ${durationText}).</p>
      <div class="mt-2.5 p-2 bg-slate-950 border border-slate-800 rounded-lg text-slate-400 text-[11px] flex items-center justify-center gap-1.5">
        <i class="fa-solid fa-bullhorn text-amber-400 text-xs"></i> Notifikasi RFU disiarkan ke Grup Lapangan
      </div>
      ${waBroadcastHtml}
    `,
    background: '#1e293b',
    color: '#f8fafc',
    confirmButtonColor: '#10b981',
    confirmButtonText: 'Tutup'
  });

  applyFilters();
  updateKPIs();
  if (typeof renderSpreadsheetView === 'function') renderSpreadsheetView();
}


// ============================================================
// MODAL PROFIL & MANAJEMEN AKUN PETUGAS (DIPISAH DARI BOT)
// ============================================================
window.openProfileModal = function () {
  if (!appState.currentUser) {
    Swal.fire({
      icon: 'info',
      title: 'Belum Login',
      text: 'Silakan login sebagai Base Control untuk melihat profil akun.',
      showCancelButton: true,
      confirmButtonText: 'Login Sekarang',
      cancelButtonText: 'Batal',
      background: '#1e293b',
      color: '#f8fafc',
      confirmButtonColor: '#f59e0b'
    }).then(r => {
      if (r.isConfirmed) openLoginModal();
    });
    return;
  }

  const user = appState.currentUser;

  // Fill identity display
  const nameEl = document.getElementById('profModalName');
  const nrpEl  = document.getElementById('profModalNrp');
  const jabEl  = document.getElementById('profModalJabatan');
  const emailEl= document.getElementById('profModalEmail');
  const initEl = document.getElementById('profModalInitials');

  if (nameEl)  nameEl.textContent  = user.name    || 'Petugas Base Control';
  if (nrpEl)   nrpEl.textContent   = 'NRP: ' + (user.nrp || '-');
  if (jabEl)   jabEl.textContent   = user.jabatan  || 'BASE CONTROL';
  if (emailEl) emailEl.textContent = user.email    || '-';
  if (initEl) {
    const parts = (user.name || 'BC').split(' ');
    initEl.textContent = (parts[0][0] + (parts[1] ? parts[1][0] : '')).toUpperCase();
  }

  // Pre-populate edit profile form
  const editName  = document.getElementById('editProfileName');
  const editEmail = document.getElementById('editProfileEmail');
  if (editName)  editName.value  = user.name  || '';
  if (editEmail) editEmail.value = user.email || '';

  // Pre-populate web settings form
  const ws = webSettings;
  const selDefaultTab    = document.getElementById('settingDefaultTab');
  const selAutoRefresh   = document.getElementById('settingAutoRefresh');
  const selTableDensity  = document.getElementById('settingTableDensity');
  const selThemeContrast = document.getElementById('settingThemeContrast');
  const chkSoundAlert    = document.getElementById('settingSoundAlert');
  if (selDefaultTab    && ws.defaultTab)    selDefaultTab.value    = ws.defaultTab;
  if (selAutoRefresh   && ws.autoRefresh)   selAutoRefresh.value   = ws.autoRefresh;
  if (selTableDensity  && ws.tableDensity)  selTableDensity.value  = ws.tableDensity;
  if (selThemeContrast && ws.themeContrast) selThemeContrast.value = ws.themeContrast;
  if (chkSoundAlert)    chkSoundAlert.checked = ws.soundAlert === true || ws.soundAlert === 'true';

  // Render registered accounts list
  renderRegisteredAccounts();

  document.getElementById('modalProfile')?.classList.remove('hidden');
};

window.closeProfileModal = function () {
  document.getElementById('modalProfile')?.classList.add('hidden');
};

function renderRegisteredAccounts() {
  const listEl = document.getElementById('registeredAccountsList');
  const countEl = document.getElementById('registeredAccountsCount');
  if (!listEl) return;

  listEl.innerHTML = '';
  const currentNrp = appState.currentUser ? String(appState.currentUser.nrp) : '';

  if (countEl) countEl.textContent = `${localAccounts.length} Akun Terdaftar`;

  localAccounts.forEach(acc => {
    const isCurrent = String(acc.nrp) === currentNrp;
    const item = document.createElement('div');
    item.className = `py-2 flex items-center justify-between text-xs ${isCurrent ? 'text-amber-300 font-bold' : 'text-slate-300'}`;
    item.innerHTML = `
      <div class="flex items-center gap-2">
        <span class="w-6 h-6 rounded-lg ${isCurrent ? 'bg-amber-500/20 text-amber-400' : 'bg-slate-800 text-slate-400'} flex items-center justify-center text-[10px]">
          <i class="fa-solid fa-user"></i>
        </span>
        <div>
          <span class="block font-semibold ${isCurrent ? 'text-amber-300' : 'text-white'}">${acc.name}</span>
          <span class="text-[10px] text-slate-500 font-mono">NRP: ${acc.nrp} &bull; ${acc.jabatan || 'Base Control'}</span>
        </div>
      </div>
      <div>
        ${isCurrent ? '<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-400 border border-amber-500/40">Akun Anda</span>' : '<span class="text-[10px] text-slate-600">Terdaftar</span>'}
      </div>
    `;
    listEl.appendChild(item);
  });
}


// ── Handler: Edit Profile (Name + Email) ────────────────────────────────────
function handleEditProfileSubmit(e) {
  e.preventDefault();
  if (!appState.currentUser) return;

  const newName  = (document.getElementById('editProfileName')?.value  || '').trim();
  const newEmail = (document.getElementById('editProfileEmail')?.value || '').trim();

  if (!newName) {
    Swal.fire({ icon: 'warning', title: 'Nama kosong', text: 'Nama tidak boleh kosong.', background: '#1e293b', color: '#f8fafc' });
    return;
  }

  // Update currentUser
  appState.currentUser.name  = newName;
  appState.currentUser.email = newEmail;
  localStorage.setItem('plant_auth_user', JSON.stringify(appState.currentUser));

  // Update localAccounts
  const accIdx = localAccounts.findIndex(a => String(a.nrp).toLowerCase() === String(appState.currentUser.nrp).toLowerCase());
  if (accIdx !== -1) {
    localAccounts[accIdx].name  = newName;
    localAccounts[accIdx].email = newEmail;
  }
  // Persist all custom accounts
  localStorage.setItem('plant_custom_accounts', JSON.stringify(localAccounts));

  // Refresh UI
  updateAuthUI();
  const nameEl  = document.getElementById('profModalName');
  const emailEl = document.getElementById('profModalEmail');
  const initEl  = document.getElementById('profModalInitials');
  if (nameEl)  nameEl.textContent  = newName;
  if (emailEl) emailEl.textContent = newEmail || '-';
  if (initEl) {
    const parts = newName.split(' ');
    initEl.textContent = (parts[0][0] + (parts[1] ? parts[1][0] : '')).toUpperCase();
  }

  Swal.fire({ icon: 'success', title: 'Profil Disimpan', text: 'Nama dan email berhasil diperbarui.', background: '#1e293b', color: '#f8fafc', timer: 1800, showConfirmButton: false });
}

// ── Handler: Save Web Settings ───────────────────────────────────────────────
function handleSaveWebSettings(e) {
  e.preventDefault();

  webSettings.defaultTab    = document.getElementById('settingDefaultTab')?.value    || 'operator';
  webSettings.autoRefresh   = document.getElementById('settingAutoRefresh')?.value   || '0';
  webSettings.tableDensity  = document.getElementById('settingTableDensity')?.value  || 'normal';
  webSettings.themeContrast = document.getElementById('settingThemeContrast')?.value || 'normal';
  webSettings.soundAlert    = document.getElementById('settingSoundAlert')?.checked  || false;

  saveWebSettingsToStorage();
  applyWebSettings();

  Swal.fire({ icon: 'success', title: 'Pengaturan Disimpan', text: 'Preferensi web telah diterapkan.', background: '#1e293b', color: '#f8fafc', timer: 1600, showConfirmButton: false });
}

async function handleChangePassword(e) {
  e.preventDefault();
  if (!appState.currentUser) return;

  const currentPass = (document.getElementById('changePassCurrent')?.value || '').trim();
  const newPass = (document.getElementById('changePassNew')?.value || '').trim();
  const confirmPass = (document.getElementById('changePassConfirm')?.value || '').trim();

  if (newPass.length < 6) {
    Swal.fire({
      icon: 'warning',
      title: 'Password Terlalu Pendek',
      text: 'Password baru minimal harus 6 karakter.',
      background: '#1e293b',
      color: '#f8fafc'
    });
    return;
  }

  if (newPass !== confirmPass) {
    Swal.fire({
      icon: 'error',
      title: 'Password Tidak Cocok',
      text: 'Konfirmasi password baru tidak sama.',
      background: '#1e293b',
      color: '#f8fafc'
    });
    return;
  }

  // Cek apakah password lama cocok
  const currentNrp = String(appState.currentUser.nrp).toLowerCase();
  const targetAcc = localAccounts.find(a => String(a.nrp).toLowerCase() === currentNrp);

  if (targetAcc && targetAcc.password && targetAcc.password !== currentPass) {
    Swal.fire({
      icon: 'error',
      title: 'Password Salah',
      text: 'Password lama yang Anda masukkan tidak cocok!',
      background: '#1e293b',
      color: '#f8fafc'
    });
    return;
  }

  // Update password
  if (targetAcc) {
    targetAcc.password = newPass;
  } else {
    localAccounts.push({
      nrp: appState.currentUser.nrp,
      name: appState.currentUser.name,
      jabatan: appState.currentUser.jabatan,
      password: newPass
    });
  }

  // Simpan custom accounts ke localStorage
  localStorage.setItem('plant_custom_accounts', JSON.stringify(localAccounts));

  // Sync password change ke GAS jika terhubung
  if (appState.scriptUrl) {
    try {
      fetch(appState.scriptUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({
          action: 'changePassword',
          nrp: appState.currentUser.nrp,
          newPassword: newPass
        })
      }).catch(err => console.warn('Sync password to GAS error:', err));
    } catch (e) { }
  }

  document.getElementById('formChangePassword')?.reset();

  Swal.fire({
    icon: 'success',
    title: 'Password Berhasil Diubah!',
    text: 'Password baru akun Anda telah aktif.',
    background: '#1e293b',
    color: '#f8fafc',
    confirmButtonColor: '#10b981'
  });
}

function openSettingsModal() {
  if (!appState.currentUser) {
    Swal.fire({
      icon: 'warning',
      title: 'Akses Ditolak',
      text: 'Harus login sebagai Base Control untuk mengakses pengaturan sistem.',
      background: '#1e293b',
      color: '#f8fafc'
    });
    return;
  }
  const modal = document.getElementById('modalSettings');
  document.getElementById('gasUrlInput').value = appState.scriptUrl;
  document.getElementById('tgTokenInput').value = appState.tgToken;
  document.getElementById('tgChatIdInput').value = appState.tgChatId;
  document.getElementById('tgToggleInput').checked = appState.tgEnabled;
  document.getElementById('waTokenInput').value = appState.waToken;
  document.getElementById('waTargetInput').value = appState.waTarget;
  document.getElementById('waToggleInput').checked = appState.waEnabled;
  const waGrpInput = document.getElementById('waGroupOperatorInput');
  if (waGrpInput) waGrpInput.value = appState.waGroupOperator;
  if (modal) modal.classList.remove('hidden');
}

function closeSettingsModal() { document.getElementById('modalSettings')?.classList.add('hidden'); }
function openLoginModal() { document.getElementById('modalLogin')?.classList.remove('hidden'); }
function closeLoginModal() { document.getElementById('modalLogin')?.classList.add('hidden'); }
function openRegisterModal() { closeLoginModal(); document.getElementById('modalRegister')?.classList.remove('hidden'); }
function closeRegisterModal() { document.getElementById('modalRegister')?.classList.add('hidden'); }

async function handleLogin(e) {
  e.preventDefault();
  const ident = document.getElementById('loginUsername').value.trim().toLowerCase();
  const password = document.getElementById('loginPassword').value.trim();

  setLoading(true);
  let verifiedUser = null;

  const localMatch = localAccounts.find(acc =>
    (acc.nrp.toLowerCase() === ident || (ident === 'admin' && acc.nrp === '10001')) &&
    acc.password === password
  );
  if (localMatch) {
    verifiedUser = { nrp: localMatch.nrp, name: localMatch.name, email: localMatch.email || '', jabatan: localMatch.jabatan || 'BASE CONTROL' };
  }

  if (!verifiedUser && appState.scriptUrl) {
    try {
      const response = await fetch(appState.scriptUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action: 'login', nrp: ident, password: password }),
        redirect: 'follow'
      });
      const res = await response.json();
      if (res.status === 'success' && res.user) verifiedUser = res.user;
    } catch (err) { }
  }

  setLoading(false);

  if (verifiedUser) {
    appState.currentUser = verifiedUser;
    localStorage.setItem('plant_auth_user', JSON.stringify(verifiedUser));
    closeLoginModal();
    updateAuthUI();
    Swal.fire({
      icon: 'success',
      title: 'Login Berhasil',
      text: `Selamat bertugas, ${verifiedUser.name}!`,
      background: '#1e293b',
      color: '#f8fafc',
      timer: 2000,
      showConfirmButton: false
    });
    switchTab('control');
  } else {
    Swal.fire({ icon: 'error', title: 'Login Gagal', text: 'NRP atau password tidak cocok!', background: '#1e293b', color: '#f8fafc' });
  }
}

async function handleRegisterSubmit(e) {
  e.preventDefault();
  const nrp = document.getElementById('regNrp').value.trim();
  const nama = document.getElementById('regNama').value.trim();
  const email = (document.getElementById('regEmail')?.value || '').trim();
  const jabatan = document.getElementById('regJabatan').value;
  const password = document.getElementById('regPassword').value.trim();
  const confirmPassword = document.getElementById('regConfirmPassword').value.trim();

  if (password !== confirmPassword) {
    Swal.fire({ icon: 'error', title: 'Error', text: 'Password tidak cocok!', background: '#1e293b', color: '#f8fafc' });
    return;
  }

  setLoading(true);
  const newUser = { nrp, nama, email, jabatan, password };

  if (appState.scriptUrl) {
    try {
      await fetch(appState.scriptUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action: 'register', user: newUser }),
        redirect: 'follow'
      });
    } catch (err) { }
  }

  localAccounts.push({ nrp, name: nama, email, jabatan, password });
  let savedAccs = [];
  try { savedAccs = JSON.parse(localStorage.getItem('plant_custom_accounts') || '[]'); } catch (e) { }
  savedAccs.push({ nrp, name: nama, email, jabatan, password });
  localStorage.setItem('plant_custom_accounts', JSON.stringify(savedAccs));

  setLoading(false);
  closeRegisterModal();
  document.getElementById('formRegister').reset();

  Swal.fire({
    icon: 'success',
    title: 'Akun Terdaftar!',
    text: `NRP ${nrp} (${nama}) berhasil didaftarkan.`,
    background: '#1e293b',
    color: '#f8fafc'
  }).then(() => {
    openLoginModal();
    document.getElementById('loginUsername').value = nrp;
  });
}

function handleLogout() {
  Swal.fire({
    title: 'Konfirmasi Logout',
    text: 'Keluar dari sesi Base Control?',
    icon: 'question',
    showCancelButton: true,
    confirmButtonText: 'Ya, Logout',
    cancelButtonText: 'Batal',
    background: '#1e293b',
    color: '#f8fafc',
    confirmButtonColor: '#ef4444'
  }).then((result) => {
    if (result.isConfirmed) {
      appState.currentUser = null;
      localStorage.removeItem('plant_auth_user');
      updateAuthUI();
      switchTab('operator');
    }
  });
}

function saveSettings() {
  const newUrl = document.getElementById('gasUrlInput').value.trim();
  const tgToken = document.getElementById('tgTokenInput').value.trim();
  const tgChatId = document.getElementById('tgChatIdInput').value.trim();
  const tgEnabled = document.getElementById('tgToggleInput').checked;
  const waToken = document.getElementById('waTokenInput').value.trim();
  const waTarget = document.getElementById('waTargetInput').value.trim();
  const waEnabled = document.getElementById('waToggleInput').checked;
  const waGroupOperator = (document.getElementById('waGroupOperatorInput')?.value || '').trim();

  appState.scriptUrl = newUrl;
  appState.tgToken = tgToken;
  appState.tgChatId = tgChatId;
  appState.tgEnabled = tgEnabled;
  appState.waToken = waToken;
  appState.waTarget = waTarget;
  appState.waEnabled = waEnabled;
  appState.waGroupOperator = waGroupOperator;

  localStorage.setItem('plant_gas_url', newUrl);
  localStorage.setItem('plant_tg_token', tgToken);
  localStorage.setItem('plant_tg_chat_id', tgChatId);
  localStorage.setItem('plant_tg_enabled', tgEnabled ? 'true' : 'false');
  localStorage.setItem('plant_wa_token', waToken);
  localStorage.setItem('plant_wa_target', waTarget);
  localStorage.setItem('plant_wa_enabled', waEnabled ? 'true' : 'false');
  localStorage.setItem('plant_wa_group_operator', waGroupOperator);

  if (newUrl) {
    try {
      fetch(newUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({
          action: 'saveSettings',
          settings: {
            TG_ENABLED: tgEnabled ? 'true' : 'false',
            TG_BOT_TOKEN: tgToken,
            TG_CHAT_ID: tgChatId,
            WA_ENABLED: waEnabled ? 'true' : 'false',
            WA_TOKEN: waToken,
            WA_TARGET_GROUP: waTarget
          }
        }),
        redirect: 'follow'
      }).catch(e => { });
    } catch (e) { }
  }

  closeSettingsModal();
  Swal.fire({ icon: 'success', title: 'Disimpan', text: 'Pengaturan berhasil diperbarui.', background: '#1e293b', color: '#f8fafc', timer: 2000, showConfirmButton: false });
  loadData();
}

async function handleTestTelegram() {
  const token = document.getElementById('tgTokenInput').value.trim();
  const chatId = document.getElementById('tgChatIdInput').value.trim();

  if (!token || !chatId) {
    Swal.fire({ icon: 'warning', title: 'Perhatian', text: 'Isi Token & Chat ID Telegram!', background: '#1e293b', color: '#f8fafc' });
    return;
  }

  setLoading(true);
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: '✅ *TES KONEKSI BASE CONTROL PLANT SS6*\n\nBot Telegram terhubung!', parse_mode: 'Markdown' })
    });
    const d = await res.json();
    if (d.ok) Swal.fire({ icon: 'success', title: 'Telegram Terhubung!', text: 'Pesan tes terkirim!', background: '#1e293b', color: '#f8fafc' });
    else throw new Error(d.description);
  } catch (e) {
    Swal.fire({ icon: 'error', title: 'Gagal', text: e.toString(), background: '#1e293b', color: '#f8fafc' });
  }
  setLoading(false);
}

async function handleTestWA() {
  const token = document.getElementById('waTokenInput').value.trim();
  const target = document.getElementById('waTargetInput').value.trim();

  if (!token || !target) {
    Swal.fire({ icon: 'warning', title: 'Perhatian', text: 'Isi Token & Target WA!', background: '#1e293b', color: '#f8fafc' });
    return;
  }

  setLoading(true);
  try {
    const fd = new FormData();
    fd.append('target', target);
    fd.append('message', '✅ *TES KONEKSI BASE CONTROL PLANT SS6*\n\nWhatsApp terhubung.');
    fd.append('countryCode', '62');

    const res = await fetch('https://api.fonnte.com/send', { method: 'POST', headers: { 'Authorization': token }, body: fd });
    const d = await res.json();
    if (d.status === true || d.status === 'success') {
      Swal.fire({ icon: 'success', title: 'WhatsApp Terhubung!', text: 'Pesan tes terkirim ke WA!', background: '#1e293b', color: '#f8fafc' });
    } else throw new Error(d.reason || 'Gagal kirim WA');
  } catch (e) {
    Swal.fire({ icon: 'error', title: 'Gagal', text: e.toString(), background: '#1e293b', color: '#f8fafc' });
  }
  setLoading(false);
}

async function handleTestWAGrupOperator() {
  const token = document.getElementById('waTokenInput').value.trim();
  const grupTarget = (document.getElementById('waGroupOperatorInput')?.value || '').trim();

  if (!token) {
    Swal.fire({ icon: 'warning', title: 'Token Kosong', text: 'Isi Token API Fonnte terlebih dahulu!', background: '#1e293b', color: '#f8fafc' });
    return;
  }
  if (!grupTarget) {
    Swal.fire({ icon: 'warning', title: 'ID Grup Kosong', text: 'Isi Nomor/ID Grup WA Operator terlebih dahulu!', background: '#1e293b', color: '#f8fafc' });
    return;
  }

  setLoading(true);
  const testMsg = `🟢 *TES BROADCAST SISTEM BASE CONTROL PLANT SS6* 🟢

📢 Ini adalah pesan tes broadcast notifikasi RFU ke Grup WA Operator.
Jika Anda menerima pesan ini, berarti sistem siap mengirim notifikasi *UNIT READY FOR USE (RFU)* secara otomatis ke grup ini.

✅ Koneksi: *BERHASIL*
🕒 Waktu Tes: ${new Date().toLocaleString('id-ID', { dateStyle: 'long', timeStyle: 'short' })} WITA

—Base Control Plant SS6`;

  try {
    const res = await fetch('https://api.fonnte.com/send', {
      method: 'POST',
      headers: { 'Authorization': token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ target: grupTarget, message: testMsg, countryCode: '62' })
    });
    const d = await res.json();
    if (d.status === true || d.status === 'success') {
      Swal.fire({
        icon: 'success',
        title: 'Broadcast Grup Berhasil!',
        html: `<p class="text-sm text-slate-300">Pesan tes berhasil dikirim ke <strong class="text-emerald-400">Grup WA Operator</strong>.<br><span class="text-xs font-mono text-slate-400">${grupTarget}</span></p>`,
        background: '#1e293b',
        color: '#f8fafc'
      });
    } else {
      throw new Error(d.reason || d.message || 'Gagal kirim ke grup WA');
    }
  } catch (e) {
    Swal.fire({ icon: 'error', title: 'Gagal Broadcast Grup', text: e.toString(), background: '#1e293b', color: '#f8fafc' });
  }
  setLoading(false);
}

window.exportToCSV = function () {
  if (!appState.currentUser) {
    Swal.fire({ icon: 'warning', title: 'Akses Dibatasi', text: 'Silakan login sebagai Base Control.', background: '#1e293b', color: '#f8fafc' });
    return;
  }

  if (!appState.data || appState.data.length === 0) {
    Swal.fire({ icon: 'info', title: 'Data Kosong', text: 'Tidak ada data untuk di-export.', background: '#1e293b', color: '#f8fafc' });
    return;
  }

  const headers = [
    'INPUTING BY', 'SS6', 'STATUS', 'ID', 'CODE UNIT AMM', 'MODEL UNIT',
    'POSISI UNIT', 'HM DOWN', 'HM RFU', 'DATE BD', 'AGING BD', 'TYPE BD',
    'STATUS DELAY', 'TIME BD', 'TIME RFU', 'DURATION', 'TROUBLE DESCRIPTION', 'DAMAGE', 'TINDAKAN / DO'
  ];

  let csvContent = "data:text/csv;charset=utf-8," + headers.join(",") + "\n";

  appState.data.forEach(row => {
    const values = headers.map(header => {
      const val = row[header] || (header === 'TINDAKAN / DO' ? (row['DESCRIPTION RFU'] || row['DO DESCRIPTION'] || '') : '');
      const escaped = ('' + val).replace(/"/g, '""');
      return `"${escaped}"`;
    });
    csvContent += values.join(",") + "\n";
  });

  const encodedUri = encodeURI(csvContent);
  const link = document.createElement("a");
  link.setAttribute("href", encodedUri);
  link.setAttribute("download", `Laporan_Breakdown_Plant_${new Date().toISOString().slice(0, 10)}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

function updateConnectionStatus(type, message) {
  const badge = document.getElementById('connectionBadge');
  const text = document.getElementById('connectionText');
  if (!badge || !text) return;

  text.textContent = message;

  if (type === 'connected') {
    badge.className = 'flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30';
  } else if (type === 'connecting') {
    badge.className = 'flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/30';
  } else {
    badge.className = 'flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold bg-blue-500/10 text-blue-400 border border-blue-500/30';
  }
}

function setLoading(isLoading) {
  appState.isLoading = isLoading;
  const loader = document.getElementById('globalLoader');
  if (loader) {
    if (isLoading) loader.classList.remove('hidden');
    else loader.classList.add('hidden');
  }
}

/**
 * ==============================================================================
 * DASHBOARD RIWAYAT & DATABASE BREAKDOWN FLEET (856 UNIT)
 * ==============================================================================
 */

function populateCodeUnitsDatalist() {
  const datalist = document.getElementById('listCodeUnits');
  if (!datalist || !window.ALL_MASTER_UNITS || window.ALL_MASTER_UNITS.length === 0) return;
  datalist.innerHTML = window.ALL_MASTER_UNITS.map(u =>
    `<option value="${u.code}">${u.code} - ${u.model} (${u.category})</option>`
  ).join('');
}

function populateHistoryQuickSelect() {
  // Populate hidden select (backward compat)
  const select = document.getElementById('historyQuickUnitSelect');
  // Populate datalist for unified search input
  const datalist = document.getElementById('historyUnitDatalist');

  if (!window.ALL_MASTER_UNITS) return;

  const categories = {};
  window.ALL_MASTER_UNITS.forEach(u => {
    const cat = u.category || 'General Fleet';
    if (!categories[cat]) categories[cat] = [];
    categories[cat].push(u);
  });

  // Build select options (for compat)
  if (select) {
    let html = `<option value="">⚡ Pilih Cepat dari 856 Unit...</option>`;
    for (const [catName, list] of Object.entries(categories)) {
      html += `<optgroup label="${catName} (${list.length} Unit)">`;
      list.forEach(u => { html += `<option value="${u.code}">${u.code} — ${u.model}</option>`; });
      html += `</optgroup>`;
    }
    select.innerHTML = html;
  }

  // Build datalist options for unified search
  if (datalist) {
    let dlHtml = '';
    window.ALL_MASTER_UNITS.forEach(u => {
      dlHtml += `<option value="${u.code}">${u.code} — ${u.model} (${u.category})</option>`;
    });
    datalist.innerHTML = dlHtml;
  }
}

function cleanUnitCode(inputStr) {
  if (!inputStr) return '';
  let str = String(inputStr).trim().toUpperCase();
  if (str.includes('—')) str = str.split('—')[0].trim();
  else if (str.includes(' - ')) str = str.split(' - ')[0].trim();
  else if (str.includes('(')) str = str.split('(')[0].trim();
  return str;
}

function selectUnitForHistory(unitCode) {
  if (!unitCode) return;
  const upper = cleanUnitCode(unitCode);
  if (!upper) return;
  appState.selectedUnitForDossier = upper;

  // Sync search input
  const searchInput = document.getElementById('historySearchInput');
  if (searchInput) searchInput.value = upper;

  // Sync hidden select (compat)
  const select = document.getElementById('historyQuickUnitSelect');
  if (select) select.value = upper;

  // Pastikan tab aktif adalah history
  if (appState.activeTab !== 'history') {
    switchTab('history');
  }

  // Render dossier unit langsung
  renderUnitDossier(upper);

  // Pastikan container terlihat dan scroll
  const dossierContainer = document.getElementById('unitDossierContainer');
  if (dossierContainer) {
    dossierContainer.classList.remove('hidden');
    setTimeout(() => {
      dossierContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
  }
}

function clearSelectedUnitDossier() {
  appState.selectedUnitForDossier = null;
  const container = document.getElementById('unitDossierContainer');
  if (container) {
    container.classList.add('hidden');
    container.innerHTML = '';
  }
  const select = document.getElementById('historyQuickUnitSelect');
  if (select) select.value = '';
  // Clear search input juga
  const searchInput = document.getElementById('historySearchInput');
  if (searchInput) searchInput.value = '';
  document.getElementById('btnPrintDossier')?.classList.add('hidden');
  renderFleetCatalogTable();
}

function quickCheckUnitHistory(formType) {
  const inputId = formType === 'op' ? 'opCodeUnit' : 'mechCodeUnit';
  const input = document.getElementById(inputId);
  if (!input || !input.value.trim()) {
    Swal.fire({
      icon: 'info',
      title: 'Pilih Unit Terlebih Dahulu',
      text: 'Ketik atau pilih nomor lambung / code unit pada form terlebih dahulu.',
      background: '#1e293b',
      color: '#f8fafc',
      confirmButtonColor: '#f59e0b'
    });
    return;
  }
  selectUnitForHistory(input.value.trim());
}

function createReportForUnit(unitCode) {
  const upper = unitCode.trim().toUpperCase();
  switchTab('operator');
  const opInput = document.getElementById('opCodeUnit');
  const opModel = document.getElementById('opModelUnit');
  if (opInput) opInput.value = upper;
  if (opModel && MASTER_UNITS[upper]) opModel.value = MASTER_UNITS[upper];

  // Trigger change event to set up times and check button
  const event = new Event('input', { bubbles: true });
  opInput?.dispatchEvent(event);

  Swal.fire({
    toast: true,
    position: 'top-end',
    icon: 'info',
    title: `Unit ${upper} dipilih di Form Operator`,
    timer: 2000,
    showConfirmButton: false
  });
}

function openQuickAddHistoryForUnit(unitCode) {
  openQuickAddHistoryModal();
  const upper = unitCode.trim().toUpperCase();
  const codeInput = document.getElementById('quickAddCodeUnit');
  const modelInput = document.getElementById('quickAddModelUnit');
  if (codeInput) codeInput.value = upper;
  if (modelInput && MASTER_UNITS[upper]) modelInput.value = MASTER_UNITS[upper];
}

function renderHistoryDashboard() {
  renderHistoryStats();
  // renderSpreadsheetView() hanya dipanggil di tab sheets, tidak di history
  if (appState.selectedUnitForDossier) {
    renderUnitDossier(appState.selectedUnitForDossier);
    document.getElementById('unitDossierContainer')?.classList.remove('hidden');
  } else {
    document.getElementById('unitDossierContainer')?.classList.add('hidden');
  }
  renderHistoryCharts();
  renderFleetCatalogTable();
}

function parseDurationInHours(durStr) {
  if (!durStr) return 0;
  let hours = 0;
  if (durStr.includes('Hari')) {
    const dMatch = durStr.match(/(\d+)\s*Hari/);
    if (dMatch) hours += parseInt(dMatch[1], 10) * 24;
  }
  if (durStr.includes('Jam')) {
    const hMatch = durStr.match(/(\d+)\s*Jam/);
    if (hMatch) hours += parseInt(hMatch[1], 10);
  }
  if (durStr.includes('Menit')) {
    const mMatch = durStr.match(/(\d+)\s*Menit/);
    if (mMatch) hours += Math.round(parseInt(mMatch[1], 10) / 60 * 10) / 10;
  }
  if (hours === 0 && (durStr.includes('.') || !isNaN(parseFloat(durStr)))) {
    const parsed = parseFloat(durStr);
    if (!isNaN(parsed)) hours = parsed;
  }
  return hours;
}

function renderHistoryStats() {
  const allMaster = window.ALL_MASTER_UNITS || [];
  const totalFleet = allMaster.length || 856;

  // Active breakdowns in data
  const activeBDUnits = new Set();
  const waitingPartUnits = new Set();
  const closedRFUEvents = [];
  let totalDowntimeHours = 0;

  appState.data.forEach(item => {
    const code = (item['CODE UNIT AMM'] || '').toUpperCase();
    const status = (item['STATUS'] || '').toUpperCase();
    const delay = (item['STATUS DELAY'] || '').toUpperCase();

    // CANCEL artinya unit tidak jadi BD (unit tetap READY, bukan active breakdown)
    if (status !== 'RFU' && status !== 'READY' && status !== 'CANCEL') {
      if (delay.includes('SPAREPART') || status.includes('WAITING PART')) {
        waitingPartUnits.add(code);
      } else {
        activeBDUnits.add(code);
      }
    } else if (status === 'RFU' || status === 'READY') {
      closedRFUEvents.push(item);
    }

    // Hanya kejadian BD yang tidak dibatalkan yang menyumbang downtime
    if (status !== 'CANCEL') {
      const dur = item['DURATION'] || item['AGING BD'] || '';
      totalDowntimeHours += parseDurationInHours(dur);
    }
  });

  const totalActiveBD = activeBDUnits.size + waitingPartUnits.size;
  const totalRFU = Math.max(0, totalFleet - totalActiveBD);
  const totalEvents = appState.data.length;
  const mttr = closedRFUEvents.length > 0 ? (totalDowntimeHours / closedRFUEvents.length) : 0;

  const statFleetElem = document.getElementById('statHistoryTotalFleet');
  const statRFUElem = document.getElementById('statHistoryRFU');
  const statActiveElem = document.getElementById('statHistoryActiveBD');
  const statEventsElem = document.getElementById('statHistoryTotalEvents');
  const statHoursElem = document.getElementById('statHistoryTotalHours');
  const statMTTRElem = document.getElementById('statHistoryMTTR');

  if (statFleetElem) statFleetElem.textContent = totalFleet;
  if (statRFUElem) statRFUElem.textContent = totalRFU;
  if (statActiveElem) statActiveElem.textContent = totalActiveBD;
  if (statEventsElem) statEventsElem.textContent = totalEvents;
  if (statHoursElem) statHoursElem.textContent = `${Math.round(totalDowntimeHours * 10) / 10} Jam`;
  if (statMTTRElem) statMTTRElem.textContent = `${Math.round(mttr * 10) / 10} Jam`;
}

function renderUnitDossier(unitCode) {
  const container = document.getElementById('unitDossierContainer');
  if (!container) return;

  const cleanCode = cleanUnitCode(unitCode);
  const unitInfo = window.getUnitInfo ? window.getUnitInfo(cleanCode) : { code: cleanCode, model: MASTER_UNITS[cleanCode] || '-', category: 'Mining Fleet' };
  const historyLogs = appState.data.filter(i => (i['CODE UNIT AMM'] || '').toUpperCase() === cleanCode.toUpperCase());

  // Sort logs by date and time descending (newest first)
  historyLogs.sort((a, b) => {
    const dtA = new Date(`${a['DATE BD'] || '1970-01-01'}T${a['TIME BD'] || '00:00'}:00`);
    const dtB = new Date(`${b['DATE BD'] || '1970-01-01'}T${b['TIME BD'] || '00:00'}:00`);
    return dtB - dtA;
  });

  const latestLog = historyLogs[0];
  let currentStatus = 'RFU';
  if (latestLog) {
    const stat = (latestLog['STATUS'] || '').toUpperCase();
    // CANCEL atau READY/RFU artinya unit siap operasi (RFU)
    if (stat !== 'RFU' && stat !== 'READY' && stat !== 'CANCEL') {
      currentStatus = stat;
    } else {
      currentStatus = 'RFU';
    }
  }

  let totalDowntimeHours = 0;
  const damageCounts = {};
  let lastHM = '-';

  historyLogs.forEach(log => {
    if (log['HM RFU']) lastHM = log['HM RFU'];
    else if (log['HM DOWN'] && lastHM === '-') lastHM = log['HM DOWN'];

    // CANCEL tidak menyumbang downtime
    const s = (log['STATUS'] || '').toUpperCase();
    if (s !== 'CANCEL') {
      const dur = log['DURATION'] || log['AGING BD'] || '';
      totalDowntimeHours += parseDurationInHours(dur);
    }

    const dmg = log['DAMAGE'] || 'GENERAL / OTHERS';
    damageCounts[dmg] = (damageCounts[dmg] || 0) + 1;
  });

  let dominantDamage = '-';
  let maxCount = 0;
  for (const [dmg, cnt] of Object.entries(damageCounts)) {
    if (cnt > maxCount) {
      maxCount = cnt;
      dominantDamage = `${dmg} (${cnt}x)`;
    }
  }

  const categoryBadgeClass = window.getCategoryBadgeClass ? window.getCategoryBadgeClass(unitInfo.category) : 'bg-slate-100 text-slate-700 border-slate-300';
  const categoryIcon = window.getCategoryIcon ? window.getCategoryIcon(unitInfo.category) : '<i class="fa-solid fa-truck"></i>';

  let statusBadge = '';
  if (currentStatus === 'RFU') {
    const isLastCancelled = latestLog && (latestLog['STATUS'] || '').toUpperCase() === 'CANCEL';
    statusBadge = `
      <span class="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-300 shadow-sm">
        <span class="w-2 h-2 rounded-full bg-emerald-500 mr-2 animate-pulse"></span> READY FOR USE (RFU)
        ${isLastCancelled ? '<span class="text-[10px] text-slate-500 ml-1.5 font-normal">(Batal Servis/Ready)</span>' : ''}
      </span>
    `;
  } else if (currentStatus.includes('WAITING PART') || currentStatus.includes('DELAY')) {
    statusBadge = `<span class="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-300 shadow-sm"><span class="w-2 h-2 rounded-full bg-amber-500 mr-2 animate-pulse"></span> WAITING PART / DELAY</span>`;
  } else {
    statusBadge = `<span class="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold bg-red-100 text-red-800 border border-red-300 shadow-sm"><span class="w-2 h-2 rounded-full bg-red-600 mr-2 animate-pulse"></span> BREAKDOWN (DALAM PERBAIKAN)</span>`;
  }

  let tableRowsHTML = '';
  if (historyLogs.length === 0) {
    tableRowsHTML = `
      <tr>
        <td colspan="9" class="p-8 text-center text-slate-500 bg-white">
          <i class="fa-solid fa-shield-heart text-4xl mb-3 text-emerald-500 block"></i>
          <p class="text-sm font-bold text-slate-800">Unit ${cleanCode} Belum Memiliki Catatan Breakdown</p>
          <p class="text-xs text-slate-500 mt-1">Status unit prima dan siap operasi (100% Availability). Riwayat akan tercatat otomatis saat ada laporan perbaikan.</p>
          <button type="button" onclick="openQuickAddHistoryForUnit('${cleanCode}')" class="mt-4 px-4 py-2 bg-red-600 hover:bg-red-500 text-white font-bold rounded-xl text-xs transition inline-flex items-center gap-1.5 shadow">
            <i class="fa-solid fa-plus-circle"></i> Catat Log Breakdown Baru untuk ${cleanCode}
          </button>
        </td>
      </tr>
    `;
  } else {
    tableRowsHTML = historyLogs.map((row, idx) => {
      const meta = getStatusMeta(row['STATUS']);
      const rowStatusBadge = meta.badge;

      const aging = meta.key === 'CANCEL'
        ? '<span class="text-xs text-slate-500 font-semibold italic">0 Jam (Batal/Ready)</span>'
        : (meta.isDone ? (row['DURATION'] || row['AGING BD'] || '-') : calculateAging(row['DATE BD'], row['TIME BD']));
      const tindakanDO = row['TINDAKAN / DO'] || row['DESCRIPTION RFU'] || row['DO DESCRIPTION'] || '-';

      return `
        <tr class="border-b border-slate-200 transition-colors text-xs ${meta.rowBg}">
          <td class="p-3 font-mono">
            <button type="button" onclick="openDetailTiketModal('${row['ID']}')" title="Buka Detail Tiket" class="text-red-700 hover:text-red-900 hover:underline font-bold font-mono">
              ${row['ID'] || `BD-${idx + 1}`}
            </button>
          </td>
          <td class="p-3 whitespace-nowrap">
            <div class="font-bold text-slate-800">${row['DATE BD'] || '-'}</div>
            <div class="text-[10px] text-slate-500 font-mono">${row['TIME BD'] || ''}</div>
          </td>
          <td class="p-3">${rowStatusBadge}</td>
          <td class="p-3 text-slate-800 font-mono font-medium">${row['HM DOWN'] || '-'}${row['HM RFU'] ? ` <span class="text-emerald-700 font-bold">→ ${row['HM RFU']}</span>` : ''}</td>
          <td class="p-3 font-bold font-mono ${meta.key === 'READY' ? 'text-emerald-700' : (meta.key === 'CANCEL' ? 'text-red-700' : 'text-amber-700')}">${aging}</td>
          <td class="p-3 text-slate-800 truncate max-w-[140px] font-medium" title="${row['POSISI UNIT'] || ''}"><i class="fa-solid fa-location-dot text-red-500 mr-1"></i>${row['POSISI UNIT'] || '-'}</td>
          <td class="p-3"><span class="px-2 py-0.5 rounded bg-slate-800 text-white font-mono text-[10px] font-bold">${row['DAMAGE'] || '-'}</span></td>
          <td class="p-3 max-w-xs">
            <div class="font-bold text-slate-900 truncate" title="${row['TROUBLE DESCRIPTION'] || ''}">${row['TROUBLE DESCRIPTION'] || '-'}</div>
            <div class="text-[10px] text-slate-700 font-medium truncate mt-0.5" title="${tindakanDO}"><i class="fa-solid fa-wrench text-[9px] mr-1 text-red-600"></i>${tindakanDO}</div>
          </td>
          <td class="p-3 text-center whitespace-nowrap">
            <div class="flex items-center justify-center gap-1.5">
              <button onclick="openDetailTiketModal('${row['ID']}')" title="Lihat detail lengkap" class="p-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs transition border border-slate-300">
                <i class="fa-solid fa-eye"></i>
              </button>
              ${!meta.isDone ? `
                <button onclick="handleRFUAction('${row['ID']}')" class="px-2 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold shadow transition" title="RFU / Ready">
                  RFU
                </button>
                <button onclick="handleCancelAction('${row['ID']}')" class="px-2 py-1 bg-rose-600 hover:bg-rose-500 text-white rounded-lg text-xs font-semibold shadow transition" title="Cancel Tiket">
                  Cancel
                </button>
              ` : `
                <span class="text-[10px] font-bold ${meta.key === 'READY' ? 'text-emerald-700' : 'text-rose-700'}">Selesai</span>
              `}
            </div>
          </td>
        </tr>
      `;
    }).join('');
  }

  container.innerHTML = `
    <!-- Top Dossier Card -->
    <div class="bg-white border-2 border-red-500/30 rounded-3xl p-5 sm:p-6 shadow-md relative overflow-hidden">
      <!-- Dossier Header -->
      <div class="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border-b border-slate-200 pb-5">
        <div class="flex items-center gap-4">
          <div class="w-16 h-16 rounded-2xl bg-red-50 border border-red-200 text-red-600 flex items-center justify-center text-3xl shadow-sm">
            ${categoryIcon}
          </div>
          <div>
            <div class="flex flex-wrap items-center gap-2">
              <h1 class="text-2xl sm:text-3xl font-black text-red-600 font-mono tracking-wider">${unitInfo.code}</h1>
              ${statusBadge}
            </div>
            <div class="flex flex-wrap items-center gap-2 mt-1">
              <span class="text-sm font-bold text-slate-900">${unitInfo.model}</span>
              <span class="px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${categoryBadgeClass}">${unitInfo.category}</span>
            </div>
          </div>
        </div>

        <!-- Action Buttons -->
        <div class="flex flex-wrap items-center gap-2 self-stretch md:self-center">
          <button type="button" onclick="createReportForUnit('${cleanCode}')"
            class="px-3.5 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold text-xs flex items-center gap-1.5 shadow transition">
            <i class="fa-solid fa-plus-circle"></i> Catat BD Baru
          </button>
          <button type="button" onclick="exportHistoryToCSV('${cleanCode}')"
            class="px-3 py-2 rounded-xl bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 font-semibold text-xs flex items-center gap-1.5 transition">
            <i class="fa-solid fa-download text-emerald-600"></i> Download CSV
          </button>
          <button type="button" onclick="printCurrentUnitDossier()"
            class="px-3 py-2 rounded-xl bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 font-semibold text-xs flex items-center gap-1.5 transition">
            <i class="fa-solid fa-print text-sky-600"></i> Cetak Riwayat
          </button>
          <button type="button" onclick="clearSelectedUnitDossier()"
            class="px-3 py-2 rounded-xl bg-white hover:bg-red-50 text-slate-500 hover:text-red-600 border border-slate-300 font-semibold text-xs flex items-center gap-1.5 transition">
            <i class="fa-solid fa-xmark"></i> Tutup
          </button>
        </div>
      </div>

      <!-- 4 Unit Metric Cards -->
      <div class="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-5">
        <div class="p-3.5 bg-slate-50 border border-slate-200 rounded-2xl">
          <span class="text-[10px] font-bold text-slate-500 uppercase block">Frekuensi Breakdown</span>
          <div class="text-2xl font-black text-amber-800 font-mono mt-0.5">${historyLogs.length} <span class="text-xs font-normal text-slate-500">Kejadian</span></div>
          <span class="text-[10px] text-slate-500">Total riwayat perbaikan tersimpan</span>
        </div>

        <div class="p-3.5 bg-slate-50 border border-slate-200 rounded-2xl">
          <span class="text-[10px] font-bold text-slate-500 uppercase block">Total Downtime Terakumulasi</span>
          <div class="text-2xl font-black text-sky-800 font-mono mt-0.5">${Math.round(totalDowntimeHours * 10) / 10} <span class="text-xs font-normal text-slate-500">Jam</span></div>
          <span class="text-[10px] text-slate-500">Waktu unit berhenti beroperasi</span>
        </div>

        <div class="p-3.5 bg-slate-50 border border-slate-200 rounded-2xl">
          <span class="text-[10px] font-bold text-slate-500 uppercase block">HM Unit Terakhir</span>
          <div class="text-2xl font-black text-emerald-800 font-mono mt-0.5">${lastHM}</div>
          <span class="text-[10px] text-slate-500">Hour Meter saat servis terakhir</span>
        </div>

        <div class="p-3.5 bg-slate-50 border border-slate-200 rounded-2xl">
          <span class="text-[10px] font-bold text-slate-500 uppercase block">Komponen Dominan Rusak</span>
          <div class="text-sm font-bold text-red-700 truncate mt-1" title="${dominantDamage}">${dominantDamage}</div>
          <span class="text-[10px] text-slate-500">Paling sering diganti/diperbaiki</span>
        </div>
      </div>
    </div>

    <!-- Timeline & History Table for Selected Unit -->
    <div class="bg-white border border-slate-200 rounded-3xl overflow-hidden shadow-sm">
      <div class="p-4 border-b border-slate-200 flex items-center justify-between">
        <h3 class="text-sm font-bold text-slate-900 flex items-center gap-2">
          <i class="fa-solid fa-timeline text-red-600"></i> Riwayat &amp; Kronologi Perbaikan Unit ${cleanCode}
        </h3>
        <span class="text-xs text-slate-600 font-mono font-semibold">${historyLogs.length} Catatan Riwayat</span>
      </div>

      <div class="overflow-x-auto">
        <table class="w-full text-left border-collapse">
          <thead>
            <tr class="bg-slate-900 text-white uppercase text-[11px] font-bold tracking-wider">
              <th class="p-3">ID TIKET</th>
              <th class="p-3">TANGGAL BD</th>
              <th class="p-3">STATUS</th>
              <th class="p-3">HM DOWN / RFU</th>
              <th class="p-3">DURASI</th>
              <th class="p-3">POSISI UNIT</th>
              <th class="p-3">DAMAGE</th>
              <th class="p-3">TROUBLE &amp; TINDAKAN DO</th>
              <th class="p-3 text-center">AKSI</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-200">
            ${tableRowsHTML}
          </tbody>
        </table>
      </div>
    </div>
  `;

  container.classList.remove('hidden');
  document.getElementById('btnPrintDossier')?.classList.remove('hidden');
}

function renderFleetCatalogTable() {
  const tbody = document.getElementById('catalogTableBody');
  if (!tbody) return;

  const allUnits = window.ALL_MASTER_UNITS || [];

  // Aggregate breakdown data per unit code
  const unitStats = {};
  appState.data.forEach(item => {
    const code = (item['CODE UNIT AMM'] || '').toUpperCase();
    if (!unitStats[code]) {
      unitStats[code] = {
        logs: [],
        totalHours: 0,
        currentStatus: 'RFU',
        lastTrouble: '-'
      };
    }
    unitStats[code].logs.push(item);

    const sItem = (item['STATUS'] || '').toUpperCase();
    if (sItem !== 'CANCEL') {
      const dur = item['DURATION'] || item['AGING BD'] || '';
      unitStats[code].totalHours += parseDurationInHours(dur);
    }
  });

  // Determine latest status and trouble per unit
  for (const [code, stat] of Object.entries(unitStats)) {
    stat.logs.sort((a, b) => {
      const dtA = new Date(`${a['DATE BD'] || '1970-01-01'}T${a['TIME BD'] || '00:00'}:00`);
      const dtB = new Date(`${b['DATE BD'] || '1970-01-01'}T${b['TIME BD'] || '00:00'}:00`);
      return dtB - dtA;
    });
    const latest = stat.logs[0];
    if (latest) {
      const s = (latest['STATUS'] || '').toUpperCase();
      // CANCEL atau READY/RFU artinya unit siap operasi (RFU)
      if (s !== 'RFU' && s !== 'READY' && s !== 'CANCEL') {
        stat.currentStatus = s;
      } else {
        stat.currentStatus = 'RFU';
      }
      stat.lastTrouble = latest['TROUBLE DESCRIPTION'] || '-';
    }
  }

  // Filter list of units
  let filtered = allUnits.filter(u => {
    const code = u.code.toUpperCase();
    const model = (u.model || '').toLowerCase();
    const cat = u.category || 'General Fleet';
    const stat = unitStats[code] || { logs: [], currentStatus: 'RFU', totalHours: 0 };

    // Search query
    if (appState.historySearchQuery) {
      const q = appState.historySearchQuery;
      const match = code.toLowerCase().includes(q) || model.includes(q) || cat.toLowerCase().includes(q);
      if (!match) return false;
    }

    // Category filter
    if (appState.historySelectedCategory !== 'ALL') {
      if (cat !== appState.historySelectedCategory) return false;
    }

    // Status filter
    if (appState.historySelectedStatus === 'HAS_BD') {
      if (stat.logs.length === 0) return false;
    } else if (appState.historySelectedStatus === 'ACTIVE_BD') {
      if (stat.currentStatus === 'RFU') return false;
    } else if (appState.historySelectedStatus === 'RFU') {
      if (stat.currentStatus !== 'RFU') return false;
    }

    return true;
  });

  const totalFiltered = filtered.length;
  const matchCountElem = document.getElementById('historyMatchCount');
  if (matchCountElem) matchCountElem.textContent = totalFiltered;

  const totalFilteredElem = document.getElementById('catalogTotalFiltered');
  if (totalFilteredElem) totalFilteredElem.textContent = totalFiltered;

  // Pagination
  const pageSize = appState.catalogPageSize;
  const totalPages = Math.ceil(totalFiltered / pageSize) || 1;
  if (appState.catalogCurrentPage > totalPages) appState.catalogCurrentPage = 1;

  const startIndex = (appState.catalogCurrentPage - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, totalFiltered);
  const pageUnits = filtered.slice(startIndex, endIndex);

  const startElem = document.getElementById('catalogPageStart');
  const endElem = document.getElementById('catalogPageEnd');
  if (startElem) startElem.textContent = totalFiltered === 0 ? 0 : startIndex + 1;
  if (endElem) endElem.textContent = endIndex;

  if (pageUnits.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="9" class="p-8 text-center text-slate-500">
          <i class="fa-solid fa-magnifying-glass text-3xl mb-2 text-slate-600 block"></i>
          Tidak ada unit yang sesuai dengan filter pencarian
        </td>
      </tr>
    `;
    renderCatalogPagination(totalPages);
    return;
  }

  tbody.innerHTML = pageUnits.map((u, i) => {
    const code = u.code;
    const stat = unitStats[code] || { logs: [], currentStatus: 'RFU', totalHours: 0, lastTrouble: '-' };
    const rowNum = startIndex + i + 1;
    const catBadgeClass = window.getCategoryBadgeClass ? window.getCategoryBadgeClass(u.category) : 'bg-slate-800 text-slate-300';

    let statusBadge = '';
    if (stat.currentStatus === 'RFU') {
      statusBadge = `<span class="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300"><span class="w-1.5 h-1.5 rounded-full bg-emerald-500 mr-1.5"></span> RFU</span>`;
    } else if (stat.currentStatus.includes('WAITING PART') || stat.currentStatus.includes('DELAY')) {
      statusBadge = `<span class="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-800 border border-amber-300 pulse-active"><span class="w-1.5 h-1.5 rounded-full bg-amber-500 mr-1.5"></span> WAITING PART</span>`;
    } else {
      statusBadge = `<span class="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold bg-red-100 text-red-800 border border-red-300 pulse-active"><span class="w-1.5 h-1.5 rounded-full bg-red-600 mr-1.5"></span> BREAKDOWN</span>`;
    }

    const bdCountBadge = stat.logs.length > 0
      ? `<span class="px-2 py-0.5 rounded-md text-xs font-bold bg-amber-100 text-amber-800 border border-amber-300">${stat.logs.length} BD</span>`
      : `<span class="text-slate-400 text-[11px]">0</span>`;

    const totalHoursText = stat.totalHours > 0
      ? `<span class="font-mono text-slate-800 font-bold">${Math.round(stat.totalHours * 10) / 10} Jam</span>`
      : `<span class="text-slate-400 font-mono text-[11px]">0 Jam</span>`;

    return `
      <tr class="border-b border-slate-200 hover:bg-slate-50 transition-colors">
        <td class="p-3 text-center text-slate-500 font-mono text-xs">${rowNum}</td>
        <td class="p-3 font-mono font-bold text-sm">
          <button type="button" onclick="selectUnitForHistory('${code}')" title="Klik untuk lihat riwayat perbaikan ${code}" class="text-red-700 hover:text-red-900 hover:underline flex items-center gap-1.5 transition font-black">
            <i class="fa-solid fa-clock-rotate-left text-xs text-red-500"></i>
            <span>${code}</span>
          </button>
        </td>
        <td class="p-3 font-semibold text-slate-800">${u.model}</td>
        <td class="p-3"><span class="px-2 py-0.5 rounded-full text-[10px] font-bold border border-slate-300 bg-slate-100 text-slate-700">${u.category}</span></td>
        <td class="p-3">${statusBadge}</td>
        <td class="p-3 text-center">${bdCountBadge}</td>
        <td class="p-3">${totalHoursText}</td>
        <td class="p-3 max-w-xs truncate text-slate-600 text-xs" title="${stat.lastTrouble}">${stat.lastTrouble}</td>
        <td class="p-3 text-center whitespace-nowrap">
          <button type="button" onclick="selectUnitForHistory('${code}')" class="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 mx-auto shadow-sm">
            <i class="fa-solid fa-magnifying-glass-chart"></i> Buka Riwayat
          </button>
        </td>
      </tr>
    `;
  }).join('');

  renderCatalogPagination(totalPages);
}

function renderCatalogPagination(totalPages) {
  const container = document.getElementById('catalogPaginationButtons');
  if (!container) return;

  if (totalPages <= 1) {
    container.innerHTML = '';
    return;
  }

  const cur = appState.catalogCurrentPage;
  let buttonsHTML = '';

  buttonsHTML += `
    <button onclick="goToCatalogPage(${cur - 1})" ${cur === 1 ? 'disabled class="opacity-40 cursor-not-allowed"' : 'class="hover:bg-slate-800 hover:text-white"'}
      class="px-2.5 py-1 rounded-lg text-xs font-semibold bg-slate-900 border border-slate-800 text-slate-300 transition">
      <i class="fa-solid fa-chevron-left text-[10px]"></i> Prev
    </button>
  `;

  // Page range around current page
  let startP = Math.max(1, cur - 2);
  let endP = Math.min(totalPages, cur + 2);

  if (startP > 1) {
    buttonsHTML += `<button onclick="goToCatalogPage(1)" class="px-2.5 py-1 rounded-lg text-xs font-semibold bg-slate-900 border border-slate-800 text-slate-400 hover:text-white transition">1</button>`;
    if (startP > 2) buttonsHTML += `<span class="text-slate-600 text-xs px-1">...</span>`;
  }

  for (let p = startP; p <= endP; p++) {
    const isActive = p === cur;
    buttonsHTML += `
      <button onclick="goToCatalogPage(${p})"
        class="px-2.5 py-1 rounded-lg text-xs font-bold transition border ${isActive ? 'bg-amber-500 text-slate-950 border-amber-500 shadow' : 'bg-slate-900 text-slate-300 border-slate-800 hover:text-white hover:bg-slate-800'}">
        ${p}
      </button>
    `;
  }

  if (endP < totalPages) {
    if (endP < totalPages - 1) buttonsHTML += `<span class="text-slate-600 text-xs px-1">...</span>`;
    buttonsHTML += `<button onclick="goToCatalogPage(${totalPages})" class="px-2.5 py-1 rounded-lg text-xs font-semibold bg-slate-900 border border-slate-800 text-slate-400 hover:text-white transition">${totalPages}</button>`;
  }

  buttonsHTML += `
    <button onclick="goToCatalogPage(${cur + 1})" ${cur === totalPages ? 'disabled class="opacity-40 cursor-not-allowed"' : 'class="hover:bg-slate-800 hover:text-white"'}
      class="px-2.5 py-1 rounded-lg text-xs font-semibold bg-slate-900 border border-slate-800 text-slate-300 transition">
      Next <i class="fa-solid fa-chevron-right text-[10px]"></i>
    </button>
  `;

  container.innerHTML = buttonsHTML;
}

function goToCatalogPage(p) {
  appState.catalogCurrentPage = p;
  renderFleetCatalogTable();
}

function renderHistoryCharts() {
  if (typeof Chart === 'undefined') return;

  // Chart 1: Damage Category Counts
  const damageCounts = {
    'HYDRAULIC SYSTEM': 0,
    'ENGINE SYSTEM': 0,
    'TRANSMISSION / DRIVE LINE': 0,
    'ELECTRICAL SYSTEM': 0,
    'BRAKE & STEERING SYSTEM': 0,
    'UNDERCARRIAGE / SUSPENSION': 0,
    'GENERAL / OTHERS': 0
  };

  // Chart 2: Top Units Counts
  const unitCounts = {};

  appState.data.forEach(item => {
    const dmg = item['DAMAGE'] || 'GENERAL / OTHERS';
    let matched = false;
    for (const key of Object.keys(damageCounts)) {
      if (dmg.toUpperCase().includes(key) || key.includes(dmg.toUpperCase())) {
        damageCounts[key]++;
        matched = true;
        break;
      }
    }
    if (!matched) damageCounts['GENERAL / OTHERS']++;

    const code = (item['CODE UNIT AMM'] || '').toUpperCase();
    if (code) {
      unitCounts[code] = (unitCounts[code] || 0) + 1;
    }
  });

  // Render Damage Distribution Donut Chart
  const ctxDamage = document.getElementById('chartDamageCategory')?.getContext('2d');
  if (ctxDamage) {
    if (appState.chartDamage) {
      appState.chartDamage.destroy();
    }
    const damageLabels = Object.keys(damageCounts);
    const damageData = Object.values(damageCounts);

    appState.chartDamage = new Chart(ctxDamage, {
      type: 'doughnut',
      data: {
        labels: damageLabels,
        datasets: [{
          data: damageData,
          backgroundColor: [
            '#0284c7', // Sky / Hydraulic
            '#f59e0b', // Amber / Engine
            '#8b5cf6', // Purple / Transmission
            '#eab308', // Yellow / Electrical
            '#ef4444', // Red / Brake
            '#10b981', // Green / Undercarriage
            '#64748b'  // Slate / General
          ],
          borderColor: '#0f172a',
          borderWidth: 2
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'right',
            labels: {
              color: '#cbd5e1',
              font: { size: 10, family: 'monospace' },
              boxWidth: 12
            }
          }
        }
      }
    });
  }

  // Render Top Units Bar Chart
  const ctxTop = document.getElementById('chartTopUnits')?.getContext('2d');
  if (ctxTop) {
    if (appState.chartTopUnits) {
      appState.chartTopUnits.destroy();
    }

    const sortedUnits = Object.entries(unitCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);

    const unitLabels = sortedUnits.map(x => x[0]);
    const unitValues = sortedUnits.map(x => x[1]);

    appState.chartTopUnits = new Chart(ctxTop, {
      type: 'bar',
      data: {
        labels: unitLabels.length > 0 ? unitLabels : ['Belum ada data'],
        datasets: [{
          label: 'Jumlah Kejadian Breakdown',
          data: unitValues.length > 0 ? unitValues : [0],
          backgroundColor: '#f59e0b',
          borderRadius: 6
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: {
            ticks: { color: '#cbd5e1', font: { size: 10, family: 'monospace' } },
            grid: { display: false }
          },
          y: {
            beginAtZero: true,
            ticks: { color: '#94a3b8', stepSize: 1, font: { size: 10 } },
            grid: { color: '#1e293b' }
          }
        },
        plugins: {
          legend: { display: false }
        }
      }
    });
  }
}

function openDetailTiketModal(id) {
  const item = appState.data.find(i => i['ID'] === id);
  if (!item) return;

  const modal = document.getElementById('modalDetailTiket');
  if (!modal) return;

  const isRFU = (item['STATUS'] || '').toUpperCase() === 'RFU';
  const statusBadge = isRFU
    ? `<span class="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">RFU (Ready)</span>`
    : `<span class="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-500/20 text-rose-400 border border-rose-500/30">${item['STATUS'] || 'BREAKDOWN'}</span>`;

  document.getElementById('modalDetailTiketId').textContent = item['ID'] || '-';
  document.getElementById('modalDetailStatusBadge').innerHTML = statusBadge;
  document.getElementById('modalDetailUnitSub').textContent = `${item['CODE UNIT AMM']} — ${item['MODEL UNIT'] || '-'}`;
  document.getElementById('modalDetailDateBD').textContent = item['DATE BD'] || '-';
  document.getElementById('modalDetailTimeBD').textContent = item['TIME BD'] ? `Pukul ${item['TIME BD']} WITA` : '';
  document.getElementById('modalDetailPosisi').textContent = item['POSISI UNIT'] || '-';
  document.getElementById('modalDetailHM').textContent = item['HM DOWN'] ? `HM ${item['HM DOWN']}${item['HM RFU'] ? ` → ${item['HM RFU']}` : ''}` : '-';

  const aging = isRFU ? (item['DURATION'] || item['AGING BD'] || '-') : calculateAging(item['DATE BD'], item['TIME BD']);
  document.getElementById('modalDetailDuration').textContent = aging;

  document.getElementById('modalDetailDamageCat').textContent = item['DAMAGE'] || '-';
  document.getElementById('modalDetailTrouble').textContent = item['TROUBLE DESCRIPTION'] || '-';

  const tindakanDO = item['TINDAKAN / DO'] || item['DESCRIPTION RFU'] || item['DO DESCRIPTION'] || 'Belum ada catatan tindakan perbaikan DO.';
  document.getElementById('modalDetailDO').textContent = tindakanDO;

  document.getElementById('modalDetailPelapor').textContent = item['INPUTING BY'] || 'Anonim';
  document.getElementById('modalDetailDelay').textContent = item['STATUS DELAY'] || 'NO DELAY';

  const opPhone = item['NO HP OPERATOR'] || item['OPERATOR PHONE'] || extractPhoneFromText(item['INPUTING BY']);
  const phoneContainer = document.getElementById('modalDetailOperatorPhoneContainer');
  const phoneLink = document.getElementById('modalDetailOperatorPhoneLink');
  const phoneText = document.getElementById('modalDetailOperatorPhoneText');
  if (phoneContainer && phoneLink && phoneText) {
    if (opPhone) {
      phoneContainer.classList.remove('hidden');
      phoneText.textContent = opPhone;
      phoneLink.href = `https://wa.me/${formatIndonesianPhone(opPhone)}`;
    } else {
      phoneContainer.classList.add('hidden');
    }
  }

  modal.classList.remove('hidden');
}

function closeDetailTiketModal() {
  document.getElementById('modalDetailTiket')?.classList.add('hidden');
}

function printSingleTicketModal() {
  window.print();
}

function openQuickAddHistoryModal() {
  const modal = document.getElementById('modalQuickAddHistory');
  if (!modal) return;

  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const hh = String(now.getHours()).padStart(2, '0');
  const min = String(now.getMinutes()).padStart(2, '0');

  const dateInput = document.getElementById('quickAddDateBD');
  const timeInput = document.getElementById('quickAddTimeBD');
  if (dateInput) dateInput.value = `${yyyy}-${mm}-${dd}`;
  if (timeInput) timeInput.value = `${hh}:${min}`;

  if (appState.selectedUnitForDossier) {
    const codeInput = document.getElementById('quickAddCodeUnit');
    const modelInput = document.getElementById('quickAddModelUnit');
    if (codeInput) codeInput.value = appState.selectedUnitForDossier;
    if (modelInput && MASTER_UNITS[appState.selectedUnitForDossier]) {
      modelInput.value = MASTER_UNITS[appState.selectedUnitForDossier];
    }
  }

  modal.classList.remove('hidden');
}

function closeQuickAddHistoryModal() {
  document.getElementById('modalQuickAddHistory')?.classList.add('hidden');
}

async function handleQuickAddHistorySubmit(e) {
  e.preventDefault();

  const codeUnit = document.getElementById('quickAddCodeUnit').value.trim().toUpperCase();
  const modelUnit = document.getElementById('quickAddModelUnit').value.trim() || (MASTER_UNITS[codeUnit] || '-');
  const status = document.getElementById('quickAddStatus').value;
  const dateBD = document.getElementById('quickAddDateBD').value;
  const timeBD = document.getElementById('quickAddTimeBD').value;
  const posisi = document.getElementById('quickAddPosisi').value.trim();
  const hmDown = document.getElementById('quickAddHmDown').value.trim();
  const duration = document.getElementById('quickAddDuration').value.trim();
  const damage = document.getElementById('quickAddDamage').value;
  const trouble = document.getElementById('quickAddTrouble').value.trim();
  const tindakanDO = document.getElementById('quickAddDO').value.trim();

  const now = new Date();
  const yyyymmdd = now.toISOString().slice(0, 10).replace(/-/g, '');
  const rand = Math.floor(100 + Math.random() * 900);
  const generatedId = `BD-${yyyymmdd}-${rand}`;

  const payload = {
    'INPUTING BY': `${appState.currentUser ? appState.currentUser.name : 'Dispatcher Plant'} (Base Control)`,
    'SS6': 'SS6',
    'STATUS': status,
    'ID': generatedId,
    'CODE UNIT AMM': codeUnit,
    'MODEL UNIT': modelUnit,
    'POSISI UNIT': posisi,
    'HM DOWN': hmDown,
    'HM RFU': status === 'RFU' ? hmDown : '',
    'DATE BD': dateBD,
    'AGING BD': duration || '1 Jam',
    'TYPE BD': 'UNSCHEDULED BREAKDOWN',
    'STATUS DELAY': status === 'WAITING PART' ? 'WAITING SPAREPART' : 'NO DELAY',
    'TIME BD': timeBD,
    'TIME RFU': status === 'RFU' ? timeBD : '',
    'DURATION': duration || (status === 'RFU' ? '1 Jam' : ''),
    'TROUBLE DESCRIPTION': trouble,
    'DAMAGE': damage,
    'TINDAKAN / DO': tindakanDO,
    'DESCRIPTION RFU': tindakanDO
  };

  setLoading(true);

  if (appState.scriptUrl) {
    try {
      await fetch(appState.scriptUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action: 'create', data: payload }),
        redirect: 'follow'
      });
    } catch (err) {
      console.warn('Gagal POST ke GAS:', err);
    }
  }

  // Real-time broadcast pelaporan breakdown ke Grup Operator & Grup Mekanik
  const opBroadcastMsg =
    `🚨 *LAPORAN BREAKDOWN FLEET - PLANT SS6* 🚨\n\n` +
    `📢 *Pemberitahuan Seluruh Operator:*\n` +
    `Unit berikut mengalami breakdown dan saat ini sedang dalam penanganan tim mekanik:\n\n` +
    `🚜 *Unit*         : *${payload['CODE UNIT AMM']}* (${payload['MODEL UNIT'] || '-'})\n` +
    `📍 *Posisi*       : ${payload['POSISI UNIT'] || '-'}\n` +
    `⏱️ *HM Down*      : ${payload['HM DOWN'] || '-'}\n` +
    `🕒 *Waktu Lapor*  : ${payload['DATE BD']} ${payload['TIME BD']} WITA\n` +
    `⚙️ *Komponen*     : ${payload['DAMAGE'] || '-'}\n` +
    `👷 *Pelapor*      : ${payload['INPUTING BY'] || 'Operator'}\n` +
    `📝 *Gejala/Kerusakan*:\n"${payload['TROUBLE DESCRIPTION'] || '-'}"\n` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `ℹ️ Notifikasi disiarkan otomatis ke Grup Operator agar shift berikutnya mengetahui kondisi unit ini.\n` +
    `Tetap utamakan *KESELAMATAN KERJA (K3)*! ⛑️ Salam Tangguh! 🚧`;

  const mechBroadcastMsg =
    `⚠️ *BREAKDOWN FLEET BARU - PLANT SERVICE SS6* ⚠️\n\n` +
    `🚜 *Unit*         : *${payload['CODE UNIT AMM']}* (${payload['MODEL UNIT'] || '-'})\n` +
    `📍 *Posisi*       : ${payload['POSISI UNIT'] || '-'}\n` +
    `⏱️ *HM Down*      : ${payload['HM DOWN'] || '-'}\n` +
    `🕒 *Waktu BD*     : ${payload['DATE BD']} ${payload['TIME BD']} WITA\n` +
    `⚙️ *Damage*       : ${payload['DAMAGE'] || '-'}\n` +
    `🔧 *Status*       : ${payload['STATUS'] || 'BREAKDOWN'} (${payload['STATUS DELAY'] || 'NO DELAY'})\n` +
    `👷 *Pelapor*      : ${payload['INPUTING BY'] || 'Anonim'}\n` +
    `📝 *Trouble Teknis*:\n"${payload['TROUBLE DESCRIPTION'] || '-'}"\n` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `Mekanik bertugas harap segera koordinasi dan tindakan penanganan lapangan.\n` +
    `Salam Tangguh! 🚧`;

  broadcastToPlantGroups({
    operatorMsg: opBroadcastMsg,
    mechanicMsg: mechBroadcastMsg
  });

  appState.data.unshift(payload);
  saveLocalData();
  setLoading(false);

  closeQuickAddHistoryModal();
  document.getElementById('formQuickAddHistory')?.reset();

  Swal.fire({
    icon: 'success',
    title: 'Log Riwayat Tersimpan!',
    text: `Data breakdown ${codeUnit} berhasil dicatat ke database.`,
    background: '#1e293b',
    color: '#f8fafc',
    confirmButtonColor: '#f59e0b',
    timer: 2000
  });

  renderHistoryDashboard();
}

function exportHistoryToCSV(unitCodeFilter) {
  let listToExport = [...appState.data];
  let fileName = `Riwayat_Breakdown_Seluruh_Fleet_${new Date().toISOString().slice(0, 10)}.csv`;

  if (unitCodeFilter) {
    listToExport = listToExport.filter(i => (i['CODE UNIT AMM'] || '').toUpperCase() === unitCodeFilter.toUpperCase());
    fileName = `Riwayat_Breakdown_Unit_${unitCodeFilter}_${new Date().toISOString().slice(0, 10)}.csv`;
  }

  if (listToExport.length === 0) {
    Swal.fire({
      icon: 'info',
      title: 'Tidak Ada Data',
      text: 'Belum ada catatan riwayat breakdown untuk diekspor.',
      background: '#1e293b',
      color: '#f8fafc'
    });
    return;
  }

  const headers = [
    'INPUTING BY', 'SS6', 'STATUS', 'ID', 'CODE UNIT AMM', 'MODEL UNIT',
    'POSISI UNIT', 'HM DOWN', 'HM RFU', 'DATE BD', 'AGING BD', 'TYPE BD',
    'STATUS DELAY', 'TIME BD', 'TIME RFU', 'DURATION', 'TROUBLE DESCRIPTION', 'DAMAGE', 'TINDAKAN / DO'
  ];

  let csvContent = "data:text/csv;charset=utf-8," + headers.join(",") + "\n";

  listToExport.forEach(row => {
    const values = headers.map(header => {
      const val = row[header] || (header === 'TINDAKAN / DO' ? (row['DESCRIPTION RFU'] || row['DO DESCRIPTION'] || '') : '');
      const escaped = ('' + val).replace(/"/g, '""');
      return `"${escaped}"`;
    });
    csvContent += values.join(",") + "\n";
  });

  const encodedUri = encodeURI(csvContent);
  const link = document.createElement("a");
  link.setAttribute("href", encodedUri);
  link.setAttribute("download", fileName);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

function printCurrentUnitDossier() {
  window.print();
}


// ============================================================
// LIVE SPREADSHEET VIEW (19 KOLOM) DENGAN PEWARNAAN
// Kuning: Dalam Proses (BREAKDOWN / CONTINUE)
// Hijau : Ready for Use (READY / RFU)
// Merah : Cancel (Batal / Tidak Jadi Servis)
// ============================================================

let sheetFilterStatus = 'ALL'; // 'ALL' | 'BREAKDOWN' | 'READY' | 'CANCEL'

window.setSheetFilter = function (status) {
  sheetFilterStatus = status || 'ALL';

  // Highlight active filter button
  ['ALL', 'BREAKDOWN', 'READY', 'CANCEL'].forEach(key => {
    const btn = document.getElementById('sheetFilterBtn-' + key);
    if (!btn) return;
    btn.classList.remove('ring-2', 'ring-offset-2', 'ring-offset-white',
      'ring-amber-500', 'ring-emerald-500', 'ring-red-600', 'ring-slate-400');
    if (key === sheetFilterStatus) {
      const ringColor = key === 'BREAKDOWN' ? 'ring-amber-500' : key === 'READY' ? 'ring-emerald-500' : key === 'CANCEL' ? 'ring-red-600' : 'ring-slate-400';
      btn.classList.add('ring-2', 'ring-offset-2', 'ring-offset-white', ringColor);
    }
  });

  renderSpreadsheetView();
};

window.renderSpreadsheetView = function () {
  const tbody = document.getElementById('spreadsheetTableBody');
  const emptyState = document.getElementById('spreadsheetEmptyState');
  if (!tbody) return;

  tbody.innerHTML = '';
  const search = (document.getElementById('sheetSearchInput')?.value || '').trim().toLowerCase();

  let list = appState.data || [];

  // ── Hitung statistik sebelum filter status ──────────────────
  const countProcess = list.filter(r => { const s = (r['STATUS'] || '').toUpperCase(); return s !== 'READY' && s !== 'RFU' && s !== 'CANCEL'; }).length;
  const countReady   = list.filter(r => { const s = (r['STATUS'] || '').toUpperCase(); return s === 'READY' || s === 'RFU'; }).length;
  const countCancel  = list.filter(r => (r['STATUS'] || '').toUpperCase() === 'CANCEL').length;
  const el = id => document.getElementById(id);
  if (el('sheetCountProcess')) el('sheetCountProcess').textContent = countProcess;
  if (el('sheetCountReady'))   el('sheetCountReady').textContent   = countReady;
  if (el('sheetCountCancel'))  el('sheetCountCancel').textContent  = countCancel;

  // ── Filter berdasarkan status yang dipilih ───────────────────
  if (sheetFilterStatus !== 'ALL') {
    list = list.filter(item => {
      const s = (item['STATUS'] || '').toUpperCase();
      if (sheetFilterStatus === 'BREAKDOWN') return s !== 'READY' && s !== 'RFU' && s !== 'CANCEL';
      if (sheetFilterStatus === 'READY')     return s === 'READY' || s === 'RFU';
      if (sheetFilterStatus === 'CANCEL')    return s === 'CANCEL';
      return true;
    });
  }

  // ── Filter teks pencarian ────────────────────────────────────
  if (search) {
    list = list.filter(item =>
      Object.values(item).some(val => String(val || '').toLowerCase().includes(search))
    );
  }

  // ── Update label info ────────────────────────────────────────
  const labelMap = {
    ALL:       '',
    BREAKDOWN: 'Menampilkan ' + list.length + ' data breakdown',
    READY:     'Menampilkan ' + list.length + ' data ready',
    CANCEL:    'Menampilkan ' + list.length + ' data cancel'
  };
  if (el('sheetFilterLabel')) el('sheetFilterLabel').textContent = labelMap[sheetFilterStatus] || '';

  if (list.length === 0) {
    if (emptyState) emptyState.classList.remove('hidden');
    return;
  }
  if (emptyState) emptyState.classList.add('hidden');

  list.forEach((row, idx) => {
    const meta = getStatusMeta(row['STATUS']);
    const tr = document.createElement('tr');

    // Pewarnaan baris: kuning = proses, hijau = ready, merah = cancel
    let sheetRowBg = '';
    let statusPill = '';
    if (meta.key === 'READY') {
      sheetRowBg = 'row-status-ready';
      statusPill = '<span class="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300 shadow-sm"><span class="w-1.5 h-1.5 rounded-full bg-emerald-600"></span>READY</span>';
    } else if (meta.key === 'CANCEL') {
      sheetRowBg = 'row-status-cancel';
      statusPill = '<span class="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-rose-100 text-rose-800 border border-rose-300 shadow-sm"><span class="w-1.5 h-1.5 rounded-full bg-rose-600"></span>CANCEL</span>';
    } else {
      // Breakdown (Kuning)
      sheetRowBg = 'row-status-process';
      statusPill = '<span class="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-800 border border-amber-300 shadow-sm pulse-active"><span class="w-1.5 h-1.5 rounded-full bg-amber-600"></span>BREAKDOWN</span>';
    }

    tr.className = sheetRowBg;
    tr.innerHTML =
      '<td class="p-2.5 text-center text-slate-500 border-r border-slate-800/80 font-mono">' + (idx + 1) + '</td>' +
      '<td class="p-2.5 border-r border-slate-800/80 font-medium">' + (row['INPUTING BY'] || '-') + '</td>' +
      '<td class="p-2.5 border-r border-slate-800/80 font-mono">' + (row['SS6'] || 'SS6') + '</td>' +
      '<td class="p-2.5 border-r border-slate-800/80 text-center">' + statusPill + '</td>' +
      '<td class="p-2.5 border-r border-slate-800/80 font-mono text-slate-300">' +
        '<button type="button" onclick="openDetailTiketModal(&quot;' + (row['ID'] || '') + '&quot;)" class="hover:underline hover:text-amber-400 font-mono">' + (row['ID'] || '-') + '</button>' +
      '</td>' +
      '<td class="p-2.5 border-r border-slate-800/80 font-bold font-mono text-amber-400">' +
        '<button type="button" onclick="selectUnitForHistory(&quot;' + (row['CODE UNIT AMM'] || '') + '&quot;)" class="hover:underline font-mono">' + (row['CODE UNIT AMM'] || '-') + '</button>' +
      '</td>' +
      '<td class="p-2.5 border-r border-slate-800/80">' + (row['MODEL UNIT'] || '-') + '</td>' +
      '<td class="p-2.5 border-r border-slate-800/80">' + (row['POSISI UNIT'] || '-') + '</td>' +
      '<td class="p-2.5 border-r border-slate-800/80 font-mono">' + (row['HM DOWN'] || '-') + '</td>' +
      '<td class="p-2.5 border-r border-slate-800/80 font-mono text-emerald-400 font-semibold">' + (row['HM RFU'] || '-') + '</td>' +
      '<td class="p-2.5 border-r border-slate-800/80 font-mono">' + (row['DATE BD'] || '-') + '</td>' +
      '<td class="p-2.5 border-r border-slate-800/80 font-mono">' + (row['AGING BD'] || '-') + '</td>' +
      '<td class="p-2.5 border-r border-slate-800/80">' + (row['TYPE BD'] || '-') + '</td>' +
      '<td class="p-2.5 border-r border-slate-800/80">' + (row['STATUS DELAY'] || 'NO DELAY') + '</td>' +
      '<td class="p-2.5 border-r border-slate-800/80 font-mono">' + (row['TIME BD'] || '-') + '</td>' +
      '<td class="p-2.5 border-r border-slate-800/80 font-mono text-emerald-400 font-semibold">' + (row['TIME RFU'] || '-') + '</td>' +
      '<td class="p-2.5 border-r border-slate-800/80 font-bold">' + (row['DURATION'] || '-') + '</td>' +
      '<td class="p-2.5 border-r border-slate-800/80 max-w-xs truncate" title="' + (row['TROUBLE DESCRIPTION'] || '') + '">' + (row['TROUBLE DESCRIPTION'] || '-') + '</td>' +
      '<td class="p-2.5 border-r border-slate-800/80 font-mono">' + (row['DAMAGE'] || '-') + '</td>' +
      '<td class="p-2.5 max-w-sm truncate text-amber-300 font-medium" title="' + (row['TINDAKAN / DO'] || row['DESCRIPTION RFU'] || '') + '">' + (row['TINDAKAN / DO'] || row['DESCRIPTION RFU'] || '-') + '</td>';

    tbody.appendChild(tr);
  });
}

// Global window assignments for inline event handlers
window.selectUnitForHistory = selectUnitForHistory;
window.clearSelectedUnitDossier = clearSelectedUnitDossier;
window.createReportForUnit = createReportForUnit;
window.openQuickAddHistoryForUnit = openQuickAddHistoryForUnit;
window.quickCheckUnitHistory = quickCheckUnitHistory;
window.goToCatalogPage = goToCatalogPage;
window.openDetailTiketModal = openDetailTiketModal;
window.closeDetailTiketModal = closeDetailTiketModal;
window.printSingleTicketModal = printSingleTicketModal;
window.openQuickAddHistoryModal = openQuickAddHistoryModal;
window.closeQuickAddHistoryModal = closeQuickAddHistoryModal;
window.exportHistoryToCSV = exportHistoryToCSV;
window.printCurrentUnitDossier = printCurrentUnitDossier;

// ==========================================
// PWA (PROGRESSIVE WEB APP) & SERVICE WORKER
// ==========================================
let deferredPWAInstallPrompt = null;

window.addEventListener('beforeinstallprompt', (e) => {
  // Cegah browser menampilkan prompt bawaan otomatis agar bisa dikontrol tombol kita
  e.preventDefault();
  deferredPWAInstallPrompt = e;
  console.log('[PWA] beforeinstallprompt event captured');

  // Pastikan tombol install aktif & terlihat
  const installCard = document.getElementById('pwaInstallCard');
  if (installCard) installCard.classList.remove('hidden');
});

window.addEventListener('appinstalled', () => {
  console.log('[PWA] Aplikasi berhasil dipasang di perangkat!');
  deferredPWAInstallPrompt = null;
  if (typeof Swal !== 'undefined') {
    Swal.fire({
      icon: 'success',
      title: 'Aplikasi Terpasang!',
      text: 'Plant Base Control kini telah terpasang di layar HP / Desktop Anda.',
      confirmButtonColor: '#dc2626'
    });
  }
});

window.triggerPWAInstall = async function () {
  if (deferredPWAInstallPrompt) {
    try {
      deferredPWAInstallPrompt.prompt();
      const choice = await deferredPWAInstallPrompt.userChoice;
      console.log('[PWA] User choice:', choice);
      if (choice.outcome === 'accepted') {
        deferredPWAInstallPrompt = null;
      }
    } catch (err) {
      console.warn('[PWA] Prompt error:', err);
    }
  } else {
    // Deteksi jika perangkat iOS Safari
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
    let guideHtml = '';
    if (isIOS) {
      guideHtml = `
        <div class="text-left text-xs text-slate-700 space-y-2.5 p-1">
          <p class="font-semibold text-slate-900">Cara pasang di iPhone / iPad (Safari):</p>
          <ol class="list-decimal list-inside space-y-2 text-slate-600">
            <li>Tekan tombol <strong>Bagikan / Share</strong> (<i class="fa-solid fa-arrow-up-from-bracket text-sky-600"></i>) di bilah bawah browser Safari.</li>
            <li>Gulir ke bawah dan pilih <strong>"Tambahkan ke Layar Utama" (Add to Home Screen)</strong>.</li>
            <li>Tekan tombol <strong>Tambah (Add)</strong> di pojok kanan atas.</li>
          </ol>
          <div class="p-2 bg-emerald-50 rounded-lg border border-emerald-200 text-emerald-800 text-[11px] font-medium flex items-center gap-1.5 mt-2">
            <i class="fa-solid fa-circle-check text-emerald-600"></i>
            <span>Aplikasi langsung muncul di layar HP Anda tanpa perlu App Store!</span>
          </div>
        </div>
      `;
    } else {
      guideHtml = `
        <div class="text-left text-xs text-slate-700 space-y-2.5 p-1">
          <p class="font-semibold text-slate-900">Cara pasang di Android (Google Chrome):</p>
          <ol class="list-decimal list-inside space-y-2 text-slate-600">
            <li>Buka menu opsi Chrome dengan mengetuk <strong>titik tiga (⋮)</strong> di pojok kanan atas.</li>
            <li>Pilih menu <strong>"Tambahkan ke Layar Utama"</strong> atau <strong>"Instal Aplikasi"</strong>.</li>
            <li>Tekan <strong>Instal</strong> saat diminta konfirmasi.</li>
          </ol>
          <div class="p-2 bg-emerald-50 rounded-lg border border-emerald-200 text-emerald-800 text-[11px] font-medium flex items-center gap-1.5 mt-2">
            <i class="fa-solid fa-circle-check text-emerald-600"></i>
            <span>Aplikasi akan berjalan mandiri (full screen) seperti aplikasi bawaan HP!</span>
          </div>
        </div>
      `;
    }

    if (typeof Swal !== 'undefined') {
      Swal.fire({
        title: 'Pasang Aplikasi di HP',
        html: guideHtml,
        icon: 'info',
        confirmButtonText: 'Saya Mengerti',
        confirmButtonColor: '#dc2626'
      });
    } else {
      alert('Untuk memasang di HP: Buka menu browser Anda lalu pilih "Tambahkan ke Layar Utama" (Add to Home Screen).');
    }
  }
};

// Registrasi Service Worker
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js')
      .then((reg) => {
        console.log('[SW] Service Worker terdaftar dengan scope:', reg.scope);
      })
      .catch((err) => {
        console.warn('[SW] Service Worker registration failed:', err);
      });
  });
}

window.triggerPWAInstall = triggerPWAInstall;

// ==========================================
// NAV MENU TOGGLE (HIDE / SHOW)
// ==========================================
let navMenuOpen = true;

function toggleNavMenu() {
  const content = document.getElementById('navMenuContent');
  const chevron = document.getElementById('navToggleChevron');
  if (!content) return;

  navMenuOpen = !navMenuOpen;

  if (navMenuOpen) {
    content.classList.remove('nav-menu-closed');
    content.classList.add('nav-menu-open');
    if (chevron) chevron.classList.remove('chevron-collapsed');
    try { localStorage.setItem('plant_nav_menu_open', '1'); } catch(e) {}
  } else {
    content.classList.remove('nav-menu-open');
    content.classList.add('nav-menu-closed');
    if (chevron) chevron.classList.add('chevron-collapsed');
    try { localStorage.setItem('plant_nav_menu_open', '0'); } catch(e) {}
  }
}

// Inisialisasi state dari localStorage
document.addEventListener('DOMContentLoaded', () => {
  const savedPref = localStorage.getItem('plant_nav_menu_open');
  // Default: terbuka
  if (savedPref === '0') {
    navMenuOpen = true; // set true dulu karena toggleNavMenu akan flip
    toggleNavMenu();    // jadi false + apply closed
  }
});

window.toggleNavMenu = toggleNavMenu;


