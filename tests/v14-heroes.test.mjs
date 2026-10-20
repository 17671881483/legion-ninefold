import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../dist/engine.js';
import { UNITS, BUILDERS, HERO_ENTRIES } from '../dist/data.js';

const current = UNITS.filter(unit => !unit.legacy);
const byId = new Map(current.map(unit => [unit.id, unit]));
const altar = () => current.find(unit => unit.sourceRawcode === 'h0DB');
const starts = () => current.filter(unit => unit.hero && unit.heroStage === 1);
const family = unit => unit.heroFamily ?? unit.heroTypeRawcode ?? unit.sourceRawcode;
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-7, `${actual} != ${expected}`);

function fixture() {
  const game = new Game({ seed: 42 });
  game._aiAct = () => {};
  game._aiTimer = -1e6;
  for (const player of game.state.players) {
    player.buildings = [];
    player.heroId = null;
    player.heroAltarCount = 0;
    player.gold = player.wood = 100000;
    player.populationCap = 300;
    player.popUsed = game._population(player);
  }
  return game;
}

function succeed(result) { assert.equal(result.ok, true, result.message); }
function rejectWithoutSpending(game, command, payload, message) {
  const player = game.state.players[0];
  const before = { gold: player.gold, wood: player.wood, buildings: JSON.parse(JSON.stringify(player.buildings)), count: player.heroAltarCount };
  const result = game.command(command, payload);
  assert.equal(result.ok, false, message ?? result.message);
  assert.deepEqual({ gold: player.gold, wood: player.wood, buildings: player.buildings, count: player.heroAltarCount }, before);
  return result;
}
function buildAltar(game, col = 0) {
  assert.ok(altar(), 'v14 h0DB altar must be imported');
  succeed(game.command('build', { unitId: altar().id, col, row: 0 }));
  return game.state.players[0].buildings.at(-1);
}
function advanceTo(game, time) {
  const from = game.state.time;
  assert.ok(time >= from);
  for (const player of game.state.players) game._advanceEconomy(player, from, time);
  game.state.time = time;
}
function finish(game, building) {
  if (building.construction) advanceTo(game, building.construction.finishAt);
  assert.equal(building.construction, null);
}
function availableStart(game, predicate = () => true) {
  const unit = starts().find(unit => predicate(unit) && altar().upgrades.includes(unit.id) && game.requirementStatus(unit.id).canStart);
  assert.ok(unit, 'expected an available source hero choice');
  return unit;
}
function regularStart(game) {
  return availableStart(game, unit => unit.heroLevel === 1 && current.filter(other => other.hero && family(other) === family(unit)).length === 11);
}
function selectHero(game, building, unit = regularStart(game)) {
  succeed(game.command('upgrade', { buildingId: building.id, unitId: unit.id }));
  return unit;
}
function nextStage(unit) {
  return unit.upgrades.map(id => byId.get(id)).find(next => next?.hero && family(next) === family(unit) && next.heroStage === unit.heroStage + 1);
}

test('v14 exposes one real altar and seventeen first-stage choices to source builders', () => {
  const unit = altar();
  assert.ok(unit);
  assert.equal(unit.heroEntry, true);
  assert.equal(unit.population, 0);
  assert.equal(Number(unit.buildTime ?? unit.buildingRawFields.bldtm), 1);
  assert.equal(unit.combatRawcode, null);
  assert.deepEqual(HERO_ENTRIES, [unit.id]);
  assert.equal(starts().length, 17);
  assert.equal(current.filter(unit => unit.hero && !unit.heroEntry).length, 147);
  assert.equal(starts().filter(unit => current.filter(other => other.hero && family(other) === family(unit)).length === 11).length, 12);
  assert.ok(BUILDERS.every(builder => builder.heroEntryIds.includes(unit.id)));
  assert.ok(starts().every(unit => unit.heroChoice && altar().upgrades.includes(unit.id)));
});

