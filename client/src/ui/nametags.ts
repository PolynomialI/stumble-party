import * as THREE from 'three';

const _v = new THREE.Vector3();

/** Floating player names, positioned in screen space. Only the nearest few are shown to keep it readable. */
export class NameTags {
  private readonly root: HTMLDivElement;
  private readonly tags = new Map<number, HTMLDivElement>();
  private readonly shown = new Set<number>();

  constructor(parent: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'nametags';
    parent.appendChild(this.root);
  }

  setName(slot: number, name: string, self = false) {
    let el = this.tags.get(slot);
    if (!el) {
      el = document.createElement('div');
      el.className = 'nametag';
      el.style.display = 'none';
      this.root.appendChild(el);
      this.tags.set(slot, el);
    }
    if (el.textContent !== name) el.textContent = name;
    el.classList.toggle('self', self);
  }

  beginFrame() {
    this.shown.clear();
  }

  /** Places the tag for `slot` above a head at world position (x, y, z). */
  place(slot: number, x: number, y: number, z: number, camera: THREE.Camera, maxDist = 32) {
    const el = this.tags.get(slot);
    if (!el) return;
    const d = camera.position.distanceTo(_v.set(x, y, z));
    _v.project(camera);
    if (d > maxDist || _v.z > 1 || _v.x < -1.2 || _v.x > 1.2 || _v.y < -1.2 || _v.y > 1.2) return;
    const sx = (_v.x * 0.5 + 0.5) * innerWidth;
    const sy = (-_v.y * 0.5 + 0.5) * innerHeight;
    el.style.transform = `translate(-50%, -100%) translate(${sx.toFixed(1)}px, ${sy.toFixed(1)}px)`;
    el.style.opacity = String(Math.min(1, (maxDist - d) / 8));
    this.shown.add(slot);
  }

  endFrame() {
    for (const [slot, el] of this.tags) {
      const want = this.shown.has(slot) ? '' : 'none';
      if (el.style.display !== want) el.style.display = want;
    }
  }

  remove(slot: number) {
    this.tags.get(slot)?.remove();
    this.tags.delete(slot);
  }

  dispose() {
    this.root.remove();
  }
}
