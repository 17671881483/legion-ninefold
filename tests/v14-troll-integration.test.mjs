import test from 'node:test';
import assert from 'node:assert/strict';
import {Game} from '../dist/engine.js';
import {UNITS,UNIT_TEMPLATES} from '../dist/data.js';
import {sourceOnHit,sourceAuraEffects,tickSourceScriptJobs,sourceMoveFactor} from '../dist/skills.js';

const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);
function fixture(code='h0QV'){
  const game=new Game({mode:'sandbox',seed:83});game.state.phase='combat';game.state.time=0;game.state.entities=[];game.state.sourceSkillJobs=[];
  for(const p of game.state.players){p.buildings=[];p.nagaFarmerGoldRate=0;}
  const player=game.state.players[0],def=UNITS.find(u=>u.sourceRawcode===code),building={id:'troll-building',unitId:def.id,col:2,row:1};player.buildings.push(building);
  game._recordLimitOrigins(building,def);game._recordSourceCompletion(player,def);game._recordEggCompletion(player,def,building);game._spawnDefender(def,player,3,6,building.id);
  const caster=game.state.entities[0];caster.mana=100;caster.attackCd=caster.abilityCd=1e9;
  return {game,caster,building,def};
}
function enemy(game,caster,{code='h002',x=.5,hp=100000,maxHp=100000,...extra}={}){
  const e=game._entity(UNIT_TEMPLATES[code],{ownerId:null,team:1,side:'monster',battleTeam:0,laneId:0,sourceLaneId:0,worldX:caster.worldX+x,worldY:caster.worldY,...extra});
  e.skillSpecs=[];e.hp=hp;e.maxHp=maxHp;e.mana=0;e.attackCd=e.abilityCd=1e9;game.state.entities.push(e);return e;
}
const cast=(g,e,t)=>g.command('cast',{entityId:e.id,skillId:'A15C',targetId:t.id});
const hit=(g,e,t)=>sourceOnHit(g,e,t,[],1);
const tick=(g,at)=>{g.state.time=at;tickSourceScriptJobs(g);};
const haste=(g,e)=>sourceAuraEffects(g,e,[]).haste;

test('both deployed Troll variants persist attack and haste exactly once through JSON, normal spawn and arena spawn',()=>{
  for(const code of ['h0QV','h0WQ']){
    const {game,caster,building,def}=fixture(code),target=enemy(game,caster,{hp:100,maxHp:1000});game._random=()=>0;
    assert.equal(cast(game,caster,target).ok,true);tick(game,1);near(caster.damage,def.damage+10);assert.equal(building.abilityLevels.A15D,2);
    const rash=enemy(game,caster,{hp:10,maxHp:1000});hit(game,caster,rash);tick(game,1);near(haste(game,caster),.01);assert.equal(building.abilityLevels.A15F,1);assert.equal(building.damage,undefined);
    const restored=Game.fromSnapshot(JSON.parse(JSON.stringify(game.snapshot()))),saved=restored.state.entities.find(e=>e.id===caster.id);
    near(saved.damage,def.damage+10);near(haste(restored,saved),.01);
    restored._startCombat();let next=restored.state.entities.find(e=>e.buildingId===building.id);near(next.damage,def.damage+10);near(haste(restored,next),.01);assert.equal(next.abilityLevels.A15D,2);
    restored._startArena();next=restored.state.entities.find(e=>e.buildingId===building.id);near(next.damage,def.damage+10);near(haste(restored,next),.01);assert.equal(next.abilityLevels.A15F,1);
  }
});

test('real rash kills reach source haste level 71 and remove rather than invent the missing native stat values',()=>{
  const {game,caster,building}=fixture();caster.mana=0;game._random=()=>0;
  for(let level=1;level<=71;level++){
    game.state.time=level;const target=enemy(game,caster,{hp:1,maxHp:1000});hit(game,caster,target);tick(game,level);game._clearDead();
    assert.equal(building.abilityLevels.A15F,level);if(level===70)near(haste(game,caster),.699999988079071);
  }
  near(haste(game,caster),0);const restored=Game.fromSnapshot(game.snapshot());restored._startArena();const next=restored.state.entities.find(e=>e.buildingId===building.id);assert.equal(next.abilityLevels.A15F,71);near(haste(restored,next),0);
});

