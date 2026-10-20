import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {V14_ABILITIES} from '../dist/v14-reference.js';
import {TROLL_RULES,TROLL_ACTIVE_RULES,initializeTrollUnit,castTrollAbility,tryTrollAutoCast,trollOnHit,trollIncomingDamage,sourceTrollDeath,tickTrollJob,trollHaste} from '../dist/troll-rules.js';

const jass=readFileSync(new URL('../reference/v14-source/raw_extracted/war3map.j',import.meta.url)).toString('latin1');
const fn=name=>{const m=jass.match(new RegExp(`function ${name}\\b[\\s\\S]*?endfunction`));assert.ok(m,name);return m[0];};
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);
function fixture(ids=['A15C','A15E','A15G','A15J']){
  const g={state:{time:0,entities:[],kings:[],players:[{id:0,buildings:[]}],sourceSkillJobs:[]},counter:0,hits:[],roots:[],attackLevels:[],events:[],randomValues:[],draws:0,
    _uid(prefix='u'){return `${prefix}-${++this.counter}`;},_random(){this.draws++;return this.randomValues.shift()??0;},_event(type,e,text){this.events.push({type,id:e.id,text});},
    add(skills=[],extra={}){const e={id:this._uid(),combatRawcode:'h002',ownerId:0,team:0,side:'defender',battleTeam:0,worldX:0,worldY:0,hp:1000,maxHp:1000,mana:100,maxMana:100,damage:124,distanceScale:1/3,skillVersion:'v14.1A5',sourceVersion:'v14.1A5',skillSpecs:skills.map(id=>({id})),skillStates:{},status:{},...extra};this.state.entities.push(e);return e;},
    kill(e,killer){e.hp=0;e.status.deathCounted=true;sourceTrollDeath(this,e,killer,api);},
    tick(at){this.state.time=at;const remaining=[];for(const job of this.state.sourceSkillJobs)if(tickTrollJob(this,job,api))remaining.push(job);this.state.sourceSkillJobs=remaining;},
  };
  const api={
    universalDamage(game,t,amount,s){if(t.hp<=0||t.invulnerable)return 0;game.hits.push({targetId:t.id,sourceId:s.id,amount});t.hp-=amount;if(t.hp<=0){t.status.deathCounted=true;sourceTrollDeath(game,t,s,api);}return amount;},
    addAbility(game,e,id){if(!e.skillSpecs?.some(s=>s.id===id)){e.skillSpecs??=[];e.skillSpecs.push({id,kind:'troll_source'});}e.abilityLevels??={};e.abilityLevels[id]??=1;},
    applyAttackLevel(game,e,id,old,next){game.attackLevels.push({id:e.id,skillId:id,old,next});if(Number.isFinite(e.damage))e.damage+=Number(V14_ABILITIES[id].resolved_fields[`DataA${next}`]??0)-Number(V14_ABILITIES[id].resolved_fields[`DataA${old}`]??0);},
    applyEnsnare(game,e,t,id){game.roots.push({sourceId:e.id,targetId:t.id,id});if(t.rejectNet||t.isBuilding)return false;t.status.rootUntil=(game._trollEventAt??game.state.time)+3;return true;},
  };
  const caster=g.add(ids,{combatRawcode:'h0QU',buildingId:'troll-building'}),building={id:caster.buildingId};g.state.players[0].buildings.push(building);initializeTrollUnit(g,caster,api);
  const enemy=(x=.5,extra={})=>g.add([],{ownerId:null,team:1,side:'monster',worldX:x,...extra});
  return {g,api,caster,building,enemy,cast:(target,params={})=>castTrollAbility(g,caster,'A15C',{target,...params},api)};
}
function aux(f,id,n){f.api.addAbility(f.g,f.caster,id);f.caster.abilityLevels[id]=n;f.caster.status[id==='A15D'?'trollAttackLevel':'trollHasteLevel']=n;f.building.abilityLevels??={};f.building.abilityLevels[id]=n;f.building[id==='A15D'?'trollAttackLevel':'trollHasteLevel']=n;f.api.addAbility(f.g,f.building,id);if(id==='A15D'){f.caster.status.trollAppliedAttackLevel=n;f.caster.damage+=Number(V14_ABILITIES.A15D.resolved_fields[`DataA${n}`]);}}

