// scripts/tools-browser.mjs
// Meishi.html / Numpre.html / Photo3D.html を実ブラウザ（Chromium, Playwright）で動かす。
// Claude API はモックに差し替え（送っているリクエストの形だけ検査）。カメラ・マイクは実機でしか確かめられない。
//   実行: node scripts/tools-browser.mjs
import { resolve, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { mkdirSync } from "node:fs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SHOT_DIR = process.env.QRT_SHOT_DIR || resolve(root, "dist", "shots");
mkdirSync(SHOT_DIR, { recursive: true });
let pw;
try { pw = await import("playwright"); } catch (e) { try { pw = await import("/opt/node22/lib/node_modules/playwright/index.mjs"); } catch (e2) { console.error("playwright が見つかりません"); process.exit(2); } }
const browser = await pw.chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, acceptDownloads: true });
let pass = 0, fail = 0;
const check = (name, ok, extra) => { if (ok) { pass++; console.log("  ok   " + name); } else { fail++; console.log("  FAIL " + name + (extra ? " — " + extra : "")); } };
const errors = [];
async function open(file) {
  const page = await ctx.newPage();
  page.on("pageerror", e => errors.push(file + " pageerror: " + e.message));
  page.on("console", m => { if (m.type() === "error" && !/status of 401/.test(m.text())) errors.push(file + " console: " + m.text()); });
  await page.goto(pathToFileURL(resolve(root, file)).href);
  return page;
}
/** ページ内で canvas から File を作って <input type=file> に入れる */
const injectImage = (page, inputId, draw) => page.evaluate(async ({ inputId, draw }) => {
  const c = document.createElement("canvas"); c.width = 1200; c.height = 800;
  const g = c.getContext("2d"); new Function("g", "c", draw)(g, c);
  const blob = await new Promise(r => c.toBlob(r, "image/jpeg", 0.9));
  const dt = new DataTransfer(); dt.items.add(new File([blob], "photo.jpg", { type: "image/jpeg" }));
  const input = document.getElementById(inputId); input.files = dt.files; input.dispatchEvent(new Event("change", { bubbles: true }));
}, { inputId, draw });

