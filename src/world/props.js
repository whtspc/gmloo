import * as THREE from 'three';
import { WORLD, heightAt } from './data.js';
import { SKY } from './sky.js';

// ---------- Water ----------

export function buildWater(fog) {
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    uniforms: {
      uTime: { value: 0 },
      horizon: { value: SKY.horizon },
      zenith: { value: SKY.zenith },
      sunDir: { value: SKY.sunDir },
      deep: { value: new THREE.Color(0x2c4a4a) },
      fogColor: { value: fog.color },
      fogNear: { value: fog.near },
      fogFar: { value: fog.far },
    },
    vertexShader: `
      varying vec3 vWorld; varying float vDepth;
      void main() {
        vec4 w = modelMatrix * vec4(position, 1.0);
        vWorld = w.xyz;
        vec4 mv = viewMatrix * w;
        vDepth = -mv.z;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      uniform float uTime; uniform vec3 horizon; uniform vec3 zenith; uniform vec3 sunDir;
      uniform vec3 deep; uniform vec3 fogColor; uniform float fogNear; uniform float fogFar;
      varying vec3 vWorld; varying float vDepth;
      void main() {
        vec2 p = vWorld.xz;
        float t = uTime;
        vec3 n = normalize(vec3(
          sin(p.x * 1.3 + t * 0.9) * 0.035 + sin((p.x + p.y) * 2.9 - t * 1.4) * 0.02 + sin(p.y * 7.1 + t * 2.1) * 0.008,
          1.0,
          cos(p.y * 1.7 + t * 0.7) * 0.035 + sin((p.x - p.y) * 3.3 + t * 1.2) * 0.02 + cos(p.x * 6.3 - t * 1.8) * 0.008));
        vec3 v = normalize(cameraPosition - vWorld);
        float fres = pow(1.0 - max(dot(n, v), 0.0), 3.0);
        vec3 r = reflect(-v, n);
        vec3 sky = mix(horizon, zenith, pow(clamp(r.y, 0.0, 1.0), 0.55));
        vec3 col = mix(deep, sky, clamp(0.22 + fres * 0.85, 0.0, 1.0));
        col += vec3(1.0, 0.95, 0.85) * pow(max(dot(r, sunDir), 0.0), 220.0) * 0.9;
        float f = smoothstep(fogNear, fogFar, vDepth);
        col = mix(col, fogColor, f);
        gl_FragColor = vec4(col, 0.9);
        #include <colorspace_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(WORLD.width, WORLD.depth).rotateX(-Math.PI / 2), mat);
  mesh.position.set((WORLD.x0 + WORLD.x1) / 2, WORLD.waterLevel, (WORLD.z0 + WORLD.z1) / 2);
  return { mesh, update: (time) => (mat.uniforms.uTime.value = time) };
}

// ---------- Hout ----------

const wood = new THREE.MeshLambertMaterial({ color: 0x9a8468 });
const woodDark = new THREE.MeshLambertMaterial({ color: 0x74624e });

function box(w, h, d, x, y, z, mat = wood) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  return m;
}

export function buildBridge(b) {
  const g = new THREE.Group();
  const len = Math.hypot(b.x2 - b.x1, b.z2 - b.z1);
  const planks = Math.round(len / 0.22);
  for (let i = 0; i < planks; i++) {
    g.add(box(b.width, 0.06, 0.19, 0, -0.03, -len / 2 + (i + 0.5) * (len / planks), i % 2 ? wood : woodDark));
  }
  for (const side of [-1, 1]) {
    const x = side * (b.width / 2 - 0.04);
    g.add(box(0.07, 0.07, len, x, 0.95, 0));
    g.add(box(0.05, 0.05, len, x, 0.5, 0));
    const posts = Math.max(2, Math.round(len / 2));
    for (let i = 0; i <= posts; i++) {
      g.add(box(0.09, 2.2, 0.09, x, -0.1, -len / 2 + (i * len) / posts, woodDark));
    }
    g.add(box(0.12, 0.2, len, x * 0.7, -0.16, 0, woodDark));
  }
  g.position.set((b.x1 + b.x2) / 2, b.y, (b.z1 + b.z2) / 2);
  g.rotation.y = Math.atan2(b.x2 - b.x1, b.z2 - b.z1);
  return g;
}

// ---------- Gwens plek ----------
// De ligging is echt (g.E515 op de digitale kaart). Hoe de plek er precies uitziet
// weten we nog niet, dus geen nagemaakt graf: alleen een zacht, warm licht en haar naam.

function glowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,244,214,1)');
  g.addColorStop(0.25, 'rgba(255,226,170,0.5)');
  g.addColorStop(1, 'rgba(255,220,160,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

function nameTexture(name) {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 192;
  const ctx = c.getContext('2d');
  ctx.font = 'italic 110px Georgia, "Times New Roman", serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = 'rgba(60,45,20,0.55)';
  ctx.shadowBlur = 18;
  ctx.fillStyle = '#fffaf0';
  ctx.fillText(name, 256, 100);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function buildGwen() {
  const { x, z, name } = WORLD.gwen;
  const y = heightAt(x, z);
  const group = new THREE.Group();
  group.position.set(x, y, z);

  const tex = glowTexture();
  const mk = (opacity) =>
    new THREE.SpriteMaterial({
      map: tex,
      transparent: true,
      opacity,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: false,
    });

  const glow = new THREE.Sprite(mk(0.55));
  glow.position.y = 0.5;
  glow.scale.set(2.6, 2.6, 1);
  const beam = new THREE.Sprite(mk(0.22));
  beam.position.y = 4;
  beam.scale.set(1.5, 11, 1);
  const core = new THREE.Sprite(mk(0.9));
  core.position.y = 0.45;
  core.scale.set(0.5, 0.5, 1);

  const label = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: nameTexture(name), transparent: true, depthWrite: false, fog: false }),
  );
  label.position.y = 1.75;
  label.scale.set(1.9, 0.71, 1);

  group.add(beam, glow, core, label);

  return {
    group,
    update(time, camera) {
      const pulse = 1 + Math.sin(time * 0.8) * 0.06;
      glow.scale.set(2.6 * pulse, 2.6 * pulse, 1);
      core.material.opacity = 0.8 + Math.sin(time * 1.3) * 0.1;
      const d = Math.hypot(camera.position.x - x, camera.position.z - z);
      // Naam verschijnt als je dichterbij komt; de lichtzuil wijst van ver de weg.
      label.material.opacity = THREE.MathUtils.clamp((45 - d) / 20, 0, 1);
      beam.material.opacity = 0.1 + THREE.MathUtils.clamp((d - 6) / 60, 0, 1) * 0.22;
    },
  };
}
