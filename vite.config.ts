import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { apiPlugin } from "./vite-plugin-api.ts";

const rootDir = dirname(fileURLToPath(import.meta.url));

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // Empty prefix so server secrets (non-VITE) are available to the local API plugin.
  const env = loadEnv(mode, process.cwd(), "");

  return {
    build: {
      rollupOptions: {
        input: {
          main: resolve(rootDir, "index.html"),
          login: resolve(rootDir, "login.html"),
          admin: resolve(rootDir, "admin.html"),
        },
      },
    },
    plugins: [
      react(),
      apiPlugin({
        TWITCH_CLIENT_ID: env.TWITCH_CLIENT_ID,
        TWITCH_CLIENT_SECRET: env.TWITCH_CLIENT_SECRET,
        WALL_OF_SHAME_NOTIFY_URL: env.WALL_OF_SHAME_NOTIFY_URL,
      }),
    ],
  };
});
