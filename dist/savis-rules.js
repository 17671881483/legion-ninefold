import {laneToWorld} from './layout.js';

const boundary='ANcl原生前摇与同帧命令仲裁、枚举顺序、浮点计时及对象移除后的句柄行为仍为宿主适配；原图模型和特效缺失。';
export const SAVIS_RULES={
 A1UD:{status:'partial',active:true,targetKind:'enemy',description:'晦暗灵魂：8魔法、17秒冷却、500码选敌。感染选定目标及其600码内最多另外两个敌人；每个感染从1秒后每秒305混乱/通用武器伤害，直到被感染者死亡。施法者死亡不取消，重复感染独立叠加；没有说明中的25点溅射。',partial:boundary},
 A1UE:{status:'partial',active:true,targetKind:'enemy',description:'梦魇之刃：15魔法、20秒冷却、500码选敌，以目标施法时坐标建立400码范围；0至6秒共7次检查，每个敌人在该次施法中只受到一次200混乱/通用武器伤害，离开再进入不重复。施法者死亡不取消。',partial:boundary},
 A1UF:{status:'partial',active:true,targetKind:'enemy',description:'潜袭喷发：15魔法、15秒冷却、500码选敌。在目标位置创建1500生命的u011潜伏恐魔，存活3秒；随后对选定目标造成175混乱/通用武器伤害，再登记恐魔死亡监听。恐魔死亡在其当时位置300码内造成125混乱/通用武器伤害，并对各目标每秒追加10点同类伤害，共10次。后续伤害来源是恐魔，不是萨维斯。',partial:boundary+'恐魔沿用Web军团导航；创建、初伤与死亡监听登记顺序保留，监听登记前已发生的死亡不补触发。'},
 A1UG:{status:'partial',active:true,targetKind:'enemy',description:'腐蚀流星：20魔法、15秒冷却、500码选敌；固定目标施法时坐标，0.5秒后对500码范围敌军造成一次425混乱/通用武器伤害。六颗流星是视觉效果，不叠成六次伤害；源码没有移速/攻速降低。',partial:boundary},
 A1UH:{status:'marker',description:'梦魇召唤的建筑说明图标。未找到SavisSummon的调用；不按说明添加两只召唤物、100攻击或3护甲。战斗体实际携带另一能力A1UI。'},
 A1UI:{status:'partial',description:'梦魇召唤原生对象为AHwe，定义3只h03L、60秒生命及3600秒冷却；原主受伤入口却下达spiritofvengeance，与AHwe的waterelemental命令不符。保留失败请求，不再由通用施法器自动免费召唤。',partial:'原始A1UI字段缺少Cost1，不能直接继承另一条AHwe对象的125费用，也不把缺失当免费；原生命令冲突与手动费用尚未核定，暂不暴露手动召唤。未调用的SavisSummon不作为补造入口。'},
};
const has=(e,id)=>e?.skillSpecs?.some(s=>s.id===id)&&(e.abilityLevels?.[id]??1)>0;
const pos=e=>Number.isFinite(e?.worldX)?{x:e.worldX,y:e.worldY}:laneToWorld(e?.laneId,e?.x,e?.y)??{x:e?.x??0,y:e?.y??0};
const scale=e=>(e.distanceScale??1/3)/100;
const removed=e=>!e||e.status?.sourceRemoved||e.status?.yseraRemoved;
const all=g=>[...g.state.entities,...(g.state.kings??[])];
const jobs=g=>g.state.sourceSkillJobs??=[];
const st=e=>(e.status??={}).savis??={};
const queue=(g,e,type,data)=>{const j={type,sourceId:e.id,source:e,...data};jobs(g).push(j);return j;};
const ally=(a,b)=>a.team!==undefined&&b.team!==undefined?a.team===b.team:a.side===b.side&&a.battleTeam===b.battleTeam;
const group=(g,e,p,r)=>all(g).filter(t=>t.hp>.405&&!removed(t)&&!t.status?.sourceHidden&&!t.status?.yseraHidden&&!has(t,'Aloc')&&!has(t,'Avul')&&!ally(e,t)&&Math.hypot(pos(t).x-p.x,pos(t).y-p.y)<=r*scale(e)+1e-8);
const unavailable=(g,e)=>removed(e)||e.hp<=.405||e.status?.sourcePaused||e.status?.yseraPaused||e.status?.illidanPaused||e.status?.sourceHidden||e.status?.yseraHidden||['stunUntil','cycloneUntil','silenceUntil'].some(k=>e.status?.[k]>g.state.time);
const damage=(g,t,n,e,api)=>api.nativeDamage(g,t,n,e,{attackType:'chaos',damageType:'universal',weapon:true});
export const canSavisCast=(e,id)=>!!SAVIS_RULES[id]?.active&&has(e,id);

