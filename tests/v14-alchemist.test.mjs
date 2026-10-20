import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Game } from '../dist/engine.js';
import { UNIT_TEMPLATES } from '../dist/data.js';
import { V14_ABILITIES } from '../dist/v14-reference.js';
import { ALCHEMIST_RULES, ALCHEMIST_ACTIVE_RULES, alchemistAfterDamage, alchemistDeathReward,
  tryAlchemistAutoCast, castAlchemistAbility, tickAlchemistJob, sourceAlchemistDeath } from '../dist/alchemist-rules.js';

const fixture = (rawcode = 'h0XH') => {
  const game = new Game({ seed: 42 });
  game.state.time = 10; game._aiTimer = Infinity; game._aiAct = () => {};
  const entity = game._entity(UNIT_TEMPLATES[rawcode], { ownerId: 0, side: 'defender', team: 0, laneId: 0, sourceLaneId: 0 });
  game.state.entities = [entity];
  return { game, entity };
};
const victim = (team = 1, extra = {}) => ({ id: 'victim', side: 'monster', team, hp: 0, status: {}, ...extra });
const roll = (game, integer) => { game._random = () => (integer - .5) / 100; };

test('chemical rage uses the already-deducted event HP and includes exactly 25%', () => {
  const { game, entity } = fixture();
  entity.hp = entity.maxHp * .251;
  assert.equal(alchemistAfterDamage(game, entity, entity.maxHp * .2), false, 'the helper must not subtract event damage a second time');
  entity.hp = entity.maxHp * .25;
  assert.equal(alchemistAfterDamage(game, entity, 1), true);
  assert.equal(entity.buffs.length, 1); assert.equal(entity.buffs[0].expiresAt, 15);
});

test('chemical rage accepts an explicit pre-damage HP snapshot without mutating real life', () => {
  const { game, entity } = fixture(); const before = entity.hp;
  assert.equal(alchemistAfterDamage(game, entity, entity.maxHp * .75, { preDamageHp: entity.maxHp }), true);
  assert.equal(entity.hp, before); assert.equal(entity.buffs[0].armor, 2);
  const next = fixture();
  assert.equal(alchemistAfterDamage(next.game, next.entity, 1, { preDamageHp: next.entity.maxHp }), false);
});

test('all six source rawcodes select the correct level buffs without requiring marker abilities', () => {
  for (const [rawcode, level] of Object.entries(ALCHEMIST_RULES.rawcodeLevels)) {
    const { game, entity } = fixture(rawcode); entity.skillSpecs = []; entity.hp = entity.maxHp * .2;
    assert.equal(alchemistAfterDamage(game, entity, 10), true, rawcode);
    assert.deepEqual([entity.buffs[0].haste, entity.buffs[0].armor], [[.5, 2], [1, 3], [1.5, 5]][level - 1]);
    assert.equal(entity.mana, UNIT_TEMPLATES[rawcode].manaStart ?? entity.mana, 'rage does not spend mana');
  }
});

test('marker abilities on an unrelated unit do not turn it into a source alchemist', () => {
  const { game } = fixture(), entity = { combatRawcode: 'h0xh', hp: 1, maxHp: 100, skillSpecs: [{ id: 'A2Z2' }], buffs: [] };
  assert.equal(alchemistAfterDamage(game, entity, 1), false);
  entity.combatRawcode = 'h00L'; assert.equal(alchemistAfterDamage(game, entity, 1), false);
  assert.equal(entity.buffs.length, 0);
});

test('rage cannot refresh or stack while active and may trigger immediately at five seconds', () => {
  const { game, entity } = fixture('h0XJ'); entity.hp = 100;
  alchemistAfterDamage(game, entity, 10);
  game.state.time = 14.999; assert.equal(alchemistAfterDamage(game, entity, 10), false);
  assert.equal(entity.buffs[0].expiresAt, 15); assert.equal(entity.skillStates.A2Z2.casts, 1);
  game.state.time = 15; assert.equal(alchemistAfterDamage(game, entity, 10), true);
  assert.equal(entity.buffs.length, 1); assert.equal(entity.buffs[0].expiresAt, 20); assert.equal(entity.skillStates.A2Z2.casts, 2);
});

