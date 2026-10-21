import { V14_ABILITIES, V14_BOX_TRAINING_RULES, V14_UNIT_TEMPLATES } from './v14-reference.js';

// These are the literal O[rawcode]["next"] registrations, rather than a
// reconstruction from food totals or the names of the farm levels.
const farmNext = [
  ['h024','h08C',31383],['h08C','h08D',31384],['h08D','h09B',31385],
  ['h09B','h09C',31386],['h09C','h095',31387],['h095','h096',31388],
  ['h096','h097',31389],['h097','h098',31390],['h098','h09A',31391],
  ['h09A','h0A6',31392],['h0A6','h09J',31393],['h09J','h0A5',31394],
  ['h0A5','h0A4',31395],['h0A4','h0A1',31396],['h0A1',null,null],
];
const farmNative = code => V14_UNIT_TEMPLATES[code]?.sourceRawFields ?? {};
const farmCost = code => Object.freeze({gold:Number(farmNative(code).goldcost??0),wood:Number(farmNative(code).lumbercost??0)});
export const BOX_FARM_STAGES = Object.freeze(farmNext.map(([rawcode,nextRawcode,nextLine])=>{
  const f=farmNative(rawcode),next=nextRawcode?farmNative(nextRawcode):null,foodMade=Number(f.fmade);
  return Object.freeze({rawcode,name:V14_UNIT_TEMPLATES[rawcode]?.name,nextRawcode,foodMade,
    nextFoodMade:next?Number(next.fmade):null,populationDelta:next?Number(next.fmade)-foodMade:0,
    cost:farmCost(rawcode),buildTimeSeconds:Number(f.bldtm),
    // Native target costs/times are data, not proof that a paid order can
    // select this target. Only UpFarm's replacement chain is established.
    upgradeCost:nextRawcode?farmCost(nextRawcode):null,upgradeBuildTimeSeconds:next?Number(next.bldtm):null,
    source:Object.freeze({file:'war3map.j',nextLine,nativeTable:'all_units.csv',nativeRow:V14_UNIT_TEMPLATES[rawcode]?.source?.row,
      nativeFields:Object.freeze(['fmade','goldcost','lumbercost','bldtm'])})});
}));
export const BOX_FARM_RULES = Object.freeze({initialRawcode:'h024',stages:BOX_FARM_STAGES,
  byRawcode:Object.freeze(Object.fromEntries(BOX_FARM_STAGES.map(s=>[s.rawcode,s]))),
  populationCeiling:300,initialCreateLines:Object.freeze([15133,15143,15153,15163,15173,15183,15193,15203]),
  source:Object.freeze({file:'war3map.j',upFarmLines:Object.freeze([30491,30513]),nextLines:Object.freeze([31383,31396]),
    rewardLines:Object.freeze([31069,31075]),foodCeilingLine:15891,replacementLines:Object.freeze([7316,7378])}),
  replacement:Object.freeze({mode:1,immediate:true,removesOldHandle:true,scriptTransfersNativeUpgradeJob:false,
    status:'partial',partial:'替换 helper 明确创建新单位并 RemoveUnit 旧单位，未转移原生升级任务；在研单位被移除后的退款及升级取消事件由原生引擎决定，本包未提供其定义。'}),
  ordinaryPaidUpgrade:Object.freeze({status:'partial',sameNextChainProven:false,
    sourceEventLines:Object.freeze([47282,47285,47312,47315]),
    partial:'仅核定通用原生 UPGRADE_START/FINISH 入口。解析表未包含原生建筑 Upgrade 目标列表，无法证明付费升级选择同一 next 链；费用和时长字段不能补足此缺口。'}),
  legacyMigration:'requires-explicit-rawcode-never-infer-from-population',
});

