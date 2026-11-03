import test from 'node:test';
import assert from 'node:assert/strict';
import {Game} from '../dist/engine.js';
import {UNITS} from '../dist/data.js';
import {refreshSourceSkills} from '../dist/skills.js';

const ids = ['A1UK', 'A1UM', 'A1UN', 'A1UO'];
const units = Object.fromEntries(UNITS.map(unit => [unit.id, unit]));
const levels = value => Object.fromEntries(ids.map(id => [id, value]));
const clone = value => JSON.parse(JSON.stringify(value));
const ok = result => assert.equal(result.ok, true, result.message);
const player = game => game.state.players[0];
const building = (game, id) => player(game).buildings.find(b => b.id === id);
const body = (game, id) => game.state.entities.find(e => e.buildingId === id);
const has = (entity, id) => entity.skillSpecs.some(skill => skill.id === id);
const restore = game => Game.fromSnapshot(clone(game.snapshot()));

function fixture() {
  const game = new Game({mode: 'sandbox', seed: 68});
  // Direct construction of later stages is a creation fixture, not a claim
  // that those stages are present in the original builder's menu.
  player(game).roster = ['v14_n08J', 'v14_n08K', 'v14_n08L'];
  return game;
}

function startBuild(game, raw = 'n08J', col = 2) {
  ok(game.command('build', {unitId: `v14_${raw}`, col, row: 4}));
  return player(game).buildings.at(-1);
}

function complete(game) {
  ok(game.command('sandboxComplete'));
}

function build(game, raw = 'n08J', col = 2) {
  const result = startBuild(game, raw, col);
  complete(game);
  return result;
}

function startUpgrade(game, b, raw) {
  ok(game.command('upgrade', {buildingId: b.id, unitId: `v14_${raw}`}));
}

function upgrade(game, b, raw) {
  startUpgrade(game, b, raw);
  complete(game);
}

function buildThirdStage(game) {
  const b = build(game);
  upgrade(game, b, 'n08K');
  upgrade(game, b, 'n08L');
  return b;
}

function removeNewFields(b) {
  delete b.nerzhulCompletionCounts;
  delete b.abilityLevels;
  delete b.permanentAbilityIds;
  delete b.nerzhulLegacyHistory;
}

function startArena(game) {
  // Sandbox intentionally disables scheduled arenas; enter the real arena
  // preparation state and use the public ready command.
  game.state.mode = 'standard';
  game.state.phase = 'build';
  game.state.wave = 10;
  game.state.roundMode = 'arena-prep';
  ok(game.command('ready'));
  assert.equal(game.state.roundMode, 'arena');
}

for (const [raw, combatRaw] of [['n08J', 'h0WM'], ['n08K', 'h0WN'], ['n08L', 'h0WO']]) {
  test(`new ${raw} first completion starts all four skills at level 1 and deploys ${combatRaw}`, () => {
    const game = fixture(), b = startBuild(game, raw);
    assert.ok(b.construction);
    assert.equal(b.nerzhulCompletionCounts, undefined);
    assert.equal(player(game).eggHistory.events[`${b.id}:${raw}`], undefined);
    complete(game);
    assert.deepEqual(b.nerzhulCompletionCounts, levels(1));
    assert.deepEqual(b.abilityLevels, levels(1));
    assert.deepEqual([...b.permanentAbilityIds].sort(), [...ids].sort());
    ok(game.command('ready'));
    const e = body(game, b.id);
    assert.equal(e.combatRawcode, combatRaw);
    assert.deepEqual(e.abilityLevels, levels(1));
    assert.ok(ids.every(id => has(e, id)));
  });
}

test('existing Web stage reconstruction keeps one building ID and increments only on actual completion', () => {
  // The packet omits native Upgrade/Requires fields. These Web edges and
  // their persistent ID do not prove original Warcraft handle continuity.
  const game = fixture(), b = build(game), id = b.id;
  assert.match(units[b.unitId].sourceEvidence.progressionPolicy, /Web reconstruction/);
  for (const [raw, count] of [['n08K', 2], ['n08L', 3]]) {
    startUpgrade(game, b, raw);
    assert.equal(b.id, id);
    assert.deepEqual(b.nerzhulCompletionCounts, levels(count - 1));
    assert.equal(player(game).eggHistory.events[`${id}:${raw}`], undefined);
    complete(game);
    assert.equal(b.unitId, `v14_${raw}`);
    assert.deepEqual(b.nerzhulCompletionCounts, levels(count));
    assert.deepEqual(b.abilityLevels, levels(count));
    complete(game);
    assert.deepEqual(b.nerzhulCompletionCounts, levels(count));
  }
  assert.deepEqual(Object.keys(player(game).eggHistory.events).sort(), ['n08J', 'n08K', 'n08L'].map(raw => `${id}:${raw}`));
});

