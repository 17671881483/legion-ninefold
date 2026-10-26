// Literal JASS: ArthasReadyAttack..ArthasSindragosa (36179–36391),
// ChargeDistance/Target (30152–30308), main damage and independent attack.
const nativeBoundary='原生命令连续派发的仲裁、施法前摇、虚体碰撞及原生事件分发顺序仍待原图运行核定；当前Web同步执行。';
export const DARK_ARTHAS_RULES=Object.freeze({
  A1VR:{name:'霜之哀伤的饥渴',status:'implemented',description:'造成敌对正伤害时累计事件伤害；独立普攻监听先消费就绪，恢复自身最大生命15%，再累计同次伤害。累计达到自身最大生命40%即清零并就绪，溢出不保留。普攻可累计两次，不增加攻击伤害。'},
  A1VS:{name:'凛风冲击',status:'partial',active:true,targetKind:'enemy',range:500,manaCost:18,cooldown:11,
    description:'固定施法时目标位置，每0.2秒在600范围随机落点，对落点300范围敌人造成78通用伤害；0秒首跳，共30跳。施法者死亡时再执行一次落点伤害后结束，没有额外减速。',partial:nativeBoundary},
  A1VT:{name:'死亡缠绕',status:'partial',active:true,targetKind:'enemy',range:500,manaCost:9,cooldown:7,
    description:'主目标及其400范围最多另外5名敌人分别获得追踪弹。按初始距离/1秒每0.04秒移动，0秒首步；到达或末步前结束时各造成201通用伤害。目标或虚体死亡也执行结束回调，施法者死亡不取消。',partial:nativeBoundary+'原生FirstOfGroup顺序未核定，Web采用实体登记顺序。'},
  A1VU:{name:'寒冰风暴',status:'partial',active:true,targetKind:'enemy',range:500,manaCost:16,cooldown:14,
    description:'对目标施法时位置300范围存活、非Avul敌人立即造成235通用伤害，不附带文案中的减速或随机冰封。',partial:nativeBoundary},
  A1VV:{name:'王者大军',status:'partial',active:true,targetKind:'none',manaCost:14,cooldown:12,
    description:'GIANT施法者创建8只食尸鬼王h0CL，无脚本限时且未添加SUMMONED。每只独立监听召唤者受伤：事件时召唤者生命≤20%则按随从当时生命百分比＋5个百分点治疗，再杀死该随从。首次计数加5已达到移除阈值3，技能立即移除。',partial:nativeBoundary+'本次伤害事件开始后才注册的随从监听由后续伤害触发；该原生注册时序待核定。'},
  A1VW:{name:'召唤辛达苟萨',status:'partial',active:true,targetKind:'enemy',range:500,manaCost:15,cooldown:22,
    description:'朝初始目标方向配置1500码/5秒飞行；0秒起每0.04秒移动12码，每步对300范围敌人造成203通用伤害，可重复命中。末步前1488码处结束，无文案中的随机冰封；施法者死亡不取消。',partial:nativeBoundary},
});
const has=(e,id)=>Array.isArray(e?.skillSpecs)?e.skillSpecs.some(s=>s.id===id):(e?.abilityIds??[]).includes(id);
const alive=e=>e&&e.hp>0&&!e.status?.sourceDeathHandled&&!e.status?.deathCounted;
const pos=e=>({x:e.worldX??e.x??0,y:e.worldY??e.y??0});
const scale=e=>(e.distanceScale??1/3)/100;
const now=g=>g._arthasEventAt??g.state.time;
const all=g=>[...g.state.entities,...(g.state.kings??[])];
const find=(g,id)=>all(g).find(e=>e.id===id);
const copy=e=>{const v=JSON.parse(JSON.stringify(e));if(v.status)v.status.sourceNativeAttackBusy=false;return v;};
const retain=(g,e)=>{(g.state.darkArthasCasters??={})[e.id]=e;return e;};
const sourceFor=(g,j)=>find(g,j.sourceId)??g.state.darkArthasCasters?.[j.sourceId]??j.source;
const queue=(g,e,type,extra={})=>{retain(g,e);const j={type,sourceId:e.id,source:copy(e),...extra};(g.state.sourceSkillJobs??=[]).push(j);return j;};
const selected=(g,e,p,r)=>all(g).filter(t=>alive(t)&&t.team!==e.team&&(t.battleTeam===undefined||e.battleTeam===undefined||t.battleTeam===e.battleTeam)&&!has(t,'Avul')&&Math.hypot(pos(t).x-p.x,pos(t).y-p.y)<=r*scale(e)+1e-8);
const atTime=(g,t,fn)=>{const prior=g._arthasEventAt;g._arthasEventAt=t;try{return fn();}finally{if(prior===undefined)delete g._arthasEventAt;else g._arthasEventAt=prior;}};
const giant=e=>e.traits?.includes('giant')||String(e.unitType??e.sourceRawFields?.type??'').split(',').includes('giant');
export const canDarkArthasCastAbility=(e,id)=>!!DARK_ARTHAS_RULES[id]?.active&&has(e,id);
export const isDarkArthasJobType=type=>type.startsWith('dark_arthas_');

