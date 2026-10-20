import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Game } from '../dist/engine.js';
import { UNITS, UNIT_TEMPLATES } from '../dist/data.js';
import { EGG_REQUIREMENTS, recordEggCompletion, restoreEggHistory, eggRequirementStatus } from '../dist/egg-rules.js';

const grants = { R0HS: ['h0D2'], R0HM: ['h0CS'], R01D: ['h09S'], R0D2: ['n07H'], R05E: ['h01L', 'h047'] };
const byId = Object.fromEntries(UNITS.map(u => [u.id, u]));
const unit = code => UNITS.find(u => !u.legacy && u.sourceRawcode === code);
const troop = code => unit(code) ?? UNIT_TEMPLATES[code];
const player = () => ({ technologies: {}, buildings: [], entitlements: {} });
const complete = (p, code, id = code) => recordEggCompletion(p, troop(code), { buildingId: id, wave: 2, unitsById: byId });
const saved = value => JSON.parse(JSON.stringify(value));
function gameFixture() {
  const g = new Game({ mode: 'sandbox', seed: 313 }); g.state.phase = 'build';
  for (const p of g.state.players) { p.buildings = []; p.eggHistory = undefined; p.completedSourceUnits = undefined; p.technologies = {}; p.entitlements = {}; p.gold = p.wood = 100000; p.populationCap = 300; }
  return g;
}
function finish(g, code, id = `finish-${g.state.players[0].buildings.length}`) {
  const p = g.state.players[0], def = unit(code); assert.ok(def, code);
  const b = { id, unitId: def.id, col: p.buildings.length % 6, row: Math.floor(p.buildings.length / 6), construction: { targetId: def.id } };
  p.buildings.push(b); g._completeConstruction(p, b); return b;
}

test('five prerequisite rules use source-confirmed exact raw predicates and source lines', async () => {
  const jass = (await readFile(new URL('../reference/v14-source/raw_extracted/war3map.j', import.meta.url))).toString('latin1');
  for (const [id, codes] of Object.entries(grants)) {
    const rule = EGG_REQUIREMENTS[id]; assert.equal(rule.status, 'confirmed'); assert.equal(rule.completionMode, 'raw'); assert.deepEqual(rule.groups, [codes]); assert.ok(rule.sourceLines.length >= 2);
    const hex = Buffer.from(id, 'ascii').toString('hex').toUpperCase(); assert.ok(jass.includes(`call SetPlayerTechResearchedSwap($${hex},1,h)`), id);
  }
  assert.match(jass, /set x=GetUnitTypeId\(i\)[\s\S]*?call AllBuildingStartApplyEggWhiteEx\(i,x,BF,Yt\)/);
});

test('each single completion grants only its own training prerequisite, idempotently', () => {
  for (const [id, [code]] of Object.entries(grants).filter(([id]) => id !== 'R05E')) {
    const p = player(), result = complete(p, code); assert.ok(result.includes(id)); assert.equal(p.technologies[id], 1); assert.equal(p.eggHistory.rawCompleted[code], true);
    assert.equal(eggRequirementStatus(p, id).met, true); assert.equal(eggRequirementStatus(p, id).kind, 'egg_history');
    for (const other of Object.keys(grants).filter(other => other !== id)) assert.equal(p.technologies[other], undefined);
    const before = saved(p.eggHistory); assert.deepEqual(complete(p, code), []); assert.deepEqual(p.eggHistory, before);
  }
});

test('R05E requires both distinct actual completions in either order and retains the first after sale', () => {
  for (const codes of [['h01L', 'h047'], ['h047', 'h01L']]) {
    const p = player(); complete(p, codes[0], 'sold-first'); assert.equal(p.technologies.R05E, undefined); p.buildings = [];
    assert.ok(complete(p, codes[1], 'second').includes('R05E')); assert.equal(p.technologies.R05E, 1);
  }
  const p = player(); complete(p, 'h01L', 'first'); complete(p, 'h01L', 'second'); assert.equal(p.technologies.R05E, undefined);
});

test('a source skin record does not fabricate an exact base completion for these five grants', () => {
  for (const [skin, base, technology] of [['h2A3', 'h0D2', 'R0HS'], ['h0US', 'h0D2', 'R0HS'], ['h0P6', 'h09S', 'R01D']]) {
    const p = player(); complete(p, skin); assert.equal(p.completedSourceUnits[base], true, 'existing alias history remains available to its own source rules'); assert.equal(p.eggHistory.rawCompleted[skin], true); assert.equal(p.eggHistory.rawCompleted[base], undefined); assert.equal(p.technologies[technology], undefined);
    complete(p, base); assert.equal(p.technologies[technology], 1); assert.equal(p.eggHistory.rawCompleted[base], true);
  }
});

