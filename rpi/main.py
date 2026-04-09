# =============================================================================
# main.py — Intelligent Pesticide Sprinkling System — Main Loop
# Team OJAS · NIT Hamirpur · Dept. of Electrical Engineering
# Faculty: Dr. Katam Nishanth
#
# Device map (all paths are persistent udev symlinks):
#   /dev/npk      → NPK MAX485 on RPi PL011 UART (/dev/ttyAMA0)
#   /dev/lilygo   → LilyGo T-Display S3 AMOLED   (USB CDC)
#   /dev/nodemcu  → NodeMCU ESP32/8266             (USB CH340/CP2102)
#
# Execution order each 30-second cycle:
#   1. Poll website backend for manual motor commands  (bidirectional control)
#   2. Capture plant image  (Pi Camera v2 via CSI)
#   3. Read sensors         (DHT22, NPK, US1, US2)
#   4. Send to Gemini       (image + sensor data — always called, demo if no image)
#   5. Parse Gemini result
#   6. Send commands        → NodeMCU (/dev/nodemcu)  [skipped in manual mode]
#   7. Send status + logs   → LilyGo  (/dev/lilygo)
#   8. Append row           → pesticide_log.csv
# =============================================================================

import csv
import json
import logging
import random
import signal
import sys
import time
import threading
import urllib.request
import urllib.error
from datetime import datetime
from pathlib import Path

import camera_capture
import gemini_client
import nodemcu_serial
import lilygo_serial
import sensor_dht
import sensor_npk
import sensor_ultrasonic
from config import (
    LILYGO_PORT,
    NODEMCU_PORT,
    NPK_PORT,
    LOG_FILE,
    LOOP_INTERVAL_SECONDS,
    MIN_TANK_LEVEL_PCT,
    MIN_CONCENTRATION_PCT,
    BACKEND_URL,
)

# ─── Logging ──────────────────────────────────────────────────────────────────
logging.basicConfig(
    level    = logging.INFO,
    format   = "%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    handlers = [
        logging.StreamHandler(sys.stdout),
        logging.FileHandler("pesticide_system.log"),
    ],
)
logger = logging.getLogger("main")

_lilygo_handler = lilygo_serial.LilyGoHandler()
_lilygo_handler.setFormatter(logging.Formatter("%(name)s: %(message)s"))
logging.getLogger().addHandler(_lilygo_handler)

# ─── CSV schema ───────────────────────────────────────────────────────────────
CSV_HEADERS = [
    "timestamp",
    "temperature_c", "humidity_pct",
    "N_mgkg", "P_mgkg", "K_mgkg",
    "tank_level_pct", "concentration_pct",
    "disease", "severity", "confidence",
    "treatment", "pump_a", "pump_b", "main_pump",
    "spray_duration_s", "notes",
]

# ─── Global mode state ────────────────────────────────────────────────────────
# Mirrors the website backend mode (auto / manual).
# Polled from backend every cycle so website buttons take effect immediately.
_current_mode = "auto"          # "auto" | "manual"
_manual_cmd   = None            # last unexecuted manual command dict from backend
_manual_lock  = threading.Lock()


# =============================================================================
# CSV helpers
# =============================================================================

def _ensure_csv():
    p = Path(LOG_FILE)
    p.parent.mkdir(parents=True, exist_ok=True)
    if not p.exists():
        with open(p, "w", newline="") as f:
            csv.DictWriter(f, fieldnames=CSV_HEADERS).writeheader()
        logger.info("CSV created: %s", LOG_FILE)


def _log_to_csv(sensor_data: dict, gemini_result: dict):
    row = {
        "timestamp":         datetime.now().isoformat(),
        "temperature_c":     sensor_data.get("temperature",   ""),
        "humidity_pct":      sensor_data.get("humidity",      ""),
        "N_mgkg":            sensor_data.get("N",             ""),
        "P_mgkg":            sensor_data.get("P",             ""),
        "K_mgkg":            sensor_data.get("K",             ""),
        "tank_level_pct":    sensor_data.get("tank_level",    ""),
        "concentration_pct": sensor_data.get("concentration", ""),
        "disease":           gemini_result.get("disease",     ""),
        "severity":          gemini_result.get("severity",    ""),
        "confidence":        gemini_result.get("confidence",  ""),
        "treatment":         gemini_result.get("treatment",   ""),
        "pump_a":            gemini_result.get("pump_a",      0),
        "pump_b":            gemini_result.get("pump_b",      0),
        "main_pump":         gemini_result.get("main_pump",   0),
        "spray_duration_s":  gemini_result.get("spray_duration_seconds", 0),
        "notes":             gemini_result.get("notes",       ""),
    }
    with open(LOG_FILE, "a", newline="") as f:
        csv.DictWriter(f, fieldnames=CSV_HEADERS).writerow(row)
    logger.info("Logged to CSV: %s", LOG_FILE)


