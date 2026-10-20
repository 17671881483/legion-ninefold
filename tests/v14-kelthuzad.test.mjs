import test from 'node:test';
import assert from 'node:assert/strict';
import { V14_ABILITIES, V14_UNIT_TEMPLATES } from '../dist/v14-reference.js';
import { KELTHUZAD_RULES, KELTHUZAD_ACTIVE_RULES, KELTHUZAD_REINCARNATION_DESCRIPTOR, isKelthuzadJobType, canKelthuzadCastAbility, registerKelthuzadSource, applyKelthuzadBuildingAlliance, kelthuzadEggWhiteAlliance, kelthuzadBeforeDamage, kelthuzadOnAttackDamage, castKelthuzadAbility, tryKelthuzadAutoCast, kelthuzadNativeSpellEffect, sourceKelthuzadDeath, tickKelthuzadJob } from '../dist/kelthuzad-rules.js';

const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-7, `${a} != ${b}`);
const has = (e, id) => e.skillSpecs.some(s => s.id === id);
const jobs = (g, type) => g.state.sourceSkillJobs.filter(j => j.type === type && !j.done);
function fixture() {
  let seq = 0;
  const g = {
    state: { time: 0, entities: [], kings: [], players: [{ id: 0, buildings: [] }], sourceSkillJobs: [] }, hits: [], pauses: [], stuns: [], moves: [], nativeHits: [], compiled: [],
    add(ids = [], code = 'enemy', side = 'monster', x = 0, y = 0, extra = {}) {
      const e = { id: ++seq, createdAt: this.state.time, combatRawcode: code, skillSpecs: ids.map(id => ({ id })), skillStates: {}, status: {}, hp: 10000, maxHp: 10000, mana: 100, maxMana: 100, damage: 349, distanceScale: 1, worldX: x, worldY: y, facing: 0, team: side === 'monster' ? 1 : 0, ownerId: side === 'monster' ? null : 0, side, battleTeam: 0, traits: [], buffs: [], ...extra };
      this.state.entities.push(e); return e;
    },
    lich(ids = V14_UNIT_TEMPLATES.h0PI.abilityIds, extra = {}, code = 'h0PI') { const e = this.add(ids, code, 'defender', 0, 0, extra); registerKelthuzadSource(this, e, api); return e; },
    cast(e, id, params = {}) { return castKelthuzadAbility(this, e, id, params, api); },
    before(e, amount, attacker = null) { return kelthuzadBeforeDamage(this, e, amount, attacker, api); },
    attack(e, target, amount = 100) { return kelthuzadOnAttackDamage(this, e, target, amount, api); },
    tick(time) { this.state.time = time; const pending = this.state.sourceSkillJobs, remaining = []; for (const j of pending) if (tickKelthuzadJob(this, j, api)) remaining.push(j); this.state.sourceSkillJobs = remaining; },
    kill(e, killer = null) { e.hp = 0; sourceKelthuzadDeath(this, e, killer, api); },
  };
  const api = {
    scriptInvulnerable: e => !!e.invulnerable || has(e, 'Avul'),
    universalDamage(game, target, amount, source) { if (target.hp <= .405 || this.scriptInvulnerable(target)) return 0; game.hits.push({ id: target.id, sourceId: source.id, amount, at: game._kelthuzadEventAt ?? game.state.time }); target.hp -= amount; if (target.hp <= .405) sourceKelthuzadDeath(game, target, source, api); return amount; },
    nativeDamage(game, target, amount, source, types) { game.nativeHits.push({ targetId: target.id, sourceId: source.id, amount, ...types }); target.hp -= amount; },
    addAbility(game, e, id) { e.skillSpecs.push({ id, status: KELTHUZAD_RULES[id]?.status ?? 'implemented' }); game.compiled.push({ entityId: e.id, id }); },
    applyAttackLevel(game, e, id, before, after) { if (Number.isFinite(e.damage)) e.damage += Number(V14_ABILITIES[id].resolved_fields.DataA1) * (after - before); },
    spawnUnit(game, source, code, extra) { const d = V14_UNIT_TEMPLATES[code]; return game.add(d.abilityIds, code, source.side, source.worldX, source.worldY, { ownerId: source.ownerId, team: source.team, battleTeam: source.battleTeam, hp: d.hp, maxHp: d.hp, damage: d.damage, mana: d.manaStart, maxMana: d.mana, traits: d.unitType.split(','), ...extra }); },
    pauseUnit(game, e, value) { e.status.sourcePaused = value; game.pauses.push({ id: e.id, value }); },
    setUnitPosition(game, e, point) { e.worldX = point.x; e.worldY = point.y; game.moves.push({ id: e.id, ...point }); },
    vertigoTarget(game, source, target, level) { game.stuns.push({ sourceId: source.id, targetId: target.id, level, at: game._kelthuzadEventAt ?? game.state.time }); },
  };
  return { g, api };
}

