import * as THREE from 'three';
import type { Tex } from '@sp/shared';
import type { QualityProfile } from './quality';
import { patternTextures } from './textures';

/** Shared uniforms for the toy look (set per map theme). */
export const toyUniforms = {
  uRimColor: { value: new THREE.Color(0xdff4ff) },
  uRimStrength: { value: 0.42 },
  uTime: { value: 0 },
};

/**
 * One shared onBeforeCompile so every toy material compiles to the same program variant.
 * Adds a fresnel rim (the glossy plastic edge glow) and a gentle lift of the shadowed side.
 */
function toyCompile(shader: THREE.WebGLProgramParametersWithUniforms) {
  shader.uniforms.uRimColor = toyUniforms.uRimColor;
  shader.uniforms.uRimStrength = toyUniforms.uRimStrength;
  shader.fragmentShader = 'uniform vec3 uRimColor;\nuniform float uRimStrength;\n' + shader.fragmentShader.replace(
    '#include <opaque_fragment>',
    `{
      float facing = saturate(dot(normalize(normal), normalize(vViewPosition)));
      float rim = pow(1.0 - facing, 3.0);
      outgoingLight += uRimColor * rim * uRimStrength * (0.55 + 0.45 * diffuseColor.rgb);
    }
    #include <opaque_fragment>`,
  );
}

export interface ToyOptions {
  color: number;
  tex?: Tex;
  roughness?: number;
  emissive?: number;
  emissiveIntensity?: number;
  transparent?: boolean;
  opacity?: number;
  vertexColors?: boolean;
  /** Clear-coat sheen for hero objects (characters) on high quality. */
  clearcoat?: boolean;
}

/** Builds and caches glossy "toy plastic" materials for the active quality profile. */
export class MaterialLib {
  private readonly cache = new Map<string, THREE.Material>();

  constructor(private profile: QualityProfile) {}

  setProfile(p: QualityProfile) {
    this.profile = p;
    this.dispose();
  }

  get(o: ToyOptions): THREE.Material {
    const key = JSON.stringify([o, this.profile.pbr, this.profile.normalMaps]);
    let m = this.cache.get(key);
    if (!m) {
      m = this.create(o);
      this.cache.set(key, m);
    }
    return m;
  }

  private create(o: ToyOptions): THREE.Material {
    const p = this.profile;
    const set = o.tex ? patternTextures(o.tex, p.anisotropy, p.normalMaps) : null;
    const common = {
      color: new THREE.Color(o.color),
      map: set?.map ?? null,
      emissive: new THREE.Color(o.emissive ?? 0x000000),
      emissiveIntensity: o.emissiveIntensity ?? 1,
      transparent: o.transparent ?? false,
      opacity: o.opacity ?? 1,
      vertexColors: o.vertexColors ?? false,
    };
    let m: THREE.MeshStandardMaterial | THREE.MeshPhongMaterial | THREE.MeshPhysicalMaterial;
    if (p.pbr) {
      const params = {
        ...common,
        roughness: o.roughness ?? 0.34,
        metalness: 0,
        normalMap: set?.normal ?? null,
        normalScale: new THREE.Vector2(0.9, 0.9),
      };
      m = o.clearcoat && p.shadowMapSize >= 2048
        ? new THREE.MeshPhysicalMaterial({ ...params, clearcoat: 0.6, clearcoatRoughness: 0.18 })
        : new THREE.MeshStandardMaterial(params);
    } else {
      m = new THREE.MeshPhongMaterial({
        ...common,
        shininess: 70 * (1 - (o.roughness ?? 0.34)) + 10,
        specular: new THREE.Color(0x3a3a3a),
      });
    }
    m.onBeforeCompile = toyCompile;
    m.customProgramCacheKey = () => 'toy';
    return m;
  }

  dispose() {
    for (const m of this.cache.values()) m.dispose();
    this.cache.clear();
  }
}
