/**
 * ==============================================================================
 * BASE CONTROL PLANT PERTAMBANGAN - GOOGLE APPS SCRIPT BACKEND
 * ==============================================================================
 * Sistem Database, Registrasi Akun (NRP), & Notifikasi Real-time
 * Mendukung:
 * 1. TELEGRAM BOT API (100% GRATIS SELAMANYA & TANPA BATAS KUOTA / UNLIMITED)
 * 2. WHATSAPP GATEWAY (Fonnte / Wablas / Gateway Sendiri)
 * ==============================================================================
 */

const SHEET_NAME = 'DATABASE_BD';
const USER_SHEET_NAME = 'DATA_USERS';
const SETTINGS_SHEET_NAME = 'SETTINGS_CONFIG';

// Header resmi urutan kolom database breakdown
const HEADERS = [
  'INPUTING BY',
  'SS6',
  'STATUS',
  'ID',
  'CODE UNIT AMM',
  'MODEL UNIT',
  'POSISI UNIT',
  'HM DOWN',
  'HM RFU',
  'DATE BD',
  'AGING BD',
  'TYPE BD',
  'STATUS DELAY',
  'TIME BD',
  'TIME RFU',
  'DURATION',
  'TROUBLE DESCRIPTION',
  'DAMAGE',
  'DESCRIPTION RFU'
];

// Header akun pengguna
const USER_HEADERS = ['NRP', 'NAMA', 'EMAIL', 'JABATAN', 'PASSWORD', 'TANGGAL DIBUAT'];

/**
 * Inisialisasi awal Google Sheets
 */
function setupInitialSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  
  // 1. Setup Sheet DATABASE_BD
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) sheet = ss.insertSheet(SHEET_NAME);
  
  sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
  sheet.getRange(1, 1, 1, HEADERS.length)
    .setBackground('#1e293b')
    .setFontColor('#f8fafc')
    .setFontWeight('bold')
    .setHorizontalAlignment('center')
    .setVerticalAlignment('middle')
    .setWrap(true);
    
  sheet.setFrozenRows(1);
  sheet.setRowHeight(1, 40);
  
  for (let i = 1; i <= HEADERS.length; i++) {
    sheet.setColumnWidth(i, 140);
  }
  sheet.setColumnWidth(4, 160);
  sheet.setColumnWidth(17, 260);
  sheet.setColumnWidth(18, 180);

  // 2. Setup Sheet DATA_USERS
  let userSheet = ss.getSheetByName(USER_SHEET_NAME);
  if (!userSheet) {
    userSheet = ss.insertSheet(USER_SHEET_NAME);
    userSheet.getRange(1, 1, 1, USER_HEADERS.length).setValues([USER_HEADERS]);
    userSheet.getRange(1, 1, 1, USER_HEADERS.length)
      .setBackground('#0f172a')
      .setFontColor('#fbbf24')
      .setFontWeight('bold')
      .setHorizontalAlignment('center');
      
    const nowStr = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm');
    userSheet.appendRow(['10001', 'Super Admin Base Control', 'admin.ss6@amm-mining.com', 'Admin Plant', 'plantss6admin', nowStr]);
    userSheet.appendRow(['10002', 'Budi Santoso', 'budi.santoso@amm-mining.com', 'Dispatcher SS6', 'dispatcher123', nowStr]);
    userSheet.appendRow(['10003', 'Ahmad Fauzi', 'ahmad.fauzi@amm-mining.com', 'Maintenance Planner', 'plannerss6', nowStr]);
  }

  // 3. Setup Sheet SETTINGS_CONFIG
  let settingsSheet = ss.getSheetByName(SETTINGS_SHEET_NAME);
  if (!settingsSheet) {
    settingsSheet = ss.insertSheet(SETTINGS_SHEET_NAME);
    settingsSheet.getRange(1, 1, 1, 2).setValues([['KEY', 'VALUE']]);
    settingsSheet.getRange(1, 1, 1, 2).setBackground('#1e293b').setFontColor('#ffffff').setFontWeight('bold');
    
    // Default konfigurasi
    settingsSheet.appendRow(['NOTIF_CHANNEL', 'TELEGRAM']); // 'TELEGRAM', 'WHATSAPP', atau 'BOTH'
    settingsSheet.appendRow(['TG_ENABLED', 'true']);
    settingsSheet.appendRow(['TG_BOT_TOKEN', '']);
    settingsSheet.appendRow(['TG_CHAT_ID', '']);
    settingsSheet.appendRow(['WA_ENABLED', 'false']);
    settingsSheet.appendRow(['WA_TOKEN', '']);
    settingsSheet.appendRow(['WA_TARGET_GROUP', '']);
  }
  
  Logger.log('Setup Sheet Berhasil!');
}