test('altar construction uses its source cost and zero population without an invented military gate', () => {
  const game = fixture(), player = game.state.players[0];
  player.gold = player.wood = 0;
  player.populationCap = player.workers;
  const status = game.heroStatus();
  assert.equal(status.military, 0);
  assert.equal(status.requiredMilitary, 0);
  assert.equal(status.canStart, true, status.reason);
  const building = buildAltar(game);
  assert.equal(player.gold, 0);
  assert.equal(player.wood, 0);
  assert.equal(player.popUsed, player.workers);
  assert.equal(building.construction.duration, 1);
  assert.equal(game.heroStatus().remaining, 1);
  assert.equal(player.heroId, null);
});

test('rawcode constructor builders can select the same source heroes as their canonical builder', () => {
  const builder = BUILDERS.find(builder => builder.mode === 'prophet');
  const game = new Game({ seed: 42, builderId: builder.rawcode });
  assert.equal(game.state.players[0].builderId, builder.rawcode);
  assert.ok(game.heroStatus().canStart);
  const building = buildAltar(game);
  finish(game, building);
  const choice = regularStart(game);
  assert.equal(game.requirementStatus(choice.id).canStart, true);
  selectHero(game, building, choice);
  succeed(game.command('ready'));
  assert.ok(game.state.entities.some(entity => entity.buildingId === building.id && entity.unitId === choice.id && entity.isHero));
});

test('older saves with rawcode builder IDs expose the altar and permit source hero selection after restore', () => {
  const builder = BUILDERS.find(builder => builder.mode === 'prophet');
  const original = new Game({ seed: 42, mode: 'sandbox', builderId: builder.id });
  const saved = original.snapshot();
  saved.state.players[0].builderId = builder.rawcode;
  delete saved.state.players[0].heroAltarCount;
  delete saved.state.players[0].heroAltarUsed;
  const game = Game.fromSnapshot(saved);
  assert.equal(game.state.players[0].builderId, builder.rawcode);
  assert.deepEqual(game.heroStatus().entries, [altar().id]);
  assert.equal(game.heroStatus().remaining, 2);
  const building = buildAltar(game);
  succeed(game.command('sandboxComplete'));
  const choice = regularStart(game);
  selectHero(game, building, choice);
  succeed(game.command('ready'));
  assert.ok(game.state.entities.some(entity => entity.buildingId === building.id && entity.unitId === choice.id && entity.isHero));
});

test('a fresh sandbox can build an altar, select and instantly finish a hero, then deploy it', () => {
  const game = new Game({ seed: 42, mode: 'sandbox' });
  assert.ok(BUILDERS.some(builder => builder.id === game.state.players[0].builderId));
  const clock = game.state.time, building = buildAltar(game);
  assert.ok(building.construction);
  succeed(game.command('sandboxComplete'));
  assert.equal(building.construction, null);
  const choice = regularStart(game);
  selectHero(game, building, choice);
  assert.ok(building.construction);
  succeed(game.command('sandboxComplete'));
  assert.equal(building.unitId, choice.id);
  assert.equal(building.construction, null);
  assert.equal(game.state.time, clock);
  succeed(game.command('ready'));
  const entity = game.state.entities.find(entity => entity.buildingId === building.id);
  assert.ok(entity?.isHero);
  assert.equal(entity.unitId, choice.id);
  assert.equal(entity.combatRawcode, choice.combatRawcode);
  assert.equal(entity.skillVersion, 'v14.1A5');
  assert.equal(game.state.wave, 1);
  assert.equal(game.state.phase, 'combat');
});

test('ninefold permits two reserved altars and rejects a third before either finishes', () => {
  const game = fixture(), player = game.state.players[0];
  const first = buildAltar(game, 0), second = buildAltar(game, 1);
  assert.ok(first.construction && second.construction);
  const status = game.heroStatus();
  assert.equal(status.limit, 2);
  assert.equal(status.count, 2);
  assert.equal(status.remaining, 0);
  assert.equal(status.used, true);
  assert.deepEqual(status.buildingIds, [first.id, second.id]);
  assert.equal(player.heroAltarCount, 2);
  assert.equal(game.requirementStatus(altar().id).canStart, false);
  rejectWithoutSpending(game, 'build', { unitId: altar().id, col: 2, row: 0 });
});

