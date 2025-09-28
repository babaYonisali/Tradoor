import sqlite3
import logging
import os
import json
from telegram import Update, Bot
from telegram.ext import Application, CommandHandler, ContextTypes
from http.server import BaseHTTPRequestHandler
import urllib.parse

# Enable logging
logging.basicConfig(
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    level=logging.INFO
)
logger = logging.getLogger(__name__)

# Database setup
def init_database():
    """Initialize the SQLite database with trades table"""
    conn = sqlite3.connect('/tmp/trades.db')
    cursor = conn.cursor()
    
    # Create trades table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS trades (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            ticker TEXT NOT NULL,
            buy_price REAL NOT NULL,
            sell_price REAL,
            quantity REAL DEFAULT 1.0,
            status TEXT DEFAULT 'open',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            closed_at TIMESTAMP
        )
    ''')
    
    conn.commit()
    conn.close()

# Command handlers
async def start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Send a message when the command /start is issued."""
    await update.message.reply_text(
        'Welcome to TradeBot! 📈\n\n'
        'Available commands:\n'
        '/buy {ticker} {price} - Add a buy trade\n'
        '/sell {ticker} {price} - Close a trade\n'
        '/profit - Show profit from completed trades\n'
        '/trades - Show all open positions'
    )

async def buy_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Handle /buy command"""
    try:
        if len(context.args) != 2:
            await update.message.reply_text(
                'Usage: /buy {ticker} {price}\n'
                'Example: /buy AAPL 150.50'
            )
            return
        
        ticker = context.args[0].upper()
        price = float(context.args[1])
        
        if price <= 0:
            await update.message.reply_text('Price must be greater than 0')
            return
        
        # Add trade to database
        conn = sqlite3.connect('/tmp/trades.db')
        cursor = conn.cursor()
        cursor.execute(
            'INSERT INTO trades (ticker, buy_price, status) VALUES (?, ?, ?)',
            (ticker, price, 'open')
        )
        conn.commit()
        conn.close()
        
        await update.message.reply_text(
            f'✅ Buy order added:\n'
            f'Ticker: {ticker}\n'
            f'Price: ${price:.2f}'
        )
        
    except ValueError:
        await update.message.reply_text('Invalid price format. Please use numbers only.')
    except Exception as e:
        logger.error(f"Error in buy_command: {e}")
        await update.message.reply_text('An error occurred. Please try again.')

async def sell_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Handle /sell command"""
    try:
        if len(context.args) != 2:
            await update.message.reply_text(
                'Usage: /sell {ticker} {price}\n'
                'Example: /sell AAPL 155.75'
            )
            return
        
        ticker = context.args[0].upper()
        sell_price = float(context.args[1])
        
        if sell_price <= 0:
            await update.message.reply_text('Price must be greater than 0')
            return
        
        # Find open trade for this ticker
        conn = sqlite3.connect('/tmp/trades.db')
        cursor = conn.cursor()
        cursor.execute(
            'SELECT id, buy_price FROM trades WHERE ticker = ? AND status = "open" ORDER BY created_at ASC LIMIT 1',
            (ticker,)
        )
        trade = cursor.fetchone()
        
        if not trade:
            await update.message.reply_text(f'No open position found for {ticker}')
            conn.close()
            return
        
        trade_id, buy_price = trade
        profit = sell_price - buy_price
        profit_percent = (profit / buy_price) * 100
        
        # Close the trade
        cursor.execute(
            'UPDATE trades SET sell_price = ?, status = "closed", closed_at = CURRENT_TIMESTAMP WHERE id = ?',
            (sell_price, trade_id)
        )
        conn.commit()
        conn.close()
        
        profit_emoji = '📈' if profit >= 0 else '📉'
        await update.message.reply_text(
            f'{profit_emoji} Trade closed:\n'
            f'Ticker: {ticker}\n'
            f'Buy Price: ${buy_price:.2f}\n'
            f'Sell Price: ${sell_price:.2f}\n'
            f'Profit: ${profit:.2f} ({profit_percent:+.2f}%)'
        )
        
    except ValueError:
        await update.message.reply_text('Invalid price format. Please use numbers only.')
    except Exception as e:
        logger.error(f"Error in sell_command: {e}")
        await update.message.reply_text('An error occurred. Please try again.')

async def profit_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Handle /profit command"""
    try:
        conn = sqlite3.connect('/tmp/trades.db')
        cursor = conn.cursor()
        
        # Get all closed trades
        cursor.execute(
            'SELECT ticker, buy_price, sell_price, closed_at FROM trades WHERE status = "closed" ORDER BY closed_at DESC'
        )
        trades = cursor.fetchall()
        
        if not trades:
            await update.message.reply_text('No completed trades found.')
            conn.close()
            return
        
        total_profit = 0
        message = '📊 **Completed Trades & Profits:**\n\n'
        
        for ticker, buy_price, sell_price, closed_at in trades:
            profit = sell_price - buy_price
            profit_percent = (profit / buy_price) * 100
            total_profit += profit
            
            profit_emoji = '📈' if profit >= 0 else '📉'
            message += f'{profit_emoji} **{ticker}**\n'
            message += f'   Buy: ${buy_price:.2f} → Sell: ${sell_price:.2f}\n'
            message += f'   Profit: ${profit:.2f} ({profit_percent:+.2f}%)\n'
            message += f'   Closed: {closed_at}\n\n'
        
        total_emoji = '🎉' if total_profit >= 0 else '😞'
        message += f'{total_emoji} **Total Profit: ${total_profit:.2f}**'
        
        conn.close()
        await update.message.reply_text(message, parse_mode='Markdown')
        
    except Exception as e:
        logger.error(f"Error in profit_command: {e}")
        await update.message.reply_text('An error occurred. Please try again.')

async def trades_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Handle /trades command"""
    try:
        conn = sqlite3.connect('/tmp/trades.db')
        cursor = conn.cursor()
        
        # Get all open trades
        cursor.execute(
            'SELECT ticker, buy_price, created_at FROM trades WHERE status = "open" ORDER BY created_at DESC'
        )
        trades = cursor.fetchall()
        
        if not trades:
            await update.message.reply_text('No open positions found.')
            conn.close()
            return
        
        message = '📋 **Open Positions:**\n\n'
        
        for ticker, buy_price, created_at in trades:
            message += f'📈 **{ticker}**\n'
            message += f'   Buy Price: ${buy_price:.2f}\n'
            message += f'   Opened: {created_at}\n\n'
        
        conn.close()
        await update.message.reply_text(message, parse_mode='Markdown')
        
    except Exception as e:
        logger.error(f"Error in trades_command: {e}")
        await update.message.reply_text('An error occurred. Please try again.')

# Global application instance
app = None

def get_application():
    """Get or create the application instance"""
    global app
    if app is None:
        token = os.getenv('TELEGRAM_BOT_TOKEN')
        if not token:
            raise ValueError("TELEGRAM_BOT_TOKEN environment variable not set")
        
        # Initialize database
        init_database()
        
        # Create application
        app = Application.builder().token(token).build()
        
        # Add command handlers
        app.add_handler(CommandHandler("start", start))
        app.add_handler(CommandHandler("buy", buy_command))
        app.add_handler(CommandHandler("sell", sell_command))
        app.add_handler(CommandHandler("profit", profit_command))
        app.add_handler(CommandHandler("trades", trades_command))
    
    return app

class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        """Handle POST requests from Telegram webhook"""
        try:
            # Get the raw body
            content_length = int(self.headers['Content-Length'])
            post_data = self.rfile.read(content_length)
            
            # Parse the JSON data
            data = json.loads(post_data.decode('utf-8'))
            
            # Create update object
            update = Update.de_json(data, None)
            
            # Process the update
            application = get_application()
            application.process_update(update)
            
            # Send success response
            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({'status': 'ok'}).encode())
            
        except Exception as e:
            logger.error(f"Error processing webhook: {e}")
            self.send_response(500)
            self.send_header('Content-type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({'error': str(e)}).encode())
    
    def do_GET(self):
        """Handle GET requests (for health checks)"""
        self.send_response(200)
        self.send_header('Content-type', 'application/json')
        self.end_headers()
        self.wfile.write(json.dumps({'status': 'TradeBot is running'}).encode())
