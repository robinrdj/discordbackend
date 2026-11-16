
require("dotenv").config();

const {
  DISCORD_BOT_TOKEN,
  DISCORD_APPLICATION_ID,
  DISCORD_GUILD_ID
} = process.env;

// Define the commands supported by our bot
const commands = [
  {
    name: "status",
    description: "Check whether the application is running"
  },
  {
    name: "report",
    description: "Submit an issue report",
    options: [
      {
        name: "text",
        description: "Describe the issue",
        type: 3,
        required: true
      }
    ]
  }
];

async function registerCommands() {
  const url = `https://discord.com/api/v10/applications/${DISCORD_APPLICATION_ID}/guilds/${DISCORD_GUILD_ID}/commands`;

  try {
    const response = await fetch(url, {
      method: "PUT",
      headers: {
        Authorization: `Bot ${DISCORD_BOT_TOKEN}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(commands)
    });

    const data = await response.json();

    if (!response.ok) {
      console.error("Registration failed:", data);
      return;
    }

    console.log("Commands registered successfully!");

    data.forEach(command => {
      console.log(`/${command.name} registered`);
    });

  } catch (error) {
    console.error("Error:", error.message);
  }
}

registerCommands();
