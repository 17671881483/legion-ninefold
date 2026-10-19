/** Audits the complete, reproducible workbook snapshot and generated catalog. */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { WORKBOOK_REFERENCE as reference, WORKBOOK_UNITS as units, WORKBOOK_ARCHIVE as archive, WORKBOOK_BUILDERS as builders, WORKBOOK_POOLS as pools, WORKBOOK_HERO_ENTRIES as heroes, WORKBOOK_UPGRADE_EDGES as edges, WORKBOOK_ABILITIES as abilities, WORKBOOK_UNIT_TEMPLATES as templates, WORKBOOK_TRIGGERED_SKILLS as triggers, WORKBOOK_RULES as rules, WORKBOOK_WAVES as waves, WORKBOOK_MERCENARIES as mercs } from '../dist/workbook-reference.js';
const source = JSON.parse(await readFile(new URL('../reference/workbook-source.json', import.meta.url), 'utf8'));
const rowAt = (sheet, row) => source.sheets[sheet].rows.find(item => item.row === row);
const rawList = text => String(text ?? '').split(',').map(s => s.trim()).filter(s => s && s !== '_');
const near = (a,b) => assert(Math.abs(a-b) < 1e-7, `${a} ≠ ${b}`);
let passed = 0;
function test(name, fn) { fn(); passed++; console.log(`✓ ${name}`); }

test('all fourteen workbook sheets preserve their complete record counts and row coordinates', () => {
  const counts = {'范围说明':26,'可玩防守兵种':315,'建造者与入口':17,'防守升级链':314,'先知与变形池':90,'脚本技能与配置冲突':17,'35波怪物':35,'木怪与国王商品':63,'单位技能关联':1562,'技能概览':738,'技能参数':7052,'玩法规则':21,'原始单位注册':1115,'代码证据':202};
  assert.equal(source.schema, 1); assert.deepEqual(Object.keys(source.sheets).sort(), Object.keys(counts).sort());
  for (const [sheet,count] of Object.entries(counts)) {
    assert.equal(source.sheets[sheet].rows.length, count, sheet);
    assert.equal(new Set(source.sheets[sheet].rows.map(row => row.row)).size, count, sheet);
    assert(source.sheets[sheet].rows.every(row => row.row >= 7 && row.values.length === source.sheets[sheet].headers.length), sheet);
  }
  assert.equal(source.document.sha256, reference.sha256); assert.equal(source.document.mapSha256, reference.mapSha256);
});

test('the snapshot keeps full source registers while the browser ships only related records', () => {
  assert.equal(Object.keys(source.sourceUnits).length, 1115); assert.equal(Object.keys(source.rawAbilities).length, 1375);
  assert.equal(Object.keys(source.linkedAbilities).length, 738); assert.equal(Object.keys(abilities).length, reference.abilityCount);
  assert.equal(Object.keys(templates).length, reference.templateCount); assert(Object.keys(abilities).length < 1375);
  assert.deepEqual(reference.sourceFiles, source.sourceFiles);
  for (const hash of Object.values(reference.sourceFiles)) assert.match(hash, /^[a-f0-9]{64}$/);
});

test('every defender or archive record points to its exact workbook row without losing source restrictions', () => {
  const all = [...units,...archive]; assert.equal(all.length, 315); assert.equal(new Set(all.map(u => u.sourceRawcode)).size, 315);
  for (const u of all) {
    const row = rowAt(u.source.sheet,u.source.row); assert(row, u.id); const values = row.values;
    assert.equal(u.source.sheet,'可玩防守兵种'); assert.equal(values[0],u.sourceRawcode); assert.equal(values[1],u.name);
    assert.equal(u.sourceCategory,values[2]); assert.equal(u.acquisition,values[4]); assert.equal(u.combatRawcode,values[9]);
    assert.equal(u.reachability,values[18]); assert.equal(u.sourceEvidence,values[19]);
  }
  assert(archive.every(u => u.sourceCategory === '仅注册待确认' && !u.playable));
});