test('metadata records object costs and the precise native boundary rather than tooltip guesses', () => {
  assert.deepEqual(Object.keys(KELTHUZAD_ACTIVE_RULES), ['A0ZZ']);
  for (const r of Object.values(KELTHUZAD_RULES)) { assert.ok(r.sourceLines); assert.ok(r.description); if (r.status === 'partial') assert.ok(r.partial); }
  const z = KELTHUZAD_ACTIVE_RULES.A0ZZ; assert.equal(z.manaCost, 7); assert.equal(z.cooldown, 1); assert.equal(z.range, 800); assert.equal(z.targetKind, 'enemy'); assert.equal(z.cooldownPolicy, 'shared_native');
  assert.equal(KELTHUZAD_REINCARNATION_DESCRIPTOR.dataA, .01); assert.equal(KELTHUZAD_REINCARNATION_DESCRIPTOR.castTime, 1); assert.equal(KELTHUZAD_REINCARNATION_DESCRIPTOR.cooldown, 3600); assert.equal(KELTHUZAD_REINCARNATION_DESCRIPTOR.baseFields.DataA1, '7.0');
  assert.equal(KELTHUZAD_RULES.A0ZS.preserveNativeKind, true); assert.equal(KELTHUZAD_RULES.A0ZV.preserveNativeKind, true); assert.equal(KELTHUZAD_RULES.A0ZO.nativeOrderOnly, true);
  assert.match(KELTHUZAD_RULES.A0ZP.description, /没有额外30%攻速/); assert.equal(isKelthuzadJobType('target_pulses'), false);
});

test('only actual combat clones register, respect empty mirrors, and use createdAt', () => {
  const { g, api } = fixture(); g.state.time = 9;
  const e = g.lich(['A0ZN', 'A0ZR', 'A0ZQ'], { createdAt: 2, mana: 0 }); assert.equal(e.status.kelthuzadRegisteredAt, 9); near(e.mana, 100); assert.equal(jobs(g, 'kelthuzad_decay')[0].nextAt, 10);
  assert.equal(has(e, 'A0ZS'), true); assert.equal(has(e, 'A0ZU'), true); assert.equal(registerKelthuzadSource(g, e, api), false);
  assert.equal(g.lich([], { isIllusion: true }).status.kelthuzadRegistered, undefined);
  assert.equal(g.lich(['A0ZQ'], {}, 'h0PJ').status.kelthuzadRegistered, undefined); assert.equal(canKelthuzadCastAbility(g.lich(['A0ZZ'], {}, 'h0TC'), 'A0ZZ'), false);
});

test('all three combat skins register the same source rules', () => {
  for (const code of ['h0PI', 'h0TD', 'h0WT']) { const { g } = fixture(), e = g.lich(undefined, { mana: 0 }, code); near(e.mana, 100); assert.equal(e.status.kelthuzadAmuletCharges, 1); assert.equal(has(e, 'A0ZS'), true); }
});

test('death aura starts at one second, follows current position and is lethal', () => {
  const { g } = fixture(), e = g.lich(['A0ZN']), a = g.add([], 'a', 'monster', 6.9, 0, { hp: 20, maxHp: 1000 }), b = g.add([], 'b', 'monster', 14.1);
  g.tick(.999); near(a.hp, 20); g.tick(1); assert.ok(a.hp <= 0); near(b.hp, 10000);
  e.worldX = 8; g.tick(3); near(b.hp, 9500); assert.deepEqual(g.hits.filter(h => h.id === b.id).map(h => h.at), [2, 3]);
});

