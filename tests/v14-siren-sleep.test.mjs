import test from 'node:test';
import assert from 'node:assert/strict';
import {Game} from '../dist/engine.js';
import {UNIT_TEMPLATES} from '../dist/data.js';
import {compileSkills,matchesTargets} from '../dist/skills.js';
import {SIREN_SLEEP_RULES,SIREN_SLEEP_NATIVE_REFERENCE,sirenAttackDamage,isSirenSleeping,sirenSleepActiveAt,sirenSleepProtected,sirenSleepProtectedAt,sirenWakeOnDamage,tickSirenSleepJob,tickSirenSleepJobs,restoreSirenSleep} from '../dist/siren-sleep-rules.js';
const clone=x=>JSON.parse(JSON.stringify(x)),near=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);
export function createSirenSleepFixture(){
 const g=new Game({mode:'sandbox',seed:77});g.state.phase='combat';g.state.time=10;g.state.entities=[];g.state.sourceSkillJobs=[];for(const k of g.state.kings)k.worldX=k.worldY=10000;
 const skills=(e,ids)=>{e.skillSpecs=compileSkills({skillVersion:'v14.1A5',distanceScale:1/3,abilityIds:ids});e.skillStates={};};
 const make=(code='h0UM',team=0,x=5,y=10)=>{const e=g._entity(UNIT_TEMPLATES[code],{side:team?'monster':'defender',team,battleTeam:0,ownerId:team?4:0,sourceNativeOwnerId:team?9:8,laneId:0,sourceLaneId:0,worldX:x,worldY:y,facing:135});g.state.entities.push(e);e.hp=e.maxHp=1000;e.attackCd=e.abilityCd=1000;e.manaRegen=e.hpRegen=0;e.ability=null;return e;};
 const a=make(),t=make('h0UM',1,5.5,10);skills(t,[]);let rng=0,roll=.1;g._random=()=>{rng++;return roll;};const deaths=[];
 const api={matchesTargets,magicImmune:e=>e.skillSpecs?.some(s=>s.kind==='immunity'&&s.status==='implemented'),scriptInvulnerable:e=>e.invulnerable||e.status?.sirenSleepProtected,
  spawnUnit:(game,source,code,extra)=>{const d=game._entity(UNIT_TEMPLATES[code],{ownerId:source.ownerId,sourceNativeOwnerId:source.sourceNativeOwnerId,side:source.side,team:source.team,battleTeam:source.battleTeam,laneId:source.laneId,sourceLaneId:source.sourceLaneId,...extra});game.state.entities.push(d);return d;},
  addAbility:(game,e,id)=>{if(!e.skillSpecs.some(s=>s.id===id))e.skillSpecs.push(compileSkills({skillVersion:'v14.1A5',distanceScale:1/3,abilityIds:[id]})[0]);},
  killUnit:(game,e)=>{e.hp=0;e.status.deathCounted=true;deaths.push(e.id);},
 };
 const proc=target=>sirenAttackDamage(g,a,target??t,api),at=time=>{g.state.time=time;tickSirenSleepJobs(g,api);};
 return {g,a,t,make,skills,api,proc,at,deaths,setRoll:v=>roll=v,rng:()=>rng};
}
test('rules keep map-native inheritance and protection observations explicitly partial',()=>{
 for(const r of Object.values(SIREN_SLEEP_RULES))assert.equal(r.status,'partial');assert.equal(SIREN_SLEEP_NATIVE_REFERENCE.manaCost,100);assert.equal(SIREN_SLEEP_NATIVE_REFERENCE.cooldown,6);assert.equal(SIREN_SLEEP_NATIVE_REFERENCE.cast,0);assert.equal(SIREN_SLEEP_NATIVE_REFERENCE.customInheritanceVerified,false);assert.equal(SIREN_SLEEP_NATIVE_REFERENCE.protectionObservation.version,'unspecified');assert.match(SIREN_SLEEP_RULES.A1DN.partial,/本图原生验收/);
});
test('proc probability uses one real inclusive15-percent draw, not an integer roll',()=>{
 for(const [roll,expected]of [[0,true],[.14999,true],[.15,true],[.150001,false],[.99,false]]){const f=createSirenSleepFixture();f.setRoll(roll);assert.equal(!!f.proc(),expected);assert.equal(f.rng(),1);assert.equal(f.g.state.entities.filter(e=>e.scriptAuxiliary).length,expected?1:0);}
});
test('missing and zero-level marker never roll or create a helper',()=>{
 for(const mode of ['missing','zero']){const f=createSirenSleepFixture();if(mode==='missing')f.skills(f.a,[]);else f.a.abilityLevels={A1DO:0};assert.equal(f.proc(),false);assert.equal(f.rng(),0);assert.equal(f.g.state.entities.length,2);}
});
test('h0UM is the basic follower combat form, upgraded n07G/H forms do not retain this passive',()=>{
 assert.deepEqual(UNIT_TEMPLATES.h0UM.abilityIds,['A1DO']);assert.equal(UNIT_TEMPLATES.h0UN.abilityIds.includes('A1DO'),false);assert.equal(UNIT_TEMPLATES.h0UO.abilityIds.includes('A1DO'),false);
});
test('each successful proc creates actual e008 at source position facing and owner without consuming attack RNG',()=>{
 const f=createSirenSleepFixture();f.a.nav={mode:'guard'};const r=f.proc(),d=f.g.state.entities.find(e=>e.id===r.casterId);assert.equal(f.rng(),1);assert.equal(d.combatRawcode,'e008');near(d.worldX,f.a.worldX);near(d.worldY,f.a.worldY);assert.equal(d.facing,135);assert.equal(d.ownerId,0);assert.equal(d.sourceNativeOwnerId,8);assert.equal(d.scriptAuxiliary,true);assert.equal(d.nav,undefined);assert.equal(d.isSummon,true);assert.ok(d.skillSpecs.some(s=>s.id==='A1DN'));assert.ok(d.skillSpecs.some(s=>s.id==='Aloc'));
});
test('the independent helper pays100 and6CD, while the attacker mana and skill counters are unchanged',()=>{
 const f=createSirenSleepFixture();f.a.mana=0;f.a.skillStates.A1DO={readyAt:999,casts:7};const r=f.proc(),d=f.g.state.entities.find(e=>e.id===r.casterId);assert.equal(r.applied,true);near(d.mana,99900);near(d.skillStates.A1DN.readyAt,16);assert.equal(d.skillStates.A1DN.casts,1);near(f.a.mana,0);assert.deepEqual(f.a.skillStates.A1DO,{readyAt:999,casts:7});
});
test('weapon listener callback does not invent source-life silence or caster cooldown gates',()=>{
 for(const mode of ['dead','silence','stun']){const f=createSirenSleepFixture();if(mode==='dead')f.a.hp=0;if(mode==='silence')f.a.status.silenceUntil=100;if(mode==='stun')f.a.status.stunUntil=100;assert.equal(f.proc().applied,true);}
});
test('invalid native target still consumes chance and creates the timed helper but no sleep or cost',()=>{
 for(const mode of ['dead','hidden','locust','friendly','battle','mechanical','building','cyclone','invulnerable','magic-immune','range','mask']){
  const f=createSirenSleepFixture();if(mode==='dead')f.t.hp=0;if(mode==='hidden')f.t.status.sourceHidden=true;if(mode==='locust')f.skills(f.t,['Aloc']);if(mode==='friendly')f.t.side='defender';if(mode==='battle')f.t.battleTeam=1;if(mode==='mechanical')f.t.traits=['mechanical'];if(mode==='building')f.t.isBuilding=true;if(mode==='cyclone')f.t.status.cycloneUntil=100;if(mode==='invulnerable')f.t.invulnerable=true;if(mode==='magic-immune')f.skills(f.t,['Amim']);if(mode==='range')f.t.worldX=5+801/300;if(mode==='mask')f.api.matchesTargets=()=>false;
  const r=f.proc(),d=f.g.state.entities.find(e=>e.id===r.casterId);assert.equal(r.requested,true,mode);assert.equal(r.applied,false,mode);assert.equal(f.rng(),1);near(d.mana,100000);assert.equal(f.t.status.sirenSleep,undefined);assert.equal(f.g.state.sourceSkillJobs.length,1);f.at(11);assert.equal(d.hp,0);
 }
});
test('native target range includes exactly800 and permits both flying and ordinary organic enemies',()=>{
 for(const type of ['ground','air']){const f=createSirenSleepFixture();f.t.targetType=type;f.t.worldX=5+800/300;assert.equal(f.proc().applied,true);}
});
test('a low-mana helper records native rejection without charging the original attacker',()=>{
 const f=createSirenSleepFixture(),spawn=f.api.spawnUnit;f.api.spawnUnit=(...args)=>{const d=spawn(...args);d.mana=99;return d;};const r=f.proc();assert.equal(r.rejectedByHost,'mana');assert.equal(f.t.status.sirenSleep,undefined);near(f.a.mana,0);
});
test('both heroes and normal targets sleep2 seconds with1-second protection instead of tooltip10',()=>{
 for(const hero of [false,true]){const f=createSirenSleepFixture();f.t.isNativeHero=hero;const r=f.proc();near(r.protectedUntil,11);near(r.expiresAt,12);assert.equal(isSirenSleeping(f.g,f.t),true);assert.equal(sirenSleepProtected(f.g,f.t),true);assert.equal(sirenSleepActiveAt(f.t,12),false);assert.equal(sirenSleepProtectedAt(f.t,11),false);}
});
test('sleep clears queued attacks and native storm channel without overwriting unrelated control',()=>{
 const f=createSirenSleepFixture();f.t.pendingAttack={at:11};f.t.status.stormLizardChannel={endAt:20};f.t.status.stunUntil=15;f.t.status.sourcePaused=true;f.proc();assert.equal(f.t.pendingAttack,null);assert.equal(f.t.status.stormLizardChannel,undefined);assert.equal(f.t.status.stunUntil,15);assert.equal(f.t.status.sourcePaused,true);f.at(12);assert.equal(f.t.status.stunUntil,15);assert.equal(f.t.status.sourcePaused,true);
});
test('protected sleep ignores wake requests for the first second and later positive damage wakes it',()=>{
 const f=createSirenSleepFixture();f.proc();assert.equal(sirenWakeOnDamage(f.g,f.t,10),false);f.at(10.999);assert.equal(sirenWakeOnDamage(f.g,f.t,10),false);f.at(11);assert.equal(sirenSleepProtected(f.g,f.t),false);assert.equal(f.t.status.sirenSleepProtected,false);assert.equal(isSirenSleeping(f.g,f.t),true);assert.equal(sirenWakeOnDamage(f.g,f.t,10),true);assert.equal(isSirenSleeping(f.g,f.t),false);assert.equal(f.t.status.sirenSleep.endReason,'positive-damage');assert.equal(f.t.buffs.some(b=>b.key==='BUsl'),false);
});
test('zero negative and nonnumeric damage do not wake a vulnerable sleeping target',()=>{
 const f=createSirenSleepFixture();f.proc();f.at(11);for(const n of [0,-1,NaN,undefined])assert.equal(sirenWakeOnDamage(f.g,f.t,n),false);assert.equal(isSirenSleeping(f.g,f.t),true);
});
test('natural expiry removes only owned sleep buff and preserves other timed buffs',()=>{
 const f=createSirenSleepFixture();f.t.buffs.push({key:'other',expiresAt:100});f.proc();f.at(12);assert.equal(isSirenSleeping(f.g,f.t),false);assert.equal(f.t.status.sirenSleepProtected,false);assert.equal(f.t.status.sirenSleep.endReason,'expired');assert.deepEqual(f.t.buffs,[{key:'other',expiresAt:100}]);
});
test('dispelled BUsl stops the effect even before protection expiry',()=>{
 const f=createSirenSleepFixture();f.proc();f.t.buffs=[];assert.equal(isSirenSleeping(f.g,f.t),false);assert.equal(sirenSleepProtected(f.g,f.t),false);f.at(10.1);assert.equal(f.t.status.sirenSleepProtected,false);assert.equal(f.t.status.sirenSleep.endReason,'dispelled');
});
test('death and explicit removal end control without resurrecting targets',()=>{
 for(const removed of [false,true]){const f=createSirenSleepFixture();f.proc();if(removed)f.t.status.sourceRemoved=true;else f.t.hp=0;f.at(10.1);assert.equal(isSirenSleeping(f.g,f.t),false);assert.equal(f.t.status.sirenSleepProtected,false);assert.equal(f.t.status.sirenSleep.endReason,'dead-or-removed');}
});
test('helper timed life fires exactlyonce at1 second, while sleep continues to2 seconds',()=>{
 const f=createSirenSleepFixture(),r=f.proc(),d=f.g.state.entities.find(e=>e.id===r.casterId);f.at(10.999);assert.equal(f.deaths.length,0);f.at(11);assert.deepEqual(f.deaths,[d.id]);assert.equal(d.status.sourceRemoved,undefined);assert.equal(isSirenSleeping(f.g,f.t),true);f.at(20);assert.deepEqual(f.deaths,[d.id]);assert.equal(isSirenSleeping(f.g,f.t),false);
});
test('source death and helper removal do not cancel an already applied independent target effect',()=>{
 const f=createSirenSleepFixture(),r=f.proc(),d=f.g.state.entities.find(e=>e.id===r.casterId);f.a.hp=0;d.status.sourceRemoved=true;f.at(10.5);assert.equal(isSirenSleeping(f.g,f.t),true);f.at(12);assert.equal(isSirenSleeping(f.g,f.t),false);
});
test('a second proc during protection still creates a distinct helper but cannot sleep the invulnerable target',()=>{
 const f=createSirenSleepFixture(),first=f.proc(),second=f.proc();assert.notEqual(first.casterId,second.casterId);assert.equal(second.rejectedByHost,'invulnerable');assert.equal(f.g.state.entities.filter(e=>e.scriptAuxiliary).length,2);assert.equal(f.rng(),2);assert.equal(f.t.status.sirenSleep.id,first.sleepId);
});
test('a recast after protection replaces sleep without an old job clearing the new effect',()=>{
 const f=createSirenSleepFixture(),first=f.proc();f.at(11.1);const second=f.proc();assert.equal(second.applied,true);assert.notEqual(first.sleepId,second.sleepId);f.at(12);assert.equal(isSirenSleeping(f.g,f.t),true);assert.equal(f.t.status.sirenSleep.id,second.sleepId);f.at(13.1);assert.equal(isSirenSleeping(f.g,f.t),false);
});
test('pause prevents cleanup until game resumes, with original deadlines preserved',()=>{
 const f=createSirenSleepFixture(),r=f.proc();f.g.state.paused=true;f.at(20);assert.equal(f.deaths.length,0);assert.equal(f.t.status.sirenSleep.endedAt,undefined);f.g.state.paused=false;f.at(20);assert.equal(f.deaths.length,1);assert.equal(isSirenSleeping(f.g,f.t),false);near(r.expiresAt,12);
});
test('restoring a snapshot reconnects exact source target and dummy handles without new RNG costs or casts',()=>{
 const f=createSirenSleepFixture(),r=f.proc();const g=Game.fromSnapshot(clone(f.g.snapshot()));restoreSirenSleep(g);const t=g.state.entities.find(e=>e.id===f.t.id),d=g.state.entities.find(e=>e.id===r.casterId),j=g.state.sourceSkillJobs.find(j=>j.type==='siren_sleep'),life=g.state.sourceSkillJobs.find(j=>j.type==='siren_dummy_life');assert.equal(j.source,d);assert.equal(j.target,t);assert.equal(life.dummy,d);near(d.mana,99900);assert.equal(d.skillStates.A1DN.casts,1);assert.equal(isSirenSleeping(g,t),true);g.state.time=11;tickSirenSleepJobs(g,f.api);assert.equal(isSirenSleeping(g,t),true);assert.equal(sirenSleepProtected(g,t),false);
});
test('restoring after expiry or dispel does not revive the old control state',()=>{
 for(const mode of ['expiry','dispel']){const f=createSirenSleepFixture();f.proc();if(mode==='expiry')f.g.state.time=12;else f.t.buffs=[];restoreSirenSleep(f.g);assert.equal(isSirenSleeping(f.g,f.t),false);assert.equal(f.t.status.sirenSleepProtected,false);}
});
test('foreign jobs are ignored and all saved numeric fields stay finite',()=>{
 const f=createSirenSleepFixture();f.proc();assert.equal(tickSirenSleepJob(f.g,{type:'foreign'},f.api),false);const scan=x=>{if(typeof x==='number')assert.ok(Number.isFinite(x));else if(x&&typeof x==='object')for(const v of Object.values(x))scan(v);};scan(clone(f.g.snapshot()));
});
