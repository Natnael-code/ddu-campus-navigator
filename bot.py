import logging
import os
from dotenv import load_dotenv
from telegram import KeyboardButton, ReplyKeyboardMarkup, Update, WebAppInfo
from telegram.ext import Application, CommandHandler, ContextTypes
from telegram.request import HTTPXRequest

logging.basicConfig(
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    level=logging.INFO
)
logger = logging.getLogger(__name__)

load_dotenv()

BOT_TOKEN = os.getenv("TELEGRAM_TOKEN") or os.getenv("BOT_TOKEN")

if not BOT_TOKEN:
    raise ValueError("Error: BOT_TOKEN missing in environment variables.")

WEBAPP_URL = "https://telegram-route-app.onrender.com/index.html"

async def post_init(application: Application) -> None:
    await application.bot.delete_webhook(drop_pending_updates=True)
    await application.bot.delete_my_commands()
    logger.info("Cleared webhooks successfully.")

async def start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    try:
        user = update.effective_user
        keyboard = [
            [
                KeyboardButton("💻 School of Computing", web_app=WebAppInfo(url=f"{WEBAPP_URL}?dest=Computing")),
                KeyboardButton("📚 Main Library", web_app=WebAppInfo(url=f"{WEBAPP_URL}?dest=Library"))
            ],
            [
                KeyboardButton("🏥 Hospital", web_app=WebAppInfo(url=f"{WEBAPP_URL}?dest=Hospital")),
                KeyboardButton("🚪 Mermersa Gate", web_app=WebAppInfo(url=f"{WEBAPP_URL}?dest=Mermersa Gate"))
            ],
            [
                KeyboardButton("🗺️ Open Full Map & Search All", web_app=WebAppInfo(url=WEBAPP_URL))
            ]
        ]
        
        reply_markup = ReplyKeyboardMarkup(keyboard, resize_keyboard=True)
        
        welcome_text = (
            f"👋 Hello {user.first_name}!\n\n"
            f"Welcome to the DDU Live Campus Navigator 🏫\n"
            f"Select a destination below to get turn-by-turn live GPS routing and guidance right inside the Mini App!"
        )
        
        await update.message.reply_text(
            welcome_text,
            reply_markup=reply_markup
        )
    except Exception as e:
        logger.error(f"Error in start command: {e}")
        await update.message.reply_text("Unable to load navigation options. Please try again.")

async def error_handler(update: object, context: ContextTypes.DEFAULT_TYPE) -> None:
    logger.error("Error occurred:", exc_info=context.error)

def main():
    request = HTTPXRequest(
        connect_timeout=30.0,
        read_timeout=30.0,
        write_timeout=30.0,
        pool_timeout=30.0
    )

    app = (
        Application.builder()
        .token(BOT_TOKEN)
        .request(request)
        .post_init(post_init)
        .build()
    )
    
    app.add_handler(CommandHandler("start", start))
    app.add_error_handler(error_handler)
    
    logger.info("Bot is active and polling...")
    app.run_polling(
        poll_interval=1.0,
        drop_pending_updates=True
    )

if __name__ == "__main__":
    main()