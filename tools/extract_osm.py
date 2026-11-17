"""Haal de wandelpaden uit een OpenStreetMap-export en zet ze om naar wereldcoördinaten.

Gebruik: python3 extract_osm.py <map.osm> <osm_paths.json>
map.osm: https://api.openstreetmap.org/api/0.6/map?bbox=4.7665,52.6712,4.7800,52.6793
© OpenStreetMap-bijdragers, ODbL.
"""
import json
import sys
import xml.etree.ElementTree as ET
import numpy as np

THETA, SCALE, GWEN_RD = np.deg2rad(-0.45), 1.0015, (113322.5, 521210.75)


def rd(lat, lon):
    p, l = 0.36 * (lat - 52.15517440), 0.36 * (lon - 5.38720621)
    x = (155000 + 190094.945 * l - 11832.228 * p * l - 114.221 * p * p * l - 32.391 * l**3 - 0.705 * p
         - 2.340 * p**3 * l - 0.608 * p * l**3 - 0.008 * l * l + 0.148 * p * p * l**3)
    y = (463000 + 309056.544 * p + 3638.893 * l * l + 73.077 * p * p - 157.984 * p * l * l + 59.788 * p**3
         + 0.433 * l - 6.439 * p * p * l * l - 0.032 * p * l + 0.092 * l**4 - 0.054 * p * l**4)
    return x, y


def world(lat, lon):
    x, y = rd(lat, lon)
    er, sr = (x - GWEN_RD[0]) / SCALE, (GWEN_RD[1] - y) / SCALE
    return (round(float(np.cos(THETA) * er - np.sin(THETA) * sr), 2),
            round(float(np.sin(THETA) * er + np.cos(THETA) * sr), 2))


if __name__ == "__main__":
    root = ET.parse(sys.argv[1]).getroot()
    nodes = {n.get('id'): (float(n.get('lat')), float(n.get('lon'))) for n in root.findall('node')}
    out = []
    for w in root.findall('way'):
        t = {x.get('k'): x.get('v') for x in w.findall('tag')}
        if t.get('highway') not in ('footway', 'path', 'steps', 'pedestrian', 'track'):
            continue
        pts = [world(*nodes[n.get('ref')]) for n in w.findall('nd') if n.get('ref') in nodes]
        if len(pts) > 1:
            out.append(dict(id=w.get('id'), surface=t.get('surface'), bridge=t.get('bridge') == 'yes',
                            name=t.get('name'), pts=pts))
    json.dump(out, open(sys.argv[2], 'w'))
    print(len(out), 'paden')