/**
 * Handle GET Requests
 */
function doGet(e) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sheet = ss.getSheetByName(SHEET_NAME);
    if (!sheet) {
      setupInitialSheet();
      sheet = ss.getSheetByName(SHEET_NAME);
    }
    
    const action = e && e.parameter ? e.parameter.action : 'getData';
    
    if (action === 'getSettings') {
      const config = getSettingsMap(ss);
      return responseJSON({ status: 'success', data: config });
    }
    
    const data = sheet.getDataRange().getValues();
    if (data.length <= 1) {
      return responseJSON({ status: 'success', total: 0, data: [] });
    }
    
    const headers = data[0];
    const rows = data.slice(1);
    
    const result = rows.map((row, index) => {
      let obj = {};
      headers.forEach((header, colIdx) => {
        let val = row[colIdx];
        if (val instanceof Date) {
          if (header === 'DATE BD') {
            val = Utilities.formatDate(val, Session.getScriptTimeZone(), 'yyyy-MM-dd');
          } else if (header === 'TIME BD' || header === 'TIME RFU') {
            val = Utilities.formatDate(val, Session.getScriptTimeZone(), 'HH:mm');
          }
        }
        obj[header] = val !== undefined && val !== null ? val : '';
      });
      
      obj.rowIndex = index + 2;
      
      const statUpper = (obj['STATUS'] || '').toString().toUpperCase().trim();
      if (statUpper !== 'RFU' && statUpper !== 'READY' && statUpper !== 'CANCEL' && obj['DATE BD']) {
        obj['AGING_HOURS'] = calculateAgingHours(obj['DATE BD'], obj['TIME BD']);
        obj['AGING BD'] = formatAgingText(obj['AGING_HOURS']);
      }
      
      return obj;
    });
    
    return responseJSON({
      status: 'success',
      total: result.length,
      data: result
    });
    
  } catch (error) {
    return responseJSON({ status: 'error', message: error.toString() });
  }
}

/**
 * Handle POST Requests
 */
function doPost(e) {
  try {
    let payload;
    if (e && e.postData && e.postData.contents) {
      payload = JSON.parse(e.postData.contents);
    } else {
      payload = e.parameter;
    }
    
    const action = payload.action || 'create';
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sheet = ss.getSheetByName(SHEET_NAME);
    
    if (!sheet) {
      setupInitialSheet();
      sheet = ss.getSheetByName(SHEET_NAME);
    }
    
    if (action === 'create') {
      return handleCreateBreakdown(ss, sheet, payload.data || payload);
    } else if (action === 'updateRFU') {
      return handleUpdateRFU(ss, sheet, payload.data || payload);
    } else if (action === 'updateStatus') {
      return handleUpdateStatus(ss, sheet, payload.data || payload);
    } else if (action === 'changePassword') {
      return handleChangePassword(ss, payload.nrp, payload.newPassword);
    } else if (action === 'login') {
      return handleLoginCheck(ss, payload.nrp || payload.username, payload.password);
    } else if (action === 'register') {
      return handleRegisterUser(ss, payload.user || payload);
    } else if (action === 'saveSettings') {
      return handleSaveSettings(ss, payload.settings);
    } else if (action === 'testTelegram') {
      return handleTestTelegram(payload.token, payload.chatId);
    } else if (action === 'testWA') {
      return handleTestWA(payload.token, payload.target);
    } else {
      return responseJSON({ status: 'error', message: 'Action tidak dikenal: ' + action });
    }
    
  } catch (err) {
    return responseJSON({ status: 'error', message: err.toString() });
  }
}

/**
 * Registrasi Akun Baru (NRP, Nama, Email, Jabatan, Password)
 */
