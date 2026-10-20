import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {V14_ABILITIES,V14_UNIT_TEMPLATES,V14_UNITS} from '../dist/v14-reference.js';
import {garroshAfterDamage,garroshOnHit,tickGarroshJobs} from '../dist/garrosh-rules.js';

const jass=(await readFile(new URL('../reference/v14-source/raw_extracted/war3map.j',import.meta.url))).toString('latin1'),lines=jass.split('\n');
const sourceFunction=name=>{
  const match=jass.match(new RegExp(`function ${name}\\b[\\s\\S]*?endfunction`));assert.ok(match,name);return match[0];
};
function fixture(){
  const def=V14_UNIT_TEMPLATES.h0SN,building={id:'garrosh-building',unitId:'v14_n06K'};
  const caster={id:'garrosh',ownerId:0,buildingId:building.id,team:0,side:'defender',hp:def.hp,maxHp:def.hp,armor:def.armor,abilityIds:[...def.abilityIds],status:{}};
  const target={id:'enemy',team:1,side:'monster',hp:100,maxHp:100,status:{}};
  const game={state:{time:0,entities:[caster,target],players:[{id:0,buildings:[building]}],sourceSkillJobs:[]},_random:()=>.1};
  const hits=[],api={universalDamage:(g,v,amount,source)=>{hits.push({amount,sourceId:source.id,targetId:v.id});v.hp-=amount;}};
  return {game,caster,target,building,hits,api};
}
const hurt=(fixture,actual,api={})=>{fixture.caster.hp-=actual;return garroshAfterDamage(fixture.game,fixture.caster,actual,api);};

test('Garrosh abilities, building/combat mapping and literal JASS branches identify these exact mechanics',()=>{
  const building=V14_UNITS.find(u=>u.sourceRawcode==='n06K');assert.equal(building.combatRawcode,'h0SN');
  assert.ok(building.buildingAbilityIds.includes('A1A5'));assert.ok(V14_UNIT_TEMPLATES.h0SN.abilityIds.includes('A1A6'));
  assert.equal(V14_ABILITIES.A1A0.fields.levels,'100');assert.equal(V14_ABILITIES.A1A0.fields.DataA1,'1.0');
  assert.ok(jass.includes('integer Ql=$41314130'));
  const wall=sourceFunction('GarroshShieldWallAction');
  assert.match(wall,/set Pv=100/);assert.match(wall,/if Pv-GetUnitLifePercent\(Bc\)>=2 then/);
  assert.match(wall,/SetUnitAbilityLevel\(Bc,Ql,GetUnitAbilityLevel\(Bc,Ql\)\+1\)/);
  assert.match(wall,/SetUnitAbilityLevel\(Pf,Ql,GetUnitAbilityLevel\(Pf,Ql\)\+1\)/);
  assert.ok(lines[43775-1].includes('GetUnitAbilityLevel(Pf,$41314135)'));
  assert.ok(lines[43776-1].includes('call GarroshShieldWall(Bc,Pf)'));
  assert.ok(lines[42332-1].includes('GetUnitAbilityLevel(i,$41314136)'));
  assert.match(sourceFunction('GarroshBleed'),/TriggerRegisterTimerEvent\(t,0,false\)/);
  assert.match(sourceFunction('GarroshBleed'),/TriggerRegisterTimerEvent\(t,1,true\)/);
  assert.match(sourceFunction('GarroshBleedAction'),/UnitDamageTargetBJ\(Bc,Om,10,ATTACK_TYPE_CHAOS,DAMAGE_TYPE_UNIVERSAL\)/);
});

test('iron armor reads pre-damage life, grants level one first, then at most one level per damage event',()=>{
  const f=fixture(),baseArmor=f.caster.armor;
  assert.deepEqual(hurt(f,300),{level:1,addedLevel:1},'first event reads 100%, before this hit removes 10%');
  assert.deepEqual(hurt(f,30),{level:2,addedLevel:1},'next event observes the earlier 10% drop, adding only one');
  assert.equal(hurt(f,30).level,2,'pre-event life has only fallen 1% since the last threshold');
  assert.equal(hurt(f,30).level,3,'cumulative pre-event drop reaches 2%');
  assert.equal(f.building.garroshArmorLevel,3);assert.equal(f.caster.status.garroshArmorLevel,3);
  assert.equal(f.caster.armor,baseArmor,'the aura layer owns the dynamic armor contribution');
});

test('healing does not reset the life threshold, and existing armor survives new deployment thresholds',()=>{
  const f=fixture();hurt(f,300);hurt(f,30);assert.equal(f.caster.status.garroshArmorLastLifePercent,90);
  f.caster.hp=3000;hurt(f,300);assert.equal(hurt(f,30).level,2,'revisiting 90% does not grant a second threshold');
  f.caster.status={garroshArmorLevel:f.building.garroshArmorLevel};f.caster.hp=3000;
  assert.equal(hurt(f,300).level,2,'new native trigger starts at 100% while preserving the building level');
  assert.equal(hurt(f,10).level,3);assert.equal(f.building.garroshArmorLevel,3);
});

