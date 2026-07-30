import react from "@vitejs/plugin-react";
import { createHash } from "node:crypto";
import { readdir, readFile, rm, writeFile } from "node:fs/promises";
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

function nativeSoftwareShell(): Plugin {
  return {
    name: "daymark-native-software-shell",
    apply: "build",
    transformIndexHtml(html) {
      return html
        .replace(
          /\s*<link\s+rel="(?:manifest|apple-touch-icon|icon)"[^>]*>/g,
          "",
        )
        .replace(/\s*<meta\s+property="og:[^>]*>/g, "")
        .replace(/\s*<meta\s+name="twitter:[^>]*>/g, "")
        .replace(
          "<title>Daymark — 오늘의 약속 세 가지</title>",
          "<title>Daymark</title>",
        );
    },
    async closeBundle() {
      const outputDirectory = resolve(process.cwd(), "dist");
      await Promise.all([
        rm(resolve(outputDirectory, "manifest.webmanifest"), {
          force: true,
        }),
        rm(resolve(outputDirectory, "service-worker.js"), { force: true }),
        rm(resolve(outputDirectory, "og.png"), { force: true }),
        rm(resolve(outputDirectory, "icons"), {
          force: true,
          recursive: true,
        }),
      ]);
    },
  };
}

export default defineConfig(({ mode }) => {
  const software = mode === "software";
  return {
    base: "/",
    define: {
      "import.meta.env.VITE_DAYMARK_SURFACE": JSON.stringify(
        software ? "software" : "demo",
      ),
    },
    resolve: {
      alias: {
        "#daymark-surface": resolve(
          process.cwd(),
          software
            ? "src/software/SoftwareApp.tsx"
            : "src/WebDemoApp.tsx",
        ),
      },
    },
    plugins: [
      react(),
      software ? nativeSoftwareShell() : stampServiceWorker(),
    ],
    test: {
      environment: "jsdom",
      setupFiles: "./src/test/setup.ts",
      css: true,
    },
    build: {
      target: "es2022",
      sourcemap: false,
    },
  };
});
