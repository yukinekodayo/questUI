import * as THREE from 'three';
import { C, txt } from './theme.js';

// A floating canvas-textured panel with registered touch buttons.
// Hit-testing works in canvas pixel space (u,v); z is distance in front of the panel (m).
export class Panel {
  constructor({ id, w, h, px = 1024, draw }) {
    Object.assign(this, { id, w, h, drawFn: draw });
    this.cw = px;
    this.ch = Math.round(px * h / w);
    this.canvas = Object.assign(document.createElement('canvas'), { width: this.cw, height: this.ch });
    this.ctx = this.canvas.getContext('2d');
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.anisotropy = 8;
    this.mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({ map: this.texture, transparent: true, depthWrite: false }));
    this.mesh.userData.panel = this;
    this.buttons = [];
    this.hover = null;
    this.pressed = null;
    this.dirty = true;
  }

  invalidate() { this.dirty = true; }

  render(state, actions) {
    if (!this.dirty) return;
    this.dirty = false;
    this.buttons = [];
    this.ctx.clearRect(0, 0, this.cw, this.ch);
    this.drawFn(this.ctx, this, state, actions);
    this.texture.needsUpdate = true;
  }

  button(ctx, id, label, x, y, w, h, onPress, { color = C.cyan, size = 40 } = {}) {
    const hot = this.hover === id, down = this.pressed === id;
    ctx.save();
    ctx.beginPath(); ctx.roundRect(x, y, w, h, 16);
    ctx.globalAlpha = down ? 0.75 : hot ? 0.4 : 0.12; ctx.fillStyle = color; ctx.fill();
    ctx.globalAlpha = 1; ctx.strokeStyle = color; ctx.lineWidth = hot ? 5 : 2.5; ctx.stroke();
    ctx.restore();
    txt(ctx, label, x + w / 2, y + h / 2 + size * 0.36, { size, align: 'center', color: down ? '#fff' : color, weight: 600 });
    this.buttons.push({ id, x, y, w, h, onPress });
  }

  buttonAt(u, v) {
    return this.buttons.find(b => u >= b.x && u <= b.x + b.w && v >= b.y && v <= b.y + b.h) || null;
  }

  setHover(id) { if (this.hover !== id) { this.hover = id; this.dirty = true; } }

  press(btn) {
    this.pressed = btn.id; this.dirty = true;
    setTimeout(() => { this.pressed = null; this.dirty = true; }, 160);
    btn.onPress();
  }

  pxToLocal(u, v) { return new THREE.Vector3((u / this.cw - 0.5) * this.w, (0.5 - v / this.ch) * this.h, 0); }

  // world point -> panel coords
  local(world) {
    this.mesh.updateWorldMatrix(true, false);
    const l = this.mesh.worldToLocal(world.clone());
    return { x: l.x, y: l.y, z: l.z, u: (l.x / this.w + 0.5) * this.cw, v: (0.5 - l.y / this.h) * this.ch };
  }

  inside(loc) { return loc.u >= 0 && loc.u <= this.cw && loc.v >= 0 && loc.v <= this.ch; }
}
