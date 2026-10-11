import os
import json
import asyncio
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from dotenv import load_dotenv
from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup, WebAppInfo
from telegram.ext import ApplicationBuilder, CommandHandler, CallbackQueryHandler, ContextTypes

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

DATA_PATH = os.path.join(os.path.dirname(__file__), "data", "locations.json")
FRONTEND_DIR = os.path.join(os.path.dirname(__file__), "..", "frontend")

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
        return FileResponse(os.path.join(FRONTEND_DIR, "index.html"))

LIVE_URL = "https://trainer-track-ai.onrender.com/index.html"  # Update with your render URL if needed

async def start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user = update.effective_user
    locations = load_locations()
    
    keyboard = [
        [InlineKeyboardButton("🗺️ Open Full Satellite Map & Mini App", web_app=WebAppInfo(url=LIVE_URL))]
    ]
    
    # Dynamically add top locations/dorms as buttons
    for loc in locations[:12]:  # Show top available locations
        target_url = f"{LIVE_URL}?target={loc['name']}"
        keyboard.append([InlineKeyboardButton(f"📍 {loc['name']} ({loc['category']})", web_app=WebAppInfo(url=target_url))])

    reply_markup = InlineKeyboardMarkup(keyboard)

    welcome_message = (
        f"👋 Hello {user.first_name}!\n\n"
        f"Welcome to the **DDU Campus Navigator**. "
        f"Find dorms, blocks, and get live step-by-step GPS navigation across campus.\n\n"
        f"Select a destination below or open the full map:"
    )
    
    await update.message.reply_text(welcome_message, reply_markup=reply_markup, parse_mode="Markdown")

@app.on_event("startup")
async def startup_event():
    if TOKEN:
        application = ApplicationBuilder().token(TOKEN).build()
        application.add_handler(CommandHandler("start", start))
        
        await application.initialize()
        await application.start()
        asyncio.create_task(application.updater.start_polling())
        print("🤖 Telegram Bot running with dynamic location buttons!")