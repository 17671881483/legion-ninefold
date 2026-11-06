import test from 'node:test';
import assert from 'node:assert/strict';
import {Game} from '../dist/engine.js';
import {UNIT_TEMPLATES} from '../dist/data.js';
import {V14_ABILITIES} from '../dist/v14-reference.js';
import {compileSkills,matchesTargets,sourceAuraEffects} from '../dist/skills.js';
import {TSUNAMI_RULES,WATER_ARMOR_NATIVE_REFERENCE,canTsunamiCast,castTsunami,castWaterArmor,tsunamiNativeSpellEffect,tickTsunamiJob,tickTsunamiJobs,restoreTsunami} from '../dist/tsunami-rules.js';

const clone=x=>JSON.parse(JSON.stringify(x));
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);
const ok=r=>assert.equal(r.ok,true,r.message);
const activeJobs=(g,type)=>g.state.sourceSkillJobs.filter(j=>j.type===type&&!j.done);
const body=(g,id)=>g.state.entities.find(e=>e.id===id);
const water=e=>e.buffs?.find(b=>b.key==='B02T');
function setSkills(e,ids){e.skillSpecs=compileSkills({abilityIds:ids,skillVersion:'v14.1A5',distanceScale:e.distanceScale??1/3});}
export function createTsunamiFixture(){
 const g=new Game({mode:'sandbox',seed:76});g.state.phase='combat';g.state.time=10;g.state.entities=[];g.state.sourceSkillJobs=[];
 for(const k of g.state.kings)k.worldX=k.worldY=10000;
 const make=(raw='h108',team=0,x=5,y=10)=>{
  const e=g._entity(UNIT_TEMPLATES[raw],{ownerId:team?4:0,team,side:team?'monster':'defender',battleTeam:0,laneId:0,sourceLaneId:0,worldX:x,worldY:y,facing:90});
  e.attackCd=e.abilityCd=1000;e.hpRegen=0;e.buffs=[];e.ability=null;g.state.entities.push(e);return e;
 };
 const a=make(),t=make('h108',1,5,10.5);setSkills(a,['A313','A07Y']);setSkills(t,[]);
 const deaths=[],terrain=[];
 const api={matchesTargets,scriptInvulnerable:e=>e.invulnerable||e.skillSpecs?.some(s=>s.id==='Avul'),magicImmune:e=>e.skillSpecs?.some(s=>s.kind==='immunity'&&s.status==='implemented'),
  isTerrainBlocked:(game,p,target)=>{terrain.push({point:{...p},targetId:target.id});return false;},
  spawnUnit:(game,source,code,extra)=>{const e=game._entity(UNIT_TEMPLATES[code],{ownerId:source.ownerId,sourceNativeOwnerId:source.sourceNativeOwnerId,team:source.team,side:source.side,battleTeam:source.battleTeam,laneId:source.laneId,sourceLaneId:source.sourceLaneId,...extra});game.state.entities.push(e);return e;},
  addAbility:(game,e,id)=>{if(!e.skillSpecs.some(s=>s.id===id))e.skillSpecs.push(compileSkills({abilityIds:[id],skillVersion:'v14.1A5',distanceScale:e.distanceScale})[0]);},
  killUnit:(game,e)=>{deaths.push(e.id);e.hp=0;e.status.deathCounted=true;}
 };
 const at=time=>{g.state.time=time;tickTsunamiJobs(g,api);};
 const cast=target=>castTsunami(g,a,'A313',{target:target??t},api);
 return {g,a,t,make,api,at,cast,deaths,terrain};
}

