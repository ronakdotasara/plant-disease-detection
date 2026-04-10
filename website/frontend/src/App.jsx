import { useState, useEffect, useCallback } from "react";

const css = `
  @import url('https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&family=Syne:wght@400;700;800&display=swap');
  *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
  :root{
    --bg:#0d1208;--bg2:#141a0e;--bg3:#1c2514;--bg4:#222d18;
    --surface:#2a3620;--border:#3a4a2a;--border2:#4a5e38;
    --green:#7db547;--green2:#a3d15e;--green-dim:#4a7030;
    --amber:#d4a017;--amber2:#f0be3a;--amber-dim:#7a5c0a;
    --red:#c94040;--red2:#e86060;--teal:#3cb4a0;--teal2:#5cd4be;
    --text:#dde8cc;--text2:#8fa878;--text3:#5a6e48;
    --mono:'Space Mono',monospace;--sans:'Syne',sans-serif;
  }
  html,body,#root{height:100%;background:var(--bg);color:var(--text)}
  ::-webkit-scrollbar{width:4px}::-webkit-scrollbar-track{background:var(--bg2)}
  ::-webkit-scrollbar-thumb{background:var(--border2);border-radius:2px}
  @keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}
  @keyframes spin{to{transform:rotate(360deg)}}
  @keyframes fadeUp{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}
`;

// Strip trailing slash so every path just does API + "/path"
const API = ((typeof import.meta !== "undefined" && import.meta.env?.VITE_API_URL) || "http://localhost:8000").replace(/\/$/, "");

async function api(path, opts = {}) {
  try {
    const r = await fetch(`${API}${path}`, { headers: { "Content-Type": "application/json" }, ...opts });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json();
  } catch (e) {
    console.warn(`[API] ${path}:`, e.message);
    return null;
  }
}

function usePoll(fetcher, ms = 5000) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const run = useCallback(async () => {
    const r = await fetcher();
    if (r !== null) { setData(r); setError(false); } else setError(true);
    setLoading(false);
  }, [fetcher]);
  useEffect(() => { run(); const id = setInterval(run, ms); return () => clearInterval(id); }, [run, ms]);
  return { data, loading, error, refetch: run };
}

// ── shared components ──────────────────────────────────────────────────────────
const Spin = () => <span style={{ display: "inline-block", width: 12, height: 12, border: "2px solid var(--border2)", borderTopColor: "var(--green)", borderRadius: "50%", animation: "spin .7s linear infinite" }} />;

const Tag = ({ children, color = "dim" }) => {
  const C = { green: { bg: "rgba(125,181,71,.15)", bo: "rgba(125,181,71,.4)", tx: "var(--green2)" }, amber: { bg: "rgba(212,160,23,.15)", bo: "rgba(212,160,23,.4)", tx: "var(--amber2)" }, red: { bg: "rgba(201,64,64,.15)", bo: "rgba(201,64,64,.4)", tx: "var(--red2)" }, teal: { bg: "rgba(60,180,160,.15)", bo: "rgba(60,180,160,.4)", tx: "var(--teal2)" }, dim: { bg: "rgba(90,110,72,.1)", bo: "rgba(90,110,72,.3)", tx: "var(--text2)" } };
  const c = C[color] || C.dim;
  return <span style={{ background: c.bg, border: `1px solid ${c.bo}`, color: c.tx, fontFamily: "var(--mono)", fontSize: 10, padding: "2px 8px", borderRadius: 2, letterSpacing: "0.08em", textTransform: "uppercase", fontWeight: 700 }}>{children}</span>;
};

const Card = ({ children, style = {} }) => <div style={{ background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: 4, padding: 20, ...style }}>{children}</div>;
const Lbl = ({ children }) => <div style={{ fontFamily: "var(--mono)", fontSize: 9, color: "var(--text3)", letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: 6 }}>{children}</div>;
const Val = ({ children, size = 28, color = "var(--text)" }) => <div style={{ fontFamily: "var(--mono)", fontSize: size, fontWeight: 700, color, lineHeight: 1 }}>{children}</div>;
const Dot = ({ active, color }) => { const c = color || (active ? "var(--green)" : "var(--text3)"); return <span style={{ display: "inline-block", width: 7, height: 7, borderRadius: "50%", background: c, boxShadow: active ? `0 0 8px ${c}` : "none", animation: active ? "pulse 2s ease-in-out infinite" : "none", marginRight: 6 }} />; };
const Bar = ({ value, max = 100, color = "var(--green)", warn = false }) => { const pct = value == null ? 0 : Math.min((value / max) * 100, 100); return <div style={{ background: "var(--bg4)", borderRadius: 2, height: 4, overflow: "hidden" }}><div style={{ width: `${pct}%`, height: "100%", background: warn ? "var(--amber)" : color, borderRadius: 2, transition: "width .5s" }} /></div>; };
const Empty = ({ msg = "Waiting for data..." }) => <div style={{ display: "flex", alignItems: "center", gap: 8, fontFamily: "var(--mono)", fontSize: 10, color: "var(--text3)" }}><Spin />{msg}</div>;

const Btn = ({ children, onClick, variant = "primary", small = false, disabled = false }) => {
  const S = { primary: { bg: "var(--green-dim)", bo: "var(--green)", tx: "var(--green2)" }, amber: { bg: "var(--amber-dim)", bo: "var(--amber)", tx: "var(--amber2)" }, red: { bg: "rgba(201,64,64,.15)", bo: "var(--red)", tx: "var(--red2)" }, ghost: { bg: "transparent", bo: "var(--border2)", tx: "var(--text2)" } };
  const s = S[variant] || S.ghost; const [hov, setHov] = useState(false);
  return <button onClick={onClick} disabled={disabled} onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)} style={{ background: hov && !disabled ? s.bg + "cc" : s.bg, border: `1px solid ${s.bo}`, color: s.tx, fontFamily: "var(--mono)", fontSize: small ? 10 : 11, padding: small ? "5px 12px" : "9px 18px", borderRadius: 3, cursor: disabled ? "not-allowed" : "pointer", letterSpacing: "0.06em", textTransform: "uppercase", fontWeight: 700, transition: "all .15s", opacity: disabled ? .5 : 1 }}>{children}</button>;
};