function handleRegisterUser(ss, user) {
  let userSheet = ss.getSheetByName(USER_SHEET_NAME);
  if (!userSheet) {
    setupInitialSheet();
    userSheet = ss.getSheetByName(USER_SHEET_NAME);
  }
  
  const nrp = (user.nrp || '').toString().trim();
  const nama = (user.nama || user.name || '').toString().trim();
  const email = (user.email || '').toString().trim();
  const jabatan = (user.jabatan || 'Operator / Mekanik').toString().trim();
  const password = (user.password || '').toString().trim();
  
  if (!nrp || !nama || !password) {
    return responseJSON({ status: 'error', message: 'NRP, Nama, dan Password wajib diisi!' });
  }
  
  const data = userSheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]).trim().toLowerCase() === nrp.toLowerCase()) {
      return responseJSON({ status: 'error', message: 'NRP ' + nrp + ' sudah terdaftar!' });
    }
  }
  
  const nowStr = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm');
  userSheet.appendRow([nrp, nama, email, jabatan, password, nowStr]);
  
  return responseJSON({
    status: 'success',
    message: 'Akun NRP ' + nrp + ' (' + nama + ') berhasil didaftarkan!',
    user: { nrp, nama, email, jabatan }
  });
}

/**
 * Login Check (NRP atau Username)
 */
function handleLoginCheck(ss, identifier, password) {
  let userSheet = ss.getSheetByName(USER_SHEET_NAME);
  if (!userSheet) {
    setupInitialSheet();
    userSheet = ss.getSheetByName(USER_SHEET_NAME);
  }
  
  const data = userSheet.getDataRange().getValues();
  if (data.length <= 1) {
    return responseJSON({ status: 'error', message: 'Belum ada pengguna terdaftar!' });
  }
  
  const headers = data[0].map(h => String(h).toUpperCase().trim());
  const nrpIdx = headers.indexOf('NRP') !== -1 ? headers.indexOf('NRP') : 0;
  const nameIdx = headers.indexOf('NAMA') !== -1 ? headers.indexOf('NAMA') : 1;
  const emailIdx = headers.indexOf('EMAIL');
  const jabIdx = headers.indexOf('JABATAN') !== -1 ? headers.indexOf('JABATAN') : 2;
  const passIdx = headers.indexOf('PASSWORD') !== -1 ? headers.indexOf('PASSWORD') : (emailIdx !== -1 ? 4 : 3);
  
  const ident = (identifier || '').toString().trim().toLowerCase();
  const pass = (password || '').toString().trim();
  
  for (let i = 1; i < data.length; i++) {
    const rowNRP = String(data[i][nrpIdx]).trim().toLowerCase();
    const rowPass = String(data[i][passIdx]).trim();
    
    if ((rowNRP === ident || (ident === 'admin' && rowNRP === '10001')) && rowPass === pass) {
      return responseJSON({
        status: 'success',
        user: {
          nrp: data[i][nrpIdx],
          name: data[i][nameIdx],
          email: emailIdx !== -1 ? data[i][emailIdx] : '',
          jabatan: data[i][jabIdx],
          role: data[i][jabIdx]
        }
      });
    }
  }
  
  return responseJSON({ status: 'error', message: 'NRP atau password tidak cocok!' });
}

/**
 * Ganti Password Akun Petugas
 */
function handleChangePassword(ss, nrp, newPassword) {
  let userSheet = ss.getSheetByName(USER_SHEET_NAME);
  if (!userSheet) return responseJSON({ status: 'error', message: 'Sheet user tidak ditemukan' });
  const data = userSheet.getDataRange().getValues();
  if (data.length <= 1) return responseJSON({ status: 'error', message: 'Belum ada user terdaftar' });
  
  const headers = data[0].map(h => String(h).toUpperCase().trim());
  const nrpIdx = headers.indexOf('NRP') !== -1 ? headers.indexOf('NRP') : 0;
  const emailIdx = headers.indexOf('EMAIL');
  const passIdx = headers.indexOf('PASSWORD') !== -1 ? headers.indexOf('PASSWORD') : (emailIdx !== -1 ? 4 : 3);
  const targetNrp = String(nrp || '').trim().toLowerCase();
  
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][nrpIdx]).trim().toLowerCase() === targetNrp) {
      userSheet.getRange(i + 1, passIdx + 1).setValue(newPassword);
      return responseJSON({ status: 'success', message: 'Password akun NRP ' + nrp + ' berhasil diperbarui!' });
    }
  }
  return responseJSON({ status: 'error', message: 'NRP ' + nrp + ' tidak ditemukan di sistem!' });
}

