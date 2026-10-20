import {V14_ABILITIES} from './v14-reference.js';

// QW=A15D, QX=A15F, b8=A15E, b7=A15I, QI=h0QV (1183–1188).
// h0QV/h0WQ are buildings; their deployed units are h0QU/h0WP.
export const TROLL_COMBAT_TYPES=Object.freeze(['h0QU','h0WP']);
const nativeBoundary='原生连续IssueTargetOrder的施法前摇、命令覆盖和原地图dummy碰撞由宿主决定；这里只执行有证据的脚本与定时器，不推测额外自动冷却。';
const rule=(id,description,extra={})=>{const a=V14_ABILITIES[id],f=a.resolved_fields;return Object.freeze({id,name:a.name,status:'implemented',manaCost:Number(f.Cost1??0),cooldown:Number(f.Cool1??0),range:Number(f.Rng1??0),description,...extra});};
export const TROLL_ACTIVE_RULES=Object.freeze({
  A15C:rule('A15C','手动目标与伤害事件中的原生命令共享20魔法、5秒冷却；伤害源优先。1秒后在追踪斧当前位置200范围造成250通用伤害，再对主目标造成其最大生命的通用伤害。范围击杀及主目标结算分别增加A15D；主目标已死仍计一次，可能同次斧头重复加层。',{active:true,targetKind:'enemy',cooldownMode:'shared_native',status:'partial',partial:nativeBoundary,sourceLines:[38220,38329,39484,39485,41130,41133],impactSeconds:1,radius:200,damage:250}),
});
export const TROLL_RULES=Object.freeze({
  ...TROLL_ACTIVE_RULES,
  A15E:rule('A15E','实际普攻命中12%尝试用A15I诱捕当前目标，并启动鲁莽；每个施法者同时只有一个鲁莽目标，首次零秒、以后每0.5秒造成1.5%目标最大生命通用伤害。施法者死亡不停止；只有鲁莽这次伤害杀死目标才增加A15F。',{status:'partial',partial:'原生Aens的目标限制、法术免疫和下单仲裁由宿主网效果bridge处理；鲁莽不依赖网命令成功。',sourceLines:[1186,38330,38385,42444,42445],chance:.12,interval:.5,lifeFraction:.015}),
  A15G:rule('A15G','独立受伤监听仅在伤害严格大于当前生命时将事件伤害设为生命减1；首次保护5秒后销毁监听，期间再次保护不延长。伤害等于生命仍会死亡。死亡时从500范围敌人按枚举次序取前三名分别投斧。',{status:'partial',partial:'源生命小于1时会向YDWESetEventDamage请求负伤害；原生回写结果缺宿主证据。模块保留原请求，宿主不凭空判定治疗。',sourceLines:[38386,38439,43706,43709],window:5,deathRadius:500,deathAxes:3}),
  A15J:rule('A15J','原对象是Asth说明标记，JASS没有本rawcode引用。已证实的12%诱捕实际由A15E攻击分支执行；没有依据实现文案中的随机多目标、攻击/攻速缩放网伤害。',{status:'marker',sourceLines:[1186,1188,38375,38385,42444,42445]}),
  A15D:rule('A15D','断头斧永久攻击等级，1—80级分别增加5—400平攻；战斗体与原建筑按实际脚本分别加级，跨部署恢复。',{sourceLines:[1183,38227,38242,38265,38275,43715,43718],maxLevel:80}),
  A15F:rule('A15F','鲁莽永久攻速等级，1—70级使用源DataA值；源对象第71—100级均为0，保留这个数据缺陷，不按文案补成71%—100%。',{sourceLines:[1187,38342,38349,43711,43714],maxLevel:100}),
  A15I:rule('A15I','A15E的12%分支动态添加的原生Aens诱捕，3秒（英雄亦3秒）、1秒原生冷却、1000施法范围；脚本没有移除此能力。',{status:'partial',partial:'原生网的目标可用性和控制效果由宿主applyEnsnare提供。',sourceLines:[1188,38378,38380]}),
});

