import * as THREE from 'three';
import { createScene } from './scene.js';

const $ = (id) => document.getElementById(id);
const host = $('guide-canvas');
const poses = [...document.querySelectorAll('[data-pose]')];
let viewer, cover, progress = 0.5, playing = false, lastTime = 0, labels = true;
const removal = new THREE.Vector3(0.055, 0, -0.095);
const bodyCenter = new THREE.Vector3(0, -0.031, 0);

function setProgress(value) {
  progress = Math.max(0, Math.min(1, value));
  cover.mesh.position.copy(cover.base).addScaledVector(removal, progress);
  const percent = Math.round(progress * 100);
  $('guide-progress').value = String(Math.round(progress * 1000));
  $('guide-progress').setAttribute('aria-valuetext', `Cover removal ${percent}%`);
  $('guide-percent').value = `${percent}%`;
  for (const button of poses) button.setAttribute('aria-pressed', String(Math.abs(Number(button.dataset.pose) - progress) < 0.001));
}

function setPlaying(value) {
  playing = value;
  $('guide-play').textContent = playing ? 'Ⅱ Pause this step' : progress === 1 ? '↻ Replay this step' : '▶ Play this step';
}

function resetCamera() {
  cover.mesh.position.copy(cover.base).add(removal);
  viewer.camera.position.copy(viewer.controls.target).add(new THREE.Vector3(-1.15, 0.45, -1.8));
  viewer.fit();
  setProgress(progress);
}

function positionLabel(element, point, offset) {
  const projected = point.clone().project(viewer.camera);
  element.hidden = !labels || projected.z > 1 || projected.z < -1;
  const width = host.clientWidth, height = host.clientHeight;
  const half = element.offsetWidth / 2 + 10;
  element.style.left = `${Math.max(half, Math.min(width - half, (projected.x + 1) * width / 2))}px`;
  element.style.top = `${Math.max(65, Math.min(height - 100, (1 - projected.y) * height / 2 + offset))}px`;
}

async function init() {
  try {
    viewer = createScene(host, () => {});
    viewer.renderer.domElement.setAttribute('aria-label', 'Brax3 rear cover removal illustration. Drag to rotate, scroll to zoom, or use the step controls below.');
    const parts = await viewer.load();
    cover = parts.find(part => part.id === 'part-095');
    if (!cover) throw new Error('Rear cover is missing from this model.');
    for (const part of parts) {
      part.mesh.material.color.setHex(part === cover ? 0xd99b72 : 0x859598);
      part.mesh.material.metalness = part === cover ? 0.15 : 0.35;
      part.mesh.material.roughness = 0.5;
    }
    resetCamera();
    $('guide-loading').hidden = true;
    document.querySelectorAll('button, input').forEach(element => { element.disabled = false; });
    $('guide-status').textContent = `${parts.length} CAD components · rear cover highlighted`;
    for (const button of poses) button.addEventListener('click', () => {
      setProgress(Number(button.dataset.pose));
      setPlaying(false);
    });
    $('guide-progress').addEventListener('input', event => {
      setProgress(Number(event.target.value) / 1000);
      setPlaying(false);
    });
    $('guide-play').addEventListener('click', () => {
      if (!playing && progress === 1) setProgress(0);
      setPlaying(!playing);
    });
    $('guide-angle').addEventListener('click', resetCamera);
    $('guide-labels').addEventListener('click', () => {
      labels = !labels;
      $('guide-labels').textContent = labels ? 'Labels on' : 'Labels off';
      $('guide-labels').setAttribute('aria-pressed', String(labels));
    });
    document.addEventListener('visibilitychange', () => { if (document.hidden) setPlaying(false); });
    function animate(time) {
      const delta = Math.min((time - lastTime) / 1000, 0.05);
      lastTime = time;
      if (playing) {
        setProgress(progress + delta / 5);
        if (progress === 1) setPlaying(false);
      }
      viewer.render();
      positionLabel($('cover-label'), cover.mesh.position, 80);
      positionLabel($('body-label'), bodyCenter, -100);
      requestAnimationFrame(animate);
    }
    requestAnimationFrame(animate);
  } catch (error) {
    $('guide-loading').textContent = 'The 3D illustration could not load. Refresh to try again.';
    $('guide-status').textContent = error.message;
    $('cover-label').hidden = $('body-label').hidden = true;
    console.error(error);
  }
}
init();
