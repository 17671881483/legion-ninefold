import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../dist/engine.js';
import { UNIT_TEMPLATES } from '../dist/data.js';
import { canWeaponTarget, tickSourceScriptJobs } from '../dist/skills.js';

const close = (actual, expected, label) => assert.ok(Math.abs(actual - expected) < 1e-7, `${label ?? 'value'}: ${actual} != ${expected}`);
function fixture() {
  const game = new Game({ mode: 'sandbox', seed: 508 }); game.state.phase = 'combat'; game.state.time = 10;
  game.state.entities = []; game.state.sourceSkillJobs = []; return game;
}
function add(game, code, { skills, side = 'defender', team = 0, ownerId = team === 0 ? 0 : null, x = 5, y = 10, hp = 10000, ...extra } = {}) {
  const template = UNIT_TEMPLATES[code], def = skills ? { ...template, abilityIds: skills } : template;
  const e = game._entity(def, { ownerId, team, side, battleTeam: 0, laneId: 0, sourceLaneId: 0, worldX: x, worldY: y, ...extra });
  e.hp = e.maxHp = hp; e.mana = e.maxMana = 100; e.hpRegen = e.manaRegen = 0;
  // Keep actual weapons/native data but isolate script behavior from ordinary
  // attacks until a test explicitly asks the combat loop to resume one.
  e.attackCd = e.abilityCd = 100; game.state.entities.push(e); return e;
}
const enemy = (game, code = 'h00L', extra = {}) => add(game, code, { skills: [], side: 'monster', team: 1, x: 5.6, ...extra });
const cast = (game, e, skillId, extra = {}) => game.command('cast', { entityId: e.id, skillId, playerId: e.ownerId ?? 0, worldX: 6, worldY: 10, ...extra });
const jobsAt = (game, at) => { game.state.time = at; tickSourceScriptJobs(game); };

test('real manual ice spells obey ordinary-attack magic matrix, ignore numeric armor and expose their shared native cooldowns', () => {
  for (const [id, sourceDamage] of [['A19Q', 675], ['A19R', 450]]) {
    const game = fixture(), source = add(game, 'h0SL', { skills: [id] }), target = enemy(game);
    target.armor = 999; target.armorType = 'heavy'; target.sourceArmorTypeRaw = 'large';
    assert.equal(cast(game, source, id).ok, true); assert.equal(source.mana, 80);
    const status = game.unitSkillStatus(source.id).find(s => s.id === id);
    assert.equal(status.cooldownMode, 'shared_native'); assert.equal(status.remaining, 20); assert.equal(status.autoRemaining, 20);
    assert.equal(cast(game, source, id).ok, false);
    jobsAt(game, 13); close(target.hp, 10000 - sourceDamage * game._typeMultiplier('normal', 'heavy', 'large'), id);
    assert.equal(game._iceEventAt, undefined); assert.equal(game._sourceAbilityEffectDepth, 0);
  }
});

test('native S007 bridge distinguishes organic air/hero targets, mechanical targets, buildings and magic immunity', () => {
  const game = fixture(), source = add(game, 'h0SL', { skills: ['A19R'] });
  const organic = enemy(game), air = enemy(game, 'h00L', { x: 5.65, targetType: 'air' }), hero = enemy(game, 'h00L', { x: 5.7, isNativeHero: true });
  const mechanical = enemy(game, 'h009', { x: 5.75 }), building = enemy(game, 'n06I', { x: 5.8 });
  const immune = add(game, 'edry', { skills: ['Amim'], side: 'monster', team: 1, x: 5.85 });
  assert.equal(cast(game, source, 'A19R').ok, true); jobsAt(game, 10);
  for (const e of [organic, air, hero]) { assert.equal(e.status.cycloneUntil, 13); assert.ok(e.hp < 10000); }
  for (const e of [mechanical, building, immune]) assert.equal(e.status.cycloneUntil, undefined);
  assert.ok(mechanical.hp < 10000); assert.ok(building.hp < 10000); assert.equal(immune.hp, 10000);
  const firstHit = organic.hp; jobsAt(game, 12.999); close(organic.hp, firstHit, 'cyclone prevents damage before expiry');
  jobsAt(game, 13); assert.ok(organic.hp < firstHit); assert.equal(immune.hp, 10000);
});

