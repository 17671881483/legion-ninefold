import assert from 'node:assert/strict';
import { Game } from '../dist/engine.js';
import { UNITS } from '../dist/data.js';
import { farmerGoldRate, sourceEconomyBuildStart, sourceEconomyUpgradeFinish, applyFarmerRoundReward, sourceEconomyDeath } from '../dist/special-rules.js';

const units = Object.fromEntries(UNITS.map(u => [u.id, u]));
const farmer = UNITS.find(u => !u.legacy && u.sourceRawcode === 'n085');
const master = UNITS.find(u => !u.legacy && u.sourceRawcode === 'n084');
const saw = UNITS.find(u => !u.legacy && u.sourceRawcode === 'h00W');
let passed = 0;
const test = (name, fn) => { try { fn(); passed++; console.log(`✓ ${name}`); } catch (error) { console.error(`✗ ${name}`); throw error; } };
const game = () => { const g = new Game({ seed: 42 }); g.state.players.forEach(p => { p.buildings = []; delete p.nagaFarmerGoldRate; }); return g; };
const build = (g, id) => { const p = g.state.players[0], b = { id, unitId: farmer.id, construction: { finishAt: 2 } }; p.buildings.push(b); sourceEconomyBuildStart(g, p, b, farmer); return b; };
const killer = { ownerId: 0, team: 0, side: 'defender' };
const victim = (side = 'monster', raw = 'h00A') => ({ side, combatRawcode: raw, status: {}, hp: 0 });

test('Naga farmer registers at construction start for 15%, then 0.5 percentage points per extra farmer', () => {
  const g = game(), p = g.state.players[0], first = build(g, 'first');
  assert.equal(farmerGoldRate(p, units), 15); assert.ok(first.construction);
  sourceEconomyBuildStart(g, p, first, farmer); assert.equal(p.nagaFarmerGoldRate, 15);
  build(g, 'second'); build(g, 'third'); assert.equal(farmerGoldRate(p, units), 16);
});

test('Naga source rate is retained when selling removes the handle without a death event', () => {
  const g = game(), p = g.state.players[0]; build(g, 'first'); build(g, 'second');
  p.buildings = [];
  assert.equal(farmerGoldRate(p, units), 15.5, 'JASS zH RemoveUnit does not call NagaTrgUnregisterIncome');
  build(g, 'third'); assert.equal(p.nagaFarmerGoldRate, 16);
});

test('farmer upgrade unregisters only on completion and only once', () => {
  const g = game(), p = g.state.players[0], first = build(g, 'first'), second = build(g, 'second');
  first.construction.targetId = master.id; assert.equal(farmerGoldRate(p, units), 15.5);
  first.unitId = master.id; sourceEconomyUpgradeFinish(g, p, first, farmer); assert.equal(p.nagaFarmerGoldRate, 15);
  sourceEconomyUpgradeFinish(g, p, first, farmer); assert.equal(p.nagaFarmerGoldRate, 15);
  second.unitId = master.id; sourceEconomyUpgradeFinish(g, p, second, farmer); assert.equal(p.nagaFarmerGoldRate, 0);
});

test('old snapshots derive an initial rate from existing farmers including unfinished ones', () => {
  const g = game(), p = g.state.players[0];
  p.buildings = [{ id: 'a', unitId: farmer.id }, { id: 'b', unitId: farmer.id, construction: {} }, { id: 'c', unitId: master.id }];
  assert.equal(farmerGoldRate(p, units), 15.5);
  const snapshot = g.snapshot(); p.nagaFarmerGoldRate = 27; const restored = game(); restored.restore(snapshot);
  assert.equal(farmerGoldRate(restored.state.players[0], units), 15.5);
});

test('farmers increase killer gold on both monster and defending-combatant deaths, even in wave 31', () => {
  const g = game(), p = g.state.players[0]; build(g, 'first'); g._random = () => .1;
  for (const wave of [1, 31]) for (const side of ['monster', 'defender']) {
    g.state.wave = wave;
    assert.deepEqual(sourceEconomyDeath(g, victim(side), killer, units), { bonusGold: 1, bonusWood: 0 });
  }
  assert.equal(p.nagaFarmerGoldRate, 15, 'combat-body deaths do not unregister the hidden source building');
});

