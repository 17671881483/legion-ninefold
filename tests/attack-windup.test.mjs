import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../dist/engine.js';
import { WAVES } from '../dist/data.js';
import { laneToWorld, kingWorld } from '../dist/layout.js';

const near = (actual, expected, message = '') => assert.ok(Math.abs(actual - expected) < 1e-7, `${message}: ${actual} != ${expected}`);
function fixture({ king = false, weapon = null } = {}) {
  const g = new Game({ seed: 3281 }); g._aiTimer = 1e9;
  g.state.phase = 'combat'; g.state.time = 1; g.state.entities = []; g._spawnQueue = [];
  for (const k of g.state.kings) { k.regen = 0; k.attackCd = 1e9; k.armor = 0; k.armorType = 'unarmored'; }
  const point = king ? kingWorld(0) : laneToWorld(0, 3, 6);
  const crab = g._entity({ ...WAVES[0], hp: 100000, ...(weapon ? { weapon1: weapon } : {}) }, {
    side: 'monster', team: 1, battleTeam: 0, laneId: king ? 8 : 0, sourceLaneId: 0,
    worldX: point.x, worldY: point.y - .4, attackCd: 0, ownerId: null,
  });
  crab.moveSpeed = 0;
  let target = g.state.kings[0];
  if (!king) {
    target = g._entity({ id: 'windup-target', hp: 10000, damage: 0, range: 100, interval: 1, armor: 0, armorType: 'unarmored', ability: null }, {
      side: 'defender', team: 0, battleTeam: 0, laneId: 0, sourceLaneId: 0, ownerId: 0,
      worldX: point.x, worldY: point.y, attackCd: 1e9,
    });
    target.moveSpeed = 0; g.state.entities.push(target);
  }
  g.state.entities.unshift(crab);
  return { g, crab, target, damage: crab.damage * g._typeMultiplier('pierce', 'unarmored') };
}
const begin = g => g._updateEntities(0);

test('source crab waits its 0.5-second attack point, hits once, and keeps its total 1.25-second attack cycle', () => {
  const { g, crab, target, damage } = fixture(), hp = target.hp;
  assert.equal(Number(crab.weapon1.dmgpt1), .5); assert.equal(Number(crab.weapon1.cool1), 1.25);
  const position = [crab.worldX, crab.worldY]; begin(g);
  assert.deepEqual(crab.pendingAttack, { targetId: target.id, targetIsKing: false, startedAt: 1, finishAt: 1.5 }); near(target.hp, hp);
  g.tick(.49); near(target.hp, hp); assert.deepEqual([crab.worldX, crab.worldY], position);
  g.tick(.01); near(target.hp, hp - damage); assert.equal(crab.pendingAttack, null); near(crab.attackCd, .75);
  g.tick(.74); near(target.hp, hp - damage); assert.equal(crab.pendingAttack, null);
  g.tick(.01); near(crab.pendingAttack.startedAt, 2.25); near(crab.pendingAttack.finishAt, 2.75); near(target.hp, hp - damage);
  g.tick(.49); near(target.hp, hp - damage); g.tick(.01); near(target.hp, hp - damage * 2);
});

test('T before the attack point cancels damage, preserves current cooldown, and permits a fresh windup', () => {
  const { g, crab, target, damage } = fixture(), hp = target.hp; begin(g); g.tick(.3);
  const cooldown = crab.attackCd;
  assert(g.command('interfere', { worldX: crab.worldX, worldY: crab.worldY }).ok);
  assert.equal(crab.pendingAttack, null); near(crab.attackCd, cooldown); near(target.hp, hp);
  begin(g); near(crab.pendingAttack.startedAt, 1.3); near(crab.pendingAttack.finishAt, 1.8);
  g.tick(.49); near(target.hp, hp); g.tick(.01); near(target.hp, hp - damage);
});

