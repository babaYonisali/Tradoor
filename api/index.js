const express = require('express');
const TelegramBot = require('node-telegram-bot-api');
const database = require('../config/database');
const Trade = require('../models/Trade');
require('dotenv').config();

const app = express();
app.use(express.json());

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
      
      // Ensure bot is initialized
      if (!this.bot) {
        console.log('Bot not initialized, attempting to initialize...');
        await this.init();
      }
      
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
      case '/start':
        await this.handleStartCommand(msg);
        break;
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
  async handleStartCommand(msg) {
    const chatId = msg.chat.id;
    const welcomeMessage = `🤖 Welcome to the Trading Bot!

Available commands:
• /buy {ticker} {price} [quantity] - Record a buy trade
• /sell {ticker} {price} [quantity] - Record a sell trade
• /profit - View profit summary
• /trades - View open trades

Examples:
/buy AAPL 150.50
/buy AAPL 150.50 10
/sell AAPL 155.75
/sell AAPL 155.75 5

Note: Quantity is optional (defaults to 1)`;

    try {
      await this.bot.sendMessage(chatId, welcomeMessage);
    } catch (error) {
      console.error('Error sending start message:', error);
    }
  }
  async handleBuyCommand(msg) {
    const chatId = msg.chat.id;
    const text = msg.text;
    const parts = text.split(' ');
    
    if (parts.length < 3 || parts.length > 4) {
      await this.bot.sendMessage(chatId, 'Usage: /buy {ticker} {price} [quantity]\nExamples:\n/buy AAPL 150.50\n/buy AAPL 150.50 10');
      return;
    }
    
    const ticker = parts[1].toUpperCase();
    const price = parseFloat(parts[2]);
    const quantity = parts[3] ? parseFloat(parts[3]) : 1;
    
    if (isNaN(price) || price <= 0) {
      await this.bot.sendMessage(chatId, 'Invalid price. Please enter a valid number.');
      return;
    }
    
    if (isNaN(quantity) || quantity <= 0) {
      await this.bot.sendMessage(chatId, 'Invalid quantity. Please enter a valid number.');
      return;
    }
    
    try {
      const trade = new Trade({
        ticker: ticker,
        buy_price: price,
        quantity: quantity
      });
      
      await trade.save();
      const totalCost = (price * quantity).toFixed(2);
      await this.bot.sendMessage(chatId, `✅ Bought ${quantity} shares of ${ticker} at $${price.toFixed(2)} each\nTotal Cost: $${totalCost}`);
      console.log('Trade added:', trade);
    } catch (error) {
      await this.bot.sendMessage(chatId, `⚠️ Database error. Trade not saved.\n\n✅ Would have bought ${quantity} shares of ${ticker} at $${price.toFixed(2)} each`);
      console.error('Error adding trade:', error);
    }
  }

  async handleSellCommand(msg) {
    const chatId = msg.chat.id;
    const text = msg.text;
    const parts = text.split(' ');
    
    if (parts.length < 3 || parts.length > 4) {
      await this.bot.sendMessage(chatId, 'Usage: /sell {ticker} {price} [quantity]\nExamples:\n/sell AAPL 155.75\n/sell AAPL 155.75 5');
      return;
    }
    
    const ticker = parts[1].toUpperCase();
    const sellPrice = parseFloat(parts[2]);
    const sellQuantity = parts[3] ? parseFloat(parts[3]) : null;
    
    if (isNaN(sellPrice) || sellPrice <= 0) {
      await this.bot.sendMessage(chatId, 'Invalid price. Please enter a valid number.');
      return;
    }
    
    if (sellQuantity && (isNaN(sellQuantity) || sellQuantity <= 0)) {
      await this.bot.sendMessage(chatId, 'Invalid quantity. Please enter a valid number.');
      return;
    }
    
    try {
      // Find open trades for this ticker (FIFO - First In, First Out)
      const openTrades = await Trade.getOpenTradesForTicker(ticker);
      
      if (openTrades.length === 0) {
        await this.bot.sendMessage(chatId, `No open trades found for ${ticker}.`);
        return;
      }
      
      // If no quantity specified, sell all shares of the oldest trade
      if (!sellQuantity) {
        const tradeToClose = openTrades[0];
        const profit = (sellPrice - tradeToClose.buy_price) * tradeToClose.quantity;
        const profitPerShare = sellPrice - tradeToClose.buy_price;
        const profitPercent = ((profitPerShare / tradeToClose.buy_price) * 100).toFixed(2);
        
        // Close the trade
        tradeToClose.sell_price = sellPrice;
        tradeToClose.sell_date = new Date();
        tradeToClose.status = 'closed';
        
        await tradeToClose.save();
        
        const profitEmoji = profit >= 0 ? '📈' : '📉';
        const totalRevenue = (sellPrice * tradeToClose.quantity).toFixed(2);
        await this.bot.sendMessage(chatId, 
          `${profitEmoji} Sold ${tradeToClose.quantity} shares of ${ticker} at $${sellPrice.toFixed(2)} each\n` +
          `Bought at: $${tradeToClose.buy_price.toFixed(2)} each\n` +
          `Total Revenue: $${totalRevenue}\n` +
          `Total Profit: $${profit.toFixed(2)} (${profitPercent}%)`
        );
        console.log('Trade closed:', tradeToClose);
      } else {
        // Sell specific quantity (FIFO)
        let remainingToSell = sellQuantity;
        let totalProfit = 0;
        let totalRevenue = 0;
        let tradesClosed = 0;
        
        for (const trade of openTrades) {
          if (remainingToSell <= 0) break;
          
          const sharesToSell = Math.min(remainingToSell, trade.quantity);
          const profitPerShare = sellPrice - trade.buy_price;
          const tradeProfit = profitPerShare * sharesToSell;
          
          totalProfit += tradeProfit;
          totalRevenue += sellPrice * sharesToSell;
          
          if (sharesToSell === trade.quantity) {
            // Close entire trade
            trade.sell_price = sellPrice;
            trade.sell_date = new Date();
            trade.status = 'closed';
            await trade.save();
            tradesClosed++;
          } else {
            // Partial sell - create new trade for remaining shares
            const remainingShares = trade.quantity - sharesToSell;
            const newTrade = new Trade({
              ticker: trade.ticker,
              buy_price: trade.buy_price,
              quantity: remainingShares,
              buy_date: trade.buy_date
            });
            await newTrade.save();
            
            // Close original trade
            trade.sell_price = sellPrice;
            trade.sell_date = new Date();
            trade.status = 'closed';
            trade.quantity = sharesToSell;
            await trade.save();
            tradesClosed++;
          }
          
          remainingToSell -= sharesToSell;
        }
        
        if (remainingToSell > 0) {
          await this.bot.sendMessage(chatId, `⚠️ Only sold ${sellQuantity - remainingToSell} shares. You don't have ${remainingToSell} more shares of ${ticker}.`);
        }
        
        const profitEmoji = totalProfit >= 0 ? '📈' : '📉';
        await this.bot.sendMessage(chatId, 
          `${profitEmoji} Sold ${sellQuantity - remainingToSell} shares of ${ticker} at $${sellPrice.toFixed(2)} each\n` +
          `Total Revenue: $${totalRevenue.toFixed(2)}\n` +
          `Total Profit: $${totalProfit.toFixed(2)}`
        );
      }
    } catch (error) {
      const quantityText = sellQuantity ? ` ${sellQuantity} shares of` : '';
      await this.bot.sendMessage(chatId, `⚠️ Database error. Cannot process sell command.\n\n✅ Would have sold${quantityText} ${ticker} at $${sellPrice.toFixed(2)}`);
      console.error('Error in sell command:', error);
    }
  }

  async handleProfitCommand(msg) {
    const chatId = msg.chat.id;
    
    try {
      const closedTrades = await Trade.getClosedTrades();
      
      if (closedTrades.length === 0) {
        await this.bot.sendMessage(chatId, 'No completed trades found.');
        return;
      }
      
      let message = '📊 **Trading Profit Summary**\n\n';
      let totalProfit = 0;
      
      closedTrades.forEach(trade => {
        const profit = trade.profit;
        const profitPercent = trade.profit_percentage.toFixed(2);
        const emoji = profit >= 0 ? '✅' : '❌';
        
        message += `${emoji} **${trade.ticker}**\n`;
        message += `${trade.quantity} shares @ $${trade.buy_price.toFixed(2)} → $${trade.sell_price.toFixed(2)}\n`;
        message += `Profit: $${profit.toFixed(2)} (${profitPercent}%)\n\n`;
        
        totalProfit += profit;
      });
      
      const totalEmoji = totalProfit >= 0 ? '🎉' : '😞';
      message += `${totalEmoji} **Total Profit: $${totalProfit.toFixed(2)}**`;
      
      await this.bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
    } catch (error) {
      await this.bot.sendMessage(chatId, '⚠️ Database error. Cannot retrieve profit data.');
      console.error('Error in profit command:', error);
    }
  }

  async handleTradesCommand(msg) {
    const chatId = msg.chat.id;
    
    try {
      const openTrades = await Trade.getOpenTrades();
      
      if (openTrades.length === 0) {
        await this.bot.sendMessage(chatId, 'No open trades found.');
        return;
      }
      
      let message = '📋 **Open Trades**\n\n';
      
      openTrades.forEach(trade => {
        const buyDate = new Date(trade.buy_date).toLocaleDateString();
        const totalCost = (trade.buy_price * trade.quantity).toFixed(2);
        message += `🔹 **${trade.ticker}**\n`;
        message += `${trade.quantity} shares @ $${trade.buy_price.toFixed(2)} each\n`;
        message += `Total Cost: $${totalCost}\n`;
        message += `Date: ${buyDate}\n\n`;
      });
      
      await this.bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
    } catch (error) {
      await this.bot.sendMessage(chatId, '⚠️ Database error. Cannot retrieve trades data.');
      console.error('Error in trades command:', error);
    }
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

// Initialize bot and database on startup
async function initializeApp() {
  try {
    console.log('Starting app initialization...');
    console.log('Environment variables check:');
    console.log('- MONGODB_URI:', process.env.MONGODB_URI ? 'SET' : 'NOT SET');
    console.log('- MONGODB_DB_NAME:', process.env.MONGODB_DB_NAME ? 'SET' : 'NOT SET');
    console.log('- TELEGRAM_BOT_TOKEN:', process.env.TELEGRAM_BOT_TOKEN ? 'SET' : 'NOT SET');
    
    // Connect to database first
    await database.connect();
    console.log('Database connected successfully');
    
    // Initialize bot (this should work even without database)
    await telegramBot.init();
    console.log('Bot initialized successfully');
  } catch (error) {
    console.error('Failed to initialize app:', error);
    console.error('Error details:', error.message);
    console.error('Stack trace:', error.stack);
  }
}

// Initialize app
initializeApp();

// Export for Vercel
module.exports = app;

// For local development
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}