/**
 * Input Breakdown Baru + Notifikasi Real-time
 */
function handleCreateBreakdown(ss, sheet, data) {
  const now = new Date();
  const dateStr = Utilities.formatDate(now, Session.getScriptTimeZone(), 'yyyyMMdd');
  const count = sheet.getLastRow();
  const generatedId = 'BD-' + dateStr + '-' + Utilities.formatString('%03d', count);
  
  const id = data['ID'] && data['ID'].trim() !== '' ? data['ID'].trim() : generatedId;
  const status = data['STATUS'] || 'BREAKDOWN';
  const dateBD = data['DATE BD'] || Utilities.formatDate(now, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  const timeBD = data['TIME BD'] || Utilities.formatDate(now, Session.getScriptTimeZone(), 'HH:mm');
  
  const agingHours = calculateAgingHours(dateBD, timeBD);
  const agingText = formatAgingText(agingHours);
  
  const newRow = [
    data['INPUTING BY'] || '',
    data['SS6'] || 'SS6',
    status.toUpperCase(),
    id,
    (data['CODE UNIT AMM'] || '').toUpperCase(),
    data['MODEL UNIT'] || '',
    data['POSISI UNIT'] || '',
    data['HM DOWN'] || '',
    data['HM RFU'] || '',
    dateBD,
    agingText,
    data['TYPE BD'] || 'UNSCHEDULED BREAKDOWN',
    data['STATUS DELAY'] || 'NO DELAY',
    timeBD,
    data['TIME RFU'] || '',
    data['DURATION'] || '',
    data['TROUBLE DESCRIPTION'] || '',
    data['DAMAGE'] || ''
  ];
  
  sheet.appendRow(newRow);
  const lastRow = sheet.getLastRow();
  formatRowColor(sheet, lastRow, status);
  
  // Baca Pengaturan Notifikasi
  const config = getSettingsMap(ss);
  
  // 1. Kirim ke TELEGRAM BOT (100% Gratis & Unlimited Pesan)
  if (config.TG_ENABLED === 'true' && config.TG_BOT_TOKEN && config.TG_CHAT_ID) {
    sendTelegramAlert(config.TG_BOT_TOKEN, config.TG_CHAT_ID, data, id);
  }
  
  // 2. Kirim ke WHATSAPP GATEWAY (Jika diaktifkan)
  if (config.WA_ENABLED === 'true' && config.WA_TOKEN && config.WA_TARGET_GROUP) {
    sendWhatsAppAlert(config.WA_TOKEN, config.WA_TARGET_GROUP, data, id);
  }
  
  return responseJSON({
    status: 'success',
    message: 'Data breakdown tersimpan & broadcast notifikasi terkirim!',
    id: id,
    row: lastRow
  });
}

/**
 * NOTIFIKASI TELEGRAM BOT (100% GRATIS SELAMANYA, RESMI, UNLIMITED)
 */
function sendTelegramAlert(token, chatId, data, idTiket) {
  try {
    const text = 
      `🚨 *LAPORAN BREAKDOWN UNIT (SS6 PLANT)* 🚨\n` +
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `🆔 *ID Tiket* : \`${idTiket}\`\n` +
      `🚜 *Unit*     : *${data['CODE UNIT AMM']}* (${data['MODEL UNIT'] || '-'})\n` +
      `📍 *Posisi*   : ${data['POSISI UNIT'] || '-'}\n` +
      `⏱️ *HM Down*  : ${data['HM DOWN'] || '-'}\n` +
      `📅 *Waktu*    : ${data['DATE BD']} pukul ${data['TIME BD']} WITA\n` +
      `⚙️ *Damage*   : ${data['DAMAGE'] || '-'}\n` +
      `⚠️ *Masalah*  : ${data['TROUBLE DESCRIPTION'] || '-'}\n` +
      `👤 *Pelapor*  : ${data['INPUTING BY'] || 'Lapangan'}\n` +
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `⚡ *Status*: *${data['STATUS'] || 'BREAKDOWN'}* | *Delay*: ${data['STATUS DELAY'] || 'NO DELAY'}\n` +
      `_Mohon Mekanik Service segera standby & merapat ke lokasi!_`;

    const url = 'https://api.telegram.org/bot' + token + '/sendMessage';
    const payload = {
      chat_id: chatId,
      text: text,
      parse_mode: 'Markdown'
    };
    
    UrlFetchApp.fetch(url, {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });
  } catch(err) {
    Logger.log('Gagal kirim notifikasi Telegram: ' + err.toString());
  }
}

/**
 * Tes Notifikasi Telegram Bot
 */
function handleTestTelegram(token, chatId) {
  try {
    if (!token || !chatId) {
      return responseJSON({ status: 'error', message: 'Token Bot Telegram dan Chat ID Grup wajib diisi!' });
    }
    
    const text = '✅ *TES KONEKSI BASE CONTROL PLANT SS6*\n\nBot Telegram telah berhasil terhubung dengan grup ini! Notifikasi breakdown akan masuk secara real-time tanpa batas kuota.';
    const url = 'https://api.telegram.org/bot' + token + '/sendMessage';
    
    const resp = UrlFetchApp.fetch(url, {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify({ chat_id: chatId, text: text, parse_mode: 'Markdown' }),
      muteHttpExceptions: true
    });
    
    const resData = JSON.parse(resp.getContentText());
    if (resData.ok) {
      return responseJSON({ status: 'success', message: 'Pesan tes berhasil masuk ke Grup Telegram!' });
    } else {
      return responseJSON({ status: 'error', message: resData.description || 'Gagal mengirim pesan Telegram' });
    }
  } catch(e) {
    return responseJSON({ status: 'error', message: e.toString() });
  }
}

/**
 * NOTIFIKASI WHATSAPP GATEWAY (Fonnte)
 */
function sendWhatsAppAlert(token, target, data, idTiket) {
  try {
    const message = 
      `🚨 *LAPORAN BREAKDOWN UNIT (PLANT SS6)* 🚨\n` +
      `------------------------------------------\n` +
      `🆔 *ID Tiket* : ${idTiket}\n` +
      `🚜 *Unit*     : *${data['CODE UNIT AMM']}* (${data['MODEL UNIT'] || '-'})\n` +
      `📍 *Posisi*   : ${data['POSISI UNIT'] || '-'}\n` +
      `⏱️ *HM Down*  : ${data['HM DOWN'] || '-'}\n` +
      `📅 *Waktu*    : ${data['DATE BD']} pukul ${data['TIME BD']} WITA\n` +
      `⚙️ *Damage*   : ${data['DAMAGE'] || '-'}\n` +
      `⚠️ *Masalah*  : ${data['TROUBLE DESCRIPTION'] || '-'}\n` +
      `👤 *Pelapor*  : ${data['INPUTING BY'] || 'Lapangan'}\n` +
      `------------------------------------------\n` +
      `⚡ *Status*: *${data['STATUS'] || 'BREAKDOWN'}* | *Delay*: ${data['STATUS DELAY'] || 'NO DELAY'}\n` +
      `_Mohon Mekanik Service segera standby & tindak lanjuti._`;

    UrlFetchApp.fetch('https://api.fonnte.com/send', {
      method: 'post',
      headers: { 'Authorization': token },
      payload: { target: target, message: message, countryCode: '62' },
      muteHttpExceptions: true
    });
  } catch(err) {
    Logger.log('Gagal kirim WhatsApp: ' + err.toString());
  }
}

function handleTestWA(token, target) {
  try {
    if (!token || !target) {
      return responseJSON({ status: 'error', message: 'Token dan Target Grup WA wajib diisi!' });
    }
    const message = '✅ *TES KONEKSI BASE CONTROL PLANT SS6*\n\nSistem notifikasi WhatsApp otomatis telah terhubung dengan baik.';
    UrlFetchApp.fetch('https://api.fonnte.com/send', {
      method: 'post',
      headers: { 'Authorization': token },
      payload: { target: target, message: message, countryCode: '62' },
      muteHttpExceptions: true
    });
    return responseJSON({ status: 'success', message: 'Pesan tes berhasil dikirim ke WhatsApp!' });
  } catch(e) {
    return responseJSON({ status: 'error', message: e.toString() });
  }
}

function handleUpdateRFU(ss, sheet, data) {
  const idToFind = (data['ID'] || '').toString().trim();
  const allData = sheet.getDataRange().getValues();
  let targetRowIndex = -1;
  let rowData = null;
  
  for (let i = 1; i < allData.length; i++) {
    if (allData[i][3].toString().trim() === idToFind) {
      targetRowIndex = i + 1;
      rowData = allData[i];
      break;
    }
  }
  
  if (targetRowIndex === -1) {
    return responseJSON({ status: 'error', message: 'ID tidak ditemukan!' });
  }
  
  const hmRFU = data['HM RFU'] || '';
  const timeRFU = data['TIME RFU'] || Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'HH:mm');
  const dateBD = rowData[9];
  const timeBD = rowData[13];
  
  const durationHours = calculateDuration(dateBD, timeBD, timeRFU);
  const durationText = durationHours.toFixed(1) + ' Jam';
  
  const statusToSet = (data['STATUS'] || 'READY').toString().toUpperCase().trim();
  sheet.getRange(targetRowIndex, 3).setValue(statusToSet);
  if (hmRFU) sheet.getRange(targetRowIndex, 9).setValue(hmRFU);
  sheet.getRange(targetRowIndex, 11).setValue(durationText);
  sheet.getRange(targetRowIndex, 15).setValue(timeRFU);
  sheet.getRange(targetRowIndex, 16).setValue(durationText);
  if (data['DAMAGE']) sheet.getRange(targetRowIndex, 18).setValue(data['DAMAGE']);
  if (data['DO DESCRIPTION'] || data['TINDAKAN / DO']) {
    sheet.getRange(targetRowIndex, 19).setValue(data['DO DESCRIPTION'] || data['TINDAKAN / DO']);
  }
  
  formatRowColor(sheet, targetRowIndex, statusToSet);
  
  // Kirim Broadcast RFU
  const config = getSettingsMap(ss);
  
  // Telegram RFU Broadcast
  if (config.TG_ENABLED === 'true' && config.TG_BOT_TOKEN && config.TG_CHAT_ID) {
    try {
      const textRFU = 
        `🟢 *UNIT RFU (READY FOR USE) - SS6 PLANT* 🟢\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `🚜 *Unit*     : *${rowData[4]}* (${rowData[5]})\n` +
        `⏱️ *HM RFU*   : ${hmRFU}\n` +
        `⏳ *Downtime* : *${durationText}*\n` +
        `🕒 *Jam RFU*  : ${timeRFU} WITA\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `_Unit sudah siap beroperasi kembali di pit!_`;
      UrlFetchApp.fetch('https://api.telegram.org/bot' + config.TG_BOT_TOKEN + '/sendMessage', {
        method: 'post',
        contentType: 'application/json',
        payload: JSON.stringify({ chat_id: config.TG_CHAT_ID, text: textRFU, parse_mode: 'Markdown' }),
        muteHttpExceptions: true
      });
    } catch(e) {}
  }
  
  // WhatsApp RFU Broadcast ke Grup Lapangan
  if (config.WA_ENABLED === 'true' && config.WA_TOKEN && config.WA_TARGET_GROUP) {
    try {
      const msgRFU = 
        `🟢 *UNIT RFU (READY FOR USE) - PLANT SS6* 🟢\n` +
        `------------------------------------------\n` +
        `🚜 *Unit*     : *${rowData[4]}* (${rowData[5]})\n` +
        `⏱️ *HM RFU*   : ${hmRFU}\n` +
        `⏳ *Downtime* : *${durationText}*\n` +
        `🕒 *Jam RFU*  : ${timeRFU} WITA\n` +
        `------------------------------------------\n` +
        `_Unit sudah siap beroperasi kembali di pit._`;
      UrlFetchApp.fetch('https://api.fonnte.com/send', {
        method: 'post',
        headers: { 'Authorization': config.WA_TOKEN },
        payload: { target: config.WA_TARGET_GROUP, message: msgRFU, countryCode: '62' },
        muteHttpExceptions: true
      });
    } catch(e) {}
  }

  // WhatsApp Notifikasi Otomatis Langsung ke Operator Unit
  const operatorPhone = data['operatorPhone'] || extractPhoneFromInputingBy(rowData[0]);
  const shouldSendToOperator = data['sendWaToOperator'] !== false && Boolean(operatorPhone);
  const waToken = data['waToken'] || config.WA_TOKEN;

  if (config.WA_ENABLED === 'true' && waToken && shouldSendToOperator && operatorPhone) {
    try {
      const cleanPhone = cleanPhoneNumber(operatorPhone);
      const doText = data['DO DESCRIPTION'] || data['TINDAKAN / DO'] || '';
      const msgOperator = 
        `🟢 *UNIT READY FOR USE (RFU) - PLANT SS6* 🟢\n\n` +
        `Halo Rekan Operator,\n` +
        `Unit Anda telah selesai diperbaiki dan siap beroperasi kembali di pit:\n\n` +
        `🚜 *Unit*        : *${rowData[4]}* (${rowData[5]})\n` +
        `📍 *Posisi*      : ${rowData[6]}\n` +
        `⏱️ *HM RFU*      : ${hmRFU}\n` +
        `🕒 *Jam RFU*     : ${timeRFU} WITA\n` +
        `⏳ *Durasi BD*   : ${durationText}\n` +
        (doText ? `🔧 *Tindakan/DO* : ${doText}\n` : '') +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `Harap lakukan P2H sebelum unit bergerak. Tetap utamakan *KESELAMATAN KERJA (K3)*! ⛑️`;

      UrlFetchApp.fetch('https://api.fonnte.com/send', {
        method: 'post',
        headers: { 'Authorization': waToken },
        payload: { target: cleanPhone, message: msgOperator, countryCode: '62' },
        muteHttpExceptions: true
      });
    } catch(e) {}
  }
  
  return responseJSON({
    status: 'success',
    message: 'Unit ' + rowData[4] + ' berhasil di-update menjadi ' + statusToSet + '!',
    id: idToFind,
    duration: durationText
  });
}

