import * as THREE from 'three';
import { WORLD } from './data.js';
import { fbm, smoothstep, lerp } from './noise.js';

// ---------- Hoogte ----------

// > 0 binnen de plas, < 0 erbuiten (ruwweg: aandeel van de straal).
export function lakeField(x, z) {
  let f = -10;
  for (const l of WORLD.lake.lobes) {
    const dx = (x - l.x) / l.rx;
    const dz = (z - l.z) / l.rz;
    f = Math.max(f, 1 - Math.sqrt(dx * dx + dz * dz));
  }
  return f + (fbm(x * 0.03, z * 0.03, 3) - 0.5) * 0.12;
}

function islandField(x, z) {
  let g = -10;
  for (const l of WORLD.lake.islands) {
    const dx = (x - l.x) / l.rx;
    const dz = (z - l.z) / l.rz;
    g = Math.max(g, 1 - Math.sqrt(dx * dx + dz * dz));
  }
  return g;
}

// Hoogte van het maaiveld (zonder bruggen).
export function heightAt(x, z) {
  let land = WORLD.baseHeight;
  for (const h of WORLD.hills) {
    const dx = x - h.x;
    const dz = z - h.z;
    land += h.h * Math.exp(-(dx * dx + dz * dz) / (h.r * h.r));
  }
  land += (fbm(x * 0.012, z * 0.012, 3) - 0.5) * 1.3;
  land += (fbm(x * 0.07, z * 0.07, 2) - 0.5) * 0.22;

  // Naar de rand toe vlak uitlopen in het polderland.
  const edge = smoothstep(138, 158, Math.max(Math.abs(x), Math.abs(z)));
  land = lerp(land, WORLD.baseHeight - 0.3, edge);

  const f = lakeField(x, z);
  if (f < -0.6 || edge >= 1) return land;
  const g = islandField(x, z);
  // Oevers lopen zacht af naar het water.
  land = lerp(land, 0.42, smoothstep(-0.5, -0.08, f));
  const island = smoothstep(-0.25, 0.25, g);
  const wet = smoothstep(-0.1, 0.22, f) * (1 - island);
  return lerp(lerp(land, -1.6, wet) + island * 0.45, land, edge);
}

// Hoogte waar je op loopt: maaiveld, of het brugdek.
export function groundAt(x, z) {
  const h = heightAt(x, z);
  for (const b of WORLD.bridges) {
    const dx = b.x2 - b.x1;
    const dz = b.z2 - b.z1;
    const len = Math.hypot(dx, dz);
    const t = ((x - b.x1) * dx + (z - b.z1) * dz) / (len * len);
    if (t < 0 || t > 1) continue;
    const perp = Math.abs((x - b.x1) * dz - (z - b.z1) * dx) / len;
    if (perp < b.width / 2 - 0.15) return Math.max(h, b.y);
  }
  return h;
}

// ---------- Paden ----------

const CELL = 0.5;
const GRID = Math.round(WORLD.size / CELL);
const pathGrid = new Float32Array(GRID * GRID).fill(99);
export const pathCurves = [];

for (const pts of WORLD.paths) {
  const curve = new THREE.CatmullRomCurve3(
    pts.map(([x, z]) => new THREE.Vector3(x, 0, z)),
    false,
    'centripetal',
  );
  pathCurves.push(curve);
  const n = Math.ceil(curve.getLength() / 0.35);
  for (const p of curve.getSpacedPoints(n)) {
    const cx = Math.floor((p.x + WORLD.size / 2) / CELL);
    const cz = Math.floor((p.z + WORLD.size / 2) / CELL);
    const R = 10;
    for (let j = -R; j <= R; j++) {
      for (let i = -R; i <= R; i++) {
        const gx = cx + i;
        const gz = cz + j;
        if (gx < 0 || gz < 0 || gx >= GRID || gz >= GRID) continue;
        const wx = (gx + 0.5) * CELL - WORLD.size / 2;
        const wz = (gz + 0.5) * CELL - WORLD.size / 2;
        const d = Math.hypot(wx - p.x, wz - p.z);
        const k = gz * GRID + gx;
        if (d < pathGrid[k]) pathGrid[k] = d;
      }
    }
  }
}