test('an unfinished altar cannot select a hero, and choices cannot be directly deployed', () => {
  const game = fixture(), building = buildAltar(game), choice = regularStart(game);
  rejectWithoutSpending(game, 'upgrade', { buildingId: building.id, unitId: choice.id });
  rejectWithoutSpending(game, 'build', { unitId: choice.id, col: 1, row: 0 });
  finish(game, building);
  selectHero(game, building, choice);
  assert.equal(building.construction?.targetId ?? building.unitId, choice.id);
});

test('selecting a hero reserves its population and pays both declared resources once', () => {
  const game = fixture(), player = game.state.players[0], building = buildAltar(game);
  finish(game, building);
  const choice = regularStart(game);
  assert.ok(choice.population > 0);
  player.populationCap = player.workers + choice.population - 1;
  rejectWithoutSpending(game, 'upgrade', { buildingId: building.id, unitId: choice.id });
  player.populationCap++;
  const before = { gold: player.gold, wood: player.wood };
  selectHero(game, building, choice);
  near(player.gold, before.gold - (choice.upgradeCost ?? choice.upgradeGold ?? choice.cost));
  near(player.wood, before.wood - choice.woodCost);
  assert.equal(player.popUsed, player.workers + choice.population);
  assert.ok(building.construction, 'source hero selection must retain its construction duration');
  assert.equal(building.unitId, altar().id);
  const finishAt = building.construction.finishAt;
  advanceTo(game, finishAt - .001);
  assert.equal(building.unitId, altar().id);
  advanceTo(game, finishAt);
  assert.equal(building.unitId, choice.id);
  assert.equal(building.construction, null);
  assert.equal(player.popUsed, player.workers + choice.population);
});

test('insufficient hero gold rejects selection without changing the altar', () => {
  const game = fixture(), player = game.state.players[0], building = buildAltar(game);
  finish(game, building);
  const choice = regularStart(game), cost = choice.upgradeCost ?? choice.upgradeGold ?? choice.cost;
  assert.ok(cost > 0);
  player.gold = cost - 1;
  rejectWithoutSpending(game, 'upgrade', { buildingId: building.id, unitId: choice.id });
});

test('a selected family is exclusive during construction and after later upgrades', () => {
  const game = fixture(), first = buildAltar(game, 0), second = buildAltar(game, 1);
  finish(game, first);
  const choice = selectHero(game, first);
  assert.ok(first.construction);
  assert.equal(game.requirementStatus(choice.id).canStart, false);
  rejectWithoutSpending(game, 'upgrade', { buildingId: second.id, unitId: choice.id });
  finish(game, first);
  const next = nextStage(choice);
  assert.ok(next);
  selectHero(game, first, next);
  finish(game, first);
  rejectWithoutSpending(game, 'upgrade', { buildingId: second.id, unitId: choice.id });
  const different = availableStart(game, unit => family(unit) !== family(choice));
  selectHero(game, second, different);
  assert.equal(second.construction?.targetId ?? second.unitId, different.id);
});

test('special heroes starting at source level ten reserve their family and can advance their own stages', () => {
  const game = fixture(), first = buildAltar(game, 0), second = buildAltar(game, 1);
  finish(game, first);
  const choice = availableStart(game, unit => unit.heroLevel === 10);
  assert.equal(choice.heroStage, 1);
  selectHero(game, first, choice);
  rejectWithoutSpending(game, 'upgrade', { buildingId: second.id, unitId: choice.id });
  finish(game, first);
  const next = nextStage(choice);
  assert.ok(next);
  selectHero(game, first, next);
  finish(game, first);
  const final = nextStage(next);
  assert.ok(final);
  selectHero(game, first, final);
  finish(game, first);
  assert.equal(byId.get(first.unitId).heroStage, 3);
  assert.equal(game.requirementStatus(choice.id).canStart, false);
});

