import test from 'node:test';
import assert from 'node:assert/strict';
import { V14_UNIT_TEMPLATES } from '../dist/v14-reference.js';
import { YSERA_ACTIVE_RULES, YSERA_FORMS, isYseraActiveAbility, isYseraJobType, canYseraCastAbility, castYseraAbility, tryYseraAutoCast, sourceYseraDeath, tickYseraJob } from '../dist/ysera-rules.js';

const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-6, `${a} != ${b}`);
function fixture() {
  let id = 0;
  const g = { state: { time: 0, entities: [], sourceSkillJobs: [], players: [{ alive: true }] }, events: [], hits: [], pauses: [], corrosion: [], random: [], _random() { return this.random.shift() ?? 0; }, _event(type, e, label, extra) { this.events.push({ type, id: e.id, label, ...extra }); },
    add(ids = [], rawcode = 'fixture', side = 'monster', x = 0, y = 0, extra = {}) {
      const e = { id: ++id, combatRawcode: rawcode, skillVersion: 'v14.1A5', skillSpecs: ids.map(id => ({ id, status: 'implemented' })), skillStates: {}, status: {}, hp: 10000, maxHp: 10000, mana: 100, maxMana: 100, armor: 3, moveSpeed: 1, distanceScale: 1 / 3, facing: 0, worldX: x, worldY: y, side, ownerId: side === 'defender' ? 0 : null, team: side === 'defender' ? 0 : 1, battleTeam: 0, traits: [], isHero: false, ...extra };
      this.state.entities.push(e); return e;
    },
    human(ids = ['A2YA', 'A2YB', 'A2YC', 'A2YD'], extra = {}) { return this.add(ids, YSERA_FORMS.human, 'defender', 0, 0, extra); },
    dragon(ids = ['A2YE', 'A2YF', 'A2YG', 'A2YH', 'A2YI'], extra = {}) { return this.add(ids, YSERA_FORMS.dragon, 'defender', 0, 0, extra); },
    cast(e, id, params = {}) { return castYseraAbility(this, e, id, params, api); },
    auto(e) { return tryYseraAutoCast(this, e, api); },
    tick(time) { this.state.time = time; const pending = this.state.sourceSkillJobs, remaining = []; for (const job of pending) if (tickYseraJob(this, job, api)) remaining.push(job); this.state.sourceSkillJobs = remaining; },
    kill(e, clear = true) { e.hp = 0; sourceYseraDeath(this, e, api); if (clear) this.state.entities = this.state.entities.filter(t => t.hp > .405 && !t.status.yseraRemoved); },
  };
  const api = {
    scriptInvulnerable: e => !!e.invulnerable || e.skillSpecs?.some(s => s.id === 'Avul'),
    universalDamage(game, target, amount, source) { if (target.hp <= .405 || this.scriptInvulnerable(target)) return 0; game.hits.push({ id: target.id, sourceId: source.id, amount }); target.hp -= amount; if (target.hp <= .405) sourceYseraDeath(game, target, api); return amount; },
    applyCorrosion(game, source, target) { if (source.skillSpecs?.some(s => s.id === 'A2YH') && target.hp > .405) game.corrosion.push({ targetId: target.id, sourceId: source.id }); },
    // Native dummy spell execution is a host API boundary. Record its exact
    // source duration instead of pretending that level 0 has known semantics.
    pauseUnitEx(game, source, target, duration) { game.pauses.push({ sourceId: source.id, targetId: target.id, duration }); },
    spawnUnit(game, source, rawcode, extra) { const def = V14_UNIT_TEMPLATES[rawcode]; return game.add(def.abilityIds, rawcode, source.side, source.worldX, source.worldY, { ownerId: source.ownerId, buildingId: source.buildingId, team: source.team, battleTeam: source.battleTeam, hp: def.hp, maxHp: def.hp, maxMana: def.mana, mana: def.manaStart, armor: def.armor, traits: def.unitType.split(','), ...extra }); },
    removeUnit(game, e) { game.state.entities = game.state.entities.filter(t => t.id !== e.id); },
    isLivingOwner(game, e) { return game.state.players[e.ownerId]?.alive !== false; },
  };
  return { g, api };
}