# =============================================================================
# Backend polling — bidirectional website ↔ RPi control
# =============================================================================

def _backend_get(path: str) -> dict | None:
    """HTTP GET from backend, returns parsed JSON or None on any error."""
    try:
        url = f"{BACKEND_URL}{path}"
        req = urllib.request.Request(url, headers={"Accept": "application/json"})
        with urllib.request.urlopen(req, timeout=5) as resp:
            return json.loads(resp.read().decode())
    except Exception as e:
        logger.debug("Backend GET %s failed: %s", path, e)
        return None


def _backend_post(path: str, payload: dict) -> dict | None:
    """HTTP POST to backend, returns parsed JSON or None on any error."""
    try:
        url  = f"{BACKEND_URL}{path}"
        data = json.dumps(payload).encode()
        req  = urllib.request.Request(
            url, data=data,
            headers={"Content-Type": "application/json", "Accept": "application/json"},
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=5) as resp:
            return json.loads(resp.read().decode())
    except Exception as e:
        logger.debug("Backend POST %s failed: %s", path, e)
        return None


def _poll_backend_mode_and_commands() -> str:
    """
    1. Fetch current mode from backend (/mode/current).
    2. If manual mode, fetch motor status (/motor/status) and
       cache any pending ON command so the main loop can execute it.
    Returns the current mode string: "auto" | "manual".
    """
    global _current_mode, _manual_cmd

    # ── Mode ──────────────────────────────────────────────────────────────────
    mode_resp = _backend_get("/mode/current")
    if mode_resp and "mode" in mode_resp:
        _current_mode = mode_resp["mode"]

    # ── Manual motor commands ─────────────────────────────────────────────────
    if _current_mode == "manual":
        status = _backend_get("/motor/status")
        if status:
            running   = status.get("running", False)
            pump_a    = status.get("pump_a",    False)
            pump_b    = status.get("pump_b",    False)
            main_pump = status.get("main_pump", False)

            with _manual_lock:
                if running:
                    # Website pressed ON — cache the command for execution
                    _manual_cmd = {
                        "pump_a":    pump_a,
                        "pump_b":    pump_b,
                        "main_pump": main_pump,
                    }
                    logger.info(
                        "Manual command received: PA=%s PB=%s Main=%s",
                        pump_a, pump_b, main_pump,
                    )
                else:
                    # Website pressed OFF or idle
                    _manual_cmd = None

    else:
        with _manual_lock:
            _manual_cmd = None   # clear any stale manual command in auto mode

    return _current_mode


def _execute_manual_command():
    """
    Execute the cached manual motor command from the website.
    Called inside the main loop when mode == "manual".
    """
    with _manual_lock:
        cmd = _manual_cmd

    if cmd is None:
        # No active command — make sure everything is off
        nodemcu_serial.pump_a(0)
        nodemcu_serial.pump_b(0)
        nodemcu_serial.main_pump(0)
        nodemcu_serial.set_led("green")
        nodemcu_serial.update_oled("Manual Mode", "Waiting cmd…", "", "")
        return

    pa   = int(bool(cmd.get("pump_a",    False)))
    pb   = int(bool(cmd.get("pump_b",    False)))
    main = int(bool(cmd.get("main_pump", False)))

    logger.info("Executing manual cmd: PA=%d PB=%d Main=%d", pa, pb, main)
    lilygo_serial.log(f"Manual: PA={pa} PB={pb} Main={main}")

    nodemcu_serial.pump_a(pa)
    nodemcu_serial.pump_b(pb)
    nodemcu_serial.main_pump(main)
    nodemcu_serial.set_led("yellow" if (pa or pb or main) else "green")
    nodemcu_serial.update_oled(
        "MANUAL MODE",
        f"PA:{pa} PB:{pb} Main:{main}",
        "Via website",
        "",
    )


# =============================================================================
# Sensor reading
# =============================================================================

