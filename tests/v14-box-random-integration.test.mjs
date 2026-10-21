import test from 'node:test';
import assert from 'node:assert/strict';
import {Game} from '../dist/engine.js';
import {UNITS} from '../dist/data.js';
import {laneToWorld} from '../dist/layout.js';
import {BOX_RANDOM_FIGHTER_RULES} from '../dist/box-training-rules.js';

const unit=raw=>UNITS.find(u=>!u.legacy&&u.sourceRawcode===raw),clone=x=>JSON.parse(JSON.stringify(x));
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`),ok=r=>assert.equal(r.ok,true,r.message??r.reason);
function fixture(mode='sandbox'){
  const g=new Game({seed:713,mode});g._aiAct=()=>{};g._aiTimer=-1e6;
  for(const p of g.state.players){p.buildings=[];p.heroId=null;p.heroAltarCount=0;p.heroAltarUsed=false;p.roster=[];p.gold=p.wood=0;p.populationCap=0;p.popUsed=p.workers;}
  return g;
}
function gift(g,id='A132',playerId=0){
  const p=g.state.players[playerId];p.boxRewards={providerId:`box-n060-${playerId}`,providerRawcode:'n060',ownerId:playerId,tier:id==='A132'?'box':'box2',sourceWave:id==='A132'?6:13,
    abilityIds:[id,id==='A132'?'A133':'A13O',id==='A132'?'A134':'A13P'],consumed:false};return p.boxRewards;
}
function point(playerId=0,x=2.75,y=7.125){const p=laneToWorld(playerId,x,y);return {worldX:p.x,worldY:p.y};}
const claim=(g,id='A132',where=point(),playerId=0)=>g.command('boxReward',{abilityId:id,...where,playerId});
function choose(g,id,raw){const rule=BOX_RANDOM_FIGHTER_RULES.byAbility[id],index=rule.rawcodes.indexOf(raw);assert.ok(index>=0,raw);let calls=0;g._random=()=>{calls++;return(index+.5)/rule.count;};return()=>calls;}
const assets=g=>clone(g.state.players.map(p=>({gold:p.gold,wood:p.wood,buildings:p.buildings,boxRewards:p.boxRewards,completedSourceUnits:p.completedSourceUnits,eggHistory:p.eggHistory})));
function consumed(p,id){assert.equal(p.boxRewards.consumed,true);assert.deepEqual(p.boxRewards.abilityIds,[]);assert.equal(p.boxRewards.selectedAbilityId,id);}

test('all 35 literal source choices are created by the real command at zero cost with no population or roster gate',()=>{
  for(const id of ['A132','A13N'])for(const raw of BOX_RANDOM_FIGHTER_RULES.byAbility[id].rawcodes){
    const g=fixture(),p=g.state.players[0],where=point();gift(g,id);const draws=choose(g,id,raw),offer=g.boxRewardStatus().offers.find(o=>o.id===id);
    assert.equal(offer.targetKind,'point');assert.equal(offer.canStart,true);ok(claim(g,id,where));assert.equal(draws(),1,raw);assert.equal(p.buildings.length,1,raw);
    const b=p.buildings[0];assert.equal(b.unitId,unit(raw).id);assert.equal(b.userData,0);assert.equal(b.builtWave,null);assert.equal(b.construction??null,null);assert.equal(b.spent,0);assert.equal(b.totalSpent,0);assert.equal(b.facing,270);
    near(b.col,2.25);near(b.row,2.625);assert.equal(p.gold,0);assert.equal(p.wood,0);assert.ok(p.popUsed>p.populationCap);consumed(p,id);
    assert.equal(p.completedSourceUnits[raw],true);assert.equal(p.eggHistory.rawCompleted[raw],true);assert.equal(p.eggHistory.events[`${b.id}:${raw}`],true);
  }
});

test('outside, foreign-lane, corridor and invalid points leave every choice intact without drawing',()=>{
  const g=fixture(),p=g.state.players[0];gift(g);const draws=choose(g,'A132','h014');
  const invalid=[point(0,2,3.999),point(0,2,12.001),point(1,2,7),point(2,2,7),{worldX:13,worldY:37.5},{worldX:NaN,worldY:5},{worldX:5,worldY:Infinity},{},point(0,-.01,7),point(0,6.01,7)];
  for(const where of invalid){const before=assets(g);assert.equal(claim(g,'A132',where).ok,false);assert.deepEqual(assets(g),before);assert.equal(draws(),0);}
  assert.equal(p.boxRewards.consumed,false);
});

test('a simulated native creation failure advances RNG once, preserves the reward, and a later valid attempt can succeed',()=>{
  const g=fixture(),p=g.state.players[0];gift(g);const where=point(),before=assets(g),rng=g._rng,create=g._createBoxFighter;
  let calls=0;const random=g._random.bind(g);g._random=()=>{calls++;return random();};g._createBoxFighter=()=>({ok:false,reason:'native CreateUnit returned null'});
  assert.equal(claim(g,'A132',where).ok,false);assert.equal(calls,1);assert.notEqual(g._rng,rng);assert.deepEqual(assets(g),before);
  g._createBoxFighter=create;ok(claim(g,'A132',where));assert.equal(calls,2);assert.equal(p.buildings.length,1);consumed(p,'A132');
});

test('fractional positions and an occupied point can receive repeated gifts while ordinary building refuses the same constraints',()=>{
  const g=fixture(),p=g.state.players[0],where=point(0,2.375,6.8125);p.roster=[unit('h014').id];gift(g);choose(g,'A132','h014');
  assert.equal(g.command('build',{unitId:unit('h014').id,col:1,row:2}).ok,false,'the normal command requires population/resources');
  ok(claim(g,'A132',where));gift(g);ok(claim(g,'A132',where));
  assert.equal(p.buildings.length,2);assert.notEqual(p.buildings[0].id,p.buildings[1].id);near(p.buildings[0].col,1.875);near(p.buildings[0].row,2.3125);near(p.buildings[1].col,p.buildings[0].col);near(p.buildings[1].row,p.buildings[0].row);
  assert.equal(p.gold,0);assert.equal(p.wood,0);assert.ok(p.popUsed>p.populationCap);
});

test('native quantity registration does not turn ordinary trap and shrine limits into a pre-creation gift gate',()=>{
  for(const [id,raw,limit]of [['A132','n04F',3],['A13N','n05C',2]]){
    const g=fixture(),p=g.state.players[0];choose(g,id,raw);
    for(let i=0;i<limit+1;i++){gift(g,id);ok(claim(g,id));}
    assert.equal(p.buildings.length,limit+1);assert.ok(p.buildings.every(b=>b.unitId===unit(raw).id));
    const status=g.buildLimitStatus(unit(raw).id);assert.equal(status.canStart,false);assert.equal(status.current,limit+1);
    if(status.scope==='lineage')assert.ok(p.buildings.every(b=>b.limitOrigins?.includes(raw)));
    p.roster=[unit(raw).id];p.gold=p.wood=100000;p.populationCap=300;assert.equal(g.command('build',{unitId:unit(raw).id,col:0,row:0}).ok,false);
  }
});

test('a gift can be cast during combat without building a body retroactively or requiring the normal build phase',()=>{
  const g=fixture(),p=g.state.players[0];g._startCombat();gift(g);choose(g,'A132','h014');
  const entities=g.state.entities.length;assert.equal(g.command('build',{unitId:unit('h014').id,col:0,row:0}).ok,false);ok(claim(g));
  const b=p.buildings[0];assert.equal(g.state.entities.length,entities);assert.ok(!g.state.entities.some(e=>e.buildingId===b.id));g._startArena();assert.ok(g.state.entities.some(e=>e.buildingId===b.id));
});

test('both tiers stay consumed across JSON restore and their units deploy in normal and arena battles with the owner route',()=>{
  for(const [id,raw,owner]of [['A132','h014',2],['A13N','h01A',5]]){
    const g=fixture('normal'),p=g.state.players[owner];gift(g,id,owner);choose(g,id,raw);const where=point(owner,3.125,8.75);ok(claim(g,id,where,owner));const b=clone(p.buildings[0]);
    assert.equal(b.userData,0);assert.equal(g.boxRewardStatus(owner),null);g._startCombat();
    const normal=g.state.entities.find(e=>e.buildingId===b.id);assert.ok(normal);assert.equal(normal.ownerId,owner);assert.equal(normal.laneId,owner);assert.equal(normal.sourceLaneId,owner);assert.equal(normal.side,'defender');assert.equal(normal.combatRawcode,unit(raw).combatRawcode);
    const saved=clone(g.snapshot()),restored=Game.fromSnapshot(saved),restoredOwner=restored.state.players[owner];assert.equal(restoredOwner.buildings.find(x=>x.id===b.id).userData,0);consumed(restoredOwner,id);assert.equal(restored.boxRewardStatus(owner),null);
    const before=assets(restored);assert.equal(claim(restored,id,where,owner).ok,false);assert.deepEqual(assets(restored),before);
    restored._startArena();const arena=restored.state.entities.find(e=>e.buildingId===b.id);assert.ok(arena);assert.equal(arena.ownerId,owner);assert.equal(arena.sourceLaneId,owner);assert.equal(arena.laneId,0);assert.equal(arena.isArena,true);assert.equal(arena.side,`arena${p.team}`);assert.equal(arena.combatRawcode,unit(raw).combatRawcode);
    assert.equal(restoredOwner.completedSourceUnits[raw],true);assert.equal(restoredOwner.eggHistory.rawCompleted[raw],true);
  }
});

test('the whole active pool is consumed only once and an ended match cannot place a gift or draw',()=>{
  const g=fixture(),p=g.state.players[0];gift(g,'A13N');const draws=choose(g,'A13N','h01A');ok(claim(g,'A13N'));assert.equal(draws(),1);const before=assets(g);
  for(const id of ['A13N','A13O','A13P'])assert.equal(claim(g,id).ok,false);assert.deepEqual(assets(g),before);assert.equal(draws(),1);
  gift(g,'A13N');g.state.phase='ended';const ended=assets(g);assert.equal(claim(g,'A13N').ok,false);assert.deepEqual(assets(g),ended);assert.equal(draws(),1);assert.equal(p.boxRewards.consumed,false);
});
