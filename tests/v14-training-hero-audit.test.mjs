import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {V14_UNITS,V14_ABILITIES} from '../dist/v14-reference.js';
import {compileSkills,describeSkills,skillCoverage,attachSkills,refreshSourceSkills,SKILL_IMPLEMENTATION_REVISION} from '../dist/skills.js';

const report=JSON.parse(await readFile(new URL('../reference/training-hero-source-audit.json',import.meta.url),'utf8'));
const bytes=await readFile(new URL('../reference/v14-source/raw_extracted/war3map.j',import.meta.url));
const lines=bytes.toString('latin1').split('\n');
const unit=raw=>V14_UNITS.find(u=>u.sourceRawcode===raw);

test('training hero audit keeps all 24 current object statuses and the original seven generic labels without miscounting existing alliance',()=>{
  assert.deepEqual(report.heroes.map(h=>h.buildingRawcode),['n02S','n05H','n07I','n08Y','n08Z']);
  assert.equal(report.initialRuntimeCounts.runtimeImplemented,7);assert.equal(report.initialRuntimeCounts.runtimeUnresolved,17);
  assert.equal(report.counts.staticSkills,24);assert.equal(report.counts.runtimePartial,3);assert.equal(report.initialRecommendation.buildingRawcode,'n07I');assert.equal(report.counts.runtimeImplemented,6);assert.equal(report.counts.runtimeUnresolved,15);
  for(const hero of report.heroes){
    const def=unit(hero.buildingRawcode);assert.equal(def.combatRawcode,hero.combatRawcode);
    assert.deepEqual(hero.staticSkills.map(s=>s.id),def.abilityIds);
    const current=new Map(compileSkills(def).map(s=>[s.id,s]));
    for(const skill of hero.staticSkills){
      assert.equal(skill.runtimeStatus,current.get(skill.id).status,skill.id);
      assert.equal(skill.baseCode,V14_ABILITIES[skill.id].base_code,skill.id);
      assert.deepEqual(skill.abilitySource,V14_ABILITIES[skill.id].source,skill.id);
    }
  }
  const alliance=report.heroes[0].mechanisms.find(m=>m.id==='lich-kelthuzad-alliance');
  assert.equal(alliance.status,'already-implemented-dynamic');
  assert.deepEqual(alliance.skillIds,['A0ZV','A0ZW','A0ZY']);
  assert.equal(report.recommendation.buildingRawcode,'n02S');
});

test('audit cites literal normal/arena/summon/attack/birth registrations in the unchanged LF-counted JASS',()=>{
  assert.equal(createHash('sha256').update(bytes).digest('hex'),report.source.sha256);
  const registrations=new Map(report.sourceRegistrations.map(r=>[r.id,r]));
  for(const required of ['lich-normal-type','lich-normal-action','lich-normal-death','lich-arena-ability','lich-arena-action',
    'vashj-lightning-action','vashj-spore-action','vashj-cold-arrow-action','vashj-phantom-action','vashj-alliance-action','bright-alliance-action'])assert.ok(registrations.has(required),required);
  for(const entry of registrations.values()){
    assert.ok(lines[entry.line-1].includes(entry.required),entry.id);
    const head=lines.slice(0,entry.line).filter(line=>line.startsWith('function ')).at(-1);
    assert.ok(head.startsWith(`function ${entry.function} `),entry.id);
  }
  assert.equal(registrations.get('lich-normal-action').line,21380);
  assert.equal(registrations.get('lich-arena-action').line,20196);
  assert.equal(registrations.get('vashj-phantom-action').line,41584);
});

test('Lich native aura stays implemented while zero-valued AUau and an Aslo proxy do not claim dedicated resurrection or dragon scripts',()=>{
  const def=unit('n02S'),compiled=new Map(compileSkills(def).map(s=>[s.id,s]));
  const aura=compiled.get('A0KO');assert.equal(aura.status,'implemented');assert.equal(aura.move,.35);assert.equal(aura.regen,20);
  const call=compiled.get('A0KP');assert.equal(V14_ABILITIES.A0KP.base_code,'AUau');
  assert.equal(V14_ABILITIES.A0KP.resolved_fields.DataA1,undefined);assert.equal(V14_ABILITIES.A0KP.resolved_fields.DataB1,undefined);
  assert.equal(call.status,'unresolved');assert.match(call.effectText,/Arthas.*尚未接入/);
  const dragon=compiled.get('A0KQ');assert.equal(V14_ABILITIES.A0KQ.base_code,'Aslo');
  assert.equal(dragon.manaCost,18);assert.equal(dragon.fields.Rng1,'600.0');assert.equal(dragon.duration,.001);
  assert.equal(dragon.status,'unresolved');assert.match(dragon.effectText,/A0KQ_Action.*尚未接入/);
  const trigger=describeSkills(def).find(s=>s.id==='trigger:h0M0');
  assert.equal(trigger.status,'partial');assert.match(trigger.effectText,/护命匣联盟仍由既有/);
  assert.deepEqual(skillCoverage(def),{implemented:1,partial:1,markers:0,unresolved:2});
  const existing=compileSkills({...def,abilityIds:['A0ZV','A0ZW']});
  assert.ok(existing.every(s=>s.status==='implemented'),'the existing KelThuzad alliance was not downgraded');
});

test('saved generic Lich labels refresh to audited statuses without replaying source stats or changing current resources',()=>{
  const def=unit('n02S'),e={hp:123,maxHp:999,damage:555};attachSkills(e,def);
  e.hp=123;e.maxHp=999;e.damage=555;e.mana=31;
  e.skillImplementationRevision='v14-content-20261020-v15-1';
  for(const s of e.skillSpecs)if(['A0KP','A0KQ'].includes(s.id))s.status='implemented';
  assert.equal(refreshSourceSkills(e,def),true);
  assert.equal(e.skillImplementationRevision,SKILL_IMPLEMENTATION_REVISION);
  assert.deepEqual([e.hp,e.maxHp,e.damage,e.mana],[123,999,555,31]);
  assert.ok(e.skillSpecs.filter(s=>['A0KP','A0KQ'].includes(s.id)).every(s=>s.status==='unresolved'));
  assert.equal(refreshSourceSkills(e,def),false);
});
