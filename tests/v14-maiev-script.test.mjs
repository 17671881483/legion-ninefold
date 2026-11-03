import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Game} from '../dist/engine.js';
import {UNIT_TEMPLATES} from '../dist/data.js';
import {recordEggCompletion} from '../dist/egg-rules.js';
import {maievBlink} from '../dist/maiev-rules.js';
import {compileSkills, castManualSourceSkill, tickSourceScriptJobs} from '../dist/skills.js';

const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-5, `${actual} != ${expected}`);
const ok = result => assert.equal(result.ok, true, result.message);
const clone = value => JSON.parse(JSON.stringify(value));
const blades = game => (game.state.sourceSkillJobs ?? []).filter(job => job.type === 'maiev_blade' && !job.done);

function skills(entity, ids) {
  entity.skillSpecs = compileSkills({abilityIds: ids, skillVersion: 'v14.1A5', distanceScale: 1 / 3});
  entity.abilityLevels = {};
  entity.skillStates = Object.fromEntries(ids.map(id => [id, {readyAt: 0, casts: 0}]));
}

function fixture(ids = ['A1TZ']) {
  const game = new Game({mode: 'sandbox', seed: 69});
  Object.assign(game.state, {phase: 'combat', wave: 31, time: 10, entities: [], sourceSkillJobs: []});
  game._spawnQueue = [];
  game._aiAct = () => {};
  // Isolate timer damage from unrelated main-damage automatic orders. Tests
  // of the real main-damage entry explicitly re-enable that trigger below.
  game._sourceDamageTriggerDepth = 1;
  for (const king of game.state.kings) king.worldX = king.worldY = 10000;
  const make = (dx = .5, side = 'monster', raw = 'h03E') => {
    const defender = side === 'defender';
    const entity = game._entity(UNIT_TEMPLATES[raw], {
      side, ownerId: defender ? 0 : 4, sourceNativeOwnerId: defender ? 8 : 9,
      userData: defender ? 1 : 5, team: defender ? 0 : 1, battleTeam: 0,
      laneId: 0, sourceLaneId: 0, worldX: 5 + dx, worldY: 8, facing: 0,
    });
    Object.assign(entity, {
      hp: 10000, maxHp: 10000, mana: 1000, maxMana: 1000,
      armor: 0, sourceArmorTypeRaw: 'none', armorType: 'unarmored',
      ability: null, hpRegen: 0, manaRegen: 0, moveSpeed: 0,
      attackCd: 99999, buffs: [], traits: [], isNativeHero: false,
    });
    skills(entity, []);
    game.state.entities.push(entity);
    return entity;
  };
  const caster = make(0, 'defender', 'h0WK'), enemy = make();
  skills(caster, ids);
  return {
    game, caster, enemy, make,
    cast: () => castManualSourceSkill(game, caster, 'A1TZ', {}),
    at: time => { game.state.time = time; tickSourceScriptJobs(game); },
  };
}

function blink(f, {blocked = () => false, damage = 100, source = f.enemy} = {}) {
  const checks = [], origin = {x: f.caster.worldX, y: f.caster.worldY};
  maievBlink(f.game, f.caster, source, damage, {
    isTerrainBlocked(game, point, unit) {
      assert.equal(game, f.game);
      assert.equal(unit, f.caster);
      const distance = Math.hypot(point.x - origin.x, point.y - origin.y) * 300;
      checks.push(distance);
      return blocked(distance, point);
    },
  });
  return checks;
}

test('source pins strict blade timer, follow position, widget cancellation and RMax blink loop', () => {
  const lines = readFileSync(new URL('../reference/v14-source/raw_extracted/war3map.j', import.meta.url)).toString('latin1').split('\n');
  const source = line => lines[line - 1].replace(/\r$/, '');
  assert.equal(source(35819), 'if GetTriggerExecCount(t)*.04<6 then');
  assert.equal(source(35812), 'local real FF=GetUnitX(Bc)');
  assert.equal(source(35821), 'set DG=SelectRange(Bc,FF,FG,Q5+50)');
  assert.equal(source(35826), 'call UnitDamageTargetBJ(Bc,D6,135*.04,ATTACK_TYPE_CHAOS,DAMAGE_TYPE_UNIVERSAL)');
  assert.equal(source(35856), 'call TriggerRegisterDeathEvent(t,Bc)');
  assert.equal(source(35882), 'set FF=GetUnitX(Bc)+CosBJ(GetUnitFacing(Bc))*-RMaxBJ(32*BB,bZ)');
  assert.equal(source(35884), 'exitwhen 32*BB>=bZ or IsTerrainPathable(FF,FG,PATHING_TYPE_WALKABILITY)');
  assert.equal(source(35889), 'call TimerStart(t,8,false,function MaievPinkTimer)');
  assert.equal(source(40553), 'if P8<=0 or bV==i or bV==null or IsUnitAlly(bV,GetOwningPlayer(i)) then');
  assert.equal(source(40591), 'call MaievPink(i)');
});

