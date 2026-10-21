import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {UNIT_TEMPLATES} from '../dist/data.js';
import {BOX_RANDOM_FIGHTER_RULES,BOX_REWARD_RULES,claimBoxRandomFighterReward,claimBoxReward} from '../dist/box-training-rules.js';

const source=readFileSync(new URL('../reference/v14-source/raw_extracted/war3map.j',import.meta.url),'utf8');
const lines=source.split(/\r?\n/),clone=value=>JSON.parse(JSON.stringify(value));
const body=name=>source.match(new RegExp(`function ${name} takes[\\s\\S]*?endfunction`))[0];
function fixture(id='A132',draw=.4){
  const p={id:2,gold:0,wood:0,populationCap:0,popUsed:9999,buildings:[],technologies:{},entitlements:{},
    boxRewards:{providerId:'box-n060-2',ownerId:2,providerRawcode:'n060',tier:id==='A132'?'box':'box2',abilityIds:[id,id==='A132'?'A133':'A13O'],consumed:false}};
  const events=[],game={state:{players:[p]},_random:()=>{events.push('random');return draw;}};
  const api={isValidPoint:(owner,point)=>{assert.equal(owner,p);events.push('point');return point.worldX===123&&point.worldY===456;},
    createFighter:(owner,selection,point,g)=>{assert.equal(owner,p);assert.equal(g,game);events.push('create');const unit={id:'gift-unit',rawcode:selection.rawcode,worldX:point.worldX,worldY:point.worldY};p.buildings.push(unit);return {ok:true,unit};}};
  return {p,game,events,api,point:{worldX:123,worldY:456}};
}

test('the independent KM18 and FS17 pools reproduce every literal registration and exact source order',()=>{
  for(const [id,arrayName,count,tier]of [['A132','KM',18,3],['A13N','FS',17,6]]){
    const rule=BOX_RANDOM_FIGHTER_RULES.byAbility[id];assert.equal(rule.count,count);assert.equal(rule.tier,tier);assert.equal(rule.arrayName,arrayName);assert.equal(BOX_RANDOM_FIGHTER_RULES.byTier[tier],rule);
    const actual=[...source.matchAll(new RegExp(`set ${arrayName}\\[(\\d+)\\]=\\$([0-9A-F]{8})`,'g'))].map(m=>({index:Number(m[1]),rawcode:Buffer.from(m[2],'hex').toString('ascii')}));
    assert.deepEqual(rule.candidates.map(({index,rawcode})=>({index,rawcode})),actual);assert.deepEqual(rule.rawcodes,actual.map(r=>r.rawcode));
    assert.equal(new Set(rule.rawcodes).size,count);assert.equal(rule.source.countExpression,`I7[${tier}]`);assert.match(lines[rule.source.countLine-1],new RegExp(`set I7\\[${tier}\\]=${count}`));
    for(const c of rule.candidates){assert.equal(c.name,UNIT_TEMPLATES[c.rawcode].name);assert.deepEqual(c.nativeSource,UNIT_TEMPLATES[c.rawcode].source);assert.match(lines[c.sourceLine-1],new RegExp(`set ${arrayName}\\[${c.index}\\]=`));}
  }
  assert.deepEqual(BOX_RANDOM_FIGHTER_RULES.byAbility.A132.rawcodes.slice(-3),['n04F','n05U','n07B']);assert.deepEqual(BOX_RANDOM_FIGHTER_RULES.byAbility.A13N.rawcodes.slice(-2),['n05C','h0QO']);
});

test('an outside point or unavailable host consumes neither random state nor any offered reward',()=>{
  const {p,game,api,events,point}=fixture(),before=clone(p);
  assert.equal(claimBoxRandomFighterReward(game,p,'A132',{...point,worldX:124},api).ok,false);assert.deepEqual(events,['point']);assert.deepEqual(p,before);
  events.length=0;
  for(const partial of [{},{isValidPoint:api.isValidPoint},{createFighter:api.createFighter}]){assert.equal(claimBoxRandomFighterReward(game,p,'A132',point,partial).ok,false);assert.deepEqual(p,before);}
  assert.deepEqual(events,[]);
});

