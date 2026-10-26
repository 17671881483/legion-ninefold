import test from 'node:test';
import assert from 'node:assert/strict';
import {Game} from '../dist/engine.js';
import {UNITS,UNIT_TEMPLATES} from '../dist/data.js';
import {compileSkills,refreshSourceSkills,sourceAuraEffects,tickSourceScriptJobs,manualSourceSkills,sourceClassAttackDamageEvent} from '../dist/skills.js';
import {initializeVashjDeployment,vashjNativeSummon} from '../dist/vashj-rules.js';
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);
function fixture(){
  const g=new Game({mode:'sandbox',seed:83});g.state.phase='combat';g.state.time=0;g.state.entities=[];g.state.sourceSkillJobs=[];
  for(const p of g.state.players)p.buildings=[];
  const p=g.state.players[0],def=UNITS.find(u=>u.sourceRawcode==='n07I'),b={id:'vashj-building',unitId:def.id,col:2,row:1};p.buildings.push(b);
  g._recordLimitOrigins(b,def);g._recordSourceCompletion(p,def);g._recordEggCompletion(p,def,b);g._spawnDefender(def,p,3,6,b.id);
  const e=g.state.entities[0];e.mana=100;e.maxMana=100;e.attackCd=e.abilityCd=1e9;
  return {g,e,b,def};
}
function other(g,e,{raw='h002',team=1,x=.5,y=0,hp=100000,...extra}={}){
  const t=g._entity(UNIT_TEMPLATES[raw],{team,side:team===0?'defender':'monster',battleTeam:0,laneId:0,worldX:e.worldX+x,worldY:e.worldY+y,...extra});
  t.skillSpecs=[];t.hp=t.maxHp=hp;t.mana=0;g.state.entities.push(t);return t;
}
const tick=(g,at)=>{g.state.time=at;tickSourceScriptJobs(g);};
const cast=(g,e,id,params={})=>g.command('cast',{entityId:e.id,skillId:id,...params,...(params.point?{worldX:params.point.x,worldY:params.point.y}:{})});
const jobs=(g,type)=>g.state.sourceSkillJobs.filter(j=>j.type===type&&!j.done);
const retain=(e,ids)=>{e.skillSpecs=e.skillSpecs.filter(s=>ids.includes(s.id));};

test('Vashj exposes all three shared-cost manual commands and replaces misleading generic summon compilation',()=>{
  const {g,e}=fixture(),ui=manualSourceSkills(g,e);assert.deepEqual(ui.map(s=>s.id),['A1O5','A1O7','A1O8']);
  assert.deepEqual(ui.map(s=>[s.manaCost,s.cooldown,s.targetKind]),[[15,8,'point'],[15,20,'none'],[16,8,'none']]);
  assert.ok(ui.every(s=>s.cooldownMode==='shared_native'&&s.status==='partial'));
  assert.ok(e.skillSpecs.filter(s=>['A1N1','A1OC'].includes(s.id)).every(s=>s.status==='implemented'));
});

test('lightning rejects out-of-range before payment, creates three rays and ends at 450 before the final step',()=>{
  const {g,e}=fixture();assert.equal(cast(g,e,'A1O5',{point:{x:e.worldX+2,y:e.worldY}}).ok,false);near(e.mana,100);
  assert.equal(cast(g,e,'A1O5',{point:{x:e.worldX+1,y:e.worldY}}).ok,true);near(e.mana,85);
  assert.equal(cast(g,e,'A1O5',{point:{x:e.worldX+1,y:e.worldY}}).ok,false);near(e.mana,85);
  tick(g,0);const rays=jobs(g,'vashj_flight');assert.equal(rays.length,3);assert.deepEqual(rays.map(j=>j.steps),[1,1,1]);
  for(const j of rays)near(Math.hypot(j.x-e.worldX,j.y-e.worldY),50/300);
  tick(g,.319);assert.equal(jobs(g,'vashj_lightning').length,0);tick(g,.32);assert.ok(rays.every(j=>j.steps===9));
  tick(g,.36);assert.equal(jobs(g,'vashj_flight').length,0);assert.equal(jobs(g,'vashj_lightning').length,3);
  for(const j of jobs(g,'vashj_lightning')){near(Math.hypot(j.x-e.worldX,j.y-e.worldY),1.5);assert.equal(j.count,1);near(j.nextAt,1.36);}
});

