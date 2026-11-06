import test from 'node:test';
import assert from 'node:assert/strict';
import {Game} from '../dist/engine.js';
import {UNIT_TEMPLATES} from '../dist/data.js';
import {spawnWarpWorld} from '../dist/layout.js';
import {compileSkills,tickSourceSkills,tickSourceScriptJobs,initializeSourceClassCombat} from '../dist/skills.js';
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`),clone=x=>JSON.parse(JSON.stringify(x));
export function oceanFixture(){
 const g=new Game({mode:'sandbox',seed:76});g.state.phase='combat';g.state.time=10;g.state.entities=[];g.state.sourceSkillJobs=[];g._spawnQueue=[];g._aiAct=()=>{};for(const k of g.state.kings)k.worldX=k.worldY=10000;
 const skills=(e,ids)=>{e.skillSpecs=compileSkills({abilityIds:ids,skillVersion:'v14.1A5',distanceScale:1/3});e.skillStates={};};
 const make=(code='h108',team=0,x=5,y=10)=>{const e=g._entity(UNIT_TEMPLATES[code],{ownerId:team?4:0,team,side:team?'monster':'defender',battleTeam:0,laneId:0,sourceLaneId:0,worldX:x,worldY:y,facing:90,userData:1});g.state.entities.push(e);e.hpRegen=e.manaRegen=e.moveSpeed=0;e.attackCd=e.abilityCd=999;e.ability=null;e.pendingAttack=null;return e;};
 const a=make(),t=make('h108',1,5,10.5);skills(t,[]);
 const cast=(id,target=t,playerId=0)=>g.command('cast',{entityId:a.id,skillId:id,targetId:target?.id,playerId});
 const at=t=>{g.state.time=t;tickSourceScriptJobs(g);};
 return {g,a,t,make,skills,cast,at};
}
test('real command exposes three queen spells with corrected native reference costs',()=>{
 const f=oceanFixture(),s=f.g.unitSkillStatus(f.a.id);assert.deepEqual(s.map(s=>s.id),['A314','A07Y','A313']);assert.equal(s.find(s=>s.id==='A07Y').manaCost,40);assert.equal(s.find(s=>s.id==='A314').manaCost,125);assert.equal(s.find(s=>s.id==='A313').manaCost,25);assert.equal(s.find(s=>s.id==='A07Y').reason,'魔法不足');
});
test('Game command creates actual flying e010, preserves facing and dispatches all40 callbacks',()=>{
 const f=oceanFixture();f.a.facing=270;f.t.worldY=10;f.t.worldX=5.5;assert.ok(f.cast('A313').ok);const j=f.g.state.sourceSkillJobs[0];assert.equal(j.dummy.combatRawcode,'e010');assert.equal(j.dummy.facing,270);assert.equal(f.a.facing,270);near(f.a.mana,0);f.at(11.6);assert.equal(j.pulses,40);near(j.dummy.worldY,8);f.at(11.61);assert.equal(f.g.state.sourceSkillJobs.length,0);assert.equal(j.dummy.hp,0);assert.equal(j.dummy.status.sourceRemoved,undefined);
});
test('command ownership pause cooldown and insufficient mana reject without additional timers',()=>{
 for(const mode of ['owner','paused','mana','cooldown']){const f=oceanFixture();if(mode==='paused')f.g.state.paused=true;if(mode==='mana')f.a.mana=24;if(mode==='cooldown')f.a.skillStates.A313={readyAt:20,casts:1};const before=clone(f.g.snapshot());assert.equal(f.cast('A313',f.t,mode==='owner'?4:0).ok,false);assert.deepEqual(clone(f.g.snapshot()),before);}
});
test('normal queen cannot receive free water armor or free water elemental from automatic selection',()=>{
 const f=oceanFixture();f.a.mana=f.a.maxMana=30;tickSourceSkills(f.g,f.a,f.g.state.entities,0);near(f.a.mana,30);assert.equal(f.a.buffs.length,0);assert.equal(f.g.state.entities.length,2);assert.equal(f.g.state.sourceSkillJobs.length,0);
});
test('actual water armor pays40 once and records two independently paid native helper orders',()=>{
 const f=oceanFixture(),b=f.make('h108',0,5.4,10),c=f.make('h108',0,5.6,10);f.a.mana=f.a.maxMana=100;assert.ok(f.cast('A07Y',b).ok);near(f.a.mana,60);assert.equal(f.a.skillStates.A07Y.casts,1);near(b.buffs.find(b=>b.key==='B02T').armor,5);const r=f.a.status.tsunami.lastArmorSpread;assert.equal(r.requests.length,2);assert.equal(new Set(r.requests.map(r=>r.targetId)).size,2);assert.ok(r.requests.every(r=>r.requested&&r.applied&&r.manaAfter===999959));assert.equal(f.g.state.entities.filter(e=>e.combatRawcode==='u006').length,2);f.at(11);assert.ok(f.g.state.entities.filter(e=>e.combatRawcode==='u006').every(e=>e.hp===0));
});
test('automatic water armor uses the same paid spell and creates no duplicate expansion',()=>{
 const f=oceanFixture();f.skills(f.a,['A07Y']);f.a.mana=f.a.maxMana=100;f.make('h108',0,5.4,10);f.make('h108',0,5.6,10);tickSourceSkills(f.g,f.a,f.g.state.entities,0);near(f.a.mana,60);assert.equal(f.a.skillStates.A07Y.casts,1);assert.equal(f.g.state.entities.filter(e=>e.combatRawcode==='u006').length,2);
});
test('auxiliary handles survive clearDead but have no autonomous movement attack or collision entry',()=>{
 const f=oceanFixture();assert.ok(f.cast('A313').ok);const d=f.g.state.sourceSkillJobs[0].dummy;f.g._clearDead();assert.ok(f.g.state.entities.includes(d));const before=[d.worldX,d.worldY,d.mana,d.attackCd];f.g._updateEntities(.2);assert.deepEqual([d.worldX,d.worldY,d.mana,d.attackCd],before);assert.equal(f.g._worldEntities.has(d.id),false);assert.equal(d.targetId,undefined);
});
test('a lone auxiliary cannot keep a defeated arena team alive',()=>{
 const f=oceanFixture();assert.ok(f.cast('A313').ok);f.g.state.roundMode='arena';f.g.state.arenaRemaining=30;f.a.hp=0;let result;f.g._endArena=alive=>result=alive;f.g._step(.01);assert.deepEqual(result,[false,true]);
});
test('wave restore reconnects exact handles and resumes without replaying creation or payment',()=>{
 const f=oceanFixture();assert.ok(f.cast('A313').ok);f.at(10.4);const g=Game.fromSnapshot(clone(f.g.snapshot())),j=g.state.sourceSkillJobs.find(j=>j.type==='tsunami_wave');assert.equal(j.dummy,g.state.entities.find(e=>e.id===j.dummyId));assert.equal(j.source,g.state.entities.find(e=>e.id===f.a.id));assert.equal(j.pulses,10);near(j.source.mana,0);g.state.time=11.6;tickSourceScriptJobs(g);assert.equal(j.pulses,40);near(j.dummy.worldY,12);assert.equal(g.state.entities.filter(e=>e.combatRawcode==='e010').length,1);
});
test('A314 manual summon uses125 mana and real15-second n007 lifetime',()=>{
 const f=oceanFixture();f.a.mana=f.a.maxMana=125;assert.ok(f.cast('A314',null).ok);near(f.a.mana,0);near(f.a.skillStates.A314.readyAt,25);const d=f.g.state.entities.find(e=>e.combatRawcode==='n007');assert.ok(d);near(d.expiresAt,25);assert.equal(d.scriptAuxiliary,undefined);assert.equal(d.ownerId,0);
});
test('A0HB native target heal500 pays10 and uses one-second reference cooldown',()=>{
 const f=oceanFixture();f.skills(f.a,['A0HB']);const t=f.make();t.hp=1;t.maxHp=1000;f.a.mana=f.a.maxMana=30;assert.ok(f.cast('A0HB',t).ok);near(t.hp,501);near(f.a.mana,20);near(f.a.skillStates.A0HB.readyAt,11);assert.equal(f.a.status.oceanHealingLastEffect,undefined);assert.equal(f.cast('A0HB',t).ok,false);
});
test('A0HB independent callback sees savedCa even inside another ability trigger and keeps original native target',()=>{
 const f=oceanFixture();f.skills(f.a,['A0HB']);const t=f.make(),other=f.make();f.skills(t,['A07S']);f.skills(other,['A07S']);f.a.hp=100;f.a.maxHp=t.maxHp=other.maxHp=1000;t.hp=490;other.hp=500;f.a.mana=30;f.a.sourceOceanHealingBonus=20;f.g._sourceAbilityEffectDepth=2;assert.ok(f.cast('A0HB',t).ok);near(f.a.hp,140);near(t.hp,1000);near(other.hp,520);near(f.a.mana,20);assert.equal(f.a.status.oceanHealingLastEffect.requests.length,3);assert.equal(f.g._sourceAbilityEffectDepth,2);
});
test('automatic A0HB retains the selected target even if bonus changes injury order',()=>{
 const f=oceanFixture();f.skills(f.a,['A0HB','A07S']);f.a.hp=1;f.a.maxHp=1000;f.a.sourceOceanHealingBonus=100;f.a.mana=f.a.maxMana=30;f.t.hp=800;const other=f.make();other.hp=2;other.maxHp=1000;f.skills(other,[]);tickSourceSkills(f.g,f.a,f.g.state.entities,0);near(f.a.hp,801);near(other.hp,2);near(f.a.mana,20);
});
test('deployment never copies a building bonus and restore preserves explicit combat bonus without heal replay',()=>{
 const f=oceanFixture();f.skills(f.a,['A0HB']);initializeSourceClassCombat(f.g,{unitId:'v14_h0J2',sourceOceanHealingBonus:500},f.a);assert.equal(f.a.sourceOceanHealingBonus,undefined);f.a.sourceOceanHealingBonus=25;f.a.hp=100;const g=Game.fromSnapshot(clone(f.g.snapshot())),a=g.state.entities.find(e=>e.id===f.a.id);assert.equal(a.sourceOceanHealingBonus,25);near(a.hp,100);
});
test('legacy snapshots refresh corrected fees but preserve resources cooldowns and injected ability sets',()=>{
 const f=oceanFixture();f.skills(f.a,['A07Y','A0HB','A314']);f.a.skillImplementationRevision='old';f.a.mana=9;f.a.skillStates.A07Y={readyAt:70,casts:4};for(const s of f.a.skillSpecs)s.manaCost=0;const g=Game.fromSnapshot(clone(f.g.snapshot())),a=g.state.entities.find(e=>e.id===f.a.id);assert.deepEqual(a.skillSpecs.map(s=>s.id),['A07Y','A0HB','A314']);near(a.skillSpecs[0].manaCost,40);near(a.skillSpecs[1].cooldown,1);near(a.skillSpecs[2].manaCost,125);near(a.mana,9);assert.deepEqual(a.skillStates.A07Y,{readyAt:70,casts:4});
});

test('zero-level or silenced ocean abilities do not autocast',()=>{
 for(const id of ['A07Y','A0HB','A314'])for(const reason of ['level','silence']){const f=oceanFixture();f.skills(f.a,[id]);f.a.hp=1;f.a.mana=f.a.maxMana=200;if(reason==='level')f.a.abilityLevels={[id]:0};else f.a.status.silenceUntil=20;tickSourceSkills(f.g,f.a,f.g.state.entities,0);near(f.a.mana,200);assert.equal(f.a.skillStates[id]?.casts??0,0);}
});

test('auxiliaries neither inherit guard navigation nor transfer through the spawn gate after a lane clears',()=>{
 const f=oceanFixture();f.a.nav={mode:'guard'};assert.ok(f.cast('A313').ok);const d=f.g.state.sourceSkillJobs[0].dummy;assert.equal(d.nav,undefined);d.nav={mode:'guard'};f.g.state.entities=[d];f.g._transferDefenders();assert.equal(d.nav.mode,'guard');const p=spawnWarpWorld(0);d.nav={mode:'return'};d.worldX=p.x;d.worldY=p.y;f.g._warpDefenders();near(d.worldX,p.x);near(d.worldY,p.y);assert.equal(d.status.warped,undefined);
});

test('continuous wave joins retain live auxiliary handles and their unfinished timers',()=>{
 const f=oceanFixture();assert.ok(f.cast('A313').ok);const j=f.g.state.sourceSkillJobs[0],d=j.dummy;f.at(10.4);f.g.state.mode='normal';f.g.state.wave=31;f.g._advanceContinuous();assert.equal(f.g.state.wave,32);assert.ok(f.g.state.entities.includes(d));assert.ok(f.g.state.sourceSkillJobs.includes(j));f.at(11.6);assert.equal(j.pulses,40);near(d.worldY,12);
});

test('enemy auxiliary expiry keeps native death callbacks without creating monster kills or bounty',()=>{
 for(const id of ['A313','A07Y']){const f=oceanFixture();f.skills(f.t,[id]);f.t.mana=f.t.maxMana=100;if(id==='A07Y'){f.make('h108',1,5.3,10.5);f.make('h108',1,5.6,10.5);}const before=f.g.state.metrics.killed,gold=f.g.state.players.map(p=>p.gold);assert.ok(f.g.command('cast',{entityId:f.t.id,skillId:id,targetId:id==='A313'?f.a.id:f.t.id,playerId:4}).ok);const ds=f.g.state.entities.filter(e=>e.scriptAuxiliary);assert.equal(ds.length,id==='A313'?1:2);f.at(12);assert.equal(f.g.state.metrics.killed,before);assert.deepEqual(f.g.state.players.map(p=>p.gold),gold);assert.ok(ds.every(d=>d.hp===0&&d.status.deathCounted&&d.reward===0));}
});
