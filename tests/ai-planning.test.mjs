import test from 'node:test';
import assert from 'node:assert/strict';
import {Game} from '../dist/engine.js';
import {UNITS,MERCENARIES,RULES} from '../dist/data.js';
import {aiMercenaryScore} from '../dist/ai-controller.js';
const clone=x=>JSON.parse(JSON.stringify(x));
function fixture(){const g=new Game({mode:'sandbox',seed:42}),p=g.state.players[4];g.state.sandbox.aiEnabled=true;g.state.wave=4;p.gold=405;p.wood=0;p.roster=['v14_h00N'];p.heroAltarCount=2;p.populationCap=300;for(const q of g.state.players)q.eggHistory.firstWaveClosed=true;p.buildings.push({id:g._uid('b'),unitId:'v14_h00T',col:2,row:4,construction:{targetId:'v14_h00T'}});g._completeConstruction(p,p.buildings[0]);g._result(true,'sync');return {g,p};}
function offensive(){const {g,p}=fixture();g.state.mode=g.options.mode='normal';delete g.state.sandbox;g.state.phase='combat';g.state.wave=12;p.gold=0;p.wood=60;p.roster=[];p.workers=10;p.lumberLevel=30;for(const s of ['hp','attack','regen'])g.state.kings[p.team][s+'Level']=g.kingUpgradeCap(s);return {g,p};}
function planSend(g,p){g._aiAct(p);assert.ok(p.aiSendPlan);assert.equal(p.stats.sent,0);return MERCENARIES.find(m=>m.id===p.aiSendPlan.mercId);}

