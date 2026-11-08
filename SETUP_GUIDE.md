# PANDUAN LENGKAP: WEB BASE CONTROL PLANT PERTAMBANGAN
### Solusi Notifikasi Real-time 100% GRATIS SELAMANYA & TANPA BATAS KUOTA (UNLIMITED)

---

## 1. Fakta Penting Mengenai WhatsApp vs Telegram

Pertanyaan Anda sangat tepat: **"Apakah dibatasi? Saya ingin yang gratis dan tanpa hambatan atau tanpa batas waktu/limit."**

Berikut perbandingan jujur sesuai regulasi teknologi saat ini:

| Kriteria | WhatsApp Gateway (Fonnte / Pihak Ketiga) | **Telegram Group Bot (Rekomendasi Tambang)** |
|:---|:---|:---|
| **Biaya** | Ada kuota gratis terbatas (misal 100–250 pesan/bulan), selebihnya berbayar | **100% GRATIS SELAMANYA** resmi dari Telegram |
| **Batas Kuota Pesan** | **Dibatasi** per bulan | **TANPA BATAS (UNLIMITED)** mau 10.000 pesan/bulan tetap gratis |
| **Batas Waktu / Expired** | Ada masa kedaluwarsa kuota | **TIDAK ADA MASA BERLAKU** (Aktif selamanya) |
| **Risiko Banned Nomor** | Berisiko jika terdeteksi spam oleh Meta | **0% RISIKO BANNED** (Resmi didukung API Telegram) |
| **Kecepatan di Pit Tambang**| Bergantung server pihak ketiga | **Sangat Cepat & Ringan**, hemat kuota di sinyal pit minim |

> [!IMPORTANT]
> **Mengapa Telegram Bot Menjadi Standar Utama di Site Tambang Indonesia?**
> Karena Telegram menyediakan bot resmi yang **100% gratis selamanya tanpa batas kuota**. Seluruh perusahaan tambang di Kalimantan, Sulawesi, hingga Papua menggunakan Telegram Bot untuk broadcast alarm unit breakdown dan dispatching karena tidak pernah meminta biaya langganan bulanan.

---

## 2. Cara Mengaktifkan Bot Telegram Grup (Hanya 2 Menit & 100% Gratis)

### Langkah 1: Buat Bot di Telegram (1 Menit)
1. Buka aplikasi **Telegram** di HP atau laptop Anda.
2. Di kolom pencarian (Search), ketik: **`@BotFather`** (Pilih yang ada centang birunya).
3. Klik tombol **Start**, lalu ketik: `/newbot`
4. Masukkan nama bot Anda, contoh: `Base Control Plant SS6`
5. Masukkan username bot (harus diakhiri kata `bot`), contoh: `plant_ss6_bd_bot`
6. `@BotFather` akan langsung memberikan kode **Token API** yang panjang (contoh: `7482910482:AAFlw93...`). **Salin kode Token ini**.

### Langkah 2: Buat Grup Telegram Mekanik & Ambil Chat ID (1 Menit)
1. Buat Grup Telegram baru (atau buka grup mekanik yang sudah ada), misalnya nama grup: `MONITORING BD PLANT SS6`.
2. Masukkan bot yang baru Anda buat tadi ke dalam grup tersebut (jadikan Admin agar lancar membaca pesan).
3. **Cara Cepat Mengetahui Chat ID Grup:**
   - Masukkan bot pembantu bernama **`@getidsbot`** atau **`@myidbot`** ke dalam grup tersebut.
   - Bot tersebut akan langsung menuliskan **Chat ID** grup Anda (biasanya diawali tanda minus, contoh: `-1002345678901`).
   - Salin angka ID tersebut, lalu keluarkan (*kick*) bot pembantu tadi dari grup.