test('the rage buff feeds existing combat haste and armor and expires without changing base stats', () => {
  const { game, entity } = fixture('h0XI'), baseArmor = entity.armor, baseInterval = entity.attackInterval;
  const before = game._auraEffects(entity, []); entity.hp = 100; alchemistAfterDamage(game, entity, 10);
  const during = game._auraEffects(entity, []);
  assert.equal(during.attackSpeedMultiplier - before.attackSpeedMultiplier, 1); assert.equal(during.armor - before.armor, 3);
  game.state.time = 15;
  assert.deepEqual(game._auraEffects(entity, []), before);
  assert.equal(entity.armor, baseArmor); assert.equal(entity.attackInterval, baseInterval);
});

test('source rage does not heal lethal damage or add an unstated positive-damage guard', () => {
  const { game, entity } = fixture(); entity.hp = 0;
  assert.equal(alchemistAfterDamage(game, entity, 100), true); assert.equal(entity.hp, 0);
  const next = fixture(); next.entity.hp = 1;
  assert.equal(alchemistAfterDamage(next.game, next.entity, 0), true, 'the JASS damage-event function does not test damage > 0');
});

test('active rage state and duration survive snapshots without stacking or gaining a new cooldown', () => {
  const { game, entity } = fixture('h0XI'); entity.hp = 100;
  alchemistAfterDamage(game, entity, 10); game.state.time = 12;
  const snapshot = game.snapshot(), restored = fixture().game; restored.restore(snapshot);
  const saved = restored.state.entities.find(e => e.id === entity.id);
  assert.equal(saved.buffs[0].expiresAt, 15); assert.equal(saved.skillStates.A2Z2.activeUntil, 15);
  assert.equal(alchemistAfterDamage(restored, saved, 1), false);
  restored.state.time = 15; assert.equal(alchemistAfterDamage(restored, saved, 1), true);
  assert.equal(saved.buffs.length, 1); assert.equal(saved.skillStates.A2Z2.casts, 2);
});

test('one hundred integer outcomes reproduce the three mutually exclusive gold distributions', () => {
  for (const [rawcode, expected] of [['h0XH', { 0: 83, 1: 10, 2: 5, 5: 2 }], ['h0XI', { 0: 78, 1: 12, 2: 8, 5: 2 }], ['h0XJ', { 0: 71, 1: 15, 2: 10, 5: 4 }]]) {
    const { game, entity } = fixture(rawcode), counts = {};
    for (let integer = 1; integer <= 100; integer++) {
      roll(game, integer); const { bonusGold } = alchemistDeathReward(game, victim(), entity);
      counts[bonusGold] = (counts[bonusGold] ?? 0) + 1;
    }
    assert.deepEqual(counts, expected);
  }
});

test('gold roll thresholds use inclusive integer bounds and cannot add multiple payouts', () => {
  const { game, entity } = fixture('h0XJ');
  for (const [integer, expected] of [[1, 5], [4, 5], [5, 2], [14, 2], [15, 1], [29, 1], [30, 0], [100, 0]]) {
    roll(game, integer); assert.equal(alchemistDeathReward(game, victim(), entity).bonusGold, expected);
  }
});

test('gold requires an enemy but applies to defender and arena deaths and beyond wave thirty', () => {
  const { game, entity } = fixture(); roll(game, 1);
  assert.equal(alchemistDeathReward(game, victim(0), entity).bonusGold, 0);
  for (const wave of [5, 31, 35]) for (const side of ['monster', 'defender', 'arena1']) {
    game.state.wave = wave; game.state.roundMode = side === 'arena1' ? 'arena' : 'normal';
    assert.equal(alchemistDeathReward(game, victim(1, { side }), entity).bonusGold, 5);
  }
});

test('alchemy pays independently of source-economy processing and only once for each death', () => {
  const { game, entity } = fixture(), target = victim(1, { status: { economyDeathHandled: true, deathCounted: true } });
  roll(game, 1); const before = game.state.players[0].gold;
  assert.equal(alchemistDeathReward(game, target, entity).bonusGold, 5);
  assert.equal(alchemistDeathReward(game, target, entity).bonusGold, 0);
  assert.equal(game.state.players[0].gold, before, 'the engine owns payment and player attribution');
});

