import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../dist/engine.js';
import { RULES } from '../dist/data.js';
import { MAP, isSegmentWalkable } from '../dist/layout.js';
import { serialize, deserialize } from 'node:v8';

const near = (a, b, tolerance = 1e-7) => assert.ok(Math.abs(a - b) < tolerance, `${a} ≠ ${b}`);
const copy = value => deserialize(serialize(value));
const at = { worldX: 5, worldY: 8 };

function fixture() {
  const g = new Game({ seed: 42 });
  g._aiTimer = 1e9;
  g.state.phase = 'combat';
  g.state.roundMode = 'normal';
  g.state.time = 12.5;
  g.state.entities = [];
  // Keep an otherwise empty combat round open while exercising the public clock.
  g._spawnQueue = [{ at: 1e9, laneId: 0, wave: {} }];
  for (const p of g.state.players) {
    p.buildings = [];
    p.heroId = null;
    p.popUsed = g._population(p);
  }
  return g;
}

function actor(g, options = {}) {
  const battleTeam = options.battleTeam ?? 0;
  const e = g._entity({ hp: 1000, damage: 0, speed: 0, range: .4, interval: 1 }, {
    side: 'monster', team: 1 - battleTeam, battleTeam,
    laneId: battleTeam * 4, sourceLaneId: battleTeam * 4,
    worldX: 5 + battleTeam * 34, worldY: 8, ...options,
  });
  g._ensureWorld(e);
  e.targetId = `old-target-${e.id}`;
  e.chase = { targetId: e.targetId, path: [{ x: e.worldX, y: e.worldY }], index: 0 };
  e.nav = { mode: 'monster', path: [{ x: e.worldX, y: e.worldY }], index: 0, distance: 4, interrupted: true };
  e.status.nextSenseAt = 99;
  e.attackCd = options.attackCd ?? 1.7;
  g.state.entities.push(e);
  return e;
}

function rejectedWithoutMutation(g, payload) {
  const before = g.snapshot();
  assert.equal(g.command('interfere', payload).ok, false);
  assert.deepEqual(g.snapshot(), before);
}

function assertReissued(g, e, before) {
  assert.equal(e.targetId, null);
  assert.equal(e.chase, null);
  near(e.status.nextSenseAt, g.state.time);
  near(e.attackCd, before.attackCd);
  near(e.hp, before.hp);
  assert.equal(e.status.stunUntil, before.status.stunUntil);
  assert.equal(e.worldX, before.worldX);
  assert.equal(e.worldY, before.worldY);
  assert.ok(e.nav.path.length >= 2, 'reissued order has a navigable route');
  const end = e.nav.path.at(-1), king = g.state.kings[e.battleTeam];
  near(end.x, king.worldX);
  near(end.y, king.worldY);
  for (let i = 1; i < e.nav.path.length; i++) {
    assert.ok(isSegmentWalkable(e.nav.path[i - 1], e.nav.path[i], e.battleTeam, e.radius), 'route stays on the map corridors');
  }
}

test('source T uses a 200-original-unit point radius and a five-second cooldown', () => {
  assert.equal(RULES.interfereEnabled, true);
  near(RULES.interfereRadius, 2 / 3);
  near(RULES.interfereCooldown, 5);
});

test('T reissues orders only for live monsters inside its circular area', () => {
  const g = fixture();
  const system = actor(g, { attackCd: 0 });
  const mercenary = actor(g, { worldX: at.worldX + .45, worldY: at.worldY + .2, isMercenary: true });
  const diagonalOutside = actor(g, { worldX: at.worldX + .5, worldY: at.worldY + .5 });
  const outside = actor(g, { worldX: at.worldX + .8 });
  const defender = actor(g, { side: 'defender', team: 0, ownerId: 0 });
  const dead = actor(g, { hp: 0 });
  const distantOtherTeam = actor(g, { battleTeam: 1 });
  const hit = [system, mercenary], untouched = [diagonalOutside, outside, defender, dead, distantOtherTeam];
  const hitBefore = hit.map(copy), untouchedBefore = untouched.map(copy), kingsBefore = copy(g.state.kings);
  assert.equal(g.command('interfere', at).ok, true);
  hit.forEach((e, i) => assertReissued(g, e, hitBefore[i]));
  untouched.forEach((e, i) => assert.deepEqual(e, untouchedBefore[i]));
  assert.deepEqual(g.state.kings, kingsBefore);
  near(g.state.players[0].interfereUntil, g.state.time + 5);
  near(g.state.players[0].interfereCooldown, 5);
});

test('T targets either army monster area without a caster-team restriction', () => {
  for (const battleTeam of [0, 1]) {
    const g = fixture(), e = actor(g, { battleTeam }), before = copy(e);
    const point = { worldX: e.worldX, worldY: e.worldY };
    assert.equal(g.command('interfere', { ...point, playerId: 0 }).ok, true);
    assertReissued(g, e, before);
  }
});

test('T also reissues leaked monsters toward their corresponding king', () => {
  const g = fixture(), point = { worldX: 13, worldY: 29 };
  const e = actor(g, { ...point, laneId: 8 });
  e.status.leaked = true;
  const before = copy(e);
  assert.equal(g.command('interfere', point).ok, true);
  assertReissued(g, e, before);
  assert.equal(e.status.leaked, true);
});

