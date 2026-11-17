import * as THREE from 'three';
import { WORLD } from './world/data.js';
import { buildTerrain } from './world/terrain.js';
import { buildVegetation, windUniform } from './world/vegetation.js';
import { buildSky, SKY } from './world/sky.js';
import { buildWater, buildBridge, buildBench, buildGwen } from './world/props.js';
import { createControls } from './controls.js';

const $ = (id) => document.getElementById(id);
const canvas = $('scene');
const mobile = matchMedia('(pointer: coarse)').matches;

function start() {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !mobile, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, mobile ? 1.6 : 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(SKY.horizon, 70, 520);
  const camera = new THREE.PerspectiveCamera(mobile ? 68 : 62, 1, 0.1, 2600);

  scene.add(new THREE.HemisphereLight(0xdcebff, 0x7d8a5a, 1.5));
  const sun = new THREE.DirectionalLight(0xfff1d8, 2.1);
  sun.position.copy(SKY.sunDir).multiplyScalar(100);
  scene.add(sun);

  const sky = buildSky();
  const vegetation = buildVegetation({ mobile });
  const water = buildWater(scene.fog);
  const gwen = buildGwen();
  scene.add(
    sky.group,
    buildTerrain({ textureSize: mobile ? 1024 : 2048, shadows: vegetation.shadows }),
    vegetation.group,
    water.mesh,
    gwen.group,
    ...WORLD.bridges.map(buildBridge),
    ...WORLD.benches.map(buildBench),
  );

  const controls = createControls(camera, canvas, $('stick'));
  controls.place(WORLD.start.x, WORLD.start.z, WORLD.gwen.x, WORLD.gwen.z);

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
      controls.place(WORLD.nearGwen.x, WORLD.nearGwen.z, WORLD.gwen.x, WORLD.gwen.z);
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
requestAnimationFrame(() => setTimeout(start, 30));