function readyAttack(e,amount){
  const s=e.status??={},value=(s.arthasHungerDamage??0)+amount;
  if(value>=e.maxHp*.4){s.arthasHungerDamage=0;s.arthasHungerReady=true;}else s.arthasHungerDamage=value;
}
export function darkArthasMainDamage(g,target,amount,source,api){
  // Caller owns the main listener's self/alliance/reentry guards.
  if(!(amount>0)||has(source,'A2Y7'))return;
  if(has(source,'A1VR'))readyAttack(source,amount);
  for(const id of ['A1VS','A1VT','A1VU','A1VV','A1VW']){
    const caster=has(target,id)?target:has(source,id)?source:null;
    if(caster)castDarkArthasAbility(g,caster,id,{target:caster===target?source:target},api);
  }
}
export function darkArthasAttackDamage(source,amount){
  if(!has(source,'A1VR'))return;
  if(source.status?.arthasHungerReady){source.status.arthasHungerReady=false;source.hp=Math.min(source.maxHp,source.hp+source.maxHp*.15);}
  readyAttack(source,amount);
}

// Capture before the event starts: a listener created by its main callback
// is not retroactively inserted into this Web event's dispatch list.
export const darkArthasDamageListeners=(g,target)=>(g.state.sourceSkillJobs??[]).filter(j=>j.type==='dark_arthas_army'&&!j.done&&j.sourceId===target.id);
export function darkArthasIncomingEvent(g,target,listeners,api){
  for(const j of listeners){
    const minion=find(g,j.minionId);if(j.done||!alive(minion))continue;
    if(target.hp/target.maxHp<=.2){
      target.hp=Math.min(target.maxHp,target.hp+target.maxHp*(minion.hp/minion.maxHp+.05));
      minion.hp=0;api.sourceDeath(g,minion,null);
    }
  }
}

export function castDarkArthasAbility(g,e,id,params={},api={}){
  const rule=DARK_ARTHAS_RULES[id],time=now(g),fail=message=>({ok:false,message});
  if(!canDarkArthasCastAbility(e,id))return fail('该单位没有此阿尔萨斯技能');
  if(!alive(e)||e.status?.stunUntil>time||e.status?.cycloneUntil>time||e.status?.sourcePaused||e.status?.illidanPaused||e.status?.yseraPaused||e.status?.yseraHidden)return fail('单位当前无法施法');
  const target=params.target;
  if(rule.targetKind==='enemy'&&(!alive(target)||target.team===e.team||target.battleTeam!==e.battleTeam||api.scriptInvulnerable?.(target)||Math.hypot(pos(target).x-pos(e).x,pos(target).y-pos(e).y)>rule.range*scale(e)+1e-8))return fail('请选择500范围内的有效敌人');
  const st=(e.skillStates??={})[id]??={readyAt:0,casts:0};
  if(st.readyAt>time+1e-8)return fail('技能冷却中');if(e.mana<rule.manaCost)return fail('魔法不足');
  e.mana-=rule.manaCost;st.readyAt=time+rule.cooldown;st.casts++;
  g._event?.('cast',e,rule.name,{skillId:id});
  if(g._sourceAbilityEffectDepth>0)return {ok:true,skillId:id,scriptSuppressed:true};
  g._sourceAbilityEffectDepth=(g._sourceAbilityEffectDepth??0)+1;
  try{
    if(id==='A1VS')queue(g,e,'dark_arthas_wind',{...pos(target),nextAt:time,count:0});
    if(id==='A1VU')for(const t of selected(g,e,pos(target),300))api.universalDamage(g,t,235,e);
    if(id==='A1VT'){
      const targets=[target,...selected(g,e,pos(target),400).filter(t=>t.id!==target.id).slice(0,5)];
      for(const t of targets){const p=pos(e),distance=Math.hypot(pos(t).x-p.x,pos(t).y-p.y);queue(g,e,'dark_arthas_coil',{...p,targetId:t.id,target:copy(t),distance,step:distance*.04,traveled:0,nextAt:time,dummyId:g._uid()});}
    }
    if(id==='A1VW')queue(g,e,'dark_arthas_dragon',{...pos(e),angle:Math.atan2(pos(target).y-pos(e).y,pos(target).x-pos(e).x),distance:1500*scale(e),step:12*scale(e),traveled:0,nextAt:time,dummyId:g._uid()});
    if(id==='A1VV'&&giant(e)){
      for(let i=0;i<8;i++){
        const minion=api.spawnUnit(g,e,'h0CL',{isSummon:false,worldX:pos(e).x,worldY:pos(e).y,facing:e.facing??0,userData:e.userData??((e.ownerId??-1)+1)});
        if(minion)queue(g,e,'dark_arthas_army',{minionId:minion.id});
      }
      e.status??={};e.status.arthasArmyCount=(e.status.arthasArmyCount??0)+5;
      if(e.status.arthasArmyCount>=3)api.removeAbility(g,e,'A1VV');
    }
  }finally{g._sourceAbilityEffectDepth--;}
  return {ok:true,skillId:id};
}

