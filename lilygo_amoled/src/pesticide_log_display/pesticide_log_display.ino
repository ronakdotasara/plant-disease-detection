// =============================================================================
// pesticide_log_display.ino — LilyGo T-Display S3 AMOLED Log Viewer
// Team OJAS · NIT Hamirpur · Dept. of Electrical Engineering
// Faculty: Dr. Katam Nishanth
//
// FIX APPLIED:
//   LV_Helper_v9.cpp clashes with newer LVGL v9 because both define
//   lv_tick_get_cb() with incompatible signatures.
//   Resolution: Do NOT call beginLvglHelper().
//   Instead, initialise LVGL manually here using my_tick_get_cb()
//   (a private millis() wrapper that never conflicts with LVGL headers).
//
// Hardware:
//   MCU      : ESP32-S3R8  (8 MB PSRAM, 16 MB Flash)
//   Display  : RM67162 AMOLED  536×240 px
//   Link     : USB-C → RPi /dev/ttyUSB1  @  115200 baud
//
// Board settings (Arduino IDE):
//   Board   : ESP32S3 Dev Module
//   PSRAM   : OPI PSRAM   ← required
//   Flash   : 16 MB
//   Libs    : LilyGo-AMOLED-Series  |  ArduinoJson 6.x  |  lvgl v9
//
// Font sizes used (enable in lv_conf.h):
//   LV_FONT_MONTSERRAT_14  1
//   LV_FONT_MONTSERRAT_16  1
//   LV_FONT_MONTSERRAT_20  1
// =============================================================================

#include <Arduino.h>
#include <LilyGo_AMOLED.h>
#include <LV_Helper.h>        // pulls in lvgl.h — we do NOT call beginLvglHelper()
#include <ArduinoJson.h>

// ─── Display ──────────────────────────────────────────────────────────────────
LilyGo_Class amoled;

#define SCREEN_W  536
#define SCREEN_H  240

// ─── Serial ───────────────────────────────────────────────────────────────────
#define LOG_BAUD  115200

// ─── Layout ───────────────────────────────────────────────────────────────────
#define STATUS_BAR_H   58                                          // ↑ was 44
#define LOG_AREA_TOP   (STATUS_BAR_H + 2)
#define LOG_FONT_H     18                                          // ↑ was 14
#define MAX_LOG_LINES  ((SCREEN_H - LOG_AREA_TOP) / LOG_FONT_H)   // ≈10

// ─── Colour palette ───────────────────────────────────────────────────────────
#define C_BG         lv_color_hex(0x0D1208)
#define C_SURFACE    lv_color_hex(0x1C2514)
#define C_GREEN      lv_color_hex(0x7DB547)
#define C_GREEN2     lv_color_hex(0xA3D15E)
#define C_AMBER      lv_color_hex(0xD4A017)
#define C_AMBER2     lv_color_hex(0xF0BE3A)
#define C_RED        lv_color_hex(0xC94040)
#define C_RED2       lv_color_hex(0xE86060)
#define C_TEAL       lv_color_hex(0x3CB4A0)
#define C_TEXT       lv_color_hex(0xDDE8CC)
#define C_TEXT2      lv_color_hex(0x8FA878)
#define C_TEXT3      lv_color_hex(0x5A6E48)
#define C_BORDER     lv_color_hex(0x3A4A2A)

// ─── LVGL objects ─────────────────────────────────────────────────────────────
static lv_obj_t *scr;
static lv_obj_t *lbl_disease, *lbl_severity, *lbl_time;
static lv_obj_t *lbl_temp, *lbl_humidity, *lbl_tank, *lbl_conc;
static lv_obj_t *dot_pa, *dot_pb, *dot_main;
static lv_obj_t *log_panel;
static lv_obj_t *log_labels[20];

