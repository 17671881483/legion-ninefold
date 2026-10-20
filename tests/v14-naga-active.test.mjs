import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Game } from '../dist/engine.js';
import { UNIT_TEMPLATES } from '../dist/data.js';
import { V14_ABILITIES } from '../dist/v14-reference.js';
import { compileSkills, sourceAuraEffects } from '../dist/skills.js';
import { NAGA_ACTIVE_RULES, isNagaActiveAbility, initializeNagaUnit, nagaBeforeDamage, nagaIncomingDamage, nagaOnHit,
  tickNagaUnit, castNagaAbility, tickNagaJob, sourceNagaDeath } from '../dist/naga-active-rules.js';

function fixture(code = 'h0UE') {
  const game = new Game({ mode: 'sandbox', seed: 42 }); game.state.phase = 'combat'; game.state.time = 10;
  const actor = game._entity(UNIT_TEMPLATES[code], { ownerId: 0, team: 0, side: 'defender', battleTeam: 0, sourceLaneId: 0, laneId: 0, worldX: 10, worldY: 10 });
  actor.mana = 100; game.state.entities = [actor]; game.state.sourceSkillJobs = [];
  const hits = [], summons = [];
  const api = {
    universalDamage(g, target, amount, source) {
      hits.push({ targetId: target.id, amount, sourceId: source.id }); target.hp -= amount;
      if (target.hp <= 0 && !target.status.deathCounted) { target.status.deathCounted = true; sourceNagaDeath(g, target, source, api); }
    },
    spawnUnit(g, source, rawcode, extra = {}) {
      const entity = g._entity(UNIT_TEMPLATES[rawcode], { ownerId: source.ownerId, team: source.team, side: source.side, battleTeam: source.battleTeam,
        sourceLaneId: source.sourceLaneId, laneId: source.laneId, worldX: source.worldX, worldY: source.worldY, ...extra });
      g.state.entities.push(entity); summons.push(entity); initializeNagaUnit(g, entity, api); return entity;
    },
    addAbility(g, entity, id) {
      if (!entity.skillSpecs.some(s => s.id === id)) entity.skillSpecs.push(...compileSkills({ provenance: 'v14.1A5-dataset', abilityIds: [id], distanceScale: entity.distanceScale }));
    },
  };
  api.nativeDamage = (g, target, amount, source, options) => {
    api.universalDamage(g, target, amount, source);
    hits.at(-1).nativeOptions = options;
  };
  const add = (team = 1, x = 10.5, hp = 1000, extra = {}) => {
    const entity = { id: game._uid('test'), ownerId: team === 0 ? 0 : null, team, side: team === 0 ? 'defender' : 'monster', battleTeam: 0,
      worldX: x, worldY: 10, hp, maxHp: 1000, damage: 100, buffs: [], skillSpecs: [], status: {}, ...extra };
    game.state.entities.push(entity); return entity;
  };
  const tick = time => {
    game.state.time = time; const remaining = [];
    for (const job of game.state.sourceSkillJobs) if (tickNagaJob(game, job, api)) remaining.push(job);
    game.state.sourceSkillJobs = remaining;
  };
  initializeNagaUnit(game, actor, api);
  return { game, actor, api, add, tick, hits, summons };
}

test('registry marks only the closed source unit skills as implemented and uses shared native cooldowns', () => {
  assert.equal(Object.keys(NAGA_ACTIVE_RULES).length, 13);
  for (const [id, rule] of Object.entries(NAGA_ACTIVE_RULES)) {
    assert.equal(rule.status, ['A1DR','A1CS','A1CT','A1CU','A1D7','A1D8','A1DD','A1DQ'].includes(id) ? 'partial' : 'implemented'); assert.ok(rule.description); assert.ok(rule.effectText);
    assert.equal(isNagaActiveAbility(id), rule.active);
    if (rule.active) assert.equal(rule.cooldownMode, 'shared_native');
  }
  for (const id of ['A2Y0', 'A1DC', 'A1DO']) assert.equal(NAGA_ACTIVE_RULES[id], undefined);
});