test('a fresh second stage upgraded to the third has two completions rather than level inferred from its name', () => {
  const game = fixture(), b = build(game, 'n08K');
  upgrade(game, b, 'n08L');
  assert.deepEqual(b.abilityLevels, levels(2));
  assert.deepEqual(b.nerzhulCompletionCounts, levels(2));
  assert.equal(player(game).eggHistory.events[`${b.id}:n08J`], undefined);
  ok(game.command('ready'));
  assert.equal(body(game, b.id).combatRawcode, 'h0WO');
  assert.deepEqual(body(game, b.id).abilityLevels, levels(2));
});

test('repeated completed-building restores preserve counts, levels and completion history without replay', () => {
  let game = fixture();
  const id = buildThirdStage(game).id;
  const history = clone(player(game).eggHistory.events);
  for (let pass = 0; pass < 3; pass++) {
    game = restore(game);
    assert.deepEqual(building(game, id).nerzhulCompletionCounts, levels(3));
    assert.deepEqual(building(game, id).abilityLevels, levels(3));
    assert.deepEqual(player(game).eggHistory.events, history);
    complete(game);
    assert.deepEqual(building(game, id).nerzhulCompletionCounts, levels(3));
  }
});

test('saving an unfinished new third stage does not create a completion before construction finishes', () => {
  let game = fixture();
  const id = startBuild(game, 'n08L').id;
  game = restore(game);
  assert.ok(building(game, id).construction);
  assert.deepEqual(building(game, id).nerzhulCompletionCounts, levels(0));
  assert.equal(player(game).eggHistory.events[`${id}:n08L`], undefined);
  assert.equal(building(game, id).permanentAbilityIds, undefined);
  complete(game);
  assert.deepEqual(building(game, id).nerzhulCompletionCounts, levels(1));
  assert.deepEqual(building(game, id).abilityLevels, levels(1));
});

test('saving an in-progress upgrade retains its previous completion and increments once after finish', () => {
  let game = fixture();
  const b = build(game), id = b.id;
  startUpgrade(game, b, 'n08K');
  game = restore(game);
  assert.deepEqual(building(game, id).nerzhulCompletionCounts, levels(1));
  assert.equal(player(game).eggHistory.events[`${id}:n08K`], undefined);
  complete(game);
  assert.deepEqual(building(game, id).nerzhulCompletionCounts, levels(2));
  assert.deepEqual(building(game, id).abilityLevels, levels(2));
});

test('legacy history restores each building from its own raw-stage events, ignoring another building and aggregate counts', () => {
  const game = fixture(), progressed = buildThirdStage(game), fresh = build(game, 'n08L', 3);
  const saved = clone(game.snapshot()), p = saved.state.players[0];
  for (const b of p.buildings) removeNewFields(b);
  for (const raw of ['n08J', 'n08K', 'n08L']) {
    p.eggHistory.events[`unrelated-building:${raw}`] = true;
    p.eggHistory.counts[raw] = 99;
  }
  p.eggHistory.events[`${fresh.id}:n08J`] = false;
  p.eggHistory.events[`${fresh.id}:n08K`] = false;
  const restored = Game.fromSnapshot(saved);
  assert.deepEqual(building(restored, progressed.id).nerzhulCompletionCounts, levels(3));
  assert.deepEqual(building(restored, progressed.id).abilityLevels, levels(3));
  assert.deepEqual(building(restored, fresh.id).nerzhulCompletionCounts, levels(1));
  assert.deepEqual(building(restored, fresh.id).abilityLevels, levels(1));
  assert.deepEqual([...building(restored, fresh.id).permanentAbilityIds].sort(), [...ids].sort());
});

test('legacy third stage without a journal restores only its provable current completion', () => {
  const game = fixture(), b = buildThirdStage(game), saved = clone(game.snapshot());
  removeNewFields(saved.state.players[0].buildings[0]);
  delete saved.state.players[0].eggHistory;
  const restored = Game.fromSnapshot(saved), result = building(restored, b.id);
  assert.deepEqual(result.nerzhulCompletionCounts, levels(1));
  assert.deepEqual(result.abilityLevels, levels(1));
  assert.equal(player(restored).eggHistory.events[`${b.id}:n08J`], undefined);
  assert.equal(player(restored).eggHistory.events[`${b.id}:n08K`], undefined);
  assert.equal(player(restored).eggHistory.events[`${b.id}:n08L`], true);
});

