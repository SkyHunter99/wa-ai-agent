import { useState, useEffect, useCallback } from "react";

// ─── MOCK DATA (ganti dengan fetch ke /api/* di production) ──
const MOCK_STATS = {
  totalLeads: 84, totalPurchases: 23, aiReplies: 312,
  todayMessages: 47, isWorkingHours: false,
};

const MOCK_CONVS = [
  { phone: "6281234567890", name: "Budi Santoso", lastMessage: "Oke deal kak, saya transfer sekarang", lastSeen: "2025-04-15T22:41:00Z", isLead: true, isPurchase: true, msgCount: 8 },
  { phone: "6285678901234", name: "Siti Rahayu", lastMessage: "Harga per pcs berapa ya?", lastSeen: "2025-04-15T22:33:00Z", isLead: true, isPurchase: false, msgCount: 4 },
  { phone: "6281298765432", name: "Ahmad Fauzi", lastMessage: "Bisa COD daerah Bekasi?", lastSeen: "2025-04-15T22:18:00Z", isLead: true, isPurchase: false, msgCount: 3 },
  { phone: "6287712345678", name: "Dewi Lestari", lastMessage: "Sudah bayar kak, ini buktinya", lastSeen: "2025-04-15T21:55:00Z", isLead: true, isPurchase: true, msgCount: 11 },
  { phone: "6285511223344", name: "Rizky Pratama", lastMessage: "Min ada stok warna hitam?", lastSeen: "2025-04-15T21:44:00Z", isLead: true, isPurchase: false, msgCount: 2 },
];

const MOCK_HISTORY = {
  "6281234567890": [
    { role: "user",      content: "Halo min, masih ada stok?" },
    { role: "assistant", content: "Halo Budi! Masih ada stok lengkap kak 😊 Mau pesan berapa unit?" },
    { role: "user",      content: "2 unit deh. Ongkir ke Surabaya berapa?" },
    { role: "assistant", content: "Ongkir ke Surabaya sekitar Rp18.000 via JNE REG kak. Mau lanjut order?" },
    { role: "user",      content: "Oke deal kak, saya transfer sekarang" },
    { role: "assistant", content: "Siap kak! Rekening kami BCA 1234567890 a/n Toko Kami. Setelah transfer, kirim buktinya ya 🙏" },
  ],
};

const MOCK_LOGS = [
  { id: 1, time: "2025-04-15T22:41:00Z", type: "purchase",   message: 'Meta event "Purchase" dikirim untuk 6281234567890' },
  { id: 2, time: "2025-04-15T22:40:00Z", type: "ai_reply",   message: "AI membalas ke Budi Santoso (6281234567890)" },
  { id: 3, time: "2025-04-15T22:39:00Z", type: "incoming",   message: "Pesan dari Budi Santoso: Oke deal kak, saya transfer sekarang" },
  { id: 4, time: "2025-04-15T22:33:00Z", type: "lead",       message: 'Meta event "Lead" dikirim untuk 6285678901234' },
  { id: 5, time: "2025-04-15T22:18:00Z", type: "initiate_checkout", message: 'Meta event "InitiateCheckout" dikirim untuk 6281298765432' },
  { id: 6, time: "2025-04-15T21:55:00Z", type: "purchase",   message: 'Meta event "Purchase" dikirim untuk 6287712345678' },
  { id: 7, time: "2025-04-15T21:44:00Z", type: "ai_reply",   message: "AI membalas ke Rizky Pratama (6285511223344)" },
  { id: 8, time: "2025-04-15T20:10:00Z", type: "cs_notify",  message: "Notifikasi CS dikirim untuk 6289900112233" },
  { id: 9, time: "2025-04-15T09:22:00Z", type: "broadcast",  message: "Broadcast selesai: 80 terkirim, 2 gagal" },
];

// ─── FONT INJECT ─────────────────────────────────────────────
const FONTS = `@import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap');`;

function injectFonts() {
  if (document.getElementById("wa-fonts")) return;
  const s = document.createElement("style");
  s.id = "wa-fonts";
  s.textContent = FONTS + `
    *{box-sizing:border-box;margin:0;padding:0}
    body{background:#05080F;overflow:hidden}
    ::-webkit-scrollbar{width:3px}
    ::-webkit-scrollbar-track{background:transparent}
    ::-webkit-scrollbar-thumb{background:#1E2D40;border-radius:4px}
    @keyframes fadeUp{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}
    @keyframes ping{0%{transform:scale(1);opacity:1}75%,100%{transform:scale(2);opacity:0}}
    @keyframes blink{0%,100%{opacity:1}50%{opacity:.3}}
    @keyframes shimmer{0%{background-position:-200% 0}100%{background-position:200% 0}}
  `;
  document.head.appendChild(s);
}

