import {laneToWorld,supportWorld} from './layout.js';
import {V14_UNIT_TEMPLATES} from './v14-reference.js';

const boundary='原生事件枚举、ANcl命令时序、浮点计时、碰撞及原模型特效仍为宿主适配。';
export const EARTH_LORD_RULES={
 A17H:{status:'implemented',nativeKind:true,description:'守护：100000码友军/自身攻击光环，按实际保存的能力等级提供5%/10%/15%；不按英雄名称补生命。完工计数保留n067布尔分支，部署只复制已有能力等级。'},
 A17I:{status:'implemented',nativeKind:true,description:'威慑原生Aasl：900码敌军移速降低30%、攻速降低10%；字段不是攻击力减10%，也没有离圈持续到回合结束的脚本。'},
 A17J:{status:'implemented',nativeKind:true,description:'主宰光环原生AOae：600码友军与自身移动、攻击速度各增加20%；没有额外敌军减移速分支。'},
 A17K:{status:'partial',description:'复生光环：部署时800码扫友军，并监听后来进入范围的单位；同原生所有者、相同userdata、非召唤且不携带源码复生列表能力时，以实数≤20%概率授予A18C。失败可离圈再入重抽，成功不再授予。施法者普通单位死亡终止监听。',partial:boundary+'初扫与后续入圈筛选不同；Web按帧检测进入，未实例化建筑及原生事件顺序待核定。'},
 A17L:{status:'partial',description:'掘地求生：登记时固定最大生命25%阈值，生命严格跌破时一次性隐藏、无敌并禁用通行，朝本阵营王前方向冲刺。3秒参数驱动0秒首跳及0.04秒步进，终点前检查先于移动；结束显形、取消无敌、恢复通行并将生命设为当前最大值55%。不回蓝、不清状态、不刷新技能。竞技场移除此能力。',partial:boundary+'原坐标±3549,-2218映射到Web王前支援点，非精确原地形；隐藏期间自主行动暂停，直接生命设置按帧观测。死亡回调不伪造复活。'},
 A17N:{status:'partial',active:true,targetKind:'none',description:'威慑主动：10魔法、10秒冷却；以施法者当前位置为中心，500码内敌军每秒受到20魔法攻击/通用武器伤害。第1至9次造成伤害，第10次只清理；widget死亡取消。正数敌对伤害触发自动命令，受击者优先。',partial:boundary},
 A18C:{status:'partial',description:'复生效果：ACrn致命后2秒同句柄恢复，3600秒冷却；不注册木乃伊的死亡移除。耗魔0沿用已核对1.24.4/1.27.1原生ACrn默认表。',partial:'本图默认继承、同体多复生技能顺序、原生生命/魔法恢复与buff持久性仍需实测，不以缺失Cost直接推导免费。'},
};
export const EARTH_REVIVE_EXCLUSIONS=['A0ZQ','A0YH','A158','A172','Aphx','A17J','A18C','A0ZU','A1SE'];
const has=(e,id)=>e?.skillSpecs?.some(s=>s.id===id)&&(e.abilityLevels?.[id]??1)>0;
const pos=e=>Number.isFinite(e?.worldX)?{x:e.worldX,y:e.worldY}:laneToWorld(e.laneId,e.x,e.y);
const scale=e=>(e.distanceScale??1/3)/100;
const removed=e=>!e||e.status?.sourceRemoved||e.status?.yseraRemoved;
const ally=(e,t)=>e.team!==undefined&&t.team!==undefined?e.team===t.team:e.side===t.side&&e.battleTeam===t.battleTeam;
const owner=e=>e.sourceNativeOwnerId??e.ownerId;
const all=g=>[...g.state.entities,...g.state.kings];
const jobs=g=>g.state.sourceSkillJobs??=[];
const st=e=>(e.status??={}).earthLord??={};
const queue=(g,e,type,data={})=>{const j={type,sourceId:e.id,source:e,...data};jobs(g).push(j);return j;};
const inRange=(e,t,r)=>Math.hypot(pos(e).x-pos(t).x,pos(e).y-pos(t).y)<=r*scale(e)+1e-8;
export const canEarthLordCast=(e,id)=>id==='A17N'&&has(e,id);
export function castEarthLord(g,e,id,params,api){
 const fail=message=>({ok:false,message});
 if(!canEarthLordCast(e,id))return fail('当前单位没有威慑');
 if(removed(e)||e.hp<=.405||e.status?.sourceHidden||e.status?.yseraHidden||e.status?.sourcePaused||e.status?.yseraPaused||e.status?.illidanPaused||['stunUntil','cycloneUntil','silenceUntil'].some(k=>e.status?.[k]>g.state.time))return fail('单位当前无法施法');
 const s=api.compileAbility(g,e,id),state=(e.skillStates??={})[id]??={readyAt:0,casts:0};
 if(state.readyAt>g.state.time+1e-8)return fail('技能冷却中');if(e.mana<s.manaCost)return fail('魔法不足');
 e.mana-=s.manaCost;state.readyAt=g.state.time+s.cooldown;state.casts++;e.pendingAttack=null;
 const applied=!g._sourceAbilityEffectDepth;if(applied)queue(g,e,'earth_deter',{ticks:0,nextAt:g.state.time+1});
 st(e).lastCast={at:g.state.time,id,scriptApplied:applied};g._event?.('cast',e,s.name,{skillId:id});return {ok:true,skillId:id};
}
export function earthLordMainDamage(g,t,e,amount,api){
 if(!(amount>0)||!e||t===e||ally(t,e)||has(e,'A2Y7'))return;
 const caster=has(t,'A17N')?t:has(e,'A17N')?e:null;if(!caster)return;
 const r=castEarthLord(g,caster,'A17N',{},api);st(caster).deterOrder={at:g.state.time,order:'cloudoffog',ok:r.ok,reason:r.message};
}
function grant(g,e,t,api,event){
 if(!ally(e,t)||t.isSummon||t.traits?.includes('summoned')||(t.userData??0)!==(e.userData??0)||EARTH_REVIVE_EXCLUSIONS.some(id=>has(t,id))||owner(e)!==owner(t))return;
 const roll=g._random()*100;st(e).lastReviveRoll={at:g.state.time,targetId:t.id,roll,event};
 if(roll<=20){api.addAbility(g,t,'A18C');st(t).reviveGrant={at:g.state.time,sourceId:e.id,event};g._event?.('cast',t,'复生光环',{skillId:'A18C'});}
}
function nearby(g,e){return [...new Map([...all(g),e].map(t=>[t.id,t])).values()].filter(t=>!removed(t)&&!has(t,'Aloc')&&t.battleTeam===e.battleTeam&&inRange(e,t,800));}
export function initializeEarthLordDeployment(g,b,e,api){
 if(e.isArena){api.removeAbility(g,e,'A17L');if(e.abilityLevels?.A17L!==undefined)e.abilityLevels.A17L=0;}
 if(!b||e.status?.earthLord?.registered)return;
 const ids=new Set([...(V14_UNIT_TEMPLATES[b.unitId?.replace(/^v14_/,'')]?.abilityIds??b.abilityIds??[]),...(b.permanentAbilityIds??[])]);
 if(!has(e,'A17L')&&!ids.has('A17K'))return;st(e).registered=true;
 if(has(e,'A17L'))queue(g,e,'earth_life',{threshold:e.maxHp*.25,lastLife:e.hp});
 if(ids.has('A17K')&&(b.abilityLevels?.A17K??1)>0){
  const group=nearby(g,e);for(const t of group)if(t.hp>.405&&!has(t,'Avul')&&!t.invulnerable)grant(g,e,t,api,'initial');
  queue(g,e,'earth_aura',{insideIds:group.map(t=>t.id)});
 }
}
function finishDig(g,j,reason){
 const e=j.source;j.done=true;e.status.sourceHidden=false;e.invulnerable=false;st(e).burrowing=false;st(e).pathingDisabled=false;
 st(e).digFinish={at:g.state.time,reason,position:pos(e)};
 if(e.hp>.405&&!removed(e))e.hp=e.maxHp*.55;else st(e).deadLifeWriteUnverified=true;
 e.chase=null;e.movePath=null;
}
export function earthLordLifeChanged(g,e,api,before){
 for(const j of [...jobs(g)])if(!j.done&&j.type==='earth_life'&&j.sourceId===e.id){
  const crossed=(before??j.lastLife)>=j.threshold&&e.hp<j.threshold;j.lastLife=e.hp;if(!crossed||removed(e))continue;j.done=true;
  const origin=pos(e),team=e.team??g.state.players[e.ownerId]?.team,destination=team===0||team===1?supportWorld(team):{x:0,y:0};
  const distance=Math.hypot(destination.x-origin.x,destination.y-origin.y),angle=Math.atan2(destination.y-origin.y,destination.x-origin.x);
  e.status.sourceHidden=true;e.invulnerable=true;st(e).burrowing=true;st(e).pathingDisabled=true;
  st(e).digStart={at:g.state.time,origin,destination,sourceDestination:{x:team===0?-3549:team===1?3549:0,y:team===0||team===1?-2218:0},threshold:j.threshold,mapApproximation:true};
  queue(g,e,'earth_dig',{nextAt:g.state.time,startAt:g.state.time,step:distance/3*.04,distance,traveled:0,angle,steps:0});
  g._event?.('warp',e,'掘地求生',{skillId:'A17L'});
 }
}
export function earthLordWidgetDeath(g,e){
 for(const j of [...jobs(g)])if(!j.done&&j.sourceId===e.id){if(j.type==='earth_deter')j.done=true;if(j.type==='earth_dig')finishDig(g,j,'widget-death');}
}
export function earthLordUnitDeath(g,e){for(const j of jobs(g))if(j.type==='earth_aura'&&j.sourceId===e.id)j.done=true;}
export function tickEarthLordJobs(g,api){
 for(const j of [...jobs(g)])if(!j.done&&j.type?.startsWith('earth_')){
  const e=j.source;if(removed(e)){j.done=true;continue;}
  if(j.type==='earth_life'){
   // Polling is a fallback for live HP writes, not a delayed native life event.
   // Direct kills/reincarnation must not launch a new trip on the next frame.
   if(e.hp<=.405){j.lastLife=e.hp;continue;}
   earthLordLifeChanged(g,e,api);
  }
  if(j.type==='earth_aura'){
   const group=nearby(g,e);for(const t of group)if(!j.insideIds.includes(t.id))grant(g,e,t,api,'enter');j.insideIds=group.map(t=>t.id);
  }
 }
 const now=g.state.time;
 for(;;){const j=jobs(g).filter(j=>!j.done&&['earth_deter','earth_dig'].includes(j.type)&&j.nextAt<=now+1e-8).sort((a,b)=>a.nextAt-b.nextAt)[0];if(!j)break;
  const e=j.source,at=j.nextAt;g.state.time=at;
  try{if(removed(e)){j.done=true;continue;}
   if(j.type==='earth_deter'){
    j.ticks++;if(j.ticks>=10){j.done=true;continue;}
    const group=all(g).filter(t=>t.hp>.405&&!removed(t)&&!t.status?.sourceHidden&&!t.status?.yseraHidden&&!has(t,'Aloc')&&!has(t,'Avul')&&!t.invulnerable&&!ally(e,t)&&t.battleTeam===e.battleTeam&&inRange(e,t,500));
    for(const t of group)api.nativeDamage(g,t,20,e,{attackType:'magic',damageType:'universal',weapon:true});j.nextAt+=1;
   }else{
    // Nominal source arithmetic: test the next step before moving. Do not snap
    // to the endpoint or silently turn this into a teleport after three seconds.
    if(j.traveled+j.step>=j.distance-1e-8){finishDig(g,j,'distance');continue;}
    j.traveled+=j.step;j.steps++;e.worldX+=Math.cos(j.angle)*j.step;e.worldY+=Math.sin(j.angle)*j.step;g._syncLocal?.(e);j.nextAt=j.startAt+j.steps*.04;
   }
  }finally{g.state.time=now;}
 }
}
export function restoreEarthLord(g){for(const j of jobs(g))if(j.type?.startsWith('earth_'))j.source=all(g).find(e=>e.id===j.sourceId)??j.source;}
