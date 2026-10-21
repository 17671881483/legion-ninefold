import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {SOURCE_CLASS_ORDER,SOURCE_CLASS_REGISTRY,SOURCE_CLASS_DERIVED_ABILITIES,SOURCE_CLASS_RULES,sourceClassOf,initializeSourceClassBuilding,initializeSourceClassDeployment,sourceClassNativeStats,sourceClassBeforeDamage,sourceClassOnAttackDamage,sourceClassDeath,tickSourceClassJob,isSourceClassJobType} from '../dist/source-class-rules.js';
import {sourceAuraEffects} from '../dist/skills.js';

const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);
function fixture(draws=[]){
  let id=0;const game={state:{time:0,entities:[],sourceSkillJobs:[]},events:[],draws:[...draws],randomCalls:0,_random(){this.randomCalls++;return this.draws.length?this.draws.shift():.99;},_event(type,e,label,extra){this.events.push({type,id:e.id,label,...extra});}};
  game.unit=(ids=[],extra={})=>{const unit={id:++id,combatRawcode:'test',skillVersion:'v14.1A5',distanceScale:1/3,skillSpecs:ids.map(id=>({id,kind:'source_class',status:'implemented'})),status:{},hp:1000,maxHp:1000,mana:10,maxMana:100,range:1,worldX:5,worldY:8,side:'defender',ownerId:0,battleTeam:0,...extra};game.state.entities.push(unit);return unit;};
  const calls={damage:[],pause:[],jump:[],slow:[],spawns:[]},api={
    universalDamage(g,target,amount,source){calls.damage.push({targetId:target.id,amount,sourceId:source.id});if(target.hp>0)target.hp-=amount;},
    pauseUnitEx(g,source,target,level){calls.pause.push({sourceId:source.id,targetId:target.id,level});},
    jumpUnit(g,target,descriptor){calls.jump.push({targetId:target.id,...descriptor});},
    applyNativeSlow(g,source,target,id,descriptor){calls.slow.push({sourceId:source.id,targetId:target.id,id,...descriptor});},
    spawnUnit(g,source,code,extra){const unit=g.unit([],{combatRawcode:code,ownerId:source.ownerId,side:source.side,...extra});calls.spawns.push({sourceId:source.id,code,extra,unit});return unit;},
  };
  return {game,api,calls};
}
const has=(unit,id)=>unit.skillSpecs?.some(s=>s.id===id)??unit.permanentAbilityIds?.includes(id);
const tick=(game,api)=>{for(const job of game.state.sourceSkillJobs)tickSourceClassJob(game,job,api);game.state.sourceSkillJobs=game.state.sourceSkillJobs.filter(job=>!job.done);};

test('registry and first-match q order exactly match all 103 source registrations',()=>{
  const jass=readFileSync(new URL('../reference/v14-source/raw_extracted/war3map.j',import.meta.url),'latin1'),decode=hex=>Buffer.from(hex,'hex').toString('ascii');
  const order=[...jass.matchAll(/call BuidingMonsterSkill___RegisterMonsterSkillType\(\$([0-9A-F]{8})\)/g)].map(match=>decode(match[1]));
  const registry=Object.fromEntries([...jass.matchAll(/call BuidingMonsterSkill___RegisterMonsterSkill\(\$([0-9A-F]{8}),\$([0-9A-F]{8})\)/g)].map(match=>[decode(match[1]),decode(match[2])]));
  assert.equal(order.length,17);assert.equal(Object.keys(registry).length,103);assert.deepEqual(SOURCE_CLASS_ORDER,order);assert.deepEqual(SOURCE_CLASS_REGISTRY,registry);
});

test('classification tests each q entry for either exact raw registration or an actual ability',()=>{
  assert.equal(sourceClassOf({unitId:'v14_h010',permanentAbilityIds:['A197']}),'A18P');
  assert.equal(sourceClassOf({rawcode:'h06J',abilityIds:['A18S']}),'A18S');
  assert.equal(sourceClassOf({rawcode:'test',abilityIds:['A197','A191','A18W']}),'A18W');
  assert.equal(sourceClassOf({rawcode:'n07B',abilityIds:[]}),null);
  assert.equal(sourceClassOf({rawcode:'unknown-skin',appearanceBaseRawcode:'h010',abilityIds:[]}),null,'source does not widen through appearance aliases');
  assert.equal(sourceClassOf(null),null);
});

