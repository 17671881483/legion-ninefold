import assert from 'node:assert/strict';
import { Game } from '../dist/engine.js';
import { UNITS, UNIT_TEMPLATES } from '../dist/data.js';
import { EGG_REQUIREMENTS, DOCUMENT_EGG_TARGETS, recordEggCompletion, finishEggWave, restoreEggHistory, eggRequirementStatus, appearanceQualificationStatus } from '../dist/egg-rules.js';

let passed = 0;
const test = (name, run) => { try { run(); passed++; console.log(`✓ ${name}`); } catch (error) { console.error(`✗ ${name}`); throw error; } };
const u = code => UNITS.find(def => !def.legacy && def.sourceRawcode === code);
const byId = Object.fromEntries(UNITS.map(def => [def.id, def]));
const troop = code => u(code) ?? UNIT_TEMPLATES[code] ?? { sourceRawcode: code, provenance: 'v14.1A5-dataset' };
function fixture() {
  const game = new Game({ seed: 42 }); game._aiTimer = Infinity; game._aiAct = () => {};
  for (const player of game.state.players) { player.buildings = []; player.eggHistory = undefined; player.completedSourceUnits = undefined; player.technologies = { R0GK: 1 }; player.entitlements = {}; player.gold = player.wood = 100000; player.populationCap = 300; }
  return game;
}
function complete(game, code, id = `completed-${game._uid()}`) {
  const player = game.state.players[0], def = u(code); assert.ok(def, `playable fixture ${code}`);
  const building = { id, unitId: def.id, col: player.buildings.length % 6, row: Math.floor(player.buildings.length / 6), construction: { targetId: def.id } };
  player.buildings.push(building); game._completeConstruction(player, building); return building;
}
function history(player, codes, prefix = 'source') {
  codes.forEach((code, index) => recordEggCompletion(player, troop(code), { buildingId: `${prefix}-${index}`, wave: 1, unitsById: byId }));
}
const freshPlayer = () => ({ technologies: {}, entitlements: {}, buildings: [] });

test('corrected document separates 32 confirmed outcomes from two pending paths', () => {
  assert.equal(DOCUMENT_EGG_TARGETS.filter(row => row.status === 'confirmed').length, 32);
  assert.deepEqual(DOCUMENT_EGG_TARGETS.filter(row => row.status !== 'confirmed').map(row => row.rawcode).sort(), ['h203', 'h2C2']);
  assert.equal(EGG_REQUIREMENTS.R00L.status, 'unconfirmed'); assert.equal(EGG_REQUIREMENTS.R00M.status, 'unconfirmed');
});

test('history is recorded at paid completion, not construction start, and survives selling', () => {
  const game = fixture(), player = game.state.players[0], tree = u('h01J'); player.roster = [tree.id];
  assert.equal(game.command('build', { unitId: tree.id, col: 0, row: 0 }).ok, true);
  assert.equal(player.technologies.R00S, undefined);
  game._completeConstruction(player, player.buildings[0]); assert.equal(player.technologies.R00S, 1);
  assert.equal(game.command('sell', { buildingId: player.buildings[0].id }).ok, true);
  assert.equal(game.requirementStatus(u('h1S2').id).canStart, true);
  const gun = complete(game, 'h00X');
  assert.equal(game.command('upgrade', { buildingId: gun.id, unitId: u('h1S2').id }).ok, true);
});

test('source carrier must still exist even when all other historical conditions have completed', () => {
  const game = fixture(); history(game.state.players[0], ['h01J']);
  assert.equal(game.requirementStatus(u('h1S2').id).canStart, true);
  assert.equal(game.command('upgrade', { buildingId: 'sold-carrier', unitId: u('h1S2').id }).ok, false);
});

test('a completed morph entrance records the resulting troop, never the proxy', () => {
  const game = fixture(), player = game.state.players[0], proxy = UNITS.find(def => !def.legacy && def.morphProxy);
  assert.ok(proxy); player.buildings = [{ id: 'morph', unitId: proxy.id, col: 0, row: 0 }];
  game._resolveMorph = () => u('h08F');
  assert.equal(game.command('morph', { buildingId: 'morph' }).ok, true);
  assert.equal(player.eggHistory.counts.h08F, 1); assert.equal(player.completedSourceUnits[proxy.sourceRawcode], undefined);
});

