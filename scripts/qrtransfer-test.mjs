// scripts/qrtransfer-test.mjs
// QRTransfer.html を jsdom で読み込み、ブラウザなしで一通り検証する。
//   1. プロトコル: ストリームの組み立て/復元、フレーム分割/解釈、受信器の組み立て（順不同・重複・別セッション混入）
//   2. 往復: バイト列 → QR 行列 → 画素 → デコーダ → 受信器 → 復元 が各サイズ/誤り訂正で一致すること
//   3. ページ読み込み時に例外が出ないこと
import fs from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { JSDOM, VirtualConsole } from "jsdom";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = resolve(root, "QRTransfer.html");
const html = fs.readFileSync(SRC, "utf8");

let pass = 0, fail = 0;
function check(name, ok, extra) {
  if (ok) { pass++; console.log("  ok   " + name); }
  else { fail++; console.log("  FAIL " + name + (extra ? " — " + extra : "")); }
}
function eqBytes(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}
function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s + 0x9e3779b9) | 0; let t = s ^ (s >>> 16); t = Math.imul(t, 0x21f0aaad); t ^= t >>> 15; t = Math.imul(t, 0x735a2d97); return ((t ^ (t >>> 15)) >>> 0) / 4294967296; };
}

// ── jsdom で読み込み ──
const errors = [];
const vc = new VirtualConsole();
vc.on("jsdomError", e => { const m = String(e && (e.stack || e.message) || e); if (!/Not implemented: HTMLCanvasElement/.test(m)) errors.push(m); });
vc.on("error", (...a) => errors.push(a.join(" ")));
const dom = new JSDOM(html, {
  url: "https://localhost/QRTransfer.html", runScripts: "dangerously", pretendToBeVisual: true, virtualConsole: vc,
  beforeParse(window) {
    // 実ブラウザには存在する標準 API（jsdom には無い）を Node のもので補う
    window.CompressionStream = CompressionStream; window.DecompressionStream = DecompressionStream;
    window.Blob = Blob; window.Response = Response; window.File = File;
    window.URL.createObjectURL = () => "blob:stub"; window.URL.revokeObjectURL = () => {};
    window.Element.prototype.scrollIntoView = () => {};

  }
});
const win = dom.window;
await new Promise(r => setTimeout(r, 50));
console.log("[読み込み]");
check("ページ読み込みで例外なし", errors.length === 0, errors.join(" | "));
check("window.QRT が公開されている", !!(win.QRT && win.QRT.proto && win.BarcodeDecoder));
const QRT = win.QRT, P = QRT.proto;

// ── 1. プロトコル ──
console.log("[プロトコル]");
{
  const text = "こんにちは、QR転送。".repeat(40) + " https://example.com/path?x=1";
  const raw = new TextEncoder().encode(text);
  const b = await P.buildStream(raw, { isFile: false });
  check("テキストは圧縮される", b.compressed && b.stream.length < raw.length, `${b.stream.length} / ${raw.length}`);
  const r = await P.parseStream(b.stream);
  check("テキストが復元される", r.ok && !r.isFile && new TextDecoder().decode(r.data) === text, r.error);

  const rnd = rng(7);
  const bin = new Uint8Array(5000); for (let i = 0; i < bin.length; i++) bin[i] = (rnd() * 256) | 0;
  const bf = await P.buildStream(bin, { isFile: true, name: "写真 01.jpg", mime: "image/jpeg" });
  check("乱数バイト列は圧縮されない", !bf.compressed);
  const rf = await P.parseStream(bf.stream);
  check("ファイル名・MIME・中身が復元される", rf.ok && rf.isFile && rf.name === "写真 01.jpg" && rf.mime === "image/jpeg" && eqBytes(rf.data, bin), rf.error);

  const broken = new Uint8Array(bf.stream); broken[broken.length - 3] ^= 0x55;
  const rb = await P.parseStream(broken);
  check("1 バイト壊れていると CRC で検出", !rb.ok && /CRC/.test(rb.error), rb.error);

  const frames = P.splitFrames(bf.stream, 100, 0x1234);
  check("フレーム数 = ceil(長さ / chunk)", frames.length === Math.ceil(bf.stream.length / 100));
  const f0 = P.parseFrame(frames[0]);
  check("フレームヘッダが読める", f0 && f0.sid === 0x1234 && f0.idx === 0 && f0.total === frames.length && f0.chunk.length === 100);
  check("先頭が違うと null", P.parseFrame(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8])) === null);

  // 受信器: 順不同・重複・別セッションの混入
  const R = new P.Receiver();
  const order = frames.map((_, i) => i);
  for (let i = order.length - 1; i > 0; i--) { const j = (rnd() * (i + 1)) | 0; [order[i], order[j]] = [order[j], order[i]]; }
  const decoy = P.splitFrames(bf.stream, 100, 0x9999);
  let completeAt = -1, dup = 0, rejected = 0;
  order.forEach((i, n) => {
    const st = R.feed(P.parseFrame(frames[i]));
    if (st.complete) completeAt = n;
    if (n === 3) { const d = R.feed(P.parseFrame(decoy[0])); if (!d.accepted) rejected++; }   // 1 回だけの別セッションは無視
    if (n === 5) { const d = R.feed(P.parseFrame(frames[order[0]])); if (d.duplicate) dup++; }
  });
  check("順不同でも全部そろうと complete", completeAt === order.length - 1 && R.isComplete());
  check("重複フレームは duplicate 扱い", dup === 1);
  check("単発の別セッションフレームは無視", rejected === 1);
  check("組み立て結果がストリームと一致", eqBytes(R.assemble(), bf.stream));
  const R2 = new P.Receiver();
  R2.feed(P.parseFrame(frames[0]));
  R2.feed(P.parseFrame(decoy[1])); const sw = R2.feed(P.parseFrame(decoy[2]));
  check("別セッションが 2 回続いたら乗り換える", sw.accepted && R2.sid === 0x9999 && R2.got === 1);
}

