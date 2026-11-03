import test from 'node:test';
import assert from 'node:assert/strict';
import {Game} from '../dist/engine.js';
import {UNITS,RULES} from '../dist/data.js';
import {advanceBoxRewards} from '../dist/box-training-rules.js';
import {laneToWorld} from '../dist/layout.js';
const clone=x=>JSON.parse(JSON.stringify(x)),ok=r=>assert.equal(r.ok,true,r.message);

// Earn the real wave-13 offer, then claim its random fighter while an AI
// upgrade is already funded. The gift legitimately bypasses population gates.
export function createPopulationRecoveryFixture(seed=1){
 const g=new Game({mode:'sandbox',seed}),p=g.state.players[4];g.state.wave=14;
 for(const q of g.state.players){q.gold=q.wood=0;q.roster=[];q.workers=0;q.lumberLevel=0;q.heroAltarCount=2;q.eggHistory.firstWaveClosed=true;}
 p.gold=554;p.wood=80;p.workers=10;p.populationCap=15;p.roster=['v14_h00T','v14_h00N'];
 ok(g.command('build',{playerId:p.id,unitId:'v14_h00T',col:2,row:4}));g.tick(2);p.roster=['v14_h00N'];g._aiBuild(p);
 const plan=clone(p.aiUpgradePlan),b=p.buildings.find(b=>b.id===plan.buildingId);assert.deepEqual(plan.targets,['v14_h00U']);
 advanceBoxRewards(g,13);assert.ok(p.boxRewards.abilityIds.includes('A13N'));
 const point=laneToWorld(p.id,3.5,10.5);ok(g.command('boxReward',{playerId:p.id,abilityId:'A13N',worldX:point.x,worldY:point.y}));g.tick(2);
 assert.equal(p.boxRewards.consumed,true);assert.equal(g._population(p),14);assert.equal(p.populationCap,15);assert.equal(p.gold,289);
 return {g,p,b,plan};
}
const fixture=createPopulationRecoveryFixture;

test('earned random fighter cannot permanently block a funded upgrade from expanding population',()=>{
 const {g,p,b}=fixture(),before=clone(p.buildings),wood=p.wood;
 assert.equal(g.command('upgrade',{playerId:p.id,buildingId:b.id,unitId:'v14_h00U'}).ok,false);
 g._aiBuild(p);assert.ok(p.economyTasks.farmTask);assert.equal(p.gold,265);assert.ok(Math.abs(p.wood-(wood-80))<1e-8);assert.equal(p.populationCap,15);assert.equal(b.construction,null);assert.deepEqual(p.buildings,before);
 g.tick(2);assert.equal(p.populationCap,23);g._aiBuild(p);assert.equal(b.construction.targetId,'v14_h00U');assert.equal(p.gold,0);assert.equal(p.aiUpgradePlan,undefined);
 g.tick(2);assert.equal(b.unitId,'v14_h00U');assert.equal(b.construction,null);assert.equal(g._population(p),16);
});
test('waiting for the same farm cannot pay or queue it repeatedly',()=>{
 const {g,p}=fixture();g._aiBuild(p);const task=clone(p.economyTasks.farmTask),gold=p.gold,wood=p.wood;
 for(let i=0;i<20;i++)g._aiBuild(p);assert.equal(p.gold,gold);assert.equal(p.wood,wood);assert.deepEqual(p.economyTasks.farmTask,task);assert.equal(p.populationCap,15);
});
test('a still-feasible construction plan keeps the original farming timing',()=>{
 for(const capacity of [16,17]){
 const {g,p,b,plan}=fixture();p.populationCap=capacity;
 // Current stage is still constructing, with enough reserved population for
 // the final bomber but fewer than four spare slots. This is not a deadlock.
 b.construction={startAt:g.state.time,finishAt:g.state.time+2,duration:2,targetId:b.unitId};
 const before=clone(p);g._aiBuild(p);assert.deepEqual(clone(p),before);assert.deepEqual(p.aiUpgradePlan,plan);assert.ok(!p.economyTasks.farmTask);
 }
});
test('capacity recovery never consumes the gold promised to the military path',()=>{
 const {g,p,b,plan}=fixture();p.gold=288;g._aiBuild(p);assert.ok(!p.economyTasks.farmTask);assert.equal(p.gold,288);assert.equal(b.construction,null);assert.deepEqual(p.aiUpgradePlan,plan);
 p.gold++;g._aiBuild(p);assert.ok(p.economyTasks.farmTask);assert.equal(p.gold,265);
});
test('insufficient wood keeps the funded upgrade and starts farming once the real fee is available',()=>{
 const {g,p,plan}=fixture();p.wood=79;g._aiBuild(p);assert.ok(!p.economyTasks.farmTask);assert.equal(p.wood,79);assert.equal(p.gold,289);assert.deepEqual(p.aiUpgradePlan,plan);
 p.wood=80;g._aiBuild(p);assert.ok(p.economyTasks.farmTask);assert.equal(p.wood,0);assert.equal(p.gold,265);
});
test('an existing paid farm is reused before the blocked core can continue',()=>{
 const {g,p,b}=fixture();ok(g.command('farm',{playerId:p.id}));const id=p.economyTasks.farmTask.id;
 g._aiBuild(p);assert.equal(p.economyTasks.farmTask.id,id);assert.equal(p.gold,265);g.tick(2);g._aiBuild(p);assert.equal(b.construction.targetId,'v14_h00U');assert.equal(p.gold,0);
});
test('saved farm and upgrade reservation resume with identical payment and completion',()=>{
 const {g,p}=fixture();g._aiBuild(p);const restored=Game.fromSnapshot(clone(g.snapshot()));
 for(let i=0;i<30;i++){g._aiBuild(p);restored._aiBuild(restored.state.players[p.id]);g.tick(.2);restored.tick(.2);}
 assert.deepEqual(clone(restored.snapshot()),clone(g.snapshot()));assert.equal(p.buildings.some(b=>b.unitId==='v14_h00U'&&!b.construction),true);
});
test('automatic capacity recovery respects pause sandbox toggle player ownership and combat phase',()=>{
 for(const mode of ['paused','disabled','human','combat']){const {g,p}=fixture();g.state.sandbox.aiEnabled=mode!=='disabled';g.state.paused=mode==='paused';if(mode==='combat')g.state.phase='combat';const before=clone(g.snapshot());g._aiAct(mode==='human'?g.state.players[0]:p);if(mode==='combat'){for(const key of ['gold','wood','buildings','economyTasks','populationCap','aiUpgradePlan'])assert.deepEqual(clone(p[key]),before.state.players[p.id][key],key);}else assert.deepEqual(clone(g.snapshot()),before,mode);}
});
test('successful recovery preserves player resources definitions existing cells and relocation charges',()=>{
 const {g,p,b}=fixture(),human=clone(g.state.players[0]),defs=clone(UNITS),cells=p.buildings.map(b=>[b.id,b.col,b.row,b.relocationUsed]);
 for(let i=0;i<30;i++){g._aiBuild(p);g.tick(.2);}assert.equal(b.unitId,'v14_h00U');assert.deepEqual(p.buildings.map(b=>[b.id,b.col,b.row,b.relocationUsed]),cells);assert.deepEqual(UNITS,defs);
 for(const key of ['gold','wood','buildings','workers','lumberLevel'])assert.deepEqual(g.state.players[0][key],human[key]);
 assert.equal(p.gold,554-125-140-265-RULES.farmCost);
});