test('death aura cancels when its source dies or loses the actual ability', () => {
  for (const mode of ['death', 'removed']) { const { g } = fixture(), e = g.lich(['A0ZN']), t = g.add(); if (mode === 'death') g.kill(e); else e.skillSpecs = []; g.tick(2); near(t.hp, 10000); assert.equal(jobs(g, 'kelthuzad_decay').length, 0); }
});

test('amulet source triggers at equal lethal event damage, summons exact native units, and does not fake native revival', () => {
  const { g } = fixture(), e = g.lich(['A0ZQ'], { mana: 23 }); e.skillStates.A0ZZ = { readyAt: 9, casts: 2 }; e.hp = 100;
  assert.equal(g.before(e, 99).triggered, false); const r = g.before(e, 100);
  assert.equal(r.triggered, true); assert.equal(r.remainingCharges, 0); assert.equal(r.nativeBridgeAvailable, false); assert.equal(r.descriptor.dataA, .01); assert.equal(r.descriptor.preDamageHp, 100);
  near(e.hp, 100); near(e.mana, 23); assert.equal(e.skillStates.A0ZZ.readyAt, 9); assert.equal(e.status.kelthuzadAmuletListening, false);
  const summoned = g.state.entities.filter(t => r.summons.includes(t.id)); assert.deepEqual(summoned.map(t => t.combatRawcode), ['h0CZ', 'h0CL', 'h0CL']);
  assert.deepEqual(summoned.map(t => t.hp), [1770, 610, 610]); assert.ok(summoned.every(t => t.isSummon && !t.expiresAt));
  g.tick(1.009); assert.equal(has(e, 'A0ZU'), true); g.tick(1.01); assert.equal(has(e, 'A0ZU'), false); assert.equal(g.before(e, 100).triggered, false);
});

test('amulet rejects non-positive life and delegates native AOre only through the explicit host bridge', () => {
  const { g, api } = fixture(), e = g.lich(['A0ZQ']); let descriptor; api.nativeReincarnation = (game, source, d) => { descriptor = d; return { pending: true }; };
  e.hp = 0; assert.equal(g.before(e, 10000).triggered, false); e.hp = 100;
  const result = g.before(e, 100); assert.equal(result.nativeBridgeAvailable, true); assert.deepEqual(result.nativeResult, { pending: true }); assert.equal(descriptor.abilityId, 'A0ZU'); near(e.hp, 100); near(e.mana, 100);
});

test('alliance counts exact original-player h0M0/n02S including retained corpses and grants no attack speed', () => {
  const { g } = fixture(), king = g.add([], 'h0M0', 'defender', 0, 0, { hp: 0, damage: 221.5 }), wrongOwner = g.add([], 'n02S', 'defender', 0, 0, { ownerId: 1 }), wrongType = g.add([], 'h0M1', 'defender');
  const e = g.lich(['A0ZQ']); assert.equal(e.status.kelthuzadAmuletCharges, 2); assert.equal(has(e, 'A0ZY'), true);
  for (const id of ['A0ZV', 'A0ZW', 'A0ZY']) assert.equal(has(king, id), true); near(king.damage, 321.5); assert.equal(king.buffs.length, 0); assert.equal(has(wrongOwner, 'A0ZW'), false); assert.equal(has(wrongType, 'A0ZW'), false);
  const second = g.lich(['A0ZQ']); assert.equal(second.status.kelthuzadAmuletCharges, 2); near(king.damage, 321.5);
  e.hp = 10; assert.equal(g.before(e, 10).remainingCharges, 1); assert.equal(e.status.kelthuzadAmuletListening, true); assert.equal(jobs(g, 'kelthuzad_remove_ability').length, 0);
  assert.equal(g.before(e, 10).remainingCharges, 0); assert.equal(g.state.entities.filter(t => ['h0CZ', 'h0CL'].includes(t.combatRawcode)).length, 6);
});

