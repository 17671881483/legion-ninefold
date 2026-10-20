import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Game } from '../dist/engine.js';
import { UNIT_TEMPLATES } from '../dist/data.js';
import { V14_ABILITIES } from '../dist/v14-reference.js';
import { tickSourceScriptJobs } from '../dist/skills.js';
import { ICE_HERO_RULES, isIceHeroAbility, canIceHeroCastAbility, castIceHeroAbility, tryIceHeroAutoCast,
  tickIceHeroJob, sourceIceHeroDeath, isIceHeroCycloned } from '../dist/ice-hero-rules.js';

function fixture(code = 'h0SL') {
  const game = new Game({ mode: 'sandbox', seed: 404 }); game.state.phase = 'combat'; game.state.time = 10;
  const actor = game._entity(UNIT_TEMPLATES[code], { ownerId: 0, team: 0, side: 'defender', battleTeam: 0,
    sourceLaneId: 0, laneId: 0, worldX: 10, worldY: 10 });
  actor.mana = 100; game.state.entities = [actor]; game.state.sourceSkillJobs = [];
  const attempts = [], cyclones = [], moves = [];
  const add = (x = 10.6, extra = {}) => {
    const target = { id: game._uid('ice-target'), hp: 10000, maxHp: 10000, team: 1, side: 'monster', battleTeam: 0,
      worldX: x, worldY: 10, skillSpecs: [], skillStates: {}, traits: [], status: {}, buffs: [], targetType: 'ground', ...extra };
    game.state.entities.push(target); return target;
  };
  const nativeEligible = (target, at) => target.hp > 0 && !target.invulnerable && !target.nativeInvulnerable
    && !target.status.yseraHidden && !isIceHeroCycloned(target, at) && !target.skillSpecs.some(s => s.kind === 'immunity' || s.id === 'Avul');
  const api = {
    nativeDamage(g, target, amount, source, options) {
      const at = g._iceEventAt ?? g.state.time, dealt = nativeEligible(target, at) ? amount : 0;
      attempts.push({ targetId: target.id, sourceId: source.id, amount, dealt, at, options }); target.hp -= dealt;
      if (target.hp <= 0 && !target.status.deathCounted) { target.status.deathCounted = true; sourceIceHeroDeath(g, target, source, api); }
      return dealt;
    },
    setUnitPosition(g, entity, point) { entity.worldX = point.x; entity.worldY = point.y; moves.push({ id: entity.id, ...point }); },
    applyCyclone(g, source, target, abilityId, duration) {
      const at = g._iceEventAt ?? g.state.time;
      const accepted = nativeEligible(target, at) && target.team !== source.team && !target.isBuilding && target.targetType !== 'structure'
        && !target.traits.some(t => t.toLowerCase() === 'mechanical') && ['air', 'ground'].includes(target.targetType);
      cyclones.push({ targetId: target.id, abilityId, duration, accepted, at });
      if (accepted) target.status.cycloneUntil = at + duration;
      return accepted;
    },
  };
  const tick = time => {
    game.state.time = time; const keep = [];
    for (const job of game.state.sourceSkillJobs) if (tickIceHeroJob(game, job, api)) keep.push(job);
    game.state.sourceSkillJobs = keep;
  };
  return { game, actor, add, api, tick, attempts, cyclones, moves };
}

test('four actual ice abilities use native object costs and cooldowns and honestly retain order arbitration as partial', () => {
  assert.deepEqual(Object.keys(ICE_HERO_RULES), ['A19O', 'A19P', 'A19Q', 'A19R']);
  for (const [id, r] of Object.entries(ICE_HERO_RULES)) {
    const f = V14_ABILITIES[id].resolved_fields;
    assert.equal(isIceHeroAbility(id), true); assert.equal(r.active, true); assert.equal(r.status, 'partial');
    assert.equal(r.manaCost, Number(f.Cost1)); assert.equal(r.cooldown, Number(f.Cool1)); assert.equal(r.range, Number(f.Rng1));
    assert.equal(r.autoOrder, f.DataF1); assert.equal(r.cooldownMode, 'shared_native'); assert.ok(r.description && r.effectText && r.partial);
  }
  assert.equal(isIceHeroAbility('A19S'), false);
});

