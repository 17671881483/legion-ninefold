import test from 'node:test';
import assert from 'node:assert/strict';
import {Game} from '../dist/engine.js';
import {UNITS} from '../dist/data.js';
import {V14_ABILITIES} from '../dist/v14-reference.js';
import {axisaBuildingCompleted, restoreAxisaBuilding, initializeAxisaLevels} from '../dist/axisa-levels.js';

const stages = ['h0U3', 'h0U4', 'h0U1', 'h0UB', 'h0UA', 'h0U9', 'h0U8', 'h0U7', 'h0U6', 'h0U5', 'h0U2'];
const bodies = ['h0TT', 'h0UC', 'h0TU', 'h0TV', 'h0TW', 'h0TX', 'h0TS', 'h0TY', 'h0TR', 'h0U0', 'h0TZ'];
const definitions = Object.fromEntries(UNITS.filter(u => !u.legacy).map(u => [u.sourceRawcode, u]));
const def = raw => definitions[raw];
const clone = value => JSON.parse(JSON.stringify(value));
const ok = result => assert.equal(result.ok, true, result.message);
const plainBuilding = (raw = stages[0], id = 'axisa-1') => ({id, unitId: def(raw).id});
const player = g => g.state.players[0];
const getBuilding = (g, id) => player(g).buildings.find(b => b.id === id);
const getBody = (g, id) => g.state.entities.find(e => e.buildingId === id);
const journal = (id, raws) => ({eggHistory: {events: Object.fromEntries(raws.map(raw => [`${id}:${raw}`, true]))}});
function assertLevel(b, count, level = Math.max(1, Math.min(11, count))) {
  assert.deepEqual(b.axisaLevelState, {count});
  assert.equal(b.abilityLevels.A1CF, level);
}
function completed(b, raw) {
  b.unitId = def(raw).id;
  axisaBuildingCompleted(b, def(raw));
}

export function createAxisaLevelsFixture(raw = 'h0U3') {
  const g = new Game({mode: 'sandbox', seed: 74}), p = player(g);
  // Later stages in this fixture's roster test new-handle behavior, not an
  // assertion that the original builder offers direct high-stage purchases.
  Object.assign(p, {workers: 0, gold: 10000, wood: 10000, populationCap: 300,
    buildings: [], roster: [...stages.map(raw => def(raw).id), def('n07H').id], entitlements: {h220: 1}});
  ok(g.command('build', {unitId: def(raw).id, col: 0, row: 0}));
  return {g, p, b: p.buildings[0]};
}
function finish(g, b) {g.tick(Math.max(0, b.construction.finishAt - g.state.time));assert.equal(b.construction, null);}
function built(raw = 'h0U3') {const f = createAxisaLevelsFixture(raw);finish(f.g, f.b);return f;}
const upgrade = (f, raw) => f.g.command('upgrade', {buildingId: f.b.id, unitId: def(raw).id});
function maxStage() {
  const f = built();
  for (const raw of stages.slice(1)) {ok(upgrade(f, raw));finish(f.g, f.b);}
  return f;
}
function restore(g) {return Game.fromSnapshot(clone(g.snapshot()));}
function rejectUnchanged(f, action) {
  f.g._result(true, 'sync');
  const before = clone(f.g.snapshot());
  assert.equal(action().ok, false);
  assert.deepEqual(clone(f.g.snapshot()), before);
}

test('eleven ordinary stages retain exact combat mappings while missing native Upgrade fields remain explicit', () => {
  assert.equal(Number(V14_ABILITIES.A1CF.fields.levels), 11);
  stages.forEach((raw, i) => {
    const d = def(raw);
    assert.equal(d.combatRawcode, bodies[i]);
    assert.equal(d.heroLevel, i + 1);
    assert.ok(d.buildingAbilityIds.includes('A1CF'));
    assert.equal(d.buildingRawFields.Upgrade, undefined);
    assert.match(d.sourceEvidence.progressionPolicy, /Web reconstruction/);
    if (i < stages.length - 1) assert.ok(d.upgrades.includes(def(stages[i + 1]).id));
  });
});

test('a fresh completed carrier starts at one regardless of any numbered stage or heroLevel', () => {
  for (const raw of stages) {
    const b = plainBuilding(raw);
    completed(b, raw);
    assertLevel(b, 1);
    assert.equal(b.permanentAbilityIds, undefined);
  }
});