test('war cry triggers once on enemy damage rather than at deployment and injects the actual 3% lifesteal ability', () => {
  const { game, actor, api, add, summons } = fixture(), enemy = add();
  assert.equal(summons.length, 0);
  nagaBeforeDamage(game, actor, 0, enemy, api); assert.equal(summons.length, 0);
  nagaBeforeDamage(game, actor, 20, enemy, api);
  assert.equal(summons.length, 3); assert.ok(summons.every(e => e.combatRawcode === 'h0UD' && e.isSummon));
  for (const summoned of summons) assert.ok(summoned.skillSpecs.some(s => s.id === 'A1CP' && s.fraction === .03));
  assert.equal(actor.skillSpecs.some(s => s.id === 'A1CO'), false);
  nagaBeforeDamage(game, actor, 20, enemy, api); assert.equal(summons.length, 3);
});

test('the h2AE war-cry exception summons the same source rawcode rather than the default slave', () => {
  const { game, actor, api, add, summons } = fixture(); actor.combatRawcode = 'h2AE';
  nagaBeforeDamage(game, actor, 1, add(), api);
  assert.equal(summons.length, 3); assert.ok(summons.every(e => e.combatRawcode === 'h2AE'));
});

test('murloc raid sets life to exactly half maximum before the current damage and its summons keep their own war cries', () => {
  const { game, actor, api, add, summons } = fixture('h0UF'), enemy = add(); actor.hp = 90;
  nagaBeforeDamage(game, actor, 30, enemy, api); actor.hp -= 30;
  assert.equal(actor.hp, 470); assert.equal(summons.length, 3);
  assert.ok(summons.every(e => e.combatRawcode === 'h0UE' && e.skillSpecs.some(s => s.id === 'A1CO')));
  nagaBeforeDamage(game, summons[0], 1, enemy, api); assert.equal(summons.length, 6);
});

test('summon markers ignore allied damage and remain consumed across save/restore', () => {
  const { game, actor, api, add, summons } = fixture(); const ally = add(0);
  nagaBeforeDamage(game, actor, 1, ally, api); assert.equal(summons.length, 0);
  nagaBeforeDamage(game, actor, 1, add(), api);
  const restored = new Game({ mode: 'sandbox' }); restored.restore(game.snapshot());
  assert.equal(restored.state.entities.find(e => e.id === actor.id).skillSpecs.some(s => s.id === 'A1CO'), false);
});

test('ocean healing restores five percentage points of maximum HP and respects the source 700 radius and invulnerability filter', () => {
  const { game, actor, api, add } = fixture('h0UG');
  const near = add(0, 12.3, 400), far = add(0, 12.4, 400), invulnerable = add(0, 10.1, 400, { invulnerable: true }), enemy = add();
  assert.equal(castNagaAbility(game, actor, 'A1CT', {}, api).ok, true);
  assert.equal(near.hp, 450); assert.equal(far.hp, 400); assert.equal(invulnerable.hp, 400); assert.equal(enemy.hp, 1000);
  assert.equal(actor.mana, 90); assert.equal(actor.skillStates.A1CT.readyAt, 24);
});

test('damage orders prioritize the victim by ability ownership even if its native cast is cooling down', () => {
  const { game, actor, api } = fixture('h0UG');
  const enemy = api.spawnUnit(game, actor, 'h0UG', { team: 1, side: 'monster', worldX: 10.3 }); enemy.mana = 100;
  actor.skillStates.A1CU.readyAt = actor.skillStates.A1CT.readyAt = 100;
  nagaBeforeDamage(game, actor, 1, enemy, api);
  assert.equal(enemy.mana, 100, 'the original elseif does not fall through after a failed victim order');
});

test('tide fountain is fixed, untargetable and lasts five seconds with source-native healing and damage auras', () => {
  const { game, actor, api, add, summons } = fixture('h0UG'), ally = add(0, 10.3, 500);
  castNagaAbility(game, actor, 'A1CU', {}, api); const fountain = summons[0];
  assert.equal(fountain.combatRawcode, 'e008'); assert.equal(fountain.expiresAt, 15); assert.equal(fountain.moveSpeed, 0); assert.equal(fountain.invulnerable, true);
  const effects = sourceAuraEffects(game, ally, [fountain]); assert.equal(effects.healRate, 15); assert.equal(effects.damage, .05);
  assert.deepEqual(fountain.skillSpecs.filter(s => ['A1CV', 'A1CW'].includes(s.id)).map(s => s.id), ['A1CV', 'A1CW']);
});

