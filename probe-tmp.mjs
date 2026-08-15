/** 溜め中に何がどの大きさで光っているのかを実測する調査用スクリプト */
import { spawn } from "node:child_process";
import { chromium } from "playwright";

const PORT = 5433;
const server = spawn("npx", ["vite", "--port", String(PORT), "--strictPort", "--host", "127.0.0.1"], { stdio: ["ignore", "pipe", "pipe"] });
await new Promise((res, rej) => {
  const t = setTimeout(() => rej(new Error("timeout")), 60000);
  const on = (b) => { if (b.toString().includes("ready in") || b.toString().includes("Local:")) { clearTimeout(t); res(); } };
  server.stdout.on("data", on); server.stderr.on("data", on);
});
await new Promise((r) => setTimeout(r, 1500));

const browser = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--no-sandbox"],
});
const ctx = await browser.newContext({ viewport: { width: 430, height: 932 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(2000);
await page.evaluate(() => {
  const raw = localStorage.getItem("crimon_save_v1");
  if (raw) { const s = JSON.parse(raw); s.crystal = 999999; localStorage.setItem("crimon_save_v1", JSON.stringify(s)); }
});
await page.reload({ waitUntil: "domcontentloaded" });
await page.waitForTimeout(1200);
for (const b of await page.$$(".bottom-nav__btn")) {
  if ((await b.innerText()).includes("召喚")) { await b.click(); break; }
}
await page.waitForTimeout(400);
await page.evaluate(() => { let i = 0; const v = [0.99, 0.1, 0.2]; Math.random = () => v[i++ % v.length]; });
await page.click(".summon-cta__btn--single");
await page.waitForTimeout(1700);
const info = await page.evaluate(() => {
  const out = [];
  for (const e of document.querySelectorAll(".fx, .fx > *, .fx__circle > i")) {
    const r = e.getBoundingClientRect();
    const cs = getComputedStyle(e);
    out.push({
      cls: e.className,
      box: `${Math.round(r.width)}x${Math.round(r.height)} @${Math.round(r.left)},${Math.round(r.top)}`,
      opacity: cs.opacity,
      filter: cs.filter,
      bg: cs.backgroundImage.slice(0, 60),
      shadow: cs.boxShadow.slice(0, 50),
    });
  }
  return { root: document.querySelector(".summon-screen--result")?.className, out };
});
console.log(info.root);
for (const o of info.out) console.log(JSON.stringify(o));
await browser.close();
server.kill("SIGTERM");
