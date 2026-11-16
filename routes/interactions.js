
const express = require("express");
const router = express.Router();

const authMiddleware = require("../middleware/authMiddleware");
const Interaction = require("../models/Interaction");

// GET /api/interactions
router.get("/", authMiddleware, async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(
      100,
      Math.max(1, parseInt(req.query.limit) || 10)
    );

    const { search, command } = req.query;

    const filter = {};

    if (command) {
      filter.commandName = command;
    }

    if (search) {
      const safeSearch = search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

      filter.$or = [
        { username: { $regex: safeSearch, $options: "i" } },
        { userId: { $regex: safeSearch, $options: "i" } },
        { commandName: { $regex: safeSearch, $options: "i" } },
      ];
    }

    const [items, total] = await Promise.all([
      Interaction.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),

      Interaction.countDocuments(filter),
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
    console.error("Interactions API error:", error);

    return res.status(500).json({
      message: "Failed to fetch interactions",
    });
  }
});

module.exports = router;
