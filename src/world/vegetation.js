import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { WORLD } from './data.js';
import { heightAt, pathDist } from './terrain.js';
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

const dryLand = (x, z, min = 0.3) => heightAt(x, z) > min;

function blobGeometry(rng, parts) {
  const geos = parts.map(([x, y, z, r, sy]) => {
    const g = new THREE.IcosahedronGeometry(r, 2);
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

function placeTrees(rng) {
  const list = [];
  const ok = (x, z) =>
    dryLand(x, z, 0.45) &&
    pathDist(x, z) > 2.6 &&
    Math.hypot(x - WORLD.gwen.x, z - WORLD.gwen.z) > 7 &&
    Math.hypot(x - WORLD.start.x, z - WORLD.start.z) > 4;

  for (const g of WORLD.groves) {
    for (let i = 0, tries = 0; i < g.trees && tries < g.trees * 20; tries++) {
      const a = rng() * Math.PI * 2;
      const r = Math.sqrt(rng()) * g.r;
      const x = g.x + Math.cos(a) * r;
      const z = g.z + Math.sin(a) * r;
      if (!ok(x, z) || list.some((t) => Math.hypot(t.x - x, t.z - z) < 2.4)) continue;
      list.push({ x, z, h: 3.5 + rng() * 5.5, kind: 'tree' });
      i++;
    }
    for (let i = 0, tries = 0; i < g.shrubs && tries < g.shrubs * 20; tries++) {
      const a = rng() * Math.PI * 2;
      const r = (0.55 + rng() * 0.6) * g.r;
      const x = g.x + Math.cos(a) * r;
      const z = g.z + Math.sin(a) * r;
      if (!ok(x, z)) continue;
      list.push({ x, z, h: 0.9 + rng() * 1.4, kind: 'shrub' });
      i++;
    }
  }
  for (let i = 0, tries = 0; i < WORLD.looseTrees && tries < 2000; tries++) {
    const x = (rng() - 0.5) * 2 * WORLD.walkRadius;
    const z = (rng() - 0.5) * 2 * WORLD.walkRadius;
    if (!ok(x, z) || Math.hypot(x, z) < 14) continue;
    list.push({ x, z, h: 3 + rng() * 4.5, kind: 'tree' });
    i++;
  }
  // Bomenrand in de verte, zoals langs de polder.
  for (let i = 0; i < 300; i++) {
    const a = rng() * Math.PI * 2;
    const r = 150 + rng() * 120;
    list.push({ x: Math.cos(a) * r, z: Math.sin(a) * r, h: 9 + rng() * 8, kind: 'tree', far: true });
  }
  return list;
}

export function buildVegetation({ mobile }) {
  const rng = mulberry32(WORLD.seed);
  const group = new THREE.Group();
  const plants = placeTrees(rng);
  const trees = plants.filter((p) => p.kind === 'tree');
  const shrubs = plants.filter((p) => p.kind === 'shrub');

  // --- Bomen ---
  const trunkGeo = new THREE.CylinderGeometry(0.035, 0.06, 1, 6).translate(0, 0.5, 0);
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x6b5a48 });
  const leafMat = new THREE.MeshLambertMaterial({ vertexColors: true });
  const crownGeos = [
    blobGeometry(rng, [[0, 0.68, 0, 0.3, 1.05], [0.14, 0.52, 0.08, 0.22, 0.9], [-0.13, 0.56, -0.1, 0.22, 0.9]]),
    blobGeometry(rng, [[0, 0.66, 0, 0.22, 1.5], [0.05, 0.45, -0.05, 0.19, 1.0]]),
    blobGeometry(rng, [[0, 0.72, 0, 0.27, 0.9], [-0.18, 0.58, 0.1, 0.2, 0.85], [0.17, 0.6, -0.06, 0.21, 0.85], [0, 0.48, 0.12, 0.17, 0.8]]),
  ];

  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, trees.length);
  const buckets = crownGeos.map(() => []);
  trees.forEach((t, i) => {
    t.variant = Math.floor(rng() * crownGeos.length);
    t.rot = rng() * Math.PI * 2;
    t.y = t.far ? WORLD.baseHeight - 0.4 : heightAt(t.x, t.z);
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

  // --- Struiken ---
  const shrubGeo = blobGeometry(rng, [[0, 0.45, 0, 0.5, 0.8], [0.3, 0.35, 0.15, 0.35, 0.8], [-0.28, 0.33, -0.1, 0.33, 0.8]]);
  const shrubMesh = new THREE.InstancedMesh(shrubGeo, leafMat, shrubs.length);
  shrubs.forEach((s, i) => {
    dummy.position.set(s.x, heightAt(s.x, s.z) - 0.05, s.z);
    dummy.rotation.set(0, rng() * 6.28, 0);
    dummy.scale.set(s.h * 1.2, s.h, s.h * 1.2);
    dummy.updateMatrix();
    shrubMesh.setMatrixAt(i, dummy.matrix);
    color.setHSL(0.22 + rng() * 0.08, 0.3 + rng() * 0.15, 0.27 + rng() * 0.09);
    shrubMesh.setColorAt(i, color);
  });
  group.add(shrubMesh);

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
  const grassCount = mobile ? 38000 : 90000;
  const grass = new THREE.InstancedMesh(bladeGeo, grassMat, grassCount);
  let n = 0;
  for (let tries = 0; n < grassCount && tries < grassCount * 3; tries++) {
    // Dichter in het midden, waar je het meest loopt.
    const a = rng() * Math.PI * 2;
    const r = Math.pow(rng(), 0.72) * (WORLD.walkRadius + 10);
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    const h = heightAt(x, z);
    if (h < 0.22 || pathDist(x, z) < WORLD.pathWidth / 2 + 0.1) continue;
    const tall = fbm(x * 0.08 + 9, z * 0.08, 2);
    const s = 0.45 + tall * 0.9 + rng() * 0.3;
    dummy.position.set(x, h - 0.02, z);
    dummy.rotation.set(0, rng() * 6.28, 0);
    dummy.scale.set(s * 1.3, s * 0.75, s * 1.3);
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
  const reedCount = mobile ? 3500 : 8000;
  const reeds = new THREE.InstancedMesh(bladeGeo, reedMat, reedCount);
  n = 0;
  for (let tries = 0; n < reedCount && tries < reedCount * 60; tries++) {
    const x = 15 + rng() * 140;
    const z = -85 + rng() * 145;
    const h = heightAt(x, z);
    if (h > 0.3 || h < -0.35) continue;
    // In plukken, niet als gesloten kraag.
    if (fbm(x * 0.09, z * 0.09, 2) < 0.52) continue;
    if (pathDist(x, z) < 2.5) continue;
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
  for (let tries = 0; n < flowerCount && tries < flowerCount * 6; tries++) {
    let x;
    let z;
    if (tries % 14 === 0) {
      // Iets meer bloemen rond Gwens plek.
      const a = rng() * 6.28;
      const r = Math.sqrt(rng()) * 6;
      x = WORLD.gwen.x + Math.cos(a) * r;
      z = WORLD.gwen.z + Math.sin(a) * r;
    } else {
      const a = rng() * 6.28;
      const r = Math.pow(rng(), 0.7) * WORLD.walkRadius;
      x = Math.cos(a) * r;
      z = Math.sin(a) * r;
      // Bloemen staan in velden bij elkaar.
      if (fbm(x * 0.045 + 3, z * 0.045 + 8, 3) < 0.47) continue;
    }
    const h = heightAt(x, z);
    if (h < 0.35 || pathDist(x, z) < WORLD.pathWidth / 2 + 0.2) continue;
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

  const shadows = plants
    .filter((p) => !p.far)
    .map((p) => ({ x: p.x, z: p.z, r: p.kind === 'tree' ? p.h * 0.42 : p.h * 0.9 }));
  return { group, shadows };
}
