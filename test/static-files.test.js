import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('all same-origin service-worker app-shell paths exist', () => {
  const source = fs.readFileSync(path.join(root, 'service-worker.js'), 'utf8');
  const arrayBody = source.match(/const APP_SHELL = \[([\s\S]*?)\];/)?.[1];
  assert.ok(arrayBody, 'APP_SHELL array should exist');
  const files = [...arrayBody.matchAll(/'([^']+)'/g)].map(match => match[1]);
  assert.ok(files.length >= 20);
  for (const relative of files) {
    const localPath = relative === './' ? 'index.html' : relative.replace(/^\.\//, '');
    assert.ok(fs.existsSync(path.join(root, localPath)), `Missing app-shell file: ${relative}`);
  }
});

test('PWA manifest includes valid app identity, scope and install icons', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.webmanifest'), 'utf8'));
  assert.equal(manifest.start_url, './');
  assert.equal(manifest.scope, './');
  assert.equal(manifest.display, 'standalone');
  assert.ok(manifest.icons.some(icon => icon.sizes === '192x192'));
  assert.ok(manifest.icons.some(icon => icon.sizes === '512x512'));
  for (const icon of manifest.icons) assert.ok(fs.existsSync(path.join(root, icon.src.replace(/^\.\//,''))));
});

test('food master has 41 unique linked entries and does not invent nutrition values', () => {
  const master = JSON.parse(fs.readFileSync(path.join(root, 'data/food-master.json'), 'utf8'));
  const ids = master.foods.map(item => item.foodId);
  assert.equal(master.foods.length, 41);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(master.foods.every(item => item.status === 'needs_verification'));
  assert.ok(master.foods.every(item => Object.values(item.nutritionPer100g).every(value => value === null)));
});

test('repository sources do not include the provided personal profile measurements', () => {
  const checkedFiles = ['index.html','src/app.js','data/21-day-fat-loss-plan.json','README.md','test/core.test.js'];
  for (const relative of checkedFiles) {
    const content = fs.readFileSync(path.join(root, relative), 'utf8');
    assert.equal(content.includes('77.6'), false, `${relative} contains the private starting weight`);
    assert.equal(content.includes('91.44'), false, `${relative} contains the private waist in cm`);
    assert.equal(content.includes('Somnath'), false, `${relative} contains the user's name`);
  }
});
