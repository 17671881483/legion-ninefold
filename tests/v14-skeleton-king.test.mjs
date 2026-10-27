import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {Game} from '../dist/engine.js';
import {UNIT_TEMPLATES,UNITS} from '../dist/data.js';
import {compileSkills,tickSourceScriptJobs,matchesTargets} from '../dist/skills.js';
import {skeletonKingGate,beginSkeletonKingRoundFinish,tickSkeletonKingLifecycle,skeletonKingLiAt,skeletonKingClapDescriptor,tickSkeletonKingJob} from '../dist/skeleton-king-rules.js';
import {spawnWarpWorld,laneToWorld} from '../dist/layout.js';

const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);
const has=(e,id)=>e.skillSpecs?.some(s=>s.id===id);
const dummyOf=g=>g.state.sourceSkillJobs.find(j=>j.type==='skeleton_king_dummy_remove')?.source;
function fixture({li=true}={}){
  const g=new Game({mode:'sandbox',seed:27});g.state.entities=[];g.state.phase='combat';g.state.time=10;g.state.skeletonKingGate.li=li;
  const p=laneToWorld(0,3,6);
  const make=({code='h0JJ',side='defender',ids,ownerId=side==='defender'?0:4,x=0,...extra}={})=>{
    const e=g._entity(UNIT_TEMPLATES[code],{ownerId,team:side==='defender'?0:1,side,battleTeam:0,laneId:0,sourceLaneId:0,worldX:p.x+x,worldY:p.y,userData:ownerId+1,...extra});
    if(ids)e.skillSpecs=compileSkills({abilityIds:ids,skillVersion:'v14.1A5',distanceScale:1/3});
    e.ability=null;e.attackCd=e.abilityCd=1000;e.hpRegen=e.manaRegen=0;g.state.entities.push(e);return e;
  };
  const dead=make(),killer=make({code:'h002',side:'monster',x:4});
  const kill=(e=dead,k=killer)=>g._hurt(e,1e9,k,{spell:true,universal:true});
  const at=time=>{g.state.time=time;tickSourceScriptJobs(g);};
  const revived=()=>g.state.entities.find(e=>e.combatRawcode==='h0JJ'&&e.id!==dead.id&&e.hp>0);
  return {g,dead,killer,make,kill,at,revived,p};
}