test('alchemy consumes one source random draw before eligibility checks and none on duplicate callbacks', () => {
  const { game } = fixture(); let draws = 0; game._random = () => { draws++; return 0; };
  for (const killer of [null, { combatRawcode: 'h00L', team: 0 }, { combatRawcode: 'h0XH', team: 1 }]) {
    const target = victim(); assert.equal(alchemistDeathReward(game, target, killer).bonusGold, 0);
    alchemistDeathReward(game, target, killer);
  }
  assert.equal(draws, 3);
});

test('saved death guards prevent granting alchemy gold a second time after restoring', () => {
  const { game, entity } = fixture(), target = victim(); game.state.entities.push(target); roll(game, 1);
  assert.equal(alchemistDeathReward(game, target, entity).bonusGold, 5);
  const restored = fixture().game; restored.restore(game.snapshot()); roll(restored, 1);
  assert.equal(alchemistDeathReward(restored, restored.state.entities[1], restored.state.entities[0]).bonusGold, 0);
});

test('source evidence confirms rawcode levels, five-second rage and the native haste values', () => {
  const source = readFileSync(new URL('../reference/v14-source/raw_extracted/war3map.j', import.meta.url), 'utf8');
  const levelFunction = source.match(/function SingedGetLevel[\s\S]*?endfunction/)[0];
  assert.match(levelFunction, /\$6E303933 or BF==\$6830584A[\s\S]*?return 3/);
  assert.match(levelFunction, /\$6E303932 or BF==\$68305849[\s\S]*?return 2/);
  const rage = source.match(/function SingedChemicalRage takes[\s\S]*?endfunction/)[0];
  assert.match(rage, /if bc>GetUnitState\(Bc,UNIT_STATE_MAX_LIFE\)\*\.25/);
  assert.match(rage, /TimerStart\(t,5\.,false,function SingedChemicalRageFinish\)/);
  assert.match(rage, /local real Zk=2\./);
  assert.match(rage, /if CC==2 then\s+set RI=bd\s+set Zk=3\./);
  assert.match(rage, /elseif CC==3 then\s+set RI=be\s+set Zk=5\./);
  for (let index = 0; index < 3; index++) {
    const ability = V14_ABILITIES[ALCHEMIST_RULES.chemicalRage.hasteAbilities[index]];
    assert.equal(Number(ability.resolved_fields.DataA1), ALCHEMIST_RULES.chemicalRage.haste[index]);
  }
  const gold = source.match(/function SingedAlchemyGold[\s\S]*?endfunction/)[0];
  assert.ok(gold.indexOf('GetRandomInt(1,100)') < gold.indexOf('if not SingedIsHero'));
  assert.match(gold, /local integer bx=2\s+local integer by=5\s+local integer bz=10/);
  assert.match(gold, /if CC==2 then\s+set bx=2\s+set by=8\s+set bz=12/);
  assert.match(gold, /elseif CC==3 then\s+set bx=4\s+set by=10\s+set bz=15/);
  assert.match(gold, /elseif bw<=bx\+by then/); assert.match(gold, /elseif bw<=bx\+by\+bz then/);
});

function activeFixture(rawcode = 'h0XH') {
  const { game, entity } = fixture(rawcode);
  entity.worldX = entity.worldY = 10; entity.battleTeam = 0; entity.mana = 100;
  const hits = [];
  const api = { universalDamage(g, target, amount, source) {
    hits.push({ targetId: target.id, amount, sourceId: source.id }); target.hp -= amount;
    if (target.hp <= 0 && !target.status.deathCounted) {
      target.status.deathCounted = true; sourceAlchemistDeath(g, target, source, api);
    }
  } };
  const add = (team, x = 10, hp = 1000, maxHp = 1000, extra = {}) => {
    const unit = { id: game._uid('test'), team, side: team === 0 ? 'defender' : 'monster', battleTeam: 0,
      worldX: x, worldY: 10, hp, maxHp, status: {}, skillSpecs: [], buffs: [], ...extra };
    game.state.entities.push(unit); return unit;
  };
  const tick = time => {
    game.state.time = time;
    const remaining = [];
    for (const job of game.state.sourceSkillJobs) if (tickAlchemistJob(game, job, api)) remaining.push(job);
    game.state.sourceSkillJobs = remaining;
  };
  return { game, entity, hits, api, add, tick };
}