test('A15G protects independent scripted events under the main depth guard and expires at its first five-second deadline',()=>{
  const {game,caster}=fixture(),attacker=enemy(game,caster);caster.mana=0;game._sourceDamageTriggerDepth=1;
  game._hurt(caster,caster.hp+1,attacker,{spell:true,universal:true,scripted:true});near(caster.hp,1);assert.equal(caster.status.trollTazExpiresAt,5);
  game.state.time=4;game._hurt(caster,2,attacker,{spell:true,universal:true,scripted:true});near(caster.hp,1);assert.equal(caster.status.trollTazExpiresAt,5);
  game._sourceDamageTriggerDepth=0;tick(game,5);assert.equal(caster.status.trollTazEnabled,false);game._hurt(caster,2,attacker,{spell:true,universal:true});assert.ok(caster.status.deathCounted);
});

test('A15G exact lethal damage still kills while the sub-one native negative request adds no invented healing',()=>{
  const equal=fixture(),a=enemy(equal.game,equal.caster);equal.caster.mana=0;equal.game._hurt(equal.caster,equal.caster.hp,a,{spell:true,universal:true});assert.ok(equal.caster.status.deathCounted);assert.equal(equal.caster.status.trollTazExpiresAt,undefined);
  const fractional=fixture(),b=enemy(fractional.game,fractional.caster);fractional.caster.mana=0;fractional.caster.hp=.5;
  const actual=fractional.game._hurt(fractional.caster,1,b,{spell:true,universal:true});near(actual,0);near(fractional.caster.hp,.5);assert.equal(fractional.caster.status.trollTazExpiresAt,5);
});

test('a real on-hit rash keeps its dead caster handle and awards building haste after corpse cleanup and saving',()=>{
  const {game,caster,building}=fixture(),target=enemy(game,caster,{x:2,hp:20,maxHp:1000}),killer=enemy(game,caster,{x:20});caster.mana=0;game._random=()=>0;
  hit(game,caster,target);tick(game,0);near(target.hp,5);
  game._hurt(caster,caster.hp,killer,{spell:true,universal:true});assert.ok(caster.status.deathCounted);game._clearDead();assert.ok(!game.state.entities.some(e=>e.id===caster.id));
  assert.equal(game.state.sourceSkillJobs.filter(j=>j.type==='troll_super_axe').length,0,'the bound target is outside the source death-axe radius');
  const restored=Game.fromSnapshot(JSON.parse(JSON.stringify(game.snapshot())));tick(game,.5);tick(restored,.5);
  assert.equal(building.abilityLevels.A15F,1);assert.equal(restored.state.players[0].buildings[0].abilityLevels.A15F,1);assert.equal(game.state.sourceSkillJobs.filter(j=>j.type==='troll_rash').length,0);
  assert.equal(restored.state.sourceSkillJobs.filter(j=>j.type==='troll_rash').length,0);
});

test('native physical ensnare grounds an immune air unit for three seconds, stops movement and restores air targeting',()=>{
  const {game,caster}=fixture(),target=enemy(game,caster,{code:'h0OU',x:1,hp:100000,maxHp:1000});caster.mana=0;game._random=()=>0;
  target.skillSpecs=[{id:'Amim',kind:'immunity',status:'implemented'}];assert.equal(target.targetType,'air');
  hit(game,caster,target);assert.equal(target.targetType,'ground');near(target.status.rootUntil,3);near(target.status.ensnareGroundedUntil,3);near(sourceMoveFactor(game,target,[]),0);
  tick(game,0);near(target.hp,99985,'physical net and universal rash are not discarded by magic immunity');
  tick(game,2.999);assert.equal(target.targetType,'ground');tick(game,3);assert.equal(target.targetType,'air');assert.equal(target.status.ensnareOriginalTargetType,undefined);assert.ok(sourceMoveFactor(game,target,[])>0);
});

test('real active axe, rash and TazDingo jobs continue equivalently after JSON restoration',()=>{
  const {game,caster}=fixture(),primary=enemy(game,caster,{x:1.2,hp:50000,maxHp:50000}),rash=enemy(game,caster,{x:.8,hp:10000,maxHp:10000});game._random=()=>0;
  assert.equal(cast(game,caster,primary).ok,true);hit(game,caster,rash);delete game._random;game._hurt(caster,caster.hp+1,primary,{spell:true,universal:true});tick(game,.2);
  const restored=Game.fromSnapshot(JSON.parse(JSON.stringify(game.snapshot()))),view=g=>JSON.parse(JSON.stringify({entities:g.state.entities,jobs:g.state.sourceSkillJobs,players:g.state.players,events:g.state.events,logs:g.state.logs,id:g._id,rng:g._rng}));
  assert.ok(['troll_super_axe','troll_rash','troll_taz_end'].every(type=>game.state.sourceSkillJobs.some(j=>j.type===type)));
  for(const at of [.5,1,2,4.9,5,6,6.5]){tick(game,at);tick(restored,at);assert.deepEqual(view(restored),view(game),`${at}s continuation`);}
});