/** A saved farm prototype is authoritative; aggregate food cannot identify it. */
export function boxFarmUpgradeStatus(player,{pendingUpgrade=!!player?.economyTasks?.farmTask}={}){
  const rawcode=player?.sourceFarmRawcode,stage=BOX_FARM_RULES.byRawcode[rawcode];
  if(!stage)return {canStart:false,reason:'农场原型未核定，保留奖励',rawcode:rawcode??null};
  if(pendingUpgrade)return {canStart:false,reason:'农场正在升级，原生替换与退款行为尚未核定，保留奖励',rawcode};
  if(!stage.nextRawcode)return {canStart:false,reason:'农场等级已满',rawcode};
  return {canStart:true,reason:'',rawcode,nextRawcode:stage.nextRawcode,foodMade:stage.foodMade,nextFoodMade:stage.nextFoodMade,
    populationDelta:stage.populationDelta,immediate:true,cost:{gold:0,wood:0}};
}

// Literal KM/FS registrations in Ch, not a derived Web builder/prophet pool.
const randomGiftPool=(abilityId,tier,arrayName,rawcodes,firstLine,countLine,spellLines)=>Object.freeze({abilityId,tier,arrayName,
  count:rawcodes.length,rawcodes:Object.freeze(rawcodes),
  candidates:Object.freeze(rawcodes.map((rawcode,i)=>Object.freeze({index:i+1,rawcode,name:V14_UNIT_TEMPLATES[rawcode]?.name,
    sourceLine:firstLine+i*2,nativeSource:Object.freeze({...V14_UNIT_TEMPLATES[rawcode]?.source})}))),
  source:Object.freeze({file:'war3map.j',countLine,countExpression:`I7[${tier}]`,spellLines:Object.freeze(spellLines)})});
const randomGiftThree=randomGiftPool('A132',3,'KM',[
  'h014','h06M','h044','h01H','h01V','h00P','h05R','h07Q','h08N',
  'h09N','h0AB','h0BH','h0BX','h0CO','h0S7','n04F','n05U','n07B',
],22036,22072,[31083,31102]);
const randomGiftSix=randomGiftPool('A13N',6,'FS',[
  'h01A','h06S','h021','h05Z','h04A','h01M','h00S','h07W','h090',
  'h0A3','h0AR','h0BO','h0C9','h0D0','h0S1','n05C','h0QO',
],22147,22181,[31103,31122]);
export const BOX_RANDOM_FIGHTER_RULES=Object.freeze({
  byAbility:Object.freeze({A132:randomGiftThree,A13N:randomGiftSix}),
  byTier:Object.freeze({3:randomGiftThree,6:randomGiftSix}),
  status:'partial',facing:270,cost:Object.freeze({gold:0,wood:0}),immediate:true,
  placement:Object.freeze({scriptCheck:'RectContainsCoords(building_rect, targetX, targetY)',
    checkBeforeRandom:true,scriptedPopulationCheck:false,scriptedOccupancyCheck:false,scriptedTerrainCheck:false,
    source:Object.freeze({file:'war3map.j',rectRegistrationLines:Object.freeze([48609,48616]),rectDefinitionLines:Object.freeze([8597,8604])})}),
  sourceHooks:Object.freeze({
    order:Object.freeze(['CreateUnit','GroupAddUnit(Bu)','TriggerExecute(Bv)','if-created-handle-null: retain reward',
      'EachMonsterSkillTypeForHero + permanent class ability','ExecuteMonsterSkillInit(false)','EggWhite','consume-entire-active-pool']),
    classModule:'source-class-rules.js',classResolver:'EachMonsterSkillTypeForHero',classInit:'ExecuteMonsterSkillInit',
    initializePersistentWithRandomClass:false,deploymentRandomClassOnly:'A18X',
    source:Object.freeze({file:'war3map.j',classResolverLines:Object.freeze([3339,3353]),classInitLines:Object.freeze([3360,3396]),
      classDeploymentLines:Object.freeze([43856,43860]),eggWhiteLines:Object.freeze([28485,29203]),
      buildingLimitLine:29182,combatPowerLines:Object.freeze([21502,21530]),combatPowerDisplayLines:Object.freeze([18935,18939]),
      populationPeakLines:Object.freeze([24895,24905])}),
    eggWhiteConstructFinish:false,sameWaveFullSaleMarker:false,
    ordinaryConstructFinishCallbacks:false,limitCheck:'register-created-unit-and-adjust-future-allowance-no-precreation-rejection',
  }),
  partial:'已还原脚本区域检查、原始候选顺序、单次随机与成功消费。CreateUnit的原生失败条件及路径/碰撞自动调整在本包中没有定义，不以人口、占位或地形猜测补写。',
});

