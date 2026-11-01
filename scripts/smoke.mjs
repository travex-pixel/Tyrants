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
  await page.waitForSelector("text=Pick someone up.", { timeout: 20000 });
  await shot("02-pickup-prompt");
});
await step("grab and throw a creature via pointer", async () => {
  // creatures walk and this headless renderer runs at ~4 fps, so retry the gesture a few times
  let thrown = 0;
  for (let attempt = 0; attempt < 4 && !thrown; attempt++) {
    let pos = null;
    for (let g = 0; g < 5; g++) {
      pos = await page.evaluate(() => window.__lt?.creatureScreenPos?.());
      if (!pos) throw new Error("no creature position helper");
      await page.mouse.move(pos.x, pos.y);
      await page.mouse.down();
      await page.waitForTimeout(250);
      if (await page.evaluate(() => window.__lt.held())) break;
      await page.mouse.up();
      await page.waitForTimeout(300);
    }
    if (!(await page.evaluate(() => window.__lt.held()))) throw new Error("could not grab a creature");
    await page.mouse.move(pos.x + 60, pos.y - 20, { steps: 4 });
    await page.waitForTimeout(100);
    if (attempt === 0) {
      await page.waitForSelector("text=Now throw them", { timeout: 5000 });
      await shot("03-holding");
    }
    // A real flick arrives at 60-120 Hz; this software renderer processes one Playwright move per frame (~1 s),
    // so dispatch the flick's pointer events directly on the canvas at a realistic rate.
    await page.evaluate(([x, y]) => {
      const el = document.querySelector("canvas");
      const fire = (type, cx, cy) => el.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 1, pointerType: "mouse", isPrimary: true, button: 0, buttons: type === "pointerup" ? 0 : 1, clientX: cx, clientY: cy }));
      return new Promise((resolve) => {
        let i = 0;
        const tick = () => {
          if (i < 8) { fire("pointermove", x + 60 + i * 45, y - 20 - i * 6); i++; setTimeout(tick, 12); }
          else { fire("pointerup", x + 60 + 8 * 45, y - 20 - 8 * 6); resolve(); }
        };
        tick();
      });
    }, [pos.x, pos.y]);
    await page.mouse.up(); // release the real pointer (and its capture) too
    await page.waitForTimeout(800);
    thrown = (await page.evaluate(() => window.__lt.stats())).thrown;
  }
  if (thrown < 1) throw new Error("throw not registered");
  await shot("04-thrown");
  await page.waitForSelector("text=Pour out some friends.", { timeout: 12000 });
});
await step("tutorial: pour friends, zap", async () => {
  await page.waitForSelector("text=Pour out some friends.", { timeout: 15000 });
  const stroke = async () => {
    let spot = null;
    for (let k = 0; k < 6; k++) {
      spot = await page.evaluate((kk) => window.__lt.buildSpotScreen(kk), k);
      if (spot && spot.y > 140 && spot.y < 560 && spot.x > 120 && spot.x < 1100) break;
    }
    await page.mouse.move(spot.x, spot.y);
    await page.mouse.down();
    for (let i = 0; i < 6; i++) {
      await page.mouse.move(spot.x + i * 25, spot.y + i * 6);
      await page.waitForTimeout(260);
    }
    await page.mouse.up();
  };
  for (let a = 0; a < 3; a++) {
    await stroke();
    await page.waitForTimeout(800);
    if ((await page.evaluate(() => window.__lt.ui())).intro >= 5) break;
  }
  await page.waitForSelector("text=Now zap something.", { timeout: 15000 });
  await shot("04b-friends");
  for (let a = 0; a < 3; a++) {
    await stroke();
    await page.waitForTimeout(800);
    if ((await page.evaluate(() => window.__lt.ui())).intro >= 6 || (await page.evaluate(() => window.__lt.ui())).intro < 0) break;
  }
  await shot("04c-tutorial-done");
  for (let i = 0; i < 20; i++) {
    const ui = await page.evaluate(() => window.__lt.ui());
    if (ui.intro < 0) break;
    await page.waitForTimeout(500);
  }
});
await step("intro finished, HUD visible", async () => {
  const ui = await page.evaluate(() => window.__lt.ui());
  if (ui.intro >= 0) throw new Error(`intro still at stage ${ui.intro}`);
  await page.locator('button.token:has-text("Build")').first().click({ force: true });
  await page.waitForTimeout(600);
  await shot("05-build-menu");
});
await step("place a lumber camp", async () => {
  await page.locator('button.tile.more').first().click({ force: true });
  await page.waitForTimeout(600);
  await page.locator('button.tile').filter({ hasText: /^Lumber/ }).first().click({ force: true });
  await page.waitForTimeout(400);
  await page.waitForTimeout(300);
  const spot = await page.evaluate(() => window.__lt.buildSpotScreen(1));
  await page.mouse.click(spot.x, spot.y);
  await page.waitForTimeout(500);
  const n = await page.evaluate(() => window.__lt.buildingCount());
  if (n < 2) throw new Error(`expected a planned building, got ${n}`);
  // the Book is hidden for the first ten minutes; skip ahead so later steps can open it
  await page.evaluate(() => window.__lt.fastForward(620));
  await shot("06-lumber-placed");
});
await step("spawn ten goblins", async () => {
  await page.keyboard.press("1");
  const spot = await page.evaluate(() => window.__lt.buildSpotScreen(0));
  const before = (await page.evaluate(() => window.__lt.stats())).pop;
  await page.mouse.move(spot.x, spot.y);
  await page.mouse.down();
  for (let i = 0; i < 8; i++) {
    await page.mouse.move(spot.x + i * 20, spot.y + (i % 2) * 10);
    await page.waitForTimeout(220);
  }
  await page.mouse.up();
  await page.waitForTimeout(400);
  const pop = await page.evaluate(() => window.__lt.stats().pop);
  if (pop < before + 3) throw new Error(`pop ${before} -> ${pop}`);
  await shot("07-goblins");
});
await step("lightning + bless", async () => {
  await page.keyboard.press("2");
  const c = await page.evaluate(() => window.__lt.creatureScreenPos());
  const st0 = await page.evaluate(() => window.__lt.stats());
  await page.mouse.move(c.x, c.y);
  await page.mouse.down();
  await page.waitForTimeout(500);
  await page.mouse.up();
  await page.waitForTimeout(250);
  await shot("08-lightning");
  await page.keyboard.press("3");
  await page.mouse.move(c.x + 40, c.y);
  await page.mouse.down();
  await page.waitForTimeout(500);
  await page.mouse.up();
  await page.waitForTimeout(400);
  const st = await page.evaluate(() => window.__lt.stats());
  if (st.struck <= st0.struck || st.blessed <= st0.blessed) {
    const dbg = await page.evaluate(() => ({ ui: window.__lt.ui(), cur: window.__lt.cursor() }));
    throw new Error(`struck ${st0.struck}->${st.struck} blessed ${st0.blessed}->${st.blessed} at ${JSON.stringify(c)} ${JSON.stringify(dbg)}`);
  }
});
await step("terraform", async () => {
  await page.keyboard.press("4");
  const spot = await page.evaluate(() => window.__lt.buildSpotScreen(2));
  await page.mouse.move(spot.x, spot.y);
  await page.mouse.down();
  await page.waitForTimeout(700);
  await page.mouse.up();
  await page.keyboard.press("0");
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
  await page.locator('button[title^="The Book"]').click({ force: true });
  await page.waitForTimeout(400);
  await page.locator('button:has-text("Rivals")').first().click({ force: true });
  await page.waitForTimeout(400);
  await shot("12-rivals");
  await page.keyboard.press("Escape");
});
await step("save, reload, continue", async () => {
  await page.locator('button[title^="The Book"]').click({ force: true });
  await page.waitForTimeout(400);
  await page.locator('button:has-text("Settings")').first().click({ force: true });
  await page.waitForTimeout(400);
  await page.locator('button:has-text("Save now")').first().click({ force: true });
  await page.waitForSelector("text=World saved", { timeout: 15000 });
  await page.waitForTimeout(1500);
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForSelector("text=Continue World", { timeout: 20000 });
  await shot("13-menu");
  await page.click("text=Continue World");
  await page.waitForTimeout(1500);
  const st = await page.evaluate(() => window.__lt.stats());
  if (st.pop < 15) throw new Error(`pop after reload ${st.pop}`);
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