test('source aliases, actual attacker-first orders, timers and auxiliary object levels override tooltip claims',()=>{
  for(const literal of ['integer QW=$41313544','integer QX=$41313546','integer b8=$41313545','integer b7=$41313549'])assert.ok(jass.includes(literal));
  assert.match(fn('SuperAxe'),/local real DK=1/);assert.match(fn('SuperAxeAction'),/200\)[\s\S]*GetUnitState\(Om,UNIT_STATE_MAX_LIFE\)/);assert.match(fn('SuperAxeActionCallBackGroup'),/,250,ATTACK_TYPE_CHAOS,DAMAGE_TYPE_UNIVERSAL/);
  assert.match(fn('SuperAxe'),/ChargeDistanceTarget\(Bc,Ki,Om,999999,DK,null,null\)/);assert.match(fn('ChargeDistanceTarget'),/SaveReal\(O,Pr,1,GetDisFromUnit\(Ki,Om\)\)/);
  assert.match(fn('ZulJinRash'),/LoadTriggerHandle\(O,GetHandleId\(Bc\),b8\)/);assert.match(fn('ZulJinRash'),/TimerEvent\(t,\.5,true\)/);assert.match(fn('ZulJinRashAction'),/MAX_LIFE\)\*\.015/);
  assert.match(fn('ZulJinAttack'),/GetRandomPercentageBJ\(\)<=12/);assert.ok(!jass.includes('$4131354A'),'A15J has no script reference');
  assert.match(fn('Trig_UnitDamageActions'),/if GetUnitAbilityLevel\(bV,\$41313543\)>0 then\s+call IssueTargetOrder\(bV,"unflamingattack",i\)\s+elseif GetUnitAbilityLevel\(i,\$41313543\)>0/);
  assert.match(fn('ZulJinRegisterTazDingoAction'),/GetEventDamage\(\)>GetUnitState\(Bc,UNIT_STATE_LIFE\)/);assert.match(fn('ZulJinRegisterTazDingoAction'),/GetUnitState\(Bc,UNIT_STATE_LIFE\)-1/);
  assert.equal(TROLL_RULES.A15J.status,'marker');assert.equal(TROLL_ACTIVE_RULES.A15C.cooldownMode,'shared_native');
  for(let level=1;level<=80;level++)assert.equal(Number(V14_ABILITIES.A15D.resolved_fields[`DataA${level}`]),5*level);
  for(let level=71;level<=100;level++)assert.equal(Number(V14_ABILITIES.A15F.resolved_fields[`DataA${level}`]),0);
});

test('manual and attacker-first automatic casts share native cost and cooldown; cyclone and invalid targets pay nothing',()=>{
  const f=fixture(['A15C']),target=f.enemy();target.combatRawcode='h0WP';target.skillSpecs=[{id:'A15C'}];
  f.caster.status.cycloneUntil=1;assert.equal(f.cast(target).ok,false);near(f.caster.mana,100);delete f.caster.status.cycloneUntil;
  target.invulnerable=true;assert.equal(f.cast(target).ok,false);delete target.invulnerable;
  target.worldX=3;assert.equal(f.cast(target).ok,false);near(f.caster.mana,100);target.worldX=.5;
  assert.equal(f.cast(target).ok,true);near(f.caster.mana,80);assert.equal(f.caster.skillStates.A15C.readyAt,5);
  assert.equal(tryTrollAutoCast(f.g,target,f.caster,f.api).ok,false,'an attacker with unavailable native cooldown blocks victim fallback');near(target.mana,100);
  f.g.state.time=5;assert.equal(tryTrollAutoCast(f.g,target,f.caster,f.api).ok,true);near(f.caster.mana,60);near(target.mana,100);
});

test('nested shared spell effects preserve native costs while suppressing only the Troll script body',()=>{
  const f=fixture(['A15C']),target=f.enemy();f.g._sourceAbilityEffectDepth=1;
  assert.deepEqual(f.cast(target),{ok:true,skillId:'A15C',scriptSuppressed:true});near(f.caster.mana,80);assert.equal(f.caster.skillStates.A15C.casts,1);assert.equal(f.g.state.sourceSkillJobs.length,0);assert.equal(f.g._sourceAbilityEffectDepth,1);
  f.g._sourceAbilityEffectDepth=0;f.g.state.time=5;assert.equal(f.cast(target).ok,true);assert.equal(f.g._sourceAbilityEffectDepth,0);assert.equal(f.g.state.sourceSkillJobs[0].type,'troll_super_axe');
});

test('axe tracks for 24 truncated four-percent steps, then hits its dummy area and primary at exactly one second',()=>{
  const f=fixture(['A15C']),target=f.enemy(1.5),nearby=f.enemy(2),outside=f.enemy(2.2);f.cast(target);
  const job=f.g.state.sourceSkillJobs[0];f.g.tick(.999);near(job.traveled,1.44);near(job.dummy.x,1.44);assert.equal(f.g.hits.length,0);
  f.g.tick(1);assert.equal(f.g.state.sourceSkillJobs.length,0);assert.deepEqual(f.g.hits.filter(h=>h.targetId===target.id).map(h=>h.amount),[250,1000]);near(nearby.hp,750);near(outside.hp,1000);
  assert.equal(f.building.trollAttackLevel,1);near(f.caster.damage,129);
});

