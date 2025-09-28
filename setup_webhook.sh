#!/bin/bash

# Webhook setup script for TradeBot
# Usage: ./setup_webhook.sh <BOT_TOKEN> <VERCEL_URL>

if [ $# -ne 2 ]; then
    echo "Usage: $0 <BOT_TOKEN> <VERCEL_URL>"
    echo "Example: $0 123456789:ABCdefGHIjklMNOpqrsTUVwxyz https://your-app.vercel.app"
    exit 1
fi

BOT_TOKEN=$1
VERCEL_URL=$2

echo "Setting up webhook for TradeBot..."
echo "Bot Token: ${BOT_TOKEN:0:10}..."
echo "Vercel URL: $VERCEL_URL"

# Set the webhook
curl -X POST "https://api.telegram.org/bot$BOT_TOKEN/setWebhook" \
     -H "Content-Type: application/json" \
     -d "{\"url\": \"$VERCEL_URL/api\"}"

echo ""
echo "Webhook setup complete!"
echo "Test your bot by sending /start to it in Telegram."
