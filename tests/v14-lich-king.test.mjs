import test from 'node:test';
import assert from 'node:assert/strict';
import {Game} from '../dist/engine.js';
import {UNITS,UNIT_TEMPLATES} from '../dist/data.js';
import {tickSourceScriptJobs,manualSourceSkills,compileSkills,sourceAuraEffects} from '../dist/skills.js';
import {initializeLichKingDeployment} from '../dist/lich-king-rules.js';
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);
function fixture(){
 const g=new Game({mode:'sandbox',seed:381});g.state.phase='combat';g.state.time=0;g.state.entities=[];g.state.sourceSkillJobs=[];for(const p of g.state.players)p.buildings=[];
 const p=g.state.players[0],def=UNITS.find(u=>u.sourceRawcode==='n02S'),b={id:'lich-building',unitId:def.id,col:2,row:1};p.buildings.push(b);p.heroAltarCount=1;g._recordLimitOrigins(b,def);g._recordSourceCompletion(p,def);g._recordEggCompletion(p,def,b);g._spawnDefender(def,p,3,6,b.id);
 const e=g.state.entities[0];e.mana=e.maxMana=100;e.hp=e.maxHp=100000;e.attackCd=e.abilityCd=1e9;return {g,e,p,b,def};
}
function other(g,e,{code='h002',x=.5,team=1,hp=10000,...extra}={}){
 const t=g._entity(UNIT_TEMPLATES[code],{worldX:e.worldX+x,worldY:e.worldY,team,side:team===0?'defender':'monster',battleTeam:0,laneId:0,ownerId:team===0?0:null,...extra});t.skillSpecs=[];t.hp=t.maxHp=hp;t.mana=0;t.attackCd=t.abilityCd=1e9;g.state.entities.push(t);return t;
}
const tick=(g,at)=>{g.state.time=at;tickSourceScriptJobs(g);};
const kill=(g,t,e)=>g._hurt(t,t.hp,e,{spell:true,universal:true});
const copies=g=>g.state.entities.filter(e=>e.status.lichReanimated&&e.hp>0);
const cast=(g,e,t)=>g.command('cast',{entityId:e.id,skillId:'A0KQ',targetId:t.id});

test('normal registration uses h0M0 type, arena uses A0KQ and generic CreateUnit registers neither',()=>{
 const {g,e,def}=fixture();assert.equal(e.status.lichDeathListener,true);assert.equal(e.userData,1);
 const generic=g._entity(def,{team:0,side:'defender',ownerId:0});assert.equal(generic.status.lichDeathListener,undefined);
 const noAbility={...generic,id:'no-ability',skillSpecs:[],status:{}};initializeLichKingDeployment(g,noAbility);assert.equal(noAbility.status.lichDeathListener,true);
 const arena={...generic,id:'arena',combatRawcode:'h002',isArena:true,status:{}};initializeLichKingDeployment(g,arena);assert.equal(arena.status.lichDeathListener,true);
 const absent={...arena,status:{},skillSpecs:[]};initializeLichKingDeployment(g,absent);assert.equal(absent.status.lichDeathListener,undefined);
});

test('death chance is the literal 1..101 <=5 threshold, not a five-percent 0..100 roll',()=>{
 for(const [roll,n] of [[0,1],[.04,1],[.04001,0],[.99,0]]){const {g,e}=fixture();g._random=()=>roll;kill(g,other(g,e),e);assert.equal(copies(g).length,n);}
});

test('death listener copies friendly, enemy and summoned raw types with fresh template stats and source user data',()=>{
 for(const team of [0,1]){const {g,e}=fixture();g._random=()=>0;e.userData=7;const t=other(g,e,{team,isSummon:true});t.facing=123;t.damage=9999;kill(g,t,e);
 const c=copies(g)[0];assert.ok(c);assert.equal(c.combatRawcode,t.combatRawcode);assert.equal(c.ownerId,e.ownerId);assert.equal(c.team,e.team);assert.equal(c.userData,7);assert.equal(c.expiresAt,4);assert.equal(c.facing,123);assert.ok(c.traits.includes('summoned'));assert.notEqual(c.damage,t.damage);assert.equal(c.hp,UNIT_TEMPLATES.h002.hp);}
});

test('range short-circuits RNG, but native-hero, Ju and e00E exclusions consume their prior roll',()=>{
 const {g,e}=fixture(),outside=other(g,e,{x:4.001}),excluded=[{isNativeHero:true},{status:{sourceJuMember:true}},{code:'e00E'}].map(extra=>other(g,e,extra));let draws=0;g._random=()=>{draws++;return 0;};
 outside.hp=0;g._sourceDeath(outside,e);assert.equal(draws,1,'main death alchemy initializer still draws outside Lich range');
 for(const target of excluded){target.hp=0;g._sourceDeath(target,e);}
 assert.equal(draws,6,'three Lich rolls plus three unsuppressed main-death draws; Ju skips main');assert.equal(copies(g).length,0);
 const giant=other(g,e,{x:4,isHero:true,isNativeHero:false});kill(g,giant,e);assert.equal(copies(g).length,1,'visual/build-menu hero is not a native UNIT_TYPE_HERO');
});

