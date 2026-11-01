// Browser smoke test: loads the game, plays through the intro, uses powers, checks console errors, takes screenshots.
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
let pw;
try { pw = require("playwright"); } catch { pw = require("/opt/node-tools/node_modules/playwright"); }
const { chromium } = pw;
import fs from "node:fs";

const BASE = process.env.BASE_URL || "http://localhost:3000";
const OUT = process.env.OUT_DIR || "test-results";
fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
const errors = [];
const logs = [];
page.on("console", (m) => {
  if (m.type() === "error" || m.type() === "warning") logs.push(`${m.type()}: ${m.text()}`);
});
page.on("pageerror", (e) => errors.push(String(e)));

const shot = async (name) => page.screenshot({ path: `${OUT}/${name}.png` });
const step = async (name, fn) => {
  const t = Date.now();
  try {
    await fn();
    console.log(`✓ ${name} (${Date.now() - t}ms)`);
  } catch (e) {
    console.log(`✗ ${name}: ${e.message}`);
    await shot(`fail-${name.replace(/\W+/g, "_")}`);
    throw e;
  }
};

await step("load first visit (intro)", async () => {
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.waitForSelector("canvas", { timeout: 30000 });
  await page.waitForTimeout(2500);
  await shot("01-reveal");
});
await step("intro progresses to pick-up prompt", async () => {
  await page.waitForSelector("text=Go on. Pick someone up.", { timeout: 20000 });
  await shot("02-pickup-prompt");
});
await step("grab and throw a creature via pointer", async () => {
  // find a creature's screen position via the world
  const pos = await page.evaluate(() => window.__lt?.creatureScreenPos?.());
  if (!pos) throw new Error("no creature position helper");
  await page.mouse.move(pos.x, pos.y);
  await page.mouse.down();
  await page.waitForTimeout(150);
  await page.mouse.move(pos.x + 60, pos.y - 20, { steps: 4 });
  await page.waitForTimeout(100);
  await page.waitForSelector("text=Now throw them", { timeout: 5000 });
  await shot("03-holding");
  // flick
  for (let i = 0; i < 8; i++) {
    await page.mouse.move(pos.x + 60 + i * 45, pos.y - 20 - i * 6);
    await page.waitForTimeout(25);
  }
  await page.mouse.up();
  await page.waitForTimeout(700);
  await shot("04-thrown");
  await page.waitForSelector("text=Your neighbours are getting stronger.", { timeout: 8000 });
  const stats = await page.evaluate(() => window.__lt.stats());
  if (stats.thrown < 1) throw new Error("throw not registered");
});
await step("finish intro via Build", async () => {
  await page.click("text=Build");
  await page.waitForTimeout(600);
  await shot("05-build-menu");
});
await step("place a lumber camp", async () => {
  await page.click("text=Lumber Camp");
  await page.waitForTimeout(300);
  const spot = await page.evaluate(() => window.__lt.buildSpotScreen(1));
  await page.mouse.click(spot.x, spot.y);
  await page.waitForTimeout(500);
  const n = await page.evaluate(() => window.__lt.buildingCount());
  if (n < 2) throw new Error(`expected a planned building, got ${n}`);
  await shot("06-lumber-placed");
});
await step("spawn ten goblins", async () => {
  await page.keyboard.press("2");
  const spot = await page.evaluate(() => window.__lt.buildSpotScreen(0));
  for (let i = 0; i < 10; i++) {
    await page.mouse.click(spot.x + (i % 5) * 12, spot.y + Math.floor(i / 5) * 12);
    await page.waitForTimeout(60);
  }
  await page.waitForTimeout(400);
  const pop = await page.evaluate(() => window.__lt.stats().pop);
  if (pop < 14) throw new Error(`pop ${pop}`);
  await shot("07-goblins");
});
await step("lightning + bless", async () => {
  await page.keyboard.press("3");
  const c = await page.evaluate(() => window.__lt.creatureScreenPos());
  await page.mouse.click(c.x, c.y);
  await page.waitForTimeout(250);
  await shot("08-lightning");
  await page.keyboard.press("4");
  await page.mouse.click(c.x + 40, c.y);
  await page.waitForTimeout(400);
  const st = await page.evaluate(() => window.__lt.stats());
  if (st.struck < 1 || st.blessed < 1) throw new Error(`struck ${st.struck} blessed ${st.blessed}`);
});
await step("terraform", async () => {
  await page.keyboard.press("5");
  const spot = await page.evaluate(() => window.__lt.buildSpotScreen(2));
  await page.mouse.move(spot.x, spot.y);
  await page.mouse.down();
  await page.waitForTimeout(700);
  await page.mouse.up();
  await page.keyboard.press("1");
});
await step("close-up of creatures (daytime)", async () => {
  await page.evaluate(() => window.__lt.focusNearest(9));
  await page.waitForTimeout(1500);
  await shot("08b-closeup-day");
  await page.evaluate(() => window.__lt.focusNearest(34));
  await page.waitForTimeout(1200);
});
await step("simulate 2 minutes fast and verify gathering + construction", async () => {
  await page.evaluate(() => window.__lt.fastForward(150));
  await page.waitForTimeout(500);
  const st = await page.evaluate(() => window.__lt.stats());
  console.log("   stats:", JSON.stringify(st));
  if (st.gathered < 5) throw new Error("nothing gathered");
  await shot("09-after-2min");
});
await step("close-up of creatures", async () => {
  await page.evaluate(() => window.__lt.focusNearest(9));
  await page.waitForTimeout(1500);
  await shot("09b-closeup");
  await page.evaluate(() => window.__lt.focusNearest(34));
  await page.waitForTimeout(1200);
});
await step("select a creature and open panels", async () => {
  const c = await page.evaluate(() => window.__lt.creatureScreenPos());
  await page.mouse.click(c.x, c.y);
  await page.waitForTimeout(400);
  await shot("10-creature-panel");
  await page.keyboard.press("c");
  await page.waitForTimeout(300);
  await shot("11-chronicle");
  await page.keyboard.press("Escape");
  await page.click('button[title="Rival Overlords"]');
  await page.waitForTimeout(300);
  await shot("12-rivals");
  await page.keyboard.press("Escape");
});
await step("save, reload, continue", async () => {
  await page.click('button[title="Menu (Esc)"]');
  await page.waitForTimeout(300);
  await page.click("text=Save now");
  await page.waitForTimeout(600);
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForSelector("text=Continue World", { timeout: 20000 });
  await shot("13-menu");
  await page.click("text=Continue World");
  await page.waitForTimeout(1500);
  const st = await page.evaluate(() => window.__lt.stats());
  if (st.pop < 14) throw new Error(`pop after reload ${st.pop}`);
  await shot("14-continued");
});
await step("mobile viewport", async () => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(800);
  await shot("15-mobile");
});

console.log("page errors:", errors.length ? errors : "none");
const relevant = logs.filter((l) => !l.includes("Download the React DevTools") && !l.includes("GPU stall") && !l.includes("WebGL"));
console.log("console warnings/errors:", relevant.length ? relevant.slice(0, 15) : "none");
await browser.close();
if (errors.length) process.exit(1);
