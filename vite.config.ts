import react from "@vitejs/plugin-react";
import { createHash } from "node:crypto";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { Plugin } from "vite";
import { defineConfig } from "vitest/config";

const STATIC_SHELL_FILES = [
  "index.html",
  "manifest.webmanifest",
  "icons/daymark-192.png",
  "icons/daymark-512.png",
  "og.png",
];

export function createPrecacheFileList(assetFiles: string[]): string[] {
  return [
    ...STATIC_SHELL_FILES,
    ...Array.from(new Set(assetFiles))
      .filter((filename) => /^assets\/.+\.(?:css|js)$/.test(filename))
      .sort(),
  ];
}

function stampServiceWorker(): Plugin {
  return {
    name: "daymark-release-cache",
    apply: "build",
    enforce: "post",
    async closeBundle() {
      const outputDirectory = resolve(process.cwd(), "dist");
      const assetEntries = await readdir(
        resolve(outputDirectory, "assets"),
        { withFileTypes: true },
      );
      const releaseFiles = createPrecacheFileList(
        assetEntries
          .filter((entry) => entry.isFile())
          .map((entry) => `assets/${entry.name}`),
      );
      const releaseHash = createHash("sha256");
      for (const filename of releaseFiles) {
        releaseHash.update(await readFile(resolve(outputDirectory, filename)));
      }

      const workerPath = resolve(outputDirectory, "service-worker.js");
      const template = await readFile(workerPath, "utf8");
      if (
        !template.includes("__DAYMARK_RELEASE__") ||
        !template.includes("__DAYMARK_ASSETS__")
      ) {
        throw new Error("Daymark service worker build markers are missing.");
      }
      const worker = template.replace(
        '"__DAYMARK_ASSETS__"',
        JSON.stringify(releaseFiles),
      );
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
