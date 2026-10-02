import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";
import { apiPlugin } from "./vite-plugin-api.ts";

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // Empty prefix so server secrets (non-VITE) are available to the local API plugin.
  const env = loadEnv(mode, process.cwd(), "");

  return {
    plugins: [
      react(),
      apiPlugin({
        TWITCH_CLIENT_ID: env.TWITCH_CLIENT_ID,
        TWITCH_CLIENT_SECRET: env.TWITCH_CLIENT_SECRET,
        DISCORD_CLIENT_ID: env.DISCORD_CLIENT_ID,
        DISCORD_CLIENT_SECRET: env.DISCORD_CLIENT_SECRET,
        DISCORD_BOT_TOKEN: env.DISCORD_BOT_TOKEN,
        DISCORD_GUILD_ID: env.DISCORD_GUILD_ID,
        DISCORD_EDITOR_ROLE_ID: env.DISCORD_EDITOR_ROLE_ID,
        SESSION_SECRET: env.SESSION_SECRET,
        APP_ORIGIN: env.APP_ORIGIN,
      }),
    ],
  };
});
