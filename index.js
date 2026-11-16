require("dotenv").config();

const express = require("express");
const nacl = require("tweetnacl");
const mongoose = require("mongoose");

const connectDB = require("./config/db");

const Interaction = require("./models/Interaction");
const Outbox = require("./models/Outbox");
const Config = require("./models/config");

const startOutboxWorker = require("./workers/outboxWorker");

const cors = require("cors");
const cookieParser = require("cookie-parser");

const app = express();

// CORS configuration
const allowedOrigins = [
  "http://localhost:5173",
  process.env.FRONTEND_URL,
].filter(Boolean);

// app.use(
//   cors({
//     origin: allowedOrigins,
//     credentials: true,
//   }),
// );

app.use(cors());
app.use(cookieParser());

// Update the original deferred Discord response
async function updateDiscordResponse(interaction, content) {
  const url = `https://discord.com/api/v10/webhooks/${interaction.application_id}/${interaction.token}/messages/@original`;

  const response = await fetch(url, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      content,
      allowed_mentions: {
        parse: [],
      },
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Discord response update failed: ${error}`);
  }
}

// Discord interaction endpoint
// Keep express.raw() for signature verification.
app.post(
  "/interactions",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    let interaction;
    let deferred = false;

    try {
      // 1. Get Discord signature headers
      const signature = req.headers["x-signature-ed25519"];
      const timestamp = req.headers["x-signature-timestamp"];

      if (!signature || !timestamp) {
        return res.status(401).send("Missing signature");
      }

      // 2. Verify Discord's Ed25519 signature
      const isValid = nacl.sign.detached.verify(
        Buffer.from(timestamp + req.body.toString()),
        Buffer.from(signature, "hex"),
        Buffer.from(process.env.DISCORD_PUBLIC_KEY, "hex"),
      );

      if (!isValid) {
        return res.status(401).send("Invalid signature");
      }

      // Reject requests with timestamps older or newer than 5 minutes
      const requestTime = Number(timestamp);
      const currentTime = Math.floor(Date.now() / 1000);

      if (
        !Number.isFinite(requestTime) ||
        Math.abs(currentTime - requestTime) > 300
      ) {
        return res.status(401).send("Request timestamp expired");
      }

      // 3. Parse interaction
      interaction = JSON.parse(req.body.toString());

      // 4. Handle Discord PING
      if (interaction.type === 1) {
        return res.json({ type: 1 });
      }

      // 5. Handle slash commands
      if (interaction.type === 2) {
        const command = interaction.data.name;

        const user = interaction.member?.user || interaction.user;

        // Extract command options
        const options = Object.fromEntries(
          (interaction.data.options || []).map((option) => [
            option.name,
            option.value,
          ]),
        );

        // 6. Immediately acknowledge the interaction
        // Discord will show "Bot is thinking..."
        res.json({ type: 5 });
        deferred = true;

        try {
          // 7. Check command configuration
          const config = await Config.findOne({ key: "main" });

          // Check whether /status is enabled
          if (command === "status" && config?.statusEnabled === false) {
            await updateDiscordResponse(
              interaction,
              "The /status command is currently disabled.",
            );
            return;
          }

          // Check whether /report is enabled
          if (command === "report" && config?.reportEnabled === false) {
            await updateDiscordResponse(
              interaction,
              "The /report command is currently disabled.",
            );
            return;
          }

          // 8. Validate report input before saving
          if (command === "report" && !options.text) {
            await updateDiscordResponse(
              interaction,
              "Please provide a report description.",
            );
            return;
          }

          // 9. Save interaction and Outbox job together
          const session = await mongoose.startSession();

          try {
            await session.withTransaction(async () => {
              // Save interaction
              await Interaction.create(
                [
                  {
                    interactionId: interaction.id,
                    guildId: interaction.guild_id,
                    channelId: interaction.channel_id,
                    userId: user.id,
                    username: user.username,
                    commandName: command,
                    options,
                  },
                ],
                { session },
              );

              // Create notification job for /report only
              if (command === "report") {
                await Outbox.create(
                  [
                    {
                      eventType: "REPORT_SUBMITTED",
                      payload: {
                        interactionId: interaction.id,
                        guildId: interaction.guild_id,
                        channelId: interaction.channel_id,
                        username: user.username,
                        report: options.text,
                      },
                      status: "pending",
                    },
                  ],
                  { session },
                );
              }
            });

            console.log("Interaction saved to MongoDB");

            if (command === "report") {
              console.log("Notification job added to Outbox");
            }
          } catch (error) {
            // Ignore duplicate interaction IDs
            if (error.code === 11000) {
              console.log("Duplicate interaction ignored");

              await updateDiscordResponse(
                interaction,
                "This interaction has already been processed.",
              );
              return;
            }

            throw error;
          } finally {
            await session.endSession();
          }

          // 10. Respond to /status
          if (command === "status") {
            await updateDiscordResponse(
              interaction,
              "DevBot is running successfully!",
            );
            return;
          }

          // 11. Respond to /report
          if (command === "report") {
            await updateDiscordResponse(
              interaction,
              `Your report was received: ${options.text}`,
            );
            return;
          }

          // 12. Handle unknown commands
          await updateDiscordResponse(interaction, "Unknown command.");
        } catch (error) {
          console.error("Interaction processing failed:", error);

          // The interaction has already been acknowledged.
          // Update the original response instead of sending HTTP 500.
          try {
            await updateDiscordResponse(
              interaction,
              "Something went wrong while processing your command. Please try again.",
            );
          } catch (discordError) {
            console.error(
              "Could not update Discord response:",
              discordError.message,
            );
          }
        }

        return;
      }

      return res.status(400).send("Unsupported interaction");
    } catch (error) {
      console.error("Interaction handler error:", error);

      // If we already acknowledged the interaction,
      // we cannot send another HTTP response.
      if (deferred && interaction) {
        try {
          await updateDiscordResponse(
            interaction,
            "An unexpected error occurred. Please try again.",
          );
        } catch (discordError) {
          console.error(
            "Could not update Discord response:",
            discordError.message,
          );
        }

        return;
      }

      return res.status(500).send("Internal server error");
    }
  },
);

// Express JSON middleware
app.use(express.json());

// Admin APIs
app.use("/api/auth", require("./routes/auth"));
app.use("/api/dashboard", require("./routes/dashboard"));
app.use("/api/interactions", require("./routes/interactions"));
app.use("/api/outbox", require("./routes/outbox"));
app.use("/api/config", require("./routes/config"));

// Connect to MongoDB before starting Express
const PORT = process.env.PORT || 5000;

connectDB()
  .then(() => {
    startOutboxWorker();

    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  })
  .catch((error) => {
    console.error("Failed to start server:", error);
    process.exit(1);
  });
