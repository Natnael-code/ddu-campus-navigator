import os
import json
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from dotenv import load_dotenv
from telegram import Update, KeyboardButton, ReplyKeyboardMarkup, WebAppInfo
from telegram.ext import Application, CommandHandler, ContextTypes

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

load_dotenv()
TOKEN = os.getenv("TELEGRAM_TOKEN") or os.getenv("BOT_TOKEN")

# Automatically use Render's dynamic external URL or fallback to localhost
RENDER_URL = os.getenv("RENDER_EXTERNAL_URL") or "http://127.0.0.1:8000"

if not TOKEN:
    logger.error("CRITICAL: BOT_TOKEN is missing from environment variables!")

telegram_app = Application.builder().token(TOKEN).updater(None).build()

async def start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    try:
        user = update.effective_user
        webapp_url = f"{RENDER_URL}/index.html"
        
        keyboard = [
            [
                KeyboardButton("💻 School of Computing", web_app=WebAppInfo(url=f"{webapp_url}?dest=Computing")),
                KeyboardButton("📚 Main Library", web_app=WebAppInfo(url=f"{webapp_url}?dest=Library"))
            ],
            [
                KeyboardButton("🏥 Hospital", web_app=WebAppInfo(url=f"{webapp_url}?dest=Hospital")),
                KeyboardButton("🚪 Mermersa Gate", web_app=WebAppInfo(url=f"{webapp_url}?dest=Mermersa Gate"))
            ],
            [
                KeyboardButton("🗺️ Open Full Map & Search All", web_app=WebAppInfo(url=webapp_url))
            ]
        ]
        
        reply_markup = ReplyKeyboardMarkup(keyboard, resize_keyboard=True)
        welcome_message = (
            f"👋 Hello {user.first_name}!\n\n"
            f"Welcome to the DDU Live Campus Navigator 🏫\n"
            f"Select a destination below to get turn-by-turn live GPS routing and guidance right inside the Mini App!"
        )
        
        await update.message.reply_text(welcome_message, reply_markup=reply_markup)
        logger.info(f"Successfully answered /start for user {user.id}")
    except Exception as e:
        logger.error(f"Error handling /start command: {e}")

telegram_app.add_handler(CommandHandler("start", start))

@asynccontextmanager
async def lifespan(app: FastAPI):
    try:
        await telegram_app.initialize()
        await telegram_app.start()
        webhook_url = f"{RENDER_URL}/webhook"
        await telegram_app.bot.set_webhook(url=webhook_url)
        logger.info(f"Telegram Webhook successfully set to: {webhook_url}")
    except Exception as e:
        logger.error(f"Failed to set Telegram webhook on startup: {e}")
    
    yield
    
    try:
        await telegram_app.stop()
        await telegram_app.shutdown()
    except Exception as e:
        logger.error(f"Error during shutdown: {e}")

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

if os.path.exists(FRONTEND_DIR):
    app.mount("/css", StaticFiles(directory=os.path.join(FRONTEND_DIR, "css")), name="css")
    app.mount("/js", StaticFiles(directory=os.path.join(FRONTEND_DIR, "js")), name="js")

@app.get("/")
@app.get("/index.html")
def serve_index():
    index_file = os.path.join(FRONTEND_DIR, "index.html")
    if os.path.exists(index_file):
        return FileResponse(index_file)
    return {"error": "index.html not found"}, 404

@app.post("/webhook")
async def telegram_webhook(request: Request):
    try:
        data = await request.json()
        logger.info(f"Received webhook payload: {data}")
        update = Update.de_json(data, telegram_app.bot)
        await telegram_app.process_update(update)
    except Exception as e:
        logger.error(f"Error processing webhook update: {e}")
    return Response(status_code=200)