test('blade pays 16 mana with 9-second cooldown and does not damage at cast time', () => {
  const f = fixture();
  ok(f.cast());
  near(f.caster.mana, 984);
  near(f.caster.skillStates.A1TZ.readyAt, 19);
  assert.equal(f.caster.skillStates.A1TZ.casts, 1);
  near(f.enemy.hp, 10000);
  assert.equal(blades(f.game).length, 1);
  assert.equal(f.cast().ok, false);
  near(f.caster.mana, 984);
});

test('blade damages on callbacks 1 through 149 and callback 150 only cleans up', () => {
  const f = fixture(), calls = [], hurt = f.game._hurt.bind(f.game);
  f.game._hurt = (target, amount, source, options) => {
    if (source === f.caster && target === f.enemy) calls.push({at: f.game.state.time, amount, options});
    return hurt(target, amount, source, options);
  };
  ok(f.cast());
  f.at(10.039);
  assert.equal(calls.length, 0);
  f.at(10.04);
  near(f.enemy.hp, 9994.6);
  assert.equal(calls.length, 1);
  f.at(15.96);
  assert.equal(calls.length, 149);
  near(f.enemy.hp, 10000 - 804.6);
  assert.equal(blades(f.game).length, 1);
  f.at(16);
  assert.equal(blades(f.game).length, 0);
  assert.equal(calls.length, 149);
  f.at(20);
  near(f.enemy.hp, 10000 - 804.6);
  assert.ok(calls.every(call => call.amount === 5.4 && call.options.weapon && call.options.attackType === 'chaos' && call.options.nativeDamageType === 'universal'));
});

test('blade includes the 350 boundary and filters dead units, allies and Avul without restricting air or mechanical enemies', () => {
  const f = fixture(), edge = f.make(350 / 300), outside = f.make(350 / 300 + .001);
  const friend = f.make(.2, 'defender'), dead = f.make(.3), invulnerable = f.make(.4), air = f.make(.6), mechanical = f.make(.7);
  dead.hp = 0;
  skills(invulnerable, ['Avul']);
  air.targetType = 'air';
  mechanical.traits = ['mechanical'];
  ok(f.cast());
  f.at(10.04);
  for (const target of [f.enemy, edge, air, mechanical]) near(target.hp, 9994.6);
  for (const target of [outside, friend, invulnerable]) near(target.hp, 10000);
  near(dead.hp, 0);
});

test('each blade callback follows the current caster position and enumerates newly entering enemies', () => {
  const f = fixture(), later = f.make(4);
  ok(f.cast());
  f.at(10.04);
  near(f.enemy.hp, 9994.6);
  near(later.hp, 10000);
  f.caster.worldX = 9;
  f.at(10.08);
  near(f.enemy.hp, 9994.6);
  near(later.hp, 9994.6);
  later.worldX = 20;
  f.at(10.12);
  near(later.hp, 9994.6);
});

test('blade persists after ability removal and control effects but widget death cancels immediately', () => {
  const f = fixture();
  ok(f.cast());
  skills(f.caster, []);
  f.caster.status.silenceUntil = f.caster.status.stunUntil = 100;
  f.caster.status.sourcePaused = true;
  f.at(10.04);
  near(f.enemy.hp, 9994.6);
  // Death-widget listeners must run even when the separate main-death
  // trigger is already disabled by an enclosing death event.
  f.game._sourceUnitDeathTriggerDepth = 1;
  f.game._killUnit(f.caster);
  assert.equal(blades(f.game).length, 0);
  f.at(16);
  near(f.enemy.hp, 9994.6);
});