test('nearby enemy lands all arrows at the first 50 step, immediately and six more times for 101 each',()=>{
  const {g,e}=fixture(),t=other(g,e,{x:0});cast(g,e,'A1O5',{point:{x:e.worldX+1,y:e.worldY}});e.mana=0;
  tick(g,0);near(t.hp,100000-303);assert.equal(jobs(g,'vashj_lightning').length,3);
  tick(g,5.999);near(t.hp,100000-303*6);tick(g,6);near(t.hp,100000-303*7);
  assert.equal(jobs(g,'vashj_lightning').length,3);tick(g,7);assert.equal(jobs(g,'vashj_lightning').length,0);near(t.hp,100000-2121);
});

test('flight SelectRange ignores Avul while DamageAoe delegates immunity at the damage entry',()=>{
  const {g,e}=fixture(),inv=other(g,e,{x:0}),immune=other(g,e,{x:1.5});inv.skillSpecs=[{id:'Avul',kind:'invulnerability',status:'implemented'}];
  immune.skillSpecs=[{id:'Amim',kind:'immunity',status:'implemented'}];cast(g,e,'A1O5',{point:{x:e.worldX+1,y:e.worldY}});e.mana=0;
  tick(g,0);assert.equal(jobs(g,'vashj_flight').length,3);near(inv.hp,100000);
  tick(g,.36);assert.ok(immune.hp<100000);near(inv.hp,100000);
});

test('caster death cancels existing lightning pools but does not cancel flights or pools registered after death',()=>{
  const a=fixture(),ta=other(a.g,a.e,{x:0});cast(a.g,a.e,'A1O5',{point:{x:a.e.worldX+1,y:a.e.worldY}});a.e.mana=0;tick(a.g,0);
  a.g._hurt(a.e,a.e.hp,ta,{spell:true,universal:true});tick(a.g,6);near(ta.hp,100000-303);
  const b=fixture(),killer=other(b.g,b.e,{x:10});cast(b.g,b.e,'A1O5',{point:{x:b.e.worldX+1,y:b.e.worldY}});b.e.mana=0;
  b.g._hurt(b.e,b.e.hp,killer,{spell:true,universal:true});b.g._clearDead();const tb=other(b.g,b.e,{x:1.5});tick(b.g,.36);
  const first=tb.hp;assert.ok(first<100000);tick(b.g,6.36);assert.ok(tb.hp<first);assert.ok(jobs(b.g,'vashj_lightning').every(j=>j.count===7));
});

test('spores use paired angle/distance draws, fixed positions, delay 1 and exactly ten 99-damage pulses',()=>{
  const {g,e}=fixture();e.facing=90;const draws=[0,1,.5,.5,1,0];g._random=()=>draws.shift();cast(g,e,'A1O7');delete g._random;
  const spores=jobs(g,'vashj_spore');assert.equal(spores.length,3);near(spores[0].x,e.worldX+500/300);near(spores[0].y,e.worldY);
  near(spores[1].x,e.worldX);near(spores[1].y,e.worldY+250/300);near(spores[2].x,e.worldX);near(spores[2].y,e.worldY);
  const t=other(g,e,{x:0});e.mana=0;tick(g,.999);near(t.hp,100000);tick(g,1);near(t.hp,99901);tick(g,10);near(t.hp,99010);
  assert.equal(jobs(g,'vashj_spore').length,3);tick(g,11);assert.equal(jobs(g,'vashj_spore').length,0);
});

test('spores survive actual source death, cleanup and JSON restore with the same pending damage',()=>{
  const {g,e}=fixture(),t=other(g,e,{x:0});g._random=()=>0;cast(g,e,'A1O7');delete g._random;e.mana=0;
  g._hurt(e,e.hp,t,{spell:true,universal:true});g._clearDead();const restored=Game.fromSnapshot(JSON.parse(JSON.stringify(g.snapshot())));
  tick(g,10);tick(restored,10);near(t.hp,100000-99*30);near(restored.state.entities.find(u=>u.id===t.id).hp,t.hp);
  assert.deepEqual(restored.state.sourceSkillJobs,g.state.sourceSkillJobs);
});