test('an empty runtime ability set is authoritative for consumed injected classes',()=>{
  assert.equal(sourceClassOf({rawcode:'test',abilityIds:['A191'],permanentAbilityIds:['A191'],skillSpecs:[]}),null);
  assert.equal(sourceClassOf({rawcode:'h010',skillSpecs:[]}),'A18P','exact source type registration still participates independently');
});

test('completed building initialization adds class and native child once, with an explicit deployment exclusion list',()=>{
  const {game}=fixture(),building={id:'b',unitId:'v14_h010',abilityIds:[],construction:{targetId:'v14_h010'}};
  assert.equal(initializeSourceClassBuilding(game,building).classId,null);assert.equal(building.permanentAbilityIds,undefined);
  building.construction=null;const first=initializeSourceClassBuilding(game,building),second=initializeSourceClassBuilding(game,building);
  assert.deepEqual(first,{classId:'A18P',effectiveClassId:'A18P',grantedAbilityIds:['A18Q']});assert.deepEqual(second,first);assert.deepEqual(building.permanentAbilityIds,['A18P','A18Q']);assert.deepEqual(building.sourceClassGrantedAbilityIds,['A18Q']);
  assert.equal(building.JY,undefined);assert.equal(initializeSourceClassBuilding(game,{unitId:'v14_n07B',abilityIds:[]}).classId,null);
});

test('all class branches use their exact source derived ability or retain the class marker',()=>{
  for(const classId of SOURCE_CLASS_ORDER){
    if(classId==='A18X')continue;const {game}=fixture(),building={rawcode:'test',abilityIds:[classId]},body=game.unit();
    const result=initializeSourceClassDeployment(game,building,body);assert.equal(result.classId,classId);assert.equal(result.effectiveClassId,classId);assert.deepEqual(result.grantedAbilityIds,[SOURCE_CLASS_DERIVED_ABILITIES[classId]??classId]);assert.ok(has(body,classId));assert.ok(has(body,result.grantedAbilityIds[0]));
  }
});

test('native children provide self-only attack, armor, regeneration, evasion, haste and literal critical values',()=>{
  for(const [classId,child] of Object.entries(SOURCE_CLASS_DERIVED_ABILITIES)){
    const {game}=fixture(),body=game.unit(),other=game.unit();initializeSourceClassDeployment(game,{rawcode:'test',abilityIds:[classId]},body);const spec=body.skillSpecs.find(s=>s.id===child);
    if(child==='A18Q'){near(sourceAuraEffects(game,body,[body]).damage,.1);near(sourceAuraEffects(game,other,[body]).damage,0);near(spec.radius,3);}
    if(child==='A18R')near(sourceAuraEffects(game,body,[]).armor,1);
    if(child==='A198'){near(sourceAuraEffects(game,body,[]).healRate,3);near(sourceClassNativeStats(body).selfRegen,3);near(sourceAuraEffects(game,other,[body]).healRate,0);}
    if(child==='A19A'){near(sourceClassNativeStats(body).spellResistance,.4);assert.equal(SOURCE_CLASS_RULES[child].status,'partial');}
    if(child==='A19B')near(spec.chance,.1);
    if(child==='A19D')near(sourceAuraEffects(game,body,[]).haste,.1);
    if(child==='A19E'){near(spec.chance,.25);near(spec.multiplier,2);}
  }
});

test('blood fusion preserves the building, rejects its own class and consumes each original pool draw',()=>{
  const {game}=fixture([6/17+.000001,16/17+.000001]),building={rawcode:'h06J',abilityIds:[]};initializeSourceClassBuilding(game,building);
  assert.deepEqual(building.permanentAbilityIds,['A18X']);assert.deepEqual(building.sourceClassGrantedAbilityIds,[]);assert.equal(game.randomCalls,0);
  const body=game.unit(),result=initializeSourceClassDeployment(game,building,body);assert.equal(result.classId,'A18X');assert.equal(result.effectiveClassId,'A197');assert.ok(has(body,'A18X'));assert.ok(has(body,'A197'));assert.equal(game.randomCalls,2);assert.deepEqual(building.permanentAbilityIds,['A18X']);
  initializeSourceClassDeployment(game,building,body);assert.equal(game.randomCalls,2,'same body never redraws');
});

