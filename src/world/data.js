// De wereld komt uit echte bronnen (zie README en tools/):
//   - vlakken (water, pad, bos, kruidenrijk grasland): digitale kaart van Geestmerloo
//   - hoogtes: Actueel Hoogtebestand Nederland (AHN, via PDOK)
//   - Gwens plek: g.E515 op de digitale kaart = de oorsprong (0, 0)
// Eenheden: meters. x = oost, z = zuid, y = omhoog; y = 0 is het waterpeil.
import coverUrl from './data/cover.png';
import maskUrl from './data/mask.png';
import heightUrl from './data/height.png';
import meta from './data/meta.json';

export const WORLD = {
  ...meta,
  width: meta.x1 - meta.x0,
  depth: meta.z1 - meta.z0,
  waterLevel: 0,
  seed: 515,
  gwen: { name: 'Gwen', code: 'g.E515', x: 0, z: 0 },
};

async function pixels(url) {
  const img = new Image();
  img.src = url;
  await img.decode();
  const c = document.createElement('canvas');
  c.width = img.naturalWidth;
  c.height = img.naturalHeight;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0);
  return ctx.getImageData(0, 0, c.width, c.height);
}

// Rasters: per cel een waarde 0..1 (of meters voor de hoogte).
export const grid = {};

export async function loadWorld() {
  const [cover, mask, height] = await Promise.all([coverUrl, maskUrl, heightUrl].map(pixels));
  const split = (img, channel) => {
    const out = new Uint8Array(img.width * img.height);
    for (let i = 0; i < out.length; i++) out[i] = img.data[i * 4 + channel];
    return out;
  };
  grid.nx = cover.width;
  grid.nz = cover.height;
  grid.path = split(cover, 0);
  grid.bos = split(cover, 1);
  grid.water = split(cover, 2);
  grid.walk = split(mask, 0);
  grid.site = split(mask, 1);
  grid.road = split(mask, 2);

  grid.hx = height.width;
  grid.hz = height.height;
  grid.height = new Float32Array(grid.hx * grid.hz);
  grid.canopy = new Float32Array(grid.hx * grid.hz);
  for (let i = 0; i < grid.height.length; i++) {
    const v = height.data[i * 4] * 256 + height.data[i * 4 + 1];
    grid.height[i] = (v / 65535) * meta.heightRange + meta.heightOffset;
    grid.canopy[i] = height.data[i * 4 + 2] / 10;
  }
}

function bilinear(arr, nx, nz, fx, fz) {
  const cx = Math.min(nx - 1.001, Math.max(0, fx));
  const cz = Math.min(nz - 1.001, Math.max(0, fz));
  const ix = Math.floor(cx);
  const iz = Math.floor(cz);
  const tx = cx - ix;
  const tz = cz - iz;
  const k = iz * nx + ix;
  const a = arr[k] + (arr[k + 1] - arr[k]) * tx;
  const b = arr[k + nx] + (arr[k + nx + 1] - arr[k + nx]) * tx;
  return a + (b - a) * tz;
}

// Waarde 0..1 van een vlak op plek (x, z).
export function cover(name, x, z) {
  const fx = (x - meta.x0) / meta.cell - 0.5;
  const fz = (z - meta.z0) / meta.cell - 0.5;
  return bilinear(grid[name], grid.nx, grid.nz, fx, fz) / 255;
}

function coarse(arr, x, z) {
  const fx = (x - meta.x0) / meta.heightCell - 0.5;
  const fz = (z - meta.z0) / meta.heightCell - 0.5;
  return bilinear(arr, grid.hx, grid.hz, fx, fz);
}

// Hoogte van het maaiveld (of de bodem van de plas) boven het waterpeil.
export const heightAt = (x, z) => coarse(grid.height, x, z);
// Gemeten hoogte van begroeiing boven het maaiveld (AHN).
export const canopyAt = (x, z) => coarse(grid.canopy, x, z);

export function onBridge(x, z, margin = -0.2) {
  for (const b of meta.bridges) {
    const dx = b.x2 - b.x1;
    const dz = b.z2 - b.z1;
    const len2 = dx * dx + dz * dz;
    const t = ((x - b.x1) * dx + (z - b.z1) * dz) / len2;
    const slack = Math.max(0, margin) / Math.sqrt(len2);
    if (t < -slack || t > 1 + slack) continue;
    const perp = Math.abs((x - b.x1) * dz - (z - b.z1) * dx) / Math.sqrt(len2);
    if (perp < b.width / 2 + margin) return b;
  }
  return null;
}

// Hoogte waar je op loopt: maaiveld, of het brugdek.
export function groundAt(x, z) {
  const h = heightAt(x, z);
  const b = onBridge(x, z);
  return b ? Math.max(h, b.y) : h;
}

// Mag je hier lopen? Alleen op het terrein zelf, niet in het water.
export function walkable(x, z) {
  if (onBridge(x, z)) return true;
  return cover('walk', x, z) > 0.5 && heightAt(x, z) > -0.05;
}
