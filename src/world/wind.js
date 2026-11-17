// Wind: laat begroeiing zacht meebewegen. Eén gedeelde klok voor alles.
export const windUniform = { value: 0 };

// strength: uitslag; power: hoe sterk de uitslag met de hoogte toeneemt.
export function addWind(material, strength, power = 2) {
  const bend = power === 2 ? 'position.y * position.y' : 'position.y';
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = windUniform;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        #ifdef USE_INSTANCING
          float ph = instanceMatrix[3].x * 0.35 + instanceMatrix[3].z * 0.27;
          float sway = sin(uTime * 1.3 + ph) + 0.5 * sin(uTime * 2.9 + ph * 1.7);
          float flutter = sin(uTime * 3.7 + position.x * 4.0 + position.z * 3.0 + ph) * ${(power === 2 ? 0 : 0.012).toFixed(3)};
          transformed.x += sway * ${strength.toFixed(4)} * ${bend} + flutter;
          transformed.z += cos(uTime * 1.1 + ph) * ${(strength * 0.6).toFixed(4)} * ${bend} + flutter;
        #endif`,
      );
  };
  return material;
}