test('rules retain partial native costs and distinguish armor duration from the unimplemented melee chill',()=>{
 assert.equal(TSUNAMI_RULES.A313.status,'partial');assert.equal(TSUNAMI_RULES.A313.targetKind,'enemy');assert.equal(TSUNAMI_RULES.A07Y.targetKind,'unit');assert.equal(TSUNAMI_RULES.A07Y.manaCost,40);
 assert.equal(V14_ABILITIES.A07Y.resolved_fields.Cost1,undefined);assert.equal(V14_ABILITIES.A313.resolved_fields.DataC1,undefined);
 assert.equal(WATER_ARMOR_NATIVE_REFERENCE.customInheritanceVerified,false);assert.deepEqual(WATER_ARMOR_NATIVE_REFERENCE.versions,['1.24.4','1.27.1']);
 assert.match(TSUNAMI_RULES.A07Y.partial,/近战攻击后的减速尚未还原/);
});

test('manual tsunami spends the actual25 mana with five-second cooldown at four-hundred range',()=>{
 const f=createTsunamiFixture();f.t.worldX=5+400/300;f.t.worldY=10;
 assert.equal(canTsunamiCast(f.a,'A313'),true);assert.equal(canTsunamiCast(f.a,'A07Y'),true);assert.equal(canTsunamiCast(f.a,'A314'),false);ok(f.cast());
 near(f.a.mana,0);near(f.a.skillStates.A313.readyAt,15);assert.equal(f.a.skillStates.A313.casts,1);assert.equal(activeJobs(f.g,'tsunami_wave').length,1);
});

test('failed manual tsunami is atomic for resources cooldowns jobs and RNG',()=>{
 for(const mode of ['range','mana','cooldown','missing','removed','dead','hidden','paused','stun','silence','global-pause','ally','other-battle','dead-target','hidden-target','locust','immune','invulnerable','cyclone','mask']){
  const f=createTsunamiFixture();
  if(mode==='range')f.t.worldY=10+401/300;if(mode==='mana')f.a.mana=24;if(mode==='cooldown')f.a.skillStates.A313={readyAt:30,casts:1};if(mode==='missing')setSkills(f.a,[]);
  if(mode==='removed')f.a.status.sourceRemoved=true;if(mode==='dead')f.a.hp=0;if(mode==='hidden')f.a.status.sourceHidden=true;if(mode==='paused')f.a.status.sourcePaused=true;if(mode==='stun')f.a.status.stunUntil=20;if(mode==='silence')f.a.status.silenceUntil=20;if(mode==='global-pause')f.g.state.paused=true;
  if(mode==='ally')f.t.team=0;if(mode==='other-battle')f.t.battleTeam=1;if(mode==='dead-target')f.t.hp=0;if(mode==='hidden-target')f.t.status.sourceHidden=true;if(mode==='locust')setSkills(f.t,['Aloc']);if(mode==='immune')setSkills(f.t,['Amim']);if(mode==='invulnerable')f.t.invulnerable=true;if(mode==='cyclone')f.t.status.cycloneUntil=20;if(mode==='mask')f.api.matchesTargets=()=>false;
  const before=clone(f.g.snapshot());assert.equal(f.cast().ok,false,mode);assert.deepEqual(clone(f.g.snapshot()),before,mode);
 }
});

test('wave direction uses normalized existing facing rather than the clicked target direction',()=>{
 for(const [angle,expected]of [[0,90],[179.999,90],[180,270],[359,270],[-90,270],[450,90]]){
  const f=createTsunamiFixture();f.a.facing=angle;f.t.worldX=6;f.t.worldY=10;ok(f.cast());
  const j=activeJobs(f.g,'tsunami_wave')[0];assert.equal(j.dummy.facing,expected);assert.equal(j.dummy.animationTimeScale,.7);assert.equal(j.dummy.combatRawcode,'e010');assert.equal(j.dummy.scriptAuxiliary,true);assert.equal(j.dummy.ownerId,f.a.ownerId);
  f.at(10.04);near(j.dummy.worldX,5);near(j.dummy.worldY,10+(expected===90?1:-1)*15/300);
 }
});

