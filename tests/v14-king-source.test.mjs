import test from 'node:test';
import assert from 'node:assert/strict';
import {Game} from '../dist/engine.js';
import {RULES,UNIT_TEMPLATES} from '../dist/data.js';
import {kingWorld} from '../dist/layout.js';
import {tickSourceScriptJobs} from '../dist/skills.js';

const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);
function fixture(wave=1){
  const game=new Game({mode:'sandbox',seed:183});game.state.phase='combat';game.state.wave=wave;game.state.time=0;game.state.entities=[];game.state.sourceSkillJobs=[];
  for(const p of game.state.players){p.buildings=[];p.nagaFarmerGoldRate=0;}
  game._nearby=e=>game.state.entities.filter(t=>t.battleTeam===e.battleTeam);game._canSegment=()=>true;
  game.state.kings[0].attackCd=-1;game.state.kings[1].attackCd=100;
  return game;
}
function atKing(game,code='h002',skills=[]){
  const point=kingWorld(0),e=game._entity(UNIT_TEMPLATES[code],{ownerId:null,team:1,side:'monster',battleTeam:0,laneId:8,sourceLaneId:0,worldX:point.x+.5,worldY:point.y});
  e.skillSpecs=e.skillSpecs.filter(s=>skills.includes(s.id));e.hp=e.maxHp=100000;e.mana=e.maxMana=100;
  game.state.entities.push(e);return e;
}

test('king initialization and older-save hydration retain real identity, position and king bounty role',()=>{
  const game=fixture();assert.ok(game.state.kings.every(k=>k.isKing===true));
  const saved=game.snapshot(),k=saved.state.kings[0];delete k.isKing;k.worldX+=.25;k.status.customMarker=3;
  const restored=Game.fromSnapshot(saved),actual=restored.state.kings[0];
  assert.equal(actual.isKing,true);assert.equal(actual.id,'king-0');assert.equal(actual.side,'defender');assert.equal(actual.battleTeam,0);assert.equal(actual.status.customMarker,3);
  near(actual.worldX,k.worldX);near(actual.worldY,k.worldY);near(actual.hp,k.hp);
});

test('a king attack supplies its real targetable handle to the damaged Garrosh auto-cast',()=>{
  const game=fixture(),king=game.state.kings[0],e=atKing(game,'h0SN',['A1A2']),kingHp=king.hp;
  game._updateKings(0);
  near(e.mana,85);assert.equal(e.skillStates.A1A2.casts,1);assert.equal(e.skillStates.A1A2.readyAt,13);
  const job=game.state.sourceSkillJobs.find(j=>j.type==='garrosh_active_axe');assert.ok(job);near(job.axes[0].angle,Math.PI);
  tickSourceScriptJobs(game);near(king.hp,kingHp-3*215);
  assert.equal(game._sourceDamageTriggerDepth,0);assert.equal(king.isKing,true);
});

test('the actual king attack keeps normal kill bounty in both treasuries without crediting a player',()=>{
  const game=fixture(),e=atKing(game),gold=game.state.players.map(p=>p.gold);e.hp=1;
  game._updateKings(0);
  assert.ok(e.status.deathCounted);assert.deepEqual(game.state.kingBountyPools,[RULES.waveKillGold[0],RULES.waveKillGold[0]]);
  assert.deepEqual(game.state.players.map(p=>p.gold),gold);assert.ok(game.state.players.every(p=>p.stats.kills===0));
});

test('an actual king flying-unit kill keeps its special own treasury and ordinary enemy treasury separate',()=>{
  const game=fixture(5),point=kingWorld(0),wood=game.state.players.map(p=>p.wood);
  game._spawnMonster({laneId:0,wave:UNIT_TEMPLATES.h0OU,specialKind:'waveFive',sourceWave:5,x:3,y:.3});
  const e=game.state.entities.at(-1);e.worldX=point.x+.5;e.worldY=point.y;e.hp=1;
  game._updateKings(0);
  assert.ok(e.status.deathCounted);assert.deepEqual(game.state.kingBountyPools,[80,RULES.waveKillGold[4]]);
  assert.deepEqual(game.state.specialMonsters.waveFive,{spawned:1,killed:1});assert.deepEqual(game.state.players.map(p=>p.wood),wood);
});
