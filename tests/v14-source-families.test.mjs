import test from 'node:test';
import assert from 'node:assert/strict';
import {Game} from '../dist/engine.js';
import {UNITS,UNIT_TEMPLATES} from '../dist/data.js';
import {laneToWorld} from '../dist/layout.js';
import {tickSourceSkills,tickSourceScriptJobs} from '../dist/skills.js';

const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);
const origin=laneToWorld(0,3,6);
const buildingDef=code=>UNITS.find(u=>u.combatRawcode===code);
function fixture(){
  const game=new Game({mode:'sandbox',seed:195});
  game.state.phase='combat';game.state.time=0;game.state.entities=[];game.state.sourceSkillJobs=[];
  for(const p of game.state.players){p.buildings=[];p.nagaFarmerGoldRate=0;}
  return game;
}
function add(game,code,options={}){
  const {skills,...extra}=options;
  const e=game._entity(UNIT_TEMPLATES[code],{ownerId:0,team:0,side:'defender',battleTeam:0,laneId:0,sourceLaneId:0,worldX:origin.x,worldY:origin.y,...extra});
  if(skills)e.skillSpecs=e.skillSpecs.filter(s=>skills.includes(s.id));
  e.mana=e.maxMana=100;e.attackCd=e.abilityCd=1e9;
  game.state.entities.push(e);game._ensureWorld(e);return e;
}
const enemy=(game,extra={})=>{const e=add(game,'h002',{skills:[],ownerId:null,team:1,side:'monster',worldX:origin.x+1,...extra});e.hp=e.maxHp=100000;e.mana=0;return e;};
const cast=(game,e,id,params={})=>game.command('cast',{entityId:e.id,skillId:id,...params});
const status=(game,e,id)=>game.unitSkillStatus(e.id).find(s=>s.id===id);
const tick=(game,time)=>{game.state.time=time;tickSourceScriptJobs(game);};
const processUnit=(game,e)=>tickSourceSkills(game,e,game.state.entities,0);
function persistentBody(game,code,id){
  const p=game.state.players[0],def=buildingDef(code),b={id,unitId:def.id,col:2,row:1,spent:0,totalSpent:0};
  p.buildings.push(b);game._spawnDefender(def,p,2.5,5.5,b.id);
  return {e:game.state.entities.at(-1),b,def};
}

test('public casts and damage auto orders share one native cooldown and debit only one cost per family',()=>{
  for(const {code,id,cost,cooldown,params} of [
    {code:'h0SN',id:'A1A2',cost:15,cooldown:13,params:t=>({worldX:t.worldX,worldY:t.worldY})},
    {code:'h0UG',id:'A1CT',cost:10,cooldown:14,params:()=>({})},
    {code:'h0SY',id:'A1BA',cost:8,cooldown:18,params:t=>({targetId:t.id})},
  ]){
    const game=fixture(),e=add(game,code,{skills:[id]}),target=enemy(game);
    assert.equal(status(game,e,id).cooldownMode,'shared_native');
    assert.equal(cast(game,e,id,params(target)).ok,true,id);near(e.mana,100-cost);
    game._hurt(e,1,target,{spell:true,universal:true});
    assert.equal(e.skillStates[id].casts,1,id);near(e.mana,100-cost);
    near(status(game,e,id).remaining,cooldown);near(status(game,e,id).autoRemaining,cooldown);
    game.state.time=cooldown;
    game._hurt(e,1,target,{spell:true,universal:true});
    assert.equal(e.skillStates[id].casts,2,id);near(e.mana,100-2*cost);
    assert.equal(cast(game,e,id,params(target)).ok,false,id);near(e.mana,100-2*cost);
  }
});

test('lethal strike attack levels persist exactly once through snapshots, normal deployment and arena deployment',()=>{
  const game=fixture(),{e,b,def}=persistentBody(game,'h0SN','garrosh-building');
  e.skillSpecs=e.skillSpecs.filter(s=>s.id==='A1A1');
  for(let n=0;n<3;n++){const t=enemy(game,{worldX:e.worldX+.3,worldY:e.worldY});t.hp=1;game._hurt(t,1,e,{spell:true,universal:true});}
  assert.equal(b.garroshAttackLevel,3);assert.equal(e.status.garroshAttackLevel,3);near(e.damage,def.damage+3);
  const restored=Game.fromSnapshot(game.snapshot()),savedBody=restored.state.entities.find(t=>t.id===e.id);
  near(savedBody.damage,def.damage+3);assert.equal(savedBody.status.garroshAttackLevel,3);
  restored._startCombat();
  let fresh=restored.state.entities.find(t=>t.buildingId===b.id);near(fresh.damage,def.damage+3);assert.equal(fresh.status.garroshAttackLevel,3);
  restored._startArena();
  fresh=restored.state.entities.find(t=>t.buildingId===b.id);near(fresh.damage,def.damage+3);assert.equal(fresh.status.garroshAttackLevel,3);
});

