// FlowState dashboard — consumes the SSE stream and renders everything.
const $ = (id) => document.getElementById(id);
const GAUGE_CIRC = 2 * Math.PI * 92; // matches r=92 in the SVG

// ---- color helpers ----------------------------------------------------------
function focusColor(score) {
  // red (0) -> amber (50) -> teal (100)
  if (score >= 50) {
    const t = (score - 50) / 50;
    return mix([255, 180, 84], [52, 224, 196], t);
  }
  const t = score / 50;
  return mix([255, 94, 108], [255, 180, 84], t);
}
function mix(a, b, t) {
  const c = a.map((v, i) => Math.round(v + (b[i] - v) * t));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

// ---- waveform canvas --------------------------------------------------------
const canvas = $("wave");
const ctx = canvas.getContext("2d");
let waveData = [];

function resizeCanvas() {
  const dpr = window.devicePixelRatio || 1;
  const r = canvas.getBoundingClientRect();
  canvas.width = r.width * dpr;
  canvas.height = r.height * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
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
    const amp = (h / 2) * 0.82 / maxAbs;

    const grad = ctx.createLinearGradient(0, 0, w, 0);
    grad.addColorStop(0, "rgba(52,224,196,0.15)");
    grad.addColorStop(1, "rgba(79,157,255,1)");
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
  requestAnimationFrame(drawWave);
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

  // band bars (relative powers 0..1)
  const br = p.band_rel || {};
  const maxRel = Math.max(0.0001, br.theta || 0, br.alpha || 0, br.beta || 0);
  $("bar-theta").style.width = `${((br.theta || 0) / maxRel) * 100}%`;
  $("bar-alpha").style.width = `${((br.alpha || 0) / maxRel) * 100}%`;
  $("bar-beta").style.width = `${((br.beta || 0) / maxRel) * 100}%`;

  // chips
  setChip("chip-source", `source: ${shortSource(p.source)}`, p.source && p.source !== "none" ? "ok" : "muted");
  setQuality(p.quality);
  setMode(p);
  setCalib(p);

  // alert banner + nudges (fire only on state transitions)
  $("alert-banner").classList.toggle("hidden", !p.alert);
  if (p.alert && !prevAlert) onZoneOut();
  if (!p.alert && prevAlert) onRecover();
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

// ---- boot -------------------------------------------------------------------
resizeCanvas();
requestAnimationFrame(drawWave);
connect();
loadPorts();
