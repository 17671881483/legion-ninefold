import assert from 'node:assert/strict';
import { Game } from '../dist/engine.js';
import { RULES, UNIT_TEMPLATES, WAVES } from '../dist/data.js';
import { queueSpecialMonsters, applySpecialMonsterSpawn, specialMonsterDeath } from '../dist/special-rules.js';

let passed = 0;
const test = (name, fn) => { try { fn(); passed++; console.log(`✓ ${name}`); } catch (error) { console.error(`✗ ${name}`); throw error; } };
const game = (wave = 5) => {
  const g = new Game({ seed: 42 });
  g.state.wave = wave; g.state.time = 50; g._spawnQueue = [];
  g._aiTimer = Infinity; g._aiAct = () => {};
  for (const p of g.state.players) { p.buildings = []; p.gold = 500; p.wood = 94; }
  return g;
};
const applySpawn = (g, entry) => {
  const e = { id: g._uid(), name: entry.wave.name, combatRawcode: entry.wave.combatRawcode,
    sourceLaneId: entry.laneId, hp: 1, maxHp: 1, status: {} };
  applySpecialMonsterSpawn(g, e, entry);
  return e;
};
const killer = { ownerId: 0, team: 0, side: 'defender' };

test('wave five adds one flying reward unit to every active route at the final normal batch', () => {
  const g = game(), count = WAVES.find(w => Number(w.wave ?? w.id) === 5).count;
  queueSpecialMonsters(g, count);
  assert.equal(g._spawnQueue.length, 8);
  assert.deepEqual(g._spawnQueue.map(e => e.laneId), [0, 1, 2, 3, 4, 5, 6, 7]);
  for (const e of g._spawnQueue) { assert.equal(e.wave.combatRawcode, 'h0OU'); assert.equal(e.at, count * RULES.spawnInterval); }
  assert.equal(g.state.specialMonsters, undefined, 'queued entries have not entered the native spawn counter');
});

test('flying birth uses 3000 HP and sixty-second timed life and counts only actual spawns', () => {
  const g = game(); queueSpecialMonsters(g, 100);
  const e = applySpawn(g, g._spawnQueue[0]);
  assert.equal(e.maxHp, 3000); assert.equal(e.hp, 3000); assert.equal(e.expiresAt, 110);
  assert.equal(g.state.specialMonsters.waveFive.spawned, 1);
  applySpecialMonsterSpawn(g, e, g._spawnQueue[0]);
  assert.equal(g.state.specialMonsters.waveFive.spawned, 1, 'birth hooks are idempotent');
});

test('the first and final global flying kills replace ordinary bounty with 80 gold and 150 wood', () => {
  const g = game(); queueSpecialMonsters(g, 100);
  const entries = g._spawnQueue.map(e => applySpawn(g, e));
  const payouts = entries.map(e => specialMonsterDeath(g, e, killer));
  assert.deepEqual(payouts.map(p => p.gold), [80, 0, 0, 0, 0, 0, 0, 80]);
  assert.deepEqual(payouts.map(p => p.wood), [150, 0, 0, 0, 0, 0, 0, 150]);
  assert.ok(payouts.every(p => p.handledBounty));
  assert.deepEqual(g.state.specialMonsters.waveFive, { spawned: 8, killed: 8 });
  assert.equal(specialMonsterDeath(g, entries[0], killer).gold, 0, 'repeated callbacks cannot pay twice');
});

test('the final-flying threshold follows the live global spawn count from the JASS hashtable', () => {
  const g = game(); queueSpecialMonsters(g, 100);
  const first = applySpawn(g, g._spawnQueue[0]);
  assert.equal(specialMonsterDeath(g, first, killer).gold, 80);
  const next = applySpawn(g, g._spawnQueue[1]);
  assert.equal(specialMonsterDeath(g, next, killer).gold, 80, 'two deaths match the two births even while more entries remain queued');
});