/**
 * Update Status Unit Real-time (CANCEL, BREAKDOWN, CONTINUE, READY)
 * Sinkronisasi status, jam rfu/cancel, downtime, tindakan DO, dan warna baris di Google Sheets
 */
function handleUpdateStatus(ss, sheet, data) {
  const idToFind = (data['ID'] || '').toString().trim();
  if (!idToFind) {
    return responseJSON({ status: 'error', message: 'ID Tiket wajib diisi!' });
  }

  const allData = sheet.getDataRange().getValues();
  let targetRowIndex = -1;
  let rowData = null;

  for (let i = 1; i < allData.length; i++) {
    if (String(allData[i][3]).trim() === idToFind) { // Kolom 4 adalah ID Tiket
      targetRowIndex = i + 1;
      rowData = allData[i];
      break;
    }
  }

  if (targetRowIndex === -1) {
    return responseJSON({ status: 'error', message: 'ID Tiket ' + idToFind + ' tidak ditemukan di spreadsheet!' });
  }

  const newStatus = (data['STATUS'] || 'BREAKDOWN').toString().toUpperCase().trim();

  // 1. Update Kolom 3: STATUS
  sheet.getRange(targetRowIndex, 3).setValue(newStatus);

  // 2. Jika ada TIME RFU / Waktu Cancel (Kolom 15)
  if (data['TIME RFU']) {
    sheet.getRange(targetRowIndex, 15).setValue(data['TIME RFU']);
  }

  // 3. Jika ada HM RFU (Kolom 9)
  if (data['HM RFU']) {
    sheet.getRange(targetRowIndex, 9).setValue(data['HM RFU']);
  }

  // 4. Jika ada DURATION (Kolom 16) & AGING BD (Kolom 11)
  if (data['DURATION']) {
    sheet.getRange(targetRowIndex, 16).setValue(data['DURATION']);
    sheet.getRange(targetRowIndex, 11).setValue(data['DURATION']);
  }

  // 5. Update Tindakan / Alasan Cancel (Kolom 19: DESCRIPTION RFU / TINDAKAN DO)
  const doDesc = data['TINDAKAN / DO'] || data['DESCRIPTION RFU'] || data['DO DESCRIPTION'] || '';
  if (doDesc) {
    sheet.getRange(targetRowIndex, 19).setValue(doDesc);
  }

  // 6. Update Pewarnaan Baris di Google Sheets
  // Kuning = Proses (BREAKDOWN / CONTINUE), Hijau = READY / RFU, Merah = CANCEL
  formatRowColor(sheet, targetRowIndex, newStatus);

  return responseJSON({
    status: 'success',
    message: 'Status tiket ' + idToFind + ' (' + (rowData[4] || '') + ') berhasil diupdate ke ' + newStatus + '!',
    id: idToFind,
    status: newStatus
  });
}

