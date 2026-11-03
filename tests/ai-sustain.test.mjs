import test from 'node:test';
import assert from 'node:assert/strict';
import {Game} from '../dist/engine.js';
import {UNITS,WAVES} from '../dist/data.js';
import {aiUnitScore} from '../dist/ai-controller.js';
const clone=x=>JSON.parse(JSON.stringify(x)),unit=raw=>UNITS.find(u=>u.id==='v14_'+raw);
function fixture(){
 const g=new Game({mode:'sandbox',seed:42}),p=g.state.players[4];g.state.wave=8;
 for(const q of g.state.players){q.gold=q.wood=0;q.roster=[];q.workers=0;q.heroAltarCount=2;q.eggHistory.firstWaveClosed=true;}
 p.populationCap=300;p.gold=680;p.roster=['v14_h0A3','v14_h09W'];
 for(let i=0;i<12;i++)p.buildings.push({id:g._uid('b'),unitId:'v14_h0A0',col:i%6,row:Math.floor(i/6),construction:null});
 p.buildings.push({id:g._uid('b'),unitId:'v14_h09O',col:2,row:4,construction:null});
 for(const b of p.buildings){b.construction={targetId:b.unitId};g._completeConstruction(p,b);}g._result(true,'sync');
 return {g,p};
}
test('equal-DPS troops are valued for surviving long enough to keep attacking',()=>{
 const {g}=fixture(),base={...unit('h09M'),abilityIds:[],armor:0},low={...base,hp:150},high={...base,hp:1500};
 // The gain must include offensive uptime, not just the old linear HP term.
 assert.ok(aiUnitScore(g,high)-aiUnitScore(g,low)>aiUnitScore(g,{...high,weapon1:{weapsOn:0},weapon2:null})-aiUnitScore(g,{...low,weapon1:{weapsOn:0},weapon2:null}));
});
test('sustained evaluation uses the incoming attack matchup, not just raw HP',()=>{
 const {g}=fixture(),u={...unit('h09M'),abilityIds:[]},wave=WAVES[7];
 const against=attackType=>aiUnitScore(g,u,{...wave,attackType});
 const types=['normal','pierce','magic','siege'],rank=types.sort((a,b)=>g._typeMultiplier(a,u.armorType,u.sourceArmorTypeRaw)-g._typeMultiplier(b,u.armorType,u.sourceArmorTypeRaw));
 assert.ok(against(rank[0])>against(rank.at(-1)));
});
test('a durable ground-only troop does not acquire fictitious anti-air damage',()=>{
 const {g}=fixture(),u={...unit('h09M'),hp:5000,abilityIds:[],weapon1:{...unit('h09M').weapon1,targs1:'enemies,ground'},weapon2:null};
 assert.ok(aiUnitScore(g,u,{...WAVES[7],targetType:'ground'})>aiUnitScore(g,u,{...WAVES[7],targetType:'air'}));
});
test('incomplete ability descriptions cannot inflate sustained firepower',()=>{
 const {g}=fixture(),dragon=unit('h201');
 assert.equal(aiUnitScore(g,dragon),aiUnitScore(g,{...dragon,abilityIds:dragon.abilityIds.filter(id=>id!=='A205')}));
});
test('scoring is finite for missing or invalid health and does not roll combat RNG',()=>{
 const {g}=fixture(),before=clone(g.snapshot());
 for(const hp of [undefined,NaN,-10,0,1,1e8])assert.ok(Number.isFinite(aiUnitScore(g,{...unit('h09M'),hp})));
 assert.deepEqual(clone(g.snapshot()),before);
});
test('an established core can buy another strong upgrade instead of forced cheap diversity',()=>{
 const {g,p}=fixture();g._aiBuild(p);
 assert.equal(p.buildings.length,14);assert.equal(p.buildings.at(-1).unitId,'v14_h0A3');
 assert.deepEqual(p.aiUpgradePlan.targets,['v14_h0A0']);assert.equal(p.gold,360);
 for(let i=0;i<100;i++){g._aiBuild(p);g.tick(.2);}
 assert.equal(p.buildings.at(-1).unitId,'v14_h0A0');assert.equal(p.buildings.at(-1).construction,null);assert.equal(p.gold,0);
});
test('a scarce budget still buys legal affordable defense without reserving imaginary income',()=>{
 const {g,p}=fixture();p.gold=49;g._aiBuild(p);assert.equal(p.buildings.length,13);assert.equal(p.aiUpgradePlan,undefined);assert.equal(p.gold,49);
 p.gold=50;g._aiBuild(p);assert.equal(p.buildings.at(-1).unitId,'v14_h09W');assert.equal(p.gold,0);assert.equal(p.aiUpgradePlan,undefined);
});
test('a full formation cannot reserve or pay for an unplaceable core',()=>{
 const {g,p}=fixture();p.buildings=[];for(let i=0;i<48;i++)p.buildings.push({id:'full'+i,unitId:'v14_h09W',col:i%6,row:Math.floor(i/6),construction:null});
 // Remove existing upgrades to isolate new-build placement.
 g._upgradeIds=()=>[];g._aiBuild(p);assert.equal(p.gold,680);assert.equal(p.aiUpgradePlan,undefined);
});
test('the stronger core follows normal payment, construction and snapshot continuation',()=>{
 const {g,p}=fixture(),human=clone(g.state.players[0]),defs=clone(UNITS);g._aiBuild(p);
 const saved=Game.fromSnapshot(clone(g.snapshot()));
 for(let i=0;i<100;i++){g._aiBuild(p);saved._aiBuild(saved.state.players[p.id]);g.tick(.2);saved.tick(.2);}
 assert.deepEqual(clone(g.snapshot()),clone(saved.snapshot()));assert.deepEqual(UNITS,defs);
 for(const key of ['gold','wood','buildings','workers','lumberLevel'])assert.deepEqual(g.state.players[0][key],human[key]);
 assert.equal(p.gold,680-unit('h0A3').cost-unit('h0A0').cost);assert.equal(p.wood,0);
});
test('autonomous stronger purchases respect human ownership, pause and disabled AI',()=>{
 for(const mode of ['human','paused','disabled']){
  const {g,p}=fixture();g.state.sandbox.aiEnabled=mode!=='disabled';g.state.paused=mode==='paused';
  const before=clone(g.snapshot());g._aiAct(mode==='human'?g.state.players[0]:p);assert.deepEqual(clone(g.snapshot()),before);
 }
});

