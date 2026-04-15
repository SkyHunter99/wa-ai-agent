// ============================================================
//  server.js — WA AI Agent + Meta Conversions API
//  Stack: Node.js + Express + Gemini AI + WhatsApp Cloud API
// ============================================================

require("dotenv").config();
const express = require("express");
const axios   = require("axios");
const crypto  = require("crypto");
const cron    = require("node-cron");
const fs      = require("fs");
const path    = require("path");
const { GoogleGenerativeAI } = require("@google/generative-ai");

const app = express();
app.use(express.json());

// ─── ENV ────────────────────────────────────────────────────
const {
  WA_TOKEN,           // WhatsApp Cloud API token
  WA_PHONE_ID,        // Phone Number ID dari Meta
  GEMINI_API_KEY,     // Google Gemini API key
  META_PIXEL_ID,      // Pixel ID dari Events Manager
  META_ACCESS_TOKEN,  // Conversions API token
  VERIFY_TOKEN,       // Token sembarang untuk verifikasi webhook
  CS_NOTIFY_NUMBER,   // Nomor WA CS untuk notifikasi (format: 628xxx)
  WORK_START,         // Jam mulai kerja, default "8"
  WORK_END,           // Jam selesai kerja, default "22"
  PORT,
} = process.env;

// ─── GEMINI CLIENT ───────────────────────────────────────────
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

const WORK_H_START = parseInt(WORK_START || "8");
const WORK_H_END   = parseInt(WORK_END   || "22");

// ─── STORAGE (file JSON sederhana, bisa ganti ke DB) ────────
const DB_PATH = path.join(__dirname, "data", "conversations.json");
if (!fs.existsSync(path.join(__dirname, "data"))) {
  fs.mkdirSync(path.join(__dirname, "data"));
}
if (!fs.existsSync(DB_PATH)) fs.writeFileSync(DB_PATH, "{}");

function loadDB() {
  return JSON.parse(fs.readFileSync(DB_PATH, "utf8"));
}
function saveDB(db) {
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
}

// ─── LOG ─────────────────────────────────────────────────────
const LOG_PATH = path.join(__dirname, "data", "logs.json");
if (!fs.existsSync(LOG_PATH)) fs.writeFileSync(LOG_PATH, "[]");

function addLog(type, message, extra = {}) {
  const logs = JSON.parse(fs.readFileSync(LOG_PATH, "utf8"));
  const entry = {
    id: Date.now(),
    time: new Date().toISOString(),
    type,   // "ai_reply" | "cs_notify" | "lead" | "purchase" | "broadcast" | "error"
    message,
    ...extra,
  };
  logs.unshift(entry);
  fs.writeFileSync(LOG_PATH, JSON.stringify(logs.slice(0, 500), null, 2));
  console.log(`[${type.toUpperCase()}] ${message}`);
  return entry;
}

// ─── HELPERS ─────────────────────────────────────────────────
function isWorkingHours() {
  // Gunakan timezone WIB (UTC+7)
  const now  = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Jakarta" }));
  const hour = now.getHours();
  return hour >= WORK_H_START && hour < WORK_H_END;
}

function hashPhone(phone) {
  return crypto.createHash("sha256").update(phone.replace(/\D/g, "")).digest("hex");
}

// Intent detection — cari kata kunci pembelian
function detectIntent(text) {
  const lower = text.toLowerCase();
  const buyKeywords   = ["beli", "order", "pesan", "mau beli", "mau order", "bayar", "checkout", "mau ambil", "transfer", "dp", "lunas"];
  const closeKeywords = ["sudah bayar", "sudah transfer", "bukti transfer", "sudah dp", "deal", "oke deal", "fix"];
  if (closeKeywords.some(k => lower.includes(k))) return "purchase";
  if (buyKeywords.some(k => lower.includes(k)))   return "initiate_checkout";
  return "message";
}

// ─── META CONVERSIONS API ────────────────────────────────────
async function fireMetaEvent(eventName, phone, customData = {}) {
  try {
    const payload = {
      data: [{
        event_name:    eventName,
        event_time:    Math.floor(Date.now() / 1000),
        action_source: "other",
        user_data: {
          ph: [hashPhone(phone)],
        },
        ...(Object.keys(customData).length > 0 && { custom_data: customData }),
      }],
      access_token: META_ACCESS_TOKEN,
    };

    await axios.post(
      `https://graph.facebook.com/v19.0/${META_PIXEL_ID}/events`,
      payload
    );

    addLog(eventName.toLowerCase(), `Meta event "${eventName}" dikirim untuk ${phone}`, { phone, customData });
  } catch (err) {
    addLog("error", `Gagal kirim Meta event: ${err.message}`, { phone });
  }
}

