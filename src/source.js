// Data source for the HUD. This mock implements the contract the UI relies on:
//   { state, actions, subscribe(fn) }
// To go real, build the same shape on top of a WebSocket bridge to a phone companion app
// (notification mirroring for LINE/calls, Health Connect for the watch). See README.
const CONTACTS = { '090-1234-5678': '母', '080-1111-2222': '田中', '03-5555-0100': '会社' };
const SAMPLE_MSGS = [
  ['田中', '今夜ごはんどう？'], ['母', '荷物届いた？'], ['会社グループ', '明日の会議13時に変更です'],
  ['佐藤', 'さっきの写真送るね'], ['田中', '了解、駅前で待ってる'],
];

export function createMockSource() {
  const listeners = new Set();
  const now = Date.now();
  const s = {
    now: new Date(),
    selected: null,
    contacts: Object.entries(CONTACTS).map(([number, name]) => ({ name, number })),
    phone: {
      dial: '', active: null, incoming: null,
      recent: [
        { name: '母', number: '090-1234-5678', dir: 'in' },
        { name: '田中', number: '080-1111-2222', dir: 'missed' },
        { name: '会社', number: '03-5555-0100', dir: 'out' },
      ],
    },
    watch: { connected: true, hr: 72, hrHist: Array(60).fill(72), steps: 4210, battery: 78, spo2: 98 },
    messages: [
      { id: 1, app: 'LINE', from: '田中', text: 'お疲れ！今日空いてる？', t: now - 600e3, read: false },
      { id: 2, app: 'LINE', from: '母', text: '今度の週末、帰ってくる？', t: now - 3600e3, read: true },
    ],
  };
  let nextId = 3;
  const emit = () => { for (const f of listeners) f(s); };
  const pushRecent = (name, number, dir) => {
    s.phone.recent.unshift({ name, number, dir });
    s.phone.recent.length = Math.min(s.phone.recent.length, 3);
  };

  const actions = {
    dialKey(k) { if (s.phone.dial.length < 14) { s.phone.dial += k; emit(); } },
    dialBack() { s.phone.dial = s.phone.dial.slice(0, -1); emit(); },
    call(number = s.phone.dial) {
      if (!number) return;
      s.phone.active = { number, name: CONTACTS[number] || number, since: Date.now() };
      pushRecent(s.phone.active.name, number, 'out'); emit();
    },
    hangup() { s.phone.active = null; s.phone.dial = ''; emit(); },
    answer() {
      const i = s.phone.incoming; if (!i) return;
      s.phone.incoming = null; s.phone.active = { ...i, since: Date.now() };
      pushRecent(i.name, i.number, 'in'); emit();
    },
    decline() {
      const i = s.phone.incoming; if (!i) return;
      s.phone.incoming = null; pushRecent(i.name, i.number, 'missed'); emit();
    },
    select(id) {
      s.selected = s.selected === id ? null : id;
      const m = s.messages.find(m => m.id === id); if (m) m.read = true;
      emit();
    },
    reply(text, id = s.selected) {
      const m = s.messages.find(m => m.id === id); if (!m) return;
      s.messages.unshift({ id: nextId++, app: m.app, from: 'あなた → ' + m.from, text, t: Date.now(), read: true, own: true });
      s.selected = null; emit();
    },
    simulateCall() {
      if (s.phone.active || s.phone.incoming) return;
      s.phone.incoming = { name: '田中', number: '080-1111-2222' }; emit();
    },
    simulateMessage() {
      const [from, text] = SAMPLE_MSGS[Math.floor(Math.random() * SAMPLE_MSGS.length)];
      s.messages.unshift({ id: nextId++, app: 'LINE', from, text, t: Date.now(), read: false }); emit();
    },
  };

  setInterval(() => {
    const w = s.watch;
    s.now = new Date();
    w.hr = Math.max(55, Math.min(130, Math.round(w.hr + (Math.random() - 0.5) * 6)));
    w.hrHist.push(w.hr); w.hrHist.shift();
    w.steps += Math.floor(Math.random() * 4);
    emit();
  }, 1000);
  setInterval(actions.simulateMessage, 30000);
  setTimeout(function loop() { actions.simulateCall(); setTimeout(loop, 90000); }, 20000);

  return { state: s, actions, subscribe: f => { listeners.add(f); return () => listeners.delete(f); } };
}
