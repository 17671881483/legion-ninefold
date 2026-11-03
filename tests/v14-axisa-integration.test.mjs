import test from 'node:test';
import assert from 'node:assert/strict';
import {Game} from '../dist/engine.js';
import {UNIT_TEMPLATES} from '../dist/data.js';
import {compileSkills,sourceAuraEffects,initializeSourceSkills,initializeSourceClassCombat,tickSourceScriptJobs} from '../dist/skills.js';
const clone=x=>JSON.parse(JSON.stringify(x)),near=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);
export function createAxisaIntegrationFixture(){
 const g=new Game({mode:'sandbox',seed:74});g.state.phase='combat';g.state.time=10;g.state.entities=[];g.state.sourceSkillJobs=[];g._spawnQueue=[];g._aiAct=()=>{};for(const k of g.state.kings)k.worldX=k.worldY=10000;
 const skills=(e,ids)=>{e.skillSpecs=compileSkills({abilityIds:ids,skillVersion:'v14.1A5',distanceScale:1/3,abilityLevels:e.abilityLevels});e.skillStates={};};
 const make=(raw='h0TZ',team=0,x=0)=>{const e=g._entity(UNIT_TEMPLATES[raw],{side:team?'monster':'defender',team,ownerId:team?4:0,sourceNativeOwnerId:team?9:8,userData:team?5:1,battleTeam:0,laneId:0,sourceLaneId:0,worldX:5+x,worldY:8});e.hp=e.maxHp=1000;e.hpRegen=e.manaRegen=e.moveSpeed=0;e.mana=0;e.attackCd=999;e.ability=null;e.buffs=[];g.state.entities.push(e);return e;};
 const deploy=(raw='h0TZ',building='h0U2',team=0,x=0)=>{const e=make(raw,team,x),b={id:'b-'+e.id,unitId:'v14_'+building,col:2,row:4};e.buildingId=b.id;g.state.players[e.ownerId].buildings.push(b);initializeSourceClassCombat(g,b,e);return e;};
 const at=time=>{g.state.time=time;tickSourceScriptJobs(g);};
 return {g,make,skills,deploy,at};
}
test('A1CF actual levels change engine healing and level eleven stays ten rather than tooltip fifteen',()=>{
 for(const level of [1,5,10,11]){const f=createAxisaIntegrationFixture(),a=f.make(),t=f.make('h03E',0,.5);f.skills(a,['A1CF']);f.skills(t,[]);a.abilityLevels={A1CF:level};t.hp=500;f.g._updateEntities(1);near(t.hp,500+Math.min(level,10));near(sourceAuraEffects(f.g,t,[a]).healRate,Math.min(level,10));}
});
test('multiple tide providers use strongest same-buff regeneration and never sum their levels',()=>{
 const f=createAxisaIntegrationFixture(),a=f.make(),b=f.make(),t=f.make('h03E');f.skills(a,['A1CF']);f.skills(b,['A1CF']);f.skills(t,[]);a.abilityLevels={A1CF:3};b.abilityLevels={A1CF:8};near(sourceAuraEffects(f.g,t,[a,b]).healRate,8);a.abilityLevels.A1CF=0;near(sourceAuraEffects(f.g,t,[a,b]).healRate,8);b.hp=0;near(sourceAuraEffects(f.g,t,[a,b]).healRate,0);
});
test('level eleven native attack and armor auras work for eligible melee and ranged allies',()=>{
 const f=createAxisaIntegrationFixture(),a=f.make(),t=f.make('h03E',0,1);f.skills(a,['A1CH','A1CI']);f.skills(t,[]);for(const range of [.5,3]){t.range=range;const v=sourceAuraEffects(f.g,t,[a]);near(v.damage,.13);near(v.armor,2);}t.team=1;t.side='monster';near(sourceAuraEffects(f.g,t,[a]).damage,0);near(sourceAuraEffects(f.g,t,[a]).armor,0);
});
test('queen alliance really adds self-only ten-percent damage without vashj level two or attack speed',()=>{
 const f=createAxisaIntegrationFixture(),a=f.deploy(),q=f.make('h0OV',0,99),ally=f.make('h03E');f.skills(ally,[]);q.battleTeam=1;f.at(10);assert.ok(a.permanentAbilityIds.includes('A1CK'));assert.equal(a.abilityLevels?.A1CK??1,1);near(sourceAuraEffects(f.g,a,[a]).damage,.23);near(sourceAuraEffects(f.g,ally,[a]).damage,.13);assert.equal(a.skillSpecs.some(s=>s.id==='A1OE'),false);assert.equal(a.skillSpecs.some(s=>s.id==='A1CG'),false);
});
test('enemy queen alone does not grant an absent resistance ability or reduce the regeneration level',()=>{
 const f=createAxisaIntegrationFixture(),a=f.deploy();a.abilityLevels={A1CF:11};f.make('h0OV',1,90);f.at(10);assert.equal(a.skillSpecs.some(s=>s.id==='A1CG'),false);assert.equal(a.abilityLevels.A1CF,11);near(sourceAuraEffects(f.g,a,[a]).healRate,10);assert.equal(a.status.axisa.swapResult.requests[0].requestedLevel,-1);
});
test('multiple enemy queens lower an existing true resistance level and actual incoming spell damage follows it',()=>{
 const f=createAxisaIntegrationFixture(),a=f.deploy();f.skills(a,['A1CF','A1CJ','A1CG']);a.abilityLevels={A1CF:11,A1CG:5};f.make('h0OV',1,90);const enemy=f.make('h0OV',1,91);f.skills(enemy,[]);f.at(10);assert.equal(a.abilityLevels.A1CG,3);near(a.status.nagaSpellResistance,.3);near(f.g._hurt(a,100,enemy,{magic:true,spell:true}),70);near(a.hp,930);
});
test('the one-time queen scan is not replayed by world updates or save restoration',()=>{
 const f=createAxisaIntegrationFixture(),a=f.deploy();f.at(10);f.make('h0OV');initializeSourceSkills(f.g,a);f.g._ensureWorld(a);f.at(11);assert.equal(a.skillSpecs.some(s=>s.id==='A1CK'),false);const g=Game.fromSnapshot(clone(f.g.snapshot()));g.state.time=12;tickSourceScriptJobs(g);assert.equal(g.state.entities.find(e=>e.id===a.id).skillSpecs.some(s=>s.id==='A1CK'),false);
});
test('pending queen scan restores its source identity and then runs exactly once',()=>{
 const f=createAxisaIntegrationFixture(),a=f.deploy();f.make('h0OV');const g=Game.fromSnapshot(clone(f.g.snapshot())),saved=g.state.entities.find(e=>e.id===a.id),j=g.state.sourceSkillJobs.find(j=>j.type==='axisa_swap');assert.equal(j.source,saved);tickSourceScriptJobs(g);assert.ok(saved.permanentAbilityIds.includes('A1CK'));assert.equal(saved.status.axisa.swapResult.requests.length,1);g.state.time=11;tickSourceScriptJobs(g);assert.equal(saved.status.axisa.swapResult.requests.length,1);
});
test('a raw life-mage body or dynamically added A1CU does not invent building deployment registration',()=>{
 const f=createAxisaIntegrationFixture(),mage=f.make('h0UG');initializeSourceSkills(f.g,mage);f.g._ensureWorld(mage);assert.equal(mage.status.nagaHaloInitialized,undefined);assert.equal(mage.skillSpecs.some(s=>s.id==='A1CG'),false);assert.equal(f.g.state.sourceSkillJobs.some(j=>j.type==='naga_active_halo'),false);
});
test('real n079 building deployment grants a permanent actual level-one Qt and registers one timer',()=>{
 const f=createAxisaIntegrationFixture(),mage=f.deploy('h0UG','n079');assert.equal(mage.abilityLevels.A1CG,1);assert.ok(mage.permanentAbilityIds.includes('A1CG'));assert.ok(mage.skillSpecs.some(s=>s.id==='A1CG'));initializeSourceSkills(f.g,mage);initializeSourceClassCombat(f.g,f.g.state.players[0].buildings[0],mage);assert.equal(f.g.state.sourceSkillJobs.filter(j=>j.type==='naga_active_halo').length,1);near(mage.status.nagaSpellResistance,.1);
});
test('tide alone never grants magic resistance but a life mage can grant it to an eligible tide recipient',()=>{
 const f=createAxisaIntegrationFixture(),a=f.deploy(),t=f.make('h03E',0,.5);f.skills(a,['A1CF']);f.skills(t,[]);f.at(10);assert.equal(t.skillSpecs.some(s=>s.id==='A1CG'),false);const mage=f.deploy('h0UG','n079',0,1);f.at(10);assert.equal(t.abilityLevels.A1CG,1);assert.ok(t.permanentAbilityIds.includes('A1CG'));assert.ok(a.skillSpecs.some(s=>s.id==='A1CG'));assert.equal(mage.abilityLevels.A1CG,1);
});
test('halo honors native ally selection, existing Qt, other battles and actual aura reach',()=>{
 const f=createAxisaIntegrationFixture(),a=f.make(),mage=f.deploy('h0UG','n079'),good=f.make('h03E',0,.5);f.skills(a,['A1CF']);f.skills(good,[]);const old=f.make('h03E',0,.5);f.skills(old,['A1CG']);old.abilityLevels={A1CG:7};
 const bad=['enemy','invulnerable','dead','hidden','locust','other-battle','out'].map(mode=>{const e=f.make('h03E',0,.5);f.skills(e,mode==='locust'?['Aloc']:[]);if(mode==='enemy'){e.team=1;e.side='monster';}if(mode==='invulnerable')e.invulnerable=true;if(mode==='dead')e.hp=0;if(mode==='hidden')e.status.sourceHidden=true;if(mode==='other-battle')e.battleTeam=1;if(mode==='out')e.worldX=7.01;return e;});f.at(10);assert.equal(good.abilityLevels.A1CG,1);assert.equal(old.abilityLevels.A1CG,7);for(const e of bad)assert.equal(e.skillSpecs.some(s=>s.id==='A1CG'),false,e.id);assert.ok(mage.status.nagaHaloInitialized);
});
test('a tide source in another battle cannot fabricate B07T for a nearby eligible recipient',()=>{
 const f=createAxisaIntegrationFixture(),t=f.make('h03E'),a=f.make(),mage=f.deploy('h0UG','n079');f.skills(t,[]);f.skills(a,['A1CF']);a.battleTeam=1;f.at(10);assert.equal(t.skillSpecs.some(s=>s.id==='A1CG'),false);assert.equal(mage.abilityLevels.A1CG,1);
});
test('a still-valid explicit B07T can grant resistance while an expired buff cannot',()=>{
 for(const expiresAt of [10,11]){const f=createAxisaIntegrationFixture(),t=f.make('h03E');f.skills(t,[]);t.buffs=[{key:'B07T',expiresAt}];f.deploy('h0UG','n079');f.at(10);assert.equal(t.skillSpecs.some(s=>s.id==='A1CG'),expiresAt===11);}
});
test('granted resistance remains after leaving both auras and after the provider widget death',()=>{
 const f=createAxisaIntegrationFixture(),a=f.make(),t=f.make('h03E'),mage=f.deploy('h0UG','n079'),enemy=f.make('h03E',1,1);f.skills(a,['A1CF']);f.skills(t,[]);f.skills(enemy,[]);f.at(10);t.worldX=99;f.g._hurt(mage,20000,enemy,{spell:true});f.at(11);assert.equal(t.abilityLevels.A1CG,1);assert.ok(t.permanentAbilityIds.includes('A1CG'));assert.equal(f.g.state.sourceSkillJobs.some(j=>j.type==='naga_active_halo'),false);
});
test('native reincarnation widget death ends halo registration permanently on that retained handle',()=>{
 const f=createAxisaIntegrationFixture(),mage=f.deploy('h0UG','n079'),enemy=f.make('h03E',1,1);f.skills(mage,['A1CU','A1CG','A18C']);mage.abilityLevels.A1CG=1;f.skills(enemy,[]);f.g._hurt(mage,20000,enemy,{spell:true});assert.equal(mage.status.nagaHaloWidgetEnded,true);f.at(12);assert.equal(mage.hp,1000);f.g._ensureWorld(mage);assert.equal(f.g.state.sourceSkillJobs.some(j=>j.type==='naga_active_halo'),false);
});
test('legacy status-only grants migrate to real Qt without re-registering or upgrading from hero level',()=>{
 const f=createAxisaIntegrationFixture(),a=f.make();f.skills(a,['A1CF']);a.status.nagaSpellResistance=.1;a.abilityLevels={A1CF:11};const g=Game.fromSnapshot(clone(f.g.snapshot())),saved=g.state.entities.find(e=>e.id===a.id);assert.equal(saved.abilityLevels.A1CG,1);assert.ok(saved.permanentAbilityIds.includes('A1CG'));assert.equal(g.state.sourceSkillJobs.some(j=>j.type==='naga_active_halo'),false);const twice=Game.fromSnapshot(clone(g.snapshot())).state.entities.find(e=>e.id===a.id);assert.equal(twice.abilityLevels.A1CG,1);assert.equal(twice.skillSpecs.filter(s=>s.id==='A1CG').length,1);
});
test('explicit saved Qt level wins over stale percentage and removed modern Qt is not re-created',()=>{
 const f=createAxisaIntegrationFixture(),a=f.make();f.skills(a,['A1CG']);a.abilityLevels={A1CG:4};a.status.nagaSpellResistance=.1;initializeSourceSkills(f.g,a);near(a.status.nagaSpellResistance,.4);f.skills(a,[]);initializeSourceSkills(f.g,a);assert.equal(a.skillSpecs.some(s=>s.id==='A1CG'),false);near(a.status.nagaSpellResistance,0);
});
test('real arena deployment copies ordinary aura levels and keeps life-mage registration building gated',()=>{
 const f=createAxisaIntegrationFixture(),p=f.g.state.players[0];for(const q of f.g.state.players)q.buildings=[];p.buildings=[{id:'a',unitId:'v14_h0U2',col:2,row:4,abilityLevels:{A1CF:11},axisaLevelState:{count:11}},{id:'m',unitId:'v14_n079',col:3,row:4}];f.g._startArena();const a=f.g.state.entities.find(e=>e.buildingId==='a'),mage=f.g.state.entities.find(e=>e.buildingId==='m');assert.equal(a.abilityLevels.A1CF,11);assert.equal(a.status.nagaHaloInitialized,undefined);assert.equal(mage.abilityLevels.A1CG,1);assert.ok(a.status.axisa.swapRegistered);assert.ok(f.g.state.sourceSkillJobs.some(j=>j.type==='axisa_swap'&&j.source===a));
});
test('unknown legacy percentages without a Qt ability are preserved as evidence instead of invented level-one grants',()=>{
 for(const value of [.3,.7]){const f=createAxisaIntegrationFixture(),a=f.make();f.skills(a,['A1CF']);a.status.nagaSpellResistance=value;const g=Game.fromSnapshot(clone(f.g.snapshot())),saved=g.state.entities.find(e=>e.id===a.id);near(saved.status.nagaSpellResistance,value);assert.equal(saved.skillSpecs.some(s=>s.id==='A1CG'),false);assert.equal(saved.status.nagaResistanceLegacyMigration,undefined);near(saved.status.nagaResistanceLegacyUnresolved.value,value);}
});
test('unknown legacy resistance records do not suppress real A19A or A1Q5 mitigation',()=>{
 for(const [id,expected] of [['A19A',60],['A1Q5',82]]){const f=createAxisaIntegrationFixture(),a=f.make(),enemy=f.make('h03E',1,1);f.skills(a,[id]);f.skills(enemy,[]);a.status.nagaSpellResistance=.3;near(f.g._hurt(a,100,enemy,{magic:true,spell:true}),expected);assert.equal(a.skillSpecs.some(s=>s.id==='A1CG'),false);}
});
test('a real current Qt retains the documented overlap adapter while zero-level Qt lets the other resistance apply',()=>{
 for(const [id,expected] of [['A19A',60],['A1Q5',82]])for(const level of [0,3]){const f=createAxisaIntegrationFixture(),a=f.make(),enemy=f.make('h03E',1,1);f.skills(a,[id,'A1CG']);f.skills(enemy,[]);a.abilityLevels={A1CG:level};a.status.nagaSpellResistance=.7;near(f.g._hurt(a,100,enemy,{magic:true,spell:true}),level>0?70:expected);}
});
test('missing combat Qs is never added when its building requests halo registration and the zero-level request is disclosed',()=>{
 const f=createAxisaIntegrationFixture(),a=f.make('h03E');f.skills(a,[]);initializeSourceClassCombat(f.g,{id:'missing-qs',unitId:'v14_n079'},a);assert.equal(a.skillSpecs.some(s=>s.id==='A1CU'),false);assert.equal(a.status.nagaHaloRegistration.sourceLevel,0);assert.equal(a.status.nagaHaloRegistration.zeroLevelRequestUnverified,true);assert.equal(a.status.nagaResistanceGrant.nonpositiveRequestUnverified,true);
});
