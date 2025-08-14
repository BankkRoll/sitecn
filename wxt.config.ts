import react from "@vitejs/plugin-react";
import { resolve } from "path";
import { defineConfig } from "wxt";

// See https://wxt.dev/api/config.html
export default defineConfig({
  alias: {
    "@": resolve(__dirname, "./src"),
  },

  browser: "chrome",
  manifestVersion: 3,

  root: process.cwd(),
  srcDir: resolve(__dirname, "./src"),
  publicDir: resolve(__dirname, "./public"),
  entrypointsDir: resolve(__dirname, "./src/entrypoints"),
  outDir: resolve(__dirname, ".output"),

  dev: {
    server: {
      port: 3000,
    },
    reloadCommand: "Alt+R",
  },

  manifest: {
    name: "sitecn - Generate, Customize, Analyze and Inject or Preview custom themes with AI",
    description:
      "Chrome extension that provides Built-In Chrome AI (Google Gemini) powered theming assistance for a TweakCN-like experience on any website. Generate, Customize, Analyze and Inject or Preview shadcn-style CSS variable themes per domain.",
    version: "0.0.1",
    icons: {
      "16": "icon/icon16.png",
      "32": "icon/icon32.png",
      "48": "icon/icon48.png",
      "128": "icon/icon128.png",
    },
    action: { default_title: "sitecn" },
    permissions: ["activeTab", "scripting", "sidePanel", "storage", "tabs"],
    host_permissions: ["*://*/*"],
    minimum_chrome_version: "116",
  },

  vite: () => ({
    plugins: [react()],
    build: {
      chunkSizeWarningLimit: 900,
    },
  }),
});