test('each new fusion body draws independently while a restored body retains its consumed result',()=>{
  const {game}=fixture([0,11/17+.000001]),building={rawcode:'h06J',abilityIds:[]},one=game.unit(),two=game.unit();initializeSourceClassDeployment(game,building,one);initializeSourceClassDeployment(game,building,two);
  assert.equal(one.status.sourceClassDeployment.effectiveClassId,'A18P');assert.ok(has(one,'A18Q'));assert.equal(two.status.sourceClassDeployment.effectiveClassId,'A192');assert.ok(has(two,'A19D'));
  const restored=JSON.parse(JSON.stringify(one));game._random=()=>{throw new Error('restore attempted a random draw');};assert.equal(initializeSourceClassDeployment(game,building,restored).effectiveClassId,'A18P');
});

test('body initialization rechecks q order and skips generic mirror creation',()=>{
  const {game}=fixture(),building={rawcode:'h06J',abilityIds:[]},body=game.unit([],{combatRawcode:'h010'}),mirror=game.unit([],{isIllusion:true,combatRawcode:'h06J'});
  assert.equal(initializeSourceClassDeployment(game,building,body).effectiveClassId,'A18P');assert.equal(game.randomCalls,0);assert.equal(initializeSourceClassDeployment(game,building,mirror).classId,null);assert.deepEqual(mirror.skillSpecs,[]);
});

test('dark corrosion directly grants one -3 armor ability and refreshes its three-second lifetime across attackers',()=>{
  const {game,api}=fixture([.2,.2]),one=game.unit(['A18U']),two=game.unit(['A18U']),target=game.unit(['Amim']);
  sourceClassOnAttackDamage(game,one,target,api);near(sourceAuraEffects(game,target,[]).armor,-3);assert.equal(target.status.sourceClassTemporaryAbilities.A199.expiresAt,3);
  game.state.time=2;sourceClassOnAttackDamage(game,two,target,api);near(sourceAuraEffects(game,target,[]).armor,-3);assert.equal(target.skillSpecs.filter(s=>s.id==='A199').length,1);
  game.state.time=3;tick(game,api);assert.ok(has(target,'A199'));game.state.time=4.999;tick(game,api);assert.ok(has(target,'A199'));game.state.time=5;tick(game,api);assert.equal(has(target,'A199'),false);near(sourceAuraEffects(game,target,[]).armor,0);
});

test('corrosion and desert timers retain their target/source state through JSON restoration',()=>{
  const {game,api,calls}=fixture([0]),attacker=game.unit(['A18U','A197']),target=game.unit();sourceClassOnAttackDamage(game,attacker,target,api);assert.equal(calls.damage.length,1);assert.equal(has(attacker,'A197'),false);
  game.state=JSON.parse(JSON.stringify(game.state));const live=game.state.entities.find(u=>u.id===attacker.id),victim=game.state.entities.find(u=>u.id===target.id);game.state.time=3;tick(game,api);assert.equal(has(victim,'A199'),false);assert.equal(has(live,'A197'),false);
  game.state.time=5;tick(game,api);assert.ok(has(live,'A197'));assert.equal(game.state.sourceSkillJobs.length,0);assert.equal(game._sourceClassEventAt,undefined);
});

test('desert is ready on the first damage event, then rearms exactly five seconds after use',()=>{
  const {game,api,calls}=fixture(),attacker=game.unit(['A197']),target=game.unit();sourceClassOnAttackDamage(game,attacker,target,api);near(target.hp,875);assert.equal(calls.damage.length,1);
  assert.equal(game.state.sourceSkillJobs[0].source.status.sourceClassAttackBusy,false,'retained snapshots exclude the transient callback guard');
  game.state.time=4.999;tick(game,api);sourceClassOnAttackDamage(game,attacker,target,api);assert.equal(calls.damage.length,1);game.state.time=5;tick(game,api);sourceClassOnAttackDamage(game,attacker,target,api);near(target.hp,750);assert.equal(calls.damage.length,2);assert.equal(game.state.sourceSkillJobs.at(-1).at,10);
});

