/**
 * Run: node tests/engine.test.mjs (from the legion-ninefold directory), or
 * node outputs/legion-ninefold/tests/engine.test.mjs (from the task workspace).
 * No DOM, server or dependencies. Data URLs make the browser ES modules work
 * on Node 18 as well, without changing the distributable's package settings.
 */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';

// Recursively inline local ES modules so the same browser sources run on Node 18.
const moduleURLs = new Map();
async function moduleURL(file) {
  const href = file.href;
  if (moduleURLs.has(href)) return moduleURLs.get(href);
  let source = await readFile(file, 'utf8');
  for (const match of [...source.matchAll(/\bfrom\s+(['"])(\.{1,2}\/[^'"]+)\1/g)]) {
    const child = await moduleURL(new URL(match[2], file));
    source = source.replaceAll(match[0], `from '${child}'`);
  }
  const encoded = `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
  moduleURLs.set(href, encoded); return encoded;
}
const data = await import(await moduleURL(new URL('../dist/data.js', import.meta.url)));
const layout = await import(await moduleURL(new URL('../dist/layout.js', import.meta.url)));
const { MAP, laneToWorld, kingWorld, spawnWarpWorld, supportWorld, isWalkable, isSegmentWalkable } = layout;
const { Game } = await import(await moduleURL(new URL('../dist/engine.js', import.meta.url)));
const { UNITS, MERCENARIES, LEGACY_MERCENARIES, HEROES, WAVES, RULES } = data;
const unit = id => UNITS.find(u => u.id === id);
const stockMax = m => m.stockMax ?? 3;
const mercCooldown = m => m.cooldown ?? m.cd ?? 4;
const burstMerc = () => MERCENARIES.find(m => m.unlock === 1 && stockMax(m) === 3);
let passed = 0;
const began = performance.now();
function test(name, fn) {
  fn(); passed++;
  console.log(`✓ ${name}`);
}
function near(actual, expected, tolerance = 1e-7) {
  assert(Math.abs(actual - expected) < tolerance, `${actual} ≠ ${expected}`);
}
function game(seed = 42) {
  const g = new Game({ seed, difficulty: 'normal' });
  g._aiTimer = 1e9; // isolate commands; full-match tests below keep all AI enabled
  return g;
}
function combatFixture() {
  const g = game();
  for (const p of g.state.players) { p.buildings = []; p.heroId = null; p.roundLeaks = 0; }
  g.command('ready'); g._spawnQueue = []; g.state.entities = [];
  for (const king of g.state.kings) king.regen = 0;
  return g;
}
function monster(g, laneId = 0, overrides = {}) {
  const e = g._entity({ id: 'test-monster', name: '测试怪', hp: 100, damage: 0, interval: 1, range: .4, speed: .1 }, {
    side: 'monster', team: laneId < 4 || laneId === 8 ? 1 : 0,
    laneId, sourceLaneId: laneId >= 8 ? (laneId === 8 ? 0 : 4) : laneId,
    x: 3, y: 0, reward: 7, ...overrides,
  });
  if (laneId >= 8 && overrides.worldX === undefined) { const k = kingWorld(laneId - 8); e.worldX = k.x; e.worldY = k.y - 14; }
  g._ensureWorld(e);
  g.state.entities.push(e); return e;
}

function stationaryActor(g, definition = {}, options = {}) {
  const side = options.side ?? 'monster', laneId = options.laneId ?? 8;
  const team = side === 'defender' ? (laneId < 4 || laneId === 8 ? 0 : 1) : (laneId < 4 || laneId === 8 ? 1 : 0);
  const e = g._entity({ hp: 10000, damage: 0, interval: 1, range: .4, speed: 0, ...definition }, {
    side, team, laneId, sourceLaneId: laneId >= 8 ? (laneId === 8 ? 0 : 4) : laneId,
    ownerId: side === 'defender' ? 0 : null, x: 3, y: 6, ...options,
  });
  e.moveSpeed = 0; e.attackCd = options.attackCd ?? 0; e.abilityCd = 0;
  g._ensureWorld(e); g.state.entities.push(e); return e;
}

// Public API, configuration, resource integrity and all initial assertions.
test('8 players, two shared kings, deterministic six-tier base rosters and 6 × 8 grid', () => {
  const a = game(), b = game();
  assert.deepEqual(a.state, b.state);
  assert.equal(a.state.players.length, 8); assert.equal(a.state.kings.length, 2);
  assert.equal(a.state.players.filter(p => p.team === 0).length, 4);
  assert.equal(a.state.kings[0].maxHp, RULES.kingInitialHp);
  assert.equal(a.state.timer, RULES.firstBuildSeconds);
  assert.equal(a.state.timer, 80);
  for (const p of a.state.players) {
    assert.equal(p.roster.length, 6);
    assert.deepEqual(p.roster.map(id => unit(id).tier), [1, 2, 3, 4, 5, 6]);
    assert(p.roster.every(id => unit(id).randomPool));
    assert.equal(p.populationCap, RULES.initialPopulation);
  }
  const p = a.state.players[0], before = p.gold;
  assert(!a.command('build', { unitId: p.roster[0], col: 6, row: 0 }).ok);
  assert(!a.command('build', { unitId: p.roster[0], col: 0, row: 8 }).ok);
  assert(!a.command('build', { unitId: p.roster[0], col: .5, row: 1 }).ok);
  assert.equal(p.gold, before); assert.equal(p.buildings.length, 0);
});

test('exact-price build, duplicate-cell failure, foreign ownership and cumulative upgrade/sale', () => {
  const g = game(), p = g.state.players[0], base = unit(p.roster[0]);
  p.gold = base.cost - 1;
  assert(!g.command('build', { unitId: base.id, col: 2, row: 4 }).ok);
  assert.equal(p.gold, base.cost - 1);
  p.gold = base.cost;
  assert(g.command('build', { unitId: base.id, col: 2, row: 4 }).ok);
  assert.equal(p.gold, 0);
  const b = p.buildings[0]; p.gold = 10000;
  assert(!g.command('build', { unitId: base.id, col: 2, row: 4 }).ok);
  const foreign = g.state.players[1].buildings[0];
  if (foreign) {
    assert(!g.command('upgrade', { buildingId: foreign.id }).ok);
    assert(!g.command('sell', { buildingId: foreign.id }).ok);
  }
  const target = unit(base.upgrades[0]);
  const goldBefore = p.gold;
  assert(g.command('upgrade', { buildingId: b.id, unitId: target.id }).ok);
  assert.equal(p.gold, goldBefore - target.cost);
  assert.equal(b.totalSpent, base.cost + target.cost); assert.equal(b.spent, b.totalSpent);
  const beforeSale = p.gold;
  assert(g.command('sell', { buildingId: b.id }).ok);
  assert.equal(p.gold, beforeSale + Math.floor(b.totalSpent * RULES.sellRatio));
  assert.equal(p.buildings.length, 0);
});

test('worker pricing, lumber formula, reroll limits and roster validity', () => {
  const g = game(), p = g.state.players[0]; p.gold = 10000; p.wood = 10000;
  const start = p.gold;
  for (let workers = p.workers; workers < RULES.maxWorkers; workers++) {
    const before = p.gold;
    assert(g.command('worker').ok);
    assert.equal(before - p.gold, RULES.workerCostBase + (workers - 1) * RULES.workerCostStep);
  }
  assert(p.gold < start); assert(!g.command('worker').ok);
  const woodBeforeUpgrade = p.wood, goldBeforeUpgrade = p.gold;
  assert(g.command('lumber').ok);
  assert.equal(goldBeforeUpgrade - p.gold, RULES.lumberUpgradeCostBase);
  assert.equal(p.wood, woodBeforeUpgrade);
  const wood = p.wood; g.tick(2);
  near(p.wood - wood, p.workers * RULES.workerBaseWoodPerSecond * (1 + RULES.lumberRateStep) * 2);
  const buildings = JSON.parse(JSON.stringify(p.buildings));
  for (let i = 0; i < RULES.rerollCount; i++) assert(g.command('reroll').ok);
  assert(!g.command('reroll').ok);
  assert(p.roster.every(id => unit(id).randomPool)); assert.deepEqual(p.buildings, buildings);
});

test('economy caps allow workers 9 to 10 and lumber 29 to 30, then reject without charging', () => {
  assert.equal(RULES.maxWorkers, 10); assert.equal(RULES.maxLumberLevel, 30);
  for (const combat of [false, true]) {
    const g = combat ? combatFixture() : game(), p = g.state.players[0];
    p.gold = 10000; p.workers = 9; p.lumberLevel = 29;
    const wood = p.wood, income = p.income, gold = p.gold;
    assert(g.command('worker').ok); assert.equal(p.workers, 10);
    assert.equal(gold - p.gold, RULES.workerCostBase + 8 * RULES.workerCostStep);
    assert.equal(p.popUsed, 10 * RULES.workerPopulation);
    const beforeLumber = p.gold;
    assert(g.command('lumber').ok); assert.equal(p.lumberLevel, 30);
    assert.equal(beforeLumber - p.gold, RULES.lumberUpgradeCostBase + 29 * RULES.lumberUpgradeCostStep);
    assert.equal(p.wood, wood); assert.equal(p.income, income);
    const capped = g.snapshot();
    assert(!g.command('worker').ok); assert.deepEqual(g.snapshot(), capped);
    assert(!g.command('lumber').ok); assert.deepEqual(g.snapshot(), capped);
    assert.equal(g.state.phase, combat ? 'combat' : 'build');
  }
});

test('combat permits worker and lumber upgrades, with each change applied to the next production tick', () => {
  const g = combatFixture(), p = g.state.players[0];
  monster(g, 0, { hp: 1e9, maxHp: 1e9, damage: 0 }); // Keep this real combat alive throughout the checks.
  p.gold = 10000; p.workers = 9; p.lumberLevel = 29;
  let wood = p.wood;
  g.tick(.1); assert.equal(g.state.phase, 'combat');
  near(p.wood - wood, 9 * RULES.workerBaseWoodPerSecond * (1 + 29 * RULES.lumberRateStep) * .1);
  assert(g.command('worker').ok); assert.equal(p.workers, 10); wood = p.wood;
  g.tick(.1); assert.equal(g.state.phase, 'combat');
  near(p.wood - wood, 10 * RULES.workerBaseWoodPerSecond * (1 + 29 * RULES.lumberRateStep) * .1);
  assert(g.command('lumber').ok); assert.equal(p.lumberLevel, 30); wood = p.wood;
  g.tick(.1); assert.equal(g.state.phase, 'combat');
  near(p.wood - wood, 10 * RULES.workerBaseWoodPerSecond * (1 + 30 * RULES.lumberRateStep) * .1);
});

test('new and legacy saves retain economy progress and continue upgrades without resetting workers or lumber', () => {
  for (const [workers, level] of [[10, 30], [7, 29]]) for (const combat of [false, true]) {
    const g = game(71), p = g.state.players[0];
    p.workers = workers; p.lumberLevel = level; p.gold = 10000; p.wood = 321;
    if (combat) g.command('ready'); else p.popUsed = workers * RULES.workerPopulation;
    const serialized = g.snapshot();
    for (const version of [1, 2]) {
      const saved = JSON.parse(JSON.stringify(serialized)); saved.version = version;
      if (version === 1) { delete saved.mapId; delete saved.mapVersion; delete saved.state.map; }
      const restored = Game.fromSnapshot(saved), rp = restored.state.players[0];
      assert.equal(rp.workers, workers); assert.equal(rp.lumberLevel, level);
      assert.equal(rp.gold, p.gold); assert.equal(rp.wood, p.wood); assert.equal(rp.popUsed, p.popUsed);
      assert.equal(restored.state.phase, combat ? 'combat' : 'build');
      if (version === 2) assert.deepEqual(restored.snapshot(), serialized);
      const wood = rp.wood; restored.tick(.2);
      near(rp.wood - wood, workers * RULES.workerBaseWoodPerSecond * (1 + level * RULES.lumberRateStep) * .2);
      if (workers < 10) { assert(restored.command('worker').ok); assert.equal(rp.workers, workers + 1); }
      if (level < 30) { assert(restored.command('lumber').ok); assert.equal(rp.lumberLevel, level + 1); }
    }
  }
});

test('population gates build/upgrade/worker/hero; farms clamp cap and never overcharge', () => {
  const g = game(), p = g.state.players[0]; p.gold = 10000;
  p.populationCap = p.workers;
  const gold = p.gold;
  assert(!g.command('build', { unitId: p.roster[0], col: 0, row: 0 }).ok);
  assert(!g.command('worker').ok); assert(!g.command('hero', { heroId: HEROES[0].id }).ok);
  assert.equal(p.gold, gold);
  assert(g.command('farm').ok); assert.equal(p.populationCap, p.workers + RULES.farmPopulation);
  assert(g.command('build', { unitId: p.roster[0], col: 0, row: 0 }).ok);
  const b = p.buildings[0], up = unit(unit(b.unitId).upgrades[0]);
  p.populationCap = p.popUsed;
  if (up.population > unit(b.unitId).population) assert(!g.command('upgrade', { buildingId: b.id, unitId: up.id }).ok);
  p.populationCap = RULES.maxPopulation - 3;
  assert(g.command('farm').ok); assert.equal(p.populationCap, RULES.maxPopulation);
  const maxGold = p.gold; assert(!g.command('farm').ok); assert.equal(p.gold, maxGold);
  assert(g.command('hero', { heroId: HEROES[0].id }).ok);
  assert.equal(p.popUsed, p.workers * RULES.workerPopulation + unit(b.unitId).population + HEROES[0].population);
});

test('mercenary market locks, stocked burst, permanent income and dispatched wave queue', () => {
  const g = game(), p = g.state.players[0]; p.wood = 10000;
  const locked = MERCENARIES.find(m => m.unlock > 1);
  const wood = p.wood, income = p.income;
  assert(!g.command('merc', { mercId: locked.id }).ok); assert.equal(p.wood, wood);
  assert.deepEqual(g.mercenaryStatus(locked.id), { stock: 0, maxStock: stockMax(locked), cooldown: mercCooldown(locked), remaining: 0, progress: 1, locked: true });
  g.state.wave = locked.unlock; g.state.phase = 'combat'; assert.equal(g.mercenaryStatus(locked.id).stock, stockMax(locked)); g.state.wave = 1; g.state.phase = 'build';
  const m = burstMerc(); assert(m, 'stage-one market retains a three-stock low-cost mercenary');
  for (let i = 0; i < 3; i++) assert(g.command('merc', { mercId: m.id }).ok);
  assert.equal(p.wood, wood - m.wood * 3); assert.equal(p.income, income + m.income * 3);
  assert.equal(p.stats.sent, 3);
  assert.deepEqual(g.state.pendingSends.map(s => [s.senderId, s.dispatch, s.laneId, s.wave, s.count]), [[0, true, null, 1, 1], [0, true, null, 1, 1], [0, true, null, 1, 1]]);
  const empty = g.snapshot(); assert(!g.command('merc', { mercId: m.id }).ok); assert.deepEqual(g.snapshot(), empty);
  g.command('ready'); const finalAt = Math.max(...g._spawnQueue.map(entry => entry.at)); g.tick(.6);
  assert.equal(g.state.entities.filter(e => e.isMerc).length, 3);
  g.tick(finalAt + .1 - .6);
  assert.equal(g.state.metrics.spawned, WAVES[0].count * 8 + 3);
  const next = MERCENARIES.find(candidate => candidate.id !== m.id && candidate.unlock === 1);
  assert(g.command('merc', { mercId: next.id }).ok);
  assert.equal(g.state.pendingSends[0].wave, 2);
});

test('mercenary stock replenishes serially without reset, over-cap banking or query economy effects', () => {
  const g = game(), p = g.state.players[0], m = burstMerc(), other = MERCENARIES.find(candidate => candidate.id !== m.id && candidate.unlock === 1), cd = mercCooldown(m);
  p.wood = 10000; g.state.timer = 1000;
  const economy = [p.gold, p.wood, p.income, p.stats.sent, g.state.pendingSends.length];
  for (let i = 0; i < 10; i++) assert.equal(g.mercenaryStatus(m.id).stock, 3);
  assert.deepEqual([p.gold, p.wood, p.income, p.stats.sent, g.state.pendingSends.length], economy);
  assert(g.command('merc', { mercId: m.id }).ok);
  assert.equal(g.mercenaryStatus(m.id).stock, 2); near(g.mercenaryStatus(m.id).remaining, cd);
  g.tick(cd / 4); assert(g.command('merc', { mercId: m.id }).ok);
  assert.equal(g.mercenaryStatus(m.id).stock, 1); near(g.mercenaryStatus(m.id).remaining, cd * .75); near(g.mercenaryStatus(m.id).progress, .25);
  g.tick(cd / 4); assert(g.command('merc', { mercId: m.id }).ok);
  assert.equal(g.mercenaryStatus(m.id).stock, 0); near(g.mercenaryStatus(m.id).remaining, cd / 2);
  assert(!g.command('merc', { mercId: m.id }).ok);
  assert.equal(g.mercenaryStatus(other.id).stock, stockMax(other)); assert.equal(g.mercenaryStatus(m.id, 1).stock, 3);
  g.tick(cd / 2); assert.equal(g.mercenaryStatus(m.id).stock, 1); near(g.mercenaryStatus(m.id).remaining, cd);
  g.tick(cd); assert.equal(g.mercenaryStatus(m.id).stock, 2); near(g.mercenaryStatus(m.id).remaining, cd);
  g.tick(cd); assert.equal(g.mercenaryStatus(m.id).stock, 3); assert.equal(g.mercenaryStatus(m.id).remaining, 0); assert.equal(g.mercenaryStatus(m.id).progress, 1);
  g.tick(30); assert.equal(g.mercenaryStatus(m.id).stock, 3);
  assert(g.command('merc', { mercId: m.id }).ok); assert.equal(g.mercenaryStatus(m.id).stock, 2); near(g.mercenaryStatus(m.id).remaining, cd);
  g.tick(.25); assert.equal(g.mercenaryStatus(m.id).stock, 2); near(g.mercenaryStatus(m.id).remaining, cd - .25);
  const insufficient = g.mercenaryStatus(other.id), queued = g.state.pendingSends.length; p.wood = 0;
  assert(!g.command('merc', { mercId: other.id }).ok); assert.deepEqual(g.mercenaryStatus(other.id), insufficient); assert.equal(g.state.pendingSends.length, queued);
});

test('mercenary recharge follows pause and simulation speed', () => {
  const g = game(), p = g.state.players[0], m = burstMerc(), cd = mercCooldown(m); p.wood = 10000; g.state.timer = 1000;
  for (let i = 0; i < 3; i++) assert(g.command('merc', { mercId: m.id }).ok);
  g.tick(cd / 4); near(g.mercenaryStatus(m.id).progress, .25);
  g.command('pause'); const status = g.mercenaryStatus(m.id); g.tick(10); assert.deepEqual(g.mercenaryStatus(m.id), status);
  g.command('pause'); g.command('speed', { value: 4 }); g.tick(cd / 8);
  assert.equal(g.mercenaryStatus(m.id).stock, 0); near(g.mercenaryStatus(m.id).remaining, cd / 4); near(g.mercenaryStatus(m.id).progress, .75);
  g.tick(cd / 16); assert.equal(g.mercenaryStatus(m.id).stock, 1); near(g.mercenaryStatus(m.id).remaining, cd);
});

test('mercenary stock JSON saves preserve recharge and old absolute cooldowns migrate safely', () => {
  const g = game(), p = g.state.players[0], m = burstMerc(), cd = mercCooldown(m); p.wood = 10000; g.state.timer = 1000;
  g.command('merc', { mercId: m.id }); g.command('merc', { mercId: m.id }); g.tick(cd / 4);
  const restored = Game.fromSnapshot(JSON.parse(JSON.stringify(g.snapshot())));
  assert.deepEqual(restored.mercenaryStatus(m.id), g.mercenaryStatus(m.id)); assert.deepEqual(restored.snapshot(), g.snapshot());
  g.tick(cd * .75); restored.tick(cd * .75); assert.deepEqual(restored.snapshot(), g.snapshot());
  const legacy = g.snapshot();
  for (const player of legacy.state.players) delete player.mercStocks;
  const [next, fresh] = MERCENARIES.filter(candidate => candidate.id !== m.id && candidate.unlock === 1);
  legacy.state.players[0].mercCooldowns = { [m.id]: legacy.state.time + 2, [next.id]: legacy.state.time - .1 };
  const old = Game.fromSnapshot(legacy), oldPlayer = old.state.players[0];
  assert.equal(old.mercenaryStatus(m.id).stock, 0); near(old.mercenaryStatus(m.id).remaining, 2);
  assert.equal(old.mercenaryStatus(next.id).stock, stockMax(next)); assert.equal(old.mercenaryStatus(fresh.id).stock, stockMax(fresh));
  assert.equal(old.mercenaryStatus(m.id, 1).stock, 3);
  const untouched = [oldPlayer.wood, oldPlayer.income, oldPlayer.stats.sent, old.state.pendingSends.length];
  for (let i = 0; i < 10; i++) old.mercenaryStatus(m.id);
  assert.deepEqual([oldPlayer.wood, oldPlayer.income, oldPlayer.stats.sent, old.state.pendingSends.length], untouched);
  old.tick(2); assert.equal(old.mercenaryStatus(m.id).stock, 1); near(old.mercenaryStatus(m.id).remaining, cd);
  const migrated = Game.fromSnapshot(JSON.parse(JSON.stringify(old.snapshot())));
  old.tick(cd * 2); migrated.tick(cd * 2); assert.deepEqual(old.snapshot(), migrated.snapshot()); assert.equal(old.mercenaryStatus(m.id).stock, 3);
});

test('spawn rectangle stays in the narrow portal, with reference-derived counts and one creep per 0.1 seconds per lane', () => {
  const g = game(); g.state.players[0].wood = 500; g.command('merc', { mercId: MERCENARIES[0].id }); g.command('ready');
  assert.equal(g._spawnQueue.length, WAVES[0].count * 8 + 1);
  assert(g._spawnQueue.every(entry => entry.x >= 2.1 - 1e-8 && entry.x <= 3.9 + 1e-8));
  assert(g._spawnQueue.some(entry => entry.at > 4));
  const lane = g._spawnQueue.filter(entry => entry.laneId === 0 && !entry.merc);
  near(lane[0].at, .1);
  for (let i = 1; i < lane.length; i++) near(lane[i].at - lane[i - 1].at, .1);
});

test('all market capacities and cooldowns retain their source values, including one-stock long cooldowns', () => {
  assert.deepEqual([...new Set(MERCENARIES.map(m => m.stockMax))].sort(), [1, 2, 3]);
  for (const m of MERCENARIES) {
    const g = game(), p = g.state.players[0]; p.wood = 100000; g.state.wave = m.unlock; g.state.phase = 'combat';
    const full = g.mercenaryStatus(m.id); assert.equal(full.maxStock, m.stockMax); assert.equal(full.stock, m.stockMax); assert.equal(full.cooldown, m.cooldown);
    for (let i = 0; i < m.stockMax; i++) assert(g.command('merc', { mercId: m.id }).ok);
    assert.equal(g.mercenaryStatus(m.id).stock, 0);
    const before = g.snapshot(); assert(!g.command('merc', { mercId: m.id }).ok); assert.deepEqual(g.snapshot(), before);
    g.state.time += m.cooldown / 2; near(g.mercenaryStatus(m.id).progress, .5); assert.equal(g.mercenaryStatus(m.id).stock, 0);
    g.state.time += m.cooldown / 2; assert.equal(g.mercenaryStatus(m.id).stock, 1);
    if (m.stockMax === 1) assert.equal(g.mercenaryStatus(m.id).remaining, 0); else near(g.mercenaryStatus(m.id).remaining, m.cooldown);
  }
});

test('advanced markets unlock on combat start of waves 10 and 15, with preparation still locked', () => {
  for (const unlock of [10, 15]) {
    const m = MERCENARIES.find(m => m.unlock === unlock); assert(m); assert.equal(m.unlockPhase, 'combat');
    const g = game(), p = g.state.players[0]; p.wood = 100000;
    g.state.wave = unlock - 1;
    assert(g.mercenaryStatus(m.id).locked); assert(!g.command('merc', { mercId: m.id }).ok);
    g.state.wave = unlock;
    const before = g.snapshot(); assert(g.mercenaryStatus(m.id).locked); assert(!g.command('merc', { mercId: m.id }).ok); assert.deepEqual(g.snapshot(), before);
    assert(g.command('ready').ok); assert(!g.mercenaryStatus(m.id).locked); assert.equal(g.mercenaryStatus(m.id).stock, m.stockMax);
    assert(g.command('merc', { mercId: m.id }).ok);
    g.state.wave = unlock + 1; g.state.phase = 'build'; assert(!g.mercenaryStatus(m.id).locked);
  }
});

test('shared team sends deal evenly from a seeded random start and keep the original sender', () => {
  const g = game(), m = MERCENARIES[0];
  g.state.pendingSends = [
    { id: 'team-zero', mercId: m.id, senderId: 0, dispatch: true, laneId: null, wave: 1, count: 9 },
    { id: 'team-one', mercId: m.id, senderId: 4, dispatch: true, laneId: null, wave: 1, count: 7 },
  ];
  const duplicate = Game.fromSnapshot(g.snapshot()); g.command('ready'); duplicate.command('ready');
  assert.deepEqual(g._spawnQueue, duplicate._spawnQueue);
  for (const [sender, expected, lanes] of [[0, 9, [4, 5, 6, 7]], [4, 7, [0, 1, 2, 3]]]) {
    const sent = g._spawnQueue.filter(entry => entry.merc && entry.senderId === sender); assert.equal(sent.length, expected);
    const counts = lanes.map(id => sent.filter(entry => entry.laneId === id).length);
    assert(Math.max(...counts) - Math.min(...counts) <= 1);
    assert(sent.every(entry => lanes.includes(entry.laneId)));
    for (let i = 1; i < sent.length; i++) assert.equal(sent[i].laneId % 4, (sent[i - 1].laneId + 1) % 4);
  }
});

test('legacy mercenary aliases and fixed-target pending sends survive JSON restore', () => {
  const g = game(), legacy = LEGACY_MERCENARIES.find(m => !MERCENARIES.some(current => current.id === m.id)) ?? LEGACY_MERCENARIES[0]; assert(legacy);
  g.state.pendingSends = [{ id: 'old-send', mercId: legacy.id, senderId: 0, laneId: 6, wave: 1, count: 2 }];
  g.state.players[0].buildings = [{ id: 'old-ghoul', unitId: 'ghoul', col: 2, row: 3, spent: unit('ghoul').cost, totalSpent: unit('ghoul').cost }];
  g.state.players[0].roster[0] = 'ghoul';
  const saved = JSON.parse(JSON.stringify(g.snapshot())); delete saved.state.dataRevision;
  const restored = Game.fromSnapshot(saved); assert.deepEqual(restored.state.pendingSends, saved.state.pendingSends); assert.equal(restored.state.players[0].buildings[0].unitId, 'ghoul');
  restored.command('ready'); const entries = restored._spawnQueue.filter(entry => entry.merc?.id === legacy.id);
  assert.equal(entries.length, 2); assert(entries.every(entry => entry.laneId === 6 && entry.senderId === 0));
  restored.tick(.3); assert.equal(restored.state.entities.filter(e => e.isMerc && e.unitId === legacy.id).length, 2);
  assert(restored.state.entities.some(e => e.buildingId === 'old-ghoul' && e.unitId === 'ghoul'));
});

test('preparation uses upcoming-wave timing, including special rounds', () => {
  const g = game();
  for (const [wave, seconds] of [[1, 80], [2, 41], [3, 41], [4, 42], [10, 45], [30, 55], [31, 60], [32, 50], [35, 50]]) assert.equal(g.buildDuration(wave), seconds);
  for (const [completed, nextSeconds] of [[1, 41], [2, 41], [3, 42], [30, 60], [31, 50]]) {
    const fixture = combatFixture(); fixture.state.wave = completed; fixture.tick(.1);
    assert.equal(fixture.state.wave, completed + 1); assert.equal(fixture.state.phase, 'build'); assert.equal(fixture.state.timer, nextSeconds);
  }
});

test('attack and armor matrix including siege is applied to actual attacks', () => {
  for (const attackType of ['normal', 'pierce', 'magic', 'siege', 'chaos', 'hero']) for (const armorType of ['light', 'medium', 'heavy', 'fortified', 'unarmored', 'hero']) {
    const g = combatFixture();
    const attacker = g._entity({ hp: 1000, damage: 100, range: 40, interval: 1, attackType, armor: 0 }, { side: 'defender', team: 0, laneId: 0, ownerId: 0, x: 3, y: 4 });
    const target = monster(g, 0, { hp: 10000, maxHp: 10000, armor: 5, armorType, x: 3, y: 4.2 });
    const lane = [attacker, target]; lane.auras = [];
    g._attack(attacker, target, lane);
    near(10000 - target.hp, 100 * RULES.attackMultipliers[attackType][armorType] / (1 + .06 * 5));
  }
});

test('ordinary scaling is explicit RULES, waveInfo shows effective values; Boss/merc unscaled', () => {
  assert.equal(RULES.webMonsterHpScale, .25);
  assert.equal(RULES.webMonsterDamageScale, .20);
  assert.equal(RULES.webCongestionEnabled, false);
  const g = game();
  g.command('ready');
  assert.equal(g.state.waveInfo.hp, WAVES[0].hp * RULES.webMonsterHpScale);
  assert.equal(g.state.waveInfo.damage, WAVES[0].damage * RULES.webMonsterDamageScale);
  assert.equal(g.state.waveInfo.baseDamage, WAVES[0].damage);
  g.tick(.1);
  const ordinary = g.state.entities.find(e => e.side === 'monster');
  assert.equal(ordinary.maxHp, g.state.waveInfo.hp); assert.equal(ordinary.damage, g.state.waveInfo.damage);
  const bossGame = game(); bossGame.state.wave = 10; bossGame.command('ready'); bossGame.tick(1);
  assert.equal(bossGame.state.metrics.spawned, WAVES[9].count * 8);
  const boss = bossGame.state.entities.find(e => e.isBoss);
  assert.equal(boss.maxHp, WAVES[9].hp); assert.equal(boss.damage, WAVES[9].damage);
  const mercGame = game(), m = MERCENARIES[0];
  mercGame._spawnMonster({ laneId: 4, merc: m, x: 3, y: 0 });
  assert.equal(mercGame.state.entities[0].maxHp, m.hp);
  assert.equal(mercGame.state.entities[0].damage, m.damage);
});

test('ready only works in build; pause/speed stop time correctly; ended is immutable except restart', () => {
  const g = game(); g.command('ready'); g.tick(.2);
  const beforeReady = g.snapshot();
  assert(!g.command('ready').ok); assert.deepEqual(g.snapshot(), beforeReady);
  const time = g.state.time;
  assert(g.command('pause').ok); g.tick(1); assert.equal(g.state.time, time);
  g.command('pause'); g.command('speed', { value: 4 }); g.tick(.1); near(g.state.time - time, .4);
  g.state.phase = 'ended'; g.state.winner = 0;
  const ended = g.snapshot();
  for (const type of ['pause', 'speed', 'ready', 'heal', 'worker', 'farm']) {
    assert(!g.command(type, { value: 2 }).ok); assert.deepEqual(g.snapshot(), ended);
  }
  g.tick(20); assert.deepEqual(g.snapshot(), ended);
  assert(g.command('restart').ok); assert.equal(g.state.phase, 'build'); assert.equal(g.state.wave, 1);
});

test('build/combat JSON saves preserve PRNG, pending sends, queues and future state exactly', () => {
  for (const combat of [false, true]) {
    const a = game(123), p = a.state.players[0]; p.wood = 500;
    a.command('merc', { mercId: MERCENARIES[0].id });
    if (combat) { a.command('ready'); a.tick(2); }
    const serialized = JSON.parse(JSON.stringify(a.snapshot()));
    const b = Game.fromSnapshot(serialized);
    assert.deepEqual(a.snapshot(), b.snapshot());
    for (let i = 0; i < 30; i++) { a.tick(.1); b.tick(.1); }
    assert.deepEqual(a.snapshot(), b.snapshot());
  }
});

test('manual and automatic king healing share a two-second lock and consume each player once', () => {
  const g = combatFixture(), king = g.state.kings[0];
  monster(g, 8, { x: 3, y: 0 }); king.hp = king.maxHp * .1;
  g.tick(.1);
  assert.equal(king.healCharges, RULES.kingHealCharges - 1);
  assert(g.state.players[1].healUsed); assert(!g.state.players[0].healUsed);
  near(king.hp, Math.min(king.maxHp, king.maxHp * .1 + RULES.kingHealAmount));
  near(king.healBlockedUntil - g.state.time, RULES.kingHealLockSeconds);
  const blocked = g.snapshot(); assert(!g.command('heal').ok); assert.deepEqual(g.snapshot(), blocked);
  g.tick(RULES.kingHealLockSeconds + .01); king.hp = king.maxHp * .1;
  assert(g.command('heal').ok); assert(!g.command('heal').ok);
  assert(g.state.players[0].healUsed); assert.equal(king.healCharges, 2);
  king.hp = king.maxHp;
  assert(!g.command('heal', { playerId: 2 }).ok); assert.equal(king.healCharges, 2);
  for (const playerId of [2, 3]) {
    g.tick(RULES.kingHealLockSeconds + .01); king.hp = king.maxHp * .1;
    assert(g.command('heal', { playerId }).ok);
  }
  assert.equal(king.healCharges, 0); assert(g.state.players.slice(0, 4).every(p => p.healUsed));
});

test('king upgrades use shared state, configured wood and per-player income', () => {
  const g = game(), p = g.state.players[0], king = g.state.kings[0]; p.wood = 10000;
  const initial = { hp: king.maxHp, attack: king.attack, regen: king.regen, income: p.income, wood: p.wood };
  for (const stat of ['hp', 'attack', 'regen']) assert(g.command('king', { stat }).ok);
  assert.equal(king.maxHp, initial.hp + RULES.kingHpPerUpgrade);
  assert.equal(king.attack, initial.attack + RULES.kingDamagePerUpgrade);
  assert.equal(king.regen, initial.regen + RULES.kingRegenPerUpgrade);
  assert.equal(p.wood, initial.wood - 3 * RULES.kingUpgradeCost);
  assert.equal(p.income, initial.income + 3 * RULES.kingIncome);
});

test('king upgrades respect source cost and separate 20/30/20 caps without overcharging', () => {
  const g = game(), p = g.state.players[0], king = g.state.kings[0]; p.wood = 100000;
  assert.equal(RULES.kingUpgradeCost, 80); assert.deepEqual(RULES.kingUpgradeCaps, { hp: 20, attack: 30, regen: 20 });
  for (const stat of ['hp', 'attack', 'regen']) {
    const cap = RULES.kingUpgradeCaps[stat];
    for (let i = 0; i < cap; i++) assert(g.command('king', { stat }).ok);
    assert.equal(king[`${stat}Level`], cap);
    const before = g.snapshot(); assert(!g.command('king', { stat }).ok); assert.deepEqual(g.snapshot(), before);
  }
  assert.equal(p.wood, 100000 - 70 * 80);
});

test('healing auras use the strongest rate per target and tick rather than stacking or pulsing', () => {
  const small = MERCENARIES.find(m => m.ability?.type === 'aura_heal' && m.ability.value === 3);
  const large = MERCENARIES.find(m => m.ability?.type === 'aura_heal' && m.ability.value === 10);
  assert(small); assert(large);
  for (const [healers, expected] of [[[small, small], 3], [[small, large], 10]]) {
    const g = combatFixture(); monster(g, 7, { hp: 1e9, maxHp: 1e9, damage: 0, moveSpeed: 0 });
    const target = stationaryActor(g, { hp: 1000 }, { side: 'defender', laneId: 0, hp: 100, maxHp: 1000 });
    const distant = stationaryActor(g, { hp: 1000 }, { side: 'defender', laneId: 0, x: .5, hp: 100, maxHp: 1000 });
    const opponent = stationaryActor(g, { hp: 1000 }, { side: 'monster', laneId: 0, hp: 100, maxHp: 1000, attackCd: 1e9 });
    target.attackCd = distant.attackCd = 1e9;
    for (let i = 0; i < healers.length; i++) stationaryActor(g, { ...healers[i], damage: 0 }, { side: 'defender', laneId: 0, x: 3 + i * .2, attackCd: 1e9 });
    g.tick(.5); near(target.hp, 100 + expected * .5); near(distant.hp, 100); near(opponent.hp, 100);
    g.tick(.5); near(target.hp, 100 + expected); near(distant.hp, 100); near(opponent.hp, 100);
  }
});

test('Kodo damage aura increases a 100-damage monster king hit by exactly four percent', () => {
  const kodo = MERCENARIES.find(m => m.ability?.type === 'aura_damage' && m.ability.value === .04); assert(kodo);
  const hit = boosted => {
    const g = combatFixture(), king = g.state.kings[0]; king.attack = 0;
    stationaryActor(g, { damage: 100, attackType: 'normal' }, { worldX: king.worldX, worldY: king.worldY - 1 });
    if (boosted) stationaryActor(g, { ...kodo, damage: 0 }, { worldX: king.worldX + .5, worldY: king.worldY - 1 });
    const before = king.hp; g.tick(.1); return before - king.hp;
  };
  const base = hit(false), boosted = hit(true); assert(base > 0); near(boosted, base * 1.04);
});

test('king hits respect enemy armor auras and frostwolf slows the real king attack interval', () => {
  const armor = MERCENARIES.find(m => m.ability?.type === 'aura_armor' && m.ability.value === 3);
  const frost = MERCENARIES.find(m => m.ability?.type === 'aura_slow' && m.ability.value === .1);
  assert(armor); assert(frost);
  const hit = effects => {
    const g = combatFixture(), king = g.state.kings[0]; king.attack = 100; king.attackCd = 0;
    const target = stationaryActor(g, { armor: 0, armorType: 'heavy' }, { worldX: king.worldX, worldY: king.worldY - 1 });
    for (const effect of effects) stationaryActor(g, { ...effect, damage: 0 }, { worldX: king.worldX + .8, worldY: king.worldY - .7 });
    const before = target.hp; g.tick(.1); return { damage: before - target.hp, interval: king.attackCd };
  };
  const baseline = hit([]), protectedHit = hit([armor]), slowed = hit([frost]), both = hit([armor, frost]);
  near(baseline.damage, 100); near(protectedHit.damage, baseline.damage / 1.18); assert(protectedHit.damage < baseline.damage);
  near(slowed.interval, baseline.interval / .9); assert(slowed.interval > baseline.interval);
  near(both.damage, protectedHit.damage); near(both.interval, slowed.interval);
});

test('four-wave king armor and cumulative attack speed affect real king attacks', () => {
  const g = combatFixture(), king = g.state.kings[0], armor = king.armor;
  g.state.wave = 4; g.tick(.1); assert.equal(king.armor, armor + 2); assert.equal(king.autoUpgradeCount, 1);
  g.state.wave = 8; g.state.phase = 'combat'; g.tick(.1);
  assert.equal(king.armor, armor + 4); assert.equal(king.autoUpgradeCount, 2);
  g.state.phase = 'combat'; king.attackCd = 0;
  const target = monster(g, 8, { worldX: king.worldX, worldY: king.worldY - 1, hp: 1e9, maxHp: 1e9, damage: 0, moveSpeed: 0 });
  g.tick(.1); assert(target.hp < target.maxHp); near(king.attackCd, RULES.kingInterval / 1.2);
});

test('source wave rewards double only on 10/20/30; king bounty is shared once by both teams', () => {
  for (const wave of [1, 9, 10, 20, 30, 31]) {
    const g = combatFixture(), p = g.state.players[0], before = p.gold; g.state.wave = wave; p.income = 7;
    g.tick(.1);
    assert.equal(p.gold, before + 7 + RULES.waveRewards[wave - 1] * ([10, 20, 30].includes(wave) ? 2 : 1));
  }
  const g = combatFixture(); g._aiAct = () => {}; const before = g.state.players.map(p => p.gold);
  const e = monster(g, 8, { reward: 7 });
  g._hurt(e, 1000, { isKing: true, side: 'defender', team: 0 }); g._hurt(e, 1000, { isKing: true, side: 'defender', team: 0 });
  assert.deepEqual(g.state.kingBountyPools, [7, 7]); assert.deepEqual(g.state.players.map(p => p.gold), before);
  g.tick(.1);
  for (const p of g.state.players) assert.equal(p.gold, before[p.id] + p.income + RULES.waveRewards[0] + 1);
  assert.deepEqual(g.state.kingBountyPools, [0, 0]); const paid = g.state.players.map(p => p.gold); g.tick(.1); assert.deepEqual(g.state.players.map(p => p.gold), paid);
});

test('kill bounty is paid once, dead and expired entities are removed', () => {
  const g = combatFixture(), p = g.state.players[0], e = monster(g), gold = p.gold;
  g._hurt(e, 1000, { side: 'defender', team: 0, ownerId: 0 });
  g._hurt(e, 1000, { side: 'defender', team: 0, ownerId: 0 });
  assert.equal(p.gold, gold + 7); assert.equal(p.stats.kills, 1); assert.equal(g.state.metrics.killed, 1);
  const summon = g._entity({ hp: 10 }, { side: 'defender', laneId: 0, team: 0, expiresAt: 0.01 });
  g.state.entities.push(summon); g.state.time = .02; g._clearDead();
  assert(!g.state.entities.some(v => v.id === e.id || v.id === summon.id));
});

test('leaks transfer the same living entity and do not directly deduct king HP', () => {
  const g = combatFixture(), e = monster(g, 0), hp = g.state.kings[0].hp;
  const exit = laneToWorld(0, 3, 12.1); e.worldX = exit.x; e.worldY = exit.y; g._syncLocal(e);
  const before = {x:e.worldX,y:e.worldY};
  g._leak(e); g._leak(e);
  assert.deepEqual({x:e.worldX,y:e.worldY},before);
  assert.equal(e.laneId, 8); assert.equal(e.hp, e.maxHp);
  assert.equal(g.state.players[0].stats.leaks, 1); assert.equal(g.state.players[0].roundLeaks, 1);
  assert.equal(g.state.kings[0].hp, hp); assert(g.state.entities.includes(e));
  g._hurt(e, 1000, { ownerId: 1, side: 'defender', team: 0 }); g._clearDead();
  assert(!g.state.entities.includes(e)); assert.equal(g.state.players[1].stats.kills, 1);
});

test('common-road soldiers intercept another source lane and receive owner kill credit', () => {
  const g = combatFixture();
  g._spawnDefender({ id: 'support', name: '协防兵', hp: 500, damage: 200, interval: 1, range: 100 }, g.state.players[1], 3, 8, 'support-building');
  const defender = g.state.entities[0];
  defender.worldX = 13; defender.worldY = 27.5; defender.attackCd = 0;
  defender.status.warped = true; g._syncLocal(defender); g._planSupport(defender);
  const e = monster(g, 8, { hp: 30, maxHp: 30, worldX: 13, worldY: 27.1, sourceLaneId: 0 });
  g._updateEntities(.1); g._clearDead();
  assert(!g.state.entities.includes(e)); assert.equal(g.state.players[1].stats.kills, 1);
  assert.equal(defender.laneId, 8); assert.equal(defender.sourceLaneId, 1);
  assert(g.state.events.some(event => Number.isFinite(event.worldX) && Number.isFinite(event.worldY)));
});

test('T resets monster attacks, checks own-team lane and respects configured cooldown', () => {
  const g = combatFixture(), e = monster(g, 0, { attackCd: 0 });
  assert(!g.command('interfere', { laneId: 4 }).ok);
  assert(g.command('interfere', { laneId: 0 }).ok); assert(e.attackCd >= .8);
  assert.equal(g.state.players[0].interfereCooldown, RULES.interfereCooldown);
  assert(!g.command('interfere', { laneId: 0 }).ok);
});

test('dead lifesteal attackers cannot resurrect after lethal thorns retaliation', () => {
  const g = combatFixture();
  const attacker = g._entity({ hp: 5, damage: 100, range: .4, armor: 0, ability: { type: 'lifesteal', value: 1 } }, { side: 'defender', team: 0, laneId: 0, ownerId: 0, x: 3, y: 5 });
  const target = monster(g, 0, { hp: 1000, maxHp: 1000, x: 3, y: 5.2, ability: { type: 'thorns', value: 1 } });
  const lane = [attacker, target]; lane.auras = [];
  g._attack(attacker, target, lane); assert(attacker.hp <= 0); assert(attacker.status.deathCounted);
});

test('round-end income pays once and persistent buildings/heroes resurrect next wave', () => {
  const g = combatFixture(), p = g.state.players[0];
  p.buildings = [{ id: 'persistent', unitId: 'ghoul', col: 2, row: 4, spent: unit('ghoul').cost, totalSpent: unit('ghoul').cost }];
  p.heroId = HEROES[0].id; p.income = 7; p.gold = 50; g.state.wave = 3;
  g.tick(.1);
  assert.equal(g.state.wave, 4); assert.equal(g.state.phase, 'build');
  const expected = 50 + RULES.waveRewards[2] + 7;
  assert.equal(p.gold, expected); assert.equal(g.state.entities.length, 0);
  g.tick(.1); assert.equal(p.gold, expected);
  g.command('ready');
  const soldier = g.state.entities.find(e => e.buildingId === 'persistent');
  const hero = g.state.entities.find(e => e.isHero && e.ownerId === 0);
  assert.equal(soldier.hp, unit('ghoul').hp); assert.equal(hero.hp, HEROES[0].hp);
});

test('single/double king death ends immediately without round payout or later mutations', () => {
  for (const both of [false, true]) {
    const g = combatFixture(), p = g.state.players[0], gold = p.gold;
    g.state.kings[0].hp = 0; if (both) g.state.kings[1].hp = 0;
    g.tick(.1);
    assert.equal(g.state.phase, 'ended'); assert.equal(g.state.winner, both ? -1 : 1);
    assert.equal(g.state.wave, 1); assert.equal(p.gold, gold);
    const saved = g.snapshot(); g.tick(5); assert.deepEqual(g.snapshot(), saved);
  }
});

test('final-wave tiebreak uses king proportion, then army including hero cost, then draw', () => {
  for (const mode of ['ratio', 'hero', 'draw']) {
    const g = combatFixture(); g.state.wave = WAVES.length;
    for (const p of g.state.players) { p.buildings = []; p.heroId = null; }
    if (mode === 'ratio') g.state.kings[0].hp *= .5;
    if (mode === 'hero') g.state.players[0].heroId = HEROES[0].id;
    g.tick(.1); assert.equal(g.state.phase, 'ended');
    assert.equal(g.state.winner, mode === 'ratio' ? 1 : mode === 'hero' ? 0 : -1);
  }
});

test('unacquired backline holds position, then first reachable target activates return order',()=>{
  const g=combatFixture();
  const enemy=monster(g,0,{hp:10000,maxHp:10000,moveSpeed:0,damage:0});
  g._spawnDefender({id:'backline',hp:500,damage:10,interval:1,range:40,speed:75},g.state.players[0],3,10,'b321');
  const e=g.state.entities.find(e=>e.side==='defender'), before={x:e.worldX,y:e.worldY};
  g.tick(.5);assert.equal(e.routeMode,'guard');assert.equal(e.status.activated,false);
  assert.deepEqual({x:e.worldX,y:e.worldY},before);
  enemy.worldX=e.worldX;enemy.worldY=e.worldY-1;g._syncLocal(enemy);g.tick(.5);
  assert(e.status.activated);assert.equal(e.nav.mode,'return');assert.equal(e.targetId,enemy.id);
});

test('north/south approach directions and leaked monsters follow a continuous timed route', () => {
  near(laneToWorld(0, 3, 1).y - laneToWorld(0, 3, 0).y, 1);
  near(laneToWorld(1, 3, 1).y - laneToWorld(1, 3, 0).y, -1);
  const g = combatFixture();
  g._spawnMonster({ laneId: 0, wave: WAVES[0], boss: false, x: 3, y: .45 });
  const e = g.state.entities[0]; e.moveSpeed = 1; e.damage = 10;
  for (const king of g.state.kings) { king.attack = 0; king.regen = 0; }
  let leakAt = null, stemAt = null, hitAt = null;
  for (let step = 0; step < 650 && hitAt === null; step++) {
    const before = { x: e.worldX, y: e.worldY }, kingHp = g.state.kings[0].hp;
    g.tick(.1);
    const after = { x: e.worldX, y: e.worldY };
    assert(Math.hypot(after.x - before.x, after.y - before.y) <= .151);
    assert(isSegmentWalkable(before, after, 0, e.radius));
    assert(isWalkable(after.x, after.y, 0, e.radius));
    if (e.status.leaked && leakAt === null) leakAt = g.state.time;
    if (e.status.enteredStem && stemAt === null) stemAt = g.state.time;
    if (g.state.kings[0].hp < kingHp) {
      hitAt = g.state.time;
      assert(Math.hypot(e.worldX - kingWorld(0).x, e.worldY - kingWorld(0).y) <= e.range + e.radius + g.state.kings[0].radius + .001);
    }
  }
  assert(leakAt > 10); assert(stemAt > leakAt + 5); assert(hitAt > stemAt + 15);
  assert(hitAt > 40 && hitAt < 48, `route arrival ${hitAt}`);
  assert(!g.state.events.some(event => event.type === 'warp'));
  assert.equal(e.sourceLaneId, 0); assert.equal(e.laneId, 8);
});

test('returning defenders physically reach spawn gate before deterministic support warp', () => {
  const g = combatFixture();
  monster(g, 7, { hp: 1e9, damage: 0, moveSpeed: 0 });
  g._spawnDefender({ id: 'returner', hp: 500, damage: 10, interval: 1, range: 40, speed: 75 }, g.state.players[0], 3, 5, 'b999');
  const e = g.state.entities.find(e => e.side === 'defender'), initial = {x:e.worldX,y:e.worldY};
  let sawWalk = false, sourceBeforeWarp = null;
  for (let step = 0; step < 100 && !e.status.warped; step++) {
    const before = {x:e.worldX,y:e.worldY}; g.tick(.1);
    if (!e.status.warped) {
      assert(Math.hypot(e.worldX-before.x,e.worldY-before.y) <= .151);
      if (Math.hypot(e.worldX-initial.x,e.worldY-initial.y) > .5) sawWalk = true;
      assert(['return','warp_wait'].includes(e.routeMode));
    } else sourceBeforeWarp = before;
  }
  assert(sawWalk); assert(e.status.warped); assert.equal(e.routeMode,'support');
  assert(Math.hypot(sourceBeforeWarp.x-spawnWarpWorld(0).x,sourceBeforeWarp.y-spawnWarpWorld(0).y) <= .66);
  assert(Math.hypot(e.worldX-supportWorld(0).x,e.worldY-supportWorld(0).y) < 2);
  const effects = g.state.events.filter(event => event.type === 'warp');
  assert.equal(effects.length,2); assert(effects.every(event => Number.isFinite(event.worldX)&&Number.isFinite(event.worldY)));
  assert.equal(g.state.events.filter(event=>event.type==='support').length,1);
});

test('exit leaks do not clear the source activity group until the central stem', () => {
  const g = combatFixture();
  const m = monster(g, 8, { sourceLaneId:0, worldX:8.5,worldY:16,hp:1e9,damage:0,moveSpeed:0 });
  m.status.leaked=true; m.status.enteredStem=false;
  g._spawnDefender({ id:'waiting',hp:100,damage:0,range:40,speed:75 },g.state.players[0],3,.5,'b123');
  const e=g.state.entities.find(e=>e.side==='defender');
  g.tick(1.2); assert.equal(e.status.warped,undefined); assert(['guard','warp_wait'].includes(e.routeMode));
  m.worldX=13;m.worldY=16;g._syncLocal(m);g.tick(1.1);
  assert(m.status.enteredStem); assert(e.status.warped);
});

test('walls prevent movement and acquisition across disconnected adjacent lanes', () => {
  const g=combatFixture();
  g._spawnDefender({id:'wall-guard',hp:500,damage:200,interval:1,range:500},g.state.players[1],5.5,6,'wall-guard');
  const guard=g.state.entities[0]; guard.worldX=7.5;guard.worldY=24;g._syncLocal(guard);g._planSupport(guard);guard.status.warped=true;
  const e=monster(g,8,{worldX:11.5,worldY:24,hp:500,maxHp:500,moveSpeed:0,damage:0});
  g._updateEntities(.1);assert.equal(e.hp,500);assert.equal(guard.targetId,null);
  const before={x:guard.worldX,y:guard.worldY};
  g._moveWorld(guard,{x:11.5,y:24},[],1);
  assert(guard.worldX <= 8-guard.radius+.001); assert(isSegmentWalkable(before,{x:guard.worldX,y:guard.worldY},0,guard.radius));
  assert(!isSegmentWalkable({x:7.5,y:24},{x:11.5,y:24},0,guard.radius));
});

test('shared corridor collision separates different source lanes without wall tunnelling',()=>{
  const g=combatFixture();
  for(const id of [0,1]){
    g._spawnDefender({id:'collision',hp:100,damage:0,range:40,speed:75},g.state.players[id],3,6,`collision${id}`);
    const e=g.state.entities[g.state.entities.length-1];e.worldX=13+id*.03;e.worldY=25;g._syncLocal(e);
    e.nav={mode:'support',path:[],index:0,distance:0,anchor:{x:13,y:30}};e.status.warped=true;
  }
  const [a,b]=g.state.entities, before=Math.hypot(a.worldX-b.worldX,a.worldY-b.worldY);
  g._updateEntities(.1);
  assert(Math.hypot(a.worldX-b.worldX,a.worldY-b.worldY)>before);
  assert(g.state.entities.every(e=>isWalkable(e.worldX,e.worldY,0,e.radius)));
});

test('save schema 2 retains route progress and migrates legacy local positions',()=>{
  const g=game(99);g.command('ready');g.tick(8);
  const saved=g.snapshot();assert.equal(saved.version,2);assert.equal(saved.mapId,MAP.id);
  const restored=Game.fromSnapshot(JSON.parse(JSON.stringify(saved)));
  g.tick(.7);restored.tick(.7);assert.deepEqual(g.snapshot(),restored.snapshot());
  const legacy=JSON.parse(JSON.stringify(saved));legacy.version=1;delete legacy.mapId;delete legacy.mapVersion;delete legacy.state.map;
  for(const e of legacy.state.entities){delete e.worldX;delete e.worldY;delete e.battleTeam;delete e.nav;delete e.chase;delete e.routeMode;}
  const migrated=Game.fromSnapshot(legacy);assert.equal(migrated.snapshot().version,2);
  assert(migrated.state.entities.every(e=>Number.isFinite(e.worldX)&&Number.isFinite(e.worldY)&&isWalkable(e.worldX,e.worldY,e.battleTeam,e.radius)));
});

test('normal seeded AI match progresses, uses real team battles and reaches a legal terminal state', () => {
  const g = new Game({ seed: 42, difficulty: 'normal' });
  // Player 0 is controlled by the same AI strategy only in this simulation test.
  g._aiBuild(g.state.players[0], true); g.command('ready');
  let sawSharedBattle = false, maximumEntities = 0, elapsed = 0, reportedWave=1;
  for (let step = 0; step < 65000 && g.state.phase !== 'ended'; step++) {
    if (step % 30 === 0) g._aiAct(g.state.players[0]);
    g.tick(.1); elapsed += .1;
    if(g.state.wave!==reportedWave){reportedWave=g.state.wave;if(reportedWave%5===0)console.log(`  AI progress: wave ${reportedWave}, ${elapsed.toFixed(1)} simulated seconds.`);}
    maximumEntities = Math.max(maximumEntities, g.state.entities.length);
    if (g.state.entities.some(e => e.laneId >= 8 && e.side === 'monster')) sawSharedBattle = true;
    for (const p of g.state.players) {
      assert(Number.isFinite(p.gold) && Number.isFinite(p.wood));
      assert(p.gold >= -1e-7 && p.wood >= -1e-7);
      assert(p.popUsed <= p.populationCap && p.populationCap <= RULES.maxPopulation);
    }
    assert(g.state.entities.every(e => e.hp > 0 && Number.isFinite(e.x) && Number.isFinite(e.y)));
  }
  assert.equal(g.state.phase, 'ended'); assert([-1, 0, 1].includes(g.state.winner));
  assert(sawSharedBattle); assert(maximumEntities >= 800); assert(g.state.wave >= 10,'normal seed must remain playable for at least 10 waves');
  console.log(`  AI match: wave ${g.state.wave}, winner ${g.state.winner}, ${elapsed.toFixed(1)} simulated seconds, peak ${maximumEntities} entities.`);
});

console.log(`\n${passed} engine suites passed in ${((performance.now() - began) / 1000).toFixed(2)}s.`);