test('cycloned units cannot move, attack, acquire targets, take damage or manually cast, and resume exactly when the native control expires', () => {
  const game = fixture(), source = add(game, 'h0SL', { skills: ['A19R'] });
  const controlled = enemy(game, 'h0SL', { skills: ['A19O'], ownerId: 4 }); controlled.mana = 0;
  const watcher = add(game, 'h00L', { skills: [], x: 4.9 });
  controlled.pendingAttack = { targetId: source.id, startedAt: 9, finishAt: 10.1 }; controlled.targetId = source.id;
  assert.equal(cast(game, source, 'A19R').ok, true); jobsAt(game, 10);
  assert.equal(controlled.status.cycloneUntil, 13); assert.equal(controlled.pendingAttack, null);
  controlled.mana = 100;
  const hp = controlled.hp, sourceHp = source.hp, location = [controlled.worldX, controlled.worldY];
  assert.equal(cast(game, controlled, 'A19O', { worldX: 5, worldY: 10 }).ok, false);
  assert.equal(game.unitSkillStatus(controlled.id, 4).find(s => s.id === 'A19O').canStart, false);
  assert.equal(game._hurt(controlled, 100, source, { spell: true, universal: true }), 0); assert.equal(controlled.hp, hp);
  assert.equal(canWeaponTarget(controlled, source, 12), false); assert.equal(canWeaponTarget(watcher, controlled, 12), false);
  game.state.time = 12; game._updateEntities(.1);
  assert.deepEqual([controlled.worldX, controlled.worldY], location); assert.equal(controlled.pendingAttack, null); assert.equal(source.hp, sourceHp);
  assert.equal(watcher.targetId, null, 'the real spatial acquisition loop excludes a cycloned enemy');
  game.state.time = 13; assert.equal(canWeaponTarget(watcher, controlled, 13), true);
  game._updateEntities(.01); assert.equal(watcher.targetId, controlled.id);
  assert.equal(game.unitSkillStatus(controlled.id, 4).find(s => s.id === 'A19O').canStart, true);
  assert.equal(cast(game, controlled, 'A19O', { worldX: 5, worldY: 10 }).ok, true);
});

test('ordinary source pause blocks the real combat loop and commands without permanently disabling an ice caster', () => {
  const game = fixture(), source = add(game, 'h0SL', { skills: ['A19O'] }), target = enemy(game);
  source.status.sourcePaused = true; source.attackCd = 0;
  const origin = [source.worldX, source.worldY], hp = target.hp;
  assert.equal(cast(game, source, 'A19O').ok, false); game._updateEntities(.1);
  assert.deepEqual([source.worldX, source.worldY], origin); assert.equal(target.hp, hp); assert.equal(source.mana, 100);
  source.status.sourcePaused = false;
  assert.equal(cast(game, source, 'A19O').ok, true); assert.equal(source.mana, 95);
});

test('command ownership, invalid points and native range failures spend no resources and create no ice jobs', () => {
  const game = fixture(), source = add(game, 'h0SL', { skills: ['A19O'] }); enemy(game);
  assert.equal(cast(game, source, 'A19O', { playerId: 1 }).ok, false);
  assert.equal(cast(game, source, 'A19O', { worldX: Number.NaN }).ok, false);
  assert.equal(cast(game, source, 'A19O', { worldX: 8 }).ok, false);
  assert.equal(source.mana, 100); assert.equal(source.skillStates.A19O.readyAt, 0); assert.equal(game.state.sourceSkillJobs.length, 0);
  assert.equal(cast(game, source, 'A19O').ok, true); assert.equal(source.mana, 95);
});

