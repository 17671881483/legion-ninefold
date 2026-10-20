import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Game } from '../dist/engine.js';
import { UNITS, UNIT_TEMPLATES } from '../dist/data.js';
import { EGG_REQUIREMENTS, appearanceQualificationStatus, recordEggCompletion } from '../dist/egg-rules.js';
import { SANDBOX_QUALIFICATIONS, SANDBOX_QUALIFICATION_KEYS, applySandboxQualification } from '../dist/sandbox-qualifications.js';

const game = (mode = 'sandbox') => new Game({ seed: 42, mode });
const unit = rawcode => UNITS.find(entry => !entry.legacy && entry.sourceRawcode === rawcode);

test('qualification catalog extracts real source markers with the actual super-sponsor label', () => {
  const markers = SANDBOX_QUALIFICATIONS.filter(entry => entry.kind === 'marker');
  assert.deepEqual(markers.map(entry => entry.key), ['h200', 'h210', 'h220', 'h230', 'h240']);
  assert.equal(markers.find(entry => entry.key === 'h220').label, '军团战争超级赞助');
  assert.equal(markers.find(entry => entry.key === 'h240').label, '未命名资格标记（h240）');
  for (const marker of markers) assert.ok(UNIT_TEMPLATES[marker.key]);
  assert.equal(new Set(SANDBOX_QUALIFICATION_KEYS).size, SANDBOX_QUALIFICATION_KEYS.length);
});

test('all item keys come from the actual engine entitlement branch and exclude recipe technologies', () => {
  for (const entry of SANDBOX_QUALIFICATIONS.filter(entry => entry.kind === 'item')) {
    assert.ok(UNITS.some(candidate => !candidate.legacy && candidate.requiresDetails?.some(r => r.rawcode === entry.key && /赞助|会员|荣誉|道具|皮肤|尊享/.test(r.name))));
    assert.equal(EGG_REQUIREMENTS[entry.key], undefined);
  }
  for (const key of ['R03D', 'R2Z0', 'R003', 'R0GK', 'u004', 'u03O']) assert.equal(SANDBOX_QUALIFICATION_KEYS.includes(key), false, key);
});

test('normal games reject qualification writes without mutating the player', () => {
  const g = game('normal'), before = JSON.stringify(g.state.players);
  assert.equal(applySandboxQualification(g, { key: 'h220', enabled: true }).ok, false);
  assert.equal(JSON.stringify(g.state.players), before);
});

test('super-sponsor can be enabled and disabled independently of membership and ordinary sponsorship', () => {
  const g = game(), p = g.state.players[0], def = unit('h0PD');
  assert.equal(g.requirementStatus(def.id).requirements.find(r => r.rawcode === 'h220').met, false);
  assert.equal(applySandboxQualification(g, { key: 'h220', enabled: true }).ok, true);
  assert.equal(g.requirementStatus(def.id).requirements.find(r => r.rawcode === 'h220').met, true);
  assert.equal(g.requirementStatus(def.id).canStart, false, 'the independent source recipe still has to be completed');
  assert.equal(p.entitlements.h200, undefined); assert.equal(p.entitlements.h210, undefined); assert.equal(p.entitlements.h230, undefined);
  assert.equal(applySandboxQualification(g, { key: 'h220', enabled: false }).ok, true);
  assert.equal(g.requirementStatus(def.id).requirements.find(r => r.rawcode === 'h220').met, false);
});

test('test item entitlements feed the same source requirement checks as real imported item gates', () => {
  const g = game(), def = UNITS.find(entry => !entry.legacy && entry.requiresDetails?.some(r => r.rawcode === 'R0CU'));
  assert.equal(g.requirementStatus(def.id).requirements.find(r => r.rawcode === 'R0CU').met, false);
  assert.equal(applySandboxQualification(g, { key: 'R0CU', enabled: true }).ok, true);
  assert.equal(g.requirementStatus(def.id).requirements.find(r => r.rawcode === 'R0CU').met, true);
  assert.equal(g.state.players[0].technologies.R0CU, undefined, 'the real qualification branch reads entitlements, not technology levels');
});