test('cold arrow uses the independent real attack event, including zero damage and friendly targets, without area slow',()=>{
  const {g,e}=fixture();retain(e,['A1N1']);g._random=()=>.2;const t=other(g,e,{team:0}),bystander=other(g,e,{x:.6});
  sourceClassAttackDamageEvent(g,t,e,{weapon:true,spell:true});near(t.hp,99904);near(t.status.stunUntil,4);assert.equal(t.status.sourceAnimationFrozenUntil,undefined);near(bystander.hp,100000);
  t.isNativeHero=true;delete t.status.stunUntil;sourceClassAttackDamageEvent(g,t,e,{});near(t.status.stunUntil,2);
  const before=t.hp;sourceClassAttackDamageEvent(g,t,e,{spell:true});near(t.hp,before);
  e.status.sourceNativeAttackBusy=true;sourceClassAttackDamageEvent(g,t,e,{});near(t.hp,before);
});

test('zeroed native attack damage still fires cold-arrow and does not add a mechanical stun',()=>{
  const {g,e}=fixture();retain(e,['A1N1']);g._random=()=>0;const t=other(g,e);t.skillSpecs=[{id:'testEvasion',status:'implemented',kind:'evasion',chance:1}];t.traits=['mechanical'];
  g._hurt(t,50,e,{weapon:true});near(t.hp,99904);assert.equal(t.status.stunUntil,undefined);
});

test('damage order is victim-first by ownership, even when its payment fails; branches remain independent',()=>{
  const {g,e}=fixture(),t=other(g,e);t.skillSpecs=compileSkills({skillVersion:'v14.1A5',abilityIds:['A1O5'],distanceScale:1/3});t.mana=0;
  g._hurt(t,1,e,{spell:true,universal:true});assert.equal(e.skillStates.A1O5.casts,0);assert.equal(e.skillStates.A1O7.casts,1);assert.equal(e.skillStates.A1O8.casts,1);near(e.mana,69);
  const second=fixture(),attacker=other(second.g,second.e);attacker.skillSpecs=[{id:'A2Y7'}];second.g._hurt(second.e,1,attacker,{spell:true,universal:true});near(second.e.mana,100);
});

test('script depth and ancient suppress channel bodies after payment, while native AHwe is independent',()=>{
  const {g,e}=fixture();e.traits.push('ancient');assert.equal(cast(g,e,'A1O7').ok,true);near(e.mana,85);assert.equal(jobs(g,'vashj_spore').length,0);
  g._sourceAbilityEffectDepth=1;assert.equal(cast(g,e,'A1O5',{point:{x:e.worldX+1,y:e.worldY}}).ok,true);assert.equal(jobs(g,'vashj_flight').length,0);
  assert.equal(cast(g,e,'A1O8').ok,true);assert.equal(g.state.entities.filter(u=>u.combatRawcode==='n07J').length,2);near(e.mana,54);
});

test('two phantom callbacks heal independently from time zero and stop on either bound death or timed expiration',()=>{
  const {g,e}=fixture();e.hp=100;e.maxHp=1000;cast(g,e,'A1O8');near(e.mana,84);tick(g,0);near(e.hp,110);near(e.mana,87);
  const phantoms=g.state.entities.filter(u=>u.combatRawcode==='n07J');assert.equal(phantoms.length,2);assert.ok(phantoms.every(p=>p.expiresAt===13&&p.status.sourceOpacity===.6));
  const killer=other(g,e,{x:10});g._hurt(phantoms[0],phantoms[0].hp,killer,{spell:true,universal:true});tick(g,1);near(e.hp,115);near(e.mana,88.5);
  tick(g,13);near(e.hp,170);near(e.mana,100);assert.equal(jobs(g,'vashj_phantom').length,0);
});