test('a valid base completion remains valid after a skin change, save, or a repeated alias record', () => {
  const p = player(); complete(p, 'h0D2', 'same-building'); complete(p, 'h2A3', 'same-building'); complete(p, 'h0US', 'same-building');
  const copy = saved(p); restoreEggHistory(copy, { wave: 4, unitsById: byId }); assert.equal(copy.technologies.R0HS, 1); assert.equal(copy.eggHistory.rawCompleted.h0D2, true);
  assert.equal(copy.eggHistory.counts.h0D2, 1, 'skin changes do not replay the base completion count');
});

test('existing alias-based rules still accept source-supported appearance history', () => {
  const p = player(); complete(p, 'h2AB'); complete(p, 'h0AA'); assert.equal(p.technologies.R0DU, 1);
  complete(p, 'h0R8'); assert.equal(p.technologies.R09D, 1); assert.equal(p.completedSourceUnits.h01B, true);
  assert.equal(p.technologies.R0HS, undefined);
});

test('an arbitrary gameplay/skin base pointer cannot satisfy a new exact raw prerequisite', () => {
  for (const [id, codes] of Object.entries(grants)) {
    const p = player();
    codes.forEach((base, index) => recordEggCompletion(p, { id: `skin-${index}`, sourceRawcode: `s00${index}`, skinBaseRawcode: base, appearanceBaseRawcode: base, gameplayBaseRawcode: base, provenance: 'v14.1A5-dataset' }, { buildingId: `alias-${index}`, wave: 2 }));
    assert.equal(p.technologies[id], undefined); for (const code of codes) { assert.equal(p.eggHistory.completed[code], true); assert.equal(p.eggHistory.rawCompleted[code], undefined); }
  }
});

test('in-progress new builds and upgrade targets do not record completion even if passed to the completion API', () => {
  const p = player(), def = unit('h0D2'), old = unit('h0D0');
  p.buildings = [{ id: 'new-build', unitId: def.id, construction: { targetId: def.id } }];
  assert.deepEqual(recordEggCompletion(p, def, { buildingId: 'new-build', unitsById: byId }), []); assert.equal(p.technologies.R0HS, undefined); assert.equal(p.eggHistory, undefined);
  p.buildings = [{ id: 'upgrading', unitId: old.id, construction: { targetId: def.id } }];
  assert.deepEqual(recordEggCompletion(p, def, { buildingId: 'upgrading', unitsById: byId }), []); assert.equal(p.technologies.R0HS, undefined);
  recordEggCompletion(p, old, { buildingId: 'upgrading', unitsById: byId }); assert.equal(p.eggHistory.rawCompleted.h0D0, true); assert.equal(p.eggHistory.rawCompleted.h0D2, undefined);
});

test('legacy units and morph proxies cannot grant training history', () => {
  for (const def of [{ sourceRawcode: 'h0D2', sourceVersion: 'Legion TD 5.0dJF' }, { ...troop('h0D2'), morphProxy: true }]) {
    const p = player(); assert.deepEqual(recordEggCompletion(p, def), []); assert.equal(p.eggHistory, undefined); assert.equal(p.technologies.R0HS, undefined);
  }
});

test('version-one raw completion event journals migrate sold stages without replaying their counts', () => {
  const p = player(); p.eggHistory = { version: 1, completed: {}, counts: { h0D2: 1 }, events: {} };
  for (const code of Object.values(grants).flat()) { p.eggHistory.events[`building:with:colons:${code}`] = true; p.eggHistory.completed[code] = true; }
  restoreEggHistory(p, { wave: 4, unitsById: byId });
  for (const id of Object.keys(grants)) assert.equal(p.technologies[id], 1);
  assert.equal(p.eggHistory.version, 2); assert.equal(p.eggHistory.counts.h0D2, 1); assert.deepEqual(p.buildings, []);
  const before = saved(p.eggHistory); restoreEggHistory(p, { wave: 4, unitsById: byId }); assert.deepEqual(p.eggHistory, before);
});

