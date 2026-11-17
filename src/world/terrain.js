import * as THREE from 'three';
import { WORLD, cover, heightAt } from './data.js';
import { fbm, smoothstep, lerp } from './noise.js';

function groundTexture(texel, shadows) {
  const w = Math.round(WORLD.width / texel);
  const h = Math.round(WORLD.depth / texel);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(w, h);
  const d = img.data;

  for (let py = 0; py < h; py++) {
    const z = WORLD.z0 + (py + 0.5) * texel;
    for (let px = 0; px < w; px++) {
      const x = WORLD.x0 + (px + 0.5) * texel;
      const n1 = fbm(x * 0.05, z * 0.05, 3);
      const n2 = fbm(x * 0.9 + 40, z * 0.9, 2);
      const site = cover('site', x, z);

      // Kruidenrijk grasland: wisselende tinten groen.
      let r = lerp(96, 134, n1) + (n2 - 0.5) * 34;
      let g = lerp(124, 148, n1) + (n2 - 0.5) * 30;
      let b = lerp(56, 70, n1) + (n2 - 0.5) * 16;

      // Bos: donkerdere, ruigere bodem.
      const bos = cover('bos', x, z);
      if (bos > 0.01) {
        r = lerp(r, 74 + (n2 - 0.5) * 30, bos * 0.8);
        g = lerp(g, 98 + (n2 - 0.5) * 28, bos * 0.8);
        b = lerp(b, 46 + (n2 - 0.5) * 14, bos * 0.8);
      }

      // Buiten het terrein: neutraal, we weten daar nog weinig van.
      if (site < 0.99) {
        const t = 1 - site;
        r = lerp(r, 118 + (n1 - 0.5) * 20, t);
        g = lerp(g, 130 + (n1 - 0.5) * 20, t);
        b = lerp(b, 84 + (n1 - 0.5) * 12, t);
      }

      // Weg langs het terrein.
      const road = cover('road', x, z);
      if (road > 0.01) {
        r = lerp(r, 150 + (n2 - 0.5) * 14, road);
        g = lerp(g, 146 + (n2 - 0.5) * 14, road);
        b = lerp(b, 138 + (n2 - 0.5) * 14, road);
      }

      // Gemaaid graspad: kort, lichter en frisser groen dan het gras eromheen.
      const mown = cover('mown', x, z);
      if (mown > 0.01) {
        const t = smoothstep(0.25, 0.75, mown + (n2 - 0.5) * 0.3);
        r = lerp(r, 132 + (n2 - 0.5) * 16, t);
        g = lerp(g, 162 + (n2 - 0.5) * 14, t);
        b = lerp(b, 78 + (n2 - 0.5) * 10, t);
      }

      // Pad: licht, halfverhard.
      const path = cover('path', x, z);
      if (path > 0.01) {
        const t = smoothstep(0.3, 0.7, path + (n2 - 0.5) * 0.25);
        r = lerp(r, 212 + (n2 - 0.5) * 24, t);
        g = lerp(g, 196 + (n2 - 0.5) * 22, t);
        b = lerp(b, 164 + (n2 - 0.5) * 20, t);
      }

      // Oever en bodem van de plas.
      const ht = heightAt(x, z);
      if (ht < 0.45) {
        const t = 1 - smoothstep(0.05, 0.45, ht);
        r = lerp(r, 110, t * 0.75);
        g = lerp(g, 104, t * 0.75);
        b = lerp(b, 78, t * 0.75);
        const deep = 1 - smoothstep(-1.2, -0.05, ht);
        r = lerp(r, 44, deep);
        g = lerp(g, 60, deep);
        b = lerp(b, 58, deep);
      }

      const k = (py * w + px) * 4;
      d[k] = r;
      d[k + 1] = g;
      d[k + 2] = b;
      d[k + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);

  // Zachte schaduw onder bomen.
  ctx.globalCompositeOperation = 'multiply';
  for (const s of shadows) {
    const cx = (s.x - WORLD.x0) / texel;
    const cy = (s.z - WORLD.z0) / texel;
    const rad = Math.max(2, s.r / texel);
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, rad);
    grad.addColorStop(0, 'rgba(104,122,116,1)');
    grad.addColorStop(0.6, 'rgba(160,172,166,1)');
    grad.addColorStop(1, 'rgba(255,255,255,1)');
    ctx.fillStyle = grad;
    ctx.fillRect(cx - rad, cy - rad, rad * 2, rad * 2);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

export function buildTerrain({ mobile, shadows }) {
  const step = mobile ? 3 : 2; // meter per vlakje
  const geo = new THREE.PlaneGeometry(
    WORLD.width,
    WORLD.depth,
    Math.round(WORLD.width / step),
    Math.round(WORLD.depth / step),
  );
  geo.rotateX(-Math.PI / 2);
  geo.translate((WORLD.x0 + WORLD.x1) / 2, 0, (WORLD.z0 + WORLD.z1) / 2);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    pos.setY(i, heightAt(pos.getX(i), pos.getZ(i)));
  }
  geo.computeVertexNormals();
  const mat = new THREE.MeshLambertMaterial({ map: groundTexture(mobile ? 0.6 : 0.4, shadows) });
  const group = new THREE.Group();
  group.add(new THREE.Mesh(geo, mat));

  // Vlak land tot aan de horizon, buiten het gemeten gebied.
  const far = new THREE.Mesh(
    new THREE.CircleGeometry(3000, 48).rotateX(-Math.PI / 2),
    new THREE.MeshLambertMaterial({ color: 0x76835a }),
  );
  far.position.y = -0.4;
  group.add(far);
  return group;
}
