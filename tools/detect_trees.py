"""Stap 3: zoek de afzonderlijke bomen en struiken in de hoogtemeting van 2023 (AHN5).

Begroeiingshoogte = oppervlak (DSM) min maaiveld (DTM). Elke lokale top is een boom
of struik, met de in 2023 gemeten hoogte.

Gebruik: python3 detect_trees.py <ahn5_dsm.npy> <ahn5_dtm.npy> <mask.png> <uit.json>
De .npy-bestanden zijn uitsneden van kaartblad 19BN1 (basisdata.nl/hwh-ahn/AHN5),
linksboven RD (112900, 521650), 0,5 m per cel.
"""
import json
import sys
import numpy as np
from PIL import Image
from scipy import ndimage as ndi

THETA, SCALE, GWEN_RD = np.deg2rad(-0.45), 1.0015, (113322.5, 521210.75)
X0, X1, Z0, Z1 = -260, 540, -320, 560

dsm, dtm = np.load(sys.argv[1]), np.load(sys.argv[2])
ok = (dsm < 1e6) & (dtm < 1e6)
chm = np.where(ok, dsm - dtm, 0).astype(np.float32)
smooth = ndi.gaussian_filter(chm, 0.8)
peak = (smooth == ndi.maximum_filter(smooth, size=5)) & (smooth > 1.1)
rows, cols = np.nonzero(peak)
# Hoogte: de hoogste meting vlak om de top (het gladgestreken beeld onderschat die).
h = ndi.maximum_filter(chm, size=3)[rows, cols]

# RD -> wereld (x oost, z zuid, Gwens plek = oorsprong)
rdx, rdy = 112900 + (cols + 0.5) * 0.5, 521650 - (rows + 0.5) * 0.5
er, sr = (rdx - GWEN_RD[0]) / SCALE, (GWEN_RD[1] - rdy) / SCALE
wx = np.cos(THETA) * er - np.sin(THETA) * sr
wz = np.sin(THETA) * er + np.cos(THETA) * sr
keep = (wx > X0 + 2) & (wx < X1 - 2) & (wz > Z0 + 2) & (wz < Z1 - 2)
wx, wz, h = wx[keep], wz[keep], h[keep]

mask = np.asarray(Image.open(sys.argv[3])).astype(np.float32) / 255
ii, jj = ((wz - Z0) / 0.5).astype(int), ((wx - X0) / 0.5).astype(int)
on_site = mask[ii, jj, 0] > 0.5
# Buiten het terrein alleen echte bomen (geen auto's, hekken, lantaarnpalen).
keep = on_site | (h > 4)
wx, wz, h, on_site = wx[keep], wz[keep], h[keep], on_site[keep]

# Eén top per kroon: hoge bomen hebben een brede kroon met meerdere toppen.
order = np.argsort(-h)
taken = []
grid = {}
for k in order:
    r = max(1.3, 0.22 * h[k])
    gx, gz = int(wx[k] // 6), int(wz[k] // 6)
    clash = False
    for a in (-1, 0, 1):
        for b in (-1, 0, 1):
            for j in grid.get((gx + a, gz + b), ()):
                rr = max(r, max(1.3, 0.22 * h[j]))
                if (wx[k] - wx[j]) ** 2 + (wz[k] - wz[j]) ** 2 < rr * rr:
                    clash = True
    if not clash:
        grid.setdefault((gx, gz), []).append(k)
        taken.append(k)

out = [[round(float(wx[k]), 1), round(float(wz[k]), 1), round(float(h[k]), 1), int(on_site[k])] for k in taken]
json.dump(out, open(sys.argv[4], 'w'), separators=(',', ':'))
hs = np.array([o[2] for o in out])
site = np.array([o[3] for o in out]) == 1
print('bomen en struiken:', len(out), '| op het terrein:', int(site.sum()))
print('hoogte 2023 op het terrein, p10/p50/p90/max: %.1f %.1f %.1f %.1f m' % (*np.percentile(hs[site], [10, 50, 90]), hs[site].max()))
print('binnen 30 m van Gwen:', sum(1 for o in out if o[0] ** 2 + o[1] ** 2 < 900))
