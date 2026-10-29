import {V14_UNIT_TEMPLATES} from './v14-reference.js';
// Source: war3map.j 32191–32442. Keep script and native adapters distinct.
const boundary='原生施法前摇/连续命令仲裁、碰撞、枚举与计时器注册先后仍待验证；当前使用即时命令适配。';
export const BLADEMASTER_RULES={
 A1QC:{status:'partial',active:true,targetKind:'none',description:'镜像由敌对伤害事件优先向受击者请求，否则请求攻击者；10魔法、20秒冷却、2个镜像、18秒、75%输出和1倍承伤。',partial:'镜像沿用宿主克隆适配；原生驱散范围、0.5字段的隐藏/无敌阶段、位置重排及镜像被动能力继承仍未核定。'+boundary},
 A1QD:{status:'partial',description:'每15次主死亡事件击杀触发无极剑刃，零时刻起每秒一次，共四次，对当前位置200范围敌人造成137法术攻击/魔法伤害。旋转期间击杀不累计；授予A1D6，第四次后移除。',partial:'主死亡链未实现分支、死亡来源句柄与跨计时器时序仍有原生边界。'},
 A1QE:{status:'partial',nativeKind:true,description:'原生100%概率1.5倍暴击。独立攻击伤害事件移除本体技能，9秒后永久加回；不要求正伤害。镜像不进入移除分支。',partial:'镜像原生被动继承及暴击资格、原生武器随机流仍待核定；不把所有镜像自动赋予此技能。'},
 A1QF:{status:'partial',active:true,targetKind:'none',description:'拔剑斩消耗22魔法、冷却13秒。对自身300范围敌人造成当前主武器基础攻击×5的混乱攻击/通用伤害，随后增加75个百分点生命比例。',partial:'ConvertUnitState(18)为基础攻击，不是最大攻击。当前从对象dmgplus1或显式sourceBaseDamage读取；其他原生基础攻击动态改写仍有边界。'+boundary},
 A1QG:{status:'partial',active:true,targetKind:'point',description:'火刃剑气15魔法、9秒冷却、500施法距离。从自身向选点方向每0.03秒移动6码，167步共1002码；每步检查前方200范围，每目标仅首次225法术攻击/魔法伤害，再每秒72伤害共5次。各次施法独立。',partial:'虚拟e008路径和句柄、同目标叠加计时器先后仍有原生边界。'+boundary},
 A1QH:{status:'partial',description:'出战建筑携带氏族荣耀时，1秒后分别枚举同玩家e00H/e00M/n06H；找到任一种则给双方授予A1QI并注册一次独立死亡监听。没有距离或存活限制。',partial:'建筑体与战斗体共享原生句柄、建筑死亡事件及原生枚举顺序仍待核定。'},
 A1QI:{status:'partial',nativeKind:true,description:'自身攻击+30%，目标字段仅self，不给附近其他友军加成。被氏族初始化注册的单位死亡时，随机对400范围敌人造成999999混乱/通用伤害；若仍存活再直接杀死。范围内无人时直接杀死击杀者。仅有图标不会自行注册监听。',partial:'原生组顺序采用宿主登记顺序；直接KillUnit无击杀归属，不能伪造额外击杀奖励。'},
 A1D6:{status:'partial',description:'主敌对正伤害监听遇到A1D6时将事件伤害归零；不是Avul，不提供负面状态免疫。触发器禁用、友军/自身伤害或A2Y7来源不会进入这一免伤分支。',partial:'完整原生事件注册顺序与相邻分支仍有边界。'},
};
const has=(e,id)=>e?.skillSpecs?.some(s=>s.id===id)&&(e.abilityLevels?.[id]??1)>0;
const pos=e=>({x:e.worldX??e.x,y:e.worldY??e.y});
const scale=e=>(e.distanceScale??1/3)/100;
const gone=e=>!e||e.status?.sourceRemoved||e.status?.yseraRemoved;
const all=g=>[...g.state.entities,...(g.state.kings??[])];
const push=(g,e,type,extra)=>{const j={type,sourceId:e.id,source:e,...extra};(g.state.sourceSkillJobs??=[]).push(j);return j;};
const find=(g,j)=>all(g).find(e=>e.id===j.sourceId)??g.state.players.flatMap(p=>p.buildings??[]).find(e=>e.id===j.sourceId)??j.source;
const selected=(g,e,p,r)=>all(g).filter(t=>t.hp>.405&&!gone(t)&&!t.status?.sourceHidden&&!t.status?.yseraHidden&&!has(t,'Aloc')&&!has(t,'Avul')&&t.side!==e.side&&t.battleTeam===e.battleTeam&&Math.hypot(pos(t).x-p.x,pos(t).y-p.y)<=r*scale(e)+1e-8);
const damage=(g,e,t,n,api,universal=false,weapon=true)=>api.nativeDamage(g,t,n,e,{attackType:universal?'chaos':'spells',damageType:universal?'universal':'magic',weapon});
export const blademasterImmune=e=>has(e,'A1D6');
export function blademasterAttack(g,e,api){
 if(!has(e,'A1QE')||e.isIllusion||e.status?.blademasterCriticalTimer)return;
 api.removeAbility(g,e,'A1QE');(e.status??={}).blademasterCriticalTimer=true;
 push(g,e,'blademaster_critical',{nextAt:g.state.time+9});
}
export function blademasterKill(g,e,api){
 if(!has(e,'A1QD')||e.status?.blademasterSpinning)return;
 const st=e.status??={};st.blademasterKills=(st.blademasterKills??0)+1;
 if(st.blademasterKills<15)return;
 st.blademasterKills-=15;st.blademasterSpinning=true;api.addAbility(g,e,'A1D6');
 push(g,e,'blademaster_storm',{nextAt:g.state.time,remaining:4});
}
export const canBlademasterCast=(e,id)=>!!BLADEMASTER_RULES[id]?.active&&has(e,id);
export function castBlademaster(g,e,id,params,api){
 const fail=message=>({ok:false,message}),now=g.state.time;
 if(!canBlademasterCast(e,id))return fail('当前单位没有此剑圣技能');
 if(e.hp<=.405||gone(e)||e.status?.sourceHidden||e.status?.yseraHidden||e.status?.sourcePaused||e.status?.yseraPaused||e.status?.illidanPaused||e.status?.stunUntil>now||e.status?.cycloneUntil>now)return fail('单位当前无法施法');
 const s=api.compileAbility(g,e,id),point=params.point??(params.target?pos(params.target):null);
 if(id==='A1QG'&&(!Number.isFinite(point?.x)||!Number.isFinite(point?.y)))return fail('请选择施法位置');
 if(id==='A1QG'&&Math.hypot(point.x-pos(e).x,point.y-pos(e).y)>s.range+1e-8)return fail('超出500施法范围');
 const st=(e.skillStates??={})[id]??={readyAt:0,casts:0};
 if(st.readyAt>now+1e-8)return fail('技能冷却中');if(e.mana<s.manaCost)return fail('魔法不足');
 e.mana-=s.manaCost;st.readyAt=now+s.cooldown;st.casts++;
 if(id==='A1QC'){
   e.buffs=[];
   for(let i=0;i<2;i++){const n=api.spawnUnit(g,e,e.combatRawcode,{isIllusion:true,expiresAt:now+18});if(!n)continue;
     for(const key of ['maxHp','hp','armor','attackInterval','range','moveSpeed','maxMana','mana'])n[key]=e[key];n.damage=e.damage*.75;n.status.incomingMultiplier=1;n.skillSpecs=[];
   }
 }else if(!g._sourceAbilityEffectDepth){
   g._sourceAbilityEffectDepth=(g._sourceAbilityEffectDepth??0)+1;
   try{if(id==='A1QF'){
     const base=Number(e.sourceBaseDamage??e.sourceRawFields?.dmgplus1);
     if(Number.isFinite(base))for(const t of selected(g,e,pos(e),300))damage(g,e,t,5*base,api,true);
     else(e.status??={}).blademasterMissingBaseDamage=true;
     if(e.hp>.405)e.hp=Math.min(e.maxHp,e.hp+e.maxHp*.75);
   }else{
     push(g,e,'blademaster_wave',{point:pos(e),angle:Math.atan2(point.y-pos(e).y,point.x-pos(e).x),nextAt:now+.03,steps:0,hitIds:[]});
   }}finally{g._sourceAbilityEffectDepth--;}
 }
 g._event?.('cast',e,s.name,{skillId:id});return {ok:true,skillId:id};
}
export function blademasterAuto(g,target,source,amount,api){
 if(!(amount>0)||!source||target.id===source.id||target.side===source.side||has(source,'A2Y7'))return;
 for(const id of ['A1QC','A1QF','A1QG']){const e=has(target,id)?target:has(source,id)?source:null;if(e)castBlademaster(g,e,id,{target:e===target?source:target},api);}
}
export function initializeBlademaster(g,building,e){
 const code=building?.sourceRawcode??building?.unitId?.replace(/^v14_/,'');
 if(![...(V14_UNIT_TEMPLATES[code]?.abilityIds??[]),...(building?.permanentAbilityIds??[]),...(building?.abilityIds??[])].includes('A1QH')&&!building?.skillSpecs?.some(s=>s.id==='A1QH'))return;
 if(e.status?.blademasterClassQueued)return;(e.status??={}).blademasterClassQueued=true;
 for(const code of ['e00H','e00M','n06H'])push(g,e,'blademaster_class',{code,nextAt:g.state.time+1});
}
function registerDeath(g,e,api){
 api.addAbility(g,e,'A1QI');if(e.status?.blademasterDeathRegistered)return;
 (e.status??={}).blademasterDeathRegistered=true;push(g,e,'blademaster_death',{});
}
export function blademasterDeath(g,e,killer,api){
 for(const j of g.state.sourceSkillJobs??[])if(j.type.startsWith('blademaster_')&&j.sourceId===e.id)j.source=e;
 const listener=(g.state.sourceSkillJobs??[]).find(j=>j.type==='blademaster_death'&&j.sourceId===e.id&&!j.done);
 if(!listener)return;listener.done=true;delete e.status.blademasterDeathRegistered;
 const candidates=selected(g,e,pos(e),400);let target=null,n=0;
 for(const t of candidates)if(Math.floor(g._random()*++n)===0)target=t;
 if(target)damage(g,e,target,999999,api,true);else target=killer;
 if(target?.hp>.405&&!gone(target))api.killUnit(g,target);
}
export function tickBlademasterJob(g,j,api){
 if(j.done)return false;const e=find(g,j);if(gone(e)){j.done=true;j.boundary='removed-source-handle';return false;}
 if(j.type==='blademaster_death')return true;
 const end=g.state.time;
 try{while(j.nextAt<=end+1e-8&&!j.done){
   g.state.time=j.nextAt;
   if(j.type==='blademaster_critical'){api.addAbility(g,e,'A1QE');delete e.status.blademasterCriticalTimer;j.done=true;}
   else if(j.type==='blademaster_class'){
     const peers=api.getOwnedUnitsOfRawcode(g,e,j.code).filter(t=>!gone(t));
     if(peers.length)for(const t of [e,...peers])registerDeath(g,t,api);j.done=true;
   }else if(j.type==='blademaster_storm'){
     for(const t of selected(g,e,pos(e),200))damage(g,e,t,137,api);
     if(--j.remaining===0){e.status.blademasterSpinning=false;api.removeAbility(g,e,'A1D6');j.done=true;}else j.nextAt+=1;
   }else if(j.type==='blademaster_burn'){
     const t=all(g).find(t=>t.id===j.targetId)??j.target;if(!gone(t))damage(g,e,t,72,api,false,false);
     if(--j.remaining===0)j.done=true;else j.nextAt+=1;
   }else{
     j.steps++;j.point.x+=Math.cos(j.angle)*6*scale(e);j.point.y+=Math.sin(j.angle)*6*scale(e);
     for(const t of selected(g,e,j.point,200))if(!j.hitIds.includes(t.id)){
       damage(g,e,t,225,api);push(g,e,'blademaster_burn',{targetId:t.id,target:t,nextAt:g.state.time+1,remaining:5});j.hitIds.push(t.id);
     }
     if(j.steps===167)j.done=true;else j.nextAt+=.03;
   }
 }}finally{g.state.time=end;}
 return !j.done;
}