test('iron armor caps at the native 100 levels and processes the pre-life of a lethal event',()=>{
  const f=fixture();f.building.garroshArmorLevel=99;
  f.caster.hp=1000;
  assert.equal(hurt(f,2000).level,100,'lethal hit still had living pre-event HP and triggers its final increment');
  f.caster.hp=900;assert.equal(hurt(f,1).level,100);assert.equal(f.building.garroshArmorLevel,100);
  f.caster.hp=800;assert.equal(garroshAfterDamage(f.game,f.caster,0).level,100);
  assert.equal(garroshAfterDamage(f.game,{hp:10,maxHp:10,status:{}},1),null);
  const g=fixture();g.caster.hp=2000;
  assert.equal(garroshAfterDamage(g.game,g.caster,100,{preDamageHp:3000}).level,1,'explicit preDamageHp avoids counting reactive HP changes');
  const zero=fixture();assert.equal(garroshAfterDamage(zero.game,zero.caster,0).level,1,'the native damaged handler has no positive-event-damage guard');
});

test('runtime ability lists, rather than Garrosh rawcodes or template fields, control the two triggers',()=>{
  const f=fixture();f.caster.combatRawcode='h0SN';f.caster.sourceRawFields={abilList:'A1A5,A1A6'};f.caster.skillSpecs=[];
  assert.equal(hurt(f,30),null);assert.equal(garroshOnHit(f.game,f.caster,f.target,f.api),false);
  delete f.caster.skillSpecs;delete f.caster.abilityIds;
  assert.equal(hurt(f,30),null);assert.equal(garroshOnHit(f.game,f.caster,f.target,f.api),false);
  f.caster.skillSpecs=[{id:'A1A5'},{id:'A1A6'}];
  assert.ok(hurt(f,30));assert.equal(garroshOnHit(f.game,f.caster,f.target,f.api),true);
});

test('bleed rolls the source inclusive 10% chance, hits immediately, then once per second without duration expiry',()=>{
  const f=fixture();assert.equal(garroshOnHit(f.game,f.caster,f.target,f.api),true);
  assert.equal(f.target.hp,90);assert.deepEqual(f.hits,[{amount:10,sourceId:'garrosh',targetId:'enemy'}]);
  const job=f.game.state.sourceSkillJobs[0];assert.equal(job.nextAt,1);
  assert.equal(tickGarroshJobs(f.game,job,.999,f.api),true);assert.equal(f.target.hp,90);
  assert.equal(tickGarroshJobs(f.game,job,3.1,f.api),true);assert.equal(f.target.hp,60);assert.equal(job.nextAt,4);
  const no=fixture();no.game._random=()=>.100001;
  assert.equal(garroshOnHit(no.game,no.caster,no.target,no.api),false);assert.equal(no.hits.length,0);
  assert.equal(no.game.state.sourceSkillJobs.length,0);
});

test('bleed deduplicates each caster/target pair while allowing independent Garrosh casters',()=>{
  const f=fixture();assert.equal(garroshOnHit(f.game,f.caster,f.target,f.api),true);
  assert.equal(garroshOnHit(f.game,f.caster,f.target,f.api),false);assert.equal(f.target.hp,90);assert.equal(f.game.state.sourceSkillJobs.length,1);
  const second={...f.caster,id:'garrosh-two',status:{}};f.game.state.entities.push(second);
  assert.equal(garroshOnHit(f.game,second,f.target,f.api),true);assert.equal(f.target.hp,80);assert.equal(f.game.state.sourceSkillJobs.length,2);
  const allied={...f.target,id:'ally',team:0,status:{}};f.game.state.entities.push(allied);
  assert.equal(garroshOnHit(f.game,f.caster,allied,f.api),false);assert.equal(allied.hp,80);
});

test('bleed stops and clears the pair if either participant dies or leaves the world',()=>{
  for(const kind of ['source','target','missing-source']){
    const f=fixture();garroshOnHit(f.game,f.caster,f.target,f.api);const job=f.game.state.sourceSkillJobs[0];
    if(kind==='source')f.caster.hp=.405;
    else if(kind==='target')f.target.hp=0;
    else f.game.state.entities=f.game.state.entities.filter(e=>e.id!==f.caster.id);
    assert.equal(tickGarroshJobs(f.game,job,10,f.api),false);assert.equal(f.hits.length,1);
    assert.equal(f.target.status.garroshBleedSources[f.caster.id],undefined);
  }
  const f=fixture();f.target.hp=10;assert.equal(garroshOnHit(f.game,f.caster,f.target,f.api),true);
  assert.equal(f.target.hp,0);assert.equal(f.game.state.sourceSkillJobs.length,0);
  assert.equal(f.target.status.garroshBleedSources[f.caster.id],undefined);
});

test('bleed jobs and pair guards are plain snapshot data, preserving pulse timing on restore',()=>{
  const f=fixture();garroshOnHit(f.game,f.caster,f.target,f.api);
  const state=JSON.parse(JSON.stringify(f.game.state)),game={...f.game,state};
  const target=state.entities.find(e=>e.id==='enemy'),caster=state.entities.find(e=>e.id==='garrosh'),job=state.sourceSkillJobs[0];
  assert.equal(garroshOnHit(game,caster,target,f.api),false);
  assert.equal(tickGarroshJobs(game,job,1,f.api),true);assert.equal(target.hp,80);assert.equal(job.nextAt,2);
});
