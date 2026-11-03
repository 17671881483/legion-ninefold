import {laneToWorld} from './layout.js';

const nativeBoundary='原生施法耗魔/前摇默认值、枚举次序、同帧监听及光环驻留未完整核定；缺失字段不当作已证明的零值。';
export const VARIAN_RULES={
 A11V:{status:'partial',description:'全副武装：出战时三项姿态图标齐全才登记独立受伤监听；受伤事件前生命≥66%进入，获得15护甲、30/秒恢复和30%物理闪避。首次建立高血姿态计时器后立即请求600码30%攻击咆哮6秒，之后每5秒请求600码30%减攻2秒并逐目标请求0.1秒眩晕。',partial:nativeBoundary+'高血姿态计时器离开后销毁，但保留已存句柄，回到该姿态不会重建。'},
 A11W:{status:'partial',description:'武器精通：受伤前生命33%至不足66%进入，增加100攻击。拥有形态转换时，每次进入均建立3秒旋风，每0.04秒对自身300码敌军造成6混乱/通用非武器伤害；独立武器事件重新抽主武器攻击范围写入事件值，另以百分数≥26触发目标中心300码125混乱/通用武器伤害，不附加文案减速。',partial:nativeBoundary+'原生攻击上下限的动态修正仍使用宿主适配。'},
 A11X:{status:'partial',description:'愤怒双刃：受伤前生命不足33%进入，动态授予150%额外攻速和自身40%近战吸血。拥有形态转换时，每次进入登记5秒双怒气；离开清标记，但旧计时器不取消，可能提前结束后一次窗口。',partial:nativeBoundary},
 A11Y:{status:'partial',description:'形态转换：每个独立武器伤害事件加1魔法，双怒气期间加2，上限为最大魔法。首次致命受伤事件先把生命设为min(1500,当前生命+魔法×20)，不消耗魔法；500码内选主攻击值最高敌人，平值取后枚举者，移到目标位置、请求攻击和A0I7等级1控制，获得A11Z及4秒无敌。源码没有把当前伤害改为零。',partial:nativeBoundary+'濒死时直接生命设置与当前事件结算、无敌移除同帧顺序仍待原生核定；无目标则不无敌。'},
 A11O:{status:'implemented',nativeKind:true,description:'全副武装动态AIde：自身护甲+15。'},
 A11P:{status:'implemented',nativeKind:true,description:'全副武装动态Arel：自身每秒恢复30生命。',selfRegen:30},
 A11R:{status:'implemented',nativeKind:true,description:'全副武装动态AEev：30%物理攻击闪避，不扩为法术免伤。'},
 A11S:{status:'implemented',nativeKind:true,description:'武器精通动态AIat：主、副武器平攻+100；离开姿态移除。',flatDamage:100},
 A11T:{status:'implemented',nativeKind:true,description:'愤怒双刃动态AIas DataA1=1.5：额外150%攻速。'},
 A11U:{status:'partial',nativeKind:true,description:'愤怒双刃动态AUav：900码、40%近战吸血；目标含self不含friend，沿用自身目标适配。',partial:'原生目标许可、同buff叠加与驻留未核定。'},
 A11Z:{status:'partial',nativeKind:true,description:'濒死回调授予AHbh：100%概率、普通/英雄1秒眩晕，下一次独立武器伤害监听将其移除。',partial:'DataC伤害字段缺失，不凭文案补25伤害；原生附伤与命中时序待核定。'},
 A121:{status:'partial',description:'高血姿态首次计时请求原生roar，600码友军30%攻击增益6秒，非文案700码。',partial:nativeBoundary},
 A11Q:{status:'partial',description:'高血姿态后续5秒回调请求howlofterror，600码敌军攻击降低30%持续2秒；独立A122控制请求不依赖该命令成功。',partial:nativeBoundary},
 A122:{status:'partial',description:'VertigoTargetEx的AHtb辅助请求：等级1，普通与英雄均0.1秒眩晕。',partial:'DataA伤害、Cost和原生辅助命令默认值缺失，当前仅适配显式控制，不宣称零伤害已核定。'},
};
const has=(e,id)=>e?.skillSpecs?.some(s=>s.id===id)&&(e.abilityLevels?.[id]??1)>0;
const pos=e=>Number.isFinite(e?.worldX)?{x:e.worldX,y:e.worldY}:laneToWorld(e?.laneId,e?.x,e?.y)??{x:e?.x??0,y:e?.y??0};
const scale=e=>(e.distanceScale??1/3)/100;
const all=g=>[...g.state.entities,...(g.state.kings??[])];
const removed=e=>!e||e.status?.sourceRemoved||e.status?.yseraRemoved;
const ally=(a,b)=>a.team!==undefined&&b.team!==undefined?a.team===b.team:a.side===b.side&&a.battleTeam===b.battleTeam;
const jobs=g=>g.state.sourceSkillJobs??=[];
const st=e=>(e.status??={}).varian??={};
const queue=(g,e,type,data={})=>{const j={type,sourceId:e.id,source:e,...data};jobs(g).push(j);return j;};
function enemies(g,e,p,r,filtered=true){return all(g).filter(t=>!removed(t)&&!t.status?.sourceHidden&&!t.status?.yseraHidden&&!has(t,'Aloc')&&!ally(e,t)&&(!filtered||t.hp>.405&&!has(t,'Avul'))&&Math.hypot(pos(t).x-p.x,pos(t).y-p.y)<=r*scale(e)+1e-8);}
function change(g,e,id,add,api){
 if(add){api.addAbility(g,e,id);if(id==='A11S'&&!e.sourcePassiveStatBonuses?.A11S){e.damage+=100;(e.sourcePassiveStatBonuses??={}).A11S={bonusHp:0,flatDamage:100};}}
 else{api.removeAbility(g,e,id);if(id==='A11S'&&e.sourcePassiveStatBonuses?.A11S){e.damage-=e.sourcePassiveStatBonuses.A11S.flatDamage;delete e.sourcePassiveStatBonuses.A11S;}}
}
export function initializeVarianDeployment(g,b,e){
 if(!b||!['A11V','A11W','A11X'].every(id=>has(e,id))||st(e).registered)return;
 st(e).registered=true;queue(g,e,'varian_listener');
}
function commandAura(g,e,id,api){
 const s=api.compileAbility(g,e,id),v=st(e),now=g.state.time,blocked=e.hp<=.405||removed(e)||e.status?.sourcePaused||e.status?.yseraPaused||e.status?.illidanPaused||['stunUntil','cycloneUntil','silenceUntil'].some(k=>e.status?.[k]>now);
 const state=(e.skillStates??={})[id]??={readyAt:0,casts:0},knownMana=s.fields.Cost1!==undefined;
 const report={id,at:now,missingNativeFields:['Cost1',...(id==='A121'?['Cool1']:[])].filter(k=>s.fields[k]===undefined),status:blocked?'blocked':'adapted'};v.lastCommand=report;
 if(blocked||state.readyAt>now+1e-8||knownMana&&e.mana<s.manaCost)return;
 if(knownMana)e.mana-=s.manaCost;state.readyAt=now+s.cooldown;state.casts++;
 for(const t of all(g))if(t.hp>.405&&!removed(t)&&Math.hypot(pos(t).x-pos(e).x,pos(t).y-pos(e).y)<=s.radius+1e-8&&ally(e,t)===(id==='A121')&&api.matchesTargets(s,e,t)&&(id==='A121'||!api.magicImmune(t)&&!api.scriptInvulnerable(t))){
  t.buffs??=[];const b={key:s.buffKey,skillId:id,sourceId:e.id,ownerId:e.ownerId,expiresAt:now+s.duration,damage:id==='A121'?.3:-.3};const old=t.buffs.findIndex(b=>b.key===s.buffKey);if(old<0)t.buffs.push(b);else t.buffs[old]=b;
 }g._event?.('cast',e,s.name,{skillId:id});
}
export function varianDamageEvent(g,e,j,amount,api){
 if(j.done||removed(e))return amount;const v=st(e),percent=e.maxHp>0?e.hp/e.maxHp*100:0;
 if(has(e,'A11Y')&&!v.deathUsed&&amount>=e.hp){
  v.deathUsed=true;const before=e.hp;e.hp=Math.min(e.maxHp,1500,e.hp+e.mana*20);
  let target=null;for(const t of enemies(g,e,pos(e),500))if(!target||t.damage>=target.damage)target=t;
  v.lastRescue={at:g.state.time,before,requested:Math.min(1500,before+e.mana*20),after:e.hp,eventDamage:amount,targetId:target?.id??null,currentDamageUnchanged:true};
  if(target){api.moveUnit(g,e,pos(target));api.addAbility(g,e,'A11Z');e.targetId=target.id;e.pendingAttack=null;v.attackOrder={at:g.state.time,targetId:target.id};api.vertigoTarget(g,e,target,1);e.invulnerable=true;queue(g,e,'varian_invulnerability',{nextAt:g.state.time+4});}
  return amount;
 }
 const form=percent>=66?'armed':percent>=33?'mastery':'blades';if(v.form===form)return amount;
 v.form=form;v.changedAt=g.state.time;
 if(form!=='blades')delete v.doubleRage;
 const granted=form==='armed'?['A11O','A11P','A11R']:form==='mastery'?['A11S']:['A11T','A11U'];
 for(const id of ['A11O','A11P','A11R','A11S','A11T','A11U'])change(g,e,id,granted.includes(id),api);
 if(has(e,'A11Y')){
  if(form==='armed'&&!v.armedHandleStored){v.armedHandleStored=true;queue(g,e,'varian_armed',{nextAt:g.state.time,count:0});}
  if(form==='mastery')queue(g,e,'varian_spin',{nextAt:g.state.time+.04,count:0});
  if(form==='blades'){v.doubleRage=true;queue(g,e,'varian_rage_end',{nextAt:g.state.time+5});}
 }g._event?.('cast',e,{armed:'全副武装',mastery:'武器精通',blades:'愤怒双刃'}[form]);return amount;
}
export function varianAttackDamage(g,e,t,amount,api){
 const result={amount,localP8:0};if(!has(e,'A11Y'))return result;
 const v=st(e);e.mana=Math.min(e.maxMana,e.mana+(v.doubleRage?2:1));
 if(!has(e,'A11S'))return result;
 const f=e.sourceRawFields??{},lo=Number(f.damage_min_1),hi=Number(f.damage_max_1),mean=Number(f.damage_avg_1);
 if(![lo,hi,mean,e.damage].every(Number.isFinite)||[f.damage_min_1,f.damage_max_1,f.damage_avg_1].some(n=>n==null||n==='')){v.attackBoundary='missing-native-attack-bounds';result.localP8=null;return result;}
 const delta=e.damage-mean,sample=Math.fround(lo+delta+g._random()*(hi-lo));result.amount=result.localP8=sample;
 const roll=Math.fround(g._random()*100);v.lastMasteryAttack={at:g.state.time,sample,roll,targetId:t.id};
 if(roll>=26)for(const x of enemies(g,e,pos(t),300))api.nativeDamage(g,x,125,e,{attackType:'chaos',damageType:'universal',weapon:true});
 return result;
}
export function varianAfterAttack(g,e,api){if(has(e,'A11Z'))api.removeAbility(g,e,'A11Z');}
function finishDeath(g,j,api){
 if(j.type==='varian_armed'){api.removeAbility(g,j.source,'A121');api.removeAbility(g,j.source,'A11Q');}
 if(j.type==='varian_rage_end')st(j.source).doubleRage=false;
 if(j.type==='varian_invulnerability')j.source.invulnerable=false;
 j.done=true;
}
export function varianWidgetDeath(g,e,api){for(const j of [...jobs(g)])if(!j.done&&j.sourceId===e.id&&j.type?.startsWith('varian_'))finishDeath(g,j,api);}
export function tickVarianJobs(g,api){
 const frame=g.state.time;try{while(true){const j=jobs(g).filter(j=>j.type?.startsWith('varian_')&&!j.done&&j.nextAt<=frame+1e-8).sort((a,b)=>a.nextAt-b.nextAt)[0];if(!j)break;g.state.time=j.nextAt;const e=j.source;
  if(removed(e)||e.hp<=.405){finishDeath(g,j,api);continue;}
  if(j.type==='varian_armed'){
   j.count++;if(e.hp/e.maxHp*100<66){finishDeath(g,j,api);continue;}
   if(j.count===1){api.addAbility(g,e,'A121');commandAura(g,e,'A121',api);}else{api.removeAbility(g,e,'A121');api.addAbility(g,e,'A11Q');commandAura(g,e,'A11Q',api);for(const t of enemies(g,e,pos(e),600))api.applyNativeStun(g,e,t,'A122',.1);}
   j.nextAt+=5;
  }else if(j.type==='varian_spin'){
   j.count++;for(const t of enemies(g,e,pos(e),300,false))api.nativeDamage(g,t,6,e,{attackType:'chaos',damageType:'universal'});
   j.nextAt+=.04;if(j.count>=75)j.done=true;
  }else{finishDeath(g,j,api);}
 }}finally{g.state.time=frame;}
}
export function restoreVarian(g){
 const handles=new Map(all(g).map(e=>[e.id,e]));for(const j of jobs(g))if(j.type?.startsWith('varian_')&&j.source){if(!handles.has(j.sourceId))handles.set(j.sourceId,j.source);j.source=handles.get(j.sourceId);}
}