test('life-mage initialization preserves the Qs/A1CU permanent spell-resistance source bug', () => {
  const { game, actor, api, add, tick } = fixture('h0UG');
  assert.equal(nagaIncomingDamage(game, actor, 100, null, { magic: true, spell: true }), 90);
  assert.equal(nagaIncomingDamage(game, actor, 100, { attackType: 'magic' }, { magic: true }), 100, 'native magic weapons do not acquire spell-resistance reduction');
  assert.equal(nagaIncomingDamage(game, actor, 100, null, { spell: true }), 100, 'physical scripted effects are not treated as magical');
  assert.equal(nagaIncomingDamage(game, actor, 100, null, { spell: true, universal: true }), 100);
  assert.equal(nagaIncomingDamage(game, actor, 100, null, { spell: true, attackType: 'spells', nativeDamageType: 'universal', universal: true }), 100,
    'ATTACK_TYPE_NORMAL/Spells plus DAMAGE_TYPE_UNIVERSAL bypasses the native magic-resistance item');
  const ally = add(0, 10.5, 1000), tideSource = add(0, 10.7, 1000); api.addAbility(game, tideSource, 'A1CF');
  tick(10); assert.equal(ally.status.nagaSpellResistance, .1);
  actor.hp = 0; tick(11); assert.equal(ally.status.nagaSpellResistance, .1, 'the source grants a permanent unit ability');
  assert.equal(game.state.sourceSkillJobs.length, 0);
});

test('native manual and damage-triggered cooldowns are shared and paused/hidden units cannot cast', () => {
  const { game, actor, api, add } = fixture('h0UG'), enemy = add();
  nagaBeforeDamage(game, actor, 1, enemy, api); assert.equal(actor.mana, 77);
  assert.equal(castNagaAbility(game, actor, 'A1CT', {}, api).ok, false);
  game.state.time = 30;
  for (const flag of ['sourcePaused', 'yseraPaused', 'yseraHidden']) {
    actor.status[flag] = true; assert.equal(castNagaAbility(game, actor, 'A1CT', {}, api).ok, false); actor.status[flag] = false;
  }
  assert.equal(castNagaAbility(game, actor, 'A1CT', {}, api).ok, true);
});

test('charge proximity fires only once at 600 source units and retains a separate repeatable manual ability', () => {
  const { game, actor, api, add } = fixture('h0UF'), enemy = add(1, 12.1);
  tickNagaUnit(game, actor, api); assert.equal(actor.status.nagaChargeProximityUsed, undefined);
  enemy.worldX = 11.5; tickNagaUnit(game, actor, api);
  assert.equal(actor.status.nagaChargeProximityUsed, true); assert.equal(game.state.sourceSkillJobs.filter(j => j.type === 'naga_active_charge').length, 1);
  game.state.time = 12; tickNagaUnit(game, actor, api); assert.equal(game.state.sourceSkillJobs.filter(j => j.type === 'naga_active_charge').length, 1);
  assert.equal(castNagaAbility(game, actor, 'A1CS', { target: enemy }, api).ok, true);
});

test('target-tracking charge moves in source 0.04-second steps and ends with one 300-radius 77 damage callback', () => {
  const { game, actor, api, add, tick, hits } = fixture('h0UF'), enemy = add(1, 11.5), nearby = add(1, 11.7);
  castNagaAbility(game, actor, 'A1CS', { target: enemy }, api);
  tick(10); assert.ok(Math.abs(actor.worldX - 10.06) < 1e-8);
  tick(10.96); assert.equal(enemy.hp, 923); assert.equal(nearby.hp, 923); assert.equal(hits.length, 2);
  assert.equal(game.state.sourceSkillJobs.length, 0); assert.ok(actor.worldX < enemy.worldX, 'the final callback precedes the final movement step');
});

test('target or caster death executes the charge finish callback immediately and cannot execute it twice', () => {
  for (const dies of ['source', 'target']) {
    const { game, actor, api, add, hits } = fixture('h0UF'), enemy = add(1, 11.5), nearby = add(1, 11.7), dead = dies === 'source' ? actor : enemy;
    castNagaAbility(game, actor, 'A1CS', { target: enemy }, api);
    dead.hp = 0; dead.status.deathCounted = true; sourceNagaDeath(game, dead, nearby, api); sourceNagaDeath(game, dead, nearby, api);
    assert.equal(nearby.hp, 923); assert.equal(hits.filter(hit => hit.targetId === nearby.id).length, 1);
  }
});