const pools = Object.freeze({
  box: Object.freeze(['A131','A132','A133','A134','A135','A136','A13M','A2ZA','A2ZB','A2ZC','A2ZD','A2ZE']),
  box2: Object.freeze(['A140','A13N','A13O','A13P','A13Q','A13R','A13S']),
});
const meta = (id, handler, targetKind, description, extra = {}) => Object.freeze({ id, name: V14_ABILITIES[id]?.name ?? id,
  tier: pools.box.includes(id) ? 'box' : 'box2', handler, targetKind, description, status: 'implemented', ...extra });
export const BOX_REWARD_RULES = Object.freeze({
  A131: meta('A131','farm','none','按已保存农场原型的原生next链立即免费替换到下一阶；人口增量取fmade差值，未知原型、升级在研或满级时保留奖励。', {status:'partial',partial:'已核定next替换链；旧档无法从总人口反推农场原型，在研原生升级被替换后的退款/取消事件未核定。'}),
  A132: meta('A132','randomFighter','point','自己的建造区域内点击后，从原始KM十八项候选中随机创建一个三级兵；成功后消费整组奖励。', { fighterTier: 3, status: 'partial', partial: BOX_RANDOM_FIGHTER_RULES.partial }),
  A133: meta('A133','gold','none','获得50金币并消费整组第一阶段奖励。', { gold: 50 }),
  A134: meta('A134','wood','none','获得150木材并消费整组第一阶段奖励。', { wood: 150 }),
  A135: meta('A135','unitAbilities','ancient','向己方ancient单位永久添加A138(+300生命)和A13A(+1甲)。', { abilityIds: ['A138','A13A'] }),
  A136: meta('A136','unitAbilities','ancient','向己方ancient单位永久添加A139(+30平攻)和A13B(+10%攻速)。', { abilityIds: ['A139','A13B'] }),
  A13M: meta('A13M','builderAbility','none','给EG[玩家]先知/建造者永久添加A137死亡一指；不授予国王。', { abilityIds: ['A137'], status: 'partial', partial: '需要可操纵的建造者及ANfd原生效果宿主；缺失时不消费奖励。' }),
  A2ZA: meta('A2ZA','training','ownedNonHero','己方存活非原生英雄、非奖励提供者的单位，按专属训练树花费下一阶原始金木费用40%立即替换；成功后消费整组box候选。'),
  A2ZB: meta('A2ZB','buildFree','none','保存一次免费布尔标记，不叠加次数；只对已核定调用路径处理源返费表达式。'),
  A2ZC: meta('A2ZC','unitAbilities','ownedNotSelf','向己方存活非奖励提供者单位永久添加A2ZG；主伤害事件按源将伤害乘0.85。', { abilityIds: ['A2ZG'] }),
  A2ZD: meta('A2ZD','swap','ancient','选中第一个己方存活ancient单位即消费整组奖励；随后A2ZF选择另一个单位，失败的第二次选择保留换位资格。'),
  A2ZE: meta('A2ZE','demolish','ownedNonTauren','拆除己方存活非TAUREN单位；实际只返还类型point value金币，木材为0，并调用SellHook；不采用文案金木原价。'),
  A140: meta('A140','lumber','none','原生UpLumbering免费升一级，满级不消费。'),
  A13N: meta('A13N','randomFighter','point','自己的建造区域内点击后，从原始FS十七项候选中随机创建一个六级兵；成功后消费整组奖励。', { fighterTier: 6, status: 'partial', partial: BOX_RANDOM_FIGHTER_RULES.partial }),
  A13O: meta('A13O','gold','none','获得300金币并消费整组第二阶段奖励。', { gold: 300 }),
  A13P: meta('A13P','wood','none','获得800木材并消费整组第二阶段奖励。', { wood: 800 }),
  A13Q: meta('A13Q','unitAbilities','ancient','向己方ancient单位永久添加A13U(+2甲)、A13T(+800生命)、A13V(Arel，每秒40恢复)；不按文案推造每5秒跳200的定时器。', { abilityIds: ['A13U','A13T','A13V'] }),
  A13R: meta('A13R','unitAbilities','ancient','向己方ancient单位永久添加A13W(+20%攻速)、A13X(+80平攻)、A13Y(40%二倍暴击)。', { abilityIds: ['A13W','A13X','A13Y'] }),
  A13S: meta('A13S','builderAbility','none','给EG[玩家]先知/建造者永久添加A13Z；其脚本在200半径造成200通用伤害并调用2级眩晕，不授予国王。', { abilityIds: ['A13Z'], status: 'partial', partial: '需要可操纵的建造者及手动施法宿主；缺失时不消费奖励。' }),
});
export const BOX_TRAINING_RULES = Object.freeze({ ...V14_BOX_TRAINING_RULES, abilityId: 'A2ZA', abilityRawcode: 'A2ZA', providerRawcodes: ['n060'],
  providerName: '神秘礼物', pools, rewardCount: 3, maxRandomAttemptsPerChoice: 20, firstClearWave: 6, secondClearWave: 13,
  consumeReward: 'entire-box-pool-on-success', branchDialogSeconds: 30,
  acquisition: { kind: 'preplaced-provider-wave-finish', qualification: 'IsLivingPlayer(owner): playing slot and user controller', sourceLines: [8472,8556,30587,30621,31305,31436,42892,42906] },
  replacement: { mode: 1, method: 'bj_UNIT_STATE_METHOD_RELATIVE', sourceLines: [7316,7378,30855,30895,48784,48829],
    copy: ['owner','position','facing','relativeHP','relativeMana-if-both-maxMana-positive','resourceAmount','userData','A2ZG','base_id','limitid_ex'],
    notCopied: ['arbitrary-abilities','buffs','cooldowns','hero-stacks','treasureArmor','same-wave-sell-JY'],
    partial: '本包提供相对状态分支，但没有Blizzard.j的mode常量声明；未提取的原生创建默认值及宿主单位替换生命周期不虚构。' },
  freeCostRefund: { expression: 'gold>0 || (wood>0 && boxBuildFreeOnce)', contexts: ['frame-worker','native-worker','frame-tech'],
    frameTechRawcodes: ['R003','R00H','R06W'], sourceLines: [114,117,7548,7560,8433,30420,30422,47290,47292],
    ordinaryBuildingUpgrade: false, note: '三个实际调用处没有外层券标记检查；正金币分支按源无券亦返费。ForUnit/ForTech包装函数没有实际调用。' },
});

