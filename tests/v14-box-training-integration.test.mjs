import test from 'node:test';
import assert from 'node:assert/strict';
import {Game} from '../dist/engine.js';
import {UNITS, BOX_TRAINING_RULES} from '../dist/data.js';
import {BOX_TRAINING_RULES as BOX_RUNTIME_RULES} from '../dist/box-training-rules.js';

const current=UNITS.filter(u=>!u.legacy),byId=new Map(current.map(u=>[u.id,u]));
const unit=raw=>current.find(u=>u.sourceRawcode===raw);
const clone=value=>JSON.parse(JSON.stringify(value));
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);
const ok=result=>assert.equal(result.ok,true,result.message??result.reason);

function fixture(mode='sandbox'){
  const g=new Game({seed:42,mode});g._aiAct=()=>{};g._aiTimer=-1e6;
  for(const p of g.state.players){
    p.buildings=[];p.heroId=null;p.heroAltarCount=0;p.heroAltarUsed=false;
    p.gold=p.wood=100000;p.populationCap=300;p.popUsed=p.workers;
  }
  return g;
}
function complete(g,raw,playerId=0){
  const p=g.state.players[playerId],def=unit(raw);assert.ok(def,`source unit ${raw}`);
  const index=p.buildings.length,b={id:g._uid('b'),unitId:def.id,col:index%6,row:Math.floor(index/6),construction:{targetId:def.id}};
  p.buildings.push(b);g._completeConstruction(p,b);assert.equal(b.construction,null);
  return b;
}
function maxHero(g,family='h0DE'){
  const p=g.state.players[0];
  // Reserve both real source altars. Training at the lifetime cap must replace
  // the existing handle without buying or reserving a third hero.
  for(let col=0;col<2;col++){ok(g.command('build',{unitId:unit('h0DB').id,col,row:0}));}
  for(const b of p.buildings)g._completeConstruction(p,b);
  const b=p.buildings[0];
  const stages=current.filter(u=>u.heroFamily===family&&u.heroStage>0&&!u.trainingOnly).sort((a,b)=>a.heroStage-b.heroStage);
  assert.equal(stages.length,11);
  for(const def of stages){
    ok(g.command('upgrade',{buildingId:b.id,unitId:def.id}));
    assert.ok(b.construction);g._completeConstruction(p,b);
  }
  assert.equal(g.heroStatus().count,2);assert.equal(g.heroStatus().remaining,0);
  assert.equal(byId.get(b.unitId).heroStage,11);
  return b;
}
function prerequisites(g){
  // Actual completion hooks grant five source recipes; no recipe technology
  // is written directly. These finished units also supply real military value.
  for(const raw of ['h0D2','h0CS','h09S','n07H','h01L','h047'])complete(g,raw);
  const p=g.state.players[0];
  for(const raw of ['R0HS','R0HM','R01D','R0D2','R05E'])assert.equal(p.technologies[raw],1,raw);
  assert.ok(g._military(p)>=2000);
}
function grant(g){
  ok(g.command('sandboxBoxTraining'));
  const reward=g.state.players[0].boxRewards;
  assert.equal(reward.tier,'box');assert.equal(reward.consumed,false);
  assert.deepEqual(reward.abilityIds,['A2ZA','A133','A134']);
  return reward;
}
function targetStatus(g,b,raw,playerId=0){
  return g.boxTrainingStatus(b.id,playerId).targets.find(t=>t.unitId===unit(raw).id);
}
function train(g,b,raw,playerId=0){return g.command('boxTrain',{buildingId:b.id,unitId:unit(raw).id,playerId});}
const assets=g=>clone(g.state.players.map(p=>({gold:p.gold,wood:p.wood,buildings:p.buildings,boxRewards:p.boxRewards,heroAltarCount:p.heroAltarCount,eggHistory:p.eggHistory,technologies:p.technologies})));
function rejectsUnchanged(g,run){const before=assets(g),result=run();assert.equal(result.ok,false,result.message);assert.deepEqual(assets(g),before);return result;}

