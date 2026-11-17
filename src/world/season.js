// Het seizoen waarin je rondloopt. Nu november, zoals op de foto's van de
// begrafenis: de meeste bladeren zijn gevallen, wat er nog hangt is geel en bruin,
// de bessen zitten nog aan de struiken, de kruidlaag is nog groen en het riet is
// verkleurd. De lucht is zwaar bewolkt met blauwe stukken ertussen.
const SEASONS = {
  zomer: {
    leaves: 1, // aandeel blad dat nog aan de takken zit
    leafHue: null, // null = de eigen kleur van het blad
    grass: { hue: 0.2, sat: 0.36, lum: 0.36 },
    reed: { hue: 0.15, sat: 0.3, lum: 0.4 },
    flowers: 1,
    litter: 0, // gevallen blad op de bosbodem
    ground: [1, 1, 1],
    sky: { horizon: 0xdde7ea, zenith: 0x6c9fd2, sun: [-0.45, 0.62, -0.64], clouds: 22, cloudGrey: 0 },
    light: { hemi: 1.5, sun: 2.1, sunColor: 0xfff1d8 },
  },
  november: {
    leaves: 0.3,
    leafHue: [28, 58],
    grass: { hue: 0.17, sat: 0.26, lum: 0.37 },
    reed: { hue: 0.1, sat: 0.34, lum: 0.5 },
    flowers: 0,
    litter: 0.45,
    ground: [1.06, 0.95, 0.88],
    sky: { horizon: 0xe2e5e6, zenith: 0x7d9cc4, sun: [-0.55, 0.36, -0.75], clouds: 40, cloudGrey: 0.55 },
    light: { hemi: 1.4, sun: 1.7, sunColor: 0xfff0dc },
  },
};

export const SEASON = SEASONS.november;