test('phantom form grants exactly five seconds damage immunity without changing its outgoing weapon or base life', () => {
  const { game, actor, api } = fixture('h0UH'); const before = [actor.hp, actor.damage, actor.attackInterval];
  assert.equal(castNagaAbility(game, actor, 'A1D7', {}, api).ok, true);
  assert.equal(nagaIncomingDamage(game, actor, 200, null, { universal: true }), 0);
  assert.deepEqual([actor.hp, actor.damage, actor.attackInterval], before);
  game.state.time = 15; assert.equal(nagaIncomingDamage(game, actor, 200, null, {}), 200);
});

test('seven phantom lines keep independent per-enemy hit groups and can each hit more than one enemy', () => {
  const { game, actor, api, add, tick, hits } = fixture('h0UH'), first = add(1, 10.8, 10000), second = add(1, 11.2, 10000);
  castNagaAbility(game, actor, 'A1D8', { point: { x: 13, y: 10 } }, api);
  assert.equal(game.state.sourceSkillJobs.length, 7); assert.equal(new Set(game.state.sourceSkillJobs.map(j => j.y)).size, 7);
  tick(10.36);
  assert.equal(hits.filter(hit => hit.targetId === first.id).length, 3); assert.equal(hits.filter(hit => hit.targetId === second.id).length, 3);
  assert.equal(first.hp, 10000 - 137 * 3); assert.equal(second.hp, 10000 - 137 * 3); assert.equal(game.state.sourceSkillJobs.length, 0);
  assert.equal(first.status.stunUntil, 11, 'timer catch-up retains the actual t=10 hit time and cannot extend control to t=11.36');
});

test('phantom charge lines survive the caster while normal charge listens to caster death', () => {
  const { game, actor, api, add, tick } = fixture('h0UH'), enemy = add(1, 10.8, 10000);
  castNagaAbility(game, actor, 'A1D8', { point: { x: 13, y: 10 } }, api);
  actor.hp = 0; actor.status.deathCounted = true; sourceNagaDeath(game, actor, enemy, api);
  game.state.entities = game.state.entities.filter(e => e.id !== actor.id); tick(10.36);
  assert.equal(enemy.hp, 10000 - 137 * 3);
});

test('shield armor is an offensive 16% hit proc based on victim attack state, not a damage reflection', () => {
  const { game, actor, api, add, hits } = fixture('h0UH'), enemy = add(); enemy.damage = 200;
  game._random = () => .16; nagaOnHit(game, actor, enemy, api);
  assert.equal(hits[0].amount, 140); assert.equal(enemy.hp, 860);
  game._random = () => .160001; nagaOnHit(game, actor, enemy, api); assert.equal(hits.length, 1);
});

test('murloc bite has its independent source 15% chance and 20 damage', () => {
  const { game, actor, api, add, hits } = fixture(), enemy = add(); api.addAbility(game, actor, 'A1CN');
  game._random = () => .15; nagaOnHit(game, actor, enemy, api); assert.equal(hits[0].amount, 20);
  game._random = () => .150001; nagaOnHit(game, actor, enemy, api); assert.equal(hits.length, 1);
});

test('serializable line hit groups, native cooldowns, marker removal and permanent resistance survive snapshots', () => {
  const { game, actor, api, add, tick } = fixture('h0UH'); add(1, 10.8, 10000);
  castNagaAbility(game, actor, 'A1D7', {}, api); castNagaAbility(game, actor, 'A1D8', { point: { x: 13, y: 10 } }, api); tick(10);
  const snapshot = game.snapshot(), restored = new Game({ mode: 'sandbox' }); restored.restore(snapshot);
  assert.deepEqual(restored.state.sourceSkillJobs, game.state.sourceSkillJobs);
  assert.deepEqual(restored.state.entities.find(e => e.id === actor.id).skillStates, actor.skillStates);
  assert.equal(restored.state.entities.find(e => e.id === actor.id).status.nagaPhantomUntil, 15);
});