test('the point gate precedes one draw and every candidate can be selected without menu, quota, food or resource requirements',()=>{
  for(const id of ['A132','A13N']){
    const rule=BOX_RANDOM_FIGHTER_RULES.byAbility[id];
    for(let i=0;i<rule.count;i++){
      const {p,game,api,events,point}=fixture(id,(i+.5)/rule.count),result=claimBoxRandomFighterReward(game,p,id,point,api);
      assert.equal(result.ok,true);assert.equal(result.selection.index,i+1);assert.equal(result.selection.rawcode,rule.rawcodes[i]);assert.equal(result.selection.facing,270);assert.equal(result.selection.tier,rule.tier);assert.equal(p.buildings[0],result.unit);
      assert.deepEqual(events,['point','random','create']);assert.equal(p.gold,0);assert.equal(p.wood,0);assert.equal(p.boxRewards.consumed,true);assert.deepEqual(p.boxRewards.abilityIds,[]);assert.equal(p.boxRewards.selectedAbilityId,id);
    }
  }
});

test('only an explicit created unit success consumes the pool, and failed creation retains the already advanced random state',()=>{
  for(const outcome of [null,false,true,{}, {ok:false,reason:'native failure'}, {ok:true}, {ok:true,unit:null}]){
    const {p,game,api,events,point}=fixture(),before=clone(p);api.createFighter=()=>{events.push('create');return outcome;};
    const result=claimBoxRandomFighterReward(game,p,'A132',point,api);assert.equal(result.ok,false);assert.deepEqual(p,before);assert.deepEqual(events,['point','random','create']);
  }
  const {p,game,api,events,point}=fixture();let n=0;game._random=()=>{events.push('random');return n++===0?0:.999999;};api.createFighter=()=>({ok:false});
  assert.equal(claimBoxRandomFighterReward(game,p,'A132',point,api).ok,false);assert.equal(n,1);assert.equal(p.boxRewards.consumed,false);
  api.createFighter=(_owner,selection)=>({ok:true,unit:{id:'retry',rawcode:selection.rawcode}});
  const retry=claimBoxRandomFighterReward(game,p,'A132',point,api);assert.equal(retry.ok,true);assert.equal(retry.selection.rawcode,'n07B');assert.equal(n,2,'a new valid cast draws again instead of caching a failed candidate');
});

test('native creation and initialization belong to the host and finish before the successful reward consumption',()=>{
  const {p,game,api,point,events}=fixture('A13N',0);
  api.createFighter=(owner,selection)=>{
    assert.equal(owner.boxRewards.consumed,false);assert.ok(owner.boxRewards.abilityIds.includes('A13N'));assert.equal(selection.rawcode,'h01A');
    for(const hook of ['CreateUnit','GroupAddUnit(Bu)','TriggerExecute(Bv)','class ability permanent','ExecuteMonsterSkillInit(false)','EggWhite'])events.push(hook);
    return {ok:true,unit:{id:'initialized',sourceClassAbilityId:'A18P',construction:null}};
  };
  const result=claimBoxRandomFighterReward(game,p,'A13N',point,api);assert.equal(result.ok,true);assert.equal(result.unit.construction,null);assert.equal(result.unit.sourceClassAbilityId,'A18P');assert.equal(p.boxRewards.consumed,true);
  assert.deepEqual(events.slice(0,2),['point','random']);assert.equal(events.at(-1),'EggWhite');
});

test('claimBoxReward dispatches through the strict source pipeline when the source creation host is present',()=>{
  const {p,game,api,events,point}=fixture();api.grantRandomFighter=()=>{throw new Error('legacy arbitrary pool host must not run');};
  assert.equal(claimBoxReward(game,p,'A132',point,api).ok,true);assert.deepEqual(events,['point','random','create']);
  const before=clone(p),draws=events.length;assert.equal(claimBoxReward(game,p,'A132',point,api).ok,false);assert.deepEqual(p,before);assert.equal(events.length,draws);
});

test('wrong tier, missing offer, unknown ability and consumed rewards all reject before checking the point or drawing',()=>{
  for(const mutate of [p=>p.boxRewards.tier='box2',p=>p.boxRewards.abilityIds=['A133'],p=>p.boxRewards.consumed=true,p=>delete p.boxRewards]){
    const {p,game,api,events,point}=fixture();mutate(p);const before=clone(p);assert.equal(claimBoxRandomFighterReward(game,p,'A132',point,api).ok,false);assert.deepEqual(p,before);assert.deepEqual(events,[]);
  }
  const {p,game,api,events,point}=fixture();assert.equal(claimBoxRandomFighterReward(game,p,'A133',point,api).ok,false);assert.deepEqual(events,[]);
});