test('the morph builder cannot choose the source-restricted Hellscream family', () => {
  const game = fixture(), player = game.state.players[0];
  player.builderId = BUILDERS.find(builder => builder.mode === 'morph').id;
  const building = buildAltar(game), choice = starts().find(unit => unit.sourceRawcode === 'hh01');
  finish(game, building);
  assert.ok(choice);
  const status = game.requirementStatus(choice.id);
  assert.equal(status.canStart, false);
  assert.ok(status.requirements.some(requirement => requirement.kind === 'hero_builder' && !requirement.met));
  rejectWithoutSpending(game, 'upgrade', { buildingId: building.id, unitId: choice.id });
  selectHero(game, building, regularStart(game));
});

test('alchemist requires both completed goblins and retains R2Z0 after selling them and restoring', () => {
  const game = fixture(), player = game.state.players[0], building = buildAltar(game);
  finish(game, building);
  const choice = starts().find(unit => unit.sourceRawcode === 'n091');
  const clockwork = current.find(unit => unit.sourceRawcode === 'h0AF');
  const shredder = current.find(unit => unit.sourceRawcode === 'h0AO');
  assert.ok(choice && clockwork && shredder);
  assert.equal(game.requirementStatus(choice.id).canStart, false);
  rejectWithoutSpending(game, 'upgrade', { buildingId: building.id, unitId: choice.id });
  player.roster = [clockwork.id, shredder.id];
  succeed(game.command('build', { unitId: clockwork.id, col: 1, row: 0 }));
  const clockworkBuilding = player.buildings.at(-1);
  finish(game, clockworkBuilding);
  assert.equal(player.technologies.R2Z0 ?? 0, 0);
  succeed(game.command('build', { unitId: shredder.id, col: 2, row: 0 }));
  const shredderBuilding = player.buildings.at(-1);
  assert.ok(shredderBuilding.construction);
  assert.equal(game.requirementStatus(choice.id).canStart, false);
  finish(game, shredderBuilding);
  assert.equal(player.technologies.R2Z0, 1);
  assert.equal(game.requirementStatus(choice.id).canStart, true);
  succeed(game.command('sell', { buildingId: clockworkBuilding.id }));
  succeed(game.command('sell', { buildingId: shredderBuilding.id }));
  assert.equal(player.technologies.R2Z0, 1);
  const restored = Game.fromSnapshot(game.snapshot());
  assert.equal(restored.state.players[0].technologies.R2Z0, 1);
  assert.equal(restored.requirementStatus(choice.id).canStart, true);
  const restoredAltar = restored.state.players[0].buildings.find(candidate => candidate.id === building.id);
  selectHero(restored, restoredAltar, choice);
});

test('a regular hero follows all eleven paid stages without changing family or gaining an extra altar', () => {
  const game = fixture(), player = game.state.players[0], building = buildAltar(game);
  finish(game, building);
  let choice = regularStart(game), totalCost = 0;
  const heroFamily = family(choice), beforeGold = player.gold;
  for (let level = 1; level <= 11; level++) {
    assert.equal(choice.heroLevel, level);
    assert.equal(choice.heroStage, level);
    assert.equal(family(choice), heroFamily);
    const before = { gold: player.gold, wood: player.wood };
    selectHero(game, building, choice);
    const cost = choice.upgradeCost ?? choice.upgradeGold ?? choice.cost;
    totalCost += cost;
    near(player.gold, before.gold - cost);
    near(player.wood, before.wood - choice.woodCost);
    if (building.construction) {
      assert.equal(building.construction.targetId, choice.id);
      assert.equal(player.popUsed, player.workers + Math.max(byId.get(building.unitId).population, choice.population));
      finish(game, building);
    }
    assert.equal(building.unitId, choice.id);
    assert.equal(game.heroStatus().count, 1);
    if (level < 11) {
      choice = nextStage(choice);
      assert.ok(choice, `missing source hero level ${level + 1}`);
    }
  }
  near(player.gold, beforeGold - totalCost);
  assert.equal(nextStage(choice), undefined);
  assert.equal(player.heroId, null);
});