test('super rifleman needs both completion records and separate sponsorship', () => {
  const game = fixture(), player = game.state.players[0];
  complete(game, 'h00X'); assert.equal(player.technologies.R0DU, undefined);
  complete(game, 'h0AA'); assert.equal(player.technologies.R0DU, 1);
  assert.equal(game.requirementStatus(u('n07R').id).canStart, false);
  assert.ok(game.requirementStatus(u('n07R').id).requirements.some(row => row.kind === 'entitlement' && !row.met));
  player.entitlements.h210 = 1; assert.equal(game.requirementStatus(u('n07R').id).canStart, true);
  player.buildings = []; assert.equal(game.requirementStatus(u('n07R').id).canStart, true);
});

test('an appearance proves its base history without pretending the base used every appearance shortcut', () => {
  const player = freshPlayer(); history(player, ['h2AB', 'h0AA']);
  assert.equal(player.completedSourceUnits.h00X, true); assert.equal(player.technologies.R0DU, 1);
  const plain = freshPlayer(); history(plain, ['h01B']);
  assert.equal(plain.completedSourceUnits.h0R8, undefined); assert.equal(plain.technologies.R09D, undefined);
  const skin = freshPlayer(); history(skin, ['h0R8']);
  assert.equal(skin.completedSourceUnits.h01B, true); assert.equal(skin.technologies.R09D, 1);
});

test('document aliases share the beast king completion condition and remain one ordinary upgrade', () => {
  const game = fixture(), player = game.state.players[0]; complete(game, 'h0CC');
  assert.equal(player.completedSourceUnits.h1CC, true); assert.equal(player.technologies.R0AK, 1);
  player.entitlements.h220 = 1; assert.equal(game.requirementStatus(u('n07V').id).canStart, true);
  assert.equal(DOCUMENT_EGG_TARGETS.some(row => row.rawcode === 'h0CC'), false);
});

test('holy dragon requires two distinct dragon kinds, with skins in the same kind', () => {
  const player = freshPlayer(); history(player, ['h01B', 'h0R8']); assert.equal(player.technologies.R00R, undefined);
  history(player, ['h0D2'], 'bone'); assert.equal(player.technologies.R00R, 1);
  const alternate = freshPlayer(); history(alternate, ['n05M', 'h0D2']); assert.equal(alternate.technologies.R00R, 1);
});

test('first-wave hippogryph history is judged at first-wave end and remains after sale', () => {
  const game = fixture(), player = game.state.players[0];
  for (let index = 0; index < 5; index++) complete(game, 'h08F');
  assert.equal(player.technologies.R00N, undefined); player.buildings = [];
  game._endCombat(); assert.equal(player.technologies.R00N, 1); assert.equal(game.state.wave, 2);
  const late = freshPlayer(); finishEggWave(late, 1);
  for (let index = 0; index < 5; index++) recordEggCompletion(late, troop('h08F'), { buildingId: `late-${index}`, wave: 2 });
  assert.equal(late.technologies.R00N, undefined);
});

test('five mummy unlock checks simultaneous completed units, then becomes permanent', () => {
  const game = fixture(), player = game.state.players[0];
  for (let index = 0; index < 5; index++) { const building = complete(game, 'n061'); if (index < 4) player.buildings = player.buildings.filter(row => row.id !== building.id); }
  assert.equal(player.technologies.R0BR, undefined);
  for (let index = 0; index < 4; index++) complete(game, 'n061');
  assert.equal(player.technologies.R0BR, 1); player.buildings = []; assert.equal(player.technologies.R0BR, 1);
});

