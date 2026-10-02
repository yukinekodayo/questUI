export const C = {
  cyan: '#4de8ff', bg: 'rgba(6,20,34,0.80)', text: '#d6f6ff', sub: '#7fb4c4',
  warn: '#ffb454', bad: '#ff5470', good: '#3dffa2', line: '#06c755',
};
export const FONT = '"Noto Sans JP","Hiragino Sans","Yu Gothic",sans-serif';
export const HEADER_H = 84;

export function txt(ctx, s, x, y, { size = 32, color = C.text, align = 'left', weight = 400 } = {}) {
  ctx.font = `${weight} ${size}px ${FONT}`;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(s, x, y);
}

export function fit(ctx, s, maxW) {
  if (ctx.measureText(s).width <= maxW) return s;
  while (s.length > 1 && ctx.measureText(s + '…').width > maxW) s = s.slice(0, -1);
  return s + '…';
}

export function frame(ctx, p, title) {
  const { cw, ch } = p;
  ctx.beginPath(); ctx.roundRect(4, 4, cw - 8, ch - 8, 26);
  ctx.fillStyle = C.bg; ctx.fill();
  ctx.strokeStyle = 'rgba(77,232,255,0.45)'; ctx.lineWidth = 3; ctx.stroke();
  // corner brackets
  ctx.strokeStyle = C.cyan; ctx.lineWidth = 6; ctx.lineCap = 'round';
  const L = 46, m = 14;
  for (const [x, y, dx, dy] of [[m, m, 1, 1], [cw - m, m, -1, 1], [m, ch - m, 1, -1], [cw - m, ch - m, -1, -1]]) {
    ctx.beginPath(); ctx.moveTo(x + dx * L, y); ctx.lineTo(x, y); ctx.lineTo(x, y + dy * L); ctx.stroke();
  }
  txt(ctx, title, 44, 56, { size: 30, color: C.cyan, weight: 700 });
  ctx.fillStyle = C.cyan;
  for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(cw - 60 + i * 16, 44, 4, 0, 7); ctx.fill(); } // grab handle
  ctx.strokeStyle = 'rgba(77,232,255,0.3)'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(30, HEADER_H); ctx.lineTo(cw - 30, HEADER_H); ctx.stroke();
}