test('first callback waits .04 seconds then moves15 and grows radius250 to255 before enumeration',()=>{
 const f=createTsunamiFixture();ok(f.cast());const j=activeJobs(f.g,'tsunami_wave')[0],hp=f.t.hp;
 f.at(10.039);assert.equal(j.pulses,0);near(j.dummy.worldY,10);near(f.t.worldY,10.5);
 f.at(10.04);assert.equal(j.pulses,1);assert.equal(j.remaining,39);assert.equal(j.radius,255);near(j.dummy.worldY,10.05);near(f.t.worldY,10.5+7/300);near(f.t.hp,hp);
});

test('all forty callbacks move600 grow to450 and request .01 timed life without script damage',()=>{
 const f=createTsunamiFixture();ok(f.cast());const j=activeJobs(f.g,'tsunami_wave')[0],hp=f.t.hp;
 f.at(11.6);assert.equal(j.pulses,40);assert.equal(j.remaining,0);assert.equal(j.radius,450);near(j.dummy.worldY,12);near(f.t.worldY,10.5+280/300);near(f.t.hp,hp);
 assert.equal(j.totalPushes,40);near(j.timedLifeAt,11.61);assert.equal(j.done,undefined);assert.equal(f.deaths.length,0);assert.equal(j.dummy.status.sourceRemoved,undefined);
 f.at(11.609);assert.equal(f.deaths.length,0);f.at(11.61);assert.deepEqual(f.deaths,[j.dummy.id]);assert.equal(j.done,true);near(j.dummy.hp,0);assert.equal(j.dummy.status.sourceRemoved,undefined);
 f.at(20);assert.equal(f.deaths.length,1);assert.equal(j.pulses,40);
});

test('one long host frame processes every scheduled wave callback exactly once',()=>{
 const stepped=createTsunamiFixture(),jumped=createTsunamiFixture();ok(stepped.cast());ok(jumped.cast());
 for(let i=1;i<=40;i++)stepped.at(10+i*.04);stepped.at(11.61);jumped.at(11.61);
 const a=stepped.g.state.sourceSkillJobs[0],b=jumped.g.state.sourceSkillJobs[0];near(a.dummy.worldX,b.dummy.worldX);near(a.dummy.worldY,b.dummy.worldY);near(stepped.t.worldY,jumped.t.worldY);assert.equal(a.pulses,b.pulses);assert.equal(a.totalPushes,b.totalPushes);
});

test('a dead or removed original caster does not cancel its independent already-created wave',()=>{
 for(const mode of ['dead','removed']){const f=createTsunamiFixture();ok(f.cast());const j=f.g.state.sourceSkillJobs[0];if(mode==='dead')f.a.hp=0;else{f.a.status.sourceRemoved=true;f.g.state.entities=f.g.state.entities.filter(e=>e!==f.a);}f.at(11.6);assert.equal(j.pulses,40);assert.equal(j.totalPushes,40);}
});

test('each callback reads the current dummy position and facing instead of a frozen cast vector',()=>{
 const f=createTsunamiFixture();ok(f.cast());const j=f.g.state.sourceSkillJobs[0];f.at(10.04);j.dummy.worldX=8;j.dummy.worldY=12;j.dummy.facing=180;f.at(10.08);near(j.dummy.worldX,7.95);near(j.dummy.worldY,12);assert.equal(j.radius,260);
});

test('only the enemy push checks walking terrain and no ground clamp is applied to the flying wave',()=>{
 const f=createTsunamiFixture();let groundCalls=0;f.api.moveUnit=()=>{throw new Error('generic ground-clamped move must not be called');};f.api.isTerrainBlocked=(g,p,target)=>{groundCalls++;assert.equal(target.id,f.t.id);near(p.y,10.5+7/300);return true;};ok(f.cast());f.at(10.04);
 const j=f.g.state.sourceSkillJobs[0];near(j.dummy.worldY,10.05);near(f.t.worldY,10.5);assert.equal(groundCalls,1);assert.equal(j.blockedPushes,1);assert.equal(j.totalPushes,0);
});

