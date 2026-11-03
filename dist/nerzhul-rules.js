import {laneToWorld} from './layout.js';

const boundary='原生前摇、同帧命令仲裁、范围枚举与对象移除后的句柄仍为宿主适配；原图模型和特效缺失。';
export const NERZHUL_RULES={
 A1UK:{status:'partial',description:'诅咒：武器伤害监听在受击者位置创建e008，赋予同等级A1UL，向目标请求shadowstrike，1秒后移除dummy。',partial:'目前保留原生命令请求；A1UL缺少初伤、减速、耗魔等字段，尚未结算诅咒伤害。'+boundary},
 A1UL:{status:'partial',description:'诅咒原生AEsh：持续伤害字段5/7.5/10，间隔字段1秒，持续3/5/7秒。',partial:'仅记录请求和已知参数；初伤、减速、耗魔、终止跳数及同buff覆盖待核定，不按残留等级3说明中的225初伤、45持续伤害或15秒结算。'},
 A1UM:{status:'partial',active:true,targetKind:'unit',description:'怨毒：18魔法、11秒冷却、500码选择单位。在目标施法时坐标建立300码范围，1秒后开始每秒对范围内敌军造成55/82.5/110混乱攻击、通用武器伤害，共5次；施法者死亡不取消。源码没有说明中的攻击输出和攻速降低。',partial:boundary+'ANcl也允许点地，但脚本只读取单位目标；空单位坐标的原图映射尚未核定，当前提供单位选取。'},
 A1UN:{status:'partial',active:true,targetKind:'point',description:'仪式枯骨：25魔法、16秒冷却、800码点选，随机召唤暗影死亡军或暗影死亡法师，总数4/6/10；没有1秒限时生命。古树点命令被停止，竞技场移除此能力。',partial:'Web暂按每只独立等概率、立即生成并修正到可通行位置；原生随机权重、出兵时序、散布、自动施法及导航仍待核定。'},
 A1UO:{status:'partial',description:'死亡之兆：主死亡触发器在死亡后1秒，以死亡单位句柄当时坐标为中心，对600码内敌军造成105/157.5/525混乱攻击、通用武器伤害。三级源码是105×5；不向最近敌人移动。',partial:boundary},
};
const has=(e,id)=>e?.skillSpecs?.some(s=>s.id===id)&&(e.abilityLevels?.[id]??1)>0;
const level=(e,id)=>Math.max(1,Math.min(3,Math.trunc(e.abilityLevels?.[id]??1)));
const pos=e=>Number.isFinite(e?.worldX)?{x:e.worldX,y:e.worldY}:laneToWorld(e?.laneId,e?.x,e?.y)??{x:e?.x??0,y:e?.y??0};
const scale=e=>(e.distanceScale??1/3)/100;
const removed=e=>!e||e.status?.sourceRemoved||e.status?.yseraRemoved;
const all=g=>[...g.state.entities,...(g.state.kings??[])];
const jobs=g=>g.state.sourceSkillJobs??=[];
const state=e=>(e.status??={}).nerzhul??={};
const queue=(g,e,type,data)=>{const j={type,sourceId:e.id,source:e,...data};jobs(g).push(j);return j;};
const ally=(a,b)=>a.team!==undefined&&b.team!==undefined?a.team===b.team:a.side===b.side&&a.battleTeam===b.battleTeam;
const group=(g,e,p,r)=>all(g).filter(t=>t.hp>.405&&!removed(t)&&!t.status?.sourceHidden&&!t.status?.yseraHidden&&!has(t,'Aloc')&&!has(t,'Avul')&&!ally(e,t)&&Math.hypot(pos(t).x-p.x,pos(t).y-p.y)<=r*scale(e)+1e-8);
const damage=(g,t,n,e,api)=>api.nativeDamage(g,t,n,e,{attackType:'chaos',damageType:'universal',weapon:true});
const unavailable=(g,e)=>removed(e)||e.hp<=.405||e.status?.sourcePaused||e.status?.yseraPaused||e.status?.illidanPaused||e.status?.sourceHidden||e.status?.yseraHidden||['stunUntil','cycloneUntil','silenceUntil'].some(k=>e.status?.[k]>g.state.time);
export const canNerzhulCast=(e,id)=>!!NERZHUL_RULES[id]?.active&&has(e,id);
const levelIds=['A1UK','A1UM','A1UN','A1UO'];
const buildingIds=(b,def)=>new Set([...(def?.buildingAbilityIds??def?.abilityIds??[]),...(b?.permanentAbilityIds??[])]);
export function nerzhulBuildingCompleted(b,def){
 if(!b||b.construction||!def?.id?.startsWith('v14_'))return;
 const ids=buildingIds(b,def);
 for(const id of levelIds)if(ids.has(id)){
  const counts=b.nerzhulCompletionCounts??={};counts[id]=(counts[id]??0)+1;
  (b.abilityLevels??={})[id]=Math.min(3,counts[id]);
  b.permanentAbilityIds=[...new Set([...(b.permanentAbilityIds??[]),id])];
 }
}
export function restoreNerzhulBuilding(p,b,def){
 if(!def?.id?.startsWith('v14_'))return;
 const ids=buildingIds(b,def),history=p.eggHistory?.events??{};
 const count=['n08J','n08K','n08L'].filter(raw=>history[`${b.id}:${raw}`]).length;
 for(const id of levelIds)if(ids.has(id)){
  const counts=b.nerzhulCompletionCounts??={};
  if(counts[id]===undefined){counts[id]=b.abilityLevels?.[id]??count;b.nerzhulLegacyHistory=true;}
  (b.abilityLevels??={})[id]??=Math.max(1,Math.min(3,counts[id]));
  if(counts[id]>0)b.permanentAbilityIds=[...new Set([...(b.permanentAbilityIds??[]),id])];
 }
}
export function initializeNerzhulDeployment(g,b,e,{restoring=false}={}){
 // PassiveSkillNoArgJJC removes A1UN before PassiveSkill copies levels.
 // SetUnitAbilityLevel cannot recreate an ability which was removed.
 if(e.isArena){e.skillSpecs=e.skillSpecs.filter(s=>s.id!=='A1UN');if(e.skillStates)delete e.skillStates.A1UN;}
 for(const id of levelIds)if(has(e,id)&&b?.abilityLevels?.[id]!==undefined){
  e.abilityLevels??={};if(!restoring||e.abilityLevels[id]===undefined)e.abilityLevels[id]=b.abilityLevels[id];
 }
 if(e.isArena&&(b?.abilityLevels?.A1UN!==undefined||e.abilityLevels?.A1UN!==undefined))(e.abilityLevels??={}).A1UN=0;
}

