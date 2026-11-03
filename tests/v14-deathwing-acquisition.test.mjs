import test from 'node:test';
import assert from 'node:assert/strict';
import {Game} from '../dist/engine.js';
import {UNITS,UNIT_TEMPLATES} from '../dist/data.js';
import {EGG_REQUIREMENTS,recordEggCompletion} from '../dist/egg-rules.js';
const u=code=>UNITS.find(u=>!u.legacy&&u.sourceRawcode===code),clone=x=>JSON.parse(JSON.stringify(x));
const ok=result=>assert.equal(result.ok,true,result.message);
function history(g,codes){const p=g.state.players[0];for(const [i,code]of codes.entries())recordEggCompletion(p,u(code)??UNIT_TEMPLATES[code],{buildingId:`historical-${i}-${code}`,wave:1});}
function fixture(carrier='h201',codes=['h0BP']){
 const g=new Game({mode:'sandbox',seed:73}),p=g.state.players[0];
 // R00R is the already-completed holy-dragon prerequisite. R06U remains
 // absent until its independent exact completion records are supplied.
 Object.assign(p,{gold:10000,wood:10000,workers:0,populationCap:300,buildings:[],entitlements:{h220:1,Legion_Grail:1},roster:[u(carrier).id,u('h201').id,u('h0BP').id]});p.technologies.R00R=1;
 ok(g.command('build',{unitId:u(carrier).id,col:0,row:0}));g.tick(2);const b=p.buildings[0];assert.equal(b.construction,null);history(g,codes);g._result(true,'sync');
 return {g,p,b};
}
const upgrade=(f,code='h0PD')=>f.g.command('upgrade',{buildingId:f.b.id,unitId:u(code).id});
function rejectUnchanged(f,action=()=>upgrade(f)){f.g._result(true,'sync');const before=clone(f.g.snapshot());const result=action();assert.equal(result.ok,false);assert.deepEqual(clone(f.g.snapshot()),before);return result;}
function finishDeathwing(f){ok(upgrade(f));f.g.tick(2);assert.equal(f.b.unitId,u('h0PD').id);return f;}

