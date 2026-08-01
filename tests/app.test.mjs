import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tripStatus, selectActiveTrip, daysRemaining } from '../src/js/trips.js';
import { dashboardSummary, filterScheduleEvents, isFinishedEvent } from '../src/js/dashboard.js';
import { createApiClient } from '../src/js/api.js';
import { visibleItemsForScope, eventsOnDate } from '../src/js/resources.js';
import { activateTab } from '../src/js/navigation.js';

const html = readFileSync('src/index.html', 'utf8');

test('PWA files and metadata exist', () => {
  assert.match(html, /rel="manifest" href="\/manifest\.webmanifest\?v=3"/);
  assert.match(html, /registerPwa\(\)/);
  for (const file of ['src/manifest.webmanifest', 'src/sw.js', 'src/offline.html', 'src/icons/app-icon.svg', 'src/js/pwa.js']) assert.equal(existsSync(file), true, file);
  const manifest = JSON.parse(readFileSync('src/manifest.webmanifest', 'utf8'));
  assert.equal(manifest.display, 'standalone');
  assert.equal(manifest.dir, 'rtl');
  assert.equal(manifest.id, '/elmahdy-family-trips-v3');
  assert.ok(manifest.icons.some(icon => icon.purpose === 'maskable'));
});

test('install, update, search, export, and print features exist', () => {
  for (const marker of ['installAppBtn','updateBanner','openGlobalSearch','exportExpensesCsv','طباعة التقويم','tripStatusFilter','nextEventMetric']) assert.match(html,new RegExp(marker),marker);
  const worker=readFileSync('src/sw.js','utf8');
  assert.match(worker,/offline\.html/);
  assert.match(worker,/SKIP_WAITING/);
});

test('mobile navigation and expense search are fixed and usable', () => {
  assert.match(html,/\.tab-list\{display:none!important\}/);
  assert.match(html,/\.mobile-nav\{display:flex!important;position:fixed!important/);
  assert.match(html,/--mobile-nav-height:76px/);
  assert.match(html,/class="nav-icon"/);
  assert.match(html,/class="nav-label"/);
  assert.match(html,/#appView:not\(\[data-active-tab="overviewTab"\]\)>\.app-header\{display:none!important\}/);
  assert.match(html,/\$\('appView'\)\.dataset\.activeTab=state\.tab/);
  assert.match(html,/id="expenseEntryNav" class="active"/);
  assert.match(html,/id="expenseDashboardNav"/);
  assert.match(html,/if\(tab==='expensesTab'\)showExpenseView\('entry'\)/);
  assert.match(html,/id="expenseDashboardView" class="expense-view hidden"/);
  assert.match(html,/body\.screen-locked\{overflow:hidden!important/);
  assert.match(html,/\.modal-wrap\{z-index:240!important/);
  assert.match(html,/\.modal-actions\{position:sticky;bottom:0/);
  assert.match(html,/function lockScreen\(kind\)/);
  assert.match(html,/lockScreen\('event-modal-open'\)/);
  assert.match(html,/#expenseSearch\{[^}]*flex:1 0 100%!important/);
  assert.match(html,/\.dashboard-metrics\{grid-template-columns:1fr 1fr!important/);
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
  for (const file of ['src/js/format.js','src/js/pwa.js','src/js/trips.js','src/js/dashboard.js','src/js/dom.js','src/js/api.js','src/js/navigation.js','src/js/resources.js','src/sw.js']) {
    const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
    assert.equal(result.status, 0, `${file}: ${result.stderr}`);
  }
});

test('API client sends the Firebase token and handles errors', async () => {
  let request;
  const api = createApiClient({
    getCurrentUser:()=>({uid:'1'}), getToken:async()=>'token',
    fetchImpl:async(url,options)=>{request={url,options};return {ok:true,text:async()=>'{"ok":true}'};}
  });
  assert.deepEqual(await api('/api/test',{method:'POST',body:{a:1}}),{ok:true});
  assert.equal(request.options.headers['X-Firebase-ID-Token'],'token');
  assert.equal(request.options.body,'{"a":1}');
  const denied=createApiClient({getCurrentUser:()=>null,getToken:async()=>'',fetchImpl:async()=>{}});
  await assert.rejects(()=>denied('/api/test'),/لم يتم تسجيل الدخول/);
});

test('resource visibility and day events respect scope', () => {
  const items=[
    {id:'f',scope:'family',kind:'event',date:'2026-07-20',time:'11:00'},
    {id:'mine',scope:'personal',ownerUid:'u1',kind:'event',date:'2026-07-20',time:'09:00'},
    {id:'other',scope:'personal',ownerUid:'u2',kind:'event',date:'2026-07-20'}
  ];
  assert.deepEqual(visibleItemsForScope(items,'u1','family').map(x=>x.id),['f']);
  assert.deepEqual(visibleItemsForScope(items,'u1','personal').map(x=>x.id),['mine']);
  assert.deepEqual(eventsOnDate(items,'2026-07-20').map(x=>x.id),['other','mine','f']);
});

test('navigation activates exactly one pane', () => {
  const make=(id,tab)=>({id,dataset:{tab},classList:{values:new Set(),toggle(name,on){on?this.values.add(name):this.values.delete(name)}}});
  const buttons=[make('', 'overviewTab'),make('', 'calendarTab')],panes=[make('overviewTab'),make('calendarTab')],toolbar=make('toolbar');
  activateTab('calendarTab',{buttons,panes,calendarToolbar:toolbar});
  assert.equal(buttons[1].classList.values.has('active'),true);
  assert.equal(panes[0].classList.values.has('hidden'),true);
  assert.equal(panes[1].classList.values.has('hidden'),false);
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

test('finished schedule items stay hidden until requested', () => {
  const events = [
    { id:'open', status:'planned', date:'2026-07-19' },
    { id:'done', status:'done', date:'2026-07-18' },
    { id:'visited', status:'visited', date:'2026-07-17' }
  ];
  assert.equal(isFinishedEvent(events[1]), true);
  assert.deepEqual(filterScheduleEvents(events).map(x => x.id), ['open']);
  assert.equal(filterScheduleEvents(events, true).length, 3);
});

test('expenses can receive an additional amount without creating a duplicate', () => {
  for (const marker of ['data-add-expense', 'openExpenseIncrement', 'expenseIncrementAmount', 'expenseIncrementTotal']) {
    assert.match(html, new RegExp(marker), marker);
  }
  assert.match(html, /amount:current\+added/);
  assert.match(html, /method:'PUT'/);
});

test('expense categories filter transactions and prefill quick entry', () => {
  for (const marker of ['data-expense-category', 'expenseCategoryFilterBar', 'newExpenseInCategory', 'clearExpenseCategoryFilter']) {
    assert.match(html, new RegExp(marker), marker);
  }
  assert.match(html, /e\.category===category/);
  assert.match(html, /\$\('expenseCategory'\)\.value=category/);
});