test('opening a wave completes the paid hero stage and spawns it with source skills and hero identity', () => {
  const game = fixture(), building = buildAltar(game);
  finish(game, building);
  const choice = selectHero(game, building), clock = game.state.time;
  assert.ok(building.construction);
  succeed(game.command('ready'));
  assert.equal(game.state.time, clock);
  assert.equal(building.unitId, choice.id);
  assert.equal(building.construction, null);
  const entity = game.state.entities.find(entity => entity.buildingId === building.id);
  assert.ok(entity);
  assert.equal(entity.isHero, true);
  assert.equal(entity.ownerId, 0);
  assert.equal(entity.unitId, choice.id);
  assert.equal(entity.combatRawcode, choice.combatRawcode);
  assert.equal(entity.skillSource, true);
  assert.equal(entity.skillVersion, 'v14.1A5');
  assert.ok(entity.skillSpecs.length > 0);
  near(entity.maxHp, choice.hp);
  near(entity.damage, choice.damage);
});

test('an empty altar never creates an ordinary wave combatant', () => {
  const game = fixture(), building = buildAltar(game);
  succeed(game.command('ready'));
  assert.equal(building.construction, null);
  assert.equal(game.state.entities.some(entity => entity.buildingId === building.id), false);
});

test('selected heroes retain identity and source skills in the arena', () => {
  const game = fixture(), building = buildAltar(game);
  finish(game, building);
  const choice = selectHero(game, building);
  game.state.wave = 10;
  game.state.roundMode = 'arena-prep';
  game._startArena();
  const entity = game.state.entities.find(entity => entity.buildingId === building.id);
  assert.ok(entity);
  assert.equal(entity.isHero, true);
  assert.equal(entity.isArena, true);
  assert.equal(entity.unitId, choice.id);
  assert.equal(entity.side, 'arena0');
  assert.equal(entity.skillSource, true);
  assert.equal(entity.skillVersion, 'v14.1A5');
  assert.ok(entity.skillSpecs.length > 0);
});

test('an empty altar without a confirmed combat body never becomes a fabricated arena fighter', () => {
  const game = fixture(), building = buildAltar(game);
  game.state.wave = 10;
  game.state.roundMode = 'arena-prep';
  game._startArena();
  assert.equal(building.construction, null);
  assert.equal(game.state.entities.some(entity => entity.buildingId === building.id), false);
});

test('AI builds two source altars and chooses different families without buying legacy web heroes', () => {
  const game = fixture(), player = game.state.players[0];
  const soldier = current.find(unit => unit.sourceRawcode === 'h00M');
  assert.ok(soldier);
  player.roster = [];
  player.buildings = [{ id: 'ai-army', unitId: soldier.id, col: 5, row: 7, spent: soldier.cost, totalSpent: soldier.cost }];
  player.popUsed = game._population(player);
  const commands = [], dispatch = game.command.bind(game);
  game.command = (type, payload = {}) => { commands.push({ type, ...payload }); return dispatch(type, payload); };
  for (let attempt = 0; attempt < 40; attempt++) {
    game._aiBuild(player);
    for (const building of player.buildings) if (building.construction) finish(game, building);
    if (player.buildings.filter(building => byId.get(building.unitId)?.hero && !byId.get(building.unitId)?.heroEntry).length === 2) break;
  }
  const chosen = player.buildings.map(building => byId.get(building.unitId)).filter(unit => unit?.hero && !unit.heroEntry);
  assert.equal(chosen.length, 2);
  assert.equal(new Set(chosen.map(family)).size, 2);
  assert.equal(game.heroStatus().count, 2);
  assert.equal(commands.filter(command => command.type === 'build' && command.unitId === altar().id).length, 2);
  assert.equal(commands.some(command => command.type === 'hero'), false);
  assert.equal(player.heroId, null);
  assert.ok(player.buildings.every(building => byId.has(building.unitId)));
});