function extractPhoneFromInputingBy(str) {
  if (!str) return '';
  const match = String(str).match(/(?:WA:|\b)(08\d{8,12}|628\d{8,12}|\+628\d{8,12})/i);
  return match ? match[1] : '';
}

function cleanPhoneNumber(phone) {
  if (!phone) return '';
  let cleaned = String(phone).replace(/[^0-9]/g, '');
  if (cleaned.startsWith('0')) {
    cleaned = '62' + cleaned.slice(1);
  } else if (cleaned.startsWith('8')) {
    cleaned = '628' + cleaned.slice(1);
  }
  return cleaned;
}

function getSettingsMap(ss) {
  let settingsSheet = ss.getSheetByName(SETTINGS_SHEET_NAME);
  if (!settingsSheet) return { TG_ENABLED: 'true', WA_ENABLED: 'false' };
  
  const data = settingsSheet.getDataRange().getValues();
  let map = {};
  for (let i = 1; i < data.length; i++) {
    map[String(data[i][0]).trim()] = String(data[i][1]).trim();
  }
  return map;
}

function handleSaveSettings(ss, settings) {
  let settingsSheet = ss.getSheetByName(SETTINGS_SHEET_NAME);
  if (!settingsSheet) {
    setupInitialSheet();
    settingsSheet = ss.getSheetByName(SETTINGS_SHEET_NAME);
  }
  
  const data = settingsSheet.getDataRange().getValues();
  for (let key in settings) {
    let found = false;
    for (let i = 1; i < data.length; i++) {
      if (data[i][0] === key) {
        settingsSheet.getRange(i + 1, 2).setValue(settings[key]);
        found = true;
        break;
      }
    }
    if (!found) {
      settingsSheet.appendRow([key, settings[key]]);
    }
  }
  
  return responseJSON({ status: 'success', message: 'Pengaturan berhasil disimpan!' });
}

