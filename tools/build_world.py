"""Stap 2: maak de wereldgegevens voor de 3D-weergave.

Bronnen:
  - de vlakken (water, pad, bos, kruidenrijk grasland) van de digitale kaart
    van Geestmerloo (classify_map.py), met Gwens plek g.E515 als oorsprong;
  - de gemeten hoogtes van het AHN (PDOK, dtm_05m en dsm_05m), CC-0.

Gebruik: python3 build_world.py <cls.npz> <dtm.npy> <dsm.npy> <uitvoermap>

Wereldassen: x = oost, z = zuid (meters), oorsprong = Gwens plek.
"""
import json
import sys
import numpy as np
from PIL import Image
from scipy import ndimage as ndi

cls_path, dtm_path, dsm_path, out = sys.argv[1:5]

# --- Uitlijning (zie de toelichting in README) ---
MPP = 30 / 82.9375            # meter per kaartpixel (schaalbalk: 30 m = 82,94 px)
THETA = np.deg2rad(-0.45)     # kaartnoord t.o.v. RD-noord
SCALE = 1.0015
GWEN_RD = (113322.5, 521210.75)
AHN_X0, AHN_Y1, AHN_CELL = 112900.0, 521650.0, 0.5

# --- Wereldraster ---
X0, X1, Z0, Z1 = -260, 540, -320, 560
C = 0.5                       # celgrootte vlakken
NX, NZ = int((X1 - X0) / C), int((Z1 - Z0) / C)

cls = np.load(cls_path)['cls']
H, W = cls.shape
cx, cy = W / 2, 80 + (H - 80) / 2   # Gwen staat in het midden van het kaartvenster

zz, xx = np.mgrid[0:NZ, 0:NX].astype(np.float32)
wx = X0 + (xx + 0.5) * C
wz = Z0 + (zz + 0.5) * C
px, py = cx + wx / MPP, cy + wz / MPP


def from_map(mask):
    # Vloeiend bemonsteren, zodat randen van paden en oevers niet kartelen.
    m = ndi.gaussian_filter(mask.astype(np.float32), 0.7)
    return np.clip(ndi.map_coordinates(m, [py, px], order=1, cval=0), 0, 1)


def from_ahn(a, order=1, cval=np.nan):
    er = (np.cos(THETA) * wx + np.sin(THETA) * wz) * SCALE
    sr = (-np.sin(THETA) * wx + np.cos(THETA) * wz) * SCALE
    col = (GWEN_RD[0] + er - AHN_X0) / AHN_CELL - 0.5
    row = (AHN_Y1 - (GWEN_RD[1] - sr)) / AHN_CELL - 0.5
    return ndi.map_coordinates(a, [row, col], order=order, cval=cval)


def inpaint(a, valid):
    """Vul gaten met het gewogen gemiddelde van de omgeving."""
    a = np.where(valid, a, 0).astype(np.float32)
    w = valid.astype(np.float32)
    res, done = a.copy(), valid.copy()
    for sigma in (2, 4, 8, 16, 32, 64):
        num, den = ndi.gaussian_filter(a, sigma), ndi.gaussian_filter(w, sigma)
        ok = (~done) & (den > 0.02)
        res[ok] = num[ok] / den[ok]
        done |= ok
    return res


grass, bos, water_m, path, grey, road = (from_map(cls == i) for i in (1, 2, 3, 4, 5, 6))