const jobsOf = (g, type) => g.state.sourceSkillJobs.filter(j => j.type === type);
const cool = (e, ids, at = 100) => { for (const id of ids) e.skillStates[id] = { yseraAutoReadyAt: at, casts: 0 }; };

test('seven source active skills expose forms, object costs, source lines, and the precise unresolved native helper boundary', () => {
  assert.equal(Object.keys(YSERA_ACTIVE_RULES).length, 7);
  for (const [id, rule] of Object.entries(YSERA_ACTIVE_RULES)) { assert.equal(isYseraActiveAbility(id), true); assert.ok(rule.sourceLines); assert.ok(rule.description); assert.equal(rule.manaCost, id === 'A2YC' ? 20 : 10); }
  assert.equal(YSERA_ACTIVE_RULES.A2YE.status, 'partial'); assert.match(YSERA_ACTIVE_RULES.A2YE.partial, /等级语义/);
  assert.equal(YSERA_ACTIVE_RULES.A2YD.range, 700); assert.equal(YSERA_ACTIVE_RULES.A2YD.cooldown, 16); assert.equal(isYseraActiveAbility('A2YI'), false);
  assert.equal(isYseraJobType('ysera_mind_disrupt'), true); assert.equal(isYseraJobType('ysera_wake'), false, 'existing emerald-revival jobs must stay with their original handler');
});

test('only the actual combat form may cast its own active abilities', () => {
  const { g } = fixture(), human = g.human(), dragon = g.dragon(), building = g.add(['A2YA', 'A2YD'], 'h0YM', 'defender');
  assert.equal(canYseraCastAbility(human, 'A2YD'), true); assert.equal(canYseraCastAbility(dragon, 'A2YF'), true); assert.equal(canYseraCastAbility(building, 'A2YD'), false);
  human.skillSpecs.push({ id: 'A2YF' }); dragon.skillSpecs.push({ id: 'A2YD' }); assert.equal(canYseraCastAbility(human, 'A2YF'), false); assert.equal(canYseraCastAbility(dragon, 'A2YD'), false);
  assert.equal(g.cast(building, 'A2YA', { point: { x: 1, y: 0 } }).ok, false); near(building.mana, 100);
});

test('human automatic priorities preserve awakening, mind disruption, sleep, then entangling', () => {
  for (const [disabled, expected] of [[[], 'A2YC'], [['A2YC'], 'A2YD'], [['A2YC', 'A2YD'], 'A2YB'], [['A2YC', 'A2YD', 'A2YB'], 'A2YA']]) {
    const { g } = fixture(), human = g.human(); g.add([], 'enemy', 'monster', 1); cool(human, disabled);
    assert.equal(g.auto(human), expected); assert.equal(human.skillStates[expected].casts, 1); near(human.mana, expected === 'A2YC' ? 80 : 90);
    if (expected === 'A2YC') { assert.equal(human.status.yseraHidden, true); assert.equal(jobsOf(g, 'ysera_mind_disrupt').length, 0); }
  }
});

test('dragon automatic priorities preserve breath, mind destruction, then nightmare shots', () => {
  for (const [disabled, expected] of [[[], 'A2YF'], [['A2YF'], 'A2YE'], [['A2YF', 'A2YE'], 'A2YG']]) {
    const { g } = fixture(), dragon = g.dragon(); g.add([], 'enemy', 'monster', 1); cool(dragon, disabled);
    assert.equal(g.auto(dragon), expected); assert.equal(dragon.skillStates[expected].casts, 1); near(dragon.mana, 90);
  }
});

