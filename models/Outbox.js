const mongoose = require("mongoose");

const outboxSchema = new mongoose.Schema(
  {
    eventType: {
      type: String,
      required: true,
    },

    payload: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
    },

    status: {
      type: String,
      enum: ["pending", "processing", "sent", "failed"],
      default: "pending",
    },

    attempts: {
      type: Number,
      default: 0,
    },

    nextAttemptAt: {
      type: Date,
      default: Date.now,
    },

    lastError: {
      type: String,
      default: null,
    },

    sentAt: {
      type: Date,
      default: null,
    },

    processingAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true },
);



outboxSchema.index({
  status: 1,
  nextAttemptAt: 1,
  createdAt: 1,
});

outboxSchema.index({
  status: 1,
  processingAt: 1,
});

module.exports = mongoose.model("Outbox", outboxSchema);
