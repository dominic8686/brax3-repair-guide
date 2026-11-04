import * as THREE from 'three';

// Photo projection is an assembled appearance reference, not a factory UV/PBR map.
// The photograph sees through the clear cover, so fade it out before separating
// that cover: otherwise the photographed battery would incorrectly move with it.
export async function applyMaterials(parts, renderer) {
  const [photo, response] = await Promise.all([
    new THREE.TextureLoader().loadAsync('/materials/brax3-rear-photo.jpg'),
    fetch('/materials/cad-colors.json'),
  ]);
  if (!response.ok) throw new Error('CAD material colors could not be loaded');
  const cadColors = await response.json();
  photo.colorSpace = THREE.SRGBColorSpace;
  photo.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  let photoMode = true;
  const projections = [];

  function finish(part) {
    const n = Number(part.id.slice(5));
    const name = part.cadName.toUpperCase();
    let color = 0x30363b, roughness = .64, metalness = .1;
    if (/FPC|TONGBO/.test(name)) { color = 0x91622c; roughness = .4; metalness = .35; }
    if (/RUB|FOAM|PORON|FILM|GLUE|ADH|JIAO|SHI_MO/.test(name)) { color = 0x232528; roughness = .86; metalness = 0; }
    if (part.group === 'Fasteners' || /SUS|LV_TAI|^HD_/.test(name)) { color = 0x8a9195; roughness = .3; metalness = .8; }
    if ([49,67,87,99,100].includes(n)) { color = 0x101722; roughness = .18; metalness = .22; }
    if (n === 95) { color = 0x333a40; roughness = .28; metalness = .12; }
    if (n === 101) { color = 0xe3e4cf; roughness = .24; metalness = 0; }
    if (name.startsWith('PCB')) { color = 0x26433b; roughness = .6; metalness = .1; }
    return { color, roughness, metalness };
  }

  for (const part of parts) {
    const material = part.mesh.material;
    part.finish = finish(part);
    part.cadColor = cadColors[part.cadName];
    if (![95,99,100].includes(Number(part.id.slice(5)))) continue;
    const positions = part.mesh.geometry.attributes.position;
    const normals = part.mesh.geometry.attributes.normal;
    const projection = new Float32Array(positions.count * 3);
    // Calibrated against four corners of the actual Brax3 rear photograph.
    const h = [0.6616822429906542,0.06486783650060171,0.21495327102803738,0,0.41091745746477193,0.2658385093167702,0,0.12559618441971382,1];
    for (let i = 0; i < positions.count; i++) {
      const u = (positions.getY(i) + part.base.y + .11484) / .1679;
      const v = (positions.getX(i) + part.base.x + .0383) / .0766;
      const d = h[6]*u + h[7]*v + 1;
      projection[i*3] = (h[0]*u+h[1]*v+h[2])/d;
      projection[i*3+1] = (h[3]*u+h[4]*v+h[5])/d;
      const exterior = positions.getZ(i) + part.base.z < -.003;
      projection[i*3+2] = exterior ? THREE.MathUtils.smoothstep(-normals.getZ(i), .5, .95) : 0;
    }
    part.mesh.geometry.setAttribute('photoProjection', new THREE.BufferAttribute(projection, 3));
    const amount = { value: 1 };
    material.onBeforeCompile = (shader) => {
      shader.uniforms.braxPhoto = { value: photo };
      shader.uniforms.braxPhotoAmount = amount;
      shader.uniforms.braxPartOrigin = { value: part.base };
      shader.vertexShader = 'attribute vec3 photoProjection; varying vec3 vPhotoProjection; varying vec2 vBraxPlane; uniform vec3 braxPartOrigin;\n' + shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvPhotoProjection = photoProjection; vBraxPlane = position.xy + braxPartOrigin.xy;');
      shader.fragmentShader = 'uniform sampler2D braxPhoto; uniform float braxPhotoAmount; varying vec3 vPhotoProjection; varying vec2 vBraxPlane;\n' + shader.fragmentShader;
      shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
        vec3 photographed = texture2D(braxPhoto, vPhotoProjection.xy).rgb;
        // The supplied CAD has a different flash aperture from the test unit.
        // Keep its real camera geometry instead of printing duplicate apertures.
        float cameraArea = smoothstep(-0.003, 0.001, vBraxPlane.y) * smoothstep(0.003, 0.007, vBraxPlane.x);
        diffuseColor.rgb = mix(diffuseColor.rgb, photographed, vPhotoProjection.z * braxPhotoAmount * (1.0-cameraArea));
      `);
    };
    material.customProgramCacheKey = () => 'brax3-photo-projection-v1';
    material.needsUpdate = true;
    projections.push({ part, amount });
  }

  const button = document.getElementById('material-mode');
  function setMode() {
    for (const part of parts) {
      const material = part.mesh.material;
      material.color.setHex(part.finish.color);
      material.roughness = part.finish.roughness;
      material.metalness = part.finish.metalness;
      if (!photoMode && part.cadColor) material.color.setRGB(...part.cadColor, THREE.SRGBColorSpace);
    }
    if (button) {
      button.textContent = photoMode ? 'Photo finish' : 'CAD colors';
      button.setAttribute('aria-pressed', String(photoMode));
      button.disabled = false;
    }
  }
  button?.addEventListener('click', () => { photoMode = !photoMode; setMode(); });
  setMode();
  return () => {
    for (const {part,amount} of projections) {
      const separation = part.mesh.position.distanceTo(part.base);
      amount.value = photoMode ? 1 - THREE.MathUtils.smoothstep(separation, .0005, .008) : 0;
    }
  };
}