test('separate live Lich listeners each roll and can independently copy one corpse',()=>{
 const {g,e,p,def}=fixture();g._spawnDefender(def,p,3,6,'second');g._random=()=>0;kill(g,other(g,e),e);assert.equal(copies(g).length,2);
});

test('caster life zero deregisters before self death and remains deregistered after cleanup',()=>{
 const {g,e}=fixture();g._random=()=>0;const t=other(g,e);kill(g,e,t);assert.equal(e.status.lichDeathListener,false);assert.equal(copies(g).length,0);g._clearDead();kill(g,t,e);assert.equal(copies(g).length,0);
});

test('four-second timed death is observed once, can be copied again, and never copies runtime spell registrations',()=>{
 const {g,e}=fixture();g._random=()=>0;const t=other(g,e,{code:'h0M0'});kill(g,t,e);const c=copies(g)[0];assert.equal(c.status.lichDeathListener,undefined);
 g.state.time=4;g._clearDead();const next=copies(g);assert.equal(next.length,1);assert.notEqual(next[0].id,c.id);assert.equal(next[0].expiresAt,8);g._clearDead();assert.equal(copies(g).length,1);
});

test('deployed bone dragons count by source player and regular-wave reset differs from arena carry-over',()=>{
 const {g,e,p}=fixture();for(const code of ['h0D3','h2A2']){const def=UNITS.find(u=>u.combatRawcode===code);assert.ok(def);const b={id:code,unitId:def.id,col:1,row:1};p.buildings.push(b);g._spawnDefender(def,p,1.5,5.5,b.id);}
 assert.equal(p.sourceBoneDragons,2);g._random=()=>.99;const bone=g.state.entities.find(e=>e.combatRawcode==='h0D3');kill(g,bone,e);assert.equal(p.sourceBoneDragons,1);
 g._startArena();assert.equal(p.sourceBoneDragons,3,'vf contains no reset');g.state.phase='build';g._startCombat();assert.equal(p.sourceBoneDragons,2,'OC5F_cg resets before normal deployment');
});

test('copied bone dragons do not get a fabricated P_id registration or decrement their apparent owner',()=>{
 const {g,e,p}=fixture(),def=UNITS.find(u=>u.combatRawcode==='h0D3');g._spawnDefender(def,p,3,6,'bone');const bone=g.state.entities.find(u=>u.combatRawcode==='h0D3');g._random=()=>0;kill(g,bone,e);assert.equal(p.sourceBoneDragons,0);assert.equal(copies(g).length,1);
 g._random=()=>.99;g.state.time=4;g._clearDead();assert.equal(p.sourceBoneDragons,0);assert.equal(g.state.lichNullOwnerBoneDragons,-1);
});

test('manual summon exposes sourced mana/range and explicitly partial missing cooldown/native control boundary',()=>{
 const {g,e}=fixture(),s=manualSourceSkills(g,e).find(s=>s.id==='A0KQ');assert.equal(s.status,'partial');assert.equal(s.manaCost,18);assert.equal(s.range,2);assert.equal(s.cooldown,0);
 assert.equal(cast(g,e,other(g,e,{x:2.01})).ok,false);near(e.mana,100);const t=other(g,e,{x:2});assert.equal(cast(g,e,t).ok,true);near(e.mana,82);assert.equal(g.state.sourceSkillJobs.length,1);
 g._sourceAbilityEffectDepth=1;assert.equal(cast(g,e,t).ok,true);assert.equal(g.state.sourceSkillJobs.length,2,'per-unit native effect listener is independent from allability');
});

test('Aslo proxy without registered source listener spends mana but does not invent a dragon callback',()=>{
 const {g,e}=fixture();e.status.lichDeathListener=false;const t=other(g,e);assert.equal(cast(g,e,t).ok,true);near(e.mana,82);assert.equal(g.state.sourceSkillJobs.length,0);
});

