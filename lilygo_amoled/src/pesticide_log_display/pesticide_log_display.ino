// =============================================================================
// pesticide_log_display.ino — LilyGo T-Display S3 AMOLED Log Viewer
// Team OJAS · NIT Hamirpur · Dept. of Electrical Engineering
// Faculty: Dr. Katam Nishanth
//
// Hardware:
//   MCU      : ESP32-S3R8 (Dual-core LX7, 8MB PSRAM, 16MB Flash)
//   Display  : RM67162 AMOLED (536×240 portrait / 240×536 landscape)
//   Link     : USB-C → RPi USB-A  →  /dev/ttyUSB1 on RPi (115200 baud)
//              (NodeMCU uses /dev/ttyUSB0; this display uses /dev/ttyUSB1)
//
// Function:
//   Receives newline-terminated log strings from RPi via USB serial.
//   Auto-scrolls them on screen — newest at bottom, old lines push up.
//   Also parses special JSON status packets from RPi for the live status bar.
//
// RPi → LilyGo protocol (all newline-terminated):
//   Plain text lines  → appended to scroll buffer as-is
//   JSON status line  → {"lilygo":"status","disease":"…","severity":"…",
//                         "pump_a":0,"pump_b":0,"main_pump":0,
//                         "temp":28.5,"humidity":72.0,
//                         "tank":80.0,"conc":65.0}
//
// Board setup (Arduino IDE or PlatformIO):
//   Board   : LilyGo T-Display S3 AMOLED  (ESP32S3 Dev Module works too)
//   PSRAM   : OPI PSRAM
//   Library : LilyGo-AMOLED-Series  (install via Arduino Library Manager)
//             ArduinoJson 6.x
//
// Install LilyGo library:
//   Arduino IDE → Sketch → Include Library → Manage Libraries
//   Search: "LilyGo AMOLED" → install
// =============================================================================

#include <Arduino.h>
#include <LilyGo_AMOLED.h>
#include <LV_Helper.h>
#include <ArduinoJson.h>

// ─── Display ──────────────────────────────────────────────────────────────────
LilyGo_Class amoled;

// We target the 536×240 landscape layout of the T-Display S3 AMOLED.
// LVGL canvas dimensions
#define SCREEN_W  536
#define SCREEN_H  240

// ─── Serial ───────────────────────────────────────────────────────────────────
// USB-C on LilyGo appears as USB Serial on RPi (/dev/ttyUSB1 typically).
// Serial0 = USB-Serial bridge on ESP32-S3.
#define LOG_BAUD  115200

// ─── Layout constants ─────────────────────────────────────────────────────────
#define STATUS_BAR_H   44    // top status bar height (px)
#define LOG_AREA_TOP   (STATUS_BAR_H + 2)
#define LOG_FONT_H     14    // approx px per line at lv_font_montserrat_12
#define MAX_LOG_LINES  ((SCREEN_H - LOG_AREA_TOP) / LOG_FONT_H)  // ~14 lines

// ─── Colour palette (dark terminal theme) ─────────────────────────────────────
#define C_BG         lv_color_hex(0x0D1208)   // deep dark green-black
#define C_SURFACE    lv_color_hex(0x1C2514)   // card surface
#define C_GREEN      lv_color_hex(0x7DB547)   // healthy / OK
#define C_GREEN2     lv_color_hex(0xA3D15E)   // text highlight
#define C_AMBER      lv_color_hex(0xD4A017)   // warning
#define C_AMBER2     lv_color_hex(0xF0BE3A)
#define C_RED        lv_color_hex(0xC94040)   // error / severe
#define C_RED2       lv_color_hex(0xE86060)
#define C_TEAL       lv_color_hex(0x3CB4A0)
#define C_TEXT       lv_color_hex(0xDDE8CC)
#define C_TEXT2      lv_color_hex(0x8FA878)
#define C_TEXT3      lv_color_hex(0x5A6E48)
#define C_BORDER     lv_color_hex(0x3A4A2A)

