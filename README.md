# QuestUI HUD

Quest 3 向けの、ハンドトラッキング専用 HUD（電話・メッセージ・スマートウォッチ）の実験プロトタイプ。
WebXR + three.js のみ、ビルド不要。WebXR 対応のスマートグラスにもそのまま流用できる設計。

## 動かし方
```sh
python3 -m http.server 8000      # PC側
adb reverse tcp:8000 tcp:8000    # Quest を USB 接続（開発者モード）
```
Quest ブラウザで `http://localhost:8000` を開く（localhost は WebXR の安全なコンテキスト扱い）。
Quest 設定で **ハンドトラッキングをON** → `ENTER HUD`（パススルーで起動）。

## 操作
| 操作 | 動作 |
|---|---|
| 人差し指でパネルのボタンを押し込む | タップ（指先リングがパネル面に近づくほど縮む。押下音あり） |
| パネル上部ヘッダーをつまんで動かす | パネル移動（常にユーザーの方を向く） |
| 「正面に再配置」 | 今見ている方向にパネルを並べ直す |

PCブラウザではマウスで開発可能（ドラッグ=視点、クリック=操作、`C`=着信、`M`=メッセージ受信）。

## 構成
- `src/source.js` データ層（**現在はモック**）。`{ state, actions, subscribe }` の形を守れば差し替え可能
- `src/panels.js` 各パネルの描画（Home / Phone / Messages / Watch / 着信オーバーレイ）
- `src/panel.js` Canvas テクスチャのパネル + ボタン当たり判定
- `src/hands.js` 指先ポーク・ピンチ移動
- `vendor/` three.js（オフライン動作のため同梱）

## 実データにつなぐには（現実的な制約）
ブラウザ/Quest 単体では電話・LINE・時計にアクセスできないため、**スマホ側のコンパニオンアプリ + WebSocket ブリッジ**が必要。
- **LINE**: 個人トークの公開APIは無い。Android の通知リスナー（NotificationListenerService）で通知を拾って転送するのが現実解。
- **通話**: 着信通知の転送と、発信/応答/切断の指示をコンパニオンアプリ経由で（Android の TelecomManager 等）。音声自体は Quest の Bluetooth/スマホ側。
- **スマートウォッチ**: Health Connect（心拍・歩数）や時計アプリの通知をスマホ経由で転送。
`source.js` と同じ `state`/`actions` を WebSocket で実装すれば UI は無改修。

## 未検証
実機（Quest 3）での手操作は未検証。ポーク判定の閾値は `src/hands.js` 冒頭の定数で調整。
