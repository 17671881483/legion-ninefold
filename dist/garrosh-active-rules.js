import {V14_ABILITIES} from './v14-reference.js';

// Parsed JASS, not the tooltip: Qk=A19Z (1154); callbacks 33264–33501;
// manual spell dispatch 39447–39456; native auto orders 41003–41022.
const abilityRule=(id,extra)=>{
  const a=V14_ABILITIES[id],f=a.resolved_fields;
  return Object.freeze({id,name:a.name,manaCost:Number(f.Cost1??0),cooldown:Number(f.Cool1??0),range:Number(f.Rng1??0),...extra});
};
export const GARROSH_ACTIVE_RULES=Object.freeze({
  A1A2:abilityRule('A1A2',{status:'partial',targetKind:'point',autoOrder:'unflamingattack',cooldownPolicy:'shared_native',sourceLines:[33307,33415,39447,39449,41003,41007],
    description:'三道±45°重斧，出返各600/.4s，.04s零秒首跳；每斧每段各独立对300范围敌人造成一次215混乱/通用伤害。返程每次拉拽；去程经过任意不可行走点后该斧整段返程不拉拽。ChargeDistance先判>=，每段只移动9次60码，实际540码。',
    partial:'原生下单行走/同事件命令仲裁、原地图SetUnitPosition和terrain pathing由宿主提供；缺原地图时不得声称完全一致。',angles:[0,45,-45],length:600,duration:.4,interval:.04,radius:300,damage:215,dummyRawcode:'e008',dummyRemovalSeconds:.8}),
  A1A3:abilityRule('A1A3',{status:'partial',targetKind:'unit',autoOrder:'unholyfrenzy',cooldownPolicy:'shared_native',sourceLines:[33417,33455,39450,39456,41008,41022],
    description:'随机选择300范围一个非自身盟友，不排除英雄/建筑/国王。朝施法开始时目标位置跳跃，.6秒解暂停，并在目标当时位置300范围造成75普通攻击/魔法伤害。每.03秒跳跃，首步不动、最后到初始距离95%，.63秒恢复pathing；手动施法无盟友仍消耗原生魔法与冷却。',
    partial:'原生ANcl允许目标、下单仲裁、跳跃地图边界/碰撞和其他jump优先级属宿主边界。',allyRadius:300,radius:300,damage:75,landingSeconds:.6,jumpInterval:.03,jumpSteps:20,jumpPriority:3,jumpHeight:500}),
});
export const GARROSH_PASSIVE_RULES=Object.freeze({
  A1A1:abilityRule('A1A1',{status:'implemented',chargeAbility:'A19Z',maxLevel:100,burstDamage:5000,burstRadius:600,sourceLines:[1154,33264,33305,43755,43757,43769,43771],
    description:'全局死亡事件只检查击杀者是否为自身，不检查敌我。前100次击杀逐级获得1—100攻击；已100级后的下一次击杀先移除双方A19Z，再在600范围造成5000普通攻击/魔法伤害。爆发造成的击杀可重新充能；建筑保留等级，治疗/换波不清除。'}),
  A1A4:abilityRule('A1A4',{status:'implemented',chance:.05,damage:75,radius:300,spinSeconds:.4,sourceLines:[33456,33501,43772,43774],
    description:'独立受伤事件5%在自身300范围造成75普通攻击/魔法伤害，未发现攻击触发入口。每次受伤都会开启Spin；首个.4秒定时器运行中不刷新。'}),
});

