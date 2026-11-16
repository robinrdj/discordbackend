
const express = require("express");
const router = express.Router();

const authMiddleware = require("../middleware/authMiddleware");
const Interaction = require("../models/Interaction");
const Outbox = require("../models/Outbox");

// GET /api/dashboard/stats
router.get("/stats", authMiddleware, async (req, res) => {
  try {
    const [
      totalInteractions,
      totalReports,
      notificationsSent,
      pendingNotifications,
    ] = await Promise.all([
      Interaction.countDocuments(),

      Interaction.countDocuments({
        commandName: "report",
      }),

      Outbox.countDocuments({
        status: "sent",
      }),

      Outbox.countDocuments({
        status: { $in: ["pending", "processing"] },
      }),
    ]);

    return res.status(200).json({
      stats: {
        totalInteractions,
        totalReports,
        notificationsSent,
        pendingNotifications,
      },
    });
  } catch (error) {
    console.error("Dashboard stats error:", error);

    return res.status(500).json({
      message: "Failed to fetch dashboard statistics",
    });
  }
});

module.exports = router;