test('every carrier completion increments one integer, with no first-stage or skipped-stage boolean', () => {
  const b = plainBuilding();
  for (const [i, raw] of ['h0U3', 'h0U2', 'h0U2', 'h0U3'].entries()) {
    completed(b, raw);
    assertLevel(b, i + 1);
  }
});

test('completion counts continue beyond eleven while the actual object level is capped at eleven', () => {
  const b = plainBuilding('h0U2');
  for (let i = 0; i < 14; i++) completed(b, 'h0U2');
  assertLevel(b, 14, 11);
  restoreAxisaBuilding(journal(b.id, stages), b, def('h0U2'));
  assertLevel(b, 14, 11);
});

test('unfinished, non-source, absent and explicitly removed abilities cannot increment or be restored', () => {
  for (const mode of ['unfinished', 'non-source', 'absent', 'zero', 'removed']) {
    const b = plainBuilding(), d = clone(def('h0U3'));
    if (mode === 'unfinished') b.construction = {targetId: b.unitId};
    if (mode === 'non-source') d.id = 'legacy-axisa';
    if (mode === 'absent') d.buildingAbilityIds = [];
    if (mode === 'zero') b.abilityLevels = {A1CF: 0};
    if (mode === 'removed') b.sourceRemovedBuildingAbilities = ['A1CF'];
    axisaBuildingCompleted(b, d);
    assert.equal(b.axisaLevelState, undefined, mode);
    if (mode !== 'unfinished') {restoreAxisaBuilding(journal(b.id, stages), b, d);assert.equal(b.axisaLevelState, undefined, mode);}
  }
});

test('source completion accepts a dynamically granted carrier without adding further permanent abilities', () => {
  const b = plainBuilding();
  b.permanentAbilityIds = ['A1CF', 'A123'];
  axisaBuildingCompleted(b, {id: 'v14_test', buildingAbilityIds: []});
  assertLevel(b, 1);
  assert.deepEqual(b.permanentAbilityIds, ['A1CF', 'A123']);
});

test('legacy recovery counts only this building ID exact true stage events and ignores aggregate history', () => {
  const b = plainBuilding('h0U2', 'own'), p = journal('other', stages);
  Object.assign(p.eggHistory.events, {'own:h0U3': true, 'own:h0U4': false, 'own:h0U2': true, 'own:n07I': true});
  p.eggHistory.counts = Object.fromEntries(stages.map(raw => [raw, 99]));
  restoreAxisaBuilding(p, b, def('h0U2'));
  assertLevel(b, 2);
  assert.equal(b.axisaLegacyHistory, true);
  assert.equal(b.permanentAbilityIds, undefined);
});

test('module-level restore does not invent completed stages without the building completion journal', () => {
  const b = plainBuilding('h0U2'), p = {};
  restoreAxisaBuilding(p, b, def('h0U2'));
  assertLevel(b, 0, 1);
  assert.equal(p.eggHistory, undefined);
});

test('explicit saved actual level supplies a missing counter before incomplete legacy history', () => {
  const b = plainBuilding('h0U2');
  b.abilityLevels = {A1CF: 7, A1CH: 2};
  restoreAxisaBuilding(journal(b.id, ['h0U2']), b, def('h0U2'));
  assertLevel(b, 7);
  assert.equal(b.abilityLevels.A1CH, 2);
});

test('saved counter and actual level remain independent and restoration never replays completion', () => {
  let b = plainBuilding('h0U2');
  b.axisaLevelState = {count: 14};b.abilityLevels = {A1CF: 6};
  const p = journal(b.id, stages), saved = clone(p);
  for (let i = 0; i < 3; i++) {b = clone(b);restoreAxisaBuilding(p, b, def('h0U2'));assertLevel(b, 14, 6);}
  assert.deepEqual(p, saved);
  completed(b, 'h0U2');
  assertLevel(b, 15, 11);
});

test('a saved counter fills only an absent actual level and zero counter does not become one completion', () => {
  for (const count of [0, 4, 13]) {
    const b = plainBuilding('h0U2');b.axisaLevelState = {count};
    restoreAxisaBuilding(journal(b.id, stages), b, def('h0U2'));
    assertLevel(b, count);
  }
});

test('normal and arena deployment copy the actual stored level and never derive it from named stage', () => {
  const b = plainBuilding('h0U2');completed(b, 'h0U2');
  for (const isArena of [false, true]) {
    const e = {isArena, skillSpecs: [{id: 'A1CF'}], abilityLevels: {A1CF: 11, A1CH: 2}};
    initializeAxisaLevels({}, b, e);
    assert.deepEqual(e.abilityLevels, {A1CF: 1, A1CH: 2});
  }
});

