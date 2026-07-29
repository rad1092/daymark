import { describe, expect, it } from "vitest";
import { createPrecacheFileList } from "./vite.config";

describe("service worker precache", () => {
  it("includes hashed JavaScript and CSS exactly once", () => {
    const files = createPrecacheFileList([
      "index-A1.js",
      "assets/index-B2.js",
      "assets/index-C3.css",
      "assets/index-B2.js",
      "assets/source.map",
    ]);

    expect(files).toContain("assets/index-B2.js");
    expect(files).toContain("assets/index-C3.css");
    expect(files.filter((file) => file === "assets/index-B2.js")).toHaveLength(
      1,
    );
    expect(files).not.toContain("assets/source.map");
  });
});
