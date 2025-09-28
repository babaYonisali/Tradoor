const mongoose = require('mongoose');

const tradeSchema = new mongoose.Schema({
    ticker: {
        type: String,
        required: true,
        uppercase: true,
        trim: true,
        unique: true
    },
    average_buy_price: {
        type: Number,
        required: true,
        min: 0
    },
    total_shares: {
        type: Number,
        required: true,
        min: 0
    },
    total_invested: {
        type: Number,
        required: true,
        min: 0
    },
    total_sold_value: {
        type: Number,
        default: 0,
        min: 0
    },
    total_shares_sold: {
        type: Number,
        default: 0,
        min: 0
    },
    first_buy_date: {
        type: Date,
        default: Date.now
    },
    last_buy_date: {
        type: Date,
        default: Date.now
    },
    last_sell_date: {
        type: Date,
        default: null
    }
}, {
    timestamps: true
});

// Index for better query performance
tradeSchema.index({ ticker: 1 });

// Virtual for current holdings value
tradeSchema.virtual('current_value').get(function() {
    return this.total_shares * this.average_buy_price;
});

// Virtual for total profit/loss
tradeSchema.virtual('total_profit').get(function() {
    return this.total_sold_value - (this.total_shares_sold * this.average_buy_price);
});

// Virtual for remaining shares
tradeSchema.virtual('remaining_shares').get(function() {
    return this.total_shares - this.total_shares_sold;
});

// Static method to get or create trade for ticker
tradeSchema.statics.getOrCreateTrade = function(ticker) {
    return this.findOneAndUpdate(
        { ticker: ticker.toUpperCase() },
        {},
        { upsert: true, new: true }
    );
};

// Static method to get all trades
tradeSchema.statics.getAllTrades = function() {
    return this.find({}).sort({ ticker: 1 });
};

module.exports = mongoose.model('Trade', tradeSchema);