test('normal round six grants one source reward pool and round thirteen replaces it once, including save continuation',()=>{
  const g=fixture('normal'),p=g.state.players[0];
  p.controller='user';g.state.players[1].controller='computer';g.state.players[2].slotState='left';
  g.state.wave=5;g.state.phase='combat';g._endCombat();assert.equal(p.boxRewards,undefined);
  g.state.phase='combat';g._endCombat();
  const first=clone(p.boxRewards);
  assert.equal(first.ownerId,0);assert.equal(first.providerRawcode,'n060');assert.equal(first.tier,'box');assert.equal(first.sourceWave,6);
  assert.equal(first.abilityIds.length,3);assert.equal(new Set(first.abilityIds).size,3);
  assert.ok(first.abilityIds.every(id=>BOX_RUNTIME_RULES.pools.box.includes(id)));
  assert.equal(g.state.players[1].boxRewards,undefined);assert.equal(g.state.players[2].boxRewards,undefined);
  const restored=Game.fromSnapshot(g.snapshot());restored._aiAct=()=>{};
  assert.deepEqual(restored.state.players[0].boxRewards,first);
  restored.state.wave=6;restored.state.phase='combat';restored._endCombat();
  assert.deepEqual(restored.state.players[0].boxRewards,first,'a repeated first threshold must not reroll');
  restored.state.wave=12;restored.state.phase='combat';restored._endCombat();
  assert.equal(restored.state.players[0].boxRewards.tier,'box');
  restored.state.phase='combat';restored._endCombat();
  const second=clone(restored.state.players[0].boxRewards);
  assert.equal(second.tier,'box2');assert.equal(second.sourceWave,13);
  assert.equal(second.providerId,first.providerId);assert.equal(second.abilityIds.length,3);
  assert.ok(second.abilityIds.every(id=>BOX_RUNTIME_RULES.pools.box2.includes(id)));
  assert.ok(!second.abilityIds.includes('A2ZA'));
  restored.state.wave=13;restored.state.phase='combat';restored._endCombat();
  assert.deepEqual(restored.state.players[0].boxRewards,second,'a repeated second threshold must not reroll');
});

test('sandbox round clearing never rolls rewards while the explicit training grant stays sandbox-only',()=>{
  const g=fixture();
  for(const wave of [6,13]){g.state.wave=wave;g.state.phase='combat';g._endCombat();assert.equal(g.state.players[0].boxRewards,undefined);}
  grant(g);
  const normal=fixture('normal');rejectsUnchanged(normal,()=>normal.command('sandboxBoxTraining'));
});

test('n02S requires original bone-dragon completion and 2000 actual military but no sponsor marker',()=>{
  const g=fixture(),b=maxHero(g),p=g.state.players[0];grant(g);
  assert.equal(targetStatus(g,b,'n02S').canStart,false);
  complete(g,'h2A3');assert.equal(p.technologies.R0HS??0,0,'appearance completion cannot grant this raw-source recipe');
  assert.equal(targetStatus(g,b,'n02S').canStart,false);
  complete(g,'h0D2');assert.equal(p.technologies.R0HS,1);
  assert.ok(g._military(p)<2000);assert.equal(targetStatus(g,b,'n02S').canStart,false);
  rejectsUnchanged(g,()=>train(g,b,'n02S'));
  for(const raw of ['n07H','h01L','h047'])complete(g,raw);
  assert.ok(g._military(p)>=2000);assert.equal(p.entitlements.h220,undefined);
  assert.equal(targetStatus(g,b,'n02S').canStart,true);
  assert.deepEqual({gold:targetStatus(g,b,'n02S').cost.gold,wood:targetStatus(g,b,'n02S').cost.wood},{gold:120,wood:0});
  const before=p.gold,count=p.heroAltarCount;ok(train(g,b,'n02S'));
  assert.equal(p.gold,before-120);assert.equal(p.heroAltarCount,count);
  assert.ok(p.buildings.some(next=>next.unitId===unit('n02S').id));
});

test('the other four training leaves stay locked without h220 after real recipe completions and use exact target prices',()=>{
  for(const [raw,family,gold] of [['n08Y','h0DE',242],['n08Z','h0DE',202],['n05H','h0HC',260],['n07I','h0U3',200]]){
    const g=fixture(),b=maxHero(g,family),p=g.state.players[0];prerequisites(g);grant(g);
    assert.equal(targetStatus(g,b,raw).canStart,false,raw);
    rejectsUnchanged(g,()=>train(g,b,raw));
    ok(g.command('sandboxQualification',{key:'h220',enabled:true}));
    const status=targetStatus(g,b,raw);assert.equal(status.canStart,true,status.reason);assert.deepEqual({gold:status.cost.gold,wood:status.cost.wood},{gold,wood:0});
    const before={gold:p.gold,wood:p.wood,count:p.heroAltarCount,buildingCount:p.buildings.length,col:b.col,row:b.row};
    ok(train(g,b,raw));
    assert.equal(p.gold,before.gold-gold);assert.equal(p.wood,before.wood);assert.equal(p.heroAltarCount,before.count);
    assert.equal(p.buildings.length,before.buildingCount);assert.ok(!p.buildings.includes(b));
    const replacement=p.buildings.find(next=>next.unitId===unit(raw).id);
    assert.ok(replacement);assert.notEqual(replacement.id,b.id);
    assert.equal(replacement.col,before.col);assert.equal(replacement.row,before.row);assert.ok(!replacement.construction);
  }
});