test('owned-unit bridge and building marker copy preserve the original handles and apply flat attack only once', () => {
  const { g, api } = fixture(), b = { id: 'arthas-building', combatRawcode: 'n02S', skillSpecs: [], status: {} }; g.state.players[0].buildings.push(b);
  api.getOwnedUnitsOfRawcode = (game, e, code) => code === 'n02S' ? [b] : [];
  g.lich(['A0ZQ']); assert.equal(has(b, 'A0ZY'), true); assert.equal(b.damage, undefined);
  const arthas = g.add([], 'h0M0', 'defender', 0, 0, { damage: 221.5 }); assert.equal(applyKelthuzadBuildingAlliance(g, arthas, b, api), true); near(arthas.damage, 321.5); assert.equal(has(arthas, 'A0ZY'), false);
  applyKelthuzadBuildingAlliance(g, arthas, b, api); near(arthas.damage, 321.5);
  const lich = g.lich(['A0ZQ']); assert.equal(applyKelthuzadBuildingAlliance(g, lich, b, api), false);
});

test('EggWhiteEx alliance award keeps its exact h0M0 plus h0PJ condition rather than broadening skin aliases', () => {
  const { g, api } = fixture(), arthas = g.add([], 'h0M0', 'defender', 0, 0, { damage: 221.5 });
  g.add([], 'h0TC', 'defender'); assert.equal(kelthuzadEggWhiteAlliance(g, arthas, api), false);
  g.add([], 'h0PJ', 'defender'); assert.equal(kelthuzadEggWhiteAlliance(g, arthas, api), true); near(arthas.damage, 321.5); assert.equal(has(arthas, 'A0ZY'), true);
  kelthuzadEggWhiteAlliance(g, arthas, api); near(arthas.damage, 321.5); assert.equal(kelthuzadEggWhiteAlliance(g, g.add([], 'n02S', 'defender'), api), false);
});

test('chain preparation is consumed even with no second target, then rearmed at exactly three seconds', () => {
  const { g } = fixture(), e = g.lich(['A0ZR']), main = g.add();
  assert.equal(g.attack(e, main).triggered, true); assert.equal(has(e, 'A0ZS'), false); assert.equal(g.attack(e, main), false);
  g.tick(2.999); assert.equal(has(e, 'A0ZS'), false); g.tick(3); assert.equal(has(e, 'A0ZS'), true);
});

test('chains choose the first group enemy 100 to 500 from the primary, not a random unit near the caster', () => {
  const { g } = fixture(), e = g.lich(['A0ZR']), main = g.add([], 'primary', 'monster', 10), nearPrimary = g.add([], 'too-near', 'monster', 10.9), inv = g.add(['Avul'], 'inv', 'monster', 12), first = g.add([], 'first', 'monster', 14), later = g.add([], 'later', 'monster', 12), far = g.add([], 'far', 'monster', 15.1);
  const r = g.attack(e, main, 123); assert.equal(r.secondaryId, first.id); near(first.hp, 9877); for (const t of [main, nearPrimary, inv, later, far]) near(t.hp, 10000);
});

test('each chain pulls 60 per .04 seconds and releases within 100 of the fixed midpoint with asymmetric native stuns', () => {
  const { g } = fixture(), e = g.lich(['A0ZR']), main = g.add([], 'primary', 'monster', 0), secondary = g.add([], 'second', 'monster', 4);
  g.attack(e, main, 150); assert.equal(main.status.sourcePaused, true); assert.equal(secondary.status.sourcePaused, true);
  g.tick(.039); near(main.worldX, 0); near(secondary.worldX, 4); g.tick(.04); near(main.worldX, .6); near(secondary.worldX, 3.4);
  g.tick(.08); near(main.worldX, 1.2); near(secondary.worldX, 2.8); g.tick(.12); near(main.hp, 9700); near(secondary.hp, 9550); assert.equal(main.status.sourcePaused, false); assert.equal(secondary.status.sourcePaused, false);
  assert.deepEqual(g.stuns.map(s => [s.targetId, s.at]), [[secondary.id, .04], [secondary.id, .08], [main.id, .12]]); assert.ok(g.stuns.every(s => s.level === 3)); assert.equal(jobs(g, 'kelthuzad_chain_pull').length, 0);
});

test('the pull keeps its original midpoint when caster or targets move', () => {
  const { g } = fixture(), e = g.lich(['A0ZR']), main = g.add([], 'primary', 'monster', 0), secondary = g.add([], 'second', 'monster', 4);
  g.attack(e, main); e.worldX = 100; main.worldY = 3; g.tick(.04);
  const job = jobs(g, 'kelthuzad_chain_pull')[0]; assert.deepEqual(job.center, { x: 2, y: 0 }); assert.ok(main.worldY < 3); assert.ok(secondary.worldX < 4);
});