test('altars and chosen heroes cannot be sold during construction or after completion', () => {
  const game = fixture(), building = buildAltar(game);
  rejectWithoutSpending(game, 'sell', { buildingId: building.id });
  finish(game, building);
  rejectWithoutSpending(game, 'sell', { buildingId: building.id });
  selectHero(game, building);
  rejectWithoutSpending(game, 'sell', { buildingId: building.id });
  finish(game, building);
  rejectWithoutSpending(game, 'sell', { buildingId: building.id });
  assert.equal(game.heroStatus().count, 1);
});

test('same-version saves retain a selected stage, its construction reservation, and both altar slots', () => {
  const game = fixture(), first = buildAltar(game, 0), second = buildAltar(game, 1);
  finish(game, first);
  const choice = selectHero(game, first);
  finish(game, first);
  const target = nextStage(choice);
  selectHero(game, first, target);
  const saved = game.snapshot(), restored = Game.fromSnapshot(saved), player = restored.state.players[0];
  const building = player.buildings.find(building => building.id === first.id);
  assert.equal(building.unitId, choice.id);
  assert.deepEqual(building.construction, first.construction);
  assert.equal(player.heroAltarCount, 2);
  assert.equal(restored.heroStatus().remaining, 0);
  assert.equal(player.popUsed, restored._population(player));
  rejectWithoutSpending(restored, 'build', { unitId: altar().id, col: 2, row: 0 });
  rejectWithoutSpending(restored, 'upgrade', { buildingId: second.id, unitId: choice.id });
  finish(restored, building);
  assert.equal(byId.get(building.unitId).heroStage, 2);
});

test('older same-version saves infer altar usage from both hero buildings instead of reopening a third slot', () => {
  const game = fixture(), first = buildAltar(game, 0);
  finish(game, first);
  selectHero(game, first);
  finish(game, first);
  buildAltar(game, 1);
  const saved = game.snapshot();
  delete saved.state.players[0].heroAltarCount;
  delete saved.state.players[0].heroAltarUsed;
  const restored = Game.fromSnapshot(saved);
  assert.equal(restored.state.players[0].heroAltarCount, 2);
  assert.equal(restored.heroStatus().count, 2);
  assert.equal(restored.heroStatus().canStart, false);
  rejectWithoutSpending(restored, 'build', { unitId: altar().id, col: 2, row: 0 });
});

test('one altar permits changing builders while the second reserves the source race-change lock', () => {
  const game = fixture(), player = game.state.players[0];
  buildAltar(game, 0);
  succeed(game.command('race'));
  succeed(game.command('builder', {builderId: player.builderChoices[0]}));
  buildAltar(game, 1);
  const choices = [...player.builderChoices], changes = player.raceChanges;
  assert.match(rejectWithoutSpending(game, 'race').message, /不能再更换种族/);
  assert.deepEqual(player.builderChoices, choices);
  assert.equal(player.raceChanges, changes);
});

test('combat saves preserve hero markers and revive persistent hero buildings on the next ordinary wave', () => {
  const game = fixture(), building = buildAltar(game);
  finish(game, building);
  const choice = selectHero(game, building);
  succeed(game.command('ready'));
  const entity = game.state.entities.find(entity => entity.buildingId === building.id);
  entity.hp /= 2;
  const restored = Game.fromSnapshot(game.snapshot());
  const savedHero = restored.state.entities.find(entity => entity.buildingId === building.id);
  assert.equal(savedHero.isHero, true);
  near(savedHero.hp, entity.hp);
  assert.equal(savedHero.skillSource, true);
  assert.equal(savedHero.skillVersion, 'v14.1A5');
  savedHero.hp = 0;
  restored._endCombat();
  restored._startCombat();
  const revived = restored.state.entities.find(entity => entity.buildingId === building.id);
  assert.ok(revived);
  assert.equal(revived.isHero, true);
  assert.equal(revived.unitId, choice.id);
  near(revived.hp, revived.maxHp);
  assert.equal(restored.heroStatus().count, 1);
});
