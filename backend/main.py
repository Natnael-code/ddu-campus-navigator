import os
import json
import asyncio
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from dotenv import load_dotenv
from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup, WebAppInfo
from telegram.ext import ApplicationBuilder, CommandHandler, ContextTypes

load_dotenv()
TOKEN = os.getenv("TELEGRAM_TOKEN")

app = FastAPI(title="DDU Campus Navigator API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Robust path handling for Render
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_PATH = os.path.join(BASE_DIR, "data", "locations.json")
FRONTEND_DIR = os.path.abspath(os.path.join(BASE_DIR, "..", "frontend"))

def load_locations():
    if not os.path.exists(DATA_PATH):
        return []
    with open(DATA_PATH, "r", encoding="utf-8") as f:
        return json.load(f)

@app.get("/api/locations")
def get_locations():
    return load_locations()

# Mount frontend files explicitly
if os.path.exists(FRONTEND_DIR):
    app.mount("/css", StaticFiles(directory=os.path.join(FRONTEND_DIR, "css")), name="css")
    app.mount("/js", StaticFiles(directory=os.path.join(FRONTEND_DIR, "js")), name="js")

    @app.get("/")
    @app.get("/index.html")
    def serve_index():
        return FileResponse(os.path.join(FRONTEND_DIR, "index.html"))

LIVE_URL = "https://telegram-route-app.onrender.com/index.html"

async def start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user = update.effective_user
    locations = load_locations()
    
    keyboard = []
    for loc in locations:
        target_url = f"{LIVE_URL}?target={loc['name']}"
        keyboard.append([
            InlineKeyboardButton(
                f"📍 {loc['name']} ({loc['category']})", 
                web_app=WebAppInfo(url=target_url)
            )
        ])

    reply_markup = InlineKeyboardMarkup(keyboard)
    welcome_message = f"👋 Hello {user.first_name}!\n\nClick any building or block below to open live GPS navigation:"
    
    await update.message.reply_text(welcome_message, reply_markup=reply_markup)

@app.on_event("startup")
async def startup_event():
    if TOKEN:
        application = ApplicationBuilder().token(TOKEN).build()
        application.add_handler(CommandHandler("start", start))
        await application.initialize()
        await application.start()
        asyncio.create_task(application.updater.start_polling())