test('a target death releases only its own chain side, while caster death does not cancel an established pull', () => {
  const { g } = fixture(), e = g.lich(['A0ZR']), main = g.add([], 'primary', 'monster', 0), secondary = g.add([], 'second', 'monster', 4);
  g.attack(e, main); g.kill(main); assert.equal(main.status.sourcePaused, false); assert.equal(secondary.status.sourcePaused, true); g.kill(e); assert.equal(has(e, 'A0ZS'), false);
  g.tick(.12); near(secondary.hp, 9600); assert.equal(secondary.status.sourcePaused, false); assert.equal(jobs(g, 'kelthuzad_chain_rearm').length, 0);
});

test('secondary killed by the copied event was dead before the pull death listener existed', () => {
  const { g } = fixture(), e = g.lich(['A0ZR']), main = g.add([], 'primary', 'monster', 0), secondary = g.add([], 'second', 'monster', 4, 0, { hp: 50 });
  g.attack(e, main, 100); assert.ok(secondary.hp <= 0); assert.equal(secondary.status.sourcePaused, true); g.tick(.12);
  assert.equal(secondary.status.sourcePaused, false); near(main.hp, 9700); assert.equal(jobs(g, 'kelthuzad_chain_pull').length, 0);
});

test('blocked map position does not invent a timeout for a source pull that remains outside the arrival radius', () => {
  const { g, api } = fixture(), e = g.lich(['A0ZR']), main = g.add([], 'primary', 'monster', 0), secondary = g.add([], 'second', 'monster', 4);
  api.setUnitPosition = () => {}; g.attack(e, main); g.tick(5); assert.equal(jobs(g, 'kelthuzad_chain_pull').length, 1); assert.equal(main.status.sourcePaused, true); assert.equal(secondary.status.sourcePaused, true); near(main.hp, 10000);
});

test('shadow crack uses target maximum HP at t3 and distinguishes native heroes from bosses and hero UI', () => {
  for (const [extra, fraction] of [[{ isNativeHero: true }, .3], [{ isBoss: true, isNativeHero: false }, .8], [{ isHero: true, isNativeHero: false }, .8]]) {
    const { g } = fixture(), e = g.lich(['A0ZZ']), t = g.add([], 'target', 'monster', 1, 0, extra); g.cast(e, 'A0ZZ', { target: t }); g.tick(2.999); near(t.hp, 10000); t.maxHp = 2000; g.tick(3); near(t.hp, 10000 - 2000 * fraction);
  }
});

test('shadow crack follows the same target handle, survives caster death, and cancels if target dies first', () => {
  const { g } = fixture(), e = g.lich(['A0ZZ']), t = g.add([], 'target', 'monster', 1), second = g.add([], 'cancelled', 'monster', 2);
  g.cast(e, 'A0ZZ', { target: t }); g.state.time = 1; g.cast(e, 'A0ZZ', { target: second }); g.kill(second); t.worldX = 100; g.kill(e); g.tick(4); near(t.hp, 2000); assert.equal(g.hits.some(h => h.id === second.id), false);
});

test('multiple shadow cracks on one target are independent rather than refreshed', () => {
  const { g } = fixture(), e = g.lich(['A0ZZ']), t = g.add([], 'target', 'monster', 1, 0, { hp: 100000 });
  g.cast(e, 'A0ZZ', { target: t }); g.state.time = 1; g.cast(e, 'A0ZZ', { target: t }); assert.equal(jobs(g, 'kelthuzad_shadow_crack').length, 2); g.tick(4); near(t.hp, 84000);
});