test('current source maps the ancient n06I building to giant h0SL without assuming a native hero', () => {
  assert.ok(UNIT_TEMPLATES.n06I.abilityIds.includes('A19O')); assert.ok(UNIT_TEMPLATES.h0SL.abilityIds.includes('A19R'));
  assert.equal(UNIT_TEMPLATES.n06I.sourceRawFields.type, 'ancient'); assert.equal(UNIT_TEMPLATES.h0SL.sourceRawFields.type, 'giant');
  const source = readFileSync(new URL('../reference/v14-source/raw_extracted/war3map.j', import.meta.url), 'utf8');
  assert.match(source, /set Mk\[Bi\]=\$6830534C\s+set Ml\[Bi\]=\$6E303649/);
});

test('ice shards start at the caster, move 24 source steps and hit each enemy only once with ordinary-attack magic damage', () => {
  const { game, actor, add, api, tick, attempts, moves } = fixture(); const enemy = add(10.3), behind = add(9.5), ally = add(10.3, { team: 0 });
  assert.equal(castIceHeroAbility(game, actor, 'A19O', { point: { x: 12, y: 10 } }, api).ok, true);
  assert.equal(actor.mana, 95); assert.equal(actor.skillStates.A19O.readyAt, 18); assert.equal(game.state.sourceSkillJobs[0].dummy.worldX, 10);
  tick(10); assert.equal(enemy.hp, 9875); assert.equal(moves.length, 1); assert.ok(Math.abs(moves[0].x - 10.08) < 1e-8);
  tick(10.92); assert.equal(moves.length, 24); assert.ok(Math.abs(moves.at(-1).x - 11.92) < 1e-8);
  tick(10.96); assert.equal(game.state.sourceSkillJobs.length, 0); assert.equal(enemy.hp, 9875); assert.equal(behind.hp, 10000); assert.equal(ally.hp, 10000);
  assert.deepEqual(attempts[0].options, { attackType: 'normal', damageType: 'magic' }); assert.equal(attempts.length, 1);
  assert.equal(actor.worldX, 10, 'a separate dummy moves; the caster stays still');
});

test('avalanche starts at the caster and uses its actual 200-radius circle rather than an offset tooltip rectangle', () => {
  const { game, actor, add, api, tick, attempts } = fixture(); const close = add(10.05), wide = add(10.1, { worldY: 10.65 });
  castIceHeroAbility(game, actor, 'A19P', { point: { x: 12, y: 10 } }, api); tick(10);
  assert.equal(close.hp, 9815); assert.equal(wide.hp, 9815); assert.equal(attempts.length, 2);
  tick(11); assert.equal(close.hp, 9815); assert.equal(game.state.sourceSkillJobs.length, 0);
  assert.equal(actor.mana, 90); assert.equal(actor.skillStates.A19P.readyAt, 22);
});

test('frost control deals fifteen 45-damage pulses in a fixed 800-radius circle and preserves source visual RNG consumption', () => {
  const { game, actor, add, api, tick } = fixture(); const inside = add(14.6), outside = add(14.7), ally = add(12, { team: 0 });
  let randomCalls = 0; game._random = () => { randomCalls++; return .5; };
  castIceHeroAbility(game, actor, 'A19Q', { point: { x: 12, y: 10 } }, api); actor.worldX = 0;
  tick(10.199); assert.equal(inside.hp, 10000); tick(10.2); assert.equal(inside.hp, 9955);
  tick(13); assert.equal(inside.hp, 9325); assert.equal(outside.hp, 10000); assert.equal(ally.hp, 10000);
  assert.equal(randomCalls, 60); assert.equal(game.state.sourceSkillJobs.length, 0);
});