test('saved choice and RNG state continue deterministically without serializing a chosen fighter before the cast',()=>{
  const {p,point}=fixture('A13N'),state={players:[p],rng:12};
  const make=state=>({state,_random(){state.rng=(state.rng*1664525+1013904223)>>>0;return state.rng/4294967296;}});
  const game=make(state),restored=make(clone(state)),api={isValidPoint:()=>true,createFighter:(_owner,selection)=>({ok:true,unit:{id:'from-save',rawcode:selection.rawcode}})};
  const a=claimBoxRandomFighterReward(game,p,'A13N',point,api),b=claimBoxRandomFighterReward(restored,restored.state.players[0],'A13N',point,api);assert.deepEqual(b,a);assert.deepEqual(restored.state,game.state);
});

test('source branches establish region-only gates, post-create null failure, explicit class initialization and EggWhite before consumption',()=>{
  const box=body('BoxClickAction');
  for(const [raw,arrayName,tier]of [['41313332','KM',3],['4131334E','FS',6]]){
    const a=box.indexOf(`elseif BN==$${raw} then`),b=box.indexOf('\nelseif BN==',a+1),branch=box.slice(a,b);
    assert.match(branch,/RectContainsCoords\(D1,FF,FG\)/);assert.match(branch,new RegExp(`CreateUnit\\(h,${arrayName}\\[GetRandomInt\\(1,I7\\[${tier}\\]\\)\\],FF,FG,270\\)`));
    const order=['RectContainsCoords','GetRandomInt','GroupAddUnit(Bu,Ki)','TriggerExecute(Bv)','if Ki==null','UnitAddAbility(Ki,EachMonsterSkillTypeForHero(Ki))','ExecuteMonsterSkillInit(Ki,false)','call EggWhite','call RemoveSkillList'];
    for(let i=1;i<order.length;i++)assert.ok(branch.indexOf(order[i])>branch.indexOf(order[i-1]),`${order[i]} follows ${order[i-1]}`);
    assert.doesNotMatch(branch,/GetPlayerState|FOOD_|IsTerrainPathable|BuildingLimit|Check.*[Ll]imit/);assert.equal((branch.match(/GetRandomInt/g)??[]).length,1);
  }
  const limits=body('BuildingLimit');assert.doesNotMatch(limits,/FOOD_|GetPlayerState|Issue.*Order|RemoveUnit\(i\)/);assert.match(body('EggWhiteEx'),/call BuildingLimit\(i,x,h,BB,BF\)/);
  assert.match(body('OC5F_Fg'),/TriggerExecute\(Lg\)/);assert.match(body('OC5F_Qc'),/TriggerExecute\(Np\)/);assert.match(body('OC5F_MT'),/RESOURCE_FOOD_USED\)>Iu/);assert.doesNotMatch(body('OC5F_MT'),/FOOD_CAP|RemoveUnit|KillUnit/);
  assert.equal(BOX_RANDOM_FIGHTER_RULES.sourceHooks.classModule,'source-class-rules.js');assert.equal(BOX_RANDOM_FIGHTER_RULES.sourceHooks.eggWhiteConstructFinish,false);assert.equal(BOX_RANDOM_FIGHTER_RULES.sourceHooks.sameWaveFullSaleMarker,false);
  assert.equal(BOX_RANDOM_FIGHTER_RULES.sourceHooks.deploymentRandomClassOnly,'A18X');assert.equal(BOX_RANDOM_FIGHTER_RULES.placement.scriptedPopulationCheck,false);assert.equal(BOX_RANDOM_FIGHTER_RULES.placement.scriptedTerrainCheck,false);assert.equal(BOX_RANDOM_FIGHTER_RULES.placement.scriptedOccupancyCheck,false);
  assert.equal(BOX_REWARD_RULES.A132.status,'partial');assert.equal(BOX_REWARD_RULES.A13N.status,'partial');assert.match(BOX_RANDOM_FIGHTER_RULES.partial,/CreateUnit/);
});