test('an invalid batch is atomic and arbitrary or differently cased keys cannot be written', () => {
  const g = game(), p = g.state.players[0];
  for (const payload of [
    { keys: ['h220', 'R03D'], enabled: true }, { key: '__proto__', enabled: true }, { key: 'constructor', enabled: true },
    { key: 'H220', enabled: true }, { key: 'shop:20011312', enabled: true },
    { key: 'h220', enabled: 'true' }, { keys: [], enabled: true }, { keys: 'h220', enabled: true },
    { key: 'h220', keys: ['h210'], enabled: true }, { key: 'h220', enabled: true, playerId: 8 },
  ]) assert.equal(applySandboxQualification(g, payload).ok, false, JSON.stringify(payload));
  assert.deepEqual(p.entitlements, {});
});

test('bulk writes and other sandbox players use only the explicitly requested qualification keys', () => {
  const g = game();
  assert.equal(applySandboxQualification(g, { playerId: 3, keys: ['h200', 'h210', 'h220', 'h220'], enabled: true }).ok, true);
  assert.deepEqual(g.state.players[3].entitlements, { h200: 1, h210: 1, h220: 1 });
  assert.deepEqual(g.state.players[0].entitlements, {});
  assert.equal(applySandboxQualification(g, { playerId: 3, keys: ['h200', 'h220'], enabled: false }).ok, true);
  assert.deepEqual(g.state.players[3].entitlements, { h200: 0, h210: 1, h220: 0 });
});

test('shop and account appearance keys are real runtime gates and disabling clears stored typed aliases', () => {
  const g = game(), p = g.state.players[0], shop = unit('h160'), account = unit('h204');
  p.entitlements['shop:20011312'] = 1;
  assert.equal(appearanceQualificationStatus(p, shop).met, true);
  applySandboxQualification(g, { key: '20011312', enabled: false });
  assert.equal(appearanceQualificationStatus(p, shop).met, false); assert.equal(p.entitlements['shop:20011312'], 0);
  applySandboxQualification(g, { key: '20011312', enabled: true }); assert.equal(appearanceQualificationStatus(p, shop).met, true);
  applySandboxQualification(g, { key: 'Legion_Grail', enabled: true }); assert.equal(appearanceQualificationStatus(p, account).met, true);
});

test('unconfirmed VIP tiers remain locked rather than acquiring invented sandbox keys', () => {
  const g = game(), p = g.state.players[0], vip = UNITS.find(entry => entry.documentGate?.type === 'vip');
  applySandboxQualification(g, { keys: SANDBOX_QUALIFICATION_KEYS, enabled: true });
  assert.equal(appearanceQualificationStatus(p, vip).met, false);
  assert.equal(SANDBOX_QUALIFICATION_KEYS.some(key => key.startsWith('vip:')), false);
});

test('enabling qualifications does not backfill recipe history and later real completions still grant source unlocks', () => {
  const g = game(), p = g.state.players[0], wolf = unit('h0C0');
  recordEggCompletion(p, wolf, { buildingId: 'first-wolf', wave: 1 });
  assert.equal(p.technologies.R03D ?? 0, 0);
  applySandboxQualification(g, { key: 'h220', enabled: true }); assert.equal(p.technologies.R03D ?? 0, 0);
  recordEggCompletion(p, wolf, { buildingId: 'next-wolf', wave: 1 }); assert.equal(p.technologies.R03D, 1);
  applySandboxQualification(g, { key: 'h220', enabled: false }); assert.equal(p.technologies.R03D, 1, 'completed source technology is independent of later account toggle');
});

test('sandbox qualifications persist in snapshots without changing normal game defaults', () => {
  const g = game(); applySandboxQualification(g, { keys: ['h220', 'R0CU', 'Legion_Grail'], enabled: true });
  const saved = g.snapshot(), restored = game(); restored.restore(saved);
  assert.deepEqual(restored.state.players[0].entitlements, g.state.players[0].entitlements);
  assert.deepEqual(game('normal').state.players[0].entitlements, {});
});

test('source evidence supports the sponsor rawcode and all five recorded appearance account keys', () => {
  const csv = readFileSync(new URL('../reference/v14-source/data/all_units.csv', import.meta.url), 'utf8');
  assert.match(csv, /h220,军团战争超级赞助/);
  const source = readFileSync(new URL('../reference/v14-source/raw_extracted/war3map.j', import.meta.url), 'utf8');
  assert.match(source, /SaveInteger\(O,\$68305044,StringHash\("box_train_upgrade_require_2"\),\$68323230\)/);
  for (const key of ['20011312', '20011313', '20011321', 'Legion_Grail', 'Legion_Penix']) {
    assert.ok(SANDBOX_QUALIFICATION_KEYS.includes(key)); assert.ok(source.includes(key), key);
  }
});