// Afstand tot het dichtstbijzijnde pad (nauwkeurig tot ~5 m, daarbuiten 99).
export function pathDist(x, z) {
  const fx = (x + WORLD.size / 2) / CELL - 0.5;
  const fz = (z + WORLD.size / 2) / CELL - 0.5;
  const ix = Math.floor(fx);
  const iz = Math.floor(fz);
  if (ix < 0 || iz < 0 || ix >= GRID - 1 || iz >= GRID - 1) return 99;
  const tx = fx - ix;
  const tz = fz - iz;
  const k = iz * GRID + ix;
  const a = lerp(pathGrid[k], pathGrid[k + 1], tx);
  const b = lerp(pathGrid[k + GRID], pathGrid[k + GRID + 1], tx);
  return lerp(a, b, tz);
}

// ---------- Mesh ----------

function groundTexture(res, shadows) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = res;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(res, res);
  const d = img.data;
  const S = WORLD.size;
  const half = WORLD.pathWidth / 2;

  for (let py = 0; py < res; py++) {
    const z = ((py + 0.5) / res - 0.5) * S;
    for (let px = 0; px < res; px++) {
      const x = ((px + 0.5) / res - 0.5) * S;
      const h = heightAt(x, z);

      // Kruidenrijk grasland: wisselende tinten groen, hier en daar wat geler.
      const n1 = fbm(x * 0.05, z * 0.05, 3);
      const n2 = fbm(x * 0.9 + 40, z * 0.9, 2);
      let r = lerp(88, 128, n1) + (n2 - 0.5) * 34;
      let g = lerp(118, 142, n1) + (n2 - 0.5) * 30;
      let b = lerp(52, 66, n1) + (n2 - 0.5) * 16;

      // Pad: licht, halfverhard.
      const pd = pathDist(x, z);
      if (pd < half + 1) {
        const t = 1 - smoothstep(half - 0.35, half + 0.3 + (n2 - 0.5) * 0.5, pd);
        r = lerp(r, 196 + (n2 - 0.5) * 22, t);
        g = lerp(g, 180 + (n2 - 0.5) * 20, t);
        b = lerp(b, 150 + (n2 - 0.5) * 18, t);
      }

      // Oever en bodem van de plas.
      if (h < 0.5) {
        const t = 1 - smoothstep(0.05, 0.5, h);
        r = lerp(r, 112, t * 0.8);
        g = lerp(g, 104, t * 0.8);
        b = lerp(b, 78, t * 0.8);
        const deep = 1 - smoothstep(-1.3, -0.1, h);
        r = lerp(r, 44, deep);
        g = lerp(g, 60, deep);
        b = lerp(b, 58, deep);
      }

      const k = (py * res + px) * 4;
      d[k] = r;
      d[k + 1] = g;
      d[k + 2] = b;
      d[k + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);

  // Zachte schaduw onder bomen en struiken.
  ctx.globalCompositeOperation = 'multiply';
  const scale = res / S;
  for (const s of shadows) {
    const cx = (s.x + S / 2) * scale;
    const cy = (s.z + S / 2) * scale;
    const rad = Math.max(2, s.r * scale);
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, rad);
    grad.addColorStop(0, 'rgba(96,116,110,1)');
    grad.addColorStop(0.6, 'rgba(150,165,158,1)');
    grad.addColorStop(1, 'rgba(255,255,255,1)');
    ctx.fillStyle = grad;
    ctx.fillRect(cx - rad, cy - rad, rad * 2, rad * 2);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

export function buildTerrain({ textureSize, shadows }) {
  const S = WORLD.size;
  const seg = 256;
  const geo = new THREE.PlaneGeometry(S, S, seg, seg);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    pos.setY(i, heightAt(pos.getX(i), pos.getZ(i)));
  }
  geo.computeVertexNormals();
  const mat = new THREE.MeshLambertMaterial({ map: groundTexture(textureSize, shadows) });
  const group = new THREE.Group();
  group.add(new THREE.Mesh(geo, mat));

  // Vlak polderland tot aan de horizon.
  const far = new THREE.Mesh(
    new THREE.CircleGeometry(1400, 48).rotateX(-Math.PI / 2),
    new THREE.MeshLambertMaterial({ color: 0x6f8a48 }),
  );
  far.position.y = WORLD.baseHeight - 0.34;
  group.add(far);
  return group;
}
