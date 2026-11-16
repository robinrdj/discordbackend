const Outbox = require("../models/Outbox");
const Config = require("../models/config");

const MAX_ATTEMPTS = 5;
const POLL_INTERVAL = 5000;
const STALE_JOB_TIME = 60 * 1000;

let isRunning = false;

// Send notification to the configured Discord channel
async function sendDiscordNotification(job) {
  // Retrieve current configuration from MongoDB
  const config = await Config.findOne({ key: "main" });

  // Use dashboard configuration first.
  // Fall back to .env if no channel is configured.
  const channelId =
    config?.reportChannelId?.trim() || process.env.REPORTS_CHANNEL_ID;

  if (!channelId) {
    throw new Error("Reports channel ID is not configured");
  }

  const response = await fetch(
    `https://discord.com/api/v10/channels/${channelId}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        content:
          `📢 **New Report Submitted**\n` +
          `**User:** ${job.payload.username}\n` +
          `**Report:** ${job.payload.report}`,
        nonce: job._id.toString(),
        enforce_nonce: true,
        allowed_mentions: {
          parse: [],
        },
      }),
    },
  );

  if (!response.ok) {
    const errorText = await response.text();

    throw new Error(`Discord API error ${response.status}: ${errorText}`);
  }
}

async function processNextJob() {
  const now = new Date();

  const staleBefore = new Date(now.getTime() - STALE_JOB_TIME);

  // Atomically claim one available job.
  // Also reclaim jobs left processing after a crash.
  const job = await Outbox.findOneAndUpdate(
    {
      $or: [
        {
          status: "pending",
          nextAttemptAt: { $lte: now },
        },
        {
          status: "processing",
          processingAt: { $lte: staleBefore },
        },
      ],
    },
    {
      $set: {
        status: "processing",
        processingAt: now,
      },
      $inc: {
        attempts: 1,
      },
    },
    {
      new: true,
      sort: { createdAt: 1 },
    },
  );

  if (!job) {
    return;
  }

  console.log(`Processing Outbox job: ${job._id}`);

  try {
    // Send notification using the current dashboard configuration
    await sendDiscordNotification(job);

    // Mark job as successfully delivered
    job.status = "sent";
    job.sentAt = new Date();
    job.processingAt = null;
    job.lastError = null;

    await job.save();

    console.log(`Notification delivered: ${job._id}`);
  } catch (error) {
    console.error("Notification delivery failed:", error.message);

    job.lastError = error.message.slice(0, 1000);
    job.processingAt = null;

    if (job.attempts >= MAX_ATTEMPTS) {
      job.status = "failed";

      console.log(`Job permanently failed: ${job._id}`);
    } else {
      job.status = "pending";

      // Exponential backoff: 10s, 20s, 40s, then 60s
      const retryDelay = Math.min(10 * 2 ** (job.attempts - 1), 60);

      job.nextAttemptAt = new Date(Date.now() + retryDelay * 1000);

      console.log(`Retry scheduled in ${retryDelay} seconds`);
    }

    await job.save();
  }
}

function startOutboxWorker() {
  console.log("Outbox worker started");

  async function poll() {
    // Prevent overlapping polling operations in this process
    if (isRunning) {
      return;
    }

    isRunning = true;

    try {
      await processNextJob();
    } catch (error) {
      console.error("Outbox worker error:", error);
    } finally {
      isRunning = false;
    }
  }

  // Process immediately, then poll periodically
  poll();

  setInterval(poll, POLL_INTERVAL);
}

module.exports = startOutboxWorker;