test('training replaces a capped altar-family hero immediately above population cap and resets arbitrary persistent enhancements',()=>{
  const g=fixture(),b=maxHero(g),p=g.state.players[0];prerequisites(g);grant(g);
  Object.assign(b,{treasureArmor:50,garroshArmorLevel:8,garroshAttackLevel:7,illidanSoulLevel:6,trollAttackLevel:5,trollHasteLevel:4,
    abilityLevels:{A1A0:8,A1A7:7,A1BD:6,A15D:5,A15F:4},permanentAbilityIds:['A2ZG','A138'],builtWave:g.state.wave,
    limitOrigins:['h06K','n079'],baseId:'n079',userData:123});
  const origins=clone(b.limitOrigins),count=p.heroAltarCount,length=p.buildings.length,beforeGold=p.gold;
  p.populationCap=p.workers;
  assert.equal(targetStatus(g,b,'n02S').canStart,true);
  ok(train(g,b,'n02S'));
  const replacement=p.buildings.find(next=>next.unitId===unit('n02S').id);
  assert.notEqual(replacement.id,b.id);assert.equal(p.buildings.length,length);assert.equal(p.heroAltarCount,count);
  assert.equal(replacement.builtWave,null);assert.equal(replacement.construction??null,null);
  assert.deepEqual(replacement.limitOrigins,origins);assert.equal(replacement.baseId,'n079');assert.equal(replacement.userData,123);
  for(const key of ['treasureArmor','garroshArmorLevel','garroshAttackLevel','illidanSoulLevel','trollAttackLevel','trollHasteLevel'])assert.ok(!replacement[key],key);
  assert.ok(!replacement.abilityLevels||Object.keys(replacement.abilityLevels).length===0);
  assert.deepEqual(replacement.permanentAbilityIds,['A2ZG'],'only the explicitly copied source permanent ability survives');
  assert.equal(p.gold,beforeGold-120);assert.ok(p.popUsed>p.populationCap);
  assert.equal(p.boxRewards.consumed,true);assert.deepEqual(p.boxRewards.abilityIds,[]);assert.equal(p.boxRewards.selectedAbilityId,'A2ZA');
});

test('invalid ownership, branch, resource and missing-reward requests are atomic and ordinary upgrade cannot expose the five leaves',()=>{
  const g=fixture(),b=maxHero(g),p=g.state.players[0];prerequisites(g);
  assert.equal(g.boxTrainingStatus(b.id).canStart,false);
  rejectsUnchanged(g,()=>train(g,b,'n02S'));
  grant(g);
  for(const payload of [
    {buildingId:'missing',unitId:unit('n02S').id},
    {buildingId:b.id,unitId:unit('n02S').id,playerId:1},
    {buildingId:b.id,unitId:'v14_N02S'},
    {buildingId:b.id,unitId:unit('n05H').id},
  ])rejectsUnchanged(g,()=>g.command('boxTrain',payload));
  for(const raw of ['n02S','n08Y','n08Z'])rejectsUnchanged(g,()=>g.command('upgrade',{buildingId:b.id,unitId:unit(raw).id}));
  for(const raw of BOX_TRAINING_RULES.importedRawcodes)rejectsUnchanged(g,()=>g.command('build',{unitId:unit(raw).id,col:5,row:7}));
  p.gold=119;assert.equal(targetStatus(g,b,'n02S').canStart,false);
  rejectsUnchanged(g,()=>train(g,b,'n02S'));
  p.gold=120;assert.equal(targetStatus(g,b,'n02S').canStart,true);
  assert.equal(p.boxRewards.consumed,false);assert.deepEqual(p.boxRewards.abilityIds,['A2ZA','A133','A134']);
});

test('training applies the dedicated saved-count limit and excludes the replaced handle, without importing BAN-only caps',()=>{
  const g=fixture(),p=g.state.players[0],b=complete(g,'n076');grant(g);
  // n077 has an actual RegisterBudingLimitEx saved count of five.
  for(let n=0;n<5;n++)complete(g,'n077');
  assert.equal(BOX_TRAINING_RULES.targetLimits.n077.count,5);
  assert.equal(targetStatus(g,b,'n077').canStart,false);
  rejectsUnchanged(g,()=>train(g,b,'n077'));
  const other=p.buildings.find(building=>building.id!==b.id&&building.unitId===unit('n077').id);
  p.buildings=p.buildings.filter(building=>building!==other);
  b.limitOrigins=['n077'];assert.equal(targetStatus(g,b,'n077').canStart,true,'the old target is excluded from the count');
  ok(train(g,b,'n077'));
  assert.equal(p.buildings.filter(building=>building.unitId===unit('n077').id).length,5);

  const heroes=fixture(),hero=maxHero(heroes),owner=heroes.state.players[0];prerequisites(heroes);grant(heroes);
  complete(heroes,'n02S');assert.equal(owner.buildings.filter(building=>building.unitId===unit('n02S').id).length,1);
  assert.equal(BOX_TRAINING_RULES.targetLimits.n02S,undefined);
  assert.equal(heroes.buildLimitStatus(unit('n02S').id).canStart,false,'normal max-allowed remains separate');
  assert.equal(targetStatus(heroes,hero,'n02S').canStart,true,'BoxGift has no saved-count check for the BAN-only type');
});

