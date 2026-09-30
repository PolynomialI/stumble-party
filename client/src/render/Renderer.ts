import * as THREE from 'three';
import { PROFILES, type Quality, type QualityProfile } from './quality';
import { MaterialLib } from './materials';

/**
 * WebGL renderer + scene + camera, with a dynamic-resolution governor that trades pixels for frame rate
 * (the single most effective lever on integrated GPUs).
 */
export class GameRenderer {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(68, 1, 0.1, 1200);
  readonly mats: MaterialLib;
  profile: QualityProfile;
  /** 0.55..1 multiplier on the profile's pixel ratio, driven by measured frame time. */
  private resScale = 1;
  private frameAvg = 16.7;
  private cooldown = 0;
  private cssW = 1;
  private cssH = 1;

  constructor(canvas: HTMLCanvasElement, public quality: Quality) {
    this.profile = PROFILES[quality];
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: this.profile.antialias,
      powerPreference: 'high-performance',
      stencil: false,
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    this.renderer.toneMappingExposure = 1.02;
    this.renderer.shadowMap.enabled = this.profile.shadows;
    this.renderer.shadowMap.type = this.profile.shadowMapSize >= 2048 ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
    this.mats = new MaterialLib(this.profile);
    addEventListener('resize', () => this.resize());
    this.resize();
  }

  /** Applies a new quality level. Returns true if the page must reload to change antialiasing. */
  setQuality(q: Quality): boolean {
    const next = PROFILES[q];
    const needsReload = next.antialias !== this.profile.antialias;
    this.quality = q;
    this.profile = next;
    this.renderer.shadowMap.enabled = next.shadows;
    this.renderer.shadowMap.type = next.shadowMapSize >= 2048 ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
    this.mats.setProfile(next);
    this.resScale = 1;
    this.resize();
    return needsReload;
  }

  resize() {
    this.cssW = Math.max(1, innerWidth);
    this.cssH = Math.max(1, innerHeight);
    this.renderer.setPixelRatio(this.pixelRatio());
    this.renderer.setSize(this.cssW, this.cssH, false);
    this.camera.aspect = this.cssW / this.cssH;
    this.camera.updateProjectionMatrix();
  }

  private pixelRatio() {
    return Math.min(devicePixelRatio || 1, this.profile.maxPixelRatio) * this.resScale;
  }

  /** Feed real frame times; lowers resolution when we can't hold ~55 fps and raises it back when there's headroom. */
  governor(frameMs: number) {
    this.frameAvg += (Math.min(frameMs, 100) - this.frameAvg) * 0.05;
    // Frame times are vsync-capped, so "smooth for a few seconds" is the only headroom signal we get.
    this.smoothFrames = this.frameAvg < 17.6 ? this.smoothFrames + 1 : 0;
    if (this.cooldown > 0) { this.cooldown--; return; }
    let next = this.resScale;
    if (this.frameAvg > 19.5 && this.resScale > 0.55) {
      next = Math.max(0.55, this.resScale - 0.1);
      this.cooldown = 60;
    } else if (this.smoothFrames > 240 && this.resScale < 1) {
      next = Math.min(1, this.resScale + 0.05);
      this.cooldown = 240;
    }
    if (next !== this.resScale) {
      this.resScale = next;
      this.renderer.setPixelRatio(this.pixelRatio());
      this.renderer.setSize(this.cssW, this.cssH, false);
    }
  }

  private smoothFrames = 0;

  get resolutionScale() {
    return this.resScale;
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }
}
