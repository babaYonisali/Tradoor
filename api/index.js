const express = require('express');
const TelegramBot = require('node-telegram-bot-api');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const app = express();
app.use(express.json());

// Initialize database
const dbPath = path.join(__dirname, 'trades.db');
const db = new sqlite3.Database(dbPath);

// Create tables if they don't exist
db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS trades (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ticker TEXT NOT NULL,
    buy_price REAL NOT NULL,
    sell_price REAL,
    quantity REAL DEFAULT 1,
    buy_date DATETIME DEFAULT CURRENT_TIMESTAMP,
    sell_date DATETIME,
    status TEXT DEFAULT 'open'
  )`);
});

// Telegram Bot Handler Class
class TelegramBotHandler {
  constructor() {
    this.bot = null;
    this.isInitialized = false;
  }

  async init() {
    try {
      const token = process.env.TELEGRAM_BOT_TOKEN;
      if (!token) {
        throw new Error('TELEGRAM_BOT_TOKEN environment variable is required');
      }
      
      // Create bot instance (no polling for Vercel)
      this.bot = new TelegramBot(token, { polling: false });
      
      // Set up error handling
      this.setupErrorHandling();
      
      this.isInitialized = true;
      console.log('Telegram bot initialized successfully (webhook mode)');
    } catch (error) {
      console.error('Error initializing Telegram bot:', error);
      throw error;
    }
  }

  // Method to handle webhook updates
  async handleWebhookUpdate(update) {
    try {
      console.log('=== WEBHOOK UPDATE RECEIVED ===');
      console.log('Update:', JSON.stringify(update, null, 2));
      
      if (update.message && update.message.text) {
        const msg = update.message;
        console.log('Processing message:', msg.text);
        
        // Handle commands
        if (msg.text.startsWith('/')) {
          await this.handleCommand(msg);
        } else {
          console.log('Non-command message ignored:', msg.text);
        }
      } else {
        console.log('No text message in update');
      }
    } catch (error) {
      console.error('Error handling webhook update:', error);
    }
  }

  async handleCommand(msg) {
    const text = msg.text;
    const command = text.split(' ')[0];
    
    switch (command) {
      case '/buy':
        await this.handleBuyCommand(msg);
        break;
      case '/sell':
        await this.handleSellCommand(msg);
        break;
      case '/profit':
        await this.handleProfitCommand(msg);
        break;
      case '/trades':
        await this.handleTradesCommand(msg);
        break;
      default:
        await this.handleUnknownCommand(msg);
    }
  }

  setupErrorHandling() {
    this.bot.on('error', (error) => {
      console.error('Telegram bot error:', error);
    });
  }

  async stop() {
    if (this.bot) {
      console.log('Telegram bot stopped (webhook mode)');
    }
  }

  // Command handlers
  async handleBuyCommand(msg) {
    const chatId = msg.chat.id;
    const text = msg.text;
    const parts = text.split(' ');
    
    if (parts.length !== 3) {
      await this.bot.sendMessage(chatId, 'Usage: /buy {ticker} {price}\nExample: /buy AAPL 150.50');
      return;
    }
    
    const ticker = parts[1].toUpperCase();
    const price = parseFloat(parts[2]);
    
    if (isNaN(price) || price <= 0) {
      await this.bot.sendMessage(chatId, 'Invalid price. Please enter a valid number.');
      return;
    }
    
    const stmt = db.prepare('INSERT INTO trades (ticker, buy_price) VALUES (?, ?)');
    stmt.run([ticker, price], async (err) => {
      if (err) {
        await this.bot.sendMessage(chatId, 'Error adding trade to database.');
        console.error(err);
      } else {
        await this.bot.sendMessage(chatId, `✅ Bought ${ticker} at $${price.toFixed(2)}`);
      }
    });
    stmt.finalize();
  }

  async handleSellCommand(msg) {
    const chatId = msg.chat.id;
    const text = msg.text;
    const parts = text.split(' ');
    
    if (parts.length !== 3) {
      await this.bot.sendMessage(chatId, 'Usage: /sell {ticker} {price}\nExample: /sell AAPL 155.75');
      return;
    }
    
    const ticker = parts[1].toUpperCase();
    const sellPrice = parseFloat(parts[2]);
    
    if (isNaN(sellPrice) || sellPrice <= 0) {
      await this.bot.sendMessage(chatId, 'Invalid price. Please enter a valid number.');
      return;
    }
    
    // Find open trades for this ticker
    db.get('SELECT * FROM trades WHERE ticker = ? AND status = "open" ORDER BY buy_date ASC LIMIT 1', [ticker], async (err, row) => {
      if (err) {
        await this.bot.sendMessage(chatId, 'Error accessing database.');
        console.error(err);
        return;
      }
      
      if (!row) {
        await this.bot.sendMessage(chatId, `No open trades found for ${ticker}.`);
        return;
      }
      
      const profit = sellPrice - row.buy_price;
      const profitPercent = ((profit / row.buy_price) * 100).toFixed(2);
      
      // Update the trade as sold
      const stmt = db.prepare('UPDATE trades SET sell_price = ?, sell_date = CURRENT_TIMESTAMP, status = "closed" WHERE id = ?');
      stmt.run([sellPrice, row.id], async (err) => {
        if (err) {
          await this.bot.sendMessage(chatId, 'Error updating trade in database.');
          console.error(err);
        } else {
          const profitEmoji = profit >= 0 ? '📈' : '📉';
          await this.bot.sendMessage(chatId, 
            `${profitEmoji} Sold ${ticker} at $${sellPrice.toFixed(2)}\n` +
            `Bought at: $${row.buy_price.toFixed(2)}\n` +
            `Profit: $${profit.toFixed(2)} (${profitPercent}%)`
          );
        }
      });
      stmt.finalize();
    });
  }

  async handleProfitCommand(msg) {
    const chatId = msg.chat.id;
    
    db.all('SELECT ticker, buy_price, sell_price, (sell_price - buy_price) as profit FROM trades WHERE status = "closed" ORDER BY sell_date DESC', async (err, rows) => {
      if (err) {
        await this.bot.sendMessage(chatId, 'Error accessing database.');
        console.error(err);
        return;
      }
      
      if (rows.length === 0) {
        await this.bot.sendMessage(chatId, 'No completed trades found.');
        return;
      }
      
      let message = '📊 **Trading Profit Summary**\n\n';
      let totalProfit = 0;
      
      rows.forEach(row => {
        const profit = row.profit;
        const profitPercent = ((profit / row.buy_price) * 100).toFixed(2);
        const emoji = profit >= 0 ? '✅' : '❌';
        
        message += `${emoji} **${row.ticker}**\n`;
        message += `Bought: $${row.buy_price.toFixed(2)} | Sold: $${row.sell_price.toFixed(2)}\n`;
        message += `Profit: $${profit.toFixed(2)} (${profitPercent}%)\n\n`;
        
        totalProfit += profit;
      });
      
      const totalEmoji = totalProfit >= 0 ? '🎉' : '😞';
      message += `${totalEmoji} **Total Profit: $${totalProfit.toFixed(2)}**`;
      
      await this.bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
    });
  }

  async handleTradesCommand(msg) {
    const chatId = msg.chat.id;
    
    db.all('SELECT ticker, buy_price, buy_date FROM trades WHERE status = "open" ORDER BY buy_date DESC', async (err, rows) => {
      if (err) {
        await this.bot.sendMessage(chatId, 'Error accessing database.');
        console.error(err);
        return;
      }
      
      if (rows.length === 0) {
        await this.bot.sendMessage(chatId, 'No open trades found.');
        return;
      }
      
      let message = '📋 **Open Trades**\n\n';
      
      rows.forEach(row => {
        const buyDate = new Date(row.buy_date).toLocaleDateString();
        message += `🔹 **${row.ticker}**\n`;
        message += `Buy Price: $${row.buy_price.toFixed(2)}\n`;
        message += `Date: ${buyDate}\n\n`;
      });
      
      await this.bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
    });
  }

  async handleUnknownCommand(msg) {
    const chatId = msg.chat.id;
    await this.bot.sendMessage(chatId, 'Unknown command. Available commands: /buy, /sell, /profit, /trades');
  }
}

// Initialize bot handler
const telegramBot = new TelegramBotHandler();

// Webhook endpoint for Vercel
app.post('/webhook', async (req, res) => {
  try {
    console.log('Received webhook request:', JSON.stringify(req.body, null, 2));
    
    // Handle the webhook update
    await telegramBot.handleWebhookUpdate(req.body);
    
    // Always respond with 200 OK to Telegram
    res.status(200).json({ status: 'OK' });
  } catch (error) {
    console.error('Error handling webhook:', error);
    // Still respond with 200 to avoid Telegram retrying
    res.status(200).json({ status: 'Error but OK' });
  }
});

// Health check endpoint
app.get('/', (req, res) => {
  res.json({ 
    status: 'OK', 
    bot: telegramBot.isInitialized ? 'Running' : 'Not initialized',
    timestamp: new Date().toISOString()
  });
});

// Initialize bot on startup
async function initializeBot() {
  try {
    await telegramBot.init();
    console.log('Bot initialized successfully');
  } catch (error) {
    console.error('Failed to initialize bot:', error);
  }
}

// Initialize bot
initializeBot();

// Export for Vercel
module.exports = app;

// For local development
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}