test('automatic casts respect busy, emerald sleep, hidden/invulnerable bodies, and available mana', () => {
  for (const extra of [{ status: { yseraCastBusyUntil: 1 } }, { status: { yseraSleepingUntil: 1 } }, { status: { yseraHidden: true } }, { invulnerable: true }, { mana: 9 }]) {
    const { g } = fixture(), human = g.human(undefined, extra); g.add([], 'enemy', 'monster', 1); assert.equal(g.auto(human), null); assert.equal(g.state.sourceSkillJobs.length, 0);
  }
});

test('manual native cooldown and scripted automatic cooldown remain separate and debit mana once', () => {
  const { g } = fixture(), human = g.human(['A2YD']), target = g.add([], 'enemy', 'monster', 1);
  assert.equal(g.cast(human, 'A2YD', { target }).ok, true); near(human.mana, 90); near(human.skillStates.A2YD.readyAt, 16); assert.equal(human.skillStates.A2YD.yseraAutoReadyAt, undefined);
  assert.equal(g.auto(human), null); g.state.time = 3.2; assert.equal(g.auto(human), 'A2YD'); near(human.mana, 80); near(human.skillStates.A2YD.yseraAutoReadyAt, 19.2);
  assert.equal(g.cast(human, 'A2YD', { target }).ok, false); g.state.time = 16; assert.equal(g.cast(human, 'A2YD', { target }).ok, true); near(human.mana, 70); assert.equal(human.skillStates.A2YD.casts, 3);
});

test('manual cast validation rejects out-of-range or invalid points without changing resources', () => {
  const { g } = fixture(), human = g.human(['A2YA']);
  assert.equal(g.cast(human, 'A2YA', { point: { x: 2.001, y: 0 } }).ok, false); assert.equal(g.cast(human, 'A2YA', { point: { x: NaN, y: 0 } }).ok, false); near(human.mana, 100); assert.equal(g.state.sourceSkillJobs.length, 0);
});

test('mind disruption snapshots three targets in source enumeration order and deals exactly three ninety-damage pulses', () => {
  const { g } = fixture(), human = g.human(['A2YD']), main = g.add([], 'main', 'monster', 1), enumeratedFirst = g.add([], 'first', 'monster', 2.4), nearSecond = g.add([], 'second', 'monster', 1.1), excludedFourth = g.add([], 'fourth', 'monster', 1.2), immune = g.add(['Amim'], 'immune', 'monster', 1.1);
  assert.equal(g.cast(human, 'A2YD', { target: main }).ok, true); assert.deepEqual(jobsOf(g, 'ysera_mind_disrupt')[0].targetIds, [main.id, enumeratedFirst.id, nearSecond.id]);
  g.tick(0); near(main.hp, 9910); near(enumeratedFirst.hp, 9910); near(nearSecond.hp, 9910); near(excludedFourth.hp, 10000); near(immune.hp, 10000); near(main.moveSpeed, .65);
  enumeratedFirst.worldX = 100; g.tick(.999); near(main.hp, 9910); g.tick(1); near(main.hp, 9820); near(enumeratedFirst.hp, 9820); g.tick(2); near(main.hp, 9730); near(enumeratedFirst.hp, 9730); assert.equal(jobsOf(g, 'ysera_mind_disrupt').length, 0);
  g.tick(3.499); near(main.moveSpeed, .65); g.tick(3.5); near(main.moveSpeed, 1);
});

test('mind disruption retains the original final pulse after caster death, then terminates', () => {
  const { g } = fixture(), human = g.human(['A2YD']), target = g.add(['Amim'], 'enemy', 'monster', 1);
  g.cast(human, 'A2YD', { target }); g.tick(0); near(target.hp, 9910); g.kill(human); g.tick(1); near(target.hp, 9820); assert.equal(jobsOf(g, 'ysera_mind_disrupt').length, 0); g.tick(2); near(target.hp, 9820);
});