# Paden die niet op de kaart staan, overgetrokken van de luchtfoto (PDOK, voorjaar 2026).
# [breedte in m, punten (x, z)]
EXTRA_PATHS = [
    # Oeverpad langs de noordkant van de plas, tussen de bosstrook en het water;
    # loopt op 3 m langs Gwens plek.
    (2.0, [(-40.1, 23.9), (-37.1, 21.3), (-34.2, 18.7), (-31.1, 16.4), (-27.8, 14.1), (-24.3, 12.2),
           (-20.7, 10.4), (-17.0, 8.9), (-13.2, 7.4), (-9.5, 6.0), (-5.7, 4.8), (-1.8, 3.8), (2.2, 3.1),
           (6.1, 2.4), (10.1, 1.9), (14.1, 1.4), (18.1, 1.0), (22.1, 0.8), (26.1, 0.7), (30.1, 0.7),
           (34.1, 0.8), (38.1, 0.9), (42.1, 1.0), (46.1, 1.1), (50.1, 1.0), (53.9, 0.0), (57.2, -2.3),
           (60.1, -5.0), (63.1, -7.7), (65.0, -9.5)]),
]
for width, pts in EXTRA_PATHS:
    pts = np.array(pts, np.float32)
    dist = np.full(wx.shape, 1e9, np.float32)
    for a, b in zip(pts[:-1], pts[1:]):
        lo, hi = np.minimum(a, b) - 4, np.maximum(a, b) + 4
        j0, j1 = int((lo[0] - X0) / C), int((hi[0] - X0) / C) + 1
        i0, i1 = int((lo[1] - Z0) / C), int((hi[1] - Z0) / C) + 1
        x, z = wx[i0:i1, j0:j1], wz[i0:i1, j0:j1]
        d = b - a
        t = np.clip(((x - a[0]) * d[0] + (z - a[1]) * d[1]) / (d @ d), 0, 1)
        dist[i0:i1, j0:j1] = np.minimum(dist[i0:i1, j0:j1], np.hypot(x - a[0] - t * d[0], z - a[1] - t * d[1]))
    path = np.maximum(path, np.clip((width / 2 + 0.3 - dist) / 0.6, 0, 1))
inside = from_map(cls > 0) > 0.5

# Bruggen: pad met water eronder. Onder het pad kijken wat de buurvlakken zijn.
nopath = np.where(cls == 4, 0, cls)
_, idx = ndi.distance_transform_edt(nopath == 0, return_indices=True)
under = nopath[idx[0], idx[1]]
bridge_map = (cls == 4) & (under == 3) & (ndi.distance_transform_edt(~((nopath > 0) & (nopath != 3))) * MPP > 0.4)
bridge = from_map(bridge_map) > 0.5
water_under = from_map((cls == 3) | bridge_map)

# --- Hoogte ---
dtm_raw, dsm_raw = np.load(dtm_path), np.load(dsm_path)
dtm_ok = from_ahn((dtm_raw < 1e6).astype(np.float32), cval=0) > 0.99
dsm_ok = from_ahn((dsm_raw < 1e6).astype(np.float32), cval=0) > 0.99
dtm = from_ahn(np.where(dtm_raw < 1e6, dtm_raw, 0), cval=0)
dsm = from_ahn(np.where(dsm_raw < 1e6, dsm_raw, 0), cval=0)

water = np.where(inside, water_under > 0.5, ~dtm_ok & ~dsm_ok)
water = ndi.binary_opening(water, iterations=1)

# Waterpeil: laagste gemeten maaiveld direct langs de plas.
shore = ndi.binary_dilation(water & inside, iterations=3) & ~water & dtm_ok & inside
WL = float(np.percentile(dtm[shore], 10))
print('waterpeil (NAP):', round(WL, 2))

ground = inpaint(dtm, dtm_ok & ~water) - WL
ground = ndi.gaussian_filter(ground, 1.2)
land = np.maximum(ground, 0.12)
d_in = ndi.distance_transform_edt(water) * C
# Bodem van de plas: volgens het ontwerp ca. 1,5 m diep met brede, ondiepe oeverzones.
bottom = -np.minimum(1.5, 0.1 + d_in * 0.2)
height = np.where(water, bottom, land)
height = ndi.gaussian_filter(height, 0.8)

# Begroeiingshoogte: oppervlak min maaiveld.
canopy = np.where(dsm_ok, dsm - WL - ground, 0)
canopy = np.clip(np.where(water, 0, canopy), 0, 25.5)

