import {laneToWorld} from './layout.js';
import {V14_ABILITIES} from './v14-reference.js';

const boundary='原生枚举次序、同帧计时、地图坐标/碰撞、辅助施法耗魔和命令仲裁为宿主适配；缺失原生字段不当作已证明的零值。';
export const DEATHWING_DRAGON_RULES={
 A0YH:{status:'partial',description:'死亡降临：普通单位死亡时仅在当前波数≤20排队，3秒后检查userData对应的活跃玩家，再在旧体当前位置创建龙形h0PE/h0V0/h0XG。500码内敌人均请求1秒锤晕，前11个枚举敌人受到99999混乱/通用非武器伤害；最后移除旧体。龙形每秒在生命≤50%时恢复400，首次8秒后喷火，喷火第1/2/3秒各造成一次200法术攻击/普通伤害（武器事件）。',partial:boundary+'Web活跃人类和AI席位均映射原图PLAYING+MAP_CONTROL_USER；出生科技、攻击移动目的地与已RemoveUnit句柄的行为待核定。喷火使用13个相距100码、半径400码圆的并集，每次脉冲单目标只命中一次；喷火结束重置父计数，因此后续通常间隔11秒启动。'},
 A0YJ:{status:'partial',active:true,targetKind:'enemy',manaCost:12,cooldown:7,range:800,description:'撕裂大地：12魔法、7秒冷却、800码单位目标，1.5秒后启动裂隙；每0.03秒累计50码，第一次从100码开始，至500码停止。每步重新从施法者当前位置沿初始朝向选150码敌人，每目标只推50码并造成20法术攻击/通用非武器伤害；终点350码造成300同类型伤害并请求3秒锤晕。受正数敌对伤害事件时25%置零当前事件值，并依次在受伤前生命≤70/40/10%时各触发一次400码100法术攻击/普通伤害（武器事件）。击杀回100生命，killnum不等于25时增加0.06原生攻速并加1计数。',partial:boundary+'路径推开目标会改写公共坐标，末次爆炸沿用最后一次改写的位置。A0OZ路径只添加不重置等级，爆炸保留等级5；同族共享马甲等级已保留，其他家族对同一全局马甲的影响待核定。ANfd DataC原生附伤缺失，DataB=.01是图形持续时间，不补伤害。未发现脚本自动命令，原生AI自主施法未补造。'},
 A0YI:{status:'partial',description:'喷火辅助Aslo：每次命中请求slow，已知3秒攻击速度降低75%；缺失移速字段不补减速。',partial:boundary+'当前对存活、非无敌、非魔免且通过原生目标mask的敌人应用已知攻速值；默认目标许可、耗魔、冷却、共享马甲同帧连续命令仍待原生核定。'},
};
const has=(e,id)=>e?.skillSpecs?.some(s=>s.id===id)&&(e.abilityLevels?.[id]??1)>0;
const raw=e=>e?.combatRawcode??e?.sourceRawcode;
const removed=e=>!e||e.status?.sourceRemoved||e.status?.yseraRemoved;
const hidden=e=>e?.status?.sourceHidden||e?.status?.yseraHidden;
const pos=e=>Number.isFinite(e?.worldX)?{x:e.worldX,y:e.worldY}:laneToWorld(e?.laneId,e?.x,e?.y)??{x:e?.x??0,y:e?.y??0};
const scale=e=>(e.distanceScale??1/3)/100;
const all=g=>[...g.state.entities,...(g.state.kings??[])];
const ally=(a,b)=>a.team!==undefined&&b.team!==undefined?a.team===b.team:a.side===b.side&&a.battleTeam===b.battleTeam;
const jobs=g=>g.state.sourceSkillJobs??=[];
const st=e=>(e.status??={}).deathwingDragon??={};
const queue=(g,e,type,data={})=>{const j={id:'deathwing-job-'+(g.state.deathwingDragonJobSerial=(g.state.deathwingDragonJobSerial??0)+1),type,sourceId:e.id,source:e,...data};jobs(g).push(j);return j;};
// These branches use GroupEnumUnitsInRange, not SelectRange. A dead or
// invulnerable enemy can consume an enumeration slot even when damage fails.
const group=(g,e,p,r)=>all(g).filter(t=>!removed(t)&&!hidden(t)&&!has(t,'Aloc')&&t.battleTeam===e.battleTeam&&!ally(e,t)&&Math.hypot(pos(t).x-p.x,pos(t).y-p.y)<=r*scale(e)+1e-8);
export const hasPendingDeathwingRevival=e=>!!e?.status?.deathwingDragon?.revival?.pending&&!removed(e);
const unavailable=(g,e)=>removed(e)||e.hp<=.405||hidden(e)||e.status?.sourcePaused||e.status?.yseraPaused||e.status?.illidanPaused||['stunUntil','cycloneUntil','silenceUntil'].some(k=>e.status?.[k]>g.state.time);
// Preserve raw enumeration slots, but a native rejected damage request must
// not reach host registered-damage listeners (e.g. a linked invulnerable unit).
// JASS ATTACK_TYPE_NORMAL is Warcraft's spell attack row (host 'spells');
// host 'normal' instead denotes ATTACK_TYPE_MELEE. DAMAGE_TYPE_NORMAL
// independently retains numeric armor, including BJ's weapon=true events.
const damage=(g,t,n,e,api,options)=>{if(t.hp>.405&&!removed(t)&&!api.scriptInvulnerable?.(t)&&!(t.status?.cycloneUntil>g.state.time))return api.nativeDamage(g,t,n,e,options);return 0;};
const dummyState=g=>g.state.deathwingDragonDummyAbilities??={};

