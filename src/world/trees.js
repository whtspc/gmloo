import * as THREE from 'three';
import { mulberry32, noise2 } from './noise.js';
import { addWind } from './wind.js';
import { SKY } from './sky.js';

// Jonge bomen en struiken zoals ze er op Geestmerloo staan (aanplant 2019-2020):
// rank, dunne stam, open kroon waar je doorheen kijkt. Elke boom heeft echte takken
// en blad. Soorten zijn nog niet bekend; de vormen zijn afgekeken van foto's:
// een berkachtige met lichte stam, een opgaande met rond blad, een bredere, en een
// meerstammige struik met rode bessen.

// ---------- Blad ----------

// Vier soorten twijgjes met blad in één afbeelding (2 x 2).
export function leafAtlas() {
  const S = 512;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const ctx = c.getContext('2d');
  const rng = mulberry32(31);
  const cells = [
    { n: 26, len: 20, wid: 12, hue: 78, sat: 42, lum: 40 }, // klein, licht blad
    { n: 18, len: 30, wid: 24, hue: 96, sat: 38, lum: 33 }, // rond blad
    { n: 14, len: 44, wid: 30, hue: 92, sat: 36, lum: 42 }, // groot blad / kruiden
    { n: 16, len: 26, wid: 15, hue: 70, sat: 40, lum: 36, berries: 14 }, // struik met bessen
  ];
  cells.forEach((cell, i) => {
    const ox = (i % 2) * 256;
    const oy = Math.floor(i / 2) * 256;
    ctx.save();
    ctx.beginPath();
    ctx.rect(ox + 2, oy + 2, 252, 252);
    ctx.clip();
    ctx.translate(ox + 128, oy + 128);
    // twijgjes
    ctx.strokeStyle = '#5b4a38';
    ctx.lineCap = 'round';
    const tips = [];
    for (let k = 0; k < 4; k++) {
      const a = -Math.PI / 2 + (k - 1.5) * 0.55 + (rng() - 0.5) * 0.3;
      const L = 80 + rng() * 34;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(0, 112);
      const mx = Math.cos(a) * L * 0.5 + (rng() - 0.5) * 20;
      const my = 112 + Math.sin(a) * L * 1.0;
      const ex = Math.cos(a) * L;
      const ey = 112 + Math.sin(a) * L * 1.9;
      ctx.quadraticCurveTo(mx, my, ex, ey);
      ctx.stroke();
      for (let t = 0.25; t <= 1; t += 0.75 / (cell.n / 4)) {
        const u = 1 - t;
        tips.push([u * u * 0 + 2 * u * t * mx + t * t * ex, u * u * 112 + 2 * u * t * my + t * t * ey, a]);
      }
    }
    for (const [x, y, a] of tips) {
      const rot = a + (rng() < 0.5 ? -1 : 1) * (0.6 + rng() * 0.7);
      const len = cell.len * (0.75 + rng() * 0.5);
      const wid = cell.wid * (0.75 + rng() * 0.5);
      const yellow = rng() < 0.12 ? 22 : 0;
      ctx.fillStyle = `hsl(${cell.hue - yellow + (rng() - 0.5) * 16}, ${cell.sat + rng() * 14}%, ${cell.lum + rng() * 14}%)`;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(rot);
      ctx.beginPath();
      ctx.ellipse(len / 2, 0, len / 2, wid / 2, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(30,50,20,0.35)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(len, 0);
      ctx.stroke();
      ctx.restore();
    }
    for (let b = 0; b < (cell.berries ?? 0); b++) {
      const [x, y] = tips[Math.floor(rng() * tips.length)];
      ctx.fillStyle = `hsl(${2 + rng() * 10}, 78%, ${38 + rng() * 12}%)`;
      ctx.beginPath();
      ctx.arc(x + (rng() - 0.5) * 22, y + (rng() - 0.5) * 22, 4.5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  });

  // Doorzichtige pixels een bladkleur geven, anders krijgen randen een donker randje.
  const img = ctx.getImageData(0, 0, S, S);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] < 10) {
      d[i] = 78;
      d[i + 1] = 104;
      d[i + 2] = 48;
    }
  }
  const tex = new THREE.DataTexture(new Uint8Array(d.buffer), S, S, THREE.RGBAFormat);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  return tex;
}

// ---------- Vorm ----------