test('a real nested manual poison-breath event charges ice native orders but suppresses all four reentrant script bodies', () => {
  const game = fixture(), dragon = add(game, 'h0UJ', { skills: ['A1DD'] });
  const ice = enemy(game, 'h0SL', { skills: ['A19O', 'A19P', 'A19Q', 'A19R'], ownerId: 4 });
  assert.equal(cast(game, dragon, 'A1DD', { worldX: 5.6, targetId: ice.id }).ok, true);
  close(ice.hp, 10000 - 66, 'the outer source body hits only once');
  assert.equal(ice.mana, 45); assert.equal(dragon.mana, 78); assert.equal(game.state.sourceSkillJobs.length, 0);
  for (const [id, cooldown] of [['A19O', 8], ['A19P', 12], ['A19Q', 20], ['A19R', 20]]) {
    assert.equal(ice.skillStates[id].casts, 1); assert.equal(ice.skillStates[id].readyAt, 10 + cooldown);
    assert.equal(game.unitSkillStatus(ice.id, 4).find(s => s.id === id).remaining, cooldown);
  }
  assert.equal(game._sourceAbilityEffectDepth, 0); assert.equal(game._sourceDamageTriggerDepth, 0);
  assert.equal(cast(game, ice, 'A19O', { worldX: 5 }).ok, false, 'manual retry observes the same native cooldown');
});

test('death and JSON restoration preserve concurrent ice, Naga, alchemist and Kelthuzad jobs without cross-family snapshots', () => {
  const game = fixture(), ice = add(game, 'h0SL', { skills: ['A19Q'] });
  const naga = add(game, 'h0UO', { skills: ['A1DQ'], x: 4.8 }), alchemist = add(game, 'h0XH', { skills: ['A2Z1'], x: 4.6 });
  const kel = add(game, 'h0PI', { skills: ['A0ZZ'], x: 4.4 }), target = enemy(game, 'h00L', { hp: 100000 });
  assert.equal(cast(game, ice, 'A19Q').ok, true); assert.equal(cast(game, naga, 'A1DQ').ok, true);
  assert.equal(cast(game, alchemist, 'A2Z1').ok, true); assert.equal(cast(game, kel, 'A0ZZ', { targetId: target.id }).ok, true);
  const families = new Set(game.state.sourceSkillJobs.map(j => j.type.split('_')[0]));
  for (const family of ['ice', 'naga', 'alchemist', 'kelthuzad']) assert.ok(families.has(family), family);
  jobsAt(game, 10.08);
  const foreignBefore = JSON.stringify(game.state.sourceSkillJobs.filter(j => !j.type.startsWith('ice_')));
  game._hurt(ice, 20000, target, { spell: true, universal: true });
  assert.equal(JSON.stringify(game.state.sourceSkillJobs.filter(j => !j.type.startsWith('ice_'))), foreignBefore);
  game._clearDead(); const saved = game.snapshot(), restored = Game.fromSnapshot(saved);
  assert.deepEqual(restored.snapshot(), saved);
  for (const g of [game, restored]) jobsAt(g, 13.2);
  assert.deepEqual(restored.snapshot(), game.snapshot());
  game.tick(.05); restored.tick(.05); assert.deepEqual(restored.snapshot(), game.snapshot());
  for (const key of ['_iceEventAt', '_kelthuzadEventAt', '_trollEventAt']) assert.equal(game[key], undefined);
});

test('real Troll manual axe shares its native cooldown and resolves source damage and permanent first attack level', () => {
  const game = fixture(), troll = add(game, 'h0QU', { skills: ['A15C'] }), target = enemy(game);
  const damageBefore = troll.damage;
  assert.equal(cast(game, troll, 'A15C', { targetId: target.id }).ok, true); assert.equal(troll.mana, 80);
  const status = game.unitSkillStatus(troll.id).find(s => s.id === 'A15C');
  assert.equal(status.remaining, 5); assert.equal(status.cooldownMode, 'shared_native');
  assert.equal(cast(game, troll, 'A15C', { targetId: target.id }).ok, false);
  jobsAt(game, 11); assert.ok(target.hp <= 0); assert.equal(troll.abilityLevels.A15D, 1); close(troll.damage, damageBefore + 5);
  assert.equal(game._trollEventAt, undefined); assert.equal(game._sourceAbilityEffectDepth, 0);
});
