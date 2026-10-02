// Voice/text assistant client. Talks to bridge/server.mjs, which runs STT + a local LLM (Ollama).
// The LLM only *proposes* actions; outward-facing ones (call, reply) wait for an on-HUD confirmation.
const CONFIRM = new Set(['make_call', 'reply_message']);
const MAX_REC_MS = 15000, SILENCE_MS = 1300, VOICE_RMS = 0.02;

export class Assistant {
  constructor({ onChange, getContext, execute, describe }) {
    Object.assign(this, { onChange, getContext, execute, describe });
    this.state = { conn: 'offline', info: '', status: 'idle', log: [], pending: null };
    this.connect();
  }

  set(patch) { Object.assign(this.state, patch); this.onChange(); }
  say(who, text) { this.state.log = [...this.state.log, { who, text }].slice(-12); this.onChange(); }

  connect() {
    const ws = this.ws = new WebSocket(`ws://${location.host}`);
    ws.onmessage = ev => this.onMessage(JSON.parse(ev.data));
    ws.onclose = () => { this.set({ conn: 'offline', status: 'idle' }); setTimeout(() => this.connect(), 3000); };
    ws.onerror = () => ws.close();
  }

  send(obj) {
    if (this.ws.readyState === 1) { this.ws.send(JSON.stringify(obj)); return true; }
    this.set({ status: 'idle' }); this.say('ai', 'ブリッジに接続できません'); return false;
  }

  onMessage(m) {
    if (m.type === 'hello') this.set({ conn: 'online', info: m.model + (m.stt ? '' : ' (音声認識なし)'), stt: m.stt });
    else if (m.type === 'error') { this.set({ status: 'idle' }); this.say('ai', '⚠ ' + m.message); }
    else if (m.type === 'result') {
      if (m.heard) this.say('user', m.heard);
      if (m.say) { this.say('ai', m.say); this.speak(m.say); }
      for (const call of m.calls) {
        if (CONFIRM.has(call.name)) this.state.pending = { call, label: this.describe(call) };
        else this.say('ai', '→ ' + this.execute(call));
      }
      this.set({ status: 'idle' });
    }
  }

  ask(text) {
    text = text.trim(); if (!text) return;
    this.say('user', text); this.set({ status: 'thinking' });
    this.send({ type: 'text', text, context: this.getContext() });
  }

  confirmPending() {
    const p = this.state.pending; if (!p) return;
    this.set({ pending: null }); this.say('ai', '→ ' + this.execute(p.call));
  }
  cancelPending() { this.set({ pending: null }); this.say('ai', '取り消しました'); }

  speak(text) {
    try {
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text); u.lang = 'ja-JP'; speechSynthesis.speak(u);
    } catch { /* TTS is optional */ }
  }

  toggleMic() {
    if (this.state.status === 'listening') return this.stopListening();
    if (this.state.status === 'idle') this.startListening();
  }

  async startListening() {
    if (!this.state.stt) { this.say('ai', '音声認識が未設定です（STT_URL）。テキストで試せます'); return; }
    this.set({ status: 'listening' });
    try {
      this.stream ??= await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    } catch (e) { this.set({ status: 'idle' }); this.say('ai', 'マイクを使えません: ' + e.message); return; }
    const ac = this.ac = new AudioContext();
    const src = ac.createMediaStreamSource(this.stream);
    const proc = this.proc = ac.createScriptProcessor(4096, 1, 1);
    this.chunks = []; this.heardVoice = false; this.lastVoice = performance.now(); this.t0 = performance.now();
    proc.onaudioprocess = e => {
      const d = new Float32Array(e.inputBuffer.getChannelData(0)); this.chunks.push(d);
      const rms = Math.sqrt(d.reduce((s, v) => s + v * v, 0) / d.length), now = performance.now();
      if (rms > VOICE_RMS) { this.heardVoice = true; this.lastVoice = now; }
      if ((this.heardVoice && now - this.lastVoice > SILENCE_MS) || now - this.t0 > MAX_REC_MS) this.stopListening();
    };
    src.connect(proc); proc.connect(ac.destination);
  }

  stopListening() {
    if (this.state.status !== 'listening' || !this.proc) return;
    this.proc.disconnect(); const rate = this.ac.sampleRate; this.ac.close(); this.proc = null;
    if (!this.heardVoice) { this.set({ status: 'idle' }); return; }
    const wav = encodeWav(this.chunks, rate, 16000);
    this.set({ status: 'thinking' });
    this.send({ type: 'audio', wav: toBase64(wav), context: this.getContext() });
  }
}

function encodeWav(chunks, inRate, outRate) {
  const n = chunks.reduce((s, c) => s + c.length, 0), pcm = new Float32Array(n);
  let o = 0; for (const c of chunks) { pcm.set(c, o); o += c.length; }
  const ratio = inRate / outRate, len = Math.floor(n / ratio), buf = new DataView(new ArrayBuffer(44 + len * 2));
  const str = (off, s) => [...s].forEach((c, i) => buf.setUint8(off + i, c.charCodeAt(0)));
  str(0, 'RIFF'); buf.setUint32(4, 36 + len * 2, true); str(8, 'WAVEfmt '); buf.setUint32(16, 16, true);
  buf.setUint16(20, 1, true); buf.setUint16(22, 1, true); buf.setUint32(24, outRate, true);
  buf.setUint32(28, outRate * 2, true); buf.setUint16(32, 2, true); buf.setUint16(34, 16, true); str(36, 'data'); buf.setUint32(40, len * 2, true);
  for (let i = 0; i < len; i++) {            // box-filter downsample
    let sum = 0, cnt = 0;
    for (let j = Math.floor(i * ratio); j < Math.floor((i + 1) * ratio) && j < n; j++) { sum += pcm[j]; cnt++; }
    buf.setInt16(44 + i * 2, Math.max(-1, Math.min(1, sum / (cnt || 1))) * 0x7fff, true);
  }
  return new Uint8Array(buf.buffer);
}

function toBase64(u8) {
  let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode(...u8.subarray(i, i + 0x8000));
  return btoa(s);
}
