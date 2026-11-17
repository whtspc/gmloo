import * as THREE from 'three';
import { WORLD, cover, heightAt, onBridge } from './data.js';
import measuredTrees from './data/trees.json';
import { mulberry32, fbm } from './noise.js';
import { addWind } from './wind.js';
import { buildTrees, leafAtlas } from './trees.js';

// Alles wat groeit. Bomen en struiken staan op hun gemeten plek; de vlakken (bos,
// kruidenrijk grasland, oever) komen van de kaart. Hoe de begroeiing eruitziet is
// afgekeken van foto's van Geestmerloo; soorten zijn nog niet bekend.

const dummy = new THREE.Object3D();
const color = new THREE.Color();

// Bomen en struiken staan op de plek waar ze in 2023 zijn gemeten (AHN5): elke top in
// de hoogtemeting is één boom of struik, met de toen gemeten hoogte. De aanplant is
// van 2019-2020 en sindsdien doorgegroeid; die groei is een schatting.
function grownHeight(h2023) {
  if (h2023 >= 8) return h2023 + 0.5; // oudere bomen groeien nog maar langzaam
  if (h2023 < 1.7) return h2023 + 1; // struiken
  return Math.min(11, h2023 * 1.3 + 2.6); // jonge bomen: ruim een meter per jaar
}

function placeTrees(rng) {
  const list = [];
  const { gwen } = WORLD;
  for (const [x, z, h2023] of measuredTrees) {
    if (cover('path', x, z) > 0.6 || cover('mown', x, z) > 0.6) continue;
    if (Math.hypot(x - gwen.x, z - gwen.z) < 1.2) continue;
    const h = grownHeight(h2023);
    // Soorten zijn niet bekend; vormen staan in groepjes bij elkaar, zoals in een plantvak.
    const patch = fbm(x * 0.03 + 5, z * 0.03 + 2, 2) + (rng() - 0.5) * 0.25;
    const variant = h2023 < 1.7 ? 3 : h > 11 ? 2 : patch < 0.38 ? 0 : patch < 0.56 ? 1 : 2;
    list.push({
      x, z, h, variant,
      y: heightAt(x, z),
      rot: rng() * Math.PI * 2,
      wide: (h > 11 ? 1.25 : 0.85) + rng() * 0.35,
      model: variant * 2 + (rng() < 0.5 ? 0 : 1),
      tint: new THREE.Color().setHSL(0.22 + rng() * 0.1, 0.25, 0.78 + rng() * 0.2),
    });
  }
  return list;
}

export function buildVegetation({ mobile, renderer }) {
  const rng = mulberry32(WORLD.seed);
  const group = new THREE.Group();
  const atlas = leafAtlas();
  const treeList = placeTrees(rng);
  const trees = buildTrees({ renderer, trees: treeList, mobile, atlas });
  group.add(trees.group);

  // --- Kruidlaag: breedbladige kruiden onder en tussen de bomen ---
  const herbGeo = (() => {
    const pos = [];
    const uv = [];
    const nor = [];
    const col = [];
    const idx = [];
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * Math.PI + 0.4;
      const cx = Math.cos(a) * 0.3;
      const cz = Math.sin(a) * 0.3;
      const lean = (k - 1) * 0.12;
      const base = pos.length / 3;
      pos.push(-cx, 0, -cz, cx, 0, cz, cx + lean, 0.55, cz + lean, -cx + lean, 0.55, -cz + lean);
      uv.push(0.005, 0.995, 0.495, 0.995, 0.495, 0.505, 0.005, 0.505); // groot blad
      nor.push(0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0);
      col.push(0.6, 0.62, 0.55, 0.6, 0.62, 0.55, 1, 1, 1, 1, 1, 1);
      idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(idx);
    return g;
  })();
  const herbMat = addWind(
    new THREE.MeshLambertMaterial({ map: atlas, vertexColors: true, alphaTest: 0.45, side: THREE.DoubleSide }),
    0.05,
  );
  const herbCount = mobile ? 14000 : 36000;
  const herbs = new THREE.InstancedMesh(herbGeo, herbMat, herbCount);
  let n = 0;
  for (let tries = 0; n < herbCount && tries < herbCount * 6; tries++) {
    const a = rng() * Math.PI * 2;
    const r = Math.pow(rng(), 1.2) * 220;
    const x = WORLD.gwen.x + Math.cos(a) * r;
    const z = WORLD.gwen.z + Math.sin(a) * r;
    if (cover('walk', x, z) < 0.5 || cover('path', x, z) > 0.1 || cover('mown', x, z) > 0.15) continue;
    // Vooral in het bos; in het grasland in plukken.
    const inBos = cover('bos', x, z);
    if (fbm(x * 0.11 + 20, z * 0.11, 2) < 0.66 - inBos * 0.16) continue;
    const h = heightAt(x, z);
    if (h < 0.2 || onBridge(x, z, 0.3)) continue;
    const s = 0.45 + rng() * 0.6;
    dummy.position.set(x, h - 0.03, z);
    dummy.rotation.set(0, rng() * 6.28, 0);
    dummy.scale.set(s, s * (0.7 + rng() * 0.5), s);
    dummy.updateMatrix();
    herbs.setMatrixAt(n, dummy.matrix);
    color.setHSL(0.2 + rng() * 0.1, 0.25, 0.8 + rng() * 0.2);
    herbs.setColorAt(n, color);
    n++;
  }
  herbs.count = n;
  group.add(herbs);

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
  n = 0;
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
    const open = 1 - cover('bos', x, z);
    const s = 0.3 + tall * (0.45 + open * 0.35) + rng() * 0.2;
    dummy.position.set(x, h - 0.02, z);
    dummy.rotation.set(0, rng() * 6.28, 0);
    dummy.scale.set(s * 1.5, s * 0.8, s * 1.5);
    dummy.updateMatrix();
    grass.setMatrixAt(n, dummy.matrix);
    // In het open grasland gaat het hoge gras naar goudgeel.
    color.setHSL(0.2 + rng() * 0.09 - open * tall * 0.08, 0.36 + rng() * 0.18, 0.36 + rng() * 0.14 + open * tall * 0.1);
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
  // Kleuren van de bloemen op de foto's: schermbloemen en duizendblad (wit), korenbloem
  // (blauw), klaproos (oranjerood), kaasjeskruid (roze), distel en wikke (paars), geel.
  const palette = [0xffffff, 0xffffff, 0xfbf6e0, 0x5d7fe6, 0x5d7fe6, 0xe9552b, 0xf3b9cf, 0xb58ad6, 0xf2d04a];
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
    new THREE.PointsMaterial({ size: 0.085, vertexColors: true, sizeAttenuation: true }),
  );
  group.add(flowers);

  const shadows = treeList.map((t) => ({ x: t.x, z: t.z, r: t.variant === 3 ? t.h * 0.7 : t.h * 0.32 }));
  return { group, shadows, update: trees.update };
}
