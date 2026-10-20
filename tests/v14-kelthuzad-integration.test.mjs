import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../dist/engine.js';
import { UNIT_TEMPLATES, UNITS, RULES } from '../dist/data.js';
import { sourceAuraEffects, tickSourceSkills, tickSourceScriptJobs, initializeSourceSkills, compileSkills } from '../dist/skills.js';
import { laneToWorld } from '../dist/layout.js';

const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-7, `${a} != ${b}`);
const origin = laneToWorld(0, 3, 6);
const has = (e, id) => e.skillSpecs?.some(s => s.id === id);
function fixture() {
  const game = new Game({ mode: 'sandbox', seed: 739 }); game.state.phase = 'combat'; game.state.time = 0; game.state.entities = []; game.state.sourceSkillJobs = [];
  for (const p of game.state.players) { p.buildings = []; p.nagaFarmerGoldRate = 0; }
  return game;
}
function add(game, code, options = {}) {
  const { skills, ...extra } = options;
  const e = game._entity(UNIT_TEMPLATES[code], { ownerId: 0, team: 0, side: 'defender', battleTeam: 0, laneId: 0, sourceLaneId: 0, worldX: origin.x, worldY: origin.y, ...extra });
  if (skills) e.skillSpecs = e.skillSpecs.filter(s => skills.includes(s.id));
  game.state.entities.push(e); game._ensureWorld(e); return e;
}
function enemy(game, extra = {}) { const e = add(game, 'h002', { skills: [], ownerId: null, team: 1, side: 'monster', worldX: origin.x + 1, ...extra }); e.hp = e.maxHp = 10000; e.armor = 0; e.mana = 0; return e; }
function deploy(game, code) {
  const def = UNITS.find(u => !u.legacy && u.sourceRawcode === code); assert.ok(def, code);
  const player = game.state.players[0], b = { id: `kel-integration-${player.buildings.length}`, unitId: def.id, col: player.buildings.length, row: 0 };
  player.buildings.push(b); game._spawnDefender(def, player, 3, 6, b.id);
  return { building: b, entity: game.state.entities.find(e => e.buildingId === b.id), def };
}
function sourceArthasFixture(game) {
  // This is an explicitly injected native-source fixture, not a claim that
  // the current Web build menu exports the BoxGift h0DV -> n02S branch.
  // JASS 2596 registers that branch; 17508-17509 maps n02S to h0M0.
  const def = { ...UNIT_TEMPLATES.h0M0, id: 'v14_n02S', sourceRawcode: 'n02S', combatRawcode: 'h0M0' }, player = game.state.players[0];
  const building = { id: `native-source-${player.buildings.length}`, unitId: 'v14_n02S', sourceRawcode: 'n02S', col: player.buildings.length, row: 0 };
  player.buildings.push(building); game._spawnDefender(def, player, 3, 6, building.id);
  return { building, entity: game.state.entities.find(e => e.buildingId === building.id), def };
}
const cast = (g, e, id, t) => g.command('cast', { entityId: e.id, skillId: id, targetId: t?.id });
const tick = (g, time) => { g.state.time = time; tickSourceScriptJobs(g); };
function finite(value, path = 'state', seen = new Set()) { if (typeof value === 'number') assert.ok(Number.isFinite(value), path); if (!value || typeof value !== 'object' || seen.has(value)) return; seen.add(value); for (const [key, child] of Object.entries(value)) finite(child, `${path}.${key}`, seen); }

test('actual Kel building/skin deployments create the proper combat clone, full mana and one prepared self-only chain aura', () => {
  for (const [buildingCode, combatCode] of [['h0PJ', 'h0PI'], ['h0TC', 'h0TD'], ['h0WU', 'h0WT']]) {
    const g = fixture(), { entity: e } = deploy(g, buildingCode); assert.equal(e.combatRawcode, combatCode); near(e.mana, e.maxMana); assert.equal(e.status.kelthuzadAmuletCharges, 1); assert.equal(has(e, 'A0ZU'), true);
    near(sourceAuraEffects(g, e, [e]).damage, .5); const friend = add(g, 'h0PI', { skills: [] }); near(sourceAuraEffects(g, friend, [e]).damage, 0);
    initializeSourceSkills(g, e); near(sourceAuraEffects(g, e, [e]).damage, .5); assert.equal(g.state.sourceSkillJobs.filter(j => j.type === 'kelthuzad_decay').length, 1);
  }
});

