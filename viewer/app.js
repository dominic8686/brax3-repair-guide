import { createScene } from './scene.js';
import { GROUPS, setAssemblyProgress } from './assembly.js';

const $ = (id) => document.getElementById(id);
let viewer, parts = [], selected = null, isolated = null;
let progress = 0, playing = false, direction = 1, previousTime = 0;
for (const group of GROUPS) $('group').add(new Option(group, group));

function setProgress(value) {
  progress = Math.max(0, Math.min(1, value));
  setAssemblyProgress(parts, progress);
  $('progress').value = String(Math.round(progress * 1000));
  $('progress-value').value = `${Math.round(progress * 100)}%`;
  $('progress').setAttribute('aria-valuetext', `${Math.round(progress * 100)} percent separated`);
  $('pose-label').textContent = progress === 0 ? 'Assembled' : progress === 1 ? 'Exploded view' : 'Inside the Brax3';
  $('pose-note').textContent = progress === 0 ? 'All components in their CAD positions.' : `${parts.length} components. Explore every layer.`;
  updatePlayButton();
}
function updatePlayButton() {
  $('play').textContent = playing ? 'Ⅱ Pause' : progress === 1 || (direction < 0 && progress > 0) ? '▶ Play assembly' : '▶ Play teardown';
}
function pause() { playing = false; updatePlayButton(); }
function start(targetDirection) {
  if (isolated) { isolated = null; applyVisibility(); selectPart(selected); }
  direction = targetDirection;
  if ((progress === 0 && direction < 0) || (progress === 1 && direction > 0)) return;
  const original = progress;
  setAssemblyProgress(parts, 1);
  viewer.fit();
  setAssemblyProgress(parts, original);
  playing = true;
  updatePlayButton();
  $('status').textContent = direction > 0 ? 'Playing illustrative teardown' : 'Returning components to their CAD positions';
}
function applyVisibility() {
  for (const part of parts) part.mesh.visible = !part.hidden && (!isolated || isolated === part);
  $('show-all').disabled = !parts.some(p => p.hidden) && !isolated;
  renderList();
}
function renderList() {
  const query = $('search').value.trim().toLowerCase(), group = $('group').value;
  const shown = parts.filter(p => (!group || p.group === group) && `${p.label} ${p.cadName} ${p.id}`.toLowerCase().includes(query));
  const fragment = document.createDocumentFragment();
  for (const part of shown) {
    const row = document.createElement('button');
    row.className = 'part-row'; row.dataset.partId = part.id;
    row.setAttribute('aria-pressed', String(selected === part));
    const number = document.createElement('span'); number.className = 'number'; number.textContent = part.id.slice(-3);
    const text = document.createElement('span'); text.className = 'part-text';
    const title = document.createElement('strong'); title.textContent = part.label;
    const cad = document.createElement('small'); cad.textContent = part.cadName;
    text.append(title, cad); row.append(number, text);
    if (!part.mesh.visible) { const hidden = document.createElement('span'); hidden.className = 'visibility'; hidden.textContent = 'Hidden'; row.append(hidden); }
    row.onclick = () => selectPart(part);
    fragment.append(row);
  }
  if (!shown.length) { const empty = document.createElement('p'); empty.className = 'empty'; empty.textContent = 'No matching components.'; fragment.append(empty); }
  const focusId = document.activeElement?.dataset.partId;
  $('part-list').replaceChildren(fragment);
  if (focusId) $('part-list').querySelector(`[data-part-id="${focusId}"]`)?.focus({preventScroll: true});
  $('list-count').textContent = `${shown.length} / ${parts.length}`;
}
function selectPart(part) {
  selected = part; viewer?.select(part);
  $('part-title').textContent = part?.label || 'Explore the assembly';
  $('part-cad').textContent = part?.cadName || 'Select a part in the model or the list.';
  $('part-meta').hidden = !part;
  if (part) {
    $('part-group').textContent = part.group;
    $('part-size').textContent = `${part.size.map(v => v.toFixed(1)).join(' × ')} mm`;
  }
  $('focus').disabled = !part || !part.mesh.visible;
  $('isolate').disabled = !part; $('hide').disabled = !part;
  $('hide').textContent = part?.hidden ? 'Show' : 'Hide';
  $('isolate').setAttribute('aria-pressed', String(!!part && isolated === part));
  $('isolate').textContent = isolated ? 'Exit isolate' : 'Isolate';
  renderList();
  if (part) $('status').textContent = `${part.label} · ${part.cadName}`;
}

