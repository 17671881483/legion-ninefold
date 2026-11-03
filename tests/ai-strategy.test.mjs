import test from 'node:test';
import assert from 'node:assert/strict';
import {Game} from '../dist/engine.js';
import {UNITS,WAVES,RULES} from '../dist/data.js';
import {aiUnitScore} from '../dist/ai-controller.js';
const u=raw=>UNITS.find(u=>!u.legacy&&u.sourceRawcode===raw);
const clone=x=>JSON.parse(JSON.stringify(x));
function fixture(){const g=new Game({mode:'sandbox',seed:48});g.state.sandbox.aiEnabled=true;const p=g.state.players[1];p.gold=500;p.wood=94;p.populationCap=300;p.roster=[u('h00M').id];p.buildings=[];return {g,p};}
function finish(g,p,code){const d=u(code),b={id:g._uid('b'),unitId:d.id,col:p.buildings.length%6,row:Math.floor(p.buildings.length/6),construction:{targetId:d.id}};p.buildings.push(b);g._completeConstruction(p,b);g._result(true,'sync');return b;}

test('opening plan waits for actual construction and reserves the next upgrade price',()=>{
 const {g,p}=fixture();p.roster=[u('h00N').id];g._aiBuild(p,true);assert.ok(p.aiUpgradePlan);const plan=clone(p.aiUpgradePlan),b=p.buildings.find(b=>b.id===plan.buildingId),target=UNITS.find(u=>u.id===plan.targets[0]);
 assert.ok(b.construction);assert.ok(p.gold>=target.cost);g._aiBuild(p);assert.equal(b.unitId,u('h00N').id);assert.deepEqual(p.aiUpgradePlan,plan);
 g._completeConstruction(p,b);const gold=p.gold;g._aiBuild(p);assert.equal(b.construction?.targetId,target.id);assert.ok(gold-p.gold>=target.cost);assert.equal(p.aiUpgradePlan,undefined);
});
test('multi-stage plan survives an intermediate upgrade under construction',()=>{
 const {g,p}=fixture();p.gold=10000;p.wood=10000;const b=finish(g,p,'h00M');p.roster=[];p.aiUpgradePlan={buildingId:b.id,targets:[u('h203').id]};
 b.construction={targetId:u('h00T').id};g._aiBuild(p);assert.deepEqual(p.aiUpgradePlan.targets,[u('h203').id]);
});
test('a sold or invalid planned carrier releases reserved resources safely',()=>{
 const {g,p}=fixture();p.aiUpgradePlan={buildingId:'missing',targets:[u('h00T').id]};g._aiBuild(p);assert.equal(p.aiUpgradePlan,undefined);assert.ok(p.buildings.length>0);
});
test('AI rejects wood-expensive choices before dispatch and still buys a valid alternative',()=>{
 const {g,p}=fixture();p.wood=0;p.gold=10000;g._requirement=()=>'';const costly=u('h0YM');assert.ok(costly);p.roster=[costly.id,u('h00M').id];const calls=[],run=g.command.bind(g);g.command=(t,v)=>{calls.push({t,v});return run(t,v);};g._aiBuild(p);assert.ok(p.buildings.some(b=>b.unitId===u('h00M').id));assert.equal(calls.some(c=>c.v.unitId===costly.id),false);
});
test('matchup score uses source armor table and weapon air target masks',()=>{
 const {g}=fixture(),original=u('h00M'),d={...original,weapon1:{...original.weapon1,targs1:'enemies,ground'},weapon2:undefined},base={...WAVES[0],targetType:'ground',armorType:'heavy',sourceArmorTypeRaw:undefined};
 const ground=aiUnitScore(g,d,base),air=aiUnitScore(g,d,{...base,targetType:'air'});assert.ok(ground>air*2);
 const strong=aiUnitScore(g,{...d,attackType:'magic',weapon1:{...d.weapon1,atkType1:'magic'}},base),weak=aiUnitScore(g,{...d,attackType:'pierce',weapon1:{...d.weapon1,atkType1:'pierce'}},base);assert.ok(strong>weak);
});
test('crowds favor splash while a single boss removes most splash bonus',()=>{
 const {g}=fixture(),d=u('h01B');assert.ok(aiUnitScore(g,d,{...WAVES[0],count:108})>aiUnitScore(g,d,{...WAVES[0],count:1})*2);
});
test('unarmed walls remain worthless and pending army stages count toward formation',()=>{
 const {g,p}=fixture();assert.equal(aiUnitScore(g,u('n04D')),0);p.roster=[u('n04D').id,u('h00M').id];g._aiBuild(p,true);assert.ok(p.buildings.length);assert.equal(p.buildings.some(b=>b.unitId===u('n04D').id),false);assert.equal(new Set(p.buildings.map(b=>b.col+','+b.row)).size,p.buildings.length);
});
test('economy recruitment works during combat with real military and population gates',()=>{
 const {g,p}=fixture();finish(g,p,'h01B');g.state.phase='combat';p.gold=500;p.wood=0;const before=p.workers;g._aiAct(p);assert.equal(p.workers,before);assert.equal(p.economyTasks.workerQueue.length,1);assert.equal(p.gold,500,'source worker prepayment is refunded by the real command');
});
test('leaking army prioritizes rebuilding over another economic queue',()=>{
 const {g,p}=fixture();finish(g,p,'h01B');p.roundLeaks=5;p.aiMemory={combatMilitary:g._military(p)};g.state.phase='combat';g._aiAct(p);assert.equal(p.economyTasks.workerQueue.length,0);
});
test('worker target includes queued workers and never queues beyond it',()=>{
 const {g,p}=fixture();finish(g,p,'h01B');g.state.phase='combat';p.gold=500;p.wood=0;p.workers=6;for(let i=0;i<8;i++)g._aiAct(p);assert.equal(p.workers+p.economyTasks.workerQueue.length,7);
});
test('AI activity cannot control player zero or run with sandbox AI disabled',()=>{
 const {g,p}=fixture();g.state.sandbox.aiEnabled=false;let before=clone(g.snapshot());g._aiAct(p);assert.deepEqual(clone(g.snapshot()),before);g.state.sandbox.aiEnabled=true;before=clone(g.snapshot());g._aiAct(g.state.players[0]);assert.deepEqual(clone(g.snapshot()),before);
});
test('normal commands enforce qualification and one-unit cap without free resources',()=>{
 const {g,p}=fixture();finish(g,p,'h00T');p.gold=1000;p.wood=0;p.roster=[];g._aiBuild(p);assert.equal(p.buildings.some(b=>b.unitId===u('h203').id||b.construction?.targetId===u('h203').id),false);assert.ok(p.gold>=0);assert.ok(p.wood>=0);
});
test('AI healing acts at 39 percent and does not consume the human charge',()=>{
 const {g}=fixture();g.state.phase='combat';const k=g.state.kings[0];k.hp=k.maxHp*.39;k.attackCd=100;g._updateKings(0);assert.equal(k.hp,k.maxHp*.89);assert.equal(g.state.players[0].healUsed,false);assert.equal(g.state.players[1].healUsed,true);assert.equal(k.healCharges,3);
});
test('a dead king cannot be revived by the earlier AI healing threshold',()=>{
 const {g}=fixture();g.state.phase='combat';g.state.kings[0].hp=0;g._updateKings(0);assert.equal(g.state.kings[0].healCharges,4);assert.equal(g.state.phase,'ended');
});
test('paused and ended games cannot spend AI resources',()=>{
 for(const flag of ['paused','ended']){const {g,p}=fixture();if(flag==='paused')g.state.paused=true;else g.state.phase='ended';const before=clone(g.snapshot());g._aiAct(p);assert.deepEqual(clone(g.snapshot()),before);}
});
test('saved opening plan and AI decisions continue deterministically',()=>{
 const {g,p}=fixture();p.roster=[u('h00N').id];g._aiBuild(p,true);const restored=Game.fromSnapshot(clone(g.snapshot()));assert.deepEqual(restored.state.players[1].aiUpgradePlan,p.aiUpgradePlan);g.tick(3);restored.tick(3);assert.deepEqual(clone(restored.snapshot()),clone(g.snapshot()));
});
test('lumber research can start from its real 40 wood cost without an unreachable extra reserve',()=>{
 const {g,p}=fixture();finish(g,p,'h01B');g.state.wave=2;g.state.phase='combat';p.workers=4;p.gold=500;p.wood=40;g._aiAct(p);assert.ok(p.economyTasks.lumberTask);assert.equal(p.wood,0);assert.equal(p.gold,420);
});
test('AI sends only purchasable mercenaries and spends real wood',()=>{
 const {g,p}=fixture();g.state.mode='normal';g.state.phase='combat';p.gold=0;p.wood=500;const before=p.wood;g._aiAct(p);assert.ok(p.stats.sent>0);assert.ok(p.stats.sent<=3);assert.ok(p.wood<before);assert.ok(p.wood>=0);assert.equal(g.state.pendingSends.filter(s=>s.senderId===p.id).length,p.stats.sent);
});
test('T does not pull lane monsters past a stable defense',()=>{
 const {g,p}=fixture();g.state.phase='combat';p.gold=p.wood=0;g.state.entities=[{id:'windup',side:'monster',hp:100,battleTeam:p.team,sourceLaneId:p.id,laneId:p.id,worldX:1,worldY:1,pendingAttack:{targetId:'soldier'}}];const calls=[],run=g.command.bind(g);g.command=(t,v)=>{calls.push(t);return run(t,v);};g._aiAct(p);assert.equal(calls.includes('interfere'),false);
});
