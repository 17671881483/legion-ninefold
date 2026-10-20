import test from 'node:test';
import assert from 'node:assert/strict';
import { V14_ABILITIES, V14_UNIT_TEMPLATES } from '../dist/v14-reference.js';
import { ILLIDAN_ACTIVE_RULES, ILLIDAN_RULES, ILLIDAN_NORMAL_ABILITIES, ILLIDAN_DEMON_ABILITIES, isIllidanJobType, isIllidanActiveAbility, canIllidanCastAbility, registerIllidanSource, castIllidanAbility, tryIllidanAutoCast, illidanOnAttackHit, tickIllidanSource, illidanAfterDamage, sourceIllidanDeath, tickIllidanJob } from '../dist/illidan-rules.js';

const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-7, `${a} != ${b}`);
const has = (e, id) => e.skillSpecs.some(s => s.id === id);
const jobs = (g, type) => g.state.sourceSkillJobs.filter(j => j.type === type && !j.done);
function fixture() {
  let seq = 0;
  const g = {
    state: { time: 0, entities: [], kings: [], sourceSkillJobs: [], players: [{ buildings: [] }] }, random: [], hits: [], compiled: [], applied: [],
    _random() { return this.random.shift() ?? .9; },
    add(ids = [], raw = 'enemy', side = 'monster', x = 0, y = 0, extra = {}) {
      const e = { id: ++seq, createdAt: this.state.time, combatRawcode: raw, skillSpecs: ids.map(id => ({ id })), skillStates: {}, abilityLevels: {}, status: {}, damage: 100, hp: 10000, maxHp: 10000, mana: 100, maxMana: 100, distanceScale: 1 / 3, worldX: x, worldY: y, facing: 0, side, team: side === 'monster' ? 1 : 0, battleTeam: 0, ownerId: side === 'defender' ? 0 : null, buffs: [], traits: [], ...extra };
      this.state.entities.push(e); return e;
    },
    illidan(ids = V14_UNIT_TEMPLATES.h0SY.abilityIds, extra = {}, raw = 'h0SY') {
      const e = this.add(ids, raw, 'defender', 0, 0, { hp: 5500, maxHp: 5500, damage: 502.5, buildingId: 'illidan-building', ...extra }); registerIllidanSource(this, e, api); return e;
    },
    building(level = 0) {
      const b = { id: 'illidan-building', skillSpecs: V14_UNIT_TEMPLATES.h0SY.abilityIds.map(id => ({ id })), abilityLevels: {}, skillStates: {}, status: {}, damage: 502.5 };
      if (level) { b.skillSpecs.push({ id: 'A1BD' }); b.abilityLevels.A1BD = level; b.status.illidanSoulLevel = level; b.illidanSoulLevel = level; }
      this.state.players[0].buildings.push(b); return b;
    },
    cast(e, id, params = {}) { return castIllidanAbility(this, e, id, params, api); },
    tick(time) {
      this.state.time = time;
      const pending = this.state.sourceSkillJobs, remaining = [];
      for (const job of pending) if (tickIllidanJob(this, job, api)) remaining.push(job);
      this.state.sourceSkillJobs = remaining;
    },
    kill(e, killer = null) { e.hp = 0; return sourceIllidanDeath(this, e, killer, api); },
    hit(target, amount, source = null) { return api.universalDamage(this, target, amount, source); },
  };
  const api = {
    scriptInvulnerable: e => !!e.invulnerable || has(e, 'Avul'),
    universalDamage(game, target, amount, source) {
      if (target.hp <= .405 || this.scriptInvulnerable(target)) return 0;
      const before = target.hp; game.hits.push({ id: target.id, sourceId: source?.id, amount, at: game._illidanEventAt ?? game.state.time }); target.hp -= amount;
      illidanAfterDamage(game, target, amount, { ...api, preDamageHp: before });
      if (target.hp <= .405) sourceIllidanDeath(game, target, source, api);
      return amount;
    },
    compileAbility(game, entity, id) { game.compiled.push({ id, entityId: entity.id }); return { id, name: V14_ABILITIES[id]?.name, status: ILLIDAN_RULES[id]?.status ?? 'implemented', kind: 'fixture' }; },
    getBuilding(game, e) { return game.state.players[e.ownerId]?.buildings.find(b => b.id === e.buildingId); },
    applyAttackLevel(game, e, id, oldLevel, newLevel) { const f = V14_ABILITIES[id].resolved_fields, value = level => level > 0 ? Number(f[`DataA${level}`] ?? f.DataA1) : 0; e.damage += value(newLevel) - value(oldLevel); game.applied.push({ id, entityId: e.id, oldLevel, newLevel }); },
    spawnUnit(game, e, rawcode, extra) {
      const d = V14_UNIT_TEMPLATES[rawcode];
      const n = game.add(d.abilityIds, rawcode, e.side, e.worldX, e.worldY, { ownerId: e.ownerId, buildingId: e.buildingId, team: e.team, battleTeam: e.battleTeam, hp: d.hp, maxHp: d.hp, damage: d.damage, mana: d.manaStart, maxMana: d.mana, traits: d.unitType.split(','), ...extra });
      registerIllidanSource(game, n, api); return n;
    },
    removeUnit(game, e) { game.state.entities = game.state.entities.filter(t => t.id !== e.id); },
  };
  return { g, api };
}

