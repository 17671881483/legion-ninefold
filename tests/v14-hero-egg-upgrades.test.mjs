import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {Game} from '../dist/engine.js';
import {UNITS} from '../dist/data.js';
import {V14_ABILITIES, V14_UPGRADE_EDGES} from '../dist/v14-reference.js';
import {splitUnitCategories, unitCategory} from '../dist/unit-categories.js';
const rule=JSON.parse(await readFile(new URL('../reference/hero-egg-upgrades.json',import.meta.url),'utf8'));
const unit=raw=>UNITS.find(u=>!u.legacy&&u.sourceRawcode===raw);
const clone=x=>JSON.parse(JSON.stringify(x));
const ok=r=>assert.equal(r.ok,true,r.message);
function complete(g,raw){
  const p=g.state.players[0],u=unit(raw),i=p.buildings.length;
  const b={id:g._uid('b'),unitId:u.id,col:i%6,row:Math.floor(i/6),construction:{targetId:u.id}};
  p.buildings.push(b);g._completeConstruction(p,b);return b;
}
function fixture(route,mode='normal'){
  const g=new Game({seed:615,mode});g._aiAct=()=>{};
  g.state.phase='build';const p=g.state.players[0];
  Object.assign(p,{buildings:[],gold:100000,wood:100000,populationCap:300,heroAltarCount:2,heroAltarUsed:true,entitlements:{h220:1}});
  for(const code of ['h0D2','h0CS','h09S','n07H','h01L','h047'])complete(g,code);
  const b=complete(g,route.from);g._result(true,'sync');return {g,p,b,u:unit(route.to)};
}
const upgrade=({g,b,u})=>g.command('upgrade',{buildingId:b.id,unitId:u.id});
function unchanged(f,run){const before=clone(f.g.snapshot());assert.equal(run().ok,false);assert.deepEqual(clone(f.g.snapshot()),before);}

test('five direct routes retain exact source recipes and reviewed selection evidence',async()=>{
  const bytes=await readFile(new URL('../reference/v14-source/raw_extracted/war3map.j',import.meta.url)),lines=bytes.toString('latin1').split('\n');
  assert.equal(createHash('sha256').update(bytes).digest('hex'),rule.sourceJassSha256);
  assert.equal(rule.routes.length,5);
  for(const r of rule.routes){
    assert.ok(V14_ABILITIES[r.recipeAbility].description.startsWith(r.recipePrefix));
    assert.ok(lines[r.selectionLine-1].includes('$'+Buffer.from(r.to).toString('hex').toUpperCase()));
    assert.ok(V14_UPGRADE_EDGES.some(e=>e.heroEgg&&e.fromRawcode===r.from&&e.toRawcode===r.to));
    assert.equal(unitCategory(unit(r.to)),'彩蛋兵种');
    assert.ok(splitUnitCategories(unit(r.from).upgrades.map(id=>UNITS.find(u=>u.id===id))).easter.some(u=>u.id===unit(r.to).id));
  }
});

for(const r of rule.routes)test(`${r.to}: normal wave-one direct upgrade uses full price and construction, without reward or a new altar`,()=>{
  const f=fixture(r),{g,p,b,u}=f;const id=b.id,length=p.buildings.length,gold=p.gold,wood=p.wood,old=unit(r.from);
  assert.equal(g.state.wave,1);assert.equal(p.boxRewards,undefined);assert.equal(g.heroStatus().remaining,0);
  b.treasureArmor=5;b.sourceRemovedBuildingAbilities=['A118'];
  ok(upgrade(f));assert.equal(p.gold,gold-u.cost);assert.equal(p.wood,wood-u.woodCost);
  assert.equal(b.unitId,old.id);assert.equal(b.construction.targetId,u.id);assert.equal(b.construction.duration,Number(u.buildingRawFields.bldtm));
  assert.equal(p.boxRewards,undefined);assert.equal(p.heroAltarCount,2);
  assert.equal(g.buildLimitStatus(u).canStart,false,'construction reserves the capped target');
  g._completeConstruction(p,b);
  assert.equal(b.unitId,u.id);assert.equal(b.id,id);assert.equal(p.buildings.length,length);assert.equal(b.treasureArmor,5);
  assert.deepEqual(b.sourceRemovedBuildingAbilities,['A118']);assert.equal(p.heroAltarCount,2);assert.equal(p.boxRewards,undefined);
});

test('direct upgrade preserves an unspent gift while training still charges 40% and consumes it',()=>{
  const r=rule.routes[0],direct=fixture(r,'sandbox'),discount=fixture(r,'sandbox');
  for(const f of [direct,discount])ok(f.g.command('sandboxBoxTraining'));
  const gift=clone(direct.p.boxRewards),gold=direct.p.gold;ok(upgrade(direct));
  assert.equal(gold-direct.p.gold,605);assert.deepEqual(direct.p.boxRewards,gift);
  const before=discount.p.gold;ok(discount.g.command('boxTrain',{buildingId:discount.b.id,unitId:discount.u.id}));
  assert.equal(before-discount.p.gold,242);assert.equal(discount.p.boxRewards.consumed,true);
  assert.ok(discount.p.buildings.some(b=>b.unitId===discount.u.id&&!b.construction&&b.id!==discount.b.id));
});

test('sponsor and actual recipe completions remain mandatory with atomic rejection',()=>{
  const f=fixture(rule.routes[0]);delete f.p.entitlements.h220;
  assert.match(upgrade(f).message,/超级赞助/);unchanged(f,()=>upgrade(f));
  f.p.entitlements.h220=1;delete f.p.technologies.R0HM;f.p.eggHistory=undefined;f.p.completedSourceUnits=undefined;
  unchanged(f,()=>upgrade(f));
});

test('resource, population, capped target, wrong branch, ownership, construction and battle gates still apply',()=>{
  const r=rule.routes[0];
  for(const mutate of [f=>f.p.gold=604,f=>f.p.populationCap=f.g._population(f.p),f=>complete(f.g,r.to),f=>f.b.unitId=unit('h0DT').id,f=>f.g.state.phase='combat',f=>f.b.construction={targetId:unit('h0DV').id,finishAt:30}]){
    const f=fixture(r);mutate(f);f.g._result(true,'sync');unchanged(f,()=>upgrade(f));
  }
  const f=fixture(r);unchanged(f,()=>f.g.command('upgrade',{buildingId:f.b.id,unitId:f.u.id,playerId:1}));
  unchanged(f,()=>f.g.command('upgrade',{buildingId:f.b.id,unitId:unit('n05H').id}));
});

test('old maximum-stage saves expose direct routes; in-progress upgrades resume without another charge',()=>{
  const f=fixture(rule.routes[0]);const restored=Game.fromSnapshot(f.g.snapshot()),p=restored.state.players[0],b=p.buildings.find(b=>b.id===f.b.id);
  assert.ok(restored._upgradeIds(unit('h0DV')).includes(f.u.id));ok(restored.command('upgrade',{buildingId:b.id,unitId:f.u.id}));
  const next=Game.fromSnapshot(restored.snapshot()),owner=next.state.players[0],nextB=owner.buildings.find(x=>x.id===b.id),gold=owner.gold;
  assert.equal(nextB.construction.targetId,f.u.id);next._completeConstruction(owner,nextB);
  assert.equal(nextB.unitId,f.u.id);assert.equal(owner.gold,gold);assert.equal(owner.boxRewards,undefined);
});
