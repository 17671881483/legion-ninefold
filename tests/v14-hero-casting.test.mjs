import test from 'node:test';
import assert from 'node:assert/strict';
import {Game} from '../dist/engine.js';
import {UNIT_TEMPLATES} from '../dist/data.js';
import {laneToWorld} from '../dist/layout.js';
import {tickSourceScriptJobs} from '../dist/skills.js';

const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);
const origin=laneToWorld(0,3,6);
function fixture(){
  const game=new Game({mode:'sandbox',seed:83});
  game.state.phase='combat';game.state.time=0;game.state.entities=[];game.state.sourceSkillJobs=[];
  for(const p of game.state.players){p.buildings=[];p.nagaFarmerGoldRate=0;}
  return game;
}
function add(game,code,options={}){
  const {skills,...extra}=options;
  const e=game._entity(UNIT_TEMPLATES[code],{ownerId:0,team:0,side:'defender',battleTeam:0,laneId:0,sourceLaneId:0,worldX:origin.x,worldY:origin.y,...extra});
  if(skills)e.skillSpecs=e.skillSpecs.filter(s=>skills.includes(s.id));
  e.mana=e.maxMana=100;e.attackCd=1e9;e.abilityCd=1e9;
  game.state.entities.push(e);return e;
}
const enemy=(g,extra={})=>{const e=add(g,'h002',{ownerId:null,team:1,side:'monster',worldX:origin.x+1,...extra});e.hp=e.maxHp=100000;e.mana=0;return e;};
const cast=(game,e,id,params={})=>game.command('cast',{entityId:e.id,skillId:id,...params});
const status=(game,e,id,playerId=0)=>game.unitSkillStatus(e.id,playerId).find(s=>s.id===id);
const tick=(game,time)=>{game.state.time=time;tickSourceScriptJobs(game);};

test('Game casting status and commands enforce ownership, battle phase, pause, death and unknown abilities',()=>{
  const game=fixture(),human=add(game,'h0YN',{skills:['A2YD']}),target=enemy(game),before=human.mana;
  assert.equal(status(game,human,'A2YD').canStart,true);
  human.ownerId=4;assert.equal(status(game,human,'A2YD').canStart,false);assert.match(status(game,human,'A2YD').reason,/自己/);
  assert.equal(cast(game,human,'A2YD',{targetId:target.id}).ok,false);near(human.mana,before);
  human.ownerId=0;game.state.phase='build';assert.equal(cast(game,human,'A2YD',{targetId:target.id}).ok,false);near(human.mana,before);
  game.state.phase='combat';game.state.paused=true;assert.equal(status(game,human,'A2YD').canStart,false);
  assert.equal(cast(game,human,'A2YD',{targetId:target.id}).ok,false);near(human.mana,before);
  game.state.paused=false;human.hp=0;assert.equal(cast(game,human,'A2YD',{targetId:target.id}).ok,false);near(human.mana,before);
  human.hp=human.maxHp;assert.equal(cast(game,human,'A2YG',{targetId:target.id}).ok,false);
  assert.equal(game.command('cast',{entityId:'missing',skillId:'A2YD',targetId:target.id}).ok,false);
  assert.equal(game.state.sourceSkillJobs.length,0);near(human.mana,before);
});

test('manual target, point and range failures debit no mana or cooldown; a valid command debits exactly once',()=>{
  const game=fixture(),human=add(game,'h0YN',{skills:['A2YA','A2YD']}),target=enemy(game),ally=add(game,'h002'),before=human.mana;
  const invalid=[{targetId:'missing'},{targetId:ally.id}];
  for(const params of invalid){assert.equal(cast(game,human,'A2YD',params).ok,false);near(human.mana,before);}
  target.invulnerable=true;assert.equal(cast(game,human,'A2YD',{targetId:target.id}).ok,false);target.invulnerable=false;
  target.battleTeam=1;assert.equal(cast(game,human,'A2YD',{targetId:target.id}).ok,false);target.battleTeam=0;
  target.worldX=origin.x+100;assert.equal(cast(game,human,'A2YD',{targetId:target.id}).ok,false);
  assert.equal(cast(game,human,'A2YA',{worldX:origin.x+2.001,worldY:origin.y}).ok,false);
  assert.equal(cast(game,human,'A2YA',{worldX:NaN,worldY:origin.y}).ok,false);
  near(human.mana,before);assert.equal(human.skillStates.A2YA.readyAt,0);assert.equal(human.skillStates.A2YD.readyAt,0);
  human.mana=9;assert.equal(status(game,human,'A2YD').canStart,false);assert.equal(cast(game,human,'A2YD',{targetId:target.id}).ok,false);near(human.mana,9);
  human.mana=before;
  target.worldX=origin.x+1;assert.equal(cast(game,human,'A2YD',{targetId:target.id}).ok,true);
  near(human.mana,before-10);assert.equal(human.skillStates.A2YD.casts,1);assert.equal(human.skillStates.A2YD.readyAt,16);
  assert.equal(cast(game,human,'A2YD',{targetId:target.id}).ok,false);near(human.mana,before-10);
});