// ── nav ─────────────────────────────────────────────────────────────────────
const NAV = [
  { id: "dashboard", icon: "◈", label: "Dashboard" },
  { id: "sensors",   icon: "◉", label: "Sensors" },
  { id: "camera",    icon: "⬡", label: "Camera" },
  { id: "disease",   icon: "◍", label: "Disease" },
  { id: "motor",     icon: "⬢", label: "Motor" },
  { id: "lilygo",    icon: "▦", label: "LilyGo" },
  { id: "logs",      icon: "≡", label: "Logs" },
  { id: "settings",  icon: "⚙", label: "Settings" },
];

function Sidebar({ page, setPage, ok }) {
  return (
    <div style={{ width: 64, minHeight: "100vh", background: "var(--bg2)", borderRight: "1px solid var(--border)", display: "flex", flexDirection: "column", alignItems: "center", paddingTop: 16, gap: 2, position: "fixed", top: 0, left: 0, zIndex: 100 }}>
      <div style={{ width: 36, height: 36, background: "var(--green-dim)", border: "1px solid var(--green)", borderRadius: 4, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 20 }}><span style={{ fontSize: 16 }}>🌿</span></div>
      {NAV.map(n => (
        <button key={n.id} title={n.label} onClick={() => setPage(n.id)} style={{ width: 44, height: 44, borderRadius: 4, border: "none", cursor: "pointer", background: page === n.id ? "var(--surface)" : "transparent", color: page === n.id ? "var(--green2)" : "var(--text3)", fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: page === n.id ? "inset 2px 0 0 var(--green)" : "none" }}>{n.icon}</button>
      ))}
      <div style={{ marginTop: "auto", paddingBottom: 16 }}><Dot active={ok} /></div>
    </div>
  );
}

