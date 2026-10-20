import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {UNITS,UNIT_TEMPLATES} from '../dist/data.js';
import {V14_BOX_TRAINING_RULES,V14_ABILITIES} from '../dist/v14-reference.js';
import {BOX_TRAINING_RULES,BOX_REWARD_RULES,BOX_FARM_STAGES,BOX_FARM_RULES,boxFarmUpgradeStatus,rollBoxRewards,advanceBoxRewards,migrateBoxRewardProgress,
  boxTrainingRewardStatus,consumeBoxTrainingReward,boxTrainingCost,boxTrainingTargetStatus,boxTrainingReplacementState,
  claimBoxReward,completeBoxSwap,boxBuildFreeRefund} from '../dist/box-training-rules.js';

const source=readFileSync(new URL('../reference/v14-source/raw_extracted/war3map.j',import.meta.url),'utf8');
const player=(id=0)=>({id,gold:1000,wood:1000,buildings:[],technologies:{u004:1},entitlements:{},stats:{goldEarned:0}});
function trainingFixture(code='h010',next='h011'){
  const p=player(),target={id:'b1',unitId:`v14_${code}`,col:0,row:0};p.buildings=[target];
  p.boxRewards={providerId:'box0',providerRawcode:'n060',ownerId:0,tier:'box',abilityIds:['A2ZA','A133','A134'],sourceWave:6,consumed:false};
  return {p,target,provider:{id:'box0',ownerId:0},def:UNIT_TEMPLATES[next]};
}
function rewardFixture(id){const p=player();p.boxRewards={providerId:'box0',providerRawcode:'n060',ownerId:0,tier:BOX_REWARD_RULES[id].tier,abilityIds:[id],consumed:false};return {p,game:{state:{players:[p],wave:6}}};}