test('king-target windups resolve against the real king and survive JSON snapshots', () => {
  const { g, crab, target, damage } = fixture({ king: true }), hp = target.hp; begin(g);
  assert.equal(crab.pendingAttack.targetIsKing, true); assert.equal(crab.pendingAttack.targetId, target.id);
  g.tick(.2); const restored = Game.fromSnapshot(JSON.parse(JSON.stringify(g.snapshot())));
  g.tick(.29); restored.tick(.29); near(target.hp, hp); assert.deepEqual(restored.snapshot(), g.snapshot());
  g.tick(.01); restored.tick(.01); near(target.hp, hp - damage); assert.equal(crab.pendingAttack, null); assert.deepEqual(restored.snapshot(), g.snapshot());
});

test('death, stun, disarm, changed team, invalid target and lost melee reach cancel the pending hit', () => {
  const cases = {
    attackerDeath: ({ crab }) => { crab.hp = 0; },
    targetDeath: ({ target }) => { target.hp = 0; },
    targetRemoved: ({ g, target }) => { g.state.entities = g.state.entities.filter(e => e.id !== target.id); },
    changedTeam: ({ crab, target }) => { target.team = crab.team; },
    changedSide: ({ crab, target }) => { target.side = crab.side; },
    changedBattle: ({ target }) => { target.battleTeam = 1; },
    stun: ({ g, crab }) => { crab.status.stunUntil = g.state.time + 1; },
    disarm: ({ g, crab }) => { crab.buffs.push({ key: 'test-disarm', expiresAt: g.state.time + 1, disarm: true }); },
    outOfRange: ({ target }) => { target.worldY += 3; },
  };
  for (const [name, mutate] of Object.entries(cases)) {
    const f = fixture(); begin(f.g); f.g.tick(.2); mutate(f); const hp = f.target.hp;
    f.g.tick(.3); assert.equal(f.crab.pendingAttack, null, name); near(f.target.hp, hp, name);
  }
});

test('pause and speed apply to a saved windup through the normal simulation clock', () => {
  const { g, crab, target, damage } = fixture(), hp = target.hp; begin(g); g.tick(.2);
  g.command('pause'); const saved = JSON.parse(JSON.stringify(g.snapshot()));
  const restored = Game.fromSnapshot(saved); g.tick(20); restored.tick(20); assert.deepEqual(g.snapshot(), saved); assert.deepEqual(restored.snapshot(), saved);
  g.command('speed', { value: 4 }); restored.command('speed', { value: 4 }); g.command('pause'); restored.command('pause');
  g.tick(.05); restored.tick(.05); near(target.hp, hp); near(g.state.time, 1.4); assert.deepEqual(restored.snapshot(), g.snapshot());
  g.tick(.025); restored.tick(.025); near(target.hp, hp - damage); assert.equal(crab.pendingAttack, null); assert.deepEqual(restored.snapshot(), g.snapshot());
});

test('attack speed, frenzy and congestion scale the windup using the same attack-rate factors', () => {
  const { g, crab, target } = fixture(); const battle = [crab, target]; battle.auras = [];
  crab.buffs.push({ key: 'windup-haste', expiresAt: 100, haste: 1 }); crab.status.frenzy = true; g._monsterPressure = [1, 2];
  g._beginMonsterAttack(crab, target, battle); near(crab.pendingAttack.finishAt - crab.pendingAttack.startedAt, .5 / (2 * 1.6) * 2);
  g.state.time = crab.pendingAttack.finishAt; g._worldEntities = new Map([[target.id, target]]);
  assert(g._advanceMonsterAttack(crab, battle)); near(crab.attackCd, 1.25 / (2 * 1.6) * 2 - .5 / (2 * 1.6) * 2);
});

test('missing or zero source attack points remain instant and the low-level attack interface stays immediate', () => {
  for (const dmgpt1 of [undefined, 0]) {
    const weapon = { ...WAVES[0].weapon1, dmgpt1 }, { g, crab, target, damage } = fixture({ weapon }), hp = target.hp;
    begin(g); near(target.hp, hp - damage); assert(!crab.pendingAttack); near(crab.attackCd, 1.25);
  }
  const { g, crab, target, damage } = fixture(), hp = target.hp, battle = [crab, target]; battle.auras = [];
  g._attack(crab, target, battle); near(target.hp, hp - damage); assert(!crab.pendingAttack);
});