function hammer(g,e,t,api,{level,retain=false,fresh=false}={}){
 const shared=dummyState(g),actual=level??(fresh?1:shared.A0OZ??1),f=V14_ABILITIES.A0OZ.resolved_fields;
 const duration=Number(f[(t.isNativeHero?'HeroDur':'Dur')+actual]);
 if(!fresh)shared.A0OZ=actual;
 const accepted=Number.isFinite(duration)&&api.applyNativeStun?.(g,e,t,'A0OZ',duration);
 st(e).lastHammer={at:g.state.time,targetId:t.id,abilityId:'A0OZ',level:actual,duration,accepted:!!accepted,partial:true,missingNativeFields:['DataA','Cost','Cool']};
 if(!fresh&&!retain)delete shared.A0OZ;
}
function slow(g,e,t,api){
 const s=api.compileAbility(g,e,'A0YI'),request={at:g.state.time,sourceId:e.id,targetId:t.id,abilityId:'A0YI',order:'slow',haste:-.75,duration:3,partial:true};
 request.accepted=t.hp>.405&&!removed(t)&&!hidden(t)&&!api.scriptInvulnerable?.(t)&&!api.magicImmune?.(t)&&!(t.status?.cycloneUntil>g.state.time)&&(api.matchesTargets?.(s,e,t)??true);
 if(request.accepted){
  t.buffs??=[];const key=s.buffKey||'Bslo',value={key,skillId:'A0YI',sourceId:e.id,ownerId:e.ownerId,expiresAt:g.state.time+3,haste:-.75};
  const old=t.buffs.findIndex(b=>b.key===key);if(old<0)t.buffs.push(value);else t.buffs[old]=value;
  request.applied=true;
 }else request.applied=false;
 st(t).lastSlow=request;st(e).lastSlow={...request};
}
function thresholdBurst(g,e,api){
 const victims=group(g,e,pos(e),400);st(e).lastThresholdBurst={at:g.state.time,targets:victims.map(t=>t.id)};
 for(const t of victims){hammer(g,e,t,api,{level:1});damage(g,t,100,e,api,{attackType:'spells',damageType:'normal',weapon:true});}
 g._event?.('splash',e,'源质装甲',{skillId:'A0YJ',radius:400*scale(e)});
}

export const canDeathwingDragonCast=(e,id)=>id==='A0YJ'&&has(e,id);
export function castDeathwingDragon(g,e,id,params={},api){
 const fail=message=>({ok:false,message});if(!canDeathwingDragonCast(e,id))return fail('当前单位没有撕裂大地');
 if(unavailable(g,e))return fail('单位当前无法施法');const t=params.target,s=api.compileAbility(g,e,id);
 if(!t||t.hp<=.405||removed(t)||hidden(t)||has(t,'Aloc')||ally(e,t)||t.battleTeam!==e.battleTeam||api.scriptInvulnerable?.(t)||api.magicImmune?.(t)||t.status?.cycloneUntil>g.state.time||!(api.matchesTargets?.(s,e,t)??true))return fail('请选择有效敌人');
 if(Math.hypot(pos(t).x-pos(e).x,pos(t).y-pos(e).y)>800*scale(e)+1e-8)return fail('超出施法范围');
 const state=(e.skillStates??={})[id]??={readyAt:0,casts:0};if(state.readyAt>g.state.time+1e-8)return fail('技能冷却中');if(!(e.mana>=12))return fail('魔法不足');
 e.mana-=12;state.readyAt=g.state.time+7;state.casts++;e.pendingAttack=null;
 // bP is an independent SPELL_EFFECT trigger. Disabling allability's Yp
 // does not disable this listener; the host exposes a separate guard.
 const applied=!g._sourceDeathwingFissureTriggerDisabled;
 if(applied)queue(g,e,'deathwing_fissure_delay',{nextAt:g.state.time+1.5,angle:Math.atan2(pos(t).y-pos(e).y,pos(t).x-pos(e).x),targetId:t.id});
 st(e).lastCast={at:g.state.time,id,targetId:t.id,scriptApplied:applied,nativeANfdDamageUnverified:true};g._event?.('cast',e,s.name??'撕裂大地',{skillId:id});return {ok:true,skillId:id};
}