test('actual Kel alliance grants the injected native Arthas body/building once and persists helpers into a later source deployment', () => {
  const g = fixture(), arthas = sourceArthasFixture(g), base = arthas.entity.damage, kel = deploy(g, 'h0PJ');
  assert.equal(kel.entity.status.kelthuzadAmuletCharges, 2); assert.equal(has(arthas.building, 'A0ZY'), true); assert.equal(arthas.building.damage, undefined);
  // The native group includes already existing h0M0 as well as n02S, so the
  // current body receives helpers during Kel registration, not on a later tick.
  assert.equal(has(arthas.entity, 'A0ZV'), true); assert.equal(has(arthas.entity, 'A0ZW'), true); assert.equal(has(arthas.entity, 'A0ZY'), true); near(arthas.entity.damage, base + 100); near(sourceAuraEffects(g, arthas.entity, []).armor, 10);
  finite(g.state); const restored = Game.fromSnapshot(JSON.parse(JSON.stringify(g.snapshot()))); finite(restored.state);
  const saved = restored.state.entities.find(e => e.id === arthas.entity.id); near(saved.damage, base + 100);
  restored.state.entities = []; restored.state.sourceSkillJobs = []; restored._spawnDefender(arthas.def, restored.state.players[0], 3, 6, arthas.building.id);
  const next = restored.state.entities[0]; near(next.damage, base + 100); near(sourceAuraEffects(restored, next, []).armor, 10); assert.equal(has(next, 'A0ZY'), false); finite(restored.state);
});

test('a preexisting original-building Y marker applies V/W exactly once without adding the Y marker to its combat clone', () => {
  const g = fixture(), result = sourceArthasFixture(g); result.building.skillSpecs = compileSkills({ abilityIds: ['A0ZY'], skillVersion: 'v14.1A5', distanceScale: 1 / 3 });
  const base = result.entity.damage; initializeSourceSkills(g, result.entity); initializeSourceSkills(g, result.entity);
  near(result.entity.damage, base + 100); assert.equal(has(result.entity, 'A0ZY'), false); near(sourceAuraEffects(g, result.entity, []).armor, 10);
});

test('only actual attack-damage events auto-order frost nova and shadow crack; generic ticking and spell damage do not', () => {
  const g = fixture(), e = add(g, 'h0PI', { skills: ['A0ZO', 'A0ZZ'] }), t = enemy(g); e.mana = 100;
  const battle = g.state.entities; battle.auras = [];
  tickSourceSkills(g, e, battle, .1); near(e.mana, 100); assert.equal(e.skillStates.A0ZO.casts, 0);
  g._hurt(t, 100, e, { spell: true, universal: true }); near(e.mana, 100); assert.equal(g.state.sourceSkillJobs.length, 0);
  g._hurt(t, 100, e, { weapon: true, universal: true }); near(e.mana, 53); assert.equal(e.skillStates.A0ZO.casts, 1); assert.equal(e.skillStates.A0ZZ.casts, 1); assert.equal(g.state.sourceSkillJobs.filter(j => j.type === 'kelthuzad_shadow_crack').length, 1);
});

