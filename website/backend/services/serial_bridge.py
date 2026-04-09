"""
services/serial_bridge.py
Thread-safe serial bridge from the website backend to NodeMCU v3 ESP8266.

Physical link:
  RPi USB-A → NodeMCU Micro-USB = /dev/ttyUSB0 @ 115200 baud
  (Same port as rpi/main.py uses — only ONE process should own the port at a time.
   If backend runs ON the same RPi, stop rpi/main.py before using manual motor control,
   or relay commands through rpi/nodemcu_serial.py via a local HTTP endpoint.)

Protocol: newline-terminated JSON @ 115200 baud (matches NodeMCU firmware)

Commands sent:
  {"cmd":"PUMP_A",    "state":1}   → L298N IN1 (D3/GPIO0)
  {"cmd":"PUMP_B",    "state":0}   → L298N IN3 (D7/GPIO13)
  {"cmd":"MAIN_PUMP", "state":1}   → Relay IN  (D4/GPIO2, active-LOW)
  {"cmd":"LED",       "color":"…"} → Red(D0)|Yellow(D5)|Green(D6)|off
  {"cmd":"OLED",      "line1":"…", …}
  {"cmd":"STATUS"}

Responses:
  {"status":"OK","pump_a":0,"pump_b":0,"main_pump":0,"led":"green"}
  {"status":"BOOT_OK","msg":"NodeMCU ready"}
  {"status":"ERROR","msg":"…"}
"""
import json
import logging
import threading
import time

log = logging.getLogger(__name__)

try:
    import serial
    HAS_SERIAL = True
except ImportError:
    HAS_SERIAL = False
    log.warning("pyserial not installed — serial bridge running in stub mode.")


class SerialBridge:
    def __init__(self, port: str = "/dev/nodemcu", baud: int = 115200):
        self.port  = port
        self.baud  = baud
        self._ser  = None
        self._lock = threading.Lock()
        self._running   = False
        self._connected = False
        self._last_status: dict = {}

    # ── Public API ────────────────────────────────────────────────────────────

    def is_connected(self) -> bool:
        return self._connected

    def get_status(self) -> dict:
        return dict(self._last_status)

    def send(self, payload: dict) -> dict | None:
        """
        Send one JSON command to NodeMCU and return parsed response.
        Returns None on failure — caller should log/warn but not crash.
        """
        if not HAS_SERIAL:
            log.warning("Serial stub: would send %s", payload)
            return {"status": "OK_STUB"}

        with self._lock:
            if self._ser is None or not self._ser.is_open:
                if not self._try_connect():
                    return None
            try:
                line = json.dumps(payload) + "\n"
                self._ser.reset_input_buffer()
                self._ser.write(line.encode("utf-8"))
                raw = self._ser.readline().decode("utf-8", errors="replace").strip()
                if raw:
                    parsed = json.loads(raw)
                    self._last_status = parsed
                    return parsed
            except json.JSONDecodeError as e:
                log.warning("NodeMCU JSON error: %s | raw: %s", e,
                            raw if "raw" in dir() else "")
            except Exception as e:
                log.error("Serial send error: %s", e)
                self._connected = False
                self._ser = None
        return None

    # ── Background reconnect probe ─────────────────────────────────────────────

    def start(self):
        # Disable serial bridge if no port configured
        if not self.port or self.port.lower() == "none":
            log.info("Serial bridge disabled (SERIAL_PORT=%s) — skipping.", self.port)
            return                          # ← exits immediately, no retry loop

        self._running = True
        while self._running:
            if self._ser is None or not self._ser.is_open:
                with self._lock:
                    self._try_connect()
            time.sleep(5)

    def stop(self):
        self._running = False
        with self._lock:
            if self._ser and self._ser.is_open:
                self._ser.close()
        self._connected = False
        log.info("Serial bridge stopped.")

    # ── Internal ──────────────────────────────────────────────────────────────

    def _try_connect(self) -> bool:
        if not HAS_SERIAL:
            return False
        try:
            self._ser = serial.Serial(
                port          = self.port,
                baudrate      = self.baud,
                timeout       = 2,
                write_timeout = 2,
            )
            time.sleep(2)   # NodeMCU resets on USB connect
            self._connected = True
            log.info("Serial bridge connected: %s @ %d baud", self.port, self.baud)
            return True
        except Exception as e:
            log.warning("Serial bridge cannot connect to %s: %s", self.port, e)
            self._ser = None
            self._connected = False
            return False