# Brugdekken: hoogte overnemen van het pad aan weerszijden.
deck = inpaint(np.where(path > 0.5, land, 0), (path > 0.5) & ~bridge & ~water)
lab, n = ndi.label(bridge)
bridges = []
for i in range(1, n + 1):
    rz, rx = np.nonzero(lab == i)
    if len(rx) * C * C < 4:
        continue
    pts = np.stack([X0 + (rx + 0.5) * C, Z0 + (rz + 0.5) * C], 1)
    mid = pts.mean(0)
    evals, evecs = np.linalg.eigh(np.cov((pts - mid).T))
    axis = evecs[:, 1]
    t = (pts - mid) @ axis
    s = (pts - mid) @ evecs[:, 0]
    length = float(t.max() - t.min()) + 1.6
    width = float(np.percentile(s, 97) - np.percentile(s, 3)) + 0.5
    y = float(np.median(deck[rz, rx]))
    a, b = mid - axis * length / 2, mid + axis * length / 2
    bridges.append(dict(x1=round(float(a[0]), 2), z1=round(float(a[1]), 2), x2=round(float(b[0]), 2),
                        z2=round(float(b[1]), 2), width=round(min(width, 4.0), 2), y=round(max(y, 0.6), 2)))
print('bruggen:', len(bridges))

# Begaanbaar: het terrein zelf (gras, bos, pad, brug), aaneengesloten vanaf Gwens plek.
walk = inside & ((grass + bos + path + grey) > 0.5) & ~water | bridge
lab, n = ndi.label(walk)
walk = lab == lab[int((0 - Z0) / C), int((0 - X0) / C)]
site = ndi.binary_fill_holes(ndi.binary_closing(inside, iterations=4))


def save(name, *chan):
    arr = np.stack([np.clip(c * 255, 0, 255).astype(np.uint8) for c in chan], -1)
    Image.fromarray(arr).save(f'{out}/{name}.png', optimize=True)


path_land = np.where(bridge, 0, path)
save('cover', path_land, bos, water.astype(np.float32))
save('mask', walk.astype(np.float32), np.where(site, 1.0, 0.0), np.maximum(road, grey))

# Hoogte op 1 m, 16 bits verdeeld over rood en groen; blauw = begroeiingshoogte (dm).
h1 = height.reshape(NZ // 2, 2, NX // 2, 2).mean((1, 3))
c1 = canopy.reshape(NZ // 2, 2, NX // 2, 2).max((1, 3))
v = np.clip((h1 + 10) / 40 * 65535, 0, 65535).astype(np.uint16)
arr = np.stack([(v >> 8).astype(np.uint8), (v & 255).astype(np.uint8), np.clip(c1 * 10, 0, 255).astype(np.uint8)], -1)
Image.fromarray(arr).save(f'{out}/height.png', optimize=True)

meta = dict(x0=X0, x1=X1, z0=Z0, z1=Z1, cell=C, heightCell=1.0, heightOffset=-10, heightRange=40,
            waterLevelNAP=round(WL, 2), gwenRD=GWEN_RD, bridges=bridges)
json.dump(meta, open(f'{out}/meta.json', 'w'), indent=1)

gi, gj = int((0 - Z0) / C), int((0 - X0) / C)
print('bij Gwen: hoogte boven water %.2f m, bos %.2f, gras %.2f, begroeiing %.1f m' % (height[gi, gj], bos[gi, gj], grass[gi, gj], canopy[gi, gj]))
for nm, m in (('bos', (bos > 0.5) & site), ('gras', (grass > 0.5) & site)):
    print(nm, 'begroeiing p50/p90/p99: %.1f %.1f %.1f m' % tuple(np.percentile(canopy[m], [50, 90, 99])), '| maaiveld p5/p50/p95/max: %.1f %.1f %.1f %.1f' % (*np.percentile(height[m], [5, 50, 95]), height[m].max()))
