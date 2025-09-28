# Telegram Trading Bot

A simple Telegram bot for tracking your trades with commands to buy, sell, view profits, and check open trades.

## Features

- **`/buy {ticker} {price}`** - Record a buy trade
- **`/sell {ticker} {price}`** - Record a sell trade (closes the oldest open position)
- **`/profit`** - View profit summary of all completed trades
- **`/trades`** - View all open trades

## Setup Instructions

### 1. Create a Telegram Bot

1. Message [@BotFather](https://t.me/botfather) on Telegram
2. Send `/newbot` command
3. Follow the prompts to create your bot
4. Save the bot token you receive

### 2. Deploy to Vercel

1. Fork or clone this repository
2. Install Vercel CLI: `npm i -g vercel`
3. Run `vercel` in the project directory
4. Set the environment variable:
   ```bash
   vercel env add TELEGRAM_BOT_TOKEN
   ```
   Enter your bot token when prompted

5. Redeploy:
   ```bash
   vercel --prod
   ```

### 3. Set Webhook

After deployment, set your bot's webhook URL:

```bash
curl -X POST "https://api.telegram.org/bot<YOUR_BOT_TOKEN>/setWebhook" \
     -H "Content-Type: application/json" \
     -d '{"url": "https://your-app-name.vercel.app/webhook"}'
```

Replace `<YOUR_BOT_TOKEN>` with your actual bot token and `your-app-name` with your Vercel app URL.

## Usage Examples

```
/buy AAPL 150.50
/sell AAPL 155.75
/profit
/trades
```

## Database

The bot uses SQLite to store trade data locally. The database file (`trades.db`) will be created automatically when the bot starts.

## Local Development

1. Install dependencies:
   ```bash
   npm install
   ```

2. Set environment variable:
   ```bash
   export TELEGRAM_BOT_TOKEN=your_bot_token_here
   ```

3. Run locally:
   ```bash
   npm start
   ```

4. For local testing, you can use ngrok to expose your local server:
   ```bash
   npx ngrok http 3000
   ```
   Then set the webhook URL to your ngrok URL.

## Environment Variables

- `TELEGRAM_BOT_TOKEN` - Your Telegram bot token (required)
- `MONGODB_URI` - Your MongoDB connection string (required)
- `MONGODB_DB_NAME` - Your MongoDB database name (required)
- `VERCEL_URL` - Automatically set by Vercel
- `NODE_ENV` - Set to 'production' on Vercel

## Database Setup

1. **Create a MongoDB Atlas account** (free tier available)
2. **Create a new cluster** and get your connection string
3. **Set environment variables in Vercel**:
   ```bash
   vercel env add MONGODB_URI
   vercel env add MONGODB_DB_NAME
   ```
   - `MONGODB_URI`: Your MongoDB connection string (e.g., `mongodb+srv://username:password@cluster.mongodb.net/`)
   - `MONGODB_DB_NAME`: Your database name (e.g., `trading-bot`)

## Notes

- The bot uses FIFO (First In, First Out) for selling trades
- All prices are stored as decimal numbers
- Data persists permanently in MongoDB
- Profit calculations include both dollar amount and percentage
- MongoDB Atlas provides free 512MB storage
