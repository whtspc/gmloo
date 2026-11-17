import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { WORLD, cover, heightAt, canopyAt, onBridge } from './data.js';
import { mulberry32, fbm } from './noise.js';

// Alles wat groeit. Bewust algemeen gehouden: "een jonge loofboom", "een struik",
// "gras met bloemen" — geen soorten, tot we het beplantingsplan hebben.

const dummy = new THREE.Object3D();
const color = new THREE.Color();

export const windUniform = { value: 0 };

// Laat gras en riet zacht meebewegen met de wind.
function addWind(material, strength) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = windUniform;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        #ifdef USE_INSTANCING
          float ph = instanceMatrix[3].x * 0.35 + instanceMatrix[3].z * 0.27;
          float sway = sin(uTime * 1.3 + ph) + 0.5 * sin(uTime * 2.9 + ph * 1.7);
          transformed.x += sway * ${strength.toFixed(3)} * position.y * position.y;
          transformed.z += cos(uTime * 1.1 + ph) * ${(strength * 0.6).toFixed(3)} * position.y * position.y;
        #endif`,
      );
  };
  return material;
}

function blobGeometry(detail, parts) {
  const geos = parts.map(([x, y, z, r, sy]) => {
    const g = new THREE.IcosahedronGeometry(r, detail);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const n = 1 + (fbm(p.getX(i) * 2.1 + x * 7, p.getY(i) * 2.1 + p.getZ(i) * 1.3 + y * 5, 2) - 0.5) * 0.5;
      p.setXYZ(i, p.getX(i) * n, p.getY(i) * n * sy, p.getZ(i) * n);
    }
    g.translate(x, y, z);
    g.computeVertexNormals();
    return g;
  });
  const merged = mergeGeometries(geos);
  // Onderkant iets donkerder voor diepte.
  const p = merged.attributes.position;
  const cols = new Float32Array(p.count * 3);
  merged.computeBoundingBox();
  const { min, max } = merged.boundingBox;
  for (let i = 0; i < p.count; i++) {
    const t = (p.getY(i) - min.y) / (max.y - min.y);
    const v = 0.62 + 0.38 * t;
    cols.set([v, v, v], i * 3);
  }
  merged.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  return merged;
}

// Bomen staan waar de kaart bos aangeeft. De aanplant is jong (2019-2020);
// de precieze plek en soort per boom kennen we nog niet. Waar het AHN al hogere
// begroeiing heeft gemeten, nemen we die hoogte over.
function placeTrees(rng, mobile) {
  const list = [];
  const cell = mobile ? 6.5 : 5; // gemiddeld één boom per vak van deze maat
  const { gwen } = WORLD;
  for (let z = WORLD.z0; z < WORLD.z1; z += cell) {
    for (let x = WORLD.x0; x < WORLD.x1; x += cell) {
      const tx = x + rng() * cell;
      const tz = z + rng() * cell;
      const measured = canopyAt(tx, tz);
      const inBos = cover('bos', tx, tz) > 0.6;
      if (cover('walk', tx, tz) < 0.9) continue;
      if (!inBos && measured < 3) continue;
      if (cover('path', tx, tz) > 0.02 || cover('mown', tx, tz) > 0.02 || heightAt(tx, tz) < 0.35) continue;
      if (Math.hypot(tx - gwen.x, tz - gwen.z) < 4) continue;
      const h = Math.max(measured, 2.6 + rng() * 3.4);
      list.push({ x: tx, z: tz, h: Math.min(h, 22) });
    }
  }
  return list;
}