const VARIANTS = [
  // berkachtig: lichte stam, fijne takken die iets doorhangen
  { H: 8, trunkR: 0.065, birch: true, branches: 16, from: 0.3, spread: 0.3, lift: -0.12, cell: 0, card: 0.75, lean: 0.5 },
  // opgaand, rond blad
  { H: 7.5, trunkR: 0.08, branches: 15, from: 0.25, spread: 0.3, lift: 0.3, cell: 1, card: 0.85, lean: 0.3 },
  // breder en voller
  { H: 6.5, trunkR: 0.09, branches: 17, from: 0.22, spread: 0.42, lift: 0.18, cell: 1, card: 0.95, lean: 0.4 },
  // meerstammige struik met bessen
  { H: 3, trunkR: 0.03, shrub: true, branches: 7, from: 0, spread: 0.75, lift: 0.5, cell: 3, card: 0.6, lean: 0 },
];

const v3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

function tube(out, pts, radii, sides, colorAt) {
  const base = out.pos.length / 3;
  const up = v3(0, 1, 0);
  for (let i = 0; i < pts.length; i++) {
    const t = pts[Math.min(i + 1, pts.length - 1)].clone().sub(pts[Math.max(i - 1, 0)]).normalize();
    const a = Math.abs(t.y) > 0.95 ? v3(1, 0, 0).cross(t).normalize() : up.clone().cross(t).normalize();
    const b = t.clone().cross(a);
    const col = colorAt(pts[i]);
    for (let s = 0; s < sides; s++) {
      const ang = (s / sides) * Math.PI * 2;
      const n = a.clone().multiplyScalar(Math.cos(ang)).addScaledVector(b, Math.sin(ang));
      out.pos.push(pts[i].x + n.x * radii[i], pts[i].y + n.y * radii[i], pts[i].z + n.z * radii[i]);
      out.nor.push(n.x, n.y, n.z);
      out.col.push(col[0], col[1], col[2]);
    }
  }
  for (let i = 0; i < pts.length - 1; i++) {
    for (let s = 0; s < sides; s++) {
      const p = base + i * sides + s;
      const q = base + i * sides + ((s + 1) % sides);
      out.idx.push(p, q, p + sides, q, q + sides, p + sides);
    }
  }
}

