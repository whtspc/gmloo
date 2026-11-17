import * as THREE from 'three';
import { mulberry32 } from './noise.js';

export const SKY = {
  horizon: new THREE.Color(0xdde7ea),
  zenith: new THREE.Color(0x6c9fd2),
  sunDir: new THREE.Vector3(-0.45, 0.62, -0.64).normalize(),
};

function cloudTexture(rng) {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 128;
  const ctx = c.getContext('2d');
  for (let i = 0; i < 16; i++) {
    const x = 50 + rng() * 156;
    const y = 52 + rng() * 34;
    const r = 22 + rng() * 30;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, 'rgba(255,255,255,0.5)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 256, 128);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function buildSky() {
  const group = new THREE.Group();

  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(1200, 32, 16),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        horizon: { value: SKY.horizon },
        zenith: { value: SKY.zenith },
        sunDir: { value: SKY.sunDir },
      },
      vertexShader: `
        varying vec3 vDir;
        void main() {
          vDir = position;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: `
        uniform vec3 horizon; uniform vec3 zenith; uniform vec3 sunDir;
        varying vec3 vDir;
        void main() {
          vec3 d = normalize(vDir);
          float h = clamp(d.y, 0.0, 1.0);
          vec3 col = mix(horizon, zenith, pow(h, 0.55));
          float s = max(dot(d, sunDir), 0.0);
          col += vec3(1.0, 0.93, 0.8) * (pow(s, 350.0) * 1.5 + pow(s, 12.0) * 0.16);
          gl_FragColor = vec4(col, 1.0);
          #include <colorspace_fragment>
        }`,
    }),
  );
  dome.renderOrder = -10;
  group.add(dome);

  // Hollandse wolken.
  const rng = mulberry32(77);
  const clouds = new THREE.Group();
  const textures = [cloudTexture(rng), cloudTexture(rng), cloudTexture(rng)];
  for (let i = 0; i < 22; i++) {
    const mat = new THREE.SpriteMaterial({
      map: textures[i % 3],
      fog: false,
      depthWrite: false,
      transparent: true,
      opacity: 0.75 + rng() * 0.25,
    });
    const s = new THREE.Sprite(mat);
    const a = rng() * Math.PI * 2;
    const r = 550 + rng() * 450;
    s.position.set(Math.cos(a) * r, 110 + rng() * 260, Math.sin(a) * r);
    const w = 320 + rng() * 380;
    s.scale.set(w, w * 0.36, 1);
    s.renderOrder = -9;
    clouds.add(s);
  }
  group.add(clouds);

  return {
    group,
    update(camera, dt) {
      group.position.set(camera.position.x, 0, camera.position.z);
      clouds.rotation.y += dt * 0.0025;
    },
  };
}
