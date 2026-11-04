import http from 'node:http';
import fs from 'node:fs';

const routes = new Map([
  ['/', [new URL('./index.html', import.meta.url), 'text/html; charset=utf-8']],
  ['/guide', [new URL('./guide.html', import.meta.url), 'text/html; charset=utf-8']],
  ['/guide-sample', [new URL('./guide-sample.html', import.meta.url), 'text/html; charset=utf-8']],
  ['/guide-data.json', [new URL('./guide-data.json', import.meta.url), 'application/json']],
  ['/simple', [new URL('./simple.html', import.meta.url), 'text/html; charset=utf-8']],
  ['/model-viewer.min.js', [new URL('./model-viewer.min.js', import.meta.url), 'text/javascript']],
  ['/assembly.glb', [new URL('../model/e11-5g-assembly.glb', import.meta.url), 'model/gltf-binary']],
  ['/components.glb', [new URL('../model/e11-components.glb', import.meta.url), 'model/gltf-binary']],
  ['/components.json', [new URL('../model/e11-components.json', import.meta.url), 'application/json']],
]);
for (const file of ['guide.js', 'guide-sample.js', 'guide-model.js', 'guide-steps.js', 'app.js', 'scene.js', 'materials.js', 'assembly.js', 'vendor/three.module.min.js', 'vendor/three.core.min.js', 'vendor/loaders/GLTFLoader.js', 'vendor/controls/OrbitControls.js', 'vendor/utils/BufferGeometryUtils.js', 'vendor/utils/SkeletonUtils.js']) {
  routes.set(`/${file}`, [new URL(`./${file}`, import.meta.url), 'text/javascript']);
}
routes.set('/style.css', [new URL('./style.css', import.meta.url), 'text/css']);
routes.set('/guide.css', [new URL('./guide.css', import.meta.url), 'text/css']);
routes.set('/guide-sample.css', [new URL('./guide-sample.css', import.meta.url), 'text/css']);
for(let i=0;i<13;i++) routes.set(`/guide-assets/tool-${i}.jpg`,[new URL(`./guide-assets/tool-${i}.jpg`,import.meta.url),'image/jpeg']);
routes.set('/materials/brax3-rear-photo.jpg', [new URL('./materials/brax3-rear-photo.jpg', import.meta.url), 'image/jpeg']);
routes.set('/materials/cad-colors.json', [new URL('./materials/cad-colors.json', import.meta.url), 'application/json']);
for (const name of ['battery-label','nfc-markings','brax-logo','lens','lens-2x','keyshot-reference']) routes.set(`/guide-assets/brax3/${name}.webp`, [new URL(`./guide-assets/brax3/${name}.webp`, import.meta.url), 'image/webp']);
const port = Number(process.env.PORT || 4317);
http.createServer((req, res) => {
  if (req.url === '/favicon.ico') { res.writeHead(204).end(); return; }
  const route = routes.get(new URL(req.url, 'http://localhost').pathname);
  if (!route || !['GET', 'HEAD'].includes(req.method)) {
    res.writeHead(404).end('Not found');
    return;
  }
  fs.stat(route[0], (error, stat) => {
    if (error) { res.writeHead(404).end('File not ready'); return; }
    res.writeHead(200, { 'Content-Type': route[1], 'Content-Length': stat.size, 'Cache-Control': 'no-cache' });
    if (req.method === 'HEAD') { res.end(); return; }
    fs.createReadStream(route[0]).on('error', () => res.destroy()).pipe(res);
  });
}).listen(port, '127.0.0.1', () => console.log(`Viewer: http://127.0.0.1:${port}`));