test('frost control reselects targets each pulse and excludes Avul, dead and opposite battle instances', () => {
  const { game, actor, add, api, tick, attempts } = fixture(); const leaves = add(12), late = add(15), invul = add(12, { skillSpecs: [{ id: 'Avul' }] });
  const dead = add(12, { hp: 0 }), foreign = add(12, { battleTeam: 1 });
  castIceHeroAbility(game, actor, 'A19Q', { point: { x: 12, y: 10 } }, api); tick(10.2);
  leaves.worldX = 20; late.worldX = 12; tick(10.4);
  assert.equal(leaves.hp, 9955); assert.equal(late.hp, 9955); assert.equal(invul.hp, 10000); assert.equal(dead.hp, 0); assert.equal(foreign.hp, 10000);
  assert.equal(attempts.length, 2);
});

test('two wind lines retain independent hit groups and unconditional delayed hits while native cyclone can block their immediate damage', () => {
  const { game, actor, add, api, tick, attempts, cyclones } = fixture(); const enemy = add();
  castIceHeroAbility(game, actor, 'A19R', { point: { x: 12, y: 10 } }, api);
  const lines = game.state.sourceSkillJobs; assert.equal(lines.length, 2); assert.ok(Math.abs(lines[0].dummy.worldY - 10 - 1 / 3) < 1e-8);
  tick(10); assert.equal(enemy.hp, 9850); assert.equal(enemy.status.cycloneUntil, 13);
  assert.equal(cyclones.length, 2); assert.equal(cyclones.filter(c => c.accepted).length, 1);
  assert.equal(game.state.sourceSkillJobs.filter(j => j.type === 'ice_wind_delayed').length, 2);
  assert.ok(lines[0].hitIds.includes(enemy.id) && lines[1].hitIds.includes(enemy.id));
  tick(12.999); assert.equal(enemy.hp, 9850); tick(13); assert.equal(enemy.hp, 9550);
  assert.equal(attempts.filter(a => a.dealt === 150).length, 3); assert.equal(game.state.sourceSkillJobs.length, 0);
});

test('wind native cyclone supports organic air and native heroes for exactly three seconds but rejects mechanical, buildings and immunity', () => {
  const { game, actor, add, api, tick, cyclones } = fixture(); const air = add(10.4, { targetType: 'air' }), hero = add(10.5, { isNativeHero: true });
  const mechanical = add(10.6, { traits: ['Mechanical'] }), building = add(10.7, { isBuilding: true, targetType: 'structure' });
  const immune = add(10.8, { skillSpecs: [{ kind: 'immunity' }] }), invul = add(10.9, { invulnerable: true });
  castIceHeroAbility(game, actor, 'A19R', { point: { x: 12, y: 10 } }, api); tick(10);
  for (const target of [air, hero]) { assert.equal(target.status.cycloneUntil, 13); assert.equal(target.hp, 9850); }
  for (const target of [mechanical, building, immune, invul]) assert.equal(target.status.cycloneUntil, undefined);
  assert.equal(mechanical.hp, 9700); assert.equal(building.hp, 9700); assert.equal(immune.hp, 10000); assert.equal(invul.hp, 10000);
  assert.ok(cyclones.every(c => c.abilityId === 'S007' && c.duration === 3));
  tick(13); assert.equal(mechanical.hp, 9400); assert.equal(immune.hp, 10000);
});

test('late timer dispatch uses callback time for cyclone immunity and delayed damage and releases its scoped clock', () => {
  const { game, actor, add, api, tick } = fixture(); const enemy = add();
  castIceHeroAbility(game, actor, 'A19R', { point: { x: 12, y: 10 } }, api); tick(13);
  assert.equal(enemy.hp, 9550); assert.equal(enemy.status.cycloneUntil, 13); assert.equal(isIceHeroCycloned(enemy, 13), false);
  assert.equal(game._iceEventAt, undefined); assert.equal(game.state.sourceSkillJobs.length, 0);
});

