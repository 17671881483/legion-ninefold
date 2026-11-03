import test from 'node:test';
import assert from 'node:assert/strict';
import {Game} from '../dist/engine.js';
import {UNITS,WAVES} from '../dist/data.js';
import {aiUnitScore} from '../dist/ai-controller.js';
const clone=x=>JSON.parse(JSON.stringify(x)),unit=raw=>UNITS.find(u=>u.sourceRawcode===raw&&!u.legacy);
function scoring(){const g=new Game({mode:'sandbox',seed:42});g.state.wave=8;return {g,wave:WAVES[7],u:{...unit('h00T'),abilityIds:[],weapon1:{...unit('h00T').weapon1,weapTp1:'msplash',Farea1:0,Harea1:0,Qarea1:0}}};}
function fixture(){
 const g=new Game({mode:'sandbox',seed:42}),p=g.state.players[4];g.state.wave=4;
 for(const q of g.state.players){q.gold=q.wood=0;q.roster=[];q.workers=0;q.heroAltarCount=2;q.eggHistory.firstWaveClosed=true;}
 p.populationCap=300;p.gold=1215;p.roster=['v14_h00N'];p.buildings.push({id:g._uid('b'),unitId:'v14_h00T',col:2,row:4,construction:{targetId:'v14_h00T'}});g._completeConstruction(p,p.buildings[0]);g._result(true,'sync');
 return {g,p};
}
test('small low-factor splash is not valued as full-damage wide splash',()=>{
 const {g,u,wave}=scoring(),weak={...u,weapon1:{...u.weapon1,Qarea1:100,Qfact1:.1}},strong={...u,weapon1:{...u.weapon1,Farea1:200}};
 assert.ok(aiUnitScore(g,strong,wave)>aiUnitScore(g,weak,wave)*2);
});
test('splash ground mask cannot grant crowd damage against air',()=>{
 const {g,u,wave}=scoring(),air={...wave,targetType:'air'},ground={...u,weapon1:{...u.weapon1,Farea1:200,splashTargs1:'enemies,ground'}},both={...ground,weapon1:{...ground.weapon1,splashTargs1:'enemies,ground,air'}};
 assert.equal(aiUnitScore(g,ground,air),aiUnitScore(g,u,air));assert.ok(aiUnitScore(g,both,air)>aiUnitScore(g,ground,air)*2);
});
test('one target grants no splash or bounce neighbors',()=>{
 const {g,u,wave}=scoring(),single={...wave,count:1};
 for(const fields of [{Farea1:300},{weapTp1:'mbounce',Farea1:400,targCount1:5,damageLoss1:.1}])assert.equal(aiUnitScore(g,{...u,weapon1:{...u.weapon1,...fields}},single),aiUnitScore(g,u,single));
});
test('bounces account for decay and the actual target count',()=>{
 const {g,u,wave}=scoring(),bounce={...u,weapon1:{...u.weapon1,weapTp1:'mbounce',Farea1:400,targCount1:4,damageLoss1:0}},loss={...bounce,weapon1:{...bounce.weapon1,damageLoss1:.8}};
 assert.ok(aiUnitScore(g,bounce,wave)>aiUnitScore(g,loss,wave));assert.ok(aiUnitScore(g,loss,wave)>aiUnitScore(g,u,wave));
});
test('zero-radius bounce does not invent secondary hits',()=>{
 const {g,u,wave}=scoring();assert.equal(aiUnitScore(g,{...u,weapon1:{...u.weapon1,weapTp1:'mbounce',Farea1:0,targCount1:10}},wave),aiUnitScore(g,u,wave));
});
test('line attacks use width and length rather than a fixed area bonus',()=>{
 const {g,u,wave}=scoring(),line={...u,weapon1:{...u.weapon1,weapTp1:'mline',spillDist1:600,spillRadius1:50}},thin={...line,weapon1:{...line.weapon1,spillRadius1:0}};
 assert.ok(aiUnitScore(g,line,wave)>aiUnitScore(g,thin,wave));assert.equal(aiUnitScore(g,thin,wave),aiUnitScore(g,u,wave));
});
test('selected second-weapon fields drive anti-air splash estimates',()=>{
 const {g,u,wave}=scoring(),air={...wave,targetType:'air'},dual={...u,weapon1:{...u.weapon1,targs1:'enemies,ground',weapsOn:3},weapon2:{weapTp2:'msplash',weapsOn:3,targs2:'enemies,air',splashTargs2:'enemies,air',cool2:1,dmgplus2:100,Farea2:200}},plain={...dual,weapon2:{...dual.weapon2,Farea2:0}};
 assert.ok(aiUnitScore(g,dual,air)>aiUnitScore(g,plain,air)*2);
});
test('implemented elite archer barrage is valued as several attacks',()=>{
 const {g,wave}=scoring(),archer=unit('h09M'),plain={...archer,abilityIds:archer.abilityIds.filter(id=>id!=='A07M')};
 assert.ok(aiUnitScore(g,archer,wave)>aiUnitScore(g,plain,wave)*2);assert.equal(aiUnitScore(g,archer,{...wave,count:1}),aiUnitScore(g,plain,{...wave,count:1}));
});
test('unresolved holy-dragon barrage cannot supply guessed damage',()=>{
 const {g,wave}=scoring(),dragon=unit('h201');assert.equal(aiUnitScore(g,dragon,wave),aiUnitScore(g,{...dragon,abilityIds:dragon.abilityIds.filter(id=>id!=='A205')},wave));
});
test('implemented evasion improves durability without adding duplicate evasion',()=>{
 const {g,wave}=scoring(),ghost=unit('h05N'),plain={...ghost,abilityIds:[]},double={...ghost,abilityIds:['A044','A044']};assert.ok(aiUnitScore(g,ghost,wave)>aiUnitScore(g,plain,wave));assert.equal(aiUnitScore(g,ghost,wave),aiUnitScore(g,double,wave));
});
test('known critical strikes affect expected output but do not roll combat RNG',()=>{
 const {g,u,wave}=scoring(),before=clone(g.snapshot()),crit={...u,abilityIds:['A13Y']};assert.ok(aiUnitScore(g,crit,wave)>aiUnitScore(g,u,wave));assert.deepEqual(clone(g.snapshot()),before);
});
test('physical armor reduces weapon value under the real armor formula',()=>{
 const {g,u,wave}=scoring();assert.ok(aiUnitScore(g,u,{...wave,armor:0})>aiUnitScore(g,u,{...wave,armor:20}));
});
test('a funded midgame core waits instead of spending the remaining treasury on bases',()=>{
 const {g,p}=fixture();g._aiBuild(p);assert.equal(p.buildings.length,2);assert.ok(p.aiUpgradePlan);const gold=p.gold,plan=clone(p.aiUpgradePlan);
 for(let i=0;i<10;i++)g._aiBuild(p);assert.equal(p.buildings.length,2);assert.equal(p.gold,gold);assert.deepEqual(p.aiUpgradePlan,plan);
});
test('finishing one paid core frees the remaining budget for the next core',()=>{
 const {g,p}=fixture();for(let i=0;i<200;i++){g._aiBuild(p);g.tick(.2);}assert.equal(p.gold,0);assert.equal(p.buildings.filter(b=>b.unitId==='v14_h00U'&&!b.construction).length,3);assert.equal(p.aiUpgradePlan,undefined);
});
test('normal preparation time is enough to finish the reserved cores',()=>{
 const {g,p}=fixture();for(let i=0;i<Math.floor(g.buildDuration()*5);i++){g._aiBuild(p);g.tick(.2);}assert.equal(p.buildings.some(b=>b.construction),false);assert.equal(p.gold,0);
});
test('waiting plans release if the carrier disappears, without freezing future purchases',()=>{
 const {g,p}=fixture();g._aiBuild(p);const id=p.aiUpgradePlan.buildingId;p.buildings=p.buildings.filter(b=>b.id!==id);g._aiBuild(p);assert.ok(p.buildings.length>1);assert.notEqual(p.aiUpgradePlan?.buildingId,id);
});
test('new qualifications are checked before continuing a waiting path',()=>{
 const {g,p}=fixture();g._aiBuild(p);g._completeConstruction(p,p.buildings[1]);const req=g._requirement.bind(g);g._requirement=(owner,u)=>u.id==='v14_h00U'?'locked':req(owner,u);g._aiBuild(p);assert.equal(p.aiUpgradePlan,undefined);assert.equal(p.buildings.some(b=>b.construction?.targetId==='v14_h00U'),false);assert.ok(p.buildings.length>2);
});
test('serial construction and purchases continue identically after save restore',()=>{
 const {g,p}=fixture();g._aiBuild(p);const restored=Game.fromSnapshot(clone(g.snapshot()));for(let i=0;i<100;i++){g._aiBuild(p);restored._aiBuild(restored.state.players[p.id]);g.tick(.2);restored.tick(.2);}assert.deepEqual(clone(g.snapshot()),clone(restored.snapshot()));
});
test('planning spends only real gold, leaves human resources and combat stats untouched',()=>{
 const {g,p}=fixture(),human=clone(g.state.players[0]),definition=clone(unit('h00U'));for(let i=0;i<200;i++){g._aiBuild(p);g.tick(.2);}for(const key of ['gold','wood','buildings','technologies','workers','lumberLevel'])assert.deepEqual(g.state.players[0][key],human[key]);assert.deepEqual(unit('h00U'),definition);assert.equal(p.gold,1215-3*(unit('h00N').cost+unit('h00U').cost));assert.ok(p.wood>=0);
});
test('combat, pause and disabled sandbox never run autonomous army purchases',()=>{
 for(const state of ['combat','paused','disabled']){const {g,p}=fixture();g.state.sandbox.aiEnabled=state!=='disabled';if(state==='combat')g.state.phase='combat';if(state==='paused')g.state.paused=true;const before=clone(p);g._aiAct(p);if(state==='combat'){assert.deepEqual(p.buildings,before.buildings);assert.equal(p.gold,before.gold);}else assert.deepEqual(clone(p),before);}
});
