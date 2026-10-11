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

LIVE_URL = "https://telegram-route-app.onrender.com/index.html"

async def start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user = update.effective_user
    locations = load_locations()
    
    # Build keyboard with Mini App launcher + top popular locations
    keyboard = [
        [InlineKeyboardButton("🗺️ Open Full Satellite Mini App", web_app=WebAppInfo(url=LIVE_URL))]
    ]
    
    # Add buttons for key locations dynamically from JSON
    for loc in locations[:8]:  # Show top 8 quick buttons
        keyboard.append([InlineKeyboardButton(f"📍 {loc['name']} ({loc['category']})", callback_data=f"nav_{loc['name']}")])

    reply_markup = InlineKeyboardMarkup(keyboard)

    welcome_message = (
        f"👋 Hello {user.first_name}!\n\n"
        f"Welcome to the **DDU Live Campus Navigator**. "
        f"Select a destination below or open the full satellite map to search all blocks and dorms!"
    )
    
    await update.message.reply_text(welcome_message, reply_markup=reply_markup, parse_mode="Markdown")

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
            keyboard = [[InlineKeyboardButton(f"🧭 Start Live Navigation to {match['name']}", web_app=WebAppInfo(url=target_url))]]
            reply_markup = InlineKeyboardMarkup(keyboard)

            await query.message.reply_text(
                f"🎯 **Destination Selected:** `{match['name']}`\n"
                f"Category: `{match['category']}`\n\n"
                f"Click below to launch live GPS guidance straight to this location!",
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