### Langkah 3: Sambungkan ke Web Base Control
1. Buka web kita: [index.html](file:///C:/Users/M%20S%20I/.gemini/antigravity/scratch/mining-plant-control/index.html).
2. Login dengan akun NRP Anda (misal `10001` / pass `plantss6admin`).
3. Klik ikon gerigi **Pengaturan (⚙️)** di kanan atas.
4. Pada bagian **Bot Telegram Grup**:
   - Masukkan **Token Bot Telegram** dari Langkah 1.
   - Masukkan **Chat ID Grup Telegram** dari Langkah 2.
   - Pastikan saklar tombol dalam posisi ON (Menyala).
5. Klik tombol biru: **"Tes Kirim Telegram"**.
6. **Lihat Grup Telegram Anda!** Detik itu juga pesan tes akan masuk.
7. Klik **Simpan Pengaturan**.

---

## 3. Format Notifikasi yang Masuk ke Grup Telegram

Pesan otomatis akan berformat rapi dengan huruf tebal dan penataan kolom khas plant pertambangan:

```text
🚨 LAPORAN BREAKDOWN UNIT (SS6 PLANT) 🚨
━━━━━━━━━━━━━━━━━━━━
🆔 ID Tiket : BD-20261024-001
🚜 Unit     : DT-01 (Komatsu HD785-7)
📍 Posisi   : PIT BARAT FRONT 3
⏱️ HM Down  : 12450.5
📅 Waktu    : 2026-10-24 pukul 16:30 WITA
⚙️ Damage   : ENGINE SYSTEM
⚠️ Masalah  : Engine low power & asap tebal saat nanjak
👤 Pelapor  : Joko Widodo (Operator)
━━━━━━━━━━━━━━━━━━━━
⚡ Status: BREAKDOWN | Delay: NO DELAY
Mohon Mekanik Service segera standby & merapat ke lokasi!
```

Dan saat unit selesai diperbaiki (RFU):
```text
🟢 UNIT RFU (READY FOR USE) - SS6 PLANT 🟢
━━━━━━━━━━━━━━━━━━━━
🚜 Unit     : DT-01 (Komatsu HD785-7)
⏱️ HM RFU   : 12450.5
⏳ Downtime : 3.5 Jam
🕒 Jam RFU  : 20:00 WITA
━━━━━━━━━━━━━━━━━━━━
Unit sudah siap beroperasi kembali di pit!
```

---

## 4. Apakah WhatsApp Masih Bisa Digunakan?

**Masih bisa!** Sistem yang saya buat mendukung **keduanya (Telegram & WhatsApp)** secara fleksibel:
- Jika Anda ingin menggunakan WhatsApp Gateway (Fonnte), Anda tetap bisa mengisi kolom token WhatsApp di menu pengaturan.
- Tetapi jika Anda ingin **100% GRATIS SELAMANYA, TANPA BATAS KUOTA, dan TANPA HAMBATAN BIAYA LANGGANAN**, **Telegram Bot adalah jawaban terbaiknya**.

---

## 5. Fitur Baru: Notifikasi Otomatis WhatsApp Langsung ke HP Operator saat RFU 📲

### Mengapa Fitur Ini Dibuat?
Di lapangan pertambangan, saat unit breakdown selesai diperbaiki oleh tim mekanik (**RFU - Ready For Use**), sering kali operator atau driver unit sedang istirahat di shelter atau jauh dari pit. Agar unit dapat segera kembali beroperasi tanpa menunggu kabar estafet dari pengawas lapangan, sistem sekarang dapat **langsung mengirim pesan otomatis ke WhatsApp pribadi operator**!

### Alur Kerja di Lapangan:
1. **Pelaporan oleh Operator:**
   - Saat mengisi **Form Pelaporan Breakdown (Operator Unit)** di web, ada kolom input baru: **`No. WhatsApp / HP Operator`** (contoh: `081234567890` atau `62812...`).
   - Nomor WhatsApp ini tersimpan rapi ke tiket breakdown dan Google Sheets.

2. **Proses RFU oleh Base Control / Dispatcher:**
   - Ketika mekanik menyelesaikan perbaikan dan petugas Base Control menekan tombol hijau **"RFU-kan"**, jendela konfirmasi modal RFU akan secara otomatis menampilkan:
     - Nama operator & nomor WhatsApp yang tersimpan.
     - Saklar/checkbox: **`[✓] Kirim WA Otomatis`**.
     - Kolom nomor HP (dapat diubah atau diisi manual jika belum ada).
   - Tuliskan tindakan perbaikan / DO (Description of Work) yang telah dikerjakan.

3. **Pengiriman Pesan Otomatis:**
   - Saat tombol **"Konfirmasi RFU"** ditekan, sistem otomatis membuat pesan berformat profesional:
   ```text
   🟢 UNIT READY FOR USE (RFU) - PLANT SS6 🟢

   Halo Rekan Operator Joko Widodo,
   Unit Anda telah selesai diperbaiki dan siap beroperasi kembali di pit:

   🚜 Unit         : H57033 (HD785-7)
   📍 Posisi       : Pit Barat Front 2
   ⏱️ HM RFU       : 14210.2
   🕒 Jam RFU      : 11:00 WITA
   ⏳ Durasi BD    : 3 Jam 45 Menit
   🔧 Tindakan/DO  : Penggantian hose steering high pressure 1 inch, running test normal.
   ━━━━━━━━━━━━━━━━━━━━
   Harap lakukan P2H sebelum unit bergerak. Tetap utamakan KESELAMATAN KERJA (K3)! ⛑️ Salam Tangguh!
   ```
   - **Melalui Gateway:** Jika WhatsApp Gateway (Fonnte) diaktifkan, pesan dikirim otomatis ke HP operator di latar belakang.
   - **Melalui Tombol 1-Click WhatsApp:** Pada dialog sukses RFU, disediakan tombol **`"Buka Chat WhatsApp Langsung ke Operator"`** yang bisa langsung diklik untuk membuka chat WhatsApp Web / Mobile dengan pesan yang sudah terisi otomatis tanpa perlu langganan gateway!