test('damage auto-casts prioritize a genuinely wounded ally, then acid when the independent mist lock is active', () => {
  const { game, entity, api, add } = activeFixture(); add(0, 10.2, 500); add(1, 10.3);
  assert.equal(tryAlchemistAutoCast(game, entity, api), true);
  assert.equal(entity.mana, 92); assert.equal(game.state.sourceSkillJobs[0].type, 'alchemist_mist');
  assert.equal(tryAlchemistAutoCast(game, entity, api), true);
  assert.equal(entity.mana, 80); assert.equal(game.state.sourceSkillJobs[1].type, 'alchemist_acid_target');
  assert.equal(tryAlchemistAutoCast(game, entity, api), false);
  assert.equal(entity.skillStates.A2Z0.readyAt, 18); assert.equal(entity.skillStates.A2Z1.readyAt, 21);
});

test('automatic mist uses the strict 99% need threshold and pre-damage life for a lethal self-target event', () => {
  const { game, entity, api } = activeFixture(); entity.hp = entity.maxHp * .99;
  assert.equal(tryAlchemistAutoCast(game, entity, api), false);
  entity.hp = entity.maxHp * .989;
  assert.equal(tryAlchemistAutoCast(game, entity, api), true);
  const next = activeFixture(); next.entity.hp = 0; next.add(0, 10.1, 500, 1000);
  assert.equal(tryAlchemistAutoCast(next.game, next.entity, { ...next.api, preDamageHp: next.entity.maxHp * .1 }), true);
  assert.equal(next.game.state.sourceSkillJobs[0].targetId, next.entity.id);
});

test('manual native cooldowns and automatic hashtable cooldowns are separate while sharing mana', () => {
  const { game, entity, api, add } = activeFixture(); add(0, 10.1, 100);
  assert.equal(castAlchemistAbility(game, entity, 'A2Z0', { mode: 'manual' }, api).ok, true);
  assert.equal(tryAlchemistAutoCast(game, entity, api), true);
  assert.equal(entity.mana, 84); assert.equal(entity.skillStates.A2Z0.manualReadyAt, 18); assert.equal(entity.skillStates.A2Z0.readyAt, 18);
  assert.equal(castAlchemistAbility(game, entity, 'A2Z0', {}, api).ok, false);
  game.state.time = 18; assert.equal(castAlchemistAbility(game, entity, 'A2Z0', {}, api).ok, true);
  entity.mana = 0; game.state.time = 30; assert.equal(castAlchemistAbility(game, entity, 'A2Z0', {}, api).ok, false);
});

test('medical mist selects lowest life percentage, ignores clicked target and follows its moving center', () => {
  const { game, entity, api, add, tick } = activeFixture();
  const lowest = add(0, 10.5, 200, 1000), clicked = add(0, 10.3, 100, 200), follower = add(0, 11.4, 400, 500);
  assert.equal(castAlchemistAbility(game, entity, 'A2Z0', { target: clicked, point: { x: 99, y: 99 } }, api).ok, true);
  assert.equal(game.state.sourceSkillJobs[0].targetId, lowest.id);
  tick(10); assert.equal(lowest.hp, 210); assert.equal(follower.hp, 410);
  lowest.worldX = 12; clicked.worldX = 10;
  tick(11); assert.equal(lowest.hp, 220); assert.equal(clicked.hp, 110, 'the old position is no longer the healing center');
  assert.equal(follower.hp, 420);
});

test('medical mist gives exactly 5, 15 and 15 pulses beginning at time zero with the three source ranges', () => {
  for (const [rawcode, count, amount, radius] of [['h0XH', 5, 10, 1], ['h0XI', 15, 10, 4 / 3], ['h0XJ', 15, 20, 5 / 3]]) {
    const { game, entity, api, add, tick } = activeFixture(rawcode), ally = add(0, 10 + radius - .001, 1, 10000);
    castAlchemistAbility(game, entity, 'A2Z0', {}, api);
    tick(10); assert.equal(ally.hp, 1 + amount);
    tick(10 + count - 1); assert.equal(ally.hp, 1 + count * amount);
    tick(10 + count + 1); assert.equal(ally.hp, 1 + count * amount); assert.equal(game.state.sourceSkillJobs.length, 0);
  }
});