test('legacy in-progress upgrade migrates only the completed source stage and never anticipates the target', () => {
  const game = fixture(), b = build(game, 'n08K');
  startUpgrade(game, b, 'n08L');
  const saved = clone(game.snapshot());
  removeNewFields(saved.state.players[0].buildings[0]);
  delete saved.state.players[0].eggHistory;
  const restored = Game.fromSnapshot(saved), result = building(restored, b.id);
  assert.deepEqual(result.nerzhulCompletionCounts, levels(1));
  assert.equal(result.unitId, 'v14_n08K');
  assert.equal(result.construction.targetId, 'v14_n08L');
  assert.equal(player(restored).eggHistory.events[`${b.id}:n08L`], undefined);
  complete(restored);
  assert.deepEqual(result.abilityLevels, levels(2));
});

test('explicit saved per-ability levels survive legacy migration instead of being overwritten by stage history', () => {
  const game = fixture(), b = buildThirdStage(game), saved = clone(game.snapshot());
  const explicit = {A1UK: 1, A1UM: 2, A1UN: 3, A1UO: 2};
  const old = saved.state.players[0].buildings[0];
  removeNewFields(old);
  old.abilityLevels = {...explicit};
  const restored = Game.fromSnapshot(saved), result = building(restored, b.id);
  assert.deepEqual(result.abilityLevels, explicit);
  assert.deepEqual(result.nerzhulCompletionCounts, explicit);
  ok(restored.command('ready'));
  assert.deepEqual(body(restored, b.id).abilityLevels, explicit);
});

test('live combat restore preserves explicit levels and runtime resources while legacy combat hydrates missing levels', () => {
  const game = fixture(), b = buildThirdStage(game);
  ok(game.command('ready'));
  const e = body(game, b.id), explicit = {A1UK: 2, A1UM: 1, A1UN: 2, A1UO: 1};
  e.abilityLevels = {...explicit};
  e.hp = 777;
  e.mana = 11;
  e.skillStates.A1UM = {readyAt: 37, casts: 2};
  e.skillImplementationRevision = 0;
  const saved = clone(game.snapshot()), restored = Game.fromSnapshot(clone(saved)), result = body(restored, b.id);
  assert.deepEqual(result.abilityLevels, explicit);
  assert.deepEqual(building(restored, b.id).abilityLevels, levels(3));
  assert.equal(result.hp, 777);
  assert.equal(result.mana, 11);
  assert.deepEqual(result.skillStates.A1UM, {readyAt: 37, casts: 2});
  delete saved.state.entities.find(entity => entity.id === e.id).abilityLevels;
  const legacy = Game.fromSnapshot(saved);
  assert.deepEqual(body(legacy, b.id).abilityLevels, levels(3));
});

test('arena removes A1UN from the combat body across refresh and restore while preserving the building', () => {
  const game = fixture(), b = buildThirdStage(game);
  startArena(game);
  const e = body(game, b.id), expected = {...levels(3), A1UN: 0};
  assert.equal(e.isArena, true);
  assert.equal(has(e, 'A1UN'), false);
  assert.deepEqual(e.abilityLevels, expected);
  assert.deepEqual(b.abilityLevels, levels(3));
  assert.ok(b.permanentAbilityIds.includes('A1UN'));
  e.skillImplementationRevision = 0;
  assert.equal(refreshSourceSkills(e, units[b.unitId]), true);
  assert.equal(has(e, 'A1UN'), false);
  const restored = restore(game), result = body(restored, b.id);
  assert.deepEqual(result.abilityLevels, expected);
  assert.equal(has(result, 'A1UN'), false);
  assert.equal(result.skillStates.A1UN, undefined);
  restored.state.phase = 'build';
  restored.state.roundMode = 'normal';
  restored.state.wave = 11;
  ok(restored.command('ready'));
  assert.ok(has(body(restored, b.id), 'A1UN'));
  assert.deepEqual(body(restored, b.id).abilityLevels, levels(3));
});

test('legacy arena save that still carries A1UN loses it after skill refresh and never restores its saved level', () => {
  const game = fixture(), b = buildThirdStage(game);
  ok(game.command('ready'));
  const normalSpecs = clone(body(game, b.id).skillSpecs);
  startArena(game);
  const saved = clone(game.snapshot()), old = saved.state.entities.find(e => e.buildingId === b.id);
  old.skillSpecs = normalSpecs;
  old.abilityLevels = levels(3);
  old.skillStates.A1UN = {readyAt: 123, casts: 4};
  old.skillImplementationRevision = 0;
  let restored = Game.fromSnapshot(saved);
  for (let pass = 0; pass < 2; pass++) {
    const e = body(restored, b.id);
    assert.equal(has(e, 'A1UN'), false);
    assert.equal(e.abilityLevels.A1UN, 0);
    assert.equal(e.skillStates.A1UN, undefined);
    for (const id of ids.filter(id => id !== 'A1UN')) assert.equal(e.abilityLevels[id], 3);
    restored = restore(restored);
  }
});