$('progress').addEventListener('input', () => { pause(); direction = 1; setProgress(Number($('progress').value) / 1000); viewer.fit(); });
$('play').onclick = () => playing ? pause() : start(progress === 1 ? -1 : progress === 0 ? 1 : direction);
$('assemble').onclick = () => { pause(); start(-1); };
$('reset').onclick = () => {
  pause(); direction = 1; isolated = null; for (const p of parts) p.hidden = false;
  setProgress(0); applyVisibility(); selectPart(null); viewer.fit(true);
  $('status').textContent = 'Assembly restored · all components shown';
};
$('fit').onclick = () => viewer?.fit();
document.querySelectorAll('[data-view]').forEach(button => { button.onclick = () => viewer?.preset(button.dataset.view); });
$('search').addEventListener('input', renderList); $('group').addEventListener('change', renderList);
$('focus').onclick = () => { pause(); viewer.focus(selected); };
$('isolate').onclick = () => { pause(); isolated = isolated ? null : selected; if (isolated) isolated.hidden = false; applyVisibility(); selectPart(selected); viewer.fit(); };
$('hide').onclick = () => {
  if (!selected) return;
  selected.hidden = !selected.hidden;
  if (isolated === selected && selected.hidden) isolated = null;
  applyVisibility(); selectPart(selected);
};
$('show-all').onclick = () => { isolated = null; for (const p of parts) p.hidden = false; applyVisibility(); selectPart(selected); viewer.fit(); };
$('retry').onclick = () => location.reload();
document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });

function frame(time) {
  const dt = previousTime ? Math.min((time - previousTime) / 1000, 0.1) : 0;
  previousTime = time;
  if (playing) {
    setProgress(progress + direction * dt / 8 * Number($('speed').value));
    if (progress === 0 || progress === 1) {
      if ($('loop').checked) direction *= -1;
      else { pause(); $('status').textContent = progress === 0 ? 'Reassembly complete · original CAD positions restored' : 'Teardown complete · select any part to inspect'; }
    }
  }
  viewer?.render(); requestAnimationFrame(frame);
}

try {
  viewer = createScene($('canvas-host'), selectPart);
  requestAnimationFrame(frame);
  parts = await viewer.load(event => { if (event.total) $('load-label').textContent = `Loading component geometry… ${Math.round(event.loaded / event.total * 100)}%`; });
  $('loading').hidden = true;
  $('part-count').textContent = String(parts.length);
  $('model-summary').textContent = `${parts.length} components · Brax3`;
  for (const id of ['progress', 'play', 'assemble', 'reset']) $(id).disabled = false;
  $('status').textContent = `${parts.length} components ready · drag to orbit or play the teardown`;
  setProgress(0); renderList();
  window.e11 = { snapshot: () => ({progress, playing, direction, selected: selected?.id || null,
    isolated: isolated?.id || null, parts: parts.map(p => ({id:p.id, visible:p.mesh.visible, position:p.mesh.position.toArray(), base:p.base.toArray(), offset:p.offset.toArray()})),
    bounds: {min: parts.reduce((a,p)=>a.map((v,i)=>Math.min(v,p.mesh.userData.min[i])), [Infinity,Infinity,Infinity]),
             max: parts.reduce((a,p)=>a.map((v,i)=>Math.max(v,p.mesh.userData.max[i])), [-Infinity,-Infinity,-Infinity])}}) };
} catch (error) {
  console.error(error); $('loading').classList.add('error');
  $('load-label').textContent = 'The 3D model could not load. Check that the local server is running and WebGL is available.';
  $('retry').hidden = false; $('status').textContent = 'Model loading failed';
}