test('the two holy-dragon carriers retain the source paid deathwing route and independent gates',()=>{
 for(const code of ['h201','h204'])assert.ok(u(code).upgrades.includes(u('h0PD').id));
 assert.deepEqual(u('h0PD').requiresDetails.map(r=>r.rawcode),['R06U','h220','u004']);assert.equal(u('h0PD').cost,750);assert.equal(u('h0PD').woodCost,0);assert.equal(u('h0PD').population,18);assert.equal(Number(u('h0PD').buildingRawFields.bldtm),2);
 assert.equal(EGG_REQUIREMENTS.R06U.completionMode,'raw');assert.deepEqual(EGG_REQUIREMENTS.R06U.groups,[['h0BP'],['n05M','h0D2','h01B'],['h11B'],['h0R8']]);
});
for(const carrier of ['h201','h204'])test(`${carrier} pays the full750 gold and completes the eighteen-population upgrade after two real seconds`,()=>{
 const f=fixture(carrier),{g,p,b}=f,id=b.id,wood=p.wood,altarCount=p.heroAltarCount;p.gold=750;p.populationCap=18;
 assert.equal(g._population(p),6);ok(upgrade(f));assert.equal(p.gold,0);assert.equal(p.wood,wood);assert.equal(b.unitId,u(carrier).id);assert.equal(b.construction.duration,2);assert.equal(g._population(p),18);assert.equal(p.boxRewards,undefined);
 g.tick(1.999);assert.equal(b.unitId,u(carrier).id);assert.ok(b.construction);g.tick(.001);assert.equal(b.unitId,u('h0PD').id);assert.equal(b.construction,null);assert.equal(b.id,id);assert.equal(p.buildings.length,1);assert.equal(p.heroAltarCount,altarCount);assert.equal(p.gold,0);assert.equal(g._population(p),18);
});
test('each of the four exact OR recipe branches independently permits the real paid upgrade',()=>{
 for(const codes of [['h0BP'],['n05M','h0D2','h01B'],['h11B'],['h0R8']]){const f=fixture('h201',codes),gold=f.p.gold;assert.equal(f.p.technologies.R06U,1,codes.join('+'));ok(upgrade(f));assert.equal(f.p.gold,gold-750);assert.equal(f.p.buildings.length,1);}
});
test('blue-dragon appearance aliases and incomplete three-dragon combinations cannot satisfy the raw recipe',()=>{
 for(const codes of [[],['n05M'],['n05M','n05M'],['h0D2'],['h01B'],['n05M','h0D2'],['n05M','h01B'],['h0D2','h01B']]){
  const f=fixture('h201',codes);assert.equal(f.p.technologies.R06U,undefined,codes.join('+'));rejectUnchanged(f);
  if(codes.includes('n05M'))assert.equal(f.p.completedSourceUnits.h0BP,true,'base aliases may remain for other recipes but are not exact R06U evidence');
 }
});
test('a genuinely paid blue dragon grants R06U only after construction completion',()=>{
 const f=fixture('h201',[]);ok(f.g.command('build',{unitId:u('h0BP').id,col:1,row:0}));assert.equal(f.p.technologies.R06U,undefined);rejectUnchanged(f);f.g.tick(1.999);assert.equal(f.p.technologies.R06U,undefined);f.g.tick(.001);assert.equal(f.p.technologies.R06U,1);ok(upgrade(f));
});
test('selling the completed recipe troop preserves qualification without removing the required holy-dragon carrier',()=>{
 const f=fixture('h201',[]);ok(f.g.command('build',{unitId:u('h0BP').id,col:1,row:0}));f.g.tick(2);const blue=f.p.buildings.find(b=>b.unitId===u('h0BP').id);ok(f.g.command('sell',{buildingId:blue.id}));assert.equal(f.p.technologies.R06U,1);assert.equal(f.p.buildings.length,1);ok(upgrade(f));
});
test('super sponsorship is independent from membership ordinary sponsorship and a similarly named technology',()=>{
 const f=fixture();delete f.p.entitlements.h220;Object.assign(f.p.entitlements,{h200:1,h210:1,h230:1});f.p.technologies.h220=1;
 assert.equal(f.g.requirementStatus(u('h0PD')).requirements.find(r=>r.rawcode==='h220').met,false);assert.match(rejectUnchanged(f).message,/超级赞助/);f.p.entitlements.h220=1;ok(upgrade(f));
});
test('super sponsorship alone does not invent recipe completion and combat cannot bypass u004',()=>{
 const missing=fixture('h201',[]);rejectUnchanged(missing);assert.equal(missing.p.technologies.R06U,undefined);
 const f=fixture();f.g.state.phase='combat';assert.equal(f.g.requirementStatus(u('h0PD')).requirements.find(r=>r.rawcode==='u004').met,false);rejectUnchanged(f);f.g.state.phase='build';ok(upgrade(f));
});
test('insufficient funds or final population reject atomically before paid construction begins',()=>{
 for(const mode of ['gold','population']){const f=fixture();if(mode==='gold')f.p.gold=749;else f.p.populationCap=17;rejectUnchanged(f);assert.equal(f.b.construction,null);}
});
test('the ordinary full-price route preserves an unconsumed optional training reward',()=>{
 const f=fixture();ok(f.g.command('sandboxBoxTraining'));const gift=clone(f.p.boxRewards),gold=f.p.gold;ok(upgrade(f));assert.equal(f.p.gold,gold-750);assert.deepEqual(f.p.boxRewards,gift);f.g.tick(2);assert.deepEqual(f.p.boxRewards,gift);
});
for(const [skin,key]of [['h0UZ','R0DS'],['h0XF','R0HR']])test(`${skin} requires its exact ${key} entitlement in addition to super sponsorship`,()=>{
 const f=finishDeathwing(fixture());f.p.technologies[key]=1;const status=f.g.requirementStatus(u(skin)).requirements.find(r=>r.rawcode===key);assert.equal(status.kind,'entitlement');assert.equal(status.met,false);rejectUnchanged(f,()=>upgrade(f,skin));
 f.p.entitlements[key==='R0DS'?'R0HR':'R0DS']=1;rejectUnchanged(f,()=>upgrade(f,skin));f.p.entitlements[key]=1;const gold=f.p.gold,id=f.b.id;ok(upgrade(f,skin));assert.equal(f.b.unitId,u('h0PD').id);assert.equal(f.b.construction.duration,2);assert.equal(f.p.gold,gold);f.g.tick(2);assert.equal(f.b.unitId,u(skin).id);assert.equal(f.b.id,id);assert.equal(f.g._population(f.p),18);
});
test('skin items cannot bypass the separate recipe sponsorship or battle-end requirements',()=>{
 for(const [skin,key]of [['h0UZ','R0DS'],['h0XF','R0HR']])for(const mode of ['recipe','sponsor','combat']){
  const f=finishDeathwing(fixture());f.p.entitlements[key]=1;if(mode==='recipe')delete f.p.technologies.R06U;if(mode==='sponsor')delete f.p.entitlements.h220;if(mode==='combat')f.g.state.phase='combat';rejectUnchanged(f,()=>upgrade(f,skin));
 }
});
test('the one-unit source limit remains reserved through deathwing construction and either skin transformation',()=>{
 for(const [skin,key]of [['h0UZ','R0DS'],['h0XF','R0HR']]){
  const f=fixture();ok(upgrade(f));assert.equal(f.g.buildLimitStatus(u('h0PD')).current,1);assert.equal(f.g.requirementStatus(u('h0PD')).canStart,false);f.g.tick(2);
  // The holy dragon has its own one-unit limit; a second carrier is legally
  // purchased only after the first finishes becoming Deathwing.
  ok(f.g.command('build',{unitId:u('h201').id,col:1,row:0}));f.g.tick(2);const second=f.p.buildings[1],secondUpgrade=()=>f.g.command('upgrade',{buildingId:second.id,unitId:u('h0PD').id});rejectUnchanged(f,secondUpgrade);
  f.p.entitlements[key]=1;ok(upgrade(f,skin));assert.equal(f.g.buildLimitStatus(u('h0PD')).current,1);rejectUnchanged(f,secondUpgrade);f.g.tick(2);assert.ok(f.b.limitOrigins.includes('h0PD'));assert.equal(f.g.buildLimitStatus(u('h0PD')).current,1);rejectUnchanged(f,secondUpgrade);
 }
});
test('saved paid construction resumes with no second fee and retains the eventual skin limit',()=>{
 const f=fixture();ok(upgrade(f));f.g.tick(.7);const savedGold=f.p.gold;let g=Game.fromSnapshot(clone(f.g.snapshot()));g.tick(1.3);let p=g.state.players[0],b=p.buildings.find(b=>b.id===f.b.id);assert.equal(b.unitId,u('h0PD').id);assert.equal(p.gold,savedGold);p.entitlements.R0DS=1;ok(g.command('upgrade',{buildingId:b.id,unitId:u('h0UZ').id}));g.tick(2);
 g=Game.fromSnapshot(clone(g.snapshot()));p=g.state.players[0];b=p.buildings.find(b=>b.id===f.b.id);assert.equal(b.unitId,u('h0UZ').id);assert.equal(g.buildLimitStatus(u('h0PD')).current,1);assert.equal(p.entitlements.R0DS,1);assert.equal(p.gold,savedGold);
});
test('legacy expanded aliases cannot newly infer R06U while an already granted technology is preserved',()=>{
 for(const alreadyGranted of [false,true]){const f=fixture('h201',[]);delete f.p.eggHistory;f.p.completedSourceUnits={n05M:true,h0BP:true};if(alreadyGranted)f.p.technologies.R06U=1;else delete f.p.technologies.R06U;const g=Game.fromSnapshot(clone(f.g.snapshot()));assert.equal(g.state.players[0].technologies.R06U,alreadyGranted?1:undefined);assert.equal(g.requirementStatus(u('h0PD')).canStart,alreadyGranted);}
});
test('exact raw completion and qualification history remain per-player across save restore',()=>{
 const f=fixture('h201',['n05M','h0D2','h01B']);for(const p of f.g.state.players.slice(1))assert.equal(p.technologies.R06U,undefined);const g=Game.fromSnapshot(clone(f.g.snapshot()));assert.equal(g.state.players[0].technologies.R06U,1);assert.equal(g.state.players[0].eggHistory.rawCompleted.h0BP,undefined);for(const p of g.state.players.slice(1))assert.equal(p.technologies.R06U,undefined);ok(g.command('upgrade',{buildingId:f.b.id,unitId:u('h0PD').id}));
});