// Called inside the map's already-guarded main damage event, at 41192.
// Preserve the preceding mutable event value unless this branch writes zero.
export function deathwingDragonMainDamage(g,target,attacker,amount,api,eventDamage=amount){
 if(!(amount>0)||!attacker||target===attacker||ally(target,attacker)||has(attacker,'A2Y7')||removed(target)||!has(target,'A0YJ'))return eventDamage;
 const v=st(target),roll=g._random()*100;v.lastDefenseRoll={at:g.state.time,roll};if(roll<25)eventDamage=0;
 const percent=target.maxHp>0?target.hp/target.maxHp*100:0;
 for(const threshold of [70,40,10])if(percent<=threshold&&!v['threshold'+threshold]){thresholdBurst(g,target,api);v['threshold'+threshold]=true;break;}
 return eventDamage;
}
// phase lets the root preserve independent-if ordering at 42009 and 42049.
export function deathwingDragonMainDeath(g,dead,killer,api,phase='both'){
 if((phase==='both'||phase==='kill')&&killer&&has(killer,'A0YJ')){
  const v=st(killer),before=killer.hp;if(killer.hp>.405&&!removed(killer))killer.hp=Math.min(killer.maxHp,killer.hp+100);else v.deadHealWriteUnverified=true;
  const count=killer.status.sourceKillnum??v.killCount??0;if(count!==25){killer.status.sourceKillnum=count+1;v.attackSpeedBonus=(v.attackSpeedBonus??0)+.06;}v.killCount=killer.status.sourceKillnum??count;
  v.lastKill={at:g.state.time,targetId:dead?.id,before,after:killer.hp,killCount:v.killCount??count};
 }
 if((phase==='both'||phase==='revive')&&dead&&has(dead,'A0YH')&&g.state.wave<=20){
  const v=st(dead);v.revival={pending:true,at:g.state.time+3,queuedWave:g.state.wave};queue(g,dead,'deathwing_revive',{nextAt:g.state.time+3});
 }
}