// ─── LVGL objects ─────────────────────────────────────────────────────────────
static lv_obj_t *scr;

// Status bar widgets
static lv_obj_t *lbl_disease;
static lv_obj_t *lbl_severity;
static lv_obj_t *lbl_temp;
static lv_obj_t *lbl_humidity;
static lv_obj_t *lbl_tank;
static lv_obj_t *lbl_conc;
static lv_obj_t *dot_pa, *dot_pb, *dot_main;
static lv_obj_t *lbl_time;

// Log area
static lv_obj_t *log_panel;
static lv_obj_t *log_labels[20];   // pool of label objects (reused)
static int       log_count = 0;

// ─── State ────────────────────────────────────────────────────────────────────
struct Status {
  String disease  = "—";
  String severity = "none";
  int    pump_a   = 0;
  int    pump_b   = 0;
  int    main_pump = 0;
  float  temp     = -99;
  float  humidity = -99;
  float  tank     = -99;
  float  conc     = -99;
} status;

String  serialBuf = "";
uint32_t uptime_s  = 0;

// ─── Helpers ──────────────────────────────────────────────────────────────────
lv_color_t severityColor(const String& sev) {
  if (sev == "severe")   return C_RED2;
  if (sev == "moderate") return C_AMBER2;
  if (sev == "mild")     return C_AMBER;
  return C_GREEN2;
}

String fmtFloat(float v, int dec = 1) {
  if (v < -90) return "—";
  char buf[16];
  snprintf(buf, sizeof(buf), "%.*f", dec, v);
  return String(buf);
}

