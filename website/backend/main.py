"""
main.py — FastAPI application entrypoint — Agri-Watch OJAS v2
Team OJAS · NIT Hamirpur · Dr. Katam Nishanth

Hardware: RPi 4 + NodeMCU v3 ESP8266 (Serial JSON) + LilyGo T-Display S3 AMOLED
Data flow: RPi CSV log → CSVWatcher → SQLite → REST API → React dashboard
"""
import logging
import threading
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from config import settings
from db.database import init_db
from services.csv_watcher import CSVWatcher
from services.serial_bridge import SerialBridge
from api.routes_sensors import router as sensors_router
from api.routes_disease import router as disease_router
from api.routes_motor import router as motor_router
from api.routes_logs import router as logs_router
from api.routes_mode import router as mode_router
from api.routes_camera import router as camera_router

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
log = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    log.info("Starting Agri-Watch OJAS backend…")
    init_db()

    if settings.SERIAL_PORT and settings.SERIAL_PORT.upper() != "DISABLED":
        sb = SerialBridge(port=settings.SERIAL_PORT, baud=settings.SERIAL_BAUD)
        threading.Thread(target=sb.start, daemon=True, name="Serial-Bridge").start()
        app.state.serial_bridge = sb
        log.info("Serial bridge started on %s.", settings.SERIAL_PORT)
    else:
        app.state.serial_bridge = None
        log.info("Serial bridge disabled (no hardware).")

    if settings.CSV_LOG_PATH and settings.CSV_LOG_PATH.upper() != "DISABLED":
        cw = CSVWatcher(settings.CSV_LOG_PATH)
        threading.Thread(target=cw.start, daemon=True, name="CSV-Watcher").start()
        app.state.csv_watcher = cw
        log.info("CSV watcher started: %s.", settings.CSV_LOG_PATH)
    else:
        app.state.csv_watcher = None
        log.info("CSV watcher disabled (no hardware).")
    yield

    log.info("Shutting down…")
    sb.stop()
    cw.stop()


app = FastAPI(
    title="Agri-Watch OJAS — Pesticide Sprinkling System API",
    version="2.0.0",
    description=(
        "RPi 4 + NodeMCU v3 ESP8266 + LilyGo T-Display S3 AMOLED\n"
        "Serial JSON (no MQTT) · Team OJAS · NIT Hamirpur"
    ),
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], allow_credentials=True,
    allow_methods=["*"], allow_headers=["*"],
)

app.include_router(sensors_router, prefix="/sensors", tags=["Sensors"])
app.include_router(disease_router, prefix="/disease", tags=["Disease"])
app.include_router(motor_router,   prefix="/motor",   tags=["Motor"])
app.include_router(logs_router,    prefix="/logs",    tags=["Logs"])
app.include_router(mode_router,    prefix="/mode",    tags=["Mode"])
app.include_router(camera_router,  prefix="/camera",  tags=["Camera"])


@app.get("/health", tags=["System"])
def health():
    sb = getattr(app.state, "serial_bridge", None)
    return {
        "status": "ok",
        "serial_connected": sb.is_connected() if sb else False,
        "version": "2.0.0",
        "hardware": "RPi4 + NodeMCU v3 ESP8266 + LilyGo T-Display S3 AMOLED",
        "team": "OJAS · NIT Hamirpur",
    }


@app.exception_handler(Exception)
async def global_exc(request, exc):
    log.error("Unhandled: %s", exc, exc_info=True)
    return JSONResponse(status_code=500, content={"detail": "Internal server error"})