function revive(g,j,api){
 const e=j.source,v=st(e),playerId=(e.userData??0)-1,p=g.state.players?.find(p=>p.id===playerId);
 j.done=true;v.revival??={};v.revival.pending=false;
 // Original IsLivingPlayer is PLAYING + MAP_CONTROL_USER. Web AI seats are
 // the same active logical participants; native owner 8/9 is not this gate.
 if(!Number.isInteger(playerId)||!p||p.eliminated){v.revival.reason='inactive-userdata-player';return;}
 if(removed(e)){v.revival.reason='removed-source-native-result-unverified';return;}
 const code=raw(e)==='h0UY'?'h0V0':raw(e)==='h0XE'?'h0XG':'h0PE',point=pos(e);
 const body=api.spawnUnit(g,e,code,{worldX:point.x,worldY:point.y,facing:e.facing??0,userData:e.userData??0,isSummon:false,isHero:false,isNativeHero:false,isArena:e.isArena??false,expiresAt:undefined,nav:undefined,buildingId:undefined});
 if(!body){v.revival.reason='missing-dragon-template';return;}
 const b=st(body);b.originId=e.id;b.alternateAnimation=true;b.nativePlayerMapping={checkedPlayerId:playerId,webActiveSlot:true,originalPredicate:'PLAYING && MAP_CONTROL_USER',partial:true};
 body.status.sourceJHMember=e.userData??0;body.status.sourceJWMember=true;body.status.sourceAttackMoveRequest={order:'attack',targetPlayerId:playerId,at:g.state.time};
 queue(g,body,'deathwing_fire',{nextAt:g.state.time+1,count:0});v.revival.bodyId=body.id;v.revival.reason='created';
 const victims=group(g,e,point,500);let count=0;
 for(const t of victims){hammer(g,e,t,api,{level:1,fresh:true});if(count<=10){damage(g,t,99999,e,api,{attackType:'chaos',damageType:'universal'});count++;}}
 b.revivalImpact={at:g.state.time,targets:victims.map(t=>t.id),damaged:victims.slice(0,11).map(t=>t.id)};
 api.removeUnit(g,e);g._event?.('revive',body,'死亡降临',{skillId:'A0YH',oldSourceId:e.id});
}
function firePulse(g,j,api){
 const e=j.source,hit=new Set();
 for(let index=0;index<13;index++){
  const p=pos(e),angle=(e.facing??0)*Math.PI/180,center={x:p.x+Math.cos(angle)*index*100*scale(e),y:p.y+Math.sin(angle)*index*100*scale(e)};
  for(const t of group(g,e,center,400))if(!hit.has(t.id)){slow(g,e,t,api);damage(g,t,200,e,api,{attackType:'spells',damageType:'normal',weapon:true});hit.add(t.id);}
 }
 j.pulses++;st(e).lastFirePulse={at:g.state.time,index:j.pulses,targets:[...hit]};g._event?.('splash',e,'熔浆烈焰',{skillId:'A0YH',radius:400*scale(e)});
 if(j.pulses>=3){j.done=true;api.pauseUnit(g,e,false);const parent=jobs(g).find(x=>x.id===j.parentId);if(parent)parent.count=0;st(e).fireFinishedAt=g.state.time;}
 else j.nextAt=j.startedAt+j.pulses+1;
}
function fissure(g,j,api){
 const e=j.source;j.traveled+=50;const p=pos(e),step=j.traveled*scale(e);
 let center={x:p.x+Math.cos(j.angle)*step,y:p.y+Math.sin(j.angle)*step};
 const victims=group(g,e,center,150);
 for(const t of victims)if(!j.hitIds.includes(t.id)){
  const tp=pos(t),angle=Math.atan2(tp.y-center.y,tp.x-center.x);
  center={x:tp.x+Math.cos(angle)*50*scale(e),y:tp.y+Math.sin(angle)*50*scale(e)};
  t.worldX=center.x;t.worldY=center.y;g._syncLocal?.(t);
  damage(g,t,20,e,api,{attackType:'spells',damageType:'universal'});hammer(g,e,t,api,{retain:true});j.hitIds.push(t.id);
 }
 j.center=center;st(e).lastFissure={at:g.state.time,traveled:j.traveled,center:{...center},hitIds:[...j.hitIds]};
 if(j.traveled>=500){
  const blast=group(g,e,center,350);for(const t of blast){damage(g,t,300,e,api,{attackType:'spells',damageType:'universal'});hammer(g,e,t,api,{level:5,retain:true});}
  st(e).lastFissure.blastTargets=blast.map(t=>t.id);j.done=true;g._event?.('splash',e,'撕裂大地',{skillId:'A0YJ',radius:350*scale(e),worldX:center.x,worldY:center.y});
 }else{j.steps++;j.nextAt=j.startedAt+(j.steps+1)*.03;}
}
export function tickDeathwingDragonJobs(g,api){
 if(g.state.paused)return;
 const now=g.state.time;
 for(;;){const j=jobs(g).filter(j=>!j.done&&j.type?.startsWith('deathwing_')&&j.nextAt<=now+1e-8).sort((a,b)=>a.nextAt-b.nextAt)[0];if(!j)break;
  const e=j.source;g.state.time=j.nextAt;
  try{
   if(j.type==='deathwing_revive'){revive(g,j,api);continue;}
   if(removed(e)){j.done=true;st(e).removedHandleBoundary=true;continue;}
   if(j.type==='deathwing_fire'){
    j.count++;if(e.hp<=.45){j.done=true;continue;}
    if(j.count===8){j.count=0;api.pauseUnit(g,e,true);const startedAt=g.state.time;queue(g,e,'deathwing_flame',{startedAt,nextAt:startedAt+1,pulses:0,parentId:j.id});st(e).fireStartedAt=startedAt;}
    if(e.maxHp>0&&e.hp/e.maxHp*100<=50)e.hp=Math.min(e.maxHp,e.hp+400);
    j.nextAt+=1;
   }else if(j.type==='deathwing_flame')firePulse(g,j,api);
   else if(j.type==='deathwing_fissure_delay'){
    j.done=true;queue(g,e,'deathwing_fissure',{startedAt:g.state.time,nextAt:g.state.time+.03,steps:0,traveled:50,angle:j.angle,hitIds:[]});
   }else if(j.type==='deathwing_fissure')fissure(g,j,api);
  }finally{g.state.time=now;}
 }
}
export function restoreDeathwingDragon(g){
 const handles=new Map(all(g).map(e=>[e.id,e]));
 for(const j of jobs(g))if(j.type?.startsWith('deathwing_')){if(!handles.has(j.sourceId)&&j.source)handles.set(j.sourceId,j.source);j.source=handles.get(j.sourceId)??j.source;}
}