test('farmer chance uses the source percentage threshold and the death trigger cannot pay twice', () => {
  const g = game(); build(g, 'first'); g._random = () => .15;
  const target = victim(); assert.equal(sourceEconomyDeath(g, target, killer, units).bonusGold, 1);
  assert.equal(sourceEconomyDeath(g, target, killer, units).bonusGold, 0);
  g._random = () => .150001; assert.equal(sourceEconomyDeath(g, victim(), killer, units).bonusGold, 0);
  assert.deepEqual(sourceEconomyDeath(g, victim(), null, units), { bonusGold: 0, bonusWood: 0 });
});

test('A0LM pays one lumber with 35% probability only inside the ordinary monster branch', () => {
  const g = game(); g._random = () => .349;
  const sawKiller = { ...killer, unitId: saw.id };
  assert.deepEqual(sourceEconomyDeath(g, victim(), sawKiller, units), { bonusGold: 0, bonusWood: 1 });
  g._random = () => .35; assert.equal(sourceEconomyDeath(g, victim(), sawKiller, units).bonusWood, 0);
  g._random = () => 0;
  assert.equal(sourceEconomyDeath(g, victim('defender'), sawKiller, units).bonusWood, 0);
  assert.equal(sourceEconomyDeath(g, victim('monster', 'h0OU'), sawKiller, units).bonusWood, 0);
  g.state.wave = 31; assert.equal(sourceEconomyDeath(g, victim(), sawKiller, units).bonusWood, 0);
  g.state.wave = 5; assert.equal(sourceEconomyDeath(g, victim(), { ...sawKiller, abilityLevels: { A0LM: 2 } }, units).bonusWood, 0);
});

test('farm gold and A0LM lumber are independent bonuses and also work together', () => {
  const g = game(); build(g, 'first'); g._random = () => 0;
  assert.deepEqual(sourceEconomyDeath(g, victim(), { ...killer, unitId: saw.id }, units), { bonusGold: 1, bonusWood: 1 });
  assert.deepEqual(sourceEconomyDeath(g, victim('monster', 'h0OU'), { ...killer, unitId: saw.id }, units), { bonusGold: 1, bonusWood: 0 });
});

test('each surviving farm master pays three gold for every deployed original farmer, including cleaned corpses', () => {
  const g = game(), p = g.state.players[0]; p.farmWaveCount = 4;
  g.state.entities = [
    { ownerId: 0, side: 'defender', combatRawcode: 'h0W0', hp: 20 },
    { ownerId: 0, side: 'defender', combatRawcode: 'h0W0', hp: 20 },
    { ownerId: 0, side: 'defender', combatRawcode: 'h0W0', hp: 0 },
    { ownerId: 1, side: 'defender', combatRawcode: 'h0W0', hp: 20 },
  ];
  const before = p.gold, earned = p.stats.goldEarned;
  assert.equal(applyFarmerRoundReward(g, p, units), 24); assert.equal(p.gold - before, 24); assert.equal(p.stats.goldEarned - earned, 24);
  g.state.entities = []; assert.equal(applyFarmerRoundReward(g, p, units), 0, 'a dead farm master pays nothing');
});

test('the source OR/AND rule counts dead originals but only living farmer skins', () => {
  const g = game(), p = g.state.players[0]; p.farmWaveCount = 2;
  g.state.entities = [
    { ownerId: 0, side: 'defender', combatRawcode: 'h0W0', hp: 20 },
    { ownerId: 0, side: 'defender', combatRawcode: 'test-skin', skinBaseRawcode: 'h0W1', hp: 20 },
    { ownerId: 0, side: 'defender', combatRawcode: 'test-skin', skinBaseRawcode: 'h0W1', hp: 0 },
  ];
  assert.equal(applyFarmerRoundReward(g, p, units), 9);
});

console.log(`${passed} v14 source-economy checks passed.`);