test('entangling uses a single 180-radius point, four delayed damage ticks, and survives caster death', () => {
  const { g } = fixture(), human = g.human(['A2YA']), target = g.add(['Amim'], 'enemy', 'monster', 1), edge = g.add([], 'edge', 'monster', 1.599), outside = g.add([], 'outside', 'monster', 1.601), ally = g.add([], 'ally', 'defender', 1), invul = g.add(['Avul'], 'invulnerable', 'monster', 1);
  g.cast(human, 'A2YA', { point: { x: 1, y: 0 } }); assert.equal(g.pauses.length, 2); assert.ok(g.pauses.every(p => p.duration === 4)); near(target.hp, 10000); g.kill(human);
  g.tick(.999); near(target.hp, 10000); g.tick(1); near(target.hp, 9970); edge.worldX = 20; g.tick(4); near(target.hp, 9880); near(edge.hp, 9880); near(outside.hp, 10000); near(ally.hp, 10000); near(invul.hp, 10000); assert.equal(jobsOf(g, 'ysera_entangle').length, 0); g.tick(5); near(target.hp, 9880);
});

test('sleep curse applies its forward offset circle and native classification filters, not hero UI labels', () => {
  const { g } = fixture(), human = g.human(['A2YB']), uiHero = g.add([], 'altar-ui', 'monster', 1.6, 0, { isHero: true, isNativeHero: false }), native = g.add([], 'native-hero', 'monster', 1.6, 0, { isHero: true, isNativeHero: true }), building = g.add([], 'building', 'monster', 1.6, 0, { isBuilding: true }), summon = g.add([], 'summon', 'monster', 1.6, 0, { isSummon: true }), nativeSummon = g.add([], 'native-summon', 'monster', 1.6, 0, { traits: ['summoned'] }), immune = g.add(['Amim'], 'immune', 'monster', 1.6), behind = g.add([], 'behind', 'monster', -.01), farSide = g.add([], 'side', 'monster', 1.6, 1.067);
  g.cast(human, 'A2YB'); near(uiHero.hp, 9800); near(immune.hp, 9800); for (const t of [native, building, summon, nativeSummon, behind, farSide]) near(t.hp, 10000); assert.equal(g.pauses.length, 2); assert.ok(g.pauses.every(p => p.duration === 3)); near(human.status.yseraCastBusyUntil, 3.2);
});

test('mind destruction follows the caster current position and heading for four pulses and preserves the level-zero helper call', () => {
  const { g } = fixture(), dragon = g.dragon(['A2YE', 'A2YH']), horizontal = g.add([], 'horizontal', 'monster', 1), vertical = g.add([], 'vertical', 'monster', 0, 1), behind = g.add([], 'behind', 'monster', -1, -1), moved = g.add([], 'moved', 'monster', 5, 1);
  g.cast(dragon, 'A2YE'); g.tick(0); near(horizontal.hp, 9850); near(vertical.hp, 10000); dragon.facing = 90; g.tick(1); near(horizontal.hp, 9850); near(vertical.hp, 9850); dragon.worldX = 5; g.tick(2); near(moved.hp, 9850); g.tick(3); near(moved.hp, 9700); near(behind.hp, 10000);
  assert.equal(jobsOf(g, 'ysera_mind_destroy').length, 0); assert.equal(g.pauses.length, 4); assert.ok(g.pauses.every(p => p.duration === .5)); assert.equal(g.corrosion.length, 4);
});

test('mind destruction cancels its remaining pulses if its caster dies', () => {
  const { g } = fixture(), dragon = g.dragon(['A2YE']), target = g.add([], 'enemy', 'monster', 1); g.cast(dragon, 'A2YE'); g.tick(0); g.kill(dragon); g.tick(1); near(target.hp, 9850); assert.equal(jobsOf(g, 'ysera_mind_destroy').length, 0);
});

