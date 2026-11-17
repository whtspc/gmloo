import { WORLD } from './world/data.js';
import { groundAt } from './world/terrain.js';

// Rondlopen op ooghoogte.
//  - Computer: WASD / pijltjes om te lopen, slepen met de muis om rond te kijken.
//  - Mobiel: linkerduim = lopen (joystick verschijnt waar je drukt), rechterduim = kijken.

const EYE = 1.62;
const WALK = 2.1; // m/s — rustig wandeltempo
const BRISK = 4.6;

export function createControls(camera, canvas, stickEl) {
  const state = { x: WORLD.start.x, z: WORLD.start.z, yaw: 0, pitch: 0, enabled: false };
  const keys = new Set();
  const stick = { id: null, ox: 0, oy: 0, dx: 0, dy: 0 };
  const look = { id: null, x: 0, y: 0 };
  let y = groundAt(state.x, state.z) + EYE;
  let bob = 0;
  const knob = stickEl.firstElementChild;

  function lookAt(tx, tz) {
    state.yaw = Math.atan2(-(tx - state.x), -(tz - state.z));
    state.pitch = -0.04;
  }

  function place(x, z, tx, tz) {
    state.x = x;
    state.z = z;
    y = groundAt(x, z) + EYE;
    lookAt(tx, tz);
  }

  window.addEventListener('keydown', (e) => {
    if (e.target instanceof HTMLButtonElement && (e.code === 'Space' || e.code === 'Enter')) return;
    keys.add(e.code);
    if (e.code.startsWith('Arrow')) e.preventDefault();
  });
  window.addEventListener('keyup', (e) => keys.delete(e.code));
  window.addEventListener('blur', () => keys.clear());

  canvas.addEventListener('pointerdown', (e) => {
    if (!state.enabled) return;
    canvas.setPointerCapture(e.pointerId);
    const leftThumb = e.pointerType === 'touch' && e.clientX < window.innerWidth * 0.45;
    if (leftThumb && stick.id === null) {
      Object.assign(stick, { id: e.pointerId, ox: e.clientX, oy: e.clientY, dx: 0, dy: 0 });
      stickEl.style.left = `${e.clientX}px`;
      stickEl.style.top = `${e.clientY}px`;
      stickEl.classList.add('on');
      knob.style.transform = 'translate(-50%, -50%)';
    } else if (look.id === null) {
      Object.assign(look, { id: e.pointerId, x: e.clientX, y: e.clientY });
    }
  });

  canvas.addEventListener('pointermove', (e) => {
    if (e.pointerId === stick.id) {
      const R = 52;
      let dx = e.clientX - stick.ox;
      let dy = e.clientY - stick.oy;
      const len = Math.hypot(dx, dy);
      if (len > R) {
        dx *= R / len;
        dy *= R / len;
      }
      stick.dx = dx / R;
      stick.dy = dy / R;
      knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
    } else if (e.pointerId === look.id) {
      const k = e.pointerType === 'touch' ? 0.0052 : 0.0034;
      state.yaw -= (e.clientX - look.x) * k;
      state.pitch -= (e.clientY - look.y) * k;
      state.pitch = Math.max(-1.2, Math.min(1.2, state.pitch));
      look.x = e.clientX;
      look.y = e.clientY;
    }
  });

  const release = (e) => {
    if (e.pointerId === stick.id) {
      stick.id = null;
      stick.dx = stick.dy = 0;
      stickEl.classList.remove('on');
    }
    if (e.pointerId === look.id) look.id = null;
  };
  canvas.addEventListener('pointerup', release);
  canvas.addEventListener('pointercancel', release);

  const walkable = (x, z) =>
    Math.hypot(x, z) < WORLD.walkRadius && groundAt(x, z) > WORLD.waterLevel - 0.12;

  function update(dt) {
    let fwd = -stick.dy;
    let side = stick.dx;
    let turn = 0;
    if (state.enabled) {
      if (keys.has('KeyW') || keys.has('ArrowUp')) fwd += 1;
      if (keys.has('KeyS') || keys.has('ArrowDown')) fwd -= 1;
      if (keys.has('KeyD')) side += 1;
      if (keys.has('KeyA')) side -= 1;
      if (keys.has('ArrowLeft') || keys.has('KeyQ')) turn += 1;
      if (keys.has('ArrowRight') || keys.has('KeyE')) turn -= 1;
    }
    state.yaw += turn * dt * 1.5;

    const mag = Math.min(1, Math.hypot(fwd, side));
    if (mag > 0.05) {
      const brisk = keys.has('ShiftLeft') || keys.has('ShiftRight');
      const speed = (brisk ? BRISK : WALK) * mag;
      const n = Math.hypot(fwd, side);
      const sin = Math.sin(state.yaw);
      const cos = Math.cos(state.yaw);
      const vx = ((-sin * fwd + cos * side) / n) * speed * dt;
      const vz = ((-cos * fwd - sin * side) / n) * speed * dt;
      // Langs het water en de rand glijden in plaats van vastlopen.
      if (walkable(state.x + vx, state.z + vz)) {
        state.x += vx;
        state.z += vz;
      } else if (walkable(state.x + vx, state.z)) {
        state.x += vx;
      } else if (walkable(state.x, state.z + vz)) {
        state.z += vz;
      }
      bob += speed * dt * 3.1;
    }

    const target = groundAt(state.x, state.z) + EYE;
    y += (target - y) * Math.min(1, dt * 9);
    camera.position.set(state.x, y + Math.sin(bob) * 0.022 * mag, state.z);
    camera.rotation.set(state.pitch, state.yaw, 0, 'YXZ');
  }

  return { state, update, place, lookAt };
}