test('builder menu paths and every random-pool entry reproduce the actual source rows', () => {
  for (const b of builders) {
    const values=rowAt(b.source.sheet,b.source.row).values;
    assert.equal(values[0],b.rawcode); assert.equal(values[1],b.name); assert.equal(values[6],b.menuPath);
    assert.equal(values[8],b.availability); assert.equal(values[10],b.sourceEvidence);
    const menu=[...new Set(rawList(values[4]).map(code=>`b_${code}`))]; assert.deepEqual(b.rosterIds,menu);
  }
  for (let tier=1;tier<=6;tier++) {
    const expected=source.sheets['先知与变形池'].rows.filter(row=>row.values[0]===tier).map(row=>`b_${row.values[2]}`);
    assert.deepEqual(pools[tier-1],expected); assert.equal(expected.length,15);
  }
});

test('upgrade records preserve target identity, costs and the unresolved H0DC case exactly', () => {
  for (const edge of edges) {
    const values=rowAt(edge.source.sheet,edge.source.row).values;
    assert.equal(edge.fromRawcode,values[0]); assert.equal(edge.toRawcode,values[2]); assert.equal(edge.resolved,values[4]);
    assert.equal(edge.evidence,values[13]); assert.equal(edge.limitation,values[14]??'');
    if (!edge.resolved) { assert.equal(edge.toRawcode,'H0DC'); assert.equal(edge.toId,null); }
  }
  assert.equal(heroes.length,10); assert.equal(units.filter(u=>u.hero).length,110);
});

test('all unit ability links retain separate building and combat lists plus native parameters', () => {
  for(const u of [...units,...archive,...waves,...mercs,...Object.values(templates)]) {
    assert.deepEqual(u.sourceAbilities.map(a=>a.rawcode),u.abilityIds,u.id??u.sourceRawcode);
    for(const a of u.sourceAbilities) {
      const record=abilities[a.rawcode]; assert(record,a.rawcode); assert.equal(a.baseCode,record.base_code);
      assert.deepEqual(a.fields,record.resolved_fields); assert.deepEqual(a.nativeFields,record.native_slk_fields);
      assert.deepEqual(a.objectOverrides,record.object_overrides);
    }
    if(u.buildingAbilityIds) assert.deepEqual(u.buildingAbilities.map(a=>a.rawcode),u.buildingAbilityIds);
  }
});

test('spell resolution retains raw overrides and does not replace mechanical targeting with generic enemies', () => {
  for(const [id,a] of Object.entries(abilities)) {
    if(a.source.sheet){const row=rowAt(a.source.sheet,a.source.row); assert(row,id); assert.equal(row.values[0],id);}
    else {assert.equal(a.source.supplement,'abilities-raw.json'); assert(source.rawAbilities[id],id);}
    assert(source.linkedAbilities[id]||source.rawAbilities[id],id); assert.equal(a.rawcode,id);
    assert(a.overrideResolution); assert(Array.isArray(a.object_overrides));
  }
  assert.equal(abilities.A037.fields.targs1,'mechanical'); assert.equal(abilities.A037.fields.DataA1,100); assert.equal(abilities.A037.fields.DataB1,2);
  assert.equal(abilities.A0S6.fields.DataA1,20); near(abilities.A0S6.fields.Dur1,.1);
  const ballista=mercs.find(u=>u.sourceRawcode==='h055'); assert(ballista.abilityIds.includes('A037'));
});

test('script skill evidence and all twenty-one gameplay conclusions remain inspectable', () => {
  const {document_catalog_checks:checks,...originalTriggers}=triggers;
  assert.deepEqual(originalTriggers,source.triggeredSkills); assert.deepEqual(checks,source.supplementalEvidence);
  assert.equal(triggers.triggered_skills.length,7);
  assert.equal(triggers.source_sha256,'42b3479f70f923e1ed358ac69dfa352acba23f06f36b7a27dfc2157a4e3fcc81');
  const ids=new Set(source.sheets['代码证据'].rows.map(row=>row.values[0]));
  for(const rule of rules) {
    const values=rowAt(rule.source.sheet,rule.source.row).values;
    assert.equal(rule.id,values[0]); assert.equal(rule.conclusion,values[1]); assert.equal(rule.limitation,values[6]);
    for(const id of String(values[5]).split('；')) assert(ids.has(id),id);
  }
  assert.equal(rules.length,21);
  for(const id of ['mode_x3_no_x9','worker_and_lumber_tech','holy_heal','overtime']) assert(rules.some(rule=>rule.id===id));
});
console.log(`\n${passed} workbook suites passed.`);
