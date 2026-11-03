import {V14_ABILITIES,V14_UNIT_TEMPLATES} from './v14-reference.js';

const nativeBoundary='同一e008逐目标添加、命令后立即移除A0YG，Web以合法目标即时命中适配；request、宿主接受和实际施加分别保存，不证明原图所有命令都完成。AEer缺失费用/冷却/施法字段采用已核对1.24.4与1.27.1原生参考75蓝/8秒/0秒；自定义继承、单位施法点、原生枚举及伤害跳点仍待核定，持续伤害按宿主帧积分。';
export const DEATHWING_HUMAN_RULES={
 A0YF:{status:'partial',active:true,targetKind:'enemy',manaCost:12,cooldown:7,range:800,description:'上古之神之力：手动对800码目标施放，消耗12魔法、冷却7秒。在目标当前位置250码范围按枚举顺序向前7个敌人请求缠绕，不保证主目标排在前7个；宿主仅对合法地面有机目标施加3秒禁移禁攻，并按命令时最大生命的5%/秒造成魔法伤害。',partial:nativeBoundary+'原图未找到700码随机自动施法入口；ANfd缺失的原生伤害不补造。'},
 A0YG:{status:'partial',description:'上古之神之力辅助：AEer等级2，BEer，普通与英雄均3秒，地面敌对有机目标。每次命令把DataA设置为该目标当时最大生命的5%。',partial:nativeBoundary},
 A0YE:{status:'partial',preserveNativeKind:true,description:'沸腾血脉：主受伤事件结算前，按截断后的缺血比例×10请求0至10级，不是1至11级。自身回复只使用已提取的当前等级DataB；不改变50点基础回复。',partial:'0级设置的原生结果与第1级回复、移动速度和百分比模式字段缺失；0级请求保留原有效等级并记录未核定，不能把技能设为不存在或猜出百分比回复。'},
};
// These are base-object references, not recovered custom-map overrides.
export const DEATHWING_ROOT_NATIVE_REFERENCE=Object.freeze({base:'AEer',manaCost:75,cooldown:8,cast:0,versions:['1.24.4','1.27.1'],customInheritanceVerified:false});
const has=(e,id)=>e?.skillSpecs?.some(s=>s.id===id)&&(e.abilityLevels?.[id]??1)>0;
const pos=e=>({x:e?.worldX??e?.x,y:e?.worldY??e?.y});
const scale=e=>(e.distanceScale??1/3)/100;
const all=g=>[...(g.state.entities??[]),...(g.state.kings??[])];
const jobs=g=>g.state.sourceSkillJobs??=[];
const removed=e=>!e||e.status?.sourceRemoved||e.status?.yseraRemoved;
const hidden=e=>e?.status?.sourceHidden||e?.status?.yseraHidden;
const ally=(a,b)=>a.team!==undefined&&b.team!==undefined?a.team===b.team:a.side===b.side;
const alive=e=>!removed(e)&&e.hp>.405&&!e.status?.deathCounted;
const state=e=>(e.status??={}).deathwingHuman??={};
const field=(id,key)=>V14_ABILITIES[id]?.resolved_fields?.[key];
const finite=(value,fallback)=>value!==undefined&&Number.isFinite(Number(value))?Number(value):fallback;
const distance=(a,b)=>Math.hypot(pos(a).x-pos(b).x,pos(a).y-pos(b).y);
const magicImmune=(e,api)=>api.magicImmune?.(e)??e.skillSpecs?.some(s=>s.kind==='immunity'&&s.status==='implemented');
const invulnerable=(e,api)=>api.scriptInvulnerable?.(e)??(e.invulnerable||has(e,'Avul'));
function dummy(g,e,point){
 const f=V14_UNIT_TEMPLATES.e008.sourceRawFields;
 return {id:g._uid('deathwing-human-dummy'),combatRawcode:'e008',sourceRawcode:'e008',skillVersion:'v14.1A5',distanceScale:e.distanceScale??1/3,side:e.side,team:e.team,battleTeam:e.battleTeam,ownerId:e.ownerId,sourceNativeOwnerId:e.sourceNativeOwnerId,laneId:e.laneId,sourceLaneId:e.sourceLaneId,userData:e.userData??0,worldX:point.x,worldY:point.y,hp:Number(f.HP),maxHp:Number(f.HP),mana:Number(f.mana0),maxMana:Number(f.manaN),manaRegen:Number(f.regenMana),skillSpecs:[],abilityLevels:{},status:{},isSummon:true,sourceGroups:['JW','JH'],lifeRequest:10000,createdAt:g.state.time,expiresAt:g.state.time+3,castPoint:f.castpt??null,castBackswing:f.castbsw??null};
}
function targetFailure(g,d,t,s,api){
 if(!alive(t))return 'dead-or-removed';
 if(hidden(t)||has(t,'Aloc'))return 'hidden-or-locust';
 if(ally(d,t)||t.battleTeam!==d.battleTeam)return 'alliance-or-battle';
 if(t.isBuilding||t.targetType==='air'||t.traits?.includes('mechanical'))return 'native-target-mask';
 if(invulnerable(t,api)||magicImmune(t,api)||t.status?.cycloneUntil>g.state.time)return 'immune-or-invulnerable';
 if(api.matchesTargets&&!api.matchesTargets(s,d,t))return 'native-target-mask';
 if(distance(d,t)>finite(field('A0YG','Rng2'),800)*scale(d)+1e-8)return 'range';
 return null;
}
function rootRequest(g,e,d,t,api){
 const now=g.state.time,s=api.compileAbility?.(g,d,'A0YG')??{targets:['ground','enemy','neutral','organic']};
 const manaCost=finite(field('A0YG','Cost2'),DEATHWING_ROOT_NATIVE_REFERENCE.manaCost),cooldown=finite(field('A0YG','Cool2'),DEATHWING_ROOT_NATIVE_REFERENCE.cooldown);
 const duration=finite(field('A0YG',(t.isNativeHero??t.isHero)?'HeroDur2':'Dur2'),3);
 const r={at:now,casterId:d.id,originSourceId:e.id,targetId:t.id,abilityId:'A0YG',level:2,order:'entanglingroots',dataField:108,dataA:t.maxHp*.05,targetMaxHp:t.maxHp,duration,requested:true,hostAccepted:false,applied:false,nativeOutcome:'unverified',abilityRemovedAfterOrder:true,nativeReference:{...DEATHWING_ROOT_NATIVE_REFERENCE},manaCost,cooldown,castPoint:d.castPoint};
 d.abilityLevels.A0YG=2;
 const failure=targetFailure(g,d,t,s,api)??(d.mana<manaCost?'mana':null);
 if(failure)r.rejectedByHost=failure;
 else{
  r.hostAccepted=true;r.adapter='immediate-readded-dummy-ability';d.mana-=manaCost;r.helperReadyAt=now+cooldown;
  // BEer does not stack. Its replacement invalidates the older damage job.
  const token=g._uid('deathwing-human-root');t.buffs??=[];
  const previous=t.buffs.find(b=>b.key==='BEer'),previousJob=previous?.deathwingHumanToken&&jobs(g).find(j=>j.token===previous.deathwingHumanToken);
  t.buffs=t.buffs.filter(b=>b.key!=='BEer');
  t.buffs.push({key:'BEer',skillId:'A0YG',sourceId:d.id,ownerId:d.ownerId,expiresAt:now+duration,root:true,disarm:true,dps:0,deathwingHumanToken:token});
  t.status??={};const priorRootUntil=previousJob&&t.status.rootUntil===previousJob.endAt?previousJob.priorRootUntil??0:t.status.rootUntil??0;t.status.rootUntil=Math.max(priorRootUntil,now+duration);t.pendingAttack=null;
  jobs(g).push({type:'deathwing_human_root',sourceId:e.id,source:e,dummy:d,targetId:t.id,token,dps:r.dataA,lastAt:now,endAt:now+duration,priorRootUntil});
  r.applied=true;r.token=token;
 }
 delete d.abilityLevels.A0YG;
 return r;
}
export const canDeathwingHumanCast=(e,id)=>id==='A0YF'&&has(e,id);
export function castDeathwingHuman(g,e,id,params={},api={}){
 const fail=message=>({ok:false,message}),now=g.state.time,t=params.target;
 if(!canDeathwingHumanCast(e,id))return fail('当前单位没有上古之神之力');
 if(!alive(e)||hidden(e)||e.status?.sourcePaused||e.status?.yseraPaused||e.status?.illidanPaused||['stunUntil','cycloneUntil','silenceUntil'].some(k=>e.status?.[k]>now))return fail('单位当前无法施法');
 if(!alive(t)||hidden(t)||has(t,'Aloc')||ally(e,t)||t.battleTeam!==e.battleTeam||invulnerable(t,api)||magicImmune(t,api)||t.status?.cycloneUntil>now)return fail('请选择有效敌人');
 if(distance(e,t)>800*scale(e)+1e-8)return fail('超出800施法范围');
 const st=e.skillStates?.[id]??{readyAt:0,casts:0};if(st.readyAt>now+1e-8)return fail('技能冷却中');if(!(e.mana>=12))return fail('魔法不足');(e.skillStates??={})[id]=st;
 e.mana-=12;st.readyAt=now+7;st.casts++;e.pendingAttack=null;g._event?.('cast',e,'上古之神之力',{skillId:id});
 if(g._sourceAbilityEffectDepth)return {ok:true,skillId:id,scriptSuppressed:true};
 g._sourceAbilityEffectDepth=(g._sourceAbilityEffectDepth??0)+1;
 try{
  const d=dummy(g,e,pos(t)),group=all(g).filter(q=>!removed(q)&&!hidden(q)&&!has(q,'Aloc')&&!ally(e,q)&&q.battleTeam===e.battleTeam&&distance(d,q)<=250*scale(e)+1e-8).slice(0,7);
  const requests=group.map(q=>rootRequest(g,e,d,q,api));d.status.orderRequests=requests;
  jobs(g).push({type:'deathwing_human_dummy',sourceId:e.id,source:e,dummy:d,endAt:d.expiresAt});
  state(e).lastRootCast={at:now,point:pos(t),dummyId:d.id,requests,nativeOutcome:'unverified',missingFingerOfDeathDamage:true};
 }finally{g._sourceAbilityEffectDepth--;}
 return {ok:true,skillId:id};
}
export function deathwingHumanMainDamage(g,target,attacker,amount,api={}){
 if(!(amount>0)||!attacker||attacker.id===target?.id||ally(attacker,target)||has(attacker,'A2Y7')||!has(target,'A0YE')||!(target.maxHp>0))return;
 const requestedLevel=Math.max(0,Math.min(10,Math.trunc((target.maxHp-target.hp)/target.maxHp*10))),oldLevel=target.abilityLevels?.A0YE??1;
 const report={at:g.state.time,preDamageHp:target.hp,maxHp:target.maxHp,requestedLevel,previousLevel:oldLevel,applied:requestedLevel>0};
 if(requestedLevel>0){(target.abilityLevels??={}).A0YE=requestedLevel;report.effectiveLevel=requestedLevel;report.explicitRegen=finite(field('A0YE','DataB'+requestedLevel),null);}
 else{report.effectiveLevel=oldLevel;report.nativeOutcome='level-zero-unverified';report.explicitRegen=finite(field('A0YE','DataB'+oldLevel),null);}
 state(target).bloodLevelRequest=report;
}
export function tickDeathwingHumanJobs(g,api={}){
 if(g.state.paused)return;
 for(const j of jobs(g))if(!j.done&&j.type==='deathwing_human_root'){
  const t=all(g).find(t=>t.id===j.targetId),b=t?.buffs?.find(b=>b.deathwingHumanToken===j.token);
  if(!alive(t)||!b){finishRoot(g,j,t);continue;}
  const until=Math.min(g.state.time,j.endAt),elapsed=Math.max(0,until-j.lastAt);j.lastAt=until;
  if(elapsed>0){
   if(api.nativeDamage)api.nativeDamage(g,t,j.dps*elapsed,j.dummy,{attackType:'spells',damageType:'magic'});
   else api.sourceDamage?.(g,t,j.dps*elapsed,j.dummy,true);
  }
  if(g.state.time>=j.endAt-1e-8||!alive(t))finishRoot(g,j,t);
 }
 for(const j of jobs(g))if(!j.done&&j.type==='deathwing_human_dummy'&&g.state.time>=j.endAt-1e-8){j.dummy.hp=0;j.dummy.status.sourceRemoved=true;j.done=true;}
}
function finishRoot(g,j,t){
 j.done=true;if(!t)return;t.buffs=(t.buffs??[]).filter(b=>b.deathwingHumanToken!==j.token);
 if(t.status?.rootUntil===j.endAt)t.status.rootUntil=Math.max(g.state.time,j.priorRootUntil??0,...t.buffs.filter(b=>b.root).map(b=>b.expiresAt));
}
export function restoreDeathwingHuman(g){
 const bodies=new Map(all(g).map(e=>[e.id,e])),dummies=new Map();
 for(const j of jobs(g))if(j.type?.startsWith('deathwing_human_')){
  j.source=bodies.get(j.sourceId)??j.source;
  if(j.dummy){if(dummies.has(j.dummy.id))j.dummy=dummies.get(j.dummy.id);else dummies.set(j.dummy.id,j.dummy);}
 }
}