const raw = u => typeof u === 'string' ? u.replace(/^v14_/, '') : u?.sourceRawcode ?? u?.rawcode ?? u?.combatRawcode ?? raw(u?.unitId ?? u?.id ?? '');
const ownsRecord = (p,u) => !!u && (u.ownerId === p.id || u.playerId === p.id || (u.ownerId === undefined && u.playerId === undefined && p.buildings?.some(b => b === u || b.id === u.id)));
const living = u => !!u && u.alive !== false && u.removed !== true && u.destroyed !== true && (!Number.isFinite(u.hp) || u.hp > 0)
  && !u.status?.deathCounted && !u.status?.sourceDeathHandled;
const ownedAlive = (p,u,api={}) => ownsRecord(p,u) && (api.isAlive ? api.isAlive(u,p) : living(u));
const definition = (u,api={}) => api.getDefinition?.(u) ?? V14_UNIT_TEMPLATES[raw(u)] ?? u;
const nativeFields = def => def?.buildingRawFields ?? V14_UNIT_TEMPLATES[raw(def)]?.sourceRawFields ?? def?.sourceRawFields ?? {};
const nativeHero = (u,api={}) => api.isNativeHero ? api.isNativeHero(u) : u?.isNativeHero ?? ['STR','AGI','INT'].includes(nativeFields(definition(u,api)).Primary);
const hasAbility = (u,id) => [...(u?.abilityIds??[]),...(u?.boxAbilityIds??[]),...(u?.permanentAbilityIds??[])].includes(id) || u?.skillSpecs?.some(s=>s.id===id);
const trait = (u,t,api={}) => [...(u?.traits??[]),...String(nativeFields(definition(u,api)).type??definition(u,api)?.unitType??'').split(',')].some(v=>String(v).toLowerCase()===t);
const passed = value => value === true || value?.ok === true || value?.canStart === true;
const fail = reason => ({ok:false,canStart:false,reason,message:reason});
const success = (extra={}) => ({ok:true,canStart:true,...extra});
function consume(p,id){
  const r=p.boxRewards;
  if(!r||r.consumed||!r.abilityIds?.includes(id))return false;
  r.abilityIds=[];r.consumed=true;r.selectedAbilityId=id;return true;
}

