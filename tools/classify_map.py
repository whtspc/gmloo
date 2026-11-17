"""Stap 1: lees de opname van de digitale kaart (kaart.geestmerloo.nl) en bepaal
per pixel wat het is: water, pad, bos, kruidenrijk grasland, enz.

Gebruik: python3 classify_map.py <map-big.png> <uit.npz>
De opname is gemaakt met Gwens plek (g.E515) precies in het midden van de kaart.
"""
import sys
import numpy as np
from PIL import Image
from scipy import ndimage as ndi

# Kleuren uit de legenda van de kaart.
PALETTE = {
    'grass': [(161, 184, 107), (137, 156, 91)],
    'bos': [(101, 120, 57), (86, 102, 48)],
    'water': [(165, 191, 221)],
    'path': [(241, 244, 199)],
    'grey': [(161, 161, 159)],
    'road': [(244, 213, 198)],
}
ORDER = ['none', 'grass', 'bos', 'water', 'path', 'grey', 'road']


def classify(path):
    a = np.asarray(Image.open(path).convert('RGB')).astype(np.int16)
    cls = np.zeros(a.shape[:2], np.uint8)
    for name, cols in PALETTE.items():
        for c in cols:
            d = np.abs(a - np.array(c)).sum(-1)
            cls[(d < 14) & (cls == 0)] = ORDER.index(name)
    # Losse treffers in de luchtfoto weghalen: alleen aaneengesloten kaartvlak telt.
    known = ndi.binary_opening(cls > 0, iterations=2)
    lab, n = ndi.label(ndi.binary_closing(known, iterations=6))
    sizes = ndi.sum(known, lab, range(1, n + 1))
    site = lab == (1 + int(np.argmax(sizes)))
    cls[~site] = 0
    # Arcering, symbolen en labels (smalle onbekende plekken) invullen met de buur.
    unknown = cls == 0
    dist, idx = ndi.distance_transform_edt(unknown, return_indices=True)
    fill = unknown & (dist <= 14) & ndi.binary_fill_holes(ndi.binary_closing(site, iterations=20))
    cls[fill] = cls[idx[0][fill], idx[1][fill]]
    return cls


if __name__ == '__main__':
    cls = classify(sys.argv[1])
    np.savez_compressed(sys.argv[2], cls=cls)
    colors = np.array([(255, 255, 255), (161, 184, 107), (101, 120, 57), (165, 191, 221), (241, 244, 199), (161, 161, 159), (244, 213, 198)], np.uint8)
    Image.fromarray(colors[cls]).save(sys.argv[2].replace('.npz', '.png'))
    print({ORDER[i]: int((cls == i).sum()) for i in range(len(ORDER))})
