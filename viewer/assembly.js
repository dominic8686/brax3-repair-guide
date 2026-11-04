// Layout paths are illustrative: they are not a service or repair sequence.
import * as THREE from 'three';

export const GROUPS = ['Display', 'Frame', 'Rear cover', 'Cameras', 'Connectors', 'Side controls', 'Fasteners', 'Films & seals'];
const colors = [0x899eae, 0x929da5, 0x546779, 0x89aeb4, 0xd5b389, 0x88a396, 0xbdc5cc, 0xaea4b5];
const labels = {
  49: 'Display module', 50: 'Display flex cable', 51: 'Display film', 52: 'Display copper foil',
  59: 'Front cover / frame', 60: 'Internal frame', 67: 'Touch panel', 69: 'Receiver trim',
  79: 'Side key flex cable', 83: 'Battery adhesive', 87: 'LCD layer',
  95: 'Rear cover', 96: 'Volume key', 97: 'Volume key seal', 98: 'PCB holder',
  99: 'Rear lens · lower', 100: 'Rear lens · upper', 101: 'Rear flash lens',
};

export function configureParts(root) {
  const parts = [];
  root.traverse((mesh) => {
    if (!mesh.isMesh) return;
    const meta = mesh.userData;
    const n = Number(meta.id.split('-')[1]);
    let group = 'Films & seals', offset = [0, 0, 0.035 + (n % 5) * 0.003], start = 0.3;
    if ([49, 50, 51, 52, 67, 69, 87].includes(n)) {
      group = 'Display'; start = 0.05;
      const distance = {67: 0.155, 69: 0.156, 49: 0.125, 87: 0.097, 51: 0.084, 52: 0.075, 50: 0.062};
      offset = [0, 0, distance[n]];
    } else if ([59, 60].includes(n)) {
      group = 'Frame'; offset = [0, 0, n === 59 ? 0.028 : 0]; start = 0.2;
    } else if (n === 95) {
      group = 'Rear cover'; offset = [0, 0, -0.135]; start = 0;
    } else if ((n >= 2 && n <= 16) || n === 92 || n === 93 || n >= 99) {
      group = 'Cameras'; start = 0.25;
      if (n >= 99 && n <= 101) { offset = [0, 0, -0.17 - (n - 99) * 0.008]; start = 0.08; }
      else if (n >= 102) offset = [-0.032, 0.032, 0.03 + (n - 102) * 0.003];
      else offset = [0.027, 0.015, -0.053 - (n % 7) * 0.004];
    } else if (n < 2 || (n >= 17 && n <= 48) || n === 98) {
      group = 'Connectors'; start = 0.25;
      offset = n === 98 ? [0, 0, -0.096] : n < 2 ? [-0.018, 0.01, -0.048 - n * 0.007]
        : [meta.center[0] * 0.25, -0.032, -0.04 - (n % 5) * 0.003];
    } else if ((n >= 53 && n <= 58) || [79, 80, 81, 82, 94, 96, 97].includes(n)) {
      group = 'Side controls'; start = 0.25;
      offset = [meta.center[0] < 0 ? -0.045 : 0.045 + (n % 3) * 0.009, 0, (n % 4 - 1.5) * 0.006];
    } else if (n >= 61 && n <= 66) {
      group = 'Fasteners'; start = 0.35;
      offset = [meta.center[0] * 0.6, (meta.center[1] + 0.031) * 0.2, -0.032];
    }
    const material = mesh.material.clone();
    material.color.setHex(colors[GROUPS.indexOf(group)]);
    material.roughness = group === 'Fasteners' ? 0.3 : 0.56;
    material.metalness = group === 'Fasteners' ? 0.65 : 0.18;
    mesh.material = material;
    mesh.geometry.computeBoundingBox();
    const part = {mesh, id: meta.id, cadName: meta.name, label: labels[n] || `Component ${n + 1}`,
      group, base: mesh.position.clone(), offset: new THREE.Vector3(...offset), start,
      size: meta.max.map((v, i) => (v - meta.min[i]) * 1000), triangles: meta.triangles, hidden: false};
    mesh.userData.part = part;
    parts.push(part);
  });
  return parts;
}

export function setAssemblyProgress(parts, progress) {
  for (const part of parts) {
    const t = THREE.MathUtils.clamp((progress - part.start) / (1 - part.start), 0, 1);
    const eased = t * t * (3 - 2 * t);
    part.mesh.position.copy(part.base).addScaledVector(part.offset, eased);
  }
}
