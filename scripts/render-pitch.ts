import { copyFile, mkdtemp, mkdir, readdir, rm } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { chromium } from "playwright-core";

async function main() {
  const work = await mkdtemp(path.join(tmpdir(), "chase-pitch-render-"));
  const copy = path.join(work, "pitch-preview.pptx");
  const quicklook = path.join(work, "quicklook");
  const output = path.join(process.cwd(), ".artifacts", "pitch-render");
  await copyFile(
    path.join(process.cwd(), "docs", "Chase-finale-pitch.pptx"),
    copy,
  );
  await mkdir(quicklook);
  await rm(output, { recursive: true, force: true });
  await mkdir(output, { recursive: true });
  const preview = spawnSync("qlmanage", ["-p", "-o", quicklook, copy], {
    stdio: "ignore",
  });
  if (preview.status !== 0) throw new Error("Quick Look render failed");
  const bundle = (await readdir(quicklook)).find((name) =>
    name.endsWith(".qlpreview"),
  );
  if (!bundle) throw new Error("Quick Look preview bundle is missing");
  const html = path.join(quicklook, bundle, "Preview.html");
  const browser = await chromium.launch({
    executablePath:
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    headless: true,
  });
  try {
    const page = await browser.newPage({
      viewport: { width: 1200, height: 780 },
      deviceScaleFactor: 1,
    });
    await page.goto(pathToFileURL(html).href, { waitUntil: "load" });
    const slides = page.locator("div.slide");
    const count = await slides.count();
    if (count !== 6) throw new Error(`Expected 6 slides, found ${count}`);
    for (let index = 0; index < count; index++)
      await slides.nth(index).screenshot({
        path: path.join(
          output,
          `slide-${String(index + 1).padStart(2, "0")}.png`,
        ),
      });
  } finally {
    await browser.close();
    await rm(work, { recursive: true, force: true });
  }
  console.log(`Rendered all six slides to ${output}.`);
}

void main().catch(() => {
  console.error("Pitch rendering failed.");
  process.exitCode = 1;
});