function TopBar({ page, mode, onMode, ok }) {
  const [t, setT] = useState(new Date());
  useEffect(() => { const id = setInterval(() => setT(new Date()), 1000); return () => clearInterval(id); }, []);
  const switchMode = async m => { const r = await api("/mode/", { method: "POST", body: JSON.stringify({ mode: m }) }); if (r) onMode(m); };
  return (
    <div style={{ height: 52, background: "var(--bg2)", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", padding: "0 20px 0 0", position: "fixed", top: 0, left: 64, right: 0, zIndex: 99, gap: 16 }}>
      <div style={{ height: "100%", padding: "0 20px", borderRight: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 10, minWidth: 220 }}>
        <span style={{ fontFamily: "var(--sans)", fontWeight: 800, fontSize: 13, letterSpacing: "0.08em" }}>AGRI·WATCH OJAS</span>
        <span style={{ color: "var(--border2)", fontSize: 10 }}>◦</span>
        <span style={{ fontFamily: "var(--mono)", fontSize: 10, color: "var(--text2)", textTransform: "uppercase" }}>{NAV.find(n => n.id === page)?.label}</span>
      </div>
      <div style={{ flex: 1 }} />
      <div style={{ fontFamily: "var(--mono)", fontSize: 9, color: "var(--text3)" }}>{t.toLocaleTimeString()}</div>
      <div style={{ display: "flex", gap: 4 }}>
        {["auto", "manual"].map(m => (
          <button key={m} onClick={() => switchMode(m)} style={{ fontFamily: "var(--mono)", fontSize: 9, padding: "4px 10px", borderRadius: 2, border: `1px solid ${mode === m ? "var(--green)" : "var(--border)"}`, background: mode === m ? "var(--green-dim)" : "transparent", color: mode === m ? "var(--green2)" : "var(--text3)", cursor: "pointer", textTransform: "uppercase", fontWeight: 700 }}>{m}</button>
        ))}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <Dot active={ok} /><span style={{ fontFamily: "var(--mono)", fontSize: 9, color: ok ? "var(--green2)" : "var(--red2)" }}>{ok ? "ONLINE" : "OFFLINE"}</span>
      </div>
    </div>
  );
}

const fmt = (v, d = 1) => v == null ? "—" : Number(v).toFixed(d);
const sevCol = { none: "green", mild: "amber", moderate: "amber", severe: "red" };

// ── dashboard ────────────────────────────────────────────────────────────────
// Now uses a single /sensors/status poll instead of separate /sensors/latest + /motor/status
function Tile({ label, value, unit, color = "var(--green)", warn = false, max = 100 }) {
  return (
    <Card style={{ flex: 1, minWidth: 110 }}>
      <Lbl>{label}</Lbl>
      <Val size={22} color={warn ? "var(--amber2)" : color}>{value != null ? Number(value).toFixed(1) : "—"}</Val>
      <div style={{ fontFamily: "var(--mono)", fontSize: 10, color: "var(--text3)", marginBottom: 8 }}>{unit}</div>
      <Bar value={value} max={max} warn={warn} />
    </Card>
  );
}

function DashboardPage({ status, disease, motor }) {
  // status.data is the /sensors/status response shape:
  // { ok, has_reading, sensor_data, alerts, alert_count, serial_connected, serial_status }
  const s = status?.data?.sensor_data;
  const serialStatus = status?.data?.serial_status;
  const serialConnected = status?.data?.serial_connected;
  const d = disease?.data;
  const m = motor?.data;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20, animation: "fadeUp .3s ease" }}>
      <Card style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 20px", flexWrap: "wrap" }}>
        <Tag color="green">RPi 4</Tag><Tag color="teal">NodeMCU v3 ESP8266</Tag>
        <Tag color="amber">LilyGo T-Display S3 AMOLED</Tag><Tag color="dim">Serial JSON · 115200</Tag>
        <div style={{ flex: 1 }} /><span style={{ fontFamily: "var(--mono)", fontSize: 9, color: "var(--text3)" }}>Team OJAS · NIT Hamirpur</span>
      </Card>

      {/* Alert banner — driven by /sensors/status inline alerts */}
      {(status?.data?.alert_count > 0) && (
        <Card style={{ background: "rgba(201,64,64,.08)", borderColor: "var(--red)", padding: "12px 16px" }}>
          <Lbl>⚠ Sensor Alerts</Lbl>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
            {status.data.alerts.map((a, i) => (
              <div key={i} style={{ fontFamily: "var(--mono)", fontSize: 10, color: "var(--red2)", background: "rgba(201,64,64,.1)", border: "1px solid rgba(201,64,64,.3)", borderRadius: 3, padding: "4px 10px" }}>
                {a.sensor} = {Number(a.value).toFixed(1)} ({a.type.replace("_", " ")})
              </div>
            ))}
          </div>
        </Card>
      )}

      <div>
        <Lbl>Live Sensor Readings</Lbl>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 8 }}>
          <Tile label="Temperature" value={s?.temperature}       unit="°C"    max={50}  warn={s?.temperature > 40 || s?.temperature < 15} color="var(--amber2)" />
          <Tile label="Humidity"    value={s?.humidity}          unit="%"              warn={s?.humidity > 95 || s?.humidity < 20}         color="var(--teal2)" />
          <Tile label="Nitrogen"    value={s?.nitrogen}          unit="mg/kg" max={200}                                                    color="var(--teal2)" />
          <Tile label="Phosphorus"  value={s?.phosphorus}        unit="mg/kg" max={200}                                                    color="var(--teal2)" />
          <Tile label="Potassium"   value={s?.potassium}         unit="mg/kg" max={200}                                                    color="var(--teal2)" />
          <Tile label="Tank Level"  value={s?.tank_level_pct}    unit="%"              warn={s?.tank_level_pct < 15} />
          <Tile label="Mix Conc."   value={s?.concentration_pct} unit="%"              warn={s?.concentration_pct < 10} />
        </div>
      </div>

      <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
        <Card style={{ flex: 2, minWidth: 260 }}>
          <Lbl>Latest Gemini Detection</Lbl>
          {d ? (<>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
              <Val size={20}>{d.disease}</Val>
              <Tag color={sevCol[d.severity] || "dim"}>{d.severity || "—"}</Tag>
              <Tag color="dim">{d.confidence != null ? `${(d.confidence * 100).toFixed(0)}% conf` : "—"}</Tag>
            </div>
            <div style={{ fontFamily: "var(--mono)", fontSize: 10, color: "var(--text2)", marginBottom: 10, lineHeight: 1.6 }}>{d.treatment || "No treatment specified"}</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <Tag color={d.pump_a ? "green" : "dim"}>Pump A:{d.pump_a ? "ON" : "OFF"}</Tag>
              <Tag color={d.pump_b ? "green" : "dim"}>Pump B:{d.pump_b ? "ON" : "OFF"}</Tag>
              <Tag color={d.main_pump ? "green" : "dim"}>Main:{d.main_pump ? "ON" : "OFF"}</Tag>
              {d.spray_duration_s > 0 && <Tag color="amber">Spray {d.spray_duration_s}s</Tag>}
            </div>
          </>) : <Empty msg="No detection yet" />}
        </Card>

        <Card style={{ flex: 1, minWidth: 180 }}>
          <Lbl>Motor / NodeMCU</Lbl>
          {m ? (<>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
              <Dot active={m.running} /><Val size={16} color={m.running ? "var(--green2)" : "var(--text2)"}>{m.running ? "SPRAYING" : "IDLE"}</Val>
            </div>
            {[["Pump A", m.pump_a], ["Pump B", m.pump_b], ["Main Spray", m.main_pump]].map(([l, on]) => (
              <div key={l} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", borderBottom: "1px solid var(--bg4)" }}>
                <span style={{ fontFamily: "var(--mono)", fontSize: 9, color: "var(--text3)" }}>{l}</span>
                <Tag color={on ? "green" : "dim"}>{on ? "ON" : "OFF"}</Tag>
              </div>
            ))}
            {/* Serial status sourced from /sensors/status — single source of truth */}
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8 }}>
              <span style={{ fontFamily: "var(--mono)", fontSize: 9, color: "var(--text3)" }}>NodeMCU Serial</span>
              <Tag color={serialConnected ? "green" : "red"}>{serialConnected ? "OK" : "OFFLINE"}</Tag>
            </div>
            {serialStatus?.led && (
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
                <span style={{ fontFamily: "var(--mono)", fontSize: 9, color: "var(--text3)" }}>LED</span>
                <Tag color="dim">{serialStatus.led}</Tag>
              </div>
            )}
          </>) : <Empty />}
        </Card>
      </div>
    </div>
  );
}