const pos=e=>({x:e.worldX??e.x,y:e.worldY??e.y});
const distance=(a,b)=>Math.hypot(pos(a).x-pos(b).x,pos(a).y-pos(b).y);
const worldScale=e=>(e.distanceScale??1/3)/100;
const has=(e,id,api={})=>api.hasAbility?api.hasAbility(e,id):Array.isArray(e?.skillSpecs)?e.skillSpecs.some(s=>s.id===id):(e?.abilityIds??[]).includes(id);
const living=e=>!!e&&e.hp>.405&&!e.status?.yseraRemoved;
const allied=(a,b)=>a?.team!==undefined&&b?.team!==undefined?a.team===b.team:a?.side===b?.side;
const available=(e,api)=>living(e)&&!e.status?.deathCounted&&!e.status?.sourceDeathHandled&&!e.status?.yseraHidden&&!e.status?.yseraPaused&&!e.status?.sourcePaused&&!(e.status?.stunUntil>api.now);
const all=game=>{const seen=new Set();return [...(game.state.entities??[]),...(game.state.kings??[])].filter(e=>!seen.has(e.id)&&seen.add(e.id));};
const find=(game,id)=>all(game).find(e=>e.id===id);
const invulnerable=(e,api)=>!!e.invulnerable||has(e,'Avul',api)||!!api.scriptInvulnerable?.(e);
const nearUnits=(game,source,point,radius,friendly,api)=>all(game).filter(e=>living(e)&&!invulnerable(e,api)&&allied(source,e)===friendly&&(source.battleTeam===undefined||e.battleTeam===undefined||source.battleTeam===e.battleTeam)&&distance(point,e)<=radius+1e-8);
const pick=(game,list)=>list.length?list[Math.min(list.length-1,Math.floor(game._random()*list.length))]:null;
const state=(e,id)=>(e.skillStates??={})[id]??={readyAt:0,casts:0};
const enqueue=(game,job)=>{game.state.sourceSkillJobs??=[];game.state.sourceSkillJobs.push(job);return job;};
const capture=e=>({id:e.id,ownerId:e.ownerId,buildingId:e.buildingId,team:e.team,side:e.side,battleTeam:e.battleTeam,laneId:e.laneId,sourceLaneId:e.sourceLaneId,combatRawcode:e.combatRawcode,sourceRawcode:e.sourceRawcode,provenance:e.provenance,sourceVersion:e.sourceVersion,skillVersion:e.skillVersion,distanceScale:e.distanceScale,hp:e.hp,maxHp:e.maxHp,...pos(e),worldX:pos(e).x,worldY:pos(e).y,abilityIds:Array.isArray(e.skillSpecs)?e.skillSpecs.map(s=>s.id):[...(e.abilityIds??[])],status:{garroshAttackLevel:e.status?.garroshAttackLevel??0,garroshLethalStopped:!!e.status?.garroshLethalStopped}});
const sourceOf=(game,job)=>find(game,job.sourceId)??job.source;
const requireApi=(api,keys)=>{for(const key of keys)if(typeof api[key]!=='function')throw new TypeError(`Garrosh active rules require api.${key}`);};
const setPosition=(game,e,point,api)=>api.setUnitPosition(game,e,point);
const pause=(game,e,value,api)=>{e.status??={};e.status.sourcePaused=value;api.pauseUnit(game,e,value);};
const getBuilding=(game,e,api)=>api.getBuilding?.(game,e)??game.state.players?.find(p=>p.id===e.ownerId)?.buildings?.find(b=>b.id===e.buildingId);
const chargeLevel=(e,building)=>Math.max(0,Math.min(100,Math.trunc(Math.max(e.status?.garroshAttackLevel??0,building?.garroshAttackLevel??0))));
function assignCharge(game,e,next,api){
  const building=getBuilding(game,e,api),previous=chargeLevel(e,building);
  e.status??={};e.status.garroshAttackLevel=next;if(building)building.garroshAttackLevel=next;
  api.applyAttackLevel(game,e,next,previous);
  return {previous,level:next};
}
function magicalAoe(game,source,point,radius,amount,api){
  // DamageAoe filters only enemy ownership. Native damage, rather than this
  // enumeration, owns magic immunity, dead units and armor/type interaction.
  for(const target of all(game).filter(e=>!allied(source,e)&&(source.battleTeam===undefined||e.battleTeam===undefined||source.battleTeam===e.battleTeam)&&distance(point,e)<=radius+1e-8))
    api.nativeDamage(game,target,amount,source,{attackType:'normal',damageType:'magic'});
}