test('metadata follows source functions and object fields rather than conflicting tooltips', () => {
  assert.deepEqual(Object.keys(ILLIDAN_ACTIVE_RULES), ['A1BA', 'A1BB', 'A1BE', 'A1BF']);
  for (const rule of Object.values(ILLIDAN_RULES)) { assert.ok(rule.description); assert.ok(rule.sourceLines); if (rule.status === 'partial') assert.ok(rule.partial); }
  assert.equal(ILLIDAN_ACTIVE_RULES.A1BE.manaCost, 5); assert.equal(ILLIDAN_ACTIVE_RULES.A1BF.manaCost, 13);
  assert.equal(ILLIDAN_ACTIVE_RULES.A1BA.targetKind, 'enemy'); assert.equal(ILLIDAN_ACTIVE_RULES.A1BF.targetKind, 'point');
  assert.match(ILLIDAN_RULES.A1B6.description, /击杀事件20%/); assert.match(ILLIDAN_RULES.A1B7.description, /0至8秒/);
  assert.match(ILLIDAN_RULES.A1BC.partial, /SetUnitAbilityLevel\(0\)/); assert.match(ILLIDAN_RULES.A1B9.partial, /驻留/);
  assert.equal(isIllidanJobType('illidan_eye'), true); assert.equal(isIllidanJobType('illidan_unknown'), false);
  assert.equal(isIllidanActiveAbility('A1BI'), false);
});

test('registration uses createdAt, runtime abilities, and an explicit reincarnation guard', () => {
  const { g, api } = fixture(); g.state.time = 9;
  const mirror = g.illidan([], { isIllusion: true }), e = g.illidan(undefined, { createdAt: 2 });
  assert.equal(mirror.status.illidanRegistered, undefined); assert.equal(e.status.illidanRegisteredAt, 2);
  assert.equal(registerIllidanSource(g, e, api), false); assert.equal(e.status.illidanDeathReviveRegistered, true);
  assert.equal(registerIllidanSource(g, g.add(['A1B6'], 'h0SY', 'defender', 0, 0, { illidanReincarnated: true }), api), false);
  assert.equal(canIllidanCastAbility(g.add(['A1BA'], 'n06U', 'defender'), 'A1BA'), false);
});

test('deployment copies persistent soul levels once without double-applying attack', () => {
  const { g, api } = fixture(), building = g.building(7), e = g.illidan();
  assert.equal(e.abilityLevels.A1BD, 7); near(e.damage, 509.5);
  registerIllidanSource(g, e, api); near(e.damage, 509.5); assert.equal(building.abilityLevels.A1BD, 7);
});

