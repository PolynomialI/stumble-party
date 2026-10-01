import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { rng, type MapDef, type Theme } from '@sp/shared';
import type { QualityProfile } from './quality';
import { toyUniforms } from './materials';

const SKY_VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  vec4 p = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * p;
  gl_Position.z = gl_Position.w * 0.99999; // always at the far plane
}`;

const SKY_FRAG = /* glsl */ `
uniform vec3 uTop;
uniform vec3 uHorizon;
uniform vec3 uBottom;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
varying vec3 vDir;
void main() {
  vec3 d = normalize(vDir);
  float h = d.y;
  vec3 col = mix(uHorizon, uTop, smoothstep(0.0, 0.62, h));
  col = mix(col, uBottom, smoothstep(0.0, -0.35, h));
  float s = max(dot(d, normalize(uSunDir)), 0.0);
  col += uSunColor * (pow(s, 900.0) * 3.0 + pow(s, 22.0) * 0.28);
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

function skyMaterial(theme: Theme) {
  return new THREE.ShaderMaterial({
    vertexShader: SKY_VERT,
    fragmentShader: SKY_FRAG,
    uniforms: {
      uTop: { value: new THREE.Color(theme.skyTop) },
      uHorizon: { value: new THREE.Color(theme.skyHorizon) },
      uBottom: { value: new THREE.Color(theme.skyBottom) },
      uSunDir: { value: new THREE.Vector3(...theme.sunDir) },
      uSunColor: { value: new THREE.Color(theme.sunColor) },
    },
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
  });
}

/** A puffy cloud: overlapping spheres, flattened underneath, shaded white-on-top / tinted-below via vertex colours. */
function cloudGeometry(seed: number, detail: number, tint: THREE.Color): THREE.BufferGeometry {
  const r = rng(seed);
  const parts: THREE.BufferGeometry[] = [];
  const n = 6 + Math.floor(r() * 4);
  for (let i = 0; i < n; i++) {
    const rad = 0.55 + r() * 0.55;
    const g = new THREE.IcosahedronGeometry(rad, detail);
    const x = (i / (n - 1) - 0.5) * 3.2 + (r() - 0.5) * 0.5;
    const y = (1 - Math.abs(i / (n - 1) - 0.5) * 2) * 0.55 + r() * 0.25;
    const z = (r() - 0.5) * 0.9;
    g.translate(x, y, z);
    parts.push(g);
  }
  const merged = mergeVertices(mergeGeometries(parts)!.deleteAttribute('normal').deleteAttribute('uv'));
  const pos = merged.getAttribute('position');
  const colors = new Float32Array(pos.count * 3);
  const top = new THREE.Color(0xffffff);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    if (y < 0) pos.setY(i, y * 0.35); // flat bottoms
    const t = THREE.MathUtils.smoothstep(pos.getY(i), -0.2, 0.9);
    c.copy(tint).lerp(top, t);
    colors.set([c.r, c.g, c.b], i * 3);
  }
  merged.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  merged.computeVertexNormals();
  return merged;
}

/**
 * Sky dome, sun, clouds and the reflection environment for a map theme.
 * Everything here is instanced or merged: a handful of draw calls for the whole backdrop.
 */
export class Environment {
  readonly group = new THREE.Group();
  readonly sun: THREE.DirectionalLight;
  readonly hemi: THREE.HemisphereLight;
  private sky: THREE.Mesh;
  private envTarget: THREE.WebGLRenderTarget | null = null;
  private readonly sunOffset = new THREE.Vector3();

  constructor(private readonly scene: THREE.Scene, private readonly renderer: THREE.WebGLRenderer,
    map: MapDef, private profile: QualityProfile) {
    const theme = map.theme;
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(900, 32, 16), skyMaterial(theme));
    this.sky.renderOrder = -10;
    this.sky.frustumCulled = false;
    this.group.add(this.sky);

    this.hemi = new THREE.HemisphereLight(0xffffff, 0xffffff, 1.35);
    this.group.add(this.hemi);
    this.sun = new THREE.DirectionalLight(theme.sunColor, 2.6);
    this.group.add(this.sun, this.sun.target);
    this.configureShadows();

