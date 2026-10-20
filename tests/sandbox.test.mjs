import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../dist/engine.js';
import { BUILDERS, UNITS, MERCENARIES, WAVES, RULES } from '../dist/data.js';
import { kingWorld } from '../dist/layout.js';
import { MATCH_STORAGE_KEYS, matchMode, readMatch, writeMatch } from '../dist/match-storage.js';

const json = value => JSON.parse(JSON.stringify(value));
const sandbox = (options = {}) => new Game({ seed: 42, ...options, mode: 'sandbox' });
const soldier = UNITS.find(unit => !unit.legacy && unit.sourceRawcode === 'h00M');
const builder = BUILDERS.find(item => item.rosterIds.includes(soldier.id));
const mercenary = MERCENARIES.find(item => item.unlock === 1 && !item.shopPreview && item.stockMax > 0);
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-7, `${actual} != ${expected}`);
const ok = (game, command, payload) => {
  const result = game.command(command, payload);
  assert.equal(result.ok, true, `${command}: ${result.message}`);
};
function reject(game, command, payload) {
  const before = game.snapshot();
  assert.equal(game.command(command, payload).ok, false, `${command} must reject invalid input`);
  assert.deepEqual(game.snapshot(), before, `${command} rejection must not change the simulation`);
}
function army(game, playerId = 0, count = 18) {
  const player = game.state.players[playerId];
  player.gold = player.wood = 100000;
  player.populationCap = 300;
  player.builderId = builder.id;
  player.roster = [...builder.rosterIds];
  for (let index = 0; index < count; index++) {
    ok(game, 'build', { playerId, unitId: soldier.id, col: index % 6, row: Math.floor(index / 6) });
  }
  game._completeMilitaryConstruction();
  assert.ok(game._military(player) >= count * soldier.sourcePoints);
  return player;
}
function storageFixture(entries = {}) {
  const values = new Map(Object.entries(entries));
  return {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
}

test('sandbox starts funded with an empty AI army and requires a manual wave start', () => {
  const game = sandbox(), player = game.state.players[0];
  assert.equal(game.options.mode, 'sandbox');
  assert.equal(game.state.mode, 'sandbox');
  assert.equal(game.state.sandbox.aiEnabled, false);
  assert.ok(player.gold >= 100000);
  assert.ok(player.wood >= 100000);
  assert.equal(player.populationCap, 300);
  assert.ok(game.state.players.every(item => item.buildings.length === 0));
  const aiStart = game.state.players.slice(1).map(item => [item.gold, item.wood, item.workers, item.lumberLevel, item.income]);
  for (let index = 0; index < 3; index++) game.tick(60);
  game.state.players.slice(1).forEach((item, index) => {
    assert.deepEqual([item.gold, item.workers, item.lumberLevel, item.income], [aiStart[index][0], ...aiStart[index].slice(2)]);
    near(item.wood, aiStart[index][1] + game._woodRate(item) * 180);
    assert.deepEqual(item.buildings, []);
  });
  assert.equal(game.state.phase, 'build');
  assert.equal(game.state.wave, 1);
  assert.deepEqual(game.state.entities, []);
  assert.deepEqual(game._spawnQueue, []);
  ok(game, 'ready');
  assert.equal(game.state.phase, 'combat');
  assert.ok(game._spawnQueue.length > 0);
  assert.equal(game._spawnQueue.length, game.state.waveInfo.actualCount);
  assert.ok(game._spawnQueue.every(entry => entry.laneId === 0));
});

test('normal matches retain their starting economy, initial AI and automatic preparation timer', () => {
  const game = new Game({ seed: 42 });
  const player = game.state.players[0];
  assert.equal(matchMode(game.state), 'normal');
  assert.equal(player.gold, RULES.initialGold);
  assert.equal(player.wood, RULES.initialWood);
  assert.equal(player.populationCap, RULES.initialPopulation);
  assert.ok(game.state.players.slice(1).some(item => item.buildings.length > 0));
  game._aiTimer = 1e9;
  game.state.timer = .05;
  game.tick(.05);
  assert.equal(game.state.phase, 'combat');
});

test('every sandbox command is rejected atomically in normal matches', () => {
  const game = new Game({ seed: 42 });
  for (const [command, payload] of [
    ['sandboxResources', {}], ['sandboxBuilder', { builderId: builder.id }],
    ['sandboxWave', { wave: 10 }], ['sandboxReset', {}], ['sandboxClear', {}],
    ['sandboxComplete', {}], ['sandboxAI', { value: true }],
  ]) reject(game, command, payload);
});

test('resource refill targets the local player and changes no other progression', () => {
  const game = sandbox(), player = game.state.players[0];
  player.gold = 17; player.wood = 23; player.populationCap = 24;
  const others = json(game.state.players.slice(1));
  const before = { income: player.income, workers: player.workers, level: player.lumberLevel, time: game.state.time };
  ok(game, 'sandboxResources');
  assert.ok(player.gold >= 100000);
  assert.ok(player.wood >= 100000);
  assert.equal(player.populationCap, 300);
  assert.deepEqual(game.state.players.slice(1), others);
  assert.deepEqual({ income: player.income, workers: player.workers, level: player.lumberLevel, time: game.state.time }, before);
  player.gold = 120000; player.wood = 130000;
  ok(game, 'sandboxResources');
  assert.deepEqual([player.gold, player.wood], [120000, 130000]);
});

test('builder selection is free, canonicalizes rawcodes and preserves the paid army', () => {
  const game = sandbox(), player = game.state.players[0];
  army(game, 0, 1);
  const buildings = json(player.buildings), resources = [player.gold, player.wood];
  const changes = [player.rerolls, player.raceChanges];
  player.builderChoices = [builder.id];
  const target = BUILDERS.find(item => item.mode === 'race' && item.id !== builder.id);
  for (const builderId of [target.id, target.rawcode]) {
    ok(game, 'sandboxBuilder', { builderId });
    assert.equal(player.builderId, target.id);
    assert.deepEqual(player.roster, target.rosterIds.filter(id => UNITS.some(unit => unit.id === id)));
    assert.deepEqual(player.builderChoices, []);
    assert.deepEqual([player.gold, player.wood], resources);
    assert.deepEqual([player.rerolls, player.raceChanges], changes);
    assert.deepEqual(player.buildings, buildings);
  }
  reject(game, 'sandboxBuilder', { builderId: 'missing-builder' });
  reject(game, 'sandboxBuilder', {});
  ok(game, 'ready');
  reject(game, 'sandboxBuilder', { builderId: builder.id });
});

test('sandbox wave input accepts only numeric integers in the supported wave range', () => {
  const game = sandbox();
  for (const wave of [0, -1, WAVES.length + 1, 1.5, '10', null, NaN, Infinity, {}, []]) {
    reject(game, 'sandboxWave', { wave });
  }
  reject(game, 'sandboxWave', {});
  for (const wave of [1, 10, WAVES.length]) {
    ok(game, 'sandboxWave', { wave });
    assert.equal(game.state.wave, wave);
    assert.equal(game.state.phase, 'build');
  }
});

test('wave changes discard interrupted battle state without granting round rewards', () => {
  const game = sandbox(), player = army(game);
  ok(game, 'worker');
  ok(game, 'lumber');
  ok(game, 'ready');
  game.tick(.1);
  // A loaded interrupted trial may retain a future send queued by an earlier version.
  game.state.pendingSends.push({ id: 'old-future-send', mercId: mercenary.id, senderId: 0, laneId: null, dispatch: true, wave: game.state.wave + 1, count: 1 });
  game.state.sourceSkillJobs.push({ id: 'discarded-job', type: 'pending-effect' });
  game.state.kingBountyPools = [100, 200];
  game.state.teamLeakFlags = [true, true];
  game.state.arenaRemaining = 9;
  game.state.continuousRemaining = 5;
  game.state.winner = 1;
  for (const king of game.state.kings) {
    king.hp = 1; king.healCharges = 0; king.healBlockedUntil = 100;
    king.status = { stunnedUntil: 100 }; king.attackCd = 7;
    king.worldX += 1; king.worldY += 1;
    king.movePath = { path: [{ x: king.worldX, y: king.worldY }], index: 0 };
    king.commandLockedUntil = 100;
  }
  for (const item of game.state.players) { item.healUsed = true; item.interfereUntil = 100; }
  const resources = game.state.players.map(item => [item.gold, item.wood, item.income]);
  const progression = json(game.state.players.map(item => ({ buildings: item.buildings, workers: item.workers, lumberLevel: item.lumberLevel, technologies: item.technologies, economyTasks: item.economyTasks, stats: item.stats })));
  const time = game.state.time;
  assert.ok(game.state.entities.length > 0 && game._spawnQueue.length > 0);
  ok(game, 'sandboxWave', { wave: 20 });
  assert.equal(game.state.phase, 'build');
  assert.equal(game.state.wave, 20);
  assert.equal(game.state.winner, null);
  assert.equal(game.state.time, time);
  assert.deepEqual(game.state.entities, []);
  assert.deepEqual(game.state.sourceSkillJobs, []);
  assert.deepEqual(game.state.pendingSends, []);
  assert.deepEqual(game._spawnQueue, []);
  assert.deepEqual(game.state.kingBountyPools, [0, 0]);
  assert.deepEqual(game.state.teamLeakFlags, [false, false]);
  for (const key of ['waveInfo', 'arenaRemaining', 'arenaResult', 'continuousRemaining', 'congestion']) {
    assert.ok(!game.state[key], `${key} from the interrupted trial is removed`);
  }
  assert.deepEqual(game.state.players.map(item => [item.gold, item.wood, item.income]), resources);
  assert.deepEqual(json(game.state.players.map(item => ({ buildings: item.buildings, workers: item.workers, lumberLevel: item.lumberLevel, technologies: item.technologies, economyTasks: item.economyTasks, stats: item.stats }))), progression);
  for (const king of game.state.kings) {
    assert.equal(king.hp, king.maxHp);
    assert.equal(king.healCharges, RULES.kingHealCharges);
    assert.equal(king.healBlockedUntil, 0);
    assert.deepEqual(king.status, {});
    assert.equal(king.attackCd, 0);
    assert.deepEqual({ x: king.worldX, y: king.worldY }, kingWorld(king.team));
    assert.ok(!king.movePath);
    assert.ok(!king.commandLockedUntil);
  }
  assert.ok(game.state.players.every(item => !item.healUsed && !item.interfereUntil));
  assert.equal(player.economyTasks.workerQueue.length, 1);
  ok(game, 'ready');
  assert.equal(game.state.roundMode, 'normal');
  assert.equal(game.state.wave, 20);
});

test('same-wave reset recovers an ended and paused sandbox without erasing its army or economy', () => {
  const game = sandbox(), player = army(game, 0, 1);
  ok(game, 'sandboxWave', { wave: WAVES.length });
  ok(game, 'ready');
  game.state.phase = 'ended'; game.state.winner = 1; game.state.paused = true;
  game.state.kings[0].hp = 0;
  const economy = [player.gold, player.wood, player.workers, player.lumberLevel];
  const buildings = json(player.buildings);
  ok(game, 'sandboxReset');
  assert.equal(game.state.wave, WAVES.length);
  assert.equal(game.state.phase, 'build');
  assert.equal(game.state.paused, false);
  assert.equal(game.state.winner, null);
  assert.equal(game.state.kings[0].hp, game.state.kings[0].maxHp);
  assert.deepEqual(player.buildings, buildings);
  assert.deepEqual([player.gold, player.wood, player.workers, player.lumberLevel], economy);
  ok(game, 'ready');
  assert.equal(game.state.phase, 'combat');
});

test('clear army removes only local military and is unavailable during battle', () => {
  const game = sandbox(), player = army(game), other = army(game, 1, 1);
  ok(game, 'worker');
  player.heroId = 'sandbox-hero-fixture';
  player.heroAltarUsed = true;
  player.popUsed = game._population(player);
  const jobs = json(player.economyTasks), resources = [player.gold, player.wood];
  const ally = json(other);
  ok(game, 'sandboxClear');
  assert.deepEqual(player.buildings, []);
  assert.equal(player.heroId, null);
  assert.equal(player.heroAltarUsed, false);
  assert.equal(player.popUsed, player.workers + player.economyTasks.workerQueue.length);
  assert.deepEqual(player.economyTasks, jobs);
  assert.deepEqual([player.gold, player.wood], resources);
  assert.deepEqual(other, ally);
  ok(game, 'ready');
  reject(game, 'sandboxClear');
});

test('complete finishes paid local construction, upgrades and economy jobs with no clock or currency change', () => {
  const game = sandbox(), player = army(game), other = army(game, 1);
  game.tick(.25);
  for (const playerId of [0, 1]) {
    const item = game.state.players[playerId];
    item.populationCap = 200;
    ok(game, 'worker', { playerId }); ok(game, 'worker', { playerId });
    ok(game, 'lumber', { playerId }); ok(game, 'farm', { playerId });
    ok(game, 'upgrade', { playerId, buildingId: item.buildings[0].id, unitId: soldier.upgrades[0] });
    ok(game, 'build', { playerId, unitId: soldier.id, col: 0, row: 4 });
  }
  const time = game.state.time, resources = [player.gold, player.wood];
  const beforeWorkers = player.workers, beforeLevel = player.lumberLevel;
  const targets = player.buildings.map(item => [item.id, item.construction?.targetId ?? item.unitId, item.totalSpent]);
  const ally = json(other);
  ok(game, 'sandboxComplete');
  assert.equal(game.state.time, time);
  assert.deepEqual([player.gold, player.wood], resources);
  assert.equal(player.workers, beforeWorkers + 2);
  assert.equal(player.lumberLevel, beforeLevel + 1);
  assert.equal(player.populationCap, 200 + RULES.farmPopulation);
  assert.deepEqual(player.economyTasks.workerQueue, []);
  assert.equal(player.economyTasks.lumberTask, null);
  assert.equal(player.economyTasks.farmTask, null);
  assert.deepEqual(player.buildings.map(item => [item.id, item.unitId, item.totalSpent]), targets);
  assert.ok(player.buildings.every(item => !item.construction));
  assert.equal(player.popUsed, game._population(player));
  assert.deepEqual(other, ally);
  ok(game, 'ready');
  reject(game, 'sandboxComplete');
});

test('AI controls require a boolean and enabling then disabling governs future AI actions', () => {
  const game = sandbox();
  for (const value of [undefined, null, 0, 1, 'true', {}, []]) reject(game, 'sandboxAI', { value });
  ok(game, 'sandboxAI', { value: true });
  assert.equal(game.state.sandbox.aiEnabled, true);
  game.tick(1.5);
  assert.ok(game.state.players.slice(1).some(item => item.buildings.length > 0));
  ok(game, 'sandboxAI', { value: false });
  assert.equal(game.state.sandbox.aiEnabled, false);
  let actions = 0;
  const command = game.command.bind(game);
  game.command = (type, payload) => {
    if (payload?.playerId > 0) actions++;
    return command(type, payload);
  };
  game.tick(3);
  assert.equal(actions, 0);
  ok(game, 'ready');
  reject(game, 'sandboxAI', { value: true });
});

test('sandbox combat rejects mercenary purchases before changing stock, resources, income or queues', () => {
  const game = sandbox(), player = game.state.players[0];
  ok(game, 'ready');
  const before = game.snapshot();
  const stock = json(player.mercStocks[mercenary.id]);
  const economy = [player.gold, player.wood, player.income, player.stats.sent];
  const pending = json(game.state.pendingSends);
  const result = game.command('merc', { mercId: mercenary.id });
  assert.equal(result.ok, false);
  assert.match(result.message, /布阵期/);
  assert.deepEqual(player.mercStocks[mercenary.id], stock);
  assert.deepEqual([player.gold, player.wood, player.income, player.stats.sent], economy);
  assert.deepEqual(game.state.pendingSends, pending);
  assert.deepEqual(game.snapshot(), before);
});

test('sandbox preparation mercenaries join the next manually started trial', () => {
  const game = sandbox(), player = game.state.players[0];
  const stock = player.mercStocks[mercenary.id].stock;
  const wood = player.wood, income = player.income;
  ok(game, 'merc', { mercId: mercenary.id });
  assert.equal(player.mercStocks[mercenary.id].stock, stock - 1);
  assert.equal(player.wood, wood - game._woodCost(mercenary));
  assert.equal(player.income, income + mercenary.sourcePoints);
  assert.equal(game.state.pendingSends.length, 1);
  assert.equal(game.state.pendingSends[0].wave, game.state.wave);
  assert.equal(game.state.phase, 'build');
  ok(game, 'ready');
  assert.deepEqual(game.state.pendingSends, []);
  const sends = game._spawnQueue.filter(entry => entry.merc?.id === mercenary.id);
  assert.equal(sends.length, 1);
  assert.equal(sends[0].senderId, 0);
  assert.ok([4, 5, 6, 7].includes(sends[0].laneId));
  game.tick(.1);
  assert.ok(game.state.entities.some(entity => entity.isMerc && entity.unitId === mercenary.id && entity.senderId === 0));
});

test('normal combat mercenaries still spend stock and queue for the following wave', () => {
  const game = new Game({ seed: 42 }), player = game.state.players[0];
  ok(game, 'ready');
  const stock = player.mercStocks[mercenary.id].stock;
  const wood = player.wood, income = player.income;
  ok(game, 'merc', { mercId: mercenary.id });
  assert.equal(player.mercStocks[mercenary.id].stock, stock - 1);
  assert.equal(player.wood, wood - game._woodCost(mercenary));
  assert.equal(player.income, income + mercenary.sourcePoints);
  assert.equal(game.state.pendingSends.length, 1);
  assert.equal(game.state.pendingSends[0].wave, game.state.wave + 1);
  assert.equal(game.state.pendingSends[0].mercId, mercenary.id);
  assert.ok(!game._spawnQueue.some(entry => entry.merc?.id === mercenary.id && entry.senderId === 0));
});

test('enabling AI restores natural wave spawns across all eight lanes', () => {
  const game = sandbox();
  ok(game, 'sandboxAI', { value: true });
  ok(game, 'ready');
  assert.equal(game._spawnQueue.length, game.state.waveInfo.actualCount * 8);
  assert.deepEqual([...new Set(game._spawnQueue.map(entry => entry.laneId))].sort(), [0, 1, 2, 3, 4, 5, 6, 7]);
});

test('clearing sandbox waves never awards income, advances the wave or opens the arena', () => {
  for (const wave of [1, 10, 20, 30, 31, 34, WAVES.length]) {
    const game = sandbox();
    ok(game, 'sandboxWave', { wave });
    ok(game, 'ready');
    game._spawnQueue = [];
    game.state.entities = [];
    const resources = game.state.players.map(item => [item.gold, item.wood]);
    game.tick(.1);
    assert.equal(game.state.phase, 'build', `wave ${wave} returns to preparation`);
    assert.equal(game.state.wave, wave);
    assert.equal(game.state.roundMode, 'normal');
    game.state.players.forEach((item, index) => {
      assert.equal(item.gold, resources[index][0]);
      near(item.wood, resources[index][1] + game._woodRate(item) * .1);
    });
    game.tick(60);
    assert.equal(game.state.phase, 'build');
    assert.equal(game.state.wave, wave);
  }
});

test('sandbox overtime combat does not add later waves when its continuous timer expires', () => {
  const game = sandbox();
  ok(game, 'sandboxWave', { wave: 31 });
  ok(game, 'ready');
  game.state.continuousRemaining = .01;
  game.tick(.1);
  assert.equal(game.state.wave, 31);
  assert.equal(game.state.phase, 'combat');
  assert.ok(game._spawnQueue.every(entry => entry.sourceWave === 31));
});

test('JSON snapshot restore retains sandbox mode, AI and in-progress tasks deterministically', () => {
  const game = sandbox(), player = army(game);
  ok(game, 'worker'); ok(game, 'lumber');
  ok(game, 'sandboxAI', { value: true });
  game.tick(.3);
  assert.ok(player.economyTasks.workerQueue.length > 0);
  const restored = Game.fromSnapshot(json(game.snapshot()));
  assert.equal(restored.options.mode, 'sandbox');
  assert.equal(restored.state.mode, 'sandbox');
  assert.equal(restored.state.sandbox.aiEnabled, true);
  assert.deepEqual(restored.snapshot(), game.snapshot());
  game.tick(.5); restored.tick(.5);
  assert.deepEqual(restored.snapshot(), game.snapshot());
  ok(game, 'ready'); ok(restored, 'ready');
  game.tick(.2); restored.tick(.2);
  assert.deepEqual(restored.snapshot(), game.snapshot());
  ok(game, 'sandboxReset'); ok(restored, 'sandboxReset');
  assert.deepEqual(restored.snapshot(), game.snapshot());
  assert.equal(restored.state.sandbox.aiEnabled, true);
});

test('the same seed and reset command sequence reproduce an identical sandbox battle', () => {
  const games = [sandbox({ seed: 17 }), sandbox({ seed: 17 })];
  for (const game of games) {
    army(game, 0, 2);
    ok(game, 'sandboxWave', { wave: 9 });
    ok(game, 'ready'); game.tick(.2);
    ok(game, 'sandboxReset'); ok(game, 'ready'); game.tick(.2);
  }
  assert.deepEqual(games[0].snapshot(), games[1].snapshot());
});

test('legacy normal saves and sandbox progress use independent browser storage slots', () => {
  const normal = new Game({ seed: 42 }).snapshot();
  delete normal.state.mode; delete normal.options.mode;
  const original = JSON.stringify(normal);
  const storage = storageFixture({ [MATCH_STORAGE_KEYS.normal]: original });
  const game = sandbox();
  ok(game, 'sandboxWave', { wave: 9 });
  const key = writeMatch(storage, game.snapshot());
  assert.equal(key, MATCH_STORAGE_KEYS.sandbox);
  assert.equal(storage.getItem(MATCH_STORAGE_KEYS.normal), original);
  assert.deepEqual(readMatch(storage, 'normal'), normal);
  const restoredNormal = Game.fromSnapshot(readMatch(storage, 'normal'));
  assert.equal(restoredNormal.state.mode, 'normal');
  assert.equal(restoredNormal.options.mode, 'normal');
  assert.equal(restoredNormal.state.players[0].gold, RULES.initialGold);
  assert.deepEqual(readMatch(storage, 'sandbox'), game.snapshot());
  assert.equal(readMatch(storage, 'sandbox').state.wave, 9);
  const oldSandbox = storage.getItem(MATCH_STORAGE_KEYS.sandbox);
  writeMatch(storage, normal);
  assert.equal(storage.getItem(MATCH_STORAGE_KEYS.sandbox), oldSandbox);
});

test('storage reads reject corrupt JSON and snapshots from the other mode', () => {
  const storage = storageFixture({
    [MATCH_STORAGE_KEYS.normal]: '{broken',
    [MATCH_STORAGE_KEYS.sandbox]: JSON.stringify(new Game().snapshot()),
  });
  assert.equal(readMatch(storage, 'normal'), null);
  assert.equal(readMatch(storage, 'sandbox'), null);
  storage.setItem(MATCH_STORAGE_KEYS.normal, JSON.stringify(sandbox().snapshot()));
  assert.equal(readMatch(storage, 'normal'), null);
  storage.setItem(MATCH_STORAGE_KEYS.sandbox, 'null');
  assert.equal(readMatch(storage, 'sandbox'), null);
});
