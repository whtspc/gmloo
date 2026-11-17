// Alle gegevens van de wereld op één plek.
//
// LET OP: dit is een sfeerschets, nog géén kaart. Wat we zeker weten van
// Geestmerloo (plas met eilanden en bruggetjes, glooiend terrein, kruidenrijk
// grasland, jonge aanplant van bomen en struiken, halfverharde paden) zit erin,
// maar de precieze ligging van water, paden, heuvels en bomen is verzonnen.
// Zodra we de plattegrond / het ontwerp hebben, vervangen we alleen dit bestand.
//
// Eenheden: meters. x = oost, z = zuid, y = omhoog. Gwens plek is de oorsprong.

export const WORLD = {
  size: 320, // lengte van een zijde van het terrein
  walkRadius: 128, // zo ver kun je lopen vanaf het midden
  waterLevel: 0,
  baseHeight: 0.75, // maaiveld boven het water
  seed: 515,

  gwen: { name: 'Gwen', code: 'E515', x: 0, z: 0 },

  // Waar je begint: op het pad, met zicht op Gwens plek.
  start: { x: -19, z: 27 },
  // Waar "Naar Gwen" je neerzet.
  nearGwen: { x: -4.5, z: 5.5 },

  // Glooiingen: zachte heuvels (hoogte h, straal r).
  hills: [
    { x: -42, z: -52, h: 3.2, r: 28 },
    { x: -74, z: 30, h: 2.4, r: 36 },
    { x: 22, z: 66, h: 1.8, r: 26 },
    { x: -2, z: -4, h: 0.7, r: 20 },
    { x: 70, z: 70, h: 1.4, r: 30 },
  ],

  // De plas: vereniging van ellipsen, met een eiland erin.
  lake: {
    lobes: [
      { x: 80, z: -40, rx: 55, rz: 34 },
      { x: 122, z: 14, rx: 30, rz: 40 },
    ],
    islands: [{ x: 82, z: -22, rx: 16, rz: 9 }],
  },

  bridges: [{ x1: 82, z1: -2.5, x2: 82, z2: -16.5, width: 1.7, y: 0.95 }],

  // Paden (worden vloeiend gemaakt).
  pathWidth: 1.8,
  paths: [
    [
      [-125, 95], [-72, 72], [-32, 42], [-15, 17], [-10, -4], [4, -15],
      [34, -9], [60, 2], [76, 3], [82, -1],
    ],
    [[-15, 17], [-34, 2], [-46, -22], [-44, -50], [-60, -78], [-100, -85]],
    [[82, -17], [82, -22], [76, -25]],
    [[60, 2], [70, 30], [62, 62], [30, 92], [-20, 110]],
  ],

  // Bosjes: jonge aanplant (soorten houden we nog algemeen).
  groves: [
    { x: -46, z: -58, r: 30, trees: 55, shrubs: 40 },
    { x: -82, z: 26, r: 36, trees: 70, shrubs: 50 },
    { x: 26, z: 70, r: 26, trees: 40, shrubs: 30 },
    { x: 84, z: -23, r: 9, trees: 5, shrubs: 8 },
    { x: 40, z: -70, r: 22, trees: 26, shrubs: 20 },
    { x: -20, z: -100, r: 28, trees: 40, shrubs: 25 },
    { x: 90, z: 80, r: 30, trees: 45, shrubs: 30 },
  ],
  looseTrees: 45,

  benches: [{ x: 33, z: -13.5, facing: [60, -40] }],
};