test('deployment never grants an absent or removed A1CF, including the hero egg body', () => {
  const b = {abilityLevels: {A1CF: 11}};
  for (const e of [{skillSpecs: []}, {skillSpecs: [{id: 'A1CF'}], abilityLevels: {A1CF: 0}}, {skillSpecs: def('n07I').abilityIds.map(id => ({id}))}]) {
    const saved = clone(e);initializeAxisaLevels({}, b, e);assert.deepEqual(e, saved);
  }
  const e = {skillSpecs: [{id: 'A1CF'}], abilityLevels: {A1CF: 4}};
  initializeAxisaLevels({}, {abilityLevels: {A1CF: 0}}, e);
  assert.equal(e.abilityLevels.A1CF, 4);
});

test('combat restoration preserves an explicit live level and resources, hydrating only a missing level', () => {
  const b = {abilityLevels: {A1CF: 11}}, e = {skillSpecs: [{id: 'A1CF'}], abilityLevels: {A1CF: 3}, hp: 123, mana: 7, skillStates: {A1CF: {readyAt: 30}}};
  const saved = clone(e);initializeAxisaLevels({}, b, e, {restoring: true});assert.deepEqual(e, saved);
  delete e.abilityLevels.A1CF;initializeAxisaLevels({}, b, e, {restoring: true});assert.equal(e.abilityLevels.A1CF, 11);
});

test('the real paid eleven-stage chain increments only when each paid construction completes', () => {
  const f = createAxisaLevelsFixture(), {g, p, b} = f, id = b.id;
  assert.equal(b.axisaLevelState, undefined);assert.equal(p.gold, 9975);finish(g, b);assertLevel(b, 1);
  for (let i = 1; i < stages.length; i++) {
    const raw = stages[i], gold = p.gold, before = i;
    ok(upgrade(f, raw));
    assert.equal(p.gold, gold - def(raw).cost);assert.equal(b.id, id);assertLevel(b, before);
    assert.equal(p.eggHistory.events[`${id}:${raw}`], undefined);
    g.tick(b.construction.duration - .001);assertLevel(b, before);assert.ok(b.construction);
    g.tick(.001);assert.equal(b.construction, null);assertLevel(b, i + 1);
    assert.equal(p.eggHistory.events[`${id}:${raw}`], true);
    ok(g.command('sandboxComplete'));assertLevel(b, i + 1);
  }
  assert.equal(b.unitId, def('h0U2').id);assert.equal(g._population(p), 11);
  assert.equal(p.gold, 10000 - stages.reduce((sum, raw) => sum + def(raw).cost, 0));
});

test('a real fresh tenth-stage purchase followed by one paid upgrade has two completions', () => {
  const f = built('h0U5');assertLevel(f.b, 1);ok(upgrade(f, 'h0U2'));finish(f.g, f.b);assertLevel(f.b, 2);
  assert.equal(f.p.eggHistory.events[`${f.b.id}:h0U3`], undefined);
});

for (const arena of [false, true]) test(`real ${arena ? 'arena' : 'normal'} deployment copies the first completion of a fresh maximum stage`, () => {
  const f = built('h0U2');assertLevel(f.b, 1);
  if (arena) {f.g.state.mode = 'standard';f.g.state.phase = 'build';f.g.state.wave = 10;f.g.state.roundMode = 'arena-prep';}
  ok(f.g.command('ready'));
  const e = getBody(f.g, f.b.id);assert.equal(e.combatRawcode, 'h0TZ');assert.equal(e.abilityLevels.A1CF, 1);
  assert.ok(e.skillSpecs.some(s => s.id === 'A1CF'));
  if (arena) {assert.equal(f.g.state.roundMode, 'arena');assert.equal(e.isArena, true);}
});

test('real restore of an unfinished purchase does not award completion and resumes after the original payment', () => {
  const f = createAxisaLevelsFixture('h0U2');f.g.tick(.5);
  const g = restore(f.g), b = getBuilding(g, f.b.id), gold = player(g).gold;
  assertLevel(b, 0);assert.equal(player(g).eggHistory.events[`${b.id}:h0U2`], undefined);
  finish(g, b);assertLevel(b, 1);assert.equal(player(g).gold, gold);
});