// ─── UI Builder ───────────────────────────────────────────────────────────────
void buildUI() {
  scr = lv_scr_act();
  lv_obj_set_style_bg_color(scr, C_BG, 0);
  lv_obj_set_style_bg_opa(scr, LV_OPA_COVER, 0);
  lv_obj_clear_flag(scr, LV_OBJ_FLAG_SCROLLABLE);

  // ── Status bar ─────────────────────────────────────────────────────────────
  lv_obj_t *bar = lv_obj_create(scr);
  lv_obj_set_size(bar, SCREEN_W, STATUS_BAR_H);
  lv_obj_align(bar, LV_ALIGN_TOP_LEFT, 0, 0);
  lv_obj_set_style_bg_color(bar, C_SURFACE, 0);
  lv_obj_set_style_border_color(bar, C_BORDER, 0);
  lv_obj_set_style_border_width(bar, 1, 0);
  lv_obj_set_style_radius(bar, 0, 0);
  lv_obj_set_style_pad_all(bar, 4, 0);
  lv_obj_clear_flag(bar, LV_OBJ_FLAG_SCROLLABLE);

  // Row 1: disease label + severity chip + uptime
  lbl_disease = lv_label_create(bar);
  lv_obj_set_style_text_font(lbl_disease, &lv_font_montserrat_14, 0);
  lv_obj_set_style_text_color(lbl_disease, C_TEXT, 0);
  lv_obj_align(lbl_disease, LV_ALIGN_TOP_LEFT, 2, 0);
  lv_label_set_text(lbl_disease, "Disease: —");

  lbl_severity = lv_label_create(bar);
  lv_obj_set_style_text_font(lbl_severity, &lv_font_montserrat_12, 0);
  lv_obj_set_style_text_color(lbl_severity, C_GREEN2, 0);
  lv_obj_align(lbl_severity, LV_ALIGN_TOP_LEFT, 200, 2);
  lv_label_set_text(lbl_severity, "[none]");

  lbl_time = lv_label_create(bar);
  lv_obj_set_style_text_font(lbl_time, &lv_font_montserrat_10, 0);
  lv_obj_set_style_text_color(lbl_time, C_TEXT3, 0);
  lv_obj_align(lbl_time, LV_ALIGN_TOP_RIGHT, -2, 2);
  lv_label_set_text(lbl_time, "00:00:00");

  // Row 2: sensor values
  lbl_temp = lv_label_create(bar);
  lv_obj_set_style_text_font(lbl_temp, &lv_font_montserrat_10, 0);
  lv_obj_set_style_text_color(lbl_temp, C_AMBER2, 0);
  lv_obj_align(lbl_temp, LV_ALIGN_BOTTOM_LEFT, 2, -2);
  lv_label_set_text(lbl_temp, "T:—°C");

  lbl_humidity = lv_label_create(bar);
  lv_obj_set_style_text_font(lbl_humidity, &lv_font_montserrat_10, 0);
  lv_obj_set_style_text_color(lbl_humidity, C_TEAL, 0);
  lv_obj_align(lbl_humidity, LV_ALIGN_BOTTOM_LEFT, 65, -2);
  lv_label_set_text(lbl_humidity, "H:—%");

  lbl_tank = lv_label_create(bar);
  lv_obj_set_style_text_font(lbl_tank, &lv_font_montserrat_10, 0);
  lv_obj_set_style_text_color(lbl_tank, C_TEXT2, 0);
  lv_obj_align(lbl_tank, LV_ALIGN_BOTTOM_LEFT, 120, -2);
  lv_label_set_text(lbl_tank, "Tank:—%");

  lbl_conc = lv_label_create(bar);
  lv_obj_set_style_text_font(lbl_conc, &lv_font_montserrat_10, 0);
  lv_obj_set_style_text_color(lbl_conc, C_TEXT2, 0);
  lv_obj_align(lbl_conc, LV_ALIGN_BOTTOM_LEFT, 195, -2);
  lv_label_set_text(lbl_conc, "Mix:—%");

  // Pump dots (Pump A, Pump B, Main)
  const char* dotLabels[] = {"PA", "PB", "MN"};
  lv_obj_t **dots[] = {&dot_pa, &dot_pb, &dot_main};
  for (int i = 0; i < 3; i++) {
    lv_obj_t *dot = lv_obj_create(bar);
    lv_obj_set_size(dot, 8, 8);
    lv_obj_set_style_bg_color(dot, C_TEXT3, 0);
    lv_obj_set_style_radius(dot, LV_RADIUS_CIRCLE, 0);
    lv_obj_set_style_border_width(dot, 0, 0);
    lv_obj_align(dot, LV_ALIGN_BOTTOM_RIGHT, -2 - i * 22, -4);
    *dots[i] = dot;

    lv_obj_t *dl = lv_label_create(bar);
    lv_obj_set_style_text_font(dl, &lv_font_montserrat_8, 0);
    lv_obj_set_style_text_color(dl, C_TEXT3, 0);
    lv_obj_align(dl, LV_ALIGN_BOTTOM_RIGHT, -10 - i * 22, -2);
    lv_label_set_text(dl, dotLabels[i]);
  }

  // Separator line
  lv_obj_t *sep = lv_line_create(scr);
  static lv_point_t pts[2] = {{0, STATUS_BAR_H}, {SCREEN_W, STATUS_BAR_H}};
  lv_line_set_points(sep, pts, 2);
  lv_obj_set_style_line_color(sep, C_BORDER, 0);
  lv_obj_set_style_line_width(sep, 1, 0);

  // ── Log area ───────────────────────────────────────────────────────────────
  log_panel = lv_obj_create(scr);
  lv_obj_set_size(log_panel, SCREEN_W, SCREEN_H - LOG_AREA_TOP);
  lv_obj_align(log_panel, LV_ALIGN_TOP_LEFT, 0, LOG_AREA_TOP);
  lv_obj_set_style_bg_color(log_panel, C_BG, 0);
  lv_obj_set_style_bg_opa(log_panel, LV_OPA_COVER, 0);
  lv_obj_set_style_border_width(log_panel, 0, 0);
  lv_obj_set_style_pad_all(log_panel, 2, 0);
  lv_obj_clear_flag(log_panel, LV_OBJ_FLAG_SCROLLABLE);

  // Pre-create label pool
  for (int i = 0; i < MAX_LOG_LINES; i++) {
    log_labels[i] = lv_label_create(log_panel);
    lv_obj_set_style_text_font(log_labels[i], &lv_font_montserrat_10, 0);
    lv_obj_set_style_text_color(log_labels[i], C_TEXT3, 0);
    lv_obj_set_width(log_labels[i], SCREEN_W - 6);
    lv_obj_align(log_labels[i], LV_ALIGN_TOP_LEFT, 2, i * LOG_FONT_H);
    lv_label_set_long_mode(log_labels[i], LV_LABEL_LONG_CLIP);
    lv_label_set_text(log_labels[i], "");
  }
}