export const isGarroshActiveAbility=id=>!!GARROSH_ACTIVE_RULES[id];
export const isGarroshActiveJobType=type=>typeof type==='string'&&type.startsWith('garrosh_active_');
export function canGarroshCastAbility(e,id,api={}){return isGarroshActiveAbility(id)&&has(e,id,api);}

/** Native IssueTargetOrder uses the same mana and native cooldown as manual. */
export function castGarroshAbility(game,e,id,params={},api={}){
  const rule=GARROSH_ACTIVE_RULES[id],now=game.state.time;
  if(!rule||!e||!has(e,id,api))return {ok:false,reason:'当前单位没有此加尔鲁什技能'};
  if(!available(e,{now}))return {ok:false,reason:'单位当前无法施法'};
  const st=state(e,id);
  if((st.readyAt??0)>now+1e-8)return {ok:false,reason:'技能冷却中'};
  if(e.mana<rule.manaCost)return {ok:false,reason:'魔法不足'};
  const point=params.point??(params.target?pos(params.target):null);
  if(!point||!Number.isFinite(point.x)||!Number.isFinite(point.y)||id==='A1A3'&&!living(params.target))return {ok:false,reason:'请选择有效的施法目标'};
  if(distance(e,point)>rule.range*worldScale(e)+1e-8)return {ok:false,reason:'超出原生施法距离',nativeOrderBoundary:params.mode==='auto'};
  e.mana-=rule.manaCost;st.readyAt=now+rule.cooldown;st.casts=(st.casts??0)+1;
  game._event?.('cast',e,rule.name,{skillId:id,sourceMode:params.mode??'manual'});
  // Trig_allabilityActions disables its own shared SPELL_EFFECT trigger
  // (39231–39239,39947). Native costs/orders still happen while it is disabled.
  if(game._sourceAbilityEffectDepth>0)return {ok:true,skillId:id,scriptSuppressed:true};
  game._sourceAbilityEffectDepth=(game._sourceAbilityEffectDepth??0)+1;
  try{
    if(id==='A1A2'){
      requireApi(api,['universalDamage','setUnitPosition','isTerrainBlocked']);
      const origin=pos(e),angle=Math.atan2(point.y-origin.y,point.x-origin.x);
      enqueue(game,{type:'garrosh_active_axe',sourceId:e.id,source:capture(e),removeAt:now+.8,serial:3,
        axes:rule.angles.map((offset,index)=>({index,angle:angle+offset*Math.PI/180,dummy:{...origin},phase:'out',traveled:0,nextAt:now,serial:index,notPath:false,hitIds:[]}))});
    }else{
      requireApi(api,['nativeDamage','setUnitPosition','pauseUnit']);
      // Manual native cast has already paid even when the random ally group is empty.
      const ally=pick(game,nearUnits(game,e,e,rule.allyRadius*worldScale(e),true,api).filter(t=>t.id!==e.id));
      if(ally){
        const start=pos(ally),destination=pos(params.target),angle=Math.atan2(destination.y-start.y,destination.x-start.x),length=Math.hypot(destination.x-start.x,destination.y-start.y);
        pause(game,ally,true,api);
        const movement=(ally.status.garroshActiveJumpPriority??0)<rule.jumpPriority;
        if(movement){ally.status.garroshActiveJumpPriority=rule.jumpPriority;ally.status.garroshActiveNoPathing=true;ally.status.garroshActiveOriginalFlyHeight=api.getFlyHeight?.(game,ally)??ally.flyHeight??0;api.setPathing?.(game,ally,false);}
        enqueue(game,{type:'garrosh_active_throw',sourceId:e.id,source:capture(e),allyId:ally.id,ally:capture(ally),targetId:params.target.id,target:capture(params.target),origin:start,angle,length,startedAt:now,nextAt:now+.03,step:0,movement,landed:false,movementFinished:!movement,landingAt:now+.6});
      }
    }
    return {ok:true,skillId:id};
  }finally{
    game._sourceAbilityEffectDepth--;
  }
}

