import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tripStatus, selectActiveTrip, daysRemaining } from '../src/js/trips.js';
import { dashboardSummary } from '../src/js/dashboard.js';

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
  for (const file of ['src/js/format.js','src/js/pwa.js','src/js/trips.js','src/js/dashboard.js','src/js/dom.js','src/sw.js']) {
    const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
    assert.equal(result.status, 0, `${file}: ${result.stderr}`);
  }
});

test('trip lifecycle and automatic selection work', () => {
  const today = new Date('2026-07-20T00:00:00');
  const trips = [
    { id:'old', startDate:'2026-01-01', endDate:'2026-01-10' },
    { id:'current', startDate:'2026-07-16', endDate:'2026-08-23' },
    { id:'next', startDate:'2026-12-01', endDate:'2026-12-10' }
  ];
  assert.equal(tripStatus(trips[0], today), 'completed');
  assert.equal(tripStatus(trips[1], today), 'ongoing');
  assert.equal(tripStatus(trips[2], today), 'upcoming');
  assert.equal(selectActiveTrip(trips, '', '', today).id, 'current');
  assert.equal(daysRemaining(trips[1], today), 34);
});

test('dashboard summary finds pending tasks and next event', () => {
  const items = [
    { id:'1', kind:'event', type:'task', status:'planned', date:'2026-07-21', time:'10:00' },
    { id:'2', kind:'event', type:'activity', status:'planned', date:'2026-07-20', time:'09:00' },
    { id:'3', kind:'purchase', status:'planned' }
  ];
  const summary = dashboardSummary(items, { startDate:'2026-07-16', endDate:'2026-08-23' }, '2026-07-20', new Date('2026-07-20T00:00:00'));
  assert.equal(summary.tasks.length, 1);
  assert.equal(summary.nextEvent.id, '2');
  assert.equal(summary.selectedEvents.length, 1);
});
