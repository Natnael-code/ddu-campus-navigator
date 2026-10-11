import os
import json
import asyncio
from fastapi import FastAPI, HTTPException
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
# Point to your frontend folder relative to backend/main.py
FRONTEND_DIR = os.path.join(os.path.dirname(__file__), "..", "frontend")

def load_locations():
    if not os.path.exists(DATA_PATH):
        return []
    with open(DATA_PATH, "r", encoding="utf-8") as f:
        return json.load(f)

@app.get("/api/locations")
def get_locations():
    return load_locations()

# Serve frontend static files so your mini-app loads directly from Render
if os.path.exists(FRONTEND_DIR):
    app.mount("/css", StaticFiles(directory=os.path.join(FRONTEND_DIR, "css")), name="css")
    app.mount("/js", StaticFiles(directory=os.path.join(FRONTEND_DIR, "js")), name="js")

    @app.get("/")
    @app.get("/index.html")
    def serve_index():
        return FileResponse(os.path.join(FRONTEND_DIR, "index.html"))

# --- TELEGRAM BOT LOGIC ---
LIVE_URL = "https://ddu-campus-navigator.onrender.com/index.html"

async def start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user = update.effective_user
    
    keyboard = [
        [InlineKeyboardButton("🗺️ Open Full Campus Map & Mini App", web_app=WebAppInfo(url=LIVE_URL))],
        [InlineKeyboardButton("💻 School of Computing (Block 15)", callback_data="nav_Block-15 (School of Computing)"),
         InlineKeyboardButton("📚 Main Library", callback_data="nav_Main Library")],
        [InlineKeyboardButton("🏠 White House Dorms", callback_data="nav_White House-A"),
         InlineKeyboardButton("🏥 Hospital", callback_data="nav_Hospital")],
        [InlineKeyboardButton("🚪 Mermersa Gate", callback_data="nav_Mermersa Gate")]
    ]
    reply_markup = InlineKeyboardMarkup(keyboard)

    welcome_message = (
        f"👋 Hello {user.first_name}!\n\n"
        f"Welcome to the **Dire Dawa University Navigator Bot**. "
        f"Designed especially for freshmen and visitors to find blocks, dorms, and cafes easily.\n\n"
        f"Click a quick destination below or open the full satellite map!"
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
            keyboard = [[InlineKeyboardButton(f"🧭 Navigate to {match['name']}", web_app=WebAppInfo(url=target_url))]]
            reply_markup = InlineKeyboardMarkup(keyboard)

            await query.message.reply_text(
                f"📍 **{match['name']}**\n"
                f"Category: `{match['category']}`\n\n"
                f"Click below to launch the live GPS tracker map directly to this building!",
                reply_markup=reply_markup,
                parse_mode="Markdown"
            )

# Startup event to run the Telegram bot polling alongside FastAPI
@app.on_event("startup")
async def startup_event():
    if TOKEN:
        application = ApplicationBuilder().token(TOKEN).build()
        application.add_handler(CommandHandler("start", start))
        application.add_handler(CallbackQueryHandler(button_handler))
        
        # Initialize and start polling in the background
        await application.initialize()
        await application.start()
        asyncio.create_task(application.updater.start_polling())
        print("🤖 Telegram Bot polling started successfully in background!")