test('native shadow cooldown is shared by manual and attack auto paths with attacker presence priority', () => {
  const { g, api } = fixture(), attacker = g.lich(['A0ZZ']), victim = g.lich(['A0ZZ'], { side: 'monster', team: 1 });
  assert.equal(g.cast(attacker, 'A0ZZ', { target: victim }).ok, true); near(attacker.mana, 93);
  const result = tryKelthuzadAutoCast(g, attacker, victim, api); assert.equal(result[0].sourceId, attacker.id); assert.equal(result[0].ok, false); near(victim.mana, 100);
  g.state.time = 1; assert.equal(tryKelthuzadAutoCast(g, attacker, victim, api)[0].ok, true); near(attacker.mana, 86);
  attacker.mana = 0; g.state.time = 2; assert.equal(tryKelthuzadAutoCast(g, attacker, victim, api)[0].ok, false); near(victim.mana, 100);
});

test('native auto orders issue frost nova then shadow crack and both prefer the attacker', () => {
  const { g, api } = fixture(), attacker = g.lich(['A0ZO', 'A0ZZ']), victim = g.lich(['A0ZO', 'A0ZZ'], { side: 'monster', team: 1 }), calls = [];
  api.castNativeNova = (game, e, id, target, params) => { calls.push([id, e.id, target.id, params.mode]); return { ok: false }; };
  api.issueNativeOrder = (game, e, id, params) => { calls.push([id, e.id, params.target.id, params.mode]); return { ok: false }; };
  assert.equal(tryKelthuzadAutoCast(g, attacker, victim, api).length, 2); assert.deepEqual(calls, [['A0ZO', attacker.id, victim.id, 'auto'], ['A0ZZ', attacker.id, victim.id, 'auto']]);
  attacker.skillSpecs = []; tryKelthuzadAutoCast(g, attacker, victim, api); assert.deepEqual(calls.slice(2), [['A0ZO', victim.id, attacker.id, 'auto'], ['A0ZZ', victim.id, attacker.id, 'auto']]);
});

test('manual native nova delegates costs and targets to the explicit host, never runs a second source nova', () => {
  const { g, api } = fixture(), e = g.lich(['A0ZO']), t = g.add(); let call;
  api.castNativeNova = (game, source, id, target, params) => { call = { id, targetId: target.id, ...params }; return { ok: true, skillId: id }; };
  assert.equal(g.cast(e, 'A0ZO', { target: t }).ok, true); assert.deepEqual(call, { id: 'A0ZO', targetId: t.id, mode: 'manual' }); near(e.mana, 100); assert.equal(g.state.sourceSkillJobs.length, 0);
});

test('native nova source hook adds 200 self damage with the actual native types and respects shared spell-effect depth', () => {
  const { g, api } = fixture(), e = g.lich(['A0ZO']); assert.equal(kelthuzadNativeSpellEffect(g, e, 'other', api), false);
  kelthuzadNativeSpellEffect(g, e, 'A0ZO', api); near(e.hp, 9800); assert.deepEqual(g.nativeHits[0], { targetId: e.id, sourceId: e.id, amount: 200, attackType: 'spells', damageType: 'normal' });
  g._sourceAbilityEffectDepth = 1; assert.equal(kelthuzadNativeSpellEffect(g, e, 'A0ZO', api).scriptSuppressed, true); near(e.hp, 9800); assert.equal(g._sourceAbilityEffectDepth, 1);
});

test('shadow cast validates resources/targets before payment and suppresses only script body in a disabled effect trigger', () => {
  const { g } = fixture(), e = g.lich(['A0ZZ']), t = g.add([], 'target', 'monster', 8.01), ally = g.add([], 'ally', 'defender');
  assert.equal(g.cast(e, 'A0ZZ', { target: t }).ok, false); assert.equal(g.cast(e, 'A0ZZ', { target: ally }).ok, false); near(e.mana, 100);
  t.worldX = 1; g._sourceAbilityEffectDepth = 1; const result = g.cast(e, 'A0ZZ', { target: t }); assert.equal(result.ok, true); assert.equal(result.scriptSuppressed, true); near(e.mana, 93); assert.equal(e.skillStates.A0ZZ.readyAt, 1); assert.equal(g.state.sourceSkillJobs.length, 0);
});

test('native nova still executes at shared depth, while its source self-damage hook is suppressed', () => {
  const { g, api } = fixture(), e = g.lich(['A0ZO']), t = g.add(); let count = 0;
  api.castNativeNova = (game, source) => { count++; kelthuzadNativeSpellEffect(game, source, 'A0ZO', api); return { ok: true }; };
  g._sourceAbilityEffectDepth = 1; tryKelthuzadAutoCast(g, e, t, api); assert.equal(count, 1); near(e.hp, 10000); assert.equal(g._sourceAbilityEffectDepth, 1);
});

