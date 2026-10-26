import {V14_ABILITIES,V14_UNIT_TEMPLATES} from './v14-reference.js';

// war3map.j 32753–32977, 40856–40869, 41579–41595, 42324–42325,
// 43809–43810. Timer counts come from the bodies, not the stale tooltips.
const nativeBoundary='原生IssueOrder连续命令仲裁、施法前摇及虚体/召唤物碰撞落点尚缺原图运行证据；Web同步派发并共享魔法与冷却。';
export const VASHJ_RULES=Object.freeze({
  A1O5:{name:'闪电箭',status:'partial',active:true,targetKind:'point',range:500,manaCost:15,cooldown:8,
    description:'向目标方向−45°、0°、+45°发出3箭；每0.04秒移动50码，首次在200内遇敌或末步前450码落地。每个落点300范围立即及每秒造成101点通用伤害，共7次。落地后施法者死亡才取消该落点，飞行仍继续。',partial:nativeBoundary},
  A1O7:{name:'毒性孢子',status:'partial',active:true,targetKind:'none',manaCost:15,cooldown:20,
    description:'面向前方±90°、距离0至500码随机生成3个固定孢子；各自第1至10秒在200范围造成99点通用伤害，第11秒销毁。施法者死亡不取消，没有额外15点毒伤。',partial:nativeBoundary},
  A1O8:{name:'双子召唤',status:'partial',active:true,targetKind:'none',manaCost:16,cooldown:8,
    description:'召唤2只持续13秒的娜迦幻影n07J。召唤回调各自从第0秒起每秒为召唤者恢复5生命、1.5魔法；任一绑定单位死亡结束对应回调。执行次数达到召唤者当前最大生命整数值时先结束，不再回复。',partial:nativeBoundary+'召唤回调采用EVENT_PLAYER_UNIT_SUMMON的GetTriggerUnit为幻影的Web映射，仍需原生事件身份验证。'},
  A1N1:{name:'寒冰之箭',status:'implemented',description:'实际攻击伤害事件独立20%概率对当前目标追加96点通用伤害，再发A0I7第4级眩晕：普通单位4秒、原生英雄2秒。没有周边减速。'},
  A1OC:{name:'女王的祝福与惩戒',status:'implemented',description:'建筑部署后0秒仅扫描一次全图h0OV女王：友方给予A1CK第2级（自身攻击+15%），敌方第3级（−11%）并附加A1OE攻速−8%，双方都有则第4级（+4%）。重复同阵营不叠加，友方分支没有攻速奖励。'},
});
const has=(e,id)=>Array.isArray(e?.skillSpecs)?e.skillSpecs.some(s=>s.id===id):(e?.abilityIds??[]).includes(id);
const raw=e=>e?.combatRawcode??e?.sourceRawcode??e?.rawcode;
const pos=e=>({x:e.worldX??e.x??0,y:e.worldY??e.y??0});
const scale=e=>(e.distanceScale??1/3)/100;
const alive=e=>e&&e.hp>0&&!e.status?.sourceDeathHandled&&!e.status?.deathCounted;
const now=g=>g._vashjEventAt??g.state.time;
const units=g=>[...g.state.entities,...(g.state.kings??[])];
const find=(g,id)=>units(g).find(e=>e.id===id);
const snapshot=e=>{const copy=JSON.parse(JSON.stringify(e));if(copy.status)copy.status.sourceNativeAttackBusy=false;return copy;};
const enqueue=(g,e,type,extra={})=>{const job={type,sourceId:e.id,source:snapshot(e),...extra};(g.state.sourceSkillJobs??=[]).push(job);return job;};
const enemies=(g,e,p,r)=>units(g).filter(t=>t.team!==e.team&&(t.battleTeam===undefined||e.battleTeam===undefined||t.battleTeam===e.battleTeam)&&Math.hypot(pos(t).x-p.x,pos(t).y-p.y)<=r+1e-8);
const selected=(g,e,p,r)=>enemies(g,e,p,r).filter(t=>alive(t)&&!has(t,'Avul'));
const atTime=(g,at,fn)=>{const previous=g._vashjEventAt;g._vashjEventAt=at;try{return fn();}finally{if(previous===undefined)delete g._vashjEventAt;else g._vashjEventAt=previous;}};
const ancient=e=>e.traits?.includes('ancient')||String(e.unitType??e.sourceRawFields?.type??'').split(',').includes('ancient');
export const canVashjCastAbility=(e,id)=>!!VASHJ_RULES[id]?.active&&has(e,id);
export const isVashjJobType=type=>type.startsWith('vashj_');

