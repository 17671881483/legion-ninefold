// war3map.j 33840–33980, 39441–39446, 41548–41551, 42016–42018,
// 42406–42415. Native command execution is an explicit host adapter.
const nativeBoundary='ANcl缺失耗魔/引导默认字段，同帧连续命令与0.3秒施法前摇尚未核定。当前按即时施法适配，不扣未核定魔法，不能视为原生零耗魔。';
export const BANDIT_LORD_RULES={
  A18D:{status:'partial',description:'首次敌对正伤害移除圣盾能力并建立2秒独立伤害监听；计数0至80的81次事件归零，第82次结束监听且不归零。死亡或2秒到期结束，技能不自动恢复。',partial:'Web在事件开始快照监听，创建监听的首击仍扣血；原生同事件新注册监听与同刻计时器顺序未验证。不是Avul，不阻止被选中或控制。'},
  A18E:{status:'partial',active:true,targetKind:'none',description:'裂地冷却15秒。施法效果对自身300范围存活敌人造成115混乱攻击/通用伤害，逐目标请求A0I7等级2眩晕（普通2秒、英雄1秒）；魔免/机械目标仍受伤，控制遵循原生目标许可。攻击伤害事件优先请求攻击者，否则请求受击者。',partial:nativeBoundary+'范围枚举和原生马甲命中仍有边界。'},
  A18F:{status:'unresolved',description:'永久隐形Apiv具有0.5秒持续字段。已确认进入HD/HE/HN/HO四个原图矩形时永久移除A18F。',partial:'隐形/探测、攻击显形及原图区域到Web地形的映射未实现；不能把普通隐藏单位等同隐形。'},
  A18G:{status:'partial',active:true,targetKind:'point',description:'怨魂冷却20秒、选点距离500。从目标点同时发出朝向及左右45°三个弹体。零时刻及每0.04秒移动120，至480为止各检查200范围；0.16秒清理。每弹体对每敌人仅造成一次125混乱攻击/通用伤害，三个弹体分别计数。没有追加文案中的持续毒伤或减速。',partial:nativeBoundary+'原生SetUnitPosition碰撞/边界、虚拟e008句柄与跨任务计时器先后仍待核定。'},
  A18H:{status:'partial',description:'主死亡触发器中，以死者为中心向600范围存活敌人造成75混乱攻击/通用伤害。此伤害导致的死亡不重入同一主死亡触发器，但独立监听继续执行。',partial:'原生枚举/注册顺序及主死亡链尚未接入的其他分支仍有边界。'},
};
const has=(e,id)=>e?.skillSpecs?.some(s=>s.id===id)&&(e.abilityLevels?.[id]??1)>0;
const pos=e=>({x:e.worldX??e.x,y:e.worldY??e.y});
const scale=e=>(e.distanceScale??1/3)/100;
const all=g=>[...g.state.entities,...(g.state.kings??[])];
const removed=e=>e?.status?.sourceRemoved||e?.status?.yseraRemoved;
const hidden=e=>e?.status?.sourceHidden||e?.status?.yseraHidden;
const push=(g,j)=>{(g.state.sourceSkillJobs??=[]).push(j);return j;};
const selected=(g,e,point,radius)=>all(g).filter(t=>t.hp>.405&&!removed(t)&&!hidden(t)&&!has(t,'Aloc')&&!has(t,'Avul')&&t.side!==e.side&&t.battleTeam===e.battleTeam&&Math.hypot(pos(t).x-point.x,pos(t).y-point.y)<=radius*scale(e)+1e-8);
const damage=(g,e,t,n,api)=>api.nativeDamage(g,t,n,e,{attackType:'chaos',damageType:'universal',weapon:true});
export function banditMainDamage(g,target,source,amount,api){
  if(!(amount>0)||!source||source.id===target.id||source.side===target.side||has(source,'A2Y7')||!has(target,'A18D'))return;
  api.removeAbility(g,target,'A18D');
  push(g,{type:'bandit_shield',sourceId:target.id,source:target,count:0,expiresAt:g.state.time+2});
}
export function banditShieldEvent(g,target,j,amount){
  if(j.done)return amount;
  if(removed(target)||target.hp<=.405||g.state.time>=j.expiresAt){j.done=true;return amount;}
  const before=j.count++;
  if(before<=80)return 0;
  j.done=true;return amount;
}
export function banditDeath(g,e,api){
  if(!has(e,'A18H'))return;
  for(const t of selected(g,e,pos(e),600))damage(g,e,t,75,api);
  g._event?.('splash',e,'不甘',{skillId:'A18H',radius:600*scale(e)});
}
export function banditIndependentDeath(g,e){
  for(const j of g.state.sourceSkillJobs??[])if(j.type.startsWith('bandit_')&&j.sourceId===e.id){j.source=e;if(j.type==='bandit_shield')j.done=true;}
}
export const canBanditCast=(e,id)=>!!BANDIT_LORD_RULES[id]?.active&&has(e,id);
export function banditSpellEffect(g,e,id,point,api){
  if(g._sourceAbilityEffectDepth)return false;
  g._sourceAbilityEffectDepth=(g._sourceAbilityEffectDepth??0)+1;
  try{
    if(id==='A18E'){
      for(const t of selected(g,e,pos(e),300)){
        damage(g,e,t,115,api);
        if(t.hp>.405&&!removed(t)&&!t.isBuilding&&!api.scriptInvulnerable(t)&&!api.magicImmune(t)&&api.matchesTargets(api.compileAbility(g,e,'A0I7'),e,t))api.vertigoTarget(g,e,t,2);
      }
    }else if(id==='A18G'){
      const angle=Math.atan2(point.y-pos(e).y,point.x-pos(e).x);
      for(const offset of [0,Math.PI/4,-Math.PI/4])push(g,{type:'bandit_projectile',sourceId:e.id,source:e,point:{...point},angle:angle+offset,steps:0,hitIds:[],nextAt:g.state.time,startedAt:g.state.time,dummyRawcode:'e008'});
    }else return false;
    g._event?.('cast',e,id==='A18E'?'裂地':'怨魂攻击',{skillId:id});return true;
  }finally{g._sourceAbilityEffectDepth--;}
}
export function castBanditAbility(g,e,id,params,api){
  const fail=message=>({ok:false,message}),now=g.state.time;
  if(!canBanditCast(e,id))return fail('当前单位没有此强盗技能');
  if(e.hp<=.405||removed(e)||hidden(e)||e.status?.sourcePaused||e.status?.yseraPaused||e.status?.illidanPaused||e.status?.stunUntil>now||e.status?.cycloneUntil>now)return fail('单位当前无法施法');
  const s=api.compileAbility(g,e,id),point=params.point;
  if(id==='A18G'&&(!Number.isFinite(point?.x)||!Number.isFinite(point?.y)))return fail('请选择施法位置');
  if(id==='A18G'&&Math.hypot(point.x-pos(e).x,point.y-pos(e).y)>s.range+1e-8)return fail('超出500施法范围');
  const st=(e.skillStates??={})[id]??={readyAt:0,casts:0};
  if(st.readyAt>now+1e-8)return fail('技能冷却中');
  st.readyAt=now+s.cooldown;st.casts++;
  (e.status??={}).banditCastAdapter={at:now,abilityId:id,mode:params.mode??'manual',missingNativeManaCost:true,execution:'instant'};
  banditSpellEffect(g,e,id,point,api);return {ok:true,skillId:id};
}
// Called inside New_UnitAttack's per-source Attack guard, after main damage.
// Each independent if prioritizes the attacker even when its order fails.
export function banditAttackOrders(g,source,target,api){
  for(const id of ['A18E','A18G']){
    const e=has(source,id)?source:has(target,id)?target:null;if(!e)continue;
    const point=pos(e===source?target:source),st=e.status??={};
    const result=castBanditAbility(g,e,id,{point,mode:'auto'},api);
    (st.banditOrderRequests??={})[id]={at:g.state.time,order:id==='A18E'?'wateryminion':'unloadallcorpses',point:id==='A18G'?point:null,ok:result.ok,message:result.message??null,execution:'instant-adapter'};
  }
}
export function tickBanditJob(g,j,api){
  if(j.done)return false;
  const source=all(g).find(e=>e.id===j.sourceId)??j.source;
  if(!source||removed(source)){j.done=true;j.boundary='removed-source-handle';return false;}
  if(j.type==='bandit_shield'){if(g.state.time>=j.expiresAt||source.hp<=.405)j.done=true;return !j.done;}
  const end=g.state.time;
  try{while(j.nextAt<=end+1e-8&&!j.done){
    g.state.time=j.nextAt;
    // ChargeDistance checks >=600 BEFORE moving or invoking its damage hook.
    if(j.steps===4){j.done=true;break;}
    j.steps++;const step=120*scale(source);j.point.x+=Math.cos(j.angle)*step;j.point.y+=Math.sin(j.angle)*step;
    for(const t of selected(g,source,j.point,200))if(!j.hitIds.includes(t.id)){j.hitIds.push(t.id);damage(g,source,t,125,api);}
    g._event?.('projectile',{worldX:j.point.x,worldY:j.point.y,laneId:source.laneId},'怨魂',{fromWorldX:j.point.x-Math.cos(j.angle)*step,fromWorldY:j.point.y-Math.sin(j.angle)*step,color:'#87b3bb'});
    j.nextAt=j.startedAt+j.steps*.04;
  }}finally{g.state.time=end;}
  return !j.done;
}
