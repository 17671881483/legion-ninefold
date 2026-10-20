import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../dist/engine.js';
import { UNIT_TEMPLATES, UNITS, RULES } from '../dist/data.js';
import { sourceAuraEffects, sourceOnHit, tickSourceScriptJobs, initializeSourceSkills } from '../dist/skills.js';
import { laneToWorld, kingWorld } from '../dist/layout.js';

const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-7, `${a} != ${b}`);
const origin = laneToWorld(0, 3, 6);
const has = (e, id) => e.skillSpecs?.some(s => s.id === id);
function fixture() {
  const game = new Game({ mode: 'sandbox', seed: 183 });
  game.state.phase = 'combat'; game.state.time = 0; game.state.entities = []; game.state.sourceSkillJobs = [];
  for (const p of game.state.players) { p.buildings = []; p.nagaFarmerGoldRate = 0; }
  return game;
}
function add(game, code = 'h002', extra = {}) {
  const e = game._entity(UNIT_TEMPLATES[code], { ownerId: null, team: 1, side: 'monster', battleTeam: 0, laneId: 0, sourceLaneId: 0, worldX: origin.x + 1, worldY: origin.y, ...extra });
  e.mana = 0; game.state.entities.push(e); game._ensureWorld(e); return e;
}
function deploy(game, buildingCode, buildingExtra = {}) {
  const def = UNITS.find(u => !u.legacy && u.sourceRawcode === buildingCode); assert.ok(def, buildingCode);
  const player = game.state.players[0], building = { id: `family-${player.buildings.length}`, unitId: def.id, col: 0, row: 0, ...buildingExtra };
  player.buildings.push(building); game._spawnDefender(def, player, 3, 6, building.id);
  const entity = game.state.entities.find(e => e.buildingId === building.id); entity.mana = 0;
  return { entity, building, def };
}
const kill = (game, killer, target = add(game)) => { target.hp = 1; game._hurt(target, 2, killer, { spell: true, universal: true }); return target; };
function finiteNumbers(value, path = 'state', seen = new Set()) {
  if (typeof value === 'number') assert.ok(Number.isFinite(value), `${path} must be finite, got ${value}`);
  if (!value || typeof value !== 'object' || seen.has(value)) return;
  seen.add(value); for (const [key, child] of Object.entries(value)) finiteNumbers(child, `${path}.${key}`, seen);
}

test('deployed Illidan kills persist on the building, revive once, and never invent numeric building damage', () => {
  const game = fixture(), { entity: e, building, def } = deploy(game, 'n06U'), base = e.damage;
  assert.equal(e.status.illidanSoulRegistered, true); assert.equal(building.damage, undefined); game._random = () => 0;
  kill(game, e); kill(game, e); assert.equal(e.abilityLevels.A1BD, 2); assert.equal(building.abilityLevels.A1BD, 2); near(e.damage, base + 2); assert.equal(building.damage, undefined);
  const attacker = add(game); game._hurt(e, e.hp + 1, attacker, { spell: true, universal: true });
  const demon = game.state.entities.find(n => n.illidanReincarnated); assert.ok(demon); assert.equal(demon.buildingId, building.id); assert.equal(demon.status.illidanDeathReviveRegistered, false); assert.equal(demon.abilityLevels.A1BD, 2); near(demon.mana, 15);
  demon.mana = 0; kill(game, demon); assert.equal(building.abilityLevels.A1BD, 3); assert.equal(demon.abilityLevels.A1BD, 3);
  finiteNumbers(game.state); const saved = JSON.parse(JSON.stringify(game.snapshot())), restored = Game.fromSnapshot(saved);
  finiteNumbers(restored.state); const savedDemon = restored.state.entities.find(n => n.id === demon.id), savedBuilding = restored.state.players[0].buildings.find(b => b.id === building.id);
  near(savedDemon.damage, demon.damage); assert.equal(savedBuilding.abilityLevels.A1BD, 3); assert.equal(savedBuilding.damage, undefined);
  restored.state.entities = []; restored._spawnDefender(def, restored.state.players[0], 3, 6, building.id);
  const next = restored.state.entities[0]; assert.equal(next.abilityLevels.A1BD, 3); near(next.damage, base + 3); finiteNumbers(restored.state);
});

test('deployed Garrosh lethal-strike charges persist across a new deployment and JSON restore', () => {
  const game = fixture(), { entity: e, building, def } = deploy(game, 'n06K'), base = e.damage;
  game._random = () => .99; kill(game, e); kill(game, e); assert.equal(building.garroshAttackLevel, 2); near(e.damage, base + 2);
  const restored = Game.fromSnapshot(JSON.parse(JSON.stringify(game.snapshot()))); finiteNumbers(restored.state);
  restored.state.entities = []; restored._spawnDefender(def, restored.state.players[0], 3, 6, building.id);
  const next = restored.state.entities[0]; near(next.damage, base + 2); assert.equal(next.status.garroshAttackLevel, 2); finiteNumbers(restored.state);
});

