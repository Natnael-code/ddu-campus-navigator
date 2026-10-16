import os
import json
import logging
from urllib.parse import quote
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse
from dotenv import load_dotenv
from telegram import Update, KeyboardButton, ReplyKeyboardMarkup, WebAppInfo
from telegram.ext import (
    Application,
    CommandHandler,
    MessageHandler,
    ContextTypes,
    filters,
)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

load_dotenv()
TOKEN = (os.getenv("TELEGRAM_TOKEN") or os.getenv("BOT_TOKEN") or "").strip()

# Explicitly ensure the HTTPS scheme and live domain
RENDER_URL = "https://ddu-campus-navigator.onrender.com"

if not TOKEN:
    logger.error("CRITICAL: BOT_TOKEN is missing from environment variables!")

# Only build the bot if a token exists, so the web server still boots
# (and /health, /docs work) even when the token is missing.
telegram_app = (
    Application.builder().token(TOKEN).updater(None).build() if TOKEN else None
)


def build_keyboard() -> ReplyKeyboardMarkup:
    webapp_url = f"{RENDER_URL}/index.html"

    # quote() encodes spaces etc. -- an unencoded space in a web_app URL
    # makes Telegram reject the whole message, so /start looked "dead".
    def dest(name: str) -> WebAppInfo:
        return WebAppInfo(url=f"{webapp_url}?dest={quote(name)}")

    keyboard = [
        [
            KeyboardButton("💻 School of Computing", web_app=dest("Block-15 (School of Computing)")),
            KeyboardButton("📚 Main Library", web_app=dest("Block-32 Main Library")),
        ],
        [
            KeyboardButton("🏥 Hospital", web_app=dest("Hospital")),
            KeyboardButton("🚪 Mermersa Gate", web_app=dest("Mermersa Gate")),
        ],
        [
            KeyboardButton(
                "🗺️ Open Full Map & Search All", web_app=WebAppInfo(url=webapp_url)
            )
        ],
    ]
    return ReplyKeyboardMarkup(keyboard, resize_keyboard=True)


async def start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user = update.effective_user
    welcome_message = (
        f"👋 Hello {user.first_name}!\n\n"
        f"Welcome to the DDU Live Campus Navigator 🏫\n"
        f"Select a destination below to get turn-by-turn live GPS routing and guidance right inside the Mini App!\n\n"
        f"⚠️ For seamless navigation:\n"
        f"📍 Allow location permission when asked\n"
        f"🛰️ Turn ON Location / GPS on your phone"
    )
    try:
        await update.message.reply_text(welcome_message, reply_markup=build_keyboard())
        logger.info(f"Successfully answered /start for user {user.id}")
    except Exception:
        # Full traceback goes to the Render logs
        logger.exception("Error sending /start keyboard")
        # Fallback so the user always gets some reply
        try:
            await update.message.reply_text(
                welcome_message + "\n\n(Menu buttons are temporarily unavailable.)"
            )
        except Exception:
            logger.exception("Fallback /start reply also failed")


async def fallback(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Replies to any other text so the bot never stays silent."""
    if update.message:
        await update.message.reply_text("Send /start to open the campus menu 🏫")


async def on_error(update: object, context: ContextTypes.DEFAULT_TYPE):
    logger.error("Unhandled exception in handler", exc_info=context.error)


if telegram_app:
    telegram_app.add_handler(CommandHandler("start", start))
    telegram_app.add_handler(CommandHandler("help", start))
    telegram_app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, fallback))
    telegram_app.add_error_handler(on_error)


@asynccontextmanager
async def lifespan(app: FastAPI):
    if telegram_app:
        try:
            await telegram_app.initialize()
            await telegram_app.start()
            webhook_url = f"{RENDER_URL}/webhook"
            await telegram_app.bot.set_webhook(
                url=webhook_url,
                drop_pending_updates=True,
                allowed_updates=["message"],
            )
            logger.info(f"Telegram Webhook successfully set to: {webhook_url}")
        except Exception:
            logger.exception("Failed to set Telegram webhook on startup")

    yield

    if telegram_app:
        try:
            await telegram_app.stop()
            await telegram_app.shutdown()
        except Exception:
            logger.exception("Error during shutdown")


app = FastAPI(title="DDU Campus Live Navigator API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_PATH = os.path.join(BASE_DIR, "backend", "data", "locations.json")
FRONTEND_DIR = os.path.join(BASE_DIR, "frontend")


def load_locations():
    if not os.path.exists(DATA_PATH):
        return []
    with open(DATA_PATH, "r", encoding="utf-8") as f:
        return json.load(f)


@app.get("/api/locations")
def get_locations():
    return load_locations()


@app.get("/health")
def health_check():
    return {"status": "ok"}


@app.get("/debug/webhook")
async def debug_webhook():
    """Open in a browser to see Telegram's webhook status (no token exposed)."""
    if not telegram_app:
        return JSONResponse({"error": "BOT_TOKEN missing"}, status_code=500)
    info = await telegram_app.bot.get_webhook_info()
    return {
        "url": info.url,
        "pending_update_count": info.pending_update_count,
        "last_error_date": str(info.last_error_date),
        "last_error_message": info.last_error_message,
    }


if os.path.exists(FRONTEND_DIR):
    app.mount("/css", StaticFiles(directory=os.path.join(FRONTEND_DIR, "css")), name="css")
    app.mount("/js", StaticFiles(directory=os.path.join(FRONTEND_DIR, "js")), name="js")


@app.get("/")
@app.get("/index.html")
def serve_index():
    index_file = os.path.join(FRONTEND_DIR, "index.html")
    if os.path.exists(index_file):
        return FileResponse(index_file)
    return JSONResponse({"error": "index.html not found"}, status_code=404)


@app.post("/webhook")
async def telegram_webhook(request: Request):
    if not telegram_app:
        return Response(status_code=200)
    try:
        data = await request.json()
        logger.info(f"Webhook update received: {data.get('update_id')}")
        update = Update.de_json(data, telegram_app.bot)
        await telegram_app.process_update(update)
    except Exception:
        logger.exception("Error processing webhook update")
    # Always 200 so Telegram doesn't keep retrying a bad update
    return Response(status_code=200)