test('dragon starts at .04, advances twelve 80 steps and cleans at .52 with an excluded e00E death event',()=>{
 const {g,e}=fixture(),t=other(g,e,{x:2});let draws=0;g._random=()=>{draws++;return .99;};cast(g,e,t);const j=g.state.sourceSkillJobs[0];tick(g,.039);assert.equal(j.steps,0);tick(g,.04);assert.equal(j.steps,1);near(j.x-e.worldX,80/300);
 tick(g,.48);assert.equal(j.steps,12);near(j.x-e.worldX,960/300);assert.equal(g.state.sourceSkillJobs.length,1);assert.equal(draws,0);
 tick(g,.52);assert.equal(g.state.sourceSkillJobs.length,0);assert.equal(draws,2,'dummy death dispatches both the main alchemy initializer and independent Lich roll');assert.equal(copies(g).length,0);
});

test('dragon fixed direction follows no moving target and deduplicates each flight independently',()=>{
 const {g,e}=fixture(),t=other(g,e,{x:.3});cast(g,e,t);t.worldY+=.1;tick(g,.04);near(t.hp,9950);tick(g,.48);near(t.hp,9950);
 cast(g,e,t);tick(g,.52);near(t.hp,9900);
});

test('bone count is reloaded each step and native requests record one shared dummy with all ordered targets',()=>{
 const {g,e,p}=fixture(),a=other(g,e,{x:.2}),b=other(g,e,{x:.3}),later=other(g,e,{x:3});p.sourceBoneDragons=1;cast(g,e,a);tick(g,.04);near(a.hp,9900);near(b.hp,9900);
 const j=g.state.sourceSkillJobs[0],request=j.nativeStunRequests[0];assert.deepEqual(request.targetIds,[a.id,b.id]);assert.equal(request.requestedLevel,1);assert.equal(request.duration,1.3);assert.equal(request.dummyRemovedImmediately,true);assert.equal(a.status.stunUntil,undefined,'unverified immediate-RemoveUnit orders do not claim landed stuns');
 p.sourceBoneDragons=2;tick(g,.48);near(later.hp,9850);assert.equal(j.nativeStunRequests.at(-1).requestedLevel,2);
});

test('invalid native stun levels remain recorded instead of silently clamped into a valid duration',()=>{
 for(const level of [0,31]){const {g,e,p}=fixture(),t=other(g,e);p.sourceBoneDragons=level;cast(g,e,t);tick(g,.04);const r=g.state.sourceSkillJobs[0].nativeStunRequests[0];assert.equal(r.requestedLevel,level);assert.equal(r.duration,null);assert.equal(t.status.stunUntil,undefined);}
});

test('dragon continues after caster death and corpse cleanup, and hits immune enemies through universal damage',()=>{
 const {g,e}=fixture(),t=other(g,e,{x:2}),killer=other(g,e,{x:10});cast(g,e,t);t.skillSpecs=[{id:'Amim',kind:'immunity',status:'implemented'}];kill(g,e,killer);g._clearDead();tick(g,.48);near(t.hp,9950);assert.equal(g.state.sourceSkillJobs[0].steps,12);
});

test('saved dragon hit sets, requests, body listeners and player counters continue deterministically',()=>{
 const {g,e,p}=fixture();p.sourceBoneDragons=2;const a=other(g,e,{x:.2}),b=other(g,e,{x:3});cast(g,e,a);tick(g,.08);
 const r=Game.fromSnapshot(JSON.parse(JSON.stringify(g.snapshot()))),view=g=>JSON.parse(JSON.stringify({entities:g.state.entities,jobs:g.state.sourceSkillJobs,players:g.state.players,rng:g._rng,id:g._id}));
 for(const time of [.16,.48,.52]){tick(g,time);tick(r,time);assert.deepEqual(view(r),view(g));}near(b.hp,9850);
});

test('existing unholy aura remains unchanged and no global damage auto-cast is fabricated',()=>{
 const {g,e}=fixture(),t=other(g,e);near(sourceAuraEffects(g,e,[e]).move,.35);near(sourceAuraEffects(g,e,[e]).healRate,20);
 g._hurt(t,1,e,{spell:true,universal:true});assert.equal(g.state.sourceSkillJobs.length,0);near(e.mana,100);
 const skills=compileSkills(UNITS.find(u=>u.sourceRawcode==='n02S'));assert.deepEqual(skills.map(s=>s.status),['implemented','partial','partial']);
});


test('timed copies reach the ordinary death callbacks as well as independent resurrection listeners',()=>{
 const {g,e}=fixture(),mine=other(g,e,{code:'n0SC',x:.5});g._random=()=>0;kill(g,mine,e);const copy=copies(g)[0];assert.ok(copy);
 const enemy=other(g,e,{x:.5}),before=enemy.hp;g._random=()=>.99;g.state.time=4;g._clearDead();assert.ok(enemy.hp<before,'n0SC timed expiration executes the source explosion');assert.equal(copy.status.sourceDeathHandled,true);assert.equal(copy.status.lichDeathObserved,true);
});
