import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const roots = ['src', 'push-service'];
const files = [];
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (entry.isFile() && full.endsWith('.js')) files.push(full);
  }
}
for (const root of roots) walk(root);
let failed = false;
for (const file of files) {
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (result.status !== 0) {
    failed = true;
    console.error(`SYNTAX ERROR: ${file}\n${result.stderr}`);
  }
}
if (failed) process.exit(1);
console.log(`SYNTAX CHECK PASSED: ${files.length} JavaScript files`);