test('soul steal is a 20 percent killing-unit proc and gives no healing', () => {
  const { g } = fixture(), building = g.building(), e = g.illidan(['A1B6']), a = g.add(), b = g.add(); e.hp = 1000;
  g.random.push(.2000001, .2); g.kill(a, e); assert.equal(has(e, 'A1BD'), false);
  g.kill(b, e); assert.equal(e.abilityLevels.A1BD, 1); assert.equal(building.abilityLevels.A1BD, 1); near(e.damage, 503.5); near(e.hp, 1000);
  g.kill(b, e); assert.equal(e.abilityLevels.A1BD, 1, 'duplicate death hook must not proc twice');
});

test('soul registration persists while marker removed, and combat/building levels remain distinct', () => {
  const { g } = fixture(), building = g.building(8), e = g.illidan();
  g.cast(e, 'A1BB'); assert.equal(has(e, 'A1B6'), false); g.tick(2.5);
  const pair = jobs(g, 'illidan_flame_pair')[0]; for (const id of pair.flameIds) g.kill(g.state.entities.find(t => t.id === id));
  assert.equal(has(e, 'A1BD'), false); assert.equal(building.abilityLevels.A1BD, 8); near(e.damage, 502.5);
  g.random.push(0, 0); g.kill(g.add(), e); assert.equal(e.abilityLevels.A1BD, 1); assert.equal(building.abilityLevels.A1BD, 8);
  g.kill(g.add(), e); assert.equal(e.abilityLevels.A1BD, 2); assert.equal(building.abilityLevels.A1BD, 9);
});

test('soul native level cap is 200 on both combat and persistent building', () => {
  const { g } = fixture(), b = g.building(200), e = g.illidan(['A1B6']); g.random.push(0); g.kill(g.add(), e);
  assert.equal(e.abilityLevels.A1BD, 200); assert.equal(b.abilityLevels.A1BD, 200); near(e.damage, 702.5);
});

test('first actual attack consumes parasite even with no targets; enemy selection is first three, not random', () => {
  const { g, api } = fixture(), e = g.illidan(['A1B7']), inv = g.add(['Avul']);
  const targets = [g.add(), g.add(), g.add(), g.add()]; g.add([], 'elsewhere', 'monster', 1.34); g.add([], 'other-battle', 'monster', 0, 0, { battleTeam: 1 });
  assert.equal(illidanOnAttackHit(g, e, targets[0], api), true); assert.equal(has(e, 'A1B7'), false);
  assert.deepEqual(jobs(g, 'illidan_parasite').map(j => j.targetId), targets.slice(0, 3).map(t => t.id));
  assert.ok(jobs(g, 'illidan_parasite').every(j => j.targetId !== inv.id)); assert.equal(illidanOnAttackHit(g, e, targets[0], api), false);
  const empty = g.illidan(['A1B7'], { worldX: 100 }); assert.equal(illidanOnAttackHit(g, empty, null, api), true); assert.equal(has(empty, 'A1B7'), false);
});

test('parasite has nine direct ticks followed by t9 splash, and survives ordinary caster death', () => {
  const { g, api } = fixture(), e = g.illidan(['A1B7']), t = g.add([], 'enemy', 'monster', 1);
  illidanOnAttackHit(g, e, t, api); g.tick(0); near(t.hp, 9980); g.kill(e); g.tick(8); near(t.hp, 9820);
  g.tick(9); near(t.hp, 9745); assert.equal(jobs(g, 'illidan_parasite').length, 0);
  assert.deepEqual(g.hits.map(h => h.at), [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]); assert.equal(g.hits.filter(h => h.amount === 20).length, 9);
});

