
const express = require("express");
const router = express.Router();

const authMiddleware = require("../middleware/authMiddleware");
const Outbox = require("../models/Outbox");

// GET /api/outbox
router.get("/", authMiddleware, async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);

    const limit = Math.min(
      100,
      Math.max(1, parseInt(req.query.limit) || 10)
    );

    const { status } = req.query;

    const filter = {};

    const allowedStatuses = [
      "pending",
      "processing",
      "sent",
      "failed",
    ];

    if (status) {
      if (!allowedStatuses.includes(status)) {
        return res.status(400).json({
          message: "Invalid notification status",
        });
      }

      filter.status = status;
    }

    const [items, total] = await Promise.all([
      Outbox.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),

      Outbox.countDocuments(filter),
    ]);

    return res.status(200).json({
      items,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("Outbox API error:", error);

    return res.status(500).json({
      message: "Failed to fetch notification records",
    });
  }
});

module.exports = router;
