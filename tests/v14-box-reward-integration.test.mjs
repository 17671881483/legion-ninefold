import test from 'node:test';
import assert from 'node:assert/strict';
import {Game} from '../dist/engine.js';
import {UNITS,UNIT_TEMPLATES,RULES} from '../dist/data.js';
import {BOX_REWARD_RULES} from '../dist/box-training-rules.js';
import {sourceAuraEffects} from '../dist/skills.js';

const unit=raw=>UNITS.find(u=>!u.legacy&&u.sourceRawcode===raw);
const clone=value=>JSON.parse(JSON.stringify(value));
const near=(actual,expected)=>assert.ok(Math.abs(actual-expected)<1e-7,`${actual} != ${expected}`);
const ok=result=>assert.equal(result.ok,true,result.message??result.reason);
function fixture(mode='sandbox'){
  const g=new Game({seed:145,mode});g._aiAct=()=>{};g._aiTimer=-1e6;
  for(const p of g.state.players){p.buildings=[];p.heroId=null;p.heroAltarCount=0;p.heroAltarUsed=false;p.gold=p.wood=100000;p.populationCap=300;p.popUsed=p.workers;}
  return g;
}
function complete(g,raw='h010',playerId=0){
  const p=g.state.players[playerId],def=unit(raw);assert.ok(def,raw);
  const n=p.buildings.length,b={id:g._uid('b'),unitId:def.id,col:n%6,row:Math.floor(n/6),construction:{targetId:def.id}};
  p.buildings.push(b);g._completeConstruction(p,b);assert.equal(b.construction,null);return b;
}
// Gift selection is the fixture input; all effects and consumption below go
// through the same public command used by the actual reward panel.
function gift(g,id,playerId=0){
  const p=g.state.players[playerId],tier=BOX_REWARD_RULES[id].tier,alternative=tier==='box'?'A133':'A13O';
  p.boxRewards={providerId:`box-n060-${playerId}`,providerRawcode:'n060',ownerId:playerId,tier,
    sourceWave:tier==='box'?6:13,consumed:false,abilityIds:[...new Set([id,alternative])]};
  return p.boxRewards;
}
const claim=(g,id,b,extra={})=>g.command('boxReward',{abilityId:id,buildingId:b?.id,...extra});
const assets=g=>clone(g.state.players.map(p=>({gold:p.gold,wood:p.wood,buildings:p.buildings,boxRewards:p.boxRewards,boxSwap:p.boxSwap,boxBuildFreeOnce:p.boxBuildFreeOnce,populationCap:p.populationCap,lumberLevel:p.lumberLevel,economyTasks:p.economyTasks})));
function rejectUnchanged(g,run){const before=assets(g);assert.equal(run().ok,false);assert.deepEqual(assets(g),before);}
function consumed(p,id){assert.equal(p.boxRewards.consumed,true);assert.equal(p.boxRewards.selectedAbilityId,id);assert.deepEqual(p.boxRewards.abilityIds,[]);}

test('both source tiers pay their exact resources once, consume all choices, and stay consumed after JSON restore',()=>{
  for(const [id,gold,wood] of [['A133',50,0],['A134',0,150],['A13O',300,0],['A13P',0,800]]){
    const g=fixture(),p=g.state.players[0];gift(g,id);const before={gold:p.gold,wood:p.wood};
    ok(claim(g,id));near(p.gold,before.gold+gold);near(p.wood,before.wood+wood);consumed(p,id);
    rejectUnchanged(g,()=>claim(g,id));
    const restored=Game.fromSnapshot(clone(g.snapshot()));assert.equal(restored.boxRewardStatus(),null);
    rejectUnchanged(restored,()=>claim(restored,id));
  }
});

test('free farm immediately raises population while retaining paid research and consumes nothing at the cap',()=>{
  const g=fixture(),p=g.state.players[0];p.populationCap=24;ok(g.command('farm'));
  const task=clone(p.economyTasks.farmTask),gold=p.gold,wood=p.wood;assert.ok(task);gift(g,'A131');
  ok(claim(g,'A131'));assert.equal(p.populationCap,24+RULES.farmPopulation);assert.deepEqual(p.economyTasks.farmTask,task);near(p.gold,gold);near(p.wood,wood);consumed(p,'A131');
  g._advanceEconomy(p,g.state.time,task.finishAt+.01);assert.equal(p.populationCap,24+RULES.farmPopulation*2);
  p.populationCap=RULES.maxPopulation;gift(g,'A131');assert.equal(g.boxRewardStatus().offers.find(o=>o.id==='A131').canStart,false);rejectUnchanged(g,()=>claim(g,'A131'));
});

