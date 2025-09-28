const mongoose = require('mongoose');

const tradeSchema = new mongoose.Schema({
    ticker: {
        type: String,
        required: true,
        uppercase: true,
        trim: true
    },
    buy_price: {
        type: Number,
        required: true,
        min: 0
    },
    sell_price: {
        type: Number,
        default: null,
        min: 0
    },
    quantity: {
        type: Number,
        default: 1,
        min: 0
    },
    buy_date: {
        type: Date,
        default: Date.now
    },
    sell_date: {
        type: Date,
        default: null
    },
    status: {
        type: String,
        enum: ['open', 'closed'],
        default: 'open'
    }
}, {
    timestamps: true
});

// Index for better query performance
tradeSchema.index({ ticker: 1, status: 1 });
tradeSchema.index({ buy_date: -1 });
tradeSchema.index({ sell_date: -1 });

// Virtual for profit calculation
tradeSchema.virtual('profit').get(function() {
    if (this.sell_price && this.buy_price) {
        return this.sell_price - this.buy_price;
    }
    return null;
});

// Virtual for profit percentage
tradeSchema.virtual('profit_percentage').get(function() {
    if (this.sell_price && this.buy_price) {
        return ((this.sell_price - this.buy_price) / this.buy_price) * 100;
    }
    return null;
});

// Static method to get open trades for a ticker (FIFO)
tradeSchema.statics.getOpenTradesForTicker = function(ticker) {
    return this.find({ 
        ticker: ticker.toUpperCase(), 
        status: 'open' 
    }).sort({ buy_date: 1 }); // Oldest first for FIFO
};

// Static method to get all open trades
tradeSchema.statics.getOpenTrades = function() {
    return this.find({ status: 'open' }).sort({ buy_date: -1 }); // Newest first
};

// Static method to get all closed trades
tradeSchema.statics.getClosedTrades = function() {
    return this.find({ status: 'closed' }).sort({ sell_date: -1 }); // Newest first
};

// Static method to get total profit
tradeSchema.statics.getTotalProfit = function() {
    return this.aggregate([
        { $match: { status: 'closed' } },
        {
            $group: {
                _id: null,
                totalProfit: {
                    $sum: { $subtract: ['$sell_price', '$buy_price'] }
                }
            }
        }
    ]);
};

module.exports = mongoose.model('Trade', tradeSchema);