test('Illidan soul levels remain on the building and restore exactly once in both deployment paths',()=>{
  const game=fixture(),{e,b,def}=persistentBody(game,'h0SY','illidan-building');
  e.skillSpecs=e.skillSpecs.filter(s=>s.id==='A1B6');game._random=()=>0;
  for(let n=0;n<3;n++){const t=enemy(game,{worldX:e.worldX+.3,worldY:e.worldY});t.hp=1;game._hurt(t,1,e,{spell:true,universal:true});}
  assert.equal(b.illidanSoulLevel,3);assert.equal(e.abilityLevels.A1BD,3);near(e.damage,def.damage+3);
  const restored=Game.fromSnapshot(game.snapshot()),savedBody=restored.state.entities.find(t=>t.id===e.id);
  near(savedBody.damage,def.damage+3);assert.equal(savedBody.abilityLevels.A1BD,3);
  restored._startCombat();let fresh=restored.state.entities.find(t=>t.buildingId===b.id);
  near(fresh.damage,def.damage+3);assert.equal(fresh.abilityLevels.A1BD,3);
  restored._startArena();fresh=restored.state.entities.find(t=>t.buildingId===b.id);
  near(fresh.damage,def.damage+3);assert.equal(fresh.abilityLevels.A1BD,3);
});

test('Naga charge proximity makes one native order, shares manual cooldown and executes its death finish only once',()=>{
  const game=fixture(),e=add(game,'h0UF',{skills:['A1CS']}),target=enemy(game,{worldX:origin.x+1.5}),nearby=enemy(game,{worldX:origin.x+1.6});
  processUnit(game,e);processUnit(game,e);
  assert.equal(e.skillStates.A1CS.casts,1);assert.equal(e.status.nagaChargeProximityUsed,true);
  assert.equal(game.state.sourceSkillJobs.filter(j=>j.type==='naga_active_charge').length,1);
  assert.equal(cast(game,e,'A1CS',{targetId:target.id}).ok,false);near(e.mana,100);
  const before=nearby.hp;game._hurt(target,target.hp,e,{spell:true,universal:true});
  near(nearby.hp,before-77);assert.equal(game.state.sourceSkillJobs.find(j=>j.type==='naga_active_charge').completed,true);
  tick(game,.5);near(nearby.hp,before-77);assert.equal(game.state.sourceSkillJobs.filter(j=>j.type==='naga_active_charge').length,0);
  game.state.time=1;assert.equal(cast(game,e,'A1CS',{targetId:nearby.id}).ok,true);assert.equal(e.skillStates.A1CS.casts,2);
  processUnit(game,e);assert.equal(e.skillStates.A1CS.casts,2,'the proximity registration remains spent after manual cast');
});

test('independent clan damage listeners retain native nested procs outside the main damage trigger guard',()=>{
  const game=fixture(),a=add(game,'h0SN',{skills:['A1A4']}),b=add(game,'h0SN',{skills:['A1A4'],ownerId:null,team:1,side:'monster',worldX:origin.x+.5});
  const rolls=[0,0,0,.9];let draws=0;game._random=()=>{draws++;assert.ok(rolls.length,'no unexpected random draw');return rolls.shift();};
  const beforeA=a.hp,beforeB=b.hp;
  game._hurt(a,1,b,{spell:true,universal:true});
  const perHit=75*game._typeMultiplier('normal',a.armorType,a.sourceArmorTypeRaw??a.sourceRawFields.defType);
  near(a.hp,beforeA-1-perHit);near(b.hp,beforeB-2*perHit);assert.equal(draws,4);
  assert.equal(game.state.sourceSkillJobs.filter(j=>j.type==='garrosh_active_spin_finish').length,2);
  assert.equal(game._sourceDamageTriggerDepth,0);
});

test('a fresh save resumes active Garrosh, Illidan and Naga jobs with identical world state and callbacks',()=>{
  const game=fixture(),garrosh=add(game,'h0SN',{skills:['A1A2','A1A3']}),illidan=add(game,'h0SY',{skills:['A1BA'],worldY:origin.y+.2}),naga=add(game,'h0UF',{skills:['A1CS'],worldY:origin.y-.2});
  add(game,'h002',{skills:[],worldX:origin.x+.2});const target=enemy(game,{worldX:origin.x+1.4}),other=enemy(game,{worldX:origin.x+1.6,worldY:origin.y+.2});
  assert.equal(cast(game,garrosh,'A1A2',{worldX:target.worldX,worldY:target.worldY}).ok,true);
  assert.equal(cast(game,illidan,'A1BA',{targetId:target.id}).ok,true);
  assert.equal(cast(game,naga,'A1CS',{targetId:other.id}).ok,true);
  assert.equal(cast(game,garrosh,'A1A3',{targetId:target.id}).ok,true);
  tick(game,.2);const saved=game.snapshot(),restored=Game.fromSnapshot(saved);
  for(const type of ['garrosh_active_axe','garrosh_active_throw','illidan_flame','naga_active_charge'])assert.ok(saved.state.sourceSkillJobs.some(j=>j.type===type),type);
  const result=g=>JSON.parse(JSON.stringify({entities:g.state.entities,jobs:g.state.sourceSkillJobs,events:g.state.events,logs:g.state.logs,players:g.state.players,rng:g._rng,id:g._id}));
  assert.deepEqual(result(restored),result(game),'restoring does not refill consumed skills or reapply attack levels');
  for(const time of [.36,.4,.6,.63,.8,1,2,12,13]){tick(game,time);tick(restored,time);assert.deepEqual(result(restored),result(game),`${time}s continuation`);}
  assert.equal(game.state.sourceSkillJobs.length,0);
});