test('worm history uses completed worms minus completed hunters instead of current ownership', () => {
  const player = freshPlayer();
  for (let index = 0; index < 19; index++) recordEggCompletion(player, troop('h0SC'), { buildingId: `worm-${index}`, wave: 1 });
  for (let index = 0; index < 10; index++) recordEggCompletion(player, troop('h0SD'), { buildingId: `worm-${index}`, wave: 1 });
  assert.equal(player.technologies.R00P, undefined);
  recordEggCompletion(player, troop('h0SC'), { buildingId: 'worm-19', wave: 1 }); assert.equal(player.technologies.R00P, 1);
  assert.deepEqual([player.eggHistory.counts.h0SC, player.eggHistory.counts.h0SD], [20, 10]);
  recordEggCompletion(player, troop('h0SC'), { buildingId: 'worm-19', wave: 1 }); assert.equal(player.eggHistory.counts.h0SC, 20);
});

test('blood unit qualification must exist on the recorded completion event', () => {
  const player = freshPlayer(); history(player, ['h0C0', 'h0BS']); assert.equal(player.technologies.R03D, undefined);
  player.entitlements.h220 = 1;
  recordEggCompletion(player, troop('h0C0'), { buildingId: 'source-0', wave: 1 }); assert.equal(player.technologies.R03D, undefined);
  recordEggCompletion(player, troop('h0C0'), { buildingId: 'new-rider', wave: 1 }); assert.equal(player.technologies.R03D, 1);
  const honor = freshPlayer(); honor.entitlements.h230 = 1; history(honor, ['h0C0']); assert.equal(honor.technologies.R03D, undefined);
  history(honor, ['h0BS'], 'blood'); assert.equal(honor.technologies.R03D, 1);
});

test('all explicit confirmed boolean branches preserve source and-or alternatives', () => {
  const cases = [
    ['R08G', ['h017', 'h019'], ['h017']], ['R09D', ['h0F6', 'h01N', 'h01B'], ['h0F6', 'h01B']],
    ['R00V', ['h0E8', 'h0CP'], ['h0E8']], ['R00W', ['h0E8', 'h19M'], ['h0E8']], ['R00U', ['h0E8', 'h08Y'], ['h0E8']],
    ['R0GL', ['h0GO', 'h01W'], ['h0GO']], ['R00O', ['h060'], []], ['R02Q', ['n047'], []], ['R00X', ['h0H4'], []],
    ['R07M', ['h00W'], []], ['R07N', ['hA0B'], []], ['R0FM', ['hA0B'], ['h09U']],
    ['R010', ['h01N', 'h0F6'], ['h01N']], ['R2YA', ['h01O', 'h0F6'], ['h01O']], ['R0GG', ['h0FL'], []],
    ['R01X', ['h09U', 'h0J3'], ['h09U']], ['R0CW', ['h00Z'], []], ['R0EA', ['h041', 'h201'], ['h201']],
    ['R0AJ', ['hh02'], []], ['R0BQ', ['h022', 'h0CV'], ['h022']], ['R0AL', ['h202'], []], ['R0AM', ['n04A'], []],
    ['R0BS', ['h0S2', 'h0S6'], ['h0S6']], ['R08F', ['h0QP', 'h201'], ['h0QP']], ['R06U', ['h0BP'], []],
    ['R2Z0', ['h0AF', 'h0AO'], ['h0AF']],
  ];
  for (const [flag, positive, negative] of cases) {
    const no = freshPlayer(); history(no, negative); assert.equal(no.technologies[flag], undefined, `${flag} negative`);
    const yes = freshPlayer(); history(yes, positive); assert.equal(yes.technologies[flag], 1, `${flag} positive`);
  }
});

test('holy dragon base and appearance reserve one shared slot including pending upgrades', () => {
  const game = fixture(), player = game.state.players[0]; player.technologies.R00R = player.technologies.R0EA = 1; player.entitlements.Legion_Grail = 1;
  const first = complete(game, 'h07O'), second = complete(game, 'h07O');
  assert.equal(game.command('upgrade', { buildingId: first.id, unitId: u('h201').id }).ok, true);
  assert.equal(game.buildLimitStatus(u('h204').id).current, 1);
  assert.equal(game.command('upgrade', { buildingId: second.id, unitId: u('h204').id }).ok, false);
  game._completeConstruction(player, first);
  assert.equal(game.buildLimitStatus(u('h201').id).current, 1);
  assert.equal(game.command('upgrade', { buildingId: second.id, unitId: u('h204').id }).ok, false);
});

