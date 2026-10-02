import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";
import { twitchApiPlugin } from "./vite-plugin-twitch-api.ts";

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // Empty prefix so TWITCH_* (non-VITE) secrets are available to the local API plugin.
  const env = loadEnv(mode, process.cwd(), "");

  return {
    plugins: [
      react(),
      twitchApiPlugin({
        TWITCH_CLIENT_ID: env.TWITCH_CLIENT_ID,
        TWITCH_CLIENT_SECRET: env.TWITCH_CLIENT_SECRET,
      }),
    ],
  };
});