test('completed own jobs are not replayed and future jobs remain pending for the router',()=>{
  const {game,api}=fixture(),source=game.unit(),job={type:'source_class_desert_rearm',sourceId:source.id,source,at:5};
  game.state.time=4.999;assert.equal(tickSourceClassJob(game,job,api),true);assert.equal(job.done,undefined);assert.equal(has(source,'A197'),false);
  game.state.time=5;tickSourceClassJob(game,job,api);assert.equal(job.done,true);assert.ok(has(source,'A197'));source.skillSpecs=[];tickSourceClassJob(game,job,api);assert.deepEqual(source.skillSpecs,[],'done rearm cannot give a consumed skill a second time');
});

test('desert death keeps the source rearm attempt without resurrecting or inserting a removed unit',()=>{
  const {game,api}=fixture(),attacker=game.unit(['A197']),target=game.unit();sourceClassOnAttackDamage(game,attacker,target,api);attacker.hp=0;attacker.mana=7;attacker.skillStates={saved:{readyAt:12,casts:1}};sourceClassDeath(game,attacker,target,api);
  game.state.entities=game.state.entities.filter(u=>u.id!==attacker.id);game.state=JSON.parse(JSON.stringify(game.state));const job=game.state.sourceSkillJobs.find(j=>j.type==='source_class_desert_rearm');game.state.time=5;tickSourceClassJob(game,job,api);assert.ok(has(job.source,'A197'));near(job.source.hp,0);near(job.source.mana,7);assert.equal(job.source.skillStates.saved.casts,1);assert.equal(game.state.entities.some(u=>u.id===attacker.id),false);
});

test('class attack actions are an independent listener with per-attacker recursive protection',()=>{
  const {game,api,calls}=fixture([0,0]),attacker=game.unit(['A18U','A197','A18Y'],{hp:0}),target=game.unit();game._sourceDamageTriggerDepth=1;
  const damage=api.universalDamage;api.universalDamage=(g,t,n,s)=>{assert.equal(sourceClassOnAttackDamage(g,s,t,api),false);damage(g,t,n,s);};
  assert.equal(sourceClassOnAttackDamage(game,attacker,target,api),true);assert.equal(calls.damage.length,1);assert.equal(calls.pause.length,1);assert.equal(calls.pause[0].level,2);assert.equal(calls.jump[0].duration,1);assert.equal(calls.jump[0].interval,.03);assert.equal(calls.jump[0].height,300);assert.equal(attacker.status.sourceClassAttackBusy,false);
});

test('holy grace uses current pre-damage HP, inclusive ten-percent threshold, and removes itself once per body',()=>{
  const {game,api}=fixture(),source=game.unit(),target=game.unit(['A191']);target.hp=100.001;assert.equal(sourceClassBeforeDamage(game,target,10000,source,api),false);near(target.hp,100.001);
  target.hp=100;game._sourceDamageTriggerDepth=1;assert.equal(sourceClassBeforeDamage(game,target,10000,source,api),true);near(target.hp,250);assert.equal(has(target,'A191'),false);assert.equal(sourceClassBeforeDamage(game,target,10000,source,api),false);
  const next=game.unit();initializeSourceClassDeployment(game,{rawcode:'h09L',abilityIds:[]},next);assert.ok(has(next,'A191'));
});

test('an already accepted Ysera zero-damage event still reaches holy grace at five percent HP',()=>{
  const {game,api}=fixture(),target=game.unit(['A191'],{hp:50});assert.equal(sourceClassBeforeDamage(game,target,0,game.unit(),api),true);near(target.hp,200);
});

test('holy grace cannot resurrect an event target already killed by an independent listener',()=>{
  const {game,api}=fixture(),target=game.unit(['A191'],{hp:0});assert.equal(sourceClassBeforeDamage(game,target,10,game.unit(),api),true);near(target.hp,0);assert.equal(has(target,'A191'),false);assert.equal(game.events.length,0);
});

