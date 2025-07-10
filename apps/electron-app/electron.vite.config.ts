
import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { sentryVitePlugin } from "@sentry/vite-plugin";

export default defineConfig({
  main: {
    plugins: [
      externalizeDepsPlugin({ exclude: ["@modelcontextprotocol/sdk"] }),
      sentryVitePlugin({
        authToken: "some invalid auth token",
        org: "some invalid org",
        project: "some invalid project",
        telemetry: false,
        sourcemaps: {
          assets: [],
        },
        release: {
          inject: false,
        },
        errorHandler() {
          // do nothing on errors :)
          // They will happen because of the invalid auth token
        },
      }),
    ],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src/main"),
        "@vibe/shared-types": path.resolve(__dirname, "../../packages/shared-types/src/index.ts"),
      },
    },
    build: {
      rollupOptions: {
        external: ['@tanstack/react-virtual', 'pdfjs-dist', 'canvas', 'electron-dl', '@cliqz/adblocker-electron'],
        input: {
          index: path.resolve(__dirname, "./src/main/index.ts"),
          "processes/agent-process": path.resolve(__dirname, "./src/main/processes/agent-process.ts"),
          "processes/mcp-manager-process": path.resolve(__dirname, "./src/main/processes/mcp-manager-process.ts"),
        },
        output: {
          entryFileNames: "[name].js",
        },
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: {
        "@vibe/shared-types": path.resolve(__dirname, "../../packages/shared-types/src/index.ts"),
      },
    },
    build: {
      rollupOptions: {
        input: {
          index: path.resolve(__dirname, "./src/preload/index.ts"),
        },
        output: {
          entryFileNames: "[name].js",
        },
      },
    },
  },
  renderer: {
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src/renderer/src"),
        "@vibe/shared-types": path.resolve(__dirname, "../../packages/shared-types/src/index.ts"),
      },
    },
    server: {
      port: 5173,
      host: 'localhost',
      strictPort: false,
    },
    build: {
      rollupOptions: {
        input: {
          index: path.resolve(__dirname, "./src/renderer/index.html"),
          settings: path.resolve(__dirname, "./src/renderer/settings.html"),
          downloads: path.resolve(__dirname, "./src/renderer/downloads.html"),
        },
      },
    },
    plugins: [
      react(),
      sentryVitePlugin({
        authToken: "some invalid auth token",
        org: "some invalid org",
        project: "some invalid project",
        telemetry: false,
        sourcemaps: {
          assets: [],
        },
        release: {
          inject: false,
        },
        errorHandler() {
          // do nothing on errors :)
          // They will happen because of the invalid auth token
        },
      }),
    ],
  },
});