test('JSON restore preserves active pulls, cooldowns, delayed damage and helper removal jobs', () => {
  const { g } = fixture(), e = g.lich(['A0ZR', 'A0ZQ', 'A0ZZ']), main = g.add([], 'primary', 'monster', 0), secondary = g.add([], 'secondary', 'monster', 4);
  g.attack(e, main, 100); g.cast(e, 'A0ZZ', { target: secondary }); e.hp = 10; g.before(e, 10);
  g.state = JSON.parse(JSON.stringify(g.state)); g.tick(.12);
  const restored = g.state.entities.find(t => t.id === e.id); assert.equal(restored.skillStates.A0ZZ.readyAt, 1); assert.equal(g.state.entities.find(t => t.id === main.id).status.sourcePaused, false);
  g.tick(1.01); assert.equal(has(restored, 'A0ZU'), false); g.tick(3); near(g.state.entities.find(t => t.id === secondary.id).hp, 1600); assert.equal(has(restored, 'A0ZS'), true);
});

test('Kel death hooks retain full own caster state and never touch foreign-family jobs or unknown prefixes', () => {
  const { g, api } = fixture(), e = g.lich(['A0ZZ']), t = g.add(); e.mana = 45; e.skillStates.A0ZZ = { readyAt: 12, casts: 4 };
  const foreign = ['target_pulses', 'illidan_parasite', 'ysera_mind_disrupt', 'alchemist_mist', 'garrosh_active_axe', 'naga_active_charge', 'kelthuzad_unknown'].map(type => ({ type, sourceId: e.id, targetId: e.id, source: { mana: 45, skillStates: { A0ZZ: { casts: 4 } } } }));
  const before = JSON.parse(JSON.stringify(foreign)), references = foreign.map(j => j.source);
  const own = { type: 'kelthuzad_shadow_crack', sourceId: e.id, source: {}, targetId: t.id, at: 3 }; g.state.sourceSkillJobs.push(...foreign, own); g.kill(e);
  assert.deepEqual(foreign, before); for (let i = 0; i < foreign.length; i++) assert.equal(foreign[i].source, references[i]); near(own.source.mana, 45); assert.equal(own.source.skillStates.A0ZZ.casts, 4);
  g.state.time = 3; assert.equal(tickKelthuzadJob(g, own, api), false); near(t.hp, 2000);
});

test('late first registration starts timers now rather than applying historical aura damage', () => {
  const { g } = fixture(); g.state.time = 100; const target = g.add(), e = g.lich(['A0ZN'], { createdAt: 2 });
  assert.equal(e.status.kelthuzadRegisteredAt, 100); assert.equal(jobs(g, 'kelthuzad_decay')[0].nextAt, 101); g.tick(100); near(target.hp, 10000); g.tick(101); near(target.hp, 9750);
  const future = g.lich(['A0ZN'], { createdAt: 105 }); assert.equal(future.status.kelthuzadRegisteredAt, 105);
});

test('migration registration preserves existing mana while a newly born source clone gets its source deployment mana', () => {
  const { g } = fixture(); g.state.time = 100;
  const old = g.lich(['A0ZN'], { createdAt: 2, mana: 17, status: { sourceSkillsRestoredAt: 100 } }), fresh = g.lich(['A0ZN'], { createdAt: 100, mana: 0 });
  near(old.mana, 17); near(fresh.mana, fresh.maxMana); assert.equal(jobs(g, 'kelthuzad_decay').length, 2);
});

test('cycloned shadow casters reject manual and auto native orders without paying resources', () => {
  const { g, api } = fixture(), e = g.lich(['A0ZZ'], { status: { cycloneUntil: 1 } }), target = g.add();
  assert.equal(g.cast(e, 'A0ZZ', { target }).ok, false); assert.equal(tryKelthuzadAutoCast(g, e, target, api)[0].ok, false); near(e.mana, 100);
  g.state.time = 1; assert.equal(g.cast(e, 'A0ZZ', { target }).ok, true); near(e.mana, 93);
});