// ─── UTILS ───────────────────────────────────────────────────
const relTime = (iso) => {
  const diff = (Date.now() - new Date(iso)) / 1000;
  if (diff < 60) return `${Math.floor(diff)}d lalu`;
  if (diff < 3600) return `${Math.floor(diff/60)}m lalu`;
  if (diff < 86400) return `${Math.floor(diff/3600)}j lalu`;
  return `${Math.floor(diff/86400)}hr lalu`;
};

const fmtTime = (iso) => new Date(iso).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });

const LOG_COLOR = {
  purchase:          { bg: "#0D2B1A", border: "#00C96644", text: "#00C966", icon: "💰" },
  lead:              { bg: "#0A1E2E", border: "#00AAFF44", text: "#00AAFF", icon: "🎯" },
  initiate_checkout: { bg: "#1C1A08", border: "#FFB80044", text: "#FFB800", icon: "🛒" },
  ai_reply:          { bg: "#130D20", border: "#9B6DFF44", text: "#9B6DFF", icon: "🤖" },
  cs_notify:         { bg: "#1A1010", border: "#FF6B6B44", text: "#FF6B6B", icon: "👤" },
  cs_reply:          { bg: "#1A1010", border: "#FF6B6B44", text: "#FF6B6B", icon: "✍️" },
  broadcast:         { bg: "#0A1E2E", border: "#00AAFF44", text: "#00AAFF", icon: "📡" },
  incoming:          { bg: "#111820", border: "#2A3D50", text: "#7A9AB8", icon: "📩" },
  error:             { bg: "#1A0808", border: "#FF444444", text: "#FF4444", icon: "⚠️" },
};