test('parasite death explosions cascade once per target and use the death position', () => {
  const { g, api } = fixture(), e = g.illidan(['A1B7']), a = g.add([], 'a', 'monster', 1, 0, { hp: 10 }), b = g.add([], 'b', 'monster', 1.1, 0, { hp: 70 }), c = g.add([], 'c', 'monster', 1.2, 0, { hp: 1000 });
  illidanOnAttackHit(g, e, a, api); g.tick(0);
  assert.ok(a.hp <= 0); assert.ok(b.hp <= 0); assert.equal(g.hits.filter(h => h.id === c.id && h.amount === 75).length, 2);
  assert.equal(jobs(g, 'illidan_parasite').length, 1); g.kill(a); g.kill(b); assert.equal(g.hits.filter(h => h.id === c.id && h.amount === 75).length, 2);
});

test('fright aura polls B07R, deals once per entry, and allows repeated re-entry', () => {
  const { g, api } = fixture(), e = g.illidan(['A1B8', 'A1B9']), t = g.add([], 'enemy', 'monster', 1);
  tickIllidanSource(g, e, api); assert.equal(jobs(g, 'illidan_fright').length, 1); g.tick(.029); near(t.hp, 10000); g.tick(.03); near(t.hp, 9950);
  g.state.time = 1; tickIllidanSource(g, e, api); g.tick(1); near(t.hp, 9950);
  t.worldX = 2; tickIllidanSource(g, e, api); t.worldX = 1; tickIllidanSource(g, e, api); g.tick(1.03); near(t.hp, 9900);
});

test('fright waits for actual native buff, and the 100th poll does not deal damage', () => {
  const { g, api } = fixture(), e = g.illidan(['A1B9']), t = g.add(); let buff = false; api.nativeBuffActive = () => buff;
  tickIllidanSource(g, e, api); g.tick(2.97); near(t.hp, 10000); assert.equal(jobs(g, 'illidan_fright')[0].count, 99);
  buff = true; g.tick(3); near(t.hp, 10000); assert.equal(jobs(g, 'illidan_fright').length, 0);
  t.worldX = 3; tickIllidanSource(g, e, api); t.worldX = 0; tickIllidanSource(g, e, api); g.tick(3.03); near(t.hp, 9950);
});

test('native fear buff can come from another Illidan after the original aura is removed', () => {
  const { g, api } = fixture(), e = g.illidan(['A1B8', 'A1B9', 'A1BB']), t = g.add();
  tickIllidanSource(g, e, api); g.cast(e, 'A1BB'); assert.equal(has(e, 'A1B8'), false);
  api.nativeBuffActive = (game, target, id) => target.id === t.id && id === 'B07R'; g.tick(.03); near(t.hp, 9950);
});

test('manual and auto share native cooldown and debit only their actual object costs', () => {
  const { g, api } = fixture(), e = g.illidan(['A1BA']), t = g.add([], 'enemy', 'monster', 1);
  assert.equal(g.cast(e, 'A1BA', { target: t }).ok, true); near(e.mana, 92); assert.equal(e.skillStates.A1BA.readyAt, 18);
  assert.deepEqual(tryIllidanAutoCast(g, t, e, api), []); assert.equal(g.cast(e, 'A1BA', { target: t }).ok, false); near(e.mana, 92);
  g.state.time = 18; assert.deepEqual(tryIllidanAutoCast(g, t, e, api), [{ id: 'A1BA', sourceId: e.id }]); near(e.mana, 84); assert.equal(e.skillStates.A1BA.readyAt, 36);
});

test('automatic victim presence blocks attacker fallback even when the victim cannot cast', () => {
  const { g, api } = fixture(), a = g.illidan(['A1BA']), b = g.illidan(['A1BA'], { mana: 0, side: 'monster' });
  assert.deepEqual(tryIllidanAutoCast(g, b, a, api), []); assert.equal(a.skillStates.A1BA, undefined); near(a.mana, 100);
});

test('native order adapter receives the exact BA/BB/BE/BF branch order', () => {
  const { g, api } = fixture(), e = g.illidan(['A1BA', 'A1BB', 'A1BE', 'A1BF']), t = g.add(), calls = [];
  api.issueNativeOrder = (game, source, id, params) => { calls.push({ id, sourceId: source.id, targetId: params.target?.id }); return { ok: false }; };
  tryIllidanAutoCast(g, t, e, api); assert.deepEqual(calls.map(c => c.id), ['A1BA', 'A1BB', 'A1BE', 'A1BF']); assert.equal(calls[0].targetId, t.id); assert.equal(calls[1].targetId, undefined); near(e.mana, 100);
});