test('missing terrain evidence leaves pushes unresolved instead of treating every point as passable',()=>{
 const f=createTsunamiFixture();delete f.api.isTerrainBlocked;ok(f.cast());f.at(10.04);const j=f.g.state.sourceSkillJobs[0];near(f.t.worldY,10.5);assert.equal(j.terrainUnresolved,true);assert.equal(j.blockedPushes,1);
});

test('post-move enumeration uses the requested center even if the native dummy-position adapter adjusts it',()=>{
 const f=createTsunamiFixture();f.api.setTsunamiPosition=(g,e,p)=>{e.worldX=50;e.worldY=50;};ok(f.cast());f.at(10.04);const j=f.g.state.sourceSkillJobs[0];near(j.dummy.worldY,50);near(f.t.worldY,10.5+7/300);assert.equal(j.totalPushes,1);
});

test('wave filtering does not invent immunity air structure or hidden exclusions absent from A313s',()=>{
 const f=createTsunamiFixture(),moved=[];
 for(const mode of ['air','structure','invulnerable','immune','hidden','low-life']){const e=f.make('h108',1,5,10.5);setSkills(e,[]);if(mode==='air')e.targetType='air';if(mode==='structure')e.isBuilding=true;if(mode==='invulnerable')e.invulnerable=true;if(mode==='immune')setSkills(e,['Amim']);if(mode==='hidden')e.status.sourceHidden=true;if(mode==='low-life')e.hp=.8;moved.push(e);}
 const excluded=[f.make('h108',0),f.make('h108',1),f.make('h108',1),f.make('h108',1),f.make('h108',1,20,20)];excluded[1].hp=0;excluded[2].status.sourceRemoved=true;setSkills(excluded[3],['Aloc']);const old=excluded.map(e=>[e.worldX,e.worldY]);
 ok(f.cast());f.at(10.04);for(const e of moved)near(e.worldY,10.5+7/300);assert.deepEqual(excluded.map(e=>[e.worldX,e.worldY]),old);
});

test('logically separate battlefields are not pushed merely because host coordinates overlap',()=>{
 const f=createTsunamiFixture(),other=f.make('h108',1,5,10.5);other.battleTeam='arena1';f.a.battleTeam=f.t.battleTeam='arena0';ok(f.cast());f.at(10.04);near(f.t.worldY,10.5+7/300);near(other.worldY,10.5);
});

test('removing the auxiliary handle cancels its remaining timer with an explicit boundary',()=>{
 const f=createTsunamiFixture();ok(f.cast());const j=f.g.state.sourceSkillJobs[0];j.dummy.status.sourceRemoved=true;f.at(11);assert.equal(j.done,true);assert.equal(j.pulses,0);assert.equal(j.nativeBoundary,'removed-dummy-handle');assert.equal(f.deaths.length,0);
});

test('pause postpones timer dispatch and the single-job API rejects unrelated or completed work',()=>{
 const f=createTsunamiFixture();ok(f.cast());const j=f.g.state.sourceSkillJobs[0];f.g.state.paused=true;f.at(10.2);assert.equal(j.pulses,0);assert.equal(tickTsunamiJob(f.g,j,f.api),true);f.g.state.paused=false;f.at(10.2);assert.equal(j.pulses,5);assert.equal(tickTsunamiJob(f.g,{type:'other'},f.api),false);f.at(11.61);assert.equal(tickTsunamiJob(f.g,j,f.api),false);
});