test('new ranged core takes a rear position without relocating the existing saved army',()=>{
 const {g,p}=fixture();p.relocationsRemaining=0;
 const positions=p.buildings.map(b=>[b.id,b.col,b.row]),human=clone(g.state.players[0]);
 g._aiBuild(p);const added=p.buildings.at(-1);
 assert.ok(added.row>p.buildings.find(b=>b.unitId==='v14_h09O').row);
 for(let i=0;i<100;i++){g._aiBuild(p);g.tick(.2);}
 assert.equal(added.unitId,'v14_h0A0');assert.equal(added.construction,null);
 assert.deepEqual(p.buildings.slice(0,positions.length).map(b=>[b.id,b.col,b.row]),positions);
 assert.equal(p.relocationsRemaining,0);for(const key of ['gold','wood','buildings','workers','lumberLevel'])assert.deepEqual(g.state.players[0][key],human[key]);
});
test('the first three waves preserve the established opening placement',()=>{
 for(const wave of [1,2,3]){
  const {g,p}=fixture();p.buildings=[];p.gold=265;p.roster=['v14_h01A'];g.state.wave=wave;
  const cell=g._emptyCell(p,unit('h01A'));g._aiBuild(p,true);
  assert.equal(p.buildings.length,1);assert.equal(p.buildings[0].col,cell.col);assert.equal(p.buildings[0].row,cell.row);assert.equal(p.gold,0);
 }
});
