import {V14_ABILITIES,V14_UNIT_TEMPLATES} from './v14-reference.js';

export const SIREN_SLEEP_NATIVE_REFERENCE=Object.freeze({
 base:'AUsl',level:1,manaCost:100,cooldown:6,cast:0,customInheritanceVerified:false,
 versions:['1.24.4','1.27.1'],
 sources:[
  'https://github.com/sumneko/w3x2lni/blob/master/data/zhCN-1.24.4/prebuilt/Custom/ability.ini#L23007-L23053',
  'https://github.com/sumneko/w3x2lni/blob/master/data/enUS-1.27.1/prebuilt/Custom/ability.ini#L23053-L23099',
  'https://github.com/sumneko/w3x2lni/blob/master/data/enUS-1.27.1/prebuilt/Custom/buff.ini#L1603-L1647',
  'https://classic.battle.net/war3/undead/units/dreadlord.shtml',
 ],
 protectionObservation:{url:'https://www.hiveworkshop.com/threads/sleep-ability-uninterruptible.287661/',date:'2016-08-23/24',version:'unspecified',conditions:'Posts4/5 describe an initial protected pause and Data-Stun Duration; the original author confirms changing that field prevented attack wakeup in post8. This is a modder observation, not this map native verification.'},
});
const boundary='缺失Cost/Cool/Cast采用1.24.4/1.27.1的AUsl一级100魔法、6秒冷却、0施法时间参考，未证明本图继承。DataA为Stun Duration，首1秒保护/总2秒睡眠采用原生参考及2016年作者实验的宿主适配；实验未记版本，不是本图原生验收。正伤害统一唤醒是宿主适配，非普攻伤害类型、真实前摇、同帧睡眠/致死/唤醒、重复施法与驱散仲裁仍待核定。';
export const SIREN_SLEEP_RULES=Object.freeze({
 A1DO:{status:'partial',description:'海妖之歌：实际武器伤害监听按实数15%（含边界）概率创建独立e008，以施法者的位置、朝向和所有者发A1DN睡眠命令；每个辅助单位寿命1秒，原攻击者不支付费用。合法目标按A1DN进入睡眠。',partial:boundary},
 A1DN:{status:'partial',description:'辅助睡眠：对象明确800码、普通与英雄均2秒、DataA1=1。成功命令由独立e008支付原生参考100魔法，禁止目标移动、攻击及施法并打断原生持续施法；首1秒保护，之后受到正伤害会醒来。睡眠不覆盖其他眩晕状态。',partial:boundary},
});
const fields=V14_ABILITIES.A1DN.resolved_fields;
const has=(e,id)=>!!e?.skillSpecs?.some(s=>s.id===id)&&(e.abilityLevels?.[id]??1)>0;
const removed=e=>!e||e.status?.sourceRemoved||e.status?.yseraRemoved;
const pos=e=>({x:e?.worldX??e?.x,y:e?.worldY??e?.y});
const scale=e=>(e?.distanceScale??1/3)/100;
const all=g=>[...(g.state.entities??[]),...(g.state.kings??[])];
const jobs=g=>g.state.sourceSkillJobs??=[];
const numeric=(field,fallback)=>fields[field]!==undefined&&Number.isFinite(Number(fields[field]))?Number(fields[field]):fallback;
function living(e){return !removed(e)&&e.hp>.405&&!e.status?.deathCounted;}
function sleepAt(e,now){
 const s=e?.status?.sirenSleep;
 return living(e)&&s&&s.endedAt===undefined&&s.expiresAt>now&&e.buffs?.some(b=>b.key==='BUsl'&&b.sirenSleepId===s.id&&b.expiresAt>now)?s:null;
}
export const sirenSleepActiveAt=(e,now)=>!!sleepAt(e,now);
export const isSirenSleeping=(g,e)=>sirenSleepActiveAt(e,g.state.time);
export const sirenSleepProtectedAt=(e,now)=>{const s=sleepAt(e,now);return !!s&&s.protectedUntil>now;};
export const sirenSleepProtected=(g,e)=>sirenSleepProtectedAt(e,g.state.time);
function endSleep(g,e,reason){
 const s=e?.status?.sirenSleep;if(!s||s.endedAt!==undefined)return false;
 s.endedAt=g.state.time;s.endReason=reason;e.status.sirenSleepProtected=false;
 e.buffs=(e.buffs??[]).filter(b=>b.sirenSleepId!==s.id);
 return true;
}
export function sirenWakeOnDamage(g,e,amount){
 if(!(amount>0)||!isSirenSleeping(g,e)||sirenSleepProtected(g,e))return false;
 return endSleep(g,e,'positive-damage');
}
function nativeFailure(g,d,t,api){
 if(!living(t)||t.status?.sourceHidden||t.status?.yseraHidden||has(t,'Aloc'))return 'dead-hidden-or-locust';
 if(d.side===t.side||d.battleTeam!==undefined&&t.battleTeam!==undefined&&d.battleTeam!==t.battleTeam)return 'alliance-or-battle';
 if(t.isBuilding||t.traits?.includes('mechanical'))return 'organic-target-mask';
 if(t.status?.cycloneUntil>g.state.time)return 'cyclone';
 if(sirenSleepProtected(g,t)||api.scriptInvulnerable?.(t)||t.invulnerable||has(t,'Avul'))return 'invulnerable';
 if(api.magicImmune?.(t)||t.skillSpecs?.some(s=>s.kind==='immunity'&&s.status==='implemented'))return 'magic-immune';
 if(api.matchesTargets&&!api.matchesTargets({targets:fields.targs1.split(',')},d,t))return 'native-target-mask';
 const a=pos(d),b=pos(t);if(Math.hypot(a.x-b.x,a.y-b.y)>numeric('Rng1',800)*scale(d)+1e-8)return 'range';
 const st=d.skillStates?.A1DN;if(st?.readyAt>g.state.time)return 'cooldown';
 if(!(d.mana>=numeric('Cost1',SIREN_SLEEP_NATIVE_REFERENCE.manaCost)))return 'mana';
 return null;
}
function applyNativeSleep(g,d,t,report){
 const now=g.state.time,cost=numeric('Cost1',SIREN_SLEEP_NATIVE_REFERENCE.manaCost),cooldown=numeric('Cool1',SIREN_SLEEP_NATIVE_REFERENCE.cooldown);
 const st=(d.skillStates??={}).A1DN??={readyAt:0,casts:0};d.mana-=cost;st.readyAt=now+cooldown;st.casts++;
 // A fresh cast owns its own buff and timer. A stale timer must never clear a
 // newer application's control or another ability's stun/pause/invulnerability.
 if(t.status?.sirenSleep)endSleep(g,t,'replaced');
 const duration=numeric((t.isNativeHero??t.isHero)?'HeroDur1':'Dur1',2),id=g._uid('siren-sleep');
 const s={id,sourceId:d.id,appliedAt:now,protectedUntil:now+Math.min(duration,numeric('DataA1',1)),expiresAt:now+duration,nativeAdapter:true};
 (t.status??={}).sirenSleep=s;t.status.sirenSleepProtected=s.protectedUntil>now;
 t.buffs??=[];t.buffs.push({key:'BUsl',skillId:'A1DN',sourceId:d.id,ownerId:d.ownerId,sirenSleepId:id,expiresAt:s.expiresAt,sleep:true,armor:0,damage:0,haste:0,move:0,dps:0});
 t.pendingAttack=null;delete t.status.stormLizardChannel;
 jobs(g).push({type:'siren_sleep',id,sourceId:d.id,source:d,targetId:t.id,target:t,endAt:s.expiresAt});
 Object.assign(report,{hostAccepted:true,applied:true,manaCost:cost,cooldown,manaAfter:d.mana,sleepId:id,protectedUntil:s.protectedUntil,expiresAt:s.expiresAt});
 g._event?.('cast',d,'海妖之歌·睡眠',{skillId:'A1DN',targetId:t.id});
}
/** Called exactly at the A1DO branch of the already guarded native weapon
 * damage listener. Do not add manual-cast, silence, caster-life or CD gates:
 * NagaAttack has none, and every proc creates a separate native caster. */