test('farm stages follow the literal source next registrations with native food, cost and construction time',()=>{
  const registrations=[...source.matchAll(/call SaveInteger\(O,\$([0-9A-F]{8}),StringHash\("next"\),\$([0-9A-F]{8})\)/g)]
    .map(m=>[Buffer.from(m[1],'hex').toString('ascii'),Buffer.from(m[2],'hex').toString('ascii')]);
  assert.deepEqual(BOX_FARM_STAGES.filter(s=>s.nextRawcode).map(s=>[s.rawcode,s.nextRawcode]),registrations);
  assert.equal(BOX_FARM_STAGES.length,15);assert.equal(BOX_FARM_RULES.initialRawcode,'h024');
  assert.deepEqual(BOX_FARM_STAGES.map(s=>s.foodMade),[8,16,24,32,40,48,56,64,72,100,120,140,160,180,300]);
  assert.equal(BOX_FARM_RULES.byRawcode.h099,undefined,'an omitted 80-food native farm must not be silently inserted');
  const lines=source.split(/\r?\n/);
  for(const stage of BOX_FARM_STAGES){
    const template=UNIT_TEMPLATES[stage.rawcode],f=template.sourceRawFields;
    assert.equal(stage.foodMade,Number(f.fmade));assert.deepEqual(stage.cost,{gold:Number(f.goldcost??0),wood:Number(f.lumbercost??0)});
    assert.equal(stage.buildTimeSeconds,Number(f.bldtm));assert.equal(stage.source.nativeRow,template.source.row);
    if(stage.nextRawcode){const next=UNIT_TEMPLATES[stage.nextRawcode].sourceRawFields;assert.equal(stage.populationDelta,Number(next.fmade)-Number(f.fmade));assert.equal(stage.upgradeBuildTimeSeconds,Number(next.bldtm));assert.match(lines[stage.source.nextLine-1],/StringHash\("next"\)/);}
    else{assert.equal(stage.populationDelta,0);assert.equal(stage.upgradeCost,null);}
  }
  assert.deepEqual(BOX_FARM_RULES.byRawcode.h09A.cost,{gold:60,wood:200});assert.deepEqual(BOX_FARM_RULES.byRawcode.h0A1.cost,{gold:360,wood:1200});
  for(const line of BOX_FARM_RULES.initialCreateLines)assert.match(lines[line-1],/set Hl\[\d\]=CreateUnit\(h,\$68303234,/);
  assert.match(lines[BOX_FARM_RULES.source.foodCeilingLine-1],/PLAYER_STATE_FOOD_CAP_CEILING,300/);
});

test('farm reward status requires an explicit prototype and returns variable source increments without inferring total population',()=>{
  for(const [rawcode,delta,next]of [['h024',8,'h08C'],['h098',28,'h09A'],['h09A',20,'h0A6'],['h0A4',120,'h0A1']]){
    const p={...player(),sourceFarmRawcode:rawcode,populationCap:299};
    const before=JSON.stringify(p),status=boxFarmUpgradeStatus(p);assert.equal(status.canStart,true);assert.equal(status.populationDelta,delta);assert.equal(status.nextRawcode,next);assert.deepEqual(status.cost,{gold:0,wood:0});assert.equal(status.immediate,true);assert.equal(JSON.stringify(p),before);
  }
  for(const p of [{populationCap:15},{populationCap:79},{sourceFarmRawcode:'h099',populationCap:87},{sourceFarmRawcode:'h0A1',populationCap:300}])assert.equal(boxFarmUpgradeStatus(p).canStart,false);
  assert.equal(BOX_REWARD_RULES.A131.status,'partial');assert.match(BOX_FARM_RULES.legacyMigration,/never-infer/);
});

test('upgrade-in-progress replacement is explicitly unresolved and a refused farm reward leaves all choices available',()=>{
  const {p,game}=rewardFixture('A131');p.sourceFarmRawcode='h024';p.economyTasks={farmTask:{finishAt:10,targetRawcode:'h08C'}};
  const before=JSON.stringify(p),status=boxFarmUpgradeStatus(p);assert.equal(status.canStart,false);assert.match(status.reason,/正在升级/);
  assert.equal(claimBoxReward(game,p,'A131',{}, {upFarm:()=>status.canStart}).ok,false);assert.equal(JSON.stringify(p),before);
  assert.equal(BOX_FARM_RULES.replacement.removesOldHandle,true);assert.equal(BOX_FARM_RULES.replacement.scriptTransfersNativeUpgradeJob,false);assert.equal(BOX_FARM_RULES.replacement.status,'partial');
  assert.equal(BOX_FARM_RULES.ordinaryPaidUpgrade.sameNextChainProven,false);assert.equal(BOX_FARM_RULES.ordinaryPaidUpgrade.status,'partial');
  const upFarm=source.match(/function UpFarm takes[\s\S]*?endfunction/)[0],replace=source.match(/function YDWEReplaceUnitBJNull takes[\s\S]*?endfunction/)[0];
  assert.match(upFarm,/YDWEReplaceUnitBJNull\(FirstOfGroup\(DG\),Yr,1\)/);assert.doesNotMatch(upFarm,/GetUnitCurrentOrder|UPGRADE|tech_loding/);
  assert.match(replace,/CreateUnit\(GetOwningPlayer\(Kr\),Ko,/);assert.match(replace,/call RemoveUnit\(Kr\)/);assert.doesNotMatch(replace,/GetUnitCurrentOrder|Issue.*Order|Refund|UPGRADE/);
  delete p.economyTasks.farmTask;assert.equal(boxFarmUpgradeStatus(p).canStart,true);
});

test('training metadata uses the literal independent tree and full first/second reward pools rather than treasure rewards',()=>{
  assert.equal(BOX_TRAINING_RULES.abilityId,'A2ZA');assert.deepEqual(BOX_TRAINING_RULES.providerRawcodes,['n060']);
  assert.equal(BOX_TRAINING_RULES.pools.box.length,12);assert.equal(BOX_TRAINING_RULES.pools.box2.length,7);
  assert.equal(BOX_TRAINING_RULES.pools.box.includes('A2ZA'),true);assert.equal(BOX_TRAINING_RULES.pools.box2.includes('A2ZA'),false);
  assert.deepEqual(BOX_TRAINING_RULES.selections,V14_BOX_TRAINING_RULES.selections);
  assert.equal(Object.keys(BOX_REWARD_RULES).length,19);
  for(const [id,r]of Object.entries(BOX_REWARD_RULES)){assert.equal(r.name,V14_ABILITIES[id].name);assert.ok(r.handler&&r.targetKind&&r.description);}
  assert.equal(BOX_REWARD_RULES.A13M.handler,'builderAbility');assert.equal(BOX_REWARD_RULES.A13S.handler,'builderAbility');
});

test('source roll preserves 20 retry collision fallback and three distinct rewards without forcing training',()=>{
  let draws=0;assert.deepEqual(rollBoxRewards(()=>{draws++;return 0;}),['A131','A132','A133']);assert.equal(draws,41);
  const seq=[7/12,2/12,3/12];assert.deepEqual(rollBoxRewards(()=>seq.shift()),['A2ZA','A133','A134']);
});

test('FightFinish reveals n060 rewards once after six, replaces unused training at thirteen and never grants on ordinary earlier waves',()=>{
  const p=player(),q=player(1);q.controller='computer';const game={state:{wave:6,players:[p,q]},_random:()=>7/12};
  assert.equal(advanceBoxRewards(game,5).length,0);assert.equal(p.boxRewards,undefined);
  assert.equal(advanceBoxRewards(game,6).length,1);assert.ok(p.boxRewards.abilityIds.includes('A2ZA'));assert.equal(q.boxRewards,undefined);
  assert.equal(advanceBoxRewards(game,12).length,0);const id=p.boxRewards.providerId;
  assert.equal(advanceBoxRewards(game,13).length,1);assert.equal(p.boxRewards.tier,'box2');assert.equal(p.boxRewards.providerId,id);
  assert.equal(boxTrainingRewardStatus(p).available,false);assert.equal(advanceBoxRewards(game,20).length,0);
});

test('late first FightFinish runs the two global phases in source order and saved flags prevent rerolls',()=>{
  const p=player(),q=player(1),game={state:{wave:14,players:[p,q]},_random:()=>0};let draws=0;game._random=()=>{draws++;return 0;};
  const grants=advanceBoxRewards(game,14);assert.deepEqual(grants.map(g=>[g.playerId,g.tier]),[[0,'box'],[1,'box'],[0,'box2'],[1,'box2']]);
  assert.equal(draws,164);assert.equal(p.boxRewards.reforgeAvailable,false);
  const restored={state:JSON.parse(JSON.stringify(game.state)),_random:()=>{throw new Error('should not reroll');}};
  assert.equal(advanceBoxRewards(restored,15).length,0);assert.deepEqual(restored.state,game.state);
});

test('legacy migration uses existing holder evidence or conservative clear-wave flags without inventing consumed choices',()=>{
  const p=player(),game={state:{wave:10,players:[p]}};
  assert.deepEqual(migrateBoxRewardProgress(game,{legacySnapshot:true}),{firstGranted:true,secondGranted:false,migration:'legacy-history-unknown-no-reroll'});
  assert.equal(p.boxRewards,undefined);assert.equal(advanceBoxRewards({...game,_random:()=>0},10).length,0);
  const early={state:{wave:6,players:[player()]}};assert.deepEqual(migrateBoxRewardProgress(early,{legacySnapshot:true}),{firstGranted:false,secondGranted:false});
  const known={state:{wave:8,players:[{...player(),boxRewards:{tier:'box2',sourceWave:13,consumed:true}}]}};
  assert.deepEqual(migrateBoxRewardProgress(known,{legacySnapshot:true}),{firstGranted:true,secondGranted:true});
});

test('source building cost wins over combat aliases and integer gold/wood fees are separately truncated',()=>{
  for(const [raw,gold]of [['n08Y',242],['h011',32]]){
    const def=UNITS.find(u=>u.sourceRawcode===raw);assert.ok(def);
    assert.equal(boxTrainingCost(def).gold,gold);assert.equal(boxTrainingCost(UNIT_TEMPLATES[raw]).gold,gold);
  }
  assert.deepEqual(boxTrainingCost({buildingRawFields:{goldcost:'101',lumbercost:'29'},sourceRawFields:{goldcost:'999'}}),{gold:40,wood:11,sourceGoldCost:101,sourceWoodCost:29,valid:true});
  assert.equal(boxTrainingCost({}).valid,false);
});

test('owned persistent unfinished units remain eligible without population checks and a Web hero label is not native UNIT_TYPE_HERO',()=>{
  const {p,target,provider,def}=trainingFixture();p.popUsed=999;p.populationCap=1;target.construction={finishAt:999};target.hero=true;
  const status=boxTrainingTargetStatus(p,provider,target,def);assert.equal(status.ok,true);assert.equal(status.fee.gold,32);
  target.isNativeHero=true;assert.equal(boxTrainingTargetStatus(p,provider,target,def).ok,false);target.isNativeHero=false;
  target.hp=0;assert.equal(boxTrainingTargetStatus(p,provider,target,def).ok,false);delete target.hp;
  target.ownerId=1;assert.equal(boxTrainingTargetStatus(p,provider,target,def).ok,false);
});

test('invalid provider, missing reward, self target, unregistered path, source tech and insufficient resources do not consume anything',()=>{
  const {p,target,provider,def}=trainingFixture();const before=JSON.stringify(p.boxRewards);
  assert.equal(boxTrainingTargetStatus(p,{...provider,id:'other'},target,def).ok,false);
  assert.equal(boxTrainingTargetStatus(p,provider,{...target,id:provider.id,ownerId:0},def).ok,false);
  assert.equal(boxTrainingTargetStatus(p,provider,target,UNIT_TEMPLATES.n08Y).ok,false);
  p.technologies={};assert.equal(boxTrainingTargetStatus(p,provider,target,def).ok,false);p.technologies.u004=1;
  p.gold=31;assert.equal(boxTrainingTargetStatus(p,provider,target,def).ok,false);p.gold=32;
  assert.equal(boxTrainingTargetStatus(p,provider,target,def).ok,true);assert.equal(JSON.stringify(p.boxRewards),before);
});

test('source saved-count limits exclude the replaced unit, use lineage when permitted and never substitute ordinary BAN caps',()=>{
  const sourceRaw=Object.values(V14_BOX_TRAINING_RULES.selections).find(s=>s.rawTargets.includes('n08Y')).sourceRawcode;
  const {p,target,provider,def}=trainingFixture(sourceRaw,'n08Y');const api={techCount:()=>1};
  assert.equal(boxTrainingTargetStatus(p,provider,target,def,api).ok,true);
  p.buildings.push({id:'other',unitId:'v14_h0OTHER',limitOrigins:['n08Y']});assert.equal(boxTrainingTargetStatus(p,provider,target,def,api).ok,false);
  p.buildings[1].hp=0;assert.equal(boxTrainingTargetStatus(p,provider,target,def,api).ok,true);
  const noLimitRaw=Object.values(V14_BOX_TRAINING_RULES.selections).find(s=>s.rawTargets.includes('n02S')).sourceRawcode;
  const x=trainingFixture(noLimitRaw,'n02S');x.p.gold=100000;
  assert.equal(boxTrainingTargetStatus(x.p,x.provider,x.target,x.def,{techCount:()=>1,limitReady:()=>{throw new Error('BAN cap is not a training saved count');}}).ok,true);
});

test('successful training consumes the entire offered first pool exactly once',()=>{
  const {p}=trainingFixture();assert.equal(boxTrainingRewardStatus(p).available,true);
  assert.equal(consumeBoxTrainingReward(p),true);assert.deepEqual(p.boxRewards.abilityIds,[]);assert.equal(p.boxRewards.selectedAbilityId,'A2ZA');
  assert.equal(consumeBoxTrainingReward(p),false);
});

test('replacement preserves only relative state, userdata, explicit QC and lineage, and drops same-wave sale and arbitrary hero modifiers',()=>{
  const old={hp:250,maxHp:1000,mana:10,maxMana:40,userData:3,worldX:5,worldY:7,facing:90,resourceAmount:17,
    boxAbilityIds:['A2ZG','A13Y'],limitOrigins:['h06K'],baseId:'h06K',limitidEx:false,builtWave:6,trollAttackLevel:50,treasureArmor:30};
  const next={buildingRawFields:{HP:'2000',manaN:'100',mana0:'7'}};const result=boxTrainingReplacementState(old,next);
  assert.equal(result.hp,500);assert.equal(result.mana,25);assert.equal(result.userData,3);assert.deepEqual(result.permanentAbilityIds,['A2ZG']);
  assert.deepEqual(result.limitOrigins,['h06K']);assert.notEqual(result.limitOrigins,old.limitOrigins);assert.equal(result.builtWave,null);
  for(const key of ['trollAttackLevel','treasureArmor','boxAbilityIds'])assert.equal(result[key],undefined);
  assert.equal(boxTrainingReplacementState({...old,maxMana:0},next).mana,7,'no old mana pool retains the newly created native default');
});

test('resource reward amounts are the literal first/second pool values and consume other choices',()=>{
  for(const [id,field,amount]of [['A133','gold',50],['A134','wood',150],['A13O','gold',300],['A13P','wood',800]]){
    const {p,game}=rewardFixture(id);const before=p[field];p.boxRewards.abilityIds.push(id==='A133'?'A2ZA':id);
    assert.equal(claimBoxReward(game,p,id).ok,true);assert.equal(p[field],before+amount);assert.deepEqual(p.boxRewards.abilityIds,[]);
    assert.equal(claimBoxReward(game,p,id).ok,false);assert.equal(p[field],before+amount);
  }
});

test('farm/lumber full or missing builder native effects never consume a choice, successful existing host operations do',()=>{
  for(const [id,hook]of [['A131','upFarm'],['A140','upLumbering']]){
    const {p,game}=rewardFixture(id);assert.equal(claimBoxReward(game,p,id,{}, {[hook]:()=>false}).ok,false);assert.equal(p.boxRewards.consumed,false);
    assert.equal(claimBoxReward(game,p,id,{}, {[hook]:()=>true}).ok,true);assert.equal(p.boxRewards.consumed,true);
  }
  for(const id of ['A13M','A13S']){const {p,game}=rewardFixture(id);assert.equal(claimBoxReward(game,p,id).ok,false);assert.equal(p.boxRewards.consumed,false);}
});

test('unit ability reward transfers exact native identifiers through the host and validates ancient ownership instead of granting a king bonus',()=>{
  const {p,game}=rewardFixture('A13Q'),target={id:'b',unitId:'v14_h010'};p.buildings=[target];let given;
  assert.equal(claimBoxReward(game,p,'A13Q',{target},{grantAbilities:(owner,unit,ids)=>{assert.equal(owner,p);assert.equal(unit,target);given=ids;return true;}}).ok,true);
  assert.deepEqual(given,['A13U','A13T','A13V']);assert.equal(BOX_REWARD_RULES.A13Q.description.includes('每秒40'),true);
  const shield=rewardFixture('A2ZC');assert.equal(claimBoxReward(shield.game,shield.p,'A2ZC',{target:{id:'box0',ownerId:0}},{grantAbilities:()=>true}).ok,false);
});

test('random fighter rewards require a successful native creation host and convey actual tier and position payload',()=>{
  for(const [id,tier]of [['A132',3],['A13N',6]]){
    const {p,game}=rewardFixture(id),payload={col:2,row:3};
    assert.equal(claimBoxReward(game,p,id,payload,{grantRandomFighter:()=>false}).ok,false);
    assert.equal(claimBoxReward(game,p,id,payload,{grantRandomFighter:(owner,tierValue,body)=>{assert.equal(owner,p);assert.equal(tierValue,tier);assert.equal(body,payload);return true;}}).ok,true);
  }
});

test('swap consumes on first valid ancient, retains an invalid second pick and clears only after successful swap or first-target loss',()=>{
  const {p,game}=rewardFixture('A2ZD'),a={id:'a',unitId:'v14_h010'},b={id:'b',unitId:'v14_h011'};p.buildings=[a,b];
  assert.equal(claimBoxReward(game,p,'A2ZD',{target:a}).ok,true);assert.equal(p.boxRewards.consumed,true);
  assert.equal(completeBoxSwap(game,p,a,{swap:()=>true}).ok,false);assert.ok(p.boxSwap);
  assert.equal(completeBoxSwap(game,p,b,{swap:()=>false}).ok,false);assert.ok(p.boxSwap);
  assert.equal(completeBoxSwap(game,p,b,{swap:()=>true}).ok,true);assert.equal(p.boxSwap,undefined);
  p.boxSwap={providerId:'box0',firstTargetId:a.id};p.buildings=[b];assert.equal(completeBoxSwap(game,p,b).ok,false);assert.equal(p.boxSwap,undefined);
});

test('demolition follows point value and zero wood and rejects TAUREN instead of refunding tooltip costs',()=>{
  const {p,game}=rewardFixture('A2ZE'),target={id:'b',unitId:'v14_h010'};p.buildings=[target];let refund;
  assert.equal(claimBoxReward(game,p,'A2ZE',{target},{demolish:(owner,unit,value)=>{refund=value;return true;}}).ok,true);
  assert.deepEqual(refund,{gold:Number(UNIT_TEMPLATES.h010.sourceRawFields.points),wood:0});
  const banned=rewardFixture('A2ZE'),tauren={id:'b',unitId:'v14_h010',traits:['tauren']};banned.p.buildings=[tauren];
  assert.equal(claimBoxReward(banned.game,banned.p,'A2ZE',{target:tauren},{demolish:()=>true}).ok,false);
});

test('free reward is a boolean and source precedence refunds positive worker gold without a coupon only at the three actual call sites',()=>{
  const {p,game}=rewardFixture('A2ZB');assert.equal(claimBoxReward(game,p,'A2ZB').ok,true);assert.equal(p.boxBuildFreeOnce,true);
  p.boxBuildFreeOnce=false;const gold=p.gold;
  assert.equal(boxBuildFreeRefund(p,50,0,{context:'native-worker',rawcode:'e003'}).refunded,true);assert.equal(p.gold,gold+50);
  assert.equal(boxBuildFreeRefund(p,50,0,{context:'ordinary-building-upgrade'}).refunded,false);
  assert.equal(boxBuildFreeRefund(p,50,0,{context:'frame-tech',rawcode:'R000'}).refunded,false);
  assert.equal(boxBuildFreeRefund(p,0,100,{context:'frame-tech',rawcode:'R003'}).refunded,false);
  p.boxBuildFreeOnce=true;assert.equal(boxBuildFreeRefund(p,0,100,{context:'frame-tech',rawcode:'R003'}).refunded,true);assert.equal(p.boxBuildFreeOnce,false);
});

test('raw source evidence ties rewards to FightFinish and n060 and preserves actual training/consumption/replacement contracts',()=>{
  assert.match(source,/function FightFinish[\s\S]*?if Of>=6 then[\s\S]*?call InitBoxSkillList\(\)[\s\S]*?if Of>=13 then[\s\S]*?call BoxShowSkillNext\(\)/);
  assert.match(source,/set i=CreateUnit\(h,\$6E303630,/);
  const target=source.match(/function BoxGiftIsTrainTarget[\s\S]*?endfunction/)[0];assert.equal(/population|food|CONSTRUCT|UPGRADE/i.test(target),false);
  assert.match(target,/not IsUnitType\(Om,UNIT_TYPE_HERO\)/);
  const consume=source.match(/function BoxGiftConsumeBoxReward[\s\S]*?endfunction/)[0];assert.match(consume,/RemoveSkillList\(Pf,StringHash\("box"\)\)/);
  const replace=source.match(/function YDWEReplaceUnitBJNull[\s\S]*?endfunction/)[0];assert.match(replace,/Kp==bj_UNIT_STATE_METHOD_RELATIVE/);assert.match(replace,/UNIT_STATE_LIFE\)\/GetUnitState\(Kr,UNIT_STATE_MAX_LIFE\)/);
  const train=source.match(/function BoxGiftTryUpgradeTargetUnitNowByType[\s\S]*?endfunction/)[0];assert.match(train,/GetUnitGoldCost\(Y4\)\*40\/100/);assert.match(train,/YDWEReplaceUnitBJNull\(Om,Y4,1\)/);assert.equal(/FOOD|CONSTRUCT/.test(train),false);
  const free=source.match(/function BoxGiftTryConsumeBuildFreeWithCost[\s\S]*?endfunction/)[0];assert.match(free,/if BU>0 or BV>0 and LoadBoolean/);
});
