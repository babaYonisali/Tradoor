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

// Initialize Telegram Bot
const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) {
  console.error('TELEGRAM_BOT_TOKEN environment variable is required');
  process.exit(1);
}

const bot = new TelegramBot(token, { polling: false });

// Webhook endpoint for Vercel
app.post('/webhook', (req, res) => {
  const update = req.body;
  
  if (update.message) {
    handleMessage(update.message);
  }
  
  res.status(200).send('OK');
});

// Health check endpoint
app.get('/', (req, res) => {
  res.json({ status: 'Bot is running' });
});

// Handle incoming messages
function handleMessage(message) {
  const chatId = message.chat.id;
  const text = message.text;
  
  if (!text) return;
  
  const command = text.split(' ')[0];
  
  switch (command) {
    case '/buy':
      handleBuyCommand(chatId, text);
      break;
    case '/sell':
      handleSellCommand(chatId, text);
      break;
    case '/profit':
      handleProfitCommand(chatId);
      break;
    case '/trades':
      handleTradesCommand(chatId);
      break;
    default:
      bot.sendMessage(chatId, 'Unknown command. Available commands: /buy, /sell, /profit, /trades');
  }
}

// Handle /buy command
function handleBuyCommand(chatId, text) {
  const parts = text.split(' ');
  
  if (parts.length !== 3) {
    bot.sendMessage(chatId, 'Usage: /buy {ticker} {price}\nExample: /buy AAPL 150.50');
    return;
  }
  
  const ticker = parts[1].toUpperCase();
  const price = parseFloat(parts[2]);
  
  if (isNaN(price) || price <= 0) {
    bot.sendMessage(chatId, 'Invalid price. Please enter a valid number.');
    return;
  }
  
  const stmt = db.prepare('INSERT INTO trades (ticker, buy_price) VALUES (?, ?)');
  stmt.run([ticker, price], function(err) {
    if (err) {
      bot.sendMessage(chatId, 'Error adding trade to database.');
      console.error(err);
    } else {
      bot.sendMessage(chatId, `✅ Bought ${ticker} at $${price.toFixed(2)}`);
    }
  });
  stmt.finalize();
}

// Handle /sell command
function handleSellCommand(chatId, text) {
  const parts = text.split(' ');
  
  if (parts.length !== 3) {
    bot.sendMessage(chatId, 'Usage: /sell {ticker} {price}\nExample: /sell AAPL 155.75');
    return;
  }
  
  const ticker = parts[1].toUpperCase();
  const sellPrice = parseFloat(parts[2]);
  
  if (isNaN(sellPrice) || sellPrice <= 0) {
    bot.sendMessage(chatId, 'Invalid price. Please enter a valid number.');
    return;
  }
  
  // Find open trades for this ticker
  db.get('SELECT * FROM trades WHERE ticker = ? AND status = "open" ORDER BY buy_date ASC LIMIT 1', [ticker], (err, row) => {
    if (err) {
      bot.sendMessage(chatId, 'Error accessing database.');
      console.error(err);
      return;
    }
    
    if (!row) {
      bot.sendMessage(chatId, `No open trades found for ${ticker}.`);
      return;
    }
    
    const profit = sellPrice - row.buy_price;
    const profitPercent = ((profit / row.buy_price) * 100).toFixed(2);
    
    // Update the trade as sold
    const stmt = db.prepare('UPDATE trades SET sell_price = ?, sell_date = CURRENT_TIMESTAMP, status = "closed" WHERE id = ?');
    stmt.run([sellPrice, row.id], function(err) {
      if (err) {
        bot.sendMessage(chatId, 'Error updating trade in database.');
        console.error(err);
      } else {
        const profitEmoji = profit >= 0 ? '📈' : '📉';
        bot.sendMessage(chatId, 
          `${profitEmoji} Sold ${ticker} at $${sellPrice.toFixed(2)}\n` +
          `Bought at: $${row.buy_price.toFixed(2)}\n` +
          `Profit: $${profit.toFixed(2)} (${profitPercent}%)`
        );
      }
    });
    stmt.finalize();
  });
}

// Handle /profit command
function handleProfitCommand(chatId) {
  db.all('SELECT ticker, buy_price, sell_price, (sell_price - buy_price) as profit FROM trades WHERE status = "closed" ORDER BY sell_date DESC', (err, rows) => {
    if (err) {
      bot.sendMessage(chatId, 'Error accessing database.');
      console.error(err);
      return;
    }
    
    if (rows.length === 0) {
      bot.sendMessage(chatId, 'No completed trades found.');
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
    
    bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
  });
}

// Handle /trades command
function handleTradesCommand(chatId) {
  db.all('SELECT ticker, buy_price, buy_date FROM trades WHERE status = "open" ORDER BY buy_date DESC', (err, rows) => {
    if (err) {
      bot.sendMessage(chatId, 'Error accessing database.');
      console.error(err);
      return;
    }
    
    if (rows.length === 0) {
      bot.sendMessage(chatId, 'No open trades found.');
      return;
    }
    
    let message = '📋 **Open Trades**\n\n';
    
    rows.forEach(row => {
      const buyDate = new Date(row.buy_date).toLocaleDateString();
      message += `🔹 **${row.ticker}**\n`;
      message += `Buy Price: $${row.buy_price.toFixed(2)}\n`;
      message += `Date: ${buyDate}\n\n`;
    });
    
    bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
  });
}

// Set webhook for production
if (process.env.NODE_ENV === 'production') {
  const webhookUrl = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}/webhook` : process.env.WEBHOOK_URL;
  
  if (webhookUrl) {
    bot.setWebHook(webhookUrl).then(() => {
      console.log('Webhook set successfully');
    }).catch(err => {
      console.error('Error setting webhook:', err);
    });
  }
}

// Export for Vercel
module.exports = app;

// For local development
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}
