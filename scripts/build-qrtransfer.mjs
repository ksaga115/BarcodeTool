// scripts/build-qrtransfer.mjs
// QR転送（QRTransfer.html）を生成する。
//   qrtransfer/template.html  … 送信・受信の UI とプロトコル（このツール固有の部分）
//   BarcodeTool.html          … QR エンコーダ（バイトモード）とデコーダコアを「そのまま」借りる
// 2 つを合成して、リポジトリ直下に単一ファイル QRTransfer.html を書き出す。
// BarcodeTool.html には一切手を加えない（原本不変）。
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = resolve(root, "BarcodeTool.html");
const TEMPLATE = resolve(root, "qrtransfer", "template.html");
const OUT = resolve(root, "QRTransfer.html");

for (const p of [SRC, TEMPLATE]) {
  if (!existsSync(p)) { console.error(`[build-qrtransfer] 見つかりません: ${p}`); process.exit(1); }
}

/** 2 つの目印文字列に挟まれた区間を切り出す（目印が見つからなければ失敗させる） */
function slice(html, startMark, endMark, includeEnd) {
  const s = html.indexOf(startMark);
  if (s < 0) throw new Error(`開始目印が見つかりません: ${startMark}`);
  const e = html.indexOf(endMark, s + startMark.length);
  if (e < 0) throw new Error(`終了目印が見つかりません: ${endMark}`);
  return html.slice(s, includeEnd ? e + endMark.length : e);
}

export function extractParts(html) {
  // QR エンコーダ: 「QRコード (バイトモード…)」の見出しから「バーコード種類レジストリ」の直前まで。
  // qrEncode / qrAddEcc / qrBuildMatrix / QR_ECC などの純粋関数群。
  const encoder = slice(html, "// ── QRコード (バイトモード", "// ── バーコード種類レジストリ ──", false);
  // デコーダコア: 明示マーカーで囲まれた自己完結 IIFE（window.BarcodeDecoder を定義）。
  const decoder = slice(html, "// ===== DECODER CORE START =====", "// ===== DECODER CORE END =====", true);
  for (const [name, code, needle] of [
    ["encoder", encoder, "function qrEncode("],
    ["encoder", encoder, "function qrBuildMatrix("],
    ["encoder", encoder, "function qrAddEcc("],
    ["decoder", decoder, "global.BarcodeDecoder = api;"],
    ["decoder", decoder, "function decodeImage("]
  ]) {
    if (!code.includes(needle)) throw new Error(`${name} の抜き出し結果に ${needle} が含まれていません（BarcodeTool.html の構造が変わった可能性）`);
  }
  return { encoder, decoder };
}

export function build() {
  const html = readFileSync(SRC, "utf8");
  const tpl = readFileSync(TEMPLATE, "utf8");
  const { encoder, decoder } = extractParts(html);
  const stamp = new Date().toISOString().slice(0, 10);
  let out = tpl;
  const put = (marker, code) => {
    if (!out.includes(marker)) throw new Error(`テンプレートに目印がありません: ${marker}`);
    out = out.replace(marker, () => code);   // 置換文字列中の $ を特別扱いさせない
  };
  put("/*__QR_ENCODER__*/", encoder);
  put("/*__DECODER_CORE__*/", decoder);
  put("__BUILD_DATE__", stamp);
  if (/__[A-Z_]+__/.test(out.replace(/__proto__/g, ""))) {
    const m = out.match(/__[A-Z_]+__/g);
    throw new Error("未置換の目印が残っています: " + m.join(", "));
  }
  // 単一 HTML の確認（外部参照なし）
  const suspects = [];
  for (const m of out.matchAll(/<link\s[^>]*href=["']([^"']+)["']/gi)) suspects.push(["<link>", m[1]]);
  for (const m of out.matchAll(/<script\s[^>]*src=["']([^"']+)["']/gi)) suspects.push(["<script src>", m[1]]);
  for (const m of out.matchAll(/<img\s[^>]*src=["']([^"']+)["']/gi)) if (!/^data:/i.test(m[1])) suspects.push(["<img src>", m[1]]);
  if (suspects.length) {
    suspects.forEach(([t, r]) => console.error(`  ${t}: ${r}`));
    throw new Error("外部ファイル参照が含まれています（QRTransfer.html は自己完結の想定）");
  }
  return out;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const out = build();
  writeFileSync(OUT, out, "utf8");
  console.log(`[build-qrtransfer] 生成: ${OUT}（${(out.length / 1024).toFixed(0)} KB・外部参照なし）`);
}