test('raw source evidence confirms damage-event summons, native 3% lifesteal, seven per-line groups and victim-attack proc', () => {
  const source = readFileSync(new URL('../reference/v14-source/raw_extracted/war3map.j', import.meta.url), 'utf8');
  assert.match(source, /if GetUnitAbilityLevel\(i,\$41314351\)>0 then\s+call UnitRemoveAbility\(i,\$41314351\)\s+call SetUnitLifePercentBJ\(i,50\)/);
  assert.equal(Number(V14_ABILITIES.A1CP.resolved_fields.DataA1), .03);
  const riders = source.match(/function PhantomRiderChagreAttack takes[\s\S]*?endfunction/)[0]; assert.match(riders, /local integer y=7/); assert.match(riders, /800,\.4/);
  const riderPulse = source.match(/function PhantomRiderChagreAttackChargeBack[\s\S]*?endfunction/)[0]; assert.match(riderPulse, /if not IsUnitInGroup\(D6,Uz\)/); assert.match(riderPulse, /137,ATTACK_TYPE_CHAOS,DAMAGE_TYPE_UNIVERSAL/);
  const offensive = source.match(/function PhantomRiderArmorAtk[\s\S]*?endfunction/)[0]; assert.match(offensive, /GetUnitState\(Om,ConvertUnitState\(20\)\)\*\.7/);
  assert.match(source, /integer Qs=\$41314355/); assert.match(source, /if GetUnitAbilityLevel\(Pf,Qs\)>0 then\s+call RegisterAxisaHalo\(Bc,600\)/);
});

test('poison breath follows the source forward circle rather than the tooltip rectangle and adds no unimplemented poison', () => {
  const { game, actor, api, add, hits } = fixture('h0UJ');
  const ahead = add(1, 12.5), offAxis = add(1, 11.3, 1000, { worldY: 11.2 }), behind = add(1, 9.9);
  assert.equal(castNagaAbility(game, actor, 'A1DD', { point: { x: 11, y: 10 } }, api).ok, true);
  assert.equal(ahead.hp, 934); assert.equal(offAxis.hp, 934); assert.equal(behind.hp, 1000);
  assert.equal(hits.length, 2); assert.equal(actor.mana, 89); assert.equal(actor.skillStates.A1DD.readyAt, 10);
  assert.equal(game.state.sourceSkillJobs.length, 0); assert.equal(offAxis.buffs.length, 0);
});

test('poison breath damage orders share native mana rules and do not invent a cooldown missing from the object', () => {
  const { game, actor, api, add } = fixture('h0UJ'), enemy = add(1, 11);
  actor.mana = 12; nagaBeforeDamage(game, actor, 1, enemy, api);
  assert.equal(actor.mana, 1); assert.equal(enemy.hp, 934);
  assert.equal(castNagaAbility(game, actor, 'A1DD', { point: { x: 11, y: 10 } }, api).ok, false);
  actor.mana = 11; assert.equal(castNagaAbility(game, actor, 'A1DD', { point: { x: 11, y: 10 } }, api).ok, true);
});

test('crystal arrow uses native spell/magic damage and its own two-second hero control', () => {
  const { game, actor, api, add, hits } = fixture('h0UN'), enemy = add(1, 11, 1000, { isNativeHero: true, armor: 999 });
  api.vertigoTarget = () => { throw new Error('ANfb control must not use the hero-halving A0I7 dummy'); };
  assert.equal(castNagaAbility(game, actor, 'A1DP', { target: enemy }, api).ok, true);
  assert.equal(enemy.hp, 865); assert.equal(enemy.status.stunUntil, 12);
  assert.deepEqual(hits[0].nativeOptions, { attackType: 'spells', damageType: 'magic' });
  assert.equal(actor.mana, 90); assert.equal(actor.skillStates.A1DP.readyAt, 15);
  assert.equal(castNagaAbility(game, actor, 'A1DP', { target: enemy }, api).ok, false);
});

test('crystal arrow rejects mechanical, building, magic-immune, invulnerable and out-of-range targets before spending mana', () => {
  for (const extra of [{ traits: ['mechanical'] }, { traits: ['Mechanical'] }, { isBuilding: true }, { targetType: 'structure' },
    { skillSpecs: [{ id: 'Amim', kind: 'immunity' }] }, { invulnerable: true }, { worldX: 13 }]) {
    const { game, actor, api, add } = fixture('h0UN'), enemy = add(1, 11, 1000, extra);
    assert.equal(castNagaAbility(game, actor, 'A1DP', { target: enemy }, api).ok, false, JSON.stringify(extra));
    assert.equal(actor.mana, 100); assert.equal(actor.skillStates.A1DP.readyAt, 0);
  }
});

