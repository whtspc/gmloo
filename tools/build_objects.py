"""Stap 4: bankjes, picknicktafels en gebouwen uit OpenStreetMap.

- Plek van bankjes en tafels: OSM. De kijkrichting staat er niet in en is geschat:
  naar het water als dat dichtbij is, anders naar het dichtstbijzijnde pad.
- Plattegrond van gebouwen: OSM. Goot- en nokhoogte: gemeten in AHN5 (2023).

Gebruik: python3 build_objects.py <map.osm> <ahn5_dsm.npy> <datamap>
© OpenStreetMap-bijdragers, ODbL.
"""
import json
import sys
import xml.etree.ElementTree as ET
import numpy as np
from PIL import Image
from scipy import ndimage as ndi

sys.path.insert(0, __file__.rsplit('/', 1)[0])
from extract_osm import world, THETA, SCALE, GWEN_RD  # noqa: E402

osm_path, dsm_path, data = sys.argv[1:4]
meta = json.load(open(f'{data}/meta.json'))
X0, X1, Z0, Z1, C = meta['x0'], meta['x1'], meta['z0'], meta['z1'], meta['cell']
cover = np.asarray(Image.open(f'{data}/cover.png')).astype(np.float32) / 255
mask = np.asarray(Image.open(f'{data}/mask.png')).astype(np.float32) / 255
hraw = np.asarray(Image.open(f'{data}/height.png')).astype(np.float32)
height = (hraw[:, :, 0] * 256 + hraw[:, :, 1]) / 65535 * meta['heightRange'] + meta['heightOffset']
WL = meta['waterLevelNAP']
dsm = np.load(dsm_path)


def ground(x, z):
    return float(height[min(int((z - Z0)), height.shape[0] - 1), min(int((x - X0)), height.shape[1] - 1)])


inside = lambda x, z: X0 + 3 < x < X1 - 3 and Z0 + 3 < z < Z1 - 3
dw, iw = ndi.distance_transform_edt(cover[:, :, 2] < 0.5, return_indices=True)
dp, ip = ndi.distance_transform_edt(cover[:, :, 0] < 0.5, return_indices=True)

root = ET.parse(osm_path).getroot()
nodes = {n.get('id'): (float(n.get('lat')), float(n.get('lon'))) for n in root.findall('node')}

benches, tables = [], []
for n in root.findall('node'):
    t = {x.get('k'): x.get('v') for x in n.findall('tag')}
    kind = 'bench' if t.get('amenity') == 'bench' else 'table' if t.get('leisure') == 'picnic_table' else None
    if not kind:
        continue
    x, z = world(float(n.get('lat')), float(n.get('lon')))
    if not inside(x, z):
        continue
    i, j = int((z - Z0) / C), int((x - X0) / C)
    if mask[i, j, 1] < 0.5:  # alleen op het terrein
        continue
    # Kijkrichting (schatting): water binnen 45 m, anders het pad.
    src = iw if dw[i, j] * C < 45 else ip
    ti, tj = src[0][i, j], src[1][i, j]
    angle = float(np.arctan2((tj - j), (ti - i)))  # draaiing om de y-as, 0 = naar het zuiden
    item = dict(x=x, z=z, angle=round(angle, 2))
    if kind == 'bench':
        item['backrest'] = t.get('backrest') != 'no'
        benches.append(item)
    else:
        tables.append(item)

# Gebouwen
buildings = []
for w in root.findall('way'):
    t = {x.get('k'): x.get('v') for x in w.findall('tag')}
    if 'building' not in t:
        continue
    pts = [world(*nodes[n.get('ref')]) for n in w.findall('nd') if n.get('ref') in nodes]
    if len(pts) < 4 or not all(inside(x, z) for x, z in pts):
        continue
    P = np.array(pts[:-1] if pts[0] == pts[-1] else pts)
    # AHN-cellen binnen de plattegrond
    xs = np.arange(P[:, 0].min(), P[:, 0].max(), 0.5) + 0.25
    zs = np.arange(P[:, 1].min(), P[:, 1].max(), 0.5) + 0.25
    gx, gz = np.meshgrid(xs, zs)
    inpoly = np.zeros(gx.shape, bool)
    for a, b in zip(P, np.roll(P, -1, axis=0)):
        cond = (a[1] > gz) != (b[1] > gz)
        with np.errstate(divide='ignore', invalid='ignore'):
            xi = a[0] + (gz - a[1]) * (b[0] - a[0]) / (b[1] - a[1])
        inpoly ^= cond & (gx < xi)
    if inpoly.sum() < 6:
        continue
    er = (np.cos(THETA) * gx + np.sin(THETA) * gz) * SCALE
    sr = (-np.sin(THETA) * gx + np.cos(THETA) * gz) * SCALE
    col = (GWEN_RD[0] + er - 112900) / 0.5 - 0.5
    row = (521650 - (GWEN_RD[1] - sr)) / 0.5 - 0.5
    v = ndi.map_coordinates(dsm, [row, col], order=0, cval=1e9)[inpoly]
    v = v[v < 1e6] - WL
    base = min(ground(x, z) for x, z in P)
    if len(v) < 6:
        continue
    eave, ridge = float(np.percentile(v, 15)) - base, float(np.percentile(v, 97)) - base
    if ridge < 1.8:
        continue
    # Kleine schuurtjes onder boomkronen: de meting ziet daar de kroon, niet het dak.
    area = 0.25 * float(inpoly.sum())
    if area < 60:
        eave, ridge = min(eave, 2.6), min(ridge, 4.5)
    ridge = min(ridge, eave + 6)
    eave = max(1.8, min(eave, ridge))
    buildings.append(dict(pts=[[round(float(x), 1), round(float(z), 1)] for x, z in P], base=round(base, 2),
                          eave=round(eave, 1), ridge=round(ridge, 1), kind=t['building']))

json.dump(dict(benches=benches, tables=tables, buildings=buildings), open(f'{data}/objects.json', 'w'), separators=(',', ':'))
print('bankjes:', len(benches), '| picknicktafels:', len(tables), '| gebouwen:', len(buildings))
near = sorted(((round(float(np.hypot(b['x'], b['z']))), b['x'], b['z']) for b in benches))[:4]
print('dichtstbijzijnde bankjes bij Gwen (m, x, z):', near)
big = sorted(buildings, key=lambda b: -b['ridge'])[:3]
print('hoogste gebouwen (goot/nok):', [(b['kind'], b['eave'], b['ridge']) for b in big])