const raw=e=>e?.combatRawcode??e?.sourceRawcode??e?.rawcode;
const own=e=>TROLL_COMBAT_TYPES.includes(raw(e));
const has=(e,id)=>Array.isArray(e?.skillSpecs)?e.skillSpecs.some(s=>s.id===id):(e?.abilityIds??[]).includes(id);
const st=e=>e.status??={};
const pos=e=>({x:e.worldX??e.x??0,y:e.worldY??e.y??0});
const dist=(a,b)=>Math.hypot(pos(a).x-pos(b).x,pos(a).y-pos(b).y);
const scale=e=>(e.distanceScale??1/3)/100;
const alive=e=>!!e&&e.hp>.405&&!e.status?.yseraRemoved&&!e.status?.illidanRemoved;
const dead=e=>!alive(e)||!!e.status?.deathCounted||!!e.status?.sourceDeathHandled;
const enemy=(a,b)=>a.team!==undefined&&b.team!==undefined?a.team!==b.team:a.side!==b.side;
const sameBattle=(a,b)=>a.battleTeam===undefined||b.battleTeam===undefined||a.battleTeam===b.battleTeam;
const units=g=>{const seen=new Set();return [...(g.state.entities??[]),...(g.state.kings??[])].filter(e=>!seen.has(e.id)&&seen.add(e.id));};
const find=(g,id)=>units(g).find(e=>e.id===id);
const copy=e=>JSON.parse(JSON.stringify(e));
const sourceOf=(g,job)=>find(g,job.sourceId)??job.source;
const targetOf=(g,job)=>find(g,job.targetId)??job.target;
const eventTime=g=>g._trollEventAt??g.state.time;
const atEvent=(g,at,fn)=>{const old=g._trollEventAt;g._trollEventAt=at;try{return fn();}finally{if(old===undefined)delete g._trollEventAt;else g._trollEventAt=old;}};
const invulnerable=(e,api)=>e.invulnerable||e.nativeInvulnerable||e.status?.yseraHidden||has(e,'Avul')||api.scriptInvulnerable?.(e);
const select=(g,e,center,radius,api)=>units(g).filter(t=>!dead(t)&&enemy(e,t)&&sameBattle(e,t)&&!invulnerable(t,api)&&dist(center,t)<=radius+1e-8);
const getBuilding=(g,e,api)=>api.getBuilding?.(g,e)??g.state.players?.find(p=>p.id===e.ownerId)?.buildings?.find(b=>b.id===e.buildingId);
const abilityLevel=(e,id)=>Number(e?.abilityLevels?.[id]??(has(e,id)?1:0));
const maxLevel=id=>Number(V14_ABILITIES[id].resolved_fields.levels??1);
const clampLevel=(id,n)=>Math.min(maxLevel(id),Math.max(0,Math.trunc(n)));
const value=(id,n)=>n>0?Number(V14_ABILITIES[id].resolved_fields[`DataA${clampLevel(id,n)}`]??0):0;
const enqueue=(g,job)=>{g.state.sourceSkillJobs??=[];g.state.sourceSkillJobs.push(job);return job;};
const skillState=(e,id)=>(e.skillStates??={})[id]??={readyAt:0,casts:0};
const syncSource=(g,e)=>{for(const job of g.state.sourceSkillJobs??[])if(isTrollJobType(job.type)&&job.sourceId===e.id)job.source=copy(e);};
function addAbility(g,e,id,api){
  if(has(e,id))return false;
  if(api.addAbility)api.addAbility(g,e,id);
  else{e.skillSpecs??=(e.abilityIds??[]).map(id=>({id}));e.skillSpecs.push({id,kind:'troll_source',status:TROLL_RULES[id]?.status??'marker'});}
  e.abilityLevels??={};e.abilityLevels[id]??=1;return true;
}
function setLevel(g,e,id,next,api){
  next=clampLevel(id,next);e.abilityLevels??={};e.abilityLevels[id]=next;
  const status=st(e),key=id==='A15D'?'trollAttackLevel':'trollHasteLevel';status[key]=next;
  if(id==='A15D'){
    const previous=status.trollAppliedAttackLevel??0;
    if(previous!==next){if(api.applyAttackLevel)api.applyAttackLevel(g,e,id,previous,next);else if(Number.isFinite(e.damage))e.damage+=value(id,next)-value(id,previous);status.trollAppliedAttackLevel=next;}
  }
  if(e.id===getBuilding(g,e,api)?.id)e[key]=next;
  return next;
}
function setBuildingLevel(g,b,id,next,api){if(!b)return;addAbility(g,b,id,api);setLevel(g,b,id,next,api);b[id==='A15D'?'trollAttackLevel':'trollHasteLevel']=clampLevel(id,next);}
function award(g,e,id,mode,api){
  const b=getBuilding(g,e,api),old=abilityLevel(e,id);
  if(old===0){addAbility(g,e,id,api);setLevel(g,e,id,1,api);if(b){const existed=has(b,id);addAbility(g,b,id,api);if(!existed)setBuildingLevel(g,b,id,1,api);}}
  else{const next=setLevel(g,e,id,old+1,api);if(b)setBuildingLevel(g,b,id,mode==='area'?abilityLevel(b,id)+1:next,api);}
  syncSource(g,e);
}
function universal(g,target,amount,source,api){if(typeof api.universalDamage!=='function')throw new TypeError('Troll rules require api.universalDamage(game,target,amount,source)');return api.universalDamage(g,target,amount,source);}