/** Called once from the main hostile damage event; each branch has its own damaged-first elseif. */
export function tryGarroshAutoCast(game,damaged,attacker,api={}){
  if(!damaged||!attacker||damaged.id===attacker.id||allied(damaged,attacker))return [];
  const outcomes=[];
  for(const id of ['A1A2','A1A3']){
    const caster=has(damaged,id,api)?damaged:has(attacker,id,api)?attacker:null;
    if(!caster)continue;
    const target=caster===damaged?attacker:damaged;
    if(id==='A1A3'&&!pick(game,nearUnits(game,caster,caster,300*worldScale(caster),true,api).filter(t=>t.id!==caster.id)))continue;
    const result=castGarroshAbility(game,caster,id,{mode:'auto',target},api);
    outcomes.push({casterId:caster.id,targetId:target.id,skillId:id,...result});
  }
  return outcomes;
}

/** Independent A1A4 EVENT_UNIT_DAMAGED: do not put behind the main trigger-depth guard. */
export function garroshActiveAfterDamage(game,e,actual,api={}){
  if(!e||!has(e,'A1A4',api)||e.status?.garroshClanStopped||!Number.isFinite(actual)||actual<0)return false;
  const before=Number.isFinite(api.preDamageHp)?api.preDamageHp:e.hp+actual;
  if(before<=.405)return false;
  requireApi(api,['nativeDamage']);
  const proc=game._random()*100<=5;
  if(proc)magicalAoe(game,e,e,300*worldScale(e),75,api);
  e.status??={};e.status.garroshSpin=true;
  if(!e.status.garroshSpinTimerRunning){
    e.status.garroshSpinTimerRunning=true;
    enqueue(game,{type:'garrosh_active_spin_finish',sourceId:e.id,source:capture(e),at:game.state.time+.4});
  }
  return proc;
}

/** Global A1A1 death listener, plus per-body listener shutdown and handle snapshots. */
export function sourceGarroshActiveDeath(game,victim,killer,api={}){
  if(!victim||victim.status?.garroshActiveDeathHandled)return null;
  victim.status??={};victim.status.garroshActiveDeathHandled=true;
  let result=null;
  if(killer&&has(killer,'A1A1',api)&&!killer.status?.garroshLethalStopped){
    requireApi(api,['nativeDamage','applyAttackLevel']);
    const previous=chargeLevel(killer,getBuilding(game,killer,api));
    if(previous<100){assignCharge(game,killer,previous+1,api);result={level:previous+1,burst:false};}
    else{
      // Remove both A19Z abilities BEFORE AoE: nested burst kills can recharge.
      assignCharge(game,killer,0,api);result={level:0,burst:true};
      magicalAoe(game,killer,killer,600*worldScale(killer),5000,api);
      result.level=killer.status.garroshAttackLevel;
    }
  }
  if(victim){
    victim.status??={};
    if(victim.id!==killer?.id&&has(victim,'A1A1',api))victim.status.garroshLethalStopped=true;
    if(has(victim,'A1A4',api))victim.status.garroshClanStopped=true;
    for(const job of game.state.sourceSkillJobs??[]){
      if(!isGarroshActiveJobType(job.type))continue;
      if(job.sourceId===victim.id)job.source=capture(victim);
      if(job.targetId===victim.id)job.target=capture(victim);
      if(job.allyId===victim.id)job.ally=capture(victim);
    }
  }
  return result;
}