// ════════════════════════ 名刺スキャン ════════════════════════
console.log("[Meishi.html]");
{
  const page = await open("Meishi.html");
  const reqs = [];
  await page.route("https://api.anthropic.com/**", async route => {
    const req = route.request();
    reqs.push({ headers: req.headers(), body: JSON.parse(req.postData() || "{}") });
    const fields = { last_name: "佐川", first_name: "太郎", last_name_kana: "さがわ", first_name_kana: "たろう", organization: "株式会社サンプル", department: "開発部 第2課", title: "課長", tel_work: "03-1234-5678", tel_cell: "090-1234-5678", fax: "03-1234-5679", email: "taro@example.co.jp", url: "https://example.co.jp", postal_code: "100-0001", address: "東京都千代田区千代田1-1 サンプルビル3F", notes: "", confidence: "high" };
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ id: "msg_1", type: "message", role: "assistant", model: "claude-opus-5", stop_reason: "end_turn", content: [{ type: "text", text: JSON.stringify(fields) }], usage: { input_tokens: 1500, output_tokens: 200 } }) });
  });
  // 設定
  await page.click("#btn-settings");
  await page.fill("#api-key", "sk-ant-test-key");
  await page.click("#btn-save-key");
  check("API キーを保存すると設定済バッジになる", (await page.textContent("#key-badge")) === "設定済");
  check("キーが localStorage に入る", await page.evaluate(() => localStorage.getItem("claude_api_key")) === "sk-ant-test-key");
  // 写真 → 読み取り
  await injectImage(page, "file-photo", 'g.fillStyle="#fff";g.fillRect(0,0,c.width,c.height);g.fillStyle="#000";g.font="60px sans-serif";g.fillText("株式会社サンプル 佐川 太郎",60,200);');
  await page.waitForSelector("#back-row", { state: "visible" });
  await page.click("#btn-read");
  await page.waitForSelector("#form-card", { state: "visible", timeout: 10000 });
  check("API へ 1 回リクエストする", reqs.length === 1);
  const h = reqs[0].headers, b = reqs[0].body;
  check("必要なヘッダが付く", h["x-api-key"] === "sk-ant-test-key" && h["anthropic-version"] === "2023-06-01" && h["anthropic-dangerous-direct-browser-access"] === "true" && /server-side-fallback/.test(h["anthropic-beta"] || ""), JSON.stringify(h));
  check("本文に画像と JSON スキーマと fallbacks が入る", b.model === "claude-opus-5" && b.messages[0].content[0].type === "image" && b.messages[0].content[0].source.media_type === "image/jpeg" && b.output_config.format.type === "json_schema" && b.fallbacks === "default");
  check("画像が長辺 1568px 以下に縮小されている", await page.evaluate(() => window.MEISHI.state.front.width <= 1568));
  check("フォームに姓名・会社・電話が入る", await page.inputValue("#f-last") === "佐川" && await page.inputValue("#f-org") === "株式会社サンプル" && await page.inputValue("#f-tel-work") === "03-1234-5678");
  // vCard
  const vcf = await page.evaluate(() => window.MEISHI.toVCard(window.MEISHI.readForm()));
  check("vCard 3.0 の必須行がそろう", /^BEGIN:VCARD\r\nVERSION:3\.0\r\nN:佐川;太郎;;;\r\nFN:佐川 太郎\r\n/.test(vcf) && /END:VCARD\r\n$/.test(vcf));
  check("ふりがな・会社/部署・役職・電話種別・住所が入る", /X-PHONETIC-LAST-NAME:さがわ/.test(vcf) && /ORG:株式会社サンプル;開発部 第2課/.test(vcf) && /TITLE:課長/.test(vcf) && /TEL;TYPE=CELL,VOICE:090-1234-5678/.test(vcf) && /ADR;TYPE=WORK:;;東京都千代田区千代田1-1 サンプルビル3F;;;100-0001;日本/.test(vcf));
  const escVcf = await page.evaluate(() => window.MEISHI.toVCard({ last_name: "a,b", first_name: "c;d", notes: "x\ny" }));
  check("カンマ・セミコロン・改行がエスケープされる", escVcf.includes("N:a\\,b;c\\;d;;;") && escVcf.includes("NOTE:x\\ny"), escVcf);
  const [dl] = await Promise.all([page.waitForEvent("download"), page.click("#btn-vcf")]);
  const dlText = (await import("node:fs")).readFileSync(await dl.path(), "utf8");
  check("「連絡先に追加」で vCard がダウンロードされる（" + dl.suggestedFilename() + "）", /^BEGIN:VCARD/.test(dlText) && /FN:佐川 太郎/.test(dlText));
  check("履歴に自動保存される", await page.evaluate(() => JSON.parse(localStorage.getItem("meishi_history_v1")).length) === 1);
  await page.click("#btn-new");
  check("「次の名刺」でフォームが閉じる", !(await page.isVisible("#form-card")));
  await page.click(".hist");
  check("履歴をタップすると復元される", await page.isVisible("#form-card") && await page.inputValue("#f-email") === "taro@example.co.jp");
  await page.screenshot({ path: resolve(SHOT_DIR, "meishi.png"), fullPage: true });
  // API エラー
  await page.unroute("https://api.anthropic.com/**");
  await page.route("https://api.anthropic.com/**", r => r.fulfill({ status: 401, contentType: "application/json", body: JSON.stringify({ error: { type: "authentication_error", message: "invalid x-api-key" } }) }));
  await page.click("#btn-new");
  await injectImage(page, "file-photo", 'g.fillStyle="#fff";g.fillRect(0,0,c.width,c.height);');
  await page.waitForSelector("#back-row", { state: "visible" });
  await page.click("#btn-read");
  await page.waitForFunction(() => document.getElementById("cap-err").textContent.length > 0, null, { timeout: 5000 });
  check("401 のときは分かるメッセージになる", /401/.test(await page.textContent("#cap-err")));
  await page.close();
}