// ─── Log Scroll ───────────────────────────────────────────────────────────────
// Ring-buffer of line strings; displayed oldest→newest top→bottom.
#define LOG_BUF_SIZE  64
static String logBuf[LOG_BUF_SIZE];
static int    logHead = 0;   // next write position
static int    logTotal = 0;  // total lines received

void addLogLine(const String& line) {
  logBuf[logHead] = line;
  logHead = (logHead + 1) % LOG_BUF_SIZE;
  if (logTotal < LOG_BUF_SIZE) logTotal++;
  refreshLogDisplay();
}

void refreshLogDisplay() {
  int lines = min(logTotal, MAX_LOG_LINES);
  int start = (logHead - lines + LOG_BUF_SIZE) % LOG_BUF_SIZE;

  for (int i = 0; i < MAX_LOG_LINES; i++) {
    if (i < lines) {
      int idx = (start + i) % LOG_BUF_SIZE;
      const String& txt = logBuf[idx];

      // Colour by content keywords
      lv_color_t col = C_TEXT2;
      if (txt.indexOf("[ERROR]") >= 0 || txt.indexOf("FAIL") >= 0 ||
          txt.indexOf("severe") >= 0)          col = C_RED2;
      else if (txt.indexOf("[WARN]") >= 0 ||
               txt.indexOf("moderate") >= 0 ||
               txt.indexOf("mild") >= 0)       col = C_AMBER2;
      else if (txt.indexOf("healthy") >= 0 ||
               txt.indexOf("Spray OFF") >= 0 ||
               txt.indexOf("READY") >= 0)      col = C_GREEN2;
      else if (txt.indexOf("Gemini") >= 0 ||
               txt.indexOf("Disease") >= 0)    col = C_TEAL;
      else if (i == lines - 1)                 col = C_TEXT;   // newest = brightest

      lv_obj_set_style_text_color(log_labels[i], col, 0);
      lv_label_set_text(log_labels[i], txt.c_str());
    } else {
      lv_label_set_text(log_labels[i], "");
    }
  }
}

// ─── Status Bar Refresh ───────────────────────────────────────────────────────
void refreshStatus() {
  // Disease + severity
  String dLabel = "Disease: " + status.disease;
  lv_label_set_text(lbl_disease, dLabel.c_str());

  String sevTag = "[" + status.severity + "]";
  lv_label_set_text(lbl_severity, sevTag.c_str());
  lv_obj_set_style_text_color(lbl_severity, severityColor(status.severity), 0);

  // Sensor values
  String tStr = "T:" + fmtFloat(status.temp)     + "°C";
  String hStr = "H:" + fmtFloat(status.humidity) + "%";
  String kStr = "Tank:" + fmtFloat(status.tank)  + "%";
  String cStr = "Mix:"  + fmtFloat(status.conc)  + "%";
  lv_label_set_text(lbl_temp,     tStr.c_str());
  lv_label_set_text(lbl_humidity, hStr.c_str());
  lv_label_set_text(lbl_tank,     kStr.c_str());
  lv_label_set_text(lbl_conc,     cStr.c_str());

  // Tank warning
  lv_color_t tankCol = (status.tank >= 0 && status.tank < 15) ? C_RED2 : C_TEXT2;
  lv_obj_set_style_text_color(lbl_tank, tankCol, 0);

  // Pump dots
  lv_obj_set_style_bg_color(dot_pa,   status.pump_a    ? C_GREEN : C_TEXT3, 0);
  lv_obj_set_style_bg_color(dot_pb,   status.pump_b    ? C_GREEN : C_TEXT3, 0);
  lv_obj_set_style_bg_color(dot_main, status.main_pump ? C_RED   : C_TEXT3, 0);
}