export const isTrollJobType=type=>typeof type==='string'&&type.startsWith('troll_');
export const isTrollActiveAbility=id=>!!TROLL_ACTIVE_RULES[id];
export const canTrollCastAbility=(e,id)=>own(e)&&isTrollActiveAbility(id)&&has(e,id);
export const trollHaste=e=>value('A15F',abilityLevel(e,'A15F'));
export function initializeTrollUnit(g,e,api={}){
  if(!own(e)||st(e).trollInitialized||!['A15C','A15E','A15G'].some(id=>has(e,id)))return false;
  const status=st(e);status.trollInitialized=true;status.trollTazRegistered=has(e,'A15G');status.trollTazEnabled=has(e,'A15G');status.trollDeathAxesRegistered=has(e,'A15G');
  const b=getBuilding(g,e,api);
  for(const id of ['A15D','A15F']){const level=clampLevel(id,b?.abilityLevels?.[id]??b?.[id==='A15D'?'trollAttackLevel':'trollHasteLevel']??abilityLevel(e,id));if(level>0){addAbility(g,e,id,api);setLevel(g,e,id,level,api);if(b)setBuildingLevel(g,b,id,level,api);}}
  return true;
}
function queueAxe(g,e,target,api,at=eventTime(g)){
  const origin=pos(e),length=dist(e,target);
  return enqueue(g,{type:'troll_super_axe',sourceId:e.id,source:copy(e),targetId:target.id,target:copy(target),dummy:{...origin,flyHeight:0},model:raw(e)==='h0WP'?'LJQ_Zuljin01_Blue_01.mdx':'ZuljinA02_01.mdx',length,step:length*.04,traveled:0,nextAt:at,impactAt:at+1,movementFinished:false,done:false});
}
export function castTrollAbility(g,e,id,params={},api={}){
  const at=eventTime(g),r=TROLL_ACTIVE_RULES[id],fail=reason=>({ok:false,skillId:id,reason});
  if(!canTrollCastAbility(e,id))return fail('当前单位没有此祖尔金技能');
  if(dead(e)||e.status?.sourcePaused||e.status?.illidanPaused||e.status?.yseraPaused||e.status?.yseraHidden||e.status?.stunUntil>at||e.status?.cycloneUntil>at)return fail('单位当前无法施法');
  const state=skillState(e,id);if(state.readyAt>at+1e-8)return fail('技能冷却中');if((e.mana??0)<r.manaCost)return fail('魔法不足');
  const target=params.target;if(dead(target)||!enemy(e,target)||!sameBattle(e,target)||invulnerable(target,api))return fail('请选择有效敌方目标');
  if(dist(e,target)>r.range*scale(e)+1e-8)return {...fail('超出原生施法距离'),nativeOrderBoundary:params.mode==='auto'};
  e.mana-=r.manaCost;state.readyAt=at+r.cooldown;state.casts=(state.casts??0)+1;g._event?.('cast',e,r.name,{skillId:id});
  if(g._sourceAbilityEffectDepth>0)return {ok:true,skillId:id,scriptSuppressed:true};
  g._sourceAbilityEffectDepth=(g._sourceAbilityEffectDepth??0)+1;
  try{queueAxe(g,e,target,api,at);return {ok:true,skillId:id};}finally{g._sourceAbilityEffectDepth--;}
}
export function tryTrollAutoCast(g,damaged,attacker,api={}){
  if(!attacker||!damaged||attacker.id===damaged.id||!enemy(damaged,attacker))return null;
  // Trig_UnitDamageActions: bV=GetEventDamageSource() is tested first.
  const caster=has(attacker,'A15C')?attacker:has(damaged,'A15C')?damaged:null;if(!caster)return null;
  return castTrollAbility(g,caster,'A15C',{mode:'auto',target:caster===attacker?damaged:attacker},api);
}
function tryEnsnare(g,e,target,api){
  addAbility(g,e,'A15I',api);const r=TROLL_RULES.A15I,state=skillState(e,'A15I'),at=eventTime(g);
  if(dead(e)||e.status?.sourcePaused||e.status?.illidanPaused||e.status?.yseraPaused||e.status?.yseraHidden||e.status?.stunUntil>at||e.status?.cycloneUntil>at||dead(target)||!enemy(e,target)||!sameBattle(e,target)||invulnerable(target,api)||state.readyAt>at+1e-8||dist(e,target)>r.range*scale(e)+1e-8)return false;
  if(typeof api.applyEnsnare!=='function')throw new TypeError('Troll rules require api.applyEnsnare(game,caster,target,abilityId)');
  if(api.applyEnsnare(g,e,target,'A15I')===false)return false;
  state.readyAt=at+r.cooldown;state.casts=(state.casts??0)+1;return true;
}
export function trollOnHit(g,e,target,api={}){
  if(!own(e)||!has(e,'A15E')||g._random()*100>12)return false;
  initializeTrollUnit(g,e,api);tryEnsnare(g,e,target,api);
  if(st(e).trollRashJobId)return true;
  const id=g._uid?.('troll-rash')??`troll-rash-${e.id}-${eventTime(g)}`;st(e).trollRashJobId=id;
  enqueue(g,{type:'troll_rash',id,sourceId:e.id,source:copy(e),targetId:target.id,target:copy(target),nextAt:eventTime(g),interval:.5,done:false});return true;
}
export function trollIncomingDamage(g,e,amount,attacker,api={}){
  if(!own(e))return amount;initializeTrollUnit(g,e,api);const status=st(e),at=eventTime(g);
  if(!status.trollTazEnabled||amount<=e.hp)return amount;
  if(status.trollTazExpiresAt!==undefined&&status.trollTazExpiresAt<=at+1e-8){status.trollTazEnabled=false;return amount;}
  if(status.trollTazExpiresAt===undefined){status.trollTazExpiresAt=at+5;enqueue(g,{type:'troll_taz_end',sourceId:e.id,source:copy(e),at:at+5});}
  // Literal YDWESetEventDamage, including its negative request if native HP<1.
  return Math.min(amount,e.hp-1);
}
export function sourceTrollDeath(g,victim,killer,api={}){
  if(!victim)return;
  if(own(victim)&&!st(victim).trollDeathHandled){
    initializeTrollUnit(g,victim,api);victim.status.trollDeathHandled=true;
    if(victim.status.trollDeathAxesRegistered){victim.status.trollDeathAxesRegistered=false;for(const target of select(g,victim,victim,500*scale(victim),api).slice(0,3))queueAxe(g,victim,target,api);}
  }
  for(const job of g.state.sourceSkillJobs??[]){
    if(!isTrollJobType(job.type))continue;
    if(job.sourceId===victim.id)job.source=copy(victim);
    if(job.targetId===victim.id){job.target=copy(victim);if(job.type==='troll_super_axe')job.movementFinished=true;}
  }
}
function finishRash(g,job,source){job.done=true;if(st(source).trollRashJobId===job.id)delete source.status.trollRashJobId;syncSource(g,source);}
function impact(g,job,source,target,api){
  job.done=true;
  for(const enemy of select(g,source,job.dummy,200*scale(source),api)){
    universal(g,enemy,250,source,api);if(dead(enemy))award(g,source,'A15D','area',api);
  }
  universal(g,target,target.maxHp,source,api);if(dead(target))award(g,source,'A15D','primary',api);
}
export function tickTrollJob(g,job,api={}){
  if(!isTrollJobType(job?.type)||job.done)return false;
  const source=sourceOf(g,job),at=g.state.time;if(!source)return false;
  if(job.type==='troll_taz_end'){if(at+1e-8<job.at)return true;st(source).trollTazEnabled=false;job.done=true;syncSource(g,source);return false;}
  const target=targetOf(g,job);if(!target)return false;
  if(job.type==='troll_rash'){
    while(job.nextAt<=at+1e-8){
      if(dead(target)){finishRash(g,job,source);return false;}
      atEvent(g,job.nextAt,()=>{universal(g,target,target.maxHp*.015,source,api);if(dead(target))award(g,source,'A15F','primary',api);});job.nextAt+=.5;
      if(dead(target)){finishRash(g,job,source);return false;}
    }
    return true;
  }
  if(job.type!=='troll_super_axe')return false;
  while(!job.movementFinished&&job.nextAt<=Math.min(at,job.impactAt)+1e-8){
    if(dead(target)||job.traveled+job.step>=job.length-1e-8||dist(job.dummy,target)<=job.step+1e-8){job.movementFinished=true;break;}
    const p=pos(target),d=dist(job.dummy,target)||1,next={x:job.dummy.x+(p.x-job.dummy.x)/d*job.step,y:job.dummy.y+(p.y-job.dummy.y)/d*job.step};
    Object.assign(job.dummy,api.clampDummyPosition?.(g,next,source)??next);job.traveled+=job.step;job.nextAt+=.04;
  }
  job.dummy.flyHeight=at<job.impactAt-.5?Math.min(500,(at-(job.impactAt-1))*500):Math.max(0,250-(at-(job.impactAt-.5))*500);
  if(at+1e-8<job.impactAt)return true;
  atEvent(g,job.impactAt,()=>impact(g,job,source,target,api));return false;
}
