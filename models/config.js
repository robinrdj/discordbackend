
const mongoose = require("mongoose");

const configSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      default: "main",
      unique: true,
    },

    statusEnabled: {
      type: Boolean,
      default: true,
    },

    reportEnabled: {
      type: Boolean,
      default: true,
    },

    reportChannelId: {
      type: String,
      default: "",
      trim: true,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("Config", configSchema);