test('an unfinished source upgrade can be trained and its paid construction job is discarded rather than inherited',()=>{
  const g=fixture(),p=g.state.players[0],b=complete(g,'n076');grant(g);
  ok(g.command('upgrade',{buildingId:b.id,unitId:unit('n077').id}));
  const order=clone(b.construction);assert.equal(b.unitId,unit('n076').id);assert.ok(order);
  assert.equal(targetStatus(g,b,'n077').canStart,true);
  const gold=p.gold,oldId=b.id;ok(train(g,b,'n077'));
  const replacement=p.buildings.find(next=>next.unitId===unit('n077').id);
  assert.ok(replacement);assert.notEqual(replacement.id,oldId);assert.ok(!replacement.construction);
  near(p.gold,gold-48);
  const before=clone(replacement);g._advanceEconomy(p,g.state.time,order.finishAt+10);
  assert.deepEqual(clone(replacement),before,'discarded construction cannot complete a second time');
  assert.equal(p.buildings.length,1);
});

test('pending upgrades reserve the normal menu cap but are not counted as the future type by the native training helper',()=>{
  const g=fixture(),p=g.state.players[0],b=complete(g,'n076');
  const pending=Array.from({length:5},()=>complete(g,'n076'));
  for(const other of pending){ok(g.command('upgrade',{buildingId:other.id,unitId:unit('n077').id}));assert.ok(other.construction);}
  assert.equal(g.buildLimitStatus(unit('n077').id).canStart,false);
  assert.equal(p.buildings.filter(other=>other.unitId===unit('n077').id).length,0);
  grant(g);assert.equal(targetStatus(g,b,'n077').canStart,true);
  ok(train(g,b,'n077'));
  assert.equal(p.buildings.filter(other=>other.unitId===unit('n077').id).length,1);
  assert.ok(pending.every(other=>other.construction?.targetId===unit('n077').id));
});

test('native training charges both target resources at forty percent and an insufficient wood balance consumes nothing',()=>{
  const g=fixture(),p=g.state.players[0];maxHero(g,'h0EJ');
  const b=complete(g,'h08Y');complete(g,'h01O');assert.equal(p.technologies.R2YA,1);
  ok(g.command('sandboxQualification',{key:'h220',enabled:true}));grant(g);
  p.gold=320;p.wood=23;
  assert.equal(targetStatus(g,b,'h0YM').canStart,false);rejectsUnchanged(g,()=>train(g,b,'h0YM'));
  p.wood=24;assert.deepEqual({gold:targetStatus(g,b,'h0YM').cost.gold,wood:targetStatus(g,b,'h0YM').cost.wood},{gold:320,wood:24});
  assert.equal(targetStatus(g,b,'h0YM').canStart,true);ok(train(g,b,'h0YM'));
  assert.equal(p.gold,0);assert.equal(p.wood,0);
});

test('a saved reward can be consumed once and restored consumption cannot replay against a new or old handle',()=>{
  const original=fixture(),b=maxHero(original);prerequisites(original);grant(original);
  const saved=original.snapshot(),g=Game.fromSnapshot(saved),p=g.state.players[0];
  const old=p.buildings.find(next=>next.id===b.id),reward=clone(p.boxRewards);
  assert.deepEqual(p.boxRewards,reward);assert.equal(targetStatus(g,old,'n02S').canStart,true);
  ok(train(g,old,'n02S'));
  const replacement=p.buildings.find(next=>next.unitId===unit('n02S').id),once=g.snapshot();
  const restored=Game.fromSnapshot(once);
  assert.equal(restored.state.players[0].boxRewards.consumed,true);
  assert.deepEqual(restored.state.players[0].boxRewards.abilityIds,[]);
  rejectsUnchanged(restored,()=>restored.command('boxTrain',{buildingId:b.id,unitId:unit('n02S').id}));
  rejectsUnchanged(restored,()=>restored.command('boxTrain',{buildingId:replacement.id,unitId:unit('n02S').id}));
  assert.equal(restored.state.players[0].buildings.filter(next=>next.unitId===unit('n02S').id).length,1);
});