test('separate blade spell effects create independent timers with their own start and finish times', () => {
  const f = fixture();
  ok(f.cast());
  f.at(10.5);
  // An external cooldown reset permits a second spell event. This does not
  // claim normal 9-second cooldown allows these 6-second jobs to overlap.
  f.caster.skillStates.A1TZ.readyAt = 0;
  ok(f.cast());
  assert.equal(blades(f.game).length, 2);
  f.at(16);
  assert.equal(blades(f.game).length, 1);
  f.at(16.5);
  assert.equal(blades(f.game).length, 0);
  near(f.enemy.hp, 10000 - 804.6 * 2);
});

test('blade spell effect inside a disabled allability trigger spends native costs without starting the script', () => {
  const f = fixture();
  f.game._sourceAbilityEffectDepth = 1;
  ok(f.cast());
  near(f.caster.mana, 984);
  assert.equal(blades(f.game).length, 0);
});

test('blink repeats the 200 check six times then uses the 224 candidate opposite current facing', () => {
  const f = fixture(['A1TX']);
  f.caster.facing = 90;
  const checks = blink(f);
  assert.equal(checks.length, 7);
  checks.slice(0, 6).forEach(distance => near(distance, 200));
  near(checks[6], 224);
  near(f.caster.worldX, 5);
  near(f.caster.worldY, 8 - 224 / 300);
  near(f.caster.status.maiev.blinkReadyAt, 18);
});

test('blocked 200 point exits immediately, does not search nearer points and does not consume cooldown', () => {
  const f = fixture(['A1TX']);
  const checks = blink(f, {blocked: () => true});
  // The script rechecks the chosen point in its final success condition.
  assert.equal(checks.length, 2);
  checks.forEach(distance => near(distance, 200));
  near(f.caster.worldX, 5);
  assert.equal(f.caster.status.maiev.blinkReadyAt, undefined);
  blink(f);
  near(f.caster.worldX, 5 - 224 / 300);
  near(f.caster.status.maiev.blinkReadyAt, 18);
});

test('open 200 but blocked 224 candidate fails without using 200 as a fallback or taking cooldown', () => {
  const f = fixture(['A1TX']);
  const checks = blink(f, {blocked: distance => distance > 210});
  assert.equal(checks.length, 7);
  near(checks.at(-1), 224);
  near(f.caster.worldX, 5);
  assert.equal(f.caster.status.maiev.blinkReadyAt, undefined);
});

test('blink cooldown releases at exactly eight seconds and never uses mana or native cast-control checks', () => {
  const f = fixture(['A1TX']);
  f.caster.mana = 0;
  f.caster.status.silenceUntil = f.caster.status.stunUntil = 100;
  f.caster.status.sourcePaused = true;
  blink(f);
  near(f.caster.worldX, 5 - 224 / 300);
  f.game.state.time = 17.999;
  blink(f);
  near(f.caster.worldX, 5 - 224 / 300);
  f.game.state.time = 18;
  blink(f);
  near(f.caster.worldX, 5 - 448 / 300);
  near(f.caster.mana, 0);
  near(f.caster.status.maiev.blinkReadyAt, 26);
});

test('blink main-damage gate rejects zero, negative, self, null, allied and A2Y7 sources', () => {
  for (const mode of ['zero', 'negative', 'self', 'null', 'ally', 'A2Y7', 'noAbility', 'levelZero']) {
    const f = fixture(['A1TX']);
    let source = f.enemy, damage = 1;
    if (mode === 'zero') damage = 0;
    if (mode === 'negative') damage = -1;
    if (mode === 'self') source = f.caster;
    if (mode === 'null') source = null;
    if (mode === 'ally') f.enemy.team = f.caster.team;
    if (mode === 'A2Y7') skills(f.enemy, ['A2Y7']);
    if (mode === 'noAbility') skills(f.caster, []);
    if (mode === 'levelZero') f.caster.abilityLevels.A1TX = 0;
    const checks = blink(f, {source, damage});
    assert.equal(checks.length, 0, mode);
    near(f.caster.worldX, 5);
    assert.equal(f.caster.status.maiev, undefined, mode);
  }
});