function effect(g,e,id,t,api){
 if(g._sourceAbilityEffectDepth)return false;
 g._sourceAbilityEffectDepth=(g._sourceAbilityEffectDepth??0)+1;
 try{
  const p=pos(t);
  if(id==='A1UD'){
   const targets=[t,...group(g,e,p,600).filter(u=>u!==t).slice(0,2)];
   for(const u of targets){st(u).soulTint=true;queue(g,e,'savis_soul',{targetId:u.id,target:u,nextAt:g.state.time+1,ticks:0});}
   st(e).infection={at:g.state.time,targetIds:targets.map(u=>u.id)};
  }else if(id==='A1UE')queue(g,e,'savis_blade',{...p,nextAt:g.state.time,ticks:0,hitIds:[]});
  else if(id==='A1UG')queue(g,e,'savis_meteor',{...p,nextAt:g.state.time+.5});
  else if(id==='A1UF'){
   const body=api.spawnUnit(g,e,'u011',{worldX:p.x,worldY:p.y,facing:e.facing,userData:e.userData,isSummon:true,isHero:false,isNativeHero:false,buildingId:undefined,expiresAt:g.state.time+3});
   damage(g,t,175,e,api);
   if(body){st(body).eruption={casterId:e.id,registeredAt:g.state.time};queue(g,body,'savis_eruption',{nextAt:g.state.time+3,registeredAfterDeath:!!body.status?.sourceDeathHandled});}
  }
  return true;
 }finally{g._sourceAbilityEffectDepth--;}
}
export function castSavis(g,e,id,params,api){
 const fail=message=>({ok:false,message});if(!canSavisCast(e,id))return fail('当前单位没有此技能');if(unavailable(g,e))return fail('单位当前无法施法');
 const s=api.compileAbility(g,e,id),t=params.target;
 if(!t||t.hp<=.405||removed(t)||ally(e,t)||t.battleTeam!==e.battleTeam||has(t,'Aloc')||has(t,'Avul')||t.status?.sourceHidden||t.status?.yseraHidden||!api.matchesTargets(s,e,t))return fail('请选择可施法的敌人');
 const p=pos(t);if(Math.hypot(pos(e).x-p.x,pos(e).y-p.y)>s.range+1e-8)return fail('超出施法范围');
 const state=(e.skillStates??={})[id]??={readyAt:0,casts:0};if(state.readyAt>g.state.time+1e-8)return fail('技能冷却中');if(e.mana<s.manaCost)return fail('魔法不足');
 e.mana-=s.manaCost;state.readyAt=g.state.time+s.cooldown;state.casts++;e.pendingAttack=null;
 st(e).lastCast={id,at:g.state.time,targetId:t.id,point:p,scriptApplied:effect(g,e,id,t,api)};
 g._event?.('cast',e,s.name,{skillId:id});return {ok:true,skillId:id,message:'已施放'+s.name};
}
const mainEligible=(t,e,n)=>n>0&&e&&t!==e&&!ally(t,e)&&!has(e,'A2Y7');
export function savisMainDamage(g,t,e,n,api){
 if(!mainEligible(t,e,n))return;
 for(const id of ['A1UD','A1UE','A1UG','A1UF']){
  const source=has(t,id)?t:has(e,id)?e:null;if(!source)continue;const target=source===t?e:t,result=castSavis(g,source,id,{target},api);
  (st(source).orders??=[]).push({id,at:g.state.time,targetId:target.id,ok:result.ok,reason:result.ok?null:result.message});st(source).orders=st(source).orders.slice(-8);
 }
}
export function savisSummonOrder(g,t,e,n){
 if(!mainEligible(t,e,n))return;const source=has(t,'A1UI')?t:has(e,'A1UI')?e:null;if(!source)return;
 st(source).summonOrder={at:g.state.time,order:'spiritofvengeance',abilityId:'A1UI',outcome:'wrong-native-order',nativeCostKnown:false};
}
export function savisWidgetDeath(g,e,api){
 for(const j of [...jobs(g)])if(!j.done){
  if(['savis_soul','savis_loop'].includes(j.type)&&j.targetId===e.id){j.done=true;if(j.type==='savis_soul')st(e).soulTint=false;}
  if(j.type==='savis_eruption'&&j.sourceId===e.id){
   j.done=true;j.source=e;const victims=group(g,e,pos(e),300);st(e).burst={at:g.state.time,point:pos(e),targetIds:victims.map(t=>t.id)};
   for(const t of victims){damage(g,t,125,e,api);queue(g,e,'savis_loop',{targetId:t.id,target:t,nextAt:g.state.time+1,ticks:0});}
   g._event?.('cast',e,'潜袭喷发',{skillId:'A1UF'});
  }
 }
}
function tick(g,j,api){
 if(j.type==='savis_soul'||j.type==='savis_loop'){
  if(removed(j.target)){j.done=true;return;}
  damage(g,j.target,j.type==='savis_soul'?305:10,j.source,api);j.ticks++;j.nextAt+=1;
  if(j.type==='savis_loop'&&j.ticks===10)j.done=true;
 }else if(j.type==='savis_blade'){
  for(const t of group(g,j.source,j,400))if(!j.hitIds.includes(t.id)){j.hitIds.push(t.id);damage(g,t,200,j.source,api);}
  j.ticks++;j.nextAt+=1;if(j.ticks===7)j.done=true;
 }else if(j.type==='savis_meteor'){
  j.done=true;st(j.source).meteor={at:g.state.time,point:{x:j.x,y:j.y}};for(const t of group(g,j.source,j,500))damage(g,t,425,j.source,api);
 }else if(j.type==='savis_eruption'){
  if(!removed(j.source)&&j.source.hp>.405)api.killUnit(g,j.source);
  j.done=true;
 }
}
export function tickSavisJobs(g,api){
 const frame=g.state.time;
 try{while(true){
  const j=jobs(g).filter(j=>!j.done&&j.type?.startsWith('savis_')&&j.nextAt<=frame+1e-8).sort((a,b)=>a.nextAt-b.nextAt)[0];if(!j)break;
  g.state.time=j.nextAt;tick(g,j,api);
 }}finally{g.state.time=frame;}
}
export function restoreSavis(g){
 const handles=new Map(all(g).map(e=>[e.id,e])),bind=e=>{if(!e)return e;if(!handles.has(e.id))handles.set(e.id,e);return handles.get(e.id);};
 for(const j of jobs(g))if(j.type?.startsWith('savis_'))for(const key of ['source','target'])if(j[key])j[key]=bind(j[key]);
}