function card(out, at, size, rng, cell, center) {
  const n = v3(rng() - 0.5, (rng() - 0.5) * 0.9, rng() - 0.5).normalize();
  const u = v3(rng() - 0.5, rng() - 0.5, rng() - 0.5).cross(n).normalize().multiplyScalar(size / 2);
  const w = n.clone().cross(u).normalize().multiplyScalar(size / 2);
  const base = out.pos.length / 3;
  // Zachte belichting: de normaal wijst van het hart van de kroon naar buiten.
  const sn = at.clone().sub(center).normalize().multiplyScalar(0.7).add(v3(0, 0.6, 0)).normalize();
  const cx = (cell % 2) * 0.5;
  const cy = Math.floor(cell / 2) * 0.5;
  const shade = 0.72 + rng() * 0.4;
  [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(([a, b]) => {
    out.pos.push(at.x + u.x * a + w.x * b, at.y + u.y * a + w.y * b, at.z + u.z * a + w.z * b);
    out.nor.push(sn.x, sn.y, sn.z);
    out.uv.push(cx + (a > 0 ? 0.495 : 0.005), cy + (b > 0 ? 0.495 : 0.005));
    out.col.push(shade, shade, shade);
  });
  out.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
}

function makeTree(variant, seed) {
  const P = VARIANTS[variant];
  const rng = mulberry32(seed);
  const wood = { pos: [], nor: [], col: [], idx: [] };
  const leaf = { pos: [], nor: [], uv: [], col: [], idx: [] };
  const bark = (p) => {
    if (!P.birch) {
      const v = 0.85 + noise2(p.y * 3, p.x * 5) * 0.3;
      return [0.25 * v, 0.215 * v, 0.18 * v];
    }
    // lichte bast met donkere vlekken, bovenin donkerder
    const dark = noise2(p.y * 6 + 3, p.x * 9) > 0.72 || p.y > P.H * 0.75;
    return dark ? [0.2, 0.18, 0.16] : [0.62, 0.6, 0.55];
  };
  const center = v3(0, P.H * 0.62, 0);

  // stam(men)
  const stems = [];
  const nStems = P.shrub ? 1 : 1;
  for (let s = 0; s < nStems; s++) {
    const pts = [];
    const radii = [];
    const leanA = rng() * 6.28;
    const top = P.shrub ? P.H * 0.25 : P.H;
    for (let k = 0; k <= 8; k++) {
      const t = k / 8;
      pts.push(v3(Math.cos(leanA) * t * t * P.lean + (rng() - 0.5) * 0.06, t * top, Math.sin(leanA) * t * t * P.lean + (rng() - 0.5) * 0.06));
      radii.push(P.trunkR * (1 - t * 0.82) * (k === 0 ? 1.35 : 1));
    }
    tube(wood, pts, radii, P.shrub ? 5 : 7, bark);
    stems.push({ pts, radii });
  }
  const trunkAt = (t) => {
    const { pts, radii } = stems[0];
    const f = t * 8;
    const i = Math.min(7, Math.floor(f));
    return { p: pts[i].clone().lerp(pts[i + 1], f - i), r: radii[i] };
  };

  // takken
  for (let b = 0; b < P.branches; b++) {
    const t = P.shrub ? rng() * 0.6 : P.from + (1 - P.from) * Math.pow((b + rng()) / P.branches, 0.85) * 0.97;
    const { p: start, r } = trunkAt(t);
    const az = b * 2.399 + rng() * 0.6;
    const tilt = P.shrub ? 0.35 + rng() * 0.5 : 1.05 - t * 0.55 + (rng() - 0.5) * 0.25; // hoek t.o.v. verticaal
    const len = P.H * P.spread * (P.shrub ? 1.1 + rng() * 0.5 : 1.15 - t * 0.75) * (0.8 + rng() * 0.4);
    const dir = v3(Math.cos(az) * Math.sin(tilt), Math.cos(tilt), Math.sin(az) * Math.sin(tilt));
    const pts = [start.clone()];
    const radii = [Math.max(0.012, r * (P.shrub ? 0.9 : 0.5))];
    const p = start.clone();
    const N = 5;
    for (let k = 1; k <= N; k++) {
      p.addScaledVector(dir, len / N);
      dir.y += (P.lift * (P.shrub && k > 3 ? -1.2 : 1)) / N + (rng() - 0.5) * 0.1;
      dir.x += (rng() - 0.5) * 0.16;
      dir.z += (rng() - 0.5) * 0.16;
      dir.normalize();
      pts.push(p.clone());
      radii.push(radii[0] * (1 - (k / N) * 0.8));
    }
    tube(wood, pts, radii, 4, bark);

    // twijgen met blad
    for (let k = 2; k <= N; k++) {
      const at = pts[k];
      const twigs = k === N ? 1 : 2;
      for (let j = 0; j < twigs; j++) {
        const d = pts[k].clone().sub(pts[k - 1]).normalize();
        d.x += (rng() - 0.5) * 1.6;
        d.z += (rng() - 0.5) * 1.6;
        d.y += P.birch ? -0.5 - rng() * 0.5 : (rng() - 0.3) * 0.9;
        d.normalize();
        const tl = len * (0.22 + rng() * 0.2);
        const mid = at.clone().addScaledVector(d, tl * 0.5);
        if (P.birch) d.y -= 0.5;
        const end = mid.clone().addScaledVector(d.normalize(), tl * 0.5);
        tube(wood, [at.clone(), mid, end], [radii[k] * 0.6 + 0.003, 0.005, 0.002], 3, bark);
        card(leaf, mid, P.card * (0.8 + rng() * 0.4), rng, P.cell, center);
        card(leaf, end, P.card * (0.8 + rng() * 0.4), rng, P.cell, center);
      }
      if (k >= 3) card(leaf, at, P.card * (0.8 + rng() * 0.4), rng, P.cell, center);
    }
  }
  // topje
  if (!P.shrub) {
    const tip = stems[0].pts[8];
    for (let k = 0; k < 4; k++) {
      card(leaf, tip.clone().add(v3((rng() - 0.5) * 0.5, -rng() * 0.6, (rng() - 0.5) * 0.5)), P.card, rng, P.cell, center);
    }
  }

  const geo = (o, uv) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(o.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(o.nor, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(o.col, 3));
    if (uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(o.uv, 2));
    g.setIndex(o.idx);
    return g;
  };
  return { wood: geo(wood), leaf: geo(leaf, true), H: P.H };
}

// ---------- Plaatsen, met een eenvoudige versie voor veraf ----------

// trees: [{x, y, z, h, variant, rot}]
export function buildTrees({ renderer, trees, mobile, atlas }) {
  const group = new THREE.Group();
  const woodMat = addWind(new THREE.MeshLambertMaterial({ vertexColors: true }), 0.006, 1);
  const leafMat = addWind(
    new THREE.MeshLambertMaterial({ map: atlas, vertexColors: true, alphaTest: 0.45, side: THREE.DoubleSide }),
    0.006,
    1,
  );

  // Per soort twee exemplaren, zodat niet elke boom hetzelfde is.
  const MODELS = VARIANTS.flatMap((_, v) => [0, 1].map((k) => ({ v, ...makeTree(v, 100 + v * 10 + k) })));

  // Foto van elk model voor de bomen veraf.
  const snapScene = new THREE.Scene();
  snapScene.add(new THREE.HemisphereLight(0xdcebff, 0x7d8a5a, 1.5));
  const sun = new THREE.DirectionalLight(0xfff1d8, 2.1);
  sun.position.copy(SKY.sunDir).multiplyScalar(100);
  snapScene.add(sun);
  const size = mobile ? 256 : 512;
  const prevTarget = renderer.getRenderTarget();
  const prevColor = renderer.getClearColor(new THREE.Color());
  const prevAlpha = renderer.getClearAlpha();
  renderer.setClearColor(0x4e6830, 0);

  const nearCap = mobile ? 260 : 900;
  const nearDist = mobile ? 42 : 85;
  const models = MODELS.map((m) => {
    const mine = trees.filter((t) => t.model === MODELS.indexOf(m));
    const span = m.H * 1.24;
    const rt = new THREE.WebGLRenderTarget(size, size, { generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter });
    const w = new THREE.Mesh(m.wood, new THREE.MeshLambertMaterial({ vertexColors: true }));
    const l = new THREE.Mesh(m.leaf, new THREE.MeshLambertMaterial({ map: atlas, vertexColors: true, alphaTest: 0.45, side: THREE.DoubleSide }));
    snapScene.add(w, l);
    const cam = new THREE.OrthographicCamera(-span / 2, span / 2, span * 0.98, -span * 0.02, 0.1, 100);
    cam.position.set(0, 0, 40);
    cam.lookAt(0, 0, 0);
    cam.position.y = 0;
    cam.rotation.set(0, 0, 0);
    renderer.setRenderTarget(rt);
    renderer.clear();
    renderer.render(snapScene, cam);
    snapScene.remove(w, l);

    const quad = new THREE.PlaneGeometry(span, span).translate(0, span * 0.48, 0);
    const cross = quad.clone().rotateY(Math.PI / 2);
    const pos = new Float32Array([...quad.attributes.position.array, ...cross.attributes.position.array]);
    const uv = new Float32Array([...quad.attributes.uv.array, ...cross.attributes.uv.array]);
    const far = new THREE.BufferGeometry();
    far.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    far.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    far.setIndex([...quad.index.array, ...Array.from(cross.index.array, (i) => i + 4)]);

    const cap = Math.max(1, Math.min(mine.length, nearCap));
    const wood = new THREE.InstancedMesh(m.wood, woodMat, cap);
    const leaf = new THREE.InstancedMesh(m.leaf, leafMat, cap);
    const farMesh = new THREE.InstancedMesh(
      far,
      new THREE.MeshBasicMaterial({ map: rt.texture, alphaTest: 0.4, side: THREE.DoubleSide }),
      Math.max(1, mine.length),
    );
    for (const mesh of [wood, leaf, farMesh]) {
      mesh.frustumCulled = false;
      mesh.count = 0;
      group.add(mesh);
    }
    const dummy = new THREE.Object3D();
    for (const t of mine) {
      const s = t.h / m.H;
      dummy.position.set(t.x, t.y - 0.05, t.z);
      dummy.rotation.set(0, t.rot, 0);
      dummy.scale.set(s * t.wide, s, s * t.wide);
      dummy.updateMatrix();
      t.matrix = dummy.matrix.clone();
    }
    return { mine, wood, leaf, farMesh, cap };
  });

  renderer.setRenderTarget(prevTarget);
  renderer.setClearColor(prevColor, prevAlpha);

  const last = new THREE.Vector3(1e9, 0, 0);
  function update(camera) {
    if (last.distanceToSquared(camera.position) < 9) return;
    last.copy(camera.position);
    const r2 = nearDist * nearDist;
    for (const m of models) {
      let near = 0;
      let far = 0;
      for (const t of m.mine) {
        const dx = t.x - camera.position.x;
        const dz = t.z - camera.position.z;
        if (dx * dx + dz * dz < r2 && near < m.cap) {
          m.wood.setMatrixAt(near, t.matrix);
          m.leaf.setMatrixAt(near, t.matrix);
          m.leaf.setColorAt(near, t.tint);
          near++;
        } else {
          m.farMesh.setMatrixAt(far, t.matrix);
          m.farMesh.setColorAt(far, t.tint);
          far++;
        }
      }
      m.wood.count = m.leaf.count = near;
      m.farMesh.count = far;
      m.wood.instanceMatrix.needsUpdate = true;
      m.leaf.instanceMatrix.needsUpdate = true;
      m.farMesh.instanceMatrix.needsUpdate = true;
      if (m.leaf.instanceColor) m.leaf.instanceColor.needsUpdate = true;
      if (m.farMesh.instanceColor) m.farMesh.instanceColor.needsUpdate = true;
    }
  }

  return { group, update, modelsPerVariant: 2, variants: VARIANTS };
}
