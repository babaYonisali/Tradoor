# TradeBot - Simple Telegram Trading Bot

A simple Telegram bot for tracking your trades and calculating profits, designed to run on Vercel.

## Features

- **Buy Trades**: Add new positions with `/buy {ticker} {price}`
- **Sell Trades**: Close positions with `/sell {ticker} {price}`
- **Profit Tracking**: View completed trades and total profit with `/profit`
- **Open Positions**: See all current open trades with `/trades`
- **Vercel Ready**: Deploy easily to Vercel with webhook support

## Deployment to Vercel

### 1. Create a Telegram Bot

1. Open Telegram and search for `@BotFather`
2. Send `/newbot` command
3. Follow the prompts to create your bot
4. Copy the bot token you receive

### 2. Deploy to Vercel

#### Option A: Deploy with Vercel CLI

1. Install Vercel CLI:
```bash
npm i -g vercel
```

2. Clone this repository and navigate to it:
```bash
git clone <your-repo-url>
cd tradoor
```

3. Deploy to Vercel:
```bash
vercel
```

4. Set your bot token as an environment variable:
```bash
vercel env add TELEGRAM_BOT_TOKEN
# Enter your bot token when prompted
```

#### Option B: Deploy with GitHub Integration

1. Push your code to GitHub
2. Connect your GitHub repository to Vercel
3. Add `TELEGRAM_BOT_TOKEN` environment variable in Vercel dashboard
4. Deploy automatically

### 3. Set Up Webhook

After deployment, you need to set up the webhook URL for your bot:

1. Get your Vercel deployment URL (e.g., `https://your-app.vercel.app`)
2. Set the webhook using Telegram Bot API:
```bash
curl -X POST "https://api.telegram.org/bot<YOUR_BOT_TOKEN>/setWebhook" \
     -H "Content-Type: application/json" \
     -d '{"url": "https://your-app.vercel.app/api"}'
```

Replace `<YOUR_BOT_TOKEN>` with your actual bot token and `https://your-app.vercel.app` with your Vercel URL.

### 4. Test Your Bot

Send `/start` to your bot in Telegram to test if everything is working!

## Local Development (Optional)

If you want to run the bot locally for testing:

### 1. Install Dependencies

```bash
pip install -r requirements.txt
```

### 2. Set Environment Variable

Set your bot token as an environment variable:

**Windows (PowerShell):**
```powershell
$env:TELEGRAM_BOT_TOKEN="your_bot_token_here"
```

**Windows (Command Prompt):**
```cmd
set TELEGRAM_BOT_TOKEN=your_bot_token_here
```

**Linux/Mac:**
```bash
export TELEGRAM_BOT_TOKEN="your_bot_token_here"
```

### 3. Run the Bot

```bash
python bot.py
```

## Usage

### Commands

- `/start` - Show welcome message and available commands
- `/buy {ticker} {price}` - Add a buy trade
  - Example: `/buy AAPL 150.50`
- `/sell {ticker} {price}` - Close a trade
  - Example: `/sell AAPL 155.75`
- `/profit` - Show all completed trades and total profit
- `/trades` - Show all open positions

### Examples

```
/buy TSLA 200.00
/sell TSLA 210.50
/profit
/trades
```

## Database

The bot uses SQLite database (`trades.db`) to store your trades. The database is created automatically when you first run the bot.

## Features

- ✅ Tracks buy and sell prices
- ✅ Calculates profit/loss for each trade
- ✅ Shows profit percentage
- ✅ Displays total profit across all trades
- ✅ Maintains history of completed trades
- ✅ Shows current open positions
- ✅ Simple and easy to use

## Notes

- The bot assumes you're trading 1 unit of each ticker
- Prices are stored with 2 decimal places
- All tickers are automatically converted to uppercase
- The bot uses FIFO (First In, First Out) for closing trades