test('crystal arrow is ordered by the real enemy damage event and not by arbitrary tick sensing', () => {
  const { game, actor, api, add, hits } = fixture('h0UN'), enemy = add(1, 11);
  tickNagaUnit(game, actor, api); assert.equal(hits.length, 0);
  nagaBeforeDamage(game, actor, 1, enemy, api); assert.equal(hits[0].amount, 135); assert.equal(actor.mana, 90);
});

test('tide slash uses its fixed clicked endpoint and source level-two stun after the dummy travel callback', () => {
  const { game, actor, api, add, tick, hits } = fixture('h0UO'), normal = add(1, 12.1), hero = add(1, 12.2, 1000, { isNativeHero: true });
  castNagaAbility(game, actor, 'A1DQ', { point: { x: 12, y: 10 } }, api);
  tick(10.15); assert.equal(hits.length, 0);
  tick(10.16); assert.equal(normal.hp, 855); assert.equal(hero.hp, 855);
  assert.ok(Math.abs(normal.status.stunUntil - 12.16) < 1e-7); assert.ok(Math.abs(hero.status.stunUntil - 11.16) < 1e-7);
  assert.equal(game.state.sourceSkillJobs.length, 0); assert.equal(actor.worldX, 10, 'the source moves a dummy, not the caster');
});

test('tide slash dummy continues after caster death and its endpoint does not chase a moving enemy', () => {
  const { game, actor, api, add, tick } = fixture('h0UO'), enemy = add(1, 12);
  castNagaAbility(game, actor, 'A1DQ', { point: { x: 12, y: 10 } }, api);
  actor.hp = 0; actor.status.deathCounted = true; sourceNagaDeath(game, actor, enemy, api);
  game.state.entities = game.state.entities.filter(e => e.id !== actor.id); enemy.worldX = 13.2;
  const replacement = add(1, 12); tick(10.16);
  assert.equal(enemy.hp, 1000); assert.equal(replacement.hp, 855);
});

test('ice shield refreshes a three-second source buff on the victim at the exact 25% threshold', () => {
  const { game, actor, api, add } = fixture('h0UO'), enemy = add(); actor.skillSpecs = actor.skillSpecs.filter(s => s.id !== 'A1DQ');
  game._random = () => .25; nagaBeforeDamage(game, actor, 1, enemy, api); assert.equal(actor.status.nagaIceShieldUntil, 13);
  game.state.time = 12; nagaBeforeDamage(game, actor, 1, enemy, api); assert.equal(actor.status.nagaIceShieldUntil, 15);
  game._random = () => .250001; game.state.time = 13; nagaBeforeDamage(game, actor, 1, enemy, api); assert.equal(actor.status.nagaIceShieldUntil, 15);
});

test('ice shield applies only its proved native attack classes and never a blanket spell or universal reduction', () => {
  const { game, actor } = fixture('h0UO'); actor.status.nagaIceShieldUntil = 13;
  for (const attackType of ['pierce', 'magic']) assert.equal(nagaIncomingDamage(game, actor, 100, { attackType }, {}), 70);
  for (const options of [{ spell: true }, { attackType: 'spells', nativeDamageType: 'magic', magic: true },
    { universal: true, attackType: 'magic' }, { attackType: 'normal' }, { attackType: 'chaos' }]) assert.equal(nagaIncomingDamage(game, actor, 100, { attackType: 'normal' }, options), 100);
  game.state.time = 13; assert.equal(nagaIncomingDamage(game, actor, 100, { attackType: 'pierce' }, {}), 100);
  assert.equal(NAGA_ACTIVE_RULES.A1DR.status, 'partial'); assert.ok(NAGA_ACTIVE_RULES.A1DR.partial);
});