test('a real snapshot rebinds the live source and dummy and continues the exact saved pulse count',()=>{
 const f=createTsunamiFixture();ok(f.cast());f.at(10.48);const id=f.g.state.sourceSkillJobs[0].dummyId;
 const g=Game.fromSnapshot(clone(f.g.snapshot()));restoreTsunami(g);const j=g.state.sourceSkillJobs.find(j=>j.type==='tsunami_wave');assert.equal(j.source,body(g,f.a.id));assert.equal(j.dummy,body(g,id));assert.equal(j.pulses,12);
 g.state.time=11.61;tickTsunamiJobs(g,f.api);f.at(11.61);near(body(g,f.t.id).worldY,f.t.worldY);assert.equal(j.pulses,40);near(j.dummy.worldY,12);assert.equal(j.done,true);
 const later=clone(j);restoreTsunami(g);tickTsunamiJobs(g,f.api);assert.deepEqual(clone(j),later);
});

test('successful effect hooks are independent of the unrelated all-ability recursion guard',()=>{
 const f=createTsunamiFixture();f.g._sourceAbilityEffectDepth=3;ok(f.cast());assert.equal(activeJobs(f.g,'tsunami_wave').length,1);assert.equal(f.g._sourceAbilityEffectDepth,3);
});

test('the actual default queen cannot cast a forty-mana armor for free with its thirty-mana capacity',()=>{
 const f=createTsunamiFixture(),friend=f.make();assert.equal(f.a.mana,25);assert.equal(f.a.maxMana,30);const before=clone(f.g.snapshot());assert.equal(castWaterArmor(f.g,f.a,{target:friend},f.api).ok,false);assert.deepEqual(clone(f.g.snapshot()),before);
 f.a.mana=30;assert.equal(castWaterArmor(f.g,f.a,{target:friend},f.api).ok,false);assert.equal(water(friend),undefined);assert.equal(f.a.mana,30);
});

test('a qualified water-armor cast pays forty mana and uses the explicit ten-second five-armor fields',()=>{
 const f=createTsunamiFixture();f.a.combatRawcode='h106';f.a.mana=f.a.maxMana=80;const friend=f.make();ok(castWaterArmor(f.g,f.a,{target:friend},f.api));
 near(f.a.mana,40);near(f.a.skillStates.A07Y.readyAt,15);assert.equal(f.a.skillStates.A07Y.casts,1);assert.equal(activeJobs(f.g,'tsunami_dummy_life').length,0);near(water(friend).armor,5);near(water(friend).expiresAt,20);near(sourceAuraEffects(f.g,friend,[]).armor,5);
 assert.equal(castWaterArmor(f.g,f.a,{target:friend},f.api).ok,false);near(f.a.mana,40);f.g.state.time=15;ok(castWaterArmor(f.g,f.a,{target:friend},f.api));near(f.a.mana,0);assert.equal(friend.buffs.filter(b=>b.key==='B02T').length,1);near(water(friend).expiresAt,25);near(sourceAuraEffects(f.g,friend,[]).armor,5);
});

test('water armor rejects invalid native targets and cannot spend before target validation',()=>{
 for(const mode of ['enemy','range','dead','hidden','locust','other-battle','cyclone','mask','caster-silence','no-skill']){
  const f=createTsunamiFixture(),friend=f.make();f.a.mana=f.a.maxMana=80;
  if(mode==='enemy'){friend.team=1;friend.side='monster';}if(mode==='range')friend.worldX=5+801/300;if(mode==='dead')friend.hp=0;if(mode==='hidden')friend.status.sourceHidden=true;if(mode==='locust')setSkills(friend,['Aloc']);if(mode==='other-battle')friend.battleTeam=1;if(mode==='cyclone')friend.status.cycloneUntil=20;if(mode==='mask')f.api.matchesTargets=()=>false;if(mode==='caster-silence')f.a.status.silenceUntil=20;if(mode==='no-skill')setSkills(f.a,['A313']);
  const before=clone(f.g.snapshot());assert.equal(castWaterArmor(f.g,f.a,{target:friend},f.api).ok,false,mode);assert.deepEqual(clone(f.g.snapshot()),before,mode);
 }
});