test('invalid targets, range, mana and paused states reject casts without spending resources', () => {
  const { g } = fixture(), e = g.illidan(['A1BA', 'A1BF']), far = g.add([], 'enemy', 'monster', 4), inv = g.add(['Avul']);
  assert.equal(g.cast(e, 'A1BA', { point: { x: 0, y: 0 } }).ok, false); assert.equal(g.cast(e, 'A1BA', { target: far }).ok, false); assert.equal(g.cast(e, 'A1BA', { target: inv }).ok, false);
  e.status.illidanPaused = true; assert.equal(g.cast(e, 'A1BF', { point: { x: 1, y: 0 } }).ok, false); near(e.mana, 100);
});

test('evil flame follows the caster, has 13 pulses at t0 through t12, and stops on death', () => {
  const { g } = fixture(), e = g.illidan(['A1BA']), a = g.add([], 'a', 'monster', 1.9), b = g.add([], 'b', 'monster', 3.9);
  g.cast(e, 'A1BA', { target: a }); g.tick(0); near(a.hp, 9925); near(b.hp, 10000);
  e.worldX = 2; g.tick(12); near(a.hp, 9025); near(b.hp, 9100); assert.equal(jobs(g, 'illidan_flame').length, 0);
  g.state.time = 18; g.cast(e, 'A1BA', { target: a }); g.tick(18); g.kill(e); const hits = g.hits.length; g.tick(40); assert.equal(g.hits.length, hits);
});

test('Aisinos pauses 2.5 seconds, switches only the seven native normal skills, and restores after two deaths', () => {
  const { g } = fixture(), e = g.illidan([...V14_UNIT_TEMPLATES.h0SY.abilityIds, 'dynamic']); e.skillStates.A1BA = { readyAt: 999, casts: 3 };
  assert.equal(g.cast(e, 'A1BB').ok, true); assert.equal(e.status.illidanPaused, true);
  for (const id of ILLIDAN_NORMAL_ABILITIES) assert.equal(has(e, id), false);
  for (const id of ILLIDAN_DEMON_ABILITIES) assert.equal(has(e, id), true);
  assert.equal(has(e, 'A1BJ'), true); assert.equal(has(e, 'dynamic'), true); near(e.damage, 503.5);
  g.tick(2.499); assert.equal(g.state.entities.filter(t => t.combatRawcode === 'n06V').length, 0); g.tick(2.5);
  const flames = g.state.entities.filter(t => t.combatRawcode === 'n06V'); assert.equal(flames.length, 2); assert.ok(flames.every(t => t.isSummon && !t.expiresAt)); assert.equal(e.status.illidanPaused, false);
  g.kill(flames[0]); assert.equal(e.status.illidanAlternateDepth, 1); g.kill(flames[0]); assert.equal(e.status.illidanAlternateDepth, 1); g.kill(flames[1]); assert.equal(e.status.illidanAlternateDepth, 0);
  assert.equal(has(e, 'A1B7'), true); assert.equal(has(e, 'A1BD'), false); assert.equal(e.skillStates.A1BA, undefined, 'removed native cooldown is destroyed'); near(e.damage, 502.5);
});

test('six successful Aisinos sequences restore A1BB; the seventh paid attempt removes it', () => {
  const { g } = fixture(), e = g.illidan();
  for (let i = 0; i < 6; i++) {
    e.mana = 100; assert.equal(g.cast(e, 'A1BB').ok, true); g.tick(g.state.time + 2.5);
    const pair = jobs(g, 'illidan_flame_pair').at(-1); for (const id of pair.flameIds) g.kill(g.state.entities.find(t => t.id === id));
    assert.equal(has(e, 'A1BB'), true); assert.equal(e.status.illidanAisinosCasts, i + 1);
  }
  e.mana = 100; assert.equal(g.cast(e, 'A1BB').ok, true); near(e.mana, 82); assert.equal(has(e, 'A1BB'), false); assert.equal(jobs(g, 'illidan_morph').length, 0);
});

