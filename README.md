# BarcodeTool — バーコード / QRコード ツール ＋ コードバトル

バーコード・QRコードの **生成** と **読み取り** ができる単一 HTML ファイルのツールです。
外部通信・外部ファイル依存はゼロで、読み取ったコードからキャラクターを生成して集める・戦わせるゲーム **「⚔ コードバトル」** も同梱しています。

| | リンク |
|---|---|
| 🌐 **ブラウザで開く（GitHub Pages）** | <https://ksaga115.github.io/BarcodeTool/> |
| 📦 **HTML ファイルをダウンロード**（右クリック → 名前を付けて保存） | [BarcodeTool.html（raw）](https://raw.githubusercontent.com/ksaga115/BarcodeTool/master/BarcodeTool.html) |
| 📁 リポジトリ | <https://github.com/ksaga115/BarcodeTool> |

> カメラ読み取りは HTTPS（または localhost）でのみ動作します。ダウンロードした HTML を `file://` で開いた場合、生成とコードバトルは使えますがカメラは使えません。

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
| [`scripts/build-www.mjs`](./scripts/build-www.mjs) | `npm run build` | 本体を改変せず、ネイティブ用スクリプトを注入した `www/index.html` を生成 |
| [`scripts/apply-ios-patch.mjs`](./scripts/apply-ios-patch.mjs) | `npm run patch:ios` | `ios-patch/` を生成済み iOS プロジェクトへ適用 |
| [`scripts/domcheck.mjs`](./scripts/domcheck.mjs) | `npm run domcheck` | jsdom でコードバトル画面を実際に動かし、例外や DOM 崩れを検出 |
| [`scripts/sim.mjs`](./scripts/sim.mjs) | `npm run sim` | コードバトルのバランス・不変条件シミュレーション |
| [`scripts/simlib.mjs`](./scripts/simlib.mjs) | — | 上記 2 つが使うゲーム読み込みの共通ローダ |

---

## 開発

```bash
npm install
npm test          # domcheck + sim
npm run dist      # 配布版を dist/ に生成
```

iPhone アプリのビルド手順（macOS + Xcode が必要）は [README-iOS.md](./README-iOS.md) を参照してください。