def _read_all_sensors() -> dict:
    data = {}

    # ── DHT22 — GPIO4 ─────────────────────────────────────────────────────────
    try:
        dht = sensor_dht.read_dht22()
        data.update(dht)
        logger.info("DHT22 → Temp:%.1f°C  Hum:%.1f%%",
                    dht["temperature"], dht["humidity"])
    except Exception as e:
        logger.warning("DHT22 failed: %s — using demo values", e)
        data["temperature"] = round(random.uniform(22.0, 34.0), 1)
        data["humidity"]    = round(random.uniform(50.0, 85.0), 1)

    # ── NPK — /dev/npk (ttyAMA0 PL011), MAX485 on GPIO14/15/17 ───────────────
    # sensor_npk.read_npk() never raises — it returns demo values internally.
    # But if it does raise for any reason, we fall back here too.
    try:
        npk = sensor_npk.read_npk()
        data.update(npk)
        logger.info("NPK → N:%d P:%d K:%d mg/kg",
                    npk["N"], npk["P"], npk["K"])
    except Exception as e:
        logger.warning("NPK failed: %s — using demo values", e)
        data["N"] = random.randint(20, 80)
        data["P"] = random.randint(10, 50)
        data["K"] = random.randint(30, 90)

    # ── Tank level — HC-SR04 US1, TRIG=GPIO23, ECHO=GPIO24 ───────────────────
    try:
        us1 = sensor_ultrasonic.read_tank_level()
        data["tank_level"] = us1["level_pct"]
        logger.info("Tank level → %.1f%%", us1["level_pct"])
        if us1["level_pct"] < MIN_TANK_LEVEL_PCT:
            logger.warning("⚠ Tank LOW: %.1f%%", us1["level_pct"])
            nodemcu_serial.update_oled(
                "TANK LOW!",
                f"{us1['level_pct']:.0f}% remaining",
                "Refill soon", "")
            lilygo_serial.log(f"⚠ TANK LOW: {us1['level_pct']:.1f}%", "WARN")
    except Exception as e:
        logger.warning("US1 (tank) failed: %s — using demo value", e)
        data["tank_level"] = round(random.uniform(40.0, 95.0), 1)

    # ── Mix concentration — HC-SR04 US2, TRIG=GPIO25, ECHO=GPIO8 ─────────────
    try:
        us2 = sensor_ultrasonic.read_concentration()
        data["concentration"] = us2["concentration_pct"]
        logger.info("Concentration → %.1f%%", us2["concentration_pct"])
        if us2["concentration_pct"] < MIN_CONCENTRATION_PCT:
            logger.warning("⚠ Mix conc LOW: %.1f%%", us2["concentration_pct"])
            lilygo_serial.log(
                f"⚠ MIX LOW: {us2['concentration_pct']:.1f}%", "WARN")
    except Exception as e:
        logger.warning("US2 (concentration) failed: %s — using demo value", e)
        data["concentration"] = round(random.uniform(40.0, 90.0), 1)

    return data


# =============================================================================
# Graceful shutdown
# =============================================================================

_running = True


def _shutdown(signum, frame):
    global _running
    logger.info("Shutdown signal received — finishing current cycle…")
    _running = False


signal.signal(signal.SIGINT,  _shutdown)
signal.signal(signal.SIGTERM, _shutdown)


# =============================================================================
# Main loop
# =============================================================================