test('old expanded aliases do not become proof of a sold base unit on migration', () => {
  const p = player(); p.completedSourceUnits = { h0D2: true, h2A3: true, h09S: true, h0P6: true };
  p.eggHistory = { version: 1, completed: { ...p.completedSourceUnits }, events: { 'skin-dragon:h2A3': true, 'skin-priest:h0P6': true }, counts: { h0D2: 1, h09S: 1 } };
  restoreEggHistory(p, { wave: 4, unitsById: byId }); assert.equal(p.technologies.R0HS, undefined); assert.equal(p.technologies.R01D, undefined); assert.equal(p.eggHistory.rawCompleted.h2A3, true); assert.equal(p.eggHistory.rawCompleted.h0D2, undefined);
});

test('a pre-history save never fabricates sold completion history from generic base flags', () => {
  const p = player(); p.completedSourceUnits = Object.fromEntries(Object.values(grants).flat().map(code => [code, true]));
  restoreEggHistory(p, { wave: 4, unitsById: byId }); for (const id of Object.keys(grants)) assert.equal(p.technologies[id], undefined);
  assert.deepEqual(p.eggHistory.rawCompleted, {});
});

test('existing researched technology remains permanent even if its historical completion proof predates the save format', () => {
  const p = player(); p.technologies.R0HS = 1; restoreEggHistory(p, { wave: 4, unitsById: byId }); assert.equal(p.technologies.R0HS, 1); assert.equal(eggRequirementStatus(p, 'R0HS').met, true);
});

test('pre-history restore backfills only currently provable finished stages and old upgrade stages', () => {
  const p = player(), bone = unit('h0D2'), skin = unit('h2A3'), necro = unit('h0CS'), priest = unit('h09S'), naga = unit('n07H');
  p.buildings = [
    { id: 'bone-upgrading-skin', unitId: bone.id, construction: { targetId: skin.id } },
    { id: 'necro-done', unitId: necro.id },
    { id: 'priest-new-build', unitId: priest.id, construction: { targetId: priest.id } },
    { id: 'naga-new-build', unitId: naga.id, construction: { targetId: naga.id } },
  ];
  restoreEggHistory(p, { wave: 4, unitsById: byId }); assert.equal(p.technologies.R0HS, 1); assert.equal(p.technologies.R0HM, 1); assert.equal(p.technologies.R01D, undefined); assert.equal(p.technologies.R0D2, undefined); assert.equal(p.eggHistory.rawCompleted.h2A3, undefined);
});

test('real military completions grant each prerequisite only after construction completes and keep it after selling/JSON restore', () => {
  for (const [id, [code]] of Object.entries(grants).filter(([id]) => id !== 'R05E')) {
    const g = gameFixture(), p = g.state.players[0], def = unit(code), b = { id: `actual-${code}`, unitId: def.id, col: 0, row: 0, construction: { targetId: def.id } };
    p.buildings.push(b); assert.equal(g.requirementStatus({ requiresDetails: [{ rawcode: id, amount: 1 }] }).canStart, false); assert.equal(p.technologies[id], undefined);
    g._completeConstruction(p, b); assert.equal(p.technologies[id], 1); assert.equal(g.requirementStatus({ requiresDetails: [{ rawcode: id, amount: 1 }] }).canStart, true);
    assert.equal(g.command('sell', { buildingId: b.id }).ok, true); assert.equal(p.buildings.length, 0);
    const restored = Game.fromSnapshot(saved(g.snapshot())); assert.equal(restored.state.players[0].technologies[id], 1); assert.equal(restored.state.players[0].eggHistory.rawCompleted[code], true);
  }
});

test('real R05E completion history works across a sale and save between its two prerequisites', () => {
  const g = gameFixture(), first = finish(g, 'h01L'); assert.equal(g.state.players[0].technologies.R05E, undefined); assert.equal(g.command('sell', { buildingId: first.id }).ok, true);
  const restored = Game.fromSnapshot(saved(g.snapshot())); finish(restored, 'h047'); assert.equal(restored.state.players[0].technologies.R05E, 1); assert.equal(restored.state.players[0].buildings.length, 1);
});

test('a source skin-only old save restores its own raw journal without fabricating the original prerequisite', () => {
  const g = gameFixture(); finish(g, 'h2A3'); const p = g.state.players[0]; assert.equal(p.technologies.R0HS, undefined);
  delete p.eggHistory; delete p.completedSourceUnits; const restored = Game.fromSnapshot(saved(g.snapshot())), target = restored.state.players[0];
  assert.equal(target.completedSourceUnits.h0D2, true); assert.equal(target.eggHistory.rawCompleted.h2A3, true); assert.equal(target.eggHistory.rawCompleted.h0D2, undefined); assert.equal(target.technologies.R0HS, undefined);
});
