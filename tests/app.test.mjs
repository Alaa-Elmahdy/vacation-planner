import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const html = readFileSync('src/index.html', 'utf8');

test('PWA files and metadata exist', () => {
  assert.match(html, /rel="manifest" href="\/manifest\.webmanifest"/);
  assert.match(html, /registerPwa\(\)/);
  for (const file of ['src/manifest.webmanifest', 'src/sw.js', 'src/icons/app-icon.svg', 'src/js/pwa.js']) assert.equal(existsSync(file), true, file);
  const manifest = JSON.parse(readFileSync('src/manifest.webmanifest', 'utf8'));
  assert.equal(manifest.display, 'standalone');
  assert.equal(manifest.dir, 'rtl');
});

test('primary application screens and navigation exist', () => {
  for (const id of ['overviewTab','calendarTab','purchasesTab','restaurantsTab','placesTab','expensesTab','profileTab','appSubscreen']) assert.match(html, new RegExp(`id="${id}"`), id);
  for (const tab of ['overviewTab','calendarTab','purchasesTab','restaurantsTab','placesTab','profileTab']) assert.match(html, new RegExp(`data-tab="${tab}"`), tab);
});

test('expenses remain admin-only and have API-side enforcement marker', () => {
  assert.match(html, /class="admin-only hidden" data-tab="expensesTab"/);
  const api = readFileSync('api/src/functions/planner.js', 'utf8');
  assert.match(api, /if \(!isAdmin\(profile\)\).*المصاريف خاصة بالأدمن فقط/);
});

test('calendar uses one app month and opens a day screen', () => {
  assert.match(html, /const appMode=true/);
  assert.match(html, /openDayScreen\(c\.dataset\.date\)/);
  assert.match(html, /calendarPrev/);
  assert.match(html, /calendarNext/);
});

test('inline module JavaScript parses', () => {
  const match = html.match(/<script type="module">([\s\S]*?)<\/script>/);
  assert.ok(match);
  const source = match[1].replace(/^import .*$/gm, '');
  const result = spawnSync(process.execPath, ['--check', '--input-type=module'], { input: source, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
});

test('extracted modules parse', () => {
  for (const file of ['src/js/format.js','src/js/pwa.js','src/sw.js']) {
    const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
    assert.equal(result.status, 0, `${file}: ${result.stderr}`);
  }
});