test('T preserves pre-existing status effects and does not inflict damage or a stun', () => {
  const g = fixture(), e = actor(g);
  e.status.stunUntil = g.state.time + 2;
  e.status.poisonUntil = g.state.time + 6;
  e.status.poisonDps = 3;
  const before = copy(e);
  assert.equal(g.command('interfere', at).ok, true);
  assertReissued(g, e, before);
  near(e.status.poisonUntil, before.status.poisonUntil);
  near(e.status.poisonDps, before.status.poisonDps);
});

test('empty in-bounds targets spend the cooldown without changing entities or kings', () => {
  const g = fixture(), e = actor(g), before = copy(e), kingsBefore = copy(g.state.kings);
  assert.equal(g.command('interfere', { worldX: 30, worldY: 10 }).ok, true);
  assert.deepEqual(e, before);
  assert.deepEqual(g.state.kings, kingsBefore);
  near(g.state.players[0].interfereCooldown, 5);
  rejectedWithoutMutation(g, at);
});

test('T cooldowns belong to individual players', () => {
  const g = fixture();
  actor(g);
  assert.equal(g.command('interfere', { ...at, playerId: 0 }).ok, true);
  rejectedWithoutMutation(g, { ...at, playerId: 0 });
  assert.equal(g.command('interfere', { ...at, playerId: 1 }).ok, true);
  assert.equal(g.command('interfere', { ...at, playerId: 4 }).ok, true);
  near(g.state.players[0].interfereCooldown, 5);
  near(g.state.players[1].interfereCooldown, 5);
  near(g.state.players[4].interfereCooldown, 5);
  assert.equal(g.state.players[2].interfereCooldown ?? 0, 0);
});

test('T rejects absent, non-finite and out-of-bounds coordinates atomically', () => {
  const invalid = [
    {}, { laneId: 0 }, { worldX: 5 }, { worldY: 8 },
    { worldX: NaN, worldY: 8 }, { worldX: 5, worldY: Infinity },
    { worldX: -Infinity, worldY: 8 }, { worldX: null, worldY: 8 },
    { worldX: '5', worldY: 8 },
    { worldX: MAP.bounds.minX - .001, worldY: 8 },
    { worldX: MAP.bounds.maxX + .001, worldY: 8 },
    { worldX: 5, worldY: MAP.bounds.minY - .001 },
    { worldX: 5, worldY: MAP.bounds.maxY + .001 },
    { ...at, playerId: 99 },
  ];
  for (const payload of invalid) {
    const g = fixture();
    actor(g);
    rejectedWithoutMutation(g, payload);
  }
});

test('T rejects build, arena and ended phases without mutating the snapshot', () => {
  for (const mode of ['build', 'arena', 'arena-prep', 'arena-transition', 'ended']) {
    const g = fixture();
    actor(g);
    if (mode === 'ended' || mode === 'build') g.state.phase = mode;
    else { g.state.roundMode = mode; if (mode !== 'arena') g.state.phase = 'build'; }
    rejectedWithoutMutation(g, at);
  }
});

test('paused T requests cannot alter targets or spend cooldown', () => {
  const g = fixture();
  actor(g);
  g.command('pause', { value: true });
  rejectedWithoutMutation(g, at);
});

test('T cooldown uses simulation time, pauses, and honors game speed', () => {
  const g = fixture();
  actor(g);
  assert.equal(g.command('interfere', at).ok, true);
  g.tick(1);
  near(g.state.players[0].interfereCooldown, 4);
  g.command('pause', { value: true });
  const paused = g.snapshot();
  g.tick(4);
  assert.deepEqual(g.snapshot(), paused);
  g.command('pause', { value: false });
  g.command('speed', { value: 2 });
  g.tick(1.9);
  near(g.state.players[0].interfereCooldown, .2);
  rejectedWithoutMutation(g, at);
  g.tick(.101);
  near(g.state.players[0].interfereCooldown, 0);
  assert.equal(g.command('interfere', at).ok, true);
  near(g.state.players[0].interfereCooldown, 5);
});

test('T navigation, targets and independent cooldowns survive snapshot restoration', () => {
  const g = fixture(), e = actor(g);
  assert.equal(g.command('interfere', { ...at, playerId: 1 }).ok, true);
  g.tick(1.25);
  const saved = g.snapshot(), restored = Game.fromSnapshot(saved);
  assert.deepEqual(restored.snapshot(), saved);
  near(restored.state.players[1].interfereCooldown, 3.75);
  const copyEntity = restored.state.entities.find(x => x.id === e.id);
  assert.deepEqual(copyEntity.nav, e.nav);
  assert.equal(copyEntity.targetId, e.targetId);
  rejectedWithoutMutation(restored, { ...at, playerId: 1 });
  assert.equal(restored.command('interfere', { ...at, playerId: 2 }).ok, true);
  restored.tick(3.751);
  near(restored.state.players[1].interfereCooldown, 0);
  assert.equal(restored.command('interfere', { ...at, playerId: 1 }).ok, true);
});