// ─── MAIN APP ─────────────────────────────────────────────────
export default function App() {
  useEffect(() => { injectFonts(); }, []);

  const [tab,        setTab]        = useState("dashboard");
  const [convs,      setConvs]      = useState(MOCK_CONVS);
  const [stats,      setStats]      = useState(MOCK_STATS);
  const [logs,       setLogs]       = useState(MOCK_LOGS);
  const [selected,   setSelected]   = useState(MOCK_CONVS[0]);
  const [history,    setHistory]    = useState(MOCK_HISTORY["6281234567890"] || []);
  const [replyText,  setReplyText]  = useState("");
  const [bcModal,    setBcModal]    = useState(false);
  const [bcMsg,      setBcMsg]      = useState("");
  const [bcName,     setBcName]     = useState("");
  const [bcTarget,   setBcTarget]   = useState("all");
  const [prompt,     setPrompt]     = useState(`Kamu adalah asisten customer service yang ramah dan profesional.\nJawab dalam Bahasa Indonesia, singkat dan jelas.\nJika ada yang mau beli, arahkan untuk konfirmasi order.\nMaksimal 3 kalimat per balasan.`);
  const [workStart,  setWorkStart]  = useState("8");
  const [workEnd,    setWorkEnd]    = useState("22");
  const [agentOn,    setAgentOn]    = useState(true);
  const [filterLog,  setFilterLog]  = useState("all");

  const selectConv = useCallback((c) => {
    setSelected(c);
    setHistory(MOCK_HISTORY[c.phone] || [
      { role: "user",      content: c.lastMessage },
      { role: "assistant", content: "Halo! Terima kasih sudah menghubungi kami. Ada yang bisa kami bantu?" },
    ]);
  }, []);

  const sendReply = () => {
    if (!replyText.trim()) return;
    setHistory(h => [...h, { role: "assistant", content: `[CS] ${replyText}` }]);
    setLogs(l => [{ id: Date.now(), time: new Date().toISOString(), type: "cs_reply", message: `CS manual reply ke ${selected.name}` }, ...l]);
    setReplyText("");
  };

  const sendBroadcast = () => {
    if (!bcMsg.trim() || !bcName.trim()) return;
    setLogs(l => [{ id: Date.now(), time: new Date().toISOString(), type: "broadcast", message: `Broadcast "${bcName}" dijadwalkan ke ${bcTarget === "all" ? convs.length : convs.filter(c => c.isPurchase).length} kontak` }, ...l]);
    setBcModal(false); setBcMsg(""); setBcName("");
  };

  const filteredLogs = filterLog === "all" ? logs : logs.filter(l => l.type === filterLog);

  const f = { fontFamily: "'Plus Jakarta Sans', sans-serif" };
  const mono = { fontFamily: "'JetBrains Mono', monospace" };

  // ── LAYOUT ──
  return (
    <div style={{ ...f, background: "#05080F", minHeight: "100vh", display: "flex", flexDirection: "column", color: "#B8CCE0" }}>

      {/* TOP BAR */}
      <div style={{ height: 52, background: "#080C14", borderBottom: "1px solid #0F1E2E", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 24px", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 30, height: 30, background: "linear-gradient(135deg,#25D366,#128C7E)", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>💬</div>
          <span style={{ ...f, fontWeight: 800, fontSize: 15, color: "#fff", letterSpacing: "-0.3px" }}>WA AI Agent</span>
          <span style={{ fontSize: 10, color: "#2A4A6A", ...mono }}>× CLAUDE</span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {/* Working hours indicator */}
          <div style={{ display: "flex", alignItems: "center", gap: 6, background: "#0A1520", border: "1px solid #1A2E44", borderRadius: 20, padding: "4px 12px" }}>
            <span style={{ fontSize: 10, color: "#5A7A9A" }}>JAM KERJA</span>
            <span style={{ fontSize: 11, fontWeight: 700, color: stats.isWorkingHours ? "#00C966" : "#9B6DFF" }}>
              {stats.isWorkingHours ? "CS AKTIF" : "AI AKTIF"}
            </span>
          </div>

          {/* Agent toggle */}
          <div
            onClick={() => setAgentOn(v => !v)}
            style={{ display: "flex", alignItems: "center", gap: 8, background: agentOn ? "#0A2018" : "#1A0A0A", border: `1px solid ${agentOn ? "#00C96633" : "#FF444433"}`, borderRadius: 20, padding: "5px 14px", cursor: "pointer", transition: "all .3s" }}
          >
            <div style={{ position: "relative", width: 8, height: 8 }}>
              <div style={{ position: "absolute", inset: 0, borderRadius: "50%", background: agentOn ? "#00C966" : "#FF4444", animation: agentOn ? "ping 2s infinite" : "none", opacity: .4 }} />
              <div style={{ position: "absolute", inset: 0, borderRadius: "50%", background: agentOn ? "#00C966" : "#FF4444" }} />
            </div>
            <span style={{ fontSize: 11, fontWeight: 700, color: agentOn ? "#00C966" : "#FF4444" }}>
              {agentOn ? "AGENT ON" : "AGENT OFF"}
            </span>
          </div>
        </div>
      </div>

      {/* BODY */}
      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>

        {/* SIDEBAR NAV */}
        <div style={{ width: 56, background: "#080C14", borderRight: "1px solid #0F1E2E", display: "flex", flexDirection: "column", alignItems: "center", paddingTop: 12, gap: 4, flexShrink: 0 }}>
          {[
            { id: "dashboard", icon: "◈",  label: "Dashboard" },
            { id: "inbox",     icon: "⌨",  label: "Inbox" },
            { id: "broadcast", icon: "⊕",  label: "Broadcast" },
            { id: "pixel",     icon: "◎",  label: "Meta Pixel" },
            { id: "settings",  icon: "⚙",  label: "Settings" },
          ].map(n => (
            <div
              key={n.id}
              title={n.label}
              onClick={() => setTab(n.id)}
              style={{ width: 40, height: 40, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, cursor: "pointer", background: tab === n.id ? "#0D1E30" : "transparent", color: tab === n.id ? "#00AAFF" : "#3A5A7A", border: tab === n.id ? "1px solid #00AAFF22" : "1px solid transparent", transition: "all .2s" }}
            >
              {n.icon}
            </div>
          ))}
        </div>

        {/* MAIN CONTENT */}
        <div style={{ flex: 1, overflow: "auto", padding: 20, display: "flex", flexDirection: "column", gap: 16 }}>

          {/* ── DASHBOARD ── */}
          {tab === "dashboard" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 16, animation: "fadeUp .3s ease" }}>
              {/* Stats */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12 }}>
                {[
                  { label: "Total Leads",    val: stats.totalLeads,     color: "#00AAFF", icon: "🎯", sub: "dari Meta Ads" },
                  { label: "Pembelian",      val: stats.totalPurchases, color: "#00C966", icon: "💰", sub: `${Math.round(stats.totalPurchases/stats.totalLeads*100)}% konversi` },
                  { label: "AI Replies",     val: stats.aiReplies,      color: "#9B6DFF", icon: "🤖", sub: "otomatis malam" },
                  { label: "Pesan Hari Ini", val: stats.todayMessages,  color: "#FFB800", icon: "📩", sub: "masuk hari ini" },
                  { label: "Mode Sekarang",  val: stats.isWorkingHours ? "CS" : "AI", color: stats.isWorkingHours ? "#00C966" : "#9B6DFF", icon: stats.isWorkingHours ? "👤" : "🤖", sub: stats.isWorkingHours ? `s/d ${workEnd}:00 WIB` : `s/d ${workStart}:00 WIB` },
                ].map(st => (
                  <div key={st.label} style={{ background: "#080C14", border: `1px solid ${st.color}22`, borderRadius: 10, padding: "14px 16px", position: "relative", overflow: "hidden" }}>
                    <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: st.color }} />
                    <div style={{ fontSize: 20, marginBottom: 6 }}>{st.icon}</div>
                    <div style={{ ...mono, fontSize: 24, fontWeight: 700, color: st.color, lineHeight: 1 }}>{st.val}</div>
                    <div style={{ fontSize: 11, color: "#5A7A9A", marginTop: 4, fontWeight: 600 }}>{st.label}</div>
                    <div style={{ fontSize: 10, color: "#3A5570", marginTop: 2 }}>{st.sub}</div>
                  </div>
                ))}
              </div>

              {/* Recent logs preview */}
              <div style={{ background: "#080C14", border: "1px solid #0F1E2E", borderRadius: 10, overflow: "hidden" }}>
                <div style={{ padding: "12px 16px", borderBottom: "1px solid #0F1E2E", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span style={{ fontWeight: 700, fontSize: 13, color: "#fff" }}>Aktivitas Terbaru</span>
                  <button onClick={() => setTab("pixel")} style={{ fontSize: 11, color: "#00AAFF", background: "none", border: "none", cursor: "pointer" }}>Lihat semua →</button>
                </div>
                {logs.slice(0, 6).map(l => {
                  const c = LOG_COLOR[l.type] || LOG_COLOR.incoming;
                  return (
                    <div key={l.id} style={{ padding: "10px 16px", borderBottom: "1px solid #080C14", display: "flex", alignItems: "center", gap: 10 }}>
                      <div style={{ width: 28, height: 28, borderRadius: 6, background: c.bg, border: `1px solid ${c.border}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, flexShrink: 0 }}>{c.icon}</div>
                      <div style={{ flex: 1, fontSize: 12, color: "#7A9AB8" }}>{l.message}</div>
                      <div style={{ ...mono, fontSize: 10, color: "#3A5570", flexShrink: 0 }}>{fmtTime(l.time)}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── INBOX ── */}
          {tab === "inbox" && (
            <div style={{ display: "grid", gridTemplateColumns: "280px 1fr", gap: 12, animation: "fadeUp .3s ease", height: "calc(100vh - 130px)" }}>
              {/* Conversation list */}
              <div style={{ background: "#080C14", border: "1px solid #0F1E2E", borderRadius: 10, display: "flex", flexDirection: "column", overflow: "hidden" }}>
                <div style={{ padding: "12px 14px", borderBottom: "1px solid #0F1E2E", fontWeight: 700, fontSize: 13, color: "#fff" }}>
                  Percakapan <span style={{ ...mono, fontSize: 11, color: "#3A5570", fontWeight: 400, marginLeft: 4 }}>({convs.length})</span>
                </div>
                <div style={{ overflow: "auto", flex: 1 }}>
                  {convs.map(c => (
                    <div
                      key={c.phone}
                      onClick={() => selectConv(c)}
                      style={{ padding: "11px 14px", borderBottom: "1px solid #0A1220", cursor: "pointer", background: selected?.phone === c.phone ? "#0A1828" : "transparent", borderLeft: `3px solid ${selected?.phone === c.phone ? "#00AAFF" : c.isPurchase ? "#00C966" : "transparent"}`, transition: "all .15s" }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 3 }}>
                        <span style={{ fontWeight: 700, fontSize: 13, color: "#D0E4F4" }}>{c.name}</span>
                        <span style={{ ...mono, fontSize: 10, color: "#3A5570" }}>{relTime(c.lastSeen)}</span>
                      </div>
                      <div style={{ fontSize: 11, color: "#5A7A9A", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginBottom: 4 }}>{c.lastMessage}</div>
                      <div style={{ display: "flex", gap: 4 }}>
                        {c.isLead && <span style={{ fontSize: 9, padding: "2px 6px", borderRadius: 3, background: "#00AAFF11", color: "#00AAFF", fontWeight: 700 }}>LEAD</span>}
                        {c.isPurchase && <span style={{ fontSize: 9, padding: "2px 6px", borderRadius: 3, background: "#00C96611", color: "#00C966", fontWeight: 700 }}>PURCHASE</span>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Chat detail */}
              <div style={{ background: "#080C14", border: "1px solid #0F1E2E", borderRadius: 10, display: "flex", flexDirection: "column", overflow: "hidden" }}>
                {selected && (
                  <>
                    <div style={{ padding: "12px 16px", borderBottom: "1px solid #0F1E2E", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 14, color: "#fff" }}>{selected.name}</div>
                        <div style={{ ...mono, fontSize: 11, color: "#3A5570" }}>{selected.phone}</div>
                      </div>
                      <div style={{ display: "flex", gap: 6 }}>
                        {selected.isLead && <span style={{ fontSize: 10, padding: "3px 8px", borderRadius: 4, background: "#00AAFF11", color: "#00AAFF", fontWeight: 700 }}>🎯 LEAD</span>}
                        {selected.isPurchase && <span style={{ fontSize: 10, padding: "3px 8px", borderRadius: 4, background: "#00C96611", color: "#00C966", fontWeight: 700 }}>💰 PURCHASE</span>}
                      </div>
                    </div>

                    {/* Messages */}
                    <div style={{ flex: 1, overflow: "auto", padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
                      {history.map((m, i) => {
                        const isAI = m.role === "assistant";
                        return (
                          <div key={i} style={{ display: "flex", justifyContent: isAI ? "flex-start" : "flex-end" }}>
                            <div style={{ maxWidth: "72%", padding: "9px 13px", borderRadius: isAI ? "4px 12px 12px 12px" : "12px 4px 12px 12px", background: isAI ? "#0D1E14" : "#0A1828", border: `1px solid ${isAI ? "#00C96622" : "#00AAFF22"}`, fontSize: 13, color: "#C8DCF0", lineHeight: 1.6, animation: "fadeUp .2s ease" }}>
                              {isAI && <div style={{ fontSize: 9, color: m.content.startsWith("[CS]") ? "#FF6B6B" : "#00C966", fontWeight: 700, marginBottom: 4, letterSpacing: "1px" }}>{m.content.startsWith("[CS]") ? "👤 CS MANUAL" : "🤖 AI AGENT"}</div>}
                              {m.content.replace("[CS] ", "")}
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Reply box */}
                    <div style={{ padding: "12px 16px", borderTop: "1px solid #0F1E2E", display: "flex", gap: 8 }}>
                      <input
                        value={replyText}
                        onChange={e => setReplyText(e.target.value)}
                        onKeyDown={e => e.key === "Enter" && sendReply()}
                        placeholder="Balas sebagai CS..."
                        style={{ flex: 1, background: "#050810", border: "1px solid #1A2E44", borderRadius: 8, padding: "9px 12px", color: "#C8DCF0", fontSize: 13, ...f, outline: "none" }}
                      />
                      <button onClick={sendReply} style={{ padding: "9px 18px", background: "#00AAFF", border: "none", borderRadius: 8, color: "#05080F", fontWeight: 700, fontSize: 13, cursor: "pointer", ...f }}>Kirim</button>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}

          {/* ── BROADCAST ── */}
          {tab === "broadcast" && (
            <div style={{ animation: "fadeUp .3s ease" }}>
              <div style={{ background: "#080C14", border: "1px solid #0F1E2E", borderRadius: 10, overflow: "hidden" }}>
                <div style={{ padding: "14px 18px", borderBottom: "1px solid #0F1E2E", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontWeight: 700, fontSize: 14, color: "#fff" }}>Broadcast Manager</span>
                  <button onClick={() => setBcModal(true)} style={{ padding: "7px 16px", background: "#00AAFF", border: "none", borderRadius: 7, color: "#05080F", fontWeight: 700, fontSize: 12, cursor: "pointer", ...f }}>+ Buat Broadcast</button>
                </div>

                {/* Scheduled broadcasts */}
                <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
                  {[
                    { name: "Promo Hari Raya", target: "Semua kontak", count: convs.length, time: "Senin, 09:00 WIB", status: "scheduled" },
                    { name: "Follow-up Leads Belum Beli", target: "Leads belum purchase", count: convs.filter(c => !c.isPurchase).length, time: "Selasa, 10:00 WIB", status: "scheduled" },
                    { name: "Thank You Pembeli", target: "Sudah purchase", count: convs.filter(c => c.isPurchase).length, time: "Kemarin, 09:00", status: "done" },
                  ].map((b, i) => (
                    <div key={i} style={{ background: "#050810", border: "1px solid #0F1E2E", borderRadius: 8, padding: "13px 16px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 13, color: "#D0E4F4", marginBottom: 4 }}>{b.name}</div>
                        <div style={{ fontSize: 11, color: "#5A7A9A" }}>{b.target} · {b.count} kontak · {b.time}</div>
                      </div>
                      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                        <span style={{ fontSize: 10, padding: "3px 8px", borderRadius: 4, background: b.status === "done" ? "#00C96611" : "#FFB80011", color: b.status === "done" ? "#00C966" : "#FFB800", fontWeight: 700 }}>{b.status === "done" ? "SELESAI" : "TERJADWAL"}</span>
                        {b.status !== "done" && <button style={{ padding: "5px 12px", background: "none", border: "1px solid #FF444444", borderRadius: 6, color: "#FF4444", fontSize: 11, cursor: "pointer", ...f }}>Batal</button>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ── META PIXEL ── */}
          {tab === "pixel" && (
            <div style={{ animation: "fadeUp .3s ease", display: "flex", flexDirection: "column", gap: 14 }}>
              {/* Pixel stats */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
                {[
                  { label: "Lead Events",              val: logs.filter(l => l.type === "lead").length,              color: "#00AAFF", icon: "🎯" },
                  { label: "InitiateCheckout Events",  val: logs.filter(l => l.type === "initiate_checkout").length, color: "#FFB800", icon: "🛒" },
                  { label: "Purchase Events",          val: logs.filter(l => l.type === "purchase").length,          color: "#00C966", icon: "💰" },
                ].map(st => (
                  <div key={st.label} style={{ background: "#080C14", border: `1px solid ${st.color}22`, borderRadius: 10, padding: "14px 16px" }}>
                    <div style={{ fontSize: 22, marginBottom: 6 }}>{st.icon}</div>
                    <div style={{ ...mono, fontSize: 28, fontWeight: 700, color: st.color }}>{st.val}</div>
                    <div style={{ fontSize: 11, color: "#5A7A9A", marginTop: 4, fontWeight: 600 }}>{st.label}</div>
                    <div style={{ fontSize: 10, color: "#3A5570", marginTop: 2 }}>Dikirim ke Conversions API</div>
                  </div>
                ))}
              </div>

              {/* Log filter */}
              <div style={{ background: "#080C14", border: "1px solid #0F1E2E", borderRadius: 10, overflow: "hidden" }}>
                <div style={{ padding: "12px 16px", borderBottom: "1px solid #0F1E2E", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <span style={{ fontWeight: 700, fontSize: 13, color: "#fff", marginRight: 4 }}>Event Log</span>
                  {["all", "lead", "initiate_checkout", "purchase", "ai_reply", "cs_notify", "broadcast"].map(f => (
                    <button
                      key={f}
                      onClick={() => setFilterLog(f)}
                      style={{ padding: "3px 10px", borderRadius: 20, fontSize: 10, fontWeight: 700, cursor: "pointer", border: `1px solid ${filterLog === f ? "#00AAFF" : "#1A2E44"}`, background: filterLog === f ? "#00AAFF22" : "transparent", color: filterLog === f ? "#00AAFF" : "#5A7A9A", ...f }}
                    >
                      {f === "all" ? "SEMUA" : f.toUpperCase().replace("_", " ")}
                    </button>
                  ))}
                </div>
                <div style={{ overflow: "auto", maxHeight: 400 }}>
                  {filteredLogs.map(l => {
                    const c = LOG_COLOR[l.type] || LOG_COLOR.incoming;
                    return (
                      <div key={l.id} style={{ padding: "10px 16px", borderBottom: "1px solid #080C14", display: "flex", alignItems: "center", gap: 10 }}>
                        <div style={{ width: 30, height: 30, borderRadius: 7, background: c.bg, border: `1px solid ${c.border}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, flexShrink: 0 }}>{c.icon}</div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 12, color: "#A0BCD0" }}>{l.message}</div>
                        </div>
                        <div style={{ ...mono, fontSize: 10, color: "#3A5570", flexShrink: 0 }}>{fmtTime(l.time)}</div>
                        <span style={{ fontSize: 9, padding: "2px 7px", borderRadius: 3, background: c.bg, color: c.text, fontWeight: 700, flexShrink: 0 }}>{l.type.toUpperCase().replace("_", " ")}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* ── SETTINGS ── */}
          {tab === "settings" && (
            <div style={{ animation: "fadeUp .3s ease", display: "flex", flexDirection: "column", gap: 14, maxWidth: 680 }}>
              {/* AI Prompt */}
              <div style={{ background: "#080C14", border: "1px solid #0F1E2E", borderRadius: 10, overflow: "hidden" }}>
                <div style={{ padding: "13px 18px", borderBottom: "1px solid #0F1E2E", fontWeight: 700, fontSize: 13, color: "#fff" }}>🤖 System Prompt AI Agent</div>
                <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
                  <textarea
                    value={prompt}
                    onChange={e => setPrompt(e.target.value)}
                    rows={6}
                    style={{ width: "100%", background: "#050810", border: "1px solid #1A2E44", borderRadius: 8, padding: "10px 12px", color: "#C8DCF0", fontSize: 12, ...mono, outline: "none", resize: "vertical", lineHeight: 1.7 }}
                  />
                  <button style={{ alignSelf: "flex-start", padding: "8px 18px", background: "#00AAFF", border: "none", borderRadius: 7, color: "#05080F", fontWeight: 700, fontSize: 12, cursor: "pointer", ...f }}>Simpan Prompt</button>
                </div>
              </div>

              {/* Jam Kerja */}
              <div style={{ background: "#080C14", border: "1px solid #0F1E2E", borderRadius: 10, overflow: "hidden" }}>
                <div style={{ padding: "13px 18px", borderBottom: "1px solid #0F1E2E", fontWeight: 700, fontSize: 13, color: "#fff" }}>⏰ Jadwal CS vs AI</div>
                <div style={{ padding: 16, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                  {[
                    { label: "Jam Mulai CS (WIB)", val: workStart, set: setWorkStart },
                    { label: "Jam Selesai CS (WIB)", val: workEnd, set: setWorkEnd },
                  ].map(({ label, val, set }) => (
                    <div key={label}>
                      <div style={{ fontSize: 10, color: "#5A7A9A", marginBottom: 6, fontWeight: 600, letterSpacing: "1px" }}>{label.toUpperCase()}</div>
                      <input
                        type="number" min="0" max="23"
                        value={val}
                        onChange={e => set(e.target.value)}
                        style={{ width: "100%", background: "#050810", border: "1px solid #1A2E44", borderRadius: 8, padding: "9px 12px", color: "#C8DCF0", fontSize: 13, ...mono, outline: "none" }}
                      />
                    </div>
                  ))}
                </div>
                <div style={{ padding: "0 16px 14px", fontSize: 12, color: "#3A5570" }}>
                  Saat ini: CS aktif {workStart}:00–{workEnd}:00 WIB · AI aktif {workEnd}:00–{workStart}:00 WIB (jam berikutnya)
                </div>
              </div>

              {/* Config */}
              <div style={{ background: "#080C14", border: "1px solid #0F1E2E", borderRadius: 10, overflow: "hidden" }}>
                <div style={{ padding: "13px 18px", borderBottom: "1px solid #0F1E2E", fontWeight: 700, fontSize: 13, color: "#fff" }}>⚙️ Konfigurasi API</div>
                <div style={{ padding: 16, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  {[
                    ["Model AI", "claude-sonnet-4-20250514"],
                    ["Max Token / Balasan", "500"],
                    ["Delay Balas (detik)", "1.2"],
                    ["Bahasa Default", "Bahasa Indonesia"],
                    ["Fallback ke CS", "Aktif"],
                    ["History Context", "10 pesan terakhir"],
                  ].map(([label, val]) => (
                    <div key={label}>
                      <div style={{ fontSize: 10, color: "#5A7A9A", marginBottom: 5, fontWeight: 600, letterSpacing: "1px" }}>{label.toUpperCase()}</div>
                      <input
                        defaultValue={val}
                        style={{ width: "100%", background: "#050810", border: "1px solid #1A2E44", borderRadius: 7, padding: "8px 11px", color: "#C8DCF0", fontSize: 12, ...mono, outline: "none" }}
                      />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* BROADCAST MODAL */}
      {bcModal && (
        <div style={{ position: "fixed", inset: 0, background: "#000C", zIndex: 999, display: "flex", alignItems: "center", justifyContent: "center" }} onClick={() => setBcModal(false)}>
          <div style={{ background: "#0A1220", border: "1px solid #1A2E44", borderRadius: 12, padding: 28, width: 500, display: "flex", flexDirection: "column", gap: 16, animation: "fadeUp .2s ease" }} onClick={e => e.stopPropagation()}>
            <div style={{ fontWeight: 800, fontSize: 16, color: "#fff" }}>📡 Buat Broadcast Baru</div>

            <div>
              <div style={{ fontSize: 10, color: "#5A7A9A", marginBottom: 6, fontWeight: 600, letterSpacing: "1px" }}>NAMA BROADCAST</div>
              <input value={bcName} onChange={e => setBcName(e.target.value)} placeholder="cth: Promo Lebaran 2025" style={{ width: "100%", background: "#050810", border: "1px solid #1A2E44", borderRadius: 8, padding: "9px 12px", color: "#C8DCF0", fontSize: 13, ...f, outline: "none" }} />
            </div>

            <div>
              <div style={{ fontSize: 10, color: "#5A7A9A", marginBottom: 6, fontWeight: 600, letterSpacing: "1px" }}>TARGET PENERIMA</div>
              <div style={{ display: "flex", gap: 8 }}>
                {[["all", "Semua Kontak"], ["leads", "Leads Belum Beli"], ["buyers", "Pembeli"]].map(([v, label]) => (
                  <div key={v} onClick={() => setBcTarget(v)} style={{ flex: 1, padding: "8px 10px", borderRadius: 7, border: `1px solid ${bcTarget === v ? "#00AAFF" : "#1A2E44"}`, background: bcTarget === v ? "#00AAFF11" : "#050810", color: bcTarget === v ? "#00AAFF" : "#5A7A9A", fontSize: 11, fontWeight: 700, cursor: "pointer", textAlign: "center" }}>{label}</div>
                ))}
              </div>
            </div>

            <div>
              <div style={{ fontSize: 10, color: "#5A7A9A", marginBottom: 6, fontWeight: 600, letterSpacing: "1px" }}>PESAN</div>
              <textarea value={bcMsg} onChange={e => setBcMsg(e.target.value)} rows={4} placeholder="Tulis pesan broadcast..." style={{ width: "100%", background: "#050810", border: "1px solid #1A2E44", borderRadius: 8, padding: "10px 12px", color: "#C8DCF0", fontSize: 13, ...f, outline: "none", resize: "none" }} />
            </div>

            <div>
              <div style={{ fontSize: 10, color: "#5A7A9A", marginBottom: 6, fontWeight: 600, letterSpacing: "1px" }}>JADWAL KIRIM</div>
              <input type="datetime-local" style={{ width: "100%", background: "#050810", border: "1px solid #1A2E44", borderRadius: 8, padding: "9px 12px", color: "#C8DCF0", fontSize: 13, ...mono, outline: "none" }} />
            </div>

            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button onClick={() => setBcModal(false)} style={{ padding: "9px 18px", background: "none", border: "1px solid #1A2E44", borderRadius: 7, color: "#5A7A9A", fontWeight: 600, fontSize: 13, cursor: "pointer", ...f }}>Batal</button>
              <button onClick={sendBroadcast} style={{ padding: "9px 20px", background: "#00AAFF", border: "none", borderRadius: 7, color: "#05080F", fontWeight: 700, fontSize: 13, cursor: "pointer", ...f }}>Jadwalkan →</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
