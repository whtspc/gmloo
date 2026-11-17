import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { heightAt } from './data.js';
import objects from './data/objects.json';

// Bankjes, picknicktafels en gebouwen op hun plek uit OpenStreetMap.
// Gebouwen zijn eenvoudige volumes: de plattegrond uit OSM, opgetrokken tot de in
// 2023 gemeten goot- en nokhoogte. Kleur en materiaal zijn nog niet bekend.

const box = (w, h, d, x, y, z) => new THREE.BoxGeometry(w, h, d).translate(x, y, z);

function benchGeometry(backrest) {
  const parts = [];
  for (let i = 0; i < 3; i++) parts.push(box(1.8, 0.05, 0.13, 0, 0.45, -0.15 + i * 0.15));
  for (const x of [-0.72, 0.72]) parts.push(box(0.08, 0.45, 0.42, x, 0.225, 0));
  if (backrest) {
    for (let i = 0; i < 2; i++) parts.push(box(1.8, 0.13, 0.04, 0, 0.68 + i * 0.17, -0.27 - i * 0.03));
    for (const x of [-0.72, 0.72]) parts.push(box(0.07, 0.5, 0.06, x, 0.7, -0.3));
  }
  return mergeGeometries(parts);
}

function tableGeometry() {
  const parts = [box(1.8, 0.06, 0.75, 0, 0.74, 0)];
  for (const z of [-0.62, 0.62]) parts.push(box(1.8, 0.05, 0.26, 0, 0.44, z));
  for (const x of [-0.7, 0.7]) {
    parts.push(box(0.08, 0.72, 0.08, x, 0.36, -0.25), box(0.08, 0.72, 0.08, x, 0.36, 0.25));
    parts.push(box(0.08, 0.06, 1.5, x, 0.4, 0));
  }
  return mergeGeometries(parts);
}

function place(geometry, material, items) {
  const mesh = new THREE.InstancedMesh(geometry, material, Math.max(1, items.length));
  const dummy = new THREE.Object3D();
  items.forEach((it, i) => {
    dummy.position.set(it.x, heightAt(it.x, it.z), it.z);
    dummy.rotation.set(0, it.angle, 0);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
  });
  mesh.count = items.length;
  return mesh;
}

function buildingsGeometry() {
  const pos = [];
  const col = [];
  const WALL = [0.5, 0.46, 0.42];
  const ROOF = [0.2, 0.2, 0.22];
  const tri = (a, b, c, color) => {
    pos.push(...a, ...b, ...c);
    col.push(...color, ...color, ...color);
  };
  const quad = (a, b, c, d, color) => {
    tri(a, b, c, color);
    tri(a, c, d, color);
  };

  for (const b of objects.buildings) {
    const P = b.pts;
    const y0 = b.base - 0.4;
    const gable = P.length === 4 && b.ridge - b.eave > 0.8;
    const top = b.base + (gable ? b.eave : b.eave + (b.ridge - b.eave) * 0.6);
    for (let i = 0; i < P.length; i++) {
      const [x1, z1] = P[i];
      const [x2, z2] = P[(i + 1) % P.length];
      quad([x1, y0, z1], [x2, y0, z2], [x2, top, z2], [x1, top, z1], WALL);
    }
    if (gable) {
      // Zadeldak met de nok in de lengterichting.
      const len = (i) => Math.hypot(P[(i + 1) % 4][0] - P[i][0], P[(i + 1) % 4][1] - P[i][1]);
      const s = len(0) >= len(1) ? 1 : 0; // korte zijden: s→s+1 en s+2→s+3
      const q = (i) => P[(i + s) % 4];
      const mid = (a, c) => [(a[0] + c[0]) / 2, b.base + b.ridge, (a[1] + c[1]) / 2];
      const at = (p) => [p[0], top, p[1]];
      const r1 = mid(q(0), q(1));
      const r2 = mid(q(2), q(3));
      quad(at(q(1)), at(q(2)), r2, r1, ROOF);
      quad(at(q(3)), at(q(0)), r1, r2, ROOF);
      tri(at(q(0)), at(q(1)), r1, WALL);
      tri(at(q(2)), at(q(3)), r2, WALL);
    } else {
      const shape = new THREE.Shape(P.map(([x, z]) => new THREE.Vector2(x, z)));
      const cap = new THREE.ShapeGeometry(shape);
      const p = cap.attributes.position;
      const idx = cap.index.array;
      for (let i = 0; i < idx.length; i += 3) {
        tri(...[0, 1, 2].map((k) => [p.getX(idx[i + k]), top, p.getY(idx[i + k])]), ROOF);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}

export function buildObjects() {
  const group = new THREE.Group();
  const wood = new THREE.MeshLambertMaterial({ color: 0x8f7a60 });
  group.add(
    place(benchGeometry(true), wood, objects.benches.filter((b) => b.backrest)),
    place(benchGeometry(false), wood, objects.benches.filter((b) => !b.backrest)),
    place(tableGeometry(), wood, objects.tables),
    new THREE.Mesh(buildingsGeometry(), new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide })),
  );
  return group;
}