// ─── WHATSAPP SEND ───────────────────────────────────────────
async function sendWAMessage(to, text) {
  await axios.post(
    `https://graph.facebook.com/v19.0/${WA_PHONE_ID}/messages`,
    {
      messaging_product: "whatsapp",
      to,
      type: "text",
      text: { body: text },
    },
    { headers: { Authorization: `Bearer ${WA_TOKEN}`, "Content-Type": "application/json" } }
  );
}

// Kirim notifikasi ke nomor CS
async function notifyCS(from, text, name = "") {
  if (!CS_NOTIFY_NUMBER) return;
  const msg = `🔔 *LEADS BARU (JAM KERJA)*\n\nDari: ${name || from}\nNomor: ${from}\n\nPesan:\n_${text}_\n\n→ Segera follow up!`;
  await sendWAMessage(CS_NOTIFY_NUMBER, msg);
  addLog("cs_notify", `Notifikasi CS dikirim untuk ${from}`, { from });
}

// ─── GEMINI AI ───────────────────────────────────────────────
async function callGemini(history, systemPrompt) {
  const model = genAI.getGenerativeModel({
    model: "gemini-2.0-flash",
    systemInstruction: systemPrompt,
  });

  // Konversi format history ke format Gemini
  // Gemini pakai "user" dan "model" (bukan "assistant")
  const geminiHistory = history.slice(0, -1).map(m => ({
    role:  m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));

  const chat = model.startChat({
    history: geminiHistory,
    generationConfig: { maxOutputTokens: 500 },
  });

  // Pesan terakhir = pesan user yang baru masuk
  const lastMessage = history[history.length - 1].content;
  const result = await chat.sendMessage(lastMessage);
  return result.response.text();
}

const SYSTEM_PROMPT = `
Kamu adalah asisten customer service yang ramah, profesional, dan persuasif.
Tugasmu adalah membalas pesan pelanggan yang masuk lewat WhatsApp di luar jam kerja (malam hari).

Panduan:
- Gunakan Bahasa Indonesia yang santai tapi sopan
- Jawab pertanyaan produk dengan jelas dan informatif
- Jika ada yang tertarik beli, arahkan untuk konfirmasi order
- Jika ada yang sudah kirim bukti bayar, konfirmasi dan ucapkan terima kasih
- Maksimal 3 kalimat per balasan, tidak perlu bertele-tele
- Jangan sebut bahwa kamu adalah AI, cukup sebut diri sebagai "tim kami"
- Jika pertanyaan sangat teknis atau kompleks, sampaikan bahwa tim CS akan follow up saat jam kerja (jam 08.00)
`.trim();

// ─── WEBHOOK VERIFY ──────────────────────────────────────────
app.get("/webhook", (req, res) => {
  if (
    req.query["hub.mode"]         === "subscribe" &&
    req.query["hub.verify_token"] === VERIFY_TOKEN
  ) {
    console.log("✅ Webhook verified");
    return res.status(200).send(req.query["hub.challenge"]);
  }
  res.sendStatus(403);
});

// ─── WEBHOOK HANDLER (PESAN MASUK) ───────────────────────────
app.post("/webhook", async (req, res) => {
  res.sendStatus(200); // Selalu balas 200 dulu ke Meta

  try {
    const entry   = req.body?.entry?.[0];
    const changes = entry?.changes?.[0]?.value;
    const msg     = changes?.messages?.[0];
    const contact = changes?.contacts?.[0];

    if (!msg || msg.type !== "text") return;

    const from    = msg.from;
    const text    = msg.text.body;
    const name    = contact?.profile?.name || from;
    const isFirst = !loadDB()[from];

    addLog("incoming", `Pesan dari ${name} (${from}): ${text}`, { from, name });

    // ── Simpan ke history ──
    const db = loadDB();
    if (!db[from]) {
      db[from] = { name, phone: from, history: [], isLead: false, isPurchase: false, firstSeen: new Date().toISOString() };
    }
    db[from].history.push({ role: "user", content: text });
    db[from].lastSeen = new Date().toISOString();
    saveDB(db);

    // ── Fire Lead event saat pesan pertama kali masuk ──
    if (isFirst) {
      await fireMetaEvent("Lead", from);
    }

    // ── Deteksi intent beli ──
    const intent = detectIntent(text);

    if (intent === "purchase" && !db[from].isPurchase) {
      db[from].isPurchase = true;
      saveDB(db);
      await fireMetaEvent("Purchase", from, { value: 0, currency: "IDR" });
    } else if (intent === "initiate_checkout") {
      await fireMetaEvent("InitiateCheckout", from);
    }

    // ── Routing: Jam Kerja vs Malam ──
    if (isWorkingHours()) {
      // Jam kerja → notif CS, jangan balas AI
      await notifyCS(from, text, name);
      addLog("cs_notify", `Jam kerja — pesan dari ${name} diteruskan ke CS`, { from });
      return;
    }

    // Malam → AI yang balas
    const dbNow = loadDB();
    const recentHistory = dbNow[from].history.slice(-10); // Ambil 10 pesan terakhir

    const aiReply = await callGemini(recentHistory, SYSTEM_PROMPT);

    // Simpan balasan AI ke history
    dbNow[from].history.push({ role: "assistant", content: aiReply });
    saveDB(dbNow);

    await sendWAMessage(from, aiReply);
    addLog("ai_reply", `AI membalas ke ${name} (${from})`, { from, reply: aiReply });

  } catch (err) {
    addLog("error", `Error webhook: ${err.message}`);
    console.error(err);
  }
});

// ─── API UNTUK DASHBOARD ──────────────────────────────────────

// GET semua percakapan
app.get("/api/conversations", (req, res) => {
  const db = loadDB();
  const list = Object.values(db).map(c => ({
    phone:       c.phone,
    name:        c.name,
    lastMessage: c.history[c.history.length - 1]?.content || "",
    lastSeen:    c.lastSeen,
    isLead:      c.isLead,
    isPurchase:  c.isPurchase,
    msgCount:    c.history.length,
    firstSeen:   c.firstSeen,
  }));
  res.json(list.sort((a, b) => new Date(b.lastSeen) - new Date(a.lastSeen)));
});

// GET history percakapan 1 nomor
app.get("/api/conversations/:phone", (req, res) => {
  const db = loadDB();
  const conv = db[req.params.phone];
  if (!conv) return res.status(404).json({ error: "Not found" });
  res.json(conv);
});

// GET logs
app.get("/api/logs", (req, res) => {
  const logs = JSON.parse(fs.readFileSync(LOG_PATH, "utf8"));
  res.json(logs.slice(0, 100));
});

// GET stats
app.get("/api/stats", (req, res) => {
  const db   = loadDB();
  const all  = Object.values(db);
  const logs = JSON.parse(fs.readFileSync(LOG_PATH, "utf8"));
  const today = new Date().toDateString();

  res.json({
    totalLeads:     all.length,
    totalPurchases: all.filter(c => c.isPurchase).length,
    aiReplies:      logs.filter(l => l.type === "ai_reply").length,
    todayMessages:  logs.filter(l => new Date(l.time).toDateString() === today).length,
    isWorkingHours: isWorkingHours(),
  });
});

// POST broadcast manual
app.post("/api/broadcast", async (req, res) => {
  const { message, phones } = req.body;
  if (!message || !phones?.length) return res.status(400).json({ error: "message dan phones required" });

  let sent = 0, failed = 0;
  for (const phone of phones) {
    try {
      await sendWAMessage(phone, message);
      sent++;
      await new Promise(r => setTimeout(r, 1000)); // delay 1 detik antar pesan
    } catch {
      failed++;
    }
  }

  addLog("broadcast", `Broadcast selesai: ${sent} terkirim, ${failed} gagal`, { sent, failed, total: phones.length });
  res.json({ sent, failed, total: phones.length });
});

// POST manual reply dari dashboard
app.post("/api/reply", async (req, res) => {
  const { phone, message } = req.body;
  if (!phone || !message) return res.status(400).json({ error: "phone dan message required" });
  await sendWAMessage(phone, message);
  const db = loadDB();
  if (db[phone]) {
    db[phone].history.push({ role: "assistant", content: `[CS Manual] ${message}` });
    saveDB(db);
  }
  addLog("cs_reply", `CS manual reply ke ${phone}`, { phone });
  res.json({ ok: true });
});

// ─── BROADCAST TERJADWAL (Cron) ──────────────────────────────
// Contoh: setiap Senin jam 09:00 WIB
cron.schedule("0 9 * * 1", async () => {
  const db     = loadDB();
  const phones = Object.keys(db);
  const msg    = "Selamat pagi! Ada promo spesial minggu ini khusus untuk kamu. Hubungi kami untuk info lebih lanjut 🎉";
  
  addLog("broadcast", `Cron broadcast dimulai ke ${phones.length} kontak`);
  for (const phone of phones) {
    try {
      await sendWAMessage(phone, msg);
      await new Promise(r => setTimeout(r, 1200));
    } catch (e) {
      addLog("error", `Gagal broadcast ke ${phone}: ${e.message}`);
    }
  }
  addLog("broadcast", "Cron broadcast selesai");
}, { timezone: "Asia/Jakarta" });

// ─── START ───────────────────────────────────────────────────
app.listen(PORT || 3000, () => {
  console.log(`🚀 Server running on port ${PORT || 3000}`);
  console.log(`⏰ Jam kerja CS: ${WORK_H_START}:00 – ${WORK_H_END}:00 WIB`);
  console.log(`🤖 AI aktif di luar jam kerja`);
});
