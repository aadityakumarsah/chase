import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import { loadEnvConfig } from "@next/env";
import { chromium } from "playwright-core";
import { createSession } from "../src/lib/auth";
import { getEnv } from "../src/lib/env";

loadEnvConfig(process.cwd(), true, { info() {}, error() {} });

async function main() {
  const env = getEnv();
  if (!env.ADMIN_PASSCODE) throw new Error("ADMIN_PASSCODE is missing");
  const base = env.APP_BASE_URL.replace(/\/$/, "");
  const browser = await chromium.launch({
    executablePath:
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    headless: true,
  });
  const frames = await mkdtemp(path.join(tmpdir(), "chase-stage-"));
  const output = path.join(process.cwd(), "docs", "assets");
  await mkdir(output, { recursive: true });
  try {
    const context = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
      deviceScaleFactor: 1,
      colorScheme: "dark",
    });
    await context.addCookies([
      {
        name: "admin",
        value: createSession(env.ADMIN_PASSCODE),
        domain: new URL(base).hostname,
        path: "/",
        httpOnly: true,
        secure: true,
        sameSite: "Lax",
      },
    ]);
    const page = await context.newPage();
    await page.goto(`${base}/stage`, {
      waitUntil: "domcontentloaded",
      timeout: 30_000,
    });
    await page.evaluate(() => localStorage.setItem("theme", "dark"));
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForTimeout(4_000);
    await page.screenshot({
      path: path.join(output, "stage-hero.png"),
      fullPage: false,
    });
    for (let index = 0; index < 30; index++) {
      await page.screenshot({
        path: path.join(frames, `frame-${String(index).padStart(3, "0")}.png`),
        fullPage: false,
      });
      await page.waitForTimeout(1_000);
    }
    const gif = spawnSync(
      "ffmpeg",
      [
        "-y",
        "-framerate",
        "1",
        "-i",
        path.join(frames, "frame-%03d.png"),
        "-vf",
        "fps=1,scale=960:-1:flags=lanczos,split[s0][s1];[s0]palettegen=max_colors=128[p];[s1][p]paletteuse=dither=bayer",
        path.join(output, "chase-stage.gif"),
      ],
      { stdio: "ignore" },
    );
    if (gif.status !== 0) throw new Error("GIF encoding failed");
    for (const [route, filename] of [
      ["/dashboard", "command-center.png"],
      ["/prompt-prs", "prompt-prs.png"],
    ] as const) {
      await page.goto(`${base}${route}`, {
        waitUntil: "domcontentloaded",
        timeout: 30_000,
      });
      await page.waitForTimeout(3_000);
      await page.screenshot({
        path: path.join(output, filename),
        fullPage: false,
      });
    }
  } finally {
    await browser.close();
    await rm(frames, { recursive: true, force: true });
  }
  console.log("Captured the 30-second stage GIF and production screenshots.");
}

void main().catch(() => {
  console.error("Demo asset capture failed; no credentials were printed.");
  process.exitCode = 1;
});
