// FlowState dashboard — consumes the SSE stream and renders everything.
const $ = (id) => document.getElementById(id);
const GAUGE_CIRC = 2 * Math.PI * 92; // matches r=92 in the SVG

// ---- color helpers ----------------------------------------------------------
function focusColor(score) {
  // warm neutral orange -> white
  if (score >= 50) {
    const t = (score - 50) / 50;
    return mix([205, 135, 90], [255, 255, 255], t);
  }
  const t = score / 50;
  return mix([95, 75, 65], [205, 135, 90], t);
}
function mix(a, b, t) {
  const c = a.map((v, i) => Math.round(v + (b[i] - v) * t));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

// ---- waveform canvas --------------------------------------------------------
const canvas = $("wave");
const ctx = canvas.getContext("2d");
const bandsCanvas = $("bands-chart");
const bandsCtx = bandsCanvas ? bandsCanvas.getContext("2d") : null;
let waveData = [];
let bandHistory = [];
const MAX_HISTORY = 150;

function resizeCanvas() {
  const dpr = window.devicePixelRatio || 1;
  const r = canvas.getBoundingClientRect();
  canvas.width = r.width * dpr;
  canvas.height = r.height * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  if (bandsCanvas) {
    const br = bandsCanvas.getBoundingClientRect();
    bandsCanvas.width = br.width * dpr;
    bandsCanvas.height = br.height * dpr;
    bandsCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
}
window.addEventListener("resize", resizeCanvas);

function drawWave() {
  const w = canvas.clientWidth, h = canvas.clientHeight;
  ctx.clearRect(0, 0, w, h);

  // midline
  ctx.strokeStyle = "rgba(255,255,255,0.06)";
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(0, h / 2); ctx.lineTo(w, h / 2); ctx.stroke();

  const n = waveData.length;
  if (n > 1) {
    let maxAbs = 1e-9;
    for (const v of waveData) maxAbs = Math.max(maxAbs, Math.abs(v));
    
    // -- Dashboard Wave --
    const amp = (h / 2) * 0.82 / maxAbs;
    const grad = ctx.createLinearGradient(0, 0, w, 0);
    grad.addColorStop(0, "rgba(255,255,255,0.05)");
    grad.addColorStop(1, "rgba(255,255,255,0.5)");
    ctx.strokeStyle = grad;
    ctx.lineWidth = 2;
    ctx.lineJoin = "round";
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const x = (i / (n - 1)) * w;
      const y = h / 2 - waveData[i] * amp;
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  drawBandsChart();
  requestAnimationFrame(drawWave);
}

function drawBandsChart() {
  if (!bandsCtx) return;
  const w = bandsCanvas.clientWidth, h = bandsCanvas.clientHeight;
  bandsCtx.clearRect(0, 0, w, h);

  // draw horizontal grid lines
  bandsCtx.strokeStyle = "rgba(255,255,255,0.04)";
  bandsCtx.lineWidth = 1;
  for (let i = 1; i <= 3; i++) {
    const y = h - (h * i * 0.25);
    bandsCtx.beginPath();
    bandsCtx.moveTo(0, y);
    bandsCtx.lineTo(w, y);
    bandsCtx.stroke();
  }

  const n = bandHistory.length;
  if (n < 2) return;

  // auto-scale dynamically
  let maxVal = 0.25;
  for (const p of bandHistory) {
    maxVal = Math.max(maxVal, p.alpha, p.beta, p.gamma);
  }
  maxVal *= 1.1; // 10% headroom

  drawBandLine("alpha", "#8aa2b3", maxVal);
  drawBandLine("beta", "#95a494", maxVal);
  drawBandLine("gamma", "#c6a296", maxVal);
}

function drawBandLine(key, color, maxVal) {
  const w = bandsCanvas.clientWidth, h = bandsCanvas.clientHeight;
  const n = bandHistory.length;

  bandsCtx.strokeStyle = color;
  bandsCtx.lineWidth = 2.5;
  bandsCtx.lineJoin = "round";
  bandsCtx.lineCap = "round";

  bandsCtx.shadowBlur = 6;
  bandsCtx.shadowColor = color + "40";

  bandsCtx.beginPath();
  for (let i = 0; i < n; i++) {
    const x = (i / (MAX_HISTORY - 1)) * w;
    const val = bandHistory[i][key];
    const y = h - (val / maxVal) * h;
    i === 0 ? bandsCtx.moveTo(x, y) : bandsCtx.lineTo(x, y);
  }
  bandsCtx.stroke();
  bandsCtx.shadowBlur = 0;
}

// ---- render a packet --------------------------------------------------------
function render(p) {
  // focus gauge
  const score = (p.focus ?? 0);
  $("focus-num").textContent = p.ready ? Math.round(score) : "--";
  $("focus-state").textContent = stateLabel(p);
  const col = focusColor(score);
  const arc = $("gauge-arc");
  arc.style.strokeDashoffset = GAUGE_CIRC * (1 - score / 100);
  arc.style.stroke = col;
  arc.style.filter = `drop-shadow(0 0 8px ${col})`;
  $("focus-num").style.color = p.ready ? col : "var(--ink-faint)";

  // waveform
  if (Array.isArray(p.wave)) waveData = p.wave;

  // engagement readout
  $("eng-readout").textContent = p.ready ? `engagement ${(p.engagement ?? 0).toFixed(2)}` : "engagement —";

  // append band powers to rolling history
  if (p.ready) {
    const br = p.band_rel || {};
    bandHistory.push({
      alpha: br.alpha ?? 0,
      beta: br.beta ?? 0,
      gamma: br.gamma ?? 0
    });
    if (bandHistory.length > MAX_HISTORY) {
      bandHistory.shift();
    }
  }

  // chips
  setChip("chip-source", `source: ${shortSource(p.source)}`, p.source && p.source !== "none" ? "ok" : "muted");
  setQuality(p.quality);
  setMode(p);
  setCalib(p);
  updateSessionUI(p.session);

  // alert banner + nudges (fire only on state transitions)
  $("alert-banner").classList.toggle("hidden", !p.alert);
  if (p.alert && !prevAlert) {
    onZoneOut();
    zoneOutStartTime = Date.now();
  } else if (p.alert && prevAlert) {
    if (zoneOutStartTime && !sirenPlaying && (Date.now() - zoneOutStartTime > 7000)) {
      startSiren();
    }
  } else if (!p.alert && prevAlert) {
    onRecover();
    zoneOutStartTime = null;
    stopSiren();
  }
  prevAlert = p.alert;

  // source error surfacing
  if (p.source_error) $("source-msg").textContent = "⚠ " + p.source_error;
}

function setMode(p) {
  const c = p.classifier || {};
  let text = "model: relative", cls = "muted";
  if (p.score_mode === "ml") { text = `model: ML ${Math.round((c.accuracy || 0) * 100)}%`; cls = "ok"; }
  else if (p.score_mode === "calibrated") { text = "model: calibrated"; cls = "ok"; }
  setChip("chip-mode", text, cls);
}

function stateLabel(p) {
  if (!p.ready) return `warming up ${p.progress ? "(" + Math.round(p.progress) + "%)" : ""}`;
  if (p.state === "calibrating") return `calibrating ${p.calib_label || ""} ${p.calib_remaining ? Math.ceil(p.calib_remaining) + "s" : ""}`;
  return { focused: "focused", dipping: "drifting", zoning: "zoned out" }[p.state] || p.state;
}
function shortSource(s) {
  if (!s || s === "none") return "—";
  if (s.startsWith("CSV")) return "CSV demo";
  if (s.startsWith("Serial")) return "live";
  return s;
}
function setChip(id, text, cls) {
  const el = $(id);
  if (!el) return;
  el.textContent = "";
  if (cls === "ok" || cls === "warn" || cls === "bad") {
    const led = document.createElement("span"); led.className = "led"; el.appendChild(led);
  }
  el.appendChild(document.createTextNode(text));
  el.className = "chip " + (cls === "muted" ? "chip-muted" : cls);
}
function setQuality(q) {
  const map = { good: ["signal: good", "ok"], fair: ["signal: fair", "warn"],
                noisy: ["signal: noisy", "bad"], warmup: ["signal: —", "muted"] };
  const [t, c] = map[q] || ["signal: —", "muted"];
  setChip("chip-quality", t, c);
}
function setCalib(p) {
  if (p.calibrating) {
    setChip("chip-calib", "calibrating…", "warn");
    $("calib-status").textContent =
      `Recording your "${p.calib_label}" state — ${Math.ceil(p.calib_remaining || 0)}s left. Hold that state.`;
  } else if (p.classifier && p.classifier.trained) {
    const c = p.classifier;
    setChip("chip-calib", "ML calibrated", "ok");
    $("calib-status").textContent =
      `ML model trained — ${Math.round((c.accuracy || 0) * 100)}% accuracy on ` +
      `${(c.n_focused || 0) + (c.n_zoned || 0)} windows. Score is your live focus ` +
      `probability. Re-record either state to retrain.`;
  } else if (p.calibrated) {
    setChip("chip-calib", "calibrated", "ok");
    $("calib-status").textContent = "Calibrated — score maps between your baselines. Record both states to upgrade to the ML model.";
  } else {
    setChip("chip-calib", "uncalibrated", "muted");
    $("calib-status").textContent =
      "Not calibrated — score is relative to recent activity. Run both steps for a personalised score.";
  }
  const busy = !!p.calibrating;
  $("btn-focused").disabled = busy;
  $("btn-zoned").disabled = busy;
  $("btn-cancel").disabled = !busy;
}

// ---- nudges (audio + desktop notification) ----------------------------------
let nudgeOn = false;
let prevAlert = false;
let audioCtx = null;
let zoneOutStartTime = null;
let sirenPlaying = false;
let sirenInterval = null;

function ensureAudio() {
  if (!audioCtx) {
    try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch (_) {}
  }
  if (audioCtx && audioCtx.state === "suspended") audioCtx.resume();
}
function tone(freq, startAt, dur, peak = 0.18, type = "sine") {
  if (!audioCtx) return;
  const o = audioCtx.createOscillator(), g = audioCtx.createGain();
  o.type = type; o.frequency.value = freq;
  o.connect(g); g.connect(audioCtx.destination);
  const t0 = audioCtx.currentTime + startAt;
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(peak, t0 + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.start(t0); o.stop(t0 + dur + 0.03);
}
const playDrift = () => { ensureAudio(); tone(440, 0, 0.18); tone(294, 0.16, 0.32); };   // descending = uh-oh
const playRecover = () => { ensureAudio(); tone(523, 0, 0.13); tone(784, 0.11, 0.22); };  // ascending = nice

function playSirenTone() {
  ensureAudio();
  tone(580, 0, 0.4, 0.2, "square");
  tone(435, 0.4, 0.4, 0.2, "square");
}

function startSiren() {
  if (!nudgeOn) return;
  sirenPlaying = true;
  playSirenTone();
  sirenInterval = setInterval(playSirenTone, 800);
}

function stopSiren() {
  sirenPlaying = false;
  if (sirenInterval) {
    clearInterval(sirenInterval);
    sirenInterval = null;
  }
}

function notify(title, body) {
  if ("Notification" in window && Notification.permission === "granted") {
    try { new Notification(title, { body, silent: true }); } catch (_) {}
  }
}

function onZoneOut() {
  if (!nudgeOn) return;
  playDrift();
  notify("FlowState", "You're zoning out — refocus.");
  if (navigator.vibrate) navigator.vibrate([120, 60, 120]);
}
function onRecover() {
  if (!nudgeOn) return;
  playRecover();
}

$("btn-nudge").onclick = async () => {
  if (!nudgeOn) {
    ensureAudio();
    if ("Notification" in window && Notification.permission === "default") {
      try { await Notification.requestPermission(); } catch (_) {}
    }
    nudgeOn = true;
    $("btn-nudge").textContent = "🔔 Nudges on";
    $("btn-nudge").classList.add("on");
    tone(660, 0, 0.12);  // confirmation beep
    const note = ("Notification" in window && Notification.permission === "granted")
      ? "Sound + desktop notification when you zone out."
      : "Sound alert on. (Allow notifications for desktop pop-ups too.)";
    $("nudge-msg").textContent = note;
  } else {
    nudgeOn = false;
    $("btn-nudge").textContent = "🔕 Enable nudges";
    $("btn-nudge").classList.remove("on");
    $("nudge-msg").textContent = "";
  }
};

// ---- SSE --------------------------------------------------------------------
function connect() {
  const es = new EventSource("/stream");
  es.onopen = () => setChip("chip-conn", "live", "ok");
  es.onerror = () => setChip("chip-conn", "reconnecting…", "bad");
  es.onmessage = (e) => { try { render(JSON.parse(e.data)); } catch (_) {} };
}

// ---- actions ----------------------------------------------------------------
async function post(url, body) {
  const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" },
                              body: JSON.stringify(body || {}) });
  return r.json();
}
$("btn-focused").onclick = () => post("/api/calibrate", { label: "focused", seconds: 60 });
$("btn-zoned").onclick = () => post("/api/calibrate", { label: "zoned", seconds: 60 });
$("btn-cancel").onclick = () => post("/api/calibrate/cancel");
$("btn-reset").onclick = () => post("/api/calibrate/reset");

$("btn-csv").onclick = async () => {
  $("source-msg").textContent = "loading CSV…";
  const r = await post("/api/source", { kind: "csv" });
  $("source-msg").textContent = r.ok ? "Replaying " + r.source : "⚠ " + r.error;
};
$("btn-serial").onclick = async () => {
  const port = $("port-select").value;
  if (!port) { $("source-msg").textContent = "Pick a serial port first."; return; }
  $("source-msg").textContent = "connecting to " + port + "…";
  const r = await post("/api/source", { kind: "serial", port });
  $("source-msg").textContent = r.ok ? "Live: " + r.source : "⚠ " + r.error;
};

async function loadPorts() {
  try {
    const r = await fetch("/api/ports"); const { ports } = await r.json();
    const sel = $("port-select");
    for (const p of ports) {
      const o = document.createElement("option"); o.value = p; o.textContent = p; sel.appendChild(o);
    }
  } catch (_) {}
}

// ---- session ----------------------------------------------------------------
let sessionActive = false;
let sessionLockUntil = 0;  // ignore packet reconciliation right after a click

function fmtClock(sec) {
  sec = Math.max(0, Math.round(sec));
  const m = Math.floor(sec / 60), s = sec % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}
function fmtDuration(sec) {
  sec = Math.max(0, Math.round(sec));
  const m = Math.floor(sec / 60), s = sec % 60;
  return m ? `${m}m ${s}s` : `${s}s`;
}

function setSessionUI(active, elapsed) {
  sessionActive = active;
  $("btn-session").classList.toggle("recording", active);
  $("session-label").textContent = active ? "End session" : "Start session";
  const timer = $("session-timer");
  if (active) { timer.classList.remove("hidden"); timer.textContent = fmtClock(elapsed || 0); }
  else { timer.classList.add("hidden"); }
}

function updateSessionUI(sess) {
  if (!sess || Date.now() < sessionLockUntil) return;  // don't fight a recent click
  if (sess.active) setSessionUI(true, sess.elapsed);
  else if (sessionActive) setSessionUI(false);
}

$("btn-session").onclick = async () => {
  ensureAudio();
  if (!sessionActive) {
    setSessionUI(true, 0);                       // optimistic
    await post("/api/session/start");
  } else {
    sessionLockUntil = Date.now() + 1500;        // avoid flicker-back while server catches up
    setSessionUI(false);
    const r = await post("/api/session/stop");
    if (r && r.summary) showSummary(r.summary);
  }
};

$("summary-close").onclick = () => $("summary-overlay").classList.add("hidden");
$("summary-overlay").onclick = (e) => {
  if (e.target.id === "summary-overlay") $("summary-overlay").classList.add("hidden");
};

// ---- session summary --------------------------------------------------------
let lastSummary = null;

function showSummary(s) {
  lastSummary = s;
  $("stat-avg").textContent = Math.round(s.avg_focus ?? 0);
  $("stat-avg").style.color = focusColor(s.avg_focus ?? 0);
  $("stat-focused").textContent = `${Math.round(s.pct_focused ?? 0)}%`;
  $("stat-zone").textContent = s.zone_outs ?? 0;
  $("stat-streak").textContent = fmtClock(s.longest_streak ?? 0);
  $("summary-duration").textContent = `Duration · ${fmtDuration(s.duration ?? 0)}`;
  $("summary-insight").innerHTML = buildInsight(s);

  resetChat();

  $("summary-overlay").classList.remove("hidden");
  // canvas has zero layout while hidden — size & draw once it's visible
  requestAnimationFrame(() => requestAnimationFrame(() => drawSummaryChart(s.timeline || [])));
}

function buildInsight(s) {
  if (!s.n_samples) return "No data captured — start a session and let it run for a bit.";
  const avg = Math.round(s.avg_focus), pct = Math.round(s.pct_focused), z = s.zone_outs || 0;
  let verdict;
  if (pct >= 75) verdict = "a strong, sustained session";
  else if (pct >= 50) verdict = "a decent session with some drift";
  else verdict = "a scattered session — lots of drift";
  const lapses = z === 0 ? "no major lapses" : `${z} lapse${z > 1 ? "s" : ""}`;
  return `That was <strong>${verdict}</strong>. You averaged a focus score of ` +
    `<strong>${avg}</strong> and held focus <strong>${pct}%</strong> of the time, with ` +
    `<strong>${lapses}</strong>. Longest unbroken stretch: <strong>${fmtClock(s.longest_streak || 0)}</strong>.`;
}

function drawSummaryChart(timeline) {
  const cv = $("summary-chart");
  if (!cv) return;
  const dpr = window.devicePixelRatio || 1;
  const rect = cv.getBoundingClientRect();
  cv.width = rect.width * dpr; cv.height = rect.height * dpr;
  const c = cv.getContext("2d");
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  const w = rect.width, h = rect.height;
  c.clearRect(0, 0, w, h);

  const pad = { l: 26, r: 12, t: 12, b: 14 };
  const plotW = w - pad.l - pad.r, plotH = h - pad.t - pad.b;
  const yOf = (f) => pad.t + plotH * (1 - f / 100);

  // grid + y labels
  c.font = "10px 'JetBrains Mono', monospace";
  c.textAlign = "right"; c.textBaseline = "middle";
  [0, 50, 100].forEach((v) => {
    const y = yOf(v);
    c.strokeStyle = "rgba(255,255,255,0.05)"; c.lineWidth = 1;
    c.beginPath(); c.moveTo(pad.l, y); c.lineTo(w - pad.r, y); c.stroke();
    c.fillStyle = "rgba(255,255,255,0.3)"; c.fillText(v, pad.l - 6, y);
  });

  // zone-out threshold line at 45
  const yth = yOf(45);
  c.strokeStyle = "rgba(204,160,128,0.6)"; c.lineWidth = 1.5; c.setLineDash([5, 4]);
  c.beginPath(); c.moveTo(pad.l, yth); c.lineTo(w - pad.r, yth); c.stroke();
  c.setLineDash([]);

  const n = timeline.length;
  if (n < 2) return;
  const xOf = (i) => pad.l + plotW * (i / (n - 1));

  // area fill
  const grad = c.createLinearGradient(0, pad.t, 0, pad.t + plotH);
  grad.addColorStop(0, "rgba(255,255,255,0.18)");
  grad.addColorStop(1, "rgba(255,255,255,0.01)");
  c.beginPath();
  c.moveTo(xOf(0), yOf(timeline[0].f));
  for (let i = 1; i < n; i++) c.lineTo(xOf(i), yOf(timeline[i].f));
  c.lineTo(xOf(n - 1), pad.t + plotH); c.lineTo(xOf(0), pad.t + plotH); c.closePath();
  c.fillStyle = grad; c.fill();

  // focus line
  c.beginPath();
  c.moveTo(xOf(0), yOf(timeline[0].f));
  for (let i = 1; i < n; i++) c.lineTo(xOf(i), yOf(timeline[i].f));
  c.strokeStyle = "rgba(255,255,255,0.9)"; c.lineWidth = 2; c.lineJoin = "round"; c.stroke();
}

// ---- AI focus coach chat ----------------------------------------------------
let chatHistory = [];
let chatBusy = false;

function addBubble(role, text) {
  const el = document.createElement("div");
  el.className = `bubble ${role}`;
  el.textContent = text;
  $("chat-messages").appendChild(el);
  $("chat-messages").scrollTop = $("chat-messages").scrollHeight;
  return el;
}

function resetChat() {
  chatHistory = [];
  $("chat-messages").innerHTML = "";
  $("chat-suggest").style.display = "flex";
  addBubble("coach", "Nice work finishing. Ask me anything about this session — or tap a suggestion below.");
}

async function sendChat(text) {
  text = (text || "").trim();
  if (!text || chatBusy) return;
  chatBusy = true;
  $("chat-suggest").style.display = "none";
  $("chat-send").disabled = true;

  addBubble("user", text);
  chatHistory.push({ role: "user", content: text });
  $("chat-input").value = "";

  const typing = addBubble("coach", "");
  typing.classList.add("typing");
  typing.innerHTML = "<i></i><i></i><i></i>";

  try {
    const r = await post("/api/chat", { messages: chatHistory, summary: lastSummary });
    const reply = (r && r.reply) ? r.reply : "Sorry — I couldn't generate a reply.";
    typing.classList.remove("typing");
    typing.textContent = reply;
    chatHistory.push({ role: "assistant", content: reply });
    if (r && r.ai === false) $("coach-status").textContent = "offline fallback";
  } catch (e) {
    typing.classList.remove("typing");
    typing.textContent = "Connection error — is the server running?";
  } finally {
    chatBusy = false;
    $("chat-send").disabled = false;
    $("chat-messages").scrollTop = $("chat-messages").scrollHeight;
  }
}

$("chat-send").onclick = () => sendChat($("chat-input").value);
$("chat-input").addEventListener("keydown", (e) => { if (e.key === "Enter") sendChat($("chat-input").value); });
$("chat-suggest").addEventListener("click", (e) => {
  const chip = e.target.closest(".suggest-chip");
  if (chip) sendChat(chip.dataset.q);
});

async function loadCoachStatus() {
  try {
    const r = await fetch("/api/coach"); const { available } = await r.json();
    $("coach-status").textContent = available ? "powered by Gemini" : "offline (no API key)";
  } catch (_) {}
}

// ---- boot -------------------------------------------------------------------
resizeCanvas();
requestAnimationFrame(drawWave);
connect();
loadPorts();
loadCoachStatus();
