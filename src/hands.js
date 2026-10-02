import * as THREE from 'three';
import { C, HEADER_H } from './theme.js';

const PINCH_ON = 0.022, PINCH_OFF = 0.04;   // thumb-index distance (m), with hysteresis
const REACH = 0.15;                          // how far in front of a panel the fingertip starts hovering
const ARM_Z = 0.025, FIRE_Z = 0.006;         // press = fingertip crosses from ARM_Z to FIRE_Z
const _a = new THREE.Vector3(), _b = new THREE.Vector3();

// Direct-touch hand input:
//   poke   : push an index fingertip through a button to press it
//   pinch  : pinch on a panel's header strip and move your hand to drag it
export class HandInput {
  constructor(renderer, scene, getPanels, head, onPress) {
    this.getPanels = getPanels; this.head = head; this.onPress = onPress;
    const dotGeo = new THREE.SphereGeometry(0.005, 8, 6);
    this.hands = [0, 1].map(i => {
      const hand = renderer.xr.getHand(i);
      scene.add(hand);
      const dots = new THREE.InstancedMesh(dotGeo, new THREE.MeshBasicMaterial({ color: C.cyan, transparent: true, opacity: 0.7 }), 25);
      dots.frustumCulled = false; scene.add(dots);
      const tip = new THREE.Mesh(new THREE.SphereGeometry(0.009, 16, 12), new THREE.MeshBasicMaterial({ color: '#ffffff' }));
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.8, 1, 40), new THREE.MeshBasicMaterial({ color: C.cyan, transparent: true, side: THREE.DoubleSide, depthTest: false }));
      ring.renderOrder = 10; tip.visible = ring.visible = false;
      scene.add(tip, ring);
      return { hand, dots, tip, ring, pinching: false, grab: null, armed: new Map() };
    });
  }

  update() {
    const panels = this.getPanels().filter(p => p.mesh.visible);
    const hovers = new Map();
    const m4 = new THREE.Matrix4();

    for (const h of this.hands) {
      const j = h.hand.joints;
      const tipJ = j?.['index-finger-tip'], thumbJ = j?.['thumb-tip'];
      const tracked = !!(tipJ && thumbJ && tipJ.visible);
      h.tip.visible = h.dots.visible = tracked;
      h.ring.visible = false;
      if (!tracked) { h.pinching = false; h.grab = null; continue; }

      Object.values(j).forEach((joint, i) => { joint.updateWorldMatrix(true, false); m4.copy(joint.matrixWorld); h.dots.setMatrixAt(i, m4); });
      h.dots.instanceMatrix.needsUpdate = true;

      tipJ.getWorldPosition(_a); thumbJ.getWorldPosition(_b);
      const d = _a.distanceTo(_b);
      const wasPinching = h.pinching;
      h.pinching = d < (wasPinching ? PINCH_OFF : PINCH_ON);
      const tip = _a.clone(), pinchPt = _a.clone().add(_b).multiplyScalar(0.5);
      h.tip.position.copy(tip);

      if (h.grab) {
        if (!h.pinching) h.grab = null;
        else {
          const m = h.grab.panel.mesh;
          m.position.copy(pinchPt).add(h.grab.offset);
          m.lookAt(this.head.pos.x, m.position.y, this.head.pos.z);
          h.tip.material.color.set(C.warn);
          continue;
        }
      }
      h.tip.material.color.set(h.pinching ? C.warn : '#ffffff');

      // nearest panel the fingertip is in front of
      let best = null;
      for (const p of panels) {
        const loc = p.local(tip);
        if (!p.inside(loc) || loc.z > REACH || loc.z < -0.06) continue;
        if (!best || Math.abs(loc.z) < Math.abs(best.loc.z)) best = { p, loc };
      }
      if (!best) continue;
      const { p, loc } = best;

      // depth cue: ring on the panel surface shrinks as the fingertip approaches
      h.ring.visible = true;
      h.ring.position.copy(p.mesh.localToWorld(new THREE.Vector3(loc.x, loc.y, 0.002)));
      h.ring.quaternion.copy(p.mesh.quaternion);
      h.ring.scale.setScalar(0.006 + Math.max(0, loc.z) * 0.12);

      if (h.pinching && !wasPinching && loc.v < HEADER_H && Math.abs(loc.z) < 0.08) {
        h.grab = { panel: p, offset: p.mesh.position.clone().sub(pinchPt) };
        continue;
      }
      const btn = p.buttonAt(loc.u, loc.v);
      if (btn) hovers.set(p, btn.id);
      const key = p.id + (btn ? btn.id : '');
      if (loc.z > ARM_Z) h.armed.set(key, true);
      else if (btn && loc.z < FIRE_Z && h.armed.get(key)) { h.armed.set(key, false); this.onPress(p, btn); }
    }
    for (const p of this.getPanels()) p.setHover(hovers.get(p) ?? null);
  }
}
