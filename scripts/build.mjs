import { copyFile, cp, mkdir } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const destination = new URL('dist/', root);
await mkdir(destination, { recursive: true });

// Explicit public file list: never copy the workspace's native CAD archives,
// certification reports, local deployment credentials, or inspection outputs.
const files = [
  'index.html', 'app.js', 'assembly.js', 'scene.js', 'materials.js', 'style.css',
  'guide.html', 'guide.js', 'guide-model.js', 'guide-steps.js', 'guide-data.json', 'guide.css',
  'guide-sample.html', 'guide-sample.js', 'guide-sample.css',
  'simple.html', 'model-viewer.min.js', 'model-viewer-LICENSE',
];
for (const file of files) {
  await copyFile(new URL(`viewer/${file}`, root), new URL(file, destination));
}
for (const directory of ['vendor', 'materials', 'guide-assets']) {
  await cp(new URL(`viewer/${directory}/`, root), new URL(`${directory}/`, destination), { recursive: true });
}
for (const [source, target] of [
  ['e11-components.glb', 'components.glb'],
  ['e11-components.json', 'components.json'],
  ['e11-5g-assembly.glb', 'assembly.glb'],
]) {
  await copyFile(new URL(`model/${source}`, root), new URL(target, destination));
}
await copyFile(new URL('THIRD_PARTY_NOTICES.md', root), new URL('THIRD_PARTY_NOTICES.md', destination));
console.log('Static site built in dist/');