test('green breath fixes its origin and heading, hits five times, and restores only its own sixty armor at 5.2 seconds', () => {
  const { g } = fixture(), dragon = g.dragon(['A2YF', 'A2YH']), target = g.add(['Amim'], 'original-corridor', 'monster', 1), moved = g.add([], 'new-corridor', 'monster', 10, 1), outside = g.add([], 'outside-width', 'monster', 1, .401);
  g.cast(dragon, 'A2YF'); near(target.hp, 9840); near(dragon.armor, 63); dragon.worldX = 10; dragon.facing = 90; dragon.armor += 7; g.tick(4); near(target.hp, 9200); near(moved.hp, 10000); near(outside.hp, 10000); near(dragon.armor, 70); g.tick(5); near(target.hp, 9200); assert.equal(jobsOf(g, 'ysera_green_breath').length, 0);
  g.tick(5.199); near(dragon.armor, 70); g.tick(5.2); near(dragon.armor, 10); near(dragon.status.yseraCastBusyUntil, 5.2);
});

test('nightmare shoots six independently selected targets, allows repeats, and unpauses at four seconds', () => {
  const { g } = fixture(), dragon = g.dragon(['A2YG']), target = g.add(['Amim'], 'repeat-target', 'monster', 2), invul = g.add(['Avul'], 'invulnerable', 'monster', 1);
  g.cast(dragon, 'A2YG'); assert.equal(dragon.invulnerable, true); assert.equal(dragon.status.yseraPaused, true); g.tick(.599); near(target.hp, 10000); g.tick(.6); near(target.hp, 9820); near(target.moveSpeed, .7); g.tick(3.6); near(target.hp, 8920); near(invul.hp, 10000); assert.equal(jobsOf(g, 'ysera_nightmare').length, 0);
  g.tick(3.999); assert.equal(dragon.invulnerable, true); g.tick(4); assert.equal(dragon.invulnerable, false); assert.equal(dragon.status.yseraPaused, false); near(dragon.status.yseraCastBusyUntil, 4.2); g.tick(5.6); near(target.moveSpeed, 1); near(target.hp, 8920);
});

test('different Ysera slow abilities refresh one saved base speed instead of multiplying reductions', () => {
  const { g } = fixture(), human = g.human(['A2YD']), dragon = g.dragon(['A2YG']), target = g.add([], 'enemy', 'monster', 1, 0, { moveSpeed: 2 });
  g.cast(human, 'A2YD', { target }); g.tick(0); near(target.moveSpeed, 1.3); g.cast(dragon, 'A2YG'); g.tick(.6); near(target.moveSpeed, 1.4); assert.equal(target.status.yseraMoveSlow.baseSpeed, 2); g.tick(5.6); near(target.moveSpeed, 2);
});

test('awakening preserves life fraction, creates a summoned dragon, and returns position and life without a death payout', () => {
  const { g } = fixture(), human = g.human(['A2YC'], { hp: 1875, maxHp: 3750, mana: 40, buildingId: 'ysera-building' }), inner = g.add([], 'inner', 'monster', .5), outer = g.add([], 'outer', 'monster', 1.2), outside = g.add([], 'outside', 'monster', 1.501);
  g.cast(human, 'A2YC'); const dragon = g.state.entities.find(e => e.combatRawcode === 'h0YO'); assert.ok(dragon); near(dragon.hp, 2000); near(dragon.mana, 10); assert.equal(dragon.isSummon, true); assert.equal(dragon.ownerId, human.ownerId); assert.equal(dragon.buildingId, human.buildingId); assert.equal(human.invulnerable, true); assert.equal(human.status.yseraHidden, true); assert.equal(human.status.yseraPaused, true);
  near(inner.hp, 9800); near(outer.hp, 9900); near(outside.hp, 10000); assert.ok(g.pauses.every(p => p.duration === 1.5)); dragon.worldX = 3; dragon.worldY = 4; dragon.facing = 145; dragon.hp = 1000; g.tick(15.999); assert.equal(human.status.yseraHidden, true); g.tick(16); near(human.hp, 937.5); near(human.worldX, 3); near(human.worldY, 4); near(human.facing, 145); assert.equal(human.status.yseraDragonActive, false); assert.equal(human.invulnerable, false); assert.equal(human.status.yseraPaused, false); assert.ok(!g.state.entities.includes(dragon)); assert.equal(jobsOf(g, 'ysera_death_awaken').length, 0);
});

