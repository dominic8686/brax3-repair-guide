import * as THREE from 'three';
import { OrbitControls } from './vendor/controls/OrbitControls.js';
import { GLTFLoader } from './vendor/loaders/GLTFLoader.js';
import { configureParts } from './assembly.js';
import { applyMaterials } from './materials.js';

export function createScene(host, onSelect, options = {}) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setClearColor(0x11171e, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.35;
  renderer.domElement.tabIndex = 0;
  renderer.domElement.setAttribute('aria-label', 'Brax3 3D assembly. Drag to orbit, scroll to zoom, right-drag or arrow keys to pan. Select a component in the parts panel for keyboard access.');
  host.append(renderer.domElement);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(36, 1, 0.001, 20);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.minDistance = 0.012;
  controls.maxDistance = 2;
  controls.listenToKeyEvents(renderer.domElement);
  scene.add(new THREE.HemisphereLight(0xe6f2ff, 0x4b4a47, 2.7));
  for (const [position, intensity, color] of [[[1, 2, 3], 3.8, 0xfff1df], [[-2, 0, -2], 3, 0xb7d8ff], [[0, -2, 1], 1, 0xffffff]]) {
    const light = new THREE.DirectionalLight(color, intensity);
    light.position.set(...position);
    scene.add(light);
  }
  const raycaster = new THREE.Raycaster(), pointer = new THREE.Vector2();
  let parts = [], root, down, updateMaterials = () => {};
  const selectionBox = new THREE.Box3Helper(new THREE.Box3(), 0xef9d73);
  selectionBox.material.depthTest = false;
  selectionBox.material.transparent = true;
  selectionBox.material.opacity = 0.65;
  selectionBox.visible = false;
  scene.add(selectionBox);
  let selected = null;

  function fit(box, resetDirection = false) {
    if (box.isEmpty()) return;
    const center = box.getCenter(new THREE.Vector3());
    const direction = resetDirection ? new THREE.Vector3(1.1, 0.4, 1.5).normalize()
      : camera.position.clone().sub(controls.target).normalize();
    if (!direction.lengthSq()) direction.set(1, 0.3, 1).normalize();
    const right = new THREE.Vector3().crossVectors(camera.up, direction).normalize();
    const up = new THREE.Vector3().crossVectors(direction, right).normalize();
    const tanV = Math.tan(camera.fov * Math.PI / 360), tanH = tanV * camera.aspect;
    let distance = 0.025;
    for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) {
      const point = new THREE.Vector3(x, y, z).sub(center);
      distance = Math.max(distance, point.dot(direction) + Math.max(Math.abs(point.dot(right)) / tanH, Math.abs(point.dot(up)) / tanV) * 1.22);
    }
    controls.target.copy(center);
    camera.position.copy(center).addScaledVector(direction, distance);
    controls.update();
  }
  function visibleBounds() {
    const bounds = new THREE.Box3();
    for (const part of parts) if (part.mesh.visible) bounds.expandByObject(part.mesh);
    return bounds;
  }
  const observer = new ResizeObserver(() => {
    const {width, height} = host.getBoundingClientRect();
    camera.aspect = width / Math.max(1, height);
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
  });
  observer.observe(host);
  renderer.domElement.addEventListener('pointerdown', (event) => { down = [event.clientX, event.clientY]; });
  renderer.domElement.addEventListener('pointerup', (event) => {
    if (!down || event.button !== 0 || Math.hypot(event.clientX - down[0], event.clientY - down[1]) > 5) return;
    const box = renderer.domElement.getBoundingClientRect();
    pointer.set((event.clientX - box.left) / box.width * 2 - 1, -(event.clientY - box.top) / box.height * 2 + 1);
    raycaster.setFromCamera(pointer, camera);
    const hit = raycaster.intersectObjects(parts.filter(p => p.mesh.visible).map(p => p.mesh), false)[0];
    onSelect(hit?.object.userData.part || null);
  });
  return {
    renderer, camera, controls, scene,
    async load(onProgress) {
      const gltf = await new GLTFLoader().loadAsync('/components.glb', onProgress);
      root = gltf.scene;
      scene.add(root);
      parts = configureParts(root);
      if (options.materials !== false) updateMaterials = await applyMaterials(parts, renderer);
      fit(visibleBounds(), true);
      return parts;
    },
    select(part) {
      if (selected) { selected.mesh.material.emissive.setHex(0); selected.mesh.material.emissiveIntensity = 0; }
      selected = part;
      if (part) { part.mesh.material.emissive.setHex(0xc47143); part.mesh.material.emissiveIntensity = 0.3; }
      selectionBox.visible = !!part && part.mesh.visible;
    },
    fit(resetDirection = false) { fit(visibleBounds(), resetDirection); },
    focus(part) { if (part?.mesh.visible) fit(new THREE.Box3().setFromObject(part.mesh)); },
    preset(view) {
      const directions = {front: [0, 0, 1], rear: [0, 0, -1], side: [1, 0, 0], iso: [1.1, 0.4, 1.5]};
      camera.position.copy(controls.target).add(new THREE.Vector3(...directions[view]));
      fit(visibleBounds());
    },
    render() {
      updateMaterials();
      controls.update();
      if (selected?.mesh.visible) {
        selectionBox.box.setFromObject(selected.mesh);
        selectionBox.visible = true;
      } else selectionBox.visible = false;
      renderer.render(scene, camera);
    },
  };
}
