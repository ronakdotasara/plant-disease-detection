# =============================================================================
# config.py — Intelligent Pesticide Sprinkling System
# Team OJAS · NIT Hamirpur · Dept. of Electrical Engineering
#
# Device paths (after running setup_uart.sh + udev rules):
#   /dev/npk      → NPK MAX485 on RPi hardware UART (PL011 / ttyAMA0)
#   /dev/lilygo   → LilyGo T-Display S3 AMOLED      (USB CDC)
#   /dev/nodemcu  → NodeMCU ESP32/8266               (USB CH340/CP2102)
# =============================================================================

import os
from dotenv import load_dotenv
load_dotenv()

# --- Gemini API ---
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "AIzaSyDJUoyF3RDWcKCSNz50zVAxuAAF7A2kqQM")
GEMINI_MODEL   = "gemini-2.0-flash"

# --- Backend (Render) ---
BACKEND_URL = os.getenv("BACKEND_URL", "https://plant-disease-detection-ddyf.onrender.com")

# --- Serial: LilyGo T-Display S3 AMOLED ---
LILYGO_PORT    = "/dev/lilygo"
LILYGO_BAUD    = 115200

# --- Serial: NodeMCU (OLED + LEDs + pumps + relay) ---
NODEMCU_PORT   = "/dev/nodemcu"
NODEMCU_BAUD   = 115200

# --- NPK Soil Sensor via MAX485 on RPi hardware UART ---
# /dev/npk → /dev/ttyAMA0  (PL011, freed from BT by setup_uart.sh)
# DO NOT use /dev/ttyS0 — it is the unreliable mini-UART (clock drifts)
NPK_PORT      = "/dev/npk"
NPK_BAUD      = 9600
NPK_SLAVE_ID  = 1
NPK_DE_RE_PIN = 17               # GPIO17 — controls MAX485 DE+RE together

# --- DHT22 (Temperature & Humidity) ---
DHT22_PIN = 4

# --- Ultrasonic Sensor 1 (Pesticide Tank Level) ---
US1_TRIG            = 23
US1_ECHO            = 24
US1_MAX_DISTANCE_CM = 30
US1_EMPTY_CM        = 28
US1_FULL_CM         = 3

# --- Ultrasonic Sensor 2 (Mix Concentration Level) ---
US2_TRIG            = 25
US2_ECHO            = 8
US2_MAX_DISTANCE_CM = 20
US2_EMPTY_CM        = 18
US2_FULL_CM         = 2

# --- Pi Camera v2 ---
CAMERA_RESOLUTION   = (1920, 1080)
CAMERA_CAPTURE_PATH = "plant_capture.jpg"

# --- Logging ---
LOG_FILE   = "pesticide_log.csv"
SYSTEM_LOG = "pesticide_system.log"

# --- Timing & Thresholds ---
LOOP_INTERVAL_SECONDS    = 30
MIN_TANK_LEVEL_PCT       = 15
MIN_CONCENTRATION_PCT    = 10
NODEMCU_WATCHDOG_SECONDS = 10

# --- Serial aliases (for nodemcu_serial.py compatibility) ---
SERIAL_PORT    = NODEMCU_PORT
SERIAL_BAUD    = NODEMCU_BAUD
SERIAL_TIMEOUT = 1