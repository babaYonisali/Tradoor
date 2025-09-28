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
• /buy {ticker} {price} [dollar_amount] - Record a buy trade
• /sell {ticker} {price} [dollar_amount] - Record a sell trade
• /profit - View profit summary
• /trades - View open trades

Examples:
/buy AAPL 150.50
/buy AAPL 150.50 100
/sell AAPL 155.75
/sell AAPL 155.75 50

Note: Dollar amount is optional (defaults to 1 share worth)`;

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
      // Calculate shares based on dollar amount spent
      const newShares = quantity / price;
      
      // Get or create trade for this ticker
      let trade = await Trade.getOrCreateTrade(ticker);
      
      if (trade.total_shares === 0) {
        // First purchase
        trade.average_buy_price = price;
        trade.total_shares = newShares;
        trade.total_invested = quantity;
        trade.first_buy_date = new Date();
        trade.last_buy_date = new Date();
      } else {
        // Additional purchase - calculate new average price
        const totalNewShares = trade.total_shares + newShares;
        const totalNewInvested = trade.total_invested + quantity;
        const newAveragePrice = totalNewInvested / totalNewShares;
        
        trade.average_buy_price = newAveragePrice;
        trade.total_shares = totalNewShares;
        trade.total_invested = totalNewInvested;
        trade.last_buy_date = new Date();
      }
      
      await trade.save();
      
      await this.bot.sendMessage(chatId, 
        `✅ Bought $${quantity.toFixed(2)} worth of ${ticker} at $${price.toFixed(2)} per share\n` +
        `This purchase: ${newShares.toFixed(6)} shares\n` +
        `Total ${ticker} holdings: ${trade.total_shares.toFixed(6)} shares ($${trade.total_invested.toFixed(2)} invested)\n` +
        `Average price: $${trade.average_buy_price.toFixed(2)} per share`
      );
      console.log('Trade updated:', trade);
    } catch (error) {
      await this.bot.sendMessage(chatId, `⚠️ Database error. Trade not saved.\n\n✅ Would have bought $${quantity.toFixed(2)} worth of ${ticker} at $${price.toFixed(2)} per share`);
      console.error('Error adding trade:', error);
    }
  }

  async handleSellCommand(msg) {
    const chatId = msg.chat.id;
    const text = msg.text;
    const parts = text.split(' ');
    
    if (parts.length < 3 || parts.length > 4) {
      await this.bot.sendMessage(chatId, 'Usage: /sell {ticker} {price} [dollar_amount]\nExamples:\n/sell AAPL 155.75\n/sell AAPL 155.75 100');
      return;
    }
    
    const ticker = parts[1].toUpperCase();
    const sellPrice = parseFloat(parts[2]);
    const sellDollarAmount = parts[3] ? parseFloat(parts[3]) : null;
    
    if (isNaN(sellPrice) || sellPrice <= 0) {
      await this.bot.sendMessage(chatId, 'Invalid price. Please enter a valid number.');
      return;
    }
    
    if (sellDollarAmount && (isNaN(sellDollarAmount) || sellDollarAmount <= 0)) {
      await this.bot.sendMessage(chatId, 'Invalid dollar amount. Please enter a valid number.');
      return;
    }
    
    try {
      // Get trade for this ticker
      const trade = await Trade.findOne({ ticker: ticker.toUpperCase() });
      
      if (!trade || trade.total_shares === 0) {
        await this.bot.sendMessage(chatId, `No holdings found for ${ticker}.`);
        return;
      }
      
      // Calculate how many shares to sell
      let sharesToSell;
      if (!sellDollarAmount) {
        // Sell all remaining shares
        sharesToSell = trade.remaining_shares;
      } else {
        // Sell specific dollar amount
        sharesToSell = sellDollarAmount / sellPrice;
      }
      
      // Check if we have enough shares
      if (sharesToSell > trade.remaining_shares) {
        const maxDollarAmount = (trade.remaining_shares * sellPrice).toFixed(2);
        await this.bot.sendMessage(chatId, 
          `⚠️ You only have ${trade.remaining_shares.toFixed(6)} shares of ${ticker}.\n` +
          `Maximum you can sell: $${maxDollarAmount}`
        );
        return;
      }
      
      // Update trade with sell information
      const sellValue = sharesToSell * sellPrice;
      const profitPerShare = sellPrice - trade.average_buy_price;
      const totalProfit = profitPerShare * sharesToSell;
      const profitPercent = ((profitPerShare / trade.average_buy_price) * 100).toFixed(2);
      
      trade.total_shares_sold += sharesToSell;
      trade.total_sold_value += sellValue;
      trade.last_sell_date = new Date();
      
      await trade.save();
      
      const profitEmoji = totalProfit >= 0 ? '📈' : '📉';
      const remainingShares = trade.remaining_shares.toFixed(6);
      
      await this.bot.sendMessage(chatId, 
        `${profitEmoji} Sold ${sharesToSell.toFixed(6)} shares of ${ticker} at $${sellPrice.toFixed(2)} per share\n` +
        `Average buy price: $${trade.average_buy_price.toFixed(2)} per share\n` +
        `Profit on this sale: $${totalProfit.toFixed(2)} (${profitPercent}%)\n` +
        `Remaining shares: ${remainingShares}\n` +
        `Total profit on ${ticker}: $${trade.total_profit.toFixed(2)}`
      );
      
      console.log('Trade updated:', trade);
    } catch (error) {
      const dollarText = sellDollarAmount ? ` $${sellDollarAmount.toFixed(2)} worth of` : '';
      await this.bot.sendMessage(chatId, `⚠️ Database error. Cannot process sell command.\n\n✅ Would have sold${dollarText} ${ticker} at $${sellPrice.toFixed(2)}`);
      console.error('Error in sell command:', error);
    }
  }

  async handleProfitCommand(msg) {
    const chatId = msg.chat.id;
    
    try {
      const allTrades = await Trade.getAllTrades();
      
      if (allTrades.length === 0) {
        await this.bot.sendMessage(chatId, 'No trades found.');
        return;
      }
      
      let message = '📊 **Trading Summary**\n\n';
      let totalProfit = 0;
      let totalInvested = 0;
      let totalSoldValue = 0;
      
      allTrades.forEach(trade => {
        const profit = trade.total_profit;
        const emoji = profit >= 0 ? '✅' : '❌';
        const remainingShares = trade.remaining_shares.toFixed(6);
        
        message += `${emoji} **${trade.ticker}**\n`;
        message += `Invested: $${trade.total_invested.toFixed(2)}\n`;
        message += `Sold: $${trade.total_sold_value.toFixed(2)} (${trade.total_shares_sold.toFixed(6)} shares)\n`;
        message += `Remaining: ${remainingShares} shares @ $${trade.average_buy_price.toFixed(2)} avg\n`;
        message += `Profit: $${profit.toFixed(2)}\n\n`;
        
        totalProfit += profit;
        totalInvested += trade.total_invested;
        totalSoldValue += trade.total_sold_value;
      });
      
      const totalEmoji = totalProfit >= 0 ? '🎉' : '😞';
      message += `${totalEmoji} **Total Summary**\n`;
      message += `Total Invested: $${totalInvested.toFixed(2)}\n`;
      message += `Total Sold: $${totalSoldValue.toFixed(2)}\n`;
      message += `Total Profit: $${totalProfit.toFixed(2)}`;
      
      await this.bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
    } catch (error) {
      await this.bot.sendMessage(chatId, '⚠️ Database error. Cannot retrieve profit data.');
      console.error('Error in profit command:', error);
    }
  }

  async handleTradesCommand(msg) {
    const chatId = msg.chat.id;
    
    try {
      const allTrades = await Trade.getAllTrades();
      
      // Filter trades that have remaining shares
      const activeTrades = allTrades.filter(trade => trade.remaining_shares > 0);
      
      if (activeTrades.length === 0) {
        await this.bot.sendMessage(chatId, 'No active holdings found.');
        return;
      }
      
      let message = '📋 **Current Holdings**\n\n';
      
      activeTrades.forEach(trade => {
        const remainingShares = trade.remaining_shares.toFixed(6);
        const currentValue = (trade.remaining_shares * trade.average_buy_price).toFixed(2);
        const firstBuyDate = new Date(trade.first_buy_date).toLocaleDateString();
        const lastBuyDate = new Date(trade.last_buy_date).toLocaleDateString();
        
        message += `🔹 **${trade.ticker}**\n`;
        message += `Shares: ${remainingShares} @ $${trade.average_buy_price.toFixed(2)} avg\n`;
        message += `Invested: $${trade.total_invested.toFixed(2)}\n`;
        message += `Current Value: $${currentValue}\n`;
        message += `First bought: ${firstBuyDate}\n`;
        if (trade.last_buy_date !== trade.first_buy_date) {
          message += `Last bought: ${lastBuyDate}\n`;
        }
        message += '\n';
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