test('ancient Aisinos consumes native cost but does not morph or summon', () => {
  const { g } = fixture(), e = g.illidan(['A1BB'], { traits: ['ancient'] });
  assert.equal(g.cast(e, 'A1BB').ok, true); near(e.mana, 82); assert.equal(e.skillStates.A1BB.readyAt, 30); assert.equal(e.status.illidanAlternateDepth, undefined); assert.equal(g.state.sourceSkillJobs.length, 0);
});

test('shadow demons use n06W object stats without invented silence or timed life', () => {
  const { g } = fixture(), e = g.illidan(['A1BE'], { worldX: 2, worldY: 3, facing: 43 });
  assert.equal(g.cast(e, 'A1BE').ok, true); near(e.mana, 95); const demons = g.state.entities.filter(t => t.combatRawcode === 'n06W');
  assert.equal(demons.length, 2); for (const d of demons) { near(d.hp, 1000); near(d.damage, 81.5); assert.deepEqual(d.skillSpecs, []); assert.equal(d.isSummon, true); assert.equal(d.expiresAt, undefined); assert.equal(d.facing, 43); near(d.worldX, 2); near(d.worldY, 3); }
});

test('eye prism has four fixed overlapping circles and 215 plus twelve 10 pulses per circle', () => {
  const { g } = fixture(), e = g.illidan(['A1BF']), center = g.add([], 'overlap', 'monster', 1, 0), off = g.add([], 'off', 'monster', 1, .68);
  assert.equal(g.cast(e, 'A1BF', { point: { x: 2, y: 0 } }).ok, true); near(e.mana, 87); assert.equal(jobs(g, 'illidan_eye').length, 4);
  g.tick(0); near(center.hp, 10000 - 3 * 215); near(off.hp, 10000); e.worldX = 100; e.facing = 90;
  g.tick(12); near(center.hp, 10000 - 3 * 335); near(off.hp, 10000); assert.equal(jobs(g, 'illidan_eye').length, 0);
});

test('eye direction follows chosen point and dying caster cancels all remaining circles', () => {
  const { g } = fixture(), e = g.illidan(['A1BF']), t = g.add([], 'enemy', 'monster', 0, 1);
  g.cast(e, 'A1BF', { point: { x: 0, y: 2 } }); g.tick(0); near(t.hp, 10000 - 645); g.kill(e); const before = t.hp; g.tick(12); near(t.hp, before);
});

test('death reincarnation copies positive soul level into a fresh full-life body with 15 mana and no second revival', () => {
  const { g } = fixture(), b = g.building(7), e = g.illidan(undefined, { mana: 4, worldX: 2, facing: 15 }), fresh = g.kill(e);
  assert.ok(fresh); assert.equal(g.state.entities.includes(e), false); assert.equal(e.status.illidanRemoved, true); near(fresh.hp, 5500); near(fresh.mana, 15); near(fresh.worldX, 2); assert.equal(fresh.facing, 15);
  assert.equal(fresh.abilityLevels.A1BD, 7); near(fresh.damage, 509.5); assert.equal(fresh.isSummon, false); assert.equal(fresh.status.illidanFrenzyArmed, true); assert.equal(fresh.status.illidanSoulRegistered, true); assert.equal(fresh.status.illidanAuraRegistered, false);
  assert.equal(has(fresh, 'A1BJ'), true); assert.equal(has(fresh, 'A1BF'), true); assert.equal(has(fresh, 'A1BC'), false); assert.equal(b.abilityLevels.A1BD, 7); assert.equal(g.kill(fresh), null);
});