// ── sensors page ──────────────────────────────────────────────────────────────
function SensorsPage() {
  const { data: latest, loading } = usePoll(useCallback(() => api("/sensors/latest"), []), 5000);
  const { data: alerts } = usePoll(useCallback(() => api("/sensors/alerts"), []), 10000);
  const defs = [
    { key: "temperature",       label: "Temperature",       unit: "°C",    color: "var(--amber2)", max: 50 },
    { key: "humidity",          label: "Humidity",          unit: "%",     color: "var(--teal2)",  max: 100 },
    { key: "nitrogen",          label: "Nitrogen (N)",      unit: "mg/kg", color: "var(--green2)", max: 300 },
    { key: "phosphorus",        label: "Phosphorus (P)",    unit: "mg/kg", color: "var(--green2)", max: 300 },
    { key: "potassium",         label: "Potassium (K)",     unit: "mg/kg", color: "var(--green2)", max: 300 },
    { key: "tank_level_pct",    label: "Tank Level",        unit: "%",     color: "var(--teal2)",  max: 100 },
    { key: "concentration_pct", label: "Mix Concentration", unit: "%",     color: "var(--amber2)", max: 100 },
  ];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20, animation: "fadeUp .3s ease" }}>
      {alerts?.alerts?.length > 0 && (
        <Card style={{ background: "rgba(201,64,64,.08)", borderColor: "var(--red)" }}>
          <Lbl>⚠ Active Alerts</Lbl>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
            {alerts.alerts.map((a, i) => <div key={i} style={{ fontFamily: "var(--mono)", fontSize: 10, color: "var(--red2)", background: "rgba(201,64,64,.1)", border: "1px solid rgba(201,64,64,.3)", borderRadius: 3, padding: "4px 10px" }}>{a.sensor} = {Number(a.value).toFixed(1)} ({a.type.replace("_", " ")})</div>)}
          </div>
        </Card>
      )}
      <div>
        <Lbl>Current Readings {loading && <Spin />}</Lbl>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(200px,1fr))", gap: 12, marginTop: 8 }}>
          {defs.map(s => {
            const v = latest?.[s.key]; const alert = alerts?.alerts?.find(a => a.sensor === s.key);
            return (
              <Card key={s.key} style={{ borderColor: alert ? "var(--red)" : "var(--border)" }}>
                <Lbl>{s.label}</Lbl>
                <Val size={26} color={alert ? "var(--red2)" : s.color}>{v != null ? Number(v).toFixed(1) : "—"}</Val>
                <div style={{ fontFamily: "var(--mono)", fontSize: 10, color: "var(--text3)", marginBottom: 10 }}>{s.unit}</div>
                <Bar value={v} max={s.max} color={s.color} warn={!!alert} />
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── camera page ───────────────────────────────────────────────────────────────
function CameraPage() {
  const { data: streamInfo } = usePoll(useCallback(() => api("/camera/stream-url"), []), 30000);
  const { data: latest } = usePoll(useCallback(() => api("/camera/latest"), []), 10000);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20, animation: "fadeUp .3s ease" }}>
      <Card>
        <Lbl>Pi Camera v2 — MJPEG Stream</Lbl>
        <div style={{ marginTop: 12, display: "flex", gap: 20, flexWrap: "wrap" }}>
          <div style={{ flex: 2, minWidth: 280 }}>
            <div style={{ background: "var(--bg4)", border: "1px solid var(--border)", borderRadius: 3, aspectRatio: "16/9", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", position: "relative" }}>
              {streamInfo?.url && <img src={streamInfo.url} alt="Plant feed" style={{ width: "100%", height: "100%", objectFit: "cover" }} onError={e => e.target.style.display = "none"} />}
              <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8 }}>
                <span style={{ fontSize: 32, opacity: .3 }}>📷</span>
                <span style={{ fontFamily: "var(--mono)", fontSize: 9, color: "var(--text3)" }}>{streamInfo?.url || "Loading…"}</span>
              </div>
            </div>
          </div>
          <div style={{ flex: 1, minWidth: 180, fontFamily: "var(--mono)", fontSize: 9, color: "var(--text3)", lineHeight: 2.2 }}>
            <div>Host: <span style={{ color: "var(--text2)" }}>{streamInfo?.host || "raspberrypi.local"}</span></div>
            <div>Port: <span style={{ color: "var(--text2)" }}>8080</span></div>
            <div>Format: <span style={{ color: "var(--text2)" }}>MJPEG</span></div>
            <div>Last capture: <span style={{ color: "var(--text2)" }}>{latest?.captured_at ? new Date(latest.captured_at).toLocaleTimeString() : "—"}</span></div>
            <div style={{ marginTop: 8, background: "var(--bg4)", padding: "8px 10px", borderRadius: 3, color: "var(--green2)" }}>libcamera-vid -t 0 --inline --listen -o tcp://0.0.0.0:8080</div>
          </div>
        </div>
      </Card>
    </div>
  );
}

// ── disease page ───────────────────────────────────────────────────────────────
function DiseasePage() {
  const { data: latest } = usePoll(useCallback(() => api("/disease/latest"), []), 10000);
  const { data: predictions } = usePoll(useCallback(() => api("/disease/predictions?limit=20"), []), 15000);
  const { data: summary } = usePoll(useCallback(() => api("/disease/summary"), []), 30000);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20, animation: "fadeUp .3s ease" }}>
      {latest && (
        <Card style={{ borderColor: latest.severity === "severe" ? "var(--red)" : latest.severity === "moderate" ? "var(--amber)" : "var(--border)" }}>
          <Lbl>Latest Detection</Lbl>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 16, marginTop: 8, flexWrap: "wrap" }}>
            <div style={{ flex: 2 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                <Val size={24}>{latest.disease}</Val>
                <Tag color={sevCol[latest.severity] || "dim"}>{latest.severity || "—"}</Tag>
                {latest.confidence != null && <Tag color="dim">{(latest.confidence * 100).toFixed(0)}% confidence</Tag>}
              </div>
              <div style={{ fontFamily: "var(--mono)", fontSize: 10, color: "var(--text2)", lineHeight: 1.8 }}>{latest.treatment || "—"}</div>
            </div>
            <div style={{ flex: 1, minWidth: 160 }}>
              <Lbl>NodeMCU Commands</Lbl>
              {[["Pump A (L298N)", latest.pump_a], ["Pump B (L298N)", latest.pump_b], ["Main Relay", latest.main_pump]].map(([l, on]) => (
                <div key={l} style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", borderBottom: "1px solid var(--bg4)" }}>
                  <span style={{ fontFamily: "var(--mono)", fontSize: 10, color: "var(--text2)" }}>{l}</span>
                  <Tag color={on ? "green" : "dim"}>{on ? "ON" : "OFF"}</Tag>
                </div>
              ))}
              {latest.spray_duration_s > 0 && <div style={{ fontFamily: "var(--mono)", fontSize: 10, color: "var(--amber2)", marginTop: 6 }}>Duration: {latest.spray_duration_s}s</div>}
            </div>
          </div>
        </Card>
      )}
      {summary && (
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
          <Card style={{ flex: 1, minWidth: 200 }}>
            <Lbl>By Disease (7d)</Lbl>
            {summary.by_disease.map(r => (
              <div key={r.disease} style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", borderBottom: "1px solid var(--bg4)" }}>
                <span style={{ fontFamily: "var(--mono)", fontSize: 10, color: "var(--text2)" }}>{r.disease}</span>
                <Tag color="dim">{r.count}</Tag>
              </div>
            ))}
          </Card>
          <Card style={{ flex: 1, minWidth: 200 }}>
            <Lbl>By Severity (7d)</Lbl>
            {summary.by_severity.map(r => (
              <div key={r.severity} style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", borderBottom: "1px solid var(--bg4)" }}>
                <span style={{ fontFamily: "var(--mono)", fontSize: 10, color: "var(--text2)" }}>{r.severity || "—"}</span>
                <Tag color={sevCol[r.severity] || "dim"}>{r.count}</Tag>
              </div>
            ))}
          </Card>
        </div>
      )}
      <Card>
        <Lbl>Recent Predictions</Lbl>
        <div style={{ marginTop: 10, overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: "var(--mono)", fontSize: 10 }}>
            <thead><tr style={{ borderBottom: "1px solid var(--border)" }}>
              {["Time", "Disease", "Severity", "Conf", "PA", "PB", "Main", "Spray"].map(h => <th key={h} style={{ textAlign: "left", padding: "6px 8px", color: "var(--text3)", fontSize: 9, textTransform: "uppercase" }}>{h}</th>)}
            </tr></thead>
            <tbody>
              {(predictions || []).map(p => (
                <tr key={p.id} style={{ borderBottom: "1px solid var(--bg4)" }}>
                  <td style={{ padding: "6px 8px", color: "var(--text3)" }}>{new Date(p.recorded_at).toLocaleTimeString()}</td>
                  <td style={{ padding: "6px 8px" }}>{p.disease}</td>
                  <td style={{ padding: "6px 8px" }}><Tag color={sevCol[p.severity] || "dim"}>{p.severity || "—"}</Tag></td>
                  <td style={{ padding: "6px 8px", color: "var(--text2)" }}>{p.confidence != null ? (p.confidence * 100).toFixed(0) + "%" : "—"}</td>
                  <td style={{ padding: "6px 8px" }}><Tag color={p.pump_a ? "green" : "dim"}>{p.pump_a ? "ON" : "OFF"}</Tag></td>
                  <td style={{ padding: "6px 8px" }}><Tag color={p.pump_b ? "green" : "dim"}>{p.pump_b ? "ON" : "OFF"}</Tag></td>
                  <td style={{ padding: "6px 8px" }}><Tag color={p.main_pump ? "green" : "dim"}>{p.main_pump ? "ON" : "OFF"}</Tag></td>
                  <td style={{ padding: "6px 8px", color: "var(--text2)" }}>{p.spray_duration_s || 0}s</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

// ── motor page ────────────────────────────────────────────────────────────────
function MotorPage() {
  const { data: status, refetch } = usePoll(useCallback(() => api("/motor/status"), []), 3000);
  const { data: history } = usePoll(useCallback(() => api("/motor/history?limit=15"), []), 10000);
  const [pumpA, setPumpA] = useState(false); const [pumpB, setPumpB] = useState(false);
  const [mainPump, setMainPump] = useState(true); const [duration, setDuration] = useState(10);
  const [busy, setBusy] = useState(false); const [msg, setMsg] = useState(null);
  const isManual = status?.mode === "manual"; const isRunning = status?.running;

  const handleOn = async () => {
    if (!isManual) return setMsg("Switch to MANUAL mode first.");
    setBusy(true); setMsg(null);
    const r = await api("/motor/on", { method: "POST", body: JSON.stringify({ pump_a: pumpA, pump_b: pumpB, main_pump: mainPump, duration_sec: duration, trigger: "manual" }) });
    setBusy(false); setMsg(r ? `Motor ON — ${duration}s spray started.` : "Failed."); refetch();
  };
  const handleOff = async () => { setBusy(true); const r = await api("/motor/off", { method: "POST" }); setBusy(false); setMsg(r ? "All pumps stopped." : "Failed."); refetch(); };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20, animation: "fadeUp .3s ease" }}>
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
        <Card style={{ flex: 1, minWidth: 200 }}>
          <Lbl>Status</Lbl>
          {[["Mode", <Tag color={isManual ? "amber" : "teal"}>{status?.mode?.toUpperCase() || "—"}</Tag>],
          ["State", <Tag color={isRunning ? "green" : "dim"}>{isRunning ? "SPRAYING" : "IDLE"}</Tag>],
          ["NodeMCU", <Tag color={status?.serial_connected ? "green" : "red"}>{status?.serial_connected ? "CONNECTED" : "OFFLINE"}</Tag>],
          ["Pump A", <Tag color={status?.pump_a ? "green" : "dim"}>{status?.pump_a ? "ON" : "OFF"}</Tag>],
          ["Pump B", <Tag color={status?.pump_b ? "green" : "dim"}>{status?.pump_b ? "ON" : "OFF"}</Tag>],
          ["Main", <Tag color={status?.main_pump ? "green" : "dim"}>{status?.main_pump ? "ON" : "OFF"}</Tag>],
          ].map(([l, el]) => (
            <div key={l} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "5px 0", borderBottom: "1px solid var(--bg4)" }}>
              <span style={{ fontFamily: "var(--mono)", fontSize: 10, color: "var(--text3)" }}>{l}</span>{el}
            </div>
          ))}
        </Card>
        <Card style={{ flex: 2, minWidth: 260, borderColor: isManual ? "var(--amber)" : "var(--border)" }}>
          <Lbl>Manual Control</Lbl>
          {!isManual && <div style={{ marginBottom: 12, padding: 8, background: "rgba(212,160,23,.08)", border: "1px solid rgba(212,160,23,.3)", borderRadius: 3, fontFamily: "var(--mono)", fontSize: 10, color: "var(--amber2)" }}>⚠ Switch to MANUAL mode (top bar) to enable controls.</div>}
          <div style={{ display: "flex", gap: 20, flexWrap: "wrap", alignItems: "flex-start", marginTop: 8 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {[["Pump A (L298N IN1 · D3)", pumpA, setPumpA, "Mixing pump A"], ["Pump B (L298N IN3 · D7)", pumpB, setPumpB, "Mixing pump B"], ["Main Relay (D4 · active-LOW)", mainPump, setMainPump, "12V spray pump"]].map(([l, v, set, note]) => (
                <div key={l} onClick={() => isManual && set(!v)} style={{ display: "flex", alignItems: "center", gap: 10, background: "var(--bg3)", padding: "8px 12px", borderRadius: 3, cursor: isManual ? "pointer" : "not-allowed", border: `1px solid ${v ? "var(--green)" : "var(--border)"}` }}>
                  <div style={{ width: 12, height: 12, borderRadius: 2, background: v ? "var(--green)" : "transparent", border: `1px solid ${v ? "var(--green)" : "var(--border2)"}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, color: "#fff" }}>{v ? "✓" : ""}</div>
                  <div><div style={{ fontFamily: "var(--mono)", fontSize: 10, color: v ? "var(--green2)" : "var(--text2)" }}>{l}</div><div style={{ fontFamily: "var(--mono)", fontSize: 8, color: "var(--text3)" }}>{note}</div></div>
                </div>
              ))}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <Lbl>Duration (seconds)</Lbl>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {[5, 10, 20, 30, 60].map(d => <button key={d} onClick={() => setDuration(d)} disabled={!isManual} style={{ fontFamily: "var(--mono)", fontSize: 10, padding: "5px 12px", borderRadius: 2, border: `1px solid ${duration === d ? "var(--green)" : "var(--border)"}`, background: duration === d ? "var(--green-dim)" : "transparent", color: duration === d ? "var(--green2)" : "var(--text3)", cursor: isManual ? "pointer" : "not-allowed" }}>{d}s</button>)}
              </div>
              <div style={{ display: "flex", gap: 10 }}>
                <Btn onClick={handleOn} disabled={!isManual || isRunning || busy} variant="primary">{busy ? "…" : "▶ Start"}</Btn>
                <Btn onClick={handleOff} disabled={busy} variant="red">■ Stop All</Btn>
              </div>
              {msg && <div style={{ fontFamily: "var(--mono)", fontSize: 9, color: "var(--text2)" }}>{msg}</div>}
            </div>
          </div>
        </Card>
      </div>
      <Card>
        <Lbl>Spray History</Lbl>
        <div style={{ marginTop: 10, overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: "var(--mono)", fontSize: 10 }}>
            <thead><tr style={{ borderBottom: "1px solid var(--border)" }}>
              {["Time", "Type", "Trigger", "PA", "PB", "Main", "Duration"].map(h => <th key={h} style={{ textAlign: "left", padding: "6px 8px", color: "var(--text3)", fontSize: 9, textTransform: "uppercase" }}>{h}</th>)}
            </tr></thead>
            <tbody>
              {(history || []).map(e => (
                <tr key={e.id} style={{ borderBottom: "1px solid var(--bg4)" }}>
                  <td style={{ padding: "6px 8px", color: "var(--text3)" }}>{new Date(e.recorded_at).toLocaleTimeString()}</td>
                  <td style={{ padding: "6px 8px" }}><Tag color={e.event_type.includes("on") ? "green" : "dim"}>{e.event_type}</Tag></td>
                  <td style={{ padding: "6px 8px", color: "var(--text2)" }}>{e.trigger || "—"}</td>
                  <td style={{ padding: "6px 8px" }}><Tag color={e.pump_a ? "green" : "dim"}>{e.pump_a ? "ON" : "OFF"}</Tag></td>
                  <td style={{ padding: "6px 8px" }}><Tag color={e.pump_b ? "green" : "dim"}>{e.pump_b ? "ON" : "OFF"}</Tag></td>
                  <td style={{ padding: "6px 8px" }}><Tag color={e.main_pump ? "green" : "dim"}>{e.main_pump ? "ON" : "OFF"}</Tag></td>
                  <td style={{ padding: "6px 8px", color: "var(--text2)" }}>{e.duration_sec != null ? `${e.duration_sec}s` : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

// ── LILYGO page ──────────────────────────────────────────────────────────────
function LilyGoPage() {
  const { data: health } = usePoll(useCallback(() => api("/health"), []), 5000);
  const { data: latest } = usePoll(useCallback(() => api("/sensors/latest"), []), 5000);
  const { data: disease } = usePoll(useCallback(() => api("/disease/latest"), []), 10000);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20, animation: "fadeUp .3s ease" }}>
      <Card style={{ display: "flex", alignItems: "center", gap: 16, padding: "12px 20px" }}>
        <Tag color="teal">LilyGo T-Display S3 AMOLED</Tag>
        <Tag color="dim">RM67162 · 536×240</Tag>
        <Tag color="dim">ESP32-S3R8 · 8MB PSRAM</Tag>
        <Tag color="dim">/dev/ttyUSB1 · 115200 baud</Tag>
      </Card>

      <Card>
        <Lbl>AMOLED Display Preview</Lbl>
        <div style={{ marginTop: 12, background: "#000", borderRadius: 6, overflow: "hidden", border: "2px solid var(--border2)", fontFamily: "var(--mono)" }}>
          <div style={{ background: "#1C2514", padding: "6px 10px", borderBottom: "1px solid #3a4a2a", display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
            <span style={{ color: "#DDE8CC", fontSize: 12, fontWeight: 700 }}>Disease: {disease?.disease || "—"}</span>
            <span style={{ color: disease?.severity === "severe" ? "#E86060" : disease?.severity === "moderate" ? "#F0BE3A" : "#A3D15E", fontSize: 10 }}>[{disease?.severity || "none"}]</span>
            <div style={{ flex: 1 }} />
            <span style={{ color: "#5A6E48", fontSize: 9 }}>uptime: 00:12:34</span>
          </div>
          <div style={{ background: "#0D1208", padding: "4px 10px", borderBottom: "1px solid #1C2514", display: "flex", gap: 16, fontSize: 9 }}>
            <span style={{ color: "#F0BE3A" }}>T:{fmt(latest?.temperature)}°C</span>
            <span style={{ color: "#5CD4BE" }}>H:{fmt(latest?.humidity)}%</span>
            <span style={{ color: (latest?.tank_level_pct || 100) < 15 ? "#E86060" : "#8FA878" }}>Tank:{fmt(latest?.tank_level_pct)}%</span>
            <span style={{ color: "#8FA878" }}>Mix:{fmt(latest?.concentration_pct)}%</span>
            <div style={{ flex: 1 }} />
            <span style={{ color: disease?.pump_a ? "#7DB547" : "#3A4A2A" }}>PA</span>
            <span style={{ color: disease?.pump_b ? "#7DB547" : "#3A4A2A" }}>PB</span>
            <span style={{ color: disease?.main_pump ? "#C94040" : "#3A4A2A" }}>MN</span>
          </div>
          <div style={{ padding: "6px 10px", minHeight: 140 }}>
            {[
              { t: "5A6E48", m: "─── New scan cycle ───" },
              { t: "8FA878", m: "[INFO] Camera: captured OK" },
              { t: "8FA878", m: "[INFO] DHT22 → Temp:28.5°C  Hum:72.0%" },
              { t: "8FA878", m: "[INFO] NPK → N:42 P:18 K:55 mg/kg" },
              { t: "8FA878", m: "[INFO] Tank level → 80.0%" },
              { t: "8FA878", m: "[INFO] Gemini: sending image+sensors…" },
              { t: "5CD4BE", m: `[INFO] Gemini: ${disease?.disease || "healthy"} [${disease?.severity || "none"}] ${disease?.confidence != null ? (disease.confidence * 100).toFixed(0) + "% conf" : ""}` },
              { t: "8FA878", m: `[INFO] NodeMCU: PA=${disease?.pump_a || 0} PB=${disease?.pump_b || 0} Spray=${disease?.spray_duration_s || 0}s` },
              { t: "5A6E48", m: "[INFO] Cycle done in 8.3s  next in 22s" },
            ].map((l, i) => (
              <div key={i} style={{ color: `#${l.t}`, fontSize: 9, lineHeight: 1.8, opacity: 0.6 + i * 0.05 }}>{l.m}</div>
            ))}
          </div>
        </div>
        <div style={{ marginTop: 8, fontFamily: "var(--mono)", fontSize: 9, color: "var(--text3)" }}>Simulated preview — actual display auto-scrolls with live data from /dev/ttyUSB1</div>
      </Card>

      <Card>
        <Lbl>Protocol — RPi → LilyGo (/dev/ttyUSB1)</Lbl>
        <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
          {[
            ["Plain text log line", "[INFO] Gemini: Early Blight [moderate] 87% conf", "→ appended to auto-scroll log buffer"],
            ["JSON status packet", '{"lilygo":"status","disease":"…","severity":"…","pump_a":0,"pump_b":0,"main_pump":0,"temp":28.5,"humidity":72.0,"tank":80.0,"conc":65.0}', "→ updates status bar live"],
          ].map(([type, ex, note]) => (
            <div key={type} style={{ background: "var(--bg4)", border: "1px solid var(--border)", borderRadius: 3, padding: "10px 12px" }}>
              <div style={{ fontFamily: "var(--mono)", fontSize: 9, color: "var(--teal2)", marginBottom: 4 }}>{type}</div>
              <div style={{ fontFamily: "var(--mono)", fontSize: 9, color: "var(--green2)", marginBottom: 4, wordBreak: "break-all" }}>{ex}</div>
              <div style={{ fontFamily: "var(--mono)", fontSize: 8, color: "var(--text3)" }}>{note}</div>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <Lbl>Setup</Lbl>
        <div style={{ marginTop: 10, fontFamily: "var(--mono)", fontSize: 9, color: "var(--text3)", lineHeight: 2.2 }}>
          <div style={{ color: "var(--text2)", marginBottom: 4 }}># Flash LilyGo firmware via Arduino IDE</div>
          <div style={{ background: "var(--bg4)", padding: "8px 12px", borderRadius: 3, marginBottom: 8, color: "var(--green2)" }}>Board: LilyGo T-Display S3 AMOLED | PSRAM: OPI | Upload: 921600</div>
          <div style={{ color: "var(--text2)", marginBottom: 4 }}># LilyGo appears as /dev/ttyUSB1 on RPi (NodeMCU = /dev/ttyUSB0)</div>
          <div style={{ background: "var(--bg4)", padding: "8px 12px", borderRadius: 3, marginBottom: 8, color: "var(--green2)" }}>ls /dev/ttyUSB*  →  ttyUSB0 (NodeMCU)  ttyUSB1 (LilyGo)</div>
          <div style={{ color: "var(--text2)", marginBottom: 4 }}># Set in rpi/.env</div>
          <div style={{ background: "var(--bg4)", padding: "8px 12px", borderRadius: 3, color: "var(--green2)" }}>LILYGO_PORT=/dev/ttyUSB1</div>
        </div>
      </Card>
    </div>
  );
}

// ── logs page ─────────────────────────────────────────────────────────────────
function LogsPage() {
  const [level, setLevel] = useState(""); const [search, setSearch] = useState(""); const [hours, setHours] = useState(24);
  const fetcher = useCallback(() => api(`/logs/?limit=100&hours=${hours}${level ? `&level=${level}` : ""}${search ? `&search=${encodeURIComponent(search)}` : ""}`), [level, search, hours]);
  const { data: logs, loading, refetch } = usePoll(fetcher, 5000);
  const lvlCol = { INFO: "green", WARN: "amber", ERROR: "red", DEBUG: "dim" };

  // FIX: use API constant (already stripped of trailing slash) for export URL
  const exportUrl = `${API}/logs/export?hours=${hours}${level ? `&level=${level}` : ""}`;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, animation: "fadeUp .3s ease" }}>
      <Card style={{ display: "flex", gap: 12, alignItems: "center", padding: "12px 16px", flexWrap: "wrap" }}>
        <div style={{ display: "flex", gap: 4 }}>
          {["", "INFO", "WARN", "ERROR"].map(l => <button key={l} onClick={() => setLevel(l)} style={{ fontFamily: "var(--mono)", fontSize: 9, padding: "4px 10px", borderRadius: 2, border: `1px solid ${level === l ? "var(--green)" : "var(--border)"}`, background: level === l ? "var(--green-dim)" : "transparent", color: level === l ? "var(--green2)" : "var(--text3)", cursor: "pointer", textTransform: "uppercase" }}>{l || "ALL"}</button>)}
        </div>
        <div style={{ display: "flex", gap: 4 }}>
          {[6, 24, 72].map(h => <button key={h} onClick={() => setHours(h)} style={{ fontFamily: "var(--mono)", fontSize: 9, padding: "4px 10px", borderRadius: 2, border: `1px solid ${hours === h ? "var(--amber)" : "var(--border)"}`, background: hours === h ? "var(--amber-dim)" : "transparent", color: hours === h ? "var(--amber2)" : "var(--text3)", cursor: "pointer" }}>{h}h</button>)}
        </div>
        <input placeholder="Search…" value={search} onChange={e => setSearch(e.target.value)} style={{ background: "var(--bg3)", border: "1px solid var(--border)", borderRadius: 2, padding: "4px 10px", fontFamily: "var(--mono)", fontSize: 10, color: "var(--text)", outline: "none", width: 180 }} />
        <div style={{ flex: 1 }} />{loading && <Spin />}
        {/* FIX: use constructed exportUrl, not template literal with potential double-slash */}
        <Btn onClick={() => window.open(exportUrl, "_blank")} small variant="ghost">Export CSV</Btn>
      </Card>
      <Card style={{ padding: 0, overflow: "hidden" }}>
        <div style={{ maxHeight: 520, overflowY: "auto" }}>
          {(!logs || logs.length === 0) ? <div style={{ padding: 20 }}><Empty msg="No logs matching filter" /></div> : logs.map(l => (
            <div key={l.id} style={{ display: "flex", gap: 12, padding: "7px 16px", borderBottom: "1px solid var(--bg4)", alignItems: "flex-start" }}>
              <span style={{ fontFamily: "var(--mono)", fontSize: 9, color: "var(--text3)", whiteSpace: "nowrap" }}>{new Date(l.created_at).toLocaleTimeString()}</span>
              <Tag color={lvlCol[l.level] || "dim"}>{l.level}</Tag>
              {l.source && <span style={{ fontFamily: "var(--mono)", fontSize: 9, color: "var(--text3)", whiteSpace: "nowrap" }}>[{l.source}]</span>}
              <span style={{ fontFamily: "var(--mono)", fontSize: 10, color: "var(--text2)", lineHeight: 1.5 }}>{l.message}</span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

// ── settings page ─────────────────────────────────────────────────────────────
function SettingsPage() {
  const { data: health } = usePoll(useCallback(() => api("/health"), []), 5000);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20, animation: "fadeUp .3s ease" }}>
      <Card>
        <Lbl>System Information</Lbl>
        <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, fontFamily: "var(--mono)", fontSize: 10 }}>
          {[
            ["Backend", "v2.0.0"], ["Hardware", health?.hardware || "—"], ["Team", health?.team || "—"],
            ["NodeMCU port", "/dev/ttyUSB0 (115200 baud)"], ["LilyGo port", "/dev/ttyUSB1 (115200 baud)"],
            ["Protocol", "Serial JSON (newline-terminated)"], ["Data ingestion", "CSV tail from RPi log"], ["No MQTT", "RPi ↔ NodeMCU ↔ LilyGo via USB serial only"],
          ].map(([k, v]) => (
            <div key={k} style={{ background: "var(--bg3)", padding: "8px 12px", borderRadius: 3 }}>
              <div style={{ color: "var(--text3)", fontSize: 9, textTransform: "uppercase", marginBottom: 2 }}>{k}</div>
              <div style={{ color: "var(--text2)" }}>{v}</div>
            </div>
          ))}
        </div>
      </Card>
      <Card>
        <Lbl>USB Port Assignment (RPi)</Lbl>
        <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 6 }}>
          {[
            ["/dev/ttyUSB0", "NodeMCU v3 ESP8266", "OLED + LEDs + L298N pumps + relay", "115200 baud"],
            ["/dev/ttyUSB1", "LilyGo T-Display S3 AMOLED", "Auto-scroll log display", "115200 baud"],
          ].map(([port, dev, role, baud]) => (
            <div key={port} style={{ background: "var(--bg4)", border: "1px solid var(--border)", borderRadius: 3, padding: "10px 14px", display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
              <span style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--green2)", minWidth: 140 }}>{port}</span>
              <span style={{ fontFamily: "var(--mono)", fontSize: 10, color: "var(--teal2)", flex: 1 }}>{dev}</span>
              <span style={{ fontFamily: "var(--mono)", fontSize: 9, color: "var(--text2)" }}>{role}</span>
              <Tag color="dim">{baud}</Tag>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

// ── root ──────────────────────────────────────────────────────────────────────
export default function App() {
  const [page, setPage] = useState("dashboard");
  const [mode, setMode] = useState("auto");
  const [ok, setOk] = useState(false);

  const hf = useCallback(() => api("/health"), []);
  const { data: health } = usePoll(hf, 8000);
  useEffect(() => { if (health) setOk(health.status === "ok"); else setOk(false); }, [health]);
  useEffect(() => { api("/mode/").then(r => { if (r?.mode) setMode(r.mode); }); }, []);

  // Single combined poll for dashboard — replaces the old separate /sensors/latest + /motor/status
  const statusFetcher = useCallback(() => api("/sensors/status"), []);
  const status = usePoll(statusFetcher, 5000);

  // Disease and motor still polled separately (different update frequencies)
  const df = useCallback(() => api("/disease/latest"), []);
  const mf = useCallback(() => api("/motor/status"), []);
  const disease = usePoll(df, 10000);
  const motor = usePoll(mf, 3000);

  return (
    <>
      <style>{css}</style>
      <Sidebar page={page} setPage={setPage} ok={ok} />
      <TopBar page={page} mode={mode} onMode={setMode} ok={ok} />
      <div style={{ marginLeft: 64, paddingTop: 52, minHeight: "100vh" }}>
        <div style={{ padding: 24, maxWidth: 1400 }}>
          {page === "dashboard" && <DashboardPage status={status} disease={disease} motor={motor} />}
          {page === "sensors"   && <SensorsPage />}
          {page === "camera"    && <CameraPage />}
          {page === "disease"   && <DiseasePage />}
          {page === "motor"     && <MotorPage />}
          {page === "lilygo"    && <LilyGoPage />}
          {page === "logs"      && <LogsPage />}
          {page === "settings"  && <SettingsPage />}
        </div>
      </div>
    </>
  );
}