test('midgame buys a paid bomber upgrade path instead of spending all gold on bases',()=>{
 const {g,p}=fixture(),rng=g._rng;g._aiBuild(p);assert.equal(p.buildings.length,2);assert.deepEqual(p.aiUpgradePlan.targets,['v14_h00U']);assert.equal(p.gold,265);assert.equal(g._rng,rng);
 g._completeConstruction(p,p.buildings[1]);g._aiBuild(p);assert.equal(p.buildings[1].construction.targetId,'v14_h00U');assert.equal(p.gold,0);assert.equal(p.aiUpgradePlan,undefined);
});
test('the final upgraded bomber is deployed after normal construction time',()=>{
 const {g,p}=fixture();g.state.sandbox.aiEnabled=false;for(let i=0;i<100;i++){g._aiBuild(p);g.tick(.2);}assert.equal(p.buildings.length,2);assert.equal(p.buildings[1].unitId,'v14_h00U');assert.equal(p.buildings[1].construction,null);g.state.sandbox.aiEnabled=true;g._startCombat();assert.ok(g.state.entities.some(e=>e.buildingId===p.buildings[1].id&&e.hp>0));
});
test('a pending new-build chain protects its whole remaining gold budget',()=>{
 const {g,p}=fixture();g._aiBuild(p);p.roster=['v14_h00M'];for(let i=0;i<6;i++)g._aiBuild(p);assert.equal(p.gold,265);assert.equal(p.buildings.length,2);
});
test('an unaffordable chain falls back to legal base troops without phantom reservation',()=>{
 const {g,p}=fixture();p.gold=404;g._aiBuild(p);assert.equal(p.aiUpgradePlan,undefined);assert.equal(p.buildings.length,3);assert.equal(p.gold,124);
});
test('an unavailable final qualification is rejected before it reserves gold',()=>{
 const {g,p}=fixture(),original=g._requirement.bind(g);g._requirement=(q,u)=>u.id==='v14_h00U'?'locked':original(q,u);g._aiBuild(p);assert.equal(p.aiUpgradePlan,undefined);assert.equal(p.buildings.length,3);assert.equal(p.gold,125);
});
test('a full board never creates a reserved path with no carrier',()=>{
 const {g,p}=fixture();p.buildings=[];for(let i=0;i<48;i++)p.buildings.push({id:'full'+i,unitId:'v14_n04D',row:Math.floor(i/6),col:i%6});g._aiBuild(p);assert.equal(p.aiUpgradePlan,undefined);assert.equal(p.gold,405);
});
test('new build chains resume identically across a real snapshot',()=>{
 const {g,p}=fixture();g._aiBuild(p);const restored=Game.fromSnapshot(clone(g.snapshot()));for(let i=0;i<30;i++){g.tick(.2);restored.tick(.2);}assert.deepEqual(clone(restored.snapshot()),clone(g.snapshot()));
});
test('late send scoring uses integer source income halving',()=>{
 const {g,p}=offensive(),m={...MERCENARIES[0],damage:0,hp:0,sourcePoints:1};assert.equal(aiMercenaryScore(g,p,m,[]),0);m.sourcePoints=3;assert.equal(aiMercenaryScore(g,p,m,[]),35/g._woodCost(m));g.state.wave=10;assert.equal(aiMercenaryScore(g,p,m,[]),360/g._woodCost(m));
});
test('late AI banks wood and purchases the exact stronger planned mercenary',()=>{
 const {g,p}=offensive(),m=planSend(g,p),cost=g._woodCost(m);assert.ok(cost>60);assert.equal(p.wood,60);p.wood=cost;g._aiAct(p);assert.equal(p.stats.sent,1);assert.equal(p.wood,0);assert.equal(p.aiSendPlan,undefined);assert.equal(g.state.pendingSends[0].mercId,m.id);assert.equal(g.state.pendingSends[0].wave,13);
});
test('a send bank has a fixed expiry that repeated decisions do not extend',()=>{
 const {g,p}=offensive();planSend(g,p);const end=p.aiSendPlan.expiresAt;g.state.time=19;g._aiAct(p);assert.equal(p.aiSendPlan.expiresAt,end);assert.equal(p.stats.sent,0);g.state.time=20;g._aiAct(p);assert.ok(p.stats.sent>0);assert.ok(p.wood<60);assert.ok(!p.aiSendPlan||p.aiSendPlan.expiresAt>20);
});
test('losing production cancels the bank and spends only current affordable wood',()=>{
 const {g,p}=offensive();planSend(g,p);p.workers=0;g._aiAct(p);assert.equal(p.aiSendPlan,undefined);assert.ok(p.stats.sent>0);assert.ok(p.wood>=0);
});
test('a changed wave releases a stale send reservation',()=>{
 const {g,p}=offensive();planSend(g,p);g.state.wave=13;g._aiAct(p);assert.ok(p.stats.sent>0);assert.ok(!p.aiSendPlan||p.aiSendPlan.wave===13);
});
test('lost stock releases a send reservation and uses another legal send',()=>{
 const {g,p}=offensive(),m=planSend(g,p);p.mercStocks[m.id].stock=0;p.mercStocks[m.id].nextReadyAt=1000;g._aiAct(p);assert.ok(p.stats.sent>0);assert.ok(g.state.pendingSends.every(s=>s.mercId!==m.id));
});
test('a hurt king cancels attack saving and buys a real hp upgrade first',()=>{
 const {g,p}=offensive();planSend(g,p);const k=g.state.kings[p.team];k.hp=k.maxHp*.3;k.hpLevel=0;p.wood=100;g._aiAct(p);assert.equal(k.hpLevel,1);assert.equal(p.wood,0);assert.equal(p.aiSendPlan,undefined);assert.equal(p.stats.sent,0);
});
test('wood reserved for a military upgrade cannot fund a planned send',()=>{
 const {g,p}=offensive(),m=planSend(g,p);p.wood=g._woodCost(m);p.aiUpgradePlan={buildingId:'pending',targets:['v14_h0YM']};g._aiAct(p);assert.equal(p.stats.sent,0);assert.equal(p.wood,g._woodCost(m));
});
test('sandbox build phase sends immediately rather than waiting for combat income',()=>{
 const {g,p}=offensive();g.state.mode='sandbox';g.state.sandbox={aiEnabled:true};g.state.phase='build';g._aiAct(p);assert.equal(p.aiSendPlan,undefined);assert.ok(p.stats.sent>0);
});
test('an attack bank and its purchase survive save restore deterministically',()=>{
 const {g,p}=offensive(),m=planSend(g,p);const restored=Game.fromSnapshot(clone(g.snapshot()));p.wood=restored.state.players[p.id].wood=g._woodCost(m);g._aiAct(p);restored._aiAct(restored.state.players[p.id]);assert.deepEqual(clone(restored.snapshot()),clone(g.snapshot()));
});
test('paused games and human players never create attack reservations',()=>{
 const {g,p}=offensive();g.state.paused=true;const before=clone(g.snapshot());g._aiAct(p);assert.deepEqual(clone(g.snapshot()),before);g.state.paused=false;g._aiAct(g.state.players[0]);assert.equal(g.state.players[0].aiSendPlan,undefined);
});

test('a lone ranged army establishes bodies before committing to another expensive path',()=>{
 const {g,p}=fixture();p.buildings=[];g._aiBuild(p);assert.equal(p.aiUpgradePlan,undefined);assert.equal(p.buildings.length,2);assert.equal(p.gold,125);
});