def main():
    logger.info("=" * 55)
    logger.info("Intelligent Pesticide Sprinkling System STARTING")
    logger.info("Team OJAS · NIT Hamirpur · Dr. Katam Nishanth")
    logger.info("Device map:")
    logger.info("  NPK      → %s  (ttyAMA0 PL011)", NPK_PORT)
    logger.info("  LilyGo   → %s",                  LILYGO_PORT)
    logger.info("  NodeMCU  → %s",                  NODEMCU_PORT)
    logger.info("  Backend  → %s",                  BACKEND_URL)
    logger.info("=" * 55)

    _ensure_csv()

    lilygo_serial.log("=== OJAS System BOOT ===")
    lilygo_serial.log(f"NPK     → {NPK_PORT}")
    lilygo_serial.log(f"NodeMCU → {NODEMCU_PORT}")
    lilygo_serial.log(f"Backend → {BACKEND_URL}")

    nodemcu_serial.update_oled("Team OJAS", "NIT Hamirpur", "System BOOT", "")
    nodemcu_serial.set_led("yellow")
    time.sleep(2)
    nodemcu_serial.set_led("green")
    nodemcu_serial.update_oled("System READY", "Waiting 1st cycle", "", "")

    while _running:
        cycle_start = time.time()
        logger.info("─── New cycle ───")
        lilygo_serial.log("─── New scan cycle ───")

        # ── Step 1: Poll backend for mode + manual commands ───────────────────
        mode = _poll_backend_mode_and_commands()
        logger.info("Mode: %s", mode)
        lilygo_serial.log(f"Mode: {mode.upper()}")

        if mode == "manual":
            # In manual mode: execute website button commands, skip auto logic
            nodemcu_serial.set_led("yellow")
            _execute_manual_command()

            # Still read sensors and log to CSV so frontend charts keep updating
            sensor_data   = _read_all_sensors()
            gemini_result = {
                "disease": "manual_mode", "severity": "none",
                "confidence": 0.0,
                "treatment": "System in manual mode.",
                "pump_a":    int(bool(_manual_cmd and _manual_cmd.get("pump_a"))),
                "pump_b":    int(bool(_manual_cmd and _manual_cmd.get("pump_b"))),
                "main_pump": int(bool(_manual_cmd and _manual_cmd.get("main_pump"))),
                "spray_duration_seconds": 0,
                "notes": "Manual override via website.",
            }
            _log_to_csv(sensor_data, gemini_result)

        else:
            # ── Auto mode: full pipeline ──────────────────────────────────────
            nodemcu_serial.set_led("yellow")
            nodemcu_serial.update_oled("Scanning…", "Please wait", "", "")

            # Step 2: Camera
            image_path = None
            try:
                image_path = camera_capture.capture_image()
                logger.info("Image captured: %s", image_path)
                lilygo_serial.log("Camera: captured OK")
            except Exception as e:
                logger.error("Camera failed: %s — Gemini will use demo", e)
                lilygo_serial.log(f"Camera FAIL: {e}", "ERR")

            # Step 3: Sensors — always returns values (demo fallback built in)
            sensor_data = _read_all_sensors()

            # Step 4 & 5: Gemini — always called regardless of camera result
            # If image_path is None/missing, gemini_client returns demo prediction
            image_to_use = image_path if image_path else ""
            lilygo_serial.log("Gemini: sending…")
            gemini_result = gemini_client.analyse(image_to_use, sensor_data)
            lilygo_serial.log(
                f"Gemini: {gemini_result['disease']} "
                f"[{gemini_result['severity']}] "
                f"{gemini_result['confidence']*100:.0f}%"
            )

            # Step 6: NodeMCU commands
            spray_sec = gemini_result.get("spray_duration_seconds", 0)
            logger.info(
                "NodeMCU: PA=%d PB=%d Main=%d Spray=%ds",
                gemini_result["pump_a"], gemini_result["pump_b"],
                gemini_result["main_pump"], spray_sec,
            )
            lilygo_serial.log(
                f"NodeMCU: PA={gemini_result['pump_a']} "
                f"PB={gemini_result['pump_b']} "
                f"Main={gemini_result['main_pump']} "
                f"Spray={spray_sec}s"
            )
            nodemcu_serial.apply_gemini_result(gemini_result, spray_duration=spray_sec)

            # Step 7: LilyGo display
            lilygo_serial.send_status(gemini_result, sensor_data)
            if gemini_result.get("treatment"):
                lilygo_serial.log(f"Rx: {gemini_result['treatment'][:70]}")

            # Step 8: CSV log
            _log_to_csv(sensor_data, gemini_result)

        # ── Cycle timing ──────────────────────────────────────────────────────
        elapsed   = time.time() - cycle_start
        sleep_for = max(0, LOOP_INTERVAL_SECONDS - elapsed)
        logger.info("Cycle done %.1fs — sleeping %.1fs", elapsed, sleep_for)
        lilygo_serial.log(f"Done {elapsed:.1f}s  next {sleep_for:.0f}s")

        # Interruptible sleep — wakes immediately on shutdown signal
        for _ in range(int(sleep_for * 10)):
            if not _running:
                break
            time.sleep(0.1)

    # ── Shutdown ───────────────────────────────────────────────────────────────
    logger.info("Shutting down…")
    lilygo_serial.log("=== OJAS System SHUTDOWN ===")
    nodemcu_serial.update_oled("System OFF", "Goodbye!", "", "")
    nodemcu_serial.set_led("red")
    time.sleep(1)
    nodemcu_serial.all_off()
    nodemcu_serial.cleanup()
    camera_capture.cleanup()
    sensor_dht.cleanup()
    sensor_npk.cleanup()
    sensor_ultrasonic.cleanup()
    lilygo_serial.cleanup()
    logger.info("Shutdown complete.")


if __name__ == "__main__":
    main()