test('manual and enemy-damage orders share native mana and cooldowns and failed victim orders never fall through to the attacker', () => {
  const { game, actor, add, api } = fixture(); const enemy = add(11, { mana: 100, skillSpecs: actor.skillSpecs.map(s => ({ ...s })), skillStates: {} });
  for (const id of Object.keys(ICE_HERO_RULES)) actor.skillStates[id] = { readyAt: 100, casts: 0 };
  tryIceHeroAutoCast(game, actor, enemy, api); assert.equal(enemy.mana, 100); assert.equal(actor.mana, 100);
  game.state.time = 100; actor.mana = 30;
  const results = tryIceHeroAutoCast(game, actor, enemy, api);
  assert.deepEqual(results.map(r => r.ok), [true, true, false, false]); assert.equal(actor.mana, 15);
  assert.equal(castIceHeroAbility(game, actor, 'A19O', { point: { x: 11, y: 10 } }, api).ok, false);
  assert.equal(tryIceHeroAutoCast(game, actor, { ...enemy, team: 0 }, api).length, 0);
});

test('native cast eligibility rejects dead, paused, hidden, controlled, invalid or out-of-range commands before spending resources', () => {
  for (const flag of ['sourcePaused', 'yseraPaused', 'illidanPaused', 'yseraHidden', 'stunUntil', 'cycloneUntil']) {
    const { game, actor, api } = fixture(); actor.status[flag] = flag.endsWith('Until') ? 11 : true;
    assert.equal(castIceHeroAbility(game, actor, 'A19O', { point: { x: 11, y: 10 } }, api).ok, false, flag); assert.equal(actor.mana, 100);
  }
  const { game, actor, add, api } = fixture(); const enemy = add(11);
  assert.equal(canIceHeroCastAbility(actor, 'A19R', api), true); assert.equal(canIceHeroCastAbility(actor, 'A19S', api), false);
  assert.equal(castIceHeroAbility(game, actor, 'A19O', { point: { x: 13, y: 10 } }, api).ok, false);
  assert.equal(castIceHeroAbility(game, actor, 'A19O', {}, api).ok, false);
  enemy.status.cycloneUntil = 11; assert.equal(castIceHeroAbility(game, actor, 'A19O', { mode: 'auto', target: enemy }, api).ok, false);
  actor.hp = 0; assert.equal(castIceHeroAbility(game, actor, 'A19O', { point: { x: 11, y: 10 } }, api).ok, false); assert.equal(actor.mana, 100);
});

test('ANCIENT building bodies return only after native charges and allability reentry suppresses every body without leaking its guard', () => {
  for (const id of Object.keys(ICE_HERO_RULES)) {
    const ancient = fixture('n06I'); const result = castIceHeroAbility(ancient.game, ancient.actor, id, { point: { x: 11, y: 10 } }, ancient.api);
    assert.equal(result.ancientSuppressed, true); assert.equal(ancient.actor.mana, 100 - ICE_HERO_RULES[id].manaCost); assert.equal(ancient.game.state.sourceSkillJobs.length, 0);
    assert.equal(ancient.game._sourceAbilityEffectDepth, 0);
    const nested = fixture(); nested.game._sourceAbilityEffectDepth = 2;
    const suppressed = castIceHeroAbility(nested.game, nested.actor, id, { point: { x: 11, y: 10 } }, nested.api);
    assert.equal(suppressed.ok, true); assert.equal(suppressed.scriptSuppressed, true); assert.equal(nested.game._sourceAbilityEffectDepth, 2);
    assert.equal(nested.actor.mana, 100 - ICE_HERO_RULES[id].manaCost); assert.equal(nested.game.state.sourceSkillJobs.length, 0);
  }
});

