// scripts/qrtransfer-browser.mjs
// 実ブラウザ（Chromium, Playwright）で QRTransfer.html を開き、送信画面のキャンバスを
// そのまま受信側の解析に流し込んで、テキストとファイル（写真の縮小あり）が復元されることを確かめる。
// カメラだけは実機でしか確かめられないので、ここでは扱わない。
//   実行: node scripts/qrtransfer-browser.mjs   （playwright と Chromium が要る）
import { resolve, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { mkdirSync } from "node:fs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PAGE = pathToFileURL(resolve(root, "QRTransfer.html")).href;
const SHOT_DIR = process.env.QRT_SHOT_DIR || resolve(root, "dist", "shots");

let pw;
try { pw = await import("playwright"); }
catch (e) {
  try { pw = await import("/opt/node22/lib/node_modules/playwright/index.mjs"); }
  catch (e2) { console.error("playwright が見つかりません: npm i -D playwright"); process.exit(2); }
}
const browser = await pw.chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", e => errors.push("pageerror: " + e.message));
page.on("console", m => { if (m.type() === "error") errors.push("console: " + m.text()); });
await page.goto(PAGE);

let pass = 0, fail = 0;
const check = (name, ok, extra) => { if (ok) { pass++; console.log("  ok   " + name); } else { fail++; console.log("  FAIL " + name + (extra ? " — " + extra : "")); } };

/** 送信中の全フレームを順に表示し、キャンバス画素を受信器へ流す（カメラの代わり） */
async function pumpAllFrames(opts = {}) {
  return page.evaluate(async (opts) => {
    const Q = window.QRT;
    const c = document.getElementById("tx-canvas");
    const n = Q.tx.frames.length;
    const order = [...Array(n).keys()];
    if (opts.shuffle) for (let i = n - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [order[i], order[j]] = [order[j], order[i]]; }
    let decoded = 0, t0 = performance.now();
    for (const i of order) {
      Q.showFrame(i);
      // カメラ相当: 640px に縮小し、少し灰色の余白を付けて渡す
      const side = 640, pad = 40;
      const cam = document.createElement("canvas"); cam.width = cam.height = side;
      const g = cam.getContext("2d");
      g.fillStyle = "#777"; g.fillRect(0, 0, side, side);
      g.drawImage(c, pad, pad, side - pad * 2, side - pad * 2);
      const img = g.getImageData(0, 0, side, side);
      const res = await Q.feedImageData(img);
      if (res && res.results.some(r => r.kind === "qr")) decoded++;
    }
    await new Promise(r => setTimeout(r, 200));
    return { n, decoded, ms: Math.round((performance.now() - t0) / n), got: Q.rx.receiver.got, total: Q.rx.receiver.total,
             result: Q.rx.result ? { ok: Q.rx.result.ok, isFile: Q.rx.result.isFile, name: Q.rx.result.name, mime: Q.rx.result.mime, len: Q.rx.result.data.length, text: Q.rx.result.text } : null };
  }, opts);
}

console.log("[テキスト転送]");
const TEXT = "QR転送のテストです。\n" + Array.from({ length: 120 }, (_, i) => `行${i}: ${(Math.sin(i) * 1e9).toString(36)} ${(i * 2654435761 % 4294967296).toString(16)}`).join("\n") + "\n終わり🎉";
await page.fill("#tx-text", TEXT);
await page.waitForFunction(() => !document.getElementById("tx-start").disabled, null, { timeout: 5000 });
const stat = await page.evaluate(() => ({ frames: document.getElementById("st-frames").textContent, comp: document.getElementById("st-comp").textContent }));
console.log("    枚数: " + stat.frames + " / 圧縮: " + stat.comp);
await page.click("#tx-start");
await page.waitForSelector("#tx-screen.on");
check("送信画面が全画面で開く", await page.isVisible("#tx-canvas"));
mkdirSync(SHOT_DIR, { recursive: true });
await page.screenshot({ path: resolve(SHOT_DIR, "tx-screen.png") });
await page.click("#tx-pause");
await page.evaluate(() => document.getElementById("tab-rx").click());   // 送信画面の裏でパネルを切り替える（テスト用途）
const r1 = await pumpAllFrames({ shuffle: true });
console.log(`    ${r1.n} 枚中 ${r1.decoded} 枚を解析（平均 ${r1.ms}ms/枚）`);
check("すべての QR が読める", r1.decoded === r1.n);
check("受信結果がテキストとして復元される", r1.result && r1.result.ok && !r1.result.isFile && r1.result.text === TEXT, JSON.stringify(r1.result && { ok: r1.result.ok, len: r1.result.len }));
check("結果パネルが表示される", await page.isVisible("#rx-result.on"));
await page.evaluate(() => window.QRT.stopSending());
await page.screenshot({ path: resolve(SHOT_DIR, "rx-result-text.png"), fullPage: true });

console.log("[写真転送（縮小あり）]");
await page.click("#tab-tx");
await page.click('#tx-kind button[data-kind="file"]');
// 1600x1200 のカラフルな PNG をページ内で作って <input type=file> に入れる
const fileInfo = await page.evaluate(async () => {
  const c = document.createElement("canvas"); c.width = 1600; c.height = 1200;
  const g = c.getContext("2d");
  for (let i = 0; i < 40; i++) { g.fillStyle = `hsl(${i * 9},70%,${40 + (i % 5) * 10}%)`; g.fillRect((i % 8) * 200, Math.floor(i / 8) * 240, 200, 240); }
  g.fillStyle = "#000"; g.font = "80px sans-serif"; g.fillText("QR転送", 100, 600);
  const blob = await new Promise(r => c.toBlob(r, "image/png"));
  const file = new File([blob], "photo.png", { type: "image/png" });
  const dt = new DataTransfer(); dt.items.add(file);
  const input = document.getElementById("tx-file");
  input.files = dt.files; input.dispatchEvent(new Event("change", { bubbles: true }));
  return { size: blob.size };
});
await page.waitForFunction(() => window.QRT.tx.prepared && window.QRT.tx.prepared.meta.isFile && !document.getElementById("tx-start").disabled, null, { timeout: 15000 });
const stat2 = await page.evaluate(() => ({ size: document.getElementById("st-size").textContent, frames: document.getElementById("st-frames").textContent, name: document.getElementById("tx-file-name").textContent }));
console.log(`    元 PNG ${fileInfo.size} B → 送信データ ${stat2.size} / ${stat2.frames}`);
check("写真が縮小されて元より小さくなる", await page.evaluate(() => window.QRT.tx.prepared.rawLength) < fileInfo.size);
check("縮小後は JPEG 名になる", await page.evaluate(() => window.QRT.tx.prepared.meta.name) === "photo.jpg");
await page.selectOption("#tx-ver", "16");
await page.click("#tx-start");
await page.waitForSelector("#tx-screen.on");
await page.click("#tx-pause");
await page.evaluate(() => document.getElementById("tab-rx").click());
await page.evaluate(() => { window.QRT.resetReceive(); });
const r2 = await pumpAllFrames({ shuffle: false });
console.log(`    ${r2.n} 枚中 ${r2.decoded} 枚を解析（平均 ${r2.ms}ms/枚）`);
check("V16 でもすべての QR が読める", r2.decoded === r2.n);
check("受信結果が JPEG ファイルとして復元される", r2.result && r2.result.ok && r2.result.isFile && r2.result.mime === "image/jpeg" && r2.result.name === "photo.jpg", JSON.stringify(r2.result));
const jpegOk = await page.evaluate(() => { const d = window.QRT.rx.result.data; return d[0] === 0xFF && d[1] === 0xD8; });
check("復元したバイト列が JPEG のヘッダで始まる", jpegOk);
await page.waitForFunction(() => { const i = document.getElementById("rx-img"); return i.style.display !== "none" && i.naturalWidth > 0; }, null, { timeout: 5000 }).catch(() => {});
check("受信画像がプレビューに表示される", await page.isVisible("#rx-img") && [640, 1024].includes(await page.evaluate(() => document.getElementById("rx-img").naturalWidth)));
await page.evaluate(() => window.QRT.stopSending());
await page.screenshot({ path: resolve(SHOT_DIR, "rx-result-image.png"), fullPage: true });

console.log("[UI]");
await page.click("#tab-tx");
await page.screenshot({ path: resolve(SHOT_DIR, "tx-panel.png"), fullPage: true });
await page.click("#btn-help");
check("ヘルプが開く", await page.isVisible("#help.on"));
await page.screenshot({ path: resolve(SHOT_DIR, "help.png") });
await page.click("#help-close");
check("横スクロールが出ない", await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
check("ページ内で例外・console.error なし", errors.length === 0, errors.join(" | "));

await browser.close();
console.log(`\n結果: ${pass} 成功 / ${fail} 失敗（スクリーンショット: ${SHOT_DIR}）`);
process.exit(fail ? 1 : 0);