export function initializeVashjDeployment(g,building,body){
  if(!building||body.status?.vashjAllianceRegistered)return;
  const code=building.sourceRawcode??building.unitId?.replace(/^v14_/,'');
  if(!(V14_UNIT_TEMPLATES[code]?.abilityIds??[]).includes('A1OC')&&!(building.permanentAbilityIds??[]).includes('A1OC'))return;
  (body.status??={}).vashjAllianceRegistered=true;
  enqueue(g,body,'vashj_alliance',{nextAt:now(g)});
}

// Explicit native summon-event bridge: CreateUnit alone never starts this.
export function vashjNativeSummon(g,source,summoned){
  if(raw(summoned)!=='n07J')return false;
  (summoned.status??={}).sourceOpacity=.6;
  enqueue(g,source,'vashj_phantom',{phantomId:summoned.id,nextAt:now(g),count:0,expiresAt:summoned.expiresAt??null});
  return true;
}

export function vashjOnAttackDamage(g,source,target,api){
  if(!has(source,'A1N1')||g._random()*100>20)return false;
  api.universalDamage(g,target,96,source);
  if(alive(target))api.vertigoTarget(g,source,target,4);
  g._event?.('cast',source,'寒冰之箭',{skillId:'A1N1',targetId:target.id});
  return true;
}

export function tryVashjAutoCast(g,victim,attacker,api){
  if(has(attacker,'A2Y7'))return;
  for(const id of ['A1O5','A1O7','A1O8']){
    const source=has(victim,id)?victim:has(attacker,id)?attacker:null;
    if(source)castVashjAbility(g,source,id,{target:source===victim?attacker:victim},api);
  }
}

export function castVashjAbility(g,e,id,params={},api={}){
  const rule=VASHJ_RULES[id],time=now(g),fail=message=>({ok:false,message});
  if(!canVashjCastAbility(e,id))return fail('该单位没有此瓦斯琪技能');
  if(!alive(e)||e.status?.stunUntil>time||e.status?.cycloneUntil>time||e.status?.sourcePaused||e.status?.illidanPaused||e.status?.yseraPaused||e.status?.yseraHidden)return fail('单位当前无法施法');
  const state=(e.skillStates??={})[id]??={readyAt:0,casts:0};
  if(state.readyAt>time+1e-8)return fail('技能冷却中');
  if(e.mana<rule.manaCost)return fail('魔法不足');
  const point=params.point??(params.target?pos(params.target):null),origin=pos(e);
  if(id==='A1O5'&&(!point||!Number.isFinite(point.x)||!Number.isFinite(point.y)||Math.hypot(point.x-origin.x,point.y-origin.y)>500*scale(e)+1e-8))return fail('请选择500范围内的目标位置');
  e.mana-=rule.manaCost;state.readyAt=time+rule.cooldown;state.casts++;
  g._event?.('cast',e,rule.name,{skillId:id});
  // AHwe is native; it is not suppressed by the allability script trigger.
  if(id==='A1O8'){
    for(let i=0;i<2;i++){
      const phantom=api.spawnUnit(g,e,'n07J',{isSummon:true,worldX:origin.x,worldY:origin.y,expiresAt:time+13});
      if(phantom)vashjNativeSummon(g,e,phantom);
    }
    return {ok:true,skillId:id};
  }
  if(g._sourceAbilityEffectDepth>0||ancient(e))return {ok:true,skillId:id,scriptSuppressed:true};
  g._sourceAbilityEffectDepth=(g._sourceAbilityEffectDepth??0)+1;
  try{
    if(id==='A1O5'){
      const angle=Math.atan2(point.y-origin.y,point.x-origin.x);
      for(const offset of [-45,0,45])enqueue(g,e,'vashj_flight',{...origin,angle:angle+offset*Math.PI/180,steps:0,nextAt:time});
    }else{
      for(let i=0;i<3;i++){
        const angle=((e.facing??0)-90+180*g._random())*Math.PI/180,distance=500*scale(e)*g._random();
        enqueue(g,e,'vashj_spore',{x:origin.x+Math.cos(angle)*distance,y:origin.y+Math.sin(angle)*distance,nextAt:time+1,count:0});
      }
    }
  }finally{g._sourceAbilityEffectDepth--;}
  return {ok:true,skillId:id};
}