function calculateAgingHours(dateBDStr, timeBDStr) {
  try {
    const bdDate = new Date(dateBDStr + 'T' + (timeBDStr || '00:00') + ':00');
    const now = new Date();
    const diffMs = now - bdDate;
    if (isNaN(diffMs) || diffMs < 0) return 0;
    return diffMs / (1000 * 60 * 60);
  } catch(e) {
    return 0;
  }
}

function formatAgingText(hours) {
  if (hours < 24) return hours.toFixed(1) + ' Jam';
  const days = Math.floor(hours / 24);
  const rem = Math.floor(hours % 24);
  return days + ' Hari ' + rem + ' Jam';
}

function calculateDuration(dateBDStr, timeBDStr, timeRFUStr) {
  try {
    const start = new Date(dateBDStr + 'T' + (timeBDStr || '00:00') + ':00');
    let end = new Date(dateBDStr + 'T' + (timeRFUStr || '00:00') + ':00');
    if (end < start) end.setDate(end.getDate() + 1);
    const diff = (end - start) / (1000 * 60 * 60);
    return diff > 0 ? diff : 0;
  } catch(e) {
    return 0;
  }
}

function formatRowColor(sheet, rowIndex, status) {
  const range = sheet.getRange(rowIndex, 1, 1, HEADERS.length);
  const stat = (status || '').toString().toUpperCase().trim();
  if (stat === 'RFU' || stat === 'READY') {
    range.setBackground('#dcfce7'); // Hijau muda lembut (Ready / Selesai)
  } else if (stat === 'CANCEL') {
    range.setBackground('#fee2e2'); // Merah muda lembut (Batal / Cancel)
  } else {
    // BREAKDOWN, CONTINUE, WAITING PART (Dalam proses)
    range.setBackground('#fef9c3'); // Kuning muda lembut (Dalam Proses)
  }
}

function responseJSON(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
