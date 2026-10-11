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

# Paths
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

# Serve Frontend Static Files safely
if os.path.exists(FRONTEND_DIR):
    app.mount("/css", StaticFiles(directory=os.path.join(FRONTEND_DIR, "css")), name="css")
    app.mount("/js", StaticFiles(directory=os.path.join(FRONTEND_DIR, "js")), name="js")

    @app.get("/")
    @app.get("/index.html")
    def serve_index():
        return FileResponse(os.path.join(FRONTEND_DIR, "index.html"))

# Replace with your actual live Render URL
LIVE_URL = "https://telegram-route-app.onrender.com/index.html"

async def start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user = update.effective_user
    locations = load_locations()
    
    # Main button to open full map
    keyboard = [
        [InlineKeyboardButton("🗺️ Open Full Satellite Map & Search All", web_app=WebAppInfo(url=LIVE_URL))]
    ]
    
    # Add a button for EVERY location so students can click any block/dorm directly
    for loc in locations:
        keyboard.append([InlineKeyboardButton(f"📍 {loc['name']} ({loc['category']})", callback_data=f"nav_{loc['name']}")])

    reply_markup = InlineKeyboardMarkup(keyboard)

    welcome_message = (
        f"👋 Hello {user.first_name}!\n\n"
        f"Welcome to the **DDU Live Campus Navigator**. "
        f"Choose any block, dorm, or building below to start live GPS navigation, or open the full map!"
    )
    
    await update.message.reply_text(welcome_message, reply_markup=reply_markup)

async def button_handler(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    await query.answer()

    data = query.data
    if data.startswith("nav_"):
        building_name = data.replace("nav_", "")
        locations = load_locations()
        match = next((loc for loc in locations if loc["name"].lower() == building_name.lower()), None)

        if match:
            target_url = f"{LIVE_URL}?target={match['name']}"
            keyboard = [[InlineKeyboardButton(f"🧭 Start Navigation to {match['name']}", web_app=WebAppInfo(url=target_url))]]
            reply_markup = InlineKeyboardMarkup(keyboard)

            await query.message.reply_text(
                f"🎯 **Destination:** `{match['name']}`\n"
                f"Category: `{match['category']}`\n\n"
                f"Click below to launch live GPS guidance!",
                reply_markup=reply_markup,
                parse_mode="Markdown"
            )

@app.on_event("startup")
async def startup_event():
    if TOKEN:
        application = ApplicationBuilder().token(TOKEN).build()
        application.add_handler(CommandHandler("start", start))
        application.add_handler(CallbackQueryHandler(button_handler))
        await application.initialize()
        await application.start()
        asyncio.create_task(application.updater.start_polling())
        print("🤖 Telegram Bot polling started successfully!")