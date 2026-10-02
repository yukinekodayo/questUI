# QuestUI HUD

Quest 3 向けの、ハンドトラッキング専用 HUD（電話・メッセージ・スマートウォッチ）の実験プロトタイプ。
WebXR + three.js のみ、ビルド不要。WebXR 対応のスマートグラスにもそのまま流用できる設計。

## 動かし方
```sh
cd bridge && npm install
OLLAMA_MODEL=qwen2.5:7b node server.mjs   # HUD配信 + ローカルAIブリッジ（既定 127.0.0.1:8787）
adb reverse tcp:8787 tcp:8787              # Quest を USB 接続（開発者モード）
```
Quest ブラウザで `http://localhost:8787` を開く（localhost は WebXR の安全なコンテキスト扱い）。
Quest 設定で **ハンドトラッキングをON** → `ENTER HUD`（パススルーで起動）。

## 操作
| 操作 | 動作 |
|---|---|
| 人差し指でパネルのボタンを押し込む | タップ（指先リングがパネル面に近づくほど縮む。押下音あり） |
| パネル上部ヘッダーをつまんで動かす | パネル移動（常にユーザーの方を向く） |
| 「正面に再配置」 | 今見ている方向にパネルを並べ直す |

PCブラウザではマウスで開発可能（ドラッグ=視点、クリック=操作、`C`=着信、`M`=メッセージ受信）。

## ローカルAI（音声アシスタント）
Quest単体ではLLMが実用速度で動かないため、**PC上のモデルにブリッジ経由で接続**します（外部クラウドへは送りません）。
```
Quest(マイク/表示) ──WebSocket──> bridge/server.mjs ──> STT (Whisper系, 任意)
                                                  └──> Ollama (ツール呼び出し対応モデル)
```
- LLM: [Ollama](https://ollama.com) を起動し `ollama pull qwen2.5:7b`（日本語+ツール呼び出し。`OLLAMA_MODEL` で変更）
- 音声認識: OpenAI互換の `/v1/audio/transcriptions` を出すローカルサーバ（whisper.cpp server / faster-whisper-server 等）を立て
  `STT_URL=http://127.0.0.1:8000/v1/audio/transcriptions` を指定。未設定でもテキスト入力（PC画面下の入力欄）で試せる
- 使い方: ASSISTANTパネルの「話しかける」を指で押す → 話す → 無音で自動送信 → 返答を音声と文字で表示
- できること: 発信／切断／応答／拒否／メッセージ返信、およびHUD状態（未読・心拍など）への質問
- **安全設計**: 発信と返信はLLMが提案するだけで、HUD上の「実行」を押すまで実行しない。ツール名・引数はサーバ側で
  ホワイトリスト検証し、メッセージ本文内の指示には従わないようシステムプロンプトで指定。ブリッジは既定でlocalhostのみ、
  別サイトからのWebSocketは拒否、配信ファイルは `index.html` `src/` `vendor/` のみ
- テスト: `cd bridge && npm test`（疑似Ollama/STTで経路を検証）

## 構成
- `src/source.js` データ層（**現在はモック**）。`{ state, actions, subscribe }` の形を守れば差し替え可能
- `src/panels.js` 各パネルの描画（Home / Phone / Messages / Watch / 着信オーバーレイ）
- `src/panel.js` Canvas テクスチャのパネル + ボタン当たり判定
- `src/assistant.js` 音声録音(16kHz WAV)・ブリッジ通信・実行確認
- `bridge/` PC側ブリッジ（静的配信 / STT / Ollama）
- `src/hands.js` 指先ポーク・ピンチ移動
- `vendor/` three.js（オフライン動作のため同梱）

## 実データにつなぐには（現実的な制約）
ブラウザ/Quest 単体では電話・LINE・時計にアクセスできないため、**スマホ側のコンパニオンアプリ + WebSocket ブリッジ**が必要。
- **LINE**: 個人トークの公開APIは無い。Android の通知リスナー（NotificationListenerService）で通知を拾って転送するのが現実解。
- **通話**: 着信通知の転送と、発信/応答/切断の指示をコンパニオンアプリ経由で（Android の TelecomManager 等）。音声自体は Quest の Bluetooth/スマホ側。
- **スマートウォッチ**: Health Connect（心拍・歩数）や時計アプリの通知をスマホ経由で転送。
`source.js` と同じ `state`/`actions` を WebSocket で実装すれば UI は無改修。

## 未検証
実機（Quest 3）での手操作・マイク入力は未検証。本物のOllama/Whisperとの接続も未検証（疑似サーバでの通し試験のみ）。Quest側のSpeechSynthesis（読み上げ）の日本語音声が無い場合は文字表示のみになります。ポーク判定の閾値は `src/hands.js` 冒頭の定数で調整。