/** Host creation includes the source post-create hooks and reports explicit success. */
export function claimBoxRandomFighterReward(game,p,id,payload={},api={}){
  const rule=BOX_RANDOM_FIGHTER_RULES.byAbility[id],holder=p?.boxRewards,tier=id==='A132'?'box':'box2';
  if(!rule||!holder||holder.consumed||holder.tier!==tier||!holder.abilityIds?.includes(id))return fail('当前没有此神秘礼物奖励');
  if(typeof api.isValidPoint!=='function'||typeof api.createFighter!=='function')return fail('随机兵种礼物需要已核定的选点与创建宿主，保留奖励');
  if(!passed(api.isValidPoint(p,payload,game)))return fail('请在自己的区域建造');
  // The only script gate precedes this single integer draw. No ordinary
  // build-menu population, tech, quota, occupancy or terrain gate runs here.
  const draw=game._random();
  if(!Number.isFinite(draw)||draw<0||draw>=1)return fail('随机状态无效，保留奖励');
  const candidate=rule.candidates[Math.floor(draw*rule.count)],selection={...candidate,abilityId:id,tier:rule.tier,arrayName:rule.arrayName,facing:270};
  const result=api.createFighter(p,selection,payload,game);
  if(result?.ok!==true||!result.unit||typeof result.unit!=='object')return fail(result?.reason??result?.message??'单位创建失败，原生失败条件尚未核定，保留奖励');
  consume(p,id);return success({abilityId:id,selection,unit:result.unit,consumed:true,message:`已使用${BOX_REWARD_RULES[id].name}`});
}

/** Reproduces 20 random retry attempts, then source-order fallback per choice. */
export function rollBoxRewards(random,tier='box',existing=[]){
  const pool=pools[tier];if(!pool)throw new RangeError('Unknown box reward tier');
  const owned=new Set(existing),abilityIds=[];
  for(let n=0;n<3;n++){
    let chosen=null;
    for(let attempt=0;attempt<20;attempt++){
      const id=pool[Math.max(0,Math.min(pool.length-1,Math.floor(random()*pool.length)))];
      if(!owned.has(id)){chosen=id;break;}
    }
    if(!chosen)chosen=pool.find(id=>!owned.has(id));
    if(!chosen)break;owned.add(chosen);abilityIds.push(chosen);
  }
  return abilityIds;
}