// ════════════════════════ ナンプレ ════════════════════════
console.log("[Numpre.html]");
{
  const page = await open("Numpre.html");
  await page.click("#btn-sample");
  check("サンプルで 30 マス入る", await page.evaluate(() => window.NUMPRE.st.given.filter(Boolean).length) === 30);
  await page.click("#btn-start");
  check("解くモードに切り替わり唯一解と出る", await page.evaluate(() => window.NUMPRE.st.mode === "solve" && window.NUMPRE.st.unique === true));
  for (let i = 0; i < 5; i++) await page.click("#btn-hint");
  check("次の 1 手を 5 回押すと 5 マス埋まり理由が出る", await page.evaluate(() => window.NUMPRE.st.who.filter(w => w === "solved").length) === 5 && /=/.test(await page.textContent("#explain")));
  // 自分で間違った数字を入れて答え合わせ
  await page.evaluate(() => { const st = window.NUMPRE.st; const i = st.grid.findIndex(v => !v); st.sel = i; window.NUMPRE.render(); });
  const wrongDigit = await page.evaluate(() => { const st = window.NUMPRE.st; return st.solution[st.sel] === 1 ? 2 : 1; });
  await page.click('#pad button[data-n="' + wrongDigit + '"]');
  await page.click("#btn-check");
  check("答え合わせで間違いが 1 マス赤くなる", (await page.locator(".cell.wrong").count()) === 1 && /1 マス/.test(await page.textContent("#explain")));
  await page.click("#btn-hint");
  check("間違いがあると次の 1 手が先に指摘する", /間違って/.test(await page.textContent("#explain")));
  await page.evaluate(() => { const st = window.NUMPRE.st; const i = st.who.indexOf("user"); st.grid[i] = 0; st.who[i] = ""; window.NUMPRE.render(); });
  await page.click("#btn-all");
  check("全部見るで 81 マス埋まり矛盾なし", await page.evaluate(() => window.NUMPRE.st.grid.every(Boolean) && window.NUMPRE.S.conflicts(window.NUMPRE.st.grid).length === 0));
  await page.click("#btn-cands");
  await page.screenshot({ path: resolve(SHOT_DIR, "numpre.png"), fullPage: true });
  // 写真読み取り（モック）
  await page.route("https://api.anthropic.com/**", r => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ stop_reason: "end_turn", content: [{ type: "text", text: JSON.stringify({ rows: ["800000000", "003600000", "070090200", "050007000", "000045700", "000100030", "001000068", "008500010", "090000400"], notes: "R2C3" }) }] }) }));
  await page.evaluate(() => { localStorage.setItem("claude_api_key", "sk-ant-test"); });
  await injectImage(page, "file-photo", 'g.fillStyle="#fff";g.fillRect(0,0,c.width,c.height);g.strokeStyle="#000";g.lineWidth=4;g.strokeRect(100,50,700,700);');
  await page.waitForFunction(() => window.NUMPRE.st.mode === "edit" && window.NUMPRE.st.given.filter(Boolean).length === 21, null, { timeout: 8000 });
  check("写真の読み取り結果（21 ヒントの難問）が盤面に入る", true);
  await page.click("#btn-start");
  check("難問も解ける（唯一解）", await page.evaluate(() => window.NUMPRE.st.unique === true));
  let guessed = 0, n = 0;
  while (n < 81) { await page.click("#btn-hint"); n++; const done = await page.evaluate(() => window.NUMPRE.st.grid.every(Boolean)); if (done) break; }
  guessed = await page.evaluate(() => window.NUMPRE.st.grid.every(Boolean));
  check("難問を最後まで 1 手ずつ進められる", guessed);
  // 解なし
  await page.evaluate(() => { window.NUMPRE.applyRecognized({ rows: ["120000000", "000000000", "000000000", "000000000", "000000000", "000000000", "000000000", "000000000", "000000000"], notes: "" }); });
  await page.click("#btn-start");
  check("ヒントが少ないと解き始めない", /少なすぎ/.test(await page.textContent("#board-err")));
  await page.close();
}

