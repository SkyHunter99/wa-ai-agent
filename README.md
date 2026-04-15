# WA AI Agent — Setup Guide
## Stack: Node.js + Claude AI + WhatsApp Business API + Meta Conversions API

---

## 📁 Struktur File

```
wa-ai-agent/
├── server.js          ← Backend utama (webhook, AI, Meta Pixel)
├── package.json
├── .env               ← Isi token & key kamu di sini
├── .env.example       ← Template .env
└── data/
    ├── conversations.json   ← Auto-dibuat, simpan history chat
    └── logs.json            ← Auto-dibuat, log semua aktivitas
```

---

## 🚀 Langkah Setup (Step by Step)

### 1. Install Dependencies
```bash
npm install
```

### 2. Siapkan WhatsApp Business API
1. Buka https://developers.facebook.com
2. Buat app baru → pilih "Business"
3. Tambah produk "WhatsApp"
4. Di menu "API Setup":
   - Copy **Phone Number ID** → isi `WA_PHONE_ID` di `.env`
   - Generate **Access Token** → isi `WA_TOKEN` di `.env`
5. Tambah nomor test di "Test Phone Numbers"

### 3. Setup Webhook
```bash
# Install ngrok untuk expose localhost
npm install -g ngrok

# Jalankan server
node server.js

# Di terminal lain, expose ke internet
ngrok http 3000
```

Copy URL ngrok (contoh: `https://abc123.ngrok.io`)

Di Meta Dashboard → WhatsApp → Configuration → Webhook:
- **Callback URL**: `https://abc123.ngrok.io/webhook`
- **Verify Token**: isi sama dengan `VERIFY_TOKEN` di `.env`
- Subscribe ke: `messages`

### 4. Setup Meta Conversions API (Pixel)
1. Buka https://business.facebook.com
2. Events Manager → pilih Pixel kamu
3. Settings → **Conversions API** → Generate Access Token
4. Copy **Pixel ID** dan **Access Token** ke `.env`

### 5. Isi .env
```bash
cp .env.example .env
# Edit file .env dengan token-token di atas
```

### 6. Jalankan
```bash
node server.js
```

---

## 🔄 Cara Kerja

```
Pelanggan klik WA dari Meta Ads
         ↓
  Pesan masuk ke webhook
         ↓
  Fire event "Lead" ke Meta Pixel ← (otomatis saat pesan pertama)
         ↓
  Jam kerja? (08:00–22:00 WIB)
  ├── Ya  → Notifikasi ke CS, tidak balas otomatis
  └── Tidak → AI (Claude) balas otomatis
         ↓
  Deteksi intent pesan:
  ├── "beli/order/pesan" → Fire "InitiateCheckout"
  └── "sudah bayar/transfer" → Fire "Purchase"
```

---

## 📡 API Endpoints (untuk Dashboard)

| Method | Endpoint | Fungsi |
|--------|----------|--------|
| GET | `/api/stats` | Statistik ringkasan |
| GET | `/api/conversations` | List semua percakapan |
| GET | `/api/conversations/:phone` | History 1 nomor |
| GET | `/api/logs` | Log aktivitas |
| POST | `/api/reply` | Balas manual dari CS |
| POST | `/api/broadcast` | Kirim broadcast |

---

## 📊 Meta Events yang Dikirim

| Event | Kapan |
|-------|-------|
| `Lead` | Pesan pertama kali masuk dari nomor baru |
| `InitiateCheckout` | Customer kirim kata "beli/order/mau pesan" |
| `Purchase` | Customer kirim bukti bayar / konfirmasi deal |

---

## ⚙️ Kustomisasi

**Ganti System Prompt AI** → Edit variabel `SYSTEM_PROMPT` di `server.js`

**Ganti jam kerja CS** → Edit `.env`:
```
WORK_START=8
WORK_END=22
```

**Ganti jadwal broadcast cron** → Edit bagian `cron.schedule` di `server.js`
Format: `"menit jam * * hariKe"`
- `"0 9 * * 1"` = Setiap Senin jam 09:00
- `"0 10 * * *"` = Setiap hari jam 10:00

**Tambah Purchase value** → Edit `fireMetaEvent("Purchase", ...)`:
```js
await fireMetaEvent("Purchase", from, { value: 150000, currency: "IDR" });
```

---

## 🔐 Untuk Production

- Ganti penyimpanan JSON → pakai **MongoDB** atau **PostgreSQL**
- Deploy ke **Railway**, **Render**, atau **VPS**
- Gunakan **PM2** agar server tidak mati:
  ```bash
  npm install -g pm2
  pm2 start server.js --name wa-agent
  pm2 save
  ```
- Pastikan HTTPS aktif (Meta butuh HTTPS untuk webhook)
