import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {UNITS} from '../dist/data.js';
import {earthLordBuildingCompleted, restoreEarthLordBuilding, initializeEarthLordLevels} from '../dist/earth-lord-levels.js';

const units = Object.fromEntries(UNITS.map(unit => [unit.id, unit]));
const def = raw => units[`v14_${raw}`];
const clone = value => JSON.parse(JSON.stringify(value));
const building = (raw = 'n067', id = 'earth-1') => ({id, unitId: `v14_${raw}`});
const body = (options = {}) => ({skillSpecs: [{id: 'A17H'}], ...options});
function complete(b, raw = b.unitId.replace(/^v14_/, '')) {
  b.unitId = `v14_${raw}`;
  earthLordBuildingCompleted(b, def(raw));
}
function assertState(b, count, firstStagePending, level = Math.max(1, Math.min(3, count))) {
  assert.deepEqual(b.earthLordLevelState, {count, firstStagePending});
  assert.equal(b.abilityLevels.A17H, level);
}
const history = (id, raws) => ({eggHistory: {events: Object.fromEntries(raws.map(raw => [`${id}:${raw}`, true]))}});

test('source distinguishes the boolean skip branch from count increments and copies levels without granting an ability', () => {
  const lines = readFileSync(new URL('../reference/v14-source/raw_extracted/war3map.j', import.meta.url)).toString('latin1').split('\n');
  const source = number => lines[number - 1].replace(/\r$/, '');
  assert.equal(source(28529), 'if x==$6E303637 then');
  assert.equal(source(28530), 'call SaveBoolean(O,GetHandleId(i),$41313748,true)');
  assert.equal(source(28533), 'elseif LoadBoolean(O,GetHandleId(i),$41313748) and x!=$6E303638 then');
  assert.equal(source(28534), 'call RemoveSavedBoolean(O,GetHandleId(i),$41313748)');
  assert.equal(source(28535), 'else');
  assert.equal(source(43753), 'call SetUnitAbilityLevel(Bc,$41313748,GetUnitAbilityLevel(Pf,$41313748))');
  assert.ok(!lines.slice(28527, 28540).some(line => line.includes('UnitMakeAbilityPermanent')));
});

for (const raw of ['n067', 'n068', 'n069']) test(`fresh ${raw} begins at ability level 1 independently of its named hero stage`, () => {
  const b = building(raw);
  complete(b);
  assertState(b, 1, raw === 'n067');
  assert.equal(b.permanentAbilityIds, undefined);
});

test('ordinary Web n067 -> n068 -> n069 completions produce 1, 2, 3 without proving native handle continuity', () => {
  const b = building();
  assert.match(def('n067').sourceEvidence.progressionPolicy, /Web reconstruction/);
  complete(b);
  assertState(b, 1, true);
  complete(b, 'n068');
  assertState(b, 2, false);
  complete(b, 'n069');
  assertState(b, 3, false);
});

test('n067 -> n069 clears the pending boolean without incrementing or overwriting the current ability level', () => {
  const b = building();
  complete(b);
  b.abilityLevels.A17H = 2;
  complete(b, 'n069');
  assertState(b, 1, false, 2);
  complete(b, 'n069');
  assertState(b, 2, false, 2);
});

test('every n067 completion increments and sets pending again while n068 always takes the increment branch', () => {
  const b = building();
  complete(b);
  complete(b);
  assertState(b, 2, true);
  complete(b, 'n068');
  assertState(b, 3, false);
  complete(b, 'n068');
  assertState(b, 4, false, 3);
});

test('a fresh n068 followed by n069 has only two completed increments', () => {
  const b = building('n068');
  complete(b);
  complete(b, 'n069');
  assertState(b, 2, false);
});

test('the skip branch applies to any other carrier rather than only the third family stage', () => {
  const b = building();
  complete(b);
  const other = {id: 'v14_test', sourceRawcode: 'test', buildingAbilityIds: ['A17H']};
  earthLordBuildingCompleted(b, other);
  assertState(b, 1, false);
  earthLordBuildingCompleted(b, other);
  assertState(b, 2, false);
});

test('unfinished construction, non-source definitions and absent or explicitly removed abilities do not advance', () => {
  for (const kind of ['construction', 'legacy', 'absent', 'removed']) {
    const b = building(), d = clone(def('n067'));
    if (kind === 'construction') b.construction = {targetId: b.unitId};
    if (kind === 'legacy') d.id = 'legacy-n067';
    if (kind === 'absent') d.buildingAbilityIds = [];
    if (kind === 'removed') b.abilityLevels = {A17H: 0};
    earthLordBuildingCompleted(b, d);
    assert.equal(b.earthLordLevelState, undefined, kind);
  }
});

test('an already granted A17H carrier is recognized without modifying its existing permanent grants', () => {
  const b = building('n068'), d = {id: 'v14_test', sourceRawcode: 'test', abilityIds: []};
  b.permanentAbilityIds = ['A17H', 'A123'];
  earthLordBuildingCompleted(b, d);
  assertState(b, 1, false);
  assert.deepEqual(b.permanentAbilityIds, ['A17H', 'A123']);
});

test('legacy migration preserves completion order because n067 -> n069 differs from n069 -> n067', () => {
  const a = building('n069', 'a'), b = building('n067', 'b');
  restoreEarthLordBuilding(history(a.id, ['n067', 'n069']), a, def('n069'));
  restoreEarthLordBuilding(history(b.id, ['n069', 'n067']), b, def('n067'));
  assertState(a, 1, false);
  assertState(b, 2, true);
  assert.equal(a.earthLordLegacyHistory, true);
});