/** Call only for a real FightFinish, rather than entering sandbox or restoring. */
export function advanceBoxRewards(game,clearedWave,api={}){
  const state=game.state,progress=state.boxRewardProgress??={firstGranted:false,secondGranted:false},grants=[];
  const phases=[['firstGranted',6,'box'],['secondGranted',13,'box2']];
  for(const [flag,threshold,tier]of phases)if(clearedWave>=threshold&&!progress[flag]){
    progress[flag]=true;
    for(const p of state.players??[]){
      const live=api.isLivingPlayer?api.isLivingPlayer(p):p.eliminated!==true&&p.active!==false&&p.controller!=='computer'&&p.slotState!=='left';
      if(!live)continue;
      const abilityIds=rollBoxRewards(()=>game._random(),tier);
      p.boxRewards={providerId:p.boxRewards?.providerId??`box-n060-${p.id}`,providerRawcode:'n060',ownerId:p.id,tier,abilityIds,
        sourceWave:threshold,grantedAtWave:clearedWave,consumed:false,reforgeAvailable:state.wave<=13};
      grants.push({playerId:p.id,...p.boxRewards});
    }
  }
  return grants;
}

/** Legacy history cannot reveal already-consumed choices: infer flags, never reroll. */
export function migrateBoxRewardProgress(game,{legacySnapshot=false,clearedWave}={}){
  if(game.state.boxRewardProgress)return game.state.boxRewardProgress;
  const holders=(game.state.players??[]).map(p=>p.boxRewards).filter(Boolean);
  const cleared=Number.isFinite(clearedWave)?clearedWave:Math.max(0,(game.state.wave??1)-1);
  const first=holders.some(r=>r.sourceWave>=6||['box','box2'].includes(r.tier)),second=holders.some(r=>r.sourceWave>=13||r.tier==='box2');
  return game.state.boxRewardProgress={firstGranted:first||legacySnapshot&&cleared>=6,secondGranted:second||legacySnapshot&&cleared>=13,
    ...(legacySnapshot&&!holders.length&&cleared>=6?{migration:'legacy-history-unknown-no-reroll'}:{})};
}

export function boxTrainingRewardStatus(p){
  const r=p?.boxRewards,available=!!r&&!r.consumed&&r.tier==='box'&&r.abilityIds?.includes('A2ZA');
  return {available,canStart:available,abilityId:'A2ZA',providerId:r?.providerId,tier:r?.tier,reason:available?'':'当前没有兵种训练奖励'};
}
export const consumeBoxTrainingReward=p=>!!boxTrainingRewardStatus(p).available&&consume(p,'A2ZA');
export function boxTrainingCost(def){
  const f=nativeFields(def),gold=Number(f.goldcost??def?.nativeGoldCost??def?.goldCost??def?.cost),wood=Number(f.lumbercost??def?.nativeWoodCost??def?.woodCost??0);
  if(!Number.isFinite(gold)||!Number.isFinite(wood)||gold<0||wood<0)return {gold:0,wood:0,valid:false,reason:'升级目标原始费用未提取'};
  return {gold:Math.trunc(gold*40/100),wood:Math.trunc(wood*40/100),sourceGoldCost:gold,sourceWoodCost:wood,valid:true};
}

