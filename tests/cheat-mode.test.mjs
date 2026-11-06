import assert from 'node:assert/strict';
import test from 'node:test';
import { BUILDERS, RULES, UNITS } from '../dist/data.js';
import { Game } from '../dist/engine.js';
import { guldanSpellEffect } from '../dist/guldan-rules.js';
import { MATCH_STORAGE_KEYS, readMatch, writeMatch } from '../dist/match-storage.js';

function run(game, type, payload) {
  const result = game.command(type, payload);
  assert.equal(result.ok, true, result.message);
}

test('cheat commands leave ordinary and sandbox matches untouched', () => {
  for (const mode of ['normal', 'sandbox']) {
    const game = new Game({ mode });
    const before = game.snapshot();
    for (const [type, payload] of [
      ['cheatResources'], ['cheatComplete'], ['cheatHealKing'],
      ['cheatKingInvulnerable', { value: true }],
    ]) assert.equal(game.command(type, payload).ok, false);
    assert.deepEqual(game.snapshot(), before);
  }
});

test('cheat matches use normal starting economy, automatic waves and settlement', () => {
  const game = new Game({ mode: 'cheat' });
  const player = game.state.players[0];
  assert.equal(player.gold, RULES.initialGold);
  assert.equal(player.wood, RULES.initialWood);
  assert.ok(game.state.players.slice(1).some(ally => ally.buildings.length > 0));
  assert.equal(game.command('sandboxWave', { wave: 10 }).ok, false);
  game.state.timer = .05;
  game.tick(.05);
  assert.equal(game.state.phase, 'combat');
  assert.equal(game.command('cheatComplete').ok, false);
  assert.deepEqual(new Set(game._spawnQueue.map(entry => entry.laneId)), new Set([0, 1, 2, 3, 4, 5, 6, 7]));
  game._endCombat();
  assert.equal(game.state.phase, 'build');
  assert.equal(game.state.wave, 2);
  assert.ok(player.gold > RULES.initialGold);
});

test('refill and instant completion apply only to the local player', () => {
  const soldier = UNITS.find(unit => !unit.legacy && unit.sourceRawcode === 'h00M');
  const builder = BUILDERS.find(item => item.rosterIds.includes(soldier.id));
  const game = new Game({ mode: 'cheat', builderId: builder.id });
  const player = game.state.players[0];
  const others = game.snapshot().state.players.slice(1);
  run(game, 'cheatResources', { playerId: 1 });
  assert.deepEqual([player.gold, player.wood, player.populationCap], [100000, 100000, 300]);
  player.gold += 100;
  run(game, 'cheatResources');
  assert.equal(player.gold, 100100);
  const troopCount = Math.ceil(RULES.workerMilitaryRequirement / soldier.sourcePoints);
  for (let index = 0; index < troopCount; index++) {
    run(game, 'build', { unitId: soldier.id, col: index % 6, row: Math.floor(index / 6) });
  }
  assert.ok(player.buildings[0].construction);
  run(game, 'cheatComplete');
  run(game, 'worker');
  const paid = [player.gold, player.wood, game.state.time];
  assert.equal(player.economyTasks.workerQueue.length, 1);
  run(game, 'cheatComplete');
  assert.equal(player.buildings[0].construction, null);
  assert.equal(player.economyTasks.workerQueue.length, 0);
  assert.equal(player.workers, RULES.initialWorkers + 1);
  assert.deepEqual([player.gold, player.wood, game.state.time], paid);
  const finished = game.snapshot();
  assert.deepEqual(finished.state.players.slice(1), others);
  run(game, 'cheatComplete');
  assert.deepEqual(game.snapshot(), finished);
});

test('king protection survives saves and covers both damage events and direct life drain', () => {
  let game = new Game({ mode: 'cheat' });
  assert.equal(game.command('cheatKingInvulnerable', { value: 'true' }).ok, false);
  run(game, 'cheatKingInvulnerable', { value: true });
  game = Game.fromSnapshot(game.snapshot());
  const [ally, enemy] = game.state.kings;
  const enemyHp = enemy.hp;
  assert.equal(game._hurt(ally, 100, enemy), 0);
  assert.equal(game._killUnit(ally), false);
  assert.equal(ally.hp, ally.maxHp);
  assert.ok(game._hurt(enemy, 100, ally) > 0);
  assert.ok(enemy.hp < enemyHp);

  const caster = { id: 'caster', team: 1, worldX: ally.worldX, worldY: ally.worldY };
  assert.equal(guldanSpellEffect(game, caster, 'A1QN', {}, {}), true);
  assert.equal(caster.status.guldanDrain.total, 0);
  assert.equal(ally.hp, ally.maxHp);

  run(game, 'cheatKingInvulnerable', { value: false });
  assert.ok(game._hurt(ally, 100, enemy) > 0);
  const charges = ally.healCharges;
  run(game, 'cheatHealKing');
  assert.equal(ally.hp, ally.maxHp);
  assert.equal(ally.healCharges, charges);
});

test('cheat saves stay in their own slot alongside existing modes', () => {
  const entries = new Map();
  const storage = { getItem: key => entries.get(key), setItem: (key, value) => entries.set(key, value) };
  for (const mode of ['normal', 'sandbox', 'cheat']) {
    const snapshot = new Game({ mode }).snapshot();
    assert.equal(writeMatch(storage, snapshot), MATCH_STORAGE_KEYS[mode]);
  }
  assert.equal(entries.size, 3);
  for (const mode of ['normal', 'sandbox', 'cheat']) assert.equal(readMatch(storage, mode)?.state.mode, mode);
  entries.set(MATCH_STORAGE_KEYS.normal, entries.get(MATCH_STORAGE_KEYS.cheat));
  assert.equal(readMatch(storage, 'normal'), null);
});