test('a primary killed by the area grants two attack levels and an already-dead primary still grants its final level',()=>{
  const f=fixture(['A15C']),target=f.enemy(.5,{hp:100});f.cast(target);f.g.tick(1);assert.equal(f.building.trollAttackLevel,2);near(f.caster.damage,134);
  const prior=fixture(['A15C']),dead=prior.enemy(.5);prior.cast(dead);prior.g.tick(.2);const x=prior.g.state.sourceSkillJobs[0].dummy.x;prior.g.kill(dead,null);prior.g.state.entities=prior.g.state.entities.filter(e=>e!==dead);prior.g.tick(1);
  assert.equal(prior.building.trollAttackLevel,1);assert.equal(prior.g.hits.length,0);near(x,.12);
});

test('attack growth caps at the actual eighty source levels and is restored once from its building',()=>{
  const f=fixture(['A15C']);aux(f,'A15D',79);f.cast(f.enemy(.5,{hp:100}));f.g.tick(1);
  assert.equal(f.caster.abilityLevels.A15D,80);assert.equal(f.building.abilityLevels.A15D,80);near(f.caster.damage,524);
  const body=f.g.add(['A15C','A15G'],{combatRawcode:'h0WP',buildingId:f.building.id});initializeTrollUnit(f.g,body,f.api);near(body.damage,524);assert.equal(body.abilityLevels.A15D,80);initializeTrollUnit(f.g,body,f.api);near(body.damage,524);
});

test('a compact stored building level is normalized before area kills increment its independent native ability level',()=>{
  const f=fixture(['A15C']);f.building.trollAttackLevel=3;
  const body=f.g.add(['A15C'],{combatRawcode:'h0WP',buildingId:f.building.id});initializeTrollUnit(f.g,body,f.api);assert.equal(f.building.abilityLevels.A15D,3);near(body.damage,139);
  const target=f.enemy(.5,{hp:100});castTrollAbility(f.g,body,'A15C',{target},f.api);f.g.tick(1);
  assert.equal(body.abilityLevels.A15D,5);assert.equal(f.building.abilityLevels.A15D,5);near(body.damage,149);
});

test('death selects the first three valid enemies rather than random targets and retained axes share permanent growth',()=>{
  const f=fixture(['A15G']),targets=[.1,.2,.3,.4].map(x=>f.enemy(x,{hp:10000,maxHp:10000}));f.enemy(.2,{invulnerable:true});f.enemy(2);
  f.g.kill(f.caster,targets[0]);assert.deepEqual(f.g.state.sourceSkillJobs.map(j=>j.targetId),targets.slice(0,3).map(t=>t.id));assert.equal(f.g.draws,0);
  f.g.state.entities=f.g.state.entities.filter(e=>e!==f.caster);f.g.tick(1);
  assert.equal(f.building.trollAttackLevel,3);assert.equal(f.g.state.sourceSkillJobs.length,0);assert.equal(targets[3].hp,9250);
});

test('twelve-percent hits net the current target but bind only one caster-owned rash with a zero-second first pulse',()=>{
  const f=fixture(['A15E']),first=f.enemy(),second=f.enemy(.6);f.g.randomValues=[.12,0];
  assert.equal(trollOnHit(f.g,f.caster,first,f.api),true);assert.equal(first.hp,1000);f.g.tick(0);near(first.hp,985);near(first.status.rootUntil,3);
  f.g.state.time=.2;assert.equal(trollOnHit(f.g,f.caster,second,f.api),true);assert.equal(f.g.state.sourceSkillJobs.filter(j=>j.type==='troll_rash').length,1);assert.equal(f.g.roots.length,1,'native A15I cooldown does not restart while its ability remains added');
  f.g.tick(.49);near(first.hp,985);f.g.tick(.5);near(first.hp,970);near(second.hp,1000);
});

test('a failed native net still starts rash without tooltip extra targets or attack/haste-scaled net damage',()=>{
  const f=fixture(['A15E']),target=f.enemy(.5,{rejectNet:true});aux(f,'A15D',80);aux(f,'A15F',70);
  trollOnHit(f.g,f.caster,target,f.api);assert.equal(f.caster.skillStates.A15I.casts,0);assert.equal(target.status.rootUntil,undefined);
  f.g.tick(0);assert.deepEqual(f.g.hits.map(h=>h.amount),[15]);assert.equal(f.g.roots.length,1);assert.equal(f.g.state.sourceSkillJobs.length,1);
});

