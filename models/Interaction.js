const mongoose = require("mongoose");

const interactionSchema = new mongoose.Schema(
  {
    interactionId: {
      type: String,
      required: true,
      unique: true,
    },

    guildId: {
      type: String,
      required: true,
    },

    channelId: {
      type: String,
      required: true,
    },

    userId: {
      type: String,
      required: true,
    },

    username: {
      type: String,
      required: true,
    },

    commandName: {
      type: String,
      required: true,
    },

    options: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },

    status: {
      type: String,
      default: "success",
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Interaction", interactionSchema);