function alliance(g,source,api){
  for(const queen of units(g).filter(u=>raw(u)==='h0OV')){
    const level=source.abilityLevels?.A1CK??(has(source,'A1CK')?1:0);
    const allied=queen.team===source.team;
    if(queen.team===undefined||source.team===undefined)continue;
    const next=allied?(level===0?2:level===3?4:level):(level===0?3:level===2?4:level);
    if(next!==level){api.addAbility(g,source,'A1CK');(source.abilityLevels??={}).A1CK=next;}
    if(!allied&&!has(source,'A1OE'))api.addAbility(g,source,'A1OE');
  }
  // Only this native object's explicit level-dependent fields are adjusted.
  const aura=source.skillSpecs?.find(s=>s.id==='A1CK');
  if(aura)aura.damage=Number(V14_ABILITIES.A1CK.resolved_fields[`DataA${source.abilityLevels?.A1CK??1}`]);
}

export function tickVashjJob(g,job,api={}){
  if(job.done)return false;
  const source=find(g,job.sourceId)??job.source,time=g.state.time;
  while(!job.done&&job.nextAt<=time+1e-8){
    const at=job.nextAt;
    atTime(g,at,()=>{
      if(job.type==='vashj_alliance'){alliance(g,source,api);job.done=true;return;}
      if(job.type==='vashj_phantom'){
        const phantom=find(g,job.phantomId);
        if(!alive(source)||!alive(phantom)||job.expiresAt!==null&&at>=job.expiresAt||++job.count>=Math.trunc(source.maxHp)){job.done=true;return;}
        source.hp=Math.min(source.maxHp,source.hp+5);source.mana=Math.min(source.maxMana,source.mana+1.5);job.nextAt+=1;return;
      }
      if(job.type==='vashj_flight'){
        if(job.steps<9){
          const p={x:job.x+Math.cos(job.angle)*50*scale(source),y:job.y+Math.sin(job.angle)*50*scale(source)};
          Object.assign(job,api.clampDummyPosition?.(g,p,source)??p);job.steps++;
          if(!selected(g,source,job,200*scale(source)).length){job.nextAt+=.04;return;}
        }
        enqueue(g,source,'vashj_lightning',{x:job.x,y:job.y,nextAt:at,count:0});job.done=true;return;
      }
      const limit=job.type==='vashj_spore'?10:7;
      if(++job.count>limit){job.done=true;return;}
      const radius=(job.type==='vashj_spore'?200:300)*scale(source),amount=job.type==='vashj_spore'?99:101;
      // DamageAoe checks enemy only; immunity, death and invulnerability are
      // resolved at the damage entry, not by SelectRange's stricter filter.
      for(const target of enemies(g,source,job,radius))api.universalDamage(g,target,amount,source);
      job.nextAt+=1;
    });
  }
  return !job.done;
}

export function sourceVashjDeath(g,dead){
  for(const job of g.state.sourceSkillJobs??[]){
    if(!isVashjJobType(job.type))continue;
    if(job.sourceId===dead.id){job.source=snapshot(dead);if(['vashj_lightning','vashj_phantom'].includes(job.type))job.done=true;}
    if(job.type==='vashj_phantom'&&job.phantomId===dead.id)job.done=true;
  }
}