test('all ice timers survive caster death and cleanup and death handling mutates only owned ice jobs', () => {
  const { game, actor, add, api, tick } = fixture(); const target = add();
  castIceHeroAbility(game, actor, 'A19O', { point: { x: 11, y: 10 } }, api);
  castIceHeroAbility(game, actor, 'A19Q', { point: { x: 11, y: 10 } }, api);
  castIceHeroAbility(game, actor, 'A19R', { point: { x: 11, y: 10 } }, api);
  const other = { type: 'alchemist_pool', sourceId: actor.id, source: { distinct: true }, payload: ['preserve'] }; game.state.sourceSkillJobs.push(other);
  const before = JSON.stringify(other); actor.hp = 0; actor.status.deathCounted = true; sourceIceHeroDeath(game, actor, target, api);
  assert.equal(JSON.stringify(other), before); assert.ok(game.state.sourceSkillJobs.filter(j => j.type.startsWith('ice_')).every(j => j.source.hp === 0));
  game.state.entities = game.state.entities.filter(e => e.id !== actor.id); game.state.sourceSkillJobs.pop(); tick(13);
  assert.ok(target.hp < 10000); assert.equal(game.state.sourceSkillJobs.length, 0);
});

test('snapshot restoration preserves independent line hit groups, delayed damage, native resources and exact continuation', () => {
  const { game, actor, add, api, tick } = fixture(); add();
  castIceHeroAbility(game, actor, 'A19R', { point: { x: 12, y: 10 } }, api); tick(10);
  actor.hp = 0; actor.status.deathCounted = true; sourceIceHeroDeath(game, actor); game.state.entities = game.state.entities.filter(e => e.id !== actor.id);
  const restored = Game.fromSnapshot(game.snapshot());
  for (const g of [game, restored]) {
    g.state.time = 13; const keep = [];
    for (const job of g.state.sourceSkillJobs) if (tickIceHeroJob(g, job, api)) keep.push(job);
    g.state.sourceSkillJobs = keep;
  }
  assert.deepEqual(restored.snapshot(), game.snapshot());
});

test('native exceptions release only the ice event clock and a dummy death cancels only its own line', () => {
  const { game, actor, add, api } = fixture(); add(10.3);
  castIceHeroAbility(game, actor, 'A19O', { point: { x: 11, y: 10 } }, api);
  const job = game.state.sourceSkillJobs[0]; game._iceEventAt = 4;
  assert.throws(() => tickIceHeroJob(game, job, { ...api, nativeDamage() { throw new Error('host damage'); } }), /host damage/);
  assert.equal(game._iceEventAt, 4); assert.equal(game._sourceAbilityEffectDepth, 0);
  sourceIceHeroDeath(game, { id: job.dummy.id }); assert.equal(job.done, true); assert.equal(tickIceHeroJob(game, job, api), false);
});