test('exact h108 successful water armor chooses two unique additional allies with reservoir draws',()=>{
 const f=createTsunamiFixture(),target=f.make(),one=f.make(),two=f.make();f.a.mana=f.a.maxMana=80;let draws=0;f.g._random=()=>{draws++;return 0;};ok(castTsunami(f.g,f.a,'A07Y',{target},f.api));
 const report=f.a.status.tsunami.lastArmorSpread;assert.deepEqual(report.candidateIds,[f.a.id,one.id,two.id]);assert.deepEqual(report.requests.map(r=>r.targetId),[two.id,one.id]);assert.equal(report.randomDraws,5);assert.equal(draws,5);assert.ok(water(target));assert.ok(water(one));assert.ok(water(two));assert.equal(water(f.a),undefined);
 near(f.a.mana,40);assert.equal(f.a.skillStates.A07Y.casts,1);assert.equal(activeJobs(f.g,'tsunami_dummy_life').length,2);
});

test('each extra armor request creates an independent source-owned paid u006 helper and does not recurse',()=>{
 const f=createTsunamiFixture(),target=f.make();f.make();f.make();f.a.mana=f.a.maxMana=80;ok(castWaterArmor(f.g,f.a,{target},f.api));
 const helperJobs=activeJobs(f.g,'tsunami_dummy_life'),report=f.a.status.tsunami.lastArmorSpread;assert.equal(helperJobs.length,2);assert.notEqual(helperJobs[0].dummyId,helperJobs[1].dummyId);
 for(const j of helperJobs){const d=j.dummy;assert.equal(d.combatRawcode,'u006');assert.equal(d.scriptAuxiliary,true);assert.equal(d.ownerId,f.a.ownerId);near(d.mana,999999-40);near(d.manaRegen,99999);near(d.skillStates.A07Y.readyAt,15);assert.equal(d.skillStates.A07Y.casts,1);near(j.endAt,11);assert.equal(d.status.tsunami.lastArmorSpread,undefined);}
 for(const r of report.requests){assert.equal(r.orderId,852225);assert.equal(r.requested,true);assert.equal(r.hostAccepted,true);assert.equal(r.applied,true);assert.equal(r.nativeOutcome,'unverified');assert.equal(r.unitCastPoint,null);assert.equal(r.nativeReference.customInheritanceVerified,false);}
 f.at(10.999);assert.equal(f.deaths.length,0);f.at(11);assert.equal(f.deaths.length,2);assert.ok(water(target));
});

test('the original target is excluded but the queen itself is eligible when not the original target',()=>{
 const f=createTsunamiFixture(),target=f.make();f.a.mana=f.a.maxMana=80;ok(castWaterArmor(f.g,f.a,{target},f.api));const report=f.a.status.tsunami.lastArmorSpread;
 assert.deepEqual(report.candidateIds,[f.a.id]);assert.equal(report.requests.length,1);assert.equal(report.requests[0].targetId,f.a.id);assert.ok(water(f.a));
});

test('a self-target with no other allies produces no helper and no random draws',()=>{
 const f=createTsunamiFixture();f.a.mana=f.a.maxMana=80;const rng=f.g._rng;ok(castWaterArmor(f.g,f.a,{target:f.a},f.api));const report=f.a.status.tsunami.lastArmorSpread;assert.equal(report.requests.length,0);assert.equal(report.randomDraws,0);assert.equal(f.g._rng,rng);assert.equal(activeJobs(f.g,'tsunami_dummy_life').length,0);
});

test('spread uses the queen-centered four-hundred radius and life-at-least-one filter',()=>{
 const f=createTsunamiFixture(),target=f.make('h108',0,5+700/300,10),edge=f.make('h108',0,5+400/300,10),outside=f.make('h108',0,5+401/300,10),low=f.make(),dead=f.make(),other=f.make();edge.hp=1;low.hp=.99;dead.hp=0;other.battleTeam=1;
 f.a.mana=f.a.maxMana=80;ok(castWaterArmor(f.g,f.a,{target},f.api));const report=f.a.status.tsunami.lastArmorSpread;assert.deepEqual(report.candidateIds,[f.a.id,edge.id]);assert.equal(report.requests.length,2);assert.equal(water(outside),undefined);assert.equal(water(low),undefined);assert.equal(water(dead),undefined);assert.equal(water(other),undefined);
});