test('zero-level soul reincarnation preserves the precise native uncertainty without awarding invented attack', () => {
  const { g } = fixture(), e = g.illidan(['A1B6', 'A1BC']), fresh = g.kill(e);
  assert.deepEqual(fresh.status.illidanSoulLevelUnresolved, { requestedLevel: 0, addedLevel: 1 }); near(fresh.damage, 502.5);
  const next = fixture(); next.api.nativeSetAbilityLevel = () => 1; const known = next.g.kill(next.g.illidan(['A1B6', 'A1BC'])); assert.equal(known.abilityLevels.A1BD, 1); near(known.damage, 503.5); assert.equal(known.status.illidanSoulLevelUnresolved, undefined);
});

test('only the death-created demon gets one strict-under-20-percent frenzy, flat 50 attack and +1 haste for 15 seconds', () => {
  const { g, api } = fixture(); g.building(3); const e = g.illidan(), fresh = g.kill(e);
  g.hit(fresh, 4400); near(fresh.hp, 1100); assert.equal(fresh.status.illidanFrenzyTriggered, undefined);
  g.hit(fresh, 1); assert.equal(fresh.status.illidanFrenzyTriggered, true); near(fresh.damage, 555.5); assert.equal(fresh.buffs.find(b => b.key === 'illidan-demonic-frenzy').haste, 1);
  g.tick(14.999); near(fresh.damage, 555.5); g.tick(15); near(fresh.damage, 505.5); assert.equal(has(fresh, 'A1BH'), false);
  fresh.hp = 2000; g.hit(fresh, 1000); assert.equal(jobs(g, 'illidan_frenzy').length, 0);
  const temporary = g.illidan(); g.cast(temporary, 'A1BB'); g.tick(17.5); temporary.hp = 1099; assert.equal(illidanAfterDamage(g, temporary, 100, { ...api, preDamageHp: 1199 }), false);
});

test('fright, flame and frenzy death paths cancel jobs; frenzy death leaves corpse stats as source does', () => {
  const { g } = fixture(); g.building(1); const fresh = g.kill(g.illidan()); g.hit(fresh, 4401); const attack = fresh.damage; g.kill(fresh); g.tick(20);
  near(fresh.damage, attack); assert.equal(g.state.sourceSkillJobs.length, 0);
});

test('serialized parasite, morph/pair and eye jobs keep working after JSON save/restore', () => {
  const { g, api } = fixture(), e = g.illidan(['A1B7', 'A1BB', 'A1BF']), t = g.add([], 'enemy', 'monster', 1);
  illidanOnAttackHit(g, e, t, api); g.cast(e, 'A1BF', { point: { x: 2, y: 0 } }); g.cast(e, 'A1BB');
  g.state = JSON.parse(JSON.stringify(g.state)); g.tick(0); assert.ok(g.state.entities.find(n => n.id === t.id).hp < 10000); g.tick(2.5);
  const restored = g.state.entities.find(n => n.id === e.id), pair = jobs(g, 'illidan_flame_pair')[0]; assert.equal(restored.status.illidanPaused, false);
  for (const id of pair.flameIds) g.kill(g.state.entities.find(n => n.id === id)); assert.equal(restored.status.illidanAlternateDepth, 0); g.tick(12);
  assert.equal(jobs(g, 'illidan_parasite').length, 0); assert.equal(jobs(g, 'illidan_eye').length, 0);
});

test('normal and red skin execute identical source rules', () => {
  const outcomes = [];
  for (const raw of ['h0SY', 'h0VW']) { const { g } = fixture(), e = g.illidan(['A1BA', 'A1BE'], {}, raw), t = g.add([], 'enemy', 'monster', 1); g.cast(e, 'A1BA', { target: t }); g.cast(e, 'A1BE'); g.tick(12); outcomes.push({ hp: t.hp, mana: e.mana, summons: g.state.entities.filter(n => n.combatRawcode === 'n06W').length }); }
  assert.deepEqual(outcomes[0], outcomes[1]);
});