export function boxTrainingTargetStatus(p,provider,target,targetDef,api={}){
  if(!p||!provider||!target||!targetDef)return fail('兵种或奖励提供者不存在');
  if(!boxTrainingRewardStatus(p).available||provider.id!==p.boxRewards.providerId||provider.ownerId!==p.id)return fail('兵种训练奖励已失效，请重新获取奖励。');
  if(!ownedAlive(p,target,api)||target.id===provider.id||nativeHero(target,api))return fail('必须选择你自己的非英雄单位!!!');
  const current=raw(target),next=raw(targetDef),targets=api.getTrainingTargets?.(target,p)??V14_BOX_TRAINING_RULES.selections[current]?.rawTargets??[];
  if(!targets.some(v=>raw(v)===next))return fail('该单位没有可用的兵种训练升级路径!!!');
  const requirements=V14_BOX_TRAINING_RULES.targetRequirements?.[next]?.rawRequirements??[];
  if(requirements.length&&api.techReady){if(!passed(api.techReady(p,next,requirements,targetDef)))return fail('升级目标的科技限制条件未满足，无法进行兵种训练!!!');}
  else if(requirements.some(id=>id&&id!=='0'&&!(Number(api.techCount?.(p,id)??p.technologies?.[id]??p.entitlements?.[id]??0)>0)))return fail('升级目标的科技限制条件未满足，无法进行兵种训练!!!');
  const limit=V14_BOX_TRAINING_RULES.targetLimits?.[next];
  if(limit&&api.limitReady){if(!passed(api.limitReady(p,target,targetDef,limit)))return fail('目标兵种数量已达上限，无法进行兵种训练!!!');}
  else if(limit){
    const own=(p.buildings??[]).filter(b=>b.id!==target.id&&ownedAlive(p,b,api)&&(raw(b)===next||!limit.limitidEx&&(b.baseId===next||b.base_id===next||b.limitOrigins?.includes(next)))).length;
    const used=Math.max(own,Number(api.registeredLimitCount?.(p,next,target)??0));
    if(used>=limit.count)return fail('目标兵种数量已达上限，无法进行兵种训练!!!');
  }
  const fee=boxTrainingCost(targetDef);if(!fee.valid)return fail(fee.reason);
  if((p.gold??0)<fee.gold||(p.wood??0)<fee.wood)return {...fail(`资源不足：需要${fee.gold}金币 ${fee.wood}木材`),fee};
  // The source helper has neither a population nor an unfinished-construction check.
  return success({fee,sourceRawcode:current,targetRawcode:next,requirements});
}

/** Pure replacement contract; no arbitrary old abilities, buffs or hero levels. */
export function boxTrainingReplacementState(old,def){
  const f=nativeFields(def),maxHp=Number(f.HP??def.hp??0),maxMana=Number(f.manaN??def.maxMana??def.mana??0);
  const defaultMana=Number(f.mana0??def.initialMana??def.manaStart??maxMana),ratio=(v,m)=>Math.max(0,Math.min(1,v/m));
  return {hp:old.maxHp>0&&Number.isFinite(old.hp)?ratio(old.hp,old.maxHp)*maxHp:maxHp,maxHp,
    mana:old.maxMana>0&&maxMana>0&&Number.isFinite(old.mana)?ratio(old.mana,old.maxMana)*maxMana:defaultMana,maxMana,
    userData:old.userData,worldX:old.worldX,worldY:old.worldY,facing:old.facing,resourceAmount:old.resourceAmount,
    permanentAbilityIds:hasAbility(old,'A2ZG')?['A2ZG']:[],limitOrigins:[...(old.limitOrigins??[])],baseId:old.baseId??old.base_id,limitidEx:old.limitidEx??old.limitid_ex,builtWave:null};
}

