// Generates deploy preview assets from the real game: OG/Twitter image, icons, hero image, loading backdrop.
// Usage: npm start (port 3000) then `node scripts/preview.mjs`
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
const require = createRequire(import.meta.url);
let pw;
try { pw = require("playwright"); } catch { pw = require("/opt/node-tools/node_modules/playwright"); }
const { chromium } = pw;
const BASE = process.env.BASE_URL || "http://localhost:3000";
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
fs.mkdirSync(path.join(root, "public/preview"), { recursive: true });

const browser = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });

// ── 1. Clean world capture (no HUD) ──
const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });
await page.goto(BASE, { waitUntil: "networkidle" });
await page.waitForSelector("canvas");
await page.waitForTimeout(2500);
if (await page.locator("text=Skip intro").count()) await page.click("text=Skip intro");
await page.waitForTimeout(500);
await page.addStyleTag({ content: "[data-hud],[data-labels]{display:none !important}" });
const staged = await page.evaluate(() => window.__lt.stageForPreview(22, 0.75));
console.log("staged:", JSON.stringify(staged));
await page.waitForTimeout(4000);
const heroPath = path.join(root, "public/preview/hero.jpg");
await page.screenshot({ path: heroPath, type: "jpeg", quality: 86 });
await page.setViewportSize({ width: 1200, height: 630 });
await page.evaluate(() => window.__lt.focusNearest(21));
await page.waitForTimeout(2500);
const worldOg = path.join(root, "public/preview/world-1200x630.jpg");
await page.screenshot({ path: worldOg, type: "jpeg", quality: 90 });
await page.close();

// ── 2. Composite the OG card: world shot + carved plaque title ──
const b64 = fs.readFileSync(worldOg).toString("base64");
const og = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
await og.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>
  html,body{margin:0;width:1200px;height:630px;overflow:hidden;font-family:ui-rounded,"SF Pro Rounded","Nunito","Segoe UI",system-ui,sans-serif}
  .bg{position:absolute;inset:0;background:url(data:image/jpeg;base64,${b64}) center/cover}
  .shade{position:absolute;inset:0;background:linear-gradient(180deg,rgba(40,20,5,0.05) 0%,rgba(40,20,5,0) 45%,rgba(40,20,5,0.55) 100%)}
  .plaque{position:absolute;left:56px;bottom:56px;padding:22px 40px 24px;border-radius:22px;
    background:linear-gradient(180deg,#a56f3f,#7b4d2a 60%,#6a4124);border:4px solid #3f2512;
    box-shadow:inset 0 0 0 3px #b98a46,inset 0 3px 0 rgba(255,230,190,.3),0 18px 40px rgba(20,10,0,.55)}
  .title{font-size:78px;font-weight:900;letter-spacing:-0.02em;line-height:1;
    background:linear-gradient(180deg,#ffe9b5,#e2a33a);-webkit-background-clip:text;background-clip:text;color:transparent;
    filter:drop-shadow(0 3px 0 #3b220f) drop-shadow(0 8px 14px rgba(0,0,0,.45))}
  .tag{margin-top:10px;font-size:30px;font-weight:800;color:#f6e8cf;text-shadow:0 2px 0 #3b220f,0 4px 10px rgba(0,0,0,.4);letter-spacing:.02em}
  .ribbon{position:absolute;right:48px;top:44px;padding:14px 26px;border-radius:999px;background:linear-gradient(180deg,#f3e6cb,#e7d4ae);
    border:3px solid #5a3a20;box-shadow:inset 0 0 0 2px #e3c27e,0 10px 24px rgba(20,10,0,.45);color:#3a2918;font-weight:900;font-size:24px}
</style></head><body><div class="bg"></div><div class="shade"></div>
<div class="plaque"><div class="title">Little Tyrants</div><div class="tag">Small worlds. Big egos.</div></div>
<div class="ribbon">Free in your browser · Solo or with friends</div></body></html>`);
await og.waitForTimeout(300);
await og.screenshot({ path: path.join(root, "app/opengraph-image.jpg"), type: "jpeg", quality: 88 });
fs.copyFileSync(path.join(root, "app/opengraph-image.jpg"), path.join(root, "app/twitter-image.jpg"));
await og.close();

// ── 3. Icons: a gilded island crest ──
const iconHtml = (size) => `<!doctype html><html><head><meta charset="utf-8"><style>
  html,body{margin:0;width:${size}px;height:${size}px;overflow:hidden}
  .bg{position:absolute;inset:0;border-radius:${Math.round(size * 0.22)}px;background:radial-gradient(circle at 50% 30%,#f3a76e 0%,#c86a3f 38%,#4a2a4a 100%)}
  .island{position:absolute;left:${size * 0.16}px;top:${size * 0.36}px;width:${size * 0.68}px;height:${size * 0.22}px;border-radius:50% 50% 45% 45%/60% 60% 40% 40%;
    background:linear-gradient(180deg,#8cbf4c,#4f8a36 55%,#9c5a3c 56%,#5e3a29 100%);box-shadow:0 ${size * 0.03}px ${size * 0.06}px rgba(0,0,0,.45)}
  .rock{position:absolute;left:${size * 0.3}px;top:${size * 0.55}px;width:${size * 0.4}px;height:${size * 0.2}px;border-radius:0 0 50% 50%/0 0 100% 100%;
    background:linear-gradient(180deg,#9c5a3c,#5e3a29)}
  .tree{position:absolute;width:0;height:0;border-left:${size * 0.06}px solid transparent;border-right:${size * 0.06}px solid transparent;border-bottom:${size * 0.16}px solid #3f7a33}
  .crown{position:absolute;left:${size * 0.33}px;top:${size * 0.12}px;width:${size * 0.34}px;height:${size * 0.2}px;
    background:linear-gradient(180deg,#ffe9b5,#e2a33a);clip-path:polygon(0 100%,0 25%,25% 60%,50% 0,75% 60%,100% 25%,100% 100%);
    filter:drop-shadow(0 ${size * 0.015}px 0 #7a4d14) drop-shadow(0 ${size * 0.03}px ${size * 0.04}px rgba(0,0,0,.4))}
</style></head><body><div class="bg"></div><div class="crown"></div><div class="island"></div><div class="rock"></div>
<div class="tree" style="left:${size * 0.28}px;top:${size * 0.27}px"></div><div class="tree" style="left:${size * 0.56}px;top:${size * 0.25}px;border-bottom-color:#5fa84a"></div><div class="tree" style="left:${size * 0.42}px;top:${size * 0.3}px;border-bottom-color:#6ea444"></div>
</body></html>`;
for (const [file, size] of [["app/icon.png", 512], ["app/apple-icon.png", 180], ["public/preview/icon-192.png", 192], ["public/preview/icon-512.png", 512]]) {
  const p = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
  await p.setContent(iconHtml(size));
  await p.screenshot({ path: path.join(root, file), type: "png", omitBackground: true });
  await p.close();
}
await browser.close();
console.log("preview assets written: app/opengraph-image.jpg, app/twitter-image.jpg, app/icon.png, app/apple-icon.png, public/preview/*");