export function sirenAttackDamage(g,e,t,api={}){
 if(!has(e,'A1DO'))return false;
 const chance=g._random()*100;if(chance>15)return false;
 const template=V14_UNIT_TEMPLATES.e008,p=pos(e),extra={worldX:p.x,worldY:p.y,facing:e.facing??0,nav:undefined,scriptAuxiliary:true,isSummon:true,isHero:false,isNativeHero:false,reward:0,buildingId:undefined};
 let d=api.spawnUnit?.(g,e,'e008',extra);
 if(!d){d={id:g._uid('siren-aux'),combatRawcode:'e008',sourceRawcode:'e008',skillVersion:'v14.1A5',distanceScale:e.distanceScale??1/3,side:e.side,team:e.team,battleTeam:e.battleTeam,ownerId:e.ownerId,sourceNativeOwnerId:e.sourceNativeOwnerId,laneId:e.laneId,sourceLaneId:e.sourceLaneId,hp:template.hp,maxHp:template.hp,mana:template.manaStart,maxMana:template.mana,manaRegen:template.manaRegen,skillSpecs:[{id:'Aloc'}],skillStates:{},status:{},...extra};(g.state.entities??=[]).push(d);}
 d.status??={};d.scriptAuxiliary=true;d.status.sirenAuxiliary=true;
 if(api.addAbility)api.addAbility(g,d,'A1DN');else(d.skillSpecs??=[]).push({id:'A1DN'});
 const r={at:g.state.time,sourceId:e.id,casterId:d.id,targetId:t?.id??null,abilityId:'A1DN',order:'sleep',level:1,requested:true,hostAccepted:false,applied:false,chanceRoll:chance,nativeOutcome:'unverified',nativeReference:SIREN_SLEEP_NATIVE_REFERENCE};
 d.status.sirenSleepOrder=r;(e.status??={}).sirenLastProc=r;
 const failure=nativeFailure(g,d,t,api);if(failure)r.rejectedByHost=failure;else applyNativeSleep(g,d,t,r);
 jobs(g).push({type:'siren_dummy_life',sourceId:e.id,source:e,dummyId:d.id,dummy:d,endAt:g.state.time+1});
 return r;
}
export function tickSirenSleepJob(g,j,api={}){
 if(!j||j.done||!['siren_sleep','siren_dummy_life'].includes(j.type))return false;
 if(g.state.paused)return true;
 if(j.type==='siren_dummy_life'){
  if(removed(j.dummy)){j.done=true;return false;}
  if(g.state.time+1e-8<j.endAt)return true;
  j.done=true;j.dummy.status.sirenTimedLifeAt=j.endAt;
  if(j.dummy.hp>0){if(api.killUnit)api.killUnit(g,j.dummy);else{j.dummy.hp=0;j.dummy.status.deathCounted=true;}}
  return false;
 }
 const t=j.target,s=t?.status?.sirenSleep;
 if(!s||s.id!==j.id||s.endedAt!==undefined){j.done=true;return false;}
 if(!isSirenSleeping(g,t)){endSleep(g,t,!living(t)?'dead-or-removed':g.state.time>=s.expiresAt?'expired':'dispelled');j.done=true;return false;}
 t.status.sirenSleepProtected=sirenSleepProtected(g,t);return true;
}
export function tickSirenSleepJobs(g,api={}){for(const j of jobs(g))if(j.type==='siren_sleep'||j.type==='siren_dummy_life')tickSirenSleepJob(g,j,api);}
export function restoreSirenSleep(g){
 const handles=new Map(all(g).map(e=>[e.id,e]));
 for(const j of jobs(g))if(j.type==='siren_sleep'||j.type==='siren_dummy_life'){
  for(const field of ['source','target','dummy']){const id=j[field+'Id'];if(!id)continue;if(!handles.has(id)&&j[field])handles.set(id,j[field]);j[field]=handles.get(id)??j[field];}
 }
 for(const e of handles.values())if(e.status?.sirenSleep){if(!isSirenSleeping(g,e))endSleep(g,e,'restore-expired-or-dispelled');e.status.sirenSleepProtected=sirenSleepProtected(g,e);}
}