export function claimBoxReward(game,p,id,payload={},api={}){
  const r=BOX_REWARD_RULES[id],holder=p?.boxRewards;
  if(!r||!holder||holder.consumed||holder.tier!==r.tier||!holder.abilityIds?.includes(id))return fail('当前没有此神秘礼物奖励');
  const target=payload.target??api.getTarget?.(p,payload),provider={id:holder.providerId,ownerId:p.id};
  if(['ancient','ownedNotSelf','ownedNonTauren','ownedNonHero'].includes(r.targetKind)){
    if(!ownedAlive(p,target,api)||r.targetKind==='ownedNotSelf'&&target.id===provider.id||r.targetKind==='ancient'&&!trait(target,'ancient',api)
      ||r.targetKind==='ownedNonTauren'&&trait(target,'tauren',api))return fail('请选择符合条件的己方存活单位');
  }
  let result=true;
  if(r.handler==='gold'){p.gold=(p.gold??0)+r.gold;if(p.stats)p.stats.goldEarned=(p.stats.goldEarned??0)+r.gold;}
  else if(r.handler==='wood')p.wood=(p.wood??0)+r.wood;
  else if(r.handler==='buildFree')p.boxBuildFreeOnce=true;
  else if(r.handler==='farm')result=api.upFarm?.(p,game)??false;
  else if(r.handler==='lumber')result=api.upLumbering?.(p,game)??false;
  else if(r.handler==='randomFighter'){
    if(api.createFighter)return claimBoxRandomFighterReward(game,p,id,payload,api);
    result=api.grantRandomFighter?.(p,r.fighterTier,payload,game)??false;
  }
  else if(r.handler==='unitAbilities'){
    if(!api.grantAbilities)return fail('此奖励需要单位永久能力宿主，未消费奖励');
    result=api.grantAbilities(p,target,r.abilityIds,game);
  }else if(r.handler==='builderAbility')result=api.grantBuilderAbilities?.(p,r.abilityIds,game)??false;
  else if(r.handler==='training')return fail('兵种训练必须先完成科技、费用与替换检查，再消费奖励');
  else if(r.handler==='swap')p.boxSwap={providerId:holder.providerId,firstTargetId:target.id,abilityId:'A2ZF'};
  else if(r.handler==='demolish'){
    if(!api.demolish)return fail('此奖励需要拆除宿主，未消费奖励');
    const def=definition(target,api),gold=Number(nativeFields(def).points??def.sourcePoints??0);
    result=api.demolish(p,target,{gold,wood:0},game);
  }
  if(!passed(result))return fail(r.partial??'奖励条件未满足，未消费奖励');
  consume(p,id);return success({abilityId:id,message:`已使用${r.name}`,consumed:true});
}

export function completeBoxSwap(game,p,target,api={}){
  const pending=p.boxSwap;if(!pending)return fail('当前没有待完成换位');
  const first=api.getTargetById?.(p,pending.firstTargetId)??p.buildings?.find(b=>b.id===pending.firstTargetId);
  if(!ownedAlive(p,first,api)||!trait(first,'ancient',api)){delete p.boxSwap;return fail('第一个换位单位已失效，请重新获取换位奖励。');}
  if(!ownedAlive(p,target,api)||target.id===first.id||!trait(target,'ancient',api))return fail('请选择另一个己方战斗单位');
  if(!api.swap||!passed(api.swap(p,first,target,game)))return fail('换位宿主未完成，保留第二次选择');
  delete p.boxSwap;return success({message:'换位完成'});
}

/** Call only at the three proven source hooks; ordinary building upgrades do not call this. */
export function boxBuildFreeRefund(p,gold,wood,{context,rawcode:code}={}){
  if(!Number.isFinite(gold)||!Number.isFinite(wood)||gold<0||wood<0||!['frame-worker','native-worker','frame-tech'].includes(context)
    ||context==='frame-tech'&&!['R003','R00H','R06W'].includes(code)||['frame-worker','native-worker'].includes(context)&&code&&code!=='e003')return {refunded:false,gold:0,wood:0};
  if(!(gold>0||wood>0&&p.boxBuildFreeOnce))return {refunded:false,gold:0,wood:0};
  p.boxBuildFreeOnce=false;p.gold=(p.gold??0)+Math.max(0,gold);p.wood=(p.wood??0)+Math.max(0,wood);
  return {refunded:true,gold:Math.max(0,gold),wood:Math.max(0,wood)};
}