test('disabled shared native spell-effect trigger still debits costs but suppresses Illidan JASS body', () => {
  const { g } = fixture(), e = g.illidan(['A1BB', 'A1BE', 'A1BF']); g._sourceAbilityEffectDepth = 1;
  const result = g.cast(e, 'A1BB'); assert.equal(result.ok, true); assert.equal(result.scriptSuppressed, true); near(e.mana, 82);
  assert.equal(e.skillStates.A1BB.casts, 1); assert.equal(e.skillStates.A1BB.readyAt, 30); assert.equal(e.status.illidanAlternateDepth, undefined); assert.equal(e.status.illidanPaused, undefined); assert.equal(g.state.sourceSkillJobs.length, 0); assert.equal(g._sourceAbilityEffectDepth, 1);
});

test('nested native casts share the spell-effect guard across source calls and cannot add eye jobs', () => {
  const { g, api } = fixture(), e = g.illidan(['A1BE', 'A1BF']), original = api.spawnUnit; let nested;
  api.spawnUnit = (...args) => { nested ??= g.cast(e, 'A1BF', { point: { x: 1, y: 0 } }); return original(...args); };
  assert.equal(g.cast(e, 'A1BE').ok, true); assert.equal(nested.scriptSuppressed, true); near(e.mana, 82);
  assert.equal(e.skillStates.A1BF.casts, 1); assert.equal(jobs(g, 'illidan_eye').length, 0); assert.equal(g.state.entities.filter(n => n.combatRawcode === 'n06W').length, 2); assert.equal(g._sourceAbilityEffectDepth, 0);
});

test('spell-effect depth is released if a host effect throws', () => {
  const { g, api } = fixture(), e = g.illidan(['A1BE']); api.spawnUnit = () => { throw new Error('fixture spawn failure'); };
  assert.throws(() => g.cast(e, 'A1BE'), /fixture spawn failure/); assert.equal(g._sourceAbilityEffectDepth, 0); near(e.mana, 95);
});

test('native group enumeration includes a hostile king and deduplicates handles present in both host lists', () => {
  const { g } = fixture(), e = g.illidan(['A1BA']), king = g.add([], 'king', 'monster', 1, 0, { isKing: true });
  g.state.entities = g.state.entities.filter(t => t !== king); g.state.kings = [king];
  assert.equal(g.cast(e, 'A1BA', { target: king }).ok, true); g.tick(0); near(king.hp, 9925);
  g.state.entities.push(king); g.tick(1); near(king.hp, 9850);
});

test('Illidan death processing preserves every foreign timer and its complete source snapshot', () => {
  const { g, api } = fixture(), dead = g.add(['A1B7'], 'h2YS'), target = g.add();
  const foreign = ['target_pulses', 'alchemist_acid_target', 'ysera_mind_disrupt', 'naga_active_charge', 'garrosh_active_axe', 'garrosh_bleed', 'illidan_future'].map((type, index) => ({
    type, sourceId: dead.id, targetId: dead.id, source: { id: dead.id, combatRawcode: 'h2YS', mana: 45, maxMana: 90, skillStates: { A1B7: { readyAt: 17, casts: 2 } }, skillSpecs: [{ id: 'A1B7', status: 'implemented' }], familySentinel: index }, nextAt: index + 1,
  }));
  const sourceReferences = foreign.map(job => job.source), before = JSON.parse(JSON.stringify(foreign));
  const own = { type: 'illidan_parasite', sourceId: dead.id, source: { sentinel: 'replace only my own snapshot' }, targetId: target.id, targetPoint: { x: 0, y: 0 }, nextAt: 0, count: 0 };
  g.state.sourceSkillJobs.push(...foreign, own); g.kill(dead);
  assert.deepEqual(foreign, before);
  for (let i = 0; i < foreign.length; i++) assert.equal(foreign[i].source, sourceReferences[i], `${foreign[i].type} must retain the source snapshot owned by its handler`);
  assert.equal(own.source.id, dead.id); assert.equal(own.source.hp, 0); assert.equal(own.source.sentinel, undefined);
  assert.equal(tickIllidanJob(g, own, api), true); near(target.hp, 9980, 'an ordinary dead Illidan source still retains its own parasite tick');
});