test('real restore of an in-progress upgrade keeps the completed old stage and increments once at finish', () => {
  const f = built('h0U5');ok(upgrade(f, 'h0U2'));f.g.tick(.5);
  const g = restore(f.g), b = getBuilding(g, f.b.id), gold = player(g).gold;
  assertLevel(b, 1);assert.equal(b.unitId, def('h0U5').id);finish(g, b);assertLevel(b, 2);assert.equal(player(g).gold, gold);
  const next = restore(g);assertLevel(getBuilding(next, b.id), 2);
});

test('legacy real restore backfills only the current provable completion instead of all eleven named stages', () => {
  const f = maxStage(), saved = clone(f.g.snapshot()), p = saved.state.players[0], b = p.buildings[0];
  delete b.axisaLevelState;delete b.abilityLevels;delete b.axisaLegacyHistory;delete p.eggHistory;
  const g = Game.fromSnapshot(saved), restored = getBuilding(g, b.id);
  assertLevel(restored, 1);assert.equal(player(g).eggHistory.events[`${b.id}:h0U2`], true);
  assert.equal(player(g).eggHistory.events[`${b.id}:h0U3`], undefined);
});

test('live real combat restoration preserves a different actual level and runtime resources', () => {
  const f = maxStage();ok(f.g.command('ready'));const e = getBody(f.g, f.b.id);
  assert.equal(e.abilityLevels.A1CF, 11);e.abilityLevels.A1CF = 3;e.hp = 123;e.mana = 7;
  const g = restore(f.g), result = getBody(g, f.b.id);assertLevel(getBuilding(g, f.b.id), 11);
  assert.equal(result.abilityLevels.A1CF, 3);assert.equal(result.hp, 123);assert.equal(result.mana, 7);
});

function eggFixture() {
  const f = built('h0U2');
  ok(f.g.command('build', {unitId: def('n07H').id, col: 1, row: 0}));
  finish(f.g, f.p.buildings.at(-1));assert.equal(f.p.technologies.R0D2, 1);
  return f;
}
test('n07I direct hero egg upgrade costs 500 gold and two seconds with no training reward required', () => {
  const f = eggFixture(), {g, p, b} = f, id = b.id, gold = p.gold, oldLevel = clone(b.axisaLevelState), altars = p.heroAltarCount;
  assert.ok(def('h0U2').upgrades.includes(def('n07I').id));assert.equal(p.boxRewards, undefined);ok(upgrade(f, 'n07I'));
  assert.equal(p.gold, gold - 500);assert.equal(b.construction.duration, 2);assert.equal(g._population(p), 20);
  finish(g, b);assert.equal(b.id, id);assert.equal(b.unitId, def('n07I').id);assert.deepEqual(b.axisaLevelState, oldLevel);
  assert.equal(p.heroAltarCount, altars);assert.equal(p.boxRewards, undefined);
  ok(g.command('ready'));assert.equal(getBody(g, b.id).skillSpecs.some(s => s.id === 'A1CF'), false);
});

test('direct hero egg upgrade still requires independent super sponsorship recipe and battle-end gates', () => {
  for (const mode of ['sponsor', 'recipe', 'combat', 'gold', 'population']) {
    const f = eggFixture();
    if (mode === 'sponsor') {delete f.p.entitlements.h220;f.p.entitlements.h210 = 1;f.p.technologies.h220 = 1;}
    if (mode === 'recipe') {delete f.p.technologies.R0D2;f.p.eggHistory = undefined;f.p.completedSourceUnits = undefined;}
    if (mode === 'combat') f.g.state.phase = 'combat';
    if (mode === 'gold') f.p.gold = 499;
    if (mode === 'population') f.p.populationCap = 19;
    rejectUnchanged(f, () => upgrade(f, 'n07I'));
  }
});

test('optional training reduces the egg price to 200 while direct upgrade keeps the reward unconsumed', () => {
  const direct = eggFixture(), training = eggFixture();
  for (const f of [direct, training]) ok(f.g.command('sandboxBoxTraining'));
  const reward = clone(direct.p.boxRewards), gold = direct.p.gold;ok(upgrade(direct, 'n07I'));
  assert.equal(gold - direct.p.gold, 500);assert.deepEqual(direct.p.boxRewards, reward);
  const before = training.p.gold, oldId = training.b.id;
  ok(training.g.command('boxTrain', {buildingId: oldId, unitId: def('n07I').id}));
  assert.equal(before - training.p.gold, 200);assert.equal(training.p.boxRewards.consumed, true);
  const b = training.p.buildings.find(b => b.unitId === def('n07I').id);
  assert.ok(b && !b.construction && b.id !== oldId);assert.equal(b.axisaLevelState, undefined);
});
