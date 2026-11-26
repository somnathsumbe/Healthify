import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
fs.rmSync(dist, { recursive: true, force: true });
fs.mkdirSync(dist, { recursive: true });
for (const entry of ['index.html', 'manifest.webmanifest', 'service-worker.js', 'assets', 'data', 'src']) {
  fs.cpSync(path.join(root, entry), path.join(dist, entry), { recursive: true });
}
console.log('Static PWA build created in dist/');