test('native A1CP organic+self aura only gives each fish its own 3 percent life steal', () => {
  const game = fixture(), chief = add(game, 'h0UE', { ownerId: 0, team: 0, side: 'defender' }), enemy = add(game);
  game._hurt(chief, 1, enemy, { spell: true, universal: true });
  const summoned = game.state.entities.filter(e => e.combatRawcode === 'h0UD'), [fish, friend] = summoned;
  assert.equal(summoned.length, 3); assert.ok(summoned.every(e => has(e, 'A1CP') && e.isSummon));
  near(fish.range, 1); near(sourceAuraEffects(game, fish, summoned).lifesteal, .03); near(sourceAuraEffects(game, friend, [fish]).lifesteal, 0); near(sourceAuraEffects(game, enemy, summoned).lifesteal, 0);
  fish.hp = fish.maxHp - 10; const before = fish.hp;
  sourceOnHit(game, fish, enemy, { auras: [fish] }, 100); near(fish.hp, before + 3);
  fish.traits.push('mechanical'); near(sourceAuraEffects(game, fish, [fish]).lifesteal, 0);
});

test('same-event Illidan victim ability presence blocks an attacker cast even when victim mana is empty', () => {
  const game = fixture(), a = add(game, 'h0SY', { ownerId: 0, team: 0, side: 'defender' }), b = add(game, 'h0SY');
  for (const e of [a, b]) { e.skillSpecs = e.skillSpecs.filter(s => s.id === 'A1BA'); e.status = {}; initializeSourceSkills(game, e); }
  a.mana = 30; b.mana = 0; game._hurt(b, 1, a, { spell: true, universal: true });
  near(a.mana, 30); assert.equal(a.skillStates.A1BA?.casts ?? 0, 0); assert.equal(game.state.sourceSkillJobs.filter(j => j.type === 'illidan_flame').length, 0);
});

test('a persisted Aisinos pause restores, summons two flames, then returns only after both actual deaths', () => {
  const game = fixture(), { entity: e } = deploy(game, 'n06U'); e.mana = 30;
  assert.equal(game.command('cast', { entityId: e.id, skillId: 'A1BB' }).ok, true); assert.equal(e.status.illidanPaused, true); assert.equal(e.status.sourcePaused, true);
  const restored = Game.fromSnapshot(JSON.parse(JSON.stringify(game.snapshot()))), body = restored.state.entities.find(n => n.id === e.id); finiteNumbers(restored.state);
  restored.state.time = 2.5; tickSourceScriptJobs(restored);
  const flames = restored.state.entities.filter(n => n.combatRawcode === 'n06V'); assert.equal(flames.length, 2); assert.equal(body.status.illidanPaused, false); assert.equal(body.status.sourcePaused, false); assert.equal(has(body, 'A1BF'), true);
  const attacker = add(restored); for (const f of flames) { f.mana = 0; kill(restored, attacker, f); }
  assert.equal(body.status.illidanAlternateDepth, 0); assert.equal(has(body, 'A1BB'), true); assert.equal(has(body, 'A1BF'), false); finiteNumbers(restored.state);
});

test('PauseUnit host state prevents king movement and attacks until resumed', () => {
  const game = fixture(), king = game.state.kings[0], point = kingWorld(0); game.state.wave = 31;
  king.worldX = point.x; king.worldY = point.y; king.radius = .8; king.attackCd = -1; king.status.sourcePaused = true;
  king.movePath = { path: [{ x: point.x, y: point.y }, { x: point.x, y: point.y - 1 }], index: 1 };
  const enemy = add(game, 'h002', { worldX: point.x, worldY: point.y - 1 }); enemy.hp = enemy.maxHp = 100000;
  game._nearby = () => [enemy]; game._canSegment = () => true;
  const hp = enemy.hp; game._updateKings(.5); near(king.worldX, point.x); near(king.worldY, point.y); near(enemy.hp, hp);
  king.status.sourcePaused = false; game._updateKings(.5); assert.ok(king.worldY < point.y); assert.ok(enemy.hp < hp);
  finiteNumbers(game.state);
});

test('Garrosh normal-attack plus magic-damage source damage ignores numeric armor but keeps native normal matrix', () => {
  const game = fixture(), { entity: garrosh } = deploy(game, 'n06K'); garrosh.skillSpecs = garrosh.skillSpecs.filter(s => s.id === 'A1A4'); garrosh.status.garroshSpinRegistered = true;
  // Trigger the actual independent native damage listener; avoid its optional
  // spin timing as the verification target, and observe the typed AOE itself.
  const attacker = add(game, 'h002', { armor: 9999, armorType: 'medium', sourceArmorTypeRaw: 'medium' }); attacker.skillSpecs = []; attacker.hp = attacker.maxHp = 100000;
  attacker.sourceArmorTypeRaw = 'medium'; // attachSkills copies the template's native armor type during creation.
  game._random = () => 0; const before = attacker.hp; game._hurt(garrosh, 1, attacker, { spell: true, universal: true });
  const factor = RULES.attackMultipliers.normal.medium;
  near(before - attacker.hp, 75 * factor);
});