test('reverse current uses VertigoTarget when the host distinguishes it from animation-freezing PauseUnitEx',()=>{
  const {game,api}=fixture([0]),source=game.unit(['A18Y']),target=game.unit();let vertigo=0;api.vertigoTarget=(g,s,t,level)=>{vertigo++;assert.equal(level,2);};api.pauseUnitEx=()=>{throw new Error('wrong native helper');};sourceClassOnAttackDamage(game,source,target,api);assert.equal(vertigo,1);
});

test('ice departure issues the exact native slow descriptor to the killer without a guessed fallback',()=>{
  const {game,api,calls}=fixture(),dead=game.unit(['A18Z'],{hp:0}),killer=game.unit();sourceClassDeath(game,dead,killer,api);assert.equal(calls.slow.length,1);assert.equal(calls.slow[0].id,'A19C');near(calls.slow[0].move,-.5);near(calls.slow[0].duration,5);near(calls.slow[0].heroDuration,5);assert.deepEqual(killer.buffs,undefined);
  const second=game.unit(['A18Z'],{hp:0});sourceClassDeath(game,second,killer);assert.deepEqual(killer.buffs,undefined,'missing native order bridge does not invent a successful debuff');
});

test('soul transfer has one mutually exclusive 5/5/5 percent draw and no scripted summon expiration',()=>{
  for(const [draw,count] of [[0,3],[.05,3],[.050001,2],[.1,2],[.100001,1],[.15,1],[.150001,0],[.99,0]]){
    const {game,api,calls}=fixture([draw]),dead=game.unit(['A194'],{hp:0,mana:5,ownerId:2,worldX:12,worldY:9,facing:135});sourceClassDeath(game,dead,null,api);assert.equal(calls.spawns.length,count,draw);assert.equal(game.randomCalls,1);
    for(const summon of calls.spawns){assert.equal(summon.code,'h03B');assert.equal(summon.extra.isSummon,true);assert.equal(summon.unit.ownerId,2);near(summon.unit.worldX,12);near(summon.unit.worldY,9);assert.equal(summon.extra.facing,135);assert.equal(summon.extra.expiresAt,undefined);assert.equal(has(summon.unit,'A194'),false);}
    sourceClassDeath(game,dead,null,api);assert.equal(game.randomCalls,1);
  }
});

test('death removes its timed armor ability and touches only matching own-family jobs',()=>{
  const {game,api}=fixture([0]),attacker=game.unit(['A18U']),victim=game.unit(),foreignSource={id:attacker.id,mana:4,skillStates:{foreign:{casts:7}}},foreign={type:'target_pulses',sourceId:victim.id,targetId:victim.id,source:foreignSource},other=game.unit();
  sourceClassOnAttackDamage(game,attacker,victim,api);const ownOther={type:'source_class_desert_rearm',sourceId:other.id,source:{id:other.id,mana:8},at:20};game.state.sourceSkillJobs.push(foreign,ownOther);const before=JSON.stringify([foreign,ownOther]);victim.hp=0;sourceClassDeath(game,victim,attacker,api);assert.equal(has(victim,'A199'),false);assert.equal(JSON.stringify([foreign,ownOther]),before);assert.equal(foreign.source,foreignSource);assert.equal(isSourceClassJobType('target_pulses'),false);assert.equal(tickSourceClassJob(game,foreign,api),false);
});

test('unexecuted void, builder repair, and no-talent markers never gain invented attack effects',()=>{
  const {game,api,calls}=fixture([0]),attacker=game.unit(['A190','A195','A196']),target=game.unit();assert.equal(sourceClassOnAttackDamage(game,attacker,target,api),false);assert.equal(game.randomCalls,0);assert.equal(calls.damage.length,0);assert.equal(calls.pause.length,0);assert.equal(SOURCE_CLASS_RULES.A190.status,'partial');assert.equal(SOURCE_CLASS_RULES.A195.status,'partial');assert.equal(SOURCE_CLASS_RULES.A196.status,'implemented');
});