test('rash continues after caster death and corpse cleanup, and only its own lethal pulse grants haste',()=>{
  const f=fixture(['A15E']),target=f.enemy(.5,{hp:10});trollOnHit(f.g,f.caster,target,f.api);f.g.kill(f.caster,target);f.g.state.entities=f.g.state.entities.filter(e=>e!==f.caster);f.g.tick(0);
  assert.equal(f.building.trollHasteLevel,1);assert.equal(f.g.state.sourceSkillJobs.length,0);
  const ordinary=fixture(['A15E']),other=ordinary.enemy(.5);trollOnHit(ordinary.g,ordinary.caster,other,ordinary.api);ordinary.g.kill(other,ordinary.caster);ordinary.g.tick(0);assert.equal(ordinary.building.trollHasteLevel,undefined);assert.equal(ordinary.caster.status.trollRashJobId,undefined);
});

test('level seventy-one loses its haste according to the actual source data and that level survives redeployment',()=>{
  const f=fixture(['A15E']);aux(f,'A15F',70);near(trollHaste(f.caster),Number(V14_ABILITIES.A15F.resolved_fields.DataA70));trollOnHit(f.g,f.caster,f.enemy(.5,{hp:10}),f.api);f.g.tick(0);
  assert.equal(f.caster.abilityLevels.A15F,71);assert.equal(f.building.trollHasteLevel,71);near(trollHaste(f.caster),0);
  const body=f.g.add(['A15E'],{combatRawcode:'h0QU',buildingId:f.building.id});initializeTrollUnit(f.g,body,f.api);assert.equal(body.abilityLevels.A15F,71);near(trollHaste(body),0);
});

test('TazDingo protects only strict overkill and its first five-second listener window never refreshes',()=>{
  const f=fixture(['A15G']);f.caster.hp=10;
  assert.equal(trollIncomingDamage(f.g,f.caster,10,null,f.api),10);assert.equal(f.g.state.sourceSkillJobs.length,0);
  assert.equal(trollIncomingDamage(f.g,f.caster,11,null,f.api),9);assert.equal(f.caster.status.trollTazExpiresAt,5);
  f.caster.hp=1;assert.equal(trollIncomingDamage(f.g,f.caster,1,null,f.api),1);assert.equal(trollIncomingDamage(f.g,f.caster,2,null,f.api),0);
  f.g.state.time=4;assert.equal(trollIncomingDamage(f.g,f.caster,2,null,f.api),0);assert.equal(f.caster.status.trollTazExpiresAt,5);assert.equal(f.g.state.sourceSkillJobs.length,1);
  f.g.tick(5);assert.equal(f.caster.status.trollTazEnabled,false);assert.equal(trollIncomingDamage(f.g,f.caster,2,null,f.api),2);
});

test('the negative native event-damage request at sub-one HP is preserved as an explicitly unresolved host boundary',()=>{
  const f=fixture(['A15G']);f.caster.hp=.5;
  assert.equal(trollIncomingDamage(f.g,f.caster,1,null,f.api),-.5);near(f.caster.hp,.5);
  assert.equal(TROLL_RULES.A15G.status,'partial');assert.match(TROLL_RULES.A15G.partial,/负伤害/);
});

test('death snapshots are restricted to Troll jobs and cannot rewrite another family retained source',()=>{
  const f=fixture(['A15C']),target=f.enemy();f.cast(target);const foreign={type:'illidan_flame',sourceId:f.caster.id,targetId:target.id,source:{sentinel:'foreign'}};f.g.state.sourceSkillJobs.push(foreign);
  f.g.kill(f.caster,target);f.g.kill(target,null);assert.deepEqual(foreign.source,{sentinel:'foreign'});assert.equal(foreign.target,undefined);
  const own=f.g.state.sourceSkillJobs[0];assert.equal(own.source.hp,0);assert.equal(own.source.skillVersion,'v14.1A5');assert.ok(Array.isArray(own.source.skillSpecs));assert.equal(own.target.hp,0);
});

test('all active axe, rash and TazDingo jobs serialize and resume with equivalent damage, growth and listener state',()=>{
  const f=fixture(),primary=f.enemy(1.2,{hp:10000,maxHp:10000}),rash=f.enemy(.5,{hp:20,maxHp:100});f.cast(primary);trollOnHit(f.g,f.caster,rash,f.api);f.caster.hp=10;trollIncomingDamage(f.g,f.caster,11,primary,f.api);f.g.tick(.2);
  const fields=g=>JSON.parse(JSON.stringify({state:g.state,counter:g.counter,hits:g.hits,roots:g.roots,attackLevels:g.attackLevels,events:g.events,randomValues:g.randomValues,draws:g.draws}));
  const restored=fixture([]);Object.assign(restored.g,fields(f.g));
  for(const at of [.5,1,2,5,6,7]){f.g.tick(at);restored.g.tick(at);assert.deepEqual(fields(restored.g),fields(f.g),`${at}s continuation`);}
  assert.equal(f.g.state.sourceSkillJobs.length,0);
});