test('native nova manual command pays native cost/CD, damages main for 750 and area for 250, adds native frost and self backlash once', () => {
  const g = fixture(), e = add(g, 'h0PI', { skills: ['A0ZO'] }), main = enemy(g), nearby = enemy(g, { worldX: origin.x + 1.3 }), far = enemy(g, { worldX: origin.x + 2 }); e.mana = 100;
  const hp = e.hp; assert.equal(cast(g, e, 'A0ZO', main).ok, true); near(e.mana, 60); near(main.hp, 9250); near(nearby.hp, 9750); near(far.hp, 10000);
  const frost = main.buffs.find(b => b.key === 'Bfro'); assert.ok(frost); near(frost.expiresAt, 3); near(frost.haste, -RULES.frostAttackSpeedDecrease); near(frost.move, -RULES.frostMoveSpeedDecrease); assert.equal(main.status.stunUntil, undefined);
  near(e.hp, hp - 200 * g._typeMultiplier('spells', e.armorType, e.sourceArmorTypeRaw) * g._armorFactor(e.armor));
  assert.equal(e.skillStates.A0ZO.readyAt, 5); assert.equal(cast(g, e, 'A0ZO', main).ok, false); near(e.mana, 60);
  const state = g.unitSkillStatus(e.id).find(s => s.id === 'A0ZO'); assert.equal(state.cooldownMode, 'shared_native'); near(state.autoRemaining, 5); assert.equal(state.status, 'partial');
});

test('native nova still executes when the shared source effect trigger is disabled, while its self backlash stays suppressed', () => {
  const g = fixture(), e = add(g, 'h0PI', { skills: ['A0ZO'] }), t = enemy(g); e.mana = 100; const hp = e.hp; g._sourceAbilityEffectDepth = 1;
  assert.equal(cast(g, e, 'A0ZO', t).ok, true); near(t.hp, 9250); near(e.hp, hp); near(e.mana, 60); assert.equal(g._sourceAbilityEffectDepth, 1);
});

test('a chain copies the pre-death event damage and pauses/pulls both participants through real host movement hooks', () => {
  const g = fixture(), e = add(g, 'h0PI', { skills: ['A0ZR'] }), main = enemy(g, { worldX: origin.x }), secondary = enemy(g, { worldX: origin.x + 1.2 });
  g._hurt(main, 123, e, { weapon: true, universal: true }); near(main.hp, 9877); near(secondary.hp, 9877); assert.equal(has(e, 'A0ZS'), false); assert.equal(main.status.sourcePaused, true); assert.equal(secondary.status.sourcePaused, true);
  tick(g, .04); tick(g, .08); tick(g, .12); near(main.hp, 9577); near(secondary.hp, 9577); assert.equal(main.status.sourcePaused, false); assert.equal(secondary.status.sourcePaused, false);
  assert.ok(main.status.stunUntil > .12); assert.ok(secondary.status.stunUntil > .08); tick(g, 3); assert.equal(has(e, 'A0ZS'), true);
});

test('a truly lethal attack still starts the source chain before original victim death cleanup', () => {
  const g = fixture(), e = add(g, 'h0PI', { skills: ['A0ZR'] }), main = enemy(g, { worldX: origin.x }), secondary = enemy(g, { worldX: origin.x + 1.2 }); main.hp = 10;
  g._hurt(main, 123, e, { weapon: true, universal: true }); assert.ok(main.hp <= 0); assert.equal(main.status.sourcePaused, false); assert.equal(secondary.status.sourcePaused, true); near(secondary.hp, 9877);
  tick(g, .12); near(secondary.hp, 9577); assert.equal(secondary.status.sourcePaused, false);
});

test('without a native AOre bridge amulet summoning remains operational but true death is not hidden by a fake resurrection', () => {
  const g = fixture(), e = add(g, 'h0PI', { skills: ['A0ZQ'] }), attacker = enemy(g); e.mana = 23; e.skillStates.A0ZZ = { readyAt: 9, casts: 2 };
  g._hurt(e, e.hp + 1, attacker, { spell: true, universal: true }); assert.ok(e.hp <= 0); assert.equal(e.status.deathCounted, true); assert.equal(e.status.sourceDeathHandled, true);
  assert.deepEqual(g.state.entities.filter(t => t.isSummon).map(t => t.combatRawcode), ['h0CZ', 'h0CL', 'h0CL']); assert.equal(g.state.entities.filter(t => t.combatRawcode === 'h0PI').length, 1);
  const count = g.state.entities.length; g._sourceDeath(e, attacker); assert.equal(g.state.entities.length, count); near(e.mana, 23); assert.equal(e.skillStates.A0ZZ.readyAt, 9);
  tick(g, 1.01); assert.equal(has(e, 'A0ZU'), false); assert.ok(e.hp <= 0); finite(g.state);
});

