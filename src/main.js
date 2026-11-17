import * as THREE from 'three';
import { WORLD, loadWorld, cover, walkable } from './world/data.js';
import { buildTerrain } from './world/terrain.js';
import { buildVegetation } from './world/vegetation.js';
import { windUniform } from './world/wind.js';
import { buildSky, SKY } from './world/sky.js';
import { buildWater, buildBridge, buildGwen } from './world/props.js';
import { buildObjects } from './world/objects.js';
import { createControls } from './controls.js';
import { SEASON } from './world/season.js';

const $ = (id) => document.getElementById(id);
const canvas = $('scene');
const mobile = matchMedia('(pointer: coarse)').matches;

// Zoek een begaanbare plek op ongeveer `dist` meter van Gwen, het liefst in
// richting `angle` (0 = noord, met de klok mee) en zo mogelijk op een pad.
function spotNear(dist, angle, wantPath) {
  let best = null;
  for (let d = dist; d < dist + 30 && !best; d += 1) {
    for (let k = 0; k < 36; k++) {
      const a = angle + ((k % 2 ? 1 : -1) * Math.ceil(k / 2) * Math.PI) / 18;
      const x = WORLD.gwen.x + Math.sin(a) * d;
      const z = WORLD.gwen.z - Math.cos(a) * d;
      if (walkable(x, z) && (!wantPath || cover('path', x, z) > 0.9)) {
        best = { x, z };
        break;
      }
    }
  }
  return best ?? { x: WORLD.gwen.x, z: WORLD.gwen.z - dist };
}

async function start() {
  await loadWorld();
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !mobile, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, mobile ? 1.6 : 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(SKY.horizon, 90, 700);
  const camera = new THREE.PerspectiveCamera(mobile ? 68 : 62, 1, 0.1, 2600);

  scene.add(new THREE.HemisphereLight(0xdcebff, 0x7d8a5a, SEASON.light.hemi));
  const sun = new THREE.DirectionalLight(SEASON.light.sunColor, SEASON.light.sun);
  sun.position.copy(SKY.sunDir).multiplyScalar(100);
  scene.add(sun);

  const sky = buildSky();
  const vegetation = buildVegetation({ mobile, renderer });
  const water = buildWater(scene.fog);
  const gwen = buildGwen();
  scene.add(
    sky.group,
    buildTerrain({ mobile, shadows: vegetation.shadows }),
    vegetation.group,
    water.mesh,
    gwen.group,
    ...WORLD.bridges.map(buildBridge),
    buildObjects(),
  );

  const controls = createControls(camera, canvas, $('stick'));
  // Begin op het pad ten noorden van Gwens plek, die tussen het pad en de plas ligt.
  const startSpot = spotNear(23, 0.15, true);
  // "Naar Gwen" zet je op het oeverpad dat vlak langs Gwens plek loopt.
  const nearSpot = spotNear(3, Math.PI, true);
  controls.place(startSpot.x, startSpot.z, WORLD.gwen.x, WORLD.gwen.z);

  function resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // Op een staand scherm iets wijder kijken.
    camera.fov = w < h ? 74 : mobile ? 66 : 62;
    camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize);
  resize();

  // --- Schermbediening ---
  const fade = $('fade');
  $('begin').addEventListener('click', () => {
    $('intro').classList.add('hidden');
    $('hud').classList.remove('hidden');
    controls.state.enabled = true;
  });
  $('to-gwen').addEventListener('click', () => {
    fade.classList.add('on');
    setTimeout(() => {
      controls.place(nearSpot.x, nearSpot.z, WORLD.gwen.x, WORLD.gwen.z);
      fade.classList.remove('on');
    }, 450);
  });
  const info = $('info');
  $('info-open').addEventListener('click', () => info.classList.remove('hidden'));
  $('info-close').addEventListener('click', () => info.classList.add('hidden'));

  const clock = new THREE.Clock();
  renderer.setAnimationLoop(() => {
    const dt = Math.min(clock.getDelta(), 0.05);
    const time = clock.elapsedTime;
    controls.update(dt);
    vegetation.update(camera);
    windUniform.value = time;
    water.update(time);
    gwen.update(time, camera);
    sky.update(camera, dt);
    renderer.render(scene, camera);
  });

  $('loading').classList.add('hidden');
  $('begin').disabled = false;
  $('begin').textContent = 'Begin de wandeling';

  // Handig bij het verder bouwen (en voor tests).
  window.__gmloo = { controls, camera, scene, renderer };
}

// Eerst de pagina laten tekenen, dan pas de wereld opbouwen.
requestAnimationFrame(() =>
  setTimeout(() => {
    start().catch((err) => {
      console.error(err);
      $('loading').textContent = 'Het landschap kon niet worden geladen.';
    });
  }, 30),
);