test('free lumber advances the actual pending technology without charging again or losing its completion',()=>{
  const g=fixture(),p=g.state.players[0];complete(g,'h0D2');p.lumberLevel=0;ok(g.command('lumber'));
  const before=clone(p.economyTasks.lumberTask),gold=p.gold,wood=p.wood;gift(g,'A140');
  ok(claim(g,'A140'));assert.equal(p.lumberLevel,1);assert.equal(p.economyTasks.lumberTask.targetLevel,before.targetLevel+1);assert.equal(p.economyTasks.lumberTask.finishAt,before.finishAt);near(p.gold,gold);near(p.wood,wood);
  g._advanceEconomy(p,g.state.time,before.finishAt+.01);assert.equal(p.lumberLevel,2);assert.equal(p.economyTasks.lumberTask,null);
  p.lumberLevel=RULES.maxLumberLevel;gift(g,'A140');assert.equal(g.boxRewardStatus().offers.find(o=>o.id==='A140').canStart,false);rejectUnchanged(g,()=>claim(g,'A140'));
});

test('free lumber at the basic boundary preserves a separately queued basic upgrade',()=>{
  const g=fixture(),p=g.state.players[0];complete(g,'h0D2');p.lumberLevel=RULES.lumberBasicLevelCap-1;ok(g.command('lumber'));
  const finishAt=p.economyTasks.lumberTask.finishAt;gift(g,'A140');ok(claim(g,'A140'));
  assert.deepEqual(g._sourceLumberLevels(p),{basic:6,advanced:1});
  g._advanceEconomy(p,g.state.time,finishAt+.01);assert.deepEqual(g._sourceLumberLevels(p),{basic:7,advanced:1});
});

test('all eleven permanent unit grants survive actual normal and arena deployment and JSON restoration',()=>{
  const g=fixture('normal'),p=g.state.players[0],b=complete(g),baseline=complete(g);b.col=0;baseline.col=2;
  for(const id of ['A135','A136','A13Q','A13R','A2ZC']){gift(g,id);ok(claim(g,id,b));consumed(p,id);}
  const expected=['A138','A13A','A139','A13B','A13U','A13T','A13V','A13W','A13X','A13Y','A2ZG'];assert.deepEqual([...b.permanentAbilityIds].sort(),[...expected].sort());
  // Re-granting an item ability follows UnitAddAbility's non-stacking result.
  gift(g,'A135');ok(claim(g,'A135',b));assert.equal(b.permanentAbilityIds.length,11);
  const check=game=>{
    const body=game.state.entities.find(e=>e.buildingId===b.id),plain=game.state.entities.find(e=>e.buildingId===baseline.id);assert.ok(body&&plain);
    assert.ok(expected.every(id=>body.skillSpecs.some(s=>s.id===id&&s.status==='implemented')));
    near(body.maxHp,plain.maxHp+1100);near(body.damage,plain.damage+110);
    const aura=sourceAuraEffects(game,body,[body]),baseAura=sourceAuraEffects(game,plain,[plain]);near(aura.armor-baseAura.armor,3);near(aura.haste-baseAura.haste,.3);near(aura.healRate-baseAura.healRate,40);
    const crit=body.skillSpecs.find(s=>s.id==='A13Y');near(crit.chance,.4);assert.equal(crit.multiplier,2);
    const enemy=game._entity({id:'reward-test-enemy',hp:100000,damage:0},{side:'monster',team:1,ownerId:4,laneId:0});game.state.entities.push(enemy);
    const hp=body.hp;near(game._hurt(body,100,enemy,{spell:true,scripted:true,universal:true}),85);near(body.hp,hp-85);
    return body;
  };
  g._startCombat();let body=check(g);const resources={hp:body.hp,maxHp:body.maxHp,damage:body.damage};
  const restored=Game.fromSnapshot(clone(g.snapshot())),saved=restored.state.entities.find(e=>e.id===body.id);assert.deepEqual({hp:saved.hp,maxHp:saved.maxHp,damage:saved.damage},resources);assert.deepEqual(restored.state.players[0].buildings.find(x=>x.id===b.id).permanentAbilityIds,b.permanentAbilityIds);
  g._startArena();body=check(g);assert.equal(body.isArena,true);assert.equal(body.side,'arena0');
});

test('a combat-time gift updates the persistent building and the next deployment rather than retroactively rebuilding its body',()=>{
  const g=fixture(),b=complete(g);g._startCombat();const original=g.state.entities.find(e=>e.buildingId===b.id),hp=original.maxHp;
  gift(g,'A135');ok(claim(g,'A135',b));assert.equal(original.maxHp,hp);assert.ok(!original.skillSpecs.some(s=>s.id==='A138'));
  g._startArena();const next=g.state.entities.find(e=>e.buildingId===b.id);near(next.maxHp,hp+300);assert.ok(next.skillSpecs.some(s=>s.id==='A13A'));
});