export function buildVegetation({ mobile }) {
  const rng = mulberry32(WORLD.seed);
  const group = new THREE.Group();
  const trees = placeTrees(rng, mobile);

  // --- Bomen ---
  const detail = 1;
  const trunkGeo = new THREE.CylinderGeometry(0.035, 0.06, 1, 6).translate(0, 0.5, 0);
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x6b5a48 });
  const leafMat = new THREE.MeshLambertMaterial({ vertexColors: true });
  const crownGeos = [
    blobGeometry(detail, [[0, 0.68, 0, 0.3, 1.05], [0.14, 0.52, 0.08, 0.22, 0.9], [-0.13, 0.56, -0.1, 0.22, 0.9]]),
    blobGeometry(detail, [[0, 0.66, 0, 0.22, 1.5], [0.05, 0.45, -0.05, 0.19, 1.0]]),
    blobGeometry(detail, [[0, 0.72, 0, 0.27, 0.9], [-0.18, 0.58, 0.1, 0.2, 0.85], [0.17, 0.6, -0.06, 0.21, 0.85], [0, 0.48, 0.12, 0.17, 0.8]]),
  ];

  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, trees.length);
  const buckets = crownGeos.map(() => []);
  trees.forEach((t, i) => {
    t.variant = Math.floor(rng() * crownGeos.length);
    t.rot = rng() * Math.PI * 2;
    t.y = heightAt(t.x, t.z);
    dummy.position.set(t.x, t.y - 0.1, t.z);
    dummy.rotation.set(0, t.rot, 0);
    dummy.scale.set(t.h * 0.9, t.h * 0.62, t.h * 0.9);
    dummy.updateMatrix();
    trunks.setMatrixAt(i, dummy.matrix);
    buckets[t.variant].push(t);
  });
  group.add(trunks);

  buckets.forEach((bucket, v) => {
    const mesh = new THREE.InstancedMesh(crownGeos[v], leafMat, bucket.length);
    bucket.forEach((t, i) => {
      const w = t.h * (0.85 + rng() * 0.3);
      dummy.position.set(t.x, t.y, t.z);
      dummy.rotation.set(0, t.rot, 0);
      dummy.scale.set(w, t.h, w);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      color.setHSL(0.24 + rng() * 0.07, 0.34 + rng() * 0.16, 0.3 + rng() * 0.1);
      mesh.setColorAt(i, color);
    });
    group.add(mesh);
  });

  // --- Gras ---
  const bladeGeo = (() => {
    const pos = [];
    const col = [];
    const nor = [];
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI + 0.3;
      const ox = Math.cos(a * 2.3) * 0.07;
      const oz = Math.sin(a * 1.7) * 0.07;
      const w = 0.035;
      const lean = 0.12;
      pos.push(
        ox - Math.cos(a) * w, 0, oz - Math.sin(a) * w,
        ox + Math.cos(a) * w, 0, oz + Math.sin(a) * w,
        ox + Math.sin(a) * lean, 0.7 + k * 0.1, oz + Math.cos(a) * lean,
      );
      col.push(0.55, 0.6, 0.5, 0.55, 0.6, 0.5, 1.1, 1.12, 0.95);
      nor.push(0, 1, 0, 0, 1, 0, 0, 1, 0);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    return g;
  })();

  const grassMat = addWind(
    new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }),
    0.16,
  );
  const grassCount = mobile ? 45000 : 110000;
  const grass = new THREE.InstancedMesh(bladeGeo, grassMat, grassCount);
  let n = 0;
  for (let tries = 0; n < grassCount && tries < grassCount * 4; tries++) {
    // Voorlopig het dichtst rond Gwens plek; verder weg dunner.
    const a = rng() * Math.PI * 2;
    const r = Math.pow(rng(), 1.25) * 260;
    const x = WORLD.gwen.x + Math.cos(a) * r;
    const z = WORLD.gwen.z + Math.sin(a) * r;
    if (cover('walk', x, z) < 0.5 || cover('path', x, z) > 0.15 || cover('mown', x, z) > 0.2) continue;
    const h = heightAt(x, z);
    if (h < 0.1 || onBridge(x, z, 0.3)) continue;
    const tall = fbm(x * 0.08 + 9, z * 0.08, 2);
    const s = 0.3 + tall * 0.45 + rng() * 0.2;
    dummy.position.set(x, h - 0.02, z);
    dummy.rotation.set(0, rng() * 6.28, 0);
    dummy.scale.set(s * 1.5, s * 0.8, s * 1.5);
    dummy.updateMatrix();
    grass.setMatrixAt(n, dummy.matrix);
    color.setHSL(0.2 + rng() * 0.09, 0.36 + rng() * 0.18, 0.36 + rng() * 0.14);
    grass.setColorAt(n, color);
    n++;
  }
  grass.count = n;
  group.add(grass);

  // --- Oevervegetatie ---
  const reedMat = addWind(
    new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }),
    0.05,
  );
  const reedCount = mobile ? 6000 : 14000;
  const reeds = new THREE.InstancedMesh(bladeGeo, reedMat, reedCount);
  n = 0;
  for (let tries = 0; n < reedCount && tries < reedCount * 120; tries++) {
    const a = rng() * Math.PI * 2;
    const r = Math.sqrt(rng()) * 320;
    const x = WORLD.gwen.x + Math.cos(a) * r;
    const z = WORLD.gwen.z + Math.sin(a) * r;
    if (cover('site', x, z) < 0.5) continue;
    const h = heightAt(x, z);
    // Rietkragen in de ondiepe oeverzone (ontwerp: 0 tot 0,3 m onder water).
    if (h > 0.15 || h < -0.4 || onBridge(x, z, 0.8)) continue;
    if (fbm(x * 0.09, z * 0.09, 2) < 0.5) continue;
    const s = 1.3 + rng() * 1.1;
    dummy.position.set(x, Math.max(h, -0.25), z);
    dummy.rotation.set(0, rng() * 6.28, 0);
    dummy.scale.set(s * 0.8, s, s * 0.8);
    dummy.updateMatrix();
    reeds.setMatrixAt(n, dummy.matrix);
    color.setHSL(0.15 + rng() * 0.08, 0.3 + rng() * 0.15, 0.4 + rng() * 0.12);
    reeds.setColorAt(n, color);
    n++;
  }
  reeds.count = n;
  group.add(reeds);

  // --- Bloemen in het gras ---
  const flowerCount = mobile ? 9000 : 22000;
  const fpos = new Float32Array(flowerCount * 3);
  const fcol = new Float32Array(flowerCount * 3);
  const palette = [0xffffff, 0xfff3c4, 0xf4d24a, 0xf4d24a, 0xc9a3e0, 0xf0b6c8, 0xffffff];
  n = 0;
  for (let tries = 0; n < flowerCount && tries < flowerCount * 8; tries++) {
    const a = rng() * 6.28;
    const r = Math.pow(rng(), 1.1) * 300;
    const x = WORLD.gwen.x + Math.cos(a) * r;
    const z = WORLD.gwen.z + Math.sin(a) * r;
    if (cover('walk', x, z) < 0.5 || cover('path', x, z) > 0.1 || cover('mown', x, z) > 0.2) continue;
    // Kruidenrijk grasland bloeit het meest; in het bos veel minder.
    const inBos = cover('bos', x, z);
    if (fbm(x * 0.045 + 3, z * 0.045 + 8, 3) < 0.44 + inBos * 0.12) continue;
    const h = heightAt(x, z);
    if (h < 0.2) continue;
    fpos.set([x, h + 0.18 + rng() * 0.3, z], n * 3);
    color.setHex(palette[Math.floor(rng() * palette.length)]);
    fcol.set([color.r, color.g, color.b], n * 3);
    n++;
  }
  const fgeo = new THREE.BufferGeometry();
  fgeo.setAttribute('position', new THREE.BufferAttribute(fpos.subarray(0, n * 3), 3));
  fgeo.setAttribute('color', new THREE.BufferAttribute(fcol.subarray(0, n * 3), 3));
  const flowers = new THREE.Points(
    fgeo,
    new THREE.PointsMaterial({ size: 0.075, vertexColors: true, sizeAttenuation: true }),
  );
  group.add(flowers);

  const shadows = trees.map((t) => ({ x: t.x, z: t.z, r: t.h * 0.42 }));
  return { group, shadows };
}