function axeEvent(game,job,axis,api){
  if(axis.traveled+60>=600){
    if(axis.phase==='out'){axis.phase='back';axis.traveled=0;axis.hitIds=[];axis.serial=job.serial++;}
    else{axis.phase='done';axis.nextAt=null;axis.notPath=false;}
    return;
  }
  const source=sourceOf(game,job),direction=axis.angle+(axis.phase==='back'?Math.PI:0),step=60*worldScale(source);
  const next={x:axis.dummy.x+Math.cos(direction)*step,y:axis.dummy.y+Math.sin(direction)*step};
  axis.dummy=api.clampDummyPosition?.(game,next,source)??next;axis.traveled+=60;
  if(axis.phase==='out'&&api.isTerrainBlocked(game,axis.dummy,source))axis.notPath=true;
  const targets=nearUnits(game,source,axis.dummy,300*worldScale(source),false,api);
  for(const target of targets){
    if(axis.phase==='back'&&!axis.notPath)setPosition(game,target,axis.dummy,api);
    if(!axis.hitIds.includes(target.id)){axis.hitIds.push(target.id);api.universalDamage(game,target,215,source);}
  }
  axis.nextAt+=.04;axis.serial=job.serial++;
}
function finishJump(game,ally,api){
  ally.status??={};ally.status.garroshActiveNoPathing=false;ally.status.garroshActiveJumpPriority=0;ally.status.garroshActiveFlyHeight=ally.status.garroshActiveOriginalFlyHeight??0;
  api.setPathing?.(game,ally,true);api.jumpComplete?.(game,ally,2);
}

/** All jobs are serializable. Axe/throw timers intentionally continue after caster death. */
export function tickGarroshActiveJob(game,job,api={}){
  if(!isGarroshActiveJobType(job?.type))return false;
  const now=game.state.time,source=sourceOf(game,job);
  if(job.type==='garrosh_active_spin_finish'){
    if(now+1e-8<job.at)return true;
    const e=find(game,job.sourceId)??job.source;if(e){e.status??={};e.status.garroshSpin=false;e.status.garroshSpinTimerRunning=false;}
    return false;
  }
  if(!source)return false;
  if(job.type==='garrosh_active_axe'){
    requireApi(api,['universalDamage','setUnitPosition','isTerrainBlocked']);
    while(true){
      const axis=job.axes.filter(a=>a.phase!=='done').sort((a,b)=>a.nextAt-b.nextAt||a.serial-b.serial)[0];
      if(!axis||axis.nextAt>now+1e-8)break;
      axeEvent(game,job,axis,api);
    }
    return now+1e-8<job.removeAt||job.axes.some(a=>a.phase!=='done');
  }
  if(job.type==='garrosh_active_throw'){
    requireApi(api,['nativeDamage','setUnitPosition','pauseUnit']);
    const ally=find(game,job.allyId)??job.ally;
    while(!job.movementFinished&&job.nextAt<=now+1e-8&&job.nextAt<=job.landingAt+1e-8){
      if(job.step<20&&(ally.status?.garroshActiveJumpPriority??0)<=3){
        const fraction=job.step/20;
        setPosition(game,ally,{x:job.origin.x+Math.cos(job.angle)*job.length*fraction,y:job.origin.y+Math.sin(job.angle)*job.length*fraction},api);
        job.step++;ally.status.garroshActiveFlyHeight=(1-(2*job.step/20-1)**2)*500+(ally.status.garroshActiveOriginalFlyHeight??0);
        job.nextAt+=.03;
      }else{finishJump(game,ally,api);job.movementFinished=true;}
    }
    if(!job.landed&&now+1e-8>=job.landingAt){
      job.landed=true;pause(game,ally,false,api);
      const target=find(game,job.targetId)??job.target;
      magicalAoe(game,source,target??{x:0,y:0},300*worldScale(source),75,api);
    }
    if(!job.movementFinished&&job.nextAt<=now+1e-8){finishJump(game,ally,api);job.movementFinished=true;}
    return !job.landed||!job.movementFinished;
  }
  return false;
}