test('medical target death creates a fixed cloud with forty 0.2-second healing and damage pulses', () => {
  const { game, entity, api, add, tick, hits } = activeFixture('h0XJ');
  const target = add(0, 10.2, 1), ally = add(0, 11.4, 100, 1000), enemy = add(1, 11.5);
  castAlchemistAbility(game, entity, 'A2Z0', {}, api);
  target.worldX = 11.5; target.hp = 0; target.status.deathCounted = true;
  sourceAlchemistDeath(game, target, enemy, api); tick(10);
  assert.equal(ally.hp, 103); assert.equal(enemy.hp, 997); assert.equal(game.state.sourceSkillJobs[0].type, 'alchemist_medical_cloud');
  tick(17.8); assert.equal(ally.hp, 220); assert.equal(enemy.hp, 880); assert.equal(hits.length, 40);
  assert.equal(game.state.sourceSkillJobs.length, 0);
});

test('a self-targeted mist creates its cloud during caster death, after the new death listener would have missed that event', () => {
  const { game, entity, api, add, tick } = activeFixture(); entity.hp = 1;
  const enemy = add(1, 10.2);
  castAlchemistAbility(game, entity, 'A2Z0', {}, api);
  entity.hp = 0; entity.status.deathCounted = true; sourceAlchemistDeath(game, entity, enemy, api);
  game.state.entities = game.state.entities.filter(e => e.id !== entity.id);
  tick(17.8); assert.equal(enemy.hp, 920); assert.equal(game.state.sourceSkillJobs.length, 0);
});

test('acid randomly chooses two distinct living vulnerable enemy targets and ignores a click', () => {
  const { game, entity, api, add } = activeFixture(); game._random = () => 0;
  const first = add(1, 10.1), second = add(1, 10.2), clicked = add(1, 10.3);
  add(1, 10.1, 1000, 1000, { nativeInvulnerable: true }); add(1, 10.1, 0); add(0, 10.1);
  add(1, 10.1, 1000, 1000, { battleTeam: 1 });
  castAlchemistAbility(game, entity, 'A2Z1', { target: clicked }, api);
  assert.deepEqual(game.state.sourceSkillJobs.map(job => job.targetId), [first.id, second.id]);
  assert.equal(entity.mana, 88);
});

test('acid has five delayed direct ticks then exactly seven pool pulses including the immediate pulse', () => {
  const { game, entity, api, add, tick } = activeFixture(); const enemy = add(1, 10.2);
  castAlchemistAbility(game, entity, 'A2Z1', {}, api);
  tick(10); assert.equal(enemy.hp, 1000);
  tick(14); assert.equal(enemy.hp, 960);
  tick(15); assert.equal(enemy.hp, 935, 'fifth direct 10 and first pool 15 share the final tick');
  tick(21); assert.equal(enemy.hp, 845); assert.equal(game.state.sourceSkillJobs.length, 0);
});

test('acid victim death moves the immediate pool to its death location and converts only once', () => {
  const { game, entity, api, add, tick } = activeFixture('h0XI'); const target = add(1, 10.1), neighbor = add(1, 12.5);
  game._random = () => 0; castAlchemistAbility(game, entity, 'A2Z1', {}, api);
  // Two initial targets are valid source behavior; isolate the dying target's job.
  game.state.sourceSkillJobs = game.state.sourceSkillJobs.filter(job => job.targetId === target.id);
  target.worldX = 12.5; target.hp = 0; target.status.deathCounted = true;
  sourceAlchemistDeath(game, target, entity, api); sourceAlchemistDeath(game, target, entity, api);
  assert.equal(neighbor.hp, 975, 'pool damage is immediate on death');
  tick(16); assert.equal(neighbor.hp, 825); assert.equal(game.state.sourceSkillJobs.length, 0);
});

test('acid armor has a global two-second lock without stacking or refreshing, then reapplies at expiration', () => {
  const { game, entity, api, add, tick } = activeFixture(); const enemy = add(1, 10.1);
  castAlchemistAbility(game, entity, 'A2Z1', {}, api); tick(15);
  assert.equal(enemy.buffs.find(buff => buff.key === 'alchemist-acid-armor').armor, -2);
  assert.equal(enemy.status.alchemistAcidArmorUntil, 17);
  tick(16); assert.equal(enemy.status.alchemistAcidArmorUntil, 17);
  tick(17); assert.equal(enemy.status.alchemistAcidArmorUntil, 19);
  assert.equal(enemy.buffs.filter(buff => buff.key === 'alchemist-acid-armor').length, 1);
});

