// war3map.j 40171–40304, 41207–41214, 41345–41497.
const boundary='ANfd缺失原生继承字段、命令前摇/仲裁、AIil幻象创建与共享e00O施法后立即移除能力的完成时机未核定；保留原生命令请求，不伪造幻象或反制命中。';
export const AESARA_RULES=Object.freeze({
  A0VX:{name:'秘术异蛇',active:true,status:'partial',targetKind:'enemy',range:800,manaCost:18,cooldown:10,
    description:'每0.02秒向当前目标移动9码；距目标不超过10或目标生命不大于0.9时处理，造成325法术攻击类型/普通伤害。800范围按登记顺序选择未命中、非建筑、生命大于0.65的敌人，最多8次后回程。低生命命中最多2次、回程2次请求A0W0幻象；施法者死亡不取消。',partial:boundary},
  A0VY:{name:'魔法护盾',active:true,status:'partial',targetKind:'none',manaCost:0,cooldown:999,
    description:'显式开关B06S护盾，已开启时吸收90%伤害，每点魔法吸收60。开盾添加A0W2每秒25生命；主伤害监听只对受害者尝试自动开启，首个触发伤害不追溯吸收。原生关盾后返还10魔法、移除回复并设5秒冷却。近战来源触发A0W3 slow请求，非仅普通攻击。',partial:boundary+'开关事件/B06S移除时序、耗尽与抗性叠加、无Cost字段的原生继承待验证；Web开关不额外收费。失buff清理属于长elseif链，未移植的前置分支重叠明确保留待核定。'},
});
const has=(e,id)=>e?.skillSpecs?.some(s=>s.id===id);
const pos=e=>({x:e.worldX??e.x??0,y:e.worldY??e.y??0});
const scale=e=>(e.distanceScale??1/3)/100;
const now=g=>g._aesaraEventAt??g._brightArthasEventAt??g._arthasEventAt??g._vashjEventAt??g.state.time;
const all=g=>[...g.state.entities,...(g.state.kings??[])];
const alive=e=>e&&e.hp>0&&!e.status?.sourceDeathHandled;
const retain=(g,e)=>{(g.state.aesaraHandles??={})[e.id]=e;return e;};
const find=(g,id)=>all(g).find(e=>e.id===id)??g.state.aesaraHandles?.[id];
const copy=e=>JSON.parse(JSON.stringify(e));
// Native callbacks observe the timer's instant, including other hero families
// that still use state.time for automatic orders and death registrations.
const atTime=(g,at,fn)=>{const old=g._aesaraEventAt,outer=g.state.time;g._aesaraEventAt=at;g.state.time=at;try{return fn();}finally{g.state.time=outer;if(old===undefined)delete g._aesaraEventAt;else g._aesaraEventAt=old;}};
export const canAesaraCastAbility=(e,id)=>!!AESARA_RULES[id]?.active&&has(e,id);
export const isAesaraJobType=type=>type==='aesara_snake';
const shieldOn=e=>!!(e.status?.aesaraShieldBuff||e.status?.aesaraShieldScriptOn);
const unavailable=(e,time)=>!alive(e)||e.status?.stunUntil>time||e.status?.cycloneUntil>time||e.status?.sourcePaused||e.status?.illidanPaused||e.status?.yseraPaused||e.status?.yseraHidden;
export function aesaraManualSkill(g,e,s){
  const r=AESARA_RULES[s.id],off=s.id==='A0VY'&&shieldOn(e),remaining=off?0:Math.max(0,(e.skillStates?.[s.id]?.readyAt??0)-now(g));
  const reason=unavailable(e,now(g))?'单位当前无法施法':remaining>1e-8?'技能冷却中':e.mana<r.manaCost?'魔法不足':'';
  return {id:s.id,name:off?'关闭魔法护盾':r.name,status:r.status,manaCost:r.manaCost,cooldown:off?0:r.cooldown,remaining,autoRemaining:remaining,cooldownMode:'shared_native',targetKind:r.targetKind,range:s.range,radius:s.radius,canStart:!reason,reason};
}
function request(e,data){
  e.status??={};const requests=e.status.aesaraNativeRequests??=[];requests.push(data);if(requests.length>32)requests.shift();
  const counts=e.status.aesaraNativeRequestCounts??={};counts[data.abilityId]=(counts[data.abilityId]??0)+1;
}
function cleanupShield(g,e,api,reason){
  if(!e.status?.aesaraShieldScriptOn||e.status.aesaraShieldBuff)return false;
  e.status.aesaraShieldScriptOn=false;e.status.aesaraShieldClosedBy=reason;
  const st=(e.skillStates??={}).A0VY??={readyAt:0,casts:0};st.readyAt=now(g)+5;
  e.mana=Math.min(e.maxMana,e.mana+10);api.removeAbility(g,e,'A0W2');return true;
}
export function aesaraIssuedOrder(g,e,order,api){
  if(order==='manashieldoff')return cleanupShield(g,e,api,'manashieldoff');return false;
}
export function castAesaraAbility(g,e,id,params={},api={}){
  const r=AESARA_RULES[id],time=now(g),fail=message=>({ok:false,message});
  if(!canAesaraCastAbility(e,id))return fail('该单位没有此艾萨拉技能');
  if(unavailable(e,time))return fail('单位当前无法施法');
  if(id==='A0VY'&&shieldOn(e)){
    e.status.aesaraShieldBuff=false;aesaraIssuedOrder(g,e,'manashieldoff',api);g._event?.('cast',e,'关闭魔法护盾',{skillId:id});return {ok:true,skillId:id};
  }
  const t=params.target;if(r.targetKind==='enemy'&&(!alive(t)||t.team===e.team||t.battleTeam!==e.battleTeam||api.scriptInvulnerable?.(t)||Math.hypot(pos(t).x-pos(e).x,pos(t).y-pos(e).y)>800*scale(e)+1e-8))return fail('请选择800范围内的有效敌人');
  const st=(e.skillStates??={})[id]??={readyAt:0,casts:0};
  if(st.readyAt>time+1e-8)return fail('技能冷却中');if(e.mana<r.manaCost)return fail('魔法不足');
  e.mana-=r.manaCost;st.readyAt=time+r.cooldown;st.casts++;g._event?.('cast',e,r.name,{skillId:id});
  // miShuYiShe is a separate spell listener, not the disabled allability trigger.
  if(id==='A0VY'){e.status??={};e.status.aesaraShieldBuff=true;e.status.aesaraShieldScriptOn=true;api.addAbility(g,e,'A0W2');}
  if(id==='A0VX'){
    retain(g,e);retain(g,t);const p=pos(e),dummy={id:g._uid(),combatRawcode:'e00P',sourceRawcode:'e00P',skillVersion:'v14.1A5',skillSpecs:[{id:'Aloc',status:'marker'}],hp:20,maxHp:20,status:{},worldX:p.x,worldY:p.y,team:e.team,side:e.side,battleTeam:e.battleTeam,laneId:e.laneId,ownerId:e.ownerId,userData:0};
    (g.state.sourceSkillJobs??=[]).push({type:'aesara_snake',sourceId:e.id,source:copy(e),targetId:t.id,hitIds:[],hits:0,killIllusionRequests:0,returning:false,nextAt:time+.02,...p,dummy});
  }
  return {ok:true,skillId:id};
}
export function aesaraIncomingDamage(g,e,amount){
  if(!has(e,'A0VY')||!e.status?.aesaraShieldBuff)return amount;
  const absorbed=Math.min(amount*.9,Math.max(0,e.mana)*60);e.mana=Math.max(0,e.mana-absorbed/60);
  if(e.mana<=1e-8){e.mana=0;e.status.aesaraShieldBuff=false;}
  return amount-absorbed;
}
const raw=e=>e.combatRawcode??e.sourceRawcode;
function earlierCleanupBranch(e,attacker,amount){
  if(has(e,'A0II')||has(attacker,'A0LN')||has(attacker,'A0NB')||has(attacker,'A0OX')||has(e,'A0NT')||has(e,'A0IE')&&amount>e.hp||raw(attacker)==='h02F'&&amount>450&&amount<750)return 'prior-elseif';
  // These prior branches depend on native hashtable flags or random effects
  // not yet hosted. Do not unconditionally execute a later elseif through them.
  if(has(attacker,'A0JA')||has(e,'A0JA')&&e.hp<=e.maxHp*.1||has(attacker,'A0NH')||['h055','h0M1'].includes(raw(attacker))||['h0O7','h0M1'].includes(raw(e))||has(e,'A0J0'))return 'prior-elseif-unresolved';
  return null;
}
export function aesaraMainDamage(g,e,attacker,amount,api){
  if(!(amount>0)||!has(e,'A0VY')||has(attacker,'A2Y7'))return;
  if(e.status?.aesaraShieldScriptOn&&e.status.aesaraShieldBuff){
    const fields=attacker.sourceRawFields??{},weapons=[attacker.weapon1??{},attacker.weapon2??{}];
    const melee=attacker.isMeleeAttacker??weapons.some((w,i)=>((Number(w.weapsOn??fields.weapsOn??1)&(1<<i))!==0)&&w[`weapTp${i+1}`]==='normal');
    if(melee)request(e,{at:now(g),abilityId:'A0W3',order:'slow',targetId:attacker.id,dummyRawcode:'e00O',sharedDummy:true,abilityRemovedImmediately:true,duration:3,heroDuration:3,haste:-.3,move:null,status:'native-unverified'});
  }
  if(!e.status?.aesaraShieldScriptOn)castAesaraAbility(g,e,'A0VY',{},api);
}
export function aesaraDamageCleanup(g,e,attacker,amount,api,priorDamageBranch){
  if(!(amount>0)||!has(e,'A0VY')||has(attacker,'A2Y7'))return;
  if(e.status?.aesaraShieldScriptOn&&!e.status.aesaraShieldBuff){const prior=priorDamageBranch?'prior-elseif':earlierCleanupBranch(e,attacker,amount);if(prior)e.status.aesaraCleanupDeferred=prior;else{delete e.status.aesaraCleanupDeferred;cleanupShield(g,e,api,'lost-buff-damage');}}
}
function illusionRequest(g,e,j,reason){
  const original=pos(e);if(reason==='low-life-hit'){e.worldX=j.x;e.worldY=j.y;}
  try{request(e,{at:now(g),abilityId:'A0W0',orderId:852274,dummyRawcode:'e00O',sharedDummy:true,abilityRemovedImmediately:true,ownerDuringOrder:e.ownerId,userData:e.userData??0,targetId:e.id,targetRawcode:raw(e),...pos(e),reason,outgoing:.5,incoming:5,duration:3,status:'native-unverified'});}
  finally{e.worldX=original.x;e.worldY=original.y;}
}
export function tickAesaraJob(g,j,api){
  if(j.done)return false;const e=find(g,j.sourceId)??j.source;
  while(!j.done&&j.nextAt<=g.state.time+1e-8)atTime(g,j.nextAt,()=>{
    const t=find(g,j.targetId),p=t?pos(t):{x:0,y:0};
    // e00P has 20 HP and -1 HP/s; its death has no timer cancellation registration.
    if(j.dummy.hp>0){j.dummy.hp=Math.max(0,j.dummy.hp-.02);if(j.dummy.hp<=1e-8){j.dummy.hp=0;api.sourceDeath(g,j.dummy,null);}}
    if(t&&t.hp>.9&&Math.hypot(p.x-j.x,p.y-j.y)>10*scale(e)){
      const a=Math.atan2(p.y-j.y,p.x-j.x);j.x+=Math.cos(a)*9*scale(e);j.y+=Math.sin(a)*9*scale(e);j.dummy.worldX=j.x;j.dummy.worldY=j.y;
    }else if(j.targetId===j.sourceId){
      j.done=true;if(j.dummy.hp>0){j.dummy.hp=0;api.sourceDeath(g,j.dummy,null);}illusionRequest(g,e,j,'return');illusionRequest(g,e,j,'return');
    }else{
      if(t)api.nativeDamage(g,t,325,e,{attackType:'spells',damageType:'normal'});
      if((t?.hp??0)<.9&&j.killIllusionRequests!==2){illusionRequest(g,e,j,'low-life-hit');j.killIllusionRequests++;}
      j.hits++;j.hitIds.push(j.targetId);
      const next=all(g).find(u=>!u.isBuilding&&!j.hitIds.includes(u.id)&&u.team!==e.team&&(u.battleTeam===undefined||e.battleTeam===undefined||u.battleTeam===e.battleTeam)&&u.hp>.65&&Math.hypot(pos(u).x-j.x,pos(u).y-j.y)<=800*scale(e)+1e-8);
      if(j.hits>=8||!next){j.targetId=j.sourceId;j.returning=true;}else{retain(g,next);j.targetId=next.id;}
    }
    j.nextAt+=.02;
  });return !j.done;
}
export function sourceAesaraDeath(g,dead){if(g.state.aesaraHandles?.[dead.id])retain(g,dead);}