test('unit gift ownership, missing targets, and ended games fail atomically without consuming choices',()=>{
  const g=fixture(),own=complete(g),foreign=complete(g,'h010',1);gift(g,'A135');
  for(const target of [undefined,foreign,{id:'missing'}])rejectUnchanged(g,()=>claim(g,'A135',target));
  g.state.phase='ended';rejectUnchanged(g,()=>claim(g,'A135',own));
});

test('swap consumes the first choice once and retains the second choice across invalid picks and save continuation',()=>{
  const g=fixture(),p=g.state.players[0],a=complete(g),b=complete(g,'h011'),foreign=complete(g,'h010',1);a.col=1;a.row=2;b.col=4;b.row=6;
  gift(g,'A2ZD');ok(claim(g,'A2ZD',a));consumed(p,'A2ZD');assert.equal(p.boxSwap.firstTargetId,a.id);assert.equal(g.boxRewardStatus().pendingSwap,true);
  for(const target of [a,foreign,{id:'missing'}])rejectUnchanged(g,()=>claim(g,'A2ZF',target));
  const restored=Game.fromSnapshot(clone(g.snapshot())),owner=restored.state.players[0];ok(claim(restored,'A2ZF',b));
  assert.deepEqual(owner.buildings.map(x=>({id:x.id,col:x.col,row:x.row})),[{id:a.id,col:4,row:6},{id:b.id,col:1,row:2}]);assert.equal(owner.boxSwap,undefined);assert.equal(restored.boxRewardStatus(),null);
  rejectUnchanged(restored,()=>claim(restored,'A2ZF',a));
});

test('demolition refunds the native point value in gold and zero wood, then consumes the whole reward',()=>{
  const g=fixture(),p=g.state.players[0],b=complete(g,'h011'),fields=UNIT_TEMPLATES.h011.sourceRawFields;assert.notEqual(Number(fields.points),Number(fields.goldcost));
  gift(g,'A2ZE');const gold=p.gold,wood=p.wood;ok(claim(g,'A2ZE',b));near(p.gold,gold+Number(fields.points));near(p.wood,wood);assert.equal(p.buildings.length,0);consumed(p,'A2ZE');rejectUnchanged(g,()=>claim(g,'A2ZE',b));
});

test('the non-stacking coupon is cleared by actual native worker training and the source positive-gold branch refunds even without one',()=>{
  const g=fixture(),p=g.state.players[0];complete(g,'h0D2');p.workers=0;
  gift(g,'A2ZB');ok(claim(g,'A2ZB'));assert.equal(p.boxBuildFreeOnce,true);gift(g,'A2ZB');ok(claim(g,'A2ZB'));assert.equal(p.boxBuildFreeOnce,true);
  for(let n=0;n<2;n++){
    const status=g.economyStatus().worker;assert.equal(status.canStart,true,status.reason);assert.ok(status.cost.gold>0);const before={gold:p.gold,wood:p.wood};
    ok(g.command('worker'));near(p.gold,before.gold);near(p.wood,before.wood);assert.equal(p.boxBuildFreeOnce,false);assert.equal(p.economyTasks.workerQueue.length,n+1);assert.deepEqual(p.economyTasks.workerQueue[n].cost,status.cost);
  }
  const worker=g.economyStatus().worker;p.gold=Math.max(0,worker.cost.gold-1);rejectUnchanged(g,()=>g.command('worker'));
});

test('ordinary lumber research pays its real fee and leaves the coupon for a proven native hook',()=>{
  const g=fixture(),p=g.state.players[0];complete(g,'h0D2');gift(g,'A2ZB');ok(claim(g,'A2ZB'));
  const status=g.economyStatus().lumber,before={gold:p.gold,wood:p.wood};assert.equal(status.canStart,true,status.reason);ok(g.command('lumber'));
  near(p.gold,before.gold-status.cost.gold);near(p.wood,before.wood-status.cost.wood);assert.equal(p.boxBuildFreeOnce,true);
});

test('unavailable builder and random-fighter choices remain unconsumed so a supported alternative can be selected',()=>{
  for(const id of ['A132','A13N','A13M','A13S']){
    const g=fixture(),p=g.state.players[0];complete(g);gift(g,id);const offer=g.boxRewardStatus().offers.find(o=>o.id===id);assert.equal(offer.canStart,false);assert.ok(offer.reason);rejectUnchanged(g,()=>claim(g,id));
    const alternative=p.boxRewards.tier==='box'?'A133':'A13O',before=p.gold;ok(claim(g,alternative));near(p.gold,before+(alternative==='A133'?50:300));consumed(p,alternative);
  }
});