test('source evidence proves actual pulse counts, ordinary-attack magic, independent line groups and native S007 targets', () => {
  const source = readFileSync(new URL('../reference/v14-source/raw_extracted/war3map.j', import.meta.url), 'utf8');
  const ice = source.match(/function IceShards takes[\s\S]*?endfunction/)[0]; assert.match(ice, /ChargeDistance\(Bc,Ki,Pm,600,1,/);
  const shards = source.match(/function IceShardsCallBack takes[\s\S]*?endfunction/)[0]; assert.match(shards, /125,ATTACK_TYPE_MELEE,DAMAGE_TYPE_MAGIC/);
  const avalanche = source.match(/function Avalanche takes[\s\S]*?endfunction/)[0]; assert.match(avalanche, /CreateUnit\(GetOwningPlayer\(Bc\),Pn,GetUnitX\(Bc\),GetUnitY\(Bc\),Pm\)/);
  const frost = source.match(/function FrostControlAction takes[\s\S]*?endfunction/)[0]; assert.match(frost, /SelectRange\(Bc,FF,FG,800\)/);
  assert.match(frost, /225\/5,ATTACK_TYPE_MELEE,DAMAGE_TYPE_MAGIC/); assert.match(frost, /GetTriggerExecCount\(t\)\*\.2>=3/);
  const wind = source.match(/function TheScreamingWindCallBack takes[\s\S]*?endfunction/)[0]; assert.match(wind, /if not IsUnitInGroup\(D6,DG\)/);
  assert.match(wind, /TimerStart\(El,3,false,function TheScreamingWindCallBackTimer\)/); assert.match(wind, /UnitAddAbility\(RO,\$53303037\)/);
  const cyclone = V14_ABILITIES.S007.resolved_fields; assert.equal(cyclone.Dur1, '3.0'); assert.equal(cyclone.HeroDur1, '3.0'); assert.match(cyclone.targs1, /air,organic/);
  assert.match(source, /if GetUnitAbilityLevel\(i,\$4131394F\)>0 then\s+call IssueTargetOrder\(i,"unflamingattack",bV\)\s+elseif/);
});

test('native reactions caused by a late ice timer use its event clock and body exceptions release the shared allability guard', () => {
  const { game, actor, api } = fixture(); game.state.time = 13; game._iceEventAt = 10.2;
  assert.equal(castIceHeroAbility(game, actor, 'A19O', { point: { x: 11, y: 10 } }, api).ok, true);
  assert.equal(actor.skillStates.A19O.readyAt, 18.2); assert.equal(game.state.sourceSkillJobs[0].nextAt, 10.2);
  assert.equal(game._iceEventAt, 10.2); delete game._iceEventAt;
  const broken = fixture(); broken.game._event = () => {}; broken.game._uid = () => { throw new Error('host job allocation'); };
  assert.throws(() => castIceHeroAbility(broken.game, broken.actor, 'A19Q', { point: { x: 11, y: 10 } }, broken.api), /host job allocation/);
  assert.equal(broken.game._sourceAbilityEffectDepth, 0); assert.equal(broken.actor.mana, 80); assert.equal(broken.actor.skillStates.A19Q.readyAt, 30);
});

test('real engine manual frost control and wind use the source attack matrix, bypass numeric armor and release cyclone exactly at delayed damage', () => {
  for (const [skillId, unscaledDamage] of [['A19Q', 675], ['A19R', 450]]) {
    const game = new Game({ mode: 'sandbox', seed: 404 }); game.state.phase = 'combat'; game.state.time = 10;
    const actor = game._entity(UNIT_TEMPLATES.h0SL, { ownerId: 0, team: 0, side: 'defender', battleTeam: 0,
      sourceLaneId: 0, laneId: 0, worldX: 5, worldY: 10 }); actor.mana = 100;
    actor.skillSpecs = actor.skillSpecs.filter(s => s.id === skillId);
    const target = game._entity(UNIT_TEMPLATES.h00L, { ownerId: null, team: 1, side: 'monster', battleTeam: 0,
      sourceLaneId: 0, laneId: 0, worldX: 5.6, worldY: 10 });
    target.skillSpecs = []; target.hp = target.maxHp = 10000; target.armor = 999; target.armorType = 'heavy'; target.sourceArmorTypeRaw = 'large';
    game.state.entities = [actor, target];
    assert.equal(game.command('cast', { entityId: actor.id, skillId, worldX: 6, worldY: 10 }).ok, true);
    game.state.time = 13; tickSourceScriptJobs(game);
    const factor = game._typeMultiplier('normal', 'heavy', 'large');
    assert.ok(Math.abs(target.hp - (10000 - unscaledDamage * factor)) < 1e-8, skillId);
    assert.equal(actor.mana, 80); assert.equal(game.state.sourceSkillJobs.length, 0); assert.equal(game._iceEventAt, undefined);
    if (skillId === 'A19R') { assert.equal(target.status.cycloneUntil, 13); assert.equal(isIceHeroCycloned(target, 13), false); }
  }
});