test('real Game positive spell damage blinks the victim without mana cost or damage cancellation', () => {
  const f = fixture(['A1TX']);
  f.game._sourceDamageTriggerDepth = 0;
  f.caster.mana = 0;
  near(f.game._hurt(f.caster, 100, f.enemy, {spell: true, universal: true}), 100);
  near(f.caster.hp, 9900);
  near(f.caster.mana, 0);
  near(f.caster.worldX, 5 - 224 / 300);
  near(f.caster.status.maiev.blinkReadyAt, 18);
});

test('real Game sub-one damage still triggers blink while an attacking Maiev does not blink herself', () => {
  const victim = fixture(['A1TX']);
  victim.game._sourceDamageTriggerDepth = 0;
  near(victim.game._hurt(victim.caster, .1, victim.enemy, {spell: true, universal: true}), .1);
  near(victim.caster.worldX, 5 - 224 / 300);
  const attacker = fixture(['A1TX']);
  attacker.game._sourceDamageTriggerDepth = 0;
  near(attacker.game._hurt(attacker.enemy, 100, attacker.caster, {spell: true, universal: true}), 100);
  near(attacker.caster.worldX, 5);
  assert.equal(attacker.caster.status.maiev, undefined);
});

test('real main-damage dispatch preserves allied, A2Y7 and nested-trigger exclusions', () => {
  for (const mode of ['ally', 'A2Y7', 'nested']) {
    const f = fixture(['A1TX', 'A1TZ']);
    f.game._sourceDamageTriggerDepth = mode === 'nested' ? 1 : 0;
    if (mode === 'ally') f.enemy.team = f.caster.team;
    if (mode === 'A2Y7') skills(f.enemy, ['A2Y7']);
    f.game._hurt(f.caster, 100, f.enemy, {spell: true, universal: true});
    near(f.caster.worldX, 5);
    near(f.caster.mana, 1000);
    assert.equal(f.caster.status.maiev, undefined, mode);
    assert.equal(blades(f.game).length, 0, mode);
  }
});

test('real main-damage entry blinks before issuing the automatic blade order', () => {
  const f = fixture(['A1TX', 'A1TZ']), events = [], event = f.game._event.bind(f.game);
  f.game._sourceDamageTriggerDepth = 0;
  f.game._event = (kind, entity, text, extra) => {
    if (entity === f.caster && ['A1TX', 'A1TZ'].includes(extra?.skillId)) events.push({kind, id: extra.skillId, x: entity.worldX});
    return event(kind, entity, text, extra);
  };
  f.game._hurt(f.caster, 100, f.enemy, {spell: true, universal: true});
  assert.deepEqual(events.map(item => item.id), ['A1TX', 'A1TZ']);
  events.forEach(item => near(item.x, 5 - 224 / 300));
  assert.equal(blades(f.game).length, 1);
  near(f.caster.hp, 9900);
  near(f.caster.mana, 984);
  // After the backward blink this attacker is outside the 350 blade radius.
  f.at(10.04);
  near(f.enemy.hp, 10000);
});

test('automatic blade uses victim priority and does not fall back to an attacker when the victim cannot pay', () => {
  const f = fixture(['A1TZ']);
  skills(f.enemy, ['A1TZ']);
  f.caster.mana = 0;
  f.game._sourceDamageTriggerDepth = 0;
  f.game._hurt(f.caster, 100, f.enemy, {spell: true, universal: true});
  assert.equal(blades(f.game).length, 0);
  near(f.enemy.mana, 1000);
  assert.equal(f.caster.status.maiev.orders.find(order => order.id === 'A1TZ').ok, false);
  assert.equal(f.enemy.status.maiev, undefined);
});

test('automatic blade accepts an attacking carrier when the victim has no such ability', () => {
  const f = fixture(['A1TZ']);
  f.game._sourceDamageTriggerDepth = 0;
  f.game._hurt(f.enemy, 100, f.caster, {spell: true, universal: true});
  assert.equal(blades(f.game).length, 1);
  near(f.caster.mana, 984);
  assert.equal(f.caster.status.maiev.orders.find(order => order.id === 'A1TZ').ok, true);
});