test('source completion history and counters save and restore without replay', () => {
  const game = fixture(), player = game.state.players[0]; complete(game, 'h08F'); complete(game, 'h0SC'); complete(game, 'h0CC');
  const before = JSON.parse(JSON.stringify(player.eggHistory));
  const once = Game.fromSnapshot(game.snapshot()), twice = Game.fromSnapshot(once.snapshot());
  assert.deepEqual(once.state.players[0].eggHistory, before); assert.deepEqual(twice.state.players[0].eggHistory, before);
  assert.equal(twice.state.players[0].technologies.R0AK, 1);
});

test('old saves backfill provable finished stages but do not count unfinished orders or late first-wave progress', () => {
  const game = fixture(), player = game.state.players[0]; complete(game, 'h01J'); complete(game, 'h08F');
  delete player.eggHistory; delete player.completedSourceUnits; player.technologies = {}; game.state.wave = 2;
  const unfinished = u('h0SC'); player.buildings.push({ id: 'pending', unitId: unfinished.id, construction: { targetId: unfinished.id } });
  const restored = Game.fromSnapshot(game.snapshot()), target = restored.state.players[0];
  assert.equal(target.technologies.R00S, 1); assert.equal(target.eggHistory.counts.h0SC, undefined);
  assert.equal(target.eggHistory.firstWaveHippogryphs, 0); assert.equal(target.technologies.R00N, undefined);
  const before = JSON.stringify(target.eggHistory); restoreEggHistory(target, { wave: 2, unitsById: byId }); assert.equal(JSON.stringify(target.eggHistory), before);
});

test('unresolved recipes remain explicitly pending even when a legacy technology flag exists', () => {
  const game = fixture(), player = game.state.players[0]; player.technologies.R00L = player.technologies.R00M = 1;
  for (const code of ['h2C2', 'h203']) { const status = game.requirementStatus(u(code).id); assert.equal(status.canStart, false); assert.match(status.reason, /配方待核定/); }
  assert.equal(eggRequirementStatus(player, 'R00L').met, false);
});

test('beast king alias kills are retained as evidence without automatically inventing a threshold', () => {
  const game = fixture(), player = game.state.players[0], attacker = { ownerId: 0, team: 0, side: 'defender', unitId: u('h0CC').id };
  for (let index = 0; index < 166; index++) {
    const target = game._entity({ hp: 1 }, { side: 'monster', team: 1, sourceLaneId: 0 });
    game._hurt(target, 1000, attacker, true); game._hurt(target, 1000, attacker, true);
  }
  assert.equal(player.eggHistory.beastKingKills, 166); assert.equal(player.technologies.R00L, undefined);
  assert.equal(eggRequirementStatus(player, 'R00L').recordedKills, 166);
});

test('dynamic appearance gates remain independent from original source requirements', () => {
  const player = freshPlayer(), def = { sourceRawcode: 'skin', name: '外观', documentGate: { type: 'shop', key: '20011313' } };
  assert.equal(appearanceQualificationStatus(player, def).met, false);
  player.entitlements['shop:20011313'] = 1; assert.equal(appearanceQualificationStatus(player, def).met, true);
  const vip = { ...def, documentGate: { type: 'vip', status: 'unconfirmed' } }; player.entitlements.vip = 99;
  assert.equal(appearanceQualificationStatus(player, vip).met, false);
  const any = { ...def, documentGate: { type: 'any', options: [{ type: 'vip', status: 'unconfirmed' }, { type: 'shop', key: '20011312' }] } };
  assert.equal(appearanceQualificationStatus(player, any).met, false); player.entitlements['20011312'] = 1; assert.equal(appearanceQualificationStatus(player, any).met, true);
  const game = fixture(); game.state.players[0].entitlements.Legion_Grail = 1;
  const target = { ...u('h204'), documentGate: { type: 'account', key: 'Legion_Grail' } };
  assert.equal(game.requirementStatus(target).canStart, false);
  game.state.players[0].technologies.R00R = 1; assert.equal(game.requirementStatus(target).canStart, true);
});

console.log(`${passed} document egg-rule checks passed.`);