test('evidence uses unchanged Latin-1/LF JASS and exact registered entry lines',()=>{
  const proof=JSON.parse(readFileSync(new URL('../reference/skeleton-king-evidence.json',import.meta.url))),bytes=readFileSync(new URL('../reference/v14-source/raw_extracted/war3map.j',import.meta.url)),lines=bytes.toString('latin1').split('\n');
  assert.equal(createHash('sha256').update(bytes).digest('hex'),proof.source.sha256);
  for(const row of proof.sourceEvidence)assert.equal(lines[row.line-1].trim(),row.text,`JASS ${row.line}`);
  const assigns=lines.map((s,i)=>({s:s.trim(),i:i+1})).filter(({s})=>/^set LI=/.test(s));assert.deepEqual(assigns.map(x=>x.i),[15768,19375]);
});
test('compiled skills retain known clap fields, missing native costs and partial status',()=>{
  const [a,b]=compileSkills({abilityIds:['A0IA','A0IB'],skillVersion:'v14.1A5',distanceScale:1/3});
  assert.equal(a.status,'partial');assert.equal(b.status,'partial');assert.equal(b.kind,'skeleton_king_native_request');near(b.radius,2/3);assert.equal(b.damage,30);assert.equal(b.move,-.2);assert.equal(b.haste,-.2);assert.equal(b.duration,2);assert.equal(b.heroDuration,2);assert.equal(b.buffKey,'B04V');assert.equal(b.manaCost,null);assert.equal(b.cooldown,null);
  assert.notEqual(compileSkills({abilityIds:['A0IA']})[0].kind,'skeleton_king_source');
  const coverage=JSON.parse(readFileSync(new URL('../reference/content-coverage.json',import.meta.url)));assert.ok(coverage.playerRuntimeAbilities.some(u=>u.sourceRawcode==='e008'&&u.abilityIds.includes('A0IB')));
});
test('first death consumes a revival draw for both outcomes and revives at 1 second',()=>{
  for(const roll of [0,.999999]){
    const {g,dead,kill,at,revived}=fixture();let draws=0;g._random=()=>{draws++;return roll;};kill();assert.equal(draws,2,'alchemy initializer plus revival draw');assert.equal(g.state.sourceSkillJobs.length,1);
    at(10.999);assert.equal(revived(),undefined);at(11);assert.ok(revived());assert.equal(dead.hp,0);assert.equal(g.state.events.filter(e=>e.skillId==='A0IA').length,1);
  }
});
test('subsequent deaths pass below 0.5, fail at 0.5 and flush source flags',()=>{
  for(const roll of [.499999,.5]){
    const {g,dead,kill,at,revived}=fixture();dead.status.skeletonKingU1=true;dead.status.sourceSMYinwei=true;dead.status.webSentinel=42;g._random=()=>roll;kill();at(11);
    assert.equal(!!revived(),roll<.5);
    if(roll>=.5){assert.equal(dead.status.skeletonKingU1,undefined);assert.equal(dead.status.sourceSMYinwei,undefined);assert.equal(dead.status.skeletonKingHashtableFlushed,true);assert.equal(dead.status.webSentinel,42);}
  }
});
test('every new revived identity can die again immediately; no fabricated new-body cooldown',()=>{
  const {g,kill,at,revived,killer}=fixture();g._random=()=>0;kill();at(11);const first=revived();assert.ok(has(first,'A0IA'));kill(first,killer);const secondJob=g.state.sourceSkillJobs.find(j=>j.type==='skeleton_king_revive');assert.equal(secondJob.sourceId,first.id);assert.equal(secondJob.at,12);at(12);const next=revived();assert.notEqual(next.id,first.id);assert.ok(has(next,'A0IA'));
});
test('fire prefix skips revival and its draw for either spell or weapon death',()=>{
  const {g,killer,kill,at,revived}=fixture();killer.skillSpecs=compileSkills({abilityIds:['A0HW'],skillVersion:'v14.1A5',distanceScale:1/3});let draws=0;g._random=()=>{draws++;return 0;};kill();assert.equal(draws,1);at(11);assert.equal(revived(),undefined);assert.ok(g.state.events.some(e=>e.skillId==='A0HW'));
});
test('exact type, positive ability level, non-illusion and non-null killer are required',()=>{
  for(const reason of ['building','otherType','zeroLevel','noAbility','illusion','nullKiller']){
    const {g,dead,kill,at,revived}=fixture();
    if(reason==='building')dead.combatRawcode='h0JK';if(reason==='otherType')dead.combatRawcode='h002';if(reason==='zeroLevel')dead.abilityLevels={A0IA:0};if(reason==='noAbility')dead.skillSpecs=[];if(reason==='illusion')dead.isIllusion=true;
    let draws=0;g._random=()=>{draws++;return 0;};if(reason==='nullKiller')g._killUnit(dead);else kill();assert.equal(draws,1,reason);at(11);assert.equal(revived(),undefined,reason);
  }
});
test('Ju and disabled main trigger block revival without consuming main-trigger draws',()=>{
  for(const reason of ['Ju','disabled']){
    const {g,dead,kill,at,revived}=fixture();if(reason==='Ju')dead.status.sourceJuMember=true;else g._sourceUnitDeathTriggerDepth=1;let draws=0;g._random=()=>{draws++;return 0;};kill();assert.equal(draws,0);at(11);assert.equal(revived(),undefined);
  }
});
test('a nested fire kill cannot enter skeleton revival while the outer main trigger is disabled',()=>{
  const {g,dead,killer,make,kill}=fixture();killer.skillSpecs=compileSkills({abilityIds:['A0HW'],skillVersion:'v14.1A5',distanceScale:1/3});const victim=make({code:'h002'});dead.hp=1;kill(victim,killer);assert.ok(dead.hp<=0);assert.equal(g.state.sourceSkillJobs.some(j=>j.type==='skeleton_king_revive'),false);
});
test('the timer checks current LI once, consumes itself when closed and never retries',()=>{
  const {g,kill,at,revived}=fixture({li:false});kill();at(11);assert.equal(revived(),undefined);g.state.skeletonKingGate.li=true;at(12);assert.equal(revived(),undefined);assert.equal(g.state.sourceSkillJobs.length,0);
  const f=fixture({li:false});f.kill();f.g.state.skeletonKingGate.li=true;f.at(11);assert.ok(f.revived(),'death-time LI does not suppress timer creation');
});
test('corpse cleanup retains the old handle; only explicit saved fields cross to the new identity',()=>{
  const {g,dead,kill,at,revived,p}=fixture();g._random=()=>0;
  dead.userData=2;dead.facing=137;dead.maxHp=99999;dead.damage=9999;dead.armor=999;dead.mana=17;dead.nav={mode:'support',path:[],sentinel:true};dead.buildingId='old-building';dead.targetId='stale';dead.pendingAttack={sentinel:true};dead.isSummon=true;dead.expiresAt=11.5;dead.buffs=[{key:'test',damage:999}];dead.skillSpecs.push(...compileSkills({abilityIds:['A0HW'],skillVersion:'v14.1A5'}));dead.skillStates.A0IA={readyAt:999,casts:9};dead.status.sourceSMYinwei=true;dead.status.secret=1;
  kill();g._clearDead();assert.ok(!g.state.entities.includes(dead));const job=g.state.sourceSkillJobs[0];assert.equal(job.source,dead);dead.worldX=p.x+.1;dead.status.sourceSMYinwei=false;
  at(11);const n=revived();assert.ok(n);assert.notEqual(n.id,dead.id);assert.equal(n.maxHp,1400);assert.equal(n.damage,127);assert.equal(n.ownerId,0);near(n.worldX,p.x+.1);assert.equal(n.facing,137);assert.equal(n.userData,2);assert.equal(n.status.sourceSMYinwei,true,'timer-time saved flag');assert.equal(n.status.secret,undefined);assert.equal(n.status.skeletonKingU1,true);assert.equal(n.status.sourceJHMember,2);assert.equal(n.status.sourceJWMember,true);assert.equal(n.isSummon,false);assert.equal(n.expiresAt,undefined);assert.equal(n.buildingId,undefined);assert.equal(n.targetId,undefined);assert.equal(n.pendingAttack,undefined);assert.deepEqual(n.buffs,[]);assert.equal(has(n,'A0HW'),false);assert.ok(has(n,'A0IA'));assert.notEqual(n.nav,dead.nav);assert.deepEqual(n.nav.goal,spawnWarpWorld(1));assert.equal(n.status.skeletonKingAttackOrder.order,'attack');
});
test('old-body A0IA re-add request remains on the removed handle and dummy uses RemoveUnit',()=>{
  const {g,dead,kill,at,revived}=fixture();kill();at(11);const body=revived(),dummy=dummyOf(g);assert.equal(dummy.userData,dead.userData);assert.ok(has(dummy,'A0IB'));assert.equal(has(dead,'A0IA'),false);assert.equal(dead.status.sourceRemoved,true);
  const kills=g.state.players[4].stats.kills;at(11.999);assert.equal(dummyOf(g),dummy);assert.equal(dummy.status.sourceRemoved,undefined);at(12);assert.equal(dummyOf(g),undefined);assert.equal(dummy.status.sourceRemoved,true);assert.equal(dummy.status.sourceDeathHandled,true);assert.deepEqual(dead.status.skeletonKingOldAbilityRequest,{abilityId:'A0IA',at:12,removed:true,nativeBoundary:true});assert.ok(has(body,'A0IA'));assert.equal(body.status.skeletonKingOldAbilityRequest,undefined);assert.equal(g.state.players[4].stats.kills,kills,'RemoveUnit does not emit another death or bounty');
});
test('clap records explicit effect and target mask without fabricating a native hit or cost',()=>{
  const {g,kill,make,at}=fixture(),nearby=make({code:'h002',side:'monster',x:.2});nearby.armor=100;const hp=nearby.hp;kill();at(11);
  const dummy=dummyOf(g),request=dummy.status.skeletonKingClapRequest;
  assert.deepEqual(request.targets,['ground','neutral','organic']);assert.equal(request.damage,30);assert.equal(request.move,-.2);assert.equal(request.haste,-.2);assert.equal(request.duration,2);assert.equal(request.heroDuration,2);assert.equal(request.buffId,'B04V');assert.equal(request.radius,200);assert.equal(request.order,'thunderclap');assert.ok(request.missingNativeFields.includes('Cost1'));near(nearby.hp,hp);assert.equal(nearby.buffs.length,0);assert.equal(dummy.mana,dummy.maxMana);
  const spec=compileSkills({abilityIds:['A0IB'],skillVersion:'v14.1A5',distanceScale:1/3})[0];
  assert.equal(matchesTargets(spec,dummy,{...nearby,targetType:'air'}),false);assert.equal(matchesTargets(spec,dummy,{...nearby,targetType:'ground',traits:['mechanical']}),false);assert.equal(matchesTargets(spec,dummy,{...nearby,targetType:'ground',traits:[]}),true,'ground/organic only; neutral affiliation remains unresolved');assert.equal(skeletonKingClapDescriptor().nativeBoundary,true);
});
test('new body survives beyond dummy expiry and can execute its new attack-move route',()=>{
  const {g,kill,at,revived}=fixture();kill();at(11);const body=revived(),before={x:body.worldX,y:body.worldY};at(12);body.acquisitionRange=0;g._updateEntities(.1);assert.ok(body.hp>0);assert.ok(Math.hypot(body.worldX-before.x,body.worldY-before.y)>0);assert.equal(body.nav.mode,'return');
});
test('JSON restores both retained corpse and auxiliary dummy handle without duplicate resurrection',()=>{
  const f=fixture();f.kill();let r=Game.fromSnapshot(JSON.parse(JSON.stringify(f.g.snapshot())));let j=r.state.sourceSkillJobs[0];assert.equal(j.source,r.state.entities.find(e=>e.id===f.dead.id));r._clearDead();r.state.time=11;tickSourceScriptJobs(r);const n=r.state.entities.find(e=>e.combatRawcode==='h0JJ');assert.ok(n);const dummyId=dummyOf(r).id;r=Game.fromSnapshot(JSON.parse(JSON.stringify(r.snapshot())));const dummy=dummyOf(r);assert.equal(dummy.id,dummyId);assert.ok(dummy.hp>0);r.state.time=12;tickSourceScriptJobs(r);assert.equal(r.state.entities.filter(e=>e.combatRawcode==='h0JJ').length,1);assert.equal(dummy.status.sourceRemoved,true);
});
test('JSON restores a corpse after cleanup through the serialized job handle',()=>{
  const f=fixture();f.kill();f.g._clearDead();const r=Game.fromSnapshot(JSON.parse(JSON.stringify(f.g.snapshot())));assert.ok(!r.state.entities.some(e=>e.id===f.dead.id));r.state.time=11;tickSourceScriptJobs(r);assert.equal(r.state.entities.filter(e=>e.combatRawcode==='h0JJ').length,1);
});
test('fresh build and first combat do not infer LI; legacy snapshots retain uncertainty',()=>{
  const g=new Game({mode:'sandbox'});assert.equal(skeletonKingGate(g).li,false);g._startCombat();assert.equal(skeletonKingGate(g).li,false);const saved=g.snapshot();delete saved.state.skeletonKingGate;const r=Game.fromSnapshot(saved);assert.equal(skeletonKingGate(r).li,false);assert.equal(skeletonKingGate(r).legacyUnknown,true);
});
test('wave-end wait sequence closes at 1s, arms at 3s and opens through J4 at 9s',()=>{
  const g=new Game({mode:'sandbox'});g.state.skeletonKingGate.li=true;beginSkeletonKingRoundFinish(g,1);
  const step=(time,li)=>{g.state.time=time;tickSkeletonKingLifecycle(g);assert.equal(g.state.skeletonKingGate.li,li);};
  step(.999,true);step(1,false);step(3,false);assert.equal(g.state.skeletonKingGate.lastJ4StartedAt,3);step(8.999,false);step(9,true);assert.equal(g.state.skeletonKingGate.lastStatisticsAt,9);
});
test('16/24 additional waits defer J4, and K5/empty Jc do not enable LI',()=>{
  for(const wave of [16,24]){const g=new Game({mode:'sandbox'});beginSkeletonKingRoundFinish(g,wave);g.state.time=10.999;tickSkeletonKingLifecycle(g);assert.equal(g.state.skeletonKingGate.j4At,undefined);g.state.time=11;tickSkeletonKingLifecycle(g);assert.equal(g.state.skeletonKingGate.j4At,17);g.state.time=17;tickSkeletonKingLifecycle(g);assert.equal(g.state.skeletonKingGate.li,true);}
  for(const reason of ['K5','Jc']){const g=new Game({mode:'sandbox'});beginSkeletonKingRoundFinish(g,1);if(reason==='K5')g.state.skeletonKingGate.statisticsEnabled=false;else for(const p of g.state.players)p.eliminated=true;g.state.time=9;tickSkeletonKingLifecycle(g);assert.equal(g.state.skeletonKingGate.li,false);assert.equal(g.state.skeletonKingGate.j4At,undefined);}
});
test('paused build clock freezes J4; speed and JSON restoration preserve remaining wait',()=>{
  let g=new Game({mode:'sandbox'});beginSkeletonKingRoundFinish(g,1);g.tick(4);assert.equal(g.state.skeletonKingGate.j4At,9);g.state.paused=true;g.tick(10);near(g.state.time,4);g=Game.fromSnapshot(JSON.parse(JSON.stringify(g.snapshot())));g.state.paused=false;g.state.speed=2;g.tick(2.5);near(g.state.time,9);assert.equal(g.state.skeletonKingGate.li,true);
});
test('normal wave/arena transitions keep LI statistics independent of combat; pending revival cannot delay end',()=>{
  const {g,kill}=fixture();g.state.mode='normal';g._aiEnabled=()=>false;g._aiAct=()=>{};kill();g._endCombat();assert.equal(g.state.phase,'build');assert.equal(g.state.sourceSkillJobs.length,0);assert.equal(g.state.skeletonKingGate.li,true);g.tick(1);assert.equal(g.state.skeletonKingGate.li,false);g.tick(8);assert.equal(g.state.skeletonKingGate.li,true);g.state.wave=10;g.state.phase='combat';g._endCombat();assert.equal(g.state.roundMode,'arena-prep');g.tick(9);assert.equal(g.state.skeletonKingGate.li,true);g._startArena();assert.equal(g.state.skeletonKingGate.li,true);g._endArena([false,false]);assert.equal(g.state.skeletonKingGate.li,true);
});
test('continuous-wave transition preserves pending corpse jobs and LI without another OZ finish',()=>{
  const {g,dead,kill}=fixture();g.state.mode='normal';g.state.wave=31;g._random=()=>0;kill();g._clearDead();const job=g.state.sourceSkillJobs[0];g._advanceContinuous();assert.equal(g.state.wave,32);assert.ok(g.state.sourceSkillJobs.includes(job));assert.equal(g.state.skeletonKingGate.li,true);assert.equal(g.state.skeletonKingGate.finish,undefined);g.state.time=11;tickSourceScriptJobs(g);assert.ok(g.state.entities.some(e=>e.combatRawcode==='h0JJ'&&e.id!==dead.id));beginSkeletonKingRoundFinish(g,32);assert.equal(g.state.skeletonKingGate.finish,undefined);
});
test('normal and arena deployment initialize the source userData registration',()=>{
  const g=new Game({mode:'sandbox'}),p=g.state.players[0],def=UNITS.find(u=>u.combatRawcode==='h0JJ');assert.ok(def);p.buildings=[{id:'sk-building',unitId:def.id,col:2,row:2}];g._startCombat();assert.equal(g.state.entities.find(e=>e.combatRawcode==='h0JJ').userData,1);g._startArena();assert.equal(g.state.entities.find(e=>e.combatRawcode==='h0JJ').userData,1);
});
test('retained Locust dummy cannot be targeted or prolong arena survival',()=>{
  const {g,dead,killer,kill,at,revived}=fixture();g.state.mode='normal';g.state.roundMode='arena';dead.side='arena0';killer.side='arena1';g._random=()=>0;kill();at(11);const body=revived(),dummy=dummyOf(g);assert.ok(dummy);assert.equal(g.state.entities.some(e=>e.id===dummy.id),false);g._killUnit(body);g._clearDead();g._step(.01);assert.equal(g.state.roundMode,'arena-transition');assert.equal(g.state.arenaResult.winner,1);
});
test('a revived arena body follows its attack-move route when no target is available',()=>{
  const {g,dead,killer,kill,at,revived}=fixture();dead.side='arena0';killer.side='arena1';kill();at(11);const body=revived(),before={x:body.worldX,y:body.worldY};body.acquisitionRange=0;g._updateEntities(.1);assert.ok(Math.hypot(body.worldX-before.x,body.worldY-before.y)>0);
});
test('same-revision legacy A0IA definitions refresh without resetting runtime state',()=>{
  const {g,dead}=fixture();const skill=dead.skillSpecs.find(s=>s.id==='A0IA');skill.status='unresolved';skill.kind='pending';dead.hp=123;dead.skillStates.A0IA={readyAt:50,casts:7};dead.status.skeletonKingU1=true;
  const r=Game.fromSnapshot(JSON.parse(JSON.stringify(g.snapshot()))),body=r.state.entities.find(e=>e.id===dead.id);assert.equal(body.skillSpecs.find(s=>s.id==='A0IA').status,'partial');assert.equal(body.hp,123);assert.equal(body.skillStates.A0IA.readyAt,50);assert.equal(body.skillStates.A0IA.casts,7);assert.equal(body.status.skeletonKingU1,true);
});
test('coarse callback uses scheduled time for fresh creation, events and child timers, then restores frame time',()=>{
  const {g,kill,revived}=fixture();kill();g.state.time=13.75;tickSourceScriptJobs(g);const body=revived();assert.equal(body.createdAt,11);assert.equal(g.state.events.find(e=>e.skillId==='A0IA').time,11);assert.equal(g.state.events.find(e=>e.skillId==='A0IB').time,11);assert.equal(g.state.sourceSkillJobs.length,0,'child callbacks due at 12 run in the same catch-up');near(g.state.time,13.75);assert.equal(g._skeletonKingEventAt,undefined);
});
test('revival before a later LI close succeeds even when dispatched after the close',()=>{
  for(const restored of [false,true]){
    const f=fixture();let g=f.g;g.state.time=8.05;f.kill();g.state.time=8.1;beginSkeletonKingRoundFinish(g,1);g.state.time=9.1;tickSkeletonKingLifecycle(g);assert.equal(g.state.skeletonKingGate.li,false);assert.equal(skeletonKingLiAt(g,9.05),true);if(restored)g=Game.fromSnapshot(JSON.parse(JSON.stringify(g.snapshot())));
    tickSourceScriptJobs(g);const body=g.state.entities.find(e=>e.combatRawcode==='h0JJ'&&e.id!==f.dead.id&&e.hp>0);assert.ok(body);near(body.createdAt,9.05);near(g.state.time,9.1);assert.equal(g.state.skeletonKingGate.li,false);
  }
});
test('revival before later J4 statistics fails even when dispatched after LI opens',()=>{
  const {g,kill,revived}=fixture({li:false});g.state.time=8.05;kill();g.state.skeletonKingGate.j4At=9.1;g.state.time=9.1;tickSkeletonKingLifecycle(g);assert.equal(g.state.skeletonKingGate.li,true);assert.equal(skeletonKingLiAt(g,9.05),false);tickSourceScriptJobs(g);assert.equal(revived(),undefined);assert.equal(g.state.sourceSkillJobs.length,0);
});
test('revival just after close fails and just after statistics succeeds within the same frame',()=>{
  for(const opened of [false,true]){
    const {g,kill,revived}=fixture({li:!opened});g.state.time=8.15;kill();g.state.time=8.1;if(opened)g.state.skeletonKingGate.j4At=9.1;else beginSkeletonKingRoundFinish(g,1);g.state.time=9.2;tickSkeletonKingLifecycle(g);tickSourceScriptJobs(g);assert.equal(!!revived(),opened);near(g.state.time,9.2);
  }
});
test('Game._step queries LI at timer expiry instead of its advanced frame state',()=>{
  const {g,kill,revived}=fixture();g.state.time=8.05;kill();g.state.time=8.1;beginSkeletonKingRoundFinish(g,1);g.state.time=9;g._step(.1);assert.equal(g.state.skeletonKingGate.li,false);assert.ok(revived());near(revived().createdAt,9.05);
});
test('an explicitly removed corpse leaves a native-boundary request instead of fabricating its rawcode',()=>{
  const {g,dead,kill,at,revived}=fixture();kill();g.state.entities=g.state.entities.filter(e=>e!==dead);dead.status.sourceRemoved=true;at(11);assert.equal(revived(),undefined);assert.deepEqual(dead.status.skeletonKingRemovedRevivalRequest,{at:11,nativeBoundary:true});assert.equal(g.state.sourceSkillJobs.length,0);
});
test('callback failure restores both the frame clock and an outer event timestamp',()=>{
  const {g,kill}=fixture();kill();g.state.time=12.34;g._skeletonKingEventAt=7;assert.throws(()=>tickSkeletonKingJob(g,g.state.sourceSkillJobs[0],{spawnUnit:()=>{throw Error('creation failed');}}),/creation failed/);near(g.state.time,12.34);assert.equal(g._skeletonKingEventAt,7);
});