test('legacy migration uses exact building IDs and truthy raw events, ignoring other buildings and aggregate counts', () => {
  const b = building('n069', 'earth'), p = history('earth-other', ['n067', 'n068', 'n069']);
  Object.assign(p.eggHistory.events, {'earth:n067': true, 'earth:n068': false, 'earth:n069': true, 'earth:unrelated': true});
  p.eggHistory.counts = {n067: 99, n068: 99, n069: 99};
  restoreEarthLordBuilding(p, b, def('n069'));
  assertState(b, 1, false);
  assert.equal(b.permanentAbilityIds, undefined);
});

test('pre-journal completed third stage recovers one completion, never the three implied by its name', () => {
  const b = building('n069'), p = {};
  restoreEarthLordBuilding(p, b, def('n069'));
  assertState(b, 1, false);
  assert.equal(p.eggHistory, undefined);
});

test('unfinished fresh construction has no completed count while an upgrade can recover only its completed old stage', () => {
  const fresh = building('n069'), upgrading = building('n067');
  fresh.construction = {targetId: 'v14_n069'};
  upgrading.construction = {targetId: 'v14_n068'};
  restoreEarthLordBuilding({}, fresh, def('n069'));
  restoreEarthLordBuilding({}, upgrading, def('n067'));
  assertState(fresh, 0, false);
  assertState(upgrading, 1, true);
  fresh.construction = null;
  complete(fresh);
  assertState(fresh, 1, false);
  upgrading.construction = null;
  complete(upgrading, 'n068');
  assertState(upgrading, 2, false);
});

test('repeated snapshot restoration keeps explicit counter, boolean and level without replaying completion', () => {
  let b = building('n067');
  complete(b);
  const p = history(b.id, ['n067', 'n068', 'n069']);
  for (let pass = 0; pass < 3; pass++) {
    b = clone(b);
    restoreEarthLordBuilding(p, b, def('n067'));
    assertState(b, 1, true);
  }
  complete(b, 'n069');
  assertState(b, 1, false);
});

test('explicit legacy ability levels take priority over incomplete history when the counter is missing', () => {
  const b = building('n069');
  b.abilityLevels = {A17H: 2, A17I: 1};
  restoreEarthLordBuilding(history(b.id, ['n067', 'n068', 'n069']), b, def('n069'));
  assertState(b, 2, false);
  assert.equal(b.abilityLevels.A17I, 1);
});

test('partially saved state fills only missing fields and never replaces an explicit boolean with history', () => {
  const b = building('n069');
  b.earthLordLevelState = {count: 7, firstStagePending: true};
  restoreEarthLordBuilding({}, b, def('n069'));
  assertState(b, 7, true, 3);
  const c = building('n068');
  c.earthLordLevelState = {firstStagePending: true};
  restoreEarthLordBuilding({}, c, def('n068'));
  assertState(c, 1, true);
});

test('missing A17H or explicit level zero is not restored into a source building', () => {
  const b = building('n069');
  b.abilityLevels = {A17H: 0};
  restoreEarthLordBuilding(history(b.id, ['n067', 'n068', 'n069']), b, def('n069'));
  assert.deepEqual(b.abilityLevels, {A17H: 0});
  assert.equal(b.earthLordLevelState, undefined);
  const c = building('n069');
  restoreEarthLordBuilding({}, c, {...def('n069'), buildingAbilityIds: []});
  assert.equal(c.earthLordLevelState, undefined);
});

test('normal and arena deployment copy actual stored level without assuming the third-stage body is level three', () => {
  const b = building('n069');
  complete(b);
  for (const isArena of [false, true]) {
    const entity = body({isArena, abilityLevels: {A17H: 3, A17I: 2}});
    initializeEarthLordLevels({}, b, entity);
    assert.deepEqual(entity.abilityLevels, {A17H: 1, A17I: 2});
    assert.deepEqual(entity.skillSpecs, [{id: 'A17H'}]);
  }
});

test('deployment cannot recreate a missing or removed combat ability or copy an absent building ability', () => {
  const b = building('n069');
  b.abilityLevels = {A17H: 3};
  const missing = body({skillSpecs: []}), removed = body({abilityLevels: {A17H: 0}});
  initializeEarthLordLevels({}, b, missing);
  initializeEarthLordLevels({}, b, removed);
  assert.deepEqual(missing.skillSpecs, []);
  assert.equal(missing.abilityLevels, undefined);
  assert.equal(removed.abilityLevels.A17H, 0);
  const entity = body({abilityLevels: {A17H: 2}});
  initializeEarthLordLevels({}, {abilityLevels: {A17H: 0}}, entity);
  assert.equal(entity.abilityLevels.A17H, 2);
});

test('restoring a live combat handle preserves explicit levels, resources and cooldowns while hydrating missing levels', () => {
  const b = building();
  b.abilityLevels = {A17H: 3};
  const existing = body({abilityLevels: {A17H: 1}, hp: 100, mana: 7, skillStates: {A17H: {readyAt: 9}}});
  const saved = clone(existing);
  initializeEarthLordLevels({}, b, existing, {restoring: true});
  assert.deepEqual(existing, saved);
  const legacy = body();
  initializeEarthLordLevels({}, b, legacy, {restoring: true});
  assert.equal(legacy.abilityLevels.A17H, 3);
});