void refreshTime() {
  uint32_t s  = uptime_s;
  uint32_t h  = s / 3600; s %= 3600;
  uint32_t m  = s / 60;   s %= 60;
  char buf[12];
  snprintf(buf, sizeof(buf), "%02lu:%02lu:%02lu", h, m, s);
  lv_label_set_text(lbl_time, buf);
}

// ─── JSON Status Parser ───────────────────────────────────────────────────────
bool parseStatusJson(const String& raw) {
  StaticJsonDocument<384> doc;
  DeserializationError err = deserializeJson(doc, raw);
  if (err) return false;
  if (!doc.containsKey("lilygo")) return false;

  status.disease   = doc["disease"]   | "—";
  status.severity  = doc["severity"]  | "none";
  status.pump_a    = doc["pump_a"]    | 0;
  status.pump_b    = doc["pump_b"]    | 0;
  status.main_pump = doc["main_pump"] | 0;
  status.temp      = doc["temp"]      | -99.0f;
  status.humidity  = doc["humidity"]  | -99.0f;
  status.tank      = doc["tank"]      | -99.0f;
  status.conc      = doc["conc"]      | -99.0f;
  return true;
}

// ─── Serial Input ─────────────────────────────────────────────────────────────
void checkSerial() {
  while (Serial.available()) {
    char c = (char)Serial.read();
    if (c == '\n' || c == '\r') {
      serialBuf.trim();
      if (serialBuf.length() > 0) {
        if (serialBuf.startsWith("{")) {
          // Try JSON status packet first
          if (parseStatusJson(serialBuf)) {
            refreshStatus();
            // Also echo to log as a compact line
            String logLine = "[STATUS] " + status.disease
                           + " | " + status.severity
                           + " | T:" + fmtFloat(status.temp)
                           + " H:" + fmtFloat(status.humidity) + "%";
            addLogLine(logLine);
          } else {
            addLogLine(serialBuf);   // unknown JSON — show raw
          }
        } else {
          addLogLine(serialBuf);    // plain text log line
        }
        serialBuf = "";
      }
    } else {
      if (serialBuf.length() < 512) serialBuf += c;
    }
  }
}

// ─── setup() ──────────────────────────────────────────────────────────────────
void setup() {
  Serial.begin(LOG_BAUD);

  // Initialise AMOLED display
  // begin() auto-detects the T-Display S3 AMOLED and configures RM67162
  if (!amoled.begin()) {
    // If display fails, keep trying — don't hang
    while (1) { delay(500); }
  }

  // Set brightness (0–255)
  amoled.setBrightness(180);

  // Init LVGL helper (provided by LilyGo-AMOLED-Series library)
  beginLvglHelper(amoled);

  buildUI();

  // Boot message
  addLogLine("=== Team OJAS · NIT Hamirpur ===");
  addLogLine("Intelligent Pesticide System");
  addLogLine("LilyGo AMOLED Log Display READY");
  addLogLine("Waiting for RPi log stream...");
  addLogLine("Serial: /dev/ttyUSB1 @ 115200");
}

// ─── loop() ───────────────────────────────────────────────────────────────────
void loop() {
  checkSerial();
  lv_timer_handler();   // LVGL tick

  // Uptime counter (1-second resolution via millis)
  static uint32_t lastSec = 0;
  if (millis() - lastSec >= 1000) {
    lastSec = millis();
    uptime_s++;
    refreshTime();
  }

  delay(5);   // ~200 fps max; keeps LVGL responsive
}