// ── 2. 往復（行列 → 画素 → デコード）──
console.log("[往復]");
/** 行列を、実カメラ風に少しグレーな背景の画像へ描く（1 モジュール ms px、静穏域 4） */
function render(matrix, ms, pad) {
  const n = matrix.length, quiet = 4;
  const dim = (n + quiet * 2) * ms, W = dim + pad * 2;
  const data = new Uint8ClampedArray(W * W * 4);
  for (let i = 0; i < W * W; i++) { data[i * 4] = data[i * 4 + 1] = data[i * 4 + 2] = 120; data[i * 4 + 3] = 255; }
  for (let y = 0; y < dim; y++) for (let x = 0; x < dim; x++) {
    const mx = Math.floor(x / ms) - quiet, my = Math.floor(y / ms) - quiet;
    const black = mx >= 0 && my >= 0 && mx < n && my < n && matrix[my][mx];
    const v = black ? 20 : 235;
    const p = ((y + pad) * W + (x + pad)) * 4;
    data[p] = data[p + 1] = data[p + 2] = v;
  }
  return { data, width: W, height: W };
}
const rnd2 = rng(99);
for (const [ver, ecl, ms] of [[8, "M", 5], [12, "M", 4], [12, "L", 3], [16, "L", 3], [20, "Q", 3], [25, "L", 3]]) {
  const cap = QRT.qrCapacity(ver, ecl), chunk = cap - P.HEADER;
  const raw = new Uint8Array(Math.round(chunk * 3.4)); for (let i = 0; i < raw.length; i++) raw[i] = (rnd2() * 256) | 0;
  const b = await P.buildStream(raw, { isFile: true, name: "t.bin", mime: "application/octet-stream" });
  const frames = P.splitFrames(b.stream, chunk, 42);
  QRT.resetReceive();
  let ok = true, msSum = 0, maxErr = 0;
  for (let i = 0; i < frames.length; i++) {
    const m = QRT.qrEncodeBytes(frames[i], ver, ecl, i % 8);
    if (m.length !== ver * 4 + 17) { ok = false; break; }
    const img = render(m, ms, 12);
    const t0 = Date.now();
    const res = await QRT.feedImageData(img);
    msSum += Date.now() - t0;
    const q = res && res.results.find(r => r.kind === "qr");
    if (!q || !eqBytes(new Uint8Array(q.bytes), frames[i])) { ok = false; console.log("    frame", i, "decode failed:", res && res.log); break; }
  }
  await new Promise(r => setTimeout(r, 30));   // finishReceive（非同期）を待つ
  const R = QRT.rx.result;
  check(`V${ver}/${ecl} ${frames.length} 枚（${chunk} B/枚, ${ms}px/モジュール, 平均 ${Math.round(msSum / frames.length)}ms）が復元される`,
    ok && R && R.ok && eqBytes(R.data, raw), !R ? "結果なし" : (R.error || ""));
}
// 大きめの画像（カメラ相当 640px）での解析時間の目安
{
  const ver = 12, ecl = "M", chunk = QRT.qrCapacity(ver, ecl) - P.HEADER;
  const raw = new Uint8Array(chunk); for (let i = 0; i < raw.length; i++) raw[i] = (rnd2() * 256) | 0;
  const f = P.splitFrames(raw, chunk, 1)[0];
  const m = QRT.qrEncodeBytes(f, ver, ecl, 3);
  const img = render(m, 7, 60);     // 73 モジュール × 7px + 余白 → 約 630px
  QRT.resetReceive();
  const t0 = Date.now(); const res = await QRT.feedImageData(img); const dt = Date.now() - t0;
  const q = res && res.results.find(r => r.kind === "qr");
  check(`カメラ相当 ${img.width}px の 1 フレーム解析（${dt}ms）で読める`, !!q && eqBytes(new Uint8Array(q.bytes), f));
}

console.log(`\n結果: ${pass} 成功 / ${fail} 失敗`);
process.exit(fail ? 1 : 0);