// ─── State ────────────────────────────────────────────────────────────────────
struct Status {
  String disease   = "—";
  String severity  = "none";
  int    pump_a    = 0;
  int    pump_b    = 0;
  int    main_pump = 0;
  float  temp      = -99;
  float  humidity  = -99;
  float  tank      = -99;
  float  conc      = -99;
} status;

String   serialBuf = "";
uint32_t uptime_s  = 0;

// ─── LVGL display flush callback ──────────────────────────────────────────────
static lv_display_t *lvDisplay = nullptr;

static void my_disp_flush(lv_display_t *disp, const lv_area_t *area, uint8_t *px_map)
{
    uint32_t w = (area->x2 - area->x1 + 1);
    uint32_t h = (area->y2 - area->y1 + 1);
    amoled.pushColors(area->x1, area->y1, w, h, (uint16_t *)px_map);
    lv_display_flush_ready(disp);
}

// ─── PRIVATE tick source ──────────────────────────────────────────────────────
static uint32_t my_tick_get_cb(void)
{
    return (uint32_t)millis();
}

// ─── Manual LVGL init ────────────────────────────────────────────────────────
#define DRAW_BUF_LINES  20
static lv_color_t *drawBuf1 = nullptr;
static lv_color_t *drawBuf2 = nullptr;