    this.buildClouds(map);
    this.applyTheme(theme);
    scene.add(this.group);
  }

  private configureShadows() {
    const p = this.profile;
    this.sun.castShadow = p.shadows;
    if (p.shadows) {
      const s = this.sun.shadow;
      s.mapSize.set(p.shadowMapSize, p.shadowMapSize);
      const half = 26;
      s.camera.left = -half; s.camera.right = half; s.camera.top = half; s.camera.bottom = -half;
      s.camera.near = 1; s.camera.far = 160;
      s.bias = -0.0006;
      s.normalBias = 0.035;
      s.radius = 3;
      s.camera.updateProjectionMatrix();
    }
  }

  applyTheme(theme: Theme) {
    const sky = new THREE.Color(theme.skyTop).lerp(new THREE.Color(0xffffff), 0.45);
    const ground = new THREE.Color(theme.skyHorizon).lerp(new THREE.Color(0xffd9b0), 0.4);
    this.hemi.color.copy(sky);
    this.hemi.groundColor.copy(ground);
    this.sun.color.set(theme.sunColor);
    this.sunOffset.set(...theme.sunDir).normalize().multiplyScalar(60);
    this.scene.fog = new THREE.Fog(theme.fog, 140, 560);
    toyUniforms.uRimColor.value.set(theme.skyHorizon).lerp(new THREE.Color(0xffffff), 0.5);
    if (this.profile.pbr) this.buildEnvMap(theme);
    else {
      this.scene.environment = null;
    }
  }

  /** Low-resolution sky with a couple of bright soft-boxes, prefiltered for glossy reflections. */
  private buildEnvMap(theme: Theme) {
    const envScene = new THREE.Scene();
    envScene.add(new THREE.Mesh(new THREE.SphereGeometry(50, 24, 12), skyMaterial(theme)));
    const panel = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide, toneMapped: false });
    const p1 = new THREE.Mesh(new THREE.PlaneGeometry(30, 12), panel);
    p1.position.set(...theme.sunDir.map((v) => v * 40) as [number, number, number]);
    p1.lookAt(0, 0, 0);
    const p2 = new THREE.Mesh(new THREE.PlaneGeometry(40, 8), new THREE.MeshBasicMaterial({ color: 0x9fb8d8, side: THREE.DoubleSide, toneMapped: false }));
    p2.position.set(-25, 18, -20);
    p2.lookAt(0, 0, 0);
    envScene.add(p1, p2);
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.envTarget?.dispose();
    this.envTarget = pmrem.fromScene(envScene, 0.02);
    pmrem.dispose();
    this.scene.environment = this.envTarget.texture;
    this.scene.environmentIntensity = 0.85;
    envScene.traverse((o) => {
      if (o instanceof THREE.Mesh) { o.geometry.dispose(); (o.material as THREE.Material).dispose(); }
    });
  }

  /**
   * Clouds are laid out around the whole course, never across it: a sea of them below the lowest floor, and
   * tall ones in a ring that keeps well clear of the track's sides and both of its ends. (A ring around the
   * start line would cut straight through a long course and hide the platforms ahead.)
   */
  private buildClouds(map: MapDef) {
    const theme = map.theme;
    let z0 = Infinity, z1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const p of [...map.pieces, ...map.tiles.map((t) => t.piece)]) {
      if (p.solid === false) continue;
      z0 = Math.min(z0, p.pos[2]); z1 = Math.max(z1, p.pos[2]);
      y0 = Math.min(y0, p.pos[1]); y1 = Math.max(y1, p.pos[1]);
    }
    if (z0 > z1) { z0 = z1 = 0; y0 = y1 = 0; }
    const midZ = (z0 + z1) / 2, half = (z1 - z0) / 2;
    // On maps with a sea, keep the cloud tops under its surface.
    const floor = Math.min(map.killY, y0 - 12, map.sea ? map.sea.y - 10 : Infinity);
    const tint = new THREE.Color(theme.cloudTint).lerp(new THREE.Color(theme.skyTop), 0.13);
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true, emissive: new THREE.Color(theme.skyHorizon), emissiveIntensity: 0.28 });
    const variants = 3;
    const total = this.profile.clouds;
    const r = rng(1234);
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    const p = new THREE.Vector3();
    for (let v = 0; v < variants; v++) {
      const geo = cloudGeometry(77 + v * 13, this.profile.pbr ? 2 : 1, tint);
      const count = Math.ceil(total / variants);
      const mesh = new THREE.InstancedMesh(geo, mat, count);
      for (let i = 0; i < count; i++) {
        const below = i % 2 === 0;
        const a = r() * Math.PI * 2;
        if (below) {
          // Cloud sea under the course, along its whole length.
          const d = 20 + r() * 260;
          p.set(Math.cos(a) * d, floor - 14 - r() * 18, midZ + Math.sin(a) * (d + half));
          const k = 9 + r() * 10;
          s.set(k * 1.4, k * 0.55, k);
        } else {
          // Towering horizon clouds: at least 230 m out to the sides and beyond each end.
          const d = 230 + r() * 220;
          p.set(Math.cos(a) * d, (y0 + y1) / 2 - 30 + r() * 70, midZ + Math.sin(a) * (d + half));
          const k = 14 + r() * 18;
          s.set(k * 1.6, k, k);
        }
        q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), r() * Math.PI * 2);
        mesh.setMatrixAt(i, m4.compose(p, q, s));
      }
      mesh.frustumCulled = false;
      this.group.add(mesh);
    }
  }

  /** Keeps the shadow frustum centred on what the camera is looking at. */
  update(dt: number, focus: THREE.Vector3) {
    this.sun.position.copy(focus).add(this.sunOffset);
    this.sun.target.position.copy(focus);
    this.sky.position.copy(focus);
  }

  dispose() {
    this.scene.remove(this.group);
    this.group.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.geometry.dispose();
        (o.material as THREE.Material).dispose();
      }
    });
    this.envTarget?.dispose();
    this.scene.environment = null;
  }
}