for (const sourceRaw of ['h0FL', 'n01Q']) test(`${sourceRaw} completion unlocks a real direct 400-gold Warden upgrade without training`, () => {
  const game = new Game({mode: 'sandbox', seed: 69}), p = game.state.players[0];
  p.roster = ['v14_h093'];
  ok(game.command('build', {unitId: 'v14_h093', col: 2, row: 4}));
  ok(game.command('sandboxComplete'));
  const b = p.buildings[0];
  assert.equal(game.command('upgrade', {buildingId: b.id, unitId: 'v14_n08G'}).ok, false);
  recordEggCompletion(p, UNIT_TEMPLATES[sourceRaw], {buildingId: 'completed-priestess', wave: 1});
  assert.equal(p.technologies.R0GG, 1);
  const gold = p.gold;
  ok(game.command('upgrade', {buildingId: b.id, unitId: 'v14_n08G'}));
  near(gold - p.gold, 400);
  assert.equal(b.construction.duration, 2);
  ok(game.command('sandboxComplete'));
  ok(game.command('ready'));
  const e = game.state.entities.find(entity => entity.buildingId === b.id);
  assert.equal(e.combatRawcode, 'h0WK');
  near(e.maxHp, 3000);
  assert.deepEqual(e.skillSpecs.map(skill => skill.id).sort(), ['A1TV', 'A1TW', 'A1TX', 'A1TZ']);
});

test('an existing VIP Warden uses the same direct upgrade, without inventing a VIP acquisition bypass', () => {
  const original = new Game({mode: 'sandbox', seed: 69}), p = original.state.players[0];
  p.roster = ['v14_h093'];
  ok(original.command('build', {unitId: 'v14_h093', col: 2, row: 4}));
  ok(original.command('sandboxComplete'));
  const saved = clone(original.snapshot());
  // h193's account appearance tier remains unresolved. Seed an already-owned
  // source building to test its upgrade edge without enabling that tier.
  saved.state.players[0].buildings[0].unitId = 'v14_h193';
  const game = Game.fromSnapshot(saved), owner = game.state.players[0], b = owner.buildings[0];
  assert.equal(game.command('upgrade', {buildingId: b.id, unitId: 'v14_n08G'}).ok, false);
  recordEggCompletion(owner, UNIT_TEMPLATES.h0FL, {buildingId: 'completed-priestess', wave: 1});
  ok(game.command('upgrade', {buildingId: b.id, unitId: 'v14_n08G'}));
  ok(game.command('sandboxComplete'));
  ok(game.command('ready'));
  assert.equal(game.state.entities.find(entity => entity.buildingId === b.id).combatRawcode, 'h0WK');
});

test('snapshot resumes the existing blade timer on the live caster and preserves blink deadline', () => {
  const f = fixture(['A1TX', 'A1TZ']);
  blink(f);
  // Put the enemy inside the new blade center before starting the effect.
  f.enemy.worldX = f.caster.worldX + .5;
  ok(f.cast());
  f.at(12.01);
  const game = Game.fromSnapshot(clone(f.game.snapshot()));
  const caster = game.state.entities.find(entity => entity.id === f.caster.id);
  const enemy = game.state.entities.find(entity => entity.id === f.enemy.id);
  assert.equal(blades(game).length, 1);
  assert.equal(blades(game)[0].source, caster);
  near(caster.status.maiev.blinkReadyAt, 18);
  near(caster.skillStates.A1TZ.readyAt, 19);
  f.at(16);
  game.state.time = 16;
  tickSourceScriptJobs(game);
  near(enemy.hp, f.enemy.hp);
  near(enemy.hp, 10000 - 804.6);
  assert.equal(blades(game).length, 0);
});

test('paused natural ticks preserve timer clocks and coarse blade callbacks match fine callbacks', () => {
  const coarse = fixture(), fine = fixture();
  ok(coarse.cast());
  ok(fine.cast());
  coarse.game.state.paused = true;
  const saved = clone(coarse.game.snapshot());
  coarse.game.tick(6);
  assert.deepEqual(clone(coarse.game.snapshot()), saved);
  coarse.game.state.paused = false;
  coarse.at(16);
  for (let step = 1; step <= 600; step++) fine.at(10 + step * .01);
  near(coarse.enemy.hp, fine.enemy.hp);
  near(coarse.enemy.hp, 10000 - 804.6);
  assert.equal(blades(coarse.game).length, 0);
  assert.equal(blades(fine.game).length, 0);
});