void initLvgl()
{
    drawBuf1 = (lv_color_t *)ps_malloc(SCREEN_W * DRAW_BUF_LINES * sizeof(lv_color_t));
    drawBuf2 = (lv_color_t *)ps_malloc(SCREEN_W * DRAW_BUF_LINES * sizeof(lv_color_t));
    assert(drawBuf1 && drawBuf2);

    lv_init();
    lv_tick_set_cb(my_tick_get_cb);

    lvDisplay = lv_display_create(SCREEN_W, SCREEN_H);
    lv_display_set_color_format(lvDisplay, LV_COLOR_FORMAT_RGB565);
    lv_display_set_flush_cb(lvDisplay, my_disp_flush);
    lv_display_set_buffers(lvDisplay,
                           drawBuf1, drawBuf2,
                           SCREEN_W * DRAW_BUF_LINES * sizeof(lv_color_t),
                           LV_DISPLAY_RENDER_MODE_PARTIAL);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
lv_color_t severityColor(const String &sev)
{
    if (sev == "severe")   return C_RED2;
    if (sev == "moderate") return C_AMBER2;
    if (sev == "mild")     return C_AMBER;
    return C_GREEN2;
}

String fmtFloat(float v, int dec = 1)
{
    if (v < -90) return "—";
    char buf[16];
    snprintf(buf, sizeof(buf), "%.*f", dec, v);
    return String(buf);
}

// ─── UI Builder ───────────────────────────────────────────────────────────────
void buildUI()
{
    scr = lv_scr_act();
    lv_obj_set_style_bg_color(scr, C_BG, 0);
    lv_obj_set_style_bg_opa(scr, LV_OPA_COVER, 0);
    lv_obj_clear_flag(scr, LV_OBJ_FLAG_SCROLLABLE);

    // ── Status bar ─────────────────────────────────────────────────────────
    lv_obj_t *bar = lv_obj_create(scr);
    lv_obj_set_size(bar, SCREEN_W, STATUS_BAR_H);
    lv_obj_align(bar, LV_ALIGN_TOP_LEFT, 0, 0);
    lv_obj_set_style_bg_color(bar, C_SURFACE, 0);
    lv_obj_set_style_border_color(bar, C_BORDER, 0);
    lv_obj_set_style_border_width(bar, 1, 0);
    lv_obj_set_style_radius(bar, 0, 0);
    lv_obj_set_style_pad_all(bar, 4, 0);
    lv_obj_clear_flag(bar, LV_OBJ_FLAG_SCROLLABLE);

    // Row 1 ── disease / severity / uptime
    lbl_disease = lv_label_create(bar);
    lv_obj_set_style_text_font(lbl_disease, &lv_font_montserrat_20, 0);   // ↑ was 14
    lv_obj_set_style_text_color(lbl_disease, C_TEXT, 0);
    lv_obj_align(lbl_disease, LV_ALIGN_TOP_LEFT, 2, 0);
    lv_label_set_text(lbl_disease, "Disease: —");

    lbl_severity = lv_label_create(bar);
    lv_obj_set_style_text_font(lbl_severity, &lv_font_montserrat_16, 0);  // ↑ was 12
    lv_obj_set_style_text_color(lbl_severity, C_GREEN2, 0);
    lv_obj_align(lbl_severity, LV_ALIGN_TOP_LEFT, 240, 2);
    lv_label_set_text(lbl_severity, "[none]");

    lbl_time = lv_label_create(bar);
    lv_obj_set_style_text_font(lbl_time, &lv_font_montserrat_16, 0);      // ↑ was 12
    lv_obj_set_style_text_color(lbl_time, C_TEXT3, 0);
    lv_obj_align(lbl_time, LV_ALIGN_TOP_RIGHT, -2, 2);
    lv_label_set_text(lbl_time, "00:00:00");

    // Row 2 ── sensor values
    lbl_temp = lv_label_create(bar);
    lv_obj_set_style_text_font(lbl_temp, &lv_font_montserrat_16, 0);      // ↑ was 12
    lv_obj_set_style_text_color(lbl_temp, C_AMBER2, 0);
    lv_obj_align(lbl_temp, LV_ALIGN_BOTTOM_LEFT, 2, -2);
    lv_label_set_text(lbl_temp, "T:—°C");

    lbl_humidity = lv_label_create(bar);
    lv_obj_set_style_text_font(lbl_humidity, &lv_font_montserrat_16, 0);  // ↑ was 12
    lv_obj_set_style_text_color(lbl_humidity, C_TEAL, 0);
    lv_obj_align(lbl_humidity, LV_ALIGN_BOTTOM_LEFT, 90, -2);             // ↑ x offset was 65
    lv_label_set_text(lbl_humidity, "H:—%");

    lbl_tank = lv_label_create(bar);
    lv_obj_set_style_text_font(lbl_tank, &lv_font_montserrat_16, 0);      // ↑ was 12
    lv_obj_set_style_text_color(lbl_tank, C_TEXT2, 0);
    lv_obj_align(lbl_tank, LV_ALIGN_BOTTOM_LEFT, 175, -2);                // ↑ x offset was 120
    lv_label_set_text(lbl_tank, "Tank:—%");

    lbl_conc = lv_label_create(bar);
    lv_obj_set_style_text_font(lbl_conc, &lv_font_montserrat_16, 0);      // ↑ was 12
    lv_obj_set_style_text_color(lbl_conc, C_TEXT2, 0);
    lv_obj_align(lbl_conc, LV_ALIGN_BOTTOM_LEFT, 290, -2);                // ↑ x offset was 195
    lv_label_set_text(lbl_conc, "Mix:—%");

    // Pump indicator dots
    const char *dotLabels[] = {"PA", "PB", "MN"};
    lv_obj_t  **dots[]      = {&dot_pa, &dot_pb, &dot_main};
    for (int i = 0; i < 3; i++) {
        lv_obj_t *dot = lv_obj_create(bar);
        lv_obj_set_size(dot, 10, 10);                                      // ↑ was 8×8
        lv_obj_set_style_bg_color(dot, C_TEXT3, 0);
        lv_obj_set_style_radius(dot, LV_RADIUS_CIRCLE, 0);
        lv_obj_set_style_border_width(dot, 0, 0);
        lv_obj_align(dot, LV_ALIGN_BOTTOM_RIGHT, -2 - i * 28, -4);        // ↑ spacing was 22
        *dots[i] = dot;

        lv_obj_t *dl = lv_label_create(bar);
        lv_obj_set_style_text_font(dl, &lv_font_montserrat_14, 0);        // ↑ was 12
        lv_obj_set_style_text_color(dl, C_TEXT3, 0);
        lv_obj_align(dl, LV_ALIGN_BOTTOM_RIGHT, -12 - i * 28, -2);
        lv_label_set_text(dl, dotLabels[i]);
    }

    // Separator line
    lv_obj_t *sep = lv_line_create(scr);
    static lv_point_precise_t pts[2] = {{0, STATUS_BAR_H}, {SCREEN_W, STATUS_BAR_H}};
    lv_line_set_points(sep, pts, 2);
    lv_obj_set_style_line_color(sep, C_BORDER, 0);
    lv_obj_set_style_line_width(sep, 1, 0);

    // ── Log panel ──────────────────────────────────────────────────────────
    log_panel = lv_obj_create(scr);
    lv_obj_set_size(log_panel, SCREEN_W, SCREEN_H - LOG_AREA_TOP);
    lv_obj_align(log_panel, LV_ALIGN_TOP_LEFT, 0, LOG_AREA_TOP);
    lv_obj_set_style_bg_color(log_panel, C_BG, 0);
    lv_obj_set_style_bg_opa(log_panel, LV_OPA_COVER, 0);
    lv_obj_set_style_border_width(log_panel, 0, 0);
    lv_obj_set_style_pad_all(log_panel, 2, 0);
    lv_obj_clear_flag(log_panel, LV_OBJ_FLAG_SCROLLABLE);

    for (int i = 0; i < MAX_LOG_LINES; i++) {
        log_labels[i] = lv_label_create(log_panel);
        lv_obj_set_style_text_font(log_labels[i], &lv_font_montserrat_14, 0);  // ↑ was 12
        lv_obj_set_style_text_color(log_labels[i], C_TEXT3, 0);
        lv_obj_set_width(log_labels[i], SCREEN_W - 6);
        lv_obj_align(log_labels[i], LV_ALIGN_TOP_LEFT, 2, i * LOG_FONT_H);
        lv_label_set_long_mode(log_labels[i], LV_LABEL_LONG_CLIP);
        lv_label_set_text(log_labels[i], "");
    }
}

// ─── Circular log buffer ──────────────────────────────────────────────────────
#define LOG_BUF_SIZE  64
static String logBuf[LOG_BUF_SIZE];
static int    logHead  = 0;
static int    logTotal = 0;

void refreshLogDisplay()
{
    int lines = min(logTotal, MAX_LOG_LINES);
    int start = (logHead - lines + LOG_BUF_SIZE) % LOG_BUF_SIZE;

    for (int i = 0; i < MAX_LOG_LINES; i++) {
        if (i < lines) {
            int idx = (start + i) % LOG_BUF_SIZE;
            const String &txt = logBuf[idx];

            lv_color_t col = C_TEXT2;
            if      (txt.indexOf("[ERROR]")  >= 0 || txt.indexOf("FAIL")     >= 0 ||
                     txt.indexOf("severe")   >= 0)                     col = C_RED2;
            else if (txt.indexOf("[WARN]")   >= 0 || txt.indexOf("moderate") >= 0 ||
                     txt.indexOf("mild")     >= 0)                     col = C_AMBER2;
            else if (txt.indexOf("healthy")  >= 0 || txt.indexOf("Spray OFF")>= 0 ||
                     txt.indexOf("READY")    >= 0)                     col = C_GREEN2;
            else if (txt.indexOf("Gemini")   >= 0 || txt.indexOf("Disease")  >= 0)
                                                                        col = C_TEAL;
            else if (i == lines - 1)                                   col = C_TEXT;

            lv_obj_set_style_text_color(log_labels[i], col, 0);
            lv_label_set_text(log_labels[i], txt.c_str());
        } else {
            lv_label_set_text(log_labels[i], "");
        }
    }
}

void addLogLine(const String &line)
{
    logBuf[logHead] = line;
    logHead = (logHead + 1) % LOG_BUF_SIZE;
    if (logTotal < LOG_BUF_SIZE) logTotal++;
    refreshLogDisplay();
}

// ─── Status bar refresh ───────────────────────────────────────────────────────
void refreshStatus()
{
    lv_label_set_text(lbl_disease, ("Disease: " + status.disease).c_str());

    lv_label_set_text(lbl_severity, ("[" + status.severity + "]").c_str());
    lv_obj_set_style_text_color(lbl_severity, severityColor(status.severity), 0);

    lv_label_set_text(lbl_temp,     ("T:"    + fmtFloat(status.temp)     + "°C").c_str());
    lv_label_set_text(lbl_humidity, ("H:"    + fmtFloat(status.humidity) + "%").c_str());
    lv_label_set_text(lbl_tank,     ("Tank:" + fmtFloat(status.tank)     + "%").c_str());
    lv_label_set_text(lbl_conc,     ("Mix:"  + fmtFloat(status.conc)     + "%").c_str());

    lv_obj_set_style_text_color(lbl_tank,
        (status.tank >= 0 && status.tank < 15) ? C_RED2 : C_TEXT2, 0);

    lv_obj_set_style_bg_color(dot_pa,   status.pump_a    ? C_GREEN : C_TEXT3, 0);
    lv_obj_set_style_bg_color(dot_pb,   status.pump_b    ? C_GREEN : C_TEXT3, 0);
    lv_obj_set_style_bg_color(dot_main, status.main_pump ? C_RED   : C_TEXT3, 0);
}

void refreshTime()
{
    uint32_t s = uptime_s;
    uint32_t h = s / 3600; s %= 3600;
    uint32_t m = s / 60;   s %= 60;
    char buf[12];
    snprintf(buf, sizeof(buf), "%02lu:%02lu:%02lu", (unsigned long)h,
                                                    (unsigned long)m,
                                                    (unsigned long)s);
    lv_label_set_text(lbl_time, buf);
}

// ─── JSON status parser ───────────────────────────────────────────────────────
bool parseStatusJson(const String &raw)
{
    StaticJsonDocument<384> doc;
    if (deserializeJson(doc, raw) != DeserializationError::Ok) return false;
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

// ─── Serial input ─────────────────────────────────────────────────────────────
void checkSerial()
{
    while (Serial.available()) {
        char c = (char)Serial.read();
        if (c == '\n' || c == '\r') {
            serialBuf.trim();
            if (serialBuf.length() > 0) {
                if (serialBuf.startsWith("{")) {
                    if (parseStatusJson(serialBuf)) {
                        refreshStatus();
                        addLogLine("[STATUS] " + status.disease
                                   + " | " + status.severity
                                   + " | T:" + fmtFloat(status.temp)
                                   + " H:"   + fmtFloat(status.humidity) + "%");
                    } else {
                        addLogLine(serialBuf);
                    }
                } else {
                    addLogLine(serialBuf);
                }
                serialBuf = "";
            }
        } else {
            if (serialBuf.length() < 512) serialBuf += c;
        }
    }
}

// ─── setup() ──────────────────────────────────────────────────────────────────
void setup()
{
    Serial.begin(LOG_BAUD);

    if (!amoled.begin()) {
        while (1) delay(500);
    }
    amoled.setBrightness(180);

    initLvgl();
    buildUI();

    addLogLine("=== Team OJAS · NIT Hamirpur ===");
    addLogLine("Intelligent Pesticide System");
    addLogLine("LilyGo AMOLED Log Display READY");
    addLogLine("Waiting for RPi log stream...");
    addLogLine("Serial: /dev/ttyUSB1 @ 115200");
}

// ─── loop() ───────────────────────────────────────────────────────────────────
void loop()
{
    checkSerial();
    lv_timer_handler();

    static uint32_t lastSec = 0;
    if (millis() - lastSec >= 1000) {
        lastSec = millis();
        uptime_s++;
        refreshTime();
    }

    delay(5);
}