test('flying timed-life expiration has no killer and neither advances the counter nor awards resources', () => {
  const g = game(); queueSpecialMonsters(g, 100);
  const e = applySpawn(g, g._spawnQueue[0]);
  assert.deepEqual(specialMonsterDeath(g, e, null), { handledBounty: true, gold: 0, wood: 0 });
  assert.equal(g.state.specialMonsters.waveFive.killed, 0);
});

test('king kills still participate in the global flying competition', () => {
  const g = game(); queueSpecialMonsters(g, 100);
  const e = applySpawn(g, g._spawnQueue[0]);
  assert.deepEqual(specialMonsterDeath(g, e, { isKing: true, team: 0 }), { handledBounty: true, gold: 80, wood: 150 });
});

test('only waves seven through nineteen add one independently selected treasure route per team', () => {
  for (const wave of [1, 6, 7, 10, 14, 19, 20, 30]) {
    const g = game(wave); queueSpecialMonsters(g, 27);
    const entries = g._spawnQueue.filter(e => e.specialKind === 'treasure');
    assert.equal(entries.length, wave >= 7 && wave <= 19 ? 2 : 0);
    if (!entries.length) continue;
    assert.equal(Math.floor(entries[0].laneId / 4), 0); assert.equal(Math.floor(entries[1].laneId / 4), 1);
    assert.equal(entries[0].at, 28 * RULES.spawnInterval);
    assert.equal(entries[0].wave.combatRawcode, ['h0V3', 'h0V4', 'h0V5', 'h0V6', 'h0V7', 'h0V8', 'h0V9', 'h0VA', 'h0VB', 'h0VC', 'h0VD', 'h0VE', 'h0VF'][wave - 7]);
  }
});

test('treasure HP receives the native sapper creation multiplier exactly once', () => {
  for (const [wave, code, scale] of [[7, 'h0V3', 1.5], [10, 'h0V6', 1.5], [11, 'h0V7', 3], [19, 'h0VF', 3]]) {
    const g = game(wave); queueSpecialMonsters(g, 10);
    const e = applySpawn(g, g._spawnQueue[0]);
    assert.equal(e.maxHp, UNIT_TEMPLATES[code].baseHp * scale); assert.equal(e.hp, e.maxHp);
  }
});

test('treasure choices belong to the source route, with the current-wave source unlocks', () => {
  for (const [wave, level, kingArmor, canLumber] of [[7, 1, 1, false], [10, 2, 1, false], [14, 3, 2, true], [19, 3, 2, true]]) {
    const g = game(wave), target = { specialKind: 'treasure', sourceLaneId: 3, status: {} };
    const result = specialMonsterDeath(g, target, killer);
    assert.equal(result.handledBounty, false, 'treasure still receives the normal monster-death bounty');
    assert.equal(g.state.players[0].treasures, undefined);
    const reward = g.state.players[3].treasures[0];
    assert.deepEqual({ level: reward.level, kingArmor: reward.kingArmor, canLumber: reward.canLumber }, { level, kingArmor, canLumber });
    specialMonsterDeath(g, target, killer); assert.equal(g.state.players[3].treasures.length, 1);
  }
});

test('single-route sandbox only schedules special units on its active route', () => {
  for (const wave of [5, 7]) {
    const g = game(wave); g.state.mode = 'sandbox'; g.state.sandbox = { aiEnabled: false };
    queueSpecialMonsters(g, 10);
    assert.equal(g._spawnQueue.length, 1); assert.equal(g._spawnQueue[0].laneId, 0);
  }
});

test('source flying counts and unclaimed route treasures survive the existing snapshot state', () => {
  const g = game(); queueSpecialMonsters(g, 10); applySpawn(g, g._spawnQueue[0]);
  g.state.wave = 14; specialMonsterDeath(g, { specialKind: 'treasure', sourceLaneId: 2, status: {} }, killer);
  const restored = game(); restored.restore(g.snapshot());
  assert.deepEqual(restored.state.specialMonsters.waveFive, { spawned: 1, killed: 0 });
  assert.deepEqual(restored.state.players[2].treasures, g.state.players[2].treasures);
});

console.log(`${passed} v14 special-monster rule checks passed.`);
