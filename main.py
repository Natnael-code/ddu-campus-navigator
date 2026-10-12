import os
import json
import asyncio
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from dotenv import load_dotenv
from telegram import Update, KeyboardButton, ReplyKeyboardMarkup, WebAppInfo
from telegram.ext import Application, CommandHandler, ContextTypes
from telegram.request import HTTPXRequest

load_dotenv()
TOKEN = os.getenv("TELEGRAM_TOKEN") or os.getenv("BOT_TOKEN")

app = FastAPI(title="DDU Campus Live Navigator API")

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

LIVE_URL = "https://telegram-route-app.onrender.com/index.html"

async def start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user = update.effective_user
    locations = load_locations()
    
    # Create quick reply buttons for popular destinations (School of Computing, Library, Hospital, Gates, etc.)
    keyboard = [
        [
            KeyboardButton("💻 Block-15 (Computing) - Live GPS", web_app=WebAppInfo(url=f"{LIVE_URL}?dest=Block-15 (School of Computing)&start=gps")),
            KeyboardButton("📚 Main Library - Live GPS", web_app=WebAppInfo(url=f"{LIVE_URL}?dest=Main Library&start=gps"))
        ],
        [
            KeyboardButton("🏥 Hospital - Live GPS", web_app=WebAppInfo(url=f"{LIVE_URL}?dest=Hospital&start=gps")),
            KeyboardButton("🚪 Mermersa Gate - Live GPS", web_app=WebAppInfo(url=f"{LIVE_URL}?dest=Mermersa Gate&start=gps"))
        ],
        [
            KeyboardButton("🗺️ Open Full Map & Search All Buildings", web_app=WebAppInfo(url=LIVE_URL))
        ]
    ]
    
    reply_markup = ReplyKeyboardMarkup(keyboard, resize_keyboard=True)
    
    welcome_message = (
        f"👋 Hello {user.first_name}!\n\n"
        f"Welcome to the **DDU Live Campus Navigator** 🏫\n"
        f"Select a destination below to get turn-by-turn live GPS routing and guidance right inside the Mini App!"
    )
    
    await update.message.reply_text(welcome_message, reply_markup=reply_markup)

@app.on_event("startup")
async def startup_event():
    if TOKEN:
        request = HTTPXRequest(connect_timeout=30.0, read_timeout=30.0)
        application = Application.builder().token(TOKEN).request(request).build()
        application.add_handler(CommandHandler("start", start))
        await application.initialize()
        await application.start()
        asyncio.create_task(application.updater.start_polling(drop_pending_updates=True))
        print("🤖 Telegram Bot & FastAPI started successfully!")