// ════════════════════════ 3D 写真 ════════════════════════
console.log("[Photo3D.html]");
{
  const page = await open("Photo3D.html");
  await page.click('#mode button[data-mode="files"]');
  const r = await page.evaluate(async () => {
    const P = window.PHOTO3D;
    // テクスチャのある左画像と、それを 40px 右にずらした右画像
    const W = 1200, H = 900;
    const L = document.createElement("canvas"); L.width = W; L.height = H;
    const g = L.getContext("2d");
    for (let i = 0; i < 400; i++) { g.fillStyle = `hsl(${(i * 47) % 360},60%,${30 + (i % 7) * 8}%)`; g.fillRect((i * 173) % W, (i * 97) % H, 40 + (i % 5) * 20, 30 + (i % 3) * 25); }
    const R = document.createElement("canvas"); R.width = W; R.height = H;
    const gr = R.getContext("2d"); gr.fillStyle = "#333"; gr.fillRect(0, 0, W, H); gr.drawImage(L, 40, 0);
    P.compose(L, R);
    await new Promise(r => setTimeout(r, 100));
    const out = await P.exportCurrent();                      // ぐらぐら GIF
    const buf = new Uint8Array(await out.blob.arrayBuffer());
    const head = String.fromCharCode(...buf.slice(0, 6));
    const gifOk = await new Promise(res => { const im = new Image(); im.onload = () => res({ w: im.naturalWidth, h: im.naturalHeight }); im.onerror = () => res(null); im.src = URL.createObjectURL(out.blob); });
    P.st.out = "anaglyph"; const an = await P.exportCurrent();
    P.st.out = "parallel"; const pa = await P.exportCurrent();
    return { dx: P.st.dx, dy: P.st.dy, w: P.C.w, h: P.C.h, gifName: out.name, gifSize: out.blob.size, head, gifOk, anType: an.blob.type, anSize: an.blob.size, paType: pa.blob.type, paSize: pa.blob.size };
  });
  check("合成パネルが開く", await page.isVisible("#panel-compose"));
  // 右画像は左画像を +40px 右へずらしたもの → 右を -40px 動かすと重なる
  check(`自動位置合わせで横ずれ ≈ -40px（実測 ${r.dx}, 縦 ${r.dy}）`, Math.abs(r.dx + 40) <= 3 && Math.abs(r.dy) <= 3);
  check("ぐらぐら GIF が GIF89a で書き出される", r.head === "GIF89a" && r.gifSize > 1000 && /\.gif$/.test(r.gifName));
  check("ブラウザが GIF をデコードできる", !!r.gifOk && r.gifOk.w > 0 && r.gifOk.w <= 640, JSON.stringify(r.gifOk));
  check("赤青（PNG）と平行法（JPEG）も書き出せる", r.anType === "image/png" && r.anSize > 0 && r.paType === "image/jpeg" && r.paSize > 0);
  await page.evaluate(() => { window.PHOTO3D.st.out = "anaglyph"; window.PHOTO3D.renderPreview(); });
  await page.screenshot({ path: resolve(SHOT_DIR, "photo3d.png"), fullPage: true });
  await page.click('#mode button[data-mode="child"]');
  check("子機モードではボタンが「待機する」になる", /待機/.test(await page.textContent("#btn-shutter")));
  await page.close();
}

check("3 ページとも例外・console.error なし", errors.length === 0, errors.join(" | "));
await browser.close();
console.log(`\n結果: ${pass} 成功 / ${fail} 失敗（スクリーンショット: ${SHOT_DIR}）`);
process.exit(fail ? 1 : 0);