test('the public API keeps Ysera native manual and damage-triggered automatic cooldowns independent',()=>{
  const game=fixture(),human=add(game,'h0YN',{skills:['A2YD']}),target=enemy(game);
  assert.equal(cast(game,human,'A2YD',{targetId:target.id}).ok,true);
  assert.equal(status(game,human,'A2YD').remaining,16);assert.equal(status(game,human,'A2YD').autoRemaining,0);
  game.state.time=3.2;game._hurt(human,1,target,{spell:true,universal:true});
  near(human.mana,80);near(human.skillStates.A2YD.yseraAutoReadyAt,19.2);near(human.skillStates.A2YD.readyAt,16);
  game.state.time=16;assert.equal(status(game,human,'A2YD').canStart,true);
  assert.equal(cast(game,human,'A2YD',{targetId:target.id}).ok,true);near(human.mana,70);
  near(status(game,human,'A2YD').remaining,16);near(status(game,human,'A2YD').autoRemaining,3.2);
});

test('the public API keeps alchemist manual and damage-triggered cooldowns independent',()=>{
  const game=fixture(),alchemist=add(game,'h0XH',{skills:['A2Z0']}),target=enemy(game);alchemist.hp=alchemist.maxHp*.8;
  assert.equal(cast(game,alchemist,'A2Z0').ok,true);near(alchemist.mana,92);
  assert.equal(status(game,alchemist,'A2Z0').remaining,8);assert.equal(status(game,alchemist,'A2Z0').autoRemaining,0);
  game._hurt(alchemist,1,target,{spell:true,universal:true});
  near(alchemist.mana,84);assert.equal(alchemist.skillStates.A2Z0.casts,2);assert.equal(status(game,alchemist,'A2Z0').autoRemaining,8);
  assert.equal(game.state.sourceSkillJobs.filter(job=>job.type==='alchemist_mist').length,2);
  assert.equal(cast(game,alchemist,'A2Z0').ok,false);near(alchemist.mana,84);
  game.state.time=8;assert.equal(cast(game,alchemist,'A2Z0').ok,true);near(alchemist.mana,76);
});

test('nonlethal damage prioritizes Ysera awakening using the pre-damage HP ratio, hides its parent from physical sets and returns after sixteen seconds',()=>{
  const game=fixture(),human=add(game,'h0YN'),target=enemy(game,{worldX:origin.x+.5});
  human.skillSpecs=human.skillSpecs.filter(s=>s.kind!=='ysera_revival');human.hp=human.maxHp*.5;human.mana=20;
  game._hurt(human,100,target,{spell:true,universal:true});
  const dragon=game.state.entities.find(e=>e.combatRawcode==='h0YO');assert.ok(dragon);near(dragon.hp/dragon.maxHp,.5);
  assert.equal(human.skillStates.A2YC.casts,1);assert.equal(human.skillStates.A2YD.casts,0);assert.equal(human.skillStates.A2YB.casts,0);
  assert.equal(human.status.yseraHidden,true);assert.equal(human.status.yseraPaused,true);assert.equal(human.invulnerable,true);
  game._updateEntities(0);
  assert.ok(!game._worldEntities.has(human.id));assert.ok(game._worldEntities.has(dragon.id));
  assert.ok(!game._spatial.some(grid=>[...grid.values()].flat().some(e=>e.id===human.id)));
  dragon.hp=dragon.maxHp*.25;dragon.worldX=origin.x+2;dragon.worldY=origin.y+1;dragon.facing=75;
  tick(game,15.999);assert.equal(human.status.yseraHidden,true);
  tick(game,16);near(human.hp/human.maxHp,.25);near(human.worldX,origin.x+2);near(human.worldY,origin.y+1);near(human.facing,75);
  assert.equal(human.status.yseraHidden,false);assert.equal(human.status.yseraPaused,false);assert.equal(human.invulnerable,false);
  assert.ok(!game.state.entities.some(e=>e.id===dragon.id));assert.equal(game.state.sourceSkillJobs.filter(job=>job.type==='ysera_dragon_return').length,0);
  // Whether toggling native invulnerability cancels the already-running lethal
  // damage event is an unresolved host boundary; this test does not invent it.
});

test('snapshots with active alchemist and Ysera timers resume with equivalent damage, healing, jobs and form return',()=>{
  const game=fixture(),human=add(game,'h0YN',{skills:['A2YC']}),alchemist=add(game,'h0XH',{skills:['A2Z0','A2Z1']});
  human.hp=human.maxHp*.5;alchemist.hp=alchemist.maxHp*.7;
  enemy(game,{worldX:origin.x+.6});enemy(game,{worldX:origin.x+1.2,worldY:origin.y+.2});
  assert.equal(cast(game,human,'A2YC').ok,true);
  const dragon=game.state.entities.find(e=>e.combatRawcode==='h0YO');dragon.mana=30;
  assert.equal(cast(game,dragon,'A2YF').ok,true);
  assert.equal(cast(game,alchemist,'A2Z0').ok,true);assert.equal(cast(game,alchemist,'A2Z1').ok,true);
  tick(game,.5);
  const types=game.state.sourceSkillJobs.map(job=>job.type);assert.ok(types.includes('ysera_dragon_return'));assert.ok(types.includes('ysera_green_breath'));assert.ok(types.includes('alchemist_mist'));assert.ok(types.includes('alchemist_acid_target'));
  const restored=Game.fromSnapshot(game.snapshot());
  const result=g=>JSON.parse(JSON.stringify({entities:g.state.entities,jobs:g.state.sourceSkillJobs,events:g.state.events,logs:g.state.logs,players:g.state.players.map(p=>({gold:p.gold,wood:p.wood,stats:p.stats})),rng:g._rng,id:g._id}));
  for(const time of [1,2,4,5.2,8,12,16,17]){
    tick(game,time);tick(restored,time);assert.deepEqual(result(restored),result(game),`equivalent continuation at ${time}s`);
  }
  assert.equal(game.state.entities.find(e=>e.id===human.id).status.yseraHidden,false);
});