test('tide jobs and active ice-shield state survive restoring a partially elapsed cast', () => {
  const { game, actor, api, add, tick } = fixture('h0UO');
  castNagaAbility(game, actor, 'A1DQ', { point: { x: 12, y: 10 } }, api); game._random = () => 0;
  nagaBeforeDamage(game, actor, 1, add(1, 12), api); tick(10.08);
  const restored = new Game({ mode: 'sandbox' }); restored.restore(game.snapshot());
  assert.deepEqual(restored.state.sourceSkillJobs, game.state.sourceSkillJobs);
  assert.equal(restored.state.entities.find(e => e.id === actor.id).status.nagaIceShieldUntil, 13);
});

test('four added source branches match their actual JASS and native fields instead of incompatible tooltips', () => {
  const source = readFileSync(new URL('../reference/v14-source/raw_extracted/war3map.j', import.meta.url), 'utf8');
  assert.match(source, /set Qv=GetUnitX\(i\)\+CosBJ\(Pm\)\*400/);
  assert.match(source, /set Uz=SelectRange\(i,Qv,Qw,400\)/);
  const breath = source.match(/if BF==\$41314444 then[\s\S]*?set DE=null\s+endif/)[0];
  assert.match(breath, /66,ATTACK_TYPE_CHAOS,DAMAGE_TYPE_UNIVERSAL/); assert.equal(breath.includes('LoopDamage'), false);
  const arrow = V14_ABILITIES.A1DP.resolved_fields;
  assert.equal(Number(arrow.DataA1), 135); assert.equal(Number(arrow.Dur1), 2); assert.equal(Number(arrow.HeroDur1), 2); assert.match(arrow.targs1, /organic/);
  assert.match(source, /VertigoTarget\(Bc,D6,2\)/);
  const ice = V14_ABILITIES.A1DS.resolved_fields;
  assert.equal(Number(ice.DataA1), .7); assert.equal(Number(ice.DataE1), .7); assert.equal(Number(ice.DataB1), 1);
  assert.match(source, /if GetRandomPercentageBJ\(\)<=25 then[\s\S]*?UnitAddAbilityByTimer\(i,\$41314453,3\)/);
});

test('allability suppresses each nested Naga script body only after native mana and shared cooldown are charged', () => {
  for (const [id, code] of [['A1CS', 'h0UF'], ['A1CT', 'h0UG'], ['A1CU', 'h0UG'], ['A1D7', 'h0UH'],
    ['A1D8', 'h0UH'], ['A1DD', 'h0UJ'], ['A1DQ', 'h0UO']]) {
    const { game, actor, api, add, hits, summons } = fixture(code), enemy = add(1, 11), ally = add(0, 10.2, 400);
    const jobsBefore = game.state.sourceSkillJobs.length;
    game._sourceAbilityEffectDepth = 2;
    const result = castNagaAbility(game, actor, id, { target: enemy, point: { x: 11, y: 10 } }, api);
    assert.equal(result.ok, true, id); assert.equal(result.scriptSuppressed, true, id);
    assert.equal(actor.mana, 100 - NAGA_ACTIVE_RULES[id].manaCost, id);
    assert.equal(actor.skillStates[id].readyAt, 10 + NAGA_ACTIVE_RULES[id].cooldown, id);
    assert.equal(actor.skillStates[id].casts, 1, id);
    assert.equal(game._sourceAbilityEffectDepth, 2, 'a nested order cannot release its outer script guard');
    assert.equal(game.state.sourceSkillJobs.length, jobsBefore, id); assert.equal(hits.length, 0, id); assert.equal(summons.length, 0, id);
    assert.equal(ally.hp, 400, id); assert.equal(actor.status.nagaPhantomUntil, undefined, id);
  }
});

test('native crystal arrow still damages and stuns while the shared allability script trigger is disabled', () => {
  const { game, actor, api, add, hits } = fixture('h0UN'), enemy = add(1, 11);
  game._sourceAbilityEffectDepth = 2;
  const result = castNagaAbility(game, actor, 'A1DP', { target: enemy }, api);
  assert.equal(result.ok, true); assert.equal(result.scriptSuppressed, undefined);
  assert.equal(enemy.hp, 865); assert.equal(enemy.status.stunUntil, 12); assert.equal(hits.length, 1);
  assert.equal(actor.mana, 90); assert.equal(actor.skillStates.A1DP.readyAt, 15); assert.equal(game._sourceAbilityEffectDepth, 2);
});