test('phantom loop checks current integer max life before healing, and never grants callbacks to ordinary CreateUnit',()=>{
  const {g,e}=fixture();e.maxHp=2.9;e.hp=1;cast(g,e,'A1O8');tick(g,0);near(e.hp,2.9);near(e.mana,87);tick(g,1);near(e.mana,87);assert.equal(jobs(g,'vashj_phantom').length,0);
  const ordinary=other(g,e,{raw:'n07J',team:0});assert.equal(ordinary.status.sourceOpacity,undefined);assert.equal(jobs(g,'vashj_phantom').length,0);
  assert.equal(vashjNativeSummon(g,e,{combatRawcode:'h002'}),false);
});

test('queen alliance is deferred, global, one-shot and order independent; undeployed buildings never count',()=>{
  for(const teams of [[0,1],[1,0]]){
    const {g,e}=fixture();assert.equal(e.abilityLevels?.A1CK,undefined);
    for(const team of teams)other(g,e,{raw:'h0OV',team,x:100,battleTeam:9});tick(g,0);assert.equal(e.abilityLevels.A1CK,4);
    near(sourceAuraEffects(g,e,[e]).damage,.04);near(sourceAuraEffects(g,e,[]).haste,-.08);
    assert.equal(e.skillSpecs.filter(s=>s.id==='A1OE').length,1);
  }
  const {g,e}=fixture();g.state.players[0].buildings.push({id:'queen-building',unitId:'v14_n05H'});tick(g,0);assert.equal(e.abilityLevels?.A1CK,undefined);
  other(g,e,{raw:'h0OV',team:0});tick(g,1);assert.equal(e.abilityLevels?.A1CK,undefined);
});

test('allied and enemy queen levels do not multiply; A1CK self mask and signed values survive skill refresh',()=>{
  for(const [team,level,damage,haste] of [[0,2,.15,0],[1,3,-.11,-.08]]){
    const {g,e,def}=fixture();for(let n=0;n<3;n++)other(g,e,{raw:'h0OV',team});tick(g,0);
    assert.equal(e.abilityLevels.A1CK,level);near(sourceAuraEffects(g,e,[e]).damage,damage);near(sourceAuraEffects(g,e,[]).haste,haste);
    const ally=other(g,e,{team:0});near(sourceAuraEffects(g,ally,[e]).damage,0);
    e.skillImplementationRevision='old';refreshSourceSkills(e,def);near(sourceAuraEffects(g,e,[e]).damage,damage);
    const restored=Game.fromSnapshot(JSON.parse(JSON.stringify(g.snapshot()))),saved=restored.state.entities.find(u=>u.id===e.id);near(sourceAuraEffects(restored,saved,[saved]).damage,damage);
  }
});

test('both normal and arena deployment register fresh alliance once, while arbitrary hero creation does not',()=>{
  const {g,e,b,def}=fixture();assert.equal(jobs(g,'vashj_alliance').length,1);initializeVashjDeployment(g,b,e);assert.equal(jobs(g,'vashj_alliance').length,1);
  g._startArena();assert.equal(g.state.entities.filter(u=>u.buildingId===b.id).length,1);assert.equal(jobs(g,'vashj_alliance').length,1);
  g.state.sourceSkillJobs=[];g._entity(def,{team:0,side:'defender'});assert.equal(jobs(g,'vashj_alliance').length,0);
});

test('all active timers, shared cooldowns and RNG continue equivalently across JSON saves',()=>{
  const {g,e}=fixture();cast(g,e,'A1O5',{point:{x:e.worldX+1,y:e.worldY}});cast(g,e,'A1O7');cast(g,e,'A1O8');e.hp-=500;tick(g,.16);
  const restored=Game.fromSnapshot(JSON.parse(JSON.stringify(g.snapshot())));
  const view=g=>JSON.parse(JSON.stringify({entities:g.state.entities,jobs:g.state.sourceSkillJobs,events:g.state.events,rng:g._rng}));
  for(const at of [.36,1,2,6.36,7.36,10,11,13]){tick(g,at);tick(restored,at);assert.deepEqual(view(restored),view(g),`${at}s`);}
});