function windPulse(g,j,e,api){
  const angle=g._random()*Math.PI*2,distance=g._random()*600*scale(e),p={x:j.x+Math.cos(angle)*distance,y:j.y+Math.sin(angle)*distance};
  j.count++;j.lastImpact=p;
  for(const t of selected(g,e,p,300))api.universalDamage(g,t,78,e);
  if(j.count>=30)j.done=true;
}
function finish(g,j,api,targetOverride){
  if(j.done)return;j.done=true; // Protect this trigger against nested death callbacks.
  if(j.type==='dark_arthas_coil')api.universalDamage(g,targetOverride??find(g,j.targetId)??j.target,201,sourceFor(g,j));
  // JASS RemoveUnit(e008), not KillUnit: no fabricated death event.
}
export function tickDarkArthasJob(g,j,api){
  if(j.done)return false;if(j.type==='dark_arthas_army')return true;
  const source=sourceFor(g,j);
  while(!j.done&&j.nextAt<=g.state.time+1e-8){
    atTime(g,j.nextAt,()=>{
      if(j.type==='dark_arthas_wind'){windPulse(g,j,source,api);j.nextAt+=.2;return;}
      const target=j.type==='dark_arthas_coil'?(find(g,j.targetId)??j.target):null;
      if(j.traveled+j.step>=j.distance-1e-8||target&&Math.hypot(pos(target).x-j.x,pos(target).y-j.y)<=j.step+1e-8){finish(g,j,api);return;}
      const angle=target?Math.atan2(pos(target).y-j.y,pos(target).x-j.x):j.angle;
      j.traveled+=j.step;j.angle=angle;
      Object.assign(j,api.clampDummyPosition?.(g,{x:j.x+Math.cos(angle)*j.step,y:j.y+Math.sin(angle)*j.step},source)??{x:j.x+Math.cos(angle)*j.step,y:j.y+Math.sin(angle)*j.step});
      if(j.type==='dark_arthas_dragon')for(const t of selected(g,source,j,300))api.universalDamage(g,t,203,source);
      j.nextAt+=.04;
    });
  }
  return !j.done;
}
export function sourceDarkArthasDeath(g,dead,api){
  if(g.state.darkArthasCasters?.[dead.id])retain(g,dead);
  for(const j of g.state.sourceSkillJobs??[]){
    if(j.done||!isDarkArthasJobType(j.type))continue;
    if(j.sourceId===dead.id){j.source=copy(dead);if(j.type==='dark_arthas_wind'){j.done=true;windPulse(g,j,dead,api);}}
    if(j.type==='dark_arthas_army'&&j.minionId===dead.id){j.done=true;api.removeUnit(g,dead);}
    if(j.dummyId===dead.id||j.type==='dark_arthas_coil'&&j.targetId===dead.id)finish(g,j,api,j.targetId===dead.id?dead:undefined);
  }
}