function resentment(g,e,t){
 if(g._sourceAbilityEffectDepth)return false;
 g._sourceAbilityEffectDepth=(g._sourceAbilityEffectDepth??0)+1;
 try{
  const cc=level(e,'A1UM');queue(g,e,'nerzhul_resentment',{...pos(t),level:cc,damage:55*(1+(cc-1)*.5),nextAt:g.state.time+1,ticks:0});return true;
 }finally{g._sourceAbilityEffectDepth--;}
}
export function castNerzhul(g,e,id,params,api){
 const fail=message=>({ok:false,message});if(!canNerzhulCast(e,id))return fail('当前单位没有此技能');if(unavailable(g,e))return fail('单位当前无法施法');
 const s=api.compileAbility(g,e,id),t=params.target,summoning=id==='A1UN';
 if(summoning&&(e.isAncient||e.traits?.includes('ancient')))return fail('古树单位不能执行仪式枯骨点命令');
 if(!summoning&&(!t||t.hp<=.405||removed(t)||t.battleTeam!==e.battleTeam||has(t,'Aloc')||t.status?.sourceHidden||t.status?.yseraHidden||!api.matchesTargets(s,e,t)))return fail('请选择有效单位');
 const p=summoning?params.point:pos(t);if(!p||!Number.isFinite(p.x)||!Number.isFinite(p.y))return fail('请选择有效位置');
 if(Math.hypot(pos(e).x-p.x,pos(e).y-p.y)>s.range+1e-8)return fail('超出施法范围');
 const st=(e.skillStates??={})[id]??={readyAt:0,casts:0};if(st.readyAt>g.state.time+1e-8)return fail('技能冷却中');if(e.mana<s.manaCost)return fail('魔法不足');
 e.mana-=s.manaCost;st.readyAt=g.state.time+s.cooldown;st.casts++;e.pendingAttack=null;
 const record={id,at:g.state.time,targetId:t?.id,point:{...p},level:level(e,id)};
 if(summoning){
  record.summonIds=[];record.nativeTimingApproximation=true;
  for(let i=0;i<[4,6,10][record.level-1];i++){
   const code=g._random()<.5?'u04D':'u04E';
   const n=api.spawnUnit(g,e,code,{worldX:p.x,worldY:p.y,userData:e.userData??0,isHero:false,isNativeHero:false,isSummon:true,buildingId:undefined,expiresAt:undefined});
   if(n){n.status.sourceJWMember=true;n.status.sourceJHMember=n.userData;api.setUnitPosition(g,n,p);record.summonIds.push(n.id);}
  }
 }else record.scriptApplied=resentment(g,e,t);
 state(e).lastCast=record;
 g._event?.('cast',e,s.name,{skillId:id});return {ok:true,skillId:id,message:'已施放'+s.name};
}
export function nerzhulAttackDamage(g,e,t,api){
 if(!has(e,'A1UK'))return;
 const p=pos(t),cc=level(e,'A1UK'),dummy=api.spawnUnit(g,e,'e008',{worldX:p.x,worldY:p.y,facing:0,userData:0,isSummon:false,scriptAuxiliary:true,buildingId:undefined});
 if(!dummy)return;api.addAbility(g,dummy,'A1UL');(dummy.abilityLevels??={}).A1UL=cc;
 const request={id:'A1UL',order:'shadowstrike',at:g.state.time,targetId:t.id,level:cc,damagePerTick:[5,7.5,10][cc-1],interval:1,duration:[3,5,7][cc-1],nativeResolution:'unresolved'};
 state(dummy).lastOrder=request;state(e).curseRequest={...request,dummyId:dummy.id};
 queue(g,dummy,'nerzhul_remove_dummy',{nextAt:g.state.time+1});
}
export function nerzhulNativeSpellEffect(g,e,id,api){
 if(id!=='A0BT'||g._sourceAbilityEffectDepth)return;
 const s=state(e);s.waterElementalCasts=(s.waterElementalCasts??0)+1;
 if(s.waterElementalCasts===2)api.removeAbility(g,e,id);
}
export function nerzhulMainDamage(g,t,e,n,api){
 if(!(n>0)||!e||t===e||ally(t,e)||has(e,'A2Y7'))return;
 const source=has(t,'A1UM')?t:has(e,'A1UM')?e:null;if(!source)return;
 const target=source===t?e:t,result=castNerzhul(g,source,'A1UM',{target},api);
 state(source).lastOrder={id:'A1UM',order:'unloadall',at:g.state.time,targetId:target.id,ok:result.ok,reason:result.ok?null:result.message};
}
export function nerzhulSummonDeath(g,e){
 if((e.combatRawcode??e.sourceRawcode)!=='u04D')return;
 const victims=group(g,e,pos(e),300);state(e).deathBurst={at:g.state.time,point:pos(e),targetIds:victims.map(t=>t.id)};
 for(const t of victims)queue(g,e,'nerzhul_death_loop',{targetId:t.id,target:t,nextAt:g.state.time+1,ticks:0});
}
export function nerzhulMainDeath(g,e){
 if(has(e,'A1UO'))queue(g,e,'nerzhul_omen',{level:level(e,'A1UO'),nextAt:g.state.time+1});
}
export function nerzhulWidgetDeath(g,e){
 for(const j of jobs(g))if(j.type==='nerzhul_death_loop'&&j.targetId===e.id)j.done=true;
}
function tick(g,j,api){
 if(j.type==='nerzhul_remove_dummy'){
  j.done=true;api.removeUnit(g,j.source);
 }else if(j.type==='nerzhul_resentment'){
  for(const t of group(g,j.source,j,300))damage(g,t,j.damage,j.source,api);
  j.ticks++;j.nextAt+=1;if(j.ticks===5)j.done=true;
 }else if(j.type==='nerzhul_omen'){
  j.done=true;const p=pos(j.source),amount=j.level===3?525:105*(1+(j.level-1)*.5);
  state(j.source).omen={at:g.state.time,point:p,level:j.level,damage:amount};
  for(const t of group(g,j.source,p,600))damage(g,t,amount,j.source,api);
  g._event?.('cast',j.source,'死亡之兆',{skillId:'A1UO'});
 }else if(j.type==='nerzhul_death_loop'){
  if(removed(j.target)){j.done=true;return;}
  damage(g,j.target,80,j.source,api);j.ticks++;j.nextAt+=1;if(j.ticks===5)j.done=true;
 }
}
export function tickNerzhulJobs(g,api){
 const frame=g.state.time;
 try{while(true){const j=jobs(g).filter(j=>!j.done&&j.type?.startsWith('nerzhul_')&&j.nextAt<=frame+1e-8).sort((a,b)=>a.nextAt-b.nextAt)[0];if(!j)break;g.state.time=j.nextAt;tick(g,j,api);}}
 finally{g.state.time=frame;}
}
export function restoreNerzhul(g){
 const handles=new Map(all(g).map(e=>[e.id,e])),bind=e=>{if(!e)return e;if(!handles.has(e.id))handles.set(e.id,e);return handles.get(e.id);};
 for(const j of jobs(g))if(j.type?.startsWith('nerzhul_'))for(const key of ['source','target'])if(j[key])j[key]=bind(j[key]);
}