test('real delayed crack survives source corpse cleanup and JSON restore while target death cancels its own job', () => {
  const g = fixture(), e = add(g, 'h0PI', { skills: ['A0ZZ'] }), t = enemy(g); e.mana = 100;
  assert.equal(cast(g, e, 'A0ZZ', t).ok, true); g._hurt(e, e.hp + 1, t, { spell: true, universal: true }); g.state.entities = g.state.entities.filter(n => n.hp > 0);
  const restored = Game.fromSnapshot(JSON.parse(JSON.stringify(g.snapshot()))); tick(restored, 3); near(restored.state.entities.find(n => n.id === t.id).hp, 2000); finite(restored.state);
  const next = add(restored, 'h0PI', { skills: ['A0ZZ'] }), target = enemy(restored); next.mana = 100; assert.equal(cast(restored, next, 'A0ZZ', target).ok, true); restored._hurt(target, target.hp + 1, next, { spell: true, universal: true }); tick(restored, 6); assert.equal(restored.state.sourceSkillJobs.filter(j => j.type === 'kelthuzad_shadow_crack').length, 0);
});

test('the actual weapon attack gets prepared self aura damage once and copies that exact damage to its chain target', () => {
  const g = fixture(), e = add(g, 'h0PI', { skills: ['A0ZR'] }), main = enemy(g, { worldX: origin.x }), secondary = enemy(g, { worldX: origin.x + 1.2 });
  g._battleAuras = [[e], []]; const battle = [e, main, secondary]; battle.auras = [e];
  const first = e.damage * 1.5 * g._typeMultiplier(e.attackType, main.armorType, main.sourceArmorTypeRaw);
  g._attack(e, main, battle); near(main.hp, 10000 - first); near(secondary.hp, 10000 - first); assert.equal(has(e, 'A0ZS'), false);
  const second = e.damage * g._typeMultiplier(e.attackType, main.armorType, main.sourceArmorTypeRaw);
  g._attack(e, main, battle); near(main.hp, 10000 - first - second); near(secondary.hp, 10000 - first);
});

test('an old-revision Kel save preserves HP/mana/state and starts newly activated aura timers at load time', () => {
  const g = fixture(), e = add(g, 'h0PI', { skills: ['A0ZN'] }), target = enemy(g); g.state.time = 100; e.createdAt = 2; e.hp = 1234; e.mana = 17;
  e.status = {}; e.skillImplementationRevision = 'before-kel-content'; e.skillSpecs = e.skillSpecs.map(s => ({ ...s, status: 'pending' })); e.skillStates.A0ZN = { readyAt: 41, casts: 5 }; g.state.sourceSkillJobs = [];
  const restored = Game.fromSnapshot(JSON.parse(JSON.stringify(g.snapshot()))), body = restored.state.entities.find(n => n.id === e.id), savedTarget = restored.state.entities.find(n => n.id === target.id);
  assert.equal(body.status.sourceSkillsRestoredAt, 100); restored._ensureWorld(body);
  near(body.hp, 1234); near(body.mana, 17); assert.deepEqual(body.skillStates.A0ZN, { readyAt: 41, casts: 5 }); assert.equal(body.status.kelthuzadRegisteredAt, 100);
  assert.equal(restored.state.sourceSkillJobs.find(j => j.type === 'kelthuzad_decay').nextAt, 101); tick(restored, 100); near(savedTarget.hp, 10000); tick(restored, 101); near(savedTarget.hp, 9750); finite(restored.state);
});
