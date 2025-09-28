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
      const shares = quantity / price;
      
      const trade = new Trade({
        ticker: ticker,
        buy_price: price,
        quantity: shares
      });
      
      await trade.save();
      await this.bot.sendMessage(chatId, `✅ Bought $${quantity.toFixed(2)} worth of ${ticker} at $${price.toFixed(2)} per share\nShares: ${shares.toFixed(6)}`);
      console.log('Trade added:', trade);
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
      // Find open trades for this ticker (FIFO - First In, First Out)
      const openTrades = await Trade.getOpenTradesForTicker(ticker);
      
      if (openTrades.length === 0) {
        await this.bot.sendMessage(chatId, `No open trades found for ${ticker}.`);
        return;
      }
      
      // If no dollar amount specified, sell all shares of the oldest trade
      if (!sellDollarAmount) {
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
        const sharesSold = tradeToClose.quantity.toFixed(6);
        await this.bot.sendMessage(chatId, 
          `${profitEmoji} Sold ${sharesSold} shares of ${ticker} at $${sellPrice.toFixed(2)} each\n` +
          `Bought at: $${tradeToClose.buy_price.toFixed(2)} each\n` +
          `Total Revenue: $${totalRevenue}\n` +
          `Total Profit: $${profit.toFixed(2)} (${profitPercent}%)`
        );
        console.log('Trade closed:', tradeToClose);
      } else {
        // Sell specific dollar amount (FIFO)
        const sharesToSell = sellDollarAmount / sellPrice;
        let remainingToSell = sharesToSell;
        let totalProfit = 0;
        let totalRevenue = sellDollarAmount;
        let tradesClosed = 0;
        
        for (const trade of openTrades) {
          if (remainingToSell <= 0) break;
          
          const sharesFromThisTrade = Math.min(remainingToSell, trade.quantity);
          const profitPerShare = sellPrice - trade.buy_price;
          const tradeProfit = profitPerShare * sharesFromThisTrade;
          
          totalProfit += tradeProfit;
          
          if (sharesFromThisTrade === trade.quantity) {
            // Close entire trade
            trade.sell_price = sellPrice;
            trade.sell_date = new Date();
            trade.status = 'closed';
            await trade.save();
            tradesClosed++;
          } else {
            // Partial sell - create new trade for remaining shares
            const remainingShares = trade.quantity - sharesFromThisTrade;
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
            trade.quantity = sharesFromThisTrade;
            await trade.save();
            tradesClosed++;
          }
          
          remainingToSell -= sharesFromThisTrade;
        }
        
        if (remainingToSell > 0) {
          const actualSharesSold = (sharesToSell - remainingToSell).toFixed(6);
          const actualDollarAmount = ((sharesToSell - remainingToSell) * sellPrice).toFixed(2);
          await this.bot.sendMessage(chatId, `⚠️ Only sold ${actualSharesSold} shares ($${actualDollarAmount}). You don't have enough shares for $${sellDollarAmount.toFixed(2)}.`);
        }
        
        const profitEmoji = totalProfit >= 0 ? '📈' : '📉';
        const actualSharesSold = (sharesToSell - remainingToSell).toFixed(6);
        await this.bot.sendMessage(chatId, 
          `${profitEmoji} Sold $${sellDollarAmount.toFixed(2)} worth of ${ticker} at $${sellPrice.toFixed(2)} per share\n` +
          `Shares sold: ${actualSharesSold}\n` +
          `Total Profit: $${totalProfit.toFixed(2)}`
        );
      }
    } catch (error) {
      const dollarText = sellDollarAmount ? ` $${sellDollarAmount.toFixed(2)} worth of` : '';
      await this.bot.sendMessage(chatId, `⚠️ Database error. Cannot process sell command.\n\n✅ Would have sold${dollarText} ${ticker} at $${sellPrice.toFixed(2)}`);
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
        const shares = trade.quantity.toFixed(6);
        const totalInvested = (trade.buy_price * trade.quantity).toFixed(2);
        const totalRevenue = (trade.sell_price * trade.quantity).toFixed(2);
        
        message += `${emoji} **${trade.ticker}**\n`;
        message += `$${totalInvested} invested → $${totalRevenue} revenue\n`;
        message += `${shares} shares @ $${trade.buy_price.toFixed(2)} → $${trade.sell_price.toFixed(2)}\n`;
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
        const shares = trade.quantity.toFixed(6);
        message += `🔹 **${trade.ticker}**\n`;
        message += `$${totalCost} invested @ $${trade.buy_price.toFixed(2)} per share\n`;
        message += `Shares: ${shares}\n`;
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
