import react from "@vitejs/plugin-react";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { Plugin } from "vite";
import { defineConfig } from "vitest/config";

function stampServiceWorker(): Plugin {
  return {
    name: "daymark-release-cache",
    apply: "build",
    enforce: "post",
    async closeBundle() {
      const outputDirectory = resolve(process.cwd(), "dist");
      const releaseFiles = [
        "index.html",
        "manifest.webmanifest",
        "icons/daymark-192.png",
        "icons/daymark-512.png",
      ];
      const releaseHash = createHash("sha256");
      for (const filename of releaseFiles) {
        releaseHash.update(await readFile(resolve(outputDirectory, filename)));
      }

      const workerPath = resolve(outputDirectory, "service-worker.js");
      const worker = await readFile(workerPath, "utf8");
      if (!worker.includes("__DAYMARK_RELEASE__")) {
        throw new Error("Daymark service worker release marker is missing.");
      }
      releaseHash.update(worker);
      const releaseId = releaseHash.digest("hex").slice(0, 16);
      await writeFile(
        workerPath,
        worker.replace("__DAYMARK_RELEASE__", releaseId),
      );
    },
  };
}

export default defineConfig({
  base: "/",
  plugins: [react(), stampServiceWorker()],
  test: {
    environment: "jsdom",
    setupFiles: "./src/test/setup.ts",
    css: true,
  },
  build: {
    target: "es2022",
    sourcemap: false,
  },
});
