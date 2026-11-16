
const express = require("express");
const router = express.Router();

const Config = require("../models/config");
const authMiddleware = require("../middleware/authMiddleware");

// GET /api/config
router.get("/", authMiddleware, async (req, res) => {
  try {
    const config = await Config.findOneAndUpdate(
      { key: "main" },
      { $setOnInsert: { key: "main" } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    return res.status(200).json({
      statusEnabled: config.statusEnabled,
      reportEnabled: config.reportEnabled,
      reportChannelId: config.reportChannelId,
    });
  } catch (error) {
    console.error("Get config error:", error);

    return res.status(500).json({
      message: "Failed to retrieve configuration",
    });
  }
});

// PUT /api/config
router.put("/", authMiddleware, async (req, res) => {
  try {
    const {
      statusEnabled,
      reportEnabled,
      reportChannelId,
    } = req.body;

    if (
      typeof statusEnabled !== "boolean" ||
      typeof reportEnabled !== "boolean" ||
      typeof reportChannelId !== "string"
    ) {
      return res.status(400).json({
        message: "Invalid configuration data",
      });
    }

    const config = await Config.findOneAndUpdate(
      { key: "main" },
      {
        $set: {
          statusEnabled,
          reportEnabled,
          reportChannelId: reportChannelId.trim(),
        },
        $setOnInsert: { key: "main" },
      },
      {
        upsert: true,
        new: true,
        runValidators: true,
        setDefaultsOnInsert: true,
      }
    );

    return res.status(200).json({
      message: "Configuration updated successfully",
      statusEnabled: config.statusEnabled,
      reportEnabled: config.reportEnabled,
      reportChannelId: config.reportChannelId,
    });
  } catch (error) {
    console.error("Update config error:", error);

    return res.status(500).json({
      message: "Failed to update configuration",
    });
  }
});

module.exports = router;
