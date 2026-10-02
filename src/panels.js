import { C, FONT, HEADER_H, frame, txt, fit } from './theme.js';

const hhmm = d => new Date(d).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', hour12: false });
const DIR = { in: ['受信', C.good], out: ['発信', C.cyan], missed: ['不在', C.bad] };

export const panelDefs = [
  {
    id: 'home', w: 0.5, h: 0.28,
    draw(ctx, p, s, a) {
      frame(ctx, p, 'QUEST · HUD');
      const d = s.now;
      txt(ctx, hhmm(d), 50, 285, { size: 170, weight: 300, color: C.text });
      txt(ctx, d.toLocaleDateString('ja-JP', { month: 'long', day: 'numeric', weekday: 'long' }), 58, 345, { size: 38, color: C.cyan });
      const unread = s.messages.filter(m => !m.read).length;
      const missed = s.phone.recent.filter(r => r.dir === 'missed').length;
      txt(ctx, `未読 ${unread}   不在着信 ${missed}   ♥ ${s.watch.hr}`, 58, 430, { size: 34, color: C.sub });
      p.button(ctx, 'recenter', '正面に再配置', 50, 465, 330, 80, () => a.recenter(), { size: 32 });
    },
  },
  {
    id: 'phone', w: 0.5, h: 0.38,
    draw(ctx, p, s, a) {
      frame(ctx, p, 'PHONE');
      const ph = s.phone;
      if (ph.active) {
        const sec = Math.floor((s.now - ph.active.since) / 1000);
        txt(ctx, ph.active.name, p.cw / 2, 270, { size: 90, align: 'center', weight: 600 });
        txt(ctx, ph.active.number, p.cw / 2, 330, { size: 40, align: 'center', color: C.sub });
        txt(ctx, `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`,
          p.cw / 2, 440, { size: 80, align: 'center', color: C.good, weight: 300 });
        p.button(ctx, 'hangup', '通話を終了', 270, 520, 484, 140, () => a.hangup(), { color: C.bad, size: 50 });
        return;
      }
      txt(ctx, ph.dial || '番号を入力', 44, 160, { size: 62, color: ph.dial ? C.text : C.sub, weight: 300 });
      const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#'];
      keys.forEach((k, i) => {
        p.button(ctx, 'k' + k, k, 40 + (i % 3) * 165, 210 + Math.floor(i / 3) * 125, 150, 110, () => a.dialKey(k), { size: 52 });
      });
      p.button(ctx, 'call', '発信', 560, 210, 424, 110, () => a.call(), { color: C.good, size: 48 });
      p.button(ctx, 'back', '⌫ 消す', 560, 335, 424, 90, () => a.dialBack(), { size: 38 });
      txt(ctx, '履歴', 560, 480, { size: 28, color: C.sub });
      ph.recent.forEach((r, i) => {
        const y = 495 + i * 90, [label, col] = DIR[r.dir];
        p.button(ctx, 'r' + i, '', 560, y, 424, 80, () => a.call(r.number), { color: col });
        txt(ctx, label, 580, y + 52, { size: 26, color: col });
        txt(ctx, r.name, 670, y + 52, { size: 36 });
      });
    },
  },
  {
    id: 'messages', w: 0.46, h: 0.42,
    draw(ctx, p, s, a) {
      frame(ctx, p, 'MESSAGES');
      s.messages.slice(0, 5).forEach((m, i) => {
        const y = 100 + i * 118, sel = s.selected === m.id;
        p.button(ctx, 'm' + m.id, '', 36, y, p.cw - 72, 106, () => a.select(m.id), { color: sel ? C.cyan : C.sub });
        ctx.beginPath(); ctx.arc(92, y + 53, 30, 0, 7); ctx.fillStyle = m.app === 'LINE' ? C.line : C.cyan; ctx.fill();
        txt(ctx, m.app[0], 92, y + 66, { size: 36, align: 'center', weight: 700, color: '#fff' });
        txt(ctx, m.from, 144, y + 44, { size: 32, weight: 600 });
        ctx.font = `400 30px ${FONT}`;
        txt(ctx, fit(ctx, m.text, 600), 144, y + 86, { size: 30, color: C.sub });
        txt(ctx, hhmm(m.t), p.cw - 62, y + 44, { size: 24, color: C.sub, align: 'right' });
        if (!m.read) { ctx.beginPath(); ctx.arc(p.cw - 70, y + 76, 9, 0, 7); ctx.fillStyle = C.warn; ctx.fill(); }
      });
      if (s.selected) {
        ['了解', 'あとで連絡する', '👍'].forEach((t, i) => {
          const w = [220, 400, 160][i], x = 36 + [0, 235, 650][i];
          p.button(ctx, 'q' + i, t, x, 740, w, 110, () => a.reply(t), { color: C.good, size: 34 });
        });
      } else {
        txt(ctx, 'メッセージをタップで返信', p.cw / 2, 800, { size: 28, color: C.sub, align: 'center' });
      }
    },
  },
  {
    id: 'watch', w: 0.38, h: 0.3, px: 900,
    draw(ctx, p, s) {
      const w = s.watch;
      frame(ctx, p, 'WATCH');
      txt(ctx, w.connected ? '● CONNECTED' : '○ OFFLINE', p.cw - 70, 56, { size: 24, color: w.connected ? C.good : C.bad, align: 'right' });
      txt(ctx, '♥', 50, 230, { size: 70, color: C.bad });
      txt(ctx, String(w.hr), 130, 235, { size: 140, weight: 300 });
      txt(ctx, 'bpm', 330, 235, { size: 34, color: C.sub });
      // sparkline
      const x0 = 50, y0 = 270, W = 420, H = 150, lo = 50, hi = 135;
      ctx.beginPath();
      w.hrHist.forEach((v, i) => {
        const x = x0 + (i / 59) * W, y = y0 + H - ((v - lo) / (hi - lo)) * H;
        i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      });
      ctx.strokeStyle = C.cyan; ctx.lineWidth = 4; ctx.stroke();
      [['STEPS', w.steps.toLocaleString(), C.text], ['SpO₂', w.spo2 + '%', C.good], ['BATTERY', w.battery + '%', C.warn]].forEach(([k, v, col], i) => {
        txt(ctx, k, 560, 150 + i * 120, { size: 24, color: C.sub });
        txt(ctx, v, 560, 200 + i * 120, { size: 52, color: col, weight: 600 });
      });
    },
  },
  {
    id: 'incoming', w: 0.42, h: 0.2, overlay: true,
    draw(ctx, p, s, a) {
      frame(ctx, p, 'INCOMING CALL');
      const i = s.phone.incoming; if (!i) return;
      txt(ctx, i.name, p.cw / 2, 220, { size: 90, align: 'center', weight: 600 });
      txt(ctx, i.number, p.cw / 2, 275, { size: 36, align: 'center', color: C.sub });
      p.button(ctx, 'ans', '応答', 70, 320, 410, 120, () => a.answer(), { color: C.good, size: 50 });
      p.button(ctx, 'dec', '拒否', 544, 320, 410, 120, () => a.decline(), { color: C.bad, size: 50 });
    },
  },
];
