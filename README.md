# Bij Gwen

Een rondloopbare 3D-weergave van natuurbegraafplaats Geestmerloo, met Gwens plek
(g.E515) als middelpunt. Werkt in de browser, op computer en telefoon.

## Gebruiken

```
npm install
npm run dev      # ontwikkelen
npm run build    # maakt één losse dist/index.html
```

Computer: lopen met W A S D of de pijltjes, kijken door te slepen met de muis.
Telefoon: linkerduim lopen, rechterduim kijken.

## Waar de wereld vandaan komt

Niets aan de ligging is verzonnen. De gegevens in `src/world/data/` zijn afgeleid van:

- **Digitale kaart van Geestmerloo** (kaart.geestmerloo.nl): de vlakken water, pad,
  bos en kruidenrijk grasland, en de plek van g.E515. Een opname van de kaart op
  vaste schaal is per pixel ingedeeld (`tools/classify_map.py`).
- **Actueel Hoogtebestand Nederland** (AHN, via PDOK, `dtm_05m` en `dsm_05m`): de
  gemeten hoogtes van het terrein. Het gemeten waterpeil is −2,67 m NAP (ontwerp:
  −2,70); de heuvel aan de oostkant komt 7,9 m boven het water uit.
- **OpenStreetMap** (© OpenStreetMap-bijdragers, ODbL): wandelpaden die niet op de
  digitale kaart staan, waaronder gemaaide graspaden (`tools/extract_osm.py`).
- **Luchtfoto** (PDOK, voorjaar 2026): ter controle van alle paden; het oeverpad
  langs Gwens plek staat op geen van beide kaarten en is hiervan overgetrokken
  (`EXTRA_PATHS` in `tools/build_world.py`).
- **AHN5** (gevlogen in 2023, basisdata.nl): de plek en hoogte van elke boom en
  struik, ook buiten het terrein (`tools/detect_trees.py`). De groei sinds 2023 is
  geschat.
- **Ontwerptekening 2019** (Ada Wille / Limes Landschapsadvies): diepte van de plas
  (ca. 1,5 m) en de ondiepe oeverzones met rietkragen.

Kaart en hoogtes zijn op elkaar gelegd via de vorm van het water
(`tools/build_world.py`): draaiing −0,45°, Gwens plek op RD (113322,5 ; 521210,75).

## Seizoen

De wandeling staat in november, zoals op de foto's van de begrafenis: het meeste
blad is gevallen, wat er hangt is geel en bruin, de bessen zitten nog aan de
struiken. `src/world/season.js` bevat ook de zomerinstelling.

## Wat nog algemeen is

- Boomsoorten: de plek en hoogte per boom zijn gemeten, de soort niet. De vormen
  zijn afgekeken van foto's: ranke jonge bomen met open kroon (waaronder een
  berkachtige met lichte stam) en meerstammige struiken met rode bessen. Bomen die
  na 2023 zijn geplant of toen nog lager dan ruim een meter waren, ontbreken.
- Kruidlaag, gras, bloemen en riet: algemene vormen. De bloemkleuren volgen de
  foto's op de website (korenbloem, klaproos, schermbloemen, kaasjeskruid, distel).
- De smalle gemaaide sporen in het grasland in het zuidoosten (rond het labyrint).
- Gebouwen, bankjes, de natuurspeelplaats en alles buiten het terrein ontbreken nog.
- De eilanden zijn bereikbaar zoals de kaart ze tekent; alleen waar een pad echt
  over water gaat staat een brug.