test('a chosen but native-invalid ally consumes its one selection without replacement',()=>{
 const f=createTsunamiFixture(),target=f.make(),valid=f.make(),hidden=f.make();hidden.status.sourceHidden=true;f.g._random=()=>0;f.a.mana=f.a.maxMana=80;ok(castWaterArmor(f.g,f.a,{target},f.api));
 const report=f.a.status.tsunami.lastArmorSpread;assert.deepEqual(report.requests.map(r=>r.targetId),[hidden.id,valid.id]);assert.equal(report.requests[0].requested,true);assert.equal(report.requests[0].hostAccepted,false);assert.equal(report.requests[0].applied,false);assert.equal(report.requests[0].rejectedByHost,'dead-hidden-or-locust');near(report.requests[0].manaAfter,999999);assert.ok(water(valid));assert.equal(water(f.a),undefined);assert.equal(activeJobs(f.g,'tsunami_dummy_life').length,2);
});

test('appearance aliases and merely having A07Y do not grant the exact h108 spread branch',()=>{
 for(const raw of ['h107','h106','u006']){const f=createTsunamiFixture();f.a.combatRawcode=raw;f.make();f.make();const before=f.g._rng;assert.equal(tsunamiNativeSpellEffect(f.g,f.a,'A07Y',f.a,f.api),false);assert.equal(activeJobs(f.g,'tsunami_dummy_life').length,0);assert.equal(f.g._rng,before);}
});

test('an already successful native effect callback does not pay the main spell again or use all-ability depth',()=>{
 const f=createTsunamiFixture();f.make();f.g._sourceAbilityEffectDepth=2;const mana=f.a.mana;const report=tsunamiNativeSpellEffect(f.g,f.a,'A07Y',f.a,f.api);assert.equal(report.requests.length,1);near(f.a.mana,mana);assert.equal(f.a.skillStates.A07Y.casts,0);assert.equal(f.g._sourceAbilityEffectDepth,2);
});

test('armor helpers and delayed lifetimes restore to their exact live handles without replaying RNG or costs',()=>{
 const f=createTsunamiFixture(),target=f.make();f.make();f.make();f.a.mana=f.a.maxMana=80;ok(castWaterArmor(f.g,f.a,{target},f.api));f.at(10.5);
 const saved=clone(f.g.snapshot()),g=Game.fromSnapshot(clone(saved));restoreTsunami(g);const caster=body(g,f.a.id),report=clone(caster.status.tsunami.lastArmorSpread),rng=g._rng,mana=caster.mana;
 for(const j of activeJobs(g,'tsunami_dummy_life')){assert.equal(j.dummy,body(g,j.dummyId));assert.equal(j.source,caster);near(j.dummy.mana,999959);}
 g.state.time=11;tickTsunamiJobs(g,f.api);assert.equal(activeJobs(g,'tsunami_dummy_life').length,0);assert.equal(g._rng,rng);near(caster.mana,mana);assert.deepEqual(caster.status.tsunami.lastArmorSpread,report);assert.ok(water(body(g,target.id)));
});

test('all newly saved timer request and helper numeric fields are finite',()=>{
 const f=createTsunamiFixture(),target=f.make();f.make();f.make();ok(f.cast());f.a.mana=f.a.maxMana=80;ok(castWaterArmor(f.g,f.a,{target},f.api));f.at(10.4);
 const seen=new Set();function check(v){if(typeof v==='number')assert.ok(Number.isFinite(v));if(!v||typeof v!=='object'||seen.has(v))return;seen.add(v);for(const x of Object.values(v))check(x);}check(f.g.state.sourceSkillJobs);check(f.a.status.tsunami);
});