test('timer catch-up preserves the early fatal pulse time when its death callback creates a pool', () => {
  const { game, entity, api, add, tick } = activeFixture();
  const target = add(1, 10.1, 10), neighbor = add(1, 10.2);
  game._random = () => 0; castAlchemistAbility(game, entity, 'A2Z1', {}, api);
  game.state.sourceSkillJobs = game.state.sourceSkillJobs.filter(job => job.targetId === target.id);
  tick(20);
  assert.equal(neighbor.hp, 895, 'pool begins at the t=11 fatal tick and completes seven pulses through t=17');
  assert.equal(game.state.sourceSkillJobs.length, 0); assert.equal(game._alchemistEventAt, undefined);
});

test('caster death cancels existing mist, acid targets, clouds and pools', () => {
  for (const ability of ['A2Z0', 'A2Z1']) {
    const { game, entity, api, add, tick } = activeFixture(); const ally = add(0, 10.2, 100), enemy = add(1, 10.3);
    castAlchemistAbility(game, entity, ability, {}, api); tick(11);
    entity.hp = 0; entity.status.deathCounted = true; sourceAlchemistDeath(game, entity, enemy, api);
    const before = [ally.hp, enemy.hp]; tick(30);
    assert.deepEqual([ally.hp, enemy.hp], before); assert.equal(game.state.sourceSkillJobs.length, 0);
  }
});

test('active jobs, separate cooldowns and acid armor state survive save and restore', () => {
  const { game, entity, api, add, tick } = activeFixture(); add(0, 10.1, 100); const enemy = add(1, 10.2);
  castAlchemistAbility(game, entity, 'A2Z0', {}, api); tryAlchemistAutoCast(game, entity, api);
  castAlchemistAbility(game, entity, 'A2Z1', {}, api); tick(15);
  const saved = game.snapshot(), restored = fixture().game; restored.restore(saved);
  assert.deepEqual(restored.state.sourceSkillJobs, game.state.sourceSkillJobs);
  assert.deepEqual(restored.state.entities.find(e => e.id === entity.id).skillStates.A2Z0, entity.skillStates.A2Z0);
  assert.equal(restored.state.entities.find(e => e.id === enemy.id).status.alchemistAcidArmorUntil, 17);
});

test('active source evidence confirms zero-timers, pulse counts, armor locks and ignored manual targets', () => {
  const source = readFileSync(new URL('../reference/v14-source/raw_extracted/war3map.j', import.meta.url), 'utf8');
  const mist = source.match(/function SingedMedicalMist takes[\s\S]*?endfunction/)[0];
  assert.match(mist, /local integer Ez=5/); assert.match(mist, /set Ez=15/);
  assert.match(mist, /TriggerRegisterTimerEvent\(t,0\.,false\)/); assert.match(mist, /TriggerRegisterTimerEvent\(t,1\.,true\)/);
  const cloud = source.match(/function SingedMedicalCloudAction[\s\S]*?endfunction/)[0]; assert.match(cloud, /if y>=40 then/);
  const pool = source.match(/function SingedAcidPool takes[\s\S]*?endfunction/)[0];
  assert.ok(pool.indexOf('SingedAcidPoolDamage(') < pool.indexOf('TriggerRegisterTimerEvent('));
  const armor = source.match(/function SingedApplyAcidArmor[\s\S]*?endfunction/)[0];
  assert.match(armor, /not LoadBoolean/); assert.match(armor, /TimerStart\(t,2\.,false/);
  assert.match(source, /if BF==Zd then\s+call SingedMedicalMist\(i\)\s+elseif BF==Zi then\s+call SingedAcidBomb\(i\)/);
  assert.equal(Number(V14_ABILITIES.A2Z0.resolved_fields.Cost1), ALCHEMIST_ACTIVE_RULES.A2Z0.manaCost);
  assert.equal(Number(V14_ABILITIES.A2Z1.resolved_fields.Cool1), ALCHEMIST_ACTIVE_RULES.A2Z1.cooldown);
});
