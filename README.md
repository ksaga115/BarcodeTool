# BarcodeTool — バーコード / QRコード ツール ＋ コードバトル

バーコード・QRコードの **生成** と **読み取り** ができる単一 HTML ファイルのツールです。
外部通信・外部ファイル依存はゼロで、読み取ったコードからキャラクターを生成して集める・戦わせるゲーム **「⚔ コードバトル」** も同梱しています。

| | リンク |
|---|---|
| 🌐 **ブラウザで開く（GitHub Pages）** | <https://ksaga115.github.io/BarcodeTool/> |
| 📦 **HTML ファイルをダウンロード**（右クリック → 名前を付けて保存） | [BarcodeTool.html（raw）](https://raw.githubusercontent.com/ksaga115/BarcodeTool/master/BarcodeTool.html) |
| 📁 リポジトリ | <https://github.com/ksaga115/BarcodeTool> |

> カメラ読み取りは HTTPS（または localhost）でのみ動作します。ダウンロードした HTML を `file://` で開いた場合、生成とコードバトルは使えますがカメラは使えません。

### 📡 QR転送 — iPhone 同士でオフラインにデータを渡す

| | リンク |
|---|---|
| 🌐 **ブラウザで開く** | <https://ksaga115.github.io/BarcodeTool/QRTransfer.html> |
| 📦 HTML ファイル | [QRTransfer.html（raw）](https://raw.githubusercontent.com/ksaga115/BarcodeTool/master/QRTransfer.html) |

送る側がデータを分割した QR コードを画面に連続表示し、受け取る側がカメラで読み取って復元します。Wi-Fi・Bluetooth・インターネットは一切使いません。
文章・URL・ファイル・写真（自動縮小あり）を送れます。「中」設定で約 1.4 KB/秒（短文なら数秒、縮小した写真で 30 秒〜1 分）。
QR の生成・読み取りは BarcodeTool と同じ自前エンジンで、`QRTransfer.html` は `npm run build:qrt` が本体から抜き出して合成します。

### 📱 iPhone 小物ツール（それぞれ単一 HTML）

| ツール | 開く | できること |
|---|---|---|
| 📇 **名刺スキャン** | <https://ksaga115.github.io/BarcodeTool/Meishi.html> | 名刺を撮ると Claude の画像認識で姓名・ふりがな・会社・部署・役職・電話・メール・住所を読み取り、確認して **.vcf で iPhone の連絡先に追加**。履歴は端末内、まとめて書き出し可 |
| 🔢 **ナンプレ解き** | <https://ksaga115.github.io/BarcodeTool/Numpre.html> | 新聞や本のナンプレを撮ると盤面を読み取り、**「次の 1 手」を理由つきで**表示。答え合わせ・全解答・唯一解チェック。解くのは端末内（手入力なら通信ゼロ） |
| 🥽 **3D 写真** | <https://ksaga115.github.io/BarcodeTool/Photo3D.html> | iPhone 2 台を横に並べ、親機の「ピーッ」を子機のマイクが聞いて**同時シャッター**。2 枚から「ぐらぐら GIF」「赤青メガネ用」「平行法/交差法」を作る。1 台で 2 回撮る方式も可。通信ゼロ・GIF エンコーダも自前 |

名刺スキャンとナンプレ解きの写真読み取りは、自分の Anthropic API キーを設定画面に入れて使います（キーは端末内にだけ保存、1 回数円）。

---

## 機能

- **生成**: Code128 / EAN-13(JAN) / EAN-8 / UPC-A / UPC-E / Code39 / Code39(C/D) / Code93 / ITF・ITF-14 / NW-7(Codabar) / DataMatrix / QR。1件ごとの PNG コピー・保存、全件一括保存（PNG / ZIP）
- **読み取り**: カメラ（`getUserMedia`）・画像ファイル・貼り付けから自前デコーダ＋ Web Worker で解析
- **⚔ コードバトル**: コード内容から決定論的にキャラを生成（同じコード → 同じ個体）。1v1 / スカッド / ガントレット、育成、図鑑、譲渡コードなど。オフライン・課金なし
- 保存先は `localStorage` のみ。テーマは Catppuccin Mocha、日本語 UI

---

## ファイル構成

### 本体・配布

| ファイル | 説明 |
|---|---|
| [`BarcodeTool.html`](./BarcodeTool.html) | **アプリ本体**。これ 1 ファイルで完結（HTML + CSS + JS） |
| [`QRTransfer.html`](./QRTransfer.html) | **QR転送**（生成物・単一ファイル）。`qrtransfer/template.html` に本体の QR エンコーダとデコーダコアを注入したもの |
| [`qrtransfer/template.html`](./qrtransfer/template.html) | QR転送の原本（UI・転送プロトコル・送受信ループ）。QR エンジン部分は目印だけ置いてある |
| [`Meishi.html`](./Meishi.html) | **名刺スキャン**。Claude 画像認識 → vCard 3.0（`X-PHONETIC-*` でふりがな対応）→ 連絡先へ。履歴は localStorage |
| [`Numpre.html`](./Numpre.html) | **ナンプレ解き**。`<script id="sudoku-src">` に解法エンジン（ネイキッド/ヒドゥンシングル、ロックド候補、ネイキッド/ヒドゥンペア、MRV バックトラック） |
| [`Photo3D.html`](./Photo3D.html) | **3D 写真**。音の合図（2.4 kHz）による 2 台同期、SAD による自動位置合わせ、`<script id="gif-src">` にメディアンカット量子化 + LZW の GIF エンコーダ |
| [`index.html`](./index.html) | GitHub Pages 用。`BarcodeTool.html` へリダイレクトするだけ |
| [`app.json`](./app.json) | アプリ名・バージョン・起動ファイルのメタ情報 |
| [`.gitattributes`](./.gitattributes) | 改行を LF に固定（配布 HTML のバイト列を保つ） |
| [`.gitignore`](./.gitignore) | `www/` `ios/` `dist/` `node_modules/` などの生成物を除外 |

### ドキュメント

| ファイル | 説明 |
|---|---|
| [`README-iOS.md`](./README-iOS.md) | iPhone アプリ化（Capacitor + 買い切り Pro）の手順・設定・App Store 申請メモ |
| [`docs/計画書.md`](./docs/計画書.md) | 今後の作業計画（PWA 化 → コードバトル刷新 → モバイル品質 → ネイティブ化） |
| [`docs/コードバトル設計.md`](./docs/コードバトル設計.md) | コードバトルの詳細設計仕様（個体の決定論・対戦式・変更履歴） |

### iOS アプリ化（Capacitor）

| ファイル | 説明 |
|---|---|
| [`package.json`](./package.json) | npm スクリプトと Capacitor 依存関係 |
| [`capacitor.config.json`](./capacitor.config.json) | Capacitor 設定（`appId`、`webDir`、iOS 設定） |
| [`native/z-capacitor-shim.js`](./native/z-capacitor-shim.js) | ネイティブ時のみ動く shim。保存/共有ブリッジ、セーブの Preferences 同期、セーフエリア |
| [`native/z-pro.js`](./native/z-pro.js) | 無料 / Pro の線引き、課金呼び出し、ペイウォール UI |
| [`native/z-native.css`](./native/z-native.css) | ネイティブ時のみ効く CSS（セーフエリア、ペイウォール、トースト） |
| [`ios-patch/App/ProPlugin.swift`](./ios-patch/App/ProPlugin.swift) | StoreKit 2 による買い切り Pro アンロック（Capacitor プラグイン `Pro`） |
| [`ios-patch/App/ProPlugin.m`](./ios-patch/App/ProPlugin.m) | 上記プラグインの Objective-C 登録 |
| [`ios-patch/App/Info.plist.additions.xml`](./ios-patch/App/Info.plist.additions.xml) | Info.plist に追加するキー（カメラ用途説明ほか） |
| [`ios-patch/Products.storekit`](./ios-patch/Products.storekit) | Xcode ローカル課金テスト用の設定 |
| [`ios-patch/privacy.html`](./ios-patch/privacy.html) | プライバシーポリシー（App Store 申請用に公開する） |
| [`assets/icon.svg`](./assets/icon.svg) / [`assets/splash.svg`](./assets/splash.svg) | アイコン / 起動画面の元データ |

### スクリプト

| ファイル | npm コマンド | 説明 |
|---|---|---|
| [`scripts/build-dist.mjs`](./scripts/build-dist.mjs) | `npm run dist` | 配布版 `dist/BarcodeTool.html` を生成。外部参照が紛れ込んでいないかも検査 |
| [`scripts/build-qrtransfer.mjs`](./scripts/build-qrtransfer.mjs) | `npm run build:qrt` | `BarcodeTool.html` から QR エンコーダとデコーダコアを抜き出して `qrtransfer/template.html` に注入し、`QRTransfer.html` を生成 |
| [`scripts/qrtransfer-test.mjs`](./scripts/qrtransfer-test.mjs) | `npm run test:qrt` | QR転送の検証（jsdom）。プロトコルの往復、順不同・重複・別セッション混入、QR 行列→画素→デコード→復元の一致 |
| [`scripts/qrtransfer-browser.mjs`](./scripts/qrtransfer-browser.mjs) | `npm run test:qrt:browser` | 実ブラウザ（Chromium + Playwright）で送信画面のキャンバスを受信側に流し、テキストと写真の転送を確認。スクリーンショットも保存 |
| [`scripts/tools-browser.mjs`](./scripts/tools-browser.mjs) | `npm run test:tools:browser` | 名刺スキャン・ナンプレ解き・3D 写真を Chromium で動かす（Claude API はモック）。vCard の形式、解法の進行、GIF のデコード可否まで確認 |
| [`scripts/build-www.mjs`](./scripts/build-www.mjs) | `npm run build` | 本体を改変せず、ネイティブ用スクリプトを注入した `www/index.html` を生成 |
| [`scripts/apply-ios-patch.mjs`](./scripts/apply-ios-patch.mjs) | `npm run patch:ios` | `ios-patch/` を生成済み iOS プロジェクトへ適用 |
| [`scripts/domcheck.mjs`](./scripts/domcheck.mjs) | `npm run domcheck` | jsdom でコードバトル画面を実際に動かし、例外や DOM 崩れを検出 |
| [`scripts/sim.mjs`](./scripts/sim.mjs) | `npm run sim` | コードバトルのバランス・不変条件シミュレーション |
| [`scripts/simlib.mjs`](./scripts/simlib.mjs) | — | 上記 2 つが使うゲーム読み込みの共通ローダ |

---

## 開発

```bash
npm install
npm test          # domcheck + sim + QR転送の検証
npm run dist      # 配布版を dist/ に生成
npm run build:qrt # QRTransfer.html を再生成（本体の QR エンジンを変えたら実行）
```

### QR転送の仕組み（`qrtransfer/template.html`）

- **ストリーム**: `flags(1) | 元の長さ(4) | CRC32(4) | 名前 | MIME | 本体`。本体は縮むときだけ `CompressionStream("deflate")` で圧縮。
- **フレーム**: `'Q'(1) | セッションID(2) | 番号(2) | 総数(2) | データ` を QR のバイトモードに入れる。バージョンとマスクは固定で、1 枚あたりの生成が速い。
- **送信**: 全フレームをループ表示。相手の解析周期と同期して同じ枚を落とし続けないよう、表示間隔を ±15% 揺らす。
- **受信**: BarcodeTool のデコーダコアを Web Worker で動かし、番号ごとに集める。全部そろったら CRC32 で検証してから復元。別セッションは同じ ID が 2 回続いたときだけ乗り換える。

iPhone アプリのビルド手順（macOS + Xcode が必要）は [README-iOS.md](./README-iOS.md) を参照してください。