test('nested damage orders pay native poison-breath mana but do not repeat the script or suppress main damage passives', () => {
  const { game, actor, api, add, hits, summons } = fixture('h0UJ'), enemy = add(1, 11);
  api.addAbility(game, enemy, 'A1CO');
  const applyDamage = api.universalDamage;
  api.universalDamage = (g, target, amount, source) => {
    assert.equal(g._sourceAbilityEffectDepth, 1);
    nagaBeforeDamage(g, target, amount, source, api);
    applyDamage(g, target, amount, source);
  };
  assert.equal(castNagaAbility(game, actor, 'A1DD', { point: { x: 11, y: 10 } }, api).ok, true);
  assert.equal(enemy.hp, 934); assert.equal(hits.length, 1);
  assert.equal(actor.mana, 78); assert.equal(actor.skillStates.A1DD.casts, 2);
  assert.equal(summons.length, 3, 'the independent main damage event still consumes war cry and summons its units');
  assert.equal(enemy.skillSpecs.some(s => s.id === 'A1CO'), false);
  assert.equal(game._sourceAbilityEffectDepth, 0);
});

test('allability script guard is released on nested native failure and on outer body exceptions', () => {
  const { game, actor, api, add } = fixture('h0UG');
  api.spawnUnit = () => { throw new Error('host summon failure'); };
  assert.throws(() => castNagaAbility(game, actor, 'A1CU', {}, api), /host summon failure/);
  assert.equal(game._sourceAbilityEffectDepth, 0); assert.equal(actor.mana, 87); assert.equal(actor.skillStates.A1CU.readyAt, 20);
  const ally = add(0, 10.2, 400);
  assert.equal(castNagaAbility(game, actor, 'A1CT', {}, api).ok, true);
  assert.equal(ally.hp, 450); assert.equal(game._sourceAbilityEffectDepth, 0);
  const other = fixture('h0UJ'); other.actor.mana = 10;
  other.game._sourceAbilityEffectDepth = 3;
  assert.equal(castNagaAbility(other.game, other.actor, 'A1DD', { point: { x: 11, y: 10 } }, other.api).ok, false);
  assert.equal(other.game._sourceAbilityEffectDepth, 3, 'a failed native command does not acquire or release the existing guard');
});

test('real engine manual poison breath hits once for 66 while its nested damage order can still pay native mana', () => {
  const game = new Game({ mode: 'sandbox', seed: 42 }); game.state.phase = 'combat'; game._random = () => 0;
  const actor = game._entity(UNIT_TEMPLATES.h0UJ, { ownerId: 0, team: 0, side: 'defender', battleTeam: 0, sourceLaneId: 0, laneId: 0, worldX: 10, worldY: 10 });
  const enemy = game._entity(UNIT_TEMPLATES.h00L, { ownerId: null, team: 1, side: 'monster', battleTeam: 0, sourceLaneId: 0, laneId: 0, worldX: 11, worldY: 10 });
  actor.mana = 100; enemy.skillSpecs = []; enemy.hp = enemy.maxHp = 1000;
  enemy.armor = 999; enemy.armorType = 'heavy'; enemy.sourceArmorTypeRaw = 'large'; game.state.entities = [actor, enemy];
  assert.equal(game.command('cast', { entityId: actor.id, skillId: 'A1DD', targetId: enemy.id, worldX: 11, worldY: 10 }).ok, true);
  assert.equal(enemy.hp, 934); assert.equal(actor.mana, 78); assert.equal(actor.skillStates.A1DD.casts, 2);
  assert.equal(game._sourceAbilityEffectDepth, 0); assert.equal(game._sourceDamageTriggerDepth, 0);
});

test('the native spell event source disables only its own allability trigger around the script body', () => {
  const source = readFileSync(new URL('../reference/v14-source/raw_extracted/war3map.j', import.meta.url), 'utf8');
  const body = source.match(/function Trig_allabilityActions takes nothing returns nothing[\s\S]*?endfunction/)[0];
  assert.match(body, /local trigger Eb=GetTriggeringTrigger\(\)/);
  assert.match(body, /call DisableTrigger\(Eb\)/); assert.match(body, /call EnableTrigger\(Eb\)/);
  assert.ok(body.indexOf('call DisableTrigger(Eb)') < body.indexOf('if BF==$41314444 then'));
  assert.equal(body.includes('if BF==$41314450 then'), false, 'A1DP ANfb has no allability script branch');
});