test('a temporary dragon death returns its human immediately with at least ten percent HP and cannot schedule permanent revival', () => {
  const { g } = fixture(), human = g.human(['A2YC'], { hp: 3750, maxHp: 3750 }); g.cast(human, 'A2YC'); const dragon = g.state.entities.find(e => e.combatRawcode === 'h0YO'); dragon.worldX = 2; g.kill(dragon); near(human.hp, 375); near(human.worldX, 2); assert.equal(human.status.yseraHidden, false); assert.equal(jobsOf(g, 'ysera_death_awaken').length, 0); g.tick(16); assert.equal(g.state.entities.filter(e => e.combatRawcode === 'h0YO').length, 0); near(human.hp, 375);
});

test('timed dragon removal cancels its remaining spell jobs without creating death rewards', () => {
  const { g } = fixture(), human = g.human(['A2YC']); g.cast(human, 'A2YC'); const dragon = g.state.entities.find(e => e.combatRawcode === 'h0YO'); dragon.worldX = 0; dragon.facing = 0; dragon.mana = 20; const target = g.add([], 'enemy', 'monster', 1); g.state.time = 15; g.cast(dragon, 'A2YF'); near(target.hp, 9840); g.tick(16); near(target.hp, 9840); assert.equal(jobsOf(g, 'ysera_green_breath').length, 0); assert.equal(jobsOf(g, 'ysera_death_awaken').length, 0);
});

test('human death awakens a fresh permanent dragon after three seconds, independent of corpse cleanup', () => {
  const { g } = fixture(), human = g.human(['A2YC']), enemy = g.add([], 'enemy', 'monster', .5); g.kill(human); g.tick(2.999); assert.equal(g.state.entities.filter(e => e.combatRawcode === 'h0YO').length, 0); g.tick(3);
  const dragon = g.state.entities.find(e => e.combatRawcode === 'h0YO'); assert.ok(dragon); near(dragon.hp, 4000); near(dragon.mana, 10); assert.equal(dragon.status.yseraDragonParentId, undefined); assert.equal(dragon.status.yseraRevivalCount, 0); assert.equal(dragon.isSummon, true); near(enemy.hp, 9800); assert.equal(g.corrosion.length, 1); assert.equal(jobsOf(g, 'ysera_dragon_return').length, 0);
});

test('human death awakening rejects illusions, missing owners, and owners no longer living at timer completion', () => {
  for (const extra of [{ isIllusion: true }, { ownerId: null }, { ownerId: 0, inactiveOwner: true }]) {
    const { g } = fixture(), human = g.human(['A2YC'], extra); if (extra.inactiveOwner) g.state.players[0].alive = false; g.kill(human); g.tick(3); assert.equal(g.state.entities.filter(e => e.combatRawcode === 'h0YO').length, 0);
  }
});

test('serialized jobs preserve form-return state and pending damage target snapshots', () => {
  const { g } = fixture(), human = g.human(['A2YC'], { hp: 1875, maxHp: 3750 }); g.cast(human, 'A2YC'); let dragon = g.state.entities.find(e => e.combatRawcode === 'h0YO'); const target = g.add([], 'enemy', 'monster', 1); dragon.mana = 30; g.cast(dragon, 'A2YE'); g.tick(0); near(target.hp, 9850);
  g.state = JSON.parse(JSON.stringify(g.state)); g.tick(3); const restoredTarget = g.state.entities.find(e => e.id === target.id); near(restoredTarget.hp, 9400); dragon = g.state.entities.find(e => e.id === dragon.id); dragon.hp = 200; g.tick(16); const restoredHuman = g.state.entities.find(e => e.id === human.id); near(restoredHuman.hp, 375); assert.equal(restoredHuman.status.yseraHidden, false);
});
