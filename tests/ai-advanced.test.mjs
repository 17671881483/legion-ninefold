import test from 'node:test';
import assert from 'node:assert/strict';
import {Game} from '../dist/engine.js';
import {UNITS,MERCENARIES,RULES} from '../dist/data.js';
import {aiMercenaryScore} from '../dist/ai-controller.js';
const unit=raw=>UNITS.find(u=>u.sourceRawcode===raw&&!u.legacy),clone=x=>JSON.parse(JSON.stringify(x));
function fixture(){const g=new Game({mode:'sandbox',seed:54}),p=g.state.players[1];g.state.sandbox.aiEnabled=true;p.heroAltarCount=2;p.populationCap=300;p.gold=600;p.wood=94;p.roster=[];return {g,p};}
function finish(g,p,raw){const d=unit(raw),b={id:g._uid('b'),unitId:d.id,col:p.buildings.length%6,row:Math.floor(p.buildings.length/6),construction:{targetId:d.id}};p.buildings.push(b);g._completeConstruction(p,b);return b;}

test('AI funds a complete two-stage army upgrade outside its opening',()=>{
 const {g,p}=fixture(),b=finish(g,p,'h010');g._aiBuild(p);assert.equal(b.construction.targetId,'v14_h011');assert.deepEqual(p.aiUpgradePlan.targets,['v14_h100']);assert.equal(p.gold,520);
 g._completeConstruction(p,b);g._aiBuild(p);assert.equal(b.construction.targetId,'v14_h100');assert.equal(p.gold,270);assert.equal(p.aiUpgradePlan,undefined);
});
test('cheap troops cannot consume the gold reserved for a pending upgrade chain',()=>{
 const {g,p}=fixture(),b=finish(g,p,'h010');g._aiBuild(p);p.roster=['v14_h00M'];for(let i=0;i<5;i++)g._aiBuild(p);assert.ok(p.gold>=250);assert.deepEqual(p.aiUpgradePlan.targets,['v14_h100']);assert.equal(b.unitId,'v14_h010');
});
test('workers and cheap troops cannot occupy the population needed by the final upgrade',()=>{
 const {g,p}=fixture(),b=finish(g,p,'h010');g._aiBuild(p);finish(g,p,'h01B');p.populationCap=g._population(p)+3;p.wood=0;p.roster=['v14_h00M'];const count=p.buildings.length;g._aiBuild(p);assert.equal(p.buildings.length,count);g.state.phase='combat';g._aiAct(p);assert.equal(p.economyTasks.workerQueue.length,0);
 g.state.phase='build';g._completeConstruction(p,b);g._aiBuild(p);assert.equal(b.construction.targetId,'v14_h100');
});
test('an unaffordable final stage never creates an impossible reservation',()=>{
 const {g,p}=fixture();finish(g,p,'h010');p.gold=100;g._aiBuild(p);assert.equal(p.aiUpgradePlan,undefined);assert.ok(p.gold>=0);assert.ok(p.wood>=0);
});
test('changed qualifications release a saved plan without purchasing the locked target',()=>{
 const {g,p}=fixture(),b=finish(g,p,'h00T');p.aiUpgradePlan={buildingId:b.id,targets:['v14_h203']};g._aiBuild(p);assert.equal(p.aiUpgradePlan,undefined);assert.equal(b.unitId,'v14_h00T');assert.equal(b.construction,null);
});
test('paid chain completion and subsequent choices are deterministic after save restore',()=>{
 const {g,p}=fixture();finish(g,p,'h010');g._aiBuild(p);const restored=Game.fromSnapshot(clone(g.snapshot()));g.tick(5);restored.tick(5);assert.deepEqual(clone(restored.snapshot()),clone(g.snapshot()));
});
test('economy can research first-wave lumber once the real military and price gates are met',()=>{
 const {g,p}=fixture();finish(g,p,'h01B');g.state.phase='combat';p.gold=500;p.wood=40;g._aiAct(p);assert.equal(p.economyTasks.lumberTask.targetLevel,1);assert.equal(p.gold,420);assert.equal(p.wood,0);
});
test('first-wave worker expansion fills only the real queue then stops at seven',()=>{
 const {g,p}=fixture();finish(g,p,'h01B');g.state.phase='combat';p.wood=0;p.workers=1;p.lumberLevel=2;
 for(let i=0;i<20;i++){g._aiAct(p);assert.ok(p.economyTasks.workerQueue.length<=RULES.workerQueueLimit);const previous=g.state.time;g.state.time+=12;g._advanceEconomy(p,previous,g.state.time);}
 assert.equal(p.workers,7);assert.equal(p.economyTasks.workerQueue.length,0);assert.equal(p.gold,600);
});
test('worker population gates still prevent expansion on a full board',()=>{
 const {g,p}=fixture();finish(g,p,'h01B');g.state.phase='combat';p.populationCap=g._population(p);p.gold=50;p.wood=0;g._aiAct(p);assert.equal(p.economyTasks.workerQueue.length,0);
});
test('AI banks the actual later research wood price instead of spending it on small sends',()=>{
 const {g,p}=fixture();for(let i=0;i<5;i++)finish(g,p,'h01B');g.state.mode='normal';g.state.phase='combat';g.state.wave=10;p.lumberLevel=9;p.workers=10;p.gold=1000;
 const price=g.economyStatus(p.id).lumber.cost.wood;p.wood=price-1;g.state.kings[p.team].attackLevel=5;g._aiAct(p);assert.equal(p.stats.sent,0);assert.equal(p.wood,price-1);
 p.wood=price;g._aiAct(p);assert.ok(p.economyTasks.lumberTask);assert.equal(p.wood,0);
});
test('max-level lumber does not reserve wood for an impossible level31 research',()=>{
 const {g,p}=fixture();g.state.mode='normal';g.state.phase='combat';g.state.wave=35;p.lumberLevel=RULES.maxLumberLevel;p.workers=10;p.gold=10000;p.wood=100;for(const stat of ['attack','hp','regen'])g.state.kings[p.team][stat+'Level']=g.kingUpgradeCap(stat);g._aiAct(p);if(p.aiSendPlan){g.state.time=p.aiSendPlan.expiresAt;g._aiAct(p);}assert.ok(p.stats.sent>0);assert.ok(p.wood<100);assert.equal(p.economyTasks.lumberTask,null);
});
test('mercenary selection values armor counters against visible enemy troops',()=>{
 const {g,p}=fixture(),m=MERCENARIES[0],d={...unit('h00M'),armorType:'heavy',sourceArmorTypeRaw:undefined};
 assert.ok(aiMercenaryScore(g,p,{...m,attackType:'magic'},[d])>aiMercenaryScore(g,p,{...m,attackType:'pierce'},[d]));
});
test('flying sends gain value when the visible army cannot attack air',()=>{
 const {g,p}=fixture(),m={...MERCENARIES[0],targetType:'air'},u=unit('h00M'),ground={...u,weapon1:{...u.weapon1,targs1:'enemies,ground'},weapon2:undefined},air={...ground,weapon1:{...ground.weapon1,targs1:'enemies,air,ground'}};
 assert.ok(aiMercenaryScore(g,p,m,[ground])>aiMercenaryScore(g,p,m,[air]));
});
test('late-wave treasury planning survives save restore without spending the player resources',()=>{
 const {g,p}=fixture();finish(g,p,'h010');g._aiBuild(p);g.state.wave=15;for(const q of g.state.players)q.eggHistory.firstWaveClosed=true;const human=clone(g.state.players[0]),restored=Game.fromSnapshot(clone(g.snapshot()));g._aiAct(p);restored._aiAct(restored.state.players[p.id]);assert.deepEqual(clone(restored.snapshot()),clone(g.snapshot()));assert.deepEqual(clone(g.state.players